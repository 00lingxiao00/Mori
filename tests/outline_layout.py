"""Outline layout regression; run against the dev server on localhost:5173."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    page = browser.new_page(viewport={'width': 760, 'height': 760}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173')
    page.wait_for_load_state('networkidle')
    page.locator('[data-action="source"]').click()
    page.locator('#source-editor .cm-content').click()
    sample = '# Markdown 编辑器测试\n\n' + '\n\n'.join(
        f'## 第 {i} 节：标题与正文排版\n\n正文内容，用于检查打开大纲后是否完整显示。' for i in range(1, 13)
    ) + '\n\n```rust\n' + '// ' + 'long_code_' * 50 + '\n```\n\n## HTML 与转义测试\n\n按 ⌘ S 保存。\n'
    page.keyboard.insert_text(sample)
    page.locator('[data-action="source"]').click()
    page.locator('[data-action="sidebar"]').click()
    checks = []
    for theme in ['github','gothic','newsprint','night','pixyll','whitey','lapis','lapis-dark']:
        page.locator('[data-action="menu"]').click()
        page.locator('[data-action="theme"]').click()
        page.locator(f'[data-action="theme:{theme}"]').click()
        page.wait_for_function("id => [...document.styleSheets].some(s => s.href?.endsWith('/themes/' + id + '.css'))", arg=theme)
        page.evaluate('''async () => {const el=document.querySelector('#editor h2'), s=getComputedStyle(el); await document.fonts.load(`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`, el.textContent); await document.fonts.ready;}''')
        for width in [360, 480, 600, 650, 760, 761, 900, 1180]:
            page.set_viewport_size({'width': width, 'height': 760})
            expect(page.locator('.sidebar')).to_be_visible()
            sidebar = page.locator('.sidebar').bounding_box()
            main = page.locator('.main').bounding_box()
            assert main['x'] >= sidebar['x'] + sidebar['width'] - 1, (theme, width, sidebar, main)
            page.locator('.outline-item').last.click()
            page.wait_for_function("() => {const h=document.querySelector('#editor h2:last-of-type').getBoundingClientRect(), a=document.querySelector('#scroll-area').getBoundingClientRect();return h.top >= a.top && h.bottom <= a.bottom - 35;}")
            heading = page.locator('#editor h2').last.bounding_box()
            assert heading['x'] >= main['x'], (theme, width, heading, main)
            assert heading['x'] + heading['width'] <= width + 1, (theme, width, heading)
            assert page.locator('#scroll-area').evaluate('(el)=>el.scrollLeft') == 0
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            checks.append({'theme':theme,'width':width})
            if theme == 'lapis' and width == 760:
                page.screenshot(path=str(Path(__file__).parents[2] / 'Mori-outline-fixed.png'))
            # Source mode must share the same non-overlapping layout.
            page.locator('[data-action="source"]').click()
            source = page.locator('#source-editor').bounding_box()
            assert source['x'] >= main['x'], (theme, width, source)
            page.locator('[data-action="source"]').click()
        page.locator('[data-action="sidebar"]').click()
        expect(page.locator('.sidebar')).to_be_hidden()
        page.locator('[data-action="sidebar"]').click()
    assert not errors, errors
    (Path(__file__).parents[2] / 'outline-verification.json').write_text(json.dumps({'result':'PASS','checks':checks,'errors':errors},indent=2))
    print(f'PASS: {len(checks)} theme/width combinations; outline navigation, rich/source layout and sidebar toggle; no overlap or horizontal page scroll')
    browser.close()
