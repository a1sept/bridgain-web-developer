// Verify the shipped DMG, not just the build directory. No user account or server is used.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const { _electron } = require('playwright');
const exec = promisify(execFile);
assert.equal(process.platform, 'darwin', 'Run this installer verification on macOS');
const {version} = JSON.parse(await readFile(new URL('../desktop/package.json', import.meta.url), 'utf8'));
const dmg = resolve(`desktop/release/Bridgain-${version}-mac-arm64.dmg`);
const temp = await mkdtemp(join(tmpdir(), 'bridgain-installer-'));
const mount = join(temp, 'mounted'), installed = join(temp, 'Bridgain.app'), profile = join(temp, 'profile');
let mounted = false, app;
try {
  await mkdir(mount);
  await exec('hdiutil', ['verify', dmg], {timeout: 120000});
  await exec('hdiutil', ['attach', dmg, '-readonly', '-nobrowse', '-mountpoint', mount], {timeout: 60000});
  mounted = true;
  await exec('ditto', [join(mount, 'Bridgain.app'), installed], {timeout: 120000});
  await exec('codesign', ['--verify', '--deep', '--strict', '--verbose=2', installed], {timeout: 120000});
  const signature = await exec('codesign', ['--display', '--verbose=4', installed]);
  console.log(signature.stderr.split('\n').filter(line => /^(Identifier|Signature|Authority|TeamIdentifier)=/.test(line)).join('\n'));
  const env = {...process.env, BRIDGAIN_DEVELOPER_URL: ''};
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: join(installed, 'Contents/MacOS/Bridgain'),
    args: [`--user-data-dir=${profile}`], env, timeout: 60000,
  });
  const window = await app.firstWindow({timeout: 30000});
  await window.getByRole('heading', {name: '작업할 서버에 연결하세요'}).waitFor();
  assert.equal((await window.evaluate(() => window.bridgainDesktop.updateState())).version, version);
  const result = await app.evaluate(async ({app}) => {
    const {createRequire} = process.getBuiltinModule('module');
    const require = createRequire(app.getAppPath() + '/package.json');
    const pty = require('node-pty');
    const output = await new Promise((resolve, reject) => {
      let text = '';
      const terminal = pty.spawn('/bin/sh', ['-c', 'printf packaged-pty-ok'], {cwd: app.getPath('temp'), env: process.env, cols: 80, rows: 24});
      const timeout = setTimeout(() => { terminal.kill(); reject(Error('Packaged PTY timed out')); }, 10000);
      terminal.onData(data => { text += data; });
      terminal.onExit(() => { clearTimeout(timeout); resolve(text); });
    });
    return {packaged: app.isPackaged, arch: process.arch, output, profile: app.getPath('userData')};
  });
  assert.equal(result.packaged, true);
  assert.equal(result.arch, 'arm64');
  assert.equal(result.profile, profile);
  assert.match(result.output, /packaged-pty-ok/);
  await window.screenshot({path: resolve('desktop/release/mac-install-smoke.png')});
  console.log(`PASS ${version}: DMG integrity, copied app signature, Apple Silicon launch, server connection screen, preload and native PTY. Download quarantine / Gatekeeper approval still requires an end-user Mac check.`);
} finally {
  await app?.close();
  if (mounted) await exec('hdiutil', ['detach', mount], {timeout: 60000});
  await rm(temp, {recursive: true, force: true});
}
