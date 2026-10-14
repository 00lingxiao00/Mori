"""Collect installed production npm and resolved Cargo package license notices."""
from pathlib import Path
import json,subprocess,hashlib
project=Path(__file__).resolve().parents[1]
entries=[];texts={}
def collect(ecosystem,name,version,license,root,extra=None):
 notices=[]
 if root.is_dir():
  candidates=[f for f in root.iterdir() if f.is_file() and f.name.lower().startswith(('license','licence','copying','notice'))]
  if extra and (root/extra).is_file():candidates.append(root/extra)
  for f in sorted(set(candidates)):
   if f.stat().st_size>300000:continue
   body=f.read_text(errors='replace').strip()
   if not body:continue
   key=hashlib.sha256(body.encode()).hexdigest()[:16];texts[key]=body;notices.append(key)
 entries.append({'package':f'{name}@{version}','ecosystem':ecosystem,'license':license or 'Not declared','notices':sorted(set(notices))})
lock=json.loads((project/'package-lock.json').read_text())
for relative,package in lock['packages'].items():
 if not relative or package.get('dev'):continue
 root=project/relative
 if not (root/'package.json').is_file():continue
 data=json.loads((root/'package.json').read_text());lic=data.get('license')
 if isinstance(lic,dict):lic=lic.get('type')
 collect('npm',data.get('name',relative),data.get('version',package.get('version','')),lic,root)
metadata=json.loads(subprocess.check_output(['cargo','metadata','--locked','--format-version','1','--manifest-path',str(project/'src-tauri/Cargo.toml')],text=True))
for data in metadata['packages']:
 if data['name']=='mori' and Path(data['manifest_path']).parent==project/'src-tauri':continue
 collect('Cargo',data['name'],data['version'],data.get('license'),Path(data['manifest_path']).parent,data.get('license_file'))
entries.sort(key=lambda e:(e['ecosystem'],e['package'].lower()))
lines=['Mori third-party dependency notices','===================================','','Generated from installed production npm packages and cargo metadata.','Theme/font notices are provided separately in public/themes/NOTICE.md.','Declared license expressions are retained; this file does not relicense dependencies.','Some packages declare an SPDX license but ship no separate license text.','']
for entry in entries:lines.append(f"[{entry['ecosystem']}] {entry['package']} | {entry['license']} | notices: {', '.join(entry['notices']) or 'see upstream package'}")
for key,body in sorted(texts.items()):lines.extend(['','='*72,f'Notice {key}','='*72,body])
(project/'THIRD_PARTY_LICENSES.txt').write_text('\n'.join(lines)+'\n')
print(f'Collected {len(entries)} dependency declarations and {len(texts)} distinct notice texts.')
