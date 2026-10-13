import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { ClaudeProvider } from "../providers/claude.mjs";
function childFixture() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = (signal) => child.emit("exit", signal === "SIGTERM" ? 143 : 0);
  return child;
}
test("Claude streams partial messages and returns its final result in a bound session", async () => {
  const child = childFixture();
  let spawned;
  const ready = new Promise((resolve) => (spawned = resolve));
  const provider = new ClaudeProvider({
    configDir: "/private/claude",
    spawnProcess: (command, args) => {
      assert.equal(command, "claude");
      assert.ok(args.includes("--session-id"));
      spawned();
      return child;
    },
  });
  const events = [];
  const promise = provider.run({
    cwd: "/project",
    prompt: "research",
    emit: (e) => events.push(e),
    bind: async () => {},
    mcpConfig: { mcpServers: {} },
  });
  await ready;
  child.stdout.write(
    JSON.stringify({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "Hello" } },
    }) + "\n",
  );
  child.stdout.write(
    JSON.stringify({ type: "result", result: "Hello", is_error: false }) + "\n",
  );
  child.emit("exit", 0);
  const result = await promise;
  assert.equal(result.text, "Hello");
  assert.match(result.localSessionId, /^[a-f0-9-]{36}$/);
  assert.equal(events[0].text, "Hello");
});
test("Claude failure cannot be reported as a completed assistant response", async () => {
  const child = childFixture();
  let spawned;
  const ready = new Promise((resolve) => (spawned = resolve));
  const provider = new ClaudeProvider({
    configDir: "/private/claude",
    spawnProcess: () => {
      spawned();
      return child;
    },
  });
  const promise = provider.run({
    cwd: "/project",
    prompt: "research",
    emit: () => {},
    bind: async () => {},
    mcpConfig: { mcpServers: {} },
  });
  await ready;
  child.stdout.write(
    JSON.stringify({ type: "result", is_error: true, result: "usage limit" }) +
      "\n",
  );
  child.emit("exit", 1);
  await assert.rejects(promise, /usage limit/);
});
test("Claude API-key and third-party authentication cannot masquerade as a subscription", async () => {
  const provider = new ClaudeProvider({ configDir: "/private/claude" });
  for (const method of ["api_key", "api_key_helper", "third_party"]) {
    provider.command = async () => ({
      code: 0,
      out: JSON.stringify({ loggedIn: true, authMethod: method }),
    });
    assert.equal((await provider.status()).connected, false);
  }
  provider.command = async () => ({
    code: 0,
    out: JSON.stringify({
      loggedIn: true,
      authMethod: "claude.ai",
      email: "dev@example.test",
    }),
  });
  assert.equal((await provider.status()).connected, true);
});
