import AiWorkspace from "./ai/AiWorkspace";
import ProjectWorkspace from "./ProjectWorkspace";
import LiveWorkspace from "./LiveWorkspace";
import { useEffect, useRef, useState, type FormEvent } from "react";

const APP: string = "developer";
const isClient = APP === "client";
const accountLabel = isClient ? "의뢰자" : "개발팀";
type View = "login" | "signup";
type User = {
  id: string;
  email: string;
  displayName: string;
  accountType: "client" | "team";
};
class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api<T>(path: string, body?: object): Promise<T> {
  const signal = AbortSignal.timeout(15000);
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    const csrf = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      signal,
      cache: "no-store",
    });
    if (!csrf.ok)
      throw new ApiError(
        "UNAVAILABLE",
        "서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.",
        csrf.status,
      );
    const data = await csrf.json();
    headers["X-CSRF-Token"] = data.csrfToken;
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  const data = response.status === 204 ? undefined : await response.json();
  if (!response.ok)
    throw new ApiError(
      data?.code || "UNKNOWN",
      data?.message || "요청을 처리하지 못했어요.",
      response.status,
    );
  return data as T;
}
function errorText(error: unknown) {
  if (!(error instanceof ApiError))
    return "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요.";
  const messages: Record<string, string> = {
    INVALID_CREDENTIALS: "이메일 또는 비밀번호를 확인해주세요.",
    EMAIL_IN_USE: "이미 가입된 이메일이에요. 해당 계정으로 로그인해주세요.",
    APP_MISMATCH: `이 계정은 ${accountLabel} 공간을 이용할 수 없어요. 가입한 공간에서 로그인해주세요.`,
    ACCOUNT_UNAVAILABLE: "현재 이용할 수 없는 계정이에요.",
    CSRF_INVALID: "보안 확인이 만료되었어요. 다시 시도해주세요.",
  };
  return error.status === 429
    ? "요청이 많아요. 잠시 기다린 뒤 다시 시도해주세요."
    : messages[error.code] || error.message;
}
const initialUrl = new URL(window.location.href);
const retiredEmailLink = ["/verify-email", "/reset-password"].includes(
  initialUrl.pathname,
);
// Discard old email-link tokens without submitting them to the server.
if (retiredEmailLink || initialUrl.searchParams.has("token"))
  window.history.replaceState({}, "", "/");
const initialNotice = retiredEmailLink
  ? "이메일 인증과 비밀번호 재설정 링크는 현재 사용하지 않아요. 가입한 계정으로 로그인해주세요."
  : "";

function PasswordInput({
  id,
  value,
  onChange,
  label = "비밀번호",
  isNew = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  isNew?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={isNew ? "new-password" : "current-password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={isNew ? 12 : undefined}
          maxLength={128}
          required
          placeholder={
            isNew ? "12자 이상 입력해주세요" : "비밀번호를 입력해주세요"
          }
        />
        <button
          type="button"
          className="reveal"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
          aria-pressed={visible}
        >
          {visible ? "숨김" : "보기"}
        </button>
      </div>
      {isNew && (
        <small>
          12~128자로 설정해주세요. 다른 서비스와 다른 비밀번호가 좋아요.
        </small>
      )}
    </div>
  );
}
function Brand() {
  return (
    <a href="/" className="brand" aria-label="브릿게인 홈">
      <span className="brand-mark" aria-hidden="true">
        b<span>•</span>
      </span>
      bridgain<span className="brand-tag">{accountLabel}</span>
    </a>
  );
}
function Illustration() {
  return (
    <aside className="story-panel" aria-label="서비스 소개">
      <span className="story-label">A LITTLE CLOSER, TOGETHER</span>
      <h2>
        {isClient ? (
          <>
            생각을 나누면,
            <br />더 좋은 결과가 돼요.
          </>
        ) : (
          <>
            각자의 전문성이,
            <br />
            하나의 결과가 되도록.
          </>
        )}
      </h2>
      <p>
        {isClient
          ? "요청부터 질문, 그리고 완성까지.\n함께 만드는 모든 순간을 한곳에서."
          : "기획자, 디자이너, 개발자가 함께하는 공간.\n고객의 생각을 팀의 다음 할 일로 연결하세요."}
      </p>
      <div className="illustration" aria-hidden="true">
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <div className="spark spark-one">✳</div>
        <div className="spark spark-two">✦</div>
        <div className="project-card">
          <div className="preview-heading">
            <span className="project-icon">↗</span>
            <div>
              <small>함께 만드는 프로젝트</small>
              <strong>우리의 다음 아이디어</strong>
            </div>
            <span className="dots">•••</span>
          </div>
          <div className="preview-task">
            <span className="check">✓</span>
            <span>새로운 생각을 나누고</span>
            <span className="mini-avatar blue">기</span>
          </div>
          <div className="preview-task">
            <span className="check">✓</span>
            <span>궁금한 점을 물어보고</span>
            <span className="mini-avatar peach">디</span>
          </div>
          <div className="preview-task active">
            <span className="task-circle" />
            <span>함께 완성해요</span>
            <span className="mini-avatar green">개</span>
          </div>
          <div className="preview-progress">
            <span />
          </div>
          <div className="preview-bottom">
            <span>아이디어에서 완성까지</span>
            <span>차근차근, 함께</span>
          </div>
        </div>
        <div className="chat-bubble">
          <span className="bubble-icon">✦</span>
          <span>좋아요! 함께 만들어봐요.</span>
        </div>
        <div className="ready-bubble">
          <span>✓</span> 생각이 연결되는 곳
        </div>
      </div>
      <div className="story-footer">
        <span className="tiny-logo">b.</span>
        <span>
          혼자 설명하던 일도,
          <br />
          <strong>이제는 함께 이해하는 일로.</strong>
        </span>
      </div>
    </aside>
  );
}
export default function App() {
  if (
    ["/preview", "/preview/projects/new"].includes(window.location.pathname)
  ) {
    return (
      <ProjectWorkspace
        role="team"
        displayName="이민수"
        userId="TEAM-MINSU"
        onExit={() => {
          window.location.href = "/";
        }}
      />
    );
  }
  return <AuthApp />;
}

function AuthApp() {
  const [view, setView] = useState<View>("login");
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    setRestoring(true);
    setRestoreError("");
    api<{ user: User }>("me")
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch((err) => {
        if (
          active &&
          !(
            err instanceof ApiError &&
            (err.status === 401 || err.code === "APP_MISMATCH")
          )
        )
          setRestoreError(errorText(err));
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  function navigate(next: View, message = "") {
    setView(next);
    setError("");
    setNotice(message);
    setPassword("");
    setConfirmation("");
    window.history.replaceState({}, "", "/");
    window.setTimeout(() => heading.current?.focus(), 0);
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (view === "login") {
        await api("login", { email: email.trim(), password, rememberMe });
        const data = await api<{ user: User }>("me");
        setUser(data.user);
        setPassword("");
      }
      if (view === "signup") {
        if (password !== confirmation)
          throw new ApiError(
            "VALIDATION_ERROR",
            "비밀번호가 서로 일치하지 않아요.",
            400,
          );
        await api("signup", {
          email: email.trim(),
          password,
          displayName: name.trim(),
        });
        navigate("login", "계정이 만들어졌어요. 바로 로그인해주세요.");
      }
    });
  }
  const titles: Record<View, string> = {
    login: "다시 만나 반가워요!",
    signup: "함께할 준비 되셨나요?",
  };
  const descriptions: Record<View, string> = {
    login: "로그인하고 함께 만드는 일을 이어가세요.",
    signup: `${accountLabel} 계정을 만들고 첫 연결을 시작하세요.`,
  };
  if (restoring || restoreError)
    return (
      <div className="loading-shell">
        <Brand />
        <main>
          <div className="loading-symbol" aria-hidden="true">
            ↗
          </div>
          <h1>
            {restoring ? "내 공간을 확인하고 있어요" : "연결을 확인해주세요"}
          </h1>
          <p role="status">
            {restoring ? "잠시만 기다려주세요." : restoreError}
          </p>
          {restoreError && (
            <button
              className="primary"
              onClick={() => setRetry((value) => value + 1)}
            >
              다시 시도
            </button>
          )}
        </main>
      </div>
    );
  if (user)
    return (
      <AiWorkspace key={user.id} userId={user.id}>
        <LiveWorkspace
          user={user}
          onLogout={async () => {
            await window.bridgainDesktop?.release();
            await api("logout", {});
            setUser(null);
            navigate("login", "안전하게 로그아웃했어요.");
          }}
        />
      </AiWorkspace>
    );
  return (
    <div className="auth-shell">
      <section className="form-panel">
        <Brand />
        <main className="auth-main">
          <span className="eyebrow">
            {isClient ? "YOUR IDEAS, CONNECTED" : "GOOD WORK, TOGETHER"}
          </span>
          <h1 ref={heading} tabIndex={-1}>
            {titles[view]}
          </h1>
          <p className="description">{descriptions[view]}</p>
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              {notice}
            </div>
          )}
          <form onSubmit={submit} aria-busy={busy}>
            <fieldset disabled={busy}>
              {view === "signup" && (
                <div className="field">
                  <label htmlFor="display-name">이름</label>
                  <input
                    id="display-name"
                    autoComplete="name"
                    required
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="함께 일할 때 사용할 이름"
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="email">이메일</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="hello@example.com"
                />
                {view === "signup" && (
                  <small>로그인에 사용할 이메일을 입력해주세요.</small>
                )}
              </div>
              <PasswordInput
                id="password"
                value={password}
                onChange={setPassword}
                isNew={view === "signup"}
              />
              {view === "signup" && (
                <PasswordInput
                  id="confirmation"
                  label="비밀번호 확인"
                  value={confirmation}
                  onChange={setConfirmation}
                  isNew
                />
              )}
              {view === "login" && (
                <div className="form-options">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                    />
                    로그인 유지
                  </label>
                </div>
              )}
              <button className="primary" disabled={busy} type="submit">
                {busy
                  ? "처리하고 있어요…"
                  : view === "login"
                    ? "로그인"
                    : "계정 만들기"}
                {!busy && <span aria-hidden="true">↗</span>}
              </button>
            </fieldset>
          </form>
          <div className="auth-switch">
            {view === "login" ? (
              <>
                아직 계정이 없으신가요?{" "}
                <button disabled={busy} onClick={() => navigate("signup")}>
                  회원가입
                </button>
              </>
            ) : (
              <button disabled={busy} onClick={() => navigate("login")}>
                ← 로그인으로 돌아가기
              </button>
            )}
          </div>
          {view === "signup" && (
            <p className="account-note">
              {isClient
                ? "의뢰자 계정으로 가입해요. 프로젝트 참여는 초대 수락 후 가능해요."
                : "개발팀 계정으로 가입해요. 직무와 팀 권한은 팀 참여 단계에서 정해요."}
            </p>
          )}
        </main>
        <footer>
          © {new Date().getFullYear()} bridgain<span>생각과 실행을 잇다</span>
        </footer>
      </section>
      <Illustration />
    </div>
  );
}
