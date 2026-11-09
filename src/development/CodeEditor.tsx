import { useEffect, useRef } from 'react';
import { Compartment, EditorState, StateEffect } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, keymap, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';
export default function CodeEditor({path,value,onChange,onSave,cache,cacheKey,readOnly=false}: {readOnly?:boolean;cache:Map<string,EditorState>;cacheKey:string;path:string;value:string;onChange:(s:string)=>void;onSave:()=>void}) {
  const host=useRef<HTMLDivElement>(null), view=useRef<EditorView|null>(null);
  const editing=useRef(new Compartment());
  const change=useRef(onChange),save=useRef(onSave);change.current=onChange;save.current=onSave;
  useEffect(()=>{
    const ext=path.split('.').pop();
    const lang=['ts','tsx','js','jsx','mjs','cjs'].includes(ext||'')?javascript({typescript:ext==='ts'||ext==='tsx',jsx:ext==='tsx'||ext==='jsx'}):ext==='json'?json():ext==='css'?css():ext==='html'?html():ext==='md'?markdown():[];
    const crlf=value.includes('\r\n');
    const extensions=[editing.current.of([EditorState.readOnly.of(readOnly),EditorView.editable.of(!readOnly)]),lineNumbers(),history(),drawSelection(),highlightActiveLine(),bracketMatching(),syntaxHighlighting(defaultHighlightStyle),highlightSelectionMatches(),lang,EditorState.lineSeparator.of(crlf?'\r\n':'\n'),keymap.of([{key:'Mod-s',run:()=>{save.current();return true;}},indentWithTab,...defaultKeymap,...historyKeymap,...searchKeymap]),EditorView.updateListener.of(u=>{if(u.docChanged)change.current(u.state.sliceDoc());}),EditorView.theme({'&':{height:'100%',fontSize:'13px'},'.cm-scroller':{overflow:'auto',fontFamily:'ui-monospace, SFMono-Regular, Consolas, monospace'},'.cm-content':{padding:'12px 0'},'.cm-gutters':{background:'#f6f8fc',borderRight:'1px solid #e1e7f0'}})];
    const previous=cache.get(cacheKey);
    const state=previous&&previous.sliceDoc()===value?previous.update({effects:StateEffect.reconfigure.of(extensions)}).state:EditorState.create({doc:value,extensions});
    const v=new EditorView({parent:host.current!,state});view.current=v;
    return()=>{cache.set(cacheKey,v.state);v.destroy();view.current=null;};
  },[path,cacheKey]);
  useEffect(()=>{view.current?.dispatch({effects:editing.current.reconfigure([EditorState.readOnly.of(readOnly),EditorView.editable.of(!readOnly)])});},[readOnly]);
  useEffect(()=>{const v=view.current;if(v&&v.state.sliceDoc()!==value)v.dispatch({changes:{from:0,to:v.state.doc.length,insert:value}});},[value]);
  return <div className="dev-code-editor" ref={host} aria-label={`${path} 코드 편집기`}/>;
}
