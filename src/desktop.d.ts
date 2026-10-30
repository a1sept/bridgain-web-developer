export type GitCommitDetail = { sha: string; files: { path: string; status: string; originalPath?: string; diff: string; limited?: boolean }[]; limited: boolean };
export type TaskWorkspace = { folder?: string; binding?: { path: string; branch: string; baseBranch: string; repositoryUrl: string } };
export type GitState = { files: { path: string; status: string; originalPath?: string }[]; head: string; remoteSha: string | null; ahead: number | null; behind: number | null; checkedAt: string; history: { sha: string; subject: string; author: string; date: string }[] };
export type RepositoryState = { path: string; repositoryUrl: string; branch: string; authorConfigured?: boolean };
export type AiProviderName = "codex" | "claude";
export type Connection = {
  connected: boolean;
  installed: boolean | null;
  account: string | null;
  plan?: string | null;
  error?: string;
};
export type CodexSync = { synced: number; error?: string };
export type DesktopState = {
  codexSync?: CodexSync;
  providers: Record<AiProviderName, Connection>;
  folders: Record<string, string>;
  running: string[];
};
export type DesktopEvent = {
  type:
    | "started"
    | "messages"
    | "delta"
    | "completed"
    | "interrupted"
    | "error"
    | "tool"
    | "connections";
  sessionId?: string;
  text?: string;
  message?: string;
  name?: string;
};
export type DesktopBridge = {
  connectGithub?: () => Promise<void>;
  cancelGithub?: () => Promise<void>;
  cloneProject?: (pid: string, repositoryUrl: string) => Promise<RepositoryState | null>;
  repositoryState?: (pid: string) => Promise<RepositoryState | null>;
  taskGit?: (pid: string, id: string, action?: string, options?: Record<string, unknown>) => Promise<any>;
  taskWorkspace: (projectId: string, taskId: string, action?: "state" | "start" | "open",
    options?: { branch: string; baseBranch: string; existing: boolean }) => Promise<TaskWorkspace>;
  connectServer: (url: string) => Promise<void>;
  state: () => Promise<DesktopState>;
  syncProjects?: () => Promise<CodexSync>;
  openCodex?: (sessionId: string) => Promise<void>;
  connect: (
    provider: AiProviderName,
  ) => Promise<{ verificationUrl?: string; userCode?: string }>;
  disconnect: (provider: AiProviderName) => Promise<void>;
  chooseFolder: (projectId: string) => Promise<string | null>;
  clearFolder: (projectId: string) => Promise<void>;
  run: (
    projectId: string,
    sessionId: string,
    message: string,
  ) => Promise<{ started: boolean }>;
  stop: (sessionId: string) => Promise<void>;
  release: () => Promise<void>;
  onEvent: (listener: (event: DesktopEvent) => void) => () => void;
};
declare global {
  interface Window {
    bridgainDesktop?: DesktopBridge;
  }
}
