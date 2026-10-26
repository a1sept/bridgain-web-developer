import ProjectChannel from "./ProjectChannel";
import WorkReview from "./WorkReview";
import { useEffect, useRef, useState, type FormEvent } from "react";
import "./project-tasks.css";

type Member = {
  userId: string;
  displayName: string;
  accountType: string;
  canApproveMerge?: boolean;
};
type RequestLink = {
  id: string;
  title: string;
  origin?: "customer" | "development";
};
export type ProjectTask = {
  id: string;
  version: string;
  title: string;
  description: string;
  status:
    | "blocked"
    | "todo"
    | "in_progress"
    | "review_pending"
    | "deploy_pending"
    | "deploying"
    | "done"
    | "released";
  stageKey?: string;
  stageName?: string;
  stageOrder?: number;
  completionMode?: string;
  workRevision?: number;
  approvedHeadSha?: string;
  dependencies?: {
    taskId?: string;
    predecessorId?: string;
    title: string;
    status: string;
    completionMode?: string;
    resultSummary?: string;
    verification?: string;
    documentVersions?: {
      id: string;
      documentId: string;
      title: string;
      url?: string | null;
    }[];
  }[];
  priority: "urgent" | "high" | "normal" | "low";
  dueDate: string | null;
  assignees: {
    userId: string;
    displayName: string;
    completedAt?: string | null;
  }[];
  requests: RequestLink[];
  repositoryUrl: string | null;
  workBranch: string;
  liveBranch: string;
  pullRequestUrl: string | null;
  mergeCommit: string;
  deploymentUrl: string | null;
  resultSummary: string;
  dbChanges: string;
  apiChanges: string;
  frontendChanges: string;
  verification: string;
  mergeApprovalRequired: boolean;
  mergeReviewerId: string | null;
  reviewStatus: string;
  reviewHeadSha: string;
  reviewBaseSha: string;
  reviewRequestId: string | null;
  documentVersions: {
    id: string;
    documentId: string;
    title: string;
    changeSummary: string;
    createdAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
};
type Draft = Pick<
  ProjectTask,
  "title" | "description" | "status" | "priority"
> & {
  dueDate: string;
  assigneeIds: string[];
  requestIds: string[];
  repositoryUrl: string;
  workBranch: string;
  liveBranch: string;
  pullRequestUrl: string;
  mergeCommit: string;
  deploymentUrl: string;
  resultSummary: string;
  dbChanges: string;
  apiChanges: string;
  frontendChanges: string;
  verification: string;
  mergeApprovalRequired: boolean;
  mergeReviewerId: string;
};
const reviewStatuses: Record<string, string> = {
  none: "검토 요청 전",
  pending: "승인 대기",
  approved: "승인됨",
  changes_requested: "수정 요청",
  stale: "재검토 필요",
};
type ReviewEvent = {
  id: string;
  action: string;
  actorName: string;
  note: string;
  headSha: string;
  createdAt: string;
};
const reviewActions: Record<string, string> = {
  requested: "검토 요청",
  approved: "승인",
  changes_requested: "수정 요청",
  stale: "재검토 필요",
  invalidated: "검토 초기화",
  merged: "병합 완료",
};
const statuses = {
  blocked: "선행 업무 대기",
  todo: "진행 전",
  in_progress: "진행 중",
  review_pending: "작업 승인 대기",
  deploy_pending: "배포 대기",
  deploying: "배포 중",
  done: "작업 완료",
  released: "배포 완료",
} as const;
const priorities = {
  urgent: "긴급",
  high: "높음",
  normal: "보통",
  low: "낮음",
} as const;
const fresh = (): Draft => ({
  title: "",
  description: "",
  status: "todo",
  priority: "normal",
  dueDate: "",
  assigneeIds: [],
  requestIds: [],
  repositoryUrl: "",
  workBranch: "",
  liveBranch: "main",
  pullRequestUrl: "",
  mergeCommit: "",
  deploymentUrl: "",
  resultSummary: "",
  dbChanges: "",
  apiChanges: "",
  frontendChanges: "",
  verification: "",
  mergeApprovalRequired: false,
  mergeReviewerId: "",
});
const toggle = (items: string[], id: string) =>
  items.includes(id) ? items.filter((value) => value !== id) : [...items, id];
async function request<T>(
  path: string,
  body?: object,
  method = "POST",
): Promise<T> {
  const signal = AbortSignal.timeout(path.endsWith("/review") ? 35000 : 15000);
  const headers: Record<string, string> = {};
  if (body) {
    const csrf = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!csrf.ok) throw Error("보안 확인에 실패했어요. 다시 시도해주세요.");
    headers["X-CSRF-Token"] = (await csrf.json()).csrfToken;
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`/api/workspace${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers,
    method: body ? method : "GET",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.message || "업무를 불러오지 못했어요.");
  return data;
}
export default function ProjectTasks({
  project,
  initialRequestId,
  refreshKey,
  onOpenRequest,
  onChanged,
  userId,
  onDocument,
  onCreateRequest,
  onApprovals,
}: {
  project: { id: string; name: string; members: Member[]; canManage?: boolean };
  onCreateRequest?: () => void;
  onApprovals?: () => void;
  userId?: string;
  onDocument?: (documentId: string, versionId: string) => void;
  refreshKey?: number;
  initialRequestId?: string;
  onOpenRequest: (id: string) => void;
  onChanged?: () => void;
}) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]),
    [requests, setRequests] = useState<RequestLink[]>([]);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [revision, setRevision] = useState(0);
  const [view, setView] = useState<"board" | "list">("board"),
    [assignee, setAssignee] = useState("");
  const [editing, setEditing] = useState<string | null | undefined>(undefined),
    [draft, setDraft] = useState<Draft>(fresh);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    initialized = useRef(""),
    saveLock = useRef(false);
  const [reviewNote, setReviewNote] = useState("");
  const [history, setHistory] = useState<ReviewEvent[]>([]);
  const [historyError, setHistoryError] = useState("");
  const taskVersion = useRef("");
  const [resultEntry, setResultEntry] = useState({
    changeSummary: "",
    resultSummary: "",
    dbChanges: "",
    apiChanges: "",
    frontendChanges: "",
    verification: "",
  });
  const [resultEntries, setResultEntries] = useState<
    {
      actorName: string;
      entry: {
        id: string;
        createdAt: string;
        changeSummary: string;
        resultSummary: string;
        dbChanges: string;
        apiChanges: string;
        frontendChanges: string;
        verification: string;
      };
    }[]
  >([]);
  const [resultError, setResultError] = useState("");
  const savedDraft = useRef("");
  const reviewSnapshot = useRef<string | null>(null);
  const taskOrigin = (task: ProjectTask) => {
    const origins = task.requests.map(
      (link) => requests.find((r) => r.id === link.id)?.origin || link.origin,
    );
    return origins.length && origins.every((origin) => origin === "development")
      ? "개발 요청"
      : origins.length && origins.every((origin) => origin === "customer")
        ? "고객 요청"
        : "요청";
  };
  const selectedTask = tasks.find((t) => t.id === editing);
  const dirty = JSON.stringify(draft) !== savedDraft.current;
  const isAssignee = selectedTask?.assignees.some((m) => m.userId === userId);
  const canEditProgress =
    isAssignee &&
    (!selectedTask?.stageKey ||
      (["todo", "in_progress"].includes(selectedTask.status) &&
        !selectedTask.assignees.some((a) => !!a.completedAt)));
  const isReviewer =
    selectedTask?.mergeReviewerId === userId &&
    project.members.some((m) => m.userId === userId && m.canApproveMerge);
  const base = `/projects/${project.id}`;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    Promise.all([
      request<{ tasks: ProjectTask[] }>(`${base}/tasks`),
      request<{ requests: RequestLink[] }>(`${base}/requests`).catch(() => ({
        requests: [],
      })),
    ])
      .then(([result, links]) => {
        if (active) {
          setTasks(result.tasks);
          setRequests(links.requests);
        }
      })
      .catch((cause) => {
        if (active)
          setLoadError(
            cause instanceof Error ? cause.message : "불러오기에 실패했어요.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, revision, refreshKey]);
  useEffect(() => {
    if (editing !== undefined) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing]);
  useEffect(() => {
    let active = true;
    setHistory([]);
    setHistoryError("");
    if (editing)
      request<{ events: ReviewEvent[] }>(`${base}/tasks/${editing}/review`)
        .then((data) => {
          if (active) setHistory(data.events);
        })
        .catch((cause) => {
          if (active)
            setHistoryError(
              cause instanceof Error
                ? cause.message
                : "검토 기록을 불러오지 못했어요.",
            );
        });
    return () => {
      active = false;
    };
  }, [base, editing, revision]);
  async function review(action: string) {
    if (!editing || saveLock.current || dirty) return;
    if (
      action === "merge" &&
      !window.confirm("현재 PR을 라이브 브랜치에 병합할까요?")
    )
      return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await request<{ status: string; message?: string }>(
        `${base}/tasks/${editing}/review`,
        { action, note: reviewNote, expectedReviewId: reviewSnapshot.current },
      );
      const latest = await request<{ tasks: ProjectTask[] }>(`${base}/tasks`);
      setTasks(latest.tasks);
      const task = latest.tasks.find((t) => t.id === editing);
      if (task) open(task);
      setRevision((v) => v + 1);
      setNotice(
        result.message ||
          (result.status === "done"
            ? "PR 병합과 개발 완료 처리가 끝났어요."
            : `검토 상태: ${reviewStatuses[result.status] || result.status}`),
      );
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "검토 처리에 실패했어요.",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    let active = true;
    setResultEntries([]);
    setResultError("");
    setResultEntry({
      changeSummary: "",
      resultSummary: "",
      dbChanges: "",
      apiChanges: "",
      frontendChanges: "",
      verification: "",
    });
    if (editing)
      request<{ entries: typeof resultEntries }>(
        `${base}/tasks/${editing}/result-entries`,
      )
        .then((data) => {
          if (active) setResultEntries(data.entries);
        })
        .catch((cause) => {
          if (active)
            setResultError(
              cause instanceof Error
                ? cause.message
                : "기록을 불러오지 못했어요.",
            );
        });
    return () => {
      active = false;
    };
  }, [base, editing, revision]);
  async function reloadEditing() {
    if (
      saveLock.current ||
      !window.confirm("저장하지 않은 내용을 버리고 최신 업무를 불러올까요?")
    )
      return;
    saveLock.current = true;
    setSaving(true);
    try {
      const latest = await request<{ tasks: ProjectTask[] }>(`${base}/tasks`);
      setTasks(latest.tasks);
      const task = latest.tasks.find((t) => t.id === editing);
      if (task) open(task);
      setRevision((v) => v + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "새로고침에 실패했어요.",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  async function addResultEntry() {
    if (!editing || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      await request(`${base}/tasks/${editing}/result-entries`, {
        ...resultEntry,
        expectedVersion: taskVersion.current,
      });
      setRevision((v) => v + 1);
      setNotice("완료 상태와 승인 내용을 보존하고 후속 기록을 추가했어요.");
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "기록 저장에 실패했어요.",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  const members = project.members.filter(
    (member) => member.accountType === "team",
  );
  const visible = tasks.filter(
    (task) =>
      !assignee ||
      (assignee === "unassigned"
        ? !task.assignees.length
        : task.assignees.some((member) => member.userId === assignee)),
  );
  function open(task?: ProjectTask) {
    if (!task) {
      onCreateRequest?.();
      return;
    }
    setError("");
    const nextDraft = task
      ? {
          ...fresh(),
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          repositoryUrl: task.repositoryUrl || "",
          workBranch: task.workBranch,
          liveBranch: task.liveBranch,
          pullRequestUrl: task.pullRequestUrl || "",
          mergeCommit: task.mergeCommit,
          deploymentUrl: task.deploymentUrl || "",
          resultSummary: task.resultSummary,
          dbChanges: task.dbChanges,
          apiChanges: task.apiChanges,
          frontendChanges: task.frontendChanges,
          verification: task.verification,
          mergeApprovalRequired: task.mergeApprovalRequired,
          mergeReviewerId: task.mergeReviewerId || "",
          dueDate: task.dueDate?.slice(0, 10) || "",
          assigneeIds: task.assignees.map((member) => member.userId),
          requestIds: task.requests.map((item) => item.id),
        }
      : fresh();
    setDraft(nextDraft);
    savedDraft.current = JSON.stringify(nextDraft);
    taskVersion.current = task?.version ?? "";
    reviewSnapshot.current = task?.reviewRequestId ?? null;
    setReviewNote("");
    setEditing(task?.id ?? null);
  }
  useEffect(() => {
    if (loading || loadError) return;
    const id = window.sessionStorage.getItem("bridgain-task");
    const task = tasks.find((t) => t.id === id);
    if (task) {
      window.sessionStorage.removeItem("bridgain-task");
      open(task);
    }
  }, [loading, loadError, tasks]);
  function close() {
    if (!saveLock.current) setEditing(undefined);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saveLock.current || !editing || !canEditProgress) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await request<{ task: ProjectTask }>(
        `${base}/tasks/${editing}`,
        {
          status: draft.status,
          repositoryUrl: draft.repositoryUrl,
          workBranch: draft.workBranch,
          liveBranch: draft.liveBranch,
          pullRequestUrl: draft.pullRequestUrl,
          ...(!selectedTask?.stageKey
            ? {
                mergeCommit: draft.mergeCommit,
                deploymentUrl: draft.deploymentUrl,
              }
            : selectedTask.completionMode === "deploy"
              ? { deploymentUrl: draft.deploymentUrl }
              : {}),
          resultSummary: draft.resultSummary,
          dbChanges: draft.dbChanges,
          apiChanges: draft.apiChanges,
          frontendChanges: draft.frontendChanges,
          verification: draft.verification,
          ...(!selectedTask?.stageKey
            ? {
                mergeApprovalRequired: draft.mergeApprovalRequired,
                mergeReviewerId: draft.mergeReviewerId,
              }
            : {}),
          expectedVersion: taskVersion.current,
        },
        "PATCH",
      );
      setTasks((current) =>
        current.map((task) => (task.id === editing ? result.task : task)),
      );
      setEditing(undefined);
      setNotice("업무를 수정했어요.");
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "업무 저장에 실패했어요.",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  function taskCard(task: ProjectTask) {
    return (
      <article
        className={`pt-card ${task.status === "done" ? "pt-done" : ""}`}
        key={task.id}
      >
        <button
          type="button"
          className="pt-card-open"
          onClick={() => open(task)}
          aria-label={`${task.title} 업무 상세`}
        >
          <span className="pt-card-top">
            <span
              className={`pt-origin ${task.requests.length ? "linked" : ""}`}
            >
              {task.requests.length
                ? `${taskOrigin(task)} · ${task.requests.length}`
                : "내부 업무"}
            </span>
            <span className={`pt-priority ${task.priority}`}>
              {priorities[task.priority]}
            </span>
          </span>
          <strong>{task.title}</strong>
          {task.stageName && (
            <span className="pt-help">
              {(task.stageOrder ?? 0) + 1}단계 · {task.stageName}
            </span>
          )}
          {task.mergeApprovalRequired && (
            <span className="pt-help">
              병합 검토 · {reviewStatuses[task.reviewStatus]}
            </span>
          )}
          {task.description && <p>{task.description}</p>}
          <span className="pt-card-bottom">
            <span>
              {task.assignees.map((member) => member.displayName).join(", ") ||
                "담당자 미지정"}
            </span>
            <span>
              {task.dueDate ? `기한 ${task.dueDate.slice(0, 10)}` : "기한 없음"}
            </span>
          </span>
        </button>
        {task.requests.length > 0 && (
          <div className="pt-source-links">
            {task.requests.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onOpenRequest(item.id)}
                title={item.title}
              >
                ↗ {item.title}
              </button>
            ))}
          </div>
        )}
      </article>
    );
  }
  return (
    <section className="pt-workspace" aria-label={`${project.name} 업무`}>
      <header className="pt-heading">
        <div>
          <p>PROJECT TASKS</p>
          <h1>업무</h1>
          <span>승인된 요청의 업무를 팀과 함께 진행하세요.</span>
        </div>
        <button
          className="pt-primary"
          onClick={onCreateRequest}
          disabled={loading || !!loadError}
        >
          ＋ 개발 요청
        </button>
      </header>
      {onApprovals && (
        <button onClick={onApprovals}>프로젝트 승인함 보기 →</button>
      )}
      {notice && (
        <p className="pt-notice" role="status">
          {notice}
        </p>
      )}
      {loadError && (
        <div className="pt-error" role="alert">
          {loadError}{" "}
          <button onClick={() => setRevision((value) => value + 1)}>
            다시 불러오기
          </button>
        </div>
      )}
      <div className="pt-toolbar">
        <div className="pt-view-switch" aria-label="업무 보기 방식">
          <button
            aria-pressed={view === "board"}
            onClick={() => setView("board")}
          >
            칸반 보드
          </button>
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            리스트
          </button>
        </div>
        {userId && (
          <button
            type="button"
            aria-pressed={assignee === userId}
            onClick={() => setAssignee(assignee === userId ? "" : userId)}
          >
            내 업무
          </button>
        )}
        <label>
          담당자{" "}
          <select
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          >
            <option value="">전체</option>
            <option value="unassigned">미지정</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
        <span>{visible.length}개 업무</span>
      </div>
      {!loading && (
        <section className="pt-request-chains" aria-label="요청별 단계 흐름">
          {requests
            .filter((r) =>
              visible.some(
                (t) =>
                  t.stageKey && t.requests.some((link) => link.id === r.id),
              ),
            )
            .map((r) => (
              <details key={r.id}>
                <summary>{r.title} · 단계별 업무</summary>
                <div className="sw-flow">
                  {visible
                    .filter((t) => t.requests.some((link) => link.id === r.id))
                    .sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
                    .map((t) => (
                      <button key={t.id} onClick={() => open(t)}>
                        {t.stageName || t.title} · {statuses[t.status]}
                      </button>
                    ))}
                </div>
              </details>
            ))}
        </section>
      )}
      {loading ? (
        <p className="pt-empty" role="status">
          업무를 불러오는 중이에요.
        </p>
      ) : (
        !loadError &&
        (view === "board" ? (
          <div className="pt-board">
            {(Object.keys(statuses) as ProjectTask["status"][]).map(
              (status) => (
                <section className={`pt-column ${status}`} key={status}>
                  <h2>
                    <span>{statuses[status]}</span>
                    <span>
                      {visible.filter((task) => task.status === status).length}
                    </span>
                  </h2>
                  {visible
                    .filter((task) => task.status === status)
                    .map(taskCard)}
                  {!visible.some((task) => task.status === status) && (
                    <p className="pt-column-empty">
                      {statuses[status]} 업무가 없어요.
                    </p>
                  )}
                </section>
              ),
            )}
          </div>
        ) : (
          <div className="pt-list">
            <div className="pt-list-head">
              <span>업무</span>
              <span>상태</span>
              <span>담당자</span>
              <span>기한</span>
            </div>
            {visible.map((task) => (
              <button
                className="pt-list-row"
                key={task.id}
                onClick={() => open(task)}
              >
                <span>
                  <small>
                    {task.requests.length
                      ? `${taskOrigin(task)} ${task.requests.length}개 연결`
                      : "내부 업무"}
                  </small>
                  <strong>{task.title}</strong>
                  {task.stageName && (
                    <span className="pt-help">
                      {(task.stageOrder ?? 0) + 1}단계 · {task.stageName}
                    </span>
                  )}
                </span>
                <span className={`pt-status ${task.status}`}>
                  {statuses[task.status]}
                </span>
                <span>
                  {task.assignees
                    .map((member) => member.displayName)
                    .join(", ") || "미지정"}
                </span>
                <span>{task.dueDate?.slice(0, 10) || "기한 없음"}</span>
              </button>
            ))}
            {!visible.length && (
              <p className="pt-empty">
                표시할 업무가 없어요. 요청을 등록하고 회의 또는 긴급 승인 절차를
                진행해주세요.
              </p>
            )}
          </div>
        ))
      )}
      <dialog
        ref={dialog}
        className="pt-dialog"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          if (!saveLock.current) setEditing(undefined);
        }}
      >
        {editing !== undefined && (
          <div className={editing ? "pt-detail-layout" : undefined}>
            <form onSubmit={save}>
              <header>
                <div>
                  <small>{project.name}</small>
                  <h2>{editing ? "업무 상세" : "새 업무 만들기"}</h2>
                </div>
                <button
                  type="button"
                  aria-label="업무 상세 닫기"
                  disabled={saving}
                  onClick={close}
                >
                  ×
                </button>
              </header>
              <div className="pt-form-body">
                {error && (
                  <p className="pt-error" role="alert">
                    {error}
                  </p>
                )}
                {editing && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void reloadEditing()}
                  >
                    최신 업무 다시 불러오기
                  </button>
                )}
                <p className="pt-help">
                  승인된 범위·담당자는 변경할 수 없어요. 추가 변경은 새 요청으로
                  등록해주세요.
                </p>
                <label>
                  업무 제목
                  <input
                    autoFocus
                    required
                    maxLength={160}
                    readOnly={!!editing}
                    value={draft.title}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                    placeholder="어떤 작업을 해야 하나요?"
                  />
                </label>
                <label>
                  업무 내용
                  <textarea
                    rows={4}
                    maxLength={10000}
                    readOnly={!!editing}
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                    placeholder="작업 범위와 완료 기준을 적어주세요."
                  />
                </label>
                <div className="pt-form-grid">
                  <label>
                    상태
                    <select
                      disabled={
                        saving ||
                        !canEditProgress ||
                        (!!selectedTask?.stageKey &&
                          !["todo", "in_progress"].includes(
                            selectedTask.status,
                          ))
                      }
                      value={draft.status}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          status: event.target.value as Draft["status"],
                        })
                      }
                    >
                      {Object.entries(statuses).map(([value, label]) => (
                        <option
                          value={value}
                          key={value}
                          disabled={
                            selectedTask?.stageKey
                              ? ![
                                  "todo",
                                  "in_progress",
                                  selectedTask.status,
                                ].includes(value)
                              : draft.mergeApprovalRequired &&
                                value === "done" &&
                                selectedTask?.status !== "done"
                          }
                        >
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    우선순위
                    <select
                      disabled={!!editing || saving}
                      value={draft.priority}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          priority: event.target.value as Draft["priority"],
                        })
                      }
                    >
                      {Object.entries(priorities).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    기한
                    <input
                      type="date"
                      readOnly={!!editing}
                      value={draft.dueDate}
                      onChange={(event) =>
                        setDraft({ ...draft, dueDate: event.target.value })
                      }
                    />
                  </label>
                </div>
                <fieldset disabled={saving || !canEditProgress}>
                  <legend>Git · 개발 진행</legend>
                  <p className="pt-help">
                    작업 브랜치와 PR 링크를 기록하세요. 단계 업무는 작업 완료와
                    전원 승인을 거쳐 배포 목록에서 처리합니다. 기존 업무의
                    병합·배포는 실제 결과를 확인한 후 기록하세요. 승인이 필요한
                    업무는 아래 검토·병합 절차를 이용하세요.
                  </p>
                  {(
                    [
                      ["repositoryUrl", "저장소 URL"],
                      ["workBranch", "작업 브랜치"],
                      ["liveBranch", "라이브 브랜치"],
                      ["pullRequestUrl", "PR URL"],
                      ["mergeCommit", "병합 커밋 SHA"],
                      ["deploymentUrl", "배포 성공 확인 URL"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        type={key.endsWith("Url") ? "url" : "text"}
                        maxLength={key.endsWith("Url") ? 2000 : 200}
                        value={draft[key]}
                        readOnly={
                          !!selectedTask?.stageKey &&
                          (key === "mergeCommit" ||
                            (key === "deploymentUrl" &&
                              selectedTask.completionMode !== "deploy"))
                        }
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
                {!selectedTask?.stageKey && (
                  <fieldset disabled={saving}>
                    <legend>병합 승인</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.mergeApprovalRequired}
                        disabled={
                          !project.canManage ||
                          !isAssignee ||
                          ["done", "released"].includes(
                            selectedTask?.status || "",
                          )
                        }
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            mergeApprovalRequired: e.target.checked,
                            mergeReviewerId: e.target.checked
                              ? draft.mergeReviewerId
                              : "",
                          })
                        }
                      />
                      이 업무는 병합 승인이 필요해요
                    </label>
                    {draft.mergeApprovalRequired && (
                      <>
                        <label>
                          병합 승인자
                          <select
                            value={draft.mergeReviewerId}
                            disabled={
                              !project.canManage ||
                              !isAssignee ||
                              ["done", "released"].includes(
                                selectedTask?.status || "",
                              )
                            }
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                mergeReviewerId: e.target.value,
                              })
                            }
                          >
                            <option value="">승인자 선택</option>
                            {members
                              .filter(
                                (m) =>
                                  m.canApproveMerge &&
                                  !draft.assigneeIds.includes(m.userId),
                              )
                              .map((m) => (
                                <option key={m.userId} value={m.userId}>
                                  {m.displayName}
                                </option>
                              ))}
                            {draft.mergeReviewerId &&
                              !members.some(
                                (m) =>
                                  m.userId === draft.mergeReviewerId &&
                                  m.canApproveMerge &&
                                  !draft.assigneeIds.includes(m.userId),
                              ) && (
                                <option value={draft.mergeReviewerId}>
                                  기존 승인자 · 권한 또는 담당자 설정 확인 필요
                                </option>
                              )}
                          </select>
                        </label>
                        <p className="pt-help">
                          관리자가 팀의 승인 권한을 가진 프로젝트 참여자를
                          지정해요. 담당자는 자신의 작업을 승인할 수 없어요.
                        </p>
                      </>
                    )}
                    {!selectedTask?.stageKey &&
                      selectedTask?.mergeApprovalRequired && (
                        <>
                          <p>
                            현재 검토:{" "}
                            <strong>
                              {reviewStatuses[selectedTask.reviewStatus]}
                            </strong>
                          </p>
                          {selectedTask.reviewHeadSha && (
                            <p className="pt-help">
                              검토 커밋: {selectedTask.reviewHeadSha}
                            </p>
                          )}
                          <p className="pt-help">
                            변경 요약·검증 결과·PR 링크를 저장한 뒤 검토를
                            요청하세요. 승인 이후 코드가 바뀌면 재검토가
                            필요해요.
                          </p>
                          {dirty && (
                            <p className="pt-help">
                              수정 내용을 먼저 저장한 뒤 업무를 다시 열어주세요.
                            </p>
                          )}
                          {selectedTask.status === "in_progress" && (
                            <>
                              <label>
                                검토 의견 · 수정 요청 시 필수
                                <textarea
                                  rows={3}
                                  maxLength={5000}
                                  value={reviewNote}
                                  onChange={(e) =>
                                    setReviewNote(e.target.value)
                                  }
                                />
                              </label>
                              <div className="pt-options">
                                {isAssignee && (
                                  <button
                                    type="button"
                                    disabled={dirty || saving}
                                    onClick={() => void review("request")}
                                  >
                                    검토 요청 / 재요청
                                  </button>
                                )}
                                {isReviewer &&
                                  selectedTask.reviewStatus === "pending" && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={dirty || saving}
                                        onClick={() => void review("approve")}
                                      >
                                        승인
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          dirty || saving || !reviewNote.trim()
                                        }
                                        onClick={() =>
                                          void review("changes_requested")
                                        }
                                      >
                                        수정 요청
                                      </button>
                                    </>
                                  )}
                                <button
                                  type="button"
                                  disabled={dirty || saving}
                                  onClick={() => void review("refresh")}
                                >
                                  최신 PR 확인
                                </button>
                                {(isAssignee || isReviewer) &&
                                  selectedTask.reviewStatus === "approved" && (
                                    <button
                                      type="button"
                                      disabled={dirty || saving}
                                      onClick={() => void review("merge")}
                                    >
                                      승인된 PR 병합
                                    </button>
                                  )}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    {selectedTask &&
                      !selectedTask.stageKey &&
                      !selectedTask.mergeApprovalRequired &&
                      selectedTask.status === "in_progress" &&
                      isAssignee && (
                        <button
                          type="button"
                          disabled={dirty || saving}
                          onClick={() => void review("merge")}
                        >
                          PR 병합
                        </button>
                      )}
                    {historyError && <p role="alert">{historyError}</p>}
                    {history.length > 0 && (
                      <section aria-label="병합 검토 이력">
                        <h3>검토 이력</h3>
                        {history.map((item) => (
                          <div key={item.id} className="pt-help">
                            <strong>
                              {reviewActions[item.action] || item.action} ·{" "}
                              {item.actorName}
                            </strong>
                            <p>
                              {new Date(item.createdAt).toLocaleString("ko-KR")}{" "}
                              · {item.headSha.slice(0, 12)}
                            </p>
                            {item.note && (
                              <p style={{ whiteSpace: "pre-wrap" }}>
                                {item.note}
                              </p>
                            )}
                          </div>
                        ))}
                      </section>
                    )}
                  </fieldset>
                )}
                {selectedTask?.dependencies?.length ? (
                  <section className="sw-review" aria-label="선행 단계 결과물">
                    <h3>선행 단계 결과물</h3>
                    {selectedTask.dependencies.map((d) => (
                      <article key={d.predecessorId || d.taskId}>
                        <h4>
                          {d.title} ·{" "}
                          {statuses[d.status as keyof typeof statuses] ||
                            d.status}
                        </h4>
                        {d.resultSummary && (
                          <p style={{ whiteSpace: "pre-wrap" }}>
                            {d.resultSummary}
                          </p>
                        )}
                        {d.verification && (
                          <p
                            style={{ whiteSpace: "pre-wrap" }}
                            className="pt-help"
                          >
                            검증 결과: {d.verification}
                          </p>
                        )}
                        {d.documentVersions?.map((doc) => (
                          <button
                            type="button"
                            key={doc.id}
                            onClick={() => onDocument?.(doc.documentId, doc.id)}
                            disabled={!onDocument}
                          >
                            {doc.title} · 확정 문서 버전 열기
                          </button>
                        ))}
                        {!d.resultSummary &&
                          !d.verification &&
                          !d.documentVersions?.length && (
                            <p className="pt-help">등록된 결과물이 없습니다.</p>
                          )}
                      </article>
                    ))}
                  </section>
                ) : null}
                {selectedTask?.stageKey && (
                  <>
                    <div className="sw-flow">
                      {selectedTask.dependencies?.map((d) => (
                        <span key={d.predecessorId || d.taskId}>
                          선행: {d.title} ·{" "}
                          {statuses[d.status as keyof typeof statuses] ||
                            d.status}
                        </span>
                      ))}
                      <span>
                        현재: {selectedTask.stageName} ·{" "}
                        {statuses[selectedTask.status]}
                      </span>
                    </div>
                    <WorkReview
                      workRevision={selectedTask.workRevision}
                      projectId={project.id}
                      taskId={selectedTask.id}
                      status={selectedTask.status}
                      userId={userId}
                      assignees={selectedTask.assignees}
                      disabled={dirty || saving}
                      onChanged={() => {
                        setRevision((v) => v + 1);
                        setEditing(undefined);
                        onChanged?.();
                      }}
                    />
                  </>
                )}
                <fieldset disabled={saving || !canEditProgress}>
                  <legend>개발 결과 · 승인 시점 내용</legend>
                  {selectedTask?.mergeApprovalRequired &&
                    ["done", "released"].includes(selectedTask.status) && (
                      <p className="pt-help">
                        승인된 결과는 보존돼요. 추가 설명은 아래 후속 기록에
                        남겨주세요.
                      </p>
                    )}
                  {(
                    [
                      ["resultSummary", "변경 요약"],
                      ["dbChanges", "DB 변경"],
                      ["apiChanges", "API 변경"],
                      ["frontendChanges", "프론트 변경"],
                      ["verification", "검증 결과"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <textarea
                        rows={3}
                        maxLength={10000}
                        readOnly={
                          !!selectedTask?.mergeApprovalRequired &&
                          ["done", "released"].includes(selectedTask.status)
                        }
                        value={draft[key]}
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
                {editing && (
                  <section aria-label="개발 결과 후속 기록">
                    <h3>개발 결과 후속 기록</h3>
                    {resultError && <p role="alert">{resultError}</p>}
                    {resultEntries.map(({ entry, actorName }) => (
                      <article key={entry.id}>
                        <strong>{entry.changeSummary}</strong>
                        <p>
                          {actorName} ·{" "}
                          {new Date(entry.createdAt).toLocaleString("ko-KR")}
                        </p>
                        {(
                          [
                            "resultSummary",
                            "dbChanges",
                            "apiChanges",
                            "frontendChanges",
                            "verification",
                          ] as const
                        ).map(
                          (key) =>
                            entry[key] && (
                              <p key={key} style={{ whiteSpace: "pre-wrap" }}>
                                {
                                  {
                                    resultSummary: "변경 요약",
                                    dbChanges: "DB",
                                    apiChanges: "API",
                                    frontendChanges: "프론트",
                                    verification: "검증",
                                  }[key]
                                }
                                : {entry[key]}
                              </p>
                            ),
                        )}
                      </article>
                    ))}
                    {selectedTask &&
                      ["done", "released"].includes(selectedTask.status) && (
                        <fieldset disabled={saving}>
                          <p className="pt-help">
                            완료·배포 상태와 기존 승인을 유지하면서 설명을
                            추가해요. 실제 코드 변경은 새 요청을 등록하고
                            승인받은 업무에서 진행하세요.
                          </p>
                          {(
                            [
                              "changeSummary",
                              "resultSummary",
                              "dbChanges",
                              "apiChanges",
                              "frontendChanges",
                              "verification",
                            ] as const
                          ).map((key) => (
                            <label key={key}>
                              {
                                {
                                  changeSummary: "추가 기록 제목 · 필수",
                                  resultSummary: "변경 설명",
                                  dbChanges: "DB 설계 기록",
                                  apiChanges: "API 작업 기록",
                                  frontendChanges: "프론트 작업 기록",
                                  verification: "검증 기록",
                                }[key]
                              }
                              <textarea
                                rows={2}
                                maxLength={
                                  key === "changeSummary" ? 1000 : 10000
                                }
                                value={resultEntry[key]}
                                onChange={(e) =>
                                  setResultEntry({
                                    ...resultEntry,
                                    [key]: e.target.value,
                                  })
                                }
                              />
                            </label>
                          ))}
                          <button
                            type="button"
                            disabled={
                              saving ||
                              dirty ||
                              !resultEntry.changeSummary.trim()
                            }
                            onClick={() => void addResultEntry()}
                          >
                            후속 기록 추가
                          </button>
                          {dirty && (
                            <p>
                              업무 수정 내용을 먼저 저장하거나 최신 업무를 다시
                              불러와주세요.
                            </p>
                          )}
                        </fieldset>
                      )}
                  </section>
                )}
                {editing && (
                  <section>
                    <h3>연결된 문서 변경 버전</h3>
                    {tasks
                      .find((t) => t.id === editing)
                      ?.documentVersions.map((v) => (
                        <p key={v.id}>
                          <button
                            type="button"
                            onClick={() => {
                              close();
                              onDocument?.(v.documentId, v.id);
                            }}
                          >
                            {v.title} · {v.changeSummary} ·{" "}
                            {new Date(v.createdAt).toLocaleString("ko-KR")}
                          </button>
                        </p>
                      ))}
                  </section>
                )}
                <fieldset>
                  <legend>승인된 담당자</legend>
                  <div className="pt-options">
                    {members.map((member) => (
                      <label key={member.userId}>
                        <input
                          type="checkbox"
                          checked={draft.assigneeIds.includes(member.userId)}
                          disabled={!!editing || saving}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              assigneeIds: toggle(
                                draft.assigneeIds,
                                member.userId,
                              ),
                            })
                          }
                        />
                        <span>{member.displayName}</span>
                      </label>
                    ))}
                    {!members.length && <p>배정할 개발팀 멤버가 없어요.</p>}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>승인된 연결 요청</legend>
                  <div className="pt-options pt-request-options">
                    {requests
                      .filter((item) => draft.requestIds.includes(item.id))
                      .map((item) => (
                        <label key={item.id}>
                          <input
                            type="checkbox"
                            checked={draft.requestIds.includes(item.id)}
                            disabled

                            onChange={() =>
                              setDraft({
                                ...draft,
                                requestIds: toggle(draft.requestIds, item.id),
                              })
                            }
                          />
                          <span>{item.title}</span>
                        </label>
                      ))}
                    {!requests.length && <p>연결된 요청이 없어요.</p>}
                  </div>
                </fieldset>
                {!!editing && draft.requestIds.length > 0 && (
                  <div className="pt-source-links">
                    {requests
                      .filter((item) => draft.requestIds.includes(item.id))
                      .map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          disabled={saving}
                          onClick={() => {
                            close();
                            onOpenRequest(item.id);
                          }}
                        >
                          ↗ {item.title}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <footer>
                <button type="button" disabled={saving} onClick={close}>
                  취소
                </button>
                <button
                  type="submit"
                  className="pt-primary"
                  disabled={saving || !draft.title.trim() || !canEditProgress}
                >
                  {saving ? "저장 중…" : editing ? "변경 저장" : "업무 만들기"}
                </button>
              </footer>
            </form>
            {editing && (
              <aside className="pt-detail-conversation">
                {draft.requestIds.length > 0 && (
                  <section className="pc-linked">
                    <h3>연결된 요청</h3>
                    {requests
                      .filter((item) => draft.requestIds.includes(item.id))
                      .map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          disabled={saving}
                          onClick={() => {
                            close();
                            onOpenRequest(item.id);
                          }}
                        >
                          {item.title} ↗
                        </button>
                      ))}
                  </section>
                )}

                <ProjectChannel
                  key={editing}
                  projectId={project.id}
                  taskId={editing}
                />
              </aside>
            )}
          </div>
        )}
      </dialog>
    </section>
  );
}
