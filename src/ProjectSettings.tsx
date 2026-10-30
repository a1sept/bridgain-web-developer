import { useEffect, useRef, useState, type FormEvent } from "react";
import StageSettings from "./StageSettings";
import RepositoryFields, { type RepositoryRelation } from "./RepositoryFields";
import "./project-settings.css";
import "./project-members.css";
import { useAi } from "./ai/AiWorkspace";
import type { RepositoryState } from "./desktop";

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
  const [repository, setRepository] = useState(project.repositoryUrls?.[0] || "");
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
    if (folder && bridge?.repositoryState) bridge.repositoryState(project.id).then(r => { if (active) setLocalRepo(r); }).catch(e => { if (active) setError(e.message); });
    else setLocalRepo(null);
    return () => { active = false; };
  }, [folder, project.id, notice]);
  async function change(clear = false, clone = false) {
    if (!bridge || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (clear) await bridge.clearFolder(project.id);
      else if (clone) { if (!bridge.cloneProject) throw Error("Bridgain 데스크톱 앱을 업데이트해주세요."); if (!(await bridge.cloneProject(project.id, repository))) return; }
      else if (!(await bridge.chooseFolder(project.id))) return;
      await ai.refreshFolders();
      setNotice(clear ? "디렉토리 연결을 해제했어요." : "Git 저장소를 확인하고 로컬 작업 디렉토리를 연결했어요.");
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
        {([
          ["general", "일반"],
          ["categories", "업무 카테고리"],
        ] as const).map(([id, label]) => (
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
        <section className="pw-panel">
          <h2>내 로컬 작업 디렉토리</h2>
          {!canManage && <RepositoryFields value={[]} onChange={() => {}} connectionOnly />}
          <p>현재 프로젝트 · 내 계정 · 이 PC에만 적용됩니다.</p>
          {error && (
            <p className="pw-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="lw-notice" role="status">
              {notice}
            </p>
          )}
          {bridge ? (
            <>
              <p className="project-folder-path">
                {folder || "연결된 디렉토리 없음"}
              </p>
              {localRepo && <p>{localRepo.repositoryUrl} · {localRepo.branch || "브랜치 없음"}<br />{localRepo.authorConfigured ? "Git 작성자 설정됨" : "Git user.name / user.email 설정 필요"}</p>}
              <label>다운로드할 GitHub 저장소<select value={repository} onChange={e => setRepository(e.target.value)} disabled={busy}>
                <option value="">저장소 선택</option>{project.repositoryUrls?.map(url => <option key={url} value={url}>{url.replace("https://github.com/", "")}</option>)}
              </select></label>
              <div className="lw-actions">
                <button
                  className="pw-primary"
                  disabled={busy}
                  onClick={() => void change()}
                >
                  {busy ? "처리 중…" : "기존 디렉토리 연결"}
                </button>
                <button className="pw-secondary" disabled={busy || !repository} onClick={() => void change(false, true)}>새 프로젝트에 연결</button>
                {folder && (
                  <button
                    className="pw-secondary"
                    disabled={busy}
                    onClick={() => void change(true)}
                  >
                    연결 해제
                  </button>
                )}
              </div>
              <p>
                기존 디렉토리는 다운로드 없이 Git 저장소를 검사합니다. 새 프로젝트에 연결은 빈 디렉토리에 GitHub 저장소를 내려받습니다. PC의 GitHub 인증이 필요하며 연결 해제 시 파일은 삭제하지 않습니다.
              </p>
            </>
          ) : (
            <p>
              Bridgain 데스크톱 앱에서 이 프로젝트를 열고 작업 폴더를
              연결해주세요.
            </p>
          )}
        </section>
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
