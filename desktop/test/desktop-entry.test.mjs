import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('standard launch retains the filesystem-enabled desktop entry', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  const parent = JSON.parse(await readFile(new URL('../../package.json', import.meta.url)));
  assert.equal(parent.scripts.desktop, 'npm --prefix desktop start');
  assert.equal(pkg.scripts.start, 'electron main.mjs');
  assert.equal(pkg.main, 'main.mjs');
});

test('real preload exposes folder, clone and access IPC and propagates failures', async () => {
  let bridge;
  const calls = [];
  let response = { ok: true, value: '/workspace/project' };
  runInNewContext(await readFile(new URL('../preload.cjs', import.meta.url), 'utf8'), {
    require(name) {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld(name, value) {
          assert.equal(name, 'bridgainDesktop'); bridge = value;
        } },
        ipcRenderer: { invoke: async (...args) => { calls.push(args); return response; } },
      };
    },
  });
  assert.equal(await bridge.chooseFolder('project'), '/workspace/project');
  await bridge.cloneProject('project', 'https://github.com/example/repo');
  await bridge.checkRepositoryAccess('project', 'https://github.com/example/repo');
  assert.deepEqual(calls, [
    ['bridgain:folder', 'project'],
    ['bridgain:clone-project', 'project', 'https://github.com/example/repo'],
    ['bridgain:check-repository-access', 'project', 'https://github.com/example/repo'],
  ]);
  response = { ok: false, error: '폴더 연결 실패' };
  await assert.rejects(bridge.chooseFolder('project'), /폴더 연결 실패/);
});
