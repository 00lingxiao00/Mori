import {invoke,isTauri} from '@tauri-apps/api/core';
type Entry={name:string;path:string;directory:boolean};
type Listing={root:string;entries:Entry[]};
export type FolderDocument={path:string;markdown:string};
export class FolderSidebar {
 private root='';private active:string|null=null;private entries=new Map<string,Entry[]>();private expanded=new Set<string>();private files=new Map<string,File>();private generation=0;private picking=false;
 private tree:HTMLElement;private panel:HTMLElement;private outline:HTMLElement;private tabs:NodeListOf<HTMLButtonElement>;
 constructor(private openDocument:(load:()=>Promise<FolderDocument>)=>Promise<void>,private error:(message:string)=>void){
  this.panel=document.querySelector('#files-panel')!;this.tree=document.querySelector('#file-tree')!;this.outline=document.querySelector('#outline')!;this.tabs=document.querySelectorAll('[data-sidebar-view]');
  for(const tab of this.tabs)tab.onclick=()=>{if(tab.dataset.sidebarView==='files'&&!this.root)void this.open();else this.show(tab.dataset.sidebarView==='files');};
  document.querySelector('#refresh-folder')!.addEventListener('click',()=>void this.refresh());
  window.addEventListener('focus',()=>{if(this.root&&!this.panel.hidden)void this.refresh();});
 }
 show(files:boolean){this.panel.hidden=!files;this.outline.hidden=files;for(const tab of this.tabs)tab.setAttribute('aria-selected',String((tab.dataset.sidebarView==='files')===files));document.body.classList.remove('sidebar-hidden');}
 showOutline(){this.show(false);}
 setActive(path:string|null){this.active=path;for(const row of this.tree.querySelectorAll<HTMLElement>('[data-file-path]')){const selected=row.dataset.filePath===path;row.classList.toggle('active',selected);if(!row.hasAttribute('aria-expanded'))row.setAttribute('aria-current',String(selected));}}
 async open(){
  if(this.picking)return;this.picking=true;
  try{
   if(isTauri()){const listing=await invoke<Listing|null>('open_folder');if(listing)this.adopt(listing);}
   else{
    const input=document.createElement('input');input.type='file';input.setAttribute('webkitdirectory','');input.multiple=true;
    input.onchange=()=>{const selected=[...(input.files||[])];if(!selected.length)return;this.files=new Map(selected.filter(file=>/\.(md|markdown|mdown|txt)$/i.test(file.name)&&!file.webkitRelativePath.split('/').some(part=>part.startsWith('.'))).map(file=>[file.webkitRelativePath,file]));const root=selected[0].webkitRelativePath.split('/')[0];this.adopt({root,entries:this.browserListing(root).entries});};input.click();
   }
  }catch(e){this.error(String(e));}finally{this.picking=false;}
 }
 private adopt(listing:Listing){this.generation++;this.root=listing.root;this.entries.clear();this.entries.set(this.root,listing.entries);this.expanded.clear();document.querySelector('#folder-name')!.textContent=this.root.split('/').pop()||this.root;document.querySelector<HTMLElement>('#folder-name')!.title=this.root;this.render();this.show(true);}
 private browserListing(path:string):Listing{
  const entries=new Map<string,Entry>();for(const key of this.files.keys()){if(!key.startsWith(path+'/'))continue;const remainder=key.slice(path.length+1),parts=remainder.split('/'),name=parts[0];entries.set(name,{name,path:path+'/'+name,directory:parts.length>1});}
  return {root:this.root||path,entries:[...entries.values()].sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name))};
 }
 private async list(path:string){return isTauri()?invoke<Listing>('list_folder',{path}):this.browserListing(path);}
 async refresh(){
  const version=this.generation;if(!this.root||!isTauri())return;
  try{for(const path of [this.root,...this.expanded]){try{const listing=await this.list(path);if(version!==this.generation)return;this.entries.set(path,listing.entries);}catch(e){if(path===this.root)throw e;this.expanded.delete(path);this.entries.delete(path);}}this.render();}catch(e){this.error(String(e));}
 }
 private render(){
  this.tree.replaceChildren();
  const append=(path:string,depth:number)=>{for(const entry of this.entries.get(path)||[]){
   const row=document.createElement('button');row.type='button';row.className='file-entry';row.dataset.filePath=entry.path;row.style.paddingLeft=`${6+depth*12}px`;row.title=entry.name;
   const icon=document.createElement('span');icon.className='file-entry-icon';icon.setAttribute('aria-hidden','true');icon.textContent=entry.directory?(this.expanded.has(entry.path)?'▾':'▸'):'·';const name=document.createElement('span');name.className='file-entry-name';name.textContent=entry.name;row.append(icon,name);
   if(entry.directory){row.setAttribute('aria-expanded',String(this.expanded.has(entry.path)));row.onclick=async()=>{const version=this.generation;try{if(this.expanded.has(entry.path))this.expanded.delete(entry.path);else{const listing=await this.list(entry.path);if(version!==this.generation)return;this.entries.set(entry.path,listing.entries);this.expanded.add(entry.path);}this.render();}catch(e){this.error(String(e));}};}
   else row.onclick=()=>{if(this.active===entry.path)return;void this.openDocument(async()=>{if(isTauri())return invoke<FolderDocument>('open_folder_document',{path:entry.path});const file=this.files.get(entry.path);if(!file)throw Error('文件不可用');if(file.size>20*1024*1024)throw Error('文件超过 20 MB');return {path:entry.path,markdown:await file.text()};});};
   this.tree.append(row);if(entry.directory&&this.expanded.has(entry.path))append(entry.path,depth+1);
  }};append(this.root,0);this.setActive(this.active);
 }
}
