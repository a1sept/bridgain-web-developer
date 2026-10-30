import MeetingApprovalStatus from "./MeetingApprovalStatus";
import type { ProjectTask } from "./ProjectTasks";
import MeetingMode, { type MeetingRequestPlan } from "./MeetingMode";
import type { RichDocument } from "./editor/document";
import FilterBar, { type FilterDefinition } from "./components/FilterBar";
import { createPortal } from "react-dom";
import RichTextContent from "./editor/RichTextContent";
import MemberPicker from "./MemberPicker";
import StagePlanEditor, {
  type StagePlan,
  validStages,
} from "./StagePlanEditor";
import { useEffect, useRef, useState } from "react";
import "./approvals.css";
export async function workflowApi<T>(
  path: string,
  body?: object,
  method = "POST",
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) {
    const csrf = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    if (!csrf.ok) throw Error("로그인 상태를 확인해주세요.");
    headers["X-CSRF-Token"] = (await csrf.json()).csrfToken;
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`/api/workspace${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    method: body ? method : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => {
    throw Error("서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.");
  });
  if (!response.ok) throw Error(data.message || "처리하지 못했어요.");
  return data;
}
export type Approver = { userId: string; displayName: string };
export type Approval = {
  id: string;
  projectId: string;
  projectName: string;
  meetingId?: string;
  title: string;
  source: string;
  status: string;
  requestedBy?: string;
  requesterName: string;
  createdAt?: string;
  canApprove: boolean;
  canCancel: boolean;
  approvers: (Approver & { status: string; note?: string })[];
  plans: {
    requestId: string;
    title: string;
    origin: string;
    planning: string;
    uiNotes?: string;
    apiNotes?: string;
    dbNotes?: string;
    priority?: string;
    assigneeIds?: string[];
    stages?: StagePlan[];
  }[];
};
export function ApproverPicker({
  items,
  value,
  onChange,
  label,
  disabled = false,
}: {
  items: Approver[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="approval-picker">
      <MemberPicker
        label={label || "회의 최종 승인자"}
        items={items}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      {!items.length && (
        <p>선택 가능한 참여자가 없어요. 참여자 관리에서 확인해주세요.</p>
      )}
    </div>
  );
}

type WorkApproval = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  stageName: string;
  status: string;
  workRevision: number;
  canApprove: boolean;
  updatedAt?: string;
};
function daysSince(iso?: string) {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : 0;
}
function relativeTime(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return "";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}
type ApprovalTab = "todo" | "mine" | "all";
export default function Approvals({
  projectId,
  userId,
  onChanged,
  onTask,
}: {
  projectId?: string;
  userId?: string;
  onChanged?: () => void;
  onTask?: (projectId: string, taskId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWork, setSelectedWork] = useState<WorkApproval | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const modalOpen = !!selectedId || !!selectedWork;
  useEffect(() => {
    if (modalOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modalOpen]);
  useEffect(() => { setSelectedId(null); setSelectedWork(null); }, [projectId]);
  function closeDetail() { if (!busy) { setSelectedId(null); setSelectedWork(null); } }
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    workflowApi<{ projects: { members: Approver[] }[] }>("")
      .then((d) =>
        setNames(
          Object.fromEntries(
            d.projects.flatMap((p) =>
              p.members.map((m) => [m.userId, m.displayName]),
            ),
          ),
        ),
      )
      .catch(() => {});
  }, []);
  const [workItems, setWorkItems] = useState<WorkApproval[]>([]);
  const [items, setItems] = useState<Approval[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [filter, setFilter] = useState(""),
    [projectFilter, setProjectFilter] = useState(""),
    [kind, setKind] = useState(""),
    [origin, setOrigin] = useState(""),
    [tab, setTab] = useState<ApprovalTab>("todo");
  useEffect(() => {
    let live = true;
    workflowApi<{ approvals: Approval[]; workApprovals?: WorkApproval[] }>(
      projectId ? `/projects/${projectId}/approvals` : "/approvals",
    )
      .then((data) => {
        if (live) {
          setItems(data.approvals);
          setWorkItems(data.workApprovals || []);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [projectId, revision]);
  async function act(item: Approval, action: string) {
    if (busy) return;
    const note =
      action === "reject" ? window.prompt("반려 사유를 입력해주세요.") : "";
    if (action === "reject" && !note?.trim()) return;
    setBusy(true);
    setError("");
    try {
      await workflowApi(
        `/projects/${item.projectId}/approvals/${item.id}/actions`,
        { action, note },
      );
      setRevision((v) => v + 1);
      window.dispatchEvent(new Event("bridgain:approvals-changed"));
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    pending: "승인 대기",
    approved: "승인 완료",
    rejected: "반려",
    cancelled: "취소",
    cancelled_by_requester: "취소",
  };
  const kindLabels: Record<string, string> = {
    work: "작업 검토",
    meeting: "회의 최종 승인",
    urgent: "긴급 승인",
  };
  const todoApprovals = items.filter((i) => i.canApprove);
  const todoCount = workItems.length + todoApprovals.length;
  const mineCount = userId
    ? items.filter((i) => i.requestedBy === userId).length
    : 0;
  const tabItems: Approval[] =
    tab === "todo"
      ? todoApprovals
      : tab === "mine"
        ? items.filter((i) => i.requestedBy === userId)
        : items;
  const matchesCommon = (i: Approval) =>
    (!projectFilter || i.projectId === projectFilter) &&
    (!kind || i.source === kind) &&
    (!origin || i.plans.some((p) => p.origin === origin));
  const visibleItems = tabItems.filter(
    (i) => matchesCommon(i) && (tab !== "all" || !filter || i.status === filter),
  );
  const visibleWork =
    tab === "todo"
      ? workItems.filter(
          (w) =>
            (!projectFilter || w.projectId === projectFilter) &&
            (!kind || kind === "work") &&
            !origin,
        )
      : [];
  const projectOptions = Array.from(
    new Map(
      [...items, ...workItems].map((i) => [i.projectId, i.projectName]),
    ),
  ).map(([value, label]) => ({ value, label }));
  const filters: FilterDefinition[] = [
    ...(tab === "all"
      ? [
          {
            id: "status",
            label: "승인 상태",
            options: Object.entries(labels)
              .filter(([v]) => v !== "cancelled_by_requester")
              .map(([value, label]) => ({ value, label })),
            values: filter ? [filter] : [],
            onChange: (v: string[]) => setFilter(v[0] || ""),
          },
        ]
      : []),
    ...(!projectId
      ? [
          {
            id: "project",
            label: "프로젝트",
            options: projectOptions,
            values: projectFilter ? [projectFilter] : [],
            onChange: (v: string[]) => setProjectFilter(v[0] || ""),
          },
        ]
      : []),
    {
      id: "kind",
      label: "승인 종류",
      options: Object.entries(kindLabels)
        .filter(([v]) => tab === "todo" || v !== "work")
        .map(([value, label]) => ({ value, label })),
      values: kind ? [kind] : [],
      onChange: (v) => setKind(v[0] || ""),
    },
    {
      id: "origin",
      label: "요청 종류",
      options: [
        { value: "customer", label: "고객 요청" },
        { value: "development", label: "개발 요청" },
      ],
      values: origin ? [origin] : [],
      onChange: (v) => setOrigin(v[0] || ""),
    },
  ];
  function clearFilters() {
    setFilter("");
    setProjectFilter("");
    setKind("");
    setOrigin("");
  }
  function renderApproval(item: Approval) {
    const approved = item.approvers.filter((a) => a.status === "approved").length;
    const late = item.status === "pending" && daysSince(item.createdAt) >= 3;
    return (
      <div className="approval-row" key={item.id}>
        <button
          type="button"
          className="approval-row-open"
          onClick={() => setSelectedId(item.id)}
        >
          <span className="approval-row-title">
            <span className={`approval-kind ${item.source}`}>
              {kindLabels[item.source] || item.source}
            </span>
            <strong>{item.title}</strong>
          </span>
          <span className="approval-row-meta">
            {!projectId && <span>{item.projectName}</span>}
            <span>요청 {item.plans.length}건</span>
            <span>요청자 {item.requesterName}</span>
            {item.status === "pending" && (
              <span>
                승인 {approved}/{item.approvers.length}
              </span>
            )}
            <span className={late ? "approval-late" : undefined}>
              {late
                ? `${daysSince(item.createdAt)}일째 대기`
                : relativeTime(item.createdAt)}
            </span>
          </span>
        </button>
        <span className="approval-row-side">
          {item.canApprove ? (
            <>
              <button
                type="button"
                className="pw-secondary"
                disabled={busy}
                onClick={() => void act(item, "reject")}
              >
                반려
              </button>
              <button
                type="button"
                className="pw-primary"
                disabled={busy}
                onClick={() => void act(item, "approve")}
              >
                승인
              </button>
            </>
          ) : (
            <span className={`approval-status ${item.status}`}>
              {labels[item.status] || item.status}
            </span>
          )}
        </span>
      </div>
    );
  }
  function renderWork(item: WorkApproval) {
    const late = daysSince(item.updatedAt) >= 3;
    return (
      <div className="approval-row" key={item.id}>
        <button
          type="button"
          className="approval-row-open"
          onClick={() => setSelectedWork(item)}
        >
          <span className="approval-row-title">
            <span className="approval-kind work">{kindLabels.work}</span>
            <strong>{item.title}</strong>
          </span>
          <span className="approval-row-meta">
            {!projectId && <span>{item.projectName}</span>}
            {item.stageName && <span>{item.stageName} 단계</span>}
            {item.updatedAt && (
              <span className={late ? "approval-late" : undefined}>
                {late
                  ? `${daysSince(item.updatedAt)}일째 대기`
                  : relativeTime(item.updatedAt)}
              </span>
            )}
          </span>
        </button>
        <span className="approval-row-side">
          <span className="approval-status pending">작업 완료 · 승인 대기</span>
        </span>
      </div>
    );
  }
  const empty =
    tab === "todo"
      ? ["처리할 승인이 없어요", "새 승인 요청이나 작업 검토가 배정되면 여기에 표시돼요."]
      : tab === "mine"
        ? ["내가 요청한 승인이 없어요", "회의 또는 긴급 승인 요청을 올리면 여기에서 진행 상황을 볼 수 있어요."]
        : items.length
          ? ["조건에 맞는 승인 요청이 없어요", "필터를 변경해 다른 승인 요청을 확인하세요."]
          : ["승인 요청이 없어요", "회의 또는 긴급 승인 요청이 등록되면 여기에 표시돼요."];
  const nothing = !visibleItems.length && !visibleWork.length;
  return (
    <section className="pw-panel approvals-page">
      <header className="approvals-heading">
        <div>
          <span>WORKFLOW APPROVALS</span>
          <h1>승인함</h1>
          <p>
            {todoCount
              ? `처리할 승인 ${todoCount}건 · 작업 검토 ${workItems.length} · 회의·긴급 승인 ${todoApprovals.length}`
              : "처리할 승인이 없어요. 회의·긴급 승인은 단계 업무를 만들고, 작업 검토는 완료된 결과를 확인해요."}
          </p>
        </div>
        <button
          type="button"
          className="pw-secondary"
          onClick={() => setRevision((v) => v + 1)}
        >
          새로고침
        </button>
      </header>
      {error && (
        <p className="approvals-error" role="alert">
          {error}
        </p>
      )}
      <div className="approvals-tabs" role="tablist" aria-label="승인 보기">
        {(
          [
            ["todo", "처리 필요", todoCount],
            ...(userId ? [["mine", "내가 요청한", mineCount] as const] : []),
            ["all", "전체", items.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            type="button"
            role="tab"
            key={key}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>
      <div className="approvals-filters">
        <FilterBar filters={filters} onClear={clearFilters} label="승인 필터" />
      </div>
      {nothing ? (
        <div className="approvals-empty">
          <span aria-hidden="true">✓</span>
          <h2>{empty[0]}</h2>
          <p>{empty[1]}</p>
        </div>
      ) : (
        <div className="approval-list" aria-label="승인 목록">
          {tab === "todo" && visibleWork.length > 0 && (
            <h2 className="approval-group">
              작업 검토 <small>{visibleWork.length}건</small>
            </h2>
          )}
          {visibleWork.map(renderWork)}
          {tab === "todo" && visibleItems.length > 0 && (
            <h2 className="approval-group">
              회의·긴급 승인 <small>{visibleItems.length}건</small>
            </h2>
          )}
          {visibleItems.map(renderApproval)}
        </div>
      )}
      {createPortal(<dialog ref={dialog} className={`approval-dialog ${items.find(i => i.id === selectedId)?.source === "meeting" ? "approval-dialog-meeting" : ""}`}
        aria-label="승인 요청 상세" onCancel={e => {e.preventDefault();closeDetail();}} onClose={() => {setSelectedId(null);setSelectedWork(null);}}>
        <div className="approval-dialog-toolbar"><nav aria-label="승인 요청 위치">{items.find(i => i.id === selectedId)?.source === "meeting" ? <>회의실 <span aria-hidden="true">›</span> <strong>{items.find(i => i.id === selectedId)?.title}</strong></> : "승인 요청 상세"}</nav><button type="button" className="pw-secondary" disabled={busy} onClick={closeDetail}>닫기</button></div>
        {error && <p className="approvals-error" role="alert">{error}</p>}
      {items.filter(item => item.id === selectedId).map((item) => (
        <article key={item.id} className="approval-detail">
          {item.source !== "meeting" && <><header className="approval-card-heading">
            <h2>{item.title}</h2>
            <span className={`approval-status ${item.status}`}>
              {labels[item.status] || item.status}
            </span>
          </header>
          <p className="approval-meta">
            {item.projectName} · {item.source === "meeting" ? "회의" : "긴급"} ·
            요청자 {item.requesterName}
          </p></>}
          {item.source === "meeting" ? <ApprovalMeeting key={item.id} item={item} names={names} /> : item.plans.map((p) => (
            <div key={p.requestId} className="approval-plan">
              <h3>{p.title}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{p.planning}</p>
              {[
                ["UI", p.uiNotes],
                ["API", p.apiNotes],
                ["DB", p.dbNotes],
              ].map(
                ([name, note]) =>
                  note && (
                    <p key={name}>
                      {name}: {note}
                    </p>
                  ),
              )}
              {p.stages?.map((s, i) => (
                <section className="approval-plan" key={s.id}>
                  <strong>
                    {i + 1}. {s.name} · {s.title}
                  </strong>
                  <RichTextContent value={s.brief} document={s.briefDocument} />
                  <p>
                    담당:{" "}
                    {s.assigneeIds.map((id) => names[id] || id).join(", ")} /
                    전원 승인:{" "}
                    {s.reviewerIds.map((id) => names[id] || id).join(", ")}
                  </p>
                  <p>
                    선행:{" "}
                    {s.dependsOn
                      .map(
                        (id) => p.stages?.find((x) => x.id === id)?.name || id,
                      )
                      .join(", ") || "없음"}
                  </p>
                </section>
              ))}
              <p>
                담당자:{" "}
                {p.assigneeIds?.map((id) => names[id] || id).join(", ") ||
                  "미지정"}
              </p>
            </div>
          ))}
          {item.source !== "meeting" && <ul className="approval-reviewers">
            {item.approvers.map((a) => (
              <li key={a.userId}>
                {a.displayName}: {labels[a.status] || a.status}
                {a.note && ` · ${a.note}`}
              </li>
            ))}
          </ul>}
          <footer className="approval-actions">
            {item.canApprove && (
              <>
                <button
                  disabled={busy}
                  className="pw-primary"
                  onClick={() => void act(item, "approve")}
                >
                  승인
                </button>
                <button
                  disabled={busy}
                  className="pw-secondary"
                  onClick={() => void act(item, "reject")}
                >
                  반려
                </button>
              </>
            )}
            {item.canCancel && (
              <button
                className="pw-secondary"
                disabled={busy}
                onClick={() => void act(item, "cancel")}
              >
                승인 요청 취소
              </button>
            )}
          </footer>
        </article>
      ))}
        {selectedWork && <article className="approval-detail"><h2>{selectedWork.title}</h2><p className="approval-meta">{selectedWork.projectName} · {selectedWork.stageName}</p><ApprovalWorkDetail key={selectedWork.id} item={selectedWork} /><button type="button" className="pw-primary" onClick={() => {closeDetail();onTask?.(selectedWork.projectId, selectedWork.id);}}>업무 열고 검토</button></article>}
      </dialog>, document.body)}
    </section>
  );
}
function ApprovalWorkDetail({item}: {item: WorkApproval}) {
  const [task, setTask] = useState<ProjectTask | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    workflowApi<{tasks: ProjectTask[]}>(`/projects/${item.projectId}/tasks`)
      .then(data => {if (live) {const found = data.tasks.find(t => t.id === item.id);setTask(found || null);if (!found) setError("업무를 찾을 수 없습니다.");}})
      .catch(e => {if (live) setError(e.message);});
    return () => {live = false;};
  }, [item.id, item.projectId, retry]);
  if (error) return <p role="alert">{error} <button onClick={() => setRetry(v => v + 1)}>다시 시도</button></p>;
  if (!task) return <p role="status">업무 내용을 불러오는 중…</p>;
  return <><RichTextContent value={task.description} document={task.descriptionDocument} /><p>담당자: {task.assignees.map(a => a.displayName).join(", ")}</p>{[["작업 결과", task.resultSummary], ["검증", task.verification], ["DB 변경", task.dbChanges], ["API 변경", task.apiChanges], ["화면 변경", task.frontendChanges]].map(([label, value]) => value && <section className="approval-plan" key={label}><h3>{label}</h3><p>{value}</p></section>)}</>;
}
type ApprovalMeetingInfo = {
  id: string; title: string; scheduledAt: string; durationMinutes: number;
  location: string; notes: string; notesDocument?: RichDocument | null;
  requests: MeetingRequestPlan[];
};
function ApprovalMeeting({item, names}: {item: Approval; names: Record<string, string>}) {
  const [meeting, setMeeting] = useState<ApprovalMeetingInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);setError("");
    if (!item.meetingId) {setLoading(false);return;}
    workflowApi<{meetings: ApprovalMeetingInfo[]}>(`/projects/${item.projectId}/meetings`)
      .then(data => {if (live) {const found = data.meetings.find(m => m.id === item.meetingId);setMeeting(found || null);if (!found) setError("연결된 회의를 찾을 수 없습니다. 아래에서 승인 요청 내용을 확인하세요.");}})
      .catch(e => {if (live) setError(e.message);})
      .finally(() => {if (live) setLoading(false);});
    return () => {live = false;};
  }, [item.projectId, item.meetingId, retry]);
  const people = Object.entries(names).map(([userId, displayName]) => ({userId, displayName}));
  return <>
    {loading && <p role="status">회의 정보를 불러오는 중…</p>}
    {error && <p className="approvals-error" role="alert">{error} <button type="button" onClick={() => setRetry(v => v + 1)}>다시 시도</button></p>}
    {!item.meetingId && <p className="approval-meta">연결된 회의가 삭제되어 승인 요청 당시의 내용을 표시합니다.</p>}
    <MeetingMode presentation={false} header={<></>}
      projectId={item.projectId} title={meeting?.title || item.title} when={meeting?.scheduledAt || ""} location={meeting?.location || ""}
      overviewInfo={<section className="mm-overview-info" aria-label="회의 기본 정보">
        <label className="mm-overview-title"><span>회의 제목</span><input className="mm-title-input" aria-label="회의 제목" value={meeting?.title || item.title} disabled /></label>
        <div className="mm-metadata">
          <label>시작 일시<input aria-label="시작 일시" value={meeting?.scheduledAt ? new Date(meeting.scheduledAt).toLocaleString("ko-KR") : "일시 미정"} disabled /></label>
          <label>소요 시간<input aria-label="소요 시간" value={meeting ? `${meeting.durationMinutes}분` : ""} disabled /></label>
          <label className="mm-location">장소 / 링크<input aria-label="장소 / 링크" value={meeting?.location || ""} disabled /></label>
          <div className="mm-final-approvers"><MeetingApprovalStatus status={item.status} approvers={item.approvers} /></div>
        </div>
      </section>}
      notes={meeting?.notes || ""} notesDocument={meeting?.notesDocument}
      plans={item.plans.map(p => ({...p, priority: p.priority || "normal", assigneeIds: p.assigneeIds || [], planningDocument: meeting?.requests.find(r => r.requestId === p.requestId && r.planning === p.planning)?.planningDocument}))}
      requests={item.plans.map(p => ({id: p.requestId, title: p.title}))} members={people} reviewers={people}
      readOnly busy={false} dirty={false} error="" onNotes={() => {}} onPlan={() => {}} onSave={() => {}} onExit={() => {}} />
  </>;
}
export function UrgentApproval({
  projectId,
  requestId,
  onDone,
  canAssign = true,
}: {
  projectId: string;
  requestId: string;
  onDone: () => void;
  canAssign?: boolean;
}) {
  const [approvers, setApprovers] = useState<Approver[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [members, setMembers] = useState<Approver[]>([]);
  const [stages, setStages] = useState<StagePlan[]>([]);
  const [workApprovers, setWorkApprovers] = useState<Approver[]>([]);
  const [workApproversLoaded, setWorkApproversLoaded] = useState(false);
  const defaultedStages = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    defaultedStages.current = new Set();
    setStages([]);
    setWorkApproversLoaded(false);
    setApprovers([]);
    setSelected([]);
    setWorkApprovers([]);
    setMembers([]);
    setError("");
    workflowApi<{ approvers: Approver[]; workApprovers?: Approver[] }>(
      `/projects/${projectId}/approvals`,
    )
      .then((d) => {
        if (!active) return;
        setApprovers(d.approvers);
        setSelected(d.approvers.map(person => person.userId));
        setWorkApprovers(d.workApprovers || []);
        setWorkApproversLoaded(true);
      })
      .catch((e) => { if (active) setError(e.message); });
    workflowApi<{
      projects: {
        id: string;
        members: (Approver & { accountType: string })[];
      }[];
    }>("")
      .then((d) => active &&
        setMembers(
          d.projects
            .find((p) => p.id === projectId)
            ?.members.filter((m) => m.accountType === "team") || [],
        ),
      )
      .catch(() => {});
    return () => { active = false; };
  }, [projectId, requestId]);
  useEffect(() => {
    if (!workApproversLoaded) return;
    const added = new Set(stages.filter(stage => !defaultedStages.current.has(stage.id)).map(stage => stage.id));
    if (!added.size) return;
    added.forEach(id => defaultedStages.current.add(id));
    const reviewerIds = workApprovers.map(person => person.userId);
    setStages(current => current.map(stage => added.has(stage.id) && !stage.reviewerIds.length
      ? { ...stage, reviewerIds: [...reviewerIds] } : stage));
  }, [stages, workApprovers, workApproversLoaded]);
  return (
    <section className="rb-panel urgent-approval">
      <h2>긴급 승인 요청</h2>
      <p>회의만 생략하며 필수 승인자 전원의 승인이 필요합니다.</p>
      <ApproverPicker
        label="긴급 승인자"
        items={approvers}
        value={selected}
        onChange={setSelected}
      />
      <StagePlanEditor
        projectId={projectId}
        value={stages}
        onChange={setStages}
        members={members}
        reviewers={workApprovers}
      />
      {!canAssign && (
        <p role="status">긴급 승인 요청에는 업무 배정 권한이 필요합니다.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="pw-primary"
        disabled={
          !canAssign || busy || !selected.length || !validStages(stages)
        }
        onClick={async () => {
          setBusy(true);
          try {
            await workflowApi(`/projects/${projectId}/approvals`, {
              source: "urgent",
              requestIds: [requestId],
              approverIds: selected,
              plans: [
                {
                  requestId,
                  priority: "urgent",
                  assigneeIds: [
                    ...new Set(stages.flatMap((s) => s.assigneeIds)),
                  ],
                  stages: stages.length ? stages : undefined,
                },
              ],
            });
            window.dispatchEvent(new Event("bridgain:approvals-changed"));
            onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        긴급 승인 요청 보내기
      </button>
      <button className="pw-secondary" onClick={onDone}>
        닫기
      </button>
    </section>
  );
}
