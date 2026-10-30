import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath, readdir, lstat, readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { repositoryIdentity } from "./task-workspace.mjs";
const exec = promisify(execFile);
export async function git(cwd, ...args) {
  try {
    const { stdout } = await exec("git", ["--literal-pathspecs", ...args], { cwd,
      timeout: 120000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GIT_OPTIONAL_LOCKS: "0" } });
    return stdout;
  } catch (e) {
    if (e.code === "ENOENT") throw Error("Git을 설치하고 Bridgain을 다시 실행해주세요.");
    // Do not expose credential-bearing URLs or arbitrary helper output to the renderer.
    throw Error("Git 작업에 실패했습니다. GitHub 인증·권한, 작성자 설정, 원격 변경·충돌, Git 잠금 상태를 확인해주세요.");
  }
}
export async function inspectRepository(folder, allowedRepositories) {
  const path = await realpath(folder);
  const root = await realpath((await git(path, "rev-parse", "--show-toplevel")).trim());
  if (root !== path) throw Error("Git 저장소의 최상위 디렉토리를 선택해주세요.");
  const remote = repositoryIdentity((await git(path, "remote", "get-url", "origin")).trim());
  if (!allowedRepositories.some(url => repositoryIdentity(url) === remote))
    throw Error("프로젝트에 등록된 GitHub 저장소와 origin이 다릅니다.");
  return { path, repositoryUrl: remote, branch: (await git(path, "branch", "--show-current")).trim() };
}
export async function cloneRepository(folder, url, allowedRepositories) {
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url) || !allowedRepositories.includes(url))
    throw Error("프로젝트에 등록된 GitHub 저장소를 선택해주세요.");
  const path = await realpath(folder);
  if ((await readdir(path)).length) throw Error("다운로드할 빈 디렉토리를 선택해주세요. 기존 파일은 덮어쓰지 않습니다.");
  await git(path, "clone", "--", url, ".");
  return inspectRepository(path, allowedRepositories);
}
export async function verifyBinding(binding, allowedRepositories) {
  if (!binding?.path) throw Error("업무 브랜치와 로컬 작업 디렉토리를 먼저 연결해주세요.");
  const current = await inspectRepository(binding.path, allowedRepositories);
  if (current.branch !== binding.branch || current.repositoryUrl !== binding.repositoryUrl)
    throw Error("로컬 브랜치 또는 저장소가 변경되었습니다. 연결된 업무 브랜치로 돌아와주세요.");
  const pushUrl = repositoryIdentity((await git(binding.path, "remote", "get-url", "--push", "origin")).trim());
  if (pushUrl !== binding.repositoryUrl) throw Error("origin의 push 대상 저장소가 업무 저장소와 다릅니다.");
  return current;
}
export function parseStatus(output) {
  const records = output.split("\0"); const files = [];
  for (let i = 0; i < records.length; i++) {
    const row = records[i]; if (!row) continue;
    const status = row.slice(0, 2), path = row.slice(3);
    const originalPath = /[RC]/.test(status) ? records[++i] : undefined;
    files.push({ path, status, ...(originalPath ? { originalPath } : {}) });
  }
  return files;
}
export async function gitState(binding) {
  const folder = binding.path;
  const files = parseStatus(await git(folder, "status", "--porcelain=v1", "-z", "--untracked-files=all"));
  const head = (await git(folder, "rev-parse", "HEAD")).trim();
  let ahead = null, behind = null, remoteSha = null;
  try {
    remoteSha = (await git(folder, "rev-parse", `refs/remotes/origin/${binding.branch}`)).trim();
    [behind, ahead] = (await git(folder, "rev-list", "--left-right", "--count", `refs/remotes/origin/${binding.branch}...HEAD`)).trim().split(/\s+/).map(Number);
  } catch {}
  const history = (await git(folder, "log", "-20", "--format=%H%x00%s%x00%an%x00%aI")).trim().split("\n").filter(Boolean)
    .map(row => { const [sha, subject, author, date] = row.split("\0"); return { sha, subject, author, date }; });
  return { files, head, ahead, behind, remoteSha, history, checkedAt: new Date().toISOString() };
}
function filePath(value) {
  if (typeof value !== "string" || !value || value.includes("\0") || isAbsolute(value) || value.split(/[\\/]/).includes("..") || value.split(/[\\/]/).includes(".git"))
    throw Error("유효한 저장소 파일을 선택해주세요.");
  return value;
}
export async function fileDiff(binding, path) {
  path = filePath(path);
  const files = parseStatus(await git(binding.path, "status", "--porcelain=v1", "-z", "--untracked-files=all"));
  const file = files.find(f => f.path === path);
  if (!file) return { diff: "현재 변경사항이 없습니다." };
  if (file.status === "??") {
    const target = resolve(binding.path, path);
    const stat = await lstat(target);
    if (!stat.isFile() || stat.size > 256 * 1024) return { diff: "바이너리·심볼릭 링크 또는 큰 파일은 미리보기를 제공하지 않습니다." };
    const actual = await realpath(target), rel = relative(await realpath(binding.path), actual);
    if (rel.startsWith("..") || isAbsolute(rel)) throw Error("작업 디렉토리 밖의 파일입니다.");
    const data = await readFile(actual);
    return { diff: data.includes(0) ? "바이너리 파일" : data.toString("utf8").split("\n").map(l => "+ " + l).join("\n") };
  }
  return { diff: (await git(binding.path, "diff", "--no-ext-diff", "--no-textconv", "HEAD", "--", path, ...(file.originalPath ? [file.originalPath] : []))).slice(0, 256 * 1024) };
}
export async function commitFiles(binding, paths, message, expectedHead) {
  const state = await gitState(binding);
  if (state.head !== expectedHead) throw Error("커밋이 변경되었습니다. 최신 상태를 확인해주세요.");
  if (typeof message !== "string" || !message.trim() || message.length > 2000) throw Error("커밋 메시지를 입력해주세요 (최대 2,000자).");
  if (!Array.isArray(paths) || !paths.length || paths.length > 500) throw Error("커밋할 파일을 선택해주세요 (최대 500개).");
  const selected = [...new Set(paths.map(filePath))];
  for (const path of [...selected]) {
    const file = state.files.find(f => f.path === path);
    if (!file || /U/.test(file.status) || ["AA", "DD"].includes(file.status)) throw Error("변경 파일을 다시 확인하고 충돌을 먼저 해결해주세요.");
    if (file.originalPath && !selected.includes(file.originalPath)) selected.push(file.originalPath);
  }
  await git(binding.path, "add", "--", ...paths.map(filePath));
  await git(binding.path, "commit", "--only", "-m", message.trim(), "--", ...selected);
  return gitState(binding);
}
export async function pushBranch(binding) {
  if (binding.branch === binding.baseBranch || binding.branch === "main") throw Error("업무 브랜치에서만 push할 수 있습니다.");
  await git(binding.path, "push", "--set-upstream", "origin", `HEAD:refs/heads/${binding.branch}`);
  return gitState(binding);
}
export async function submissionState(binding) {
  await git(binding.path, "fetch", "origin");
  const state = await gitState(binding);
  if (state.files.length || state.remoteSha !== state.head || state.ahead || state.behind)
    throw Error("변경사항을 모두 커밋·푸시하고 원격 브랜치와 동기화해주세요.");
  return state;
}
