import { studyTimeInput, parseStudyTimeInput } from "./time";
import { DeckEditor } from "./StudyDecks";
import RichTextEditor from "../editor/RichTextEditor";
import RichTextContent from "../editor/RichTextContent";
import type { RichDocument } from "../editor/document";
import { uploadStudyFile } from "./upload";
import { useEffect, useRef, useState } from "react";
import { workflowApi } from "../Approvals";
export type Activity = {
  archivedAt?: string | null;
  id: string;
  programId: string;
  sessionId: string | null;
  title: string;
  instructions: string;
  dueAt: string;
  latePolicy: string;
};
type FileAsset = { id: string; name: string; mime: string; size: number };
type Version = {
  deadlineAt?: string;
  bodyDocument?: RichDocument | null;
  files?: FileAsset[];
  id: string;
  userId: string;
  body: string;
  submittedAt: string;
};
type Detail = {
  activity: Activity;
  archived: boolean;
  canRead: boolean;
  targets: { userId: string; displayName: string }[];
  versions: Version[];
};
const when = (d: string) =>
  new Date(d).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export default function StudyActivities({
  base,
  userId,
  activities,
  programs,
  sessions,
  onChanged,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  base: string;
  userId: string;
  activities: Activity[];
  programs: {
    id: string;
    title: string;
    status: string;
    archivedAt: string | null;
    canManage: boolean;
  }[];
  sessions: { id: string; title: string; programId: string }[];
  onChanged: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<Activity | null>(null);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [creating, setCreating] = useState(false),
    [pid, setPid] = useState(
      programs.find(
        (p) => p.canManage && !p.archivedAt && p.status === "active",
      )?.id ?? "",
    );
  const [files, setFiles] = useState<FileAsset[]>([]),
    [uploading, setUploading] = useState(false),
    [progress, setProgress] = useState(0);
  const [bodyDocument, setBodyDocument] = useState<RichDocument | null>(null);
  const [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [latePolicy, setLatePolicy] = useState("allow");
  const submissionRequest = useRef({ payload: "", id: "" });
  const lock = useRef(false),
    loadVersion = useRef(0);
  useEffect(
    () => () => {
      loadVersion.current++;
    },
    [],
  );
  async function open(id: string) {
    const v = ++loadVersion.current;
    setError("");
    setBusy(true);
    try {
      const d = await workflowApi<Detail>(`${base}/activities/${id}`);
      if (v !== loadVersion.current) return;
      setDetail(d);
      setSelected(null);
      setBodyDocument(
        d.versions.filter((x) => x.userId === userId).at(-1)?.bodyDocument ??
          null,
      );
      setBody(d.versions.filter((x) => x.userId === userId).at(-1)?.body ?? "");
      setFiles(
        d.versions.filter((x) => x.userId === userId).at(-1)?.files ?? [],
      );
    } catch (e) {
      if (v === loadVersion.current)
        setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      if (v === loadVersion.current) setBusy(false);
    }
  }
  async function run(fn: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    setProgress(0);
    setError("");
    try {
      const asset = await uploadStudyFile(base, file, setProgress);
      setFiles((v) => [...v, asset]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }
  function attachments(list: FileAsset[]) {
    return (
      <ul>
        {list.map((f) => (
          <li key={f.id}>
            <a
              href={`/api/workspace${base}/assets/${f.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {f.name}
            </a>{" "}
            · {(f.size / 1024).toFixed(0)} KB
          </li>
        ))}
      </ul>
    );
  }
  const eligible = programs.filter(
    (p) => p.canManage && !p.archivedAt && p.status === "active",
  );
  const mine = detail?.versions.filter((v) => v.userId === userId) ?? [];
  if (copyId && detail)
    return (
      <DeckEditor
        url={`${base}/programs/${detail.activity.programId}/decks/${copyId}`}
        members={detail.targets}
        onBack={() => setCopyId(null)}
      />
    );
  return (
    <section>
      {error && (
        <p className="study-error" role="alert">
          {error}
        </p>
      )}
      {creating ? (
        <>
          <button onClick={() => setCreating(false)}>← 활동 목록</button>
          <h2>{editing ? "참여 활동 수정" : "참여 활동 만들기"}</h2>
          <form
            className="study-form"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void run(async () => {
                const due = parseStudyTimeInput(String(fd.get("dueAt")));
                due.setSeconds(59, 999);
                await workflowApi(
                  `${base}/programs/${pid}/activities${editing ? `/${editing.id}` : ""}`,
                  {
                    title: fd.get("title"),
                    instructions: fd.get("instructions"),
                    dueAt: due.toISOString(),
                    sessionId: fd.get("sessionId") || null,
                    latePolicy,
                  },
                  editing ? "PATCH" : "POST",
                );
                if (editing) await open(editing.id);
                setCreating(false);
              });
            }}
          >
            <label>
              프로그램
              <select
                value={pid}
                disabled={!!editing}
                onChange={(e) => setPid(e.target.value)}
                required
              >
                {eligible.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              제목
              <input
                name="title"
                required
                maxLength={120}
                defaultValue={editing?.title}
              />
            </label>
            <label>
              안내
              <textarea
                name="instructions"
                maxLength={10000}
                rows={5}
                defaultValue={editing?.instructions}
              />
            </label>
            <label>
              연결 회차
              <select
                name="sessionId"
                key={pid}
                defaultValue={editing?.sessionId ?? ""}
              >
                <option value="">회차와 무관한 활동</option>
                {sessions
                  .filter((s) => s.programId === pid)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              제출 기한 (한국 시간)
              <input
                type="datetime-local"
                name="dueAt"
                required
                defaultValue={
                  editing ? studyTimeInput(editing.dueAt) : undefined
                }
              />
            </label>
            <fieldset>
              <legend>마감 후 제출</legend>
              <div className="study-segment">
                {[
                  ["allow", "허용 · 기한 초과 표시"],
                  ["block", "차단"],
                ].map(([v, t]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={v === latePolicy}
                    onClick={() => setLatePolicy(v)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </fieldset>
            <button className="pw-primary" disabled={busy || !pid}>
              {editing ? "변경 저장" : "활동 등록"}
            </button>
          </form>
        </>
      ) : detail ? (
        <>
          <button
            onClick={() => {
              loadVersion.current++;
              setDetail(null);
              setSelected(null);
            }}
          >
            ← 활동 목록
          </button>
          <h2>
            {detail.activity.title}
            {detail.activity.archivedAt ? " · 보관됨" : ""}
          </h2>
          {programs.some(
            (p) =>
              p.id === detail.activity.programId &&
              p.canManage &&
              !p.archivedAt,
          ) && (
            <div className="study-actions">
              <button
                onClick={() => {
                  setEditing(detail.activity);
                  setPid(detail.activity.programId);
                  setLatePolicy(detail.activity.latePolicy);
                  setCreating(true);
                }}
              >
                활동 수정
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      detail.activity.archivedAt
                        ? "활동 제출을 다시 열까요?"
                        : "보관하면 제출이 중지됩니다. 기록은 유지합니다.",
                    )
                  )
                    void run(async () => {
                      await workflowApi(
                        `${base}/programs/${detail.activity.programId}/activities/${detail.activity.id}`,
                        {
                          action: detail.activity.archivedAt
                            ? "restore"
                            : "archive",
                        },
                        "PATCH",
                      );
                      await open(detail.activity.id);
                    });
                }}
              >
                {detail.activity.archivedAt ? "활동 복원" : "활동 보관"}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "제출 기록이 없는 활동만 삭제할 수 있습니다. 삭제할까요?",
                    )
                  )
                    void run(async () => {
                      await workflowApi(
                        `${base}/programs/${detail.activity.programId}/activities/${detail.activity.id}`,
                        { action: "delete" },
                        "PATCH",
                      );
                      setDetail(null);
                    });
                }}
              >
                삭제
              </button>
            </div>
          )}
          <p style={{ whiteSpace: "pre-wrap" }}>
            {detail.activity.instructions}
          </p>
          <p>
            제출 기한 {when(detail.activity.dueAt)} · 마감 후{" "}
            {detail.activity.latePolicy === "allow" ? "제출 허용" : "제출 차단"}
          </p>
          {selected ? (
            <>
              <button onClick={() => setSelected(null)}>← 제출 현황</button>
              <h3>
                {detail.targets.find((t) => t.userId === selected)?.displayName}
                님의 제출
              </h3>
              {detail.versions
                .filter((v) => v.userId === selected)
                .map((v, i) => (
                  <article className="study-submission" key={v.id}>
                    <strong>{i + 1}번째 제출</strong>
                    <p
                      className={
                        new Date(v.submittedAt) >
                        new Date(v.deadlineAt ?? detail.activity.dueAt)
                          ? "study-late"
                          : ""
                      }
                    >
                      {when(v.submittedAt)}
                      {new Date(v.submittedAt) >
                      new Date(v.deadlineAt ?? detail.activity.dueAt)
                        ? i
                          ? " · 기한 초과 수정본"
                          : " · 기한 초과"
                        : ""}
                    </p>
                    <RichTextContent value={v.body} document={v.bodyDocument} />
                    {attachments(v.files ?? [])}
                    {!detail.archived && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const copy = await workflowApi<{ id: string }>(
                              `${base}/programs/${detail.activity.programId}/decks`,
                              { sourceSubmissionId: v.id },
                            );
                            setCopyId(copy.id);
                          })
                        }
                      >
                        발표용 사본 만들기
                      </button>
                    )}
                  </article>
                ))}
            </>
          ) : (
            <>
              {detail.canRead && (
                <>
                  <h3>제출 현황</h3>
                  <div className="study-table-scroll">
                    <table className="study-table">
                      <thead>
                        <tr>
                          <th>회원</th>
                          <th>상태</th>
                          <th>제출 시각</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.targets.map((t) => {
                          const v = detail.versions
                            .filter((x) => x.userId === t.userId)
                            .at(-1);
                          return (
                            <tr key={t.userId}>
                              <td>
                                <button onClick={() => setSelected(t.userId)}>
                                  {t.displayName}
                                </button>
                              </td>
                              <td>{v ? "제출 완료" : "미제출"}</td>
                              <td
                                className={
                                  v &&
                                  new Date(v.submittedAt) >
                                    new Date(
                                      v.deadlineAt ?? detail.activity.dueAt,
                                    )
                                    ? "study-late"
                                    : ""
                                }
                              >
                                {v ? when(v.submittedAt) : "–"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {detail.targets.some((t) => t.userId === userId) && (
                <>
                  <h3>내 제출</h3>
                  {mine.length > 0 && (
                    <button onClick={() => setSelected(userId)}>
                      내 제출 상세 · 발표용 사본
                    </button>
                  )}
                  {mine.map((v, i) => (
                    <p
                      key={v.id}
                      className={
                        new Date(v.submittedAt) >
                        new Date(v.deadlineAt ?? detail.activity.dueAt)
                          ? "study-late"
                          : ""
                      }
                    >
                      {i + 1}번째 제출 · {when(v.submittedAt)}
                      {new Date(v.submittedAt) >
                      new Date(v.deadlineAt ?? detail.activity.dueAt)
                        ? " · 기한 초과"
                        : ""}
                    </p>
                  ))}
                  <form
                    className="study-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        const payload = JSON.stringify({
                          activityId: detail.activity.id,
                          body,
                          bodyDocument,
                          assetIds: files.map((f) => f.id),
                        });
                        if (submissionRequest.current.payload !== payload)
                          submissionRequest.current = {
                            payload,
                            id: crypto.randomUUID(),
                          };
                        await workflowApi(
                          `${base}/activities/${detail.activity.id}/submissions`,
                          {
                            body,
                            bodyDocument,
                            assetIds: files.map((f) => f.id),
                            requestId: submissionRequest.current.id,
                          },
                        );
                        submissionRequest.current = { payload: "", id: "" };
                        await open(detail.activity.id);
                      });
                    }}
                  >
                    <label>
                      제출 문서
                      <RichTextEditor
                        value={body}
                        document={bodyDocument}
                        onChange={(text, doc) => {
                          setBody(text);
                          setBodyDocument(doc);
                        }}
                        disabled={busy || detail.archived}
                        label="제출 문서"
                        maxLength={10000}
                      />
                    </label>
                    <label>
                      이미지·PDF·영상 첨부
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4,video/webm"
                        disabled={
                          uploading ||
                          busy ||
                          detail.archived ||
                          files.length >= 10
                        }
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void upload(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {uploading && (
                      <p role="status">
                        {progress < 100
                          ? `업로드 ${progress}%`
                          : "파일을 처리하는 중…"}
                      </p>
                    )}
                    {attachments(files)}
                    {files.length > 0 && (
                      <button
                        type="button"
                        disabled={busy || uploading}
                        onClick={() => setFiles([])}
                      >
                        이번 수정본의 첨부 비우기
                      </button>
                    )}
                    <p>
                      업로드 후 제출하기를 눌러야 제출이 완료됩니다. 이전 제출
                      내용과 시각은 보존됩니다.
                    </p>
                    <button
                      className="pw-primary"
                      disabled={
                        busy ||
                        uploading ||
                        detail.archived ||
                        (!body.trim() && !files.length) ||
                        (detail.activity.latePolicy === "block" &&
                          Date.now() > +new Date(detail.activity.dueAt))
                      }
                    >
                      {mine.length ? "수정본 제출" : "제출하기"}
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="study-heading">
            <h2>참여 활동</h2>
            {eligible.length > 0 && (
              <button
                className="pw-primary"
                onClick={() => {
                  setPid(eligible[0].id);
                  setEditing(null);
                  setCreating(true);
                }}
              >
                활동 만들기
              </button>
            )}
          </div>
          {!activities.length ? (
            <p className="study-empty">
              등록된 참여 활동이 없습니다. 프로그램을 시작한 후 활동을 등록할 수
              있습니다.
            </p>
          ) : (
            <div className="study-table-scroll">
              <table className="study-table">
                <thead>
                  <tr>
                    <th>활동</th>
                    <th>프로그램</th>
                    <th>기한</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <button disabled={busy} onClick={() => void open(a.id)}>
                          {a.title}
                        </button>
                      </td>
                      <td>
                        {programs.find((p) => p.id === a.programId)?.title}
                      </td>
                      <td>{when(a.dueAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {!creating && !detail && hasMore && (
        <button disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? "불러오는 중…" : "다음 활동 더 보기"}
        </button>
      )}
    </section>
  );
}
