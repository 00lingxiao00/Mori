import { preferences } from './preferences-store';
import { editorViewCtx, parserCtx, type Editor } from '@milkdown/kit/core';
import { callCommand } from '@milkdown/kit/utils';
import * as common from '@milkdown/kit/preset/commonmark';
import * as gfm from '@milkdown/kit/preset/gfm';
import { toggleMark, setBlockType } from '@milkdown/kit/prose/commands';
import { TextSelection, Selection } from '@milkdown/kit/prose/state';
import { Slice, type Node } from '@milkdown/kit/prose/model';
import { deleteColumn, deleteTable } from '@milkdown/kit/prose/tables';
const commands = {
  bold: common.toggleStrongCommand, italic: common.toggleEmphasisCommand,
  code: common.toggleInlineCodeCommand, strike: gfm.toggleStrikethroughCommand,
  paragraph: common.turnIntoTextCommand, quote: common.wrapInBlockquoteCommand,
  ordered: common.wrapInOrderedListCommand, bullet: common.wrapInBulletListCommand,
  'code-block': common.createCodeBlockCommand, hr: common.insertHrCommand,
  indent: common.sinkListItemCommand, outdent: common.liftListItemCommand,
  'table-insert': gfm.insertTableCommand,
  'row-before': gfm.addRowBeforeCommand, 'row-after': gfm.addRowAfterCommand,
  'col-before': gfm.addColBeforeCommand, 'col-after': gfm.addColAfterCommand,
};
export function editAction(editor: Editor, action: string): boolean {
  if (action in commands) {
    editor.action(callCommand(commands[action as keyof typeof commands].key));
    editor.action(ctx => ctx.get(editorViewCtx).focus()); return true;
  }
  return editor.action(ctx => {
    const view = ctx.get(editorViewCtx), {state, dispatch} = view;
    const {schema, selection} = state;
    const insert = (markdown: string) => {
      const doc = ctx.get(parserCtx)(markdown);
      if (doc) dispatch(state.tr.replaceSelection(Slice.maxOpen(doc.content)).scrollIntoView());
    };
    if (/^heading:[1-6]$/.test(action)) setBlockType(schema.nodes.heading, {level: +action.slice(-1)})(state, dispatch);
    else if (action === 'heading-up' || action === 'heading-down') {
      const level = selection.$from.parent.type.name === 'heading' ? selection.$from.parent.attrs.level : 7;
      const next = Math.max(1, Math.min(7, level + (action === 'heading-up' ? -1 : 1)));
      setBlockType(next === 7 ? schema.nodes.paragraph : schema.nodes.heading, next === 7 ? {} : {level: next})(state, dispatch);
    }
    else if (action === 'highlight' || action === 'underline') toggleMark(schema.marks[action === 'highlight' ? 'mark' : 'u'])(state, dispatch);
    else if (action === 'clear-format') dispatch(state.tr.removeMark(selection.from, selection.to).setStoredMarks([]));
    else if (action === 'row-delete') {
      // Milkdown distinguishes header rows in its schema. Generic deleteRow
      // repairs a deleted header by inserting extra rows; promote the next row.
      const $from = selection.$from;
      for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'table') {
        const table = $from.node(d), index = $from.index(d), rows: Node[] = [];
        for (let r = 0; r < table.childCount; r++) {
          if (r === index) continue;
          const row = table.child(r), header = rows.length === 0, cells: Node[] = [];
          for (let c = 0; c < row.childCount; c++) { const cell = row.child(c); cells.push((header ? schema.nodes.table_header : schema.nodes.table_cell).create(cell.attrs, cell.content)); }
          rows.push((header ? schema.nodes.table_header_row : schema.nodes.table_row).create(row.attrs, cells));
        }
        if (rows.length === 1) {
          const cells = [];
          for (let c = 0; c < rows[0].childCount; c++) cells.push(schema.nodes.table_cell.createAndFill(rows[0].child(c).attrs)!);
          rows.push(schema.nodes.table_row.create(null,cells));
        }
        const pos = $from.before(d), tr = state.tr.replaceWith(pos, pos + table.nodeSize, schema.nodes.table.create(table.attrs,rows));
        dispatch(tr.setSelection(Selection.near(tr.doc.resolve(pos+1))).scrollIntoView()); break;
      }
    }
    else if (action === 'col-delete') deleteColumn(state, dispatch);
    else if (action === 'table-delete') deleteTable(state, dispatch);
    else if (action === 'task') {
      editor.action(callCommand(common.wrapInBulletListCommand.key));
      const tr = view.state.tr, {from, to} = view.state.selection;
      tr.doc.nodesBetween(from, to, (node, pos) => { if (node.type.name === 'list_item') tr.setNodeMarkup(pos, undefined, {...node.attrs, checked: false}); });
      for (let d = view.state.selection.$from.depth; d > 0; d--) {
        const node = view.state.selection.$from.node(d);
        if (node.type.name === 'list_item') { tr.setNodeMarkup(view.state.selection.$from.before(d), undefined, {...node.attrs, checked: false}); break; }
      }
      dispatch(tr);
    }
    else if (action.startsWith('task:')) {
      const tr = state.tr;
      for (let d = selection.$from.depth; d > 0; d--) {
        const node = selection.$from.node(d);
        if (node.type.name === 'list_item') { tr.setNodeMarkup(selection.$from.before(d), undefined, {...node.attrs, checked: action === 'task:toggle' ? !node.attrs.checked : action === 'task:done'}); break; }
      }
      dispatch(tr);
    }
    else if (action === 'math-block') insert('```latex\nE = mc^2\n```');
    else if (action === 'footnote') {
      let label = 1; const used = new Set<string>();
      state.doc.descendants(n => { if (n.type.name.startsWith('footnote_')) used.add(String(n.attrs.label)); });
      while (used.has(String(label))) label++;
      const ref = schema.nodes.footnote_reference.create({label: String(label)});
      const definition = ctx.get(parserCtx)(`[^${label}]: 脚注内容`);
      const tr = state.tr.replaceSelectionWith(ref);
      if (definition) tr.insert(tr.doc.content.size, definition.content);
      dispatch(tr.scrollIntoView());
    }
    else if (action === 'paragraph-before' || action === 'paragraph-after') {
      const $pos = selection.$from; const pos = $pos.depth ? (action === 'paragraph-before' ? $pos.before(1) : $pos.after(1)) : selection.from;
      const tr = state.tr.insert(pos, schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView());
    }
    else if (action === 'select-block') dispatch(state.tr.setSelection(TextSelection.create(state.doc, selection.$from.start(), selection.$from.end())));
    else if (action === 'delete') dispatch(state.tr.deleteSelection());
    else if (action === 'doc-start' || action === 'doc-end') dispatch(state.tr.setSelection(action === 'doc-start' ? Selection.atStart(state.doc) : Selection.atEnd(state.doc)).scrollIntoView());
    else return false;
    view.focus(); return true;
  });
}

import type { EditorView as SourceView } from '@codemirror/view';
export function sourceAction(view: SourceView, action: string): boolean {
  const {state} = view, {from, to} = state.selection.main;
  const selected = state.sliceDoc(from, to);
  const wrap: Record<string, [string, string]> = {bold: [preferences.emphasis.repeat(2),preferences.emphasis.repeat(2)], italic: [preferences.emphasis,preferences.emphasis], underline: ['<u>','</u>'], code: ['`','`'], strike: ['~~','~~'], highlight: ['<mark>','</mark>']};
  let start = from, end = to, insert = '', anchor: number | undefined;
  if (action in wrap) { const [a,b] = wrap[action]; insert = a + selected + b; anchor = start + a.length; }
  else if (/^heading:[1-6]$/.test(action) || ['paragraph','quote','ordered','bullet','task','indent','outdent','heading-up','heading-down'].includes(action)) {
    start = state.doc.lineAt(from).from; end = state.doc.lineAt(to).to;
    insert = state.sliceDoc(start, end).split('\n').map((line, index) => {
      if (action.startsWith('heading:')) { const level=+action.slice(-1),title=line.replace(/^#{1,6}\s+/, ''); return preferences.headingStyle==='setext'&&level<3 ? title+'\n'+(level===1?'=':'-').repeat(Math.max(3,title.length)) : '#'.repeat(level)+' '+title; }
      if (action === 'paragraph') return line.replace(/^#{1,6}\s+/, '');
      if (action === 'heading-up' || action === 'heading-down') { const level = line.match(/^#{1,6}(?=\s)/)?.[0].length || 7; const n = Math.max(1, Math.min(7, level + (action === 'heading-up' ? -1 : 1))); return (n === 7 ? '' : '#'.repeat(n)+' ') + line.replace(/^#{1,6}\s+/, ''); }
      if (action === 'indent') return '  ' + line;
      if (action === 'outdent') return line.replace(/^( {1,2}|\t)/, '');
      const prefix = action === 'quote' ? '> ' : action === 'ordered' ? `${preferences.orderedIncrement?index+1:1}. ` : action === 'task' ? `${preferences.bullet} [ ] ` : `${preferences.bullet} `;
      return prefix + line;
    }).join('\n');
  }
  else if (action.startsWith('task:')) {
    start = state.doc.lineAt(from).from; end = state.doc.lineAt(to).to;
    insert = state.sliceDoc(start,end).replace(/^(\s*[-*+] \[)([ xX])(\])/gm, (_,a,b,c) => a + (action === 'task:toggle' ? (b === ' ' ? 'x' : ' ') : action === 'task:done' ? 'x' : ' ') + c);
  }
  else if (action === 'select-block') { view.dispatch({selection: {anchor: state.doc.lineAt(from).from, head: state.doc.lineAt(to).to}}); view.focus(); return true; }
  else if (action === 'doc-start' || action === 'doc-end') { view.dispatch({selection: {anchor: action === 'doc-start' ? 0 : state.doc.length}, scrollIntoView: true}); view.focus(); return true; }
  else if (action === 'clear-format') insert = selected.replace(/<\/?(?:u|mark|kbd)>/g,'').replace(/(\*\*|__|~~|`|\*)/g,'');
  else if (action === 'delete') insert = '';
  else if (action === 'paragraph-before' || action === 'paragraph-after') { start = end = action === 'paragraph-before' ? state.doc.lineAt(from).from : state.doc.lineAt(to).to; insert = '\n\n'; }
  else if (action === 'footnote') {
    let label = 1; while (state.doc.toString().includes(`[^${label}]`)) label++;
    view.dispatch({changes: [{from,to,insert: `[^${label}]`}, {from: state.doc.length, insert: `\n\n[^${label}]: 脚注内容\n`}], selection: {anchor: from + String(label).length + 3}}); view.focus(); return true;
  }
  else {
    const templates: Record<string,string> = {'code-block': `\n\n\`\`\`${preferences.codeLanguage}\n${selected}\n\`\`\`\n`, 'math-block': '\n\n$$\nE = mc^2\n$$\n', hr: '\n\n---\n', 'table-insert': '\n\n| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |\n', comment: '<!-- '+ selected +' -->'};
    if (!(action in templates)) return false; insert = templates[action];
  }
  view.dispatch({changes: {from: start, to: end, insert}, selection: {anchor: anchor ?? start + insert.length, head: anchor === undefined ? undefined : anchor + selected.length}, scrollIntoView: true}); view.focus(); return true;
}
