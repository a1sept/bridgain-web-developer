import { useEffect, useState } from "react";
import { workflowApi } from "./Approvals";
import "./stage-workflow.css";
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
  const base = `/projects/${projectId}`;
  useEffect(() => {
    setTasks([]);
    setSelected([]);
    setResults([]);
    setAttempts([]);
    setError("");
  }, [base]);
  useEffect(() => {
    let active = true;
    workflowApi<{
      tasks: DeploymentTask[];
      attempts?: Attempt[];
    }>(`${base}/deployments`)
      .then((d) => {
        if (active) {
          setTasks(d.tasks);
          setAttempts(d.attempts || []);
          setSelected((v) =>
            v.filter((id) =>
              d.tasks.some((t) => t.id === id && t.status === "deploy_pending"),
            ),
          );
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [base, refreshKey, revision]);
  async function deploy(ids: string[]) {
    if (
      !ids.length ||
      busy ||
      !window.confirm(
        `${ids.length}개 업무의 승인된 PR을 병합하고 배포할까요? 결과는 업무별로 표시됩니다.`,
      )
    )
      return;
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
      setBusy(false);
    }
  }
  async function confirmDeployment(t: DeploymentTask) {
    const url = window.prompt(
      "실제 배포가 완료된 URL을 입력하세요.",
      t.deploymentUrl || "",
    );
    if (!url) return;
    setBusy(true);
    try {
      await workflowApi(`${base}/tasks/${t.id}/deployment`, { url });
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="pw-resource sw-deploy">
      <header>
        <div>
          <h1>배포 목록</h1>
          <p className="sw-help">
            전원 승인이 끝난 코드 업무를 개별 또는 일괄 배포합니다. 병합 후 실제
            배포 확인까지 진행 상태를 유지합니다.
          </p>
        </div>
        <button onClick={() => setRevision((v) => v + 1)} disabled={busy}>
          새로고침
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!canDeploy && <p>배포 실행 권한이 필요합니다.</p>}
      <div className="sw-actions">
        <label>
          <input
            type="checkbox"
            checked={
              tasks.some((t) => t.status === "deploy_pending") &&
              tasks
                .filter((t) => t.status === "deploy_pending")
                .every((t) => selected.includes(t.id))
            }
            onChange={(e) =>
              setSelected(
                e.target.checked
                  ? tasks
                      .filter((t) => t.status === "deploy_pending")
                      .map((t) => t.id)
                  : [],
              )
            }
          />{" "}
          배포 대기 전체 선택
        </label>
        <button
          className="pw-primary"
          disabled={!canDeploy || busy || !selected.length}
          onClick={() => void deploy(selected)}
        >
          선택 {selected.length}개 배포
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>선택</th>
            <th>업무 · 요청</th>
            <th>승인 커밋</th>
            <th>상태</th>
            <th>실행</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>
                <input
                  type="checkbox"
                  disabled={busy || t.status !== "deploy_pending"}
                  checked={selected.includes(t.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, t.id]
                        : selected.filter((id) => id !== t.id),
                    )
                  }
                />
              </td>
              <td>
                <button onClick={() => onTask?.(t.id)}>{t.title}</button>
                <p className="sw-help">
                  {t.requests?.map((r) => r.title).join(" · ")}
                </p>
              </td>
              <td>{t.approvedHeadSha?.slice(0, 12) || "—"}</td>
              <td>
                {{
                  deploy_pending: "배포 대기",
                  deploying: "배포 중",
                  released: "배포 완료",
                  in_progress: "재작업",
                }[t.status] || t.status}
              </td>
              <td>
                {t.status === "deploy_pending" && (
                  <button
                    disabled={!canDeploy || busy}
                    onClick={() => void deploy([t.id])}
                  >
                    배포하기
                  </button>
                )}
                {t.status === "deploying" && (
                  <button
                    disabled={!canDeploy || busy}
                    onClick={() => void confirmDeployment(t)}
                  >
                    배포 완료 확인
                  </button>
                )}
                {t.deploymentUrl && (
                  <a href={t.deploymentUrl} target="_blank" rel="noreferrer">
                    배포 열기
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!tasks.length && <p>배포 대기 중인 업무가 없습니다.</p>}
      {!!results.length && (
        <section aria-live="polite">
          <h2>배포 실행 결과</h2>
          {results.map((r) => (
            <p key={r.taskId}>
              {tasks.find((t) => t.id === r.taskId)?.title || r.taskId} ·{" "}
              {r.status}
              {r.error && ` — ${r.error}`}
            </p>
          ))}
        </section>
      )}
      {!!attempts.length && (
        <details>
          <summary>배포 실행 이력 {attempts.length}건</summary>
          {attempts.map((row) => (
            <p className="sw-help" key={row.task_deployment_attempts.id}>
              {row.project_tasks.title} · {row.task_deployment_attempts.status}{" "}
              ·{" "}
              {new Date(row.task_deployment_attempts.createdAt).toLocaleString(
                "ko-KR",
              )}{" "}
              · {row.task_deployment_attempts.note}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
