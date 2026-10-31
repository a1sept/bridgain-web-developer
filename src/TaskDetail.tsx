import { useEffect, useRef, useState } from "react";
import TaskMaterials from "./TaskMaterials";
import RepositoryFields from "./RepositoryFields";
import { waitingForPredecessors } from "./ProjectTasks";
import type { ProjectTask } from "./ProjectTasks";
import type { TaskWorkspace } from "./desktop";
import { workflowApi } from "./Approvals";
import { requestForRepositoryFailure } from "./repository-access";
import RichTextContent from "./editor/RichTextContent";
import ControlIcon from "./components/ControlIcon";
import "./task-detail.css";
import { useTaskGit, LocalCode, GitControls, RemoteTaskCode } from "./TaskCode";
const statuses: Record<string, string> = { todo: "진행 전", in_progress: "진행 중", review_pending: "작업 완료 · 승인 대기", deploy_pending: "배포 대기", deploying: "배포 중", done: "승인 완료", released: "배포 완료" };
const priorities = { urgent: "긴급", high: "높음", normal: "보통", low: "낮음" };
type Review = { reviewers: { userId: string; displayName: string; status: string; note?: string }[]; assignees: ProjectTask["assignees"]; events?: { action: string; note: string; actorName?: string }[] };
export default function TaskDetail({ task, projectId, projectName, userId, onClose, onRequest, onTask, onChanged, onDeployments, onApprovals }: {
  task: ProjectTask; projectId: string; projectName: string; userId?: string;
  onClose: () => void; onRequest: (id: string) => void; onTask: (id: string) => void;
  onChanged: () => void; onDeployments?: () => void; onApprovals?: () => void;
}) {
  const bridge = task.completionMode === "code" ? window.bridgainDesktop : undefined;
  const waiting = waitingForPredecessors(task);
  const [materialsDirty, setMaterialsDirty] = useState(false);
  const path = `/projects/${projectId}/tasks/${task.id}`;
  const [review, setReview] = useState<Review>();
  const [local, setLocal] = useState<TaskWorkspace>();
  const [branch, setBranch] = useState(task.workBranch || `task/${task.id}`);
  const [baseBranch, setBaseBranch] = useState(task.liveBranch || "main");
  const [pr, setPr] = useState(task.pullRequestUrl || "");
  const [deployUrl, setDeployUrl] = useState(task.deploymentUrl || "");
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [localError, setLocalError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState("info");
  const localGit = !!bridge?.taskGit && !!local?.binding && task.completionMode === "code" && ["todo", "in_progress"].includes(task.status);
  const git = useTaskGit(projectId, task.id, localGit, onChanged);
  const refreshTask = useRef(onChanged);
  refreshTask.current = onChanged;
  useEffect(() => { setPr(task.pullRequestUrl || ""); }, [task.pullRequestUrl]);
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible") { refreshTask.current(); setRefresh(v => v + 1); }
    };
    const timer = window.setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, [projectId, task.id]);
  useEffect(() => {
    let active = true;
    setReview(undefined); setReviewError("");
    if (task.stageKey) workflowApi<Review>(`${path}/work`).then(d => { if (active) setReview(d); })
      .catch(e => { if (active) setReviewError(e.message); });
    return () => { active = false; };
  }, [path, task.version, refresh, task.stageKey]);
  useEffect(() => {
    let active = true;
    if (bridge?.taskWorkspace) bridge.taskWorkspace(projectId, task.id).then(d => {
      if (active) { setLocal(d); setLocalError(""); if (d.binding) { setBranch(d.binding.branch); setBaseBranch(d.binding.baseBranch); } }
    }).catch(e => { if (active) setLocalError(e.message); });
    return () => { active = false; };
  }, [bridge, projectId, task.id, refresh]);
  const assignees = review?.assignees || task.assignees;
  const mine = assignees.find(a => a.userId === userId);
  const reviewer = review?.reviewers.find(a => a.userId === userId);
  const codeReview = task.completionMode === "code";
  const legacyMergePending = codeReview && task.status === "deploy_pending" && !task.mergeCommit;
  const mergeRetry = codeReview && !task.mergeCommit && !!review?.reviewers.length && review.reviewers.every(a => a.status === "approved");
  const canApprove = !!reviewer && (task.status === "review_pending" || legacyMergePending) && (reviewer.status !== "approved" || mergeRetry);
  const progressing = ["todo", "in_progress"].includes(task.status);
  const editable = !waiting && !!mine && progressing && !assignees.some(a => a.completedAt);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); onChanged(); setRefresh(v => v + 1); }
    catch (e) { setError(e instanceof Error ? e.message : "처리에 실패했습니다."); onChanged(); setRefresh(v => v + 1); }
    finally { setBusy(false); }
  }
  async function patch(values: Record<string, unknown>) {
    await workflowApi(path, { expectedVersion: task.version, ...values }, "PATCH");
  }
  async function act(action: string) {
    const result = await workflowApi<{ mergeFailed?: boolean; error?: string }>(`${path}/work`, { action, note, expectedRevision: task.workRevision, ...(action === "approve" && codeReview ? { expectedHeadSha: task.reviewHeadSha || task.approvedHeadSha } : {}) });
    if (result?.mergeFailed) throw new Error(result.error || "main 병합에 실패했습니다. 원인을 확인한 뒤 다시 시도해주세요.");
    setNote(""); setRejecting(false);
  }
  async function approve() {
    if (codeReview) {
      const sha = task.reviewHeadSha || task.approvedHeadSha;
      if (!task.repositoryUrl || !task.pullRequestUrl || !sha) throw new Error("저장소·PR·검토 커밋 정보를 다시 불러온 뒤 승인해주세요.");
      const finalVote = review?.reviewers.every(a => a.userId === userId || a.status === "approved");
      if (!window.confirm(`저장소: ${task.repositoryUrl}\nPR: ${task.pullRequestUrl}\n검토 커밋: ${sha}\n대상 브랜치: main\n\n${finalVote ? "최종 승인 후 이 커밋의 PR을 main에 병합합니다." : "이번 승인을 기록하고, 마지막 필수 승인자가 승인하면 main에 병합합니다."}\n변경 내용을 확인했으며 계속 진행할까요?`)) return;
    }
    await act("approve");
  }
  return <div className="td-layout">
    <header className="td-header"><div><small>{projectName}</small><h2>{task.title}</h2></div>
      <div className="td-header-actions">
        <button type="button" aria-label="업무 새로고침" title="업무 새로고침" disabled={busy} onClick={() => { onChanged(); setRefresh(v => v + 1); }}><ControlIcon name="refresh" size={16} /></button>
        <button type="button" aria-label="업무 상세 닫기" onClick={onClose}><ControlIcon name="close" size={16} /></button>
      </div></header>
    <section className="td-information" aria-label="업무 정보" tabIndex={0}>
      {task.completionMode === "code" && <nav className="td-code-tabs" aria-label="업무 상세 보기"><button aria-pressed={tab === "info"} onClick={() => setTab("info")}>업무 정보</button><button aria-pressed={tab === "code"} onClick={() => setTab("code")}>코드 작업</button>{localGit && <button aria-pressed={tab === "history"} onClick={() => setTab("history")}>커밋 이력</button>}</nav>}
      {tab !== "info" ? <div className="td-body">{localGit ? <LocalCode git={git} history={tab === "history"} editable={!waiting && !!mine && progressing && !mine.completedAt} /> : task.pullRequestUrl ? <RemoteTaskCode projectId={projectId} taskId={task.id} /> : <p className="td-muted">데스크톱 앱에서 로컬 작업 디렉토리와 업무 브랜치를 연결해주세요.</p>}</div> :
      <div className="td-body">
        {task.requests.length > 0 && <div className="td-links">{task.requests.map(r => <button key={r.id} onClick={() => onRequest(r.id)}>{r.title} ↗</button>)}</div>}
        <div><h3>카테고리</h3><span className="td-badge">{task.stageName || "미지정"}</span></div>
        <dl className="td-meta"><div><dt>상태</dt><dd>{waiting ? "선행 업무 대기" : statuses[task.status]}</dd></div><div><dt>우선순위</dt><dd>{priorities[task.priority]}</dd></div><div><dt>기한</dt><dd>{task.dueDate?.slice(0, 10) || "기한 없음"}</dd></div></dl>
        <div className="td-people"><section><h3>담당자</h3>{assignees.map(a => <p key={a.userId}>{a.displayName} <span className="td-badge">{a.completedAt ? "작업 완료" : task.status === "todo" ? "진행 전" : "미완료"}</span></p>)}</section>
          <section><h3>작업 승인자</h3>{review?.reviewers.map(a => <p key={a.userId}>{a.displayName} <span className="td-badge">{a.status === "approved" ? "승인 완료" : a.status === "changes_requested" ? "재작업 요청" : "승인 대기"}</span></p>)}
            {task.stageKey && !review && !reviewError && <p>불러오는 중…</p>}
            {review?.reviewers.length === 0 && <p>미지정</p>}
            {!task.stageKey && <p>기존 병합 승인 절차 사용</p>}
            {reviewError && <p role="alert">{reviewError} <button onClick={() => setRefresh(v => v + 1)}>다시 불러오기</button></p>}
          </section></div>
        {!!task.dependencies?.length && <section><h3>선행 업무</h3><div className="td-links">{task.dependencies.map(d => <button key={d.predecessorId || d.taskId} disabled={busy || !(d.predecessorId || d.taskId)} onClick={() => onTask((d.predecessorId || d.taskId)!)}>{d.title} · {statuses[d.status] || d.status} ↗</button>)}</div></section>}
        <section><h3>업무 내용</h3><RichTextContent value={task.description} document={task.descriptionDocument} /></section>
      </div>}
    </section>
    <aside className="td-work" aria-label="업무 작업 패널" tabIndex={0}>
      {waiting && <p className="td-waiting" role="status">선행 업무의 작업 승인이 완료되면 시작할 수 있습니다.</p>}
      {task.status === "in_progress" && review?.events?.some(e => e.action === "changes_requested") && <div className="td-rework"><strong>재작업 요청</strong><p>{review.events.find(e => e.action === "changes_requested")?.note}</p><small>{task.completionMode === "code" ? "기존 브랜치에서 수정·푸시 후 같은 PR로 재제출해주세요." : "문서와 메모를 보완한 뒤 다시 작업 완료를 요청해주세요."}</small></div>}
      <TaskMaterials key={task.id} task={task} projectId={projectId} editable={editable} onChanged={onChanged} onDirtyChange={setMaterialsDirty} />
      {task.completionMode === "code" && <><RepositoryFields value={[]} onChange={() => {}} connectionOnly /><h3>로컬 작업</h3>

      {!bridge?.taskWorkspace ? <p className="td-muted">로컬 폴더와 브랜치 연결은 데스크톱 앱에서 사용할 수 있습니다.</p> : <>
        {localError && <p role="alert">{localError} <button disabled={busy} onClick={() => setRefresh(v => v + 1)}>다시 확인</button></p>}
        {!local ? (!localError && <p>로컬 연결 확인 중…</p>) : !local.folder ? <button disabled={busy} onClick={() => void run(async () => { const result = await bridge.chooseFolder(projectId); if (result && typeof result === "object" && result.ok === false) throw Error(await requestForRepositoryFailure(projectId, result)); })}>기존 디렉토리 연결</button> : <>
          <h3>로컬 작업 디렉토리</h3>
          <p className="td-muted">● 연결됨</p><p className="td-path">{local.binding?.path || local.folder}</p>
          <button disabled={busy} onClick={() => void run(() => bridge.taskWorkspace(projectId, task.id, "open"))}>폴더 열기</button>
          {editable && local.binding?.path === local.folder && task.status === "in_progress" && task.workBranch && <button disabled={busy} onClick={() => void run(async () => { setLocal(await bridge.taskWorkspace(projectId, task.id, "start", { branch: local.binding!.branch, baseBranch: local.binding!.baseBranch, existing: true })); })}>업무 브랜치로 전환</button>}
          {editable && (!local.binding || task.status === "todo" || !task.workBranch) ? <>
            <label>기준 브랜치<input value={baseBranch} disabled={busy || !!local.binding} onChange={e => setBaseBranch(e.target.value)} /></label>
            <label>업무 브랜치<input value={branch} disabled={busy || !!local.binding || !!task.workBranch} onChange={e => setBranch(e.target.value)} /></label>
            <button disabled={busy || !branch.trim() || !baseBranch.trim()} onClick={() => void run(async () => { setLocal(await bridge.taskWorkspace(projectId, task.id, "start", { branch, baseBranch, existing: false })); setTab("code"); })}>{busy ? "연결 중…" : local.binding ? "업무 연결 다시 시도" : "브랜치 생성 및 업무 진행"}</button>
            {!local.binding && <button disabled={busy || !branch.trim()} onClick={() => void run(async () => { setLocal(await bridge.taskWorkspace(projectId, task.id, "start", { branch, baseBranch, existing: true })); })}>기존 브랜치 연결</button>}
          </> : <p className="td-path">{local.binding?.branch || task.workBranch || "연결된 업무 브랜치 없음"}</p>}
        </>}
      </>}
      {localGit && <GitControls git={git} editable={!waiting && !!mine && progressing && !mine.completedAt} />}
      </>}
      <section className="td-actions"><h3>작업 진행</h3>
        {error && <p className="td-error" role="alert">{error}</p>}
        {task.completionMode === "code" && <label>PR URL<input type="url" value={pr} disabled={busy || !editable} placeholder="https://github.com/…/pull/…" onChange={e => setPr(e.target.value)} />{editable && pr !== (task.pullRequestUrl || "") && <button disabled={busy} onClick={() => void run(() => patch({ pullRequestUrl: pr }))}>PR 연결 저장</button>}</label>}
        {task.completionMode === "deploy" && <label>배포 확인 URL<input type="url" value={deployUrl} disabled={busy || !editable} onChange={e => setDeployUrl(e.target.value)} />{editable && deployUrl !== (task.deploymentUrl || "") && <button disabled={busy} onClick={() => void run(() => patch({ deploymentUrl: deployUrl }))}>확인 URL 저장</button>}</label>}
        {mine && task.status === "todo" && task.completionMode !== "code" && <button disabled={busy || waiting} onClick={() => void run(() => patch({ status: "in_progress" }))}>작업 시작</button>}
        {mine && progressing && task.stageKey && !(localGit && task.completionMode === "code") && <button disabled={busy || waiting || materialsDirty || task.status !== "in_progress" || !review || !!mine.completedAt || pr !== (task.pullRequestUrl || "") || deployUrl !== (task.deploymentUrl || "")} onClick={() => void run(() => act("complete"))}>{mine.completedAt ? "내 작업 완료됨" : "내 작업 완료"}</button>}
        {mine?.completedAt && progressing && <p className="td-muted">다른 담당자의 작업 완료를 기다리고 있습니다.</p>}
        {task.status === "review_pending" && <p className="td-muted">작업 완료 · 승인 대기</p>}
        {legacyMergePending && <p className="td-muted">기존 승인은 완료됐지만 main 병합이 남아 있습니다. 업무에서 병합을 완료하면 배포 목록에 표시됩니다.</p>}
        {codeReview && (task.status === "review_pending" || legacyMergePending) && <p className="td-muted">코드 작업에서 변경 내용을 확인해주세요. 마지막 필수 승인 시 main에 병합하며, 병합 성공 후 배포 대기로 이동합니다.</p>}
        {canApprove && <button disabled={busy || !review || (codeReview && !(task.reviewHeadSha || task.approvedHeadSha))} onClick={() => void run(approve)}>{codeReview ? mergeRetry ? "main 병합 다시 시도" : "승인 및 main 병합" : "작업 승인"}</button>}
        {reviewer && !task.mergeCommit && (["review_pending", "deploy_pending", "done"].includes(task.status) || (task.status === "in_progress" && assignees.some(a => a.completedAt))) && <button disabled={busy} onClick={() => setRejecting(v => !v)}>재작업 요청</button>}
        {rejecting && <label>재작업 사유<textarea maxLength={5000} value={note} onChange={e => setNote(e.target.value)} /><button disabled={busy || !note.trim()} onClick={() => void run(() => act("changes_requested"))}>재작업 요청 보내기</button></label>}
        {!task.stageKey && onApprovals && <button onClick={onApprovals}>승인함 열기</button>}
        {["deploy_pending", "deploying", "released"].includes(task.status) && (!codeReview || !!task.mergeCommit) && onDeployments && <button onClick={onDeployments}>배포 화면 열기</button>}
      </section>
    </aside>
  </div>;
}
