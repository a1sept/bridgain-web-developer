import { useEffect, useRef, useState, type FormEvent } from "react";
import { requestForRepositoryFailure } from "./repository-access";
import RepositoryAccess from "./RepositoryAccess";
import StageSettings from "./StageSettings";
import RepositoryFields, { type RepositoryRelation } from "./RepositoryFields";
import "./project-settings.css";
import "./project-members.css";
import { useAi } from "./ai/AiWorkspace";
import type { RepositoryState, RepositoryAccessResult } from "./desktop";

type ProjectValues = {
  name: string;
  description: string;
  status: string;
  repositoryUrls: string[];
  repositoryRelations: RepositoryRelation[];
};
export default function ProjectSettings({
  project,
  canManage,
  onSave,
}: {
  project: {
    id: string;
    name: string;
    description: string;
    status: string;
    repositoryUrls?: string[];
    repositoryRelations?: RepositoryRelation[];
  };
  canManage: boolean;
  onSave: (values: ProjectValues) => Promise<void>;
}) {
  const [tab, setTab] = useState<"general" | "categories">("general");
  const ai = useAi();
  const bridge = window.bridgainDesktop;
  const folder = ai.folders[project.id];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [repository, setRepository] = useState(
    project.repositoryUrls?.[0] || "",
  );
  const [access, setAccess] = useState<RepositoryAccessResult | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessRefreshVersion, setAccessRefreshVersion] = useState(0);
  const accessRequestSection = useRef<HTMLDivElement>(null);
  const accessRequestVersion = useRef(0);
  const accessContext = useRef({ projectId: project.id, repository });
  accessContext.current = { projectId: project.id, repository };
  const [localRepo, setLocalRepo] = useState<RepositoryState | null>(null);
  const lock = useRef(false);
  const saveLock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState<ProjectValues>(() => ({
    name: project.name,
    description: project.description,
    status: project.status,
    repositoryUrls: project.repositoryUrls || [],
    repositoryRelations: project.repositoryRelations || [],
  }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      await onSave({
        ...values,
        name: values.name.trim(),
        description: values.description.trim(),
        repositoryUrls: values.repositoryUrls
          .map((url) => url.trim())
          .filter(Boolean),
      });
      setSaved(true);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "프로젝트 설정을 저장하지 못했어요.",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  useEffect(() => {
    let active = true;
    void ai.refreshFolders().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [project.id]);
  useEffect(() => {
    let active = true;
    if (folder && bridge?.repositoryState)
      bridge
        .repositoryState(project.id)
        .then((r) => {
          if (active) setLocalRepo(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    else setLocalRepo(null);
    return () => {
      active = false;
    };
  }, [folder, project.id, notice]);
  useEffect(() => {
    setAccess(null);
    setCheckingAccess(false);
    return () => {
      accessRequestVersion.current += 1;
    };
  }, [repository, project.id]);
  async function checkAccess(autoRequest = false) {
    if (!bridge?.checkRepositoryAccess) {
      setError("접근 확인을 위해 데스크톱 앱을 업데이트해주세요.");
      return;
    }
    const requestVersion = ++accessRequestVersion.current;
    const requestProject = project.id;
    const requestRepository = repository;
    const isCurrent = () =>
      requestVersion === accessRequestVersion.current &&
      accessContext.current.projectId === requestProject &&
      accessContext.current.repository === requestRepository;
    setCheckingAccess(true);
    setError("");
    setAccess(null);
    try {
      const result = await bridge.checkRepositoryAccess(
        requestProject,
        requestRepository,
      );
      if (!isCurrent()) return null;
      setAccess(result);
      if (!result.ok && autoRequest) {
        const summary = await requestForRepositoryFailure(
          requestProject,
          result,
        );
        if (isCurrent()) {
          setError(summary);
          setAccessRefreshVersion((value) => value + 1);
        }
      }
      return isCurrent() ? result : null;
    } catch (e) {
      if (isCurrent())
        setError(
          e instanceof Error ? e.message : "저장소 접근을 확인하지 못했어요.",
        );
    } finally {
      if (isCurrent()) setCheckingAccess(false);
    }
  }
  async function change(clear = false, clone = false) {
    if (!bridge || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const requestProject = project.id;
    const isCurrentProject = () =>
      accessContext.current.projectId === requestProject;
    try {
      if (clear) await bridge.clearFolder(requestProject);
      else {
        let result;
        if (clone) {
          if (!bridge.cloneProject)
            throw Error("Bridgain 데스크톱 앱을 업데이트해주세요.");
          const checked = await checkAccess(true);
          if (
            !checked?.ok ||
            checked.repositoryUrl !== repository ||
            !isCurrentProject()
          )
            return;
          result = await bridge.cloneProject(requestProject, repository);
        } else result = await bridge.chooseFolder(requestProject);
        if (!result || !isCurrentProject()) return;
        if (
          typeof result === "object" &&
          "ok" in result &&
          result.ok === false
        ) {
          setAccess(result);
          const summary = await requestForRepositoryFailure(
            requestProject,
            result,
          );
          if (isCurrentProject()) {
            setError(`${summary} 기존 파일과 연결 정보는 그대로 보존됩니다.`);
            setAccessRefreshVersion((value) => value + 1);
          }
          return;
        }
      }
      if (!isCurrentProject()) return;
      await ai.refreshFolders();
      setNotice(
        clear
          ? "디렉토리 연결을 해제했어요."
          : "Git 저장소를 확인하고 로컬 작업 디렉토리를 연결했어요.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "폴더 설정을 변경하지 못했어요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label={`${project.name} 설정`}>
      <div className="pw-heading">
        <div>
          <p className="pw-eyebrow">{project.name}</p>
          <h1>설정</h1>
          <p>프로젝트 정보와 업무 카테고리, 내 개발 환경을 관리하세요.</p>
        </div>
      </div>
      <div className="pm-tabs" role="tablist" aria-label="프로젝트 설정">
        {(
          [
            ["general", "일반"],
            ["categories", "업무 카테고리"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            aria-controls={`settings-panel-${id}`}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="settings-panel-general"
        aria-labelledby="settings-tab-general"
        hidden={tab !== "general"}
      >
        <form className="pw-panel project-settings-form" onSubmit={save}>
          <h2>프로젝트 정보 · GitHub 저장소</h2>
          {!canManage && (
            <p>팀 소유자·관리자만 공통 프로젝트 설정을 변경할 수 있어요.</p>
          )}
          <fieldset disabled={!canManage || saving}>
            <label>
              프로젝트 이름
              <input
                required
                maxLength={120}
                value={values.name}
                onChange={(e) => {
                  setSaved(false);
                  setValues((v) => ({ ...v, name: e.target.value }));
                }}
              />
            </label>
            <label>
              설명
              <textarea
                rows={3}
                maxLength={2000}
                value={values.description}
                onChange={(e) => {
                  setSaved(false);
                  setValues((v) => ({ ...v, description: e.target.value }));
                }}
              />
            </label>
            <label>
              진행 상태
              <select
                value={values.status}
                onChange={(e) => {
                  setSaved(false);
                  setValues((v) => ({ ...v, status: e.target.value }));
                }}
              >
                <option value="preparing">준비 중</option>
                <option value="in_progress">진행 중</option>
                <option value="completed">완료</option>
              </select>
            </label>
            <RepositoryFields
              relations={values.repositoryRelations}
              onRelationsChange={(repositoryRelations) => {
                setSaved(false);
                setValues((v) => ({ ...v, repositoryRelations }));
              }}
              value={values.repositoryUrls}
              disabled={!canManage || saving}
              onChange={(repositoryUrls) => {
                setSaved(false);
                setValues((v) => ({ ...v, repositoryUrls }));
              }}
            />
          </fieldset>
          {saveError && (
            <p className="pw-error" role="alert">
              {saveError}
            </p>
          )}
          {saved && (
            <p className="lw-notice" role="status">
              프로젝트 설정을 저장했어요.
            </p>
          )}
          {canManage && (
            <button
              className="pw-primary"
              disabled={saving || !values.name.trim()}
            >
              {saving ? "저장 중…" : "프로젝트 설정 저장"}
            </button>
          )}
        </form>
        <section className="pw-panel project-local">
          <header className="project-local-heading">
            <div>
              <h2>내 PC 작업 폴더 연결</h2>
              <p>이 PC에서 사용할 작업 폴더를 연결하세요.</p>
            </div>
            {bridge && (
              <span
                className={`project-local-status ${folder && localRepo ? "is-connected" : folder ? "is-pending" : "is-empty"}`}
              >
                <span aria-hidden="true" className="project-local-status-dot" />
                {folder && localRepo
                  ? "연결됨"
                  : folder
                    ? error
                      ? "연결 확인 필요"
                      : "연결 확인 중"
                    : "미연결"}
              </span>
            )}
          </header>
          {error && (
            <p className="pw-error project-local-message" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="lw-notice project-local-message" role="status">
              {notice}
            </p>
          )}
          {bridge ? (
            <>
              {folder ? (
                <div
                  className="project-local-card"
                  aria-label="연결된 로컬 저장소"
                >
                  <div className="project-local-folder">
                    <span className="project-local-label">작업 폴더</span>
                    <strong>
                      {folder
                        .replace(/[\\/]+$/, "")
                        .split(/[\\/]/)
                        .at(-1) || folder}
                    </strong>
                    <code>{folder}</code>
                  </div>
                </div>
              ) : (
                <div className="project-local-empty">
                  기존 저장소 폴더를 선택하거나 새 폴더에 내려받으세요.
                </div>
              )}
              <div className="project-local-connect">
                {(project.repositoryUrls?.length || 0) > 1 ? (
                  <label className="project-local-repository">
                    작업할 저장소
                    <select
                      value={repository}
                      onChange={(e) => setRepository(e.target.value)}
                      disabled={busy || checkingAccess}
                    >
                      <option value="">저장소 선택</option>
                      {project.repositoryUrls?.map((url) => (
                        <option key={url} value={url}>
                          {url.replace("https://github.com/", "")}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : !folder && (
                  <p className="project-local-selected-repo">{repository ? repository.replace("https://github.com/", "") : "프로젝트 저장소를 먼저 등록해주세요."}</p>
                )}
                <div className="lw-actions project-local-actions">
                  <button
                    type="button"
                    className={folder ? "pw-secondary" : "pw-primary"}
                    disabled={busy}
                    onClick={() => void change()}
                  >
                    {busy ? "처리 중…" : "기존 디렉토리 연결"}
                  </button>
                  <button
                    type="button"
                    className="pw-secondary"
                    disabled={busy || checkingAccess || !repository}
                    onClick={() => void change(false, true)}
                  >
                    새 디렉토리 연결
                  </button>
                </div>
              </div>
              {access && (
                <p
                  role="status"
                  className={
                    access.ok
                      ? "project-local-ready"
                      : "project-local-warning"
                  }
                >
                  {access.message}
                </p>
              )}
              <details className="project-local-details" key={project.id}>
                <summary>연결 상세 · 문제 해결</summary>
                {folder && (
                  <dl className="project-local-facts">
                    <div>
                      <dt>GitHub 저장소</dt>
                      <dd>
                        {localRepo?.repositoryUrl?.replace(
                          "https://github.com/",
                          "",
                        ) || "확인 중"}
                      </dd>
                    </div>
                    <div>
                      <dt>현재 브랜치</dt>
                      <dd>
                        <span className="project-local-branch">
                          {localRepo
                            ? localRepo.branch || "브랜치 없음"
                            : "확인 중"}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Git 작성자</dt>
                      <dd
                        className={
                          localRepo?.authorConfigured
                            ? "project-local-ready"
                            : "project-local-warning"
                        }
                      >
                        {localRepo
                          ? localRepo.authorConfigured
                            ? "설정 완료"
                            : "user.name / user.email 설정 필요"
                          : "확인 중"}
                      </dd>
                    </div>
                  </dl>
                )}
                <div className="project-access-check">
                  <button
                    type="button"
                    className="pw-secondary"
                    disabled={busy || checkingAccess || !repository}
                    onClick={() => void checkAccess(true)}
                  >
                    {checkingAccess
                      ? "접근 확인 중…"
                      : "내 PC 저장소 접근 재확인"}
                  </button>
                  {access &&
                    ["permission", "not_found_or_no_access"].includes(
                      access.code,
                    ) && (
                      <>
                        <p>
                          등록자에게 전달된 접근 확인 요청을 아래 목록에서
                          확인할 수 있습니다. GitHub 초대를 받으면 수락한 뒤
                          다시 시도해주세요.
                        </p>
                        <button
                          type="button"
                          className="pw-secondary"
                          onClick={() => {
                            accessRequestSection.current?.focus({
                              preventScroll: true,
                            });
                            accessRequestSection.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }}
                        >
                          접근 확인 요청 목록으로 이동
                        </button>
                      </>
                    )}
                </div>
                  {folder && (
                    <button
                      type="button"
                      className="pw-secondary project-local-disconnect"
                      disabled={busy}
                      onClick={() => void change(true)}
                    >
                      연결 해제
                    </button>
                  )}
                <p className="project-local-help">이 PC의 Git 인증을 사용합니다. 연결을 해제해도 파일은 삭제되지 않습니다.</p>
              </details>
            </>
          ) : (
            <>
              <div className="lw-actions project-local-actions">
                <button type="button" className="pw-primary" disabled aria-describedby="project-local-desktop-help">기존 디렉토리 연결</button>
                <button type="button" className="pw-secondary" disabled aria-describedby="project-local-desktop-help">새 디렉토리 연결</button>
              </div>
              <p id="project-local-desktop-help" className="project-local-help">
                로컬 연결을 사용할 수 없습니다. Bridgain 데스크톱 앱의 프로젝트 설정에서 연결해주세요. 앱을 사용 중이라면 완전히 종료한 뒤 다시 실행해주세요.
              </p>
            </>
          )}
        </section>
        <div ref={accessRequestSection} tabIndex={-1}>
          <RepositoryAccess
            key={project.id}
            projectId={project.id}
            repositoryUrls={project.repositoryUrls || []}
            refreshVersion={accessRefreshVersion}
          />
        </div>
      </div>
      <div
        role="tabpanel"
        id="settings-panel-categories"
        aria-labelledby="settings-tab-categories"
        hidden={tab !== "categories"}
      >
        <StageSettings projectId={project.id} />
      </div>
    </section>
  );
}
