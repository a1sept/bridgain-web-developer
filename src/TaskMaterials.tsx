import { useEffect, useState } from "react";
import type { ProjectTask } from "./ProjectTasks";
import { workflowApi } from "./Approvals";
type FileItem = {id: string; name: string; size: number};
export default function TaskMaterials({task, projectId, editable, onChanged, onDirtyChange}: {task: ProjectTask; projectId: string; editable: boolean; onChanged: () => void; onDirtyChange: (dirty: boolean) => void}) {
  const path = `/projects/${projectId}/tasks/${task.id}`;
  const [files, setFiles] = useState<FileItem[]>([]);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [memo, setMemo] = useState(task.resultSummary || "");
  const [memoDirty, setMemoDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!memoDirty) setMemo(task.resultSummary || ""); }, [task.resultSummary]);
  useEffect(() => { onDirtyChange(busy || memoDirty || !!title || !!content || !!url); }, [busy, memoDirty, title, content, url, onDirtyChange]);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError("");
    workflowApi<{attachments: FileItem[]}>(`${path}/attachments`)
      .then(d => {if(active) setFiles(d.attachments);})
      .catch(() => {if(active) setLoadError("첨부 목록을 불러오지 못했습니다.");})
      .finally(() => {if(active) setLoading(false);});
    return () => {active = false;};
  }, [path, retry]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {await action(); onChanged();} catch(e) {setError(e instanceof Error ? e.message : "저장하지 못했습니다.");} finally {setBusy(false);}
  }
  return <>
    <section className="td-materials"><h3>문서·첨부</h3>
      {task.documentVersions.map(doc => <details key={doc.id}><summary>{doc.title}</summary>{doc.content && <p className="td-document-text">{doc.content}</p>}{doc.url && <a href={doc.url} target="_blank" rel="noreferrer">문서 링크 열기 ↗</a>}</details>)}
      {files.map(file => <a key={file.id} href={`/api/workspace${path}/attachments/${file.id}`} download>{file.name} · {Math.ceil(file.size / 1024)}KB</a>)}
      {loading && <p className="td-muted" role="status">첨부 목록을 불러오는 중…</p>}
      {loadError && <div className="td-error" role="alert">{loadError} <button disabled={loading} onClick={() => setRetry(v => v + 1)}>다시 불러오기</button></div>}
      {!loading && !loadError && !task.documentVersions.length && !files.length && <p className="td-muted">등록된 문서·첨부가 없습니다.</p>}
      {editable && <>
        <button disabled={busy} onClick={() => setAdding(v => !v)}>문서 작성·링크 등록</button>
        {adding && <div className="td-material-form">
          <label>문서 제목<input maxLength={160} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
          <label>문서 내용<textarea maxLength={50000} value={content} disabled={busy} onChange={e => setContent(e.target.value)} /></label>
          <label>문서 링크<input type="url" value={url} disabled={busy} placeholder="https://…" onChange={e => setUrl(e.target.value)} /></label>
          <button disabled={busy || !title.trim() || (!content.trim() && !url.trim())} onClick={() => void run(async () => {
            await workflowApi(`/projects/${projectId}/documents`, {taskId: task.id, title, content, url: url || null, category: task.completionMode === "design" ? "design" : task.completionMode === "document" ? "plan" : "other", changeSummary: "업무 결과물 등록"});
            setTitle(""); setContent(""); setUrl(""); setAdding(false); setNotice("문서를 등록했습니다.");
          })}>문서 등록</button>
        </div>}
        <label>파일 첨부<input type="file" accept="application/pdf,image/png,image/jpeg" multiple disabled={busy || files.length >= 5} onChange={e => {
          const selected = Array.from(e.target.files || []); e.target.value = "";
          if (!selected.length) return;
          void run(async () => {
            if (files.length + selected.length > 5 || files.reduce((n,f) => n + f.size, 0) + selected.reduce((n,f) => n + f.size, 0) > 20 * 1024 * 1024) throw Error("첨부는 최대 5개, 합계 20MB까지 가능합니다.");
            const csrf = await fetch("/api/auth/csrf", {credentials: "same-origin"});
            if (!csrf.ok) throw Error("인증 상태를 확인해주세요.");
            const {csrfToken} = await csrf.json(); const body = new FormData(); selected.forEach(file => body.append("files", file));
            const response = await fetch(`/api/workspace${path}/attachments`, {method:"POST", credentials:"same-origin", headers:{"X-CSRF-Token":csrfToken}, body});
            const data = await response.json(); if(!response.ok) throw Error(data.message || data.error?.message || "첨부하지 못했습니다.");
            setFiles(data.attachments); setNotice("파일을 첨부했습니다.");
          });
        }} /></label><small className="td-muted">PDF·PNG·JPG · 최대 5개, 합계 20MB</small>
      </>}
    </section>
    <section className="td-materials"><h3>작업 메모</h3>
      {editable ? <><textarea aria-label="작업 메모" maxLength={10000} disabled={busy} value={memo} onChange={e => {setMemo(e.target.value); setMemoDirty(true);}} placeholder="진행 내용과 결과를 기록하세요." />
        <button disabled={busy || !memoDirty} onClick={() => void run(async () => {await workflowApi(path, {expectedVersion: task.version, resultSummary: memo}, "PATCH"); setMemoDirty(false); setNotice("메모를 저장했습니다.");})}>메모 저장</button></> : <p className="td-document-text">{task.resultSummary || "작성된 메모가 없습니다."}</p>}
    </section>
    {error && <p className="td-error" role="alert">{error}</p>}{notice && <p role="status" className="td-muted">{notice}</p>}
  </>;
}
