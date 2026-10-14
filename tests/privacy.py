"""Window privacy: manual/idle masks, cross-window state, wake gesture and content integrity."""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser();parser.add_argument('--webkit',action='store_true');args=parser.parse_args()
with sync_playwright() as p:
 browser=p.webkit.launch() if args.webkit else p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
 context=browser.new_context(viewport={'width':1000,'height':800},accept_downloads=True)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
 editor=page.locator('#editor .ProseMirror');expect(editor).to_be_visible();editor.click();page.keyboard.insert_text('隐私测试：选区与内容不能改变。')
 settings=context.new_page();settings.on('pageerror',lambda e:errors.append(str(e)));settings.goto('http://127.0.0.1:5173/settings.html');settings.wait_for_load_state('networkidle');settings.locator('[data-category="通用"]').click()
 def mask(p):expect(p.locator('#privacy-cover')).to_be_visible()
 def clear(p):expect(p.locator('#privacy-cover')).not_to_be_visible()
 def toggle(p):p.keyboard.press('Meta+Shift+p')
 def export():
  with page.expect_download() as d:page.keyboard.press('Meta+s')
  return Path(d.value.path()).read_text()
 original=export()
 page.evaluate("()=>{let n=document.querySelector('.ProseMirror p').firstChild;let r=document.createRange();r.setStart(n,2);r.setEnd(n,6);let s=getSelection();s.removeAllRanges();s.addRange(r)}")
 selection=page.evaluate('getSelection().toString()')
 toggle(page);mask(page);mask(settings)
 expect(page.locator('#app')).to_have_css('filter','blur(18px)')
 page.mouse.move(400,200);mask(page);page.keyboard.type('SHOULD NOT APPEAR');mask(page)
 page.screenshot(path=str(Path(__file__).parents[2]/'Mori-privacy.png'))
 toggle(settings);clear(settings);clear(page)
 assert page.evaluate('getSelection().toString()')==selection
 assert export()==original
 settings.locator('#pref-privacyStyle').select_option('solid');toggle(page);mask(settings);expect(settings.locator('#privacy-cover')).to_have_css('background-color','rgb(246, 247, 248)');settings.get_by_role('button',name='显示窗口',exact=True).click();clear(page)
 # Source mode receives the same mask and retains its document and selection.
 page.keyboard.press('Meta+/');expect(page.locator('#source-editor')).to_be_visible();page.locator('#source-editor .cm-content').click();page.keyboard.press('Meta+a');toggle(page);mask(page);page.keyboard.press('Escape');clear(page);assert export()==original
 # A modal opened before concealment remains intact beneath the top-layer cover.
 page.keyboard.press('Meta+,');expect(page.locator('#preferences-dialog')).to_be_visible();expect(page.frame_locator('#preferences-dialog iframe').locator('#settings-app nav')).to_be_visible();toggle(page);mask(page);page.keyboard.press('Escape');clear(page);expect(page.locator('#preferences-dialog')).to_be_visible();page.locator('.preferences-close').click()
 # Native-style nested dialogs are also blurred in the top layer.
 page.evaluate("()=>document.querySelector('#dialog').showModal()");toggle(page);mask(page);expect(page.locator('#dialog')).to_have_css('filter','blur(18px)');page.keyboard.press('Escape');clear(page);page.evaluate("()=>document.querySelector('#dialog').close()")
 # Real short idle timers, shared activity, consumed first wake key, then normal typing.
 settings.locator('#pref-privacySeconds').fill('1');settings.locator('#pref-privacySeconds').press('Tab');settings.locator('#pref-privacyIdle').check();mask(page);mask(settings)
 page.keyboard.press('x');clear(page);clear(settings);assert export()==original
 mask(page);page.mouse.move(700,400);clear(page)
 settings.locator('#pref-privacyIdle').uncheck();page.wait_for_timeout(1200);clear(page);clear(settings)
 settings.reload();settings.wait_for_load_state('networkidle');settings.locator('[data-category="通用"]').click();expect(settings.locator('#pref-privacyStyle')).to_have_value('solid');expect(settings.locator('#pref-privacySeconds')).to_have_value('1');expect(settings.locator('#pref-privacyIdle')).not_to_be_checked()
 assert not errors,errors
 print('PASS privacy: manual/idle, two windows, styles, source, modal, selection, content, persistence', 'WebKit' if args.webkit else 'Chrome')
 context.close();browser.close()
