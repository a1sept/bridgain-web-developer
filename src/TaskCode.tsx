import { useEffect, useRef, useState } from "react";
import type { GitState, GitCommitDetail } from "./desktop";
import { workflowApi } from "./Approvals";
import "./task-code.css";
import CodeDiff, { FileStatus, FileDiffList } from "./CodeDiff";

export function useTaskGit(pid: string, id: string, enabled: boolean, onChanged: () => void) {
  const [state, setState] = useState<GitState>();
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [file, setFile] = useState("");
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const epoch = useRef(0);
  const bridge = window.bridgainDesktop;
  async function read() {
    if (!enabled || !bridge?.taskGit || lock.current) return;
    lock.current = true;
    const version = epoch.current;
    try { const result: GitState = await bridge.taskGit(pid, id); if (version === epoch.current) { setState(result); setReadError(""); setSelected(s => s.filter(path => result.files.some(f => f.path === path))); } }
    catch (e) { if (version === epoch.current) setReadError((e as Error).message); }
    finally { lock.current = false; }
  }
  useEffect(() => {
    epoch.current++; setState(undefined); setError(""); setReadError(""); setNotice(""); setFile(""); setDiff(""); setSelected([]);
    void read(); const timer = window.setInterval(() => { if (!document.hidden) void read(); }, 4000);
    const focus = () => void read(); window.addEventListener("focus", focus);
    return () => { epoch.current++; clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [pid, id, enabled]);
  useEffect(() => {
    let active = true; setDiff("");
    if (file && enabled && !busy && bridge?.taskGit) bridge.taskGit(pid, id, "diff", { path: file }).then(r => { if (active) setDiff(r.diff); }).catch(e => { if (active) setDiff(e.message); });
    return () => { active = false; };
  }, [file, state?.checkedAt, busy, enabled, pid, id]);
  async function action(kind: string) {
    if (!bridge?.taskGit || lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await bridge.taskGit(pid, id, kind, { paths: selected, message, expectedHead: state?.head });
      if (result?.files) setState(result);
      if (kind === "commit") { setMessage(""); setSelected([]); }
      setNotice(({ commit: "선택한 변경사항을 커밋했습니다.", push: "업무 브랜치에 푸시했습니다.", fetch: "원격 상태를 확인했습니다.", submit: "PR을 연결하고 내 작업 완료를 제출했습니다.", editor: "VS Code로 작업 디렉토리를 열었습니다." } as Record<string, string>)[kind]);
      if (kind === "submit") onChanged();
    } catch (e) { setError((e as Error).message); if (kind === "submit") onChanged(); }
    finally { lock.current = false; setBusy(false); }
  }
  return { pid, id, state, error: error || readError, notice, busy, selected, setSelected, file, setFile, diff, message, setMessage, action };
}
type Git = ReturnType<typeof useTaskGit>;
export function LocalCode({ git, history = false, editable }: { git: Git; history?: boolean; editable: boolean }) {
  if (!git.state) return <p className="td-muted">{git.error || "로컬 Git 상태 확인 중…"}</p>;
  if (history) return <CommitHistory key={`${git.pid}:${git.id}`} projectId={git.pid} taskId={git.id} commits={git.state.history} />;
  return <section className="tc-code" aria-label="로컬 코드 변경사항"><p className="td-muted">저장된 파일의 변경을 4초마다 확인합니다. 원격 상태는 마지막 fetch 기준입니다.</p>
    <div className="tc-files">{git.state.files.map(f => <div key={f.path}><input type="checkbox" aria-label={`${f.path} 커밋 선택`} checked={git.selected.includes(f.path)} disabled={!editable || git.busy} onChange={e => git.setSelected(s => e.target.checked ? [...s, f.path] : s.filter(p => p !== f.path))} /><button type="button" aria-pressed={git.file === f.path} onClick={() => git.setFile(f.path)}>{f.path} <FileStatus status={f.status} /></button></div>)}</div>
    {!git.state.files.length && <p>미커밋 변경사항이 없습니다.</p>}
    {git.file && <><h3>{git.file}</h3><CodeDiff diff={git.diff} empty="차이 확인 중…" /></>}
  </section>;
}
function CommitHistory({ projectId, taskId, commits }: { projectId: string; taskId: string; commits: GitState["history"] }) {
  const [selectedSha, setSelectedSha] = useState(commits[0]?.sha || "");
  const [detail, setDetail] = useState<GitCommitDetail>();
  const [file, setFile] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const commit = commits.find(item => item.sha === selectedSha) ?? commits[0];
  const sha = commit?.sha || "";
  useEffect(() => {
    let active = true;
    setDetail(undefined); setFile(""); setError("");
    if (!sha) return;
    const bridge = window.bridgainDesktop;
    if (!bridge?.taskGit) { setError("커밋 변경 이력은 데스크톱 앱에서 확인해주세요."); return; }
    bridge.taskGit(projectId, taskId, "commitDetail", { sha }).then((result: GitCommitDetail) => {
      if (!active) return;
      if (result.sha !== sha || !Array.isArray(result.files)) { setError("커밋 정보를 읽지 못했어요. 데스크톱 앱을 업데이트해주세요."); return; }
      setDetail(result); setFile(result.files[0]?.path || "");
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "커밋 변경 내용을 불러오지 못했어요."); });
    return () => { active = false; };
  }, [projectId, taskId, sha, revision]);
  const current = detail?.sha === sha ? detail : undefined;
  const selectedFile = current?.files.find(item => item.path === file);
  if (!commits.length) return <p className="td-muted">아직 커밋 이력이 없습니다.</p>;
  return <section className="tc-code tc-history-browser" aria-label="커밋 변경 이력">
    <nav className="tc-commit-list" aria-label="커밋 목록">
      <h3>커밋 <span>{commits.length}</span></h3>
      {commits.map(item => <button type="button" key={item.sha} className="tc-commit-item" aria-pressed={sha === item.sha} onClick={() => setSelectedSha(item.sha)}>
        <strong>{item.subject}</strong>
        <span className="tc-commit-meta"><code>{item.sha.slice(0, 7)}</code><span>{item.author}</span></span>
        <time dateTime={item.date}>{new Date(item.date).toLocaleString()}</time>
      </button>)}
    </nav>
    <section className="tc-commit-detail" aria-label="선택한 커밋의 변경 내용" aria-busy={!current && !error}>
      <div className="tc-commit-heading"><h3>{commit?.subject}</h3><p><code>{sha.slice(0, 10)}</code> · {commit?.author}</p><p>이 커밋에서 변경된 파일과 이전 버전 대비 차이입니다.</p></div>
      {error && <div className="tc-history-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>다시 불러오기</button></div>}
      {!current && !error && <p className="td-muted" role="status">커밋 변경 내용을 불러오는 중…</p>}
      {current && <>
        <div className="tc-commit-files" role="group" aria-label="커밋의 변경 파일">
          <h3>변경 파일 <span>{current.files.length}개</span></h3>
          {current.files.map(item => <button type="button" key={item.path} aria-pressed={file === item.path} onClick={() => setFile(item.path)}><span>{item.path}</span><FileStatus status={item.status} /></button>)}
        </div>
        {current.limited && <p className="td-muted" role="status">큰 커밋은 일부 파일이나 변경 내용만 표시합니다.</p>}
        {!current.files.length && <p className="td-muted">이 커밋에는 표시할 파일 변경이 없습니다.</p>}
        {selectedFile && <div className="tc-commit-patch"><h3>{selectedFile.path}</h3>{selectedFile.originalPath && <p className="td-muted">이전 경로: {selectedFile.originalPath}</p>}{selectedFile.limited && <p className="td-muted" role="status">이 파일의 변경 내용은 일부만 표시합니다.</p>}<CodeDiff diff={selectedFile.diff} empty="텍스트 차이가 없는 파일입니다." /></div>}
      </>}
    </section>
  </section>;
}
export function GitControls({ git, editable }: { git: Git; editable: boolean }) {
  return <section className="td-actions"><h3>커밋 · 푸시 · PR</h3>
    {git.error && <p className="td-error" role="alert">{git.error}</p>}{git.notice && <p role="status">{git.notice}</p>}
    <p className="td-muted">미커밋 {git.state?.files.length ?? "—"} · 미푸시 {git.state?.ahead ?? "—"} · 원격 앞섬 {git.state?.behind ?? "—"}</p>
    <button disabled={git.busy} onClick={() => void git.action("editor")}>VS Code로 열기</button>
    <button disabled={git.busy} onClick={() => void git.action("fetch")}>원격 변경사항 확인</button>
    {editable && <><label>커밋 메시지<textarea maxLength={2000} value={git.message} disabled={git.busy} onChange={e => git.setMessage(e.target.value)} /></label>
      <button disabled={git.busy || !git.selected.length || !git.message.trim()} onClick={() => void git.action("commit")}>선택한 변경 커밋</button>
      <button disabled={git.busy || !git.state} onClick={() => void git.action("push")}>업무 브랜치에 푸시</button>
      <button disabled={git.busy || !git.state || !!git.state.files.length || git.state.head !== git.state.remoteSha} onClick={() => void git.action("submit")}>작업 완료 및 PR 요청</button>
      <p className="td-muted">변경사항을 모두 커밋·푸시한 뒤 제출합니다. 기존 PR은 재사용합니다.</p></>}
  </section>;
}
export function RemoteTaskCode({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [data, setData] = useState<{ headSha: string; approvedHeadSha?: string; pullRequestUrl: string; limited: boolean; files: { path: string; status: string; diff: string }[] }>();
  const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; setData(undefined); setError("");
    workflowApi<NonNullable<typeof data>>(`/projects/${projectId}/tasks/${taskId}/git/code`).then(r => { if (active) { setData(r); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [projectId, taskId, revision]);
  return <section className="tc-code"><h3>GitHub PR 변경 코드</h3><button type="button" onClick={() => setRevision(v => v + 1)}>최신 PR 확인</button>
    {error && <p role="alert">{error}</p>}{!data && !error && <p>PR 코드 확인 중…</p>}
    {data && <><p className="td-muted">PR 커밋 {data.headSha.slice(0, 10)}{data.approvedHeadSha && ` · 승인 커밋 ${data.approvedHeadSha.slice(0, 10)}`} · <a href={data.pullRequestUrl} target="_blank" rel="noreferrer">GitHub에서 보기</a></p>
      {data.limited && <p>최대 300개 파일을 표시합니다. 전체 내용은 GitHub에서 확인해주세요.</p>}
      <FileDiffList key={`${taskId}:${data.headSha}`} files={data.files} /></>}
  </section>;
}
