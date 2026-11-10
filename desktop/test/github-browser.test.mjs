import test from 'node:test';
import assert from 'node:assert/strict';
import { githubBrowserUrl, githubInstallationUrl } from '../security.mjs';
import { GithubAuth } from '../github-auth.mjs';
const state = `desktop.${'a'.repeat(64)}`;
const url = `https://github.com/login/oauth/authorize?client_id=app&state=${state}&code_challenge=challenge&code_challenge_method=S256`;
test('only exact GitHub authorization and installation routes can open', () => {
 assert.equal(githubBrowserUrl(url),url);
 assert.equal(githubInstallationUrl('https://github.com/apps/bridgain/installations/new'),'https://github.com/apps/bridgain/installations/new');
 for(const bad of [url.replace('github.com','github.com.evil.test'),url.replace('https:','http:'),url.replace('/login/oauth/authorize','/login'),`${url}#token`,url.replace(state,'web-state'),'file:///tmp/a'])assert.throws(()=>githubBrowserUrl(bad));
 for(const bad of ['https://evil.test/apps/bridgain/installations/new','https://github.com/settings/tokens','https://github.com/apps/bridgain/installations/new?secret=x'])assert.throws(()=>githubInstallationUrl(bad));
});
function setup({confirm=true,start,open}={}){
 const calls=[],opened=[];
 const api=async(path,body)=>{calls.push({path,body});if(path.endsWith('desktop-connect'))return start?start():{url,state,claimSecret:'main-only-secret'};if(path.endsWith('desktop-complete'))return body.confirm?{connected:true}:{ready:true,account:{login:'test-user',id:1}};return {ok:true};};
 const flow=new GithubAuth({api,openBrowser:async value=>{opened.push(value);if(open)await open();},confirmAccount:async account=>{assert.equal(account.login,'test-user');return confirm;},wait:async()=>{}});
 return {flow,calls,opened};
}
test('direct GitHub navigation and explicit account confirmation',async()=>{
 const {flow,calls,opened}=setup();assert.equal((await flow.connect()).connected,true);assert.deepEqual(opened,[url]);assert(!opened[0].includes('main-only-secret'));assert.equal(calls.filter(c=>c.body?.confirm).length,1);assert.equal(flow.active,null);
});
test('declining confirmation cancels without binding',async()=>{
 const {flow,calls}=setup({confirm:false});await assert.rejects(flow.connect(),/취소/);assert(!calls.some(c=>c.body?.confirm));assert(calls.some(c=>c.path.endsWith('desktop-cancel')));
});
test('cancel during delayed start never opens browser',async()=>{
 let resolve;const {flow,calls,opened}=setup({start:()=>new Promise(r=>resolve=r)});const pending=flow.connect();await flow.cancel();resolve({url,state,claimSecret:'main-only-secret'});await pending;assert.equal(opened.length,0);assert(!calls.some(c=>c.body?.confirm));assert(calls.some(c=>c.path.endsWith('desktop-cancel')));
});
test('concurrent attempt rejected without replacing original',async()=>{
 let resolve;const {flow}=setup({start:()=>new Promise(r=>resolve=r)});const pending=flow.connect();await assert.rejects(flow.connect(),/진행 중/);await flow.cancel();resolve({url,state,claimSecret:'secret'});await pending;
});
test('browser launch failure cleans transaction',async()=>{
 const {flow,calls}=setup({open:async()=>{throw Error('browser failed');}});await assert.rejects(flow.connect(),/browser failed/);assert(calls.some(c=>c.path.endsWith('desktop-cancel')));assert.equal(flow.active,null);
});
test('browser choice waits, switches with fresh state, and binds only the accepted account',async()=>{
 const calls=[],opened=[];let starts=0,polls=0;
 const api=async(path,body)=>{
  calls.push({path,body});
  if(path.endsWith('desktop-connect')){starts++;assert.equal(body.browserConfirmation,true);const next=`desktop.${String(starts).repeat(64)}`;return {state:next,claimSecret:`secret${starts}`,url:url.replace(state,next)};}
  if(path.endsWith('desktop-complete')){
   if(body.confirm){assert.equal(body.claimSecret,'secret2');return {connected:true};}
   return {ready:true,account:{login:starts===1?'old-account':'new-account'},decision:++polls===1?'pending':starts===1?'switch':'connect'};
  }
  return {ok:true};
 };
 const flow=new GithubAuth({api,openBrowser:async url=>opened.push(url),confirmAccount:async()=>{throw Error('redundant native confirmation');},wait:async()=>{}});
 await flow.connect();assert.equal(opened.length,2);assert.equal(calls.filter(c=>c.body?.confirm).length,1);
 assert(calls.some(c=>c.path.endsWith('desktop-cancel')&&c.body.claimSecret==='secret1'));
});
test('browser cancellation does not confirm or change the stored connection',async()=>{
 const calls=[];const api=async(path,body)=>{calls.push({path,body});if(path.endsWith('desktop-connect'))return{url,state,claimSecret:'secret'};return{ready:true,decision:'cancel'};};
 const flow=new GithubAuth({api,openBrowser:async()=>{},confirmAccount:async()=>{throw Error('unexpected');},wait:async()=>{}});
 await assert.rejects(flow.connect(),/취소/);assert(!calls.some(c=>c.body?.confirm));assert(calls.some(c=>c.path.endsWith('desktop-cancel')));
});
test('successful authentication reports installation so the desktop does not cover its browser',async()=>{
 const installUrl='https://github.com/apps/bridgain/installations/new',opened=[];
 const api=async(path,body)=>{
  if(path.endsWith('desktop-connect'))return {url,state,claimSecret:'secret'};
  if(path.endsWith('desktop-complete'))return body.confirm?{connected:true,installUrl}:{ready:true,decision:'connect'};
  throw Error('completed authentication must not be cancelled');
 };
 const flow=new GithubAuth({api,openBrowser:async value=>opened.push(value),wait:async()=>{}});
 assert.deepEqual(await flow.connect(),{connected:true,installUrl});
 assert.deepEqual(opened,[url,installUrl]);
});
