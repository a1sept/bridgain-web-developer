import test from "node:test";
import assert from "node:assert/strict";
import { githubBrowserUrl } from "../security.mjs";

const fragment = "#github-connect=4d59a558-7481-4e30-9592-1fad451123d4";
test("GitHub browser launch accepts the configured frontend account hint", () => {
  for (const origin of ["https://app.example.com", "http://nexusnas.iptime.org:15174", "http://localhost:15174"])
    assert.equal(githubBrowserUrl(`${origin}/${fragment}`), `${origin}/${fragment}`);
});
test("GitHub browser launch rejects executable URLs, credentials and OAuth secrets", () => {
  for (const value of [
    `file:///tmp/${fragment}`, `javascript:alert(1)`,
    `https://user:password@app.example.com/${fragment}`,
    `https://app.example.com/api/workspace/github/callback${fragment}`,
    `https://app.example.com/?token=secret${fragment}`,
    "https://app.example.com/#github-connect=invalid",
    `https://app.example.com/${fragment}&token=secret`,
  ]) assert.throws(() => githubBrowserUrl(value));
});
