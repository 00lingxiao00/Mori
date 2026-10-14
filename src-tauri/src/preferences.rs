use serde_json::{Map, Value};
use tauri::{Emitter, Manager};
use std::{fs, path::PathBuf, sync::Mutex};
static WRITE_LOCK: Mutex<()> = Mutex::new(());
fn file(app: &tauri::AppHandle) -> Result<PathBuf,String> {
    let dir=app.path().app_data_dir().map_err(|e|e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    Ok(dir.join("preferences.json"))
}
#[tauri::command]
pub fn read_preferences(app: tauri::AppHandle) -> Result<Option<Value>,String> {
    let path=file(&app)?;if !path.exists(){return Ok(None)}
    if fs::metadata(&path).map_err(|e|e.to_string())?.len()>16384{return Err("设置文件过大".into())}
    let value:Value=serde_json::from_slice(&fs::read(path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    if !value.is_object(){return Err("设置格式不正确".into())}Ok(Some(value))
}
#[tauri::command]
pub fn write_preferences(app: tauri::AppHandle, patch: Value) -> Result<Value,String> {
    let _lock=WRITE_LOCK.lock().map_err(|e|e.to_string())?;
    let object=patch.as_object().ok_or("设置格式不正确")?;
    let mut merged=read_preferences(app.clone())?.and_then(|v|v.as_object().cloned()).unwrap_or_else(Map::new);
    for(key,value)in object {if key.len()>40||value.is_array()||value.is_object()||value.is_null(){return Err("设置值不正确".into())}merged.insert(key.clone(),value.clone());}
    let result=Value::Object(merged);let bytes=serde_json::to_vec_pretty(&result).map_err(|e|e.to_string())?;
    if bytes.len()>16384{return Err("设置文件过大".into())}
    super::atomic_write(&file(&app)?,&bytes)?;
    app.emit("preferences-changed",&result).map_err(|e|e.to_string())?;Ok(result)
}
#[tauri::command]
pub fn open_preferences(app:tauri::AppHandle)->Result<(),String>{
    if let Some(window)=app.get_webview_window("preferences"){window.show().map_err(|e|e.to_string())?;window.set_focus().map_err(|e|e.to_string())?;return Ok(())}
    tauri::WebviewWindowBuilder::new(&app,"preferences",tauri::WebviewUrl::App("settings.html".into()))
        .title("偏好设置 — Mori").inner_size(820.0,650.0).resizable(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true).build().map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn store_image(app:tauri::AppHandle,state:tauri::State<'_,super::Shared>,data:String)->Result<String,String>{
    use base64::Engine;
    if data.len()>15*1024*1024{return Err("图片过大".into())}
    let bytes=base64::engine::general_purpose::STANDARD.decode(data).map_err(|e|e.to_string())?;
    let session=state.lock().map_err(|e|e.to_string())?;
    let parent=session.path.as_ref().and_then(|p|p.parent()).ok_or("请先保存文档")?.canonicalize().map_err(|e|e.to_string())?;
    let dot=read_preferences(app)?.and_then(|v|v.get("imageDotSlash").and_then(Value::as_bool)).unwrap_or(true);
    copy_image(&parent,&bytes,dot)
}
pub fn extension(app:&tauri::AppHandle)->String{
    let value=read_preferences(app.clone()).ok().flatten().and_then(|v|v.get("extension").and_then(Value::as_str).map(str::to_owned)).unwrap_or_else(||"md".into());
    if ["md","markdown","txt"].contains(&value.as_str()){value}else{"md".into()}
}

fn copy_image(parent:&std::path::Path,bytes:&[u8],dot:bool)->Result<String,String>{
    let extension=if bytes.starts_with(b"\x89PNG\r\n\x1a\n"){"png"}else if bytes.starts_with(b"\xff\xd8\xff"){"jpg"}else if bytes.starts_with(b"GIF87a")||bytes.starts_with(b"GIF89a"){"gif"}else if bytes.starts_with(b"RIFF")&&bytes.get(8..12)==Some(b"WEBP"){"webp"}else{return Err("复制到 assets 仅支持 PNG、JPEG、GIF、WebP".into())};
    let assets=parent.join("assets");fs::create_dir_all(&assets).map_err(|e|e.to_string())?;
    let assets=assets.canonicalize().map_err(|e|e.to_string())?;
    if !assets.starts_with(&parent){return Err("assets 文件夹指向文档目录之外".into())}
    use sha2::Digest;let hash=format!("{:x}",sha2::Sha256::digest(bytes));let name=format!("{}.{extension}",&hash[..20]);let target=assets.join(&name);
    // Never follow or replace a pre-existing image symlink/file with different data.
    if target.exists()||target.symlink_metadata().is_ok(){if target.symlink_metadata().map_err(|e|e.to_string())?.file_type().is_symlink()||fs::read(&target).map_err(|e|e.to_string())?.as_slice()!=bytes{return Err("图片文件冲突".into())}}
    else{super::atomic_write(&target,&bytes)?}
    Ok(format!("{}assets/{name}",if dot{"./"}else{""}))
}

#[cfg(test)]
mod tests{
 use super::*;
 #[test]
 fn copies_images_without_overwriting_existing_data(){
  let dir=tempfile::tempdir().unwrap();let parent=dir.path().canonicalize().unwrap();let bytes=b"\x89PNG\r\n\x1a\nexample";
  let relative=copy_image(&parent,bytes,true).unwrap();assert!(relative.starts_with("./assets/"));assert_eq!(fs::read(parent.join(&relative)).unwrap(),bytes);
  assert_eq!(copy_image(&parent,bytes,false).unwrap(),relative.trim_start_matches("./"));
  fs::write(parent.join(&relative),b"existing user data").unwrap();assert!(copy_image(&parent,bytes,true).is_err());assert_eq!(fs::read(parent.join(relative)).unwrap(),b"existing user data");
 }
 #[test]
 fn rejects_an_assets_symlink_outside_document_directory(){
  let dir=tempfile::tempdir().unwrap();let other=tempfile::tempdir().unwrap();let parent=dir.path().canonicalize().unwrap();std::os::unix::fs::symlink(other.path(),parent.join("assets")).unwrap();assert!(copy_image(&parent,b"\x89PNG\r\n\x1a\nexample",true).is_err());assert_eq!(fs::read_dir(other.path()).unwrap().count(),0);
 }
}
