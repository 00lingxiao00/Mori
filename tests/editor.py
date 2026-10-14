"""Run with: python tests/editor.py (dev server on localhost:5173)."""
from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    context = browser.new_context(viewport={"width": 1180, "height": 800}, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('response', lambda r: errors.append(f'{r.status}: {r.url}') if r.status >= 400 else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:5173')
    page.wait_for_load_state('networkidle')
    expect(page.locator('#editor .ProseMirror')).to_be_visible()
    expect(page.locator('#editor .ProseMirror')).to_have_text('')
    expect(page.locator('.sidebar')).to_be_hidden()
    assert page.locator('body').inner_text().strip() == '未命名.md'
    page.wait_for_timeout(1000)
    expect(page.locator('#dirty-dot')).to_be_hidden()
    page.screenshot(path=str(Path(__file__).parents[2] / 'Mori-minimal.png'))
    def action(name):
        if name not in ['source', 'sidebar']:
            page.locator('[data-action="menu"]').click()
        page.locator(f'[data-action="{name}"]').click()
    # Source, exact Unicode text, fences, table, and rich/source roundtrip.
    action('source')
    source = page.locator('#source-editor .cm-content')
    sample = '# 中文输入测试\n\n你好，世界 🌱\n\n## 第二节\n\n- [ ] 一个任务\n\n```rust\n# not a heading\nfn main() {}\n```\n\n| A | B |\n| --- | --- |\n| 甲 | 乙 |\n'
    source.click()
    page.keyboard.insert_text(sample)
    expect(page.locator('#dirty-dot')).to_be_visible()
    expect(page.locator('#outline')).to_have_attribute('data-count', '2')
    action('source')
    expect(page.locator('#editor h1')).to_have_text('中文输入测试')
    expect(page.locator('#editor h2')).to_have_text('第二节')
    expect(page.locator('#editor .ProseMirror table.children')).to_be_visible()
    expect(page.locator('#outline')).to_have_attribute('data-count', '2')
    action('source')
    expect(source).to_contain_text('你好，世界 🌱')
    # All installed themes preserve content and provide distinct document typography.
    action('source')
    styles = {}
    theme_ids = ['github','gothic','newsprint','night','pixyll','whitey','lapis','lapis-dark']
    for theme in theme_ids:
        action('theme')
        page.locator(f'[data-action="theme:{theme}"]').click()
        expect(page.locator('html')).to_have_attribute('data-theme', theme)
        page.wait_for_function("id => [...document.styleSheets].some(s => s.href && s.href.endsWith('/themes/' + id + '.css'))", arg=theme)
        page.evaluate('''async () => {for (const el of document.querySelectorAll('#editor h1, #editor p, #editor .cm-content')) {const s=getComputedStyle(el); await document.fonts.load(`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`, el.textContent || '中文');} await document.fonts.ready;}''')
        expect(page.locator('#editor h1')).to_have_text('中文输入测试')
        styles[theme] = page.locator('#editor .ProseMirror').evaluate('(el) => {const s=getComputedStyle(el);return [s.fontFamily,s.color,s.fontSize,s.maxWidth,getComputedStyle(document.body).backgroundColor]}')
        page.locator('#scroll-area').evaluate('(el)=>el.scrollTop=0')
        page.screenshot(path=str(Path(__file__).parents[2] / f'Mori-theme-{theme}.png'))
    assert len(set(map(str, styles.values()))) == len(theme_ids), styles
    action('source')
    # Export uses preserved Markdown bytes if no rich-text editing occurred.
    with page.expect_download() as d:
        action('save')
    downloaded = Path(d.value.path()).read_text()
    assert downloaded == sample, (repr(downloaded), repr(sample))
    # Cancel protects current edits.
    action('new')
    expect(page.locator('#dialog')).to_be_visible()
    page.locator('#dialog-actions button[value="cancel"]').click()
    expect(source).to_contain_text('中文输入测试')
    # Draft persists across a crash/reload; restore into an unsaved document.
    page.wait_for_timeout(700)
    draft = json.loads(page.evaluate("localStorage.getItem('mori-draft')"))
    assert draft['markdown'] == sample
    page.reload()
    expect(page.locator('#dialog')).to_be_visible()
    page.locator('#dialog-actions button[value="restore"]').click()
    expect(page.locator('#editor h1')).to_have_text('中文输入测试')
    expect(page.locator('#dirty-dot')).to_be_visible()
    # Discard, then exercise rich-text input rules and undo.
    action('new')
    page.locator('#dialog-actions button[value="discard"]').click()
    editor = page.locator('#editor .ProseMirror')
    editor.click()
    page.keyboard.type('# ')
    page.keyboard.insert_text('新的标题')
    expect(page.locator('#editor h1')).to_have_text('新的标题')
    page.keyboard.press('Enter')
    page.keyboard.insert_text('正文内容')
    expect(editor).to_contain_text('正文内容')
    page.keyboard.press('Meta+z')
    expect(editor).not_to_contain_text('正文内容')
    page.keyboard.press('Meta+Shift+z')
    expect(editor).to_contain_text('正文内容')
    # Switching immediately after typing must capture the latest transaction.
    page.keyboard.insert_text('立即切换')
    action('source')
    expect(page.locator('#source-editor .cm-content')).to_contain_text('立即切换')
    action('source')
    # Optional panels and focus mode.
    expect(page.locator('.sidebar')).to_be_hidden()
    action('sidebar')
    expect(page.locator('.sidebar')).to_be_visible()
    action('focus')
    expect(page.locator('.sidebar')).to_be_hidden()
    action('focus')
    expect(page.locator('.sidebar')).to_be_visible()
    assert page.evaluate("localStorage.getItem('mori-theme')") == 'lapis-dark'
    assert not errors, errors
    print('PASS: initial state, themes, source/rich roundtrip, Unicode, code fences, tables, exact export, discard protection, recovery, heading input rule, undo/redo, focus mode; no JS exceptions')
    (Path(__file__).parents[2] / 'verification.json').write_text(json.dumps({'themes':styles,'errors':errors,'result':'PASS'}, ensure_ascii=False, indent=2))
    browser.close()
