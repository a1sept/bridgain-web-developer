import { createLocalId } from "../browser-id";
import StudyRemoteCursors, { type RemoteSelection } from "./StudyRemoteCursors";
import { useRef, useState } from "react";
import * as Y from "yjs";
import { uploadStudyFile } from "./upload";
export type SlideElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  color: string;
  text: string;
  assetId?: string;
  mime?: string;
  videoId?: string;
};
export type SlideView = {
  title?: string;
  body?: string;
  background?: string;
  elements?: SlideElement[];
};
export function slideFromDoc(doc: Y.Doc, page: string): SlideView {
  return {
    title: doc.getText(`title:${page}`).toString(),
    body: doc.getText(`body:${page}`).toString(),
    background: String(
      doc.getMap(`style:${page}`).get("background") ?? "#ffffff",
    ),
    elements: doc
      .getArray<string>(`elements:${page}`)
      .toArray()
      .map((id) => {
        const m = doc.getMap(`element:${id}`);
        return {
          id,
          type: String(m.get("type")),
          x: Number(m.get("x")),
          y: Number(m.get("y")),
          w: Number(m.get("w")),
          h: Number(m.get("h")),
          fontSize: Number(m.get("fontSize") ?? 24),
          color: String(m.get("color") ?? "#202431"),
          text: doc.getText(`text:${id}`).toString(),
          assetId: m.get("assetId") as string | undefined,
          mime: m.get("mime") as string | undefined,
          videoId: m.get("videoId") as string | undefined,
        };
      }),
  };
}
function Media({ element: e, base }: { element: SlideElement; base: string }) {
  if (e.type === "youtube")
    return (
      <iframe
        title="YouTube 영상"
        src={`https://www.youtube-nocookie.com/embed/${e.videoId}`}
        allow="fullscreen"
      />
    );
  const src = `/api/workspace${base}/assets/${e.assetId}`;
  return e.mime?.startsWith("image/") ? (
    <img src={src + "?preview=1"} alt="발표 이미지" />
  ) : e.mime?.startsWith("video/") ? (
    <video src={src} controls />
  ) : (
    <iframe title="발표 PDF" src={src} />
  );
}
export function SlideDisplay({
  slide,
  base,
}: {
  slide: SlideView;
  base: string;
}) {
  return (
    <div
      className="study-canvas"
      style={{ background: slide.background || "#fff" }}
      aria-label="발표 페이지"
    >
      {slide.title && <h2 className="study-canvas-title">{slide.title}</h2>}
      {slide.body && <p className="study-canvas-body">{slide.body}</p>}
      {slide.elements?.map((e) => (
        <div
          key={e.id}
          className="study-canvas-element"
          style={{
            left: e.x + "%",
            top: e.y + "%",
            width: e.w + "%",
            height: e.h + "%",
            fontSize: `${e.fontSize / 9.6}cqw`,
            color: e.color,
          }}
        >
          {e.type === "text" ? (
            <p>{e.text}</p>
          ) : (
            <Media element={e} base={base} />
          )}
        </div>
      ))}
    </div>
  );
}
export default function StudySlideCanvas({
  doc,
  page,
  base,
  editable,
  origin,
  track,
  onError,
  onFocusField,
  presence,
}: {
  doc: Y.Doc;
  page: string;
  base: string;
  editable: boolean;
  origin: object;
  track: (types: Y.AbstractType<any>[]) => void;
  onError: (message: string) => void;
  onFocusField: (value: { field: string; start: number; end: number }) => void;
  presence: RemoteSelection[];
}) {
  const [selected, setSelected] = useState(""),
    [uploading, setUploading] = useState(false),
    [youtube, setYoutube] = useState("");
  const canvas = useRef<HTMLDivElement>(null),
    drag = useRef<{
      id: string;
      mode: "move" | "resize";
      x: number;
      y: number;
      startX: number;
      startY: number;
      w: number;
      h: number;
      width: number;
      height: number;
    } | null>(null);
  const view = slideFromDoc(doc, page),
    element = view.elements?.find((e) => e.id === selected);
  function mutate(fn: () => void, types: Y.AbstractType<any>[] = []) {
    if (!editable) return;
    track(types);
    doc.transact(fn, origin);
  }
  function text(key: string, value: string) {
    const t = doc.getText(key),
      old = t.toString();
    let a = 0,
      z = 0;
    while (a < old.length && a < value.length && old[a] === value[a]) a++;
    while (
      z < old.length - a &&
      z < value.length - a &&
      old[old.length - z - 1] === value[value.length - z - 1]
    )
      z++;
    mutate(() => {
      t.delete(a, old.length - a - z);
      t.insert(a, value.slice(a, value.length - z));
    }, [t]);
  }
  function add(type: string, extra: Record<string, string> = {}) {
    if (!editable || !page) return;
    const id = createLocalId(),
      m = doc.getMap(`element:${id}`),
      list = doc.getArray<string>(`elements:${page}`),
      t = doc.getText(`text:${id}`);
    if (list.length >= 50) {
      onError("한 페이지에는 최대 50개 요소를 추가할 수 있습니다.");
      return;
    }
    mutate(() => {
      for (const [k, v] of Object.entries({
        type,
        x: 10,
        y: 35,
        w: type === "text" ? 60 : 55,
        h: type === "text" ? 18 : 50,
        fontSize: 24,
        color: "#202431",
        ...extra,
      }))
        m.set(k, v);
      if (type === "text") t.insert(0, "텍스트를 입력하세요");
      list.push([id]);
    }, [m, list, t]);
    setSelected(id);
  }
  function property(k: string, value: string | number) {
    if (!element) return;
    const m = doc.getMap(`element:${element.id}`);
    mutate(() => m.set(k, value), [m]);
  }
  return (
    <div
      onSelect={(e) => {
        const input = e.target;
        if (
          (input instanceof HTMLInputElement ||
            input instanceof HTMLTextAreaElement) &&
          input.dataset.studyText
        )
          onFocusField({
            field: input.dataset.studyText,
            start: input.selectionStart ?? 0,
            end: input.selectionEnd ?? 0,
          });
      }}
    >
      <div className="study-canvas-toolbar">
        <button disabled={!editable || !page} onClick={() => add("text")}>
          텍스트 추가
        </button>
        <label className="study-upload-label">
          이미지·영상·PDF
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,application/pdf"
            disabled={!editable || uploading || !page}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploading(true);
              onError("");
              try {
                const a = await uploadStudyFile(base, f);
                add("asset", { assetId: a.id, mime: a.mime });
              } catch (e) {
                onError(e instanceof Error ? e.message : "업로드 실패");
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        <label>
          배경
          <input
            type="color"
            disabled={!editable}
            value={view.background}
            onChange={(e) => {
              const m = doc.getMap(`style:${page}`);
              mutate(() => m.set("background", e.target.value), [m]);
            }}
          />
        </label>
        {uploading && <span role="status">업로드 중…</span>}
      </div>
      <div className="study-search">
        <input
          aria-label="페이지에 넣을 YouTube 링크"
          placeholder="YouTube 영상 링크"
          value={youtube}
          onChange={(e) => setYoutube(e.target.value)}
        />
        <button
          disabled={!editable}
          onClick={() => {
            try {
              const u = new URL(youtube);
              const id =
                u.hostname === "youtu.be"
                  ? u.pathname.slice(1)
                  : (u.searchParams.get("v") ?? "");
              if (
                u.protocol !== "https:" ||
                !["youtu.be", "youtube.com", "www.youtube.com"].includes(
                  u.hostname,
                ) ||
                !/^[a-zA-Z0-9_-]{11}$/.test(id)
              )
                throw Error();
              add("youtube", { videoId: id });
              setYoutube("");
            } catch {
              onError("YouTube 링크를 확인해주세요.");
            }
          }}
        >
          영상 배치
        </button>
      </div>
      <div
        ref={canvas}
        className="study-canvas study-canvas-edit"
        style={{ background: view.background }}
        onPointerMove={(e) => {
          const a = drag.current;
          if (!a || !editable) return;
          const dx = ((e.clientX - a.startX) / a.width) * 100,
            dy = ((e.clientY - a.startY) / a.height) * 100,
            m = doc.getMap(`element:${a.id}`);
          mutate(() => {
            if (a.mode === "move") {
              m.set("x", Math.max(0, Math.min(100 - a.w, a.x + dx)));
              m.set("y", Math.max(0, Math.min(100 - a.h, a.y + dy)));
            } else {
              m.set("w", Math.max(2, Math.min(100 - a.x, a.w + dx)));
              m.set("h", Math.max(2, Math.min(100 - a.y, a.h + dy)));
            }
          }, [m]);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <input
          className="study-canvas-title"
          aria-label="페이지 제목"
          data-study-text={`title:${page}`}
          value={view.title}
          maxLength={120}
          disabled={!editable}
          onChange={(e) => text(`title:${page}`, e.target.value)}
        />
        <textarea
          className="study-canvas-body"
          aria-label="페이지 소개"
          data-study-text={`body:${page}`}
          value={view.body}
          maxLength={10000}
          disabled={!editable}
          onChange={(e) => text(`body:${page}`, e.target.value)}
        />
        {view.elements?.map((el) => (
          <div
            key={el.id}
            className={`study-canvas-element ${selected === el.id ? "is-selected" : ""}`}
            style={{
              left: el.x + "%",
              top: el.y + "%",
              width: el.w + "%",
              height: el.h + "%",
              fontSize: `${el.fontSize / 9.6}cqw`,
              color: el.color,
            }}
            onClick={() => setSelected(el.id)}
          >
            {el.type === "text" ? (
              <textarea
                aria-label="발표 텍스트"
                data-study-text={`text:${el.id}`}
                disabled={!editable}
                maxLength={10000}
                value={el.text}
                onFocus={() => setSelected(el.id)}
                onChange={(e) => text(`text:${el.id}`, e.target.value)}
              />
            ) : (
              <div className="study-canvas-media-edit">
                <Media element={el} base={base} />
                <button
                  className="study-media-select"
                  aria-label="미디어 선택"
                  onClick={() => setSelected(el.id)}
                />
              </div>
            )}
            {editable &&
              selected === el.id &&
              (["move", "resize"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`study-element-${mode}`}
                  aria-label={mode === "move" ? "요소 이동" : "요소 크기 조절"}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const r = canvas.current?.getBoundingClientRect();
                    if (!r) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    drag.current = {
                      id: el.id,
                      mode,
                      x: el.x,
                      y: el.y,
                      w: el.w,
                      h: el.h,
                      startX: e.clientX,
                      startY: e.clientY,
                      width: r.width,
                      height: r.height,
                    };
                  }}
                >
                  {mode === "move" ? "이동" : "크기"}
                </button>
              ))}
          </div>
        ))}
        <StudyRemoteCursors
          canvas={canvas}
          page={page}
          presence={presence}
          revision={JSON.stringify(view)}
        />
      </div>
      {element && (
        <div className="study-element-properties">
          <strong>선택한 요소</strong>
          {(["x", "y", "w", "h"] as const).map((k) => (
            <label key={k}>
              {{ x: "가로 위치", y: "세로 위치", w: "너비", h: "높이" }[k]} %
              <input
                type="number"
                min={k === "w" || k === "h" ? 2 : 0}
                max={
                  k === "x"
                    ? 100 - element.w
                    : k === "y"
                      ? 100 - element.h
                      : k === "w"
                        ? 100 - element.x
                        : 100 - element.y
                }
                disabled={!editable}
                step="0.1"
                value={Math.round(element[k] * 10) / 10}
                onChange={(e) => {
                  const n = Number(e.target.value),
                    max =
                      k === "x"
                        ? 100 - element.w
                        : k === "y"
                          ? 100 - element.h
                          : k === "w"
                            ? 100 - element.x
                            : 100 - element.y;
                  property(
                    k,
                    Math.max(k === "w" || k === "h" ? 2 : 0, Math.min(max, n)),
                  );
                }}
              />
            </label>
          ))}
          {element.type === "text" && (
            <>
              <label>
                글자 크기
                <input
                  type="number"
                  min="10"
                  max="96"
                  disabled={!editable}
                  value={element.fontSize}
                  onChange={(e) =>
                    property(
                      "fontSize",
                      Math.max(10, Math.min(96, Number(e.target.value))),
                    )
                  }
                />
              </label>
              <label>
                글자색
                <input
                  type="color"
                  disabled={!editable}
                  value={element.color}
                  onChange={(e) => property("color", e.target.value)}
                />
              </label>
            </>
          )}
          <button
            disabled={!editable}
            onClick={() => {
              const a = doc.getArray<string>(`elements:${page}`),
                i = a.toArray().indexOf(element.id);
              if (i >= 0) mutate(() => a.delete(i, 1), [a]);
              setSelected("");
            }}
          >
            요소 삭제
          </button>
        </div>
      )}
    </div>
  );
}
