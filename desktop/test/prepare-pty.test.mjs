import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,chmod,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {preparePty} from '../prepare-pty.mjs';
test('Darwin installation repairs helper execute permission idempotently',async t=>{
 const root=await mkdtemp(join(tmpdir(),'pty-install-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const dir=join(root,'prebuilds/darwin-arm64');await mkdir(dir,{recursive:true});
 const helper=join(dir,'spawn-helper');await writeFile(helper,'fixture');await chmod(helper,0o640);
 preparePty(root,'linux','arm64');assert.equal((await stat(helper)).mode&0o777,0o640);
 preparePty(root,'darwin','arm64');assert.equal((await stat(helper)).mode&0o777,0o740);
 preparePty(root,'darwin','arm64');assert.equal((await stat(helper)).mode&0o777,0o740);
});
