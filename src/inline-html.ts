import type { Ctx } from '@milkdown/kit/ctx';
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import { $markSchema, $remark } from '@milkdown/kit/utils';
import type { Parent, PhrasingContent, Root } from 'mdast';
import type { Handle } from 'mdast-util-to-markdown';

interface Kbd extends Parent { type: 'moriKbd'; children: PhrasingContent[] }
interface Underline extends Parent { type: 'moriU'; children: PhrasingContent[] }
interface Highlight extends Parent { type: 'moriMark'; children: PhrasingContent[] }
declare module 'mdast' {
  interface PhrasingContentMap { moriKbd: Kbd; moriMark: Highlight; moriU: Underline }
  interface RootContentMap { moriKbd: Kbd; moriMark: Highlight; moriU: Underline }
}

function inlineTag(name: 'kbd' | 'mark' | 'u', type: 'moriKbd' | 'moriMark' | 'moriU') {
  return $markSchema(name, () => ({
    parseDOM: [{tag: name}], toDOM: () => [name, 0],
    parseMarkdown: {
      match: node => node.type === type,
      runner: (state, node, mark) => { state.openMark(mark); state.next(node.children); state.closeMark(mark); },
    },
    toMarkdown: {
      match: mark => mark.type.name === name,
      runner: (state, mark) => { state.withMark(mark, type); },
    },
  }));
}
export const kbd = inlineTag('kbd', 'moriKbd');
export const underline = inlineTag('u', 'moriU');
export const highlight = inlineTag('mark', 'moriMark');

// A small allowlist becomes editable marks, never executable arbitrary HTML.
export const safeInlineHTML = $remark('moriSafeInlineHTML', () => () => (tree: Root) => {
  function visit(node: Parent) {
    for (const child of node.children) if ('children' in child) visit(child as Parent);
    const children = node.children;
    const output: typeof children = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const open = child.type === 'html' ? /^<(kbd|mark|u)>$/i.exec(String(child.value)) : null;
      if (!open) { output.push(child); continue; }
      const tag = open[1].toLowerCase();
      let depth = 1, end = i + 1;
      for (; end < children.length; end++) {
        const next = children[end];
        if (next.type !== 'html') continue;
        if (String(next.value).toLowerCase() === `<${tag}>`) depth++;
        if (String(next.value).toLowerCase() === `</${tag}>` && --depth === 0) break;
      }
      if (end === children.length) { output.push(child); continue; }
      const wrapped: Kbd | Highlight | Underline = {type: tag === 'kbd' ? 'moriKbd' : tag === 'u' ? 'moriU' : 'moriMark', children: children.slice(i + 1, end) as PhrasingContent[]};
      visit(wrapped); output.push(wrapped); i = end;
    }
    node.children = output;
  }
  visit(tree);
});

const htmlHandler = (tag: string): Handle => (node, _parent, state, info) => `<${tag}>${state.containerPhrasing(node as Kbd | Highlight | Underline, info)}</${tag}>`;
export function configureInlineHTML(ctx: Ctx) {
  ctx.update(remarkStringifyOptionsCtx, options => ({...options, handlers: {...options.handlers, moriKbd: htmlHandler('kbd'), moriMark: htmlHandler('mark'), moriU: htmlHandler('u')}}));
}
