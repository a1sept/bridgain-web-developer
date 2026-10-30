import { githubBrowserUrl, githubInstallationUrl } from "./security.mjs";

// OAuth secrets stay in the main process, never in renderer state or browser URLs.
export class GithubAuth {
  constructor({ api, openBrowser, confirmAccount, apiFactory = () => api, wait = ms => new Promise(r => setTimeout(r, ms)), now = Date.now }) {
    Object.assign(this, { api, apiFactory, openBrowser, confirmAccount, wait, now });
    this.active = null;
  }
  async cancel() {
    const flow = this.active;
    this.active = null;
    if (flow) {
      flow.cancelled = true;
      if (flow.credentials) await flow.api("/api/workspace/github/desktop-cancel", flow.credentials).catch(() => {});
    }
  }
  async connect() {
    if (this.active) throw Error("GitHub 연결이 이미 진행 중입니다.");
    const flow = { cancelled: false, credentials: null, api: this.apiFactory() };
    this.active = flow;
    try {
      const result = await flow.api("/api/workspace/github/desktop-connect", {});
      flow.credentials = { state: result.state, claimSecret: result.claimSecret };
      if (flow.cancelled) {
        await flow.api("/api/workspace/github/desktop-cancel", flow.credentials).catch(() => {});
        return;
      }
      const url = githubBrowserUrl(result.url);
      if (new URL(url).searchParams.get("state") !== result.state ||
          typeof result.claimSecret !== "string" || !result.claimSecret)
        throw Error("GitHub 연결 응답을 확인해주세요.");
      await this.openBrowser(url);
      const deadline = this.now() + 10 * 60 * 1000;
      while (!flow.cancelled && this.now() < deadline) {
        await this.wait(1500);
        if (flow.cancelled) return;
        const status = await flow.api("/api/workspace/github/desktop-complete", flow.credentials);
        if (flow.cancelled) return;
        if (!status.ready) continue;
        const approved = await this.confirmAccount(status.account);
        if (flow.cancelled) return;
        if (!approved) throw Error("GitHub 계정 연결을 취소했습니다.");
        const complete = await flow.api("/api/workspace/github/desktop-complete", { ...flow.credentials, confirm: true });
        if (!complete.connected) throw Error("GitHub 연결을 완료하지 못했습니다.");
        // Finalization consumed the transaction. Never undo a completed connection on cleanup.
        flow.credentials = null;
        if (!flow.cancelled && complete.installUrl)
          await this.openBrowser(githubInstallationUrl(complete.installUrl));
        return;
      }
      if (!flow.cancelled) throw Error("GitHub 연결 시간이 만료됐어요. 다시 연결해주세요.");
    } finally {
      if (this.active === flow) this.active = null;
      if (flow.credentials && !flow.cancelled)
        await flow.api("/api/workspace/github/desktop-cancel", flow.credentials).catch(() => {});
    }
  }
}
