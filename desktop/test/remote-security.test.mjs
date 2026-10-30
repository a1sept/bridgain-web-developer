import { test } from "node:test";
import assert from "node:assert/strict";
import { remoteOrigin, isServiceUrl, externalUrl } from "../remote-security.mjs";

test("remote origin is explicit and supports an HTTP service without weakening browser security", () => {
  assert.equal(remoteOrigin("http://example.test:15175/"), "http://example.test:15175");
  assert.equal(remoteOrigin("https://example.test"), "https://example.test");
  for (const value of [undefined, "", "file:///tmp/a", "javascript:alert(1)",
    "https://user:pass@example.test", "https://example.test/path", "https://example.test/?token=x", "https://example.test/#x"])
    assert.throws(() => remoteOrigin(value));
});
test("service navigation uses the exact scheme, host, and port", () => {
  const origin = "https://example.test:8443";
  assert.ok(isServiceUrl(`${origin}/login?next=/projects#form`, origin));
  for (const value of ["http://example.test:8443", "https://example.test", "https://example.test.evil.test:8443",
    "https://user@example.test:8443", "file:///tmp/page", "data:text/html,hello", "invalid"])
    assert.equal(isServiceUrl(value, origin), false);
});
test("only credential-free HTTP links may reach the external browser", () => {
  assert.equal(externalUrl("https://docs.example.test/help"), "https://docs.example.test/help");
  for (const value of ["file:///tmp/page", "javascript:alert(1)", "custom://open", "https://user:pass@example.test", "invalid"])
    assert.equal(externalUrl(value), null);
});
