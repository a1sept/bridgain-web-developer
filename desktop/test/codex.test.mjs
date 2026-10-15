import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { CodexProvider } from "../providers/codex.mjs";
function fixture() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => child.emit("exit", 0);
  const writes = [];
  child.stdin.on("data", (data) => {
    const m = JSON.parse(data.toString());
    writes.push(m);
    if (m.id && m.method) {
      let result = {};
      if (m.method === "account/read")
        result = { account: { type: "chatgpt", email: "dev@example.test" } };
      if (m.method === "thread/start" || m.method === "thread/resume")
        result = { thread: { id: "thread" } };
      if (m.method === "turn/start") result = { turn: { id: "turn" } };
      child.stdout.write(JSON.stringify({ id: m.id, result }) + "\n");
    }
  });
  const provider = new CodexProvider({
    home: "/private/test",
    spawnProcess: () => child,
    onTool: async () => ({ requests: [] }),
  });
  return { child, provider, writes };
}
test("Codex initializes, starts a read-only thread, streams text and completes a turn", async () => {
  const { child, provider, writes } = fixture();
  const events = [];
  let started;
  const bound = new Promise((resolve) => (started = resolve));
  const turn = provider.run({
    cwd: "/project",
    projectId: "linked-project",
    title: "프로젝트 조사",
    prompt: "research",
    emit: (e) => events.push(e),
    bind: async () => started(),
  });
  await bound;
  await new Promise((resolve) => setImmediate(resolve));
  child.stdout.write(
    JSON.stringify({
      method: "item/agentMessage/delta",
      params: { threadId: "thread", delta: "result" },
    }) + "\n",
  );
  child.stdout.write(
    JSON.stringify({
      method: "turn/completed",
      params: { threadId: "thread", turn: { status: "completed" } },
    }) + "\n",
  );
  assert.equal((await turn).text, "result");
  assert.equal(events[0].text, "result");
  const start = writes.find((m) => m.method === "thread/start");
  assert.equal(start.params.sandbox, "read-only");
  assert.equal(start.params.projectId, "linked-project");
  assert.deepEqual(writes.find((m) => m.method === "thread/name/set").params,
    { threadId: "thread", name: "프로젝트 조사" });
  assert.ok(
    start.params.dynamicTools.some(
      (t) => t.name === "save_draft" && t.type === "function",
    ),
  );
  assert.equal(
    writes.find((m) => m.method === "turn/start").params.sandboxPolicy.type,
    "readOnly",
  );
  provider.dispose();
});
test("Codex resumes the given thread and routes approved server tools without shell approvals", async () => {
  const { child, provider, writes } = fixture();
  await provider.start();
  provider.turns.set("thread", {
    emit: () => {},
    text: "",
    resolve: () => {},
    reject: () => {},
  });
  child.stdout.write(
    JSON.stringify({
      id: 100,
      method: "item/tool/call",
      params: { threadId: "thread", tool: "get_requests", arguments: {} },
    }) + "\n",
  );
  child.stdout.write(
    JSON.stringify({
      id: 101,
      method: "item/commandExecution/requestApproval",
      params: { threadId: "thread" },
    }) + "\n",
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes.find((m) => m.id === 100).result.success, true);
  assert.equal(writes.find((m) => m.id === 101).result.decision, "decline");
  provider.dispose();
});
test("API-key Codex account is not treated as a subscription account", async () => {
  const provider = new CodexProvider({ home: "/unused" });
  provider.start = async () => {};
  provider.rpc = async () => ({ account: { type: "apiKey" } });
  assert.equal((await provider.status()).connected, false);
});
test("authoritative completed messages replace incomplete streamed text", () => {
  const provider = new CodexProvider({ home: "/unused" });
  let final;
  provider.turns.set("thread", {
    text: "",
    emit: () => {},
    resolve: (r) => (final = r),
    reject: () => {},
  });
  provider.receive({
    method: "item/agentMessage/delta",
    params: { threadId: "thread", itemId: "m1", delta: "Hel" },
  });
  provider.receive({
    method: "item/completed",
    params: {
      threadId: "thread",
      item: { id: "m1", type: "agentMessage", text: "Hello" },
    },
  });
  provider.receive({
    method: "turn/completed",
    params: { threadId: "thread", turn: { status: "completed" } },
  });
  assert.equal(final.text, "Hello");
});
