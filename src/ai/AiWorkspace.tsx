import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { CodexSync, DesktopState, AiProviderName } from "../desktop";
import { aiApi, type AiSession, type SessionDetail, type AiDraft } from "./api";
import AiMessageBody from "./AiMessageBody";
import "./ai.css";
type Project = { id: string; name: string };
type Context = {
  setProject: (project?: Project) => void;
  openSettings: () => void;
  openPanel: () => void;
  investigate: (project: Project, requestId: string, title: string) => void;
  folder?: string;
  folders: Record<string, string>;
  refreshFolders: () => Promise<void>;
  openFolderSettings: (project: Project) => void;
};
const AiContext = createContext<Context>({
  setProject: () => {},
  openSettings: () => {},
  openPanel: () => {},
  investigate: () => {},
  folders: {},
  refreshFolders: async () => {},
  openFolderSettings: () => {},
});
export const useAi = () => useContext(AiContext);
const names = { codex: "Codex", claude: "Claude Code" };
const draftNames = {
  note: "조사 메모",
  task: "업무 초안",
  meeting: "회의 초안",
  result: "개발 결과",
  document: "문서 변경",
};
const fieldNames: Record<string, string> = {
  content: "내용",
  title: "제목",
  description: "업무 내용",
  priority: "우선순위",
  notes: "회의 메모",
  scheduledAt: "회의 일시",
  durationMinutes: "회의 시간",
  resultSummary: "변경 요약",
  dbChanges: "DB 변경",
  apiChanges: "API 변경",
  frontendChanges: "프론트 변경",
  verification: "검증 결과",
  category: "문서 분류",
  url: "참고 링크",
  changeSummary: "변경 기록 요약",
  requestIds: "연결 요청",
  requests: "요청별 메모",
  taskId: "관련 업무",
  documentId: "대상 문서",
};
export default function AiWorkspace({
  children,
  userId,
  onApplied,
}: {
  children: ReactNode;
  userId: string;
  onApplied?: () => void;
}) {
  const [project, setProject] = useState<Project>(),
    [panel, setPanel] = useState<"closed" | "collapsed" | "open">("closed"),
    [settings, setSettings] = useState(false),
    [desktop, setDesktop] = useState<DesktopState>(),
    [provider, setProvider] = useState<AiProviderName>("codex");
  const [sessions, setSessions] = useState<AiSession[]>([]),
    [selected, setSelected] = useState<AiSession>(),
    [detail, setDetail] = useState<SessionDetail>(),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [running, setRunning] = useState<string[]>([]),
    [stopping, setStopping] = useState<string[]>([]),
    [streams, setStreams] = useState<Record<string, string>>({}),
    [pending, setPending] = useState<{
      project: Project;
      requestId: string;
      title: string;
    }>(),
    [resumeId, setResumeId] = useState(""),
    [code, setCode] = useState("");
  const settingsDialog = useRef<HTMLDialogElement>(null),
    messageEnd = useRef<HTMLDivElement>(null),
    actionLock = useRef(false),
    stopLocks = useRef(new Set<string>()),
    pendingDetail = useRef(0);
  const [codexSync, setCodexSync] = useState<CodexSync>();
  const bridge = window.bridgainDesktop;
  const syncStatus = codexSync ?? desktop?.codexSync;
  useEffect(() => {
    const update = (event: Event) => setCodexSync((event as CustomEvent<CodexSync>).detail);
    window.addEventListener("bridgain:codex-sync", update);
    return () => window.removeEventListener("bridgain:codex-sync", update);
  }, []);
  const base = project ? `/projects/${project.id}/ai/sessions` : "";
  const folder = project ? desktop?.folders[project.id] : undefined;
  async function refreshDesktop() {
    if (bridge) {
      const value = await bridge.state();
      setDesktop(value);
      if (value.codexSync) setCodexSync(value.codexSync);
      setRunning(value.running);
    }
  }
  function openFolderSettings(target: Project) {
    setError("");
    setSettings(false);
    window.dispatchEvent(new CustomEvent("bridgain:project-settings", { detail: { projectId: target.id } }));
  }
  useEffect(() => {
    let active = true;
    if (bridge) void bridge.state().then(value => {
      if (active) { setDesktop(value); setRunning(value.running); }
    }).catch(() => {});
    return () => { active = false; };
  }, [bridge, userId]);
  useEffect(() => {
    if (settings) {
      settingsDialog.current?.showModal();
      void refreshDesktop().catch((e) => setError(e.message));
    } else settingsDialog.current?.close();
  }, [settings]);
  useEffect(() => {
    if (!bridge) return;
    return bridge.onEvent((event) => {
      if (event.type === "connections") {
        void refreshDesktop().catch((e) => setError(e.message));
        return;
      }
      const id = event.sessionId;
      if (!id) return;
      if (event.type === "started") {
        setRunning((r) => (r.includes(id) ? r : [...r, id]));
      }
      if (event.type === "messages") setRefresh((x) => x + 1);
      if (event.type === "delta") {
        setStreams((s) => ({ ...s, [id]: (s[id] || "") + (event.text || "") }));
        setRunning((r) => (r.includes(id) ? r : [...r, id]));
      }
      if (["completed", "interrupted", "error"].includes(event.type)) {
        stopLocks.current.delete(id);
        setStopping((s) => s.filter((x) => x !== id));
        setRunning((r) => r.filter((x) => x !== id));
        setRefresh((x) => x + 1);
        if (event.message) setError(event.message);
      }
      if (event.type === "tool") setRefresh((x) => x + 1);
    });
  }, [bridge, userId]);
  async function stopSelected() {
    const id = selected?.id;
    if (!bridge || !id || !running.includes(id) || stopLocks.current.has(id)) return;
    stopLocks.current.add(id);
    setStopping((s) => [...s, id]);
    setError("");
    try {
      await bridge.stop(id);
      const state = await bridge.state();
      setRunning(state.running);
      if (!state.running.includes(id)) {
        stopLocks.current.delete(id);
        setStopping((s) => s.filter((x) => x !== id));
        setRefresh((value) => value + 1);
      }
    } catch (e) {
      stopLocks.current.delete(id);
      setStopping((s) => s.filter((x) => x !== id));
      setError(e instanceof Error ? e.message : "응답을 중지하지 못했어요.");
    }
  }
  useEffect(() => {
    if (panel !== "open" || !selected || !running.includes(selected.id)) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
      if (settings || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      void stopSelected();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panel, selected?.id, running, bridge, settings]);
  useEffect(() => {
    let active = true;
    setSessions([]);
    if (!base) return;
    setLoading(true);
    aiApi<{ sessions: AiSession[] }>(base)
      .then((d) => {
        if (active) setSessions(d.sessions);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, refresh]);
  useEffect(() => {
    if (selected?.projectId !== project?.id) {
      setSelected(undefined);
      setDetail(undefined);
    }
    setResumeId("");
  }, [project?.id]);
  useEffect(() => {
    let active = true;
    const serial = ++pendingDetail.current;
    setDetail(undefined);
    if (!selected) return;
    aiApi<SessionDetail>(
      `/projects/${selected.projectId}/ai/sessions/${selected.id}`,
    )
      .then((d) => {
        if (active && pendingDetail.current === serial) {
          setDetail(d);
          if (!running.includes(selected.id))
            setStreams((s) => ({ ...s, [selected.id]: "" }));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected?.id, refresh]);
  useEffect(() => {
    messageEnd.current?.scrollIntoView({ block: "nearest" });
  }, [detail?.messages.length, selected && streams[selected.id]]);
  async function action(fn: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  function openPanel() {
    setPanel("open");
    if (bridge) void refreshDesktop().catch((e) => setError(e.message));
  }
  function investigate(p: Project, requestId: string, title: string) {
    setProject(p);
    setPending({ project: p, requestId, title });
    setResumeId("");
    openPanel();
  }
  async function startSession(continueExisting = false) {
    if (!project) return;
    if (!bridge) {
      setSettings(true);
      return;
    }
    await refreshDesktop();
    const state = await bridge.state();
    const existing = continueExisting
      ? sessions.find((s) => s.id === resumeId)
      : undefined;
    const chosen = existing?.provider || provider;
    if (!state.providers[chosen].connected) {
      setProvider(chosen);
      setSettings(true);
      return;
    }
    if (!state.folders[project.id]) {
      openFolderSettings(project);
      return;
    }
    let session = existing;
    if (continueExisting && !session)
      throw Error("연결할 세션을 선택해주세요.");
    if (!session)
      session = (
        await aiApi<{ session: AiSession }>(base, {
          provider: chosen,
          title: pending?.title || `${project.name} 조사`,
          requestIds: pending ? [pending.requestId] : [],
        })
      ).session;
    else if (pending)
      await aiApi(
        `${base}/${session.id}`,
        { requestIds: [pending.requestId] },
        "PATCH",
      );
    setSelected(session);
    setProvider(session.provider);
    setRefresh((x) => x + 1);
    setStreams((s) => ({ ...s, [session!.id]: "" }));
    const prompt = pending
      ? `연결된 고객 요청 ‘${pending.title}’을 프로젝트 코드와 문서를 기준으로 조사해주세요. 현재 구현, DB/API/프론트 영향, 구현 방향, 추가 질문과 업무 분리안을 정리해주세요.`
      : "이 프로젝트의 현재 구조와 개발 방향을 조사해주세요.";
    await bridge.run(project.id, session.id, prompt);
    setPending(undefined);
  }
  async function send() {
    if (!selected || !text.trim() || !bridge) return;
    if (running.includes(selected.id))
      throw Error("현재 응답을 기다리거나 중지한 뒤 전송해주세요.");
    const state = await bridge.state();
    if (!state.folders[selected.projectId]) {
      openFolderSettings({ id: selected.projectId, name: project?.name || "현재 프로젝트" });
      return;
    }
    const message = text.trim();
    setStreams((s) => ({ ...s, [selected.id]: "" }));
    await bridge.run(selected.projectId, selected.id, message);
    setText("");
    setRefresh((x) => x + 1);
  }
  async function applyDraft(draft: AiDraft) {
    if (!selected) return;
    await aiApi(
      `/projects/${selected.projectId}/ai/sessions/${selected.id}/drafts/${draft.id}/apply`,
      {},
    );
    setRefresh((x) => x + 1);
    onApplied?.();
    window.dispatchEvent(new Event("bridgain:ai-applied"));
  }
  return (
    <AiContext.Provider
      value={{
        setProject,
        openSettings: () => setSettings(true),
        openPanel,
        investigate,
        folder,
        folders: desktop?.folders || {},
        refreshFolders: refreshDesktop,
        openFolderSettings,
      }}
    >
      <div
        className={panel === "open" ? "ai-layout ai-layout-open" : "ai-layout"}
      >
        {children}
      </div>
      {panel === "closed" ? (
        <button className="ai-launch" onClick={openPanel}>
          AI 채팅
        </button>
      ) : panel === "collapsed" ? (
        <button className="ai-launch" onClick={() => setPanel("open")}>
          AI 채팅 펼치기 {running.length > 0 && `· ${running.length}개 실행 중`}
        </button>
      ) : (
        <aside className="ai-panel" aria-label="AI 채팅 패널">
          <header>
            <div>
              <strong>AI 채팅</strong>
              <small>{project?.name || "프로젝트를 선택해주세요"}</small>
            </div>
            <button onClick={() => setSettings(true)} aria-label="AI 연결 설정">
              설정
            </button>
            <button
              onClick={() => setPanel("collapsed")}
              aria-label="AI 패널 접기"
            >
              접기
            </button>
            <button
              onClick={() => setPanel("closed")}
              aria-label="AI 패널 닫기"
            >
              ×
            </button>
          </header>
          {error && (
            <p className="ai-error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="오류 안내 닫기">
                ×
              </button>
            </p>
          )}
          {!bridge && (
            <p className="ai-notice">
              AI 실행은 Bridgain 데스크톱 앱에서 사용할 수 있어요. 웹에서는
              저장된 대화와 초안을 확인할 수 있습니다.
            </p>
          )}
          <div className="ai-session-controls">
            <label>
              AI
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as AiProviderName)}
                disabled={busy}
              >
                {Object.entries(names).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                    {desktop?.providers[id as AiProviderName].connected
                      ? " · 연결됨"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              프로젝트 세션
              <select
                value={selected?.id || ""}
                onChange={(e) => {
                  setSelected(sessions.find((s) => s.id === e.target.value));
                  setPending(undefined);
                }}
                disabled={busy}
              >
                <option value="">세션 선택</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {names[s.provider]} · {s.title}
                  </option>
                ))}
              </select>
            </label>
            {bridge?.openCodex && selected?.provider === "codex" && (detail?.session.localSessionId || selected.localSessionId) && (
              <button disabled={busy} onClick={() => void action(() => bridge.openCodex!(selected.id))}>
                Codex에서 열기
              </button>
            )}
            {!pending && (
              <button
                disabled={!project || busy || loading}
                onClick={() => void action(() => startSession())}
              >
                ＋ 새 조사 세션
              </button>
            )}
          </div>
          {pending && (
            <section className="ai-link-request">
              <strong>{pending.title}</strong>
              <p>이 요청을 새 세션에서 조사하거나 기존 대화에 연결하세요.</p>
              <button
                disabled={busy || loading}
                onClick={() => void action(() => startSession())}
              >
                새 세션으로 조사
              </button>
              <select
                aria-label="요청을 연결할 기존 세션"
                value={resumeId}
                onChange={(e) => setResumeId(e.target.value)}
              >
                <option value="">기존 세션 선택</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {names[s.provider]} · {s.title}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !resumeId}
                onClick={() => void action(() => startSession(true))}
              >
                기존 세션에 연결 · 조사
              </button>
              <button onClick={() => setPending(undefined)}>취소</button>
            </section>
          )}
          <div className="ai-messages" aria-live="polite">
            {loading && <p>세션을 불러오는 중이에요.</p>}
            {!selected && !pending && (
              <p className="ai-empty">
                요청 상세의 ‘AI 조사’를 누르거나 프로젝트에서 새 세션을
                시작하세요. AI 연결 없이 기존 업무를 사용할 수 있습니다.
              </p>
            )}
            {detail && (
              <div className="ai-context">
                <p>
                  연결 요청:{" "}
                  {detail.requests.map((r) => r.title).join(", ") || "없음"}
                </p>
                {detail.session.commit && (
                  <small>
                    조사 기준 커밋 {detail.session.commit.slice(0, 10)}
                  </small>
                )}
              </div>
            )}
            {detail?.messages.map((m) => (
              <article className={`ai-message ai-${m.role}`} key={m.id}>
                <strong>
                  {m.role === "user"
                    ? "나"
                    : m.role === "assistant"
                      ? names[detail.session.provider]
                      : "안내"}
                </strong>
                <AiMessageBody body={m.body} />
                {m.context?.commit && (
                  <small>조사 기준 {m.context.commit.slice(0, 10)}</small>
                )}
                <small>{new Date(m.createdAt).toLocaleString("ko-KR")}</small>
              </article>
            ))}
            {selected && streams[selected.id] && (
              <article className="ai-message ai-assistant">
                <strong>{names[selected.provider]}</strong>
                <AiMessageBody body={streams[selected.id]} streaming={running.includes(selected.id)} />
              </article>
            )}
            {detail?.drafts.map((d) => (
              <details className="ai-draft" key={d.id}>
                <summary>
                  {draftNames[d.kind]} · {d.title}
                  {d.appliedAt ? " · 반영됨" : ""}
                </summary>
                {Object.entries(d.payload)
                  .filter(([key]) => key !== "expectedVersion")
                  .map(([key, value]) => (
                    <div key={key}>
                      <strong>{fieldNames[key] || key}</strong>
                      <p>
                        {typeof value === "string"
                          ? value
                          : JSON.stringify(value, null, 2)}
                      </p>
                    </div>
                  ))}
                {!d.appliedAt && (
                  <button
                    disabled={busy}
                    onClick={() => void action(() => applyDraft(d))}
                  >
                    {d.kind === "note"
                      ? "메모 확인"
                      : "내용 확인 · 프로젝트에 반영"}
                  </button>
                )}
              </details>
            ))}
            <div ref={messageEnd} />
          </div>
          <form
            className="ai-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void action(send);
            }}
          >
            <label className="ai-visually-hidden" htmlFor="ai-message">
              AI에게 보낼 메시지
            </label>
            <textarea
              id="ai-message"
              rows={3}
              maxLength={20000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="프로젝트에 대해 질문하세요"
              disabled={!selected || !bridge || busy}
            />
            <div>
              {selected && running.includes(selected.id) ? (
                <button
                  type="button"
                  disabled={stopping.includes(selected.id)}
                  onClick={() => void stopSelected()}
                >
                  {stopping.includes(selected.id) ? "중지 중…" : "실행 중지 · Esc"}
                </button>
              ) : (
                <button disabled={!selected || !bridge || busy || !text.trim()}>
                  전송
                </button>
              )}
              <small>{selected && stopping.includes(selected.id)
                ? "중지 요청을 보냈어요. 응답이 끝날 때까지 기다려주세요."
                : selected && running.includes(selected.id)
                  ? "Esc로 현재 응답을 중지할 수 있어요."
                  : "패널을 닫아도 대화는 유지됩니다."}</small>
            </div>
          </form>
        </aside>
      )}
      <dialog
        className="ai-settings"
        ref={settingsDialog}
        onCancel={() => setSettings(false)}
        onClose={() => setSettings(false)}
      >
        <header>
          <h2>AI 연결 설정</h2>
          <button onClick={() => setSettings(false)} aria-label="AI 설정 닫기">
            ×
          </button>
        </header>
        <p>AI는 선택 기능입니다. 개발자 개인의 구독 계정으로 연결하세요.</p>
        {error && (
          <p className="ai-error" role="alert">
            {error}
          </p>
        )}
        {!bridge ? (
          <p>
            데스크톱 앱에서 로컬 AI를 연결할 수 있어요. 웹의 프로젝트 관리
            기능은 그대로 사용할 수 있습니다.
          </p>
        ) : (
          <>
            {bridge.syncProjects && (
              <section>
                <h3>Codex 프로젝트 연결</h3>
                <p>프로젝트 이름을 Codex 엔진에 저장하고, 이 컴퓨터에서 만든 Codex 대화를 연결합니다.</p>
                {syncStatus?.error ? <p className="ai-error" role="status">{syncStatus.error}</p> : syncStatus && <p role="status">Codex 엔진에 프로젝트 {syncStatus.synced}개 저장됨</p>}
                <p className="ai-notice">실험적 연결입니다. Codex 앱 버전에 따라 사이드바에 자동 표시되지 않을 수 있습니다. 대화는 ‘Codex에서 열기’로 확인하세요.</p>
                <button disabled={busy} onClick={() => void action(async () => {
                  const result = await bridge.syncProjects!();
                  setCodexSync(result);
                  await refreshDesktop();
                })}>프로젝트 연결 다시 확인</button>
              </section>
            )}
            {Object.entries(names).map(([id, name]) => {
              const key = id as AiProviderName,
                connection = desktop?.providers[key];
              return (
                <section key={id}>
                  <h3>{name}</h3>
                  <p>
                    {connection?.connected
                      ? `${connection.account || name} · ${connection.plan || "구독 연결됨"}`
                      : "연결하지 않음"}
                  </p>
                  {connection?.error && (
                    <p className="ai-error">{connection.error}</p>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const login = await bridge.connect(key);
                        if (login.userCode)
                          setCode(`${name} 인증 코드: ${login.userCode}`);
                        await refreshDesktop();
                      })
                    }
                  >
                    {connection?.connected ? "다시 인증" : "구독 계정 연결"}
                  </button>
                  {connection?.connected && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await bridge.disconnect(key);
                          await refreshDesktop();
                        })
                      }
                    >
                      연결 해제
                    </button>
                  )}
                </section>
              );
            })}
            {code && (
              <p className="ai-notice">
                {code}
                <br />
                열린 공식 로그인 화면에서 인증한 뒤 연결 상태를 확인해주세요.
              </p>
            )}
            <button disabled={busy} onClick={() => void action(refreshDesktop)}>
              연결 상태 확인
            </button>
            {pending && desktop?.providers[provider].connected && (
              <button
                disabled={busy}
                onClick={() => {
                  setSettings(false);
                }}
              >
                설정 완료 · 요청 조사로 돌아가기
              </button>
            )}
          </>
        )}
      </dialog>
    </AiContext.Provider>
  );
}
