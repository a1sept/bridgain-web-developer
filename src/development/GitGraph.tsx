import type { DevelopmentState } from '../desktop';
import { graphRows } from './graph';
export default function GitGraph({state,selected,onSelect}: {state:DevelopmentState;selected:string;onSelect:(sha:string)=>void}) {
 const rows=graphRows(state.history);
 return <div className="dev-graph-list">{state.history.map((c,i)=>{const row=rows[i],width=Math.max(32,row.width*14+10);return <button type="button" className="dev-graph-row" key={c.sha} aria-pressed={selected===c.sha} onClick={()=>onSelect(c.sha)}>
 <svg width={width} height="52" viewBox={`0 0 ${width} 52`} aria-hidden="true">{row.edges.map((e,j)=><path key={j} d={e.parent?`M${e.from*14+10} 26 C${e.from*14+10} 40 ${e.to*14+10} 40 ${e.to*14+10} 52`:`M${e.from*14+10} 0 C${e.from*14+10} 26 ${e.to*14+10} 26 ${e.to*14+10} 52`} fill="none" stroke={`var(--dev-lane-${e.from%3})`} strokeWidth="1.5"/>)}<path d={`M${row.lane*14+10} 0 V26`} stroke={`var(--dev-lane-${row.lane%3})`} strokeWidth="1.5"/><circle cx={row.lane*14+10} cy="26" r="4" fill="var(--dev-surface)" stroke={`var(--dev-lane-${row.lane%3})`} strokeWidth="2"/></svg>
 <span className="dev-commit-label"><span title={c.subject}>{c.subject}</span><small>{c.sha===state.head&&<b>HEAD </b>}{state.refs.filter(r=>r.sha===c.sha).map(r=><b key={r.name} title={r.name}>{r.name} </b>)}{c.author} · {c.sha.slice(0,7)}</small></span></button>;})}</div>;
}
