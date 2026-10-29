import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { DesktopRuntime } from "./runtime.mjs";
import { serverOrigin, providerName, authUrl } from "./security.mjs";
// Complete ESM evaluation before waiting for Electron to emit ready.
async function main() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
  }
  let window,
    runtime,
    origin = "";
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  const root = join(app.getPath("userData"), "bridgain");
  const landing = join(import.meta.dirname, "welcome.html");
  async function api(path, body, method = "POST") {
    if (!origin || !path.startsWith("/api/") || path.includes(".."))
      throw Error("서버 연결을 확인해주세요.");
    const headers = {};
    if (body !== undefined) {
      const response = await window.webContents.session.fetch(
        origin + "/api/auth/csrf",
        { credentials: "include", redirect: "error" },
      );
      if (!response.ok) throw Error("다시 로그인해주세요.");
      const csrf = await response.json();
      headers["Content-Type"] = "application/json";
      headers["X-CSRF-Token"] = csrf.csrfToken;
      headers.Origin = origin;
    }
    const response = await window.webContents.session.fetch(origin + path, {
      method: body === undefined ? "GET" : method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    let value;
    try {
      value = await response.json();
    } catch {
      throw Error("서버 응답을 확인해주세요.");
    }
    if (!response.ok) throw Error(value.message || "서버 요청에 실패했습니다.");
    return value;
  }
  function validateSender(event, landingAllowed = false) {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw Error("허용되지 않은 화면입니다.");
    const url = event.senderFrame.url;
    if (landingAllowed && url === pathToFileURL(landing).href) return;
    if (!origin || new URL(url).origin !== origin)
      throw Error("서버 연결 화면에서 사용해주세요.");
  }
  function handle(name, fn, landingAllowed = false) {
    ipcMain.handle("bridgain:" + name, async (event, ...args) => {
      try {
        validateSender(event, landingAllowed);
        return { ok: true, value: await fn(...args) };
      } catch (e) {
        return { ok: false, error: e.message || "요청에 실패했습니다." };
      }
    });
  }
  async function connectServer(url) {
    const next = serverOrigin(url);
    runtime.release();
    origin = next;
    runtime.origin = next;
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(join(root, "server.json"), JSON.stringify({ origin }), {
      mode: 0o600,
    });
    await window.loadURL(origin);
  }
  await app.whenReady();
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    title: "Bridgain",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "persist:bridgain",
    },
  });
  app.on("activate", () => {
    if (!window.isDestroyed()) {
      window.show();
      window.focus();
    }
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Bridgain",
        submenu: [
          {
            label: "서버 연결 변경",
            click: () => {
              runtime.release();
              origin = "";
              void window.loadFile(landing);
            },
          },
          { role: "quit" },
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
    ]),
  );
  runtime = new DesktopRuntime({
    directory: root,
    api,
    chooseFolder: async () => {
      const result = await dialog.showOpenDialog(window, {
        title: "프로젝트 폴더 연결",
        properties: ["openDirectory"],
      });
      return result.canceled ? null : result.filePaths[0];
    },
    openPath: (path) => shell.openPath(path),
    openCodex: (url) => shell.openExternal(url),
    openAuth: (url, provider = "claude") =>
      shell.openExternal(authUrl(url, provider)),
    emit: (event) => {
      if (!window.isDestroyed()) window.webContents.send("bridgain:event", event);
    },
  });
  await runtime.load();
  handle("connect-server", connectServer, true);
  handle("task-workspace", (pid, id, action, options) => runtime.taskWorkspace(pid, id, action, options));
  handle("state", () => runtime.state());
  handle("sync-projects", () => runtime.syncProjects());
  handle("open-codex", (id) => runtime.openCodex(id));
  handle("connect", (p) => runtime.connect(providerName(p)));
  handle("disconnect", (p) => runtime.disconnect(providerName(p)));
  handle("folder", (pid) => runtime.folder(pid));
  handle("clear-folder", (pid) => runtime.clearFolder(pid));
  handle("run", (pid, id, message) => runtime.run(pid, id, message));
  handle("stop", (id) => runtime.stop(id));
  handle("release", () => runtime.release());
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (
        ["https:", "http:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      )
        void shell.openExternal(url);
    } catch {}
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (origin && new URL(url).origin !== origin) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.on(
    "did-start-navigation",
    (_, url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace && origin && new URL(url).origin !== origin)
        runtime.release();
    },
  );
  app.on("before-quit", () => runtime.release());
  app.on("window-all-closed", () => app.quit());
  const configured = process.env.BRIDGAIN_DEVELOPER_URL;
  let saved;
  try {
    saved = JSON.parse(await readFile(join(root, "server.json"), "utf8")).origin;
  } catch {}
  if (configured || saved) {
    try {
      await connectServer(configured || saved);
    } catch {
      origin = "";
      await window.loadFile(landing);
    }
  } else await window.loadFile(landing);
  window.show();
  window.focus();
}
void main().catch((error) => {
  console.error("Bridgain desktop startup failed:", error);
  app.quit();
});
