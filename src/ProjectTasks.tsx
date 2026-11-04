import type { RichDocument } from "./editor/document";
import TaskDetail from "./TaskDetail";
import ControlIcon from "./components/ControlIcon";
import { progressColumns, requestRows, stageId, taskStage, taskFinished, type StageColumn } from "./task-progress";
import FilterBar from "./components/FilterBar";
import { useEffect, useRef, useState } from "react";
import "./project-tasks.css";
import "./task-progress.css";

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
  waitingForPredecessors?: boolean;
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
    content?: string;
    url?: string | null;
    changeSummary: string;
    createdAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
};
export const waitingForPredecessors = (task: ProjectTask) => ["todo", "in_progress"].includes(task.status) && (task.waitingForPredecessors ?? !!task.dependencies?.some(d => !["done", "released", "deploy_pending", "deploying"].includes(d.status)));

const statuses = {
  waiting: "선행 업무 대기",
  todo: "진행 전",
  in_progress: "진행 중",
  review_pending: "작업 완료 · 승인 대기",
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
  const [view, setView] = useState<"progress" | "list">("progress"),
    [assignee, setAssignee] = useState("");
  const [configuredStages, setConfiguredStages] = useState<StageColumn[]>([]);
  const [stageError, setStageError] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [hideUnused, setHideUnused] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<string | undefined>();
  const dialog = useRef<HTMLDialogElement>(null);
  const selectedTask = tasks.find((t) => t.id === editing);
  const base = `/projects/${project.id}`;
  useEffect(() => {
    setCollapsed([]); setHideUnused(false); setAssignee(""); setSearch(""); setStatusFilter(""); setEditing(undefined);
  }, [project.id]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setStageError(false);
    Promise.all([
      request<{ tasks: ProjectTask[] }>(`${base}/tasks`),
      request<{ requests: RequestLink[] }>(`${base}/requests`).catch(() => ({
        requests: [],
      })),
      request<{ stageTypes: StageColumn[] }>(`${base}/stage-settings`).catch(() => {
        if (active) setStageError(true);
        return { stageTypes: [] };
      }),
    ])
      .then(([result, links, settings]) => {
        if (active) {
          setTasks(result.tasks);
          setRequests(links.requests);
          setConfiguredStages(settings.stageTypes);
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
  const visible = tasks.filter(task =>
    (!assignee || (assignee === "unassigned" ? !task.assignees.length : task.assignees.some(member => member.userId === assignee))) &&
    (!statusFilter || task.status === statusFilter) &&
    (!search.trim() || [task.title, ...task.requests.map(link => link.title)].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  );
  const matchingIds = new Set(visible.map(task => task.id));
  const rows = requestRows(tasks, matchingIds);
  const columns = progressColumns(tasks, configuredStages);
  const usedStages = new Set(rows.flatMap(row => row.tasks.map(task => stageId(taskStage(task)))));
  const shownColumns = columns.filter(stage => !hideUnused || usedStages.has(stageId(stage)));
  const hiddenCount = columns.length - shownColumns.length;
  function toggleColumn(id: string) {
    setCollapsed(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }
  function taskStatus(task: ProjectTask) {
    return <span className={`pt-status ${task.status}`}>{statuses[task.status]}</span>;
  }
  function taskNotes(task: ProjectTask) {
    const pending = task.dependencies?.filter(d => !["done", "released", "deploy_pending", "deploying"].includes(d.status)) || [];
    return <>
      {task.reviewStatus === "changes_requested" && <small className="pt-attention">재작업 요청</small>}
      {task.reviewStatus === "stale" && <small className="pt-attention">재검토 필요</small>}
      {task.assignees.length > 0 && !taskFinished(task) && <small>담당자 완료 {task.assignees.filter(a => a.completedAt).length}/{task.assignees.length}명</small>}
      {(waitingForPredecessors(task) || (task.status === "review_pending" && pending.length > 0)) && <small className="pt-attention">{task.status === "todo" ? "선행 업무 미완료 · 착수 가능" : "최종 승인 전 선행 업무 완료 필요"}{pending.length ? ` · ${pending.map(d => d.title).join(", ")}` : ""}</small>}
    </>;
  }
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
  return (
    <section className="pt-workspace" aria-label={`${project.name} 업무`}>
      <header className="pt-heading">
        <div>
          <p>PROJECT TASKS</p>
          <h1>업무</h1>
          <span>요청별 단계 흐름과 개별 업무의 진행 상황을 확인하세요.</span>
        </div>
        <button
          className="pt-primary"
          onClick={onCreateRequest}
          disabled={loading || !!loadError}
        >
          <ControlIcon name="plus" /> 개발 요청
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
            aria-pressed={view === "progress"}
            onClick={() => setView("progress")}
          >
            단계 진행표
          </button>
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            리스트
          </button>
        </div>
        <input className="pt-search" type="search" aria-label="요청 또는 업무 검색" placeholder="요청 또는 업무 검색" value={search} onChange={e => setSearch(e.target.value)} />
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
          }, {
            id: "status", label: "상태", values: statusFilter ? [statusFilter] : [],
            options: Object.entries(statuses).filter(([value]) => value !== "waiting").map(([value, label]) => ({ value, label })),
            onChange: values => setStatusFilter(values[0] || ""),
          }]}
          onClear={() => { setAssignee(""); setStatusFilter(""); }}
        />
        <span>{visible.length}개 업무</span>
      </div>
      {loading ? <p className="pt-empty" role="status">업무를 불러오는 중이에요.</p> : !loadError && <>
        {view === "progress" && <div className="pt-progress-tools">
          <p>{rows.length}개 요청·내부 업무 · 칸을 눌러 업무 상세를 확인하세요.{(assignee || statusFilter || search.trim()) && " 조건에 맞는 업무가 있는 요청의 전체 단계를 표시합니다."}</p>
          <button className="pt-mine-toggle" aria-pressed={hideUnused} onClick={() => setHideUnused(!hideUnused)}>미사용 단계 숨기기{hiddenCount > 0 ? ` · ${hiddenCount}개` : ""}</button>
          {collapsed.length > 0 && <button className="pt-mine-toggle" onClick={() => setCollapsed([])}>접은 단계 모두 펼치기</button>}
        </div>}
        {stageError && view === "progress" && <p className="pt-attention" role="status">단계 설정을 불러오지 못해 등록된 업무의 단계만 표시합니다.</p>}
        {!visible.length ? <p className="pt-empty">{tasks.length ? "조건에 맞는 업무가 없어요. 검색어나 필터를 변경해보세요." : "아직 생성된 업무가 없어요. 요청의 회의 또는 긴급 승인이 완료되면 단계별 업무가 표시됩니다."}</p> : view === "progress" ?
          <div className="pt-table-scroll" role="region" aria-label="요청별 단계 진행표" tabIndex={0}>
            <table className="pt-progress-table">
              <caption className="pt-sr-only">요청별 단계 진행표. 해당 없음은 연결된 단계 업무가 없음을 의미하며, 열 순서는 선행 조건을 의미하지 않습니다.</caption>
              <thead><tr><th scope="col" className="pt-request-cell">요청 / 진행 현황</th>{shownColumns.map(stage => {
                const id = stageId(stage), folded = collapsed.includes(id);
                return <th scope="col" key={id} className={folded ? "pt-folded" : ""}><button className="pt-column-toggle" aria-expanded={!folded} aria-label={`${stage.name} 단계 ${folded ? "펼치기" : "접기"}`} onClick={() => toggleColumn(id)}>{stage.name}<ControlIcon name="chevron" /></button></th>;
              })}</tr></thead>
              <tbody>{rows.map(row => <tr key={row.id}>
                <th scope="row" className="pt-request-cell">
                  <small>{row.requestId ? (requests.find(r => r.id === row.requestId)?.origin === "development" ? "개발 요청" : "요청") : "내부 업무"}</small>
                  <button className="pt-title-button" onClick={() => row.requestId ? onOpenRequest(row.requestId) : open(row.tasks[0])}>{row.title}</button>
                  <span className="pt-row-progress">완료 {row.tasks.filter(taskFinished).length}/{row.tasks.length}건</span>
                </th>
                {shownColumns.map(stage => {
                  const id = stageId(stage), folded = collapsed.includes(id);
                  const cellTasks = row.tasks.filter(task => stageId(taskStage(task)) === id);
                  return <td key={id} className={folded ? "pt-folded" : ""}>
                    {!cellTasks.length ? <span className="pt-not-applicable" aria-label="해당 없음" title="이 요청에 연결된 단계 업무가 없습니다">—</span> : folded ?
                      <button className="pt-fold-summary" onClick={() => toggleColumn(id)} aria-label={`${row.title}, ${stage.name} 펼치기`}>완료 {cellTasks.filter(taskFinished).length}/{cellTasks.length}<small>{[...new Set(cellTasks.map(task => statuses[task.status]))].join(" · ")}</small></button> :
                      cellTasks.map(task => <button key={task.id} className={`pt-stage-task ${matchingIds.has(task.id) ? "" : "pt-context-task"}`} onClick={() => open(task)} aria-label={`${task.title}, ${statuses[task.status]}, 업무 상세`}>
                        {taskStatus(task)}<strong>{task.title}</strong>{taskNotes(task)}<small>{task.assignees.map(a => a.displayName).join(", ") || "담당자 미지정"}{task.dueDate ? ` · ${task.dueDate.slice(0, 10)}` : ""}</small>
                      </button>)}
                  </td>;
                })}
              </tr>)}</tbody>
            </table>
          </div> :
          <div className="pt-table-scroll" role="region" aria-label="업무 리스트" tabIndex={0}>
            <table className="pt-task-table"><caption className="pt-sr-only">업무별 상태, 진행 현황, 담당자와 기한</caption>
              <thead><tr><th scope="col">업무 / 연결 요청</th><th scope="col">단계</th><th scope="col">상태 / 진행 현황</th><th scope="col">담당자</th><th scope="col">기한 / 우선순위</th></tr></thead>
              <tbody>{visible.map(task => <tr key={task.id}>
                <th scope="row"><button className="pt-title-button" onClick={() => open(task)}>{task.title}</button><div className="pt-request-links">{task.requests.length ? task.requests.map(link => <button key={link.id} onClick={() => onOpenRequest(link.id)}>{link.title}</button>) : <small>내부 업무</small>}</div></th>
                <td>{task.stageName || "미분류"}</td>
                <td><div className="pt-task-progress">{taskStatus(task)}{taskNotes(task)}</div></td>
                <td>{task.assignees.map(a => a.displayName).join(", ") || "미지정"}</td>
                <td><div className="pt-task-progress"><span>{task.dueDate?.slice(0, 10) || "기한 없음"}</span><span className={`pt-priority ${task.priority}`}>{priorities[task.priority]}</span></div></td>
              </tr>)}</tbody>
            </table>
          </div>}
        {view === "progress" && visible.length > 0 && <p className="pt-table-note">— 해당 없음 · 완료 건수는 작업량 기준 진행률이 아닙니다. 선행 조건에 따라 여러 단계가 동시에 진행될 수 있습니다.</p>}
      </>}
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
