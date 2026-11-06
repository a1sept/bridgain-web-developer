import { useRef } from 'react';
export default function ResizeHandle({axis,value,min,max,onChange,onReset,label,reverse=false}: {axis:'x'|'y';value:number;min:number;max:number;onChange:(n:number)=>void;onReset:()=>void;label:string;reverse?:boolean}) {
 const start=useRef<{point:number;value:number}|null>(null);
 const move=(n:number)=>onChange(Math.min(Math.max(n,min),Math.max(min,max)));
 return <button type="button" className={`dev-resize dev-resize-${axis}`} role="separator" aria-label={label} aria-orientation={axis==='x'?'vertical':'horizontal'} aria-valuemin={min} aria-valuemax={Math.max(min,max)} aria-valuenow={Math.round(value)}
 onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();start.current={point:axis==='x'?e.clientX:e.clientY,value};e.currentTarget.setPointerCapture(e.pointerId);}}
 onPointerMove={e=>{if(start.current)move(start.current.value+((axis==='x'?e.clientX:e.clientY)-start.current.point)*(reverse?-1:1));}}
 onPointerUp={e=>{start.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{start.current=null;}} onLostPointerCapture={()=>{start.current=null;}}
 onDoubleClick={onReset} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();move(value+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)*(reverse?-1:1)*(e.shiftKey?40:10));}else if(e.key==='Home'){e.preventDefault();move(min);}else if(e.key==='End'){e.preventDefault();move(max);}}}/>;
}
