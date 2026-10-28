import { lazy, Suspense } from "react";
import type { RichDocument } from "./document";
import "./rich-text.css";
const BlockEditor = lazy(() => import("./BlockEditor"));
export type RichTextEditorProps = {
  value: string;
  document?: RichDocument | null;
  onChange: (text: string, document: RichDocument) => void;
  disabled?: boolean;
  label?: string;
};
export default function RichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense
      fallback={
        <div className="rt-loading" role="status">
          문서 편집기를 불러오는 중…
        </div>
      }
    >
      <BlockEditor {...props} />
    </Suspense>
  );
}
