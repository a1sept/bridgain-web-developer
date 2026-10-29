import { createLocalId } from "../browser-id";
export type RichInline =
  | { type: "text"; text: string; styles: Record<string, boolean | string> }
  | { type: "link"; href: string; content: RichInline[] };
export type RichBlock = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content: RichInline[];
  children: RichBlock[];
};
export type RichDocument = { version: 1; blocks: RichBlock[] };
export const safeDocumentLink = (href: string) =>
  /^(https?:\/\/|mailto:)/i.test(href) && !/[\u0000-\u0020]/.test(href);
export function documentText(doc: RichDocument): string {
  const inline = (items: RichInline[]): string =>
    items.map((x) => (x.type === "text" ? x.text : inline(x.content))).join("");
  const blocks = (items: RichBlock[]): string[] =>
    items.flatMap((x) => [inline(x.content), ...blocks(x.children)]);
  return blocks(doc.blocks).join("\n");
}
export function plainDocument(text: string): RichDocument {
  return {
    version: 1,
    blocks: text
      .split("\n")
      .map((line) => ({
        id: createLocalId(),
        type: "paragraph",
        props: {},
        content: line ? [{ type: "text", text: line, styles: {} }] : [],
        children: [],
      })),
  };
}
export function documentProblem(doc: RichDocument, maxLength = 10000): string | null {
  if (doc.version !== 1) return "지원하지 않는 문서 버전입니다.";
  if (JSON.stringify(doc).length > 250000 || documentText(doc).length > maxLength)
    return `내용은 ${maxLength.toLocaleString("ko-KR")}자 이내로 작성해주세요.`;
  let count = 0;
  const visit = (items: RichBlock[], depth = 0): boolean =>
    depth <= 8 &&
    items.every((b) => ++count <= 200 && visit(b.children, depth + 1));
  if (!visit(doc.blocks))
    return "문서는 200개 블록, 8단계 들여쓰기까지 지원합니다.";
  const links = (items: RichInline[]): boolean =>
    items.every(
      (i) =>
        i.type === "text" || (safeDocumentLink(i.href) && links(i.content)),
    );
  const check = (items: RichBlock[]): boolean =>
    items.every((b) => links(b.content) && check(b.children));
  return check(doc.blocks)
    ? null
    : "링크는 http, https 또는 mailto 주소를 사용해주세요.";
}
