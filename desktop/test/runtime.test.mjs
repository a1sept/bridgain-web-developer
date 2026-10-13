import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
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
  assert.equal(first.settings.folders[pid], cwd);
  runtime.origin = "https://other.example.test";
  const other = await runtime.owner();
  assert.notEqual(second.key, other.key);
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
