import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prepareTaskWorkspace } from "../task-workspace.mjs";
import { DesktopRuntime } from "../runtime.mjs";
const exec = promisify(execFile);
const pid = "abcdef01-1234-4321-abcd-123456789012", id = "abcdef02-1234-4321-abcd-123456789012";
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bridgain-worktree-"));
  const folder = join(root, "repo"), remote = join(root, "remote.git"), path = join(root, "work", "task");
  const git = async (...args) => (await exec("git", args, { cwd: folder })).stdout.trim();
  await exec("git", ["init", "--bare", remote]);
  await exec("git", ["init", "-b", "main", folder]);
  await git("config", "user.email", "test@example.com"); await git("config", "user.name", "Test");
  await writeFile(join(folder, "file.txt"), "original");
  await git("add", "."); await git("commit", "-m", "init");
  await git("remote", "add", "origin", remote); await git("push", "origin", "main");
  return { root, folder, path, git, remote, branch: "task/142", baseBranch: "main" };
}
test("creates isolated branch from remote main and preserves dirty checkout; retry reuses it", async () => {
  const f = await fixture();
  await writeFile(join(f.folder, "file.txt"), "unsaved work");
  const result = await prepareTaskWorkspace(f);
  assert.equal(await readFile(join(result.path, "file.txt"), "utf8"), "original");
  assert.equal(await readFile(join(f.folder, "file.txt"), "utf8"), "unsaved work");
  assert.equal(await f.git("branch", "--show-current"), "main");
  assert.deepEqual(await prepareTaskWorkspace(f), result);
  await assert.rejects(prepareTaskWorkspace({ ...f, branch: "task/other" }), /다릅니다/);
});
test("existing branch attachment and invalid/repository-mismatched inputs", async () => {
  const f = await fixture(); await f.git("branch", "existing");
  await prepareTaskWorkspace({ ...f, branch: "existing", existing: true });
  await assert.rejects(prepareTaskWorkspace({ ...f, branch: "--bad" }), /이름/);
  await assert.rejects(prepareTaskWorkspace({ ...f, branch: "main" }), /다른 업무/);
  await assert.rejects(prepareTaskWorkspace({ ...f, repositoryUrl: "https://github.com/other/repo" }), /origin이 다릅니다/);
});
test("server failure retains prepared worktree; retry syncs status only after preparation", async () => {
  const f = await fixture(); let fail = true; const patches = [];
  const task = { id, version: "v1", status: "todo", assignees: [{ userId: "dev" }], repositoryUrl: f.remote };
  const runtime = new DesktopRuntime({ directory: join(f.root, "app"), api: async (url, body) => {
    if (url === "/api/auth/me") return { user: { id: "dev", accountType: "team" } };
    if (url === "/api/workspace") return { projects: [{ id: pid, repositoryUrls: [f.remote] }] };
    if (url.endsWith("/tasks")) return { tasks: [task] };
    if (body) { patches.push(body); if (fail) throw Error("offline"); }
    return {};
  } });
  await runtime.load(); const owner = await runtime.owner(); owner.settings.folders[pid] = f.folder;
  const options = { branch: f.branch, baseBranch: f.baseBranch, existing: false };
  await assert.rejects(runtime.taskWorkspace(pid, id, "start", options), /기존 폴더를 재사용/);
  const prepared = (await runtime.taskWorkspace(pid, id)).binding;
  assert.equal(await readFile(join(prepared.path, "file.txt"), "utf8"), "original");
  fail = false;
  assert.deepEqual((await runtime.taskWorkspace(pid, id, "start", options)).binding, prepared);
  assert.equal(patches.at(-1).status, "in_progress");
  task.assignees = [];
  await assert.rejects(runtime.taskWorkspace(pid, id, "start", options), /담당자만/);
});

test("attaches the selected checkout when the existing branch is already open", async () => {
  const f = await fixture();
  await f.git("switch", "-c", "task/current");
  await writeFile(join(f.folder, "file.txt"), "in progress");
  const result = await prepareTaskWorkspace({ ...f, branch: "task/current", existing: true });
  assert.equal(result.path, f.folder);
  assert.equal(await readFile(join(f.folder, "file.txt"), "utf8"), "in progress");
});
