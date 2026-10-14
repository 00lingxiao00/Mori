"""Native menu actions exercised through the same delegated command dispatcher."""
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
parser=argparse.ArgumentParser();parser.add_argument('--webkit',action='store_true');args=parser.parse_args()
root=Path(__file__).parents[2]
with sync_playwright() as p:
    browser=p.webkit.launch(headless=True) if args.webkit else p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    page=browser.new_page(viewport={'width':1100,'height':800},accept_downloads=True)
    errors=[];current_action=['start'];page.on('pageerror',lambda e:errors.append({'action':current_action[0],'stack':e.stack}))
    page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
    expect(page.locator('#editor .ProseMirror')).to_be_visible()
    def action(name):
        current_action[0]=name
        page.evaluate('''name=>{const b=document.createElement('button');b.dataset.action=name;document.body.append(b);b.click();b.remove()}''',name)
        page.wait_for_timeout(100)
    def load(value):
        if not page.locator('#source-editor').is_visible():action('source')
        page.locator('#source-editor .cm-content').click();page.keyboard.press('Meta+a');page.keyboard.insert_text(value);action('source')
    def select(text):
        page.locator('#scroll-area').evaluate('e=>e.scrollTop=0')
        bounds=page.evaluate("""text=>{const root=document.querySelector('#editor .ProseMirror');const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const i=n.textContent.indexOf(text);if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+text.length);const b=r.getBoundingClientRect();return {left:b.left,right:b.right,y:b.top+b.height/2}}}throw Error('text not found: '+text)}""",text)
        page.mouse.click(bounds['left']+1,bounds['y']);page.mouse.move(bounds['left']+1,bounds['y']);page.mouse.down();page.mouse.move(bounds['right']-1,bounds['y'],steps=12);page.mouse.up()
        page.wait_for_timeout(100)
    def export():
        with page.expect_download() as event:action('save')
        return Path(event.value.path()).read_text()
    load('Hello world\n\nSecond paragraph\n')
    select('Hello');action('edit:heading:2');expect(page.locator('#editor h2')).to_have_text('Hello world')
    action('edit:heading-up');expect(page.locator('#editor h1')).to_have_text('Hello world')
    action('edit:heading-down');expect(page.locator('#editor h2')).to_have_text('Hello world')
    action('edit:paragraph');expect(page.locator('#editor h2')).to_have_count(0)
    for command,tag in [('bold','strong'),('italic','em'),('underline','u'),('highlight','mark'),('strike','del'),('code','code')]:
        load('Hello world\n');select('Hello');action('edit:'+command);expect(page.locator('#editor .ProseMirror '+tag).first).to_have_text('Hello');assert 'Hello' in export()
    load('Hello world\n');select('Hello');page.keyboard.press('Meta+b');expect(page.locator('#editor strong')).to_have_text('Hello')
    action('edit:clear-format');expect(page.locator('#editor strong')).to_have_count(0)
    action('undo');expect(page.locator('#editor strong')).to_have_text('Hello')
    for command,selector in [('quote','blockquote'),('bullet','ul'),('ordered','ol'),('task','li[data-item-type="task"]')]:
        load('Item\n');select('Item');action('edit:'+command)
        if command=='task':expect(page.locator('#editor .label.unchecked')).to_have_count(1);action('edit:task:done');expect(page.locator('#editor .label.checked')).to_have_count(1)
        else:expect(page.locator('#editor .ProseMirror '+selector)).to_contain_text('Item')
    load('Footnote test\n');select('test');page.keyboard.press('ArrowRight');action('edit:footnote');expect(page.locator('#editor sup[data-type="footnote_reference"]')).to_have_count(1);expect(page.locator('#editor dl.footnote-definition')).to_contain_text('脚注内容')
    action('edit:footnote');expect(page.locator('#editor sup[data-type="footnote_reference"]')).to_have_count(2)
    assert '[^1]' in export() and '[^2]' in export()
    load('Table\n');select('Table');action('edit:table-insert');expect(page.locator('#editor table.children')).to_have_count(1)
    page.locator('#editor table.children td').first.click();rows=page.locator('#editor table.children tr').count();cols=page.locator('#editor table.children tr').first.locator('td,th').count()
    action('edit:row-after');expect(page.locator('#editor table.children tr')).to_have_count(rows+1)
    action('edit:col-after');expect(page.locator('#editor table.children tr').first.locator('td,th')).to_have_count(cols+1)
    action('edit:row-delete');expect(page.locator('#editor table.children tr')).to_have_count(rows)
    action('edit:col-delete');expect(page.locator('#editor table.children tr').first.locator('td,th')).to_have_count(cols)
    action('edit:table-delete');expect(page.locator('#editor table.children')).to_have_count(0)
    load('| H1 | H2 |\n| --- | --- |\n| B1 | B2 |\n| C1 | C2 |\n')
    page.locator('#editor table.children th').first.click()
    if not args.webkit: page.wait_for_timeout(100)
    action('edit:row-delete')
    expect(page.locator('#editor table.children tr')).to_have_count(2)
    expect(page.locator('#editor table.children th').first).to_have_text('B1')
    assert 'C1' in export() and 'H1' not in export()
    load('Link text\n');select('Link');action('insert-link');page.get_by_role('textbox',name='链接地址').fill('https://example.org/path');page.get_by_role('button',name='插入',exact=True).click();expect(page.locator('#editor a[href="https://example.org/path"]')).to_have_text('Link')
    load('apple **apple**\n\napple banana\n');action('replace');page.get_by_role('textbox',name='查找',exact=True).fill('apple');expect(page.locator('#find-count')).to_have_text('1/3');action('find-next');expect(page.locator('#find-count')).to_have_text('2/3')
    page.get_by_role('textbox',name='替换为').fill('pear');page.get_by_role('button',name='全部替换',exact=True).click();assert 'apple' not in export();assert export().count('pear')==3;expect(page.locator('#editor .ProseMirror strong')).to_have_text('pear')
    page.locator('[data-find="close"]').click()
    load('First paragraph\n\nSecond paragraph\n');select('First');action('focus');expect(page.locator('#editor .mori-dim-block')).to_have_count(1);action('focus');expect(page.locator('#editor .mori-dim-block')).to_have_count(0)
    action('source');page.locator('#source-editor .cm-content').click();page.keyboard.press('Meta+a');page.keyboard.insert_text('source text');page.keyboard.press('Meta+a');action('edit:bold');assert '**source text**' in export()
    action('edit:heading:3');assert export().startswith('### ')
    action('find');page.get_by_role('textbox',name='查找',exact=True).fill('source');expect(page.locator('#find-count')).to_have_text('1/1');page.locator('[data-find="close"]').click()
    action('source');action('sidebar');action('zoom-in');expect(page.locator('#editor')).to_have_css('zoom','1.1');action('zoom-reset');expect(page.locator('#editor')).to_have_css('zoom','1')
    action('typewriter');assert page.locator('body').evaluate("e=>e.classList.contains('typewriter-mode')");action('typewriter')
    action('word-count');expect(page.locator('#dialog')).to_be_visible();page.get_by_role('button',name='关闭',exact=True).last.click()
    with page.expect_download() as event:action('export-html')
    html=Path(event.value.path()).read_text();assert '<html' in html and 'source text' in html
    page.screenshot(path=str(root / f'Mori-menus-{"webkit" if args.webkit else "chrome"}.png'))
    assert not errors,errors
    result={'browser':'webkit' if args.webkit else 'chrome','menus':'heading/marks/undo/lists/tasks/footnotes/table/link/find/replace/source/view/export passed','errors':errors}
    (root/f'menu-verification-{result["browser"]}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
    browser.close()
