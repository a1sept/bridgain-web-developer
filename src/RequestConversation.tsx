import { useEffect, useId, useRef, useState, type FormEvent } from "react";
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
export default function RequestConversation({
  userId,
  events,
  onSend,
  onLoad,
}: {
  embedded?: boolean;
  userId: string;
  title: string;
  status: string;
  assignees: string[];
  events: ConversationEvent[];
  onClose: () => void;
  onSend: (body: string) => Promise<void>;
  onLoad: () => Promise<ConversationEvent[]>;
}) {
  const [messages, setMessages] = useState(events);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  const inputId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => setMessages(events), [events]);
  const comments = messages.filter((event) => event.kind === "comment");
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await onLoad();
      if (mounted.current) {
        setMessages(next);
        setNotice("댓글을 새로 불러왔어요.");
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "댓글을 불러오지 못했어요.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !text.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let saved = false;
    try {
      await onSend(text.trim());
      saved = true;
      if (mounted.current) setText("");
      const next = await onLoad();
      if (mounted.current) {
        setMessages(next);
        setNotice("댓글을 등록했어요.");
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          saved
            ? "댓글은 등록됐어요. 새로고침을 눌러 목록을 확인해주세요."
            : cause instanceof Error
              ? cause.message
              : "댓글을 등록하지 못했어요.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="rb-panel request-comments" aria-label="요청 댓글">
      <header className="request-comments-header">
        <span>댓글 {comments.length}개</span>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          새로고침
        </button>
      </header>
      {comments.length ? (
        <ol className="request-comments-list">
          {comments.map((comment) => (
            <li key={comment.id}>
              <article>
                <header>
                  <strong>
                    {comment.actorName || "참여자"}
                    {comment.actorId === userId && <small>나</small>}
                  </strong>
                  <time dateTime={comment.createdAt}>
                    {new Date(comment.createdAt).toLocaleString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </header>
                <p>{comment.body}</p>
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <p className="request-comments-empty">
          아직 댓글이 없습니다. 질문이나 추가 내용을 남겨주세요.
        </p>
      )}
      <form className="request-comments-form" onSubmit={submit}>
        <label htmlFor={inputId}>댓글 작성</label>
        <textarea
          id={inputId}
          rows={3}
          maxLength={5000}
          disabled={busy}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="질문이나 추가 내용을 작성하세요."
        />
        <div>
          <button type="submit" disabled={busy || !text.trim()}>
            댓글 등록
          </button>
        </div>
      </form>
      {error && (
        <p className="request-comments-error" role="alert">
          {error}
        </p>
      )}
      <p className="request-comments-notice" role="status">
        {notice}
      </p>
    </section>
  );
}
