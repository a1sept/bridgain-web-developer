import { useEffect, useRef, useState, useId } from "react";
import { workflowApi } from "./Approvals";
import { createPortal } from "react-dom";
import ControlIcon from "./components/ControlIcon";
import "./deployments.css";
type Attempt = {
  task_deployment_attempts: {
    id: string;
    taskId: string;
    status: string;
    headSha: string;
    note: string;
    createdAt: string;
  };
  project_tasks: { title: string };
};
type DeploymentTask = {
  id: string;
  title: string;
  status: string;
  stageName?: string;
  approvedHeadSha?: string;
  mergeCommit?: string;
  pullRequestUrl?: string | null;
  deploymentUrl?: string | null;
  requests?: {
    id: string;
    title: string;
  }[];
};
export default function Deployments({
  projectId,
  canDeploy = false,
  refreshKey = 0,
  onChanged,
  onTask,
}: {
  projectId: string;
  canDeploy?: boolean;
  refreshKey?: number;
  onChanged?: () => void;
  onTask?: (id: string) => void;
}) {
  const [tasks, setTasks] = useState<DeploymentTask[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [results, setResults] = useState<
      {
        taskId: string;
        status: string;
        error?: string;
      }[]
    >([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [tab, setTab] = useState<"waiting" | "active" | "complete" | "history">("waiting");
  const [loading, setLoading] = useState(true);
  const [confirmTask, setConfirmTask] = useState<DeploymentTask | null>(null);
  const [liveUrl, setLiveUrl] = useState("");
  const [liveChecked, setLiveChecked] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const initialTab = useRef(true);
  const panelId = useId();
  useEffect(() => {
    if (confirmTask) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmTask]);
  const base = `/projects/${projectId}`;
  useEffect(() => {
    initialTab.current = true;
    setTab("waiting");
    setConfirmTask(null);
    setTasks([]);
    setSelected([]);
    setResults([]);
    setAttempts([]);
    setError("");
  }, [base]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    workflowApi<{
      tasks: DeploymentTask[];
      attempts?: Attempt[];
    }>(`${base}/deployments`)
      .then((d) => {
        if (active) {
          const mergedTasks = d.tasks.filter(t => !!t.mergeCommit);
          setTasks(mergedTasks);
          if (initialTab.current) {
            setTab(mergedTasks.some(t => t.status === "deploying") ? "active" : "waiting");
            initialTab.current = false;
          }
          setAttempts(d.attempts || []);
          setSelected((v) =>
            v.filter((id) =>
              mergedTasks.some((t) => t.id === id && t.status === "deploy_pending"),
            ),
          );
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
    };
  }, [base, refreshKey, revision]);
  async function deploy(ids: string[]) {
    if (
      !canDeploy ||
      submitting.current ||
      !ids.length ||
      busy ||
      !window.confirm(
        `${ids.length}개 업무를 배포 중으로 전환할까요? 이미 main에 병합된 코드입니다. 실제 배포는 배포 환경에서 실행하고 완료 결과를 확인해주세요.`,
      )
    )
      return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const d = await workflowApi<{
        results: typeof results;
      }>(`${base}/deployments`, { taskIds: ids });
      setResults(d.results);
      setSelected([]);
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function confirmDeployment() {
    if (!confirmTask || !canDeploy || !liveChecked || submitting.current) return;
    const url = liveUrl.trim();
    try { const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw Error(); }
    catch { setConfirmError("실제 라이브 서비스의 HTTPS 주소를 입력해주세요."); return; }
    submitting.current = true;
    setBusy(true); setConfirmError("");
    try {
      await workflowApi(`${base}/tasks/${confirmTask.id}/deployment`, { url });
      setConfirmTask(null);
      setRevision(v => v + 1);
      onChanged?.();
    } catch (e) { setConfirmError((e as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }
  const waiting = tasks.filter(t => t.status === "deploy_pending");
  const activeTasks = tasks.filter(t => !["deploy_pending", "released"].includes(t.status));
  const complete = tasks.filter(t => t.status === "released");
  const visible = tab === "waiting" ? waiting : tab === "active" ? activeTasks : complete;
  const tabs = [
    { id: "waiting" as const, label: "배포 대기", count: waiting.length },
    { id: "active" as const, label: "진행 중", count: activeTasks.length },
    { id: "complete" as const, label: "완료", count: complete.length },
    { id: "history" as const, label: "실행 이력", count: attempts.length },
  ];
  const statusLabel = (status: string) => ({ deploy_pending: "배포 대기", deploying: "배포 확인 대기", released: "배포 완료", in_progress: "재작업", failed: "실패", merged: "main 병합 완료", started: "배포 시작", pending: "처리 중" }[status] || status);
  const safeUrl = (value?: string | null) => { try { const url = new URL(value || ""); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } };
  return <section className="pw-resource deployment-page" aria-label="배포 목록">
    <header className="deployment-heading">
      <div><h1>배포 목록</h1><p>main에 병합된 업무의 배포 진행과 라이브 반영 결과를 확인하세요.</p></div>
      <div className="deployment-heading-actions">{!canDeploy && <span className="deployment-readonly">조회 전용</span>}<button className="deployment-button" disabled={busy || loading} onClick={() => setRevision(v => v + 1)}>새로고침</button></div>
    </header>
    <div className="deployment-tabs" role="tablist" aria-label="배포 상태">
      {tabs.map((item, index) => <button key={item.id} id={`${panelId}-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={panelId} tabIndex={tab === item.id ? 0 : -1}
        onClick={() => setTab(item.id)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
          if (next >= 0) { event.preventDefault(); setTab(tabs[next].id); document.getElementById(`${panelId}-${tabs[next].id}`)?.focus(); }
        }}>{item.label}<span>{item.count}</span></button>)}
    </div>
    {error && <p className="deployment-error" role="alert">{error}</p>}
    <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${tab}`} aria-busy={loading}>
      {tab === "waiting" && canDeploy && waiting.length > 0 && <div className="deployment-toolbar">
        <label><input type="checkbox" disabled={busy || loading} checked={waiting.every(t => selected.includes(t.id))} onChange={event => setSelected(event.target.checked ? waiting.map(t => t.id) : [])} />전체 선택</label>
        <span>{selected.length}개 선택</span><button className="deployment-button is-primary" disabled={busy || loading || !selected.length} onClick={() => void deploy(selected)}>선택 항목 배포 시작</button>
      </div>}
      {loading && !tasks.length && !attempts.length ? <div className="deployment-empty" role="status">배포 목록을 불러오는 중입니다.</div> : tab === "history" ? <div className="deployment-table-wrap">
        <table className="deployment-table"><thead><tr><th>업무</th><th>상태</th><th>실행 시각</th><th>기록</th></tr></thead><tbody>
          {attempts.map(({ task_deployment_attempts: attempt, project_tasks: task }) => <tr key={attempt.id}>
            <td><button className="deployment-task-link" disabled={!onTask} onClick={() => onTask?.(attempt.taskId)}>{task.title}</button><code>{attempt.headSha?.slice(0, 12)}</code></td>
            <td><span className={`deployment-status status-${attempt.status}`}>{statusLabel(attempt.status)}</span></td>
            <td className="deployment-date">{new Date(attempt.createdAt).toLocaleString("ko-KR")}</td><td className="deployment-note">{attempt.note || "—"}</td>
          </tr>)}
        </tbody></table>{!attempts.length && <div className="deployment-empty"><strong>아직 실행 이력이 없습니다.</strong><p>배포 실행 기록이 이곳에 표시됩니다.</p></div>}
      </div> : <div className="deployment-table-wrap">
        <table className="deployment-table"><thead><tr>{tab === "waiting" && canDeploy && <th className="deployment-select-cell">선택</th>}<th>업무 · 요청</th><th>PR · 병합 커밋</th><th>상태</th><th className="deployment-action-cell">실행</th></tr></thead><tbody>
          {visible.map(t => <tr key={t.id}>
            {tab === "waiting" && canDeploy && <td className="deployment-select-cell"><input type="checkbox" aria-label={`${t.title} 선택`} disabled={busy || loading} checked={selected.includes(t.id)} onChange={event => setSelected(event.target.checked ? [...selected, t.id] : selected.filter(id => id !== t.id))} /></td>}
            <td><button className="deployment-task-link" disabled={!onTask} onClick={() => onTask?.(t.id)}>{t.title}</button>{!!t.requests?.length && <p className="deployment-request">{t.requests.map(r => r.title).join(" · ")}</p>}</td>
            <td>{safeUrl(t.pullRequestUrl) ? <a className="deployment-pr" href={safeUrl(t.pullRequestUrl)} target="_blank" rel="noreferrer">{t.pullRequestUrl?.match(/\/pull\/(\d+)/)?.[1] ? `#${t.pullRequestUrl.match(/\/pull\/(\d+)/)![1]}` : "PR 보기"}</a> : <span>—</span>}<code title={t.mergeCommit}>{t.mergeCommit?.slice(0, 12)}</code></td>
            <td><span className={`deployment-status status-${t.status}`}>{statusLabel(t.status)}</span></td>
            <td className="deployment-action-cell"><div className="deployment-row-actions">
              {canDeploy && t.status === "deploy_pending" && <button className="deployment-button" disabled={busy || loading} onClick={() => void deploy([t.id])}>배포 시작</button>}
              {canDeploy && t.status === "deploying" && <button className="deployment-button is-primary" disabled={busy || loading} onClick={() => { setLiveUrl(t.deploymentUrl || ""); setLiveChecked(false); setConfirmError(""); setConfirmTask(t); }}>완료 확인</button>}
              {safeUrl(t.deploymentUrl) && <a className="deployment-live" href={safeUrl(t.deploymentUrl)} target="_blank" rel="noreferrer">라이브 보기 <ControlIcon name="arrow" size={12} /></a>}
              {!canDeploy && !t.deploymentUrl && <span className="deployment-muted">조회 전용</span>}
            </div></td>
          </tr>)}
        </tbody></table>{!visible.length && <div className="deployment-empty"><strong>{tab === "waiting" ? "배포 대기 중인 업무가 없습니다." : tab === "active" ? "진행 중인 배포가 없습니다." : "완료된 배포가 없습니다."}</strong><p>{tab === "waiting" ? "승인과 main 병합이 끝난 업무가 표시됩니다." : tab === "active" ? "배포를 시작하면 이곳에서 라이브 반영을 확인할 수 있습니다." : "라이브 적용을 확인한 업무가 이곳에 표시됩니다."}</p></div>}
      </div>}
    </div>
    {!!results.length && <section className="deployment-results" aria-live="polite"><h2>최근 실행 결과</h2>{results.map(r => <p key={r.taskId}>{tasks.find(t => t.id === r.taskId)?.title || r.taskId} · {statusLabel(r.status)}{r.error && ` — ${r.error}`}</p>)}</section>}
    {createPortal(<dialog ref={dialog} className="deployment-confirm" aria-labelledby={`${panelId}-confirm-title`} aria-describedby={`${panelId}-confirm-description`} onCancel={event => { event.preventDefault(); if (!busy) setConfirmTask(null); }}>
      <form onSubmit={event => { event.preventDefault(); void confirmDeployment(); }}>
        <header><h2 id={`${panelId}-confirm-title`}>실제 라이브 서버에 적용했나요?</h2><button type="button" className="deployment-close" aria-label="닫기" disabled={busy} onClick={() => setConfirmTask(null)}><ControlIcon name="close" size={16} /></button></header>
        <div className="deployment-confirm-body"><p id={`${panelId}-confirm-description`}>main 병합만으로는 배포가 완료되지 않습니다. 해당 변경이 라이브 서버에 반영되고 정상 동작하는지 확인해주세요.</p>
          <div className="deployment-confirm-task"><strong>{confirmTask?.title}</strong><code>main · {confirmTask?.mergeCommit?.slice(0, 12)}</code></div>
          <label className="deployment-url">라이브 서비스 주소<input type="url" required placeholder="https://service.example.com" value={liveUrl} disabled={busy} onChange={event => setLiveUrl(event.target.value)} /></label>
          <label className="deployment-ack"><input type="checkbox" checked={liveChecked} disabled={busy} onChange={event => setLiveChecked(event.target.checked)} />실제 라이브 서버 적용과 정상 동작을 확인했습니다.</label>
          {confirmError && <p className="deployment-error" role="alert">{confirmError}</p>}
        </div>
        <footer><button type="button" className="deployment-button" autoFocus disabled={busy} onClick={() => setConfirmTask(null)}>취소</button><button type="submit" className="deployment-button is-primary" disabled={busy || !canDeploy || !liveChecked || !liveUrl.trim()}>{busy ? "처리 중…" : "라이브 적용 확인 · 배포 완료"}</button></footer>
      </form>
    </dialog>, document.body)}
  </section>;
}
