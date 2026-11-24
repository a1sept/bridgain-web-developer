import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DesktopUpdates } from '../updates.mjs';
function fixture({ available = false, packaged = true, answers = [], manualInstall = false } = {}) {
  const updater = new EventEmitter();
  const calls = [], events = [];
  updater.checkForUpdates = async () => { calls.push('check'); updater.emit(available ? 'update-available' : 'update-not-available', { version: '0.2.0' }); return {}; };
  updater.downloadUpdate = async () => { calls.push('download'); updater.emit('download-progress', {percent: 42.4}); updater.emit('update-downloaded', {version: '0.2.0'}); };
  updater.quitAndInstall = (...args) => calls.push(['install', ...args]);
  const service = new DesktopUpdates({ updater, packaged, version: '0.1.0', manualInstall,
    confirm: async () => answers.shift() ?? false, reload: () => calls.push('reload'), emit: state => events.push(state),
    openDownload: async v => calls.push(['open', v]),
  });
  return { service, updater, calls, events };
}
test('latest app refreshes only after consent', async () => {
  const f = fixture({answers:[true]}); await f.service.run();
  assert.deepEqual(f.calls, ['check','reload']);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  const cancelled = fixture(); await cancelled.service.run(); assert.deepEqual(cancelled.calls, ['check']);
});
test('download progress, defer installation, install without redownload', async () => {
  const answers = [true, false]; const f = fixture({available:true, answers});
  await f.service.run(); assert.equal(f.service.snapshot().phase, 'ready');
  assert(f.events.some(s => s.phase === 'downloading' && s.percent === 42));
  answers.push(true); await f.service.run();
  assert.deepEqual(f.calls, ['check','download',['install',false,true]]);
});
test('unsigned Mac opens download page without attempting automatic installation', async () => {
  const f = fixture({available:true, manualInstall:true, answers:[true]}); await f.service.run();
  assert.deepEqual(f.calls, ['check',['open','0.2.0']]);
});
test('cancel download leaves the workspace alone', async () => {
  const f = fixture({available:true}); await f.service.run(); assert.deepEqual(f.calls,['check']);
});
test('network failure is not latest; retry can recover', async () => {
  const f = fixture(); const check = f.updater.checkForUpdates;
  f.updater.checkForUpdates = async () => { throw Error('offline'); };
  await f.service.run(); assert.equal(f.service.snapshot().phase, 'error'); assert.deepEqual(f.calls, []);
  f.updater.checkForUpdates = check; await f.service.run(); assert.equal(f.service.snapshot().phase,'current');
});
test('failed download never installs', async () => {
  const f = fixture({available:true, answers:[true]});
  f.updater.downloadUpdate = async () => { f.updater.emit('error', Error('signature')); throw Error('signature'); };
  await f.service.run(); assert.equal(f.service.snapshot().phase,'error'); assert.deepEqual(f.calls,['check']);
});
test('concurrent requests share one check and one dialog flow', async () => {
  const f = fixture({answers:[true]}); let release;
  f.updater.checkForUpdates = async () => { f.calls.push('check'); await new Promise(r => { release = r; }); f.updater.emit('update-not-available'); return {}; };
  const a = f.service.run(), b = f.service.run(); assert.equal(a,b); release(); await a;
  assert.deepEqual(f.calls,['check','reload']);
});
test('source development never contacts the release feed', async () => {
  const f = fixture({packaged:false, answers:[true]}); await f.service.run(); assert.deepEqual(f.calls,['reload']);
});
