import {test} from 'node:test';
import assert from 'node:assert/strict';
import {realpath,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout} from 'node:timers/promises';
import {TerminalSessions} from '../terminal.mjs';
test('real PTY: cwd, input, resize, reattach, isolation and release',async t=>{
 const cwd=await realpath(await mkdtemp(join(tmpdir(),'bridgain-pty-'))), manager=new TerminalSessions();t.after(async()=>{manager.release();await rm(cwd,{recursive:true,force:true});});
 const s=await manager.open('owner','project',cwd,{cols:90,rows:20});
 manager.action('owner','project',s.id,cwd,'input',{data:"printf 'BRIDGAIN_%s\\n' \"$PWD\"\r"});
 let read;for(let i=0;i<50;i++){await setTimeout(50);read=manager.action('owner','project',s.id,cwd,'read',{cursor:0});if(read.data.includes('BRIDGAIN_'+cwd))break;}
 assert(read.data.includes('BRIDGAIN_'+cwd));
 assert.equal((await manager.open('owner','project',cwd)).id,s.id);
 assert.throws(()=>manager.action('other','project',s.id,cwd,'input',{data:'bad'}),/연결/);
 assert.throws(()=>manager.action('owner','other',s.id,cwd,'read',{}),/연결/);
 manager.action('owner','project',s.id,cwd,'resize',{cols:100,rows:30});
 manager.action('owner','project',s.id,cwd,'input',{data:'stty size\r'});
 for(let i=0;i<50;i++){await setTimeout(50);read=manager.action('owner','project',s.id,cwd,'read',{cursor:0});if(read.data.includes('30 100'))break;}
 assert(read.data.includes('30 100'));
 manager.action('owner','project',s.id,cwd,'input',{data:"sleep 30 & printf 'JOB_PID=%s\\n' $!\r"});
 let child;for(let i=0;i<50;i++){await setTimeout(50);const data=manager.action('owner','project',s.id,cwd,'read',{cursor:0}).data;child=Number(data.match(/JOB_PID=(\d+)/)?.[1]);if(child)break;}
 assert(child);manager.release();assert.equal(manager.sessions.size,0);
 await setTimeout(100);try{process.kill(child,0);const {readFile}=await import('node:fs/promises');assert.match(await readFile(`/proc/${child}/stat`,'utf8'),/\) Z /);}catch(e){if(e.code!=='ESRCH'&&e.code!=='ENOENT')throw e;}

});

test('concurrent opens enforce four slots and same-project opens reuse a session',async t=>{
 const manager=new TerminalSessions();t.after(()=>manager.release());
 const cwd=await realpath(tmpdir());
 const results=await Promise.allSettled(Array.from({length:5},(_,i)=>manager.open('owner',`project-${i}`,cwd)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,4);
 assert.equal(manager.sessions.size,4);
 assert.match(results.find(r=>r.status==='rejected').reason.message,/최대 4개/);
 const first=results[0].value;
 assert.equal((await manager.open('owner','project-0',cwd)).id,first.id);
 manager.release();
 const same=await Promise.all(Array.from({length:5},()=>manager.open('owner','same',cwd)));
 assert.equal(new Set(same.map(s=>s.id)).size,1);
 assert.equal(manager.sessions.size,1);
});
