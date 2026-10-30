import { useEffect, useState } from "react";
import { workflowApi } from "./Approvals";
import "./stage-workflow.css";
import { RemoteTaskCode } from "./TaskCode";
type Person = {
  userId: string;
  displayName: string;
  status?: string;
  completedAt?: string | null;
  note?: string;
};
export default function WorkReview({
  projectId,
  taskId,
  status,
  userId,
  assignees,
  onChanged,
  disabled = false,
  workRevision,
}: {
  projectId: string;
  taskId: string;
  status: string;
  userId?: string;
  assignees: Person[];
  onChanged: () => void;
  disabled?: boolean;
  workRevision?: number;
}) {
  const [showCode, setShowCode] = useState(false);
  const [data, setData] = useState<{
      events: {
        id: string;
        action: string;
        actorName?: string;
        note?: string;
        createdAt: string;
      }[];
      reviewers: Person[];
      assignees?: Person[];
    }>({ events: [], reviewers: [] }),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const path = `/projects/${projectId}/tasks/${taskId}/work`;
  useEffect(() => {
    let active = true;
    workflowApi<typeof data>(path)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [path, status, workRevision]);
  async function action(action: string) {
    setBusy(true);
    setError("");
    try {
      await workflowApi(path, { action, note, expectedRevision: workRevision });
      const d = await workflowApi<typeof data>(path);
      setData(d);
      setNote("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const mine = assignees.some((a) => a.userId === userId),
    reviewer = data.reviewers.some((a) => a.userId === userId),
    completed = (data.assignees || assignees).find(
      (a) => a.userId === userId,
    )?.completedAt;
  return (
    <section className="sw-review">
      <h3>작업 완료 · 전원 승인</h3>
      <button type="button" onClick={() => setShowCode(v => !v)}>{showCode ? "PR 코드 접기" : "연결된 PR 코드 확인"}</button>
      {showCode && <RemoteTaskCode projectId={projectId} taskId={taskId} />}
      <p className="sw-help">
        작업 완료는 자동 승인이 아닙니다. 재작업 요청 시 전원 완료와 승인이
        초기화됩니다.
      </p>
      {["todo", "in_progress"].includes(status) && data.events.some((event) => event.action === "predecessor_changed") && (
        <p className="sw-help" role="status">
          선행 업무 변경 이력이 있습니다. 아래 작업 이력과 선행 업무 내용을 확인하고 진행해주세요.
        </p>
      )}
      <ul>
        {(data.assignees || assignees).map((a) => (
          <li key={a.userId}>
            {a.displayName} · {a.completedAt ? "작업 완료" : "작업 중"}
          </li>
        ))}
      </ul>
      <ul>
        {data.reviewers.map((a) => (
          <li key={a.userId}>
            {a.displayName} · {a.status === "approved" ? "승인" : "승인 대기"}
            {a.note && ` · ${a.note}`}
          </li>
        ))}
      </ul>
      <label>
        승인 의견 · 재작업 사유
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={5000}
        />
      </label>
      {disabled && <p className="sw-help">변경 내용을 먼저 저장해주세요.</p>}
      <div className="sw-actions">
        {mine && ["todo", "in_progress"].includes(status) && (
          <button
            type="button"
            className="pw-primary"
            disabled={busy || disabled || !!completed}
            onClick={() => void action("complete")}
          >
            {completed ? "작업 완료됨" : "내 작업 완료"}
          </button>
        )}
        {reviewer && status === "review_pending" && (
          <button
            type="button"
            className="pw-primary"
            disabled={busy || disabled}
            onClick={() => void action("approve")}
          >
            작업 승인
          </button>
        )}
        {reviewer &&
          (["review_pending", "deploy_pending", "done"].includes(status) ||
            (status === "in_progress" &&
              (data.assignees || assignees).some((a) => !!a.completedAt))) && (
            <button
              type="button"
              disabled={busy || disabled || !note.trim()}
              onClick={() => void action("changes_requested")}
            >
              재작업 요청
            </button>
          )}
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => void action("refresh")}
        >
          최신 작업 확인
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {data.events.length > 0 && (
        <details>
          <summary>작업 이력 {data.events.length}건</summary>
          {data.events.map((e) => (
            <p key={e.id} className="sw-help">
              {new Date(e.createdAt).toLocaleString("ko-KR")} · {e.actorName} ·{" "}
              {{
                complete: "작업 완료",
                completed: "작업 완료",
                approve: "승인",
                approved: "승인",
                changes_requested: "재작업 요청",
                refresh: "최신 확인",
                predecessor_changed: "선행 업무 변경",
                deploy_started: "배포 시작",
                released: "배포 완료",
                approved_head_changed: "코드 변경으로 승인 초기화",
                stale: "재승인 필요",
              }[e.action] || e.action}
              {e.note && ` — ${e.note}`}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
