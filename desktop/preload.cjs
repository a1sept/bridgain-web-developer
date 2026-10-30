const { contextBridge, ipcRenderer } = require("electron");
const call = (name, ...args) =>
  ipcRenderer.invoke("bridgain:" + name, ...args).then((r) => {
    if (!r.ok) throw new Error(r.error);
    return r.value;
  });
contextBridge.exposeInMainWorld(
  "bridgainDesktop",
  Object.freeze({
    connectGithub: () => call("connect-github"),
    cancelGithub: () => call("cancel-github"),
    connectServer: (url) => call("connect-server", url),
    taskWorkspace: (pid, id, action, options) => call("task-workspace", pid, id, action, options),
    taskGit: (pid, id, action, options) => call("task-git", pid, id, action, options),
    checkRepositoryAccess: (pid, url) => call("check-repository-access", pid, url),
    cloneProject: (pid, url) => call("clone-project", pid, url),
    repositoryState: (pid) => call("repository-state", pid),
    state: () => call("state"),
    syncProjects: () => call("sync-projects"),
    openCodex: (sessionId) => call("open-codex", sessionId),
    connect: (provider) => call("connect", provider),
    disconnect: (provider) => call("disconnect", provider),
    chooseFolder: (projectId) => call("folder", projectId),
    clearFolder: (projectId) => call("clear-folder", projectId),
    run: (projectId, sessionId, message) =>
      call("run", projectId, sessionId, message),
    stop: (sessionId) => call("stop", sessionId),
    release: () => call("release"),
    onEvent: (listener) => {
      const handle = (_, event) => listener(event);
      ipcRenderer.on("bridgain:event", handle);
      return () => ipcRenderer.removeListener("bridgain:event", handle);
    },
  }),
);
