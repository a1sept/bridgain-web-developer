import { useEffect, useRef, useState } from "react";
import "./mobile-project-action.css";

export default function MobileProjectAction({ onCreate, disabled = false }: {
  onCreate: () => void;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const closeOnDesktop = () => { if (!media.matches) dialog.current?.close(); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  return <>
    <button className="mpa-trigger" type="button" disabled={disabled}
      aria-label="프로젝트 액션 열기" aria-haspopup="dialog" aria-expanded={expanded}
      onClick={() => { dialog.current?.showModal(); setExpanded(true); }}>
      <span aria-hidden="true">＋</span>
    </button>
    <dialog className="mpa-dialog" ref={dialog} aria-label="프로젝트 액션"
      onClose={() => setExpanded(false)}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
      }}>
      <button className="mpa-create" type="button" disabled={disabled}
        onClick={() => { dialog.current?.close(); onCreate(); }}>
        <span aria-hidden="true">＋</span>프로젝트 만들기
      </button>
      <button className="mpa-close" type="button" aria-label="프로젝트 액션 닫기"
        onClick={() => dialog.current?.close()}><span aria-hidden="true">×</span></button>
    </dialog>
  </>;
}
