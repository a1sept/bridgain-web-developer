import type { ReactNode } from "react";
import ControlIcon from "./ControlIcon";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import "./filter-bar.css";

export type FilterDefinition = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  renderOption?: (option: { value: string; label: string }) => ReactNode;
  values: string[];
  multiple?: boolean;
  closeOnSelect?: boolean;
  trigger?: "chip" | "search";
  hideSelectedTags?: boolean;
  onChange: (values: string[]) => void;
};
export default function FilterBar({ filters, onClear, label = "목록 필터" }: {
  filters: FilterDefinition[]; onClear: () => void; label?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const closePopover = useCallback(() => setOpen(null), []);
  return <section className="bg-filter-bar" aria-label={label}>
    {filters.map(filter => <FilterChip key={filter.id} filter={filter} open={open === filter.id}
      onOpen={() => setOpen(filter.id)} onClose={closePopover} />)}
    {filters.some(f => f.values.length) && <button type="button" className="bg-filter-clear" onClick={() => { setOpen(null); onClear(); }}><ControlIcon name="close" size={12} /> 전체 초기화</button>}
  </section>;
}
function FilterChip({ filter, open, onOpen, onClose }: {
  filter: FilterDefinition; open: boolean; onOpen: () => void; onClose: () => void;
}) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0, width: 300, maxHeight: 400 });
  const selected = filter.options.filter(o => filter.values.includes(o.value));
  const visibleOptions = filter.options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function toggle(value: string) {
    const current = filter.values;
    filter.onChange(current.includes(value) ? current.filter(v => v !== value) : filter.multiple ? [...current, value] : [value]);
    if (filter.closeOnSelect) close();
  }
  function close(restoreFocus = true) { onClose(); if (restoreFocus) anchor.current?.focus(); }
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current!.getBoundingClientRect();
      const width = Math.min(filter.trigger === "search" ? Math.max(300, rect.width) : 300, window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 20;
      const above = rect.top - 20;
      const maxHeight = Math.min(440, Math.max(below, above, 120));
      const height = Math.min(panel.current?.scrollHeight || maxHeight, maxHeight);
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: below >= height || below >= above ? rect.bottom + 8 : Math.max(12, rect.top - height - 8), width, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, query, filter.values.length, filter.trigger]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    const focusOutside = (e: FocusEvent) => {
      if (!panel.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusOutside);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", focusOutside); };
  }, [open, onClose]);
  return <div className={`bg-filter-group${filter.trigger === "search" ? " bg-filter-group-search" : ""}`}><div className={`bg-filter-chip${selected.length ? " is-applied" : ""}`}>
    {selected.length > 0 && filter.trigger !== "search" && <button type="button" className="bg-filter-remove" aria-label={`${filter.label} 필터 해제`} onClick={() => { filter.onChange([]); onClose(); anchor.current?.focus(); }}><ControlIcon name="close" size={12} /></button>}
    <button ref={anchor} type="button" className="bg-filter-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) close(); else { setQuery(""); onOpen(); } }}>
      {!selected.length && filter.trigger !== "search" && <span className="bg-filter-plus" aria-hidden="true"><ControlIcon name="plus" /></span>}
      <span>{filter.label}</span>
      {!!selected.length && <><span className="bg-filter-divider" aria-hidden="true" /><strong>{selected.length}개 선택</strong></>}
      <span className="bg-filter-chevron" aria-hidden="true"><ControlIcon name="chevron" /></span>
    </button>
    </div>
    {!filter.hideSelectedTags && selected.map(option => <span className="bg-filter-tag" key={option.value}><span>{option.label}</span><button type="button" aria-label={`${option.label} 선택 해제`} onClick={() => { filter.onChange(filter.values.filter(value => value !== option.value)); onClose(); anchor.current?.focus(); }}><ControlIcon name="close" size={12} /></button></span>)}
    {open && createPortal(<div ref={panel} id={id} role="dialog" aria-label={`${filter.label} 필터`} className="bg-filter-popover" style={position}
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); } }}>
      <h3>{filter.label} 필터</h3>
      <input className="bg-filter-search" type="search" aria-label={filter.trigger === "search" ? filter.label : `${filter.label} 검색`} placeholder={filter.trigger === "search" ? `${filter.label}…` : `${filter.label} 검색…`} value={query} onChange={e => setQuery(e.target.value)} />
      {selected.length > 0 && !filter.hideSelectedTags && <div className="bg-filter-selected-tags" aria-label="선택한 항목">
        {selected.map(option => <span className="bg-filter-tag" key={option.value}><span>{option.label}</span><button type="button" aria-label={`${option.label} 선택 해제`} onClick={() => { toggle(option.value); panel.current?.querySelector<HTMLInputElement>("input")?.focus(); }}><ControlIcon name="close" size={12} /></button></span>)}
      </div>}
      <div className="bg-filter-options" role="group" aria-label={`${filter.label} 선택 목록`}>
        {visibleOptions.map(option => <button type="button" className="bg-filter-option" key={option.value} aria-pressed={filter.values.includes(option.value)} onClick={() => toggle(option.value)}>
          <span>{filter.renderOption ? filter.renderOption(option) : option.label}</span><span className="bg-filter-selected-mark" aria-hidden="true">{filter.values.includes(option.value) && <ControlIcon name="check" />}</span>
        </button>)}
        {!visibleOptions.length && <p role="status">{query ? "검색 결과가 없어요." : "선택할 항목이 없어요."}</p>}
      </div>
    </div>, document.body)}
  </div>;
}
