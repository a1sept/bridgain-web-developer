import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setImmediate as nextTurn } from "node:timers/promises";
import { remoteOrigin, isServiceUrl, externalUrl } from "./remote-security.mjs";

async function main() {
  // Keep this viewer separate from the existing AI-enabled desktop session.
  app.setPath("userData", join(app.getPath("appData"), "Bridgain Remote"));
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  await app.whenReady();
  let origin;
  try { origin = remoteOrigin(process.env.BRIDGAIN_REMOTE_URL); }
  catch (error) {
    dialog.showErrorBox("웹앱 주소 설정 필요", error.message);
    app.quit();
    return;
  }
  const errorFile = join(import.meta.dirname, "remote-error.html");
  const errorUrl = pathToFileURL(errorFile).href;
  const retryUrl = `${errorUrl}?retry=1`;
  const window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 800, minHeight: 600,
    title: "Bridgain Remote",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, partition: "persist:bridgain-remote",
      // No preload: remote content has no desktop IPC or filesystem bridge.
    },
  });
  const contents = window.webContents;
  let timer;
  let showingError = false;
  let navigationGeneration = 0;
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  async function showError(reason) {
    clearTimer();
    if (showingError || window.isDestroyed()) return;
    showingError = true;
    const generation = ++navigationGeneration;
    console.error(`Remote web app could not load: ${reason}`);
    // Do not start loadFile inside did-navigate/did-fail-load dispatch: Electron
    // may still be settling the failed loadURL promise against those events.
    await nextTurn();
    if (generation !== navigationGeneration || window.isDestroyed()) return;
    contents.stop();
    try { await window.loadFile(errorFile); }
    catch (error) {
      if (generation === navigationGeneration && error.code !== "ERR_ABORTED" && error.errno !== -3)
        console.error("Could not load connection error page:", error.message);
    }
  }
  const startTimer = () => {
    clearTimer();
    timer = setTimeout(() => void showError("connection timed out after 30 seconds"), 30000);
  };
  async function connect() {
    const generation = ++navigationGeneration;
    showingError = false;
    startTimer();
    try { await window.loadURL(origin); }
    catch (error) {
      if (generation === navigationGeneration && error.code !== "ERR_ABORTED" && error.errno !== -3)
        await showError(error.code || "network error");
    }
  }
  function openExternal(value) {
    const url = externalUrl(value);
    if (url) void shell.openExternal(url).catch((error) => console.error("Browser could not open:", error.message));
  }
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-frame-navigate", (event) => {
    if (event.isMainFrame && showingError && contents.getURL() === errorUrl && event.url === retryUrl) {
      event.preventDefault();
      void connect();
      return;
    }
    if (!isServiceUrl(event.url, origin)) {
      event.preventDefault();
      if (event.isMainFrame) openExternal(event.url);
    }
  });
  contents.on("will-redirect", (event, url, _inPlace, isMainFrame) => {
    if (!isServiceUrl(url, origin)) {
      event.preventDefault();
      if (isMainFrame) {
        openExternal(url);
        void showError("redirect outside configured service origin");
      }
    }
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.on("did-start-navigation", (_event, url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace && isServiceUrl(url, origin)) startTimer();
  });
  contents.on("did-navigate", (_event, url, status) => {
    if (isServiceUrl(url, origin) && status >= 400) void showError(`HTTP ${status}`);
  });
  contents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isServiceUrl(url, origin)) void showError(`network error ${code}`);
  });
  contents.on("did-finish-load", clearTimer);
  contents.on("render-process-gone", () => void showError("renderer stopped"));
  contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
  window.on("closed", clearTimer);
  app.on("second-instance", () => {
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  });
  app.on("activate", () => { if (!window.isDestroyed()) { window.show(); window.focus(); } });
  app.on("window-all-closed", () => app.quit());
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Bridgain", submenu: [
      { label: "서버 다시 연결", click: () => void connect() },
      { role: "quit" },
    ] },
    { role: "editMenu" },
    { role: "viewMenu" },
  ]));
  await connect();
}
void main().catch((error) => { console.error("Remote viewer startup failed:", error); app.quit(); });
