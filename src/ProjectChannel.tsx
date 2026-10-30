import { useCallback, useEffect, useRef, useState } from "react";
import { aiApi as api } from "./ai/api";
import "./project-channel.css";
type Item = {
  key: string;
  kind: string;
  body: string;
  actorName: string;
  createdAt: string;
  cursorAt: string;
  parentKey: string | null;
  targetKind: string | null;
  targetId: string | null;
  title: string;
  replyCount: number;
};
type Page = { items: Item[]; hasMore: boolean };
const labels: Record<string, string> = {
  completed: "작업 완료 · 승인 대기",
  approved: "작업 승인",
  changes_requested: "재작업 요청",
  released: "배포 완료",
  merged: "main 병합 완료 · 배포 대기",
  deploy_started: "배포 시작",
  unlocked: "후행 업무 열림",
  predecessor_changed: "선행 작업 변경 · 재승인 필요",
  approval_pending: "업무 생성 승인 요청",
  approval_approved: "업무 생성 승인 완료",
  approval_rejected: "업무 생성 승인 반려",
  approval_cancelled: "업무 생성 승인 취소",
  meeting_completed: "회의 완료",
};
function Composer({
  onSend,
  placeholder,
}: {
  onSend: (body: string) => Promise<void>;
  placeholder: string;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function send() {
    if (lock.current || !body.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await onSend(body.trim());
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "등록하지 못했습니다.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="pc-composer">
      <textarea
        aria-label={placeholder}
        placeholder={placeholder}
        value={body}
        maxLength={5000}
        rows={3}
        disabled={busy}
        onChange={(e) => setBody(e.target.value)}
      />
      <div>
        <small>{body.length}/5,000</small>
        <button
          type="button"
          className="pc-primary"
          disabled={busy || !body.trim()}
          onClick={() => void send()}
        >
          {busy ? "등록 중…" : "등록"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export default function ProjectChannel({
  projectId,
  taskId,
  onOpen,
}: {
  projectId: string;
  taskId?: string;
  onOpen?: (kind: string, id: string) => void;
}) {
  const [items, setItems] = useState<Item[]>([]),
    [hasMore, setHasMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [target, setTarget] = useState("");
  const [selected, setSelected] = useState<Item | null>(null),
    [replies, setReplies] = useState<Item[]>([]),
    [replyMore, setReplyMore] = useState(false),
    [replyLoading, setReplyLoading] = useState(false),
    [replyError, setReplyError] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);
  const epoch = useRef(0),
    replyEpoch = useRef(0);
  const threadTrigger = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const path = `/projects/${projectId}/channel`;
  const load = useCallback(
    async (before?: string) => {
      const version = ++epoch.current;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (taskId) params.set("task", taskId);
        if (before) params.set("before", before);
        const page = await api<Page>(`${path}?${params}`);
        if (version !== epoch.current) return;
        setItems((old) => (before ? [...page.items, ...old] : page.items));
        setHasMore(page.hasMore);
        if (!before)
          requestAnimationFrame(() => {
            if (feedRef.current)
              feedRef.current.scrollTop = feedRef.current.scrollHeight;
          });
      } catch (e) {
        if (version === epoch.current)
          setError(
            e instanceof Error ? e.message : "대화를 불러오지 못했습니다.",
          );
      } finally {
        if (version === epoch.current) setLoading(false);
      }
    },
    [path, taskId],
  );
  useEffect(() => {
    setItems([]);
    setSelected(null);
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => {
      epoch.current++;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  const loadReplies = useCallback(
    async (root: Item, before?: string) => {
      const version = ++replyEpoch.current;
      setReplyLoading(true);
      setReplyError("");
      try {
        const params = new URLSearchParams({ parent: root.key });
        if (before) params.set("before", before);
        const page = await api<Page>(`${path}?${params}`);
        if (version !== replyEpoch.current) return;
        setReplies((old) => (before ? [...page.items, ...old] : page.items));
        setReplyMore(page.hasMore);
      } catch (e) {
        if (version === replyEpoch.current)
          setReplyError(
            e instanceof Error ? e.message : "답글을 불러오지 못했습니다.",
          );
      } finally {
        if (version === replyEpoch.current) setReplyLoading(false);
      }
    },
    [path],
  );
  useEffect(() => {
    setReplies([]);
    setReplyMore(false);
    if (selected) {
      void loadReplies(selected);
      closeButton.current?.focus();
    }
    return () => {
      replyEpoch.current++;
    };
  }, [selected, loadReplies]);
  function close() {
    setSelected(null);
    threadTrigger.current?.focus();
  }
  const targets = Array.from(
    new Map(
      items.filter((i) => i.targetId).map((i) => [i.targetId!, i.title]),
    ).entries(),
  );
  const visible = items.filter(
    (i) =>
      (filter === "all" ||
        (filter === "messages"
          ? i.kind === "message"
          : i.kind !== "message")) &&
      (!target || i.targetId === target) &&
      `${i.body} ${i.title} ${i.actorName}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function date(value: string) {
    return new Date(value).toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const cursor = (i: Item) => JSON.stringify({ at: i.cursorAt, key: i.key });
  return (
    <section
      className={`pc-channel ${taskId ? "pc-compact" : ""}`}
      aria-label={taskId ? "업무 내부 대화" : "프로젝트 채널"}
    >
      <header className="pc-heading">
        <div>
          <h2>{taskId ? "내부 대화" : "프로젝트 채널"}</h2>
          <p>프로젝트 개발팀과 진행 상황을 공유하세요.</p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            void load();
            if (selected) void loadReplies(selected);
          }}
        >
          새로고침
        </button>
      </header>
      {!taskId && (
        <div className="pc-toolbar">
          <div className="pc-tabs">
            {[
              ["all", "전체"],
              ["messages", "대화"],
              ["events", "업무 알림"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            aria-label="대상 필터"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">모든 대상</option>
            {targets.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
          <input
            aria-label="불러온 대화 검색"
            placeholder="불러온 대화 검색…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <div className={`pc-layout ${selected ? "pc-thread-open" : ""}`}>
        <div className="pc-main">
          <div className="pc-feed" ref={feedRef} aria-busy={loading}>
            {error && <p role="alert">{error}</p>}
            {hasMore && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void load(cursor(items[0]))}
              >
                이전 기록 더 보기
              </button>
            )}
            {loading && <p role="status">불러오는 중…</p>}
            {!loading && !error && !visible.length && (
              <div className="pc-empty">
                {query || filter !== "all" || target
                  ? "조건에 맞는 대화가 없습니다."
                  : "아직 대화가 없습니다. 첫 메시지를 남겨보세요."}
              </div>
            )}
            {visible.map((item) => (
              <article
                key={item.key}
                className={item.kind === "message" ? "pc-message" : "pc-event"}
              >
                <div className="pc-meta">
                  <strong>
                    {item.kind === "message"
                      ? item.actorName
                      : labels[item.kind] || "업무 진행 변경"}
                  </strong>
                  <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
                </div>
                {item.kind !== "message" && <h3>{item.title}</h3>}
                {item.kind === "message" && item.targetId && !taskId && (
                  <small>{item.title}</small>
                )}
                {item.body && <p>{item.body}</p>}
                <div className="pc-actions">
                  <button
                    type="button"
                    onClick={(e) => {
                      threadTrigger.current = e.currentTarget;
                      setSelected(item);
                    }}
                  >
                    답글 {item.replyCount ? `${item.replyCount}개` : "달기"}
                  </button>
                  {onOpen && item.targetId && item.targetKind && (
                    <button
                      type="button"
                      onClick={() => onOpen(item.targetKind!, item.targetId!)}
                    >
                      {item.targetKind === "task" ? "업무" : "회의"} 보기 ↗
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <Composer
            onSend={async (body) => {
              await api(path, { body, ...(taskId ? { taskId } : {}) });
              await load();
            }}
            placeholder={
              taskId
                ? "업무에 대한 의견을 남기세요…"
                : "프로젝트 참여자에게 메시지를 남기세요…"
            }
          />
        </div>
        {selected && (
          <aside
            className="pc-thread"
            aria-label="답글 패널"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close();
              }
            }}
          >
            <header>
              <div>
                <strong>{selected.title}</strong>
                <p>답글</p>
              </div>
              <button
                type="button"
                ref={closeButton}
                aria-label="답글 닫기"
                onClick={close}
              >
                ×
              </button>
            </header>
            <div className="pc-replies">
              <article className="pc-original">
                <strong>
                  {selected.kind === "message"
                    ? selected.actorName
                    : labels[selected.kind] || "업무 알림"}
                </strong>
                <p>{selected.body || selected.title}</p>
              </article>
              {replyError && <p role="alert">{replyError}</p>}
              {replyMore && (
                <button
                  type="button"
                  disabled={replyLoading}
                  onClick={() => void loadReplies(selected, cursor(replies[0]))}
                >
                  이전 답글 더 보기
                </button>
              )}
              {replyLoading && <p role="status">불러오는 중…</p>}
              {replies.map((r) => (
                <article key={r.key}>
                  <div className="pc-meta">
                    <strong>{r.actorName}</strong>
                    <time>{date(r.createdAt)}</time>
                  </div>
                  <p>{r.body}</p>
                </article>
              ))}
            </div>
            <Composer
              key={selected.key}
              placeholder="답글을 남기세요…"
              onSend={async (body) => {
                await api(path, { body, parentKey: selected.key });
                await Promise.all([loadReplies(selected), load()]);
              }}
            />
          </aside>
        )}
      </div>
    </section>
  );
}
