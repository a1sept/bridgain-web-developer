import { useEffect, useRef, useState, type FormEvent } from "react";
import "./project-tasks.css";

type Member = { userId: string; displayName: string; accountType: string };
type RequestLink = { id: string; title: string };
export type ProjectTask = {
  id: string; title: string; description: string; status: "todo" | "in_progress" | "done";
  priority: "urgent" | "high" | "normal" | "low"; dueDate: string | null;
  assignees: { userId: string; displayName: string }[]; requests: RequestLink[];
  createdAt: string; updatedAt: string;
};
type Draft = Pick<ProjectTask, "title" | "description" | "status" | "priority"> & {
  dueDate: string; assigneeIds: string[]; requestIds: string[];
};
const statuses = { todo: "할 일", in_progress: "진행 중", done: "완료" } as const;
const priorities = { urgent: "긴급", high: "높음", normal: "보통", low: "낮음" } as const;
const fresh = (): Draft => ({ title: "", description: "", status: "todo", priority: "normal", dueDate: "", assigneeIds: [], requestIds: [] });
const toggle = (items: string[], id: string) => items.includes(id) ? items.filter(value => value !== id) : [...items, id];
async function request<T>(path: string, body?: object, method = "POST"): Promise<T> {
  const signal = AbortSignal.timeout(15000);
  const headers: Record<string, string> = {};
  if (body) {
    const csrf = await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store", signal });
    if (!csrf.ok) throw Error("보안 확인에 실패했어요. 다시 시도해주세요.");
    headers["X-CSRF-Token"] = (await csrf.json()).csrfToken;
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`/api/workspace${path}`, { credentials: "same-origin", cache: "no-store", signal, headers, method: body ? method : "GET", body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw Error(data.message || "업무를 불러오지 못했어요.");
  return data;
}
export default function ProjectTasks({ project, initialRequestId, refreshKey, onOpenRequest, onChanged }: {
  project: { id: string; name: string; members: Member[] };
  refreshKey?: number; initialRequestId?: string; onOpenRequest: (id: string) => void; onChanged?: () => void;
}) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]), [requests, setRequests] = useState<RequestLink[]>([]);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [revision, setRevision] = useState(0);
  const [view, setView] = useState<"board" | "list">("board"), [assignee, setAssignee] = useState("");
  const [editing, setEditing] = useState<string | null | undefined>(undefined), [draft, setDraft] = useState<Draft>(fresh);
  const [saving, setSaving] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), initialized = useRef(""), saveLock = useRef(false);
  const base = `/projects/${project.id}`;
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError("");
    Promise.all([request<{ tasks: ProjectTask[] }>(`${base}/tasks`), request<{ requests: RequestLink[] }>(`${base}/requests`)])
      .then(([result, links]) => { if (active) { setTasks(result.tasks); setRequests(links.requests); } })
      .catch(cause => { if (active) setLoadError(cause instanceof Error ? cause.message : "불러오기에 실패했어요."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [base, revision, refreshKey]);
  useEffect(() => {
    const key = `${project.id}:${initialRequestId}`;
    if (!loading && !loadError && initialRequestId && initialized.current !== key) {
      initialized.current = key;
      const source = requests.find(item => item.id === initialRequestId);
      if (source) { setDraft({ ...fresh(), title: source.title, requestIds: [source.id] }); setEditing(null); setError(""); }
    }
  }, [loading, loadError, initialRequestId, project.id, requests]);
  useEffect(() => { if (editing !== undefined) dialog.current?.showModal(); else dialog.current?.close(); }, [editing]);
  const members = project.members.filter(member => member.accountType === "team");
  const visible = tasks.filter(task => !assignee || (assignee === "unassigned" ? !task.assignees.length : task.assignees.some(member => member.userId === assignee)));
  function open(task?: ProjectTask) {
    setError("");
    setDraft(task ? { title: task.title, description: task.description, status: task.status, priority: task.priority, dueDate: task.dueDate?.slice(0, 10) || "", assigneeIds: task.assignees.map(member => member.userId), requestIds: task.requests.map(item => item.id) } : fresh());
    setEditing(task?.id ?? null);
  }
  function close() { if (!saveLock.current) setEditing(undefined); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saveLock.current || !draft.title.trim()) return;
    saveLock.current = true; setSaving(true); setError("");
    try {
      const result = await request<{ task: ProjectTask }>(`${base}/tasks${editing ? `/${editing}` : ""}`, { ...draft, title: draft.title.trim(), dueDate: draft.dueDate || null }, editing ? "PATCH" : "POST");
      setTasks(current => editing ? current.map(task => task.id === editing ? result.task : task) : [result.task, ...current]);
      setEditing(undefined); setNotice(editing ? "업무를 수정했어요." : "새 업무를 만들었어요."); onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "업무 저장에 실패했어요."); }
    finally { saveLock.current = false; setSaving(false); }
  }
  function taskCard(task: ProjectTask) {
    return <article className={`pt-card ${task.status === "done" ? "pt-done" : ""}`} key={task.id}>
      <button type="button" className="pt-card-open" onClick={() => open(task)} aria-label={`${task.title} 업무 상세`}>
        <span className="pt-card-top"><span className={`pt-origin ${task.requests.length ? "linked" : ""}`}>{task.requests.length ? `고객 요청 · ${task.requests.length}` : "내부 업무"}</span><span className={`pt-priority ${task.priority}`}>{priorities[task.priority]}</span></span>
        <strong>{task.title}</strong>{task.description && <p>{task.description}</p>}
        <span className="pt-card-bottom"><span>{task.assignees.map(member => member.displayName).join(", ") || "담당자 미지정"}</span><span>{task.dueDate ? `기한 ${task.dueDate.slice(0, 10)}` : "기한 없음"}</span></span>
      </button>
      {task.requests.length > 0 && <div className="pt-source-links">{task.requests.map(item => <button type="button" key={item.id} onClick={() => onOpenRequest(item.id)} title={item.title}>↗ {item.title}</button>)}</div>}
    </article>;
  }
  return <section className="pt-workspace" aria-label={`${project.name} 업무`}>
    <header className="pt-heading"><div><p>PROJECT TASKS</p><h1>업무</h1><span>고객 요청을 작업으로 연결하고 팀과 함께 진행하세요.</span></div><button className="pt-primary" onClick={() => open()} disabled={loading || !!loadError}>＋ 새 업무</button></header>
    {notice && <p className="pt-notice" role="status">{notice}</p>}
    {loadError && <div className="pt-error" role="alert">{loadError} <button onClick={() => setRevision(value => value + 1)}>다시 불러오기</button></div>}
    <div className="pt-toolbar"><div className="pt-view-switch" aria-label="업무 보기 방식"><button aria-pressed={view === "board"} onClick={() => setView("board")}>칸반 보드</button><button aria-pressed={view === "list"} onClick={() => setView("list")}>리스트</button></div><label>담당자 <select value={assignee} onChange={event => setAssignee(event.target.value)}><option value="">전체</option><option value="unassigned">미지정</option>{members.map(member => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label><span>{visible.length}개 업무</span></div>
    {loading ? <p className="pt-empty" role="status">업무를 불러오는 중이에요.</p> : !loadError && (view === "board" ? <div className="pt-board">{(Object.keys(statuses) as ProjectTask["status"][]).map(status => <section className={`pt-column ${status}`} key={status}><h2><span>{statuses[status]}</span><span>{visible.filter(task => task.status === status).length}</span></h2>{visible.filter(task => task.status === status).map(taskCard)}{!visible.some(task => task.status === status) && <p className="pt-column-empty">{statuses[status]} 업무가 없어요.</p>}</section>)}</div> : <div className="pt-list"><div className="pt-list-head"><span>업무</span><span>상태</span><span>담당자</span><span>기한</span></div>{visible.map(task => <button className="pt-list-row" key={task.id} onClick={() => open(task)}><span><small>{task.requests.length ? `고객 요청 ${task.requests.length}개 연결` : "내부 업무"}</small><strong>{task.title}</strong></span><span className={`pt-status ${task.status}`}>{statuses[task.status]}</span><span>{task.assignees.map(member => member.displayName).join(", ") || "미지정"}</span><span>{task.dueDate?.slice(0, 10) || "기한 없음"}</span></button>)}{!visible.length && <p className="pt-empty">표시할 업무가 없어요. 새 업무를 만들어보세요.</p>}</div>)}
    <dialog ref={dialog} className="pt-dialog" onCancel={event => { event.preventDefault(); close(); }} onClose={() => { if (!saveLock.current) setEditing(undefined); }}>
      {editing !== undefined && <form onSubmit={save}><header><div><small>{project.name}</small><h2>{editing ? "업무 상세" : "새 업무 만들기"}</h2></div><button type="button" aria-label="업무 상세 닫기" disabled={saving} onClick={close}>×</button></header>
        <div className="pt-form-body">{error && <p className="pt-error" role="alert">{error}</p>}
          {initialRequestId && !editing && <p className="pt-help">요청을 새 업무로 나눌 수 있어요. 기존 업무에 연결하려면 이 창을 닫고 해당 업무의 ‘연결된 고객 요청’을 선택하세요.</p>}
          <label>업무 제목<input autoFocus required maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="어떤 작업을 해야 하나요?" /></label>
          <label>업무 내용<textarea rows={4} maxLength={10000} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="작업 범위와 완료 기준을 적어주세요." /></label>
          <div className="pt-form-grid"><label>상태<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Draft["status"] })}>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>우선순위<select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as Draft["priority"] })}>{Object.entries(priorities).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>기한<input type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label></div>
          <fieldset><legend>담당자 <small>여러 명 선택 가능</small></legend><div className="pt-options">{members.map(member => <label key={member.userId}><input type="checkbox" checked={draft.assigneeIds.includes(member.userId)} disabled={saving || (!draft.assigneeIds.includes(member.userId) && draft.assigneeIds.length >= 50)} onChange={() => setDraft({ ...draft, assigneeIds: toggle(draft.assigneeIds, member.userId) })} /><span>{member.displayName}</span></label>)}{!members.length && <p>배정할 개발팀 멤버가 없어요.</p>}</div></fieldset>
          <fieldset><legend>연결된 고객 요청 <small>선택</small></legend><div className="pt-options pt-request-options">{requests.map(item => <label key={item.id}><input type="checkbox" checked={draft.requestIds.includes(item.id)} disabled={saving || (!draft.requestIds.includes(item.id) && draft.requestIds.length >= 50)} onChange={() => setDraft({ ...draft, requestIds: toggle(draft.requestIds, item.id) })} /><span>{item.title}</span></label>)}{!requests.length && <p>등록된 고객 요청이 없어요. 내부 업무로 만들 수 있어요.</p>}</div></fieldset>
          {!!editing && draft.requestIds.length > 0 && <div className="pt-source-links">{requests.filter(item => draft.requestIds.includes(item.id)).map(item => <button type="button" key={item.id} disabled={saving} onClick={() => { close(); onOpenRequest(item.id); }}>↗ {item.title}</button>)}</div>}
        </div><footer><button type="button" disabled={saving} onClick={close}>취소</button><button type="submit" className="pt-primary" disabled={saving || !draft.title.trim()}>{saving ? "저장 중…" : editing ? "변경 저장" : "업무 만들기"}</button></footer>
      </form>}
    </dialog>
  </section>;
}
