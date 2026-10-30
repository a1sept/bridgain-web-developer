import { useEffect, useRef, useState } from "react";
import "./repository-fields.css";

export type RepositoryRelation = {
  parentUrl: string;
  childUrl: string;
  path: string;
  commit: string;
  parentCommit: string;
};
type Submodule = Omit<RepositoryRelation, "childUrl"> & {
  childUrl: string | null;
  rawUrl: string;
  available: boolean;
  reason: string | null;
};
type Discovery = {
  parentUrl: string;
  parentCommit: string;
  submodules: Submodule[];
};
type Repository = {
  id: number;
  fullName: string;
  url: string;
  private: boolean;
  defaultBranch: string;
  owner?: { login: string; avatarUrl: string; type: string };
};
type Status = {
  configured: boolean;
  connected: boolean;
  installUrl: string | null;
};
async function github(path: string, mutation = false) {
  const headers: Record<string, string> = {};
  if (mutation) {
    const csrf = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!csrf.ok)
      throw new Error("보안 확인에 실패했어요. 다시 로그인해주세요.");
    headers["X-CSRF-Token"] = (await csrf.json()).csrfToken;
  }
  const response = await fetch(`/api/workspace/github/${path}`, {
    method: mutation ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || "GitHub 연결을 확인하지 못했어요.");
  return data;
}
export default function RepositoryFields({
  value,
  onChange,
  disabled = false,
  relations = [],
  onRelationsChange,
  connectionOnly = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  relations?: RepositoryRelation[];
  onRelationsChange?: (value: RepositoryRelation[]) => void;
  connectionOnly?: boolean;
}) {
  const [discoveries, setDiscoveries] = useState<
    Record<string, { data?: Discovery; error?: string }>
  >({});
  useEffect(() => {
    if (!onRelationsChange) return;
    let active = true;
    for (const url of value) {
      if (discoveries[url]?.data || discoveries[url]?.error) continue;
      void github(`submodules?repositoryUrl=${encodeURIComponent(url)}`)
        .then((data) => {
          if (active)
            setDiscoveries((current) => ({ ...current, [url]: { data } }));
        })
        .catch((e) => {
          if (active)
            setDiscoveries((current) => ({
              ...current,
              [url]: { error: e.message || "조회 실패" },
            }));
        });
    }
    return () => {
      active = false;
    };
  }, [value.join("|"), !!onRelationsChange]);
  function changeUrls(next: string[]) {
    onChange(next);
    onRelationsChange?.(
      relations.filter(
        (r) => next.includes(r.parentUrl) && next.includes(r.childUrl),
      ),
    );
  }
  function includeChildren(data: Discovery) {
    const children = data.submodules.filter(
      (r): r is Submodule & { childUrl: string } => r.available && !!r.childUrl,
    );
    const next = [...new Set([...value, ...children.map((r) => r.childUrl)])];
    if (next.length > 20) {
      setError("상위·하위 저장소를 합쳐 최대 20개까지 연결할 수 있어요.");
      return;
    }
    const edges = new Map(
      relations.filter(r => r.parentUrl !== data.parentUrl).map((r) => [`${r.parentUrl}:${r.path}`, r]),
    );
    for (const child of children)
      edges.set(`${child.parentUrl}:${child.path}`, {
        parentUrl: child.parentUrl,
        childUrl: child.childUrl,
        path: child.path,
        commit: child.commit,
        parentCommit: child.parentCommit,
      });
    if (edges.size > 100) {
      setError("서브모듈 관계는 최대 100개까지 연결할 수 있어요.");
      return;
    }
    onChange(next);
    onRelationsChange?.([...edges.values()]);
    setError("");
  }
  const [status, setStatus] = useState<Status | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("");
  const [connecting, setConnecting] = useState(false);
  const activeFlow = useRef<{
    popup: Window | null;
    cancel?: () => Promise<void>;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);
  function stopConnection() {
    const flow = activeFlow.current;
    activeFlow.current = null;
    if (flow?.timer) clearTimeout(flow.timer);
    flow?.popup?.close();
    void flow?.cancel?.().catch(() => {});
    setConnecting(false);
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const next: Status = await github("status");
      setStatus(next);
      setRepositories(
        next.connected ? (await github("repositories")).repositories : [],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
    // Same-origin channel works even though the authorization popup has no opener.
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("bridgain-github");
    if (channel)
      channel.onmessage = (event) => {
        if (event.data?.type === "connected") void refresh();
      };
    const onFocus = () => {
      if (!activeFlow.current) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      const flow = activeFlow.current;
      activeFlow.current = null;
      if (flow?.timer) clearTimeout(flow.timer);
      flow?.popup?.close();
      void flow?.cancel?.().catch(() => {});
      channel?.close();
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  async function connect() {
    if (activeFlow.current) {
      activeFlow.current.popup?.focus();
      return;
    }
    const desktop = window.bridgainDesktop;
    if (desktop && (!desktop.connectGithub || !desktop.cancelGithub)) {
      setError("데스크톱 앱을 업데이트하고 다시 실행해주세요.");
      return;
    }
    const popup = desktop ? null : window.open(
      "about:blank",
      "_blank",
      "popup,width=760,height=820",
    );
    if (!desktop && !popup) {
      setError("팝업을 허용한 후 다시 연결해주세요.");
      return;
    }
    if (popup) popup.opener = null;
    const flow: { popup: Window | null; cancel?: () => Promise<void>; timer?: ReturnType<typeof setTimeout> } = {
      popup,
      cancel: desktop?.cancelGithub,
    };
    activeFlow.current = flow;
    setConnecting(true);
    setError("");
    let deadline = Date.now() + 10 * 60 * 1000;
    async function check() {
      if (activeFlow.current !== flow) return;
      try {
        const next: Status = await github("status");
        if (activeFlow.current !== flow) return;
        if (next.connected) {
          const data = await github("repositories");
          if (activeFlow.current !== flow) return;
          if (data.repositories.length) {
            setStatus(next);
            setRepositories(data.repositories);
            stopConnection();
            return;
          }
        }
      } catch (e) {
        if (activeFlow.current !== flow) return;
        // Keep checking while GitHub finishes granting access; never show a false success.
        if (Date.now() >= deadline) {
          stopConnection();
          setError(
            e instanceof Error ? e.message : "GitHub 연결을 다시 시도해주세요.",
          );
          return;
        }
      }
      if (activeFlow.current !== flow) return;
      if (Date.now() >= deadline) {
        stopConnection();
        setError(
          "연결 시간이 만료됐어요. 조직 승인이 필요하면 승인 후 다시 연결해주세요.",
        );
        return;
      }
      flow.timer = setTimeout(() => void check(), 3000);
    }
    try {
      if (desktop?.connectGithub) {
        await desktop.connectGithub();
        // Give repository installation its own window after native OAuth finishes.
        deadline = Date.now() + 10 * 60 * 1000;
      } else {
        const { url } = await github("connect", true);
        if (activeFlow.current !== flow) return;
        if (popup) popup.location.href = url;
      }
      if (activeFlow.current !== flow) return;
      flow.timer = setTimeout(() => void check(), 1500);
    } catch (e) {
      if (activeFlow.current !== flow) return;
      stopConnection();
      setError(e instanceof Error ? e.message : "연결하지 못했어요.");
    }
  }
  const owners = [
    ...new Map(
      repositories.map((r) => {
        const owner = r.owner ?? {
          login: r.fullName.split("/")[0],
          avatarUrl: "",
          type: "User",
        };
        return [owner.login, owner] as const;
      }),
    ).values(),
  ];
  const activeAccount = owners.some((owner) => owner.login === account)
    ? account
    : "";
  const filtered = repositories.filter(
    (r) =>
      (!activeAccount ||
        (r.owner?.login ?? r.fullName.split("/")[0]) === activeAccount) &&
      r.fullName.toLowerCase().includes(query.trim().toLowerCase()),
  );
  if (connectionOnly) return <section className="repo-fields"><h3>내 GitHub 계정</h3><p>{status?.connected ? "GitHub 연결됨" : "PR 제출·검토를 위해 내 GitHub 계정을 연결해주세요."}</p><button type="button" disabled={busy || connecting || !status?.configured} onClick={() => void connect()}>{connecting ? "GitHub 승인 대기…" : status?.connected ? "GitHub 다시 인증" : "GitHub 연결"}</button>{connecting && <><p role="status">{window.bridgainDesktop ? "기본 브라우저에서 GitHub 인증을 완료한 뒤 앱에서 연결할 계정을 확인해주세요." : "GitHub 창에서 로그인을 완료하고 접근을 승인해주세요."}</p><button type="button" onClick={stopConnection}>취소</button></>}{error && <p role="alert">{error}</p>}</section>;
  return (
    <fieldset className="repo-fields" disabled={disabled}>
      <legend>
        GitHub 저장소 <small>선택</small>
      </legend>
      {!status && !error && <p role="status">불러오는 중…</p>}
      {status && !status.configured && <p>GitHub 연결 준비 중</p>}
      {status?.configured && !status.connected && (
        <div className="repo-connect">
          <span>Public·Private 저장소를 연결하세요.</span>
          <button
            type="button"
            disabled={busy || connecting}
            onClick={() => void connect()}
          >
            GitHub 연결
          </button>
        </div>
      )}
      {connecting && (
        <div className="repo-connect" role="status">
          <span>
            {window.bridgainDesktop ? "기본 브라우저에서 GitHub 인증을 완료한 뒤 앱에서 연결할 계정을 확인해주세요." : "GitHub 창에서 로그인을 완료하고 접근을 승인해주세요."} 목록은 자동으로 표시됩니다.
          </span>
          <button type="button" onClick={stopConnection}>
            취소
          </button>
        </div>
      )}
      {status?.connected && (
        <>
          <div className="repo-toolbar">
            <span className="repo-connected">● 연결됨</span>
            <div className="repo-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
                aria-label="저장소 목록 새로고침"
              >
                {busy ? "불러오는 중…" : "새로고침"}
              </button>
              <details className="repo-options">
                <summary>연결 설정</summary>
                <div>
                  <a
                    href={status.installUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    저장소 접근 관리 ↗
                  </a>
                  <button
                    type="button"
                    disabled={busy || connecting}
                    onClick={() => void connect()}
                  >
                    다시 인증
                  </button>
                </div>
              </details>
            </div>
          </div>
          {owners.length > 0 && (
            <div className="repo-account">
              {owners.find((owner) => owner.login === activeAccount)
                ?.avatarUrl && (
                <img
                  src={
                    owners.find((owner) => owner.login === activeAccount)!
                      .avatarUrl
                  }
                  alt=""
                  referrerPolicy="no-referrer"
                />
              )}
              <select
                aria-label="GitHub 계정 또는 조직"
                value={activeAccount}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">모든 GitHub 계정</option>
                {owners.map((owner) => (
                  <option key={owner.login} value={owner.login}>
                    {owner.login}
                    {owner.type === "Organization" ? " · 조직" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <input
            className="repo-search"
            type="search"
            aria-label="GitHub 저장소 검색"
            placeholder="저장소 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div
            className="repo-picker"
            aria-label="GitHub 저장소 목록"
            aria-busy={busy}
          >
            {filtered.map((repo) => (
              <div
                key={repo.id}
                className={`repo-card${value.includes(repo.url) ? " is-selected" : ""}`}
              >
                {repo.owner?.avatarUrl ? (
                  <img
                    className="repo-avatar"
                    src={repo.owner.avatarUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span
                    className="repo-avatar repo-avatar-fallback"
                    aria-hidden="true"
                  >
                    {repo.fullName[0].toUpperCase()}
                  </span>
                )}
                <span className="repo-name">
                  <span className="repo-title">
                    <strong>
                      {repo.fullName.split("/").slice(1).join("/")}
                    </strong>
                    <span className="repo-visibility">
                      {repo.private ? "Private" : "Public"}
                    </span>
                  </span>
                  <small>
                    {repo.owner?.login ?? repo.fullName.split("/")[0]} ·{" "}
                    {repo.defaultBranch}
                  </small>
                </span>
                <button
                  className="repo-select"
                  type="button"
                  aria-label={`${repo.fullName} ${value.includes(repo.url) ? "연결 해제" : "연결"}`}
                  aria-pressed={value.includes(repo.url)}
                  disabled={
                    busy || (!value.includes(repo.url) && value.length >= 20)
                  }
                  onClick={() =>
                    changeUrls(
                      value.includes(repo.url)
                        ? value.filter((url) => url !== repo.url)
                        : [...value, repo.url],
                    )
                  }
                >
                  {value.includes(repo.url) ? "✓ 선택됨" : "연결"}
                </button>
              </div>
            ))}
            {!connecting && !busy && !error && !repositories.length && (
              <div className="repo-empty">
                <strong>연결할 저장소를 선택해주세요</strong>
                <span>GitHub에서 저장소 접근을 허용해주세요.</span>
                <button
                  className="repo-install"
                  type="button"
                  disabled={connecting}
                  onClick={() => void connect()}
                >
                  GitHub 연결
                </button>
              </div>
            )}
            {!busy && !error && repositories.length > 0 && !filtered.length && (
              <div className="repo-empty">검색 결과가 없어요.</div>
            )}
            {busy && !repositories.length && (
              <div className="repo-empty" role="status">
                저장소를 불러오는 중…
              </div>
            )}
          </div>
          <div className="repo-footer">
            <span>{value.length}/20개 선택</span>
            <a
              href={status.installUrl!}
              target="_blank"
              rel="noopener noreferrer"
            >
              저장소 추가 ↗
            </a>
          </div>
        </>
      )}
      {onRelationsChange &&
        value.map((url) => {
          const state = discoveries[url];
          const data = state?.data;
          return (
            <section
              className="repo-submodules"
              key={url}
              aria-label={`${url} 서브모듈`}
            >
              <div className="repo-submodule-heading">
                <strong>{url.replace("https://github.com/", "")}</strong>
                <small>
                  {data
                    ? `서브모듈 ${data.submodules.length}개`
                    : state?.error
                      ? "조회 실패"
                      : "서브모듈 확인 중…"}
                </small>
              </div>
              {state?.error && (
                <p role="alert">
                  {state.error}
                  <button
                    type="button"
                    onClick={() => {
                      setDiscoveries((current) => {
                        const next = { ...current };
                        delete next[url];
                        return next;
                      });
                      void github(
                        `submodules?repositoryUrl=${encodeURIComponent(url)}`,
                      )
                        .then((data) =>
                          setDiscoveries((current) => ({
                            ...current,
                            [url]: { data },
                          })),
                        )
                        .catch((e) =>
                          setDiscoveries((current) => ({
                            ...current,
                            [url]: { error: e.message },
                          })),
                        );
                    }}
                  >
                    다시 조회
                  </button>
                </p>
              )}
              {data?.submodules.map((child) => (
                <div className="repo-submodule-item" key={child.path}>
                  <span>
                    {child.childUrl?.replace("https://github.com/", "") ??
                      child.rawUrl}
                    <small>
                      {child.path} · {child.commit.slice(0, 7)}
                    </small>
                  </span>
                  <small>
                    {!child.available
                      ? child.reason
                      : relations.some(
                            (r) =>
                              r.parentUrl === child.parentUrl &&
                              r.path === child.path &&
                              r.childUrl === child.childUrl &&
                              r.commit === child.commit,
                          )
                        ? "연결됨"
                        : "연결 가능"}
                  </small>
                </div>
              ))}
              {!!data?.submodules.some((child) => child.available) && (
                <button type="button" onClick={() => includeChildren(data)}>
                  하위 저장소 함께 연결
                </button>
              )}
            </section>
          );
        })}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" disabled={busy} onClick={() => void refresh()}>
            다시 시도
          </button>
        </p>
      )}
      {value
        .filter((url) => !repositories.some((repo) => repo.url === url))
        .map((url) => (
          <div className="repo-field-row" key={url}>
            <span>{url.replace("https://github.com/", "")}</span>
            <button
              type="button"
              onClick={() => changeUrls(value.filter((v) => v !== url))}
            >
              선택 해제
            </button>
          </div>
        ))}
    </fieldset>
  );
}
