import { $prose } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
export const focusWriting = $prose(() => new Plugin({props: {decorations(state) {
  if (!document.body.classList.contains('focus-mode')) return DecorationSet.empty;
  const decorations: Decoration[] = [], {from, to} = state.selection;
  state.doc.forEach((node, pos) => {
    if (pos + node.nodeSize <= from || pos > to) decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: 'mori-dim-block'}));
  });
  return DecorationSet.create(state.doc, decorations);
}}}));
