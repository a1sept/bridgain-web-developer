import { useEffect, useRef, useState } from "react";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  createHeadingBlockSpec,
} from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  plainDocument,
  documentText,
  documentProblem,
  type RichDocument,
} from "./document";
import type { RichTextEditorProps } from "./RichTextEditor";
const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: createHeadingBlockSpec({ allowToggleHeadings: false }),
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    quote: defaultBlockSpecs.quote,
  },
});
export default function BlockEditor({
  value,
  document,
  disabled = false,
  label = "업무 내용",
  onChange,
}: RichTextEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const [portal, setPortal] = useState<HTMLElement>();
  useEffect(() => {
    setPortal(container.current?.closest("dialog") ?? window.document.body);
  }, []);
  const initial = useRef(document ?? plainDocument(value));
  const editor = useCreateBlockNote({
    schema,
    initialContent: initial.current.blocks as never,
    dictionary: ko,
    domAttributes: {
      editor: {
        "aria-label": label,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
  });
  const [error, setError] = useState("");
  const applying = useRef(false),
    last = useRef(JSON.stringify({ value, document }));
  const valid = useRef(editor.document);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    const signature = JSON.stringify({ value, document });
    if (last.current === signature) return;
    last.current = signature;
    applying.current = true;
    try {
      editor.replaceBlocks(
        editor.document,
        (document ?? plainDocument(value)).blocks as never,
      );
      valid.current = editor.document;
      setError("");
    } finally {
      applying.current = false;
    }
  }, [value, document, editor]);
  return (
    <div
      ref={container}
      className={`rt-editor ${disabled ? "rt-disabled" : ""}`}
    >
      <BlockNoteView
        portalElements={portal ? { default: portal } : undefined}
        editor={editor}
        theme="light"
        editable={!disabled}
        onChange={() => {
          if (applying.current || disabled) return;
          const next = {
            version: 1,
            blocks: JSON.parse(JSON.stringify(editor.document)),
          } as RichDocument;
          const problem = documentProblem(next);
          if (problem) {
            setError(problem);
            applying.current = true;
            try {
              editor.replaceBlocks(editor.document, valid.current);
            } finally {
              applying.current = false;
            }
            return;
          }
          setError("");
          valid.current = editor.document;
          const text = documentText(next);
          last.current = JSON.stringify({ value: text, document: next });
          change.current(text, next);
        }}
      />
      {!disabled && (
        <small className="rt-hint">
          /로 제목·목록·체크리스트 추가 · 글자를 선택해 서식 지정
        </small>
      )}
      {error && (
        <p role="alert" className="rt-error">
          {error} 마지막 변경은 적용하지 않았습니다.
        </p>
      )}
    </div>
  );
}
