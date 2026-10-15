import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DesktopRuntime } from "../runtime.mjs";
const pid = "abcdef01-1234-4321-abcd-123456789012",
  sid = "abcdef02-1234-4321-abcd-123456789012";
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "bridgain-ai-test-"));
  const cwd = join(directory, "project");
  await mkdir(cwd);
  let user = { id: "dev1", accountType: "team" };
  const calls = [],
    events = [];
  const runtime = new DesktopRuntime({
    directory,
    api: async (path, body) => {
      calls.push({ path, body });
      if (path === "/api/auth/me") return { user };
      if (path.endsWith("/" + sid))
        return {
          session: { provider: "codex", localSessionId: null },
          requests: [],
        };
      return {};
    },
    chooseFolder: async () => cwd,
    emit: (e) => events.push(e),
    openAuth: async () => {},
  });
  runtime.origin = "https://developer.example.test";
  await runtime.load();
  return { runtime, calls, events, cwd, setUser: (u) => (user = u) };
}
test("AI stays optional: an unconnected developer has no provider process", async () => {
  const { runtime } = await fixture();
  runtime.provider = () => {
    throw Error("Unexpected provider startup");
  };
  const state = await runtime.state();
  assert.equal(state.providers.codex.connected, false);
  assert.equal(state.providers.claude.connected, false);
});
test("local folders and provider enablement are separated by server and developer identity", async () => {
  const { runtime, cwd, setUser } = await fixture();
  await runtime.folder(pid);
  const first = await runtime.owner();
  first.settings.enabled.codex = true;
  setUser({ id: "dev2", accountType: "team" });
  const second = await runtime.owner();
  assert.notEqual(first.key, second.key);
  assert.equal(second.settings.folders[pid], undefined);
  assert.equal(first.settings.folders[pid], await realpath(cwd));
  runtime.origin = "https://other.example.test";
  const other = await runtime.owner();
  assert.notEqual(second.key, other.key);
});
test("each project keeps its own folder, including after reload and disconnect", async () => {
  const { runtime, cwd } = await fixture();
  const otherPid = "abcdef03-1234-4321-abcd-123456789012";
  const otherFolder = join(cwd, "other-project");
  await mkdir(otherFolder);
  await runtime.folder(pid);
  runtime.chooseFolder = async () => otherFolder;
  await runtime.folder(otherPid);
  await runtime.load();
  let state = await runtime.state();
  assert.equal(state.folders[pid], await realpath(cwd));
  assert.equal(state.folders[otherPid], await realpath(otherFolder));
  runtime.chooseFolder = async () => null;
  await runtime.folder(pid);
  assert.equal((await runtime.state()).folders[pid], await realpath(cwd));
  await runtime.clearFolder(pid);
  await runtime.load();
  state = await runtime.state();
  assert.equal(state.folders[pid], undefined);
  assert.equal(state.folders[otherPid], await realpath(otherFolder));
});
test("an AI tool remains bound to its original user, project and session", async () => {
  const { runtime, calls, setUser } = await fixture();
  const owner = await runtime.owner();
  const run = {
    id: sid,
    owner: owner.key,
    base: `/api/workspace/projects/${pid}/ai/sessions/${sid}`,
  };
  runtime.runs.set(sid, run);
  await runtime.callTool(run, "get_requests", {});
  assert.equal(calls.at(-1).path, run.base + "/tools");
  await assert.rejects(runtime.callTool(run, "delete_project", {}));
  setUser({ id: "another", accountType: "team" });
  await assert.rejects(
    runtime.callTool(run, "save_draft", { kind: "note" }),
    /계정이 변경/,
  );
});
test("investigation requires a connected subscription and an explicitly selected folder", async () => {
  const { runtime } = await fixture();
  await assert.rejects(runtime.run(pid, sid, "research"), /먼저 연결/);
  const owner = await runtime.owner();
  owner.settings.enabled.codex = true;
  await assert.rejects(runtime.run(pid, sid, "research"), /로컬 폴더/);
});
test("same-session double starts are blocked during async preflight", async () => {
  const { runtime } = await fixture();
  let release;
  runtime.prepareRun = () => new Promise((resolve) => (release = resolve));
  const first = runtime.run(pid, sid, "first");
  await assert.rejects(runtime.run(pid, sid, "second"), /이미 조사 중/);
  release({ started: true });
  await first;
  assert.equal(runtime.starting.size, 0);
});

test("a rename arriving during sync gets a fresh snapshot after the pending sync", async () => {
  const { runtime } = await fixture();
  const owner = await runtime.owner();
  owner.settings.enabled.codex = true;
  const api = runtime.api;
  let name = "before", snapshots = 0, release, started;
  const inCreate = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  runtime.api = async (path, ...args) => {
    if (path === "/api/workspace") {
      snapshots++;
      return { projects: [{ id: pid, name, canManage: true }] };
    }
    return api(path, ...args);
  };
  let stored;
  runtime.provider = async () => ({
    start: async () => {},
    rpc: async (method, params) => {
      if (method === "project/create") {
        started();
        await gate;
        stored = { id: "codex-project", ...params };
      } else if (method === "project/update") Object.assign(stored, params);
      return { project: stored };
    },
  });
  const first = runtime.syncProjects();
  await inCreate;
  name = "after";
  const second = runtime.syncProjects();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(snapshots, 1);
  release();
  const results = await Promise.all([first, second]);
  assert.equal(snapshots, 2);
  assert.equal(stored.name, "after");
  assert.equal(owner.settings.codexProjects[pid].name, "after");
  assert.ok(results.every(result => result.synced === 1 && !result.error));
  assert.equal(runtime.projectSyncs.size, 0);
});

test("opening Codex requires an owned Codex session and a valid local thread ID", async () => {
  const { runtime, setUser } = await fixture();
  const owner = await runtime.owner();
  const localId = "abcdef04-1234-4321-abcd-123456789012";
  owner.settings.localSessions[sid] = { pid, localId };
  const api = runtime.api;
  const opened = [];
  let session = { provider: "codex", localSessionId: localId };
  runtime.openCodexUrl = async url => opened.push(url);
  runtime.api = async (path, ...args) => path.endsWith(`/${sid}`) ? { session } : api(path, ...args);
  await runtime.openCodex(sid);
  assert.deepEqual(opened, [`codex://threads/${localId}`]);
  session = { provider: "claude", localSessionId: localId };
  await assert.rejects(runtime.openCodex(sid), /연결을 확인/);
  session = { provider: "codex", localSessionId: "different-thread" };
  await assert.rejects(runtime.openCodex(sid), /연결을 확인/);
  owner.settings.localSessions[sid].localId = "bad/path?prompt=injected";
  session.localSessionId = "bad/path?prompt=injected";
  await assert.rejects(runtime.openCodex(sid));
  setUser({ id: "other-developer", accountType: "team" });
  await assert.rejects(runtime.openCodex(sid), /이 컴퓨터에서 연결/);
  assert.equal(opened.length, 1);
});

test("failed sync cannot pass an unverified saved project ID into a run", async () => {
  const { runtime, cwd } = await fixture();
  const owner = await runtime.owner();
  owner.settings.enabled.codex = true;
  owner.settings.folders[pid] = cwd;
  owner.settings.codexProjects = { [pid]: { projectId: "foreign-project" } };
  runtime.syncProjects = async () => ({ synced: 0, error: "ownership mismatch" });
  runtime.provider = async () => ({ status: async () => ({ connected: true }) });
  let prepared;
  runtime.execute = async run => { prepared = run; };
  await runtime.prepareRun(pid, sid, "research");
  assert.equal(prepared.codexProjectId, undefined);
});
