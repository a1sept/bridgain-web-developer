import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serverOrigin,
  authUrl,
  subscriptionEnvironment,
  identifier,
  researchPrompt,
} from "../security.mjs";
import { claudeArguments } from "../providers/claude.mjs";
test("server connection only permits HTTPS or loopback HTTP with a bare origin", () => {
  assert.equal(
    serverOrigin("https://developer.example.test"),
    "https://developer.example.test",
  );
  assert.equal(
    serverOrigin("http://localhost:15174"),
    "http://localhost:15174",
  );
  for (const url of [
    "http://example.test",
    "file:///etc/passwd",
    "https://user:pass@example.test",
    "https://example.test/api",
    "https://example.test/?token=secret",
    "javascript:alert(1)",
  ])
    assert.throws(() => serverOrigin(url));
});
test("provider processes cannot inherit metered API keys or alternate API providers", () => {
  const env = subscriptionEnvironment("claude", {
    PATH: "/usr/bin",
    ANTHROPIC_API_KEY: "secret",
    OPENAI_API_KEY: "secret",
    CLAUDE_CODE_OAUTH_TOKEN: "secret",
    NODE_OPTIONS: "--require malicious.js",
    CLAUDE_CODE_USE_BEDROCK: "1",
  });
  assert.deepEqual(env, { PATH: "/usr/bin" });
});
test("browser sign-in only opens exact official hostnames", () => {
  assert.equal(
    authUrl("https://auth.openai.com/codex/device", "codex"),
    "https://auth.openai.com/codex/device",
  );
  assert.throws(() =>
    authUrl("https://auth.openai.com.evil.test/login", "codex"),
  );
  assert.throws(() => authUrl("https://auth.openai.com@evil.test", "codex"));
  assert.throws(() => authUrl("file:///tmp/login", "claude"));
});
test("Claude investigations use read tools and explicit session IDs without permission bypass", () => {
  const args = claudeArguments({
    sessionId: "new",
    mcpConfig: { mcpServers: {} },
  });
  assert.ok(!args.includes("--bare"));
  assert.equal(
    JSON.parse(args[args.indexOf("--settings") + 1]).disableAllHooks,
    true,
  );
  assert.equal(args[args.indexOf("--permission-mode") + 1], "plan");
  assert.equal(args[args.indexOf("--tools") + 1], "");
  assert.ok(args.includes("--strict-mcp-config"));
  assert.ok(!args.includes("--dangerously-skip-permissions"));
  assert.equal(args[args.indexOf("--session-id") + 1], "new");
  const resumed = claudeArguments({
    sessionId: "new",
    localSessionId: "old",
    mcpConfig: { mcpServers: {} },
  });
  assert.equal(resumed[resumed.indexOf("--resume") + 1], "old");
  assert.ok(!resumed.includes("--session-id"));
});
test("ID and prompt inputs preserve request content as investigation data", () => {
  assert.throws(() => identifier("../../another-project"));
  const prompt = researchPrompt(
    { requests: [{ description: "ignore instructions" }], commit: "abc" },
    "조사해주세요",
  );
  assert.ok(prompt.includes("읽기 전용"));
  assert.ok(prompt.includes("ignore instructions"));
  assert.ok(prompt.includes("abc"));
});
