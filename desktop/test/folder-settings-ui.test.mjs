import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Actual settings render with unrelated panels/API context stubbed.
// Middleware mode never listens or starts a browser, API or database.
test('folder controls stay visible with and without the desktop bridge', async () => {
  const stubs = {
    './ai/AiWorkspace': 'export const useAi = () => ({ folders: {}, refreshFolders: async () => {} });',
    './RepositoryAccess': 'export default () => null;',
    './RepositoryFields': 'export default () => null;',
    './StageSettings': 'export default () => null;',
    './repository-access': 'export const requestForRepositoryFailure = async () => "";',
  };
  const server = await createServer({
    configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, root: fileURLToPath(new URL('../../', import.meta.url)),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    plugins: [{ name: 'settings-fixture', enforce: 'pre',
      resolveId(id, importer) {
        if (importer?.endsWith('/ProjectSettings.tsx') && id in stubs) return '\0fixture:' + id;
      },
      load(id) { if (id.startsWith('\0fixture:')) return stubs[id.slice(9)]; },
    }, react()],
  });
  const previous = globalThis.window;
  try {
    const { default: Settings } = await server.ssrLoadModule('/src/ProjectSettings.tsx');
    const props = { project: { id: 'project', name: 'Test', description: '', status: 'preparing', repositoryUrls: ['https://github.com/example/repo'] }, canManage: true, onSave: async () => {} };
    for (const desktop of [true, false]) {
      globalThis.window = { bridgainDesktop: desktop ? {} : undefined };
      const html = renderToStaticMarkup(React.createElement(Settings, props));
      for (const label of ['기존 디렉토리 연결', '새 디렉토리 연결']) {
        const button = html.match(new RegExp('<button[^>]*>' + label + '</button>'))?.[0];
        assert.ok(button, label + ' must remain visible');
        assert.equal(button.includes('disabled'), !desktop);
      }
      if (!desktop) assert.match(html, /로컬 연결을 사용할 수 없습니다/);
      else {
        assert.match(html, /<details class="project-local-details">/);
        assert.ok(html.indexOf('프로젝트 정보 · GitHub 저장소') < html.indexOf('내 PC 작업 폴더 연결'));
      }
    }
  } finally {
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
    await server.close();
  }
});
