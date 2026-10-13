import { useEffect, useState, useRef, type FormEvent } from "react";
import "./project-resources.css";
export type ResourceSection = "meetings" | "documents" | "activity";
type Plan = {
  requestId: string;
  planning: string;
  uiNotes: string;
  apiNotes: string;
  dbNotes: string;
  priority: string;
  assigneeIds: string[];
  taskId?: string | null;
};
type Meeting = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  location: string;
  notes: string;
  status: string;
  decisionStatus: "draft" | "final";
  requests: Plan[];
};
type Version = {
  id: string;
  title: string;
  content: string;
  category: string;
  url: string | null;
  changeSummary: string;
  taskId: string | null;
  actorName: string;
  createdAt: string;
};
type Document = {
  id: string;
  title: string;
  category: string;
  content: string;
  url: string | null;
  creatorName: string;
  updatedAt: string;
  versions: Version[];
};
type Event = {
  id: string;
  kind: string;
  body: string;
  actorName: string;
  createdAt: string;
};
type Task = { id: string; title: string };
type Request = { id: string; title: string };
type Member = { userId: string; displayName: string; accountType: string };
const categories: Record<string, string> = {
  plan: "기획 / 요구사항",
  design: "디자인",
  erd: "ERD / DB 설계",
  api: "API 명세",
  frontend: "프론트 설계",
  meeting: "회의록",
  other: "기타",
};
const priorities: Record<string, string> = {
  urgent: "긴급",
  high: "높음",
  normal: "보통",
  low: "낮음",
};
async function api<T>(
  path: string,
  body?: object,
  method = "POST",
): Promise<T> {
  const signal = AbortSignal.timeout(20000);
  const headers: Record<string, string> = {};
  if (body) {
    const r = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      signal,
    });
    if (!r.ok) throw Error("로그인 상태를 확인해주세요.");
    headers["X-CSRF-Token"] = (await r.json()).csrfToken;
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(`/api/workspace${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    method: body ? method : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.message || "처리하지 못했어요.");
  return data;
}
export default function ProjectResources({
  projectId,
  section,
  refreshKey,
  onChanged,
  members = [],
  onTask,
}: {
  projectId: string;
  section: ResourceSection;
  refreshKey?: number;
  onChanged: () => void;
  members?: Member[];
  onTask?: (taskId: string) => void;
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([]),
    [documents, setDocuments] = useState<Document[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [requests, setRequests] = useState<Request[]>([]),
    [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null),
    [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [url, setUrl] = useState(""),
    [category, setCategory] = useState("plan"),
    [when, setWhen] = useState(""),
    [duration, setDuration] = useState(60),
    [location, setLocation] = useState(""),
    [status, setStatus] = useState("scheduled"),
    [decision, setDecision] = useState<"draft" | "final">("draft"),
    [plans, setPlans] = useState<Plan[]>([]),
    [summary, setSummary] = useState(""),
    [taskId, setTaskId] = useState("");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("");
  const saveLock = useRef(false);
  const base = `/projects/${projectId}`;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setEditing(null);
    setQuery("");
    setFilter("");
    Promise.all([
      api<{ meetings?: Meeting[]; documents?: Document[]; events?: Event[] }>(
        `${base}/${section}`,
      ),
      section === "activity"
        ? Promise.resolve({ requests: [] as Request[] })
        : api<{ requests: Request[] }>(`${base}/requests`),
      section === "documents"
        ? api<{ tasks: Task[] }>(`${base}/tasks`)
        : Promise.resolve({ tasks: [] as Task[] }),
    ])
      .then(([d, r, t]) => {
        if (active) {
          setMeetings(d.meetings || []);
          setDocuments(d.documents || []);
          setEvents(d.events || []);
          setRequests(r.requests);
          setTasks(t.tasks);
        }
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
  }, [base, section, reload, refreshKey]);
  function edit(item?: Meeting | Document) {
    setError("");
    setEditing(item?.id || "new");
    setTitle(item?.title || "");
    setContent(item ? ("notes" in item ? item.notes : item.content) : "");
    setUrl(item && "url" in item ? item.url || "" : "");
    setCategory(item && "category" in item ? item.category : "plan");
    setLocation(item && "location" in item ? item.location : "");
    setStatus(item && "status" in item ? item.status : "scheduled");
    setDecision(
      item && "decisionStatus" in item ? item.decisionStatus : "draft",
    );
    setPlans(
      item && "requests" in item
        ? item.requests.map((p) => ({ ...p, assigneeIds: [...p.assigneeIds] }))
        : [],
    );
    setDuration(item && "durationMinutes" in item ? item.durationMinutes : 60);
    setSummary("");
    setTaskId("");
    const d =
      item && "scheduledAt" in item ? new Date(item.scheduledAt) : new Date();
    setWhen(
      new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
  }
  useEffect(() => {
    if (loading || error) return;
    if (section === "documents") {
      const raw = window.sessionStorage.getItem("bridgain-document-version");
      if (raw) {
        window.sessionStorage.removeItem("bridgain-document-version");
        try {
          const target = JSON.parse(raw);
          const item = documents.find((d) => d.id === target.documentId);
          if (item) {
            edit(item);
            setTimeout(
              () =>
                document
                  .getElementById(target.versionId)
                  ?.scrollIntoView({ block: "center" }),
              0,
            );
          }
        } catch {
          /* stale navigation */
        }
      }
    }
    if (section === "meetings") {
      const rid = window.sessionStorage.getItem("bridgain-meeting-request");
      if (rid && requests.some((r) => r.id === rid)) {
        window.sessionStorage.removeItem("bridgain-meeting-request");
        edit();
        setPlans([
          {
            requestId: rid,
            planning: "",
            uiNotes: "",
            apiNotes: "",
            dbNotes: "",
            priority: "normal",
            assigneeIds: [],
          },
        ]);
      }
    }
  }, [loading, section, documents, requests]);
  const locked =
    section === "meetings" &&
    meetings.find((m) => m.id === editing)?.decisionStatus === "final";
  async function completeMeeting() {
    if (saveLock.current || !editing) return;
    saveLock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(
        `${base}/meetings/${editing}`,
        { status: "completed" },
        "PATCH",
      );
      setStatus("completed");
      setMeetings((current) =>
        current.map((m) =>
          m.id === editing ? { ...m, status: "completed" } : m,
        ),
      );
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "회의 완료 처리에 실패했어요.",
      );
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }
  function patchPlan(id: string, change: Partial<Plan>) {
    setPlans((current) =>
      current.map((p) => (p.requestId === id ? { ...p, ...change } : p)),
    );
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (saveLock.current || locked) return;
    saveLock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(
        `${base}/${section}${editing === "new" ? "" : `/${editing}`}`,
        section === "meetings"
          ? {
              title,
              scheduledAt: new Date(when).toISOString(),
              durationMinutes: duration,
              location,
              notes: content,
              status,
              decisionStatus: decision,
              requests: plans,
            }
          : {
              title,
              category,
              content,
              url,
              changeSummary: summary || (editing === "new" ? "최초 작성" : ""),
              taskId: taskId || null,
            },
        editing === "new" ? "POST" : "PATCH",
      );
      setEditing(null);
      setReload((v) => v + 1);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }
  const label =
    section === "meetings"
      ? "회의실"
      : section === "documents"
        ? "문서"
        : "활동 기록";
  const currentDocument = documents.find((d) => d.id === editing);
  return (
    <div className="pr-page">
      <header className="pr-heading">
        <div>
          <span>PROJECT WORKSPACE</span>
          <h1>{label}</h1>
          <p>
            {section === "meetings"
              ? "고객 요청을 논의하고 최종안에서 개발 업무로 할당하세요."
              : section === "documents"
                ? "최신 설계와 업무별 변경 이력을 관리하세요."
                : "프로젝트의 최근 변경 내역이에요."}
          </p>
        </div>
        {section !== "activity" && !editing && (
          <button
            className="pr-primary"
            disabled={loading || busy}
            onClick={() => edit()}
          >
            ＋ {section === "meetings" ? "회의 생성" : "새 문서"}
          </button>
        )}
      </header>
      {error && (
        <p className="pr-error" role="alert">
          {error}{" "}
          {!editing && (
            <button onClick={() => setReload((v) => v + 1)}>다시 시도</button>
          )}
        </p>
      )}
      {editing ? (
        <>
          <form className="pr-editor" onSubmit={save}>
            <h2>{section === "meetings" ? "회의 정보" : "문서 작성"}</h2>
            {locked && (
              <p>
                확정된 최종안입니다. 연결된 요청별 업무가 생성되었으며, 변경
                사항은 후속 회의에서 논의하세요.
              </p>
            )}
            <fieldset disabled={busy || locked}>
              <label>
                제목
                <input
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              {section === "meetings" ? (
                <>
                  <div className="pr-form-grid">
                    <label>
                      시작 일시
                      <input
                        required
                        type="datetime-local"
                        value={when}
                        onChange={(e) => setWhen(e.target.value)}
                      />
                    </label>
                    <label>
                      소요 시간 (분)
                      <input
                        type="number"
                        min={15}
                        max={480}
                        required
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      장소 / 회의 링크
                      <input
                        maxLength={1000}
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                      />
                    </label>
                    <label>
                      회의 상태
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="scheduled">예정</option>
                        <option value="completed">회의 완료</option>
                      </select>
                    </label>
                    <label>
                      결정 상태
                      <select
                        value={decision}
                        onChange={(e) => {
                          const next = e.target.value as "draft" | "final";
                          setDecision(next);
                          if (next === "draft")
                            setPlans((p) =>
                              p.map((x) => ({
                                ...x,
                                assigneeIds: [],
                                priority: "normal",
                              })),
                            );
                        }}
                      >
                        <option value="draft">작성 중</option>
                        <option value="final">
                          최종안 · 저장 시 업무 생성
                        </option>
                      </select>
                    </label>
                  </div>
                  <h3>연결할 고객 요청</h3>
                  {requests.map((r) => (
                    <label key={r.id}>
                      <input
                        type="checkbox"
                        checked={plans.some((p) => p.requestId === r.id)}
                        onChange={(e) =>
                          setPlans((p) =>
                            e.target.checked
                              ? [
                                  ...p,
                                  {
                                    requestId: r.id,
                                    planning: "",
                                    uiNotes: "",
                                    apiNotes: "",
                                    dbNotes: "",
                                    priority: "normal",
                                    assigneeIds: [],
                                  },
                                ]
                              : p.filter((x) => x.requestId !== r.id),
                          )
                        }
                      />
                      {r.title}
                    </label>
                  ))}
                  {!requests.length && <p>연결할 고객 요청이 없어요.</p>}
                  {plans.map((p) => (
                    <section className="pr-editor" key={p.requestId}>
                      <h3>
                        {requests.find((r) => r.id === p.requestId)?.title ||
                          p.requestId}
                      </h3>
                      {(
                        [
                          ["planning", "기획 · 결정사항"],
                          ["uiNotes", "화면 UI 구상"],
                          ["apiNotes", "API · 데이터 처리"],
                          ["dbNotes", "DB 설계"],
                        ] as const
                      ).map(([key, text]) => (
                        <label key={key}>
                          {text}
                          <textarea
                            maxLength={10000}
                            required={
                              key === "planning" && decision === "final"
                            }
                            value={p[key]}
                            onChange={(e) =>
                              patchPlan(p.requestId, { [key]: e.target.value })
                            }
                          />
                        </label>
                      ))}
                      <fieldset disabled={decision !== "final"}>
                        <legend>최종안 업무 할당</legend>
                        <label>
                          우선순위
                          <select
                            value={p.priority}
                            onChange={(e) =>
                              patchPlan(p.requestId, {
                                priority: e.target.value,
                              })
                            }
                          >
                            {Object.entries(priorities).map(([v, t]) => (
                              <option key={v} value={v}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </label>
                        {members
                          .filter((m) => m.accountType === "team")
                          .map((m) => (
                            <label key={m.userId}>
                              <input
                                type="checkbox"
                                checked={p.assigneeIds.includes(m.userId)}
                                onChange={(e) =>
                                  patchPlan(p.requestId, {
                                    assigneeIds: e.target.checked
                                      ? [...p.assigneeIds, m.userId]
                                      : p.assigneeIds.filter(
                                          (id) => id !== m.userId,
                                        ),
                                  })
                                }
                              />
                              {m.displayName}
                            </label>
                          ))}
                      </fieldset>
                      {p.taskId && (
                        <button
                          type="button"
                          onClick={() => onTask?.(p.taskId!)}
                        >
                          생성된 개발 업무 열기
                        </button>
                      )}
                    </section>
                  ))}
                </>
              ) : (
                <>
                  <div className="pr-form-grid">
                    <label>
                      분류
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {Object.entries(categories).map(([v, t]) => (
                          <option key={v} value={v}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      참고 링크
                      <input
                        type="url"
                        value={url}
                        maxLength={2000}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </label>
                    <label>
                      관련 개발 업무
                      <select
                        value={taskId}
                        onChange={(e) => setTaskId(e.target.value)}
                      >
                        <option value="">연결 없음</option>
                        {tasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    변경 요약
                    <input
                      required={editing !== "new"}
                      maxLength={1000}
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder={
                        editing === "new"
                          ? "최초 작성"
                          : "이번 수정으로 바뀐 내용"
                      }
                    />
                  </label>
                </>
              )}
              <label>
                {section === "meetings" ? "회의 전체 메모" : "문서 내용"}
                <textarea
                  rows={10}
                  maxLength={section === "documents" ? 50000 : 20000}
                  required={section === "documents"}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </label>
            </fieldset>
            <footer>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                {locked ? "닫기" : "취소"}
              </button>
              {locked && status !== "completed" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void completeMeeting()}
                >
                  회의 완료 처리
                </button>
              )}
              {!locked && (
                <button className="pr-primary" disabled={busy || !title.trim()}>
                  {busy
                    ? "저장 중…"
                    : section === "meetings" && decision === "final"
                      ? "최종안 확정 · 업무 생성"
                      : "저장하기"}
                </button>
              )}
            </footer>
          </form>
          {locked && (
            <section className="pr-editor">
              <h3>최종안에서 생성된 업무</h3>
              {plans
                .filter((p) => p.taskId)
                .map((p) => (
                  <p key={p.requestId}>
                    <button type="button" onClick={() => onTask?.(p.taskId!)}>
                      {requests.find((r) => r.id === p.requestId)?.title ||
                        "개발 업무"}{" "}
                      열기 →
                    </button>
                  </p>
                ))}
            </section>
          )}
          {currentDocument && (
            <section className="pr-editor">
              <h2>문서 변경 이력</h2>
              {currentDocument.versions.map((v, i) => (
                <details id={v.id} key={v.id} open>
                  <summary>
                    {currentDocument.versions.length - i}번째 기록 ·{" "}
                    {v.changeSummary} · {v.actorName} ·{" "}
                    {new Date(v.createdAt).toLocaleString("ko-KR")}
                  </summary>
                  <h3>{v.title}</h3>
                  <p>{categories[v.category]}</p>
                  {v.taskId && (
                    <button type="button" onClick={() => onTask?.(v.taskId!)}>
                      관련 업무:{" "}
                      {tasks.find((t) => t.id === v.taskId)?.title || v.taskId}
                    </button>
                  )}
                  {v.url && /^https?:\/\//i.test(v.url) && (
                    <a href={v.url} target="_blank" rel="noreferrer">
                      참고 링크
                    </a>
                  )}
                  <pre style={{ whiteSpace: "pre-wrap" }}>{v.content}</pre>
                </details>
              ))}
              {!currentDocument.versions.length && (
                <p>다음 수정부터 이전 버전도 함께 보관합니다.</p>
              )}
            </section>
          )}
        </>
      ) : loading ? (
        <p role="status">불러오는 중…</p>
      ) : (
        !error && (
          <>
            {section === "activity" ? (
              <div className="pr-events">
                {events.map((e, i) => (
                  <article key={`${e.id}-${i}`}>
                    <div>
                      <strong>{e.actorName}</strong>
                      <p>{e.body}</p>
                      <time>
                        {new Date(e.createdAt).toLocaleString("ko-KR")}
                      </time>
                    </div>
                  </article>
                ))}
                {!events.length && <p>아직 기록된 활동이 없어요.</p>}
              </div>
            ) : (
              <>
                <div className="pr-toolbar">
                  <input
                    aria-label={`${label} 검색`}
                    placeholder="제목 검색"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <select
                    aria-label="분류 필터"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="">전체</option>
                    {section === "documents" ? (
                      Object.entries(categories).map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="scheduled">예정</option>
                        <option value="completed">회의 완료</option>
                      </>
                    )}
                  </select>
                </div>
                {section === "meetings" ? (
                  <div className="pr-meeting-grid">
                    {meetings
                      .filter(
                        (m) =>
                          m.title.toLowerCase().includes(query.toLowerCase()) &&
                          (!filter || m.status === filter),
                      )
                      .map((m) => (
                        <article className="pr-card" key={m.id}>
                          <span>
                            {m.decisionStatus === "final"
                              ? "최종안"
                              : "작성 중"}{" "}
                            · 요청 {m.requests.length}개
                          </span>
                          <h2>
                            <button onClick={() => edit(m)}>{m.title}</button>
                          </h2>
                          <time>
                            {new Date(m.scheduledAt).toLocaleString("ko-KR")}
                          </time>
                          <p>
                            {m.durationMinutes}분 · {m.location || "장소 미정"}
                          </p>
                          <div className="pr-notes">{m.notes}</div>
                          <button onClick={() => edit(m)}>
                            요청 · 결정사항 보기 →
                          </button>
                        </article>
                      ))}
                  </div>
                ) : (
                  <div className="pr-documents">
                    {documents
                      .filter(
                        (d) =>
                          d.title.toLowerCase().includes(query.toLowerCase()) &&
                          (!filter || d.category === filter),
                      )
                      .map((d) => (
                        <article className="pr-document" key={d.id}>
                          <div>
                            <button
                              className="pr-document-title"
                              onClick={() => edit(d)}
                            >
                              {d.title}
                            </button>
                            <p>
                              {categories[d.category]} · {d.creatorName} · 이력{" "}
                              {d.versions.length}개
                            </p>
                          </div>
                          {d.url && /^https?:\/\//i.test(d.url) && (
                            <a href={d.url} target="_blank" rel="noreferrer">
                              참고 링크 ↗
                            </a>
                          )}
                        </article>
                      ))}
                  </div>
                )}
              </>
            )}
          </>
        )
      )}
    </div>
  );
}
