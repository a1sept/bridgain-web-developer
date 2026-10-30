import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
const exec = promisify(execFile);
async function git(cwd, ...args) {
  const { stdout } = await exec("git", args, { cwd, timeout: 60000, maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  return stdout.trim();
}
export function repositoryIdentity(url) {
  return String(url || "").trim().replace(/^git@([^:]+):/, "https://$1/")
    .replace(/^ssh:\/\/git@/, "https://").replace(/\.git\/?$/, "").replace(/\/$/, "");
}
export async function prepareTaskWorkspace({ folder, path, branch, baseBranch, existing, repositoryUrl, allowedRepositories }) {
  for (const name of [branch, baseBranch]) {
    if (typeof name !== "string" || name.startsWith("-") || name.length > 200)
      throw Error("브랜치 이름을 확인해주세요.");
    await git(folder, "check-ref-format", `refs/heads/${name}`);
  }
  if (branch === baseBranch || branch === "main") throw Error("기준 브랜치와 다른 업무 브랜치를 입력해주세요.");
  const root = await realpath(await git(folder, "rev-parse", "--show-toplevel"));
  if (root !== await realpath(folder)) throw Error("저장소 최상위 폴더를 연결해주세요.");
  const remote = await git(folder, "remote", "get-url", "origin");
  if (allowedRepositories && !allowedRepositories.some(url => repositoryIdentity(url) === repositoryIdentity(remote)))
    throw Error("프로젝트에 등록된 저장소의 로컬 폴더를 연결해주세요.");
  if (repositoryUrl && repositoryIdentity(remote) !== repositoryIdentity(repositoryUrl))
    throw Error("업무 저장소와 로컬 origin이 다릅니다. 프로젝트 폴더를 확인해주세요.");
  // New tasks use the user's selected checkout; old explicit worktree bindings remain valid.
  if (resolve(path) === resolve(folder)) {
    const current = await git(folder, "branch", "--show-current");
    if (current === branch) {
      if (!existing) throw Error("같은 로컬 브랜치가 있습니다. 기존 브랜치 연결을 사용해주세요.");
      return { path: folder, branch, baseBranch, repositoryUrl: repositoryIdentity(remote) };
    }
    if (await git(folder, "status", "--porcelain", "--untracked-files=all"))
      throw Error("선택한 디렉토리에 미커밋 변경사항이 있습니다. 현재 브랜치에서 커밋하거나 직접 보관한 뒤 다시 시도해주세요.");
    await git(folder, "fetch", "origin");
    let localExists = false, remoteExists = false;
    try { await git(folder, "show-ref", "--verify", `refs/heads/${branch}`); localExists = true; } catch {}
    try { await git(folder, "show-ref", "--verify", `refs/remotes/origin/${branch}`); remoteExists = true; } catch {}
    if (!existing && (localExists || remoteExists))
      throw Error("같은 브랜치가 있습니다. 기존 브랜치 연결을 사용해주세요.");
    try {
      if (existing && localExists) await git(folder, "switch", "--", branch);
      else if (existing) {
        if (!remoteExists) throw Error("연결할 원격 브랜치가 없습니다.");
        await git(folder, "switch", "-c", branch, `refs/remotes/origin/${branch}`);
      } else {
        await git(folder, "show-ref", "--verify", `refs/remotes/origin/${baseBranch}`);
        await git(folder, "switch", "-c", branch, `refs/remotes/origin/${baseBranch}`);
      }
    } catch (error) {
      throw Error(`선택한 디렉토리에서 브랜치를 전환하지 못했습니다. 다른 작업 폴더에서 사용 중인지 확인해주세요. ${error.message}`);
    }
    return { path: folder, branch, baseBranch, repositoryUrl: repositoryIdentity(remote) };
  }
  try {
    await realpath(path);
    const common = await git(path, "rev-parse", "--git-common-dir");
    const sourceCommon = await git(folder, "rev-parse", "--git-common-dir");
    if (await realpath(resolve(path, common)) !== await realpath(resolve(folder, sourceCommon)) ||
        await git(path, "branch", "--show-current") !== branch)
      throw Error("기존 업무 작업 폴더의 저장소 또는 브랜치가 다릅니다.");
    return { path, branch, baseBranch, repositoryUrl: repositoryIdentity(remote) };
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing && await git(folder, "branch", "--show-current") === branch)
    return { path: folder, branch, baseBranch, repositoryUrl: repositoryIdentity(remote) };
  await git(folder, "fetch", "origin");
  await mkdir(dirname(path), { recursive: true });
  if (existing) {
    let local = true;
    try { await git(folder, "show-ref", "--verify", `refs/heads/${branch}`); }
    catch { local = false; }
    if (local) await git(folder, "worktree", "add", "--", path, branch);
    else {
      await git(folder, "show-ref", "--verify", `refs/remotes/origin/${branch}`);
      await git(folder, "worktree", "add", "-b", branch, "--", path, `refs/remotes/origin/${branch}`);
    }
  } else {
    let remoteExists = false;
    try { await git(folder, "show-ref", "--verify", `refs/remotes/origin/${branch}`); remoteExists = true; } catch {}
    if (remoteExists) throw Error("원격에 같은 브랜치가 있습니다. 기존 브랜치 연결을 사용해주세요.");
    await git(folder, "show-ref", "--verify", `refs/remotes/origin/${baseBranch}`);
    await git(folder, "worktree", "add", "-b", branch, "--", path, `refs/remotes/origin/${baseBranch}`);
  }
  return { path, branch, baseBranch, repositoryUrl: repositoryIdentity(remote) };
}
