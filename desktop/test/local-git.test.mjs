import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inspectRepository, verifyBinding, gitState, fileDiff, commitFiles, pushBranch, submissionState, cloneRepository } from "../local-git.mjs";
import { prepareTaskWorkspace } from "../task-workspace.mjs";
const exec = promisify(execFile);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bridgain-git-flow-"));
  const folder = join(root, "repo"), remote = join(root, "remote.git");
  const git = async (...args) => (await exec("git", args, { cwd: folder })).stdout.trim();
  await exec("git", ["init", "--bare", remote]); await exec("git", ["init", "-b", "main", folder]);
  await git("config", "user.name", "Local tester"); await git("config", "user.email", "test@example.test");
  await writeFile(join(folder, "file.txt"), "before\n"); await writeFile(join(folder, "other.txt"), "other\n");
  await git("add", "."); await git("commit", "-m", "initial"); await git("remote", "add", "origin", remote); await git("push", "origin", "main");
  const binding = await prepareTaskWorkspace({ folder, path: join(root, "task"), branch: "task/142", baseBranch: "main", allowedRepositories: [remote] });
  return { root, folder, remote, git, binding };
}
test("local and remote branch, selected commit, repeated push and clean PR preflight", async () => {
  const f = await fixture(), b = f.binding;
  await verifyBinding(b, [f.remote]); await pushBranch(b);
  await writeFile(join(b.path, "file.txt"), "after\n");
  await writeFile(join(b.path, "new file.txt"), "new\n");
  const initial = await gitState(b);
  assert.equal(initial.files.length, 2);
  assert.match((await fileDiff(b, "file.txt")).diff, /\+after/);
  assert.match((await fileDiff(b, "new file.txt")).diff, /\+ new/);
  await assert.rejects(submissionState(b), /커밋/);
  await commitFiles(b, ["file.txt"], "first", initial.head);
  let state = await gitState(b); assert.equal(state.files.length, 1); assert.equal(state.ahead, 1);
  await pushBranch(b); await assert.rejects(submissionState(b), /커밋/);
  await commitFiles(b, ["new file.txt"], "second", state.head); await pushBranch(b);
  state = await submissionState(b); assert.equal(state.files.length, 0); assert.equal(state.head, state.remoteSha);
  assert.equal(state.history[0].subject, "second"); assert.equal(state.history[1].subject, "first");
  assert.equal(await readFile(join(f.folder, "file.txt"), "utf8"), "before\n");
});
test("reject wrong repositories, switched branches, traversal and stale commits", async () => {
  const f = await fixture(), b = f.binding;
  await assert.rejects(inspectRepository(f.folder, ["https://github.com/other/repo"]), /origin/);
  await assert.rejects(fileDiff(b, "../secret"), /유효한/);
  await writeFile(join(b.path, "file.txt"), "changed");
  await assert.rejects(commitFiles(b, ["file.txt"], "test", "0".repeat(40)), /커밋이 변경/);
  await exec("git", ["switch", "-c", "other"], { cwd: b.path });
  await assert.rejects(verifyBinding(b, [f.remote]), /브랜치/);
});
test("symlink previews never read external contents and clone never overwrites", async () => {
  const f = await fixture(); await writeFile(join(f.root, "secret"), "do not read");
  await symlink(join(f.root, "secret"), join(f.binding.path, "link"));
  assert.doesNotMatch((await fileDiff(f.binding, "link")).diff, /do not read/);
  const url = "https://github.com/example/repo";
  await assert.rejects(cloneRepository(f.folder, url, [url]), /빈 디렉토리/);
  const empty = join(f.root, "empty"); await mkdir(empty);
  await assert.rejects(cloneRepository(empty, "file:///private", ["file:///private"]), /GitHub/);
});
test("selected commit does not include unrelated staged files; rename commits both paths", async () => {
  const f = await fixture(), b = f.binding;
  await writeFile(join(b.path, "other.txt"), "staged elsewhere");
  await exec("git", ["add", "other.txt"], { cwd: b.path });
  await exec("git", ["mv", "file.txt", "renamed.txt"], { cwd: b.path });
  const state = await gitState(b); assert.equal(state.files.find(x => x.path === "renamed.txt").originalPath, "file.txt");
  await commitFiles(b, ["renamed.txt"], "rename only", state.head);
  const contents = (await exec("git", ["show", "HEAD:other.txt"], { cwd: b.path })).stdout;
  assert.equal(contents, "other\n"); assert.ok((await gitState(b)).files.some(x => x.path === "other.txt"));
});
