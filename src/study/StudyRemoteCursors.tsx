import { useLayoutEffect, useState, type RefObject } from "react";

export type RemoteSelection = {
  userId?: string;
  name: string;
  pageId: string;
  field?: string;
  start?: number;
  end?: number;
};
type Marker = {
  key: string;
  name: string;
  color: string;
  left: number;
  top: number;
  width: number;
  height: number;
  caret: boolean;
};
const colors = ["#6d28d9", "#0369a1", "#b45309", "#be185d", "#047857"];

// Measure native input layout rather than estimating character widths (Korean,
// wrapped lines, proportional fonts and scroll positions all matter here).
export default function StudyRemoteCursors({
  canvas,
  page,
  presence,
  revision,
}: {
  canvas: RefObject<HTMLDivElement | null>;
  page: string;
  presence: RemoteSelection[];
  revision: string;
}) {
  const [markers, setMarkers] = useState<Marker[]>([]);
  useLayoutEffect(() => {
    const root = canvas.current;
    if (!root) return;
    let disposed = false;
    function measure() {
      if (!root || disposed) return;
      const output: Marker[] = [];
      const bounds = root.getBoundingClientRect();
      const fields = [
        ...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          "[data-study-text]",
        ),
      ];
      for (const person of presence.filter(
        (p) => p.pageId === page && p.field,
      )) {
        const input = fields.find((f) => f.dataset.studyText === person.field);
        if (!input) continue;
        const rect = input.getBoundingClientRect(),
          css = getComputedStyle(input);
        const mirror = document.createElement("div");
        for (const property of [
          "font-family",
          "font-size",
          "font-weight",
          "font-style",
          "line-height",
          "letter-spacing",
          "word-spacing",
          "text-align",
          "text-indent",
          "direction",
          "padding-top",
          "padding-right",
          "padding-bottom",
          "padding-left",
          "border-top-width",
          "border-left-width",
          "border-right-width",
          "border-bottom-width",
          "box-sizing",
        ])
          mirror.style.setProperty(property, css.getPropertyValue(property));
        Object.assign(mirror.style, {
          position: "fixed",
          left: "0",
          top: "0",
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          visibility: "hidden",
          pointerEvents: "none",
          overflow: "hidden",
          borderStyle: "solid",
          whiteSpace: input.tagName === "INPUT" ? "pre" : "pre-wrap",
          overflowWrap: "break-word",
        });
        // A single-line input vertically centers its text in the content box.
        if (input.tagName === "INPUT")
          mirror.style.lineHeight = `${input.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)}px`;
        const text = document.createTextNode(input.value || "\u200b");
        mirror.append(text);
        document.body.append(mirror);
        const from = Math.max(
          0,
          Math.min(input.value.length, person.start ?? 0),
        );
        const to = Math.max(
          from,
          Math.min(input.value.length, person.end ?? from),
        );
        const range = document.createRange();
        range.setStart(text, from);
        range.setEnd(text, to);
        let boxes = [...range.getClientRects()];
        if (!boxes.length || from === to) {
          const caret = document.createElement("span");
          caret.textContent = "\u200b";
          range.collapse(true);
          range.insertNode(caret);
          boxes = [caret.getBoundingClientRect()];
        }
        const base = mirror.getBoundingClientRect();
        const identity = person.userId ?? person.name;
        const color =
          colors[
            [...identity].reduce((n, c) => n + c.charCodeAt(0), 0) %
              colors.length
          ];
        boxes.forEach((box, index) => {
          const x = box.left - base.left - input.scrollLeft,
            y = box.top - base.top - input.scrollTop;
          const left = Math.max(0, x),
            top = Math.max(0, y);
          const width =
            Math.min(rect.width, x + Math.max(from === to ? 2 : 0, box.width)) -
            left;
          const height = Math.min(rect.height, y + box.height) - top;
          if (width > 0 && height > 0)
            output.push({
              key: `${identity}:${index}`,
              name: person.name,
              color,
              left: rect.left - bounds.left + left,
              top: rect.top - bounds.top + top,
              width,
              height,
              caret: from === to,
            });
        });
        mirror.remove();
      }
      setMarkers(output);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.addEventListener("scroll", measure, true);
    document.fonts.ready.then(measure);
    return () => {
      disposed = true;
      observer.disconnect();
      root.removeEventListener("scroll", measure, true);
    };
  }, [canvas, page, presence, revision]);
  return (
    <div className="study-remote-selections" aria-hidden="true">
      {markers.map((m) => (
        <span
          key={m.key}
          className="study-remote-selection"
          style={{
            left: m.left,
            top: m.top,
            width: m.width,
            height: m.height,
            background: m.caret ? m.color : `${m.color}33`,
            borderLeft: `2px solid ${m.color}`,
          }}
        >
          <span style={{ background: m.color }}>{m.name}</span>
        </span>
      ))}
    </div>
  );
}
