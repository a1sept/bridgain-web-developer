import { createLocalId } from "../browser-id";
import StudySlideCanvas, {
  SlideDisplay,
  slideFromDoc,
} from "./StudySlideCanvas";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { workflowApi } from "../Approvals";
import FilterBar from "../components/FilterBar";
type Deck = {
  currentUserId?: string;
  presence?: {
    userId: string;
    name: string;
    pageId: string;
    field?: string;
    start?: number;
    end?: number;
  }[];
  id: string;
  title: string;
  state: string;
  epoch: number;
  canEdit: boolean;
  canManage: boolean;
  editorIds: string[];
};
const encode = (v: Uint8Array) =>
  btoa(Array.from(v, (b) => String.fromCharCode(b)).join(""));
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export default function StudyDecks({
  base,
  members,
}: {
  base: string;
  members: { userId: string; displayName: string }[];
}) {
  const [list, setList] = useState<{
      decks: { id: string; title: string }[];
      canManage: boolean;
    }>({ decks: [], canManage: false }),
    [id, setId] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setList(await workflowApi(`${base}/decks`));
  }
  useEffect(() => {
    let active = true;
    workflowApi<typeof list>(`${base}/decks`)
      .then((v) => {
        if (active) setList(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [base]);
  if (id)
    return (
      <DeckEditor
        key={id}
        url={`${base}/decks/${id}`}
        members={members}
        onBack={() => {
          setId(null);
          void load();
        }}
      />
    );
  return (
    <section>
      <div className="study-heading">
        <h3>발표 자료</h3>
        {list.canManage && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const d = await workflowApi<Deck>(`${base}/decks`, {
                  title: "발표 자료",
                });
                setId(d.id);
              } catch (e) {
                setError(e instanceof Error ? e.message : "만들기 실패");
              } finally {
                setBusy(false);
              }
            }}
          >
            발표 자료 만들기
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <ul className="study-list">
        {list.decks.map((d) => (
          <li key={d.id}>
            <button className="study-row-link" onClick={() => setId(d.id)}>
              {d.title}
            </button>
          </li>
        ))}
      </ul>
      {!list.decks.length && <p>발표 자료를 만들어 함께 편집할 수 있습니다.</p>}
    </section>
  );
}
export function DeckEditor({
  url,
  members,
  onBack,
}: {
  url: string;
  members: { userId: string; displayName: string }[];
  onBack: () => void;
}) {
  const [draftNotice, setDraftNotice] = useState<{
    raw: string;
    epoch: number;
  } | null>(null);
  const [editorIds, setEditorIds] = useState<string[]>([]);
  const [deck, setDeck] = useState<Deck | null>(null),
    [page, setPage] = useState(""),
    [, render] = useState(0),
    [error, setError] = useState(""),
    [status, setStatus] = useState("불러오는 중"),
    [preview, setPreview] = useState(false),
    [showEditors, setShowEditors] = useState(false),
    [history, setHistory] = useState<
      { id: string; actorId: string; createdAt: string }[] | null
    >(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const focus = useRef({ field: "", start: 0, end: 0 });
  const currentPage = useRef(page);
  currentPage.current = page;
  const doc = useRef(new Y.Doc()),
    origin = useRef({}),
    undo = useRef<Y.UndoManager | null>(null),
    pending = useRef<Uint8Array[]>([]),
    epoch = useRef(0),
    editable = useRef(false),
    busy = useRef(false),
    stopped = useRef(false);
  const identity = useRef(""),
    recovered = useRef(false),
    inflight = useRef<Uint8Array[]>([]);
  function persistDraft() {
    if (!identity.current || !epoch.current) return;
    const key = `study-deck-draft:${identity.current}:${url}`;
    const updates = [...inflight.current, ...pending.current];
    try {
      if (updates.length)
        sessionStorage.setItem(
          key,
          JSON.stringify({
            epoch: epoch.current,
            update: encode(Y.mergeUpdates(updates)),
          }),
        );
      else sessionStorage.removeItem(key);
    } catch {}
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current.length || inflight.current.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    const d = doc.current;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const changed = (_u: Uint8Array, o: unknown) => {
      render((v) => v + 1);
      if (o === origin.current || o === undo.current) {
        pending.current.push(_u);
        persistDraft();
        setStatus("저장 중…");
      }
    };
    d.on("update", changed);
    async function tick() {
      if (disposed || stopped.current) return;
      busy.current = true;
      let sending: Uint8Array[] = [];
      try {
        if (epoch.current && pending.current.length) {
          sending = pending.current.splice(0);
          inflight.current = sending;
          persistDraft();
          await workflowApi(
            url,
            { epoch: epoch.current, update: encode(Y.mergeUpdates(sending)) },
            "PATCH",
          );
        }
        inflight.current = [];
        persistDraft();
        const result = await workflowApi<Deck>(url);
        if (disposed) return;
        if (epoch.current && epoch.current !== result.epoch) {
          editable.current = false;
          stopped.current = true;
          setError(
            "다른 버전으로 복원되었습니다. 현재 내용을 복사한 뒤 자료를 다시 열어주세요.",
          );
          setStatus("편집 중지");
          return;
        }
        const active = document.activeElement;
        const input =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement
            ? active
            : null;
        const key = input?.dataset.studyText;
        const selection =
          key && input
            ? {
                start: Y.createRelativePositionFromTypeIndex(
                  d.getText(key),
                  Math.min(d.getText(key).length, input.selectionStart ?? 0),
                ),
                end: Y.createRelativePositionFromTypeIndex(
                  d.getText(key),
                  Math.min(d.getText(key).length, input.selectionEnd ?? 0),
                ),
              }
            : null;
        Y.applyUpdate(d, decode(result.state), "remote");
        if (selection && input)
          requestAnimationFrame(() => {
            if (document.activeElement !== input) return;
            const start = Y.createAbsolutePositionFromRelativePosition(
                selection.start,
                d,
              ),
              end = Y.createAbsolutePositionFromRelativePosition(
                selection.end,
                d,
              );
            if (start && end) input.setSelectionRange(start.index, end.index);
          });
        epoch.current = result.epoch;
        identity.current = result.currentUserId ?? "";
        if (!recovered.current && identity.current) {
          recovered.current = true;
          try {
            const raw = sessionStorage.getItem(
              `study-deck-draft:${identity.current}:${url}`,
            );
            if (raw) {
              const draft = JSON.parse(raw);
              if (draft.epoch === result.epoch && result.canEdit)
                Y.applyUpdate(d, decode(draft.update), origin.current);
              else if (draft.epoch !== result.epoch) {
                sessionStorage.setItem(
                  `study-deck-draft:${identity.current}:${url}:conflict:${draft.epoch}`,
                  raw,
                );
                sessionStorage.removeItem(
                  `study-deck-draft:${identity.current}:${url}`,
                );
                setDraftNotice({ raw, epoch: draft.epoch });
              }
            }
          } catch {}
        }
        editable.current = result.canEdit;
        setDeck(result);
        setPage((p) =>
          d.getArray<string>("pages").toArray().includes(p)
            ? p
            : (d.getArray<string>("pages").get(0) ?? ""),
        );
        if (!undo.current)
          undo.current = new Y.UndoManager([...d.share.values()], {
            trackedOrigins: new Set([origin.current]),
          });
        else
          for (const shared of d.share.values())
            undo.current.addToScope(shared);
        if (result.canEdit)
          await workflowApi(`${url}/presence`, {
            pageId: currentPage.current,
            ...focus.current,
          });
        setStatus("저장됨");
        setError("");
      } catch (e) {
        if (sending.length) pending.current.unshift(...sending);
        inflight.current = [];
        persistDraft();
        editable.current = false;
        if (!disposed) {
          setError(e instanceof Error ? e.message : "연결이 끊겼습니다.");
          setStatus("재연결 중 · 편집 일시 중지");
        }
      } finally {
        busy.current = false;
        if (!disposed && !stopped.current) timer = setTimeout(tick, 1000);
      }
    }
    void tick();
    return () => {
      disposed = true;
      clearTimeout(timer);
      d.off("update", changed);
      undo.current?.destroy();
      undo.current = null;
    };
  }, [url]);
  const d = doc.current,
    pages = d.getArray<string>("pages").toArray();
  function add() {
    if (!editable.current) return;
    const id = createLocalId();
    const title = d.getText(`title:${id}`),
      body = d.getText(`body:${id}`);
    undo.current?.addToScope([title, body, d.getArray("pages")]);
    d.transact(() => {
      d.getArray<string>("pages").push([id]);
      title.insert(0, "새 페이지");
    }, origin.current);
    setPage(id);
  }
  async function configure(values: object) {
    try {
      await workflowApi(`${url}/configure`, values);
      setShowEditors(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  }
  return (
    <section className="study-editor">
      <div className="study-heading">
        <button
          onClick={() => {
            if (
              (!pending.current.length && !busy.current) ||
              window.confirm(
                "아직 저장 중인 변경이 있을 수 있습니다. 나갈까요?",
              )
            )
              onBack();
          }}
        >
          ← 자료
        </button>
        <span role="status">{status}</span>
        <div className="study-actions">
          <button onClick={() => setPreview((v) => !v)}>
            {preview ? "편집으로 돌아가기" : "발표 미리보기"}
          </button>
          {deck?.canManage && (
            <button
              onClick={() => {
                setEditorIds(deck.editorIds);
                setShowEditors((v) => !v);
              }}
            >
              공동 편집자
            </button>
          )}
          <button
            onClick={async () => {
              try {
                const r = await workflowApi<{
                  versions: NonNullable<typeof history>;
                  nextCursor?: string | null;
                }>(`${url}/history`);
                setHistory(history ? null : r.versions);
                setHistoryCursor(r.nextCursor ?? null);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            버전 기록
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="study-error">
          {error}
        </p>
      )}
      {draftNotice && (
        <div role="status" className="study-notice">
          이전 복원 버전의 미저장 초안은 별도로 보존했습니다. 현재 자료에 자동
          덮어쓰지 않았습니다.
          <button
            onClick={() => {
              const link = document.createElement("a"),
                href = URL.createObjectURL(
                  new Blob([draftNotice.raw], { type: "application/json" }),
                );
              link.href = href;
              link.download = `발표-복구초안-${draftNotice.epoch}.json`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(href), 1000);
            }}
          >
            복구용 초안 저장
          </button>
        </div>
      )}
      {showEditors && deck && (
        <div className="study-panel">
          <FilterBar
            filters={[
              {
                id: "editors",
                label: "공동 편집자",
                options: members.map((m) => ({
                  value: m.userId,
                  label: m.displayName,
                })),
                values: editorIds,
                multiple: true,
                onChange: setEditorIds,
              },
            ]}
            onClear={() => setEditorIds([])}
          />
          <button onClick={() => void configure({ editorIds })}>
            편집자 저장
          </button>
        </div>
      )}
      {history && (
        <ul className="study-list">
          {history.map((v) => (
            <li key={v.id}>
              <span>
                {new Date(v.createdAt).toLocaleString("ko-KR")} ·{" "}
                {members.find((m) => m.userId === v.actorId)?.displayName ??
                  "이전 회원"}
              </span>
              {deck?.canManage && (
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "이 버전으로 복원하면 공동 편집과 공유 화면의 내용도 변경됩니다. 복원할까요?",
                      )
                    )
                      void configure({ restoreVersionId: v.id });
                  }}
                >
                  복원
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {history && historyCursor && (
        <button
          disabled={loadingHistory}
          onClick={async () => {
            setLoadingHistory(true);
            try {
              const next = await workflowApi<{
                versions: NonNullable<typeof history>;
                nextCursor: string | null;
              }>(`${url}/history?cursor=${encodeURIComponent(historyCursor)}`);
              setHistory((old) =>
                old
                  ? [
                      ...old,
                      ...next.versions.filter(
                        (v) => !old.some((existing) => existing.id === v.id),
                      ),
                    ]
                  : old,
              );
              setHistoryCursor(next.nextCursor);
            } catch (e) {
              setError(String(e));
            } finally {
              setLoadingHistory(false);
            }
          }}
        >
          {loadingHistory ? "불러오는 중…" : "이전 버전 더 보기"}
        </button>
      )}
      <p className="study-editor-presence">
        {deck?.presence
          ?.map(
            (p) =>
              `${p.name}${p.pageId === page ? " · 이 페이지 편집 중" : " · 다른 페이지"}`,
          )
          .join(" / ")}
      </p>
      <div className="study-editor-layout">
        <aside aria-label="발표 페이지">
          {pages.map((id, i) => (
            <button
              key={id}
              aria-pressed={page === id}
              onClick={() => setPage(id)}
            >
              {i + 1}. {d.getText(`title:${id}`).toString() || "제목 없음"}
            </button>
          ))}
          {!preview && deck?.canEdit && (
            <button onClick={add}>페이지 추가</button>
          )}
        </aside>
        <div>
          {preview ? (
            <SlideDisplay
              slide={slideFromDoc(d, page)}
              base={url.split("/programs/")[0]}
            />
          ) : (
            <StudySlideCanvas
              doc={d}
              page={page}
              base={url.split("/programs/")[0]}
              editable={editable.current && !!page}
              origin={origin.current}
              track={(types) => undo.current?.addToScope(types)}
              onError={setError}
              onFocusField={(value) => {
                focus.current = value;
              }}
              presence={deck?.presence ?? []}
            />
          )}
          {!preview && deck?.canEdit && (
            <div className="study-actions">
              <button onClick={() => undo.current?.undo()}>내 수정 취소</button>
              <button onClick={() => undo.current?.redo()}>다시 실행</button>
              <button
                onClick={() => {
                  if (
                    editable.current &&
                    pages.length > 1 &&
                    window.confirm("이 페이지를 삭제할까요?")
                  ) {
                    d.transact(
                      () => d.getArray("pages").delete(pages.indexOf(page), 1),
                      origin.current,
                    );
                    setPage(pages.find((p) => p !== page) ?? "");
                  }
                }}
              >
                페이지 삭제
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
