import { FolderSidebar } from './folders';
import { togglePrivacy, isConcealed } from './privacy';
import { codeBlockConfig } from '@milkdown/kit/component/code-block';
import { preferences, savePreferences, onPreferences } from './preferences-store';
import { typingPreferences } from './editor-preferences';
import { tableBlockView } from '@milkdown/kit/component/table-block';
import { textTableView } from './table-selection';
import { focusWriting } from './focus';
import { editAction, sourceAction } from './editor-actions';
import { Slice, DOMSerializer } from '@milkdown/kit/prose/model';
import { TextSelection, EditorState as ProseMirrorState } from '@milkdown/kit/prose/state';
import { Crepe } from '@milkdown/crepe';
import { editorViewCtx, serializerCtx, parserCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import { closeHistory } from '@milkdown/kit/prose/history';
import { undoCommand, redoCommand } from '@milkdown/kit/plugin/history';
import { undo as sourceUndo, redo as sourceRedo } from '@codemirror/commands';
import { footnoteReferenceSchema } from '@milkdown/kit/preset/gfm';
import { configureInlineHTML, safeInlineHTML, kbd, highlight, underline } from './inline-html';
import { footnoteLayout, footnoteNavigation } from './footnotes';
import { callCommand, replaceAll } from '@milkdown/kit/utils';
import { EditorView, basicSetup } from 'codemirror';
import { markdown as markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting } from '@codemirror/language';
import { classHighlighter } from '@lezer/highlight';
import { indentUnit } from '@codemirror/language';
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { createIcons, PanelLeft, Code2, Ellipsis, X } from 'lucide';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './style.css';

const desktop = isTauri();
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
let text = '';
let path: string | null = null;
let saved = '';
let source = false;
let typewriter = false;
let alwaysOnTop = false;
let zoom = preferences.zoom / 100;
let dirty = false;
let deferredRecovery = !preferences.recovery;
let recoveryPending = true;
let loading = false;
let busy = false;
let saving = false;
let openingFolderFile = false;
let ready = false;
let richBaseline = '';
let richTouched = false;
let switching = false;
let autosave = preferences.autosave;
const themes = ['Github', 'Gothic', 'Newsprint', 'Night', 'Pixyll', 'Whitey', 'Lapis', 'Lapis Dark'];
const themeIDs = themes.map(name => name.toLowerCase().replace(' ', '-'));
let theme = preferences.theme;
if (theme === 'light') theme = 'github';
if (theme === 'dark') theme = 'night';
if (!themeIDs.includes(theme)) theme = 'github';
const themeSheet = document.createElement('link'); themeSheet.rel = 'stylesheet'; document.head.append(themeSheet);
let menuTimer: ReturnType<typeof setTimeout> | undefined;
let lastMenuState = '';
let draftTimer: ReturnType<typeof setTimeout>;
let autoTimer: ReturnType<typeof setTimeout>;
let draftQueue: Promise<unknown> = Promise.resolve();
const cmTheme = new Compartment();
const editingPreferences = new Compartment();
let codeBaseExtensions: Extension[] = [];
const collapsedHeadings = new Set<number>();
let cm: EditorView | null = null;

document.body.classList.add('sidebar-hidden');
$('#app').innerHTML = `
<header class="titlebar" data-tauri-drag-region><div class="title-center" data-tauri-drag-region><span id="document-title">未命名.md</span><span id="dirty-dot" hidden>●</span></div></header>
<div class="workspace"><aside class="sidebar"><div class="sidebar-tabs" role="tablist" aria-label="侧边栏"><button data-sidebar-view="files" role="tab" aria-selected="false">文件</button><button data-sidebar-view="outline" role="tab" aria-selected="true">大纲</button></div><div id="files-panel" hidden><div class="folder-header"><span id="folder-name"></span><button id="refresh-folder" aria-label="刷新文件夹" title="刷新">↻</button></div><nav id="file-tree" aria-label="文件夹文件"></nav></div><nav id="outline" aria-label="大纲"></nav></aside>
<main class="main"><div id="scroll-area" class="scroll-area"><div id="editor"></div><div id="source-editor" hidden></div></div></main></div>
<div class="corner-controls"><button class="icon-button" data-action="sidebar" title="大纲" aria-label="大纲"><i data-lucide="panel-left"></i></button><button class="icon-button" id="source-mode" data-action="source" title="源码 ⌘/" aria-label="源码"><i data-lucide="code-2"></i></button><button class="icon-button" data-action="menu" title="菜单" aria-label="菜单" aria-expanded="false"><i data-lucide="ellipsis"></i></button></div>
<span id="word-count"></span>
<div id="menu" class="popup-menu" hidden><button data-action="new">新建<span>⌘N</span></button><button data-action="open">打开…<span>⌘O</span></button><button data-action="open-folder">打开文件夹…<span>⇧⌘O</span></button><button data-action="save">保存<span>⌘S</span></button><button data-action="save-as">另存为…<span>⇧⌘S</span></button><hr><button data-action="theme">主题<span>›</span></button><button data-action="focus">专注模式<span>F8</span></button><button data-action="autosave" id="autosave-toggle">自动保存<span id="autosave-state"></span></button><hr><div class="font-size-control"><button data-action="font-down" aria-label="减小字号" title="减小字号">A−</button><select id="font-size" aria-label="字号"><option value="0">主题字号</option>${Array.from({length:25},(_,i)=>`<option value="${i+12}">${i+12} px</option>`).join('')}</select><button data-action="font-up" aria-label="增大字号" title="增大字号">A+</button></div><hr><button data-action="privacy">遮蔽窗口<span>⇧⌘P</span></button><button data-action="preferences">设置…<span>⌘,</span></button></div>
<div id="themes" class="popup-menu" hidden>${themes.map((name,i) => `<button data-action="theme:${themeIDs[i]}">${name}<span class="theme-check"></span></button>`).join('')}</div>
<div id="toast" role="status" hidden></div>
<dialog id="dialog"><form method="dialog"><button class="dialog-close icon-button" value="cancel" aria-label="关闭"><i data-lucide="x"></i></button><h2 id="dialog-title"></h2><div id="dialog-body"></div><div id="dialog-actions"></div></form></dialog>`;
const folders = new FolderSidebar(async load => {
  if (!ready || busy || saving || recoveryPending || isConcealed()) return;
  busy=true;openingFolderFile=true;clearTimeout(autoTimer);try { if (!await guardChanges()) return; const doc=await load(); await clearDraft().catch(e=>notify(`恢复草稿清理失败：${e}`,true)); await setDocument(doc.markdown,doc.path); } catch(e) { notify(String(e),true); } finally { busy=false;openingFolderFile=false;if(autosave&&path&&dirty){clearTimeout(autoTimer);autoTimer=setTimeout(()=>void saveDocument(false,true),preferences.autosaveDelay);} }
},message=>notify(message,true));
const findBar = document.createElement('div'); findBar.id = 'find-bar'; findBar.hidden = true;
findBar.innerHTML = `<input id="find-query" aria-label="查找" placeholder="查找"><span id="find-count"></span><button data-find="prev" title="上一个">↑</button><button data-find="next" title="下一个">↓</button><button data-find="close" title="关闭">×</button><div id="replace-row" hidden><input id="replace-query" aria-label="替换为" placeholder="替换为"><button data-find="replace">替换</button><button data-find="all">全部替换</button></div>`;
$('.main').prepend(findBar);
const icons = { PanelLeft, Code2, Ellipsis, X };
function refreshIcons() { createIcons({ icons, attrs: { 'stroke-width': 1.6 } }); }
function filename() { return path?.split('/').pop() || `未命名.${preferences.extension}`; }
function notify(message: string, error = false) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.toggle('error', error); toast.hidden = false;
  window.setTimeout(() => { if (toast.textContent === message) toast.hidden = true; }, error ? 7000 : 3000);
}
function showDialog(title: string, body: string, buttons: {value: string; label: string; primary?: boolean}[]): Promise<string> {
  const dialog = $<HTMLDialogElement>('#dialog'); $('#dialog-title').textContent = title;
  $('#dialog-body').textContent = body;
  const actions = $('#dialog-actions'); actions.replaceChildren();
  for (const b of buttons) { const el = document.createElement('button'); el.value = b.value; el.textContent = b.label; if (b.primary) el.className = 'primary'; actions.append(el); }
  return new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue || 'cancel'), { once: true }); dialog.showModal(); });
}
function headings() {
  // Derive from the parsed document so fenced code never becomes a false heading.
  if (source) {
    const result: {level: number; title: string; offset: number}[] = [];
    let fenced = ''; let offset = 0;
    for (const line of text.split('\n')) {
      const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (fence) { if (!fenced) fenced = fence[1][0]; else if (fenced === fence[1][0]) fenced = ''; }
      else if (!fenced) { const m = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/); if (m) result.push({level: m[1].length, title: m[2], offset}); }
      offset += line.length + 1;
    }
    return result;
  }
  return [...document.querySelectorAll<HTMLElement>('#editor .ProseMirror h1, #editor .ProseMirror h2, #editor .ProseMirror h3, #editor .ProseMirror h4, #editor .ProseMirror h5, #editor .ProseMirror h6')].map((h, i) => ({level: +h.tagName[1], title: h.textContent || '未命名标题', offset: i}));
}
function renderOutline() {
  const entries = headings(); const outline = $('#outline'); outline.replaceChildren();
  $('#outline').dataset.count = String(entries.length);
  let foldedLevel: number | null = null;
  entries.forEach((h, i) => {
    if (preferences.outlineFold && foldedLevel !== null && h.level > foldedLevel) return;
    foldedLevel = null;
    if (preferences.outlineFold && collapsedHeadings.has(i)) foldedLevel = h.level;
    const b = document.createElement('button'); b.className = 'outline-item'; b.style.paddingLeft = `${18 + (h.level - 1) * 12}px`; b.textContent = h.title; b.title = h.title;
    b.addEventListener('click', () => {
      outline.querySelector('.active')?.classList.remove('active'); b.classList.add('active');
      if (source && cm) { cm.dispatch({selection: {anchor: h.offset}, scrollIntoView: true}); cm.focus(); }
      else {
        const heading = document.querySelectorAll<HTMLElement>('#editor .ProseMirror h1, #editor .ProseMirror h2, #editor .ProseMirror h3, #editor .ProseMirror h4, #editor .ProseMirror h5, #editor .ProseMirror h6')[i];
        if (heading) {
          const area = $('#scroll-area');
          // Scroll only the document pane; never move the window horizontally.
          area.scrollTo({top: area.scrollTop + heading.getBoundingClientRect().top - area.getBoundingClientRect().top - 25, left: 0, behavior: 'smooth'});
        }
      }
    });
    const row = document.createElement('div'); row.className = 'outline-row';
    if (preferences.outlineFold && entries[i+1]?.level > h.level) {
      const fold = document.createElement('button'); fold.className = 'outline-fold'; fold.textContent = '▾'; fold.setAttribute('aria-label', `折叠／展开 ${h.title}`); fold.setAttribute('aria-expanded', String(!collapsedHeadings.has(i)));
      fold.addEventListener('click', () => { if(collapsedHeadings.has(i))collapsedHeadings.delete(i);else collapsedHeadings.add(i);renderOutline(); }); row.append(fold);
    } else if(preferences.outlineFold) { const spacer=document.createElement('span');spacer.className='outline-fold-spacer';row.append(spacer); }
    row.append(b); outline.append(row);
  });

}
function updateUI() {
  dirty = text !== saved;
  $('#document-title').textContent = filename();
  $('#dirty-dot').hidden = !dirty;
  const cjk = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const words = text.replace(/[\u3400-\u9fff]/g, ' ').match(/[\p{L}\p{N}]+/gu)?.length || 0;
  const count = cjk + words;
  $('#word-count').textContent = count ? `${count.toLocaleString()} 字` : '';
  $('#autosave-state').textContent = autosave ? '✓' : '';
  $('#source-mode').classList.toggle('active', source);
  document.title = `${dirty ? '● ' : ''}${$('#document-title').textContent} — Mori`;
  if (desktop) void getCurrentWindow().setTitle(document.title).catch(() => {});
  renderOutline();
  folders.setActive(path);
  scheduleMenuSync();
}
function enqueueDraft() {
  const markdown = text, name = filename();
  draftQueue = draftQueue.catch(() => {}).then(async () => { const result = desktop ? await invoke('write_draft', {markdown, name}) : localStorage.setItem('mori-draft', JSON.stringify({markdown, name})); deferredRecovery = false; return result; });
  return draftQueue;
}
async function clearDraft() {
  clearTimeout(draftTimer); await draftQueue.catch(() => {});
  if (deferredRecovery) return;
  if (desktop) await invoke('clear_draft'); else localStorage.removeItem('mori-draft');
}
function changed(value: string) {
  if (loading || !ready || text === value) return;
  text = value; updateUI();
  clearTimeout(draftTimer); draftTimer = setTimeout(() => { if (dirty && preferences.recovery) void enqueueDraft().catch(e => notify(`恢复草稿保存失败：${e}`, true)); }, 450);
  clearTimeout(autoTimer);
  if (autosave && path) autoTimer = setTimeout(() => void saveDocument(false, true), preferences.autosaveDelay);
}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.dark = String(theme === 'night' || theme === 'lapis-dark');
  localStorage.setItem('mori-theme', theme);
  themeSheet.href = `/themes/${theme}.css`;
  scheduleMenuSync();
  for (const b of document.querySelectorAll<HTMLElement>('#themes button')) {
    b.setAttribute('aria-pressed', String(b.dataset.action === `theme:${theme}`));
    b.querySelector('.theme-check')!.textContent = b.dataset.action === `theme:${theme}` ? '✓' : '';
  }
}
async function upload(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error('图片请小于 10 MB');
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  const data = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('图片读取失败')); r.readAsDataURL(file); });
  if (desktop && path && preferences.imageStorage === 'assets') return invoke<string>('store_image', {data:data.slice(data.indexOf(',')+1)});
  return data;
}
const crepe = new Crepe({
  root: '#editor', defaultValue: text,
  features: { [Crepe.Feature.AI]: false, [Crepe.Feature.TopBar]: false, [Crepe.Feature.Placeholder]: false, [Crepe.Feature.Toolbar]: false },
  featureConfigs: {
    [Crepe.Feature.BlockEdit]: { blockHandle: { shouldShow: () => false } },
    [Crepe.Feature.CodeMirror]: { extensions: [editingPreferences.of(codeExtensions(false))], theme: syntaxHighlighting(classHighlighter), previewOnlyByDefault: true, previewToggleText: only => only ? '编辑公式' : '收起源码' },
    [Crepe.Feature.ImageBlock]: { onUpload: upload, inlineOnUpload: upload, blockOnUpload: upload, blockUploadPlaceholderText: '粘贴图片地址，或上传图片', blockCaptionPlaceholderText: '添加图片说明', inlineUploadPlaceholderText: '图片地址', proxyDomURL: async url => {
      if (/^(https?:|data:|blob:)/i.test(url) || !desktop || !path) return url;
      try { return await invoke<string>('read_image', {relative: url}); } catch { return url; }
    } },
  },
});
crepe.editor.config(ctx => {
  configureInlineHTML(ctx);
  ctx.update(footnoteReferenceSchema.key, original => context => ({...original(context), selectable: false}));
}).use(kbd).use(highlight).use(underline).use(safeInlineHTML).use(footnoteLayout).use(footnoteNavigation).use(focusWriting).use(typingPreferences);
crepe.on(listener => listener.markdownUpdated((_ctx, value) => {
  if (!source && richTouched && value !== richBaseline && value === crepe.getMarkdown()) { richBaseline = value; changed(value); }
}));
await crepe.editor.remove(tableBlockView);
crepe.editor.use(textTableView);
await crepe.create();
codeBaseExtensions=crepe.editor.action(ctx=>ctx.get(codeBlockConfig.key).extensions.slice(0,-1));
richBaseline = crepe.getMarkdown();
ready = true;
applyPreferences(); updateUI(); refreshIcons();
onPreferences(() => applyPreferences());
if (preferences.startupMode === 'source') await setMode(true);

function syncText() {
  if (!source && !loading && richTouched) {
    const current = crepe.getMarkdown();
    if (current !== richBaseline) { richBaseline = current; changed(current); }
  }
}
function closeRichHistory() { crepe.editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(closeHistory(view.state.tr)); }); }
async function setDocument(value: string, nextPath: string | null, baseline?: string) {
  clearTimeout(autoTimer); clearTimeout(draftTimer); loading = true;
  collapsedHeadings.clear();
  path = nextPath; text = value; saved = baseline ?? value; richTouched = false;
  crepe.editor.action(replaceAll(value));
  crepe.editor.action(ctx=>{const view=ctx.get(editorViewCtx);view.updateState(ProseMirrorState.create({schema:view.state.schema,doc:view.state.doc,plugins:view.state.plugins}));});
  closeRichHistory();
  richBaseline = crepe.getMarkdown();
  if (cm) cm.setState(sourceState(value));
  // Preserve untouched source bytes until an actual editor transaction changes them.
  loading = false; updateUI(); $('#scroll-area').scrollTop = 0;
}
function sourceState(value:string) { return EditorState.create({doc:value,extensions:[basicSetup, markdownLanguage({codeLanguages: languages}), editingPreferences.of(codeExtensions(true)), cmTheme.of(syntaxHighlighting(classHighlighter)), EditorView.updateListener.of(update => { if (update.docChanged && source) changed(update.state.doc.toString()); })]}); }
async function setMode(next: boolean) {
  if (next === source || busy || switching) return;
  syncText(); switching = true; loading = true;
  if (next) {
    source = true; $('#editor').hidden = true; $('#source-editor').hidden = false;
    if (!cm) cm = new EditorView({ parent: $('#source-editor'), state: sourceState(text) });
    else cm.dispatch({changes: {from: 0, to: cm.state.doc.length, insert: text}});
  } else {
    source = false; richTouched = false; crepe.editor.action(replaceAll(text)); closeRichHistory(); richBaseline = crepe.getMarkdown(); $('#source-editor').hidden = true; $('#editor').hidden = false;
  }

  loading = false; switching = false; updateUI();
  if (next) cm?.focus();
}
async function saveDocument(saveAs = false, automatic = false): Promise<boolean> {
  syncText();
  if (saving || (automatic && openingFolderFile)) return false;
  if (!desktop) { if (!automatic) download(); return false; }
  saving = true; updateUI(); const snapshot = text;
  try {
    const result = await invoke<string | null>('save_document', {markdown: snapshot, saveAs});
    if (!result) return false;
    if (path !== result) void folders.refresh();
    path = result; saved = snapshot;
    if (text === snapshot) await clearDraft(); else { if(preferences.recovery) await enqueueDraft(); if (autosave) { clearTimeout(autoTimer); autoTimer = setTimeout(() => void saveDocument(false, true), preferences.autosaveDelay); } }
    return true;
  } catch (e) { clearTimeout(autoTimer); notify(`保存失败：${e}`, true); return false; }
  finally { saving = false; updateUI(); }
}
async function guardChanges() {
  syncText();
  if (saving) { notify('正在保存，请稍候'); return false; }
  if (!dirty) return true;
  const answer = await showDialog('保存更改？', filename(), [{value: 'cancel', label: '取消'}, {value: 'discard', label: '不保存'}, {value: 'save', label: '保存', primary: true}]);
  if (answer === 'save') return await saveDocument();
  return answer === 'discard';
}
function download() {
  syncText();
  const blob = new Blob([text], {type: 'text/markdown;charset=utf-8'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename(); a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function runAction(action: string) {
  if (action === 'privacy') { togglePrivacy(); return; }
  if (isConcealed() || !ready || busy || recoveryPending) return;
  if (action !== 'menu') { $('#menu').hidden = true; $('[data-action="menu"]').setAttribute('aria-expanded', 'false'); }
  if (action.startsWith('theme:')) { const id = action.slice(6); if (themeIDs.includes(id)) { await savePreferences({theme:id, followSystem:false}).catch(e=>notify(String(e),true)); } $('#themes').hidden = true; return; }
  if (['new', 'open', 'quit', 'close'].includes(action)) {
    busy = true;
    try {
      if (!await guardChanges()) return;
      if (action === 'new') { if (desktop) await invoke('reset_document'); await clearDraft(); await setDocument('', null); }
      if (action === 'open') {
        if (desktop) { const doc = await invoke<{path: string; markdown: string} | null>('open_document'); if (doc) { await clearDraft(); await setDocument(doc.markdown, doc.path); } }
        else { const input = document.createElement('input'); input.type = 'file'; input.accept = '.md,.markdown,.txt'; input.onchange = async () => { const file = input.files?.[0]; if (file) { await clearDraft(); await setDocument(await file.text(), null); saved = text; updateUI(); } }; input.click(); }
      }
      if ((action === 'quit' || action === 'close') && desktop) { await clearDraft(); await invoke('quit_app'); }
    } catch(e) { notify(String(e), true); } finally { busy = false; }
    return;
  }
  if (action.startsWith('edit:')) {
    richTouched = true;
    if (source && cm) sourceAction(cm, action.slice(5)); else { editAction(crepe.editor, action.slice(5)); if (action === 'edit:code-block' && preferences.codeLanguage) crepe.editor.action(ctx=>{const view=ctx.get(editorViewCtx),pos=view.state.selection.$from;for(let d=pos.depth;d>0;d--)if(pos.node(d).type.name==='code_block'){view.dispatch(view.state.tr.setNodeMarkup(pos.before(d),undefined,{...pos.node(d).attrs,language:preferences.codeLanguage}));break;}}); }
    syncText(); scheduleMenuSync(); return;
  }
  if (await extraAction(action)) { scheduleMenuSync(); return; }
  switch (action) {
    case 'undo': if (source && cm) sourceUndo(cm); else { richTouched = true; crepe.editor.action(callCommand(undoCommand.key)); syncText(); } break;
    case 'redo': if (source && cm) sourceRedo(cm); else { richTouched = true; crepe.editor.action(callCommand(redoCommand.key)); syncText(); } break;
    case 'save': await saveDocument(); break;
    case 'save-as': await saveDocument(true); break;
    case 'source': await setMode(!source); break;
    case 'rich': await setMode(false); break;
    case 'open-folder': await folders.open(); break;
    case 'sidebar': document.body.classList.toggle('sidebar-hidden'); break;
    case 'focus': document.body.classList.toggle('focus-mode'); crepe.editor.action(ctx=>{const view=ctx.get(editorViewCtx);view.dispatch(view.state.tr);}); break;
    case 'menu': $('#themes').hidden = true; $('#menu').hidden = !$('#menu').hidden; $('[data-action="menu"]').setAttribute('aria-expanded', String(!$('#menu').hidden)); break;
    case 'theme': $('#themes').hidden = false; break;
    case 'autosave': await savePreferences({autosave:!autosave}).catch(e=>notify(String(e),true)); break;
    case 'export': syncText(); if (desktop) await invoke('export_document', {content:text, extension:'md'}).catch(e=>notify(String(e),true)); else download(); break;

  }
  scheduleMenuSync();
}
for (const eventName of ['beforeinput', 'keydown', 'paste', 'cut', 'drop', 'pointerdown']) {
  document.addEventListener(eventName, e => {
    if (!loading && !source && (e.target as HTMLElement).closest('.milkdown')) richTouched = true;
  }, true);
}
document.addEventListener('click', e => {
  const target = e.target as HTMLElement;
  const button = target.closest<HTMLElement>('[data-action]');
  if (button) void runAction(button.dataset.action!);
  else if (!target.closest('.popup-menu')) { $('#menu').hidden = true; $('#themes').hidden = true; $('[data-action="menu"]').setAttribute('aria-expanded', 'false'); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#menu').hidden = true; $('#themes').hidden = true; } });
document.addEventListener('keydown', e => {
  if (desktop || !(e.metaKey || e.ctrlKey) || e.isComposing || (e.target as HTMLElement).closest('dialog,#find-bar')) return;
  let action = ''; const k = e.key.toLowerCase();
  if (e.altKey) { action = ({f:'replace', c:'edit:code-block', b:'edit:math-block', t:'edit:table-insert', q:'edit:quote', o:'edit:ordered', u:'edit:bullet', x:'edit:task', r:'edit:footnote'} as Record<string,string>)[k] || ''; }
  else if (e.shiftKey) action = ({g:'find-prev', x:'edit:strike', h:'edit:highlight', l:'sidebar', '`':'edit:code', f:'focus'} as Record<string,string>)[k] || '';
  else action = ({b:'edit:bold', i:'edit:italic', u:'edit:underline', k:'insert-link', f:'find', g:'find-next', '0':'edit:paragraph'} as Record<string,string>)[k] || (/^[1-6]$/.test(k) ? `edit:heading:${k}` : '');
  if (action) { e.preventDefault(); e.stopImmediatePropagation(); void runAction(action); }
}, true);
document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.isComposing) return;
  // Native menu accelerators deliver these actions in the desktop build.
  const k = e.key.toLowerCase();
  if (!desktop && k === ',') { e.preventDefault(); void runAction('preferences'); }
  if (!desktop && ['n','o','s','/'].includes(k)) { e.preventDefault(); void runAction(k === 'n' ? 'new' : k === 'o' ? (e.shiftKey ? 'open-folder' : 'open') : k === '/' ? 'source' : e.shiftKey ? 'save-as' : 'save'); }
  if (!desktop && e.shiftKey && k === 'f') { e.preventDefault(); void runAction('focus'); }
});
window.addEventListener('beforeunload', e => { syncText(); if (dirty && !desktop) { e.preventDefault(); e.returnValue = ''; } });
if (desktop) {
  await listen<string>('menu-action', e => void runAction(e.payload));
  await getCurrentWindow().onCloseRequested(async e => {
    e.preventDefault(); if (busy || recoveryPending) return; busy = true;
    try { if (await guardChanges()) { await clearDraft(); await invoke('quit_app'); } } finally { busy = false; }
  });
}
try {
  const draft = !preferences.recovery ? null : desktop ? await invoke<{markdown: string; name: string} | null>('read_draft') : JSON.parse(localStorage.getItem('mori-draft') || 'null');
  if (draft) {
    recoveryPending = true; deferredRecovery = true;
    const answer = await showDialog('恢复草稿？', draft.name, [{value: 'discard', label: '舍弃草稿'}, {value: 'restore', label: '恢复文档', primary: true}]);
    if (answer === 'restore') { deferredRecovery=false; await setDocument(draft.markdown, null, ''); }
    else if (answer === 'discard') { deferredRecovery=false; await clearDraft(); }
    else deferredRecovery=true;
    recoveryPending = false;
  }
} catch(e) { recoveryPending = false; notify(`恢复草稿不可用：${e}`, true); }
recoveryPending = false;

function scheduleMenuSync() {
  if (!desktop || !ready) return;
  clearTimeout(menuTimer); menuTimer = setTimeout(() => {
    const checked: Record<string, boolean> = {source, autosave, focus: document.body.classList.contains('focus-mode'), sidebar: !document.body.classList.contains('sidebar-hidden'), typewriter, 'always-on-top': alwaysOnTop};
    for (const size of [0,12,14,16,18,20,22,24,28,32,36]) checked[`font:${size}`]=preferences.fontSize===size;
    for (const id of themeIDs) checked[`theme:${id}`] = id === theme;
    const enabled: Record<string, boolean> = {};
    let table = false, task = false;
    for (const a of ['bold','italic','underline','code','strike','highlight']) checked[`edit:${a}`] = false;
    if (!source) crepe.editor.action(ctx => {
      const {state} = ctx.get(editorViewCtx), {selection} = state;
      for (let d = selection.$from.depth; d > 0; d--) {
        const node = selection.$from.node(d);
        if (node.type.name === 'table') table = true;
        if (node.type.name === 'list_item' && node.attrs.checked !== null && node.attrs.checked !== undefined) task = true;
      }
      const marks = state.storedMarks || selection.$from.marks();
      for (const [action, name] of Object.entries({bold: 'strong', italic: 'emphasis', underline: 'u', code: 'inlineCode', strike: 'strike_through', highlight: 'mark'})) {
        const type = state.schema.marks[name];
        checked[`edit:${action}`] = !!type && (selection.empty ? marks.some(m => m.type === type) : state.doc.rangeHasMark(selection.from, selection.to, type));
      }
    });
    for (const a of ['row-before', 'row-after', 'col-before', 'col-after', 'row-delete', 'col-delete', 'table-delete']) enabled[`edit:${a}`] = table;
    for (const a of ['toggle','done','todo']) enabled[`edit:task:${a}`] = task || (source && !!cm && /^\s*[-*+] \[[ xX]\]/.test(cm.state.doc.lineAt(cm.state.selection.main.from).text));
    const snapshot = JSON.stringify({checked, enabled});
    if (snapshot !== lastMenuState) { lastMenuState = snapshot; void invoke('update_menu', {checked, enabled}).catch(() => { lastMenuState = ''; }); }
  }, 80);
}
document.addEventListener('selectionchange', () => {
  scheduleMenuSync();

});
function centerCaret() {
  if (!typewriter || !preferences.typewriterCenter) return;
  const pane = $('#scroll-area'), rect = pane.getBoundingClientRect();
  if (source && cm) {
    if (!cm.state.selection.main.empty) return;
    const coords = cm.coordsAtPos(cm.state.selection.main.head);
    if (coords) pane.scrollBy({top: coords.top - rect.top - rect.height / 2, behavior:'smooth'});
  } else crepe.editor.action(ctx=>{const view=ctx.get(editorViewCtx);if(view.state.selection.empty){const coords=view.coordsAtPos(view.state.selection.head);pane.scrollBy({top:coords.top-rect.top-rect.height/2,behavior:'smooth'});}});
}
document.addEventListener('keyup',e=>{if((e.target as HTMLElement).closest('.milkdown,#source-editor'))requestAnimationFrame(centerCaret);});
function focusEditor() { if (source) cm?.focus(); else crepe.editor.action(ctx => ctx.get(editorViewCtx).focus()); }
function currentSelectionText() {
  if (source && cm) return cm.state.sliceDoc(cm.state.selection.main.from, cm.state.selection.main.to);
  return crepe.editor.action(ctx => { const {state} = ctx.get(editorViewCtx); return state.doc.textBetween(state.selection.from, state.selection.to, '\n'); });
}
function insertMarkup(markdown: string) {
  richTouched = true;
  if (source && cm) { const {from,to} = cm.state.selection.main; cm.dispatch({changes: {from,to,insert: markdown}, selection: {anchor: from + markdown.length}}); cm.focus(); }
  else crepe.editor.action(ctx => { const view = ctx.get(editorViewCtx); const doc = ctx.get(parserCtx)(markdown); if (doc) view.dispatch(view.state.tr.replaceSelection(Slice.maxOpen(doc.content)).scrollIntoView()); view.focus(); });
  syncText();
}
async function promptValue(title: string, initial: string): Promise<string | null> {
  const dialog = document.createElement('dialog'); dialog.className = 'input-dialog';
  const form = document.createElement('form'); form.method = 'dialog';
  const label = document.createElement('label'); label.textContent = title;
  const input = document.createElement('input'); input.value = initial; input.setAttribute('aria-label', title); label.append(input);
  const actions = document.createElement('div'); actions.className = 'input-actions';
  const cancel = document.createElement('button'); cancel.value = 'cancel'; cancel.textContent = '取消';
  const ok = document.createElement('button'); ok.value = 'ok'; ok.textContent = '插入'; ok.className = 'primary';
  actions.append(cancel,ok); form.append(label,actions); dialog.append(form); document.body.append(dialog);
  return new Promise(resolve => { dialog.addEventListener('close', () => { const result = dialog.returnValue === 'ok' ? input.value.trim() : null; dialog.remove(); resolve(result); }, {once:true}); dialog.showModal(); input.focus(); input.select(); });
}
async function clipboardText(value?: string): Promise<string> {
  if (desktop) return invoke<string>('clipboard_text', {value: value ?? null});
  if (value !== undefined) { await navigator.clipboard.writeText(value); return value; }
  return navigator.clipboard.readText();
}
async function extraAction(action: string): Promise<boolean> {
  try {
    if (action === 'insert-link' || action === 'insert-image') {
      const selected = currentSelectionText();
      const url = await promptValue(action === 'insert-link' ? '链接地址' : '图片地址', 'https://');
      if (url) {
        if (!/^(https?:\/\/|mailto:|data:image\/)/i.test(url)) { notify('请输入有效地址', true); return true; }
        const label = (selected || (action === 'insert-link' ? url : '图片')).replace(/[\\[\]]/g, '\\$&');
        const target = action === 'insert-image' && preferences.escapeImageURL ? encodeURI(url).replace(/%25([0-9a-f]{2})/gi,'%$1') : url;
        insertMarkup(`${action === 'insert-image' ? '!' : ''}[${label}](<${target.replace(/[<>\r\n]/g,'')}>)`);
      }
    }
    else if (action === 'local-image') {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
      input.onchange = async () => { try { const file = input.files?.[0]; if (file) insertMarkup(`![${file.name.replace(/[\\[\]]/g,'')}](<${await upload(file)}>)`); } catch(e) { notify(String(e),true); } }; input.click();
    }
    else if (action === 'copy-markdown') {
      const markdown = source && cm ? currentSelectionText() : crepe.editor.action(ctx => { const {state} = ctx.get(editorViewCtx); return ctx.get(serializerCtx)(state.schema.topNodeType.create(null, state.selection.content().content)); });
      await clipboardText(markdown);
    }
    else if (action === 'paste-plain') {
      const value = await clipboardText(); richTouched = true;
      if (source && cm) { const {from,to} = cm.state.selection.main; cm.dispatch({changes: {from,to,insert:value}, selection: {anchor: from + value.length}}); }
      else crepe.editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr.insertText(value).scrollIntoView()); });
      focusEditor(); syncText();
    }
    else if (['find','replace','find-next','find-prev'].includes(action)) {
      if (action === 'find' || action === 'replace' || findBar.hidden) {
        findBar.hidden = false; $('#replace-row').hidden = action !== 'replace';
        const selection = currentSelectionText(); if (selection && !selection.includes('\n')) $<HTMLInputElement>('#find-query').value = selection;
        $<HTMLInputElement>('#find-query').focus(); $<HTMLInputElement>('#find-query').select();
      } else findMatch(action === 'find-prev' ? -1 : 1);
    }
    else if (action === 'typewriter') { typewriter = !typewriter; document.body.classList.toggle('typewriter-mode', typewriter); focusEditor(); requestAnimationFrame(centerCaret); }
    else if (action === 'outline') folders.showOutline();
    else if (action === 'always-on-top') { const next = !alwaysOnTop; if (desktop) await invoke('window_action', {action, value: next}); alwaysOnTop = next; }
    else if (action.startsWith('font:')) { const size=Number(action.slice(5)); if(size===0 || (Number.isInteger(size)&&size>=12&&size<=36)) await savePreferences({fontSize:size}); }
    else if (action === 'font-up' || action === 'font-down') { const current=preferences.fontSize || parseFloat(getComputedStyle(source ? $('#source-editor .cm-editor') : $('#editor .ProseMirror')).fontSize); await savePreferences({fontSize:Math.max(12,Math.min(36,Math.round(current)+(action==='font-up'?1:-1)))}); }
    else if (action.startsWith('zoom-')) { zoom = action === 'zoom-reset' ? 1 : Math.max(.6, Math.min(2, +(zoom + (action === 'zoom-in' ? .1 : -.1)).toFixed(1))); await savePreferences({zoom:Math.round(zoom*100)}); }
    else if (action === 'word-count') { syncText(); await showDialog('字数统计', `${$('#word-count').textContent || '0 字'}\n${text.length.toLocaleString()} 个字符\n${text.split('\n').length.toLocaleString()} 行`, [{value:'ok',label:'关闭'}]); }
    else if (action === 'preferences') {
      if (desktop) await invoke('open_preferences');
      else {
        let dialog=document.querySelector<HTMLDialogElement>('#preferences-dialog');
        if(!dialog){dialog=document.createElement('dialog');dialog.id='preferences-dialog';const iframe=document.createElement('iframe');iframe.src='/settings.html';iframe.title='偏好设置';const close=document.createElement('button');close.className='preferences-close';close.textContent='×';close.setAttribute('aria-label','关闭设置');close.onclick=()=>dialog!.close();dialog.append(iframe,close);document.body.append(dialog);}dialog.showModal();
      }
    }
    else if ((action === 'print' || action === 'export-pdf')) { if (source) await setMode(false); if (desktop) await invoke('window_action', {action: 'print', value: false}); else window.print(); }
    else if (action === 'export-html') {
      syncText(); if (source) await setMode(false);
      const content = crepe.editor.action(ctx => { const {state} = ctx.get(editorViewCtx); const div = document.createElement('div'); div.append(DOMSerializer.fromSchema(state.schema).serializeFragment(state.doc.content)); return div.innerHTML; });
      const title = filename().replace(/[&<>"']/g, '');
      const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${title}</title>${preferences.exportStyles ? `<style>body{max-width:800px;margin:48px auto;padding:0 24px;line-height:1.8;font-family:system-ui}pre,code{background:#f4f4f4}pre{padding:16px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}blockquote{border-left:3px solid #ddd;margin-left:0;padding-left:20px}img{max-width:100%}p{white-space:${preferences.exportWhitespace ? 'pre-wrap' : 'normal'}}</style>` : ''}</head><body>${preferences.exportTitle ? `<h1>${title}</h1>` : ''}${content}</body></html>`;
      if (desktop) await invoke('export_document', {content: html, extension: 'html'}); else { const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([html],{type:'text/html'})); a.href=url;a.download=filename().replace(/\.[^.]+$/,'')+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000); }
    }
    else if (action === 'help') await showDialog('Markdown 语法', '# 标题\n**加粗**　*斜体*　~~删除线~~\n`行内代码`　[链接](地址)\n- 无序列表　1. 有序列表\n- [ ] 任务　> 引用\n``` 代码块　$$ 公式块\n[^1] 脚注　[^1]: 脚注内容', [{value:'ok',label:'关闭'}]);
    else if (action === 'shortcuts') await showDialog('快捷键', '⌘N 新建　⌘O 打开　⌘S 保存\n⌘B 加粗　⌘I 斜体　⌘K 链接\n⌘1–6 标题　⌘0 段落\n⌘F 查找　⌘⌥F 替换\n⌘/ 源代码　⌘⇧L 大纲\nF8 专注　F9 打字机', [{value:'ok',label:'关闭'}]);
    else return false;
  } catch(e) { notify(String(e),true); }
  return true;
}

function searchable() {
  if (source && cm) return {value: cm.state.doc.toString(), positions: null};
  return crepe.editor.action(ctx => {
    let value = ''; const positions: number[] = [];
    ctx.get(editorViewCtx).state.doc.descendants((node,pos) => {
      if (node.isText) { for (let i=0; i<node.text!.length; i++) { value += node.text![i]; positions.push(pos+i); } }
      else if (node.isBlock && value && !value.endsWith('\n')) { value += '\n'; positions.push(pos); }
    }); return {value, positions};
  });
}
let found: {from: number; to: number} | null = null;
function matches() {
  const query = $<HTMLInputElement>('#find-query').value.toLocaleLowerCase(); const {value,positions} = searchable(); const result: {from:number;to:number}[] = [];
  if (query) { const haystack = value.toLocaleLowerCase(); let i=0; while ((i=haystack.indexOf(query,i)) !== -1) { result.push({from: positions ? positions[i] : i, to: positions ? positions[i+query.length-1]+1 : i+query.length}); i += query.length; } }
  return result;
}
function findMatch(direction = 1, restart = false) {
  const result = matches(); if (!result.length) { found=null; $('#find-count').textContent='0/0'; return; }
  let index = restart || !found ? (direction > 0 ? 0 : result.length-1) : result.findIndex(m=>m.from===found!.from)+direction;
  index = (index+result.length)%result.length; found=result[index]; $('#find-count').textContent=`${index+1}/${result.length}`;
  if (source && cm) cm.dispatch({selection:{anchor:found.from,head:found.to},scrollIntoView:true});
  else crepe.editor.action(ctx=>{const view=ctx.get(editorViewCtx);view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,found!.from,found!.to)).scrollIntoView());});
}
function replaceMatch(all = false) {
  const targets = all ? matches() : found ? [found] : []; const value = $<HTMLInputElement>('#replace-query').value; if (!targets.length) return;
  richTouched=true;
  if (source && cm) cm.dispatch({changes:targets.map(m=>({from:m.from,to:m.to,insert:value}))});
  else crepe.editor.action(ctx=>{const view=ctx.get(editorViewCtx),tr=view.state.tr; for (const m of [...targets].reverse()) tr.insertText(value,m.from,m.to);view.dispatch(tr);});
  syncText(); found=null; findMatch(1,true);
}
$('#find-query').addEventListener('input',()=>findMatch(1,true));
findBar.addEventListener('click', e=> { const action=(e.target as HTMLElement).closest<HTMLElement>('[data-find]')?.dataset.find; if (action==='close') {findBar.hidden=true;focusEditor();} else if (action==='next'||action==='prev') findMatch(action==='next'?1:-1); else if (action==='replace'||action==='all') replaceMatch(action==='all'); });
findBar.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();findBar.hidden=true;focusEditor();} if(e.key==='Enter'){e.preventDefault();if((e.target as HTMLElement).id==='replace-query')replaceMatch();else findMatch(e.shiftKey?-1:1);}});

function codeExtensions(isSource: boolean) {
  const close = preferences.pairBrackets ? ['(', '[', '{', '"', "'"] : [];
  if(preferences.pairMarkdown)close.push('*','_','`','~');
  return [
    ...((isSource ? preferences.sourceWrap : preferences.codeWrap) ? [EditorView.lineWrapping] : []),
    EditorState.tabSize.of(preferences.indentSize), indentUnit.of(' '.repeat(preferences.indentSize)),
    Prec.highest(EditorState.languageData.of(()=>[{closeBrackets:{brackets:close}}])),
    EditorView.contentAttributes.of({spellcheck:String(preferences.spellcheck)}),
  ];
}
function applyPreferences() {
  if(ready)syncText();
  autosave = preferences.autosave; zoom=preferences.zoom/100;
  theme=preferences.followSystem ? (matchMedia('(prefers-color-scheme:dark)').matches ? preferences.darkTheme : preferences.lightTheme) : preferences.theme;
  applyTheme();
  for(const el of [$('#editor'),$('#source-editor')])el.style.setProperty('zoom',String(zoom));
  const pm=$('#editor .ProseMirror');pm.spellcheck=preferences.spellcheck;
  const families:Record<string,string>={system:'-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',serif:'"Songti SC",Georgia,serif',mono:'Menlo,"PingFang SC",monospace'};
  for(const [prop,value] of Object.entries({'font-family':families[preferences.fontFamily]||'', 'font-size':preferences.fontSize?`${preferences.fontSize}px`:'', 'line-height':preferences.lineHeight?String(preferences.lineHeight):''})) {
    if(value)pm.style.setProperty(prop,value,'important');else pm.style.removeProperty(prop);
  }
  if(preferences.documentWidth){pm.style.setProperty('max-width',`${preferences.documentWidth}px`,'important');}else pm.style.removeProperty('max-width');
  $<HTMLSelectElement>('#font-size').value=String(preferences.fontSize);
  const sourceFont=$('#source-editor');if(preferences.fontSize)sourceFont.style.setProperty('--source-font-size',`${preferences.fontSize}px`);else sourceFont.style.removeProperty('--source-font-size');
  $('#word-count').hidden=!preferences.showWordCount;
  document.body.classList.toggle('hide-code-lines',!preferences.codeLineNumbers);document.body.classList.toggle('hide-source-lines',!preferences.sourceLineNumbers);
  for(const dom of document.querySelectorAll<HTMLElement>('.cm-editor')) {const view=EditorView.findFromDOM(dom);if(view)view.dispatch({effects:editingPreferences.reconfigure(codeExtensions(!!dom.closest('#source-editor')))});}
  crepe.editor.action(ctx=>Object.assign(ctx.get(codeBlockConfig.key),{extensions:[...codeBaseExtensions,editingPreferences.of(codeExtensions(false))]}));
  crepe.editor.action(ctx=>Object.assign(ctx.get(remarkStringifyOptionsCtx),{bullet:preferences.bullet,incrementListMarker:preferences.orderedIncrement,setext:preferences.headingStyle==='setext',emphasis:preferences.emphasis,strong:preferences.emphasis}));
  richBaseline=crepe.getMarkdown();richTouched=false;
  let printStyle=document.querySelector<HTMLStyleElement>('#print-preferences');if(!printStyle){printStyle=document.createElement('style');printStyle.id='print-preferences';document.head.append(printStyle);}printStyle.textContent=`@page{size:${preferences.printPaper};margin:${preferences.printMargin}mm}`;
  clearTimeout(autoTimer);if(autosave&&path&&dirty)autoTimer=setTimeout(()=>void saveDocument(false,true),preferences.autosaveDelay);
  if(!preferences.recovery)clearTimeout(draftTimer);
  updateUI();
}
matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{if(preferences.followSystem)applyPreferences();});
document.addEventListener('wheel',event=>{if(!preferences.wheelZoom||!event.metaKey)return;event.preventDefault();void runAction(event.deltaY<0?'zoom-in':'zoom-out');},{passive:false});
document.addEventListener('copy',event=>{
  if(!preferences.copyMarkdown||source||!(event.target as HTMLElement).closest('.milkdown'))return;
  const markdown=crepe.editor.action(ctx=>{const {state}=ctx.get(editorViewCtx);return state.selection.empty?'':ctx.get(serializerCtx)(state.schema.topNodeType.create(null,state.selection.content().content));});
  if(markdown&&event.clipboardData){event.clipboardData.setData('text/plain',markdown);event.preventDefault();}
},true);

$('#font-size').addEventListener('change',event=>void runAction(`font:${(event.target as HTMLSelectElement).value}`));
