import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit, listen } from '@tauri-apps/api/event';
import { preferences, onPreferences } from './preferences-store';
import './privacy.css';

type Mask = 'manual' | 'idle' | null;
type Message = { mask: Mask } | { activity: number };
const desktop = isTauri(), channel = 'mori-privacy';
let mask: Mask = null, lastActivity = Date.now(), lastBroadcast = 0;
let timer: ReturnType<typeof setTimeout>;
const cover = document.createElement('dialog');
cover.id = 'privacy-cover';
cover.setAttribute('aria-label', '窗口已遮蔽');
cover.innerHTML = '<button type="button" aria-label="显示窗口" title="显示窗口（Esc）"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button>';
document.body.append(cover);
function schedule() {
  clearTimeout(timer);
  if (preferences.privacyIdle && !mask) timer = setTimeout(() => {
    if (Date.now() - lastActivity >= preferences.privacySeconds * 1000) change('idle');
    else schedule();
  }, Math.max(1, preferences.privacySeconds * 1000 - (Date.now() - lastActivity)));
}
function apply(next: Mask) {
  mask = next;
  document.body.classList.toggle('privacy-masked', !!mask);
  document.body.dataset.privacyStyle = preferences.privacyStyle;
  if (mask && !cover.open) cover.showModal();
  else if (!mask && cover.open) cover.close();
  schedule();
}
function receive(message: Message) {
  if ('activity' in message) {
    lastActivity = Math.max(lastActivity, message.activity);
    if (mask === 'idle') apply(null); else schedule();
  } else { lastActivity = Date.now(); apply(message.mask); }
}
function broadcast(message: Message) {
  if (desktop) void emit(channel, message);
  else localStorage.setItem(channel, JSON.stringify({...message, nonce:Math.random()}));
}
function change(next: Mask) { receive({mask:next}); broadcast({mask:next}); }
export function togglePrivacy() { change(mask ? null : 'manual'); }
export function isConcealed() { return !!mask; }
cover.querySelector('button')!.addEventListener('click', () => change(null));
cover.addEventListener('cancel', event => { event.preventDefault(); change(null); });
// Consume the wake-up gesture so it cannot type, scroll, or move the document selection.
for (const name of ['pointermove','pointerdown','keydown','wheel','touchstart','beforeinput','compositionstart']) {
  document.addEventListener(name, event => {
    const key = event as KeyboardEvent;
    const shortcut = name === 'keydown' && (key.metaKey || key.ctrlKey) && key.shiftKey && key.code === 'KeyP';
    if (shortcut && !desktop) { event.preventDefault(); event.stopImmediatePropagation(); togglePrivacy(); return; }
    if (mask) {
      if (name === 'keydown' && key.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); change(null); return; }
      if (name === 'pointerdown' && (event.target as Element).closest('#privacy-cover button')) return;
      if (shortcut && desktop) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (mask === 'idle') change(null);
      return;
    }
    lastActivity = Date.now(); schedule();
    if (lastActivity - lastBroadcast >= 1000) { lastBroadcast = lastActivity; broadcast({activity:lastActivity}); }
  }, {capture:true, passive:false});
}
if (desktop) {
  await listen<Message>(channel, event => receive(event.payload));
  if (getCurrentWindow().label === 'main') {
    await listen('privacy-toggle', togglePrivacy);
    await listen('privacy-query', () => broadcast({mask}));
  } else await emit('privacy-query');
} else window.addEventListener('storage', event => {
  if (event.key === channel && event.newValue) { try { receive(JSON.parse(event.newValue)); } catch { /* Ignore invalid state. */ } }
});
// Recheck elapsed wall time when macOS resumes a suspended webview.
function checkElapsed() { if (!mask && preferences.privacyIdle && Date.now()-lastActivity >= preferences.privacySeconds*1000) change('idle'); }
window.addEventListener('focus', checkElapsed);
document.addEventListener('visibilitychange', checkElapsed);
onPreferences(() => { document.body.dataset.privacyStyle = preferences.privacyStyle; if (mask === 'idle' && !preferences.privacyIdle) change(null); else schedule(); });
schedule();
