import { TableNodeView } from '@milkdown/kit/component/table-block';
import { tableSchema } from '@milkdown/kit/preset/gfm';
import { $view } from '@milkdown/kit/utils';

class TextTableView extends TableNodeView {
  override stopEvent(event: Event): boolean {
    const target = event.target;
    if ((event.type === 'mousedown' || event.type === 'pointerdown') && target instanceof Element && target.closest('th,td') && !target.closest('button')) {
      // Let ProseMirror place the text caret normally. The upstream view queues
      // a node selection against an old document, racing quick edits/menu actions.
      return false;
    }
    return super.stopEvent(event);
  }
}
export const textTableView = $view(tableSchema.node, ctx => (node, view, getPos) => new TextTableView(ctx,node,view,getPos));
