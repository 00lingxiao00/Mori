"""Package the current macOS build and source, using the version in Tauri config."""
from pathlib import Path
import json,shutil,subprocess,plistlib,zipfile
project=Path(__file__).resolve().parents[1]
out=project.parent
config=json.loads((project/'src-tauri/tauri.conf.json').read_text())
version=config['version']
source=project/'src-tauri/target/release/bundle/macos/Mori.app'
release=out/f'release-{version}/Mori.app'
release.parent.mkdir(exist_ok=True)
if release.exists():shutil.rmtree(release)
shutil.copytree(source,release,symlinks=True)
info=plistlib.loads((release/'Contents/Info.plist').read_bytes())
assert info['CFBundleShortVersionString']==version
assert info['CFBundleIdentifier']==config['identifier']
architecture=subprocess.check_output(['lipo','-archs',str(release/'Contents/MacOS'/info['CFBundleExecutable'])],text=True).strip()
assert architecture=='arm64','此打包脚本仅用于 Apple Silicon 构建'
subprocess.run(['codesign','--force','--deep','--sign','-',str(release)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(release)],check=True)
archive=out/f'Mori-macOS-arm64-{version}.zip'
if archive.exists():archive.unlink()
subprocess.run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(release),str(archive)],check=True)
shutil.copyfile(archive,out/'Mori-macOS-arm64.zip')
if (project/'.git').exists():
 tracked=subprocess.check_output(['git','ls-files','-z'],cwd=project).decode().split('\0')
 files=[project/name for name in tracked if name]
else:
 files=[file for file in project.rglob('*') if file.is_file() and not any(part in {'node_modules','target','dist','.DS_Store','.git','__pycache__','.venv','gen'} for part in file.relative_to(project).parts)]
with zipfile.ZipFile(out/'Mori-source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for file in files:
  if file.is_file():z.write(file,Path('mori')/file.relative_to(project))
for file in [archive,out/'Mori-source.zip']:
 with zipfile.ZipFile(file) as z:assert z.testzip() is None
 print(file.name,file.stat().st_size,'bytes; archive verified')
print('Version',version,'signature verified')
