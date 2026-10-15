import { test } from "node:test";
import assert from "node:assert/strict";
import { syncCodexProjects } from "../codex-project-sync.mjs";

function fixture() {
  const calls = [], records = new Map(), keys = new Map();
  const owner = { key: "owner-a", settings: { folders: {}, localSessions: {} } };
  let saves = 0;
  const provider = {
    async start() {},
    async rpc(method, params) {
      calls.push({ method, params });
      if (method === "project/create") {
        let id = keys.get(params.idempotencyKey);
        if (!id) {
          id = `project-${records.size + 1}`;
          records.set(id, { id, ...params }); keys.set(params.idempotencyKey, id);
        }
        return { project: records.get(id) };
      }
      if (method === "project/read") {
        if (!records.has(params.projectId)) throw Error("project missing");
        return { project: records.get(params.projectId) };
      }
      if (method === "project/update") {
        Object.assign(records.get(params.projectId), params);
        return { project: records.get(params.projectId) };
      }
      if (method === "thread/read") return { thread: { id: params.threadId } };
      return {};
    },
  };
  const args = { provider, owner, assertOwner: async (key) => assert.equal(key, owner.key), save: async () => { saves++; } };
  return { args, calls, records, owner, provider, get saves() { return saves; } };
}
const project = { id: "p1", name: "밥추천", canManage: true };

test("creates once, deduplicates input, and updates a renamed project with its folder", async () => {
  const f = fixture();
  assert.deepEqual(await syncCodexProjects({ ...f.args, projects: [project, project] }), { synced: 1 });
  f.owner.settings.folders.p1 = "/workspace/food";
  await syncCodexProjects({ ...f.args, projects: [{ ...project, name: "저녁추천" }] });
  assert.equal(f.records.size, 1);
  assert.equal(f.records.get("project-1").name, "저녁추천");
  assert.deepEqual(f.records.get("project-1").roots, [{ path: "/workspace/food" }]);
  assert.equal(f.calls.filter(c => c.method === "project/create").length, 1);
  await syncCodexProjects({ ...f.args, projects: [{ ...project, name: "저녁추천" }] });
  assert.equal(f.calls.filter(c => c.method === "project/update").length, 1);
});

test("idempotency recovers a missing local mapping without duplicate projects", async () => {
  const f = fixture();
  await syncCodexProjects({ ...f.args, projects: [project] });
  delete f.owner.settings.codexProjects.p1;
  await syncCodexProjects({ ...f.args, projects: [project] });
  assert.equal(f.records.size, 1);
});

test("another owner gets a distinct project and cannot update a foreign mapping", async () => {
  const f = fixture();
  await syncCodexProjects({ ...f.args, projects: [project] });
  const other = { key: "owner-b", settings: { folders: {}, localSessions: {} } };
  const args = { ...f.args, owner: other, assertOwner: async key => assert.equal(key, other.key), projects: [project] };
  await syncCodexProjects(args);
  assert.equal(f.records.size, 2);
  other.settings.codexProjects.p1.projectId = "project-1";
  const result = await syncCodexProjects(args);
  assert.match(result.error, /일치하지/);
  assert.equal(result.synced, 0);
  assert.equal(f.calls.filter(c => c.method === "project/update").length, 0);
});

test("filters inaccessible projects and only attaches verified matching local sessions", async () => {
  const f = fixture();
  f.owner.settings.localSessions = { a: { pid: "p1", localId: "thread1" }, b: { pid: "p2", localId: "thread2" }, c: { pid: "p1", localId: "claude1", provider: "claude" } };
  await syncCodexProjects({ ...f.args, projects: [project, { id: "p2", name: "private", canManage: false }] });
  assert.equal(f.records.size, 1);
  assert.deepEqual(f.calls.filter(c => c.method === "thread/metadata/update").map(c => c.params), [{ threadId: "thread1", projectId: "project-1" }]);
});

test("partial failures are reported without creating replacements or attaching unreadable threads", async () => {
  const f = fixture();
  f.owner.settings.codexProjects = { p1: { projectId: "missing" } };
  f.owner.settings.localSessions = { a: { pid: "p2", localId: "missing-thread" } };
  const rpc = f.provider.rpc;
  f.provider.rpc = async (method, params) => {
    if (method === "thread/read") throw Error("thread unavailable");
    return rpc(method, params);
  };
  const result = await syncCodexProjects({ ...f.args, projects: [project, { ...project, id: "p2" }] });
  assert.equal(result.synced, 1);
  assert.match(result.error, /project missing/);
  assert.match(result.error, /thread unavailable/);
  assert.equal(f.calls.filter(c => c.method === "project/create").length, 1);
  assert.equal(f.calls.filter(c => c.method === "thread/metadata/update").length, 0);
});

test("owner changes stop RPC mutations and save failures leave mapping recoverable", async () => {
  const f = fixture();
  const result = await syncCodexProjects({ ...f.args, projects: [project], assertOwner: async () => { throw Error("owner changed"); } });
  assert.match(result.error, /owner changed/);
  assert.equal(f.calls.length, 0);
  const failed = await syncCodexProjects({ ...f.args, projects: [project], save: async () => { throw Error("disk full"); } });
  assert.match(failed.error, /disk full/);
  assert.equal(f.owner.settings.codexProjects.p1, undefined);
  await syncCodexProjects({ ...f.args, projects: [project] });
  assert.equal(f.records.size, 1);
});
