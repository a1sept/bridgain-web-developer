import { useEffect, useRef, useState, type FormEvent } from "react";
import "./request-conversation.css";
export type ConversationEvent = {
  id: string;
  kind: string;
  body?: string | null;
  status?: string | null;
  actorId: string;
  actorName: string;
  createdAt: string;
};
const statusNames: Record<string, string> = {
  received: "요청 접수",
  in_progress: "개발 진행",
  review: "검토 요청",
  revision: "반환 · 수정",
  completed: "완료",
  released: "배포",
};
const time = (v: string) =>
  new Date(v).toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  });
export default function RequestConversation({
  userId,
  title,
  status,
  assignees,
  events,
  onClose,
  onSend,
  onLoad,
}: {
  userId: string;
  title: string;
  status: string;
  assignees: string[];
  events: ConversationEvent[];
  onClose: () => void;
  onSend: (body: string) => Promise<void>;
  onLoad: () => Promise<ConversationEvent[]>;
}) {
  const [messages, setMessages] = useState(events),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  const feed = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    sendLock = useRef(false),
    loadRef = useRef(onLoad),
    sendRef = useRef(onSend);
  loadRef.current = onLoad;
  sendRef.current = onSend;
  useEffect(() => setMessages(current => events.length >= current.length ? events : current), [events]);
  useEffect(() => {
    if (nearBottom.current && feed.current)
      feed.current.scrollTop = feed.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    let active = true,
      inFlight = false;
    const sync = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const next = await loadRef.current();
        if (active) {
          setMessages(current => next.length >= current.length ? next : current);
          setError("");
        }
      } catch {
        if (active)
          setError("새 대화를 불러오지 못했어요. 연결되면 다시 확인합니다.");
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => void sync(), 10000);
    const visible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sendLock.current || !text.trim()) return;
    sendLock.current = true;
    setSending(true);
    setError("");
    let saved = false;
    try {
      await sendRef.current(text.trim());
      saved = true;
      setText("");
      nearBottom.current = true;
      const next = await loadRef.current();
      setMessages(current => next.length >= current.length ? next : current);
    } catch (e) {
      setError(saved ? "메시지는 저장됐어요. 대화 목록을 다시 불러오는 중입니다." : e instanceof Error ? e.message : "메시지를 보내지 못했어요.");
    } finally {
      setSending(false);
      sendLock.current = false;
    }
  }
  return (
    <section className="rc-panel" aria-label="요청 대화">
      <header className="rc-header">
        <button onClick={onClose} aria-label="대화 닫고 요청 상세로">
          ←
        </button>
        <strong>요청 대화</strong>
        <span>프로젝트 참여자</span>
      </header>
      <div className="rc-summary">
        <h2>{title}</h2>
        <div>
          <span className="rc-status">{statusNames[status]}</span>
          <p>담당: {assignees.join(", ") || "배정 대기"}</p>
        </div>
      </div>
      <div
        ref={feed}
        className="rc-feed"
        role="log"
        aria-label="대화 기록"
        aria-live="polite"
        onScroll={() => {
          const el = feed.current;
          if (el)
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 90;
        }}
      >
        {!messages.some((e) => e.kind === "comment") && (
          <p className="rc-empty">
            질문이나 추가 내용을 남겨보세요.
            <br />이 프로젝트의 참여자가 함께 확인할 수 있어요.
          </p>
        )}
        {messages.map((event, index) => {
          const date = new Date(event.createdAt).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          const previous = messages[index - 1];
          const showDate =
            !previous ||
            new Date(previous.createdAt).toDateString() !==
              new Date(event.createdAt).toDateString();
          const own = event.actorId === userId;
          return (
            <div key={event.id}>
              {showDate && <p className="rc-day">{date}</p>}
              {event.kind === "comment" ? (
                <article className={`rc-message ${own ? "own" : "other"}`}>
                  {!own && (
                    <span className="rc-avatar" aria-hidden="true">
                      {event.actorName?.slice(0, 1) || "팀"}
                    </span>
                  )}
                  <div className="rc-message-body">
                    <strong>{own ? "나" : event.actorName}</strong>
                    <p>{event.body}</p>
                    <time dateTime={event.createdAt}>
                      {time(event.createdAt)}
                    </time>
                  </div>
                </article>
              ) : (
                <p className="rc-system">
                  {event.kind === "status"
                    ? `상태가 [${statusNames[event.status || ""] || event.status}]로 변경되었습니다.`
                    : event.body || "요청 정보가 변경되었습니다."}
                  <time dateTime={event.createdAt}>
                    {time(event.createdAt)}
                  </time>
                </p>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p className="rc-error" role="alert">
          {error}
        </p>
      )}
      <form className="rc-compose" onSubmit={submit}>
        <label className="rb-sr" htmlFor="conversation-message">
          메시지
        </label>
        <textarea
          id="conversation-message"
          rows={2}
          maxLength={5000}
          disabled={sending}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지를 입력하세요…"
        />
        <button disabled={sending || !text.trim()} aria-label="메시지 보내기">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="m21 3-6 18-4-8-8-4 18-6Z" />
            <path d="m11 13 10-10" />
          </svg>
        </button>
      </form>
    </section>
  );
}
