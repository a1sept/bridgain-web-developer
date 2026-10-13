import { readdir, realpath, stat, readFile } from "node:fs/promises";
import { resolve, relative, sep, extname } from "node:path";
const ignored = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".aws",
  ".codex",
  ".claude",
  "secrets",
  ".ssh",
]);
const textExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".sql",
  ".md",
  ".yaml",
  ".yml",
  ".css",
  ".html",
  ".vue",
  ".svelte",
  ".py",
  ".go",
  ".java",
  ".rs",
  ".sh",
  ".txt",
  ".graphql",
  ".prisma",
  ".proto",
]);
export function allowedPath(path) {
  return !path
    .split(/[\\/]/)
    .some(
      (segment) =>
        ignored.has(segment) ||
        segment.startsWith(".env") ||
        /\.(pem|key)$/i.test(segment) ||
        /^(credentials|auth)\.json$/i.test(segment),
    );
}
async function textFile(root, path) {
  if (typeof path !== "string" || !path || !allowedPath(path))
    throw Error("이 파일은 조사 대상에 포함되지 않습니다.");
  const base = await realpath(root);
  const filename = await realpath(resolve(base, path));
  const rel = relative(base, filename);
  if (!rel || rel === ".." || rel.startsWith(".." + sep) || !allowedPath(rel))
    throw Error("선택한 프로젝트 폴더의 파일만 읽을 수 있습니다.");
  const info = await stat(filename);
  if (!info.isFile() || info.size > 300000)
    throw Error("300KB 이하의 텍스트 파일만 읽을 수 있습니다.");
  const data = await readFile(filename);
  if (data.includes(0)) throw Error("바이너리 파일은 조사할 수 없습니다.");
  return { path: rel.split(sep).join("/"), content: data.toString("utf8") };
}
export async function listProjectFiles(root) {
  root = await realpath(root);
  const files = [];
  let truncated = false;
  async function walk(dir, depth) {
    if (depth > 20) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= 2000) {
        truncated = true;
        return;
      }
      const path = relative(root, resolve(dir, entry.name));
      if (!allowedPath(path) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(resolve(dir, entry.name), depth + 1);
      else if (
        entry.isFile() &&
        (textExtensions.has(extname(entry.name)) ||
          ["Dockerfile", ".gitignore"].includes(entry.name))
      )
        files.push(path.split(sep).join("/"));
    }
  }
  const base = await realpath(root);
  await walk(base, 0);
  return { files, truncated };
}
export async function projectTool(root, name, args) {
  if (name === "list_project_files") return listProjectFiles(root);
  if (name === "read_project_file") return textFile(root, args.path);
  if (name === "search_project_code") {
    if (
      typeof args.query !== "string" ||
      !args.query.trim() ||
      args.query.length > 200
    )
      throw Error("검색어는 1~200자로 입력해주세요.");
    const { files, truncated } = await listProjectFiles(root);
    const matches = [];
    let bytes = 0;
    const max = 50;
    for (const path of files.slice(0, 300)) {
      let file;
      try {
        file = await textFile(root, path);
      } catch {
        continue;
      }
      bytes += Buffer.byteLength(file.content);
      if (bytes > 16000000) break;
      const lines = file.content.split("\n");
      for (let index = 0; index < lines.length; index++) {
        if (lines[index].toLowerCase().includes(args.query.toLowerCase()))
          matches.push({
            path,
            line: index + 1,
            text: lines[index].slice(0, 1000),
          });
        if (matches.length >= max) return { matches, truncated: true };
      }
    }
    return {
      matches,
      truncated: truncated || files.length > 300 || bytes > 16000000,
    };
  }
  throw Error("지원하지 않는 프로젝트 조사 도구입니다.");
}
