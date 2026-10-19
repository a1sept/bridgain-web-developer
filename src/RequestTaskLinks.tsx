import { useEffect, useState } from "react";
type Task = {
  id: string;
  title: string;
  status: string;
  stageName?: string;
  stageOrder?: number;
  dependencies?: { predecessorId: string; title: string; status: string }[];
  assignees?: { userId: string; displayName: string }[];
  requests: { id: string }[];
};
export default function RequestTaskLinks({
  projectId,
  requestId,
  onTasks,
  refreshKey,
}: {
  refreshKey?: string;
  projectId: string;
  requestId: string;
  onTasks: (requestId?: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/workspace/projects/${projectId}/tasks`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error("연결된 업무를 불러오지 못했어요.");
        return r.json();
      })
      .then((d) =>
        setTasks(
          d.tasks.filter((t: Task) =>
            t.requests.some((r) => r.id === requestId),
          ),
        ),
      )
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, requestId, retry, refreshKey]);
  return (
    <section className="rb-panel">
      <h2>연결된 업무</h2>
      {loading ? (
        <p role="status">불러오는 중…</p>
      ) : error ? (
        <p role="alert">
          {error}
          <button onClick={() => setRetry((v) => v + 1)}>다시 시도</button>
        </p>
      ) : tasks.length ? (
        <ul className="rb-linked-tasks">
          {[...tasks]
            .sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
            .map((task) => (
              <li key={task.id}>
                <button
                  onClick={() => {
                    window.sessionStorage.setItem("bridgain-task", task.id);
                    onTasks(requestId);
                  }}
                >
                  {task.stageName &&
                    `${(task.stageOrder || 0) + 1}. ${task.stageName} · `}
                  {task.title}
                </button>
                {!!task.assignees?.length && (
                  <small>
                    담당: {task.assignees.map((p) => p.displayName).join(", ")}
                  </small>
                )}
                {!!task.dependencies?.length && (
                  <small>
                    선행: {task.dependencies.map((d) => d.title).join(", ")}
                  </small>
                )}
                <span>
                  {
                    (
                      {
                        blocked: "선행 업무 대기",
                        review_pending: "작업 승인 대기",
                        deploy_pending: "배포 대기",
                        deploying: "배포 중",
                        todo: "진행 전",
                        in_progress: "진행 중",
                        done: "작업 완료",
                        released: "배포 완료",
                      } as Record<string, string>
                    )[task.status]
                  }
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="rb-muted">
          아직 연결된 업무가 없어요. 회의에서 검토한 후 승인을 요청해주세요.
        </p>
      )}
      <p className="rb-muted">
        회의 또는 긴급 승인에서 필수 승인자 전원이 승인하면 업무가 생성됩니다.
      </p>
    </section>
  );
}
