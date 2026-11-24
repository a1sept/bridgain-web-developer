import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const config = fileURLToPath(new URL('../electron-builder.cjs', import.meta.url));
function inspect(env) {
  const script = `const config = require(process.argv[1]); console.log(JSON.stringify({mode:config.extraMetadata.desktopUpdateMode,force:config.forceCodeSigning,hasCertificate:process.env.CSC_LINK !== undefined,identity:config.mac.identity ?? null,entitlements:config.mac.entitlements,hardenedRuntime:config.mac.hardenedRuntime}));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script, config], {env:{...process.env,...env},encoding:'utf8'}));
}
test('empty CI signing secrets are absent before the packager reads them', () => {
  assert.deepEqual(inspect({CSC_LINK:'',CSC_KEY_PASSWORD:''}), {mode:'manual',force:false,hasCertificate:false,identity:'-',entitlements:'entitlements.mac-adhoc.plist',hardenedRuntime:true});
});
test('configured certificate requires signing and enables automatic updates', () => {
  assert.deepEqual(inspect({CSC_LINK:'fixture-certificate'}), {mode:'automatic',force:true,hasCertificate:true,identity:null,entitlements:'entitlements.mac.plist',hardenedRuntime:true});
});
