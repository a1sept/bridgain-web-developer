export async function aiApi<T>(
  path: string,
  body?: object,
  method = "POST",
): Promise<T> {
  const headers: Record<string, string> = {};
  const signal = AbortSignal.timeout(20000);
  if (body !== undefined) {
    const r = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      signal,
    });
    if (!r.ok) throw Error("로그인 상태를 확인해주세요.");
    headers["X-CSRF-Token"] = (await r.json()).csrfToken;
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(`/api/workspace${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    method: body === undefined ? "GET" : method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.message || "AI 세션을 처리하지 못했어요.");
  return data;
}
export type AiSession = {
  id: string;
  projectId: string;
  provider: "codex" | "claude";
  title: string;
  localSessionId: string | null;
  commit: string;
  updatedAt: string;
};
export type AiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  context?: { commit: string; requestIds: string[] };
  body: string;
  createdAt: string;
};
export type AiDraft = {
  id: string;
  kind: "note" | "task" | "meeting" | "result" | "document";
  title: string;
  payload: Record<string, unknown>;
  targetId: string | null;
  appliedAt: string | null;
};
export type SessionDetail = {
  session: AiSession;
  messages: AiMessage[];
  requests: { id: string; title: string }[];
  drafts: AiDraft[];
};
