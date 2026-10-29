import { useEffect, useState, useRef, useId, useLayoutEffect } from 'react';
import ControlIcon from './components/ControlIcon';
import FilterBar from './components/FilterBar';
import { localDay, meetingDateHint, meetingGroup, toLocalDateTime, type MeetingGroup } from './meeting-list-policy';
import './meeting-list.css';
export type MeetingListItem = {
  id: string; title: string; scheduledAt: string; durationMinutes: number; location: string;
  notes: string; status: string; decisionStatus: string;
  requests: { stages?: unknown[]; taskId?: string | null }[];
};
const groupNames: Record<MeetingGroup,string> = {running:'진행 중',today:'오늘',overdue:'일정 지난 회의',upcoming:'다가오는 회의',completed:'완료된 회의'};
const views = [['','전체'],['today','오늘'],['scheduled','예정'],['in_progress','진행 중'],['completed','완료']];
function MeetingActions({title,disabled,reason,onDelete}:{title:string;disabled:boolean;reason:string;onDelete:()=>void}) {
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const id=useId();
  const panel=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    if(!open || !panel.current || !trigger.current)return;
    const popup=panel.current;
    popup.showPopover();
    const position=()=>{
      const r=trigger.current!.getBoundingClientRect();
      const width=Math.min(220,window.innerWidth-24);
      popup.style.width=`${width}px`;
      popup.style.maxHeight=`${Math.max(0,window.innerHeight-24)}px`;
      const height=popup.getBoundingClientRect().height;
      popup.style.left=`${Math.max(12,Math.min(r.right-width,window.innerWidth-width-12))}px`;
      popup.style.top=`${Math.max(12,Math.min(r.bottom+6+height<=window.innerHeight-12?r.bottom+6:r.top-height-6,window.innerHeight-height-12))}px`;
    };
    position();window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
    return ()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
  },[open,reason]);
  useEffect(()=>{
    if(!open)return;
    const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
    const focusOutside=(e:FocusEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',outside);document.addEventListener('focusin',focusOutside);
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',focusOutside);};
  },[open]);
  return <div className="ml-more" ref={root} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
    <button ref={trigger} className="ml-action ml-more-trigger" type="button" disabled={disabled} aria-label={`${title} 더 보기`} aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(v=>!v)}><ControlIcon name="more" /></button>
    {open&&<div ref={panel} popover="manual" style={{position:"fixed",inset:"auto",margin:0,overflowY:"auto"}} className="ml-more-panel" id={id} role="group" aria-label="회의 관리"><button type="button" disabled={disabled||!!reason} aria-describedby={reason?`${id}-reason`:undefined} onClick={()=>{setOpen(false);trigger.current?.focus();onDelete();}}>회의 삭제</button>{reason&&<p id={`${id}-reason`}>{reason}</p>}</div>}
  </div>;
}
export default function MeetingList({meetings,busy,canUpdate,pendingIds,onOpen,onStart,onReschedule,onDelete,onAssign}: {
  meetings: MeetingListItem[]; busy:boolean; canUpdate:boolean; pendingIds:string[];
  onOpen:(id:string,present?:boolean)=>void; onStart:(id:string)=>void;
  onDelete:(id:string)=>void;
  onAssign:(id:string)=>void;
  onReschedule:(id:string,scheduledAt:string)=>Promise<boolean>;
}) {
  const [now,setNow]=useState(()=>new Date());
  const [view,setView]=useState(''),[query,setQuery]=useState(''),[timing,setTiming]=useState<string[]>([]);
  const [rescheduling,setRescheduling]=useState<string|null>(null),[date,setDate]=useState('');
  useEffect(()=>{
    // Refresh date labels locally; this never polls the server or changes meeting status.
    const refresh=()=>setNow(new Date());
    const timer=window.setInterval(refresh,30000);
    window.addEventListener('focus',refresh); document.addEventListener('visibilitychange',refresh);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  const filtered=meetings.filter(m=>m.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
    (!view || (view==='today' ? localDay(new Date(m.scheduledAt))===localDay(now):m.status===view)) &&
    (!timing.length || timing.includes('late') && m.status==='scheduled' && new Date(m.scheduledAt)<now || timing.includes('tomorrow') && meetingDateHint(m,now)==='내일'));
  return <section className="ml-list" aria-label="회의 목록">
    <div className="ml-toolbar"><div className="ml-views" aria-label="회의 보기">{views.map(([value,label])=><button type="button" key={value} aria-pressed={view===value} onClick={()=>setView(value)}>{label}</button>)}</div>
      <label className="ml-search"><span>검색</span><input type="search" aria-label="회의 제목 검색" placeholder="회의 검색" value={query} onChange={e=>setQuery(e.target.value)} /></label>
      <FilterBar label="회의 일정 필터" filters={[{id:'timing',label:'일정',values:timing,options:[{value:'late',label:'시작 시각 지남'},{value:'tomorrow',label:'내일'}],onChange:setTiming}]} onClear={()=>setTiming([])} />
    </div>
    {(['running','today','overdue','upcoming','completed'] as MeetingGroup[]).map(group=>{
      const items=filtered.filter(m=>meetingGroup(m,now)===group).sort((a,b)=>group==='completed'?Date.parse(b.scheduledAt)-Date.parse(a.scheduledAt):Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt));
      if(!items.length)return null;
      return <section className="ml-group" key={group} aria-label={groupNames[group]}><h2>{groupNames[group]} <span>{items.length}</span>{group==='today' && <small>{now.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'})}</small>}{group==='overdue' && <small>아직 시작하지 않은 회의</small>}</h2>
        {items.map(m=>{const d=new Date(m.scheduledAt),hint=meetingDateHint(m,now),late=m.status==='scheduled'&&d<now;
          const taskCount=m.requests.reduce((n,p)=>n+(p.stages?.length|| (p.taskId?1:0)),0);
          const pending=pendingIds.includes(m.id),locked=pending||m.decisionStatus==='final';
          return <article key={m.id} className={`ml-meeting ${group==='running'?'ml-running':''}`}>
            {group!=='running'&&<time className={`ml-date ${hint==='오늘'?'is-today':''}`} dateTime={m.scheduledAt}><span>{d.getMonth()+1}월</span><strong>{d.getDate()}</strong><span>{d.toLocaleDateString('ko-KR',{weekday:'long'})}</span></time>}
            <div className="ml-body">
              {group==='running'&&<div className="ml-badges"><span className="ml-badge">● 진행 중</span><time dateTime={m.scheduledAt}>{hint||d.toLocaleDateString('ko-KR',{month:'long',day:'numeric'})} · {d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})}</time></div>}
              <div className="ml-title-row"><button className="ml-title" type="button" disabled={busy} onClick={()=>onOpen(m.id)}>{m.title}</button>{m.status==='scheduled'&&<span className="ml-badge ml-neutral">예정</span>}</div>
              <div className="ml-meta">{group!=='running'&&<><time dateTime={m.scheduledAt} className={hint==='오늘'?'ml-today':''}>{hint==='오늘'||hint==='내일'?`${hint} · `:''}{d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})}</time>{late&&<span className="ml-badge ml-warn">{hint==='오늘'?'시작 시각 지남':'일정 지남'}</span>}</>}<span>{m.durationMinutes}분 · {m.location||'장소 미정'}</span></div>
              <p className="ml-summary">요청 {m.requests.length}개 · {m.decisionStatus==='final'?'생성된 업무':'업무 초안'} {taskCount}개{pending&&<span className="ml-approval">업무 생성 승인 대기</span>}</p>
              {group==='running'&&m.notes.trim()&&<p className="ml-preview">{m.notes.replace(/\s+/g,' ')}</p>}
            </div>
            <div className="ml-actions">
              {late&&canUpdate&&!locked&&<button className="ml-action ml-quiet" type="button" disabled={busy} onClick={()=>{setRescheduling(m.id);setDate(toLocalDateTime(m.scheduledAt));}}>일정 변경</button>}
              {m.status==='scheduled'&&canUpdate&&<button className="ml-action" type="button" disabled={busy} onClick={()=>onStart(m.id)}>회의 시작</button>}
              {m.status==='in_progress'&&<button className="ml-action ml-primary" type="button" disabled={busy} onClick={()=>onOpen(m.id,true)}>회의 이어가기 <ControlIcon name="arrow" /></button>}
              {m.status==='completed'&&<span className="ml-completed"><ControlIcon name="check" /> 완료</span>}
              {m.status==='completed'&&canUpdate&&!locked&&<button type="button" className="ml-action ml-primary" disabled={busy} onClick={()=>onAssign(m.id)}>업무 배정</button>}
              {canUpdate&&<MeetingActions title={m.title} disabled={busy} reason={pending?'승인 요청을 취소한 후 삭제할 수 있습니다.':m.decisionStatus==='final'||m.requests.some(p=>p.taskId)?'업무가 생성된 회의는 삭제할 수 없습니다.':''} onDelete={()=>onDelete(m.id)} />}
            </div>
            {rescheduling===m.id&&<form className="ml-reschedule" onSubmit={async e=>{e.preventDefault();if(date&&await onReschedule(m.id,new Date(date).toISOString()))setRescheduling(null);}}><label>시작 일시<input autoFocus required type="datetime-local" aria-label="변경할 시작 일시" value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></label><button type="submit" className="ml-action ml-primary" disabled={busy||!date}>일정 저장</button><button type="button" className="ml-action" disabled={busy} onClick={()=>setRescheduling(null)}>취소</button></form>}
          </article>;
        })}
      </section>;
    })}
    {!filtered.length&&<div className="ml-empty"><strong>{meetings.length?'조건에 맞는 회의가 없습니다.':'첫 회의를 준비해보세요.'}</strong><p>{meetings.length?'검색어나 필터를 변경해보세요.':'회의 만들기를 눌러 요청과 업무 초안을 정리할 수 있습니다.'}</p></div>}
  </section>;
}
