"""Preferences UI, live multi-window application, persistence and document integrity."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser();parser.add_argument('--webkit',action='store_true');args=parser.parse_args();root=Path(__file__).parents[2]
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if args.webkit else p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
 context=browser.new_context(viewport={'width':1000,'height':800},accept_downloads=True)
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(e.stack));page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle');expect(page.locator('#editor .ProseMirror')).to_be_visible()
 settings=context.new_page();settings.on('pageerror',lambda e:errors.append(e.stack));settings.goto('http://127.0.0.1:5173/settings.html');settings.wait_for_load_state('networkidle')
 expect(settings.locator('[data-category]')).to_have_count(7)
 def category(name):settings.locator(f'[data-category="{name}"]').click()
 def select(key,value):settings.locator('#pref-'+key).select_option(str(value))
 def check(key,value):settings.locator('#pref-'+key).set_checked(value)
 def action(name):page.evaluate("name=>{const b=document.createElement('button');b.dataset.action=name;document.body.append(b);b.click();b.remove()}",name);page.wait_for_timeout(100)
 def load(value):
  if not page.locator('#source-editor').is_visible():action('source')
  page.locator('#source-editor .cm-content').click();page.keyboard.press('Meta+a');page.keyboard.insert_text(value);action('source')
 def export():
  with page.expect_download() as e:action('save')
  return Path(e.value.path()).read_text()
 def clean():
  action('new')
  if page.locator('#dialog').is_visible():page.get_by_role('button',name='不保存',exact=True).click()
 category('外观');select('theme','night');expect(page.locator('html')).to_have_attribute('data-theme','night')
 select('fontSize',22);select('lineHeight',2);select('documentWidth',960);select('zoom',125)
 expect(page.locator('#editor .ProseMirror')).to_have_css('font-size','22px');expect(page.locator('#editor .ProseMirror')).to_have_css('line-height','44px');expect(page.locator('#editor .ProseMirror')).to_have_css('max-width','960px');expect(page.locator('#editor')).to_have_css('zoom','1.25');expect(page.locator('#dirty-dot')).to_be_hidden()
 check('showWordCount',False);expect(page.locator('#word-count')).to_be_hidden()
 # Cancelling recovery and creating a blank document must preserve deferred data.
 deferred=context.new_page();deferred.goto('http://127.0.0.1:5173/settings.html');deferred.wait_for_load_state('networkidle');deferred.evaluate("localStorage.setItem('mori-draft',JSON.stringify({markdown:'deferred recovery data',name:'recovery test'}))")
 deferred.goto('http://127.0.0.1:5173');expect(deferred.get_by_role('heading',name='恢复草稿？')).to_be_visible();deferred.get_by_role('button',name='关闭',exact=True).click()
 deferred.evaluate("()=>{const b=document.createElement('button');b.dataset.action='new';document.body.append(b);b.click();b.remove()}");deferred.wait_for_timeout(200);assert json.loads(deferred.evaluate("localStorage.getItem('mori-draft')"))['markdown']=='deferred recovery data';deferred.evaluate("localStorage.removeItem('mori-draft')");deferred.close()
 # A complete new browser page loads persisted preferences.
 settings.reload();settings.wait_for_load_state('networkidle');category('外观');expect(settings.locator('#pref-theme')).to_have_value('night');expect(settings.locator('#pref-fontSize')).to_have_value('22')
 settings.get_by_role('searchbox',name='查找设置').fill('代码块');expect(settings.locator('#pref-codeLanguage')).to_be_visible();expect(settings.locator('#pref-autosave')).to_have_count(0);settings.get_by_role('searchbox',name='查找设置').fill('no-such-setting');expect(settings.get_by_text('无匹配设置')).to_be_visible()
 category('通用');settings.locator('#reset-settings').click();expect(page.locator('html')).to_have_attribute('data-theme','github');expect(page.locator('#editor')).to_have_css('zoom','1')
 load('# 标题\n\n正文\n\n```javascript\nconsole.log(1)\n```\n')
 original=export()
 category('Markdown');check('codeLineNumbers',False);check('codeWrap',False);select('indentSize',4);settings.locator('#pref-codeLanguage').fill('python');settings.locator('#pref-codeLanguage').press('Tab')
 expect(page.locator('#editor .cm-gutters').first).to_be_hidden();assert not page.locator('#editor .cm-content').first.evaluate("e=>e.classList.contains('cm-lineWrapping')")
 check('codeWrap',True);page.wait_for_function("()=>document.querySelector('#editor .cm-content').classList.contains('cm-lineWrapping')")
 assert export()==original,'preference change rewrote Markdown'
 load('new code\n');action('edit:code-block');expect(page.locator('#editor .cm-content[data-language=python]')).to_have_count(1);expect(page.locator('#editor .cm-content[data-language=python]')).to_have_css('tab-size','4')
 # Serializer preferences affect actual subsequent edits, without touching source directly.
 select('bullet','+');select('headingStyle','setext');select('emphasis','_');check('orderedIncrement',False)
 load('- item\n');page.locator('#editor .ProseMirror li p').first.click();page.keyboard.press('End');page.keyboard.insert_text(' edited');assert export().lstrip().startswith('+ '),export()
 load('Heading\n');action('edit:heading:1');assert '\n===' in export(),export()
 category('文件');select('extension','markdown');clean();expect(page.locator('#document-title')).to_have_text('未命名.markdown')
 check('recovery',False);page.locator('#editor .ProseMirror').click();page.keyboard.insert_text('temporary');page.wait_for_timeout(650);assert page.evaluate("localStorage.getItem('mori-draft')") is None
 # Pairing is an actual typing behavior, not just a stored checkbox.
 clean();category('编辑器');check('pairBrackets',True);page.locator('#editor .ProseMirror').click();page.keyboard.type('(');expect(page.locator('#editor .ProseMirror')).to_have_text('()')
 clean();check('pairBrackets',False);page.locator('#editor .ProseMirror').click();page.keyboard.type('(');expect(page.locator('#editor .ProseMirror')).to_have_text('(')
 category('Markdown');check('sourceWrap',False);check('sourceLineNumbers',False);action('source');expect(page.locator('#source-editor .cm-gutters')).to_be_hidden();assert not page.locator('#source-editor .cm-content').evaluate("e=>e.classList.contains('cm-lineWrapping')")
 category('文件');select('startupMode','source');clean();page.reload();page.wait_for_load_state('networkidle');expect(page.locator('#source-editor')).to_be_visible()
 # Outline folding is local navigation and leaves content unchanged.
 category('通用');settings.locator('#reset-settings').click();load('# Parent\n\n## Child\n\n## Child 2\n\n# Other\n');action('sidebar');expect(page.locator('#outline .outline-item')).to_have_count(4);positions=page.locator('#outline .outline-item').evaluate_all("items=>items.map(b=>{const r=document.createRange();r.selectNodeContents(b);return r.getBoundingClientRect().left})");assert positions[1]>positions[0];page.locator('.outline-fold').first.click();expect(page.locator('#outline .outline-item')).to_have_count(2);category('文件');check('outlineFold',False);expect(page.locator('#outline .outline-item')).to_have_count(4)
 category('导出');check('exportStyles',False);check('exportTitle',True);select('printPaper','Letter');settings.locator('#pref-printMargin').fill('12');settings.locator('#pref-printMargin').press('Tab');page.wait_for_function("()=>document.querySelector('#print-preferences').textContent.includes('12mm')")
 with page.expect_download() as event:action('export-html')
 html=Path(event.value.path()).read_text();assert '<style>' not in html and '<h1>未命名.md</h1>' in html
 category('通用')
 with settings.expect_download() as event:settings.locator('#export-settings').click()
 values=json.loads(Path(event.value.path()).read_text());assert values['printMargin']==12 and values['exportStyles'] is False
 with settings.expect_file_chooser() as chooser:settings.locator('#import-settings').click()
 chooser.value.set_files({'name':'prefs.json','mimeType':'application/json','buffer':json.dumps({'theme':'lapis','zoom':110,'fontSize':999,'unknown':'ignored'}).encode()});expect(page.locator('html')).to_have_attribute('data-theme','lapis');expect(page.locator('#editor')).to_have_css('zoom','1.1');assert page.evaluate("JSON.parse(localStorage.getItem('mori-preferences')).fontSize")==0
 category('外观');settings.screenshot(path=str(root/f'Mori-preferences-{"webkit" if args.webkit else "chrome"}.png'))
 assert not errors,errors
 result={'browser':'webkit' if args.webkit else 'chrome','categories':7,'checks':'live settings / persistence / defaults / search / source integrity / serializer / code blocks / pairs / draft toggle / outline folding / export / import passed','errors':errors};(root/f'preferences-verification-{result["browser"]}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));browser.close()
