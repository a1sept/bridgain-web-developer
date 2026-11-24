// Run with a local Vite server on 15411; uses only fixture UI and an isolated desktop profile.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { chromium, _electron } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const profile = await mkdtemp(join(tmpdir(), 'bridgain-update-check-'));
let app;
try {
  const page = await browser.newPage({ viewport: {width: 1000, height: 700} });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__state = {phase:'idle',version:'0.1.0',availableVersion:null,percent:0,message:''};
    window.bridgainDesktop = {
      updateState: async () => window.__state,
      onUpdate: cb => { window.__update = cb; return () => {}; },
      updateApp: () => new Promise(resolve => { window.__finish = resolve; window.__update({...window.__state,phase:'downloading',percent:42}); }),
    };
  });
  await page.route('**/__update_check', route => route.fulfill({contentType:'text/html', body:`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
const {default:React}=await import('/node_modules/.vite/deps/react.js'); const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
const {default:Button}=await import('/src/components/DesktopUpdateButton.tsx'); await import('/src/developer-shell.css');
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('div',{className:'ds-shell'},React.createElement('aside',{className:'ds-rail'},React.createElement(Button))));
</script></body></html>`}));
  await page.goto('http://127.0.0.1:15411/__update_check');
  const button = page.locator('.desktop-update button');
  await button.waitFor(); await page.waitForFunction(() => getComputedStyle(document.querySelector('.desktop-update button')).fontSize === '10px'); await button.hover(); await button.focus();
  assert.equal(await button.textContent(),'업데이트');
  assert((await button.boundingBox()).width <= 52);
  await page.screenshot({path:'/tmp/bridgain-update-button.png'});
  await button.click(); await page.getByText('42%',{exact:true}).waitFor(); assert(await button.isDisabled());
  await page.evaluate(() => { const ready={...window.__state,phase:'ready',availableVersion:'0.2.0',percent:100};window.__update(ready);window.__finish(ready); });
  await page.getByText('설치하기',{exact:true}).waitFor(); assert(await button.isEnabled());
  await page.evaluate(() => window.__update({...window.__state,phase:'error',message:'네트워크 오류'}));
  await page.getByText('다시 시도',{exact:true}).waitFor(); assert.match(await button.getAttribute('title'),/네트워크 오류/);
  await page.setViewportSize({width:390,height:700}); await page.evaluate(() => document.querySelector('.ds-shell').classList.add('ds-menu-open'));
  assert(await button.isVisible()); assert((await button.boundingBox()).width <= 88);
  assert.deepEqual(errors,[]);
  app = await _electron.launch({executablePath:resolve('desktop/release/linux-unpacked/@bridgaindesktop'),args:['--no-sandbox',`--user-data-dir=${profile}`],env:{...process.env,BRIDGAIN_DEVELOPER_URL:''}});
  const window = await app.firstWindow();
  const state = await window.evaluate(() => window.bridgainDesktop.updateState()); assert.equal(state.version,'0.1.0');
  const native = await app.evaluate(async ({app,Menu}) => {
    const {createRequire}=process.getBuiltinModule('module'); const require=createRequire(app.getAppPath()+'/package.json');
    const pty=require('node-pty');
    const output=await new Promise((resolve,reject)=>{ let result=''; const process=pty.spawn('/bin/sh',['-c','printf packaged-pty-ok'],{cols:80,rows:24,cwd:app.getPath('temp'),env:{PATH:'/usr/bin:/bin'}}); process.onData(data=>result+=data); process.onExit(()=>resolve(result)); setTimeout(()=>reject(Error('PTY timed out')),5000).unref(); });
    return {packaged:app.isPackaged,output,menu:Menu.getApplicationMenu().items[0].submenu.items.map(i=>i.label),profile:app.getPath('userData')};
  });
  assert(native.packaged); assert.match(native.output,/packaged-pty-ok/); assert.equal(native.profile,profile); assert(native.menu.includes('업데이트 확인 / 화면 새로고침'));
  console.log('PASS: update button idle/progress/ready/error, hover/focus/narrow layout; packaged Electron preload, menu, isolated profile and native PTY.');
} finally { await app?.close(); await browser.close(); await rm(profile,{recursive:true,force:true}); }
