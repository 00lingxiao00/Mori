import './privacy';
import { preferences, defaults, normalize, savePreferences, onPreferences, themeChoices, type Preferences } from './preferences-store';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { createIcons, FileText, Pencil, Image, FileCode, Printer, Paintbrush, Settings2 } from 'lucide';
import './preferences.css';
type Key=keyof Preferences;
type Field={key:Key;label:string;type?:'number'|'text';options?:readonly (readonly [string|number,string])[];min?:number;max?:number;step?:number};
type Section={title:string;fields:Field[]};
const categories: {name:string;icon:string;sections:Section[]}[]=[
 {name:'文件',icon:'file-text',sections:[
  {title:'启动选项',fields:[{key:'startupMode',label:'默认编辑模式',options:[['rich','即时编辑'],['source','源代码']]}]},
  {title:'大纲',fields:[{key:'outlineFold',label:'允许折叠和展开侧边栏的大纲视图'}]},
  {title:'默认文件类型 / 扩展名',fields:[{key:'extension',label:'文件类型',options:[['md','Markdown (.md)'],['markdown','Markdown (.markdown)'],['txt','纯文本 (.txt)']]}]},
  {title:'保存 & 恢复',fields:[{key:'autosave',label:'自动保存已命名文档'},{key:'autosaveDelay',label:'停笔后保存（毫秒）',type:'number',min:500,max:30000,step:500},{key:'recovery',label:'保存本地恢复草稿'}]},
 ]},
 {name:'编辑器',icon:'pencil',sections:[
  {title:'使用成对的符号',fields:[{key:'pairBrackets',label:'匹配括号和引号'},{key:'pairMarkdown',label:'匹配 Markdown 字符'}]},
  {title:'复制行为',fields:[{key:'copyMarkdown',label:'复制时使用 Markdown 源码'}]},
  {title:'拼写检查',fields:[{key:'spellcheck',label:'键入时检查拼写'}]},
  {title:'打字机模式',fields:[{key:'typewriterCenter',label:'始终保证光标在屏幕中间'}]},
 ]},
 {name:'图像',icon:'image',sections:[
  {title:'插入图片时',fields:[{key:'imageStorage',label:'存储位置',options:[['embed','嵌入文档'],['assets','复制到当前文档的 assets 文件夹']]}]},
  {title:'图片语法偏好',fields:[{key:'imageDotSlash',label:'为相对路径添加 ./'},{key:'escapeImageURL',label:'插入时自动转义图片 URL'}]},
 ]},
 {name:'Markdown',icon:'file-code',sections:[
  {title:'Markdown 语法偏好',fields:[{key:'headingStyle',label:'标题样式',options:[['atx','atx (#)'],['setext','setext (=== / ---)']]},{key:'bullet',label:'无序列表',options:[['-','-'],['*','*'],['+','+']]},{key:'orderedIncrement',label:'有序列表使用递增序号'},{key:'emphasis',label:'强调符号',options:[['*','* / **'],['_','_ / __']]}]},
  {title:'代码块',fields:[{key:'codeLineNumbers',label:'显示行号'},{key:'codeWrap',label:'代码块自动换行'},{key:'indentSize',label:'代码缩进',options:[[2,'2'],[4,'4'],[8,'8']]},{key:'codeLanguage',label:'默认代码块语言',type:'text'}]},
  {title:'源代码模式',fields:[{key:'sourceLineNumbers',label:'显示源码行号'},{key:'sourceWrap',label:'源码自动换行'}]},
 ]},
 {name:'导出',icon:'printer',sections:[
  {title:'HTML',fields:[{key:'exportStyles',label:'包含文档样式'},{key:'exportTitle',label:'包含文件标题'},{key:'exportWhitespace',label:'保留连续的空格与单个换行'}]},
  {title:'打印 / PDF',fields:[{key:'printPaper',label:'纸张',options:[['A4','A4'],['Letter','Letter']]},{key:'printMargin',label:'页边距（毫米）',type:'number',min:0,max:50}]},
 ]},
 {name:'外观',icon:'paintbrush',sections:[
  {title:'字体大小',fields:[{key:'fontFamily',label:'正文字体',options:[['theme','跟随主题'],['system','系统字体'],['serif','衬线字体'],['mono','等宽字体']]},{key:'fontSize',label:'字体大小',options:[[0,'跟随主题'],...Array.from({length:25},(_,i)=>i+12).map(n=>[n,`${n} px`] as const)]},{key:'lineHeight',label:'行距',options:[[0,'跟随主题'],[1.4,'1.4'],[1.6,'1.6'],[1.8,'1.8'],[2,'2'],[2.2,'2.2']]},{key:'documentWidth',label:'正文宽度',options:[[0,'跟随主题'],[600,'600 px'],[720,'720 px'],[800,'800 px'],[960,'960 px'],[1120,'1120 px']]}]},
  {title:'Zoom',fields:[{key:'zoom',label:'缩放',options:[60,80,90,100,110,125,150,175,200].map(n=>[n,`${n}%`] as const)},{key:'wheelZoom',label:'按住 Command 时使用鼠标滚轮缩放'}]},
  {title:'字数统计',fields:[{key:'showWordCount',label:'显示字数统计'}]},
  {title:'主题',fields:[{key:'theme',label:'当前主题',options:themeChoices},{key:'followSystem',label:'跟随系统深色模式'},{key:'lightTheme',label:'浅色主题',options:themeChoices},{key:'darkTheme',label:'深色主题',options:themeChoices}]},
 ]},
 {name:'通用',icon:'settings-2',sections:[{title:'隐私',fields:[{key:'privacyIdle',label:'闲置时自动遮蔽窗口'},{key:'privacySeconds',label:'闲置时间（秒）',type:'number',min:1,max:86400},{key:'privacyStyle',label:'遮蔽效果',options:[['blur','模糊'],['solid','纯色']]}]}]},
];
let active='文件',query='';
const root=document.querySelector<HTMLElement>('#settings-app')!;
root.innerHTML='<header data-tauri-drag-region><span data-tauri-drag-region>偏好设置</span></header><aside><input type="search" aria-label="查找设置" placeholder="查找…"><nav aria-label="设置分类"></nav></aside><main id="settings-content"></main><div id="settings-error" role="alert" hidden></div>';
const nav=root.querySelector('nav')!,content=root.querySelector<HTMLElement>('main')!;
for(const c of categories){const b=document.createElement('button');b.textContent=c.name;b.dataset.category=c.name;const icon=document.createElement('span');icon.className='category-icon';icon.innerHTML=`<i data-lucide="${c.icon}"></i>`;icon.setAttribute('aria-hidden','true');b.prepend(icon);b.addEventListener('click',()=>{active=c.name;query='';(root.querySelector('input[type=search]') as HTMLInputElement).value='';render();content.scrollTop=0;});nav.append(b);}
createIcons({icons:{FileText,Pencil,Image,FileCode,Printer,Paintbrush,Settings2},attrs:{'stroke-width':1.7}});
async function commit(patch:Partial<Preferences>){try{await savePreferences(patch);document.querySelector<HTMLElement>('#settings-error')!.hidden=true;}catch(e){const error=document.querySelector<HTMLElement>('#settings-error')!;error.hidden=false;error.textContent=`设置保存失败：${e}`;}}
function fieldControl(field:Field){
 const row=document.createElement('label');row.className='setting-row';const label=document.createElement('span');label.textContent=field.label;
 let input:HTMLInputElement|HTMLSelectElement;
 if(field.options){input=document.createElement('select');for(const [value,name]of field.options){const option=document.createElement('option');option.value=String(value);option.textContent=name;input.append(option);}input.value=String(preferences[field.key]);}
 else{input=document.createElement('input');input.type=field.type||'checkbox';if(input.type==='checkbox'){input.checked=Boolean(preferences[field.key]);row.classList.add('checkbox-row');}else{input.value=String(preferences[field.key]);if(field.min!==undefined)input.min=String(field.min);if(field.max!==undefined)input.max=String(field.max);if(field.step)input.step=String(field.step);}}
 input.id=`pref-${field.key}`;input.dataset.key=field.key;input.setAttribute('aria-label',field.label);
 input.addEventListener('change',()=>{let value:unknown=input instanceof HTMLInputElement&&input.type==='checkbox'?input.checked:typeof defaults[field.key]==='number'?Number(input.value):input.value;const checked=normalize({...preferences,[field.key]:value});if(checked[field.key]!==value){input.value=String(preferences[field.key]);return;}void commit({[field.key]:value});});
 if(input instanceof HTMLInputElement&&input.type==='checkbox')row.append(input,label);else row.append(label,input);return row;
}
function render(){
 for(const b of nav.querySelectorAll('button'))b.setAttribute('aria-selected',String(b.dataset.category===active&&!query));
 content.replaceChildren();let count=0;
 for(const category of categories){if(!query&&category.name!==active)continue;
  for(const section of category.sections){const fields=section.fields.filter(f=>!query||`${category.name}${section.title}${f.label}`.toLowerCase().includes(query));if(!fields.length)continue;count+=fields.length;const group=document.createElement('section'),heading=document.createElement('h2');heading.textContent=section.title;group.append(heading,...fields.map(fieldControl));content.append(group);}
 }
 if(!query&&active==='通用'){
  const group=document.createElement('section');group.innerHTML='<h2>设置</h2><div class="settings-actions"><button id="export-settings">导出设置…</button><button id="import-settings">导入设置…</button><button id="reset-settings">恢复默认设置</button></div><h2>快捷键</h2><div class="shortcuts">⌘ ,　偏好设置<br>⌘ 1–6　标题<br>⌘ B / I　加粗 / 斜体<br>⌘ F　查找<br>F8 / F9　专注 / 打字机模式<br>⇧⌘P　遮蔽 / 显示窗口</div><footer>Mori 0.1.0</footer>';content.append(group);
  group.querySelector('#reset-settings')!.addEventListener('click',()=>void commit({...defaults}));
  group.querySelector('#export-settings')!.addEventListener('click',async()=>{const data=JSON.stringify(preferences,null,2);if(isTauri())await invoke('export_document',{content:data,extension:'json'});else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));a.download='Mori-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}});
  group.querySelector('#import-settings')!.addEventListener('click',()=>{const picker=document.createElement('input');picker.type='file';picker.accept='.json';picker.onchange=async()=>{try{const file=picker.files?.[0];if(!file)return;if(file.size>16384)throw Error('文件过大');const value=JSON.parse(await file.text());if(!value||typeof value!=='object'||Array.isArray(value))throw Error('格式不正确');await commit(normalize(value));}catch(e){const error=document.querySelector<HTMLElement>('#settings-error')!;error.hidden=false;error.textContent=`导入失败：${e}`;}};picker.click();});
 }
 if(query&&!count){const empty=document.createElement('p');empty.className='no-results';empty.textContent='无匹配设置';content.append(empty);}
 const dark=preferences.followSystem?matchMedia('(prefers-color-scheme:dark)').matches:['night','lapis-dark'].includes(preferences.theme);document.documentElement.dataset.dark=String(dark);
}
root.querySelector('input[type=search]')!.addEventListener('input',event=>{query=(event.target as HTMLInputElement).value.trim().toLowerCase();render();});
onPreferences(()=>{const focus=document.activeElement as HTMLInputElement;const selection=focus?.dataset.key;const start=focus?.selectionStart;render();if(selection){const next=document.querySelector<HTMLInputElement>(`#pref-${selection}`);next?.focus();if(start!==null&&next?.type==='text')next.setSelectionRange(start,start);}});
matchMedia('(prefers-color-scheme:dark)').addEventListener('change',render);render();
