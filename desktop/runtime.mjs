import { projectTool } from "./project-files.mjs";
import { mkdir, readFile, writeFile, rename, realpath } from "node:fs/promises";
import { join } from "node:path";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { CodexProvider } from "./providers/codex.mjs";
import { ClaudeProvider } from "./providers/claude.mjs";
import { providerName, identifier, researchPrompt } from "./security.mjs";
import { tools, toolResult } from "./tools.mjs";
const exec = promisify(execFile);
export class DesktopRuntime {
  constructor({
    directory,
    api,
    chooseFolder,
    openAuth,
    emit,
    executable = process.execPath,
  }) {
    Object.assign(this, {
      directory,
      api,
      chooseFolder,
      openAuth,
      emit,
      executable,
    });
    this.instances = new Map();
    this.runs = new Map();
    this.starting = new Set();
    this.codexBindings = new Map();
    this.saveQueue = Promise.resolve();
  }
  async load() {
    try {
      this.settings = JSON.parse(
        await readFile(join(this.directory, "settings.json"), "utf8"),
      );
    } catch {
      this.settings = { owners: {} };
    }
    this.settings.owners ??= {};
  }
  async save() {
    const snapshot = JSON.stringify(this.settings, null, 2);
    this.saveQueue = this.saveQueue
      .catch(() => {})
      .then(async () => {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const file = join(this.directory, "settings.json");
        await writeFile(file + ".tmp", snapshot, { mode: 0o600 });
        await rename(file + ".tmp", file);
      });
    return this.saveQueue;
  }
  async owner() {
    const { user } = await this.api("/api/auth/me");
    if (user?.accountType !== "team")
      throw Error("개발자 계정으로 로그인해주세요.");
    const key = createHash("sha256")
      .update(`${this.origin}:${user.id}`)
      .digest("hex");
    this.settings.owners[key] ??= {
      folders: {},
      enabled: {},
      localSessions: {},
    };
    this.settings.owners[key].localSessions ??= {};
    return { key, user, settings: this.settings.owners[key] };
  }
  async assertOwner(key) {
    if ((await this.owner()).key !== key)
      throw Error("로그인 계정이 변경되었습니다. 다시 실행해주세요.");
  }
  async provider(owner, name) {
    name = providerName(name);
    const key = owner.key + ":" + name;
    if (this.instances.has(key)) return this.instances.get(key);
    const home = join(this.directory, "accounts", owner.key, name);
    await mkdir(home, { recursive: true, mode: 0o700 });
    let provider;
    if (name === "codex")
      provider = new CodexProvider({
        home,
        onLogin: () => this.emit({ type: "connections" }),
        onTool: async (localId, name, args) => {
          const run = this.codexBindings.get(localId);
          if (!run) throw Error("연결된 실행을 찾을 수 없습니다.");
          return this.callTool(run, name, args);
        },
      });
    else
      provider = new ClaudeProvider({
        configDir: home,
        openAuth: this.openAuth,
      });
    this.instances.set(key, provider);
    return provider;
  }
  async state() {
    const owner = await this.owner();
    const providers = {};
    for (const name of ["codex", "claude"]) {
      providers[name] = { connected: false, installed: null, account: null };
      if (owner.settings.enabled[name]) {
        try {
          providers[name] = await (await this.provider(owner, name)).status();
        } catch (e) {
          providers[name] = {
            connected: false,
            installed: false,
            account: null,
            error: e.message,
          };
        }
      }
    }
    return {
      providers,
      folders: owner.settings.folders,
      running: [...this.runs.values()]
        .filter((r) => r.owner === owner.key)
        .map((r) => r.id),
    };
  }
  async connect(name) {
    const owner = await this.owner();
    const provider = await this.provider(owner, name);
    owner.settings.enabled[name] = true;
    await this.save();
    try {
      const result = await provider.login();
      if (result.verificationUrl)
        await this.openAuth(result.verificationUrl, name);
      return result;
    } catch (e) {
      owner.settings.enabled[name] = false;
      await this.save();
      throw e;
    }
  }
  async disconnect(name) {
    const owner = await this.owner();
    for (const run of this.runs.values())
      if (run.owner === owner.key && run.providerName === name)
        await this.stop(run.id);
    const provider = await this.provider(owner, name);
    await provider.logout();
    provider.dispose();
    this.instances.delete(owner.key + ":" + name);
    owner.settings.enabled[name] = false;
    await this.save();
    this.emit({ type: "connections" });
  }
  async folder(pid) {
    pid = identifier(pid);
    const owner = await this.owner();
    await this.api(`/api/workspace/projects/${pid}/ai/sessions`);
    const selected = await this.chooseFolder();
    if (!selected) return null;
    const folder = await realpath(selected);
    owner.settings.folders[pid] = folder;
    await this.save();
    return folder;
  }
  async clearFolder(pid) {
    const owner = await this.owner();
    if (
      [...this.runs.values()].some(
        (r) => r.owner === owner.key && r.pid === pid,
      )
    )
      throw Error("조사를 중지한 뒤 프로젝트 연결을 해제해주세요.");
    delete owner.settings.folders[identifier(pid)];
    await this.save();
  }
  async callTool(run, name, args) {
    await this.assertOwner(run.owner);
    if (!tools.some((t) => t.name === name))
      throw Error("지원하지 않는 도구입니다.");
    if (!this.runs.has(run.id)) throw Error("이미 종료된 실행입니다.");
    if (
      [
        "list_project_files",
        "read_project_file",
        "search_project_code",
      ].includes(name)
    )
      return projectTool(run.cwd, name, args ?? {});
    const result = await this.api(`${run.base}/tools`, {
      name,
      arguments: args,
    });
    this.emit({ type: "tool", sessionId: run.id, name });
    return result;
  }
  async mcp(run) {
    const token = randomBytes(32).toString("hex");
    const server = createServer(async (req, res) => {
      const supplied = Buffer.from(req.headers.authorization || "");
      const expected = Buffer.from("Bearer " + token);
      if (
        req.method !== "POST" ||
        req.url !== "/mcp" ||
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        res.writeHead(403).end();
        return;
      }
      try {
        let body = "";
        for await (const part of req) {
          body += part;
          if (Buffer.byteLength(body) > 1000000)
            throw Error("도구 입력이 너무 큽니다.");
        }
        const request = JSON.parse(body);
        let result;
        if (request.method === "initialize")
          result = {
            protocolVersion: request.params?.protocolVersion || "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "bridgain", version: "0.1.0" },
          };
        else if (request.method === "tools/list") result = { tools };
        else if (request.method === "tools/call") {
          try {
            result = toolResult(
              await this.callTool(
                run,
                request.params.name,
                request.params.arguments ?? {},
              ),
            );
          } catch (e) {
            result = toolResult({ error: e.message }, true);
          }
        } else if (request.method === "ping") result = {};
        else if (request.id === undefined) {
          res.writeHead(204).end();
          return;
        } else throw Error("지원하지 않는 MCP 요청입니다.");
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
      } catch (e) {
        res
          .writeHead(400, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: e.message }));
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = server.address().port;
    return {
      close: () => server.close(),
      config: {
        mcpServers: {
          bridgain: {
            command: this.executable,
            args: [join(import.meta.dirname, "mcp-stdio.mjs")],
            env: {
              ELECTRON_RUN_AS_NODE: "1",
              BRIDGAIN_MCP_ENDPOINT: `http://127.0.0.1:${port}/mcp`,
              BRIDGAIN_MCP_TOKEN: token,
            },
          },
        },
      },
    };
  }
  async run(pid, id, message) {
    id = identifier(id);
    if (this.starting.has(id) || this.runs.has(id))
      throw Error("이 세션은 이미 조사 중입니다.");
    this.starting.add(id);
    try {
      return await this.prepareRun(pid, id, message);
    } finally {
      this.starting.delete(id);
    }
  }
  async prepareRun(pid, id, message) {
    pid = identifier(pid);
    id = identifier(id);
    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 20000
    )
      throw Error("메시지는 1~20,000자로 입력해주세요.");
    if (this.runs.has(id)) throw Error("이 세션은 이미 조사 중입니다.");
    const owner = await this.owner();
    if (
      [...this.runs.values()].filter((r) => r.owner === owner.key).length >= 2
    )
      throw Error("동시에 최대 두 세션을 실행할 수 있습니다.");
    const base = `/api/workspace/projects/${pid}/ai/sessions/${id}`;
    const detail = await this.api(base);
    if (
      detail.session.localSessionId &&
      owner.settings.localSessions[id]?.localId !==
        detail.session.localSessionId
    )
      throw Error(
        "이 세션은 다른 로컬 실행 환경에서 생성되었습니다. 새 세션을 만들어 조사해주세요.",
      );
    const name = providerName(detail.session.provider);
    if (!owner.settings.enabled[name])
      throw Error("AI 연결 설정에서 먼저 연결해주세요.");
    const cwd = owner.settings.folders[pid];
    if (!cwd) throw Error("현재 프로젝트의 로컬 폴더를 연결해주세요.");
    const provider = await this.provider(owner, name);
    const status = await provider.status();
    if (!status.connected) throw Error("구독 계정으로 다시 인증해주세요.");
    await realpath(cwd);
    const run = {
      id,
      pid,
      owner: owner.key,
      providerName: name,
      provider,
      cwd,
      base,
      localId: detail.session.localSessionId,
      text: "",
      cancelled: false,
    };
    this.runs.set(id, run);
    const emit = (event) => {
      if (event.type === "delta") run.text += event.text;
      this.emit({ ...event, sessionId: id });
    };
    // Do not block the renderer's IPC call for the entire model turn.
    this.emit({ type: "started", sessionId: id });
    void this.execute(run, detail, cwd, message, emit);
    return { started: true };
  }
  async execute(run, detail, cwd, message, emit) {
    let mcp;
    try {
      let commit = "";
      try {
        commit = (
          await exec("git", ["rev-parse", "HEAD"], { cwd, timeout: 5000 })
        ).stdout.trim();
      } catch {
        /* folder can contain an unversioned project */
      }
      await this.assertOwner(run.owner);
      await this.api(`${run.base}/messages`, {
        role: "user",
        body: message,
        clientId: randomUUID(),
        context: { commit, requestIds: detail.requests.map((r) => r.id) },
      });
      this.emit({ type: "messages", sessionId: run.id });
      const context = { projectId: run.pid, commit, requests: detail.requests };
      if (run.providerName === "claude") mcp = await this.mcp(run);
      await this.assertOwner(run.owner);
      if (run.cancelled) throw Error("조사를 중지했습니다.");
      const result = await run.provider.run({
        localSessionId: detail.session.localSessionId,
        cwd,
        prompt: researchPrompt(context, message),
        emit,
        mcpConfig: mcp?.config,
        bind: async (localId) => {
          run.localId = localId;
          this.codexBindings.set(localId, run);
          const owner = await this.owner();
          if (owner.key !== run.owner)
            throw Error("로그인 계정이 변경되었습니다.");
          owner.settings.localSessions[run.id] = { localId, pid: run.pid };
          await this.save();
          await this.api(
            run.base,
            { localSessionId: localId, commit },
            "PATCH",
          );
          if (run.cancelled) throw Error("조사를 중지했습니다.");
        },
      });
      await this.assertOwner(run.owner);
      if (result.text)
        await this.api(`${run.base}/messages`, {
          role: "assistant",
          body: result.text.slice(0, 50000),
          clientId: randomUUID(),
        });
      emit({ type: "completed" });
    } catch (e) {
      try {
        await this.assertOwner(run.owner);
        if (run.text)
          await this.api(`${run.base}/messages`, {
            role: "assistant",
            body: ("[미완료 응답]\n" + run.text).slice(0, 50000),
            clientId: randomUUID(),
          });
        await this.api(`${run.base}/messages`, {
          role: "system",
          body: e.message.slice(0, 2000),
          clientId: randomUUID(),
        });
      } catch {
        /* server disconnected or user signed out */
      }
      emit({
        type: run.cancelled ? "interrupted" : "error",
        message: e.message,
      });
    } finally {
      mcp?.close();
      this.runs.delete(run.id);
      if (run.localId) this.codexBindings.delete(run.localId);
    }
  }
  async stop(id) {
    const run = this.runs.get(identifier(id));
    if (!run) return;
    await this.assertOwner(run.owner);
    run.cancelled = true;
    if (run.localId) await run.provider.stop(run.localId);
  }
  release() {
    for (const r of this.runs.values()) {
      r.cancelled = true;
      if (r.localId) void r.provider.stop(r.localId).catch(() => {});
    }
    for (const p of this.instances.values()) p.dispose();
    this.instances.clear();
  }
}
