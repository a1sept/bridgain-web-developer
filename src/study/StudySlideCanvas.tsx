import { createLocalId } from "../browser-id";
import StudyRemoteCursors, { type RemoteSelection } from "./StudyRemoteCursors";
import { useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
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
  rotation?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  textKey?: string;
  text: string;
  assetId?: string;
  mime?: string;
  videoId?: string;
};
export type SlideView = {
  titleStyle?: Partial<SlideElement>;
  bodyStyle?: Partial<SlideElement>;
  title?: string;
  body?: string;
  background?: string;
  elements?: SlideElement[];
};
export function slideFromDoc(doc: Y.Doc, page: string): SlideView {
  return {
    titleStyle: doc.getMap(`element:title:${page}`).toJSON(),
    bodyStyle: doc.getMap(`element:body:${page}`).toJSON(),
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
          ...m.toJSON(),
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
function textBoxes(slide: SlideView, page = ""): SlideElement[] {
  return [
    { id: `title:${page}`, type: "text", x: 6, y: 5, w: 88, h: 13, fontSize: 38.4, color: "#202431", bold: true, ...slide.titleStyle, text: slide.title ?? "", textKey: `title:${page}` },
    { id: `body:${page}`, type: "text", x: 6, y: 20, w: 88, h: 15, fontSize: 22.08, color: "#202431", ...slide.bodyStyle, text: slide.body ?? "", textKey: `body:${page}` },
    ...(slide.elements ?? []),
  ];
}
function boxStyle(e: SlideElement) {
  return { left: e.x + "%", top: e.y + "%", width: e.w + "%", height: e.h + "%",
    fontSize: `${e.fontSize / 9.6}cqw`, color: e.color, transform: `rotate(${e.rotation ?? 0}deg)`,
    fontFamily: e.fontFamily || "inherit", fontWeight: e.bold ? 650 : 400,
    fontStyle: e.italic ? "italic" : "normal", textAlign: e.align ?? "left" as const,
    lineHeight: e.textKey?.startsWith("title:") ? 1.2 : 1.4 };
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
      {textBoxes(slide).map((e) => (
        <div
          key={e.id}
          className="study-canvas-element"
          style={boxStyle(e)}
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
  toolbarTarget,
}: {
  toolbarTarget?: HTMLElement | null;
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
  const [editingText, setEditingText] = useState("");
  const [videoOpen, setVideoOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(""),
    [uploading, setUploading] = useState(false),
    [youtube, setYoutube] = useState("");
  const canvas = useRef<HTMLDivElement>(null),
    drag = useRef<{
      id: string;
      mode: "move" | "resize" | "rotate";
      rotation: number;
      centerX: number;
      centerY: number;
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
    element = textBoxes(view, page).find((e) => e.id === selected);
  function startDrag(e: PointerEvent<HTMLElement>, el: SlideElement, mode: "move" | "resize" | "rotate") {
    if (!editable) return;
    e.preventDefault();
    const r = canvas.current?.getBoundingClientRect();
    if (!r) return;
    setSelected(el.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: el.id, mode, rotation: el.rotation ?? 0,
      centerX: r.left + (el.x + el.w / 2) / 100 * r.width,
      centerY: r.top + (el.y + el.h / 2) / 100 * r.height,
      x: el.x, y: el.y, w: el.w, h: el.h, startX: e.clientX, startY: e.clientY, width: r.width, height: r.height };
  }
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
  function property(k: string, value: string | number | boolean) {
    if (!element) return;
    const m = doc.getMap(`element:${element.id}`);
    mutate(() => m.set(k, value), [m]);
  }
  const controls = (
      <div className="study-canvas-toolbar">
        <button disabled={!editable || !page} onClick={() => add("text")}>
          텍스트 추가
        </button>
        <button disabled={!editable || uploading || !page} onClick={() => fileInput.current?.click()}>이미지·파일</button>
        <label className="study-upload-label" hidden>
          이미지·영상·PDF
          <input
            ref={fileInput}
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
        <button disabled={!editable || !page} aria-expanded={videoOpen} onClick={() => setVideoOpen(v => !v)}>영상</button>
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
      {videoOpen && <div className="study-video-popover" role="group" aria-label="영상 삽입">
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
              setVideoOpen(false);
            } catch {
              onError("YouTube 링크를 확인해주세요.");
            }
          }}
        >
          영상 배치
        </button>
      <button onClick={() => setVideoOpen(false)}>닫기</button>
      </div>}
      </div>
  );
  const properties = element && (
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
          <label>회전 각도<input type="number" min="-180" max="180" step="1" disabled={!editable} value={Math.round(element.rotation ?? 0)} onChange={e => property("rotation", Math.max(-180, Math.min(180, Number(e.target.value))))} /></label>
          {element.type === "text" && (
            <>
              <label>폰트<select aria-label="폰트" disabled={!editable} value={element.fontFamily ?? ""} onChange={e => property("fontFamily", e.target.value)}>
                <option value="">기본 글꼴</option><option value="sans-serif">고딕</option><option value="serif">명조</option><option value="monospace">고정폭</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option>
              </select></label>
              <button disabled={!editable} aria-pressed={!!element.bold} onClick={() => property("bold", !element.bold)}>굵게</button>
              <button disabled={!editable} aria-pressed={!!element.italic} onClick={() => property("italic", !element.italic)}>기울임</button>
              <label>정렬<select aria-label="정렬" disabled={!editable} value={element.align ?? "left"} onChange={e => property("align", e.target.value)}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
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
              if (element.textKey) text(element.textKey, "");
              else if (i >= 0) mutate(() => a.delete(i, 1), [a]);
              setSelected("");
            }}
          >
            요소 삭제
          </button>
        </div>
      );
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
      {toolbarTarget ? createPortal(controls, toolbarTarget) : controls}
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
            } else if (a.mode === "rotate") {
              const angle = Math.atan2(e.clientY - a.centerY, e.clientX - a.centerX) - Math.atan2(a.startY - a.centerY, a.startX - a.centerX);
              m.set("rotation", ((a.rotation + angle * 180 / Math.PI + 540) % 360) - 180);
            } else {
              const r = a.rotation * Math.PI / 180;
              const px = e.clientX - a.startX, py = e.clientY - a.startY;
              m.set("w", Math.max(2, Math.min(100 - a.x, a.w + (px * Math.cos(r) + py * Math.sin(r)) / a.width * 100)));
              m.set("h", Math.max(2, Math.min(100 - a.y, a.h + (-px * Math.sin(r) + py * Math.cos(r)) / a.height * 100)));
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
        {textBoxes(view, page).map((el) => (
          <div
            key={el.id}
            className={`study-canvas-element ${selected === el.id ? "is-selected" : ""}`}
            style={boxStyle(el)}
            onClick={() => setSelected(el.id)}
          >
            {el.type === "text" ? (
              <textarea
                aria-label={el.textKey?.startsWith("title:") ? "페이지 제목" : el.textKey ? "페이지 소개" : "발표 텍스트"}
                data-study-text={el.textKey ?? `text:${el.id}`}
                disabled={!editable}
                maxLength={el.textKey?.startsWith("title:") ? 120 : 10000}
                value={el.text}
                onPointerDown={e => { if (editingText !== el.id) startDrag(e, el, "move"); }}
                onDoubleClick={e => { setEditingText(el.id); e.currentTarget.focus(); }}
                onBlur={() => setEditingText("")}
                onKeyDown={e => { if (e.key === "Escape") { setEditingText(""); e.currentTarget.blur(); } }}
                onFocus={() => setSelected(el.id)}
                onChange={(e) => text(el.textKey ?? `text:${el.id}`, e.target.value)}
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
              (["move", "resize", "rotate"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`study-element-${mode}`}
                  aria-label={mode === "move" ? "요소 이동" : mode === "rotate" ? "요소 회전" : "요소 크기 조절"}
                  onPointerDown={(e) => startDrag(e, el, mode)}
                >
                  {mode === "move" ? "이동" : mode === "rotate" ? "회전" : "크기"}
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
      {toolbarTarget ? createPortal(properties, toolbarTarget.parentElement ?? toolbarTarget) : properties}
    </div>
  );
}
