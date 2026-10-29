import type { RichDocument } from "./editor/document";
import TaskDetail from "./TaskDetail";
import FilterBar from "./components/FilterBar";
import { useEffect, useRef, useState } from "react";
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
  descriptionDocument?: RichDocument | null;
  status:
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
const reviewStatuses: Record<string, string> = {
  none: "검토 요청 전",
  pending: "승인 대기",
  approved: "승인됨",
  changes_requested: "수정 요청",
  stale: "재검토 필요",
};
const statuses = {
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
  onDeployments,
  onApprovals,
  onCreateRequest,
}: {
  project: { id: string; name: string; members: Member[]; canManage?: boolean };
  onCreateRequest?: () => void;
  onApprovals?: () => void;
  onDeployments?: () => void;
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
  const [editing, setEditing] = useState<string | undefined>();
  const dialog = useRef<HTMLDialogElement>(null);
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
    if (task) setEditing(task.id);
    else onCreateRequest?.();
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
  function close() { setEditing(undefined); }
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
            <span className="pt-card-badge">
              {(task.stageOrder ?? 0) + 1}단계 · {task.stageName}
            </span>
          )}
          {task.mergeApprovalRequired && (
            <span className="pt-card-badge">
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
            className="pt-mine-toggle"
            aria-pressed={assignee === userId}
            onClick={() => setAssignee(assignee === userId ? "" : userId)}
          >
            내 업무
          </button>
        )}
        <FilterBar
          label="업무 필터"
          filters={[{
            id: "assignee",
            label: "담당자",
            values: assignee ? [assignee] : [],
            options: [
              { value: "unassigned", label: "미지정" },
              ...members.map((member) => ({
                value: member.userId,
                label: `${member.displayName}${member.userId === userId ? " (나)" : ""}`,
              })),
            ],
            onChange: (values) => setAssignee(values[0] || ""),
          }]}
          onClear={() => setAssignee("")}
        />
        <span>{visible.length}개 업무</span>
      </div>
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
      <dialog ref={dialog} className="pt-dialog pt-task-dialog" onCancel={close} onClose={close}>
        {selectedTask && <TaskDetail key={selectedTask.id} task={selectedTask}
          projectId={project.id} projectName={project.name} userId={userId}
          onClose={close} onRequest={(id) => { close(); onOpenRequest(id); }}
          onTask={(id) => setEditing(id)} onDeployments={onDeployments} onApprovals={onApprovals}
          onChanged={() => { setRevision(v => v + 1); onChanged?.(); }} />}
      </dialog>
    </section>
  );
}
