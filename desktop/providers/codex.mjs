import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { subscriptionEnvironment } from "../security.mjs";
import { tools } from "../tools.mjs";
export class CodexProvider {
  constructor({ home, sqliteHome, onLogin, onTool, spawnProcess = spawn }) {
    this.home = home;
    this.sqliteHome = sqliteHome;
    this.onLogin = onLogin;
    this.onTool = onTool;
    this.spawnProcess = spawnProcess;
    this.pending = new Map();
    this.turns = new Map();
    this.counter = 0;
  }
  async start() {
    if (this.ready) return this.ready;
    this.ready = this.initialize();
    try {
      return await this.ready;
    } catch (e) {
      this.child?.kill();
      this.ready = null;
      throw e;
    }
  }
  async initialize() {
    this.child = this.spawnProcess(
      "codex",
      [
        "app-server",
        "--listen",
        "stdio://",
        "-c",
        'forced_login_method="chatgpt"',
        ...(this.sqliteHome ? ["-c", `sqlite_home=${JSON.stringify(this.sqliteHome)}`] : []),
        "--disable",
        "shell_tool",
      ],
      {
        env: { ...subscriptionEnvironment("codex"), CODEX_HOME: this.home },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const child = this.child;
    child.stdin.on("error", () => {
      if (this.child === child) this.closed("Codex 연결이 종료되었습니다.");
    });
    this.child.on("error", () =>
      this.closed(
        "Codex 실행 파일을 찾을 수 없습니다. 설치 후 다시 연결해주세요.",
      ),
    );
    this.child.on("exit", () => {
      if (this.child === child) this.closed("Codex 연결이 종료되었습니다.");
    });
    this.child.stderr.on("data", () => {});
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      try {
        this.receive(JSON.parse(line));
      } catch {
        /* ignore non-protocol output */
      }
    });
    await this.rpc("initialize", {
      clientInfo: {
        name: "bridgain_desktop",
        title: "Bridgain",
        version: "0.1.0",
      },
      capabilities: { experimentalApi: true },
    });
    this.write({ method: "initialized" });
  }
  write(value) {
    if (this.child?.stdin.writable)
      this.child.stdin.write(JSON.stringify(value) + "\n");
  }
  rpc(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.counter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("Codex 응답 시간이 초과되었습니다."));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }
  closed(message) {
    this.ready = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error(message));
    }
    this.pending.clear();
    for (const t of this.turns.values()) t.reject(Error(message));
    this.turns.clear();
  }
  receive(m) {
    if (m.id !== undefined && !m.method) {
      const p = this.pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(m.id);
        m.error
          ? p.reject(Error(m.error.message || "Codex 요청 실패"))
          : p.resolve(m.result);
      }
      return;
    }
    if (m.id !== undefined && m.method) {
      void this.serverRequest(m);
      return;
    }
    if (m.method === "account/login/completed") {
      this.onLogin?.(m.params);
      return;
    }
    const p = m.params || {};
    const t = this.turns.get(p.threadId);
    if (!t) return;
    if (m.method === "turn/started") {
      t.turnId = p.turn?.id;
      if (t.cancelled) void this.stop(p.threadId).catch(() => {});
    }
    t.items ??= new Map();
    if (m.method === "item/agentMessage/delta") {
      const itemId = p.itemId || "message";
      t.items.set(itemId, (t.items.get(itemId) || "") + (p.delta || ""));
      t.text = [...t.items.values()].join("\n\n");
      t.emit({ type: "delta", text: p.delta || "" });
    }
    if (m.method === "item/completed" && p.item?.type === "agentMessage") {
      const id = p.item.id || "message";
      const prior = t.items.get(id) || "";
      t.items.set(id, p.item.text || prior);
      t.text = [...t.items.values()].join("\n\n");
      if (!prior && p.item.text) t.emit({ type: "delta", text: p.item.text });
    }
    if (m.method === "turn/completed") {
      this.turns.delete(p.threadId);
      p.turn?.status === "completed"
        ? t.resolve({ text: t.text, localSessionId: p.threadId })
        : t.reject(
            Error(
              p.turn?.status === "interrupted"
                ? "조사를 중지했습니다."
                : p.turn?.error?.message || "Codex 조사가 완료되지 않았습니다.",
            ),
          );
    }
  }
  async serverRequest(m) {
    try {
      if (m.method === "item/tool/call") {
        const result = await this.onTool(
          m.params.threadId,
          m.params.tool,
          m.params.arguments,
        );
        this.write({
          id: m.id,
          result: {
            contentItems: [{ type: "inputText", text: JSON.stringify(result) }],
            success: true,
          },
        });
      } else if (
        m.method === "item/commandExecution/requestApproval" ||
        m.method === "item/fileChange/requestApproval"
      )
        this.write({ id: m.id, result: { decision: "decline" } });
      else if (m.method === "item/permissions/requestApproval")
        this.write({ id: m.id, result: { permissions: {}, scope: "turn" } });
      else
        this.write({
          id: m.id,
          error: {
            code: -32601,
            message: "조사 모드에서 지원하지 않는 요청입니다.",
          },
        });
    } catch (e) {
      this.write({
        id: m.id,
        result: {
          contentItems: [{ type: "inputText", text: e.message }],
          success: false,
        },
      });
    }
  }
  async status() {
    await this.start();
    const r = await this.rpc("account/read", { refreshToken: false });
    return {
      installed: true,
      connected: r.account?.type === "chatgpt",
      account:
        r.account?.type === "chatgpt" ? r.account.email || "ChatGPT" : null,
      plan: r.account?.planType || r.account?.chatgptPlanType || null,
    };
  }
  async login() {
    await this.start();
    return this.rpc("account/login/start", { type: "chatgptDeviceCode" });
  }
  async logout() {
    await this.start();
    await this.rpc("account/logout");
  }
  async run({ localSessionId, projectId, title, cwd, prompt, emit, bind }) {
    await this.start();
    const params = { cwd, approvalPolicy: "never", sandbox: "read-only" };
    const r = localSessionId
      ? await this.rpc("thread/resume", { threadId: localSessionId, ...params })
      : await this.rpc("thread/start", {
          ...params,
          ...(projectId ? { projectId } : {}),
          dynamicTools: tools.map((t) => ({
            type: "function",
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
    const id = r.thread.id;
    await bind(id);
    if (projectId && localSessionId)
      await this.rpc("thread/metadata/update", { threadId: id, projectId });
    if (title) await this.rpc("thread/name/set", { threadId: id, name: title });
    if (this.turns.has(id)) throw Error("이 세션은 이미 조사 중입니다.");
    return new Promise((resolve, reject) => {
      this.turns.set(id, { resolve, reject, emit, text: "" });
      this.rpc("turn/start", {
        threadId: id,
        input: [{ type: "text", text: prompt }],
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", networkAccess: false },
      })
        .then((r) => {
          const t = this.turns.get(id);
          if (t) {
            t.turnId = r.turn.id;
            if (t.cancelled) void this.stop(id).catch(() => {});
          }
        })
        .catch((e) => {
          this.turns.delete(id);
          reject(e);
        });
    });
  }
  async stop(id) {
    const turn = this.turns.get(id);
    if (turn) turn.cancelled = true;
    if (turn?.turnId)
      await this.rpc("turn/interrupt", { threadId: id, turnId: turn.turnId });
  }
  dispose() {
    this.child?.kill();
    this.closed("연결이 종료되었습니다.");
  }
}
