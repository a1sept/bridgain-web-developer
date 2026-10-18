import { useEffect, useState } from "react";
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
  const data = await response.json().catch(() => { throw Error("서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요."); });
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
  }[];
};
export function ApproverPicker({
  items,
  value,
  onChange,
  label,
}: {
  items: Approver[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  return (
    <fieldset className="approval-picker">
      <legend>{label || "필수 승인자 · 전원 승인 후 업무 생성"}</legend>
      {items.map((item) => (
        <label key={item.userId} style={{ display: "block" }}>
          <input
            type="checkbox"
            checked={value.includes(item.userId)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, item.userId]
                  : value.filter((id) => id !== item.userId),
              )
            }
          />
          {item.displayName}
        </label>
      ))}
      {!items.length && (
        <p>선택 가능한 참여자가 없어요. 참여자 관리에서 확인해주세요.</p>
      )}
    </fieldset>
  );
}
export default function Approvals({
  projectId,
  onChanged,
}: {
  projectId?: string;
  onChanged?: () => void;
}) {
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
  const [items, setItems] = useState<Approval[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [filter, setFilter] = useState("pending"),
    [projectFilter, setProjectFilter] = useState(""),
    [source, setSource] = useState(""),
    [origin, setOrigin] = useState("");
  useEffect(() => {
    let live = true;
    workflowApi<{ approvals: Approval[] }>(
      projectId ? `/projects/${projectId}/approvals` : "/approvals",
    )
      .then((data) => {
        if (live) setItems(data.approvals);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [projectId, revision]);
  async function act(item: Approval, action: string) {
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
  const visibleItems = items.filter(
    (i) =>
      (!filter || i.status === filter) &&
      (!projectFilter || i.projectId === projectFilter) &&
      (!source || i.source === source) &&
      (!origin || i.plans.some((p) => p.origin === origin)),
  );
  return (
    <section className="pw-panel approvals-page">
      <header className="approvals-heading">
        <span>WORKFLOW APPROVALS</span>
        <h1>승인함</h1>
        <p>
          지정된 필수 승인자가 모두 승인하면 요청별로 업무가 하나씩 생성됩니다.
        </p>
      </header>
      {error && (
        <p className="approvals-error" role="alert">
          {error}
        </p>
      )}
      <div className="approvals-filters">
        <select
          aria-label="승인 상태"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">전체 상태</option>
          {Object.entries(labels).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        {!projectId && (
          <select
            aria-label="프로젝트"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">전체 프로젝트</option>
            {Array.from(
              new Map(items.map((i) => [i.projectId, i.projectName])),
            ).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="승인 출처"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">모든 출처</option>
          <option value="meeting">회의</option>
          <option value="urgent">긴급</option>
        </select>
        <select
          aria-label="요청 종류"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
        >
          <option value="">모든 요청</option>
          <option value="customer">고객 요청</option>
          <option value="development">개발 요청</option>
        </select>
        <button
          className="pw-secondary"
          onClick={() => setRevision((v) => v + 1)}
        >
          새로고침
        </button>
      </div>
      {visibleItems.map((item) => (
        <article key={item.id} className="approval-card">
          <header className="approval-card-heading">
            <h2>{item.title}</h2>
            <span className={`approval-status ${item.status}`}>
              {labels[item.status] || item.status}
            </span>
          </header>
          <p className="approval-meta">
            {item.projectName} · {item.source === "meeting" ? "회의" : "긴급"} ·
            요청자 {item.requesterName}
          </p>
          {item.plans.map((p) => (
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
              <p>
                담당자:{" "}
                {p.assigneeIds?.map((id) => names[id] || id).join(", ") ||
                  "미지정"}
              </p>
            </div>
          ))}
          <ul className="approval-reviewers">
            {item.approvers.map((a) => (
              <li key={a.userId}>
                {a.displayName}: {labels[a.status] || a.status}
                {a.note && ` · ${a.note}`}
              </li>
            ))}
          </ul>
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
      {!visibleItems.length && (
        <div className="approvals-empty">
          <span aria-hidden="true">✓</span>
          <h2>
            {items.length
              ? "조건에 맞는 승인 요청이 없어요"
              : "승인 요청이 없어요"}
          </h2>
          <p>
            {items.length
              ? "필터를 변경해 다른 승인 요청을 확인하세요."
              : "회의 또는 긴급 승인 요청이 등록되면 여기에 표시돼요."}
          </p>
        </div>
      )}
    </section>
  );
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
    [planning, setPlanning] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [members, setMembers] = useState<Approver[]>([]),
    [assignees, setAssignees] = useState<string[]>([]);
  useEffect(() => {
    workflowApi<{ approvers: Approver[] }>(`/projects/${projectId}/approvals`)
      .then((d) => setApprovers(d.approvers))
      .catch((e) => setError(e.message));
    workflowApi<{
      projects: {
        id: string;
        members: (Approver & { accountType: string })[];
      }[];
    }>("")
      .then((d) =>
        setMembers(
          d.projects
            .find((p) => p.id === projectId)
            ?.members.filter((m) => m.accountType === "team") || [],
        ),
      )
      .catch(() => {});
  }, [projectId]);
  return (
    <section className="rb-panel urgent-approval">
      <h2>긴급 승인 요청</h2>
      <p>회의만 생략하며 필수 승인자 전원의 승인이 필요합니다.</p>
      <label>
        작업 범위
        <textarea
          value={planning}
          onChange={(e) => setPlanning(e.target.value)}
        />
      </label>
      <ApproverPicker
        label="업무 담당자"
        items={members}
        value={assignees}
        onChange={setAssignees}
      />
      <ApproverPicker
        items={approvers}
        value={selected}
        onChange={setSelected}
      />
      {!canAssign && <p role="status">긴급 승인 요청에는 업무 배정 권한이 필요합니다.</p>}
      {error && <p role="alert">{error}</p>}
      <button
        className="pw-primary"
        disabled={
          !canAssign || busy || !selected.length || !planning.trim() || !assignees.length
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
                  planning,
                  priority: "urgent",
                  assigneeIds: assignees,
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
