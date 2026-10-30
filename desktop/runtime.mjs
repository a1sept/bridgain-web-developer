import { prepareTaskWorkspace } from "./task-workspace.mjs";
import { inspectRepository, cloneRepository, checkRepositoryAccess, verifyBinding, gitState, fileDiff, commitDetail, commitFiles, pushBranch, submissionState, git } from "./local-git.mjs";
import { projectTool } from "./project-files.mjs";
import { mkdir, readFile, writeFile, rename, realpath } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { syncCodexProjects } from "./codex-project-sync.mjs";
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
    openCodex,
    openPath,
    openEditor,
    emit,
    executable = process.execPath,
    gitAccessRun,
  }) {
    Object.assign(this, {
      directory,
      api,
      chooseFolder,
      openPath,
      openEditor,
      openAuth,
      emit,
      executable,
      gitAccessRun,
    });
    this.taskLocks = new Set();
    this.instances = new Map();
    this.runs = new Map();
    this.starting = new Set();
    this.codexBindings = new Map();
    this.saveQueue = Promise.resolve();
    this.openCodexUrl = openCodex;
    this.projectSyncs = new Map();
    this.projectSyncStatus = new Map();
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
        sqliteHome: join(homedir(), ".codex"),
        onLogin: () => {
          void this.syncProjects().finally(() => this.emit({ type: "connections" }));
        },
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
      codexSync: this.projectSyncStatus.get(owner.key),
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
    const snapshot = await this.api("/api/workspace");
    const project = snapshot.projects?.find(p => p.id === pid);
    if (!project) throw Error("프로젝트 접근 권한을 확인해주세요.");
    const selected = await this.chooseFolder();
    if (!selected) return null;
    const folder = await realpath(selected);
    const repo = await inspectRepository(folder, project.repositoryUrls || []);
    const access = await checkRepositoryAccess(repo.repositoryUrl, project.repositoryUrls || [], this.gitAccessRun);
    await this.assertOwner(owner.key);
    if (!access.ok) return access;
    owner.settings.folders[pid] = folder;
    await this.save();
    await this.syncProjects();
    return folder;
  }
  async checkRepositoryAccess(pid, repositoryUrl) {
    pid = identifier(pid);
    const owner = await this.owner();
    const snapshot = await this.api("/api/workspace");
    const project = snapshot.projects?.find(p => p.id === pid);
    if (!project) throw Error("프로젝트 접근 권한을 확인해주세요.");
    const result = await checkRepositoryAccess(repositoryUrl, project.repositoryUrls || [], this.gitAccessRun);
    await this.assertOwner(owner.key);
    return result;
  }
  async cloneProject(pid, repositoryUrl) {
    pid = identifier(pid);
    const owner = await this.owner();
    const snapshot = await this.api("/api/workspace");
    const project = snapshot.projects?.find(p => p.id === pid);
    if (!project) throw Error("프로젝트 접근 권한을 확인해주세요.");
    const selected = await this.chooseFolder();
    if (!selected) return null;
    await this.assertOwner(owner.key);
    const repo = await cloneRepository(selected, repositoryUrl, project.repositoryUrls || [], this.gitAccessRun);
    await this.assertOwner(owner.key);
    if (repo.ok === false) return repo;
    owner.settings.folders[pid] = repo.path;
    await this.save();
    await this.syncProjects();
    return repo;
  }
  async repositoryState(pid) {
    pid = identifier(pid);
    const owner = await this.owner();
    const snapshot = await this.api("/api/workspace");
    const project = snapshot.projects?.find(p => p.id === pid);
    if (!project) throw Error("프로젝트 접근 권한을 확인해주세요.");
    const folder = owner.settings.folders[pid];
    if (!folder) return null;
    const repo = await inspectRepository(folder, project.repositoryUrls || []);
    let author = "";
    try { author = (await git(folder, "var", "GIT_AUTHOR_IDENT")).trim(); } catch {}
    return { ...repo, authorConfigured: !!author };
  }
  async taskGit(pid, id, action = "state", options = {}) {
    pid = identifier(pid); id = identifier(id);
    if (!["state", "diff", "commitDetail", "commit", "push", "fetch", "submit", "editor"].includes(action)) throw Error("지원하지 않는 Git 작업입니다.");
    const owner = await this.owner();
    const write = ["commit", "push", "submit"].includes(action);
    const context = await this.api(`/api/workspace/projects/${pid}/tasks/${id}/git/context`, write ? {} : undefined);
    const binding = owner.settings.taskWorkspaces?.[`${pid}:${id}`];
    await verifyBinding(binding, context.repositoryUrls);
    if (context.task.workBranch !== binding.branch || context.task.repositoryUrl !== binding.repositoryUrl)
      throw Error("서버 업무와 로컬 브랜치 연결이 다릅니다. 업무 연결을 완료해주세요.");
    const lock = `${owner.key}:${pid}`;
    if (this.taskLocks.has(lock)) throw Error("Git 작업이 진행 중입니다. 잠시 후 다시 시도해주세요.");
    this.taskLocks.add(lock);
    try {
      await this.assertOwner(owner.key);
      if (action === "commitDetail") return await commitDetail(binding, options.sha);
      if (action === "diff") return await fileDiff(binding, options.path);
      if (action === "commit") return await commitFiles(binding, options.paths, options.message, options.expectedHead);
      if (action === "push") return await pushBranch(binding);
      if (action === "fetch") await git(binding.path, "fetch", "origin");
      if (action === "editor") {
        try {
          if (this.openEditor) await this.openEditor(binding.path);
          else await exec("code", ["--new-window", binding.path], { timeout: 15000 });
        }
        catch { throw Error("VS Code를 설치하고 vscode 링크 연결을 확인해주세요. 로컬 작업 디렉토리를 직접 열어도 됩니다."); }
      }
      if (action === "submit") {
        const state = await submissionState(binding);
        await this.assertOwner(owner.key);
        return await this.api(`/api/workspace/projects/${pid}/tasks/${id}/git/submit`, { headSha: state.head, expectedRevision: context.task.workRevision });
      }
      return await gitState(binding);
    } finally { this.taskLocks.delete(lock); }
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
    await this.syncProjects();
  }
  async taskWorkspace(pid, id, action = "state", options = {}) {
    pid = identifier(pid); id = identifier(id);
    const owner = await this.owner();
    const { tasks } = await this.api(`/api/workspace/projects/${pid}/tasks`);
    const task = tasks.find(t => t.id === id);
    if (!task) throw Error("업무를 찾을 수 없습니다.");
    owner.settings.taskWorkspaces ??= {};
    const key = `${pid}:${id}`;
    const folder = owner.settings.folders[pid];
    const binding = owner.settings.taskWorkspaces[key];
    if (action === "state") return { folder, binding };
    await this.assertOwner(owner.key);
    if (action === "open") {
      const target = binding?.path || folder;
      if (!target) throw Error("로컬 폴더를 연결해주세요.");
      const error = await this.openPath(await realpath(target));
      if (error) throw Error(error);
      return { folder, binding };
    }
    if (action !== "start" || !folder) throw Error("로컬 폴더를 연결해주세요.");
    await this.api(`/api/workspace/projects/${pid}/tasks/${id}/git/context`, {});
    if (!task.assignees.some(a => a.userId === owner.user.id) ||
        !["todo", "in_progress"].includes(task.status) || task.assignees.some(a => a.completedAt))
      throw Error("진행 가능한 업무의 담당자만 브랜치를 연결할 수 있습니다.");
    if (task.workBranch && task.workBranch !== options.branch)
      throw Error("업무에 이미 연결된 브랜치를 사용해주세요.");
    const lock = `${owner.key}:${pid}`;
    if (this.taskLocks.has(lock)) throw Error("다른 브랜치 연결이 진행 중입니다.");
    this.taskLocks.add(lock);
    try {
      const snapshot = await this.api("/api/workspace");
      const project = snapshot.projects?.find(p => p.id === pid);
      if (!project) throw Error("프로젝트 접근 권한을 확인해주세요.");
      const prepared = await prepareTaskWorkspace({ folder,
        allowedRepositories: project.repositoryUrls || [],
        path: binding?.path || join(this.directory, "worktrees", owner.key, pid, id),
        branch: options.branch, baseBranch: options.baseBranch,
        existing: !!options.existing, repositoryUrl: task.repositoryUrl });
      owner.settings.taskWorkspaces[key] = prepared;
      await this.save();
      await this.assertOwner(owner.key);
      await verifyBinding(prepared, project.repositoryUrls || []);
      await pushBranch(prepared);
      try {
        await this.api(`/api/workspace/projects/${pid}/tasks/${id}`, {
          expectedVersion: task.version, status: "in_progress",
          workBranch: prepared.branch, liveBranch: prepared.baseBranch, repositoryUrl: prepared.repositoryUrl,
        }, "PATCH");
      } catch (error) {
        throw Error(`로컬 작업 폴더는 준비됐지만 업무 연결에 실패했습니다. 다시 시작하면 기존 폴더를 재사용합니다. ${error.message}`);
      }
      return { folder, binding: prepared };
    } finally { this.taskLocks.delete(lock); }
  }
  async syncProjects() {
    let owner;
    let ownsSync = false;
    try {
      owner = await this.owner();
      if (!owner.settings.enabled.codex) return { synced: 0 };
      if (this.projectSyncs.has(owner.key)) {
        await this.projectSyncs.get(owner.key).catch(() => {});
        await this.assertOwner(owner.key);
        return this.syncProjects();
      }
      const pending = (async () => {
        const snapshot = await this.api("/api/workspace");
        const provider = await this.provider(owner, "codex");
        await this.assertOwner(owner.key);
        return syncCodexProjects({
          provider, owner, projects: snapshot.projects || [],
          assertOwner: () => this.assertOwner(owner.key), save: () => this.save(),
        });
      })();
      this.projectSyncs.set(owner.key, pending);
      ownsSync = true;
      const result = await pending;
      this.projectSyncStatus.set(owner.key, result);
      return result;
    } catch (e) {
      const result = { synced: 0, error: `Codex 프로젝트 연결 실패: ${e.message}` };
      if (owner) this.projectSyncStatus.set(owner.key, result);
      return result;
    } finally {
      if (owner && ownsSync) this.projectSyncs.delete(owner.key);
    }
  }
  async openCodex(id) {
    const owner = await this.owner();
    const binding = owner.settings.localSessions[identifier(id)];
    if (!binding) throw Error("이 컴퓨터에서 연결한 Codex 대화가 없습니다.");
    const detail = await this.api(`/api/workspace/projects/${identifier(binding.pid)}/ai/sessions/${id}`);
    if (detail.session.provider !== "codex" || detail.session.localSessionId !== binding.localId)
      throw Error("Codex 대화 연결을 확인할 수 없습니다.");
    await this.assertOwner(owner.key);
    if (!this.openCodexUrl) throw Error("Codex 앱을 열 수 없습니다.");
    await this.openCodexUrl(`codex://threads/${identifier(binding.localId)}`);
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
    const projectSync = name === "codex" ? await this.syncProjects() : null;
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
      codexProjectId: projectSync && !projectSync.error
        ? owner.settings.codexProjects?.[pid]?.projectId : undefined,
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
        projectId: run.codexProjectId,
        title: detail.session.title,
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
          owner.settings.localSessions[run.id] = { localId, pid: run.pid, provider: run.providerName };
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
