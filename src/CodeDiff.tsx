export function FileStatus({ status }: { status: string }) {
  const value = status.trim();
  const kind = value.includes("U") || value === "AA" || value === "DD" ? "conflict"
    : value === "added" || value === "??" || value.includes("A") ? "added"
    : value === "removed" || value.includes("D") ? "removed" : "modified";
  const label = { added: "추가", removed: "삭제", modified: "수정", conflict: "충돌" }[kind];
  return <span className={`tc-status tc-status-${kind}`}>{label}</span>;
}

export default function CodeDiff({ diff, empty = "변경사항 없음" }: { diff: string; empty?: string }) {
  let oldLine = 0, newLine = 0, inHunk = false;
  const lines = diff.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const rows = lines.map(text => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]); newLine = Number(hunk[2]); inHunk = true;
      return { text, kind: "hunk", before: "", after: "" };
    }
    if (text.startsWith("diff --git ")) inHunk = false;
    const kind = inHunk && text.startsWith("+") ? "added"
      : inHunk && text.startsWith("-") ? "removed"
      : inHunk && text.startsWith(" ") ? "context" : "meta";
    const before = kind === "removed" || kind === "context" ? String(oldLine++) : "";
    const after = kind === "added" || kind === "context" ? String(newLine++) : "";
    return { text, kind, before, after };
  });
  const added = rows.filter(r => r.kind === "added").length;
  const removed = rows.filter(r => r.kind === "removed").length;
  if (!diff) return <p className="td-muted" role="status">{empty}</p>;
  return <div className="tc-diff-view">
    <div className="tc-diff-summary" aria-label="표시된 변경 줄 요약">
      <span className="tc-status tc-status-added">+ 추가 {added}줄</span>
      <span className="tc-status tc-status-removed">− 삭제 {removed}줄</span>
      <span>수정은 삭제된 줄과 추가된 줄로 표시됩니다.</span>
    </div>
    <div className="tc-diff-grid" role="region" aria-label="코드 변경 내용" tabIndex={0}>
      <div className="tc-diff-columns"><span>이전</span><span>이후</span><span>변경 내용</span></div>
      {rows.map((row, i) => <div className={`tc-diff-line tc-diff-${row.kind}`} key={i}>
        <span className="tc-line-number">{row.before}</span><span className="tc-line-number">{row.after}</span><code>{row.text || " "}</code>
      </div>)}
    </div>
  </div>;
}
