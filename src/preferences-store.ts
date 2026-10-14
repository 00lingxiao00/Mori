import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
export const themeChoices = [['github','Github'],['gothic','Gothic'],['newsprint','Newsprint'],['night','Night'],['pixyll','Pixyll'],['whitey','Whitey'],['lapis','Lapis'],['lapis-dark','Lapis Dark']] as const;
export const defaults = {
  autosave: true, autosaveDelay: 1500, recovery: true, extension: 'md', startupMode: 'rich', outlineFold: true,
  pairBrackets: true, pairMarkdown: false, spellcheck: false, copyMarkdown: false, typewriterCenter: true,
  privacyIdle: false, privacySeconds: 30, privacyStyle: 'blur',
  imageStorage: 'embed', imageDotSlash: true, escapeImageURL: true,
  bullet: '-', orderedIncrement: true, headingStyle: 'atx', emphasis: '*', codeLineNumbers: true, codeWrap: true, sourceLineNumbers: true, sourceWrap: true, indentSize: 2, codeLanguage: '',
  exportStyles: true, exportTitle: false, exportWhitespace: true, printPaper: 'A4', printMargin: 20,
  theme: 'github', followSystem: false, lightTheme: 'github', darkTheme: 'night', fontFamily: 'theme', fontSize: 0, lineHeight: 0, documentWidth: 0, zoom: 100, wheelZoom: false, showWordCount: true,
};
export type Preferences = typeof defaults;
const options: Partial<Record<keyof Preferences, readonly (string|number)[]>> = {
  privacyStyle:['blur','solid'], extension:['md','markdown','txt'], startupMode:['rich','source'], imageStorage:['embed','assets'], bullet:['-','*','+'], headingStyle:['atx','setext'], emphasis:['*','_'], printPaper:['A4','Letter'], fontFamily:['theme','system','serif','mono'],
  theme:themeChoices.map(t=>t[0]),lightTheme:themeChoices.map(t=>t[0]),darkTheme:themeChoices.map(t=>t[0]),indentSize:[2,4,8],
};
const ranges: Partial<Record<keyof Preferences,[number,number]>> = {privacySeconds:[1,86400],autosaveDelay:[500,30000],fontSize:[0,36],lineHeight:[0,3],documentWidth:[0,1400],zoom:[60,200],printMargin:[0,50]};
export function normalize(value: unknown): Preferences {
  const result={...defaults}; if (!value || typeof value!=='object' || Array.isArray(value)) return result;
  for (const key of Object.keys(defaults) as (keyof Preferences)[]) {
    const v=(value as Record<string,unknown>)[key];
    if (typeof v!==typeof defaults[key]) continue;
    if (typeof v==='number' && !Number.isFinite(v)) continue;
    if (options[key] && !options[key]!.includes(v as string|number)) continue;
    const range=ranges[key]; if(range && (Number(v)<range[0] || Number(v)>range[1]))continue;
    if(key==='fontSize' && Number(v)>0 && Number(v)<12)continue;
    if(key==='lineHeight' && Number(v)>0 && Number(v)<1.2)continue;
    if(key==='documentWidth' && Number(v)>0 && Number(v)<480)continue;
    if(key==='codeLanguage' && !/^[\w+#.-]{0,30}$/.test(String(v)))continue;
    Object.assign(result,{[key]:v});
  }
  return result;
}
const desktop=isTauri();
let initial: unknown;
try { initial=JSON.parse(localStorage.getItem('mori-preferences')||'null'); } catch { initial=null; }
if (!initial) initial={...defaults,theme:localStorage.getItem('mori-theme')||'github',autosave:localStorage.getItem('mori-autosave')!=='false'};
if(desktop) { try { const stored=await invoke('read_preferences'); if(stored)initial=stored;else initial=await invoke('write_preferences',{patch:normalize(initial)}); } catch { /* Keep local settings if the native file is unavailable. */ } }
export let preferences=normalize(initial);
const listeners=new Set<(value:Preferences)=>void>();
function receive(value:unknown, persist=true) {
  preferences=normalize(value);if(persist)localStorage.setItem('mori-preferences',JSON.stringify(preferences));
  for(const listener of listeners)listener(preferences);
}
export function onPreferences(listener:(value:Preferences)=>void) {listeners.add(listener);return ()=>listeners.delete(listener);}
let queue=Promise.resolve();
export function savePreferences(patch:Partial<Preferences>):Promise<void> {
  receive({...preferences,...patch});
  if(!desktop)return Promise.resolve();
  const work=queue.catch(()=>{}).then(async()=>{receive(await invoke('write_preferences',{patch}));});queue=work;return work;
}
if(desktop)await listen<Preferences>('preferences-changed',event=>receive(event.payload));
else window.addEventListener('storage',event=>{if(event.key==='mori-preferences'&&event.newValue){try{receive(JSON.parse(event.newValue),false);}catch{/* Ignore malformed external storage. */}}});
