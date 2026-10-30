import { mkdtemp, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRepositoryAccess, repositoryAccessFailure, cloneRepository } from "../local-git.mjs";
const url = "https://github.com/example/project";
test("access check only allows registered credential-free GitHub URLs", async () => {
  let calls = 0;
  const run = async () => { calls++; };
  for (const candidate of ["https://github.com/other/project", "https://token@github.com/example/project", "file:///tmp/repo", "--help", "https://github.com/example/project?token=secret", null])
    await assert.rejects(checkRepositoryAccess(candidate, [url], run), /등록된/);
  assert.equal(calls, 0);
});
test("access check uses read-only noninteractive ls-remote, including empty repositories", async () => {
  const result = await checkRepositoryAccess(url, [url], async (command, args, options) => {
    assert.equal(command, "git");
    assert.deepEqual(args, ["ls-remote", "--heads", "--", url]);
    assert.equal(options.env.GIT_TERMINAL_PROMPT, "0");
    assert.equal(options.env.GCM_INTERACTIVE, "never");
    assert.equal(options.timeout, 30000);
    return { stdout: "" };
  });
  assert.equal(result.ok, true); assert.equal(result.code, "ok");
  assert.match(result.message, /쓰기 권한은 별도/);
});
test("failure classifications preserve 404 ambiguity and never expose credentials", async () => {
  const cases = [
    ["fatal: Authentication failed for 'https://user:super-secret@github.com/example/project/'", "authentication"],
    ["fatal: could not read Username for 'https://github.com': terminal prompts disabled", "authentication"],
    ["fatal: unable to access 'https://github.com/example/project': The requested URL returned error: 403", "permission"],
    ["remote: Repository not found. fatal: Authentication failed", "not_found_or_no_access"],
    ["The requested URL returned error: 404", "not_found_or_no_access"],
    ["Could not resolve host: github.com", "network"],
    ["SSL certificate problem: unable to get local issuer certificate", "network"],
    ["unexpected helper super-secret", "unknown"],
  ];
  for (const [stderr, expected] of cases) {
    const result = await checkRepositoryAccess(url, [url], async () => { throw { stderr, message: "super-secret" }; });
    assert.equal(result.ok, false); assert.equal(result.code, expected);
    assert.doesNotMatch(JSON.stringify(result), /super-secret/);
    if (expected === "not_found_or_no_access") assert.match(result.message, /없거나.*접근할 수 없습니다/);
  }
  assert.equal(repositoryAccessFailure({ code: "ENOENT" }).code, "git_missing");
  assert.equal(repositoryAccessFailure({ killed: true }).code, "network");
});

test("clone access and clone-time failures return safe structured results without deleting files", async () => {
  const folder = await mkdtemp(join(tmpdir(), "bridgain-access-clone-"));
  const denied = await cloneRepository(folder, url, [url], async () => { throw { stderr: "requested URL returned error: 403 secret-token" }; });
  assert.equal(denied.ok, false); assert.equal(denied.code, "permission");
  assert.equal(denied.repositoryUrl, url); assert.doesNotMatch(JSON.stringify(denied), /secret-token/);
  const expired = await cloneRepository(folder, url, [url], async (_command, args) => {
    if (args[0] === "clone") throw { stderr: "Authentication failed secret-token" };
    return { stdout: "" };
  });
  assert.equal(expired.ok, false); assert.equal(expired.code, "authentication");
  assert.deepEqual(await readdir(folder), []);
});
