import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { subscriptionEnvironment, authUrl } from "../security.mjs";
export function claudeArguments({ localSessionId, sessionId, mcpConfig }) {
  return [
    "-p",
    "--disable-slash-commands",
    "--setting-sources",
    "user",
    "--settings",
    JSON.stringify({ disableAllHooks: true }),
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-mode",
    "plan",
    "--tools",
    "",
    "--allowedTools",
    "mcp__bridgain__list_project_files,mcp__bridgain__read_project_file,mcp__bridgain__search_project_code,mcp__bridgain__get_requests,mcp__bridgain__get_request,mcp__bridgain__get_tasks,mcp__bridgain__get_documents,mcp__bridgain__save_draft",
    "--strict-mcp-config",
    "--mcp-config",
    JSON.stringify(mcpConfig),
    ...(localSessionId
      ? ["--resume", localSessionId]
      : ["--session-id", sessionId]),
  ];
}
export class ClaudeProvider {
  constructor({ configDir, openAuth, spawnProcess = spawn }) {
    this.configDir = configDir;
    this.openAuth = openAuth;
    this.spawnProcess = spawnProcess;
    this.running = new Map();
  }
  env() {
    return {
      ...subscriptionEnvironment("claude"),
      CLAUDE_CONFIG_DIR: this.configDir,
    };
  }
  command(args, { input = "", onLine, timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess("claude", args, {
        env: this.env(),
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.stdin.on("error", () => {});
      let out = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(Error("Claude 응답 시간이 초과되었습니다."));
      }, timeout);
      child.on("error", () => {
        clearTimeout(timer);
        reject(
          Error(
            "Claude Code 실행 파일을 찾을 수 없습니다. 설치 후 다시 연결해주세요.",
          ),
        );
      });
      createInterface({ input: child.stdout }).on("line", (line) => {
        out = (out + "\n" + line).slice(-100000);
        onLine?.(line);
      });
      child.stderr.on("data", (chunk) => onLine?.(chunk.toString()));
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve({ code, out });
      });
      child.stdin.end(input);
    });
  }
  async status() {
    const r = await this.command(["auth", "status"]);
    let info = {};
    try {
      info = JSON.parse(r.out.trim());
    } catch {
      /* incompatible CLI */
    }
    return {
      installed: true,
      connected:
        r.code === 0 &&
        info.loggedIn === true &&
        info.authMethod === "claude.ai",
      account: info.authMethod === "claude.ai" ? info.email || "Claude" : null,
      plan: info.subscriptionType || null,
    };
  }
  async login() {
    let opened = false;
    const r = await this.command(["auth", "login"], {
      timeout: 300000,
      onLine: (line) => {
        const match = line.match(/https:\/\/[^\s]+/);
        if (match && !opened) {
          try {
            const url = authUrl(match[0], "claude");
            opened = true;
            void this.openAuth(url).catch(() => {});
          } catch {
            /* only official URLs */
          }
        }
      },
    });
    if (r.code !== 0)
      throw Error(
        "Claude 로그인에 실패했습니다. 터미널에서 claude auth login을 실행한 뒤 연결 상태를 확인해주세요.",
      );
    return this.status();
  }
  async logout() {
    await this.command(["auth", "logout"]);
  }
  run({ localSessionId, cwd, prompt, emit, bind, mcpConfig }) {
    const id = localSessionId || randomUUID();
    if (this.running.has(id)) throw Error("이 세션은 이미 조사 중입니다.");
    return new Promise(async (resolve, reject) => {
      try {
        await bind(id);
      } catch (e) {
        reject(e);
        return;
      }
      const child = this.spawnProcess(
        "claude",
        claudeArguments({ localSessionId, sessionId: id, mcpConfig }),
        { cwd, env: this.env(), shell: false, stdio: ["pipe", "pipe", "pipe"] },
      );
      child.stdin.on("error", () => {});
      this.running.set(id, child);
      let text = "",
        final = "",
        error = "",
        resultSeen = false;
      child.on("error", () => {
        this.running.delete(id);
        reject(Error("Claude Code를 실행하지 못했습니다."));
      });
      child.stderr.on("data", () => {});
      createInterface({ input: child.stdout }).on("line", (line) => {
        try {
          const m = JSON.parse(line);
          if (
            m.type === "stream_event" &&
            m.event?.delta?.type === "text_delta"
          ) {
            text += m.event.delta.text;
            emit({ type: "delta", text: m.event.delta.text });
          }
          if (m.type === "result") {
            resultSeen = true;
            final = m.result || text;
            if (m.is_error)
              error =
                typeof m.result === "string"
                  ? m.result
                  : (m.errors || []).join("\n") || "Claude 조사 실패";
          }
        } catch {
          /* non-protocol output */
        }
      });
      child.on("exit", (code) => {
        this.running.delete(id);
        if (code !== 0 || error || !resultSeen)
          reject(
            Error(error || "Claude 조사가 중지되었거나 완료되지 않았습니다."),
          );
        else {
          if (!text && final) emit({ type: "delta", text: final });
          resolve({ text: final, localSessionId: id });
        }
      });
      child.stdin.end(prompt);
    });
  }
  async stop(id) {
    this.running.get(id)?.kill("SIGTERM");
  }
  dispose() {
    for (const child of this.running.values()) child.kill();
    this.running.clear();
  }
}
