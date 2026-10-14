from pathlib import Path
import tempfile,shutil
from playwright.sync_api import sync_playwright,expect
project=Path(__file__).resolve().parents[1]
out=project/'docs/assets';out.mkdir(parents=True,exist_ok=True)
intro='''# 把注意力留给文字

一份笔记，一个安静的写作空间。

在这里记录想法，整理材料，再把它们写成文章。用 **粗体** 标出重点，用 `Markdown` 保留结构。

## 今天的写作

- [x] 整理文章大纲
- [x] 写下第一个想法
- [ ] 留一点时间，慢慢修改

> 好的工具，让你更容易开始，也更愿意继续。

## 一小段代码

```rust
fn main() {
    println!("Hello, Mori!");
}
```

## 一点数学

把想法写清楚，也可以从一个公式开始：$E = mc^2$。
'''
with tempfile.TemporaryDirectory(prefix='mori-readme-') as temp:
 folder=Path(temp)/'写作手记';(folder/'文章').mkdir(parents=True);(folder/'素材').mkdir();(folder/'开始写作.md').write_text(intro);(folder/'文章'/'一份文章的大纲.md').write_text('# 一份文章的大纲\n\n## 开场\n\n一个值得记下来的问题。\n\n## 展开\n\n把相关的想法放在一起。\n\n## 收尾\n\n留给下一次写作。\n');(folder/'素材'/'摘录.md').write_text('# 摘录\n\n收集与思考。\n');(folder/'阅读清单.md').write_text('# 阅读清单\n\n- [ ] 下一本书\n')
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True)
  context=browser.new_context(viewport={'width':1120,'height':850},device_scale_factor=2,reduced_motion='reduce');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
  # Inspect the rendered application before operating it.
  expect(page.get_by_role('button',name='菜单',exact=True)).to_be_visible();expect(page.locator('#editor .ProseMirror')).to_be_visible()
  with page.expect_file_chooser() as chooser:page.keyboard.press('Meta+Shift+o')
  chooser.value.set_files(str(folder));expect(page.locator('#folder-name')).to_have_text('写作手记');page.get_by_role('button',name='开始写作.md',exact=True).click();expect(page.locator('#document-title')).to_have_text('开始写作.md')
  def settle():
   page.evaluate('''async()=>{for(const e of document.querySelectorAll('#editor h1,#editor p,#editor .cm-content')){const s=getComputedStyle(e);await document.fonts.load(`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`,e.textContent||'中文');}await document.fonts.ready;document.querySelector('#scroll-area').scrollTop=0;getSelection()?.removeAllRanges();document.activeElement?.blur();}''');page.mouse.move(1100,20);page.wait_for_timeout(200)
  def action(name):page.evaluate("a=>{let b=document.createElement('button');b.dataset.action=a;document.body.append(b);b.click();b.remove()}",name)
  page.get_by_role('button',name='文章',exact=True).click();page.get_by_role('button',name='素材',exact=True).click();settle();page.screenshot(path=str(out/'folders.png'))
  action('sidebar');settle();page.screenshot(path=str(out/'editor.png'))
  action('theme:night');expect(page.locator('html')).to_have_attribute('data-theme','night');settle();page.screenshot(path=str(out/'night.png'))
  action('theme:github');expect(page.locator('html')).to_have_attribute('data-theme','github');settle()
  settings=context.new_page();settings.set_viewport_size({'width':820,'height':650});settings.on('pageerror',lambda e:errors.append(str(e)));settings.goto('http://127.0.0.1:5173/settings.html');settings.wait_for_load_state('networkidle');expect(settings.locator('[data-category]')).to_have_count(7);settings.locator('[data-category="外观"]').click();settings.evaluate('document.fonts.ready');settings.mouse.move(815,10);settings.screenshot(path=str(out/'preferences.png'))
  assert not errors,errors
  context.close();browser.close()
shutil.copyfile(project/'src-tauri/icons/icon.png',out/'app-icon.png')
print('Captured editor, folder sidebar, Night theme and preferences; no page errors.')
