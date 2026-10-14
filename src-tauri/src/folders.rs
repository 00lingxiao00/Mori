use std::{fs, path::{Path,PathBuf}, sync::Mutex};
use serde::Serialize;
use tauri::State;
#[derive(Default)]
pub struct Folder(pub Mutex<Option<PathBuf>>);
#[derive(Serialize)]
pub struct Entry {name:String,path:String,directory:bool}
#[derive(Serialize)]
pub struct Listing {root:String,entries:Vec<Entry>}
fn supported(path:&Path)->bool {path.extension().and_then(|s|s.to_str()).map(|s|matches!(s.to_ascii_lowercase().as_str(),"md"|"markdown"|"mdown"|"txt")).unwrap_or(false)}
fn confined(root:&Path,path:&Path)->Result<PathBuf,String>{
 let resolved=path.canonicalize().map_err(|e|format!("无法访问文件：{e}"))?;
 if !resolved.starts_with(root){return Err("文件不在打开的文件夹内".into())}Ok(resolved)
}
fn listing(root:&Path,path:&Path)->Result<Listing,String>{
 let dir=confined(root,path)?;let mut entries=Vec::new();
 for entry in fs::read_dir(dir).map_err(|e|format!("无法读取文件夹：{e}"))? {
  let entry=entry.map_err(|e|e.to_string())?;let name=entry.file_name().to_string_lossy().into_owned();
  if name.starts_with('.') {continue}
  let kind=entry.file_type().map_err(|e|e.to_string())?;
  // Do not follow directory symlinks into unrelated folders or cycles.
  if kind.is_symlink()||(!kind.is_dir()&&!(kind.is_file()&&supported(&entry.path()))){continue}
  entries.push(Entry{name,path:entry.path().to_string_lossy().into_owned(),directory:kind.is_dir()});
  if entries.len()>10000{return Err("文件夹中的条目过多，请打开更小的子文件夹".into())}
 }
 entries.sort_by(|a,b|b.directory.cmp(&a.directory).then_with(||a.name.to_lowercase().cmp(&b.name.to_lowercase())).then_with(||a.name.cmp(&b.name)));
 Ok(Listing{root:root.to_string_lossy().into_owned(),entries})
}
#[tauri::command]
pub async fn open_folder(state:State<'_,Folder>)->Result<Option<Listing>,String>{
 let picked=tauri::async_runtime::spawn_blocking(||rfd::FileDialog::new().pick_folder()).await.map_err(|e|e.to_string())?;
 let Some(path)=picked else{return Ok(None)};
 let root=path.canonicalize().map_err(|e|e.to_string())?;
 let scan=root.clone();let result=tauri::async_runtime::spawn_blocking(move||listing(&scan,&scan)).await.map_err(|e|e.to_string())??;
 *state.0.lock().map_err(|e|e.to_string())?=Some(root);Ok(Some(result))
}
#[tauri::command]
pub async fn list_folder(path:String,state:State<'_,Folder>)->Result<Listing,String>{
 let root=state.0.lock().map_err(|e|e.to_string())?.clone().ok_or("尚未打开文件夹")?;
 tauri::async_runtime::spawn_blocking(move||listing(&root,Path::new(&path))).await.map_err(|e|e.to_string())?
}
fn read_document(root:&Path,path:&Path)->Result<super::Document,String>{
 let path=confined(root,path)?;
 if !supported(&path){return Err("不支持的文档类型".into())}
 let meta=fs::metadata(&path).map_err(|e|e.to_string())?;if !meta.is_file(){return Err("不是普通文档文件".into())}
 if meta.len()>20*1024*1024{return Err("文件超过 20 MB，请选择较小的文档".into())}
 let markdown=fs::read_to_string(&path).map_err(|e|format!("无法读取 UTF-8 文档：{e}"))?;
 Ok(super::Document{path:path.to_string_lossy().into_owned(),markdown})
}
#[tauri::command]
pub async fn open_folder_document(path:String,folder:State<'_,Folder>,state:State<'_,super::Shared>)->Result<super::Document,String>{
 let root=folder.0.lock().map_err(|e|e.to_string())?.clone().ok_or("尚未打开文件夹")?;let shared=state.inner().clone();
 tauri::async_runtime::spawn_blocking(move||{
  let doc=read_document(&root,Path::new(&path))?;
  let mut session=shared.lock().map_err(|e|e.to_string())?;session.digest=Some(super::digest(&doc.markdown));session.path=Some(PathBuf::from(&doc.path));Ok(doc)
 }).await.map_err(|e|e.to_string())?
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn lists_directories_and_markdown_without_hidden_or_external_files(){
  let dir=tempfile::tempdir().unwrap();let root=dir.path().canonicalize().unwrap();
  fs::create_dir(root.join("章节")).unwrap();for name in ["B.MD","a.txt","z.png",".private.md"]{fs::write(root.join(name),"# 标题").unwrap();}
  std::os::unix::fs::symlink("章节",root.join("cycle")).unwrap();
  let items=listing(&root,&root).unwrap().entries;assert_eq!(items.iter().map(|x|x.name.as_str()).collect::<Vec<_>>(),vec!["章节","a.txt","B.MD"]);
  assert_eq!(read_document(&root,&root.join("B.MD")).unwrap().markdown,"# 标题");assert!(read_document(&root,&root.join("z.png")).is_err());
 }
 #[test]fn rejects_paths_outside_root_and_invalid_documents(){
  let dir=tempfile::tempdir().unwrap();let other=tempfile::tempdir().unwrap();let root=dir.path().canonicalize().unwrap();let external=other.path().join("outside.md");fs::write(&external,"outside").unwrap();
  std::os::unix::fs::symlink(&external,root.join("link.md")).unwrap();assert!(read_document(&root,&root.join("link.md")).is_err());assert!(listing(&root,other.path()).is_err());
  fs::write(root.join("invalid.md"),[255,254]).unwrap();assert!(read_document(&root,&root.join("invalid.md")).is_err());assert!(read_document(&root,&root.join("missing.md")).is_err());
 }
}
