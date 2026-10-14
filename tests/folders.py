"""Directory browsing, cancellation, dirty-document guards and exact file content."""
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright,expect
with tempfile.TemporaryDirectory(prefix='mori-folder-') as temp, tempfile.TemporaryDirectory(prefix='mori-other-') as other:
 root=Path(temp);(root/'章节').mkdir();(root/'a.md').write_text('# A\n\n精确内容。\n');(root/'b.TXT').write_text('B text\n');(root/'章节'/'<b>.md').write_text('# Nested\n\n子目录内容\n');(root/'.hidden.md').write_text('hidden');(root/'image.png').write_bytes(b'not a text file');(Path(other)/'other.md').write_text('Other folder\n')
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');context=browser.new_context(viewport={'width':760,'height':580},accept_downloads=True);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
  def action(name):page.evaluate("a=>{let b=document.createElement('button');b.dataset.action=a;document.body.append(b);b.click();b.remove()}",name)
  def export():
   page.wait_for_timeout(80)
   with page.expect_download() as d:action('save')
   return Path(d.value.path()).read_text()
  def pick(folder):
   with page.expect_file_chooser() as chooser:page.keyboard.press('Meta+Shift+o')
   chooser.value.set_files(str(folder))
  page.locator('#editor .ProseMirror').click();page.keyboard.insert_text('未保存的当前文档')
  pick(root);expect(page.locator('#files-panel')).to_be_visible();expect(page.locator('#folder-name')).to_have_text(root.name);assert export()=='未保存的当前文档\n';expect(page.locator('#file-tree button')).to_have_count(3);expect(page.locator('#file-tree button').first).to_contain_text('章节')
  page.get_by_role('button',name='a.md',exact=True).click();expect(page.get_by_role('heading',name='保存更改？')).to_be_visible();page.get_by_role('button',name='取消',exact=True).click();assert export()=='未保存的当前文档\n';expect(page.locator('#document-title')).to_have_text('未命名.md')
  page.get_by_role('button',name='a.md',exact=True).click();page.get_by_role('button',name='不保存',exact=True).click();expect(page.locator('#document-title')).to_have_text('a.md');expect(page.locator('#dirty-dot')).to_be_hidden();assert export()==(root/'a.md').read_text();action('undo');assert export()==(root/'a.md').read_text();expect(page.locator('#file-tree .active')).to_contain_text('a.md')
  page.locator('[data-sidebar-view="outline"]').click();expect(page.locator('#outline')).to_be_visible();expect(page.locator('#files-panel')).to_be_hidden();page.locator('[data-sidebar-view="files"]').click()
  page.get_by_role('button',name='章节',exact=True).click();expect(page.get_by_role('button',name='<b>.md',exact=True)).to_be_visible();assert page.locator('#file-tree b').count()==0
  page.get_by_role('button',name='<b>.md',exact=True).click();expect(page.locator('#document-title')).to_have_text('<b>.md');assert export()==(root/'章节'/'<b>.md').read_text()
  action('source');page.locator('#source-editor .cm-content').click();page.keyboard.press('Meta+End');page.keyboard.insert_text('改动');modified=export();page.get_by_role('button',name='<b>.md',exact=True).click();expect(page.locator('#dialog')).not_to_be_visible();assert export()==modified
  page.get_by_role('button',name='b.TXT',exact=True).click();expect(page.get_by_role('heading',name='保存更改？')).to_be_visible();page.get_by_role('button',name='取消',exact=True).click();assert export()==modified;page.get_by_role('button',name='b.TXT',exact=True).click();page.get_by_role('button',name='不保存',exact=True).click();expect(page.locator('#source-editor .cm-content')).to_contain_text('B text');assert export()==(root/'b.TXT').read_text();action('undo');assert export()==(root/'b.TXT').read_text()
  pick(Path(other));expect(page.locator('#folder-name')).to_have_text(Path(other).name);expect(page.locator('#document-title')).to_have_text('b.TXT');page.get_by_role('button',name='other.md',exact=True).click();assert export()=='Other folder\n'
  page.set_viewport_size({'width':360,'height':350});expect(page.locator('.sidebar')).to_be_visible();assert page.locator('.main').bounding_box()['x']>=page.locator('.sidebar').bounding_box()['width']-1;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(Path(__file__).parents[2]/'Mori-folder-sidebar.png'));assert not errors,errors
  assert (root/'a.md').read_text()=='# A\n\n精确内容。\n';assert (root/'章节'/'<b>.md').read_text()=='# Nested\n\n子目录内容\n'
  print('PASS folders: directory picker, nested tree, filtering, literal filenames, cancel/discard guards, active file, rich/source, folder replacement, small window; original files untouched')
  context.close();browser.close()
