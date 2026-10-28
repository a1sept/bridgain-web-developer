import { useEffect, useRef, useState } from "react";
import "./member-picker.css";

type Person = { userId: string; displayName: string };
export default function MemberPicker({ label, items, value, onChange, disabled = false }: {
  label: string; items: Person[]; value: string[];
  onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const available = items.filter(p => !value.includes(p.userId));
  const matches = available.filter(p => p.displayName.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="mp-picker" ref={ref} onKeyDown={e => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); ref.current?.querySelector<HTMLButtonElement>(".mp-add")?.focus(); }
  }}>
    <span className="mp-label">{label}</span>
    <div className="mp-selected">
      {value.map(id => <button type="button" className="mp-chip" disabled={disabled} key={id}
        aria-label={`${items.find(p => p.userId === id)?.displayName || "기존 멤버"} ${label}에서 제외`}
        onClick={() => onChange(value.filter(v => v !== id))}>
        {items.find(p => p.userId === id)?.displayName || "기존 멤버"} <span aria-hidden="true">×</span>
      </button>)}
      {!value.length && <span className="mp-empty">미지정</span>}
      <button type="button" className="mp-add" disabled={disabled} aria-label={`${label} 추가`}
        aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen(!open); setQuery(""); }}>＋</button>
    </div>
    {open && !disabled && <div className="mp-popover" role="dialog" aria-label={`${label} 선택`}>
      <div className="mp-heading"><strong>{label} 추가</strong><button type="button" aria-label="닫기" onClick={() => setOpen(false)}>×</button></div>
      {items.length > 5 && <input autoFocus aria-label={`${label} 이름 검색`} placeholder="이름 검색…"
        value={query} onChange={e => setQuery(e.target.value)} />}
      <div aria-live="polite">
        {matches.slice(0, 5).map(p => <button className="mp-person" type="button" key={p.userId}
          onClick={() => onChange([...value, p.userId])}><span className="mp-avatar" aria-hidden="true">{p.displayName.slice(0, 1)}</span>{p.displayName}<span className="mp-plus" aria-hidden="true">＋</span></button>)}
        {!matches.length && <p>{available.length ? "검색 결과가 없어요." : "추가할 수 있는 멤버가 없어요."}</p>}
      </div>
      <small>프로젝트 멤버 {items.length}명{matches.length > 5 ? " · 나머지 멤버는 검색하세요." : ""}</small>
    </div>}
  </div>;
}
