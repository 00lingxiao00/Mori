import { $prose, $remark } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type { Node } from '@milkdown/kit/prose/model';
import type { Root, RootContent } from 'mdast';

const labelKey = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();

// Keep definitions together at the end without changing the original source
// bytes until the user edits the rich document.
export const footnoteLayout = $remark('moriFootnoteLayout', () => () => (tree: Root) => {
  const order = new Map<string, number>();
  function collect(node: Root | RootContent) {
    if (node.type === 'footnoteDefinition') return;
    if (node.type === 'footnoteReference') {
      const key = labelKey(node.label || node.identifier);
      if (!order.has(key)) order.set(key, order.size);
    }
    if ('children' in node) node.children.forEach(collect);
  }
  collect(tree);
  const definitions = tree.children.filter(n => n.type === 'footnoteDefinition');
  definitions.sort((a, b) => (order.get(labelKey(a.label || a.identifier)) ?? Infinity) - (order.get(labelKey(b.label || b.identifier)) ?? Infinity));
  tree.children = [...tree.children.filter(n => n.type !== 'footnoteDefinition'), ...definitions];
});

function decorations(doc: Node) {
  const numbers = new Map<string, number>();
  const definitions = new Map<string, string>();
  doc.descendants(node => {
    if (node.type.name === 'footnote_reference') {
      const key = labelKey(node.attrs.label);
      if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
    }
    if (node.type.name === 'footnote_definition') definitions.set(labelKey(node.attrs.label), node.textContent);
  });
  const result: Decoration[] = [];
  let first = true;
  doc.descendants((node, pos) => {
    const kind = node.type.name;
    if (kind !== 'footnote_reference' && kind !== 'footnote_definition') return;
    const key = labelKey(node.attrs.label);
    if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
    const number = String(numbers.get(key));
    if (kind === 'footnote_reference') {
      result.push(Decoration.node(pos, pos + node.nodeSize, {
        class: 'md-footnote', 'data-number': number, role: 'link', tabindex: '0',
        'aria-label': `脚注 ${number}`, title: definitions.get(key) || `未定义的脚注：${node.attrs.label}`,
      }));
    } else {
      result.push(Decoration.node(pos, pos + node.nodeSize, {
        class: 'footnote-definition', 'data-number': number, 'data-first': String(first), tabindex: '-1',
        'aria-label': `脚注 ${number}`,
      }));
      first = false;
      result.push(Decoration.widget(pos + node.nodeSize - 1, () => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'footnote-back';
        button.dataset.footnoteBack = key; button.textContent = '↩';
        button.setAttribute('aria-label', `返回脚注 ${number}`);
        button.contentEditable = 'false';
        return button;
      }, {side: -1, key: `footnote-back-${pos}-${key}`, ignoreSelection: true}));
    }
  });
  return DecorationSet.create(doc, result);
}

const key = new PluginKey<DecorationSet>('mori-footnotes');
export const footnoteNavigation = $prose(() => {
  let pointerStart = {x: 0, y: 0};
  function navigate(event: MouseEvent | KeyboardEvent) {
    if (!(event.target instanceof Element)) return false;
    const reference = event.target.closest<HTMLElement>('sup[data-type="footnote_reference"]');
    const back = event.target.closest<HTMLElement>('[data-footnote-back]');
    if (!reference && !back) return false;
    if (event instanceof MouseEvent && reference) {
      if (!window.getSelection()?.isCollapsed || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) return false;
    }
    const label = back?.dataset.footnoteBack ?? labelKey(reference!.dataset.label || '');
    const selector = back ? 'sup[data-type="footnote_reference"]' : 'dl[data-type="footnote_definition"]';
    const target = [...document.querySelectorAll<HTMLElement>(selector)].find(el => labelKey(el.dataset.label || '') === label);
    if (!target) return false;
    const area = document.querySelector<HTMLElement>('#scroll-area')!;
    area.scrollTo({top: area.scrollTop + target.getBoundingClientRect().top - area.getBoundingClientRect().top - 25, left: 0, behavior: 'smooth'});
    if (event instanceof KeyboardEvent) target.focus({preventScroll: true});
    event.preventDefault();
    return true;
  }
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_, state) => decorations(state.doc),
      apply: (tr, previous) => tr.docChanged ? decorations(tr.doc) : previous,
    },
    props: {
      decorations: state => key.getState(state),
      handleDOMEvents: {
        mousedown: (_view, event) => { pointerStart = {x: event.clientX, y: event.clientY}; return false; },
        click: (_view, event) => navigate(event),
        keydown: (_view, event) => ['Enter', ' '].includes(event.key) ? navigate(event) : false,
      },
    },
  });
});
