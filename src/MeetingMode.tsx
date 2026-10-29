import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import MeetingRequestForm from "./MeetingRequestForm";
import StagePlanEditor, { type StagePlan } from "./StagePlanEditor";
import "./meeting-mode.css";
export type MeetingRequestPlan = {
  discussionStatus?: "unreviewed" | "discussed" | "deferred";
  requestId: string;
  planning: string;
  priority: string;
  stages?: StagePlan[];
  assigneeIds: string[];
  uiNotes?: string;
  apiNotes?: string;
  dbNotes?: string;
  taskId?: string | null;
};
type Person = { userId: string; displayName: string };
type RequestInfo = { id: string; title: string; description?: string };
type Detail = {
  request: { title: string; description: string };
  attachments: { id: string; name: string; mimeType: string; url: string }[];
};
const priorities: Record<string, string> = {
  urgent: "긴급",
  high: "높음",
  normal: "보통",
  low: "낮음",
};
export default function MeetingMode({
  presentation = true,
  isNew = false,
  renderConnector,
  onRemove,
  onTask,
  projectId,
  title,
  when,
  location,
  notes,
  plans,
  requests,
  members,
  reviewers,
  readOnly,
  busy,
  dirty,
  error,
  onNotes,
  onPlan,
  onSave,
  onExit,
  lifecycleLabel, onLifecycle, header, footer, overviewInfo, newRequestOpen, onCancelRequest, onCreateRequest,
}: {
  header?: ReactNode;
  overviewInfo?: ReactNode;
  footer?: ReactNode;
  newRequestOpen?: boolean;
  onCancelRequest?: () => void;
  onCreateRequest?: (draft: { title: string; description: string; priority: string; type: string }) => Promise<void>;
  lifecycleLabel?: string;
  onLifecycle?: () => void;
  presentation?: boolean;
  isNew?: boolean;
  renderConnector?: (
    index: number,
    mode: "empty" | "append" | "gap",
  ) => ReactNode;
  onRemove?: (id: string) => void;
  onTask?: (id: string) => void;
  projectId: string;
  title: string;
  when: string;
  location: string;
  notes: string;
  plans: MeetingRequestPlan[];
  requests: RequestInfo[];
  members: Person[];
  reviewers: Person[];
  readOnly: boolean;
  busy: boolean;
  dirty: boolean;
  error: string;
  onNotes: (s: string) => void;
  onPlan: (id: string, change: Partial<MeetingRequestPlan>) => void;
  onSave: () => void;
  onExit: () => void;
}) {
  const exitButton = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [hideNav, setHideNav] = useState(false),
    [query, setQuery] = useState("");
  const [collapsedByRequest, setCollapsedByRequest] = useState<
    Record<string, string[]>
  >({});
  const [detail, setDetail] = useState<Detail | null>(null),
    [loading, setLoading] = useState(false),
    [detailError, setDetailError] = useState(""),
    [retry, setRetry] = useState(0);
  const index = plans.findIndex((p) => p.requestId === selected),
    plan = plans[index];
  const requestTitle = (id: string) =>
    requests.find((r) => r.id === id)?.title || "연결된 요청";
  useEffect(() => {
    setDetail(null);
    setDetailError("");
    if (!selected) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/workspace/projects/${projectId}/requests/${selected}`, {
      credentials: "same-origin",
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok)
          throw Error(data.message || "요청 내용을 불러오지 못했습니다.");
        return data as Detail;
      })
      .then((d) => {
        if (!controller.signal.aborted) setDetail(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setDetailError(
            e instanceof Error ? e.message : "요청 내용을 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, selected, retry]);
  useEffect(() => {
    if (selected && !plans.some((p) => p.requestId === selected))
      setSelected(null);
  }, [plans, selected]);
  function next(offset: number) {
    const p = plans[index + offset];
    if (p) setSelected(p.requestId);
  }
  const shell = (
    <div className="mm-shell">
      {header}
      {!header && presentation && (
        <header className="mm-topbar">
          <div>
            <small>회의 모드</small>
            <h1>{title || "새 회의"}</h1>
          </div>
          <div className="mm-top-actions">
            <span role="status">
              {readOnly
                ? "읽기 전용"
                : busy
                  ? "저장 중…"
                  : dirty
                    ? "저장되지 않은 변경사항"
                    : "저장됨"}
            </span>
            <button
              type="button"
              aria-pressed={hideNav}
              onClick={() => setHideNav((v) => !v)}
            >
              {hideNav ? "목차 보기" : "목차 숨기기"}
            </button>
            {!readOnly && (
              <button
                type="button"
                className="mm-primary"
                disabled={busy || !dirty}
                onClick={onSave}
              >
                {isNew ? "회의 생성하기" : "회의 저장"}
              </button>
            )}
            {lifecycleLabel && <button type="button" disabled={busy} onClick={onLifecycle}>{lifecycleLabel}</button>}
            <button
              type="button"
              ref={exitButton}
              disabled={busy}
              onClick={onExit}
            >
              회의 모드 종료
            </button>
          </div>
        </header>
      )}
      {error && (
        <p className="mm-error" role="alert">
          {error}
        </p>
      )}
      <div
        className={`mm-layout ${presentation && hideNav ? "mm-no-nav" : ""}`}
      >
        {(!presentation || !hideNav) && (
          <nav className="mm-nav" aria-label="회의 요청 목차">
            <button
              type="button"
              aria-current={selected === null ? "page" : undefined}
              onClick={() => setSelected(null)}
            >
              전체 보기 · {plans.length}개 요청
            </button>
            <input
              aria-label="회의 요청 검색"
              placeholder="요청 제목 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {plans
              .filter((p) =>
                requestTitle(p.requestId)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((p) => (
                <Fragment key={p.requestId}>
                  {!readOnly && (
                    <fieldset disabled={busy} className="mm-connector">
                      {renderConnector?.(plans.indexOf(p), "gap")}
                    </fieldset>
                  )}
                  <button
                    type="button"
                    key={p.requestId}
                    aria-current={selected === p.requestId ? "page" : undefined}
                    onClick={() => setSelected(p.requestId)}
                  >
                    <small>
                      {plans.indexOf(p) + 1}. {priorities[p.priority]}
                    </small>
                    <span>{requestTitle(p.requestId)}</span>
                  </button>
                </Fragment>
              ))}
            {!readOnly && (
              <fieldset disabled={busy} className="mm-connector">
                {plans.length > 0 && renderConnector?.(plans.length, "gap")}
                {renderConnector?.(
                  plans.length,
                  plans.length ? "append" : "empty",
                )}
              </fieldset>
            )}
            {!plans.length && <p>요청을 연결한 뒤 업무를 추가하세요.</p>}
          </nav>
        )}
        {newRequestOpen && onCreateRequest ? <MeetingRequestForm busy={busy} onCancel={onCancelRequest!} onCreate={onCreateRequest} /> : !plan ? (
          <div className="mm-detail mm-overview-layout">
            <main className="mm-overview">
              <p className="mm-eyebrow">오늘의 회의</p>
              {overviewInfo || <><h2>{title || "새 회의"}</h2>
              <p className="mm-muted">
                {when ? new Date(when).toLocaleString("ko-KR") : "일시 미정"} ·{" "}
                {location || "장소 미정"}
              </p></>}
              <label className="mm-card mm-field">
                회의 전체 메모
                <textarea
                  rows={5}
                  maxLength={20000}
                  aria-label="회의 전체 메모"
                  value={notes}
                  disabled={readOnly || busy}
                  placeholder="회의 목적, 공통 전달사항, 전체 결론을 기록하세요."
                  onChange={(e) => onNotes(e.target.value)}
                />
              </label>
              <div className="mm-summary"><span>요청 <strong>{plans.length}</strong></span><span>업무 <strong>{plans.reduce((n,p)=>n+(p.stages?.length || 0),0)}</strong></span><span>논의 완료 <strong>{plans.filter(p=>p.discussionStatus === "discussed").length}</strong></span></div><h3>연결된 요청</h3>
              <div className="mm-agenda">
                {plans.map((p, i) => (
                  <button
                    type="button"
                    key={p.requestId}
                    onClick={() => setSelected(p.requestId)}
                  >
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <span className="mm-agenda-title"><strong>{requestTitle(p.requestId)}</strong><small>{requests.find(r=>r.id===p.requestId)?.description?.replace(/\s+/g," ").slice(0,100) || "요청을 열어 내용을 확인하세요."}</small></span>
                    <small>
                      {priorities[p.priority]} · {p.discussionStatus === "discussed" ? "논의 완료" : p.discussionStatus === "deferred" ? "보류" : "미논의"}<br />업무 {p.stages?.length || 0}개 · {(p.stages || []).some(s=>!s.assigneeIds.length) ? "담당자 미지정" : p.stages?.length ? "담당자 지정됨" : "업무 미작성"}
                    </small>
                    <span>→</span>
                  </button>
                ))}
              </div>
              {!plans.length && (
                <div className="mm-card">
                  <p>
                    아직 연결된 요청이 없습니다. 왼쪽에서 요청을 연결하거나 전체
                    메모를 먼저 작성하세요.
                  </p>
                </div>
              )}
            </main>

          </div>
        ) : (
          <div className="mm-detail">
            <main className="mm-request" key={plan.requestId}>
              <p className="mm-eyebrow">
                요청 {index + 1} / {plans.length}
              </p>
              <h2>{requestTitle(plan.requestId)}</h2>
              <div className="mm-request-meta"><span className="mm-priority">{priorities[plan.priority]}</span><select aria-label="논의 상태" disabled={readOnly || busy} value={plan.discussionStatus || "unreviewed"} onChange={e=>onPlan(plan.requestId,{discussionStatus:e.target.value as MeetingRequestPlan["discussionStatus"]})}><option value="unreviewed">미논의</option><option value="discussed">논의 완료</option><option value="deferred">보류</option></select></div>
              {loading && <p role="status">요청 내용을 불러오는 중…</p>}
              {detailError && (
                <p role="alert" className="mm-error">
                  {detailError}{" "}
                  <button type="button" onClick={() => setRetry((v) => v + 1)}>
                    다시 시도
                  </button>
                </p>
              )}
              {detail && (
                <>
                  <section className="mm-card">
                    <h3>요청 내용</h3>
                    <p className="mm-description">
                      {detail.request.description ||
                        "등록된 요청 내용이 없습니다."}
                    </p>
                  </section>
                  {detail.attachments.length > 0 && (
                    <section className="mm-card">
                      <h3>첨부 자료</h3>
                      {detail.attachments.map((a) => (
                        <figure key={a.id}>
                          {a.mimeType.startsWith("image/") &&
                            a.mimeType !== "image/svg+xml" && (
                              <img src={a.url} alt={a.name} loading="lazy" />
                            )}
                          <figcaption>
                            <a href={a.url} target="_blank" rel="noreferrer">
                              {a.name} ↗
                            </a>
                          </figcaption>
                        </figure>
                      ))}
                    </section>
                  )}
                  <details className="mm-card">
                    <summary>요청 원문 보기</summary>
                    <h3>{detail.request.title}</h3>
                    <p className="mm-description">
                      {detail.request.description}
                    </p>
                  </details>
                </>
              )}
              <fieldset disabled={readOnly || busy} className="mm-notes">
                {" "}
                <label className="mm-field">
                  요청별 회의 메모
                  <textarea
                    rows={5}
                    maxLength={10000}
                    aria-label="요청별 회의 메모"
                    value={plan.planning}
                    onChange={(e) =>
                      onPlan(plan.requestId, { planning: e.target.value })
                    }
                    placeholder="논의 내용, 합의한 범위, 추가 확인할 사항을 기록하세요."
                  />
                </label>
              </fieldset>
              {[plan.uiNotes, plan.apiNotes, plan.dbNotes].some((note) =>
                note?.trim(),
              ) && (
                <details className="mm-card">
                  <summary>이전 기획 기록</summary>
                  {[
                    ["화면 UI 구상", plan.uiNotes],
                    ["API · 데이터 처리", plan.apiNotes],
                    ["DB 설계", plan.dbNotes],
                  ].map(([label, note]) =>
                    note?.trim() ? (
                      <div key={label}>
                        <strong>{label}</strong>
                        <p className="mm-description">{note}</p>
                      </div>
                    ) : null,
                  )}
                </details>
              )}
              {plan.taskId && onTask && (
                <button type="button" onClick={() => onTask(plan.taskId!)}>
                  생성된 개발 업무 열기
                </button>
              )}
              {!readOnly && onRemove && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(plan.requestId)}
                >
                  연결 해제
                </button>
              )}
              <div className="mm-pager">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => next(-1)}
                >
                  ← 이전 요청
                </button>
                <span>
                  {index + 1} / {plans.length}
                </span>
                <button
                  type="button"
                  disabled={index === plans.length - 1}
                  onClick={() => next(1)}
                >
                  다음 요청 →
                </button>
              </div>
            </main>
            <aside className="mm-decision" aria-label="회의 결정">
              <h2>업무</h2>
              {readOnly && (
                <p className="mm-muted">
                  승인 대기·확정된 회의 또는 수정 권한이 없는 회의는 조회만
                  가능합니다.
                </p>
              )}
              <fieldset disabled={readOnly || busy}>
                <label className="mm-field">
                  요청 우선순위
                  <select
                    value={plan.priority}
                    onChange={(e) =>
                      onPlan(plan.requestId, { priority: e.target.value })
                    }
                  >
                    {Object.entries(priorities).map(([v, label]) => (
                      <option value={v} key={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              <p className="mm-muted">요청 우선순위가 업무에도 동일하게 적용됩니다.</p>
              <StagePlanEditor
                key={plan.requestId}
                collapsedIds={
                  readOnly
                    ? []
                    : (collapsedByRequest[plan.requestId] ??
                      (plan.stages || []).map((s) => s.id))
                }
                onCollapsedChange={(ids) =>
                  setCollapsedByRequest((current) => ({
                    ...current,
                    [plan.requestId]: ids,
                  }))
                }
                projectId={projectId}
                value={plan.stages || []}
                members={members}
                reviewers={reviewers}
                disabled={readOnly || busy}
                onChange={(stages) =>
                  onPlan(plan.requestId, {
                    stages,
                    assigneeIds: [
                      ...new Set(stages.flatMap((s) => s.assigneeIds)),
                    ],
                  })
                }
              />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
  return <section className={`mm-workspace mm-embedded ${presentation ? "mm-presentation" : ""}`} aria-label={presentation ? "회의 발표" : "회의 작성"}>{shell}{footer}</section>;
}
