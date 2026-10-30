import { useEffect, useRef, useState } from "react";
import "./repository-fields.css";
import FilterBar from "./components/FilterBar";
import ControlIcon from "./components/ControlIcon";

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
  const [status, setStatus] = useState<Status | null>(null);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  function addUrl() {
    const match = /^https:\/\/github\.com\/([a-z0-9](?:[a-z0-9-]{0,38}))\/([a-z0-9_.-]{1,100})\/?$/i.exec(urlInput.trim());
    const name = match?.[2].replace(/\.git$/i, "");
    if (!match || !name || /^\.+$/.test(name)) { setUrlError("https://github.com/소유자/저장소 형식으로 입력해주세요."); return; }
    const url = `https://github.com/${match[1]}/${name}`;
    if (value.some(item => item.toLowerCase() === url.toLowerCase())) { setUrlError("이미 목록에 추가된 저장소입니다."); return; }
    if (value.length >= 20) { setUrlError("저장소는 최대 20개까지 등록할 수 있어요."); return; }
    changeUrls([...value, url]); setUrlInput(""); setUrlError("");
  }
  const [discoveries, setDiscoveries] = useState<
    Record<string, { data?: Discovery; error?: string }>
  >({});
  useEffect(() => {
    if (!onRelationsChange || disabled || !optionalOpen || !status?.connected) return;
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
  }, [value.join("|"), !!onRelationsChange, disabled, optionalOpen, status?.connected]);
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
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    if (disabled || (!connectionOnly && !optionalOpen)) return;
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
      channel?.close();
      window.removeEventListener("focus", onFocus);
    };
  }, [disabled, connectionOnly, optionalOpen]);
  useEffect(() => () => {
    const flow = activeFlow.current;
    activeFlow.current = null;
    if (flow?.timer) clearTimeout(flow.timer);
    flow?.popup?.close();
    void flow?.cancel?.().catch(() => {});
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
  const repositoryOptions = repositories.map(repo => ({
    value: repo.url,
    label: `${repo.fullName} · ${repo.private ? "비공개" : "공개"} · ${repo.defaultBranch}`,
  }));
  for (const url of value) {
    if (!repositoryOptions.some(option => option.value === url))
      repositoryOptions.push({ value: url, label: url.replace("https://github.com/", "") });
  }
  if (connectionOnly) return <section className="repo-fields repo-personal-connection">
    <div className="repo-personal-header">
      <h3>내 GitHub 계정</h3>
      <span className={`repo-connection-badge${status?.connected ? " is-connected" : ""}`}>
        <ControlIcon name={status?.connected ? "check" : "plus"} size={14} />
        {status?.connected ? "연결됨" : "선택 사항"}
      </span>
      <button type="button" disabled={busy || connecting || !status?.configured} onClick={() => void connect()}>
        {connecting ? "GitHub 승인 대기…" : status?.connected ? "다시 인증" : "GitHub 연결"}
      </button>
    </div>
    <p>{status?.connected ? "내 GitHub 저장소를 찾아 선택할 수 있어요." : "개인 GitHub 연결로 저장소를 찾아 선택할 수 있습니다. 프로젝트의 서버 연동 권한이 설정되어 있으면 개인 연결 없이 코드 조회·PR 검토를 진행할 수 있습니다."}</p>
    {connecting && <><p role="status">{window.bridgainDesktop ? "기본 브라우저에서 GitHub 인증을 완료한 뒤 앱에서 연결할 계정을 확인해주세요." : "GitHub 창에서 로그인을 완료하고 접근을 승인해주세요."}</p><button type="button" onClick={stopConnection}>취소</button></>}
    {error && <p role="alert">{error}</p>}
  </section>;
  return (
    <fieldset className="repo-fields" disabled={disabled}>
      <legend>
        GitHub 저장소 <small>프로젝트 공용</small>
      </legend>
      <p>관리자가 등록하고 저장한 저장소는 프로젝트 참여자 모두에게 표시됩니다.</p>
      <div className="repo-selected-summary" aria-label="프로젝트 저장소 목록">
        {value.map(url => <div key={url}><ControlIcon name="check" size={14} />
          <div className="repo-shared-identity"><strong>{url.replace("https://github.com/", "")}</strong><code>{url}</code>
            {!!relations.filter(item => item.parentUrl === url).length && <span>등록된 서브모듈 {relations.filter(item => item.parentUrl === url).length}개</span>}
          </div>
          {!disabled && <button type="button" aria-label={`${url} 목록에서 제거`} onClick={() => changeUrls(value.filter(item => item !== url))}>제거</button>}
        </div>)}
        {!value.length && <p>등록된 저장소가 없습니다.</p>}
      </div>
      {!disabled && <div className="repo-url-entry">
        <label>GitHub 저장소 URL<input aria-label="프로젝트 공용 GitHub 저장소 URL" type="url" value={urlInput} placeholder="https://github.com/소유자/저장소" onChange={event => { setUrlInput(event.target.value); setUrlError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} /></label>
        <button type="button" disabled={!urlInput.trim()} onClick={addUrl}>목록에 추가</button>
      </div>}
      {urlError && <p role="alert">{urlError}</p>}
      <p>URL 등록은 GitHub 접근 권한을 부여하지 않습니다. 비공개 저장소의 코드 조회·PR 처리를 위해 저장소 소유자가 프로젝트의 서버 연동 접근을 허용해야 합니다.</p>
      {!disabled && <p>목록을 변경한 뒤 프로젝트 설정을 저장해주세요. ({value.length}/20개)</p>}
      {!disabled && <details className="repo-personal-picker" open={optionalOpen} onToggle={event => setOptionalOpen(event.currentTarget.open)}>
        <summary>내 GitHub에서 찾아 추가 <small>선택 사항</small></summary>
      {!status && !error && <p role="status">개인 GitHub 연결 확인 중…</p>}
      {status && !status.configured && <p>GitHub 연결 준비 중</p>}
      {status?.configured && !status.connected && (
        <div className="repo-connect">
          <span>개인 계정을 연결하면 접근 가능한 저장소를 검색할 수 있어요.</span>
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
            <span className="repo-connection-badge is-connected"><ControlIcon name="check" size={14} />GitHub 연결됨</span>
            {!disabled && <div className="repo-actions">
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
            </div>}
          </div>
          {!disabled && !busy && <FilterBar
            label="프로젝트 GitHub 저장소 선택"
            filters={[{ id: "repository", label: "저장소 선택", multiple: true,
              options: repositoryOptions, values: value,
              renderOption: option => {
                const repo = repositories.find(item => item.url === option.value);
                if (!repo) return option.label;
                const owner = repo.owner?.login ?? repo.fullName.split("/")[0];
                return <span className="repo-option-card">
                  {repo.owner?.avatarUrl
                    ? <img className="repo-avatar" src={repo.owner.avatarUrl} alt="" />
                    : <span className="repo-avatar repo-avatar-fallback" aria-hidden="true">{owner.slice(0, 1).toUpperCase()}</span>}
                  <span className="repo-name">
                    <span className="repo-title"><strong>{repo.fullName.split("/").slice(1).join("/") || repo.fullName}</strong>
                      <span className="repo-visibility">{repo.private ? "Private" : "Public"}</span>
                    </span>
                    <small>{owner} · {repo.defaultBranch}</small>
                  </span>
                </span>;
              },
              onChange: next => {
                if (next.length > 20) { setError("저장소는 최대 20개까지 연결할 수 있어요."); return; }
                setError(""); changeUrls(next);
              },
            }]}
            onClear={() => changeUrls([])}
          />}
          {busy && <p role="status">저장소를 불러오는 중…</p>}
          {!disabled && !busy && !value.length && <p>‘저장소 선택’을 눌러 이름이나 계정으로 검색하세요.</p>}
          {!connecting && !busy && !error && !repositories.length && <div className="repo-empty">
            <strong>접근할 수 있는 저장소가 없어요</strong>
            <span>GitHub 연결 설정에서 저장소 접근을 허용해주세요.</span>
          </div>}
          <div className="repo-footer">
            <span>{value.length}/20개 선택</span>
            {!disabled && <a
              href={status.installUrl!}
              target="_blank"
              rel="noopener noreferrer"
            >
              저장소 추가 ↗
            </a>}
          </div>
        </>
      )}
      {onRelationsChange && status?.connected && optionalOpen &&
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
      </details>}
    </fieldset>
  );
}
