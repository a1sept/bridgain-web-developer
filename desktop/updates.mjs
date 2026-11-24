// All update decisions stay in the trusted main process. Renderer supplies no URL.
export class DesktopUpdates {
  constructor({ updater, version, packaged, manualInstall = false, openDownload, confirm, reload, emit }) {
    Object.assign(this, { updater, confirm, reload, emit, packaged, manualInstall, openDownload });
    this.state = { phase: 'idle', version, availableVersion: null, percent: 0, message: '' };
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('update-available', info => this.set({ phase: 'available', availableVersion: info.version }));
    updater.on('update-not-available', () => this.set({ phase: 'current', availableVersion: null }));
    updater.on('download-progress', info => this.set({ phase: 'downloading', percent: Math.round(info.percent) }));
    updater.on('update-downloaded', info => this.set({ phase: 'ready', availableVersion: info.version, percent: 100 }));
    // electron-updater also emits error when its returned promise rejects.
    updater.on('error', () => this.set({ phase: 'error', message: '업데이트 서버에 연결하지 못했거나 파일을 확인하지 못했습니다. 다시 시도해주세요.' }));
  }
  set(patch) { Object.assign(this.state, patch); this.emit({ ...this.state }); }
  snapshot() { return { ...this.state }; }
  run() {
    if (this.pending) return this.pending;
    this.pending = this.perform().finally(() => { this.pending = null; });
    return this.pending;
  }
  async refresh(message) {
    if (await this.confirm('화면 새로고침', message + '\n저장하지 않은 내용을 먼저 저장해주세요. 화면을 새로 불러올까요?', '새로고침')) this.reload();
  }
  async perform() {
    try {
      if (!this.packaged) {
        await this.refresh('소스로 실행 중이어서 앱 자동 업데이트는 사용할 수 없습니다.');
        return this.snapshot();
      }
      if (this.state.phase !== 'ready') {
        this.set({ phase: 'checking', message: '', percent: 0, availableVersion: null });
        const result = await this.updater.checkForUpdates();
        if (!result || !['available', 'current'].includes(this.state.phase)) throw Error('No update result');
        if (this.state.phase === 'current') {
          await this.refresh('데스크톱 앱은 최신 버전입니다.');
          return this.snapshot();
        }
        if (this.manualInstall) {
          if (await this.confirm('새 버전 다운로드', `${this.state.availableVersion} 버전이 있습니다. 다운로드 페이지에서 Apple Silicon용 DMG를 받아 앱을 종료하고 교체해주세요. 기존 설정은 유지됩니다.`, '다운로드 페이지 열기')) await this.openDownload(this.state.availableVersion);
          return this.snapshot();
        }
        if (!await this.confirm('새 버전 다운로드', `${this.state.availableVersion} 버전을 다운로드할까요?`, '다운로드')) return this.snapshot();
        this.set({ phase: 'downloading' });
        await this.updater.downloadUpdate();
        if (this.state.phase !== 'ready') throw Error('Download incomplete');
      }
      if (await this.confirm('업데이트 설치', '저장하지 않은 파일을 먼저 저장하고 실행 중인 터미널·AI 작업을 마쳐주세요. 앱을 종료하고 새 버전을 설치할까요?', '재시작하여 설치')) {
        this.updater.quitAndInstall(false, true);
      }
    } catch {
      this.set({ phase: 'error', message: '업데이트 확인 또는 다운로드에 실패했습니다. 업데이트 버튼으로 다시 시도할 수 있습니다.' });
      // Failure is not reported as “latest”. Web refresh remains available offline from the feed.
      await this.refresh('앱 업데이트에 실패했습니다. 서버 화면만 새로 불러올 수 있습니다.');
    }
    return this.snapshot();
  }
}
