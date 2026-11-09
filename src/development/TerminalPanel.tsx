import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import ResizeHandle from './ResizeHandle';
type Props = { projectId:string; root:string; workspaceTaskId?:string; visible:boolean; height:number; maxHeight:number; onHeight:(n:number)=>void; onHide:()=>void };
export default function TerminalPanel(p:Props) {
  const host=useRef<HTMLDivElement>(null), terminal=useRef<Terminal|null>(null), fit=useRef<FitAddon|null>(null);
  const resizeLatest=useRef(()=>{});
  const generation=useRef(0);
  const [connection,setConnection]=useState(0);
  const id=useRef(''), cursor=useRef(0), queue=useRef(Promise.resolve()), alive=useRef(true);
  const [session,setSession]=useState(''),[busy,setBusy]=useState(false),[exited,setExited]=useState(false),[error,setError]=useState('');
  const bridge=window.bridgainDesktop;
  const options={expectedRoot:p.root,workspaceTaskId:p.workspaceTaskId};
  const call=(action:string,extra:Record<string,unknown>={})=>{if(!bridge?.terminal)throw Error('터미널을 사용하려면 데스크톱 앱을 재시작해주세요.');return bridge.terminal(p.projectId,action,{...options,id:id.current,...extra});};
  const fail=(e:unknown)=>{if(alive.current)setError(e instanceof Error?e.message:'터미널 연결에 실패했습니다.');};
  const consume=(r:any)=>{if(r.truncated)terminal.current?.write('\r\n[이전 출력 일부 생략]\r\n');terminal.current?.write(r.data);cursor.current=r.cursor;if(r.exited){setExited(true);terminal.current?.write(`\r\n[프로세스 종료: ${r.exitCode}]\r\n`);}};
  function resize(){if(!host.current?.clientWidth||!host.current?.clientHeight)return;fit.current?.fit();if(id.current&&!exited)void call('resize',{cols:terminal.current?.cols,rows:terminal.current?.rows}).catch(fail);}
  resizeLatest.current=resize;
  useEffect(()=>{
    alive.current=true;
    const t=new Terminal({fontSize:12,fontFamily:'ui-monospace, Consolas, monospace',cursorBlink:true,scrollback:3000,theme:{background:'#151b26',foreground:'#dce4f4'}}),f=new FitAddon();
    t.loadAddon(f);t.open(host.current!);terminal.current=t;fit.current=f;
    const input=t.onData(data=>{if(!id.current)return;queue.current=queue.current.then(()=>call('input',{data})).catch(fail);});
    const observer=new ResizeObserver(()=>resizeLatest.current());observer.observe(host.current!);
    return()=>{alive.current=false;observer.disconnect();input.dispose();t.dispose();terminal.current=null;};
  },[p.root,p.projectId]);
  useEffect(()=>{if(!session||exited)return;const epoch=generation.current;let stopped=false;let timer:ReturnType<typeof setTimeout>;
    async function poll(){try{const r=await call('read',{cursor:cursor.current});if(stopped||epoch!==generation.current)return;consume(r);if(r.exited)return;}catch(e){if(!stopped&&epoch===generation.current)fail(e);return;}if(!stopped)timer=setTimeout(poll,400);}
    void poll();return()=>{stopped=true;clearTimeout(timer);};
  },[session,exited,connection]);
  useEffect(()=>{if(p.visible)requestAnimationFrame(resize);},[p.visible,p.height]);
  async function start(){generation.current++;setBusy(true);setError('');try{if(id.current&&exited)await call('close');terminal.current?.reset();cursor.current=0;const r=await call('open',{cols:terminal.current?.cols,rows:terminal.current?.rows});if(!alive.current)return;id.current=r.id;setExited(false);consume(r);setSession(r.id);setConnection(n=>n+1);resize();terminal.current?.focus();}catch(e){fail(e);}finally{if(alive.current)setBusy(false);}}
  async function close(){generation.current++;setBusy(true);try{await call('close');id.current='';setSession('');setExited(false);terminal.current?.write('\r\n[터미널 종료]\r\n');}catch(e){fail(e);}finally{setBusy(false);}}
  return <section className="dev-terminal" hidden={!p.visible} style={{height:p.height}} aria-label="로컬 터미널">
    <ResizeHandle axis="y" reverse value={p.height} min={120} max={p.maxHeight} label="편집기와 터미널 높이 조절" onChange={p.onHeight} onReset={()=>p.onHeight(200)}/>
    <div className="dev-terminal-header"><strong>터미널</strong><small title={p.root}>{p.root}</small>
      {(!session||exited)&&<button disabled={busy||!bridge?.terminal} onClick={()=>void start()}>{session?'다시 시작':'터미널 시작·재연결'}</button>}
      {session&&!exited&&<><button onClick={()=>void call('input',{data:'\x03'}).catch(fail)}>중단 Ctrl+C</button><button disabled={busy} onClick={()=>void close()}>종료</button></>}
      <button onClick={p.onHide} aria-label="터미널 접기">접기</button>
    </div>
    {error&&<div role="alert" className="dev-error">{error}<button disabled={busy} onClick={()=>void start()}>재연결</button></div>}
    {!session&&<p className="dev-terminal-hint">시작하면 이 PC의 셸을 엽니다. 화면을 이동하거나 접어도 세션은 유지되며 로그아웃·앱 종료 시 끝납니다.</p>}
    <div ref={host} className="dev-terminal-screen"/>
  </section>;
}
