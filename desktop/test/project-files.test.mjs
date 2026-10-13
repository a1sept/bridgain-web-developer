import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { projectTool } from "../project-files.mjs";
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "bridgain-project-test-"));
  const root = join(base, "project");
  await mkdir(root);
  await writeFile(
    join(root, "app.ts"),
    "const request = 1;\nexport {request};",
  );
  await writeFile(join(root, ".env"), "SECRET=hidden");
  await writeFile(join(base, "outside.txt"), "outside");
  return { root, base };
}
test("local code investigation reads selected project files and searches with line references", async () => {
  const { root } = await fixture();
  const listed = await projectTool(root, "list_project_files", {});
  assert.deepEqual(listed.files, ["app.ts"]);
  const read = await projectTool(root, "read_project_file", { path: "app.ts" });
  assert.ok(read.content.includes("request"));
  const results = await projectTool(root, "search_project_code", {
    query: "request",
  });
  assert.equal(results.matches[0].line, 1);
  assert.equal(results.matches[0].path, "app.ts");
});
test("local tools reject traversal, secret files, symlink escape and oversized files", async () => {
  const { root, base } = await fixture();
  await symlink(join(base, "outside.txt"), join(root, "link.txt"));
  await writeFile(join(root, "large.ts"), "x".repeat(300001));
  for (const path of ["../outside.txt", ".env", "link.txt", "large.ts"])
    await assert.rejects(projectTool(root, "read_project_file", { path }));
});
