#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod menus;
mod folders;
mod preferences;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager, State};

#[derive(Default)]
struct Session {
    path: Option<PathBuf>,
    digest: Option<String>,
}
type Shared = Arc<Mutex<Session>>;
#[derive(Serialize)]
struct Document {
    path: String,
    markdown: String,
}
#[derive(Serialize, Deserialize)]
struct Draft {
    markdown: String,
    name: String,
}
fn digest(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("无法确定保存目录")?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    if let Ok(meta) = fs::metadata(path) {
        file.as_file()
            .set_permissions(meta.permissions())
            .map_err(|e| e.to_string())?;
    }
    file.write_all(content).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
fn ensure_unchanged(path: &Path, expected: Option<&str>) -> Result<(), String> {
    let disk = fs::read_to_string(path)
        .map_err(|_| "文件已被移动或删除。请使用「另存为」。".to_string())?;
    if expected != Some(digest(&disk).as_str()) {
        return Err("文件已被其他程序修改。为保留两个版本，请使用「另存为」。".into());
    }
    Ok(())
}
fn draft_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("recovery.json"))
}
#[tauri::command]
async fn open_document(state: State<'_, Shared>) -> Result<Option<Document>, String> {
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("Markdown / 文本", &["md", "markdown", "txt", "mdown"])
            .pick_file()
        else {
            return Ok(None);
        };
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        if meta.len() > 20 * 1024 * 1024 {
            return Err("文件超过 20 MB，请选择较小的文档".into());
        }
        let markdown =
            fs::read_to_string(&path).map_err(|e| format!("无法读取 UTF-8 文档：{e}"))?;
        let mut session = shared.lock().map_err(|e| e.to_string())?;
        session.digest = Some(digest(&markdown));
        session.path = Some(path.clone());
        Ok(Some(Document {
            path: path.to_string_lossy().into(),
            markdown,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn save_document(
    markdown: String,
    save_as: bool,
    app: tauri::AppHandle,
    state: State<'_, Shared>,
) -> Result<Option<String>, String> {
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = shared.lock().map_err(|e| e.to_string())?;
        let pick = save_as || session.path.is_none();
        let path = if pick {
            let extension = preferences::extension(&app);
            let default_name = format!("未命名.{extension}");
            let name = session
                .path
                .as_ref()
                .and_then(|p| p.file_name())
                .and_then(|s| s.to_str())
                .unwrap_or(&default_name);
            let Some(path) = rfd::FileDialog::new()
                .add_filter("Markdown / 文本", &[extension.as_str()])
                .set_file_name(name)
                .save_file()
            else {
                return Ok(None);
            };
            path
        } else {
            session.path.clone().unwrap()
        };
        // Never silently overwrite changes made in another editor, even via Save As.
        if session.path.as_ref() == Some(&path) {
            ensure_unchanged(&path, session.digest.as_deref())?;
        }
        atomic_write(&path, markdown.as_bytes())?;
        session.digest = Some(digest(&markdown));
        session.path = Some(path.clone());
        Ok(Some(path.to_string_lossy().into()))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn reset_document(state: State<'_, Shared>) -> Result<(), String> {
    *state.lock().map_err(|e| e.to_string())? = Session::default();
    Ok(())
}
#[tauri::command]
fn write_draft(app: tauri::AppHandle, markdown: String, name: String) -> Result<(), String> {
    let value = serde_json::to_vec(&Draft { markdown, name }).map_err(|e| e.to_string())?;
    atomic_write(&draft_path(&app)?, &value)
}
#[tauri::command]
fn read_draft(app: tauri::AppHandle) -> Result<Option<Draft>, String> {
    let path = draft_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&data)
        .map(Some)
        .map_err(|e| format!("恢复文件无法读取：{e}"))
}
#[tauri::command]
fn clear_draft(app: tauri::AppHandle) -> Result<(), String> {
    let path = draft_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn read_image(relative: String, state: State<'_, Shared>) -> Result<String, String> {
    use base64::Engine;
    let session = state.lock().map_err(|e| e.to_string())?;
    let root = session
        .path
        .as_ref()
        .and_then(|p| p.parent())
        .ok_or("请先保存文档")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let path = root
        .join(&relative)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.starts_with(&root) {
        return Err("图片须位于文档目录内".into());
    }
    let mime = match path
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return Err("不支持的图片格式".into()),
    };
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 15 * 1024 * 1024 {
        return Err("图片过大".into());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(format!(
        "data:{};base64,{}",
        mime,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
#[tauri::command]
fn clipboard_text(value: Option<String>) -> Result<String, String> {
    if let Some(text) = value {
        let mut child = std::process::Command::new("/usr/bin/pbcopy").stdin(std::process::Stdio::piped()).spawn().map_err(|e| e.to_string())?;
        child.stdin.take().ok_or("无法写入剪贴板")?.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        if !child.wait().map_err(|e| e.to_string())?.success() { return Err("无法写入剪贴板".into()); }
        Ok(text)
    } else {
        let output = std::process::Command::new("/usr/bin/pbpaste").output().map_err(|e| e.to_string())?;
        if !output.status.success() { return Err("无法读取剪贴板".into()); }
        String::from_utf8(output.stdout).map_err(|e| e.to_string())
    }
}
#[tauri::command]
fn update_menu(app: tauri::AppHandle, checked: std::collections::HashMap<String, bool>, enabled: std::collections::HashMap<String, bool>) -> Result<(), String> {
    if let Some(menu) = app.menu() {
        for (id, value) in checked { if let Some(item) = menus::find_item(menu.items().map_err(|e| e.to_string())?, &id) { if let Some(check) = item.as_check_menuitem() { check.set_checked(value).map_err(|e| e.to_string())?; } } }
        for (id, value) in enabled { if let Some(item) = menus::find_item(menu.items().map_err(|e| e.to_string())?, &id) {
            if let Some(plain) = item.as_menuitem() { plain.set_enabled(value).map_err(|e| e.to_string())?; }
            if let Some(check) = item.as_check_menuitem() { check.set_enabled(value).map_err(|e| e.to_string())?; }
        } }
    }
    Ok(())
}
#[tauri::command]
fn window_action(window: tauri::WebviewWindow, action: String, value: bool) -> Result<(), String> {
    match action.as_str() {
        "print" => window.print(),
        "always-on-top" => window.set_always_on_top(value),
        _ => return Err("未知窗口操作".into()),
    }.map_err(|e| e.to_string())
}
#[tauri::command]
async fn export_document(content: String, extension: String) -> Result<(), String> {
    if !["html", "md", "json"].contains(&extension.as_str()) { return Err("不支持的导出格式".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(file) = rfd::FileDialog::new().add_filter(&extension.to_uppercase(), &[extension.as_str()]).set_file_name(format!("未命名.{extension}")).save_file() { atomic_write(&file, content.as_bytes())?; }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}
fn main() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(Session::default())) as Shared)
        .manage(folders::Folder::default())
        .invoke_handler(tauri::generate_handler![
            folders::open_folder,
            folders::list_folder,
            folders::open_folder_document,
            open_document,
            save_document,
            reset_document,
            write_draft,
            read_draft,
            clear_draft,
            read_image,
            quit_app,
            update_menu,
            window_action,
            export_document,
            clipboard_text,
            preferences::read_preferences,
            preferences::write_preferences,
            preferences::open_preferences,
            preferences::store_image
        ])
        .setup(|app| {
            app.set_menu(menus::build(app.handle())?)?;
            app.on_menu_event(|app, event| {
                let id = event.id().as_ref();
                if id == "privacy" { let _ = app.emit("privacy-toggle", ()); return; }
                if id == "preferences" { let _ = preferences::open_preferences(app.clone()); return; }
                if let Some(window) = app.get_webview_window("preferences") {
                    if window.is_focused().unwrap_or(false) {
                        if id == "close" { let _ = window.close(); }
                        if id != "quit" { return; }
                    }
                }
                if id == "quit" { if let Some(window) = app.get_webview_window("main") { let _ = window.set_focus(); } }
                let _ = app.emit("menu-action", id);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("无法启动 Mori")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } = event
            {
                api.prevent_exit();
                let _ = app.emit("menu-action", "quit");
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atomic_replacement_preserves_unicode_and_leaves_no_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("笔记.md");
        atomic_write(&path, b"old").unwrap();
        atomic_write(&path, "# 你好\n\n世界 🌱\n".as_bytes()).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "# 你好\n\n世界 🌱\n");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn failed_write_preserves_original() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "original").unwrap();
        assert!(atomic_write(&dir.path().join("missing/note.md"), b"new").is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "original");
    }
    #[test]
    fn detects_external_edits_and_deletion_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "original").unwrap();
        let expected = digest("original");
        assert!(ensure_unchanged(&path, Some(&expected)).is_ok());
        fs::write(&path, "external edit").unwrap();
        assert!(ensure_unchanged(&path, Some(&expected)).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "external edit");
        fs::remove_file(&path).unwrap();
        assert!(ensure_unchanged(&path, Some(&expected)).is_err());
    }
}
