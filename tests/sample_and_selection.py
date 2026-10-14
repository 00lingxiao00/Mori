"""User's Markdown fixture, footnote navigation and real pointer selection."""
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(); parser.add_argument('--webkit', action='store_true'); args=parser.parse_args()
root=Path(__file__).parents[2]; sample=(Path(__file__).parent/'fixtures/markdown-sample.md').read_text()
with sync_playwright() as p:
    browser = p.webkit.launch(headless=True) if args.webkit else p.chromium.launch(headless=True, executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    page=browser.new_page(viewport={'width':1000,'height':800},reduced_motion='reduce',accept_downloads=True)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    # Remote image rendering is deterministic; the external service is not under test.
    page.route('https://via.placeholder.com/**',lambda route:route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#ddd"/></svg>'))
    page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
    def action(name):
        if name not in ['source','sidebar']:page.locator('[data-action="menu"]').click()
        page.locator(f'[data-action="{name}"]').click()
    def load(markdown):
        action('source');content=page.locator('#source-editor .cm-content');content.click();page.keyboard.press('Meta+a');page.keyboard.insert_text(markdown);action('source')
    def export():
        with page.expect_download() as d:action('save')
        return Path(d.value.path()).read_text()
    load(sample)
    doc=page.locator('#editor .ProseMirror')
    expect(doc.locator('strong').first).to_have_text('粗体')
    expect(doc.locator('em').first).to_have_text('斜体')
    expect(doc.locator('strong em, em strong')).to_have_text('粗斜体')
    expect(doc.locator('kbd')).to_have_count(2)
    expect(doc.locator('mark')).to_have_text('高亮文本')
    expect(doc.locator('del')).to_have_text('删除线')
    expect(doc.locator('ul ul')).to_have_count(1)
    expect(doc.locator('ol ol')).to_have_count(1)
    expect(doc.locator('.label.checked')).to_have_count(1)
    expect(doc.locator('.label.unchecked')).to_have_count(2)
    expect(doc.locator('a[href="https://openai.com"]')).to_have_count(1)
    expect(doc.locator('img[src="https://via.placeholder.com/120x60"]')).to_have_count(1)
    expect(doc.locator('blockquote blockquote')).to_contain_text('这是嵌套引用')
    expect(doc.locator('.cm-content[data-language=javascript]')).to_have_count(1)
    expect(doc.locator('.cm-content[data-language=python]')).to_have_count(1)
    expect(doc.locator('table.children')).to_have_count(1)
    expect(doc.locator('td').first).to_have_css('text-align','left')
    expect(doc.locator('td').nth(1)).to_have_css('text-align','center')
    expect(doc.locator('td').nth(2)).to_have_css('text-align','right')
    expect(doc.locator('.katex').first).to_be_visible()
    expect(doc.locator('.cm-content[data-language=latex]')).to_be_hidden()
    expect(doc.locator('.preview-label')).to_have_count(0)
    expect(doc.locator('p').filter(has_text='*这段文字不会被解析为斜体*')).to_be_visible()
    ref=doc.locator('sup[data-type="footnote_reference"]');definition=doc.locator('dl.footnote-definition')
    expect(ref).to_have_attribute('data-number','1');expect(ref).to_have_attribute('title','这是脚注内容。')
    expect(definition).to_have_text('1这是脚注内容。↩')
    assert definition.evaluate("el=>el.previousElementSibling.textContent") == '测试结束。'
    ref.scroll_into_view_if_needed();ref.click()
    page.wait_for_function("()=>{const r=document.querySelector('dl.footnote-definition').getBoundingClientRect();return r.top>=38&&r.bottom<780}")
    page.screenshot(path=str(root / f'Mori-footnotes-{"webkit" if args.webkit else "chrome"}.png'))
    definition.locator('[data-footnote-back]').click()
    page.wait_for_function("()=>{const r=document.querySelector('sup[data-type=footnote_reference]').getBoundingClientRect();return r.top>=38&&r.bottom<780}")
    assert export()==sample, 'navigation or rich/source conversion changed source bytes'
    # Native pointer drags across formatting and line boundaries, both directions.
    paragraph=doc.locator('p').first
    page.locator('#scroll-area').evaluate('(el)=>el.scrollTop=0')
    page.wait_for_function("()=>document.querySelector('#scroll-area').scrollTop===0")
    paragraph.scroll_into_view_if_needed()
    def points(a,b):
        return paragraph.evaluate('''(el,[a,b])=>{const nodes=[], walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);while(walker.nextNode())nodes.push(walker.currentNode);function point(offset){for(const n of nodes){if(offset<=n.length){const r=document.createRange();r.setStart(n,offset);r.collapse(true);const b=r.getBoundingClientRect();return {x:b.x,y:b.y+b.height/2};}offset-=n.length;}throw Error('offset');}return [point(a),point(b)];}''',[a,b])
    contents=paragraph.inner_text(); a=contents.index('常见语法'); b=contents.index(' 和 [') if ' 和 [' in contents else contents.index(' 和 链接')
    start,end=points(a,b)
    for reverse in [False,True]:
        page.mouse.click(start['x'], start['y'])
        first,last=(end,start) if reverse else (start,end)
        page.mouse.move(first['x'],first['y']);page.mouse.down();page.mouse.move(last['x'],last['y'],steps=24);page.mouse.up()
        selected=page.evaluate('getSelection().toString()')
        assert selected==contents[a:b], (reverse,selected,contents[a:b])
        page.wait_for_timeout(350)
        assert page.evaluate('getSelection().toString()')==selected, 'selection changed after mouse release'
        expect(page.locator('.milkdown-toolbar')).to_have_count(0)
        assert not page.locator('.milkdown-block-handle').is_visible()
    # Cross-paragraph drags must not turn into moving an entire block.
    quote = doc.locator('> blockquote > p').first
    qpoint = quote.evaluate('''el=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(w.nextNode())n=w.currentNode;const r=document.createRange();r.setStart(n,n.length);r.collapse(true);const b=r.getBoundingClientRect();return {x:b.x,y:b.y+b.height/2};}''')
    for reverse in [False,True]:
        page.mouse.click(start['x'],start['y'])
        first,last=(qpoint,start) if reverse else (start,qpoint)
        page.mouse.move(first['x'],first['y']);page.mouse.down();page.mouse.move(last['x'],last['y'],steps=30);page.mouse.up()
        selected=page.evaluate('getSelection().toString()')
        assert '常见语法' in selected and '二级标题' in selected and '三级标题' in selected and '这是一段引用。' in selected, selected
        page.wait_for_timeout(350)
        assert page.evaluate('getSelection().toString()')==selected
    page.screenshot(path=str(root / f'Mori-selection-{"webkit" if args.webkit else "chrome"}.png'))
    # A selection does not alter the document; keyboard formatting still works.
    first,last=points(a,a+4)
    page.mouse.click(first['x'],first['y']);page.mouse.move(first['x'],first['y']);page.mouse.down();page.mouse.move(last['x'],last['y'],steps=12);page.mouse.up()
    page.keyboard.press('Meta+b')
    expect(doc.locator('strong').filter(has_text='常见语法')).to_have_count(1)
    page.keyboard.press('ArrowRight');page.keyboard.insert_text('编辑校验')
    exported=export();assert '[^1]' in exported and '[^1]: 这是脚注内容。' in exported
    assert '编辑校验' in exported
    assert '<kbd>Ctrl</kbd>' in exported and '<mark>高亮文本</mark>' in exported
    # Task checkboxes still change Markdown and undo normally.
    doc.locator('.label.unchecked').first.click()
    expect(doc.locator('.label.checked')).to_have_count(2)
    import re
    assert re.search(r'[-*] \[x\] 未完成任务', export())
    # Non-numeric identifiers, duplicate references, edits and undo.
    load('第二个[^beta]，第一个[^alpha]，重复[^beta]。\n\n[^alpha]: Alpha **加粗**\n\n[^beta]: Beta\n')
    refs=doc.locator('sup[data-type="footnote_reference"]')
    assert refs.evaluate_all("els=>els.map(e=>e.dataset.number)")==['1','2','1']
    assert doc.locator('dl.footnote-definition').evaluate_all("els=>els.map(e=>e.dataset.number)")==['1','2']
    # Edit definition text normally, without a separate generated copy.
    beta=doc.locator('dl[data-label="beta"] dd p');beta.click();page.keyboard.press('End');page.keyboard.insert_text(' 改动')
    expect(refs.first).to_have_attribute('title','Beta 改动')
    page.keyboard.press('Meta+z');expect(refs.first).to_have_attribute('title','Beta')
    exported=export();assert '[^beta]' in exported and '[^alpha]' in exported and 'Alpha **加粗**' in exported
    # Pale highlights remain readable in the two dark themes.
    load('<mark>高亮文本</mark>')
    for theme in ['night','lapis-dark']:
        action('theme');page.locator(f'[data-action="theme:{theme}"]').click()
        expect(doc.locator('mark')).to_have_css('color','rgb(34, 34, 34)')
    # Unrecognized HTML remains literal and cannot execute script or handlers.
    load('<kbd onclick="window.moriUnsafe=true">X</kbd> <script>window.moriUnsafe=true</script>')
    expect(doc.locator('kbd,script')).to_have_count(0)
    assert page.evaluate('window.moriUnsafe === undefined')
    assert 'onclick' in export()
    assert not errors,errors
    (root/f'sample-verification-{"webkit" if args.webkit else "chrome"}.json').write_text(json.dumps({'result':'PASS','fixture':'markdown-sample.md','footnotes':True,'pointer_selection':True,'errors':errors},indent=2))
    print('PASS: user fixture, footnotes/backlinks, unchanged-byte export, edited footnotes, undo, forward/reverse pointer selection, keyboard formatting; no JS errors')
    browser.close()
