import { Fragment, createElement, type ReactNode } from "react";
import type { RichDocument, RichBlock, RichInline } from "./document";
import { safeDocumentLink } from "./document";
import "./rich-text.css";
const colors: Record<string, string> = {
  gray: "#667085",
  brown: "#935f3a",
  red: "#c0353a",
  orange: "#b85d1b",
  yellow: "#947000",
  green: "#267444",
  blue: "#2b5dc1",
  purple: "#7951b0",
  pink: "#b63d79",
};
function inline(items: RichInline[]): ReactNode {
  return items.map((x, i) => {
    if (x.type === "link")
      return safeDocumentLink(x.href) ? (
        <a key={i} href={x.href} target="_blank" rel="noreferrer">
          {inline(x.content)}
        </a>
      ) : (
        <Fragment key={i}>{inline(x.content)}</Fragment>
      );
    let text: ReactNode = x.text;
    if (x.styles.bold) text = <strong>{text}</strong>;
    if (x.styles.italic) text = <em>{text}</em>;
    if (x.styles.underline) text = <u>{text}</u>;
    if (x.styles.strike) text = <s>{text}</s>;
    if (x.styles.code) text = <code>{text}</code>;
    return (
      <span
        key={i}
        style={{
          color: colors[String(x.styles.textColor)],
          backgroundColor: colors[String(x.styles.backgroundColor)]
            ? `${colors[String(x.styles.backgroundColor)]}20`
            : undefined,
        }}
      >
        {text}
      </span>
    );
  });
}
function blocks(items: RichBlock[]): ReactNode {
  let number = 0;
  return items.map((b) => {
    number =
      b.type === "numberedListItem"
        ? typeof b.props.start === "number"
          ? b.props.start
          : number + 1
        : 0;
    const content = inline(b.content);
    const children =
      b.children.length > 0 ? (
        <div className="rt-indent">{blocks(b.children)}</div>
      ) : null;
    const wrap = (node: ReactNode) => (
      <div key={b.id}>
        {node}
        {children}
      </div>
    );
    const style = {
      textAlign: ["left", "center", "right", "justify"].includes(
        String(b.props.textAlignment),
      )
        ? (b.props.textAlignment as "left")
        : undefined,
      color: colors[String(b.props.textColor)],
      backgroundColor: colors[String(b.props.backgroundColor)]
        ? `${colors[String(b.props.backgroundColor)]}20`
        : undefined,
    };
    if (b.type === "heading") {
      const level = Number(b.props.level) || 1;
      return wrap(
        createElement(
          `h${Math.min(6, Math.max(1, level))}`,
          { style },
          content,
        ),
      );
    }
    if (b.type === "quote")
      return wrap(
        <blockquote key={b.id} style={style}>
          {content}
        </blockquote>,
      );
    if (b.type === "bulletListItem")
      return wrap(
        <ul key={b.id} style={style}>
          <li>{content}</li>
        </ul>,
      );
    if (b.type === "numberedListItem")
      return wrap(
        <ol key={b.id} start={number} style={style}>
          <li>{content}</li>
        </ol>,
      );
    if (b.type === "checkListItem")
      return wrap(
        <div className="rt-check" key={b.id} style={style}>
          <span aria-label={b.props.checked ? "체크됨" : "체크 안 됨"}>
            {b.props.checked ? "☑" : "☐"}
          </span>
          <div>{content}</div>
        </div>,
      );
    return wrap(
      <p key={b.id} style={style}>
        {content || <br />}
      </p>,
    );
  });
}
export default function RichTextContent({
  value,
  document,
}: {
  value: string;
  document?: RichDocument | null;
}) {
  return (
    <div className="rt-content">
      {document?.version === 1 ? blocks(document.blocks) : <p>{value}</p>}
    </div>
  );
}
