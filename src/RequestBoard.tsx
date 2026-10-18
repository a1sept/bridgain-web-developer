import { UrgentApproval } from "./Approvals";
import { useAi } from "./ai/AiWorkspace";
import RequestTaskLinks from "./RequestTaskLinks";
import RequestConversation from "./RequestConversation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import "./request-board.css";
type User = { id: string; displayName: string; accountType: "client" | "team" };
type Member = {
  userId: string;
  displayName: string;
  accountType: "client" | "team";
};
type Project = { rolesConfigured?: boolean; permissions?: string[]; id: string; name: string; members: Member[] };
type RequestItem = {
  id: string;
  origin?: "customer" | "development";
  workflowStage?: string;
  taskId?: string | null;
  approvalId?: string | null;
  meetingId?: string | null;
  createdBy?: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  creatorName: string;
  assignees: Member[];
};
type Event = {
  id: string;
  kind: string;
  body?: string;
  createdAt: string;
  actorName: string;
  actorId: string;
  status?: string;
};
type Attachment = { id: string; name: string; size: number; url: string };
type Detail = {
  workflow?: {
    tasks: {
      id: string;
      title: string;
      status: string;
      resultSummary: string;
    }[];
    meetings: {
      id: string;
      title: string;
      decisionStatus: string;
      scheduledAt: string;
    }[];
  };
  request: RequestItem;
  events: Event[];
  attachments: Attachment[];
  canManage: boolean;
  canAssign: boolean;
  canUpload: boolean;
};
const stages: Record<string, string> = {
  received: "요청 접수",
  review: "검토",
  in_progress: "개발 진행",
  completed: "완료",
};
const stage = (request: RequestItem) => request.workflowStage || request.status;
const listStages: Record<string, string> = {
  received: "접수",
  reviewing: "검토 중",
  pending: "승인 대기",
  tasked: "업무화 완료",
};
const listStage = (r: RequestItem) =>
  r.taskId || ["in_progress", "completed"].includes(r.workflowStage || "")
    ? "tasked"
    : r.approvalId
      ? "pending"
      : r.meetingId || r.workflowStage === "review"
        ? "reviewing"
        : "received";
const types: Record<string, string> = {
  feature: "기능 추가",
  bug: "버그 수정",
  other: "기타",
};
const priorities: Record<string, string> = {
  urgent: "긴급",
  high: "높음",
  normal: "보통",
  low: "낮음",
};
const date = (v: string) =>
  new Date(v).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
async function api<T>(
  path: string,
  body?: object | FormData,
  method = "POST",
): Promise<T> {
  const signal = AbortSignal.timeout(body instanceof FormData ? 60000 : 15000);
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    const csrf = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!csrf.ok) throw Error("보안 확인에 실패했어요. 다시 시도해주세요.");
    headers["X-CSRF-Token"] = (await csrf.json()).csrfToken;
    if (!(body instanceof FormData))
      headers["Content-Type"] = "application/json";
  }
  const r = await fetch(`/api/workspace${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    headers,
    signal,
    method: body === undefined ? "GET" : method,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.message || "요청을 처리하지 못했어요.");
  return data;
}
export default function RequestBoard({
  user,
  project,
  projects,
  onBack,
  onTasks,
  onMeetings,
}: {
  user: User;
  project?: Project;
  projects: Project[];
  onBack: () => void;
  onInfo: () => void;
  onTasks?: (requestId?: string) => void;
  onMeetings?: (requestId: string) => void;
}) {
  const ai = useAi();
  const [aiRevision, setAiRevision] = useState(0);
  useEffect(() => {
    const changed = () => setAiRevision((v) => v + 1);
    window.addEventListener("bridgain:ai-applied", changed);
    return () => window.removeEventListener("bridgain:ai-applied", changed);
  }, []);
  const [path, setPath] = useState(window.location.pathname);
  const base = `/projects/${project?.id}/requests`;
  const canCreate = !project?.permissions || project.permissions.includes("requests.create");
  const suffix = path.slice(base.length).split("/").filter(Boolean);
  const isNew = suffix[0] === "new";
  const requestId = isNew ? undefined : suffix[0];
  const [origin, setOrigin] = useState<"customer" | "development">(() =>
    (isNew && user.accountType === "team") ||
    new URLSearchParams(window.location.search).get("origin") === "development"
      ? "development"
      : "customer",
  );
  const [urgent, setUrgent] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [allRequests, setList] = useState<RequestItem[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [type, setType] = useState("feature"),
    [priority, setPriority] = useState("normal"),
    [files, setFiles] = useState<File[]>([]);
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assigned, setAssigned] = useState<string[]>([]);
  const originRequests = allRequests.filter(
    (r) => (r.origin || "customer") === origin,
  );
  const list = originRequests.filter(
    (r) => origin !== "development" || !mineOnly || r.createdBy === user.id,
  );
  const visibleRequests = list.filter(
    (r) =>
      r.title.toLowerCase().includes(query.toLowerCase()) &&
      (!filter || listStage(r) === filter) &&
      (!priorityFilter || r.priority === priorityFilter),
  );
  const lock = useRef(false);
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [retryRequestId, setRetryRequestId] = useState<string | null>(null);
  useEffect(() => {
    const pop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function go(next: string) {
    const destination = new URL(next, window.location.origin);
    destination.searchParams.set(
      "origin",
      destination.pathname.endsWith("/new") && user.accountType === "team"
        ? "development"
        : origin,
    );
    window.history.pushState({}, "", destination.pathname + destination.search);
    setPath(destination.pathname);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setError("");
    setNotice("");
    window.scrollTo(0, 0);
  }
  async function refresh() {
    if (!project) return;
    if (requestId) {
      const d = await api<Detail>(`${base}/${requestId}`);
      if (window.location.pathname !== path) return;
      setDetail(d);
      setAssigned((d.request.assignees || []).map((m) => m.userId));
    } else if (!isNew) {
      const result = await api<{ requests: RequestItem[] }>(base);
      if (window.location.pathname !== path) return;
      setList(result.requests);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setDetail(null);
    setError("");
    if (!project) {
      setLoading(false);
      return;
    }
    const job = requestId
      ? api<Detail>(`${base}/${requestId}`)
      : isNew
        ? Promise.resolve(null)
        : api<{ requests: RequestItem[] }>(base);
    job
      .then((d) => {
        if (!active || !d) return;
        if ("request" in d) {
          setDetail(d);
          if (d.request.origin) setOrigin(d.request.origin);
          setAssigned((d.request.assignees || []).map((m) => m.userId));
        } else setList(d.requests);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, project?.id, aiRevision]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function addFiles(next: File[]) {
    const all = [...files, ...next];
    if (all.length > 5) {
      setError("첨부 파일은 최대 5개까지 선택해주세요.");
      return;
    }
    if (
      all.some(
        (f) => !["application/pdf", "image/jpeg", "image/png"].includes(f.type),
      )
    ) {
      setError("PDF, JPG, PNG 파일만 첨부할 수 있어요.");
      return;
    }
    if (all.reduce((n, f) => n + f.size, 0) > 20 * 1024 * 1024) {
      setError("첨부 파일의 전체 크기는 20MB 이하여야 해요.");
      return;
    }
    setFiles(all);
    setError("");
  }
  async function upload(id: string, selected: File[]) {
    const form = new FormData();
    selected.forEach((f) => form.append("files", f));
    await api(`${base}/${id}/attachments`, form);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { request } = await api<{ request: RequestItem }>(base, {
        origin: user.accountType === "team" ? "development" : "customer",
        title: title.trim(),
        description: description.trim(),
        type,
        priority,
      });
      let warning = "";
      if (files.length)
        try {
          await upload(request.id, files);
        } catch (e) {
          setRetryFiles(files);
          setRetryRequestId(request.id);
          warning =
            "요청은 저장했지만 첨부 파일을 올리지 못했어요. 아래에서 다시 시도해주세요.";
        }
      setTitle("");
      setDescription("");
      setFiles([]);
      go(`${base}/${request.id}`);
      setNotice(warning || "요청을 등록했어요. 진행 상황을 여기서 확인하세요.");
    });
  }
  const timeline = (d: Detail) => (
    <section className="rb-panel">
      <h2>진행 현황 타임라인</h2>
      <div className="rb-timeline-summary">
        <strong>{d.request.title}</strong>
        <p>
          담당 개발팀:{" "}
          {d.request.assignees.length
            ? d.request.assignees.map((m) => m.displayName).join(", ")
            : "배정 대기"}
        </p>
        <small>최종 업데이트 {date(d.request.updatedAt)}</small>
      </div>
      <p className="rb-muted">현재 단계와 실제 변경 이력을 확인하세요.</p>
      <ol className="rb-timeline">
        {Object.entries(stages).map(([key, label]) => {
          const events = d.events.filter(
            (e) =>
              e.status === key || (key === "received" && e.kind === "created"),
          );
          const current = stage(d.request) === key;
          return (
            <li
              key={key}
              className={
                current ? "current" : events.length ? "done" : "pending"
              }
            >
              <span className="rb-dot">
                {events.length && !current ? "✓" : ""}
              </span>
              <div>
                <strong>{label}</strong>
                <small>
                  {events.length
                    ? date(events[events.length - 1].createdAt)
                    : current
                      ? "현재 단계"
                      : key === "revision"
                        ? "필요 시 진행"
                        : "대기 중"}
                </small>
                {current && <p>현재 상태예요.</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <h3>활동 기록</h3>
      <div className="rb-events">
        {d.events.map((e) => (
          <article key={e.id}>
            <strong>{e.actorName || "참여자"}</strong>
            <time>{date(e.createdAt)}</time>
            <p>
              {(e.kind === "status" && e.status
                ? `${stages[e.status]} · ${e.body || "진행 상태를 변경했어요."}`
                : e.body) ||
                (e.status
                  ? `${stages[e.status]} 단계로 변경했어요.`
                  : e.kind === "created"
                    ? "요청을 등록했어요."
                    : e.kind === "assignment"
                      ? "담당자를 변경했어요."
                      : "요청 정보를 업데이트했어요.")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
  if (!project)
    return (
      <main className="rb-page">
        <button className="rb-back" onClick={onBack}>
          ← 프로젝트 목록
        </button>
        <h1>프로젝트에 접근할 수 없어요</h1>
        <p>초대를 수락한 프로젝트에서 요청을 확인할 수 있어요.</p>
      </main>
    );
  return (
    <div
      className={`rb-shell ${suffix[1] === "conversation" && detail && !loading ? "rb-chat-open" : ""}`}
    >
      {(requestId || isNew) && (
        <header className="rb-header">
          <div>
            <button
              className="rb-back"
              aria-label="뒤로가기"
              onClick={() => (requestId || isNew ? go(base) : onBack())}
            >
              ←
            </button>
            <strong>
              {isNew
                ? user.accountType === "team"
                  ? "개발 요청 작성"
                  : "고객 요청 작성"
                : requestId
                  ? suffix[1] === "timeline"
                    ? "진행 현황 타임라인"
                    : "요청 상세"
                  : "프로젝트 요청"}
            </strong>
          </div>
          <a href="/" className="rb-brand">
            bridgain<span>.</span>
          </a>
        </header>
      )}
      <main className="rb-page">
        {error && (
          <div className="rb-alert" role="alert">
            {error}
            <button onClick={() => void run(refresh)} disabled={busy}>
              다시 불러오기
            </button>
          </div>
        )}
        {notice && (
          <p className="rb-notice" role="status">
            {notice}
          </p>
        )}
        {retryFiles.length > 0 && requestId === retryRequestId && (
          <div className="rb-panel">
            <p>업로드 대기: {retryFiles.map((f) => f.name).join(", ")}</p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await upload(requestId!, retryFiles);
                  setRetryFiles([]);
                  setNotice("첨부 파일을 저장했어요.");
                  await refresh();
                })
              }
            >
              첨부 파일 다시 올리기
            </button>
          </div>
        )}
        {isNew ? (
          <form onSubmit={submit} className="rb-create">
            <fieldset disabled={busy || !canCreate} className="rb-form-content">
              <div className="rb-heading">
                <span className="rb-eyebrow">NEW REQUEST</span>
                <h1>
                  {user.accountType === "team"
                    ? "개발 요청 작성"
                    : "새로운 요청 작성"}
                </h1>
                <p>
                  {user.accountType === "team"
                    ? "개선할 내용과 근거를 적고 회의 또는 긴급 승인으로 검토를 요청하세요."
                    : "필요한 내용을 알려주세요. 개발팀과 함께 해결해 나가요."}
                </p>
              </div>
              <div className="rb-create-grid">
                <section className="rb-panel rb-fields">
                  <label>
                    프로젝트
                    <select
                      value={project.id}
                      onChange={(e) =>
                        go(`/projects/${e.target.value}/requests/new`)
                      }
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    요청 제목
                    <input
                      required
                      maxLength={160}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="예: 카카오 로그인 가이드 추가 요청"
                    />
                  </label>
                  <fieldset>
                    <legend>요청 유형</legend>
                    <div className="rb-segments">
                      {Object.entries(types).map(([key, label]) => (
                        <button
                          type="button"
                          key={key}
                          aria-pressed={type === key}
                          className={type === key ? "selected" : ""}
                          onClick={() => setType(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>우선순위</legend>
                    <div className="rb-pills">
                      {Object.entries(priorities).map(([key, label]) => (
                        <button
                          type="button"
                          key={key}
                          aria-pressed={priority === key}
                          className={priority === key ? "selected" : ""}
                          onClick={() => setPriority(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label>
                    상세 설명
                    <textarea
                      required
                      maxLength={10000}
                      rows={8}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="어떤 기능이 필요한가요? 기대하는 동작과 현재 상황을 구체적으로 적어주세요."
                    />
                  </label>
                </section>
                <aside>
                  <section className="rb-panel">
                    <h2>
                      첨부 파일 및 스크린샷 <small>선택</small>
                    </h2>
                    <label
                      className="rb-drop"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        addFiles(Array.from(e.dataTransfer.files));
                      }}
                    >
                      <span className="rb-upload-icon">↥</span>
                      <strong>파일을 드래그하거나 클릭하여 첨부</strong>
                      <span>PDF, JPG, PNG · 최대 5개 / 전체 20MB</span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png"
                        aria-label="첨부 파일 선택"
                        onChange={(e) => {
                          addFiles(Array.from(e.target.files || []));
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <ul className="rb-files">
                      {files.map((f, i) => (
                        <li key={`${f.name}-${i}`}>
                          <span>
                            {f.name}
                            <small>
                              {(f.size / 1024 / 1024).toFixed(1)} MB
                            </small>
                          </span>
                          <button
                            type="button"
                            aria-label={`${f.name} 삭제`}
                            onClick={() =>
                              setFiles(files.filter((_, j) => i !== j))
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="rb-tip">
                      <strong>이렇게 작성하면 좋아요</strong>
                      <p>
                        버그라면 문제가 생긴 순서와 기대한 결과를 적어주세요.
                        화면을 첨부하면 이해하기 쉬워요.
                      </p>
                    </div>
                  </section>
                </aside>
              </div>
              <footer className="rb-submit">
                <button
                  className="rb-primary"
                  disabled={busy || !title.trim() || !description.trim()}
                >
                  {busy ? "제출 중…" : "요청 제출하기"}
                </button>
              </footer>
            </fieldset>
          </form>
        ) : loading ? (
          <p className="rb-muted" role="status">
            요청을 불러오는 중이에요…
          </p>
        ) : requestId && detail ? (
          <>
            <div className="rb-heading">
              <span className="rb-eyebrow">{project.name}</span>
              <div className="rd-status-row">
                <span className="rb-badge">
                  {stages[stage(detail.request)]}
                </span>
                <span title={detail.request.id}>
                  요청 ID #{detail.request.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
              <div className="rc-title-row">
                <h1>{detail.request.title}</h1>
                <button
                  type="button"
                  className="rc-title-action"
                  aria-label="대화 열기"
                  title="대화 열기"
                  aria-pressed={suffix[1] === "conversation"}
                  onClick={() => go(`${base}/${requestId}/conversation`)}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
                    <path d="M8 11h8M8 14h5" />
                  </svg>
                </button>
              </div>
            </div>
            <nav className="rb-tabs" aria-label="요청 상세 메뉴">
              <button
                className={!suffix[1] ? "selected" : ""}
                onClick={() => go(`${base}/${requestId}`)}
              >
                요청 상세
              </button>
              <button
                className={suffix[1] === "timeline" ? "selected" : ""}
                onClick={() => go(`${base}/${requestId}/timeline`)}
              >
                진행 타임라인
              </button>
            </nav>
            {suffix[1] === "timeline" ? (
              timeline(detail)
            ) : (
              <div className="rb-detail-grid rb-request-detail">
                <div>
                  {project && requestId && (
                    <button
                      className="ai-investigate"
                      type="button"
                      onClick={() =>
                        ai.investigate(project, requestId, detail.request.title)
                      }
                    >
                      AI 조사
                    </button>
                  )}
                  {onMeetings && requestId && !detail.request.taskId && (
                    <button type="button" onClick={() => onMeetings(requestId)}>
                      회의에 연결하기
                    </button>
                  )}
                  {onMeetings && requestId && !detail.request.taskId && (
                    <button type="button" onClick={() => setUrgent((v) => !v)}>
                      긴급 승인 요청
                    </button>
                  )}
                  {urgent && requestId && (
                    <UrgentApproval
                      canAssign={!project.rolesConfigured || !!project.permissions?.includes("tasks.assign")}
                      projectId={project.id}
                      requestId={requestId}
                      onDone={() => {
                        setUrgent(false);
                        void refresh();
                      }}
                    />
                  )}
                  {onTasks && project && (
                    <RequestTaskLinks
                      projectId={project.id}
                      requestId={requestId}
                      onTasks={onTasks}
                    />
                  )}
                  <section className="rb-panel">
                    <h2>연결된 회의 · 개발 업무</h2>
                    {detail.workflow?.meetings.map((m) => (
                      <p key={m.id}>
                        {m.title} ·{" "}
                        {m.decisionStatus === "final"
                          ? "최종안"
                          : "회의 논의 중"}
                      </p>
                    ))}
                    {detail.workflow?.tasks.map((t) => (
                      <div key={t.id}>
                        <strong>{t.title}</strong>
                        <p>
                          {
                            (
                              {
                                todo: "진행 전",
                                in_progress: "진행 중",
                                done: "개발 완료",
                                released: "배포 완료",
                              } as Record<string, string>
                            )[t.status]
                          }
                        </p>
                        {t.resultSummary && (
                          <p style={{ whiteSpace: "pre-wrap" }}>
                            {t.resultSummary}
                          </p>
                        )}
                      </div>
                    ))}
                    {!detail.workflow?.tasks.length &&
                      !detail.workflow?.meetings.length && (
                        <p>아직 연결된 회의나 업무가 없습니다.</p>
                      )}
                  </section>
                  <h2 className="rd-section-title">요청 내용</h2>
                  <section className="rb-panel">
                    <p className="rb-description">
                      {detail.request.description}
                    </p>
                    {detail.attachments.length > 0 && (
                      <>
                        <h3>첨부 파일</h3>
                        <ul className="rb-files">
                          {detail.attachments.map((a) => (
                            <li key={a.id}>
                              <a href={a.url} target="_blank" rel="noreferrer">
                                ↗ {a.name}
                              </a>
                              <small>
                                {(a.size / 1024 / 1024).toFixed(1)} MB
                              </small>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {detail.canUpload && detail.attachments.length < 5 && (
                      <label className="rb-attach-more">
                        ＋ 첨부 파일 추가
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png"
                          disabled={busy}
                          onChange={(e) => {
                            const selected = Array.from(e.target.files || []);
                            e.target.value = "";
                            if (!selected.length) return;
                            if (
                              selected.length + detail.attachments.length > 5 ||
                              selected.reduce((sum, f) => sum + f.size, 0) +
                                detail.attachments.reduce(
                                  (sum, f) => sum + f.size,
                                  0,
                                ) >
                                20 * 1024 * 1024
                            ) {
                              setError(
                                "첨부 파일은 최대 5개, 전체 20MB까지 올릴 수 있어요.",
                              );
                              return;
                            }
                            if (
                              selected.some(
                                (f) =>
                                  ![
                                    "application/pdf",
                                    "image/png",
                                    "image/jpeg",
                                  ].includes(f.type),
                              )
                            ) {
                              setError(
                                "PDF, JPG, PNG 파일만 첨부할 수 있어요.",
                              );
                              return;
                            }
                            setRetryFiles(selected);
                            setRetryRequestId(requestId);
                            void run(async () => {
                              await upload(requestId, selected);
                              setRetryFiles([]);
                              await refresh();
                              setNotice("첨부 파일을 저장했어요.");
                            });
                          }}
                        />
                      </label>
                    )}
                  </section>
                </div>
                <aside>
                  <h2 className="rd-section-title">담당 개발팀</h2>
                  <section className="rb-panel rd-team-panel">
                    {detail.request.assignees?.length ? (
                      <ul className="rd-people">
                        {detail.request.assignees.map((member) => (
                          <li key={member.userId}>
                            <span className="rd-avatar" aria-hidden="true">
                              {member.displayName.slice(0, 1)}
                            </span>
                            <div>
                              <strong>{member.displayName}</strong>
                              <span>요청 담당자</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rd-empty">
                        아직 담당자가 배정되지 않았어요.
                      </p>
                    )}
                    {detail.canAssign && (
                      <fieldset className="rb-assignees">
                        <legend>담당자 배정</legend>
                        {project.members
                          .filter((m) => m.accountType === "team")
                          .map((m) => (
                            <label key={m.userId}>
                              <input
                                type="checkbox"
                                checked={assigned.includes(m.userId)}
                                onChange={(e) =>
                                  setAssigned(
                                    e.target.checked
                                      ? [...assigned, m.userId]
                                      : assigned.filter(
                                          (id) => id !== m.userId,
                                        ),
                                  )
                                }
                              />
                              {m.displayName}
                            </label>
                          ))}
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await api(
                                `${base}/${requestId}`,
                                { assigneeIds: assigned },
                                "PATCH",
                              );
                              await refresh();
                              setNotice("담당자를 저장했어요.");
                            })
                          }
                        >
                          담당자 저장
                        </button>
                      </fieldset>
                    )}
                  </section>
                  <h2 className="rd-section-title">요청 요약 정보</h2>
                  <section className="rb-panel">
                    <dl className="rd-summary">
                      <div>
                        <dt>요청 유형</dt>
                        <dd>{types[detail.request.type]}</dd>
                      </div>
                      <div>
                        <dt>생성 일시</dt>
                        <dd>
                          {new Date(detail.request.createdAt).toLocaleString(
                            "ko-KR",
                            {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            },
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>요청자</dt>
                        <dd>{detail.request.creatorName}</dd>
                      </div>
                      <div>
                        <dt>우선순위</dt>
                        <dd>{priorities[detail.request.priority]}</dd>
                      </div>
                    </dl>
                  </section>
                </aside>
                <div className="rd-help">
                  <span aria-hidden="true">ⓘ</span>
                  <p>
                    담당 개발팀에게 질문이나 추가 내용을 전달하려면 상단의
                    말풍선 아이콘을 눌러주세요.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : !requestId ? (
          <>
            <div className="rb-heading rb-heading-row">
              <div>
                <span className="rb-eyebrow">PROJECT REQUESTS</span>
                <h1>{project.name}</h1>
                <p>요청을 모으고 진행 상황을 함께 확인하세요.</p>
              </div>
              <div className="rb-heading-actions">
                {canCreate &&
                  <button
                    className="rb-primary"
                    onClick={() => go(`${base}/new`)}
                  >
                    ＋ {user.accountType === "team" ? "개발 요청" : "고객 요청"}{" "}
                    작성
                  </button>
                }
              </div>
            </div>
            <div className="rb-stats rb-request-metrics">
              {[
                ["전체 요청", originRequests.length],
                ...["reviewing", "pending", "tasked"].map((key) => [
                  listStages[key],
                  originRequests.filter((r) => listStage(r) === key).length,
                ]),
              ].map(([label, count]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
            <nav className="rb-origin-tabs" aria-label="요청 종류">
              {(["customer", "development"] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={origin === value}
                  onClick={() => {
                    setOrigin(value);
                    setMineOnly(false);
                    setFilter("");
                    const url = new URL(window.location.href);
                    url.searchParams.set("origin", value);
                    window.history.replaceState(
                      window.history.state,
                      "",
                      url.pathname + url.search,
                    );
                  }}
                >
                  {value === "customer" ? "고객 요청" : "개발 요청"}
                  <span>
                    {
                      allRequests.filter(
                        (r) => (r.origin || "customer") === value,
                      ).length
                    }
                  </span>
                </button>
              ))}
            </nav>
            <div className="rb-request-filters">
              <input
                aria-label="요청 검색"
                placeholder="요청 제목 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="요청 상태 필터"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">전체 상태</option>
                {Object.entries(listStages).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="우선순위 필터"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="">전체 우선순위</option>
                {Object.entries(priorities).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              {origin === "development" && (
                <select
                  aria-label="작성자 필터"
                  value={mineOnly ? "mine" : "all"}
                  onChange={(e) => setMineOnly(e.target.value === "mine")}
                >
                  <option value="all">전체 작성자</option>
                  <option value="mine">내가 작성</option>
                </select>
              )}
            </div>
            <div className="rb-request-list-title">
              <h2>요청 목록</h2>
              <span>{visibleRequests.length}개</span>
            </div>
            <div className="rb-developer-table">
              <table>
                <thead>
                  <tr>
                    <th>
                      {origin === "development" ? "개발 요청" : "고객 요청"}
                    </th>
                    <th>우선순위</th>
                    <th>유형</th>
                    <th>요청일</th>
                    <th>상태</th>
                    <th>요청자</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRequests.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <button onClick={() => go(`${base}/${r.id}`)}>
                          {r.title}
                        </button>
                        <p>{r.description}</p>
                      </td>
                      <td>
                        <span
                          className={r.priority === "urgent" ? "rb-urgent" : ""}
                        >
                          {priorities[r.priority]}
                        </span>
                      </td>
                      <td>{types[r.type]}</td>
                      <td>
                        {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td>
                        <span className="rb-badge">
                          {listStages[listStage(r)]}
                        </span>
                      </td>
                      <td>{r.creatorName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!list.length && (
              <div className="rb-empty">
                <span>☷</span>
                <h2>아직 등록된 요청이 없어요</h2>
                <p>
                  {user.accountType === "client"
                    ? "첫 요청을 작성하고 개발팀과 이야기를 시작해보세요."
                    : origin === "development"
                      ? "개선·튜닝 등 필요한 작업을 개발 요청으로 등록해주세요."
                      : "의뢰자가 요청을 등록하면 여기에 표시돼요."}
                </p>
              </div>
            )}
            {list.length > 0 && visibleRequests.length === 0 && (
              <p className="rb-empty">검색 조건에 맞는 요청이 없어요.</p>
            )}
          </>
        ) : null}
      </main>
      {suffix[1] === "conversation" && requestId && detail && !loading && (
        <RequestConversation
          key={requestId}
          userId={user.id}
          title={detail.request.title}
          status={detail.request.status}
          assignees={detail.request.assignees.map((m) => m.displayName)}
          events={detail.events}
          onClose={() => go(`${base}/${requestId}`)}
          onSend={async (body) => {
            await api(`${base}/${requestId}/comments`, { body });
          }}
          onLoad={async () => {
            const latest = await api<Detail>(`${base}/${requestId}`);
            if (window.location.pathname === path) setDetail(latest);
            return latest.events;
          }}
        />
      )}
    </div>
  );
}
