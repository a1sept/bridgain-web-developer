import ControlIcon from "./components/ControlIcon";
import FilterBar from "./components/FilterBar";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { historyMembers, eventNames, filterHistory, projects, requests, seedEvents, type PreviewUser, type HistoryEvent } from "./activity-preview-data";
import "./project-resources.css";
import "./activity-preview.css";

export default function ActivityPreview({ currentUser }: { currentUser: PreviewUser }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pageRoot = useRef<HTMLElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const panelScroll = useRef<HTMLDivElement>(null);
  const selectedRow = useRef<HTMLLIElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [project, setProject] = useState<string[]>([]);
  const [request, setRequest] = useState("all");
  const [account, setAccount] = useState("all");
  const events = seedEvents.map(event => ({ ...event, actor: event.actor === "이민수" ? currentUser.displayName : event.actor, body: event.body.replaceAll("이민수님", `${currentUser.displayName}님`) }));
  const members = historyMembers(project, currentUser);
  const filtered = filterHistory(events, { project, request, account }, currentUser);
  const selected = filtered.find(e => e.id === selectedId);
  const projectHistory = selected ? events.filter(e => e.projectId === selected.projectId)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime() || a.id.localeCompare(b.id)) : [];
  function closeHistory() { setSelectedId(null); trigger.current?.focus({ preventScroll: true }); }
  useLayoutEffect(() => {
    if (!selected) return;
    const root = pageRoot.current;
    const content = root?.closest(".ds-content");
    const tabs = content?.querySelector(".ds-project-tabs");
    if (!root || !content || !tabs) return;
    const updateBounds = () => {
      root.style.setProperty("--history-panel-top", `${Math.max(0, tabs.getBoundingClientRect().bottom)}px`);
      root.style.setProperty("--history-content-left", `${Math.max(0, content.getBoundingClientRect().left)}px`);
    };
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(tabs);
    observer.observe(content);
    window.addEventListener("resize", updateBounds);
    window.addEventListener("scroll", updateBounds, { passive: true, capture: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
      window.removeEventListener("scroll", updateBounds, true);
    };
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    panelHeading.current?.focus({ preventScroll: true });
    const row = selectedRow.current;
    const scroll = panelScroll.current;
    if (row && scroll) {
      scroll.scrollTo({ top: scroll.scrollTop + row.getBoundingClientRect().top - scroll.getBoundingClientRect().top - scroll.clientHeight / 3, behavior: "instant" });
    }
  }, [selected?.id]);
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);
  useEffect(() => {
    if (!selected) return;
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); closeHistory(); } };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [selected?.id]);
  const requestOptions = requests.filter(r => !project.length || project.includes(r.projectId));
  function changeProject(ids: string[]) {
    setProject(ids);
    if (!historyMembers(ids, currentUser).some(member => member.id === account)) setAccount("all");
    if (request !== "all" && !requests.some(r => r.id === request && (!ids.length || ids.includes(r.projectId)))) setRequest("all");
  }
  return (
    <>
      <div className="ah-preview-notice">임시 미리보기 · 예시 데이터로 구성된 활동 이력입니다.</div>
      <main ref={pageRoot} className={`pr-page ah-page${selected ? " has-history-panel" : ""}`}>
        <header className="pr-heading">
          <div><span>WORKSPACE HISTORY</span><h1>활동 기록</h1><p>고객의 첫 요청부터 회의, 업무 배정까지 한곳에서 이어보세요.</p></div>
        </header>
        <FilterBar label="활동 기록 필터" filters={[
          { id: "project", label: "프로젝트", options: projects.map(p => ({ value: p.id, label: p.name })), values: project, multiple: true, onChange: changeProject },
          { id: "request", label: "고객 요청", options: requestOptions.map(r => ({ value: r.id, label: r.title })), values: request === "all" ? [] : [request], onChange: values => setRequest(values[0] || "all") },
          { id: "account", label: "담당 영역", options: members.map(member => ({ value: member.id, label: `${member.displayName}${member.id === currentUser.id ? " (나)" : ""}` })), values: account === "all" ? [] : [account], onChange: values => setAccount(values[0] || "all") },
        ]} onClear={() => { setProject([]); setRequest("all"); setAccount("all"); }} />
        {account !== "all" && <p className="ah-context-note">{members.find(member => member.id === account)?.displayName}님의 담당 업무로 이어진 고객 요청과 회의도 함께 표시합니다. 배정 전 기록까지 확인할 수 있어요.</p>}
        <div className="ah-results" aria-live="polite"><strong>{!project.length ? "전체 프로젝트의 흐름" : project.length === 1 ? projects.find(p => p.id === project[0])?.name : `${project.length}개 프로젝트의 흐름`}</strong><span>{filtered.length}개 기록 · 최신순</span></div>
        <div className={`ah-history-layout${selected ? " has-detail" : ""}`}>
          <section className="ah-feed" aria-label="전체 활동 목록">
            <ol className="ah-feed-list">
              {filtered.map(e => <li key={e.id} className={`ah-project-${e.projectId}`}>
                <button className={`ah-feed-row${selected?.id === e.id ? " is-selected" : ""}`}
                  aria-expanded={selected?.id === e.id} aria-controls={selected ? "ah-history-panel" : undefined}
                  onClick={click => { trigger.current = click.currentTarget; setSelectedId(e.id); }}>
                  <span className="ah-feed-dot" aria-hidden="true" />
                  <span className="ah-feed-copy">
                    <span className="ah-feed-sentence"><strong className="ah-project-label">{projects.find(p => p.id === e.projectId)?.name}</strong> · {activitySentence(e.kind)}</span>
                    <span className="ah-feed-subject">{e.title}</span>
                    <span className="ah-feed-meta">{e.actor} · <time dateTime={e.at}>{formatTime(e.at)}</time></span>
                  </span>
                  <span className="ah-feed-arrow" aria-hidden="true"><ControlIcon name="arrow" /></span>
                </button>
              </li>)}
            </ol>
            {!filtered.length && <div className="pr-activity-empty"><strong>조건에 맞는 활동이 없어요</strong><p>프로젝트, 요청 또는 담당 영역을 바꿔보세요.</p></div>}
          </section>
          {selected && <aside id="ah-history-panel" className={`ah-history-panel ah-project-${selected.projectId}`} aria-labelledby="ah-history-heading">
            <header className="ah-panel-header">
              <div><span className="ah-panel-eyebrow">PROJECT TIMELINE</span><h2 id="ah-history-heading" ref={panelHeading} tabIndex={-1}>{projects.find(p => p.id === selected.projectId)?.name}</h2><p>프로젝트 전체 이력 · 과거부터 현재까지</p></div>
              <button type="button" className="ah-panel-close" onClick={closeHistory} aria-label="프로젝트 이력 닫기"><ControlIcon name="close" size={16} /></button>
            </header>
            <div className="ah-panel-scroll" ref={panelScroll}>
              <ol className="ah-project-timeline">
                {projectHistory.map(e => <li key={e.id} ref={e.id === selected.id ? selectedRow : undefined} className={e.id === selected.id ? "is-current" : undefined} aria-current={e.id === selected.id ? "step" : undefined}>
                  <span className="ah-timeline-dot" aria-hidden="true" />
                  <article>
                    <div className="ah-step-heading"><strong>{eventNames[e.kind]}</strong>{e.id === selected.id && <span className="ah-selected-label">선택한 기록</span>}</div>
                    <h3>{e.title}</h3><p>{e.body}</p>
                    <div className="ah-panel-requests">{requests.filter(r => e.requestIds.includes(r.id)).map(r => <span key={r.id}>요청 · {r.title}</span>)}</div>
                    <footer>{e.actor} · <time dateTime={e.at}>{formatTime(e.at)}</time></footer>
                  </article>
                </li>)}
              </ol>
            </div>
            <div className="ah-panel-footnote">{projectHistory.length}개 기록 중 {projectHistory.findIndex(e => e.id === selected.id) + 1}번째 기록을 보고 있어요.</div>
          </aside>}
        </div>
      </main>
    </>
  );
}

function formatTime(at: string) {
  return new Date(at).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function activitySentence(kind: HistoryEvent["kind"]) {
  return {
    request_created: "고객 요청이 접수되었습니다.",
    meeting_created: "회의가 생성되었습니다.",
    request_linked: "고객 요청이 회의에 연결되었습니다.",
    meeting_started: "회의가 시작되었습니다.",
    meeting_completed: "회의가 마무리되었습니다.",
    task_assigned: "업무가 배정되었습니다.",
  }[kind];
}
