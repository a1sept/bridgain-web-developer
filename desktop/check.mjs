import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? ["node_modules", ".git", "release"].includes(e.name)
            ? []
            : files(join(dir, e.name))
          : [join(dir, e.name)],
      ),
    )
  ).flat();
}
const scripts = (await files(import.meta.dirname)).filter((p) =>
  /\.(mjs|cjs|js)$/.test(p),
);
for (const script of scripts)
  execFileSync(process.execPath, ["--check", script], { stdio: "inherit" });
console.log(
  `PASS: ${scripts.length} desktop JavaScript files parsed; no GUI or AI processes started.`,
);
