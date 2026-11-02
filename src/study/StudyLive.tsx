import { createLocalId } from "../browser-id";
import RichTextContent from "../editor/RichTextContent";
import type { RichDocument } from "../editor/document";
import { SlideDisplay, slideFromDoc, type SlideView } from "./StudySlideCanvas";
import { uploadStudyFile } from "./upload";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { workflowApi } from "../Approvals";
type Slide = SlideView & {
  bodyDocument?: RichDocument | null;
  asset?: { id: string; name: string; mime: string };
  submissionId?: string;
  videoId?: string;
  youtube?: string;
  type?: string;
  title?: string;
  body?: string;
  deckId?: string;
  pageId?: string;
};
type Room = {
  hostId: string | null;
  presenterId: string | null;
  waiting: boolean;
  ended: boolean;
  canHost: boolean;
  canReclaim?: boolean;
  shared: Slide;
  participants: { userId: string; name: string; canHost: boolean }[];
};
type Session = { id: string; programId: string; title: string; status: string };
type Attendance = {
  canAdjust?: boolean;
  ended: boolean;
  rows: {
    userId: string;
    name: string;
    seconds: number;
    late: boolean;
    eligible: boolean;
    firstJoinedAt: string | null;
    corrections?: {
      id: string;
      verdict: string;
      reason: string;
      actorName: string;
      createdAt: string;
    }[];
    entries: { joinedAt: string; leftAt: string }[];
  }[];
};
export default function StudyLive({
  base,
  session,
  userId,
  canHost,
  onBack,
}: {
  base: string;
  session: Session;
  userId: string;
  canHost: boolean;
  onBack: () => void;
}) {
  const [room, setRoom] = useState<Room | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [joined, setJoined] = useState(false),
    [report, setReport] = useState<Attendance | null>(null);
  const [decks, setDecks] = useState<{ id: string; title: string }[]>([]),
    [pages, setPages] = useState<Slide[]>([]),
    [preview, setPreview] = useState<Slide | null>(null),
    [tray, setTray] = useState(false),
    [people, setPeople] = useState(true);
  const [materials, setMaterials] = useState<{
      submissions: {
        id: string;
        title: string;
        body: string;
        bodyDocument?: RichDocument | null;
        name: string;
        files: { id: string; name: string; mime: string }[];
      }[];
      sessions: { id: string; title: string }[];
    }>({ submissions: [], sessions: [] }),
    [materialSession, setMaterialSession] = useState(session.id),
    [youtube, setYoutube] = useState(""),
    [progress, setProgress] = useState(0);
  const connection = useRef(createLocalId()),
    lock = useRef(false),
    latest = useRef<Room | null>(null);
  const url = `${base}/sessions/${session.id}`;
  async function command(action: string, extra: Record<string, unknown> = {}) {
    const r = await workflowApi<Room>(`${url}/live`, {
      action,
      connectionId: connection.current,
      ...extra,
    });
    latest.current = r;
    setRoom(r);
    return r;
  }
  async function run(action: string, extra: Record<string, unknown> = {}) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await command(action, extra);
      if (action === "start" || action === "join") setJoined(true);
      if (r.ended) {
        setJoined(false);
        await getReport();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결 실패");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function getReport() {
    setReport(await workflowApi<Attendance>(`${url}/attendance`));
  }
  useEffect(() => {
    if (session.status === "ended")
      void getReport().catch((e) => setError(e.message));
  }, [session.id]);
  useEffect(() => {
    if (!joined) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (stopped) return;
      try {
        if (!lock.current) {
          const r = await workflowApi<Room>(`${url}/live`, {
            action: "heartbeat",
            connectionId: connection.current,
          });
          if (!stopped) {
            latest.current = r;
            setRoom(r);
            setError("");
            if (r.ended) {
              setJoined(false);
              await getReport();
            }
          }
        }
      } catch (e) {
        if (!stopped)
          setError(
            (e instanceof Error ? e.message : "연결 실패") +
              " · 다시 입장하거나 잠시 기다려주세요.",
          );
      } finally {
        if (!stopped) timer = setTimeout(tick, 5000);
      }
    }
    timer = setTimeout(tick, 5000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [joined, url]);
  useEffect(() => {
    return () => {
      if (latest.current && !latest.current.ended)
        void workflowApi(`${url}/live`, {
          action: "leave",
          connectionId: connection.current,
        }).catch(() => {});
    };
  }, [url]);
  useEffect(() => {
    if (!joined) return;
    const source = new EventSource(
      `/api/workspace${url}/events?connectionId=${encodeURIComponent(connection.current)}`,
    );
    source.onmessage = (event) => {
      try {
        const r = JSON.parse(event.data) as Room;
        latest.current = r;
        setRoom(r);
        if (r.ended) {
          setJoined(false);
          void getReport().catch((e) => setError(e.message));
        }
      } catch {}
    };
    source.addEventListener("closed", () => {
      source.close();
      setError("라이브 연결이 종료되었습니다. 다시 입장해주세요.");
    });
    return () => source.close();
  }, [joined, url]);
  const name = (id: string | null) =>
    room?.participants.find((p) => p.userId === id)?.name ?? "대기 중";
  const isPresenter = room?.presenterId === userId && !room?.waiting;
  async function loadMaterials(id: string) {
    setMaterialSession(id);
    try {
      setMaterials(
        await workflowApi(
          `${url}/materials?sessionId=${encodeURIComponent(id)}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "자료 조회 실패");
    }
  }
  function renderSlide(s: Slide) {
    if (s.type === "submission")
      return (
        <div>
          <h2>{s.title}</h2>
          <RichTextContent value={s.body ?? ""} document={s.bodyDocument} />
        </div>
      );
    if (s.type === "slide") return <SlideDisplay slide={s} base={base} />;
    const src = s.asset ? `/api/workspace${base}/assets/${s.asset.id}` : "";
    if (s.type === "youtube" && s.videoId)
      return (
        <iframe
          className="study-media"
          title="YouTube 영상"
          src={`https://www.youtube-nocookie.com/embed/${s.videoId}`}
          allow="fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      );
    if (s.asset) {
      if (s.asset.mime.startsWith("image/"))
        return (
          <img
            className="study-media"
            src={src + "?preview=1"}
            alt={s.asset.name}
          />
        );
      if (s.asset.mime.startsWith("video/"))
        return <video className="study-media" src={src} controls />;
      return <iframe className="study-media" title={s.asset.name} src={src} />;
    }
    return (
      <>
        <h2>{s.title || "발표 자료를 기다리고 있어요"}</h2>
        <p>
          {s.body || "발표자가 자료를 선택하고 공유하면 여기에 표시됩니다."}
        </p>
      </>
    );
  }
  async function openDeck(id: string) {
    setError("");
    try {
      const d = await workflowApi<{ state: string }>(
        `${base}/programs/${session.programId}/decks/${id}`,
      );
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(
          doc,
          Uint8Array.from(atob(d.state), (c) => c.charCodeAt(0)),
        );
        setPages(
          doc
            .getArray<string>("pages")
            .toArray()
            .map((pageId) => ({
              type: "slide",
              deckId: id,
              pageId,
              ...slideFromDoc(doc, pageId),
            })),
        );
        setPreview(null);
      } finally {
        doc.destroy();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "자료 조회 실패");
    }
  }
  return (
    <section className="study-live">
      <header className="study-heading">
        <div>
          <button
            onClick={async () => {
              if (joined) {
                try {
                  await command("leave");
                } catch {}
              }
              onBack();
            }}
          >
            회차로 돌아가기
          </button>
          <h2>{session.title}</h2>
          {room && (
            <p>
              진행자 {name(room.hostId)} · 발표자 {name(room.presenterId)}
            </p>
          )}
        </div>
        <div className="study-actions">
          {room && !room.ended && joined && (
            <>
              <button aria-pressed={people} onClick={() => setPeople(!people)}>
                참여자 {room.participants.length}명
              </button>
              {room.hostId === userId && room.presenterId !== userId && (
                <button
                  disabled={busy}
                  onClick={() => void run("presenter", { userId })}
                >
                  내가 발표하기
                </button>
              )}
              {room.canReclaim && room.hostId !== userId && (
                <button disabled={busy} onClick={() => void run("reclaim")}>
                  진행권 되찾기
                </button>
              )}
              {room.hostId === userId && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "라이브를 종료하고 출석 기록을 마감할까요?",
                      )
                    )
                      void run("end");
                  }}
                >
                  라이브 종료
                </button>
              )}
            </>
          )}
        </div>
      </header>
      {error && (
        <div role="alert">
          <p>{error}</p>
          {joined && (
            <button
              disabled={busy}
              onClick={() => {
                connection.current = createLocalId();
                void run("join");
              }}
            >
              다시 입장
            </button>
          )}
        </div>
      )}
      {!joined && session.status !== "ended" && !room?.ended && (
        <div className="study-empty">
          <p>
            {session.status === "scheduled"
              ? "운영진이 시작하면 함께 발표 화면을 볼 수 있습니다."
              : "라이브에 입장해 같은 발표 화면을 보세요."}
          </p>
          <button
            className="pw-primary"
            disabled={busy || (session.status === "scheduled" && !canHost)}
            onClick={() => {
              connection.current = createLocalId();
              void run(
                session.status === "scheduled" && canHost ? "start" : "join",
              );
            }}
          >
            {session.status === "scheduled" && canHost
              ? "라이브 시작"
              : "입장하기"}
          </button>
        </div>
      )}
      {joined && room && (
        <>
          <div
            className={`study-live-layout ${people ? "" : "without-people"}`}
          >
            <div>
              {room.waiting && (
                <p className="study-notice" role="status">
                  운영진의 복귀를 기다리고 있습니다. 공유 화면은 유지됩니다.
                </p>
              )}
              <div
                className="study-live-screen"
                aria-label="모두에게 공유 중인 화면"
              >
                {renderSlide(room.shared)}
              </div>
              <p className="study-eyebrow">모두에게 공유 중인 화면</p>
            </div>
            {people && (
              <aside className="study-live-people">
                <h3>참여자</h3>
                <ul className="study-list">
                  {room.participants.map((p) => (
                    <li key={p.userId}>
                      <div>
                        <strong>
                          {p.name}
                          {p.userId === userId ? " (나)" : ""}
                        </strong>
                        <p>
                          {p.userId === room.hostId
                            ? "진행자"
                            : p.canHost
                              ? "운영진"
                              : "참여자"}
                          {p.userId === room.presenterId ? " · 발표 중" : ""}
                        </p>
                      </div>
                      {room.hostId === userId && p.userId !== userId && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run("presenter", {
                              userId:
                                p.userId === room.presenterId
                                  ? userId
                                  : p.userId,
                            })
                          }
                        >
                          {p.userId === room.presenterId
                            ? "발표권 회수"
                            : "발표권 주기"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
          {isPresenter && (
            <section className="study-material-tray">
              <button
                onClick={async () => {
                  setTray(!tray);
                  if (!tray)
                    try {
                      const d = await workflowApi<{
                        decks: { id: string; title: string }[];
                      }>(`${base}/programs/${session.programId}/decks`);
                      setDecks(d.decks);
                      await loadMaterials(session.id);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "자료 조회 실패",
                      );
                    }
                }}
              >
                발표 자료 선택
              </button>
              {tray && (
                <>
                  <p>선택한 자료는 내 화면에서 미리 본 후 공유합니다.</p>
                  <label>
                    회차 자료
                    <select
                      value={materialSession}
                      onChange={(e) => void loadMaterials(e.target.value)}
                    >
                      {materials.sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id === session.id ? "이번 회차 · " : ""}
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ul className="study-list">
                    {materials.submissions.map((v) => (
                      <li key={v.id}>
                        <div>
                          <strong>
                            {v.name} · {v.title}
                          </strong>
                          <div className="study-actions">
                            <button
                              onClick={() =>
                                setPreview({
                                  type: "submission",
                                  submissionId: v.id,
                                  title: v.title,
                                  body: v.body,
                                  bodyDocument: v.bodyDocument,
                                })
                              }
                            >
                              제출 문서 미리보기
                            </button>
                            {v.files.map((f) => (
                              <button
                                key={f.id}
                                onClick={() =>
                                  setPreview({
                                    type: "asset",
                                    submissionId: v.id,
                                    asset: f,
                                    title: f.name,
                                  })
                                }
                              >
                                {f.mime.startsWith("image/") && (
                                  <img
                                    className="study-file-thumbnail"
                                    loading="lazy"
                                    src={`/api/workspace${base}/assets/${f.id}?preview=thumbnail`}
                                    alt=""
                                  />
                                )}
                                {f.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <h3>프로그램 발표 자료</h3>
                  <div className="study-actions">
                    {decks.map((d) => (
                      <button key={d.id} onClick={() => void openDeck(d.id)}>
                        {d.title}
                      </button>
                    ))}
                  </div>
                  {!decks.length && (
                    <p>프로그램에서 발표 자료를 먼저 만들어주세요.</p>
                  )}
                  <div className="study-slide-picker">
                    {pages.map((p, i) => (
                      <button
                        key={p.pageId}
                        aria-pressed={preview?.pageId === p.pageId}
                        onClick={() => setPreview(p)}
                      >
                        {i + 1}. {p.title || "제목 없음"}
                      </button>
                    ))}
                  </div>
                  <div className="study-actions">
                    <label>
                      별도 파일 올리기
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4,video/webm"
                        disabled={busy}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setBusy(true);
                          setError("");
                          try {
                            const asset = await uploadStudyFile(
                              base,
                              file,
                              setProgress,
                            );
                            setPreview({
                              type: "asset",
                              title: asset.name,
                              asset,
                            });
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : "업로드 실패",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </label>
                    {busy && progress > 0 && <span>업로드 {progress}%</span>}
                  </div>
                  <form
                    className="study-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      try {
                        const u = new URL(youtube);
                        const id =
                          u.hostname === "youtu.be"
                            ? u.pathname.slice(1)
                            : (u.searchParams.get("v") ?? "");
                        if (
                          ![
                            "youtu.be",
                            "youtube.com",
                            "www.youtube.com",
                          ].includes(u.hostname) ||
                          u.protocol !== "https:" ||
                          !/^[a-zA-Z0-9_-]{11}$/.test(id)
                        )
                          throw Error();
                        setPreview({ type: "youtube", videoId: id, youtube });
                      } catch {
                        setError("YouTube 영상 링크를 확인해주세요.");
                      }
                    }}
                  >
                    <input
                      aria-label="YouTube 링크"
                      placeholder="YouTube 영상 링크"
                      value={youtube}
                      onChange={(e) => setYoutube(e.target.value)}
                    />
                    <button>미리보기</button>
                  </form>
                  {preview && (
                    <div className="study-preview">
                      <p className="study-eyebrow">나에게만 보이는 미리보기</p>
                      {renderSlide(preview)}
                      <button
                        className="pw-primary"
                        disabled={busy}
                        onClick={() =>
                          void run("share", {
                            deckId: preview.deckId,
                            pageId: preview.pageId,
                            submissionId: preview.submissionId,
                            assetId: preview.asset?.id,
                            youtube: preview.youtube,
                          })
                        }
                      >
                        선택한 자료 공유하기
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          <button
            onClick={() => void getReport().catch((e) => setError(e.message))}
          >
            참여 기록 보기
          </button>
        </>
      )}
      {report && (
        <section>
          <h3>{report.ended ? "출석 결과" : "참여 기록 · 진행 중"}</h3>
          <div className="study-table-scroll">
            <table className="study-table">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>참여 시간</th>
                  <th>판정</th>
                  <th>입퇴장 기록</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.userId}>
                    <td>{r.name}</td>
                    <td>
                      {Math.floor(r.seconds / 60)}분 {r.seconds % 60}초
                    </td>
                    <td>
                      {r.corrections?.at(-1)?.verdict === "present"
                        ? "출석 인정 · 운영진 보정"
                        : r.corrections?.at(-1)?.verdict === "absent"
                          ? "미인정 · 운영진 보정"
                          : r.late
                            ? "지각 · 미인정"
                            : r.eligible
                              ? "기준 충족"
                              : r.firstJoinedAt
                                ? "시간·종료 조건 미충족"
                                : "미참여"}
                    </td>
                    <td>
                      <details>
                        <summary>접속 {r.entries.length}회</summary>
                        {r.entries.map((v, i) => (
                          <p key={i}>
                            {new Date(v.joinedAt).toLocaleTimeString("ko-KR")} –{" "}
                            {new Date(v.leftAt).toLocaleTimeString("ko-KR")}
                          </p>
                        ))}
                      </details>
                      {!!r.corrections?.length && (
                        <details>
                          <summary>보정 기록 {r.corrections.length}건</summary>
                          {r.corrections.map((c) => (
                            <p key={c.id}>
                              {c.actorName} ·{" "}
                              {new Date(c.createdAt).toLocaleString("ko-KR")} ·{" "}
                              {c.verdict === "present"
                                ? "인정"
                                : c.verdict === "absent"
                                  ? "미인정"
                                  : "자동 판정으로 복원"}
                              <br />
                              {c.reason}
                            </p>
                          ))}
                        </details>
                      )}
                      {report.canAdjust && report.ended && (
                        <details>
                          <summary>판정 보정</summary>
                          <p>
                            입퇴장 원본은 유지됩니다. 자동 판정:{" "}
                            {r.eligible ? "기준 충족" : "미충족"}
                          </p>
                          <form
                            className="study-form"
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (busy) return;
                              const f = new FormData(e.currentTarget);
                              setBusy(true);
                              setError("");
                              try {
                                await workflowApi(
                                  `${url}/attendance/${r.userId}`,
                                  {
                                    verdict: f.get("verdict"),
                                    reason: f.get("reason"),
                                  },
                                );
                                await getReport();
                              } catch (e) {
                                setError(
                                  e instanceof Error ? e.message : "보정 실패",
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <label>
                              판정
                              <select name="verdict">
                                <option value="present">출석 인정</option>
                                <option value="absent">미인정</option>
                                <option value="automatic">
                                  자동 판정으로 복원
                                </option>
                              </select>
                            </label>
                            <label>
                              보정 사유
                              <textarea
                                name="reason"
                                required
                                maxLength={1000}
                              />
                            </label>
                            <button disabled={busy}>기록하고 적용</button>
                          </form>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
