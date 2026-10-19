import StagePlanEditor, {
  type StagePlan,
  validStages,
} from "./StagePlanEditor";
import {
  ApproverPicker,
  workflowApi,
  type Approver,
  type Approval,
} from "./Approvals";
import {
  Fragment,
  useLayoutEffect,
  useEffect,
  useState,
  useRef,
  type FormEvent,
} from "react";
import "./project-resources.css";
export type ResourceSection = "meetings" | "documents" | "activity";
type Plan = {
  stages?: StagePlan[];
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
  decisionStatus: "draft" | "pending" | "final";
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
type Request = {
  id: string;
  title: string;
  origin?: string;
  meetingId?: string | null;
  meetingTitle?: string;
  taskId?: string | null;
};
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
  onApprovals,
  permissions,
  rolesConfigured,
}: {
  projectId: string;
  permissions?: string[];
  rolesConfigured?: boolean;
  onApprovals?: () => void;
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
    [plans, setPlans] = useState<Plan[]>([]),
    [summary, setSummary] = useState(""),
    [taskId, setTaskId] = useState("");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("");
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [workApprovers, setWorkApprovers] = useState<Approver[]>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);
  const [approvalItems, setApprovalItems] = useState<Approval[]>([]);
  const [transfers, setTransfers] = useState<Record<string, string>>({});
  const [requestQuery, setRequestQuery] = useState("");
  const [requestPickerOpen, setRequestPickerOpen] = useState(false);
  const [requestInsertIndex, setRequestInsertIndex] = useState(0);
  const [requestConnector, setRequestConnector] = useState("");
  const requestPickerRef = useRef<HTMLDivElement>(null);
  const requestPopupRef = useRef<HTMLElement>(null);
  const [requestPopupPosition, setRequestPopupPosition] = useState<{
    left: number;
    top: number;
    maxHeight: number;
    width: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!requestPickerOpen) return;
    const popup = requestPopupRef.current;
    const trigger = requestTriggerRef.current;
    if (!popup || !trigger) return;
    let frame = 0;
    const position = () => {
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth =
        viewport?.width ?? document.documentElement.clientWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const margin = 12,
        gap = 8;
      const rect = trigger.getBoundingClientRect();
      const bottom = viewportTop + viewportHeight - margin;
      const top = viewportTop + margin;
      const below = Math.max(0, bottom - rect.bottom - gap);
      const above = Math.max(0, rect.top - gap - top);
      const list = popup.querySelector<HTMLElement>(".pr-request-results");
      const naturalHeight =
        popup.scrollHeight +
        2 -
        (list?.clientHeight ?? 0) +
        Math.min(list?.scrollHeight ?? 0, 320);
      const desiredHeight = Math.min(naturalHeight, 480);
      const opensAbove = below < desiredHeight && above > below;
      const maxHeight = Math.max(0, Math.min(480, opensAbove ? above : below));
      const height = Math.min(desiredHeight, maxHeight);
      const width = Math.min(440, Math.max(0, viewportWidth - margin * 2));
      const left = Math.max(
        viewportLeft + margin,
        Math.min(
          rect.left + rect.width / 2 - width / 2,
          viewportLeft + viewportWidth - margin - width,
        ),
      );
      const next = {
        left,
        top: opensAbove
          ? Math.max(top, rect.top - gap - height)
          : Math.max(top, Math.min(rect.bottom + gap, bottom - height)),
        maxHeight,
        width,
      };
      setRequestPopupPosition((current) =>
        current &&
        Object.keys(next).every(
          (key) =>
            current[key as keyof typeof next] ===
            next[key as keyof typeof next],
        )
          ? current
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    position();
    const observer = new ResizeObserver(schedule);
    observer.observe(popup);
    const results = popup.querySelector(".pr-request-results");
    if (results) observer.observe(results);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [requestPickerOpen, requestConnector, requestQuery]);
  const requestTriggerRef = useRef<HTMLButtonElement>(null);
  const closeRequestPicker = () => {
    setRequestPickerOpen(false);
    requestTriggerRef.current?.focus();
  };
  useEffect(() => {
    if (!requestPickerOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!requestPickerRef.current?.contains(event.target as Node))
        setRequestPickerOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [requestPickerOpen]);
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
          if (section === "meetings") {
            const target = window.sessionStorage.getItem(
              "bridgain-open-meeting",
            );
            if (target) {
              window.sessionStorage.removeItem("bridgain-open-meeting");
              const meeting = d.meetings?.find((m) => m.id === target);
              if (meeting) edit(meeting);
              else
                setError("연결된 회의를 찾을 수 없거나 조회 권한이 없습니다.");
            }
          }
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
  useEffect(() => {
    if (section !== "meetings") return;
    workflowApi<{
      approvers: Approver[];
      workApprovers?: Approver[];
      approvals: Approval[];
    }>(`${base}/approvals`)
      .then((d) => {
        setApprovers(d.approvers);
        setWorkApprovers(d.workApprovers || []);
        setApprovalItems(d.approvals);
      })
      .catch((e) => setError(e.message));
  }, [base, section, reload, refreshKey]);
  const canAssign = !rolesConfigured || !!permissions?.includes("tasks.assign");
  const canCreate = !permissions || permissions.includes(`${section}.create`);
  const canUpdate = !permissions || permissions.includes(`${section}.update`);
  function edit(item?: Meeting | Document) {
    setRequestQuery("");
    setRequestPickerOpen(false);
    setTransfers({});
    setSelectedApprovers([]);
    setError("");
    setEditing(item?.id || "new");
    setTitle(item?.title || "");
    setContent(item ? ("notes" in item ? item.notes : item.content) : "");
    setUrl(item && "url" in item ? item.url || "" : "");
    setCategory(item && "category" in item ? item.category : "plan");
    setLocation(item && "location" in item ? item.location : "");
    setStatus(item && "status" in item ? item.status : "scheduled");
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
        const request = requests.find((r) => r.id === rid)!;
        if (request.taskId) {
          setError("이미 업무화된 요청입니다.");
          return;
        }
        if (
          request.meetingId &&
          !window.confirm(
            `이 요청은 '${request.meetingTitle || request.meetingId}' 회의에 연결되어 있습니다. 기존 회의에서 제외하고 새 회의로 이동할까요?`,
          )
        )
          return;
        edit();
        if (request.meetingId) setTransfers({ [rid]: request.meetingId });
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
  const pendingApproval = approvalItems.find(
    (a) => a.meetingId === editing && a.status === "pending",
  );
  const finalized =
    section === "meetings" &&
    meetings.find((m) => m.id === editing)?.decisionStatus === "final";
  const locked = finalized || !!pendingApproval;
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
    const decision =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "pending"
        ? "pending"
        : "draft";
    if (saveLock.current || locked) return;
    if (
      section === "meetings" &&
      decision === "pending" &&
      plans.some((p) => !validStages(p.stages))
    ) {
      setError(
        "모든 업무의 제목·카테고리·내용·담당자·작업 승인자를 지정해주세요.",
      );
      return;
    }
    saveLock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await api<{ meeting?: Meeting }>(
        `${base}/${section}${editing === "new" ? "" : `/${editing}`}`,
        section === "meetings"
          ? {
              title,
              scheduledAt: new Date(when).toISOString(),
              durationMinutes: duration,
              location,
              notes: content,
              status,
              decisionStatus: "draft",
              transferFromMeetingIds: transfers,
              requests: plans.map((p) => ({
                ...p,
                stages: p.stages?.length ? p.stages : undefined,
              })),
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
      if (section === "meetings" && decision === "pending") {
        const meetingId = editing === "new" ? saved.meeting?.id : editing;
        if (!meetingId)
          throw Error(
            "회의를 저장했지만 승인 요청 ID를 확인하지 못했어요. 목록에서 회의를 다시 열어주세요.",
          );
        setEditing(meetingId);
        await workflowApi(`${base}/approvals`, {
          source: "meeting",
          meetingId,
          approverIds: selectedApprovers,
        });
        window.dispatchEvent(new Event("bridgain:approvals-changed"));
      }
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
  function renderRequestConnector(
    index: number,
    mode: "empty" | "append" | "gap",
  ) {
    const key = `${mode}-${index}`;
    const active = requestPickerOpen && requestConnector === key;
    return (
      <div
        className={`pr-request-anchor pr-request-${mode === "empty" ? "empty-action" : mode}`}
        ref={active ? requestPickerRef : undefined}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            closeRequestPicker();
          }
        }}
      >
        <button
          type="button"
          aria-haspopup="dialog"
          aria-controls="meeting-request-picker"
          aria-expanded={active}
          aria-label={
            mode === "gap" ? `${index + 1}번째 위치에 요청 연결` : undefined
          }
          onClick={(event) => {
            requestTriggerRef.current = event.currentTarget;
            setRequestPopupPosition(null);
            setRequestQuery("");
            setRequestInsertIndex(index);
            setRequestConnector(key);
            setRequestPickerOpen(!active);
          }}
        >
          {mode === "gap"
            ? "＋"
            : mode === "empty"
              ? "＋ 요청 연결"
              : "＋ 추가로 요청 연결하기"}
        </button>
        {active && (
          <section
            className="pr-request-picker"
            ref={requestPopupRef}
            style={{
              position: "fixed",
              right: "auto",
              transform: "none",
              ...requestPopupPosition,
              visibility: requestPopupPosition ? "visible" : "hidden",
            }}
            id="meeting-request-picker"
            role="dialog"
            aria-label="연결할 요청 선택"
          >
            <div className="pr-section-heading">
              <strong>요청 검색</strong>
              <button type="button" onClick={closeRequestPicker}>
                닫기
              </button>
            </div>
            <input
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              aria-label="요청 제목 검색"
              placeholder="요청 제목으로 검색…"
              value={requestQuery}
              onChange={(e) => setRequestQuery(e.target.value)}
            />
            <div className="pr-request-results">
              {requests
                .filter(
                  (r) =>
                    !r.taskId &&
                    !plans.some((p) => p.requestId === r.id) &&
                    r.title
                      .toLocaleLowerCase()
                      .includes(requestQuery.toLocaleLowerCase()),
                )
                .map((r) => (
                  <div className="pr-request-result" key={r.id}>
                    <div>
                      <span>
                        {r.origin === "development" ? "개발 요청" : "고객 요청"}
                      </span>
                      <strong>{r.title}</strong>
                      {r.meetingId && r.meetingId !== editing && (
                        <small>{r.meetingTitle || "다른 회의"}에 연결됨</small>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (r.meetingId && r.meetingId !== editing) {
                          if (
                            !window.confirm(
                              `이 요청은 '${r.meetingTitle || r.meetingId}' 회의에 연결되어 있습니다. 기존 회의에서 제외하고 이 회의로 이동할까요? 승인 대기 중인 회의에서는 먼저 승인을 취소해야 합니다.`,
                            )
                          )
                            return;
                          setTransfers((current) => ({
                            ...current,
                            [r.id]: r.meetingId!,
                          }));
                        }
                        setPlans((current) => [
                          ...current.slice(0, requestInsertIndex),
                          {
                            requestId: r.id,
                            planning: "",
                            uiNotes: "",
                            apiNotes: "",
                            dbNotes: "",
                            priority: "normal",
                            assigneeIds: [],
                            stages: [],
                          },
                          ...current.slice(requestInsertIndex),
                        ]);
                        setRequestQuery("");
                        closeRequestPicker();
                      }}
                    >
                      ＋ 연결
                    </button>
                  </div>
                ))}
              {!requests.some(
                (r) =>
                  !r.taskId &&
                  !plans.some((p) => p.requestId === r.id) &&
                  r.title
                    .toLocaleLowerCase()
                    .includes(requestQuery.toLocaleLowerCase()),
              ) && <p>연결할 수 있는 요청이 없어요.</p>}
            </div>
          </section>
        )}
      </div>
    );
  }
  return (
    <div className="pr-page">
      <header className="pr-heading">
        <div>
          <span>PROJECT WORKSPACE</span>
          <h1>{label}</h1>
          <p>
            {section === "meetings"
              ? "고객 요청과 개발 요청을 논의하고, 필수 승인자 전원의 승인 후 업무로 전환하세요."
              : section === "documents"
                ? "최신 설계와 업무별 변경 이력을 관리하세요."
                : "프로젝트의 최근 변경 내역이에요."}
          </p>
        </div>
        {section !== "activity" && !editing && canCreate && (
          <button
            className="pr-primary"
            disabled={loading || busy}
            onClick={() => edit()}
          >
            ＋ {section === "meetings" ? "회의 생성" : "새 문서"}
          </button>
        )}
      </header>
      {section === "meetings" && onApprovals && (
        <button onClick={onApprovals}>
          프로젝트 승인함 · 대기{" "}
          {approvalItems.filter((a) => a.status === "pending").length}건 →
        </button>
      )}
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
            {pendingApproval && (
              <p>
                승인 대기 중입니다. 지정 승인자 전원이 승인하면 업무가
                생성됩니다. 수정하려면 승인함에서 승인 요청을 취소해주세요.
              </p>
            )}
            {finalized && (
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
                  </div>
                  <label>
                    회의 메모
                    <textarea
                      rows={4}
                      maxLength={20000}
                      value={content}
                      placeholder="회의 안건과 공통 논의 내용을 작성하세요."
                      onChange={(e) => setContent(e.target.value)}
                    />
                  </label>
                  <div className="pr-section-heading">
                    <div>
                      <h3>요청 및 업무</h3>
                      <p>
                        연결된 요청 {plans.length}개 · 작성한 업무{" "}
                        {plans.reduce(
                          (count, p) => count + (p.stages?.length || 0),
                          0,
                        )}
                        개
                      </p>
                    </div>
                  </div>
                  {!plans.length && !locked && (
                    <div className="pr-request-empty">
                      <p>
                        요청을 연결한 뒤, 요청 박스 안에서 업무를 추가하세요.
                      </p>
                      {renderRequestConnector(0, "empty")}
                    </div>
                  )}
                  {plans.map((p, index) => (
                    <Fragment key={p.requestId}>
                      {!locked && renderRequestConnector(index, "gap")}
                      <section
                        className="pr-editor pr-request-plan"
                        key={p.requestId}
                      >
                        <div className="pr-section-heading">
                          <h3>
                            {requests.find((r) => r.id === p.requestId)
                              ?.title || p.requestId}
                          </h3>
                          {!locked && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  p.stages?.length &&
                                  !window.confirm(
                                    "작성한 업무 초안도 함께 제거됩니다. 요청 연결을 해제할까요?",
                                  )
                                )
                                  return;
                                setPlans((current) =>
                                  current.filter(
                                    (plan) => plan.requestId !== p.requestId,
                                  ),
                                );
                                setTransfers((current) => {
                                  const next = { ...current };
                                  delete next[p.requestId];
                                  return next;
                                });
                              }}
                            >
                              연결 해제
                            </button>
                          )}
                        </div>
                        {[p.planning, p.uiNotes, p.apiNotes, p.dbNotes].some(
                          (note) => note?.trim(),
                        ) && (
                          <details>
                            <summary>이전 기획 기록</summary>
                            {(
                              [
                                ["planning", "기획 · 결정사항"],
                                ["uiNotes", "화면 UI 구상"],
                                ["apiNotes", "API · 데이터 처리"],
                                ["dbNotes", "DB 설계"],
                              ] as const
                            ).map(([key, text]) =>
                              p[key]?.trim() ? (
                                <div key={key}>
                                  <strong>{text}</strong>
                                  <p style={{ whiteSpace: "pre-wrap" }}>
                                    {p[key]}
                                  </p>
                                </div>
                              ) : null,
                            )}
                          </details>
                        )}
                        <fieldset>
                          <legend>요청 우선순위</legend>
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
                        </fieldset>
                        <StagePlanEditor
                          projectId={projectId}
                          disabled={busy || locked}
                          value={p.stages || []}
                          onChange={(stages) =>
                            patchPlan(p.requestId, {
                              stages,
                              assigneeIds: [
                                ...new Set(
                                  stages.flatMap((s) => s.assigneeIds),
                                ),
                              ],
                            })
                          }
                          members={members.filter(
                            (m) => m.accountType === "team",
                          )}
                          reviewers={workApprovers}
                        />
                        {p.taskId && (
                          <button
                            type="button"
                            onClick={() => onTask?.(p.taskId!)}
                          >
                            생성된 개발 업무 열기
                          </button>
                        )}
                      </section>
                    </Fragment>
                  ))}
                  {!!plans.length && !locked && (
                    <>
                      {renderRequestConnector(plans.length, "gap")}
                      {renderRequestConnector(plans.length, "append")}
                    </>
                  )}
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
              {section !== "meetings" && (
                <label>
                  문서 내용
                  <textarea
                    rows={10}
                    maxLength={50000}
                    required
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </label>
              )}
            </fieldset>
            {section === "meetings" && !locked && (
              <ApproverPicker
                disabled={busy}
                items={approvers}
                value={selectedApprovers}
                onChange={setSelectedApprovers}
              />
            )}
            {section === "meetings" && !canAssign && (
              <p className="pw-muted">
                업무 담당자를 확정하여 승인 요청하려면 업무 배정 권한이
                필요합니다.
              </p>
            )}
            {section === "meetings" && !locked && (
              <p className="sw-help">
                임시 저장은 회의 초안을 보관합니다. 업무 생성 승인 요청 후, 지정
                승인자 전원이 승인함에서 승인하면 실제 업무가 생성됩니다.
              </p>
            )}
            <footer>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                {locked ? "닫기" : "취소"}
              </button>
              {finalized && status !== "completed" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void completeMeeting()}
                >
                  회의 완료 처리
                </button>
              )}
              {!locked && (
                <>
                  <button
                    type="submit"
                    value="draft"
                    className={section === "meetings" ? "" : "pr-primary"}
                    disabled={
                      (!canUpdate && editing !== "new") ||
                      (!canCreate && editing === "new") ||
                      busy ||
                      !title.trim()
                    }
                  >
                    {busy
                      ? "저장 중…"
                      : section === "meetings"
                        ? "임시 저장"
                        : "저장하기"}
                  </button>
                  {section === "meetings" && (
                    <button
                      type="submit"
                      value="pending"
                      className="pr-primary"
                      disabled={
                        (!canUpdate && editing !== "new") ||
                        (!canCreate && editing === "new") ||
                        busy ||
                        !title.trim() ||
                        !canAssign ||
                        !selectedApprovers.length ||
                        !plans.length ||
                        plans.some((p) => !validStages(p.stages))
                      }
                    >
                      업무 생성 승인 요청
                    </button>
                  )}
                </>
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
