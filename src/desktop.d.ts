export type TaskWorkspace = { folder?: string; binding?: { path: string; branch: string; baseBranch: string; repositoryUrl: string } };
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
