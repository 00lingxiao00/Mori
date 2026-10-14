use tauri::{menu::{IsMenuItem, Menu, MenuItem, MenuItemKind, CheckMenuItem, PredefinedMenuItem, Submenu}, AppHandle, Wry};
type Item = MenuItemKind<Wry>;
fn item(app: &AppHandle, id: &str, label: &str, key: Option<&str>) -> tauri::Result<Item> { Ok(MenuItem::with_id(app, id, label, true, key)?.kind()) }
fn check(app: &AppHandle, id: &str, label: &str, key: Option<&str>) -> tauri::Result<Item> { Ok(CheckMenuItem::with_id(app, id, label, true, false, key)?.kind()) }
fn sep(app: &AppHandle) -> tauri::Result<Item> { Ok(PredefinedMenuItem::separator(app)?.kind()) }
fn sub(app: &AppHandle, name: &str, items: Vec<Item>) -> tauri::Result<Item> {
    let refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<Wry>).collect();
    Ok(Submenu::with_items(app, name, true, &refs)?.kind())
}
pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let i = |id: &str, label: &str, key: Option<&str>| item(app, id, label, key);
    let c = |id: &str, label: &str, key: Option<&str>| check(app, id, label, key);
    let s = || sep(app);
    let table = sub(app, "表格", vec![i("edit:table-insert", "插入表格", Some("CmdOrCtrl+Alt+T"))?, s()?,
        i("edit:row-before", "上方插入行", None)?, i("edit:row-after", "下方插入行", None)?,
        i("edit:col-before", "左侧插入列", None)?, i("edit:col-after", "右侧插入列", None)?, s()?,
        i("edit:row-delete", "删除行", None)?, i("edit:col-delete", "删除列", None)?, i("edit:table-delete", "删除表格", None)?])?;
    let tasks = sub(app, "任务状态", vec![i("edit:task:toggle", "切换任务状态", None)?, i("edit:task:done", "标记为已完成", None)?, i("edit:task:todo", "标记为未完成", None)?])?;
    let mut paragraphs = Vec::new();
    for (n, label) in ["一级标题", "二级标题", "三级标题", "四级标题", "五级标题", "六级标题"].iter().enumerate() {
        paragraphs.push(i(&format!("edit:heading:{}", n+1), label, Some(&format!("CmdOrCtrl+{}", n+1)))?);
    }
    paragraphs.extend(vec![i("edit:paragraph", "段落", Some("CmdOrCtrl+0"))?, s()?,
        i("edit:heading-up", "提升标题级别", Some("CmdOrCtrl+Plus"))?, i("edit:heading-down", "降低标题级别", Some("CmdOrCtrl+Minus"))?, s()?, table,
        i("edit:math-block", "公式块", Some("CmdOrCtrl+Alt+B"))?, i("edit:code-block", "代码块", Some("CmdOrCtrl+Alt+C"))?,
        i("edit:quote", "引用", Some("CmdOrCtrl+Alt+Q"))?, s()?,
        i("edit:ordered", "有序列表", Some("CmdOrCtrl+Alt+O"))?, i("edit:bullet", "无序列表", Some("CmdOrCtrl+Alt+U"))?,
        i("edit:task", "任务列表", Some("CmdOrCtrl+Alt+X"))?, tasks,
        sub(app, "列表缩进", vec![i("edit:indent", "增加缩进", Some("CmdOrCtrl+BracketRight"))?, i("edit:outdent", "减少缩进", Some("CmdOrCtrl+BracketLeft"))?])?, s()?,
        i("edit:paragraph-before", "在上方插入段落", Some("CmdOrCtrl+Shift+Return"))?, i("edit:paragraph-after", "在下方插入段落", Some("CmdOrCtrl+Return"))?, s()?,
        i("edit:footnote", "脚注", Some("CmdOrCtrl+Alt+R"))?, i("edit:hr", "水平分割线", None)?]);
    let themes = [("github", "Github"), ("gothic", "Gothic"), ("newsprint", "Newsprint"), ("night", "Night"), ("pixyll", "Pixyll"), ("whitey", "Whitey"), ("lapis", "Lapis"), ("lapis-dark", "Lapis Dark")].into_iter().map(|(id, name)| c(&format!("theme:{id}"), name, None)).collect::<tauri::Result<Vec<_>>>()?;
    let mut font_sizes = vec![i("font-up", "增大字号", None)?, i("font-down", "减小字号", None)?, s()?, c("font:0", "跟随主题", None)?];
    for size in [12,14,16,18,20,22,24,28,32,36] { font_sizes.push(c(&format!("font:{size}"), &format!("{size} px"), None)?); }
    let menus = vec![
        sub(app, "Mori", vec![PredefinedMenuItem::about(app, Some("关于 Mori"), None)?.kind(), i("preferences", "设置…", Some("CmdOrCtrl+Comma"))?, s()?,
            PredefinedMenuItem::services(app, Some("服务"))?.kind(), s()?,
            PredefinedMenuItem::hide(app, Some("隐藏 Mori"))?.kind(), PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?.kind(), PredefinedMenuItem::show_all(app, Some("显示全部"))?.kind(), s()?, i("quit", "退出 Mori", Some("CmdOrCtrl+Q"))?])?,
        sub(app, "文件", vec![i("new", "新建", Some("CmdOrCtrl+N"))?, i("open", "打开…", Some("CmdOrCtrl+O"))?, i("open-folder", "打开文件夹…", Some("CmdOrCtrl+Shift+O"))?, s()?,
            i("close", "关闭", Some("CmdOrCtrl+W"))?, i("save", "保存", Some("CmdOrCtrl+S"))?, i("save-as", "保存为…", Some("CmdOrCtrl+Shift+S"))?, c("autosave", "自动保存", None)?, s()?,
            sub(app, "导出", vec![i("export", "Markdown", None)?, i("export-html", "HTML", None)?, i("export-pdf", "PDF…", None)?])?, s()?, i("print", "打印…", Some("CmdOrCtrl+P"))?])?,
        sub(app, "编辑", vec![i("undo", "撤消", Some("CmdOrCtrl+Z"))?, i("redo", "重做", Some("CmdOrCtrl+Shift+Z"))?, s()?,
            PredefinedMenuItem::cut(app, Some("剪切"))?.kind(), PredefinedMenuItem::copy(app, Some("拷贝"))?.kind(), PredefinedMenuItem::paste(app, Some("粘贴"))?.kind(),
            i("copy-markdown", "复制为 Markdown", Some("CmdOrCtrl+Shift+C"))?, i("paste-plain", "粘贴为纯文本", Some("CmdOrCtrl+Shift+V"))?, s()?,
            sub(app, "选择", vec![PredefinedMenuItem::select_all(app, Some("全选"))?.kind(), i("edit:select-block", "选择段落或块", None)?, s()?, i("edit:doc-start", "跳转到文首", Some("CmdOrCtrl+Home"))?, i("edit:doc-end", "跳转到文末", Some("CmdOrCtrl+End"))?])?,
            i("edit:delete", "删除", None)?, s()?, sub(app, "查找", vec![i("find", "查找…", Some("CmdOrCtrl+F"))?, i("find-next", "查找下一个", Some("CmdOrCtrl+G"))?, i("find-prev", "查找上一个", Some("CmdOrCtrl+Shift+G"))?, i("replace", "查找和替换…", Some("CmdOrCtrl+Alt+F"))?])?])?,
        sub(app, "段落", paragraphs)?,
        sub(app, "格式", vec![c("edit:bold", "加粗", Some("CmdOrCtrl+B"))?, c("edit:italic", "斜体", Some("CmdOrCtrl+I"))?, c("edit:underline", "下划线", Some("CmdOrCtrl+U"))?,
            c("edit:code", "代码", Some("CmdOrCtrl+Shift+Backquote"))?, c("edit:strike", "删除线", Some("CmdOrCtrl+Shift+X"))?, c("edit:highlight", "高亮", Some("CmdOrCtrl+Shift+H"))?, s()?,
            i("insert-link", "超链接…", Some("CmdOrCtrl+K"))?, sub(app, "图像", vec![i("insert-image", "插入图片…", Some("CmdOrCtrl+Control+I"))?, i("local-image", "插入本地图片…", None)?])?, s()?, i("edit:clear-format", "清除样式", Some("CmdOrCtrl+Backslash"))?])?,
        sub(app, "显示", vec![c("source", "源代码模式", Some("CmdOrCtrl+Slash"))?, c("focus", "专注模式", Some("F8"))?, c("typewriter", "打字机模式", Some("F9"))?, s()?,
            c("sidebar", "显示／隐藏侧边栏", Some("CmdOrCtrl+Shift+L"))?, i("outline", "大纲", None)?, i("word-count", "字数统计窗口", None)?, s()?,
            sub(app, "字号", font_sizes)?, s()?, i("zoom-reset", "实际大小", Some("CmdOrCtrl+Shift+0"))?, i("zoom-in", "放大", Some("CmdOrCtrl+Shift+Plus"))?, i("zoom-out", "缩小", Some("CmdOrCtrl+Shift+Minus"))?, s()?,
            i("privacy", "遮蔽／显示窗口", Some("CmdOrCtrl+Shift+P"))?, s()?, c("always-on-top", "保持窗口在最前端", None)?, PredefinedMenuItem::fullscreen(app, Some("全屏"))?.kind()])?,
        sub(app, "主题", themes)?,
        sub(app, "窗口", vec![PredefinedMenuItem::minimize(app, Some("最小化"))?.kind(), PredefinedMenuItem::maximize(app, Some("缩放"))?.kind(), s()?, PredefinedMenuItem::bring_all_to_front(app, Some("前置全部窗口"))?.kind()])?,
        sub(app, "帮助", vec![i("help", "Markdown 语法", None)?, i("shortcuts", "快捷键", None)?])?,
    ];
    let refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = menus.iter().map(|m| m as &dyn tauri::menu::IsMenuItem<Wry>).collect();
    Menu::with_items(app, &refs)
}

pub fn find_item(items: Vec<Item>, id: &str) -> Option<Item> {
    for item in items {
        if item.id().as_ref() == id { return Some(item); }
        if let Some(submenu) = item.as_submenu() {
            if let Ok(children) = submenu.items() { if let Some(found) = find_item(children, id) { return Some(found); } }
        }
    }
    None
}
