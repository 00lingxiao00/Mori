import { preferences } from './preferences-store';
import { $prose } from '@milkdown/kit/utils';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
export const typingPreferences=$prose(()=>new Plugin({props:{handleTextInput(view,from,to,text){
 if(view.composing || text.length!==1 || view.state.selection.$from.parent.type.name==='code_block')return false;
 const pairs:Record<string,string>={};
 if(preferences.pairBrackets)Object.assign(pairs,{'(':')','[':']','{':'}','"':'"',"'":"'",'（':'）','【':'】','“':'”','‘':'’'});
 if(preferences.pairMarkdown)Object.assign(pairs,{'*':'*','_':'_','`':'`','~':'~'});
 const next=view.state.doc.textBetween(to,to+1);
 if(from===to && Object.values(pairs).includes(text)&&next===text){view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,to+1)));return true;}
 const close=pairs[text];if(!close)return false;
 // Apostrophes inside a word remain ordinary punctuation.
 if(text==="'"&&/[\p{L}\p{N}]/u.test(view.state.doc.textBetween(Math.max(0,from-1),from)))return false;
 const selected=view.state.doc.textBetween(from,to);const tr=view.state.tr.insertText(text+selected+close,from,to);
 view.dispatch(tr.setSelection(TextSelection.create(tr.doc,from+1,from+1+selected.length)));return true;
}}}));
