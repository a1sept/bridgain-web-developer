import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import FilterBar from "./components/FilterBar";
import ControlIcon from "./components/ControlIcon";
import "./project-resources.css";
import "./activity-preview.css";
import "./activity-history.css";
type LinkedRequest = {
  id: string;
  title: string;
  origin: string;
  projectId?: string;
};
type Event = {
  id: string;
  projectId: string;
  projectName: string;
  kind: string;
  category: string;
  title: string;
  body: string;
  actorName: string;
  occurredAt: string;
  requests: LinkedRequest[];
  meetingId: string | null;
  taskId: string | null;
};
type Page = { events: Event[]; nextCursor: string | null };
type Options = {
  projects: { id: string; name: string }[];
  requests: LinkedRequest[];
  members: { id: string; displayName: string; projectId: string }[];
};
type Detail = {
  event: Event;
  meeting: null | {
    id: string;
    title: string;
    status: string;
    scheduledAt: string;
    durationMinutes: number;
    location: string;
    notes: string;
    startedAt: string | null;
    endedAt: string | null;
  };
  requests: LinkedRequest[];
};
const labels: Record<string, string> = {
  request_created: "요청 등록",
  meeting_scheduled: "회의 예정 등록",
  meeting_started: "회의 시작",
  meeting_completed: "회의 완료",
  meeting_reopened: "회의 완료 취소",
  meeting_deleted: "회의 삭제",
  request_linked: "요청 연결",
  request_unlinked: "요청 연결 해제",
  request_transferred: "요청의 회의 이동",
  task_assigned: "업무 배정",
  task_started: "작업 시작",
  task_completed: "담당자 작업 완료",
  task_approved: "작업 승인",
  task_review_requested: "작업 검토 요청",
  task_changes_requested: "재작업 요청",
  task_invalidated: "작업 승인 무효화",
  task_status_changed: "업무 상태 변경",
  qa_started: "QA 테스트 시작",
  qa_completed: "QA 담당자 작업 완료",
  deploy_ready: "배포 준비 중 · 메인 머지 완료",
  deploy_completed: "배포 완료",
  deploy_failed: "배포 실패",
};
const categories = [
  { value: "request", label: "요청" },
  { value: "meeting", label: "회의" },
  { value: "task", label: "업무·검토" },
  { value: "deployment", label: "배포" },
];
function time(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function color(id: string): CSSProperties {
  const palette = [
    ["#536ed3", "#eff2ff", "#d8dff7"],
    ["#8a59b8", "#f6f0fc", "#e1d1ef"],
    ["#27836c", "#edf7f3", "#c9e7df"],
    ["#a76c2a", "#faf4eb", "#ecddc6"],
  ];
  const n = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  return {
    "--project-color": palette[n][0],
    "--project-soft": palette[n][1],
    "--project-border": palette[n][2],
  } as CSSProperties;
}
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/workspace/activity${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const data = await response
    .json()
    .catch(() => ({ message: "활동 기록을 불러오지 못했습니다." }));
  if (!response.ok)
    throw Error(data.message || "활동 기록을 불러오지 못했습니다.");
  return data;
}
function errorText(e: unknown) {
  return e instanceof Error ? e.message : "활동 기록을 불러오지 못했습니다.";
}
function Timeline({
  requestId,
  selectedId,
  projectId,
}: {
  requestId: string;
  selectedId: string;
  projectId?: string;
}) {
  const [page, setPage] = useState<Page>({ events: [], nextCursor: null });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const load = async (cursor?: string) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    try {
      const next = await get<Page>(
        `?${new URLSearchParams({ requestId, ...(projectId ? {projectIds:projectId} : {}), order: "asc", ...(cursor ? { cursor } : {}) })}`,
        c.signal,
      );
      if (!c.signal.aborted)
        setPage((old) => ({
          events: cursor ? [...old.events, ...next.events] : next.events,
          nextCursor: next.nextCursor,
        }));
    } catch (e) {
      if (!c.signal.aborted) setError(errorText(e));
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };
  useEffect(() => {
    setPage({ events: [], nextCursor: null });
    void load();
    return () => controller.current?.abort();
  }, [requestId, projectId, retry]);
  return (
    <>
      <p className="ah-history-caption">진행 이력 · 과거 → 현재</p>
      <ol className="ah-project-timeline">
        {page.events.map((e) => (
          <li
            key={e.id}
            className={e.id === selectedId ? "is-current" : ""}
            aria-current={e.id === selectedId ? "step" : undefined}
          >
            <span className="ah-timeline-dot" aria-hidden="true" />
            <article>
              <div className="ah-step-heading">
                <strong>{labels[e.kind] || e.kind}</strong>
                {e.id === selectedId && (
                  <span className="ah-selected-label">선택한 기록</span>
                )}
              </div>
              <h3>{e.title}</h3>
              {e.body && <p>{e.body}</p>}
              <footer>
                {e.actorName} · {time(e.occurredAt)}
              </footer>
            </article>
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            className="ah-small"
            onClick={() =>
              page.nextCursor
                ? void load(page.nextCursor)
                : setRetry((n) => n + 1)
            }
          >
            다시 시도
          </button>
        </p>
      )}
      {busy && <p role="status">이력을 불러오는 중…</p>}
      {!busy && !error && !page.events.length && <p>저장된 이력이 없습니다.</p>}
      {page.nextCursor && !busy && (
        <button
          className="ah-small"
          onClick={() => void load(page.nextCursor!)}
        >
          이력 더 보기
        </button>
      )}
    </>
  );
}
type ActivityHistoryProps = {
  currentUser: { id: string; displayName: string };
  refreshKey: number;
  project?: {id: string; name: string};
};
export default function ActivityHistory(props: ActivityHistoryProps) {
  // Reset filters, detail and in-flight requests when the navigation scope changes.
  return <ActivityHistoryView key={props.project?.id || "all-projects"} {...props} />;
}
function ActivityHistoryView({currentUser, refreshKey, project}: ActivityHistoryProps) {
  const [projects, setProjects] = useState<string[]>([]),
    [request, setRequest] = useState(""),
    [assignee, setAssignee] = useState(""),
    [category, setCategory] = useState("");
  const [options, setOptions] = useState<Options>({
    projects: [],
    requests: [],
    members: [],
  });
  const [optionError, setOptionError] = useState("");
  const [page, setPage] = useState<Page>({ events: [], nextCursor: null }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Event | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [detailError, setDetailError] = useState(""),
    [detailRetry, setDetailRetry] = useState(0),
    [expanded, setExpanded] = useState<string | null>(null),
    [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const root = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    trigger = useRef<HTMLButtonElement | null>(null),
    listController = useRef<AbortController | null>(null);
  const projectIds = project ? project.id : projects.join(",");
  const query = new URLSearchParams({
    ...(projectIds ? { projectIds } : {}),
    ...(request ? { requestId: request } : {}),
    ...(assignee ? { assigneeId: assignee } : {}),
    ...(category ? { category } : {}),
  }).toString();
  const load = async (cursor?: string) => {
    listController.current?.abort();
    const c = new AbortController();
    listController.current = c;
    setBusy(true);
    setError("");
    try {
      const next = await get<Page>(
        `?${query}${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`,
        c.signal,
      );
      if (!c.signal.aborted)
        setPage((old) => ({
          events: cursor ? [...old.events, ...next.events] : next.events,
          nextCursor: next.nextCursor,
        }));
    } catch (e) {
      if (!c.signal.aborted) setError(errorText(e));
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };
  useEffect(() => {
    setSelected(null);
    setDetail(null);
    setPage({ events: [], nextCursor: null });
    void load();
    return () => listController.current?.abort();
  }, [query, retry, refreshKey]);
  useEffect(() => {
    const c = new AbortController();
    setOptionError("");
    get<Options>(
      `/options?${new URLSearchParams({ projectIds })}`,
      c.signal,
    )
      .then((next) => {
        if (c.signal.aborted) return;
        setOptions(next);
        setRequest((old) =>
          next.requests.some((r) => r.id === old) ? old : "",
        );
        setAssignee((old) =>
          next.members.some((m) => m.id === old) ? old : "",
        );
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setOptions({ projects: [], requests: [], members: [] });
          setOptionError(errorText(e));
        }
      });
    return () => c.abort();
  }, [projectIds, retry, refreshKey]);
  useEffect(() => {
    if (!selected) return;
    const c = new AbortController();
    setDetail(null);
    setDetailError("");
    get<Detail>("/" + selected.id, c.signal)
      .then(next => { if (!c.signal.aborted) setDetail(next); })
      .catch((e) => {
        if (!c.signal.aborted) setDetailError(errorText(e));
      });
    return () => c.abort();
  }, [selected?.id, detailRetry]);
  function close() {
    setSelected(null);
    trigger.current?.focus({ preventScroll: true });
  }
  useLayoutEffect(() => {
    const node = root.current,
      content = node?.closest(".ds-content"),
      tabs = content?.querySelector(".ds-project-tabs") || content?.querySelector(".pw-topbar"),
      mobileBar = document.querySelector(".ds-mobile-bar");
    if (!node || !content) return;
    const update = () => {
      node.style.setProperty("--history-page-top", `${node.getBoundingClientRect().top + window.scrollY}px`);
      node.style.setProperty(
        "--history-panel-top",
        `${Math.max(0, tabs?.getBoundingClientRect().bottom || 0, mobileBar?.getBoundingClientRect().bottom || 0)}px`,
      );
      node.style.setProperty(
        "--history-content-left",
        `${Math.max(0, content.getBoundingClientRect().left)}px`,
      );
    };
    window.scrollTo({top: 0, behavior: "instant"});
    update();
    const observer = new ResizeObserver(update);
    if (tabs) observer.observe(tabs);
    if (mobileBar) observer.observe(mobileBar);
    observer.observe(content);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [project?.id]);
  useEffect(() => {
    if (!selected) return;
    heading.current?.focus({ preventScroll: true });
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        close();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [selected?.id]);
  const members = [
    ...new Map(options.members.map((m) => [m.id, m])).values(),
  ].sort(
    (a, b) =>
      Number(b.id === currentUser.id) - Number(a.id === currentUser.id) ||
      a.displayName.localeCompare(b.displayName, "ko"),
  );
  function open(e: Event, button: HTMLButtonElement, rid?: string) {
    trigger.current = button;
    setSelected(e);
    setExpanded(
      rid ?? (e.category === "meeting" ? null : (e.requests[0]?.id ?? null)),
    );
  }
  return (
    <main
      ref={root}
      className={`pr-page ah-page${selected ? " has-history-panel" : ""}`}
    >
      <header className="pr-heading">
        <div>
          <span>{project ? "PROJECT HISTORY" : "WORKSPACE HISTORY"}</span>
          <h1>활동 기록</h1>
          <p>{project ? `${project.name}의 요청·회의·업무·배포 이력을 확인하세요.` : "접근 가능한 모든 프로젝트의 활동을 모아 확인하세요."}</p>
        </div>
      </header>
      <FilterBar
        label="활동 기록 필터"
        filters={[
          ...(!project ? [{
            id: "project",
            label: "프로젝트",
            multiple: true,
            values: projects,
            options: options.projects.map((p) => ({
              value: p.id,
              label: p.name,
            })),
            onChange: (ids: string[]) => setProjects(ids),
          }] : []),
          {
            id: "request",
            label: "요청",
            values: request ? [request] : [],
            options: options.requests.map((r) => ({
              value: r.id,
              label: `${r.origin === "development" ? "개발" : "고객"} · ${r.title}`,
            })),
            onChange: (v) => setRequest(v[0] || ""),
          },
          {
            id: "account",
            label: "담당 영역",
            values: assignee ? [assignee] : [],
            options: members.map((m) => ({
              value: m.id,
              label: m.displayName + (m.id === currentUser.id ? " (나)" : ""),
            })),
            onChange: (v) => setAssignee(v[0] || ""),
          },
          {
            id: "category",
            label: "활동 유형",
            values: category ? [category] : [],
            options: categories,
            onChange: (v) => setCategory(v[0] || ""),
          },
        ]}
        onClear={() => {
          setProjects([]);
          setRequest("");
          setAssignee("");
          setCategory("");
        }}
      />
      {optionError && (
        <p role="alert">
          필터를 불러오지 못했습니다. {optionError}{" "}
          <button className="ah-small" onClick={() => setRetry((n) => n + 1)}>
            다시 시도
          </button>
        </p>
      )}
      {assignee && (
        <p className="ah-context-note">
          담당 업무로 이어진 요청과 회의의 이전 기록도 함께 표시합니다.
        </p>
      )}
      <div className="ah-results" aria-live="polite">
        <strong>
          {project ? project.name : projects.length ? `${projects.length}개 프로젝트` : "전체 프로젝트"}
        </strong>
        <span>{page.events.length}개 기록 불러옴 · 최신순</span>
      </div>
      <section className="ah-feed" aria-label={project ? "프로젝트 활동 목록" : "전체 활동 목록"}>
        <ol className="ah-feed-list">
          {page.events.map((e) => (
            <li key={e.id} style={color(e.projectId)}>
              <button
                className={`ah-feed-row${selected?.id === e.id ? " is-selected" : ""}`}
                onClick={(ev) => open(e, ev.currentTarget)}
                aria-expanded={selected?.id === e.id}
              >
                <span className="ah-feed-dot" aria-hidden="true" />
                <span className="ah-feed-copy">
                  <strong className="ah-project-label">{e.projectName}</strong>
                  <span className="ah-feed-sentence">
                    {e.title} · {labels[e.kind] || e.kind}
                    {e.kind === "request_created"
                      ? ` (${e.requests[0]?.origin === "development" ? "개발 요청" : "고객 요청"})`
                      : ""}
                  </span>
                  <span className="ah-feed-meta">
                    {e.actorName} · {time(e.occurredAt)}
                  </span>
                </span>
              </button>
              {e.requests.length > 0 && e.category === "meeting" && (
                <div className="ah-linked">
                  <button
                    className="ah-small"
                    aria-expanded={!collapsed[e.id]}
                    aria-controls={`linked-${e.id}`}
                    onClick={() =>
                      setCollapsed((v) => ({ ...v, [e.id]: !v[e.id] }))
                    }
                  >
                    연결된 요청 {e.requests.length}건{" "}
                    <span className={!collapsed[e.id] ? "ah-up" : ""}>
                      <ControlIcon name="chevron" size={12} />
                    </span>
                  </button>
                  <div id={`linked-${e.id}`} hidden={!!collapsed[e.id]}>
                    {e.requests.map((r) => (
                      <button
                        className="ah-request-link"
                        key={r.id}
                        onClick={(ev) => open(e, ev.currentTarget, r.id)}
                      >
                        {r.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
        {busy && <p role="status">활동 기록을 불러오는 중…</p>}
        {error && (
          <p role="alert">
            {error}{" "}
            <button
              className="ah-small"
              onClick={() =>
                page.nextCursor
                  ? void load(page.nextCursor)
                  : setRetry((n) => n + 1)
              }
            >
              다시 시도
            </button>
          </p>
        )}
        {!busy && !error && !page.events.length && (
          <div className="pr-activity-empty">
            {query
              ? "조건에 맞는 활동이 없습니다."
              : "아직 저장된 활동 기록이 없습니다."}
          </div>
        )}
        {page.nextCursor && !busy && (
          <button
            className="ah-small"
            onClick={() => void load(page.nextCursor!)}
          >
            이전 활동 더 보기
          </button>
        )}
      </section>
      {selected && (
        <aside
          className="ah-history-panel"
          style={color(selected.projectId)}
          aria-labelledby="ah-history-title"
        >
          <header className="ah-panel-header">
            <div>
              <span className="ah-panel-eyebrow">{selected.projectName}</span>
              <h2 id="ah-history-title" ref={heading} tabIndex={-1}>
                {detail?.meeting?.title || selected.title}
              </h2>
            </div>
            <button
              className="ah-panel-close"
              aria-label="이력 닫기"
              onClick={close}
            >
              <ControlIcon name="close" />
            </button>
          </header>
          <div className="ah-panel-scroll">
            {detailError ? (
              <p role="alert">
                {detailError}{" "}
                <button
                  className="ah-small"
                  onClick={() => setDetailRetry((n) => n + 1)}
                >
                  다시 시도
                </button>
              </p>
            ) : !detail ? (
              <p role="status">상세를 불러오는 중…</p>
            ) : (
              <>
                {detail.meeting && (
                  <>
                    <dl className="ah-meeting-facts">
                      <dt>상태</dt>
                      <dd>
                        {{
                          scheduled: "예정",
                          in_progress: "진행 중",
                          completed: "회의 완료",
                        }[detail.meeting.status] || detail.meeting.status}
                      </dd>
                      <dt>일정</dt>
                      <dd>
                        {time(detail.meeting.scheduledAt)} ·{" "}
                        {detail.meeting.durationMinutes}분
                      </dd>
                      {detail.meeting.location && (
                        <>
                          <dt>장소</dt>
                          <dd>{detail.meeting.location}</dd>
                        </>
                      )}
                      {detail.meeting.startedAt && (
                        <>
                          <dt>실제 시작</dt>
                          <dd>{time(detail.meeting.startedAt)}</dd>
                        </>
                      )}
                      {detail.meeting.endedAt && (
                        <>
                          <dt>마무리</dt>
                          <dd>{time(detail.meeting.endedAt)}</dd>
                        </>
                      )}
                    </dl>
                    {detail.meeting.notes && (
                      <>
                        <h3 className="ah-section-title">회의 메모</h3>
                        <p className="ah-meeting-notes">
                          {detail.meeting.notes}
                        </p>
                      </>
                    )}
                  </>
                )}
                <h3 className="ah-section-title">
                  연결된 요청 {detail.requests.length}건
                </h3>
                {detail.requests.map((r) => (
                  <section className="ah-accordion" key={r.id}>
                    <button
                      className="ah-request-toggle"
                      aria-expanded={expanded === r.id}
                      aria-controls={`history-${r.id}`}
                      onClick={() =>
                        setExpanded((old) => (old === r.id ? null : r.id))
                      }
                    >
                      <span>
                        <small>
                          {r.origin === "development"
                            ? "개발 요청"
                            : "고객 요청"}
                        </small>
                        <strong>{r.title}</strong>
                      </span>
                      <span className={expanded === r.id ? "ah-up" : ""}>
                        <ControlIcon name="chevron" />
                      </span>
                    </button>
                    {expanded === r.id && (
                      <div id={`history-${r.id}`}>
                        <Timeline
                          projectId={project?.id}
                          key={r.id}
                          requestId={r.id}
                          selectedId={selected.id}
                        />
                      </div>
                    )}
                  </section>
                ))}
                {!detail.requests.length && (
                  <p className="ah-history-caption">
                    확인 가능한 연결 요청이 없습니다.
                  </p>
                )}
              </>
            )}
          </div>
        </aside>
      )}
    </main>
  );
}
