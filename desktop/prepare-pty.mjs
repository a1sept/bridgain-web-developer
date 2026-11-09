import { chmodSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// node-pty's published Darwin helper can lose its executable bit on installation.
export function preparePty(root, platform = process.platform, arch = process.arch) {
  if (platform !== 'darwin') return;
  for (const dir of ['build/Release', 'build/Debug', `prebuilds/${platform}-${arch}`]) {
    const helper = join(root, dir, 'spawn-helper');
    if (!existsSync(helper)) continue;
    const stat = statSync(helper);
    if (stat.isFile() && !(stat.mode & 0o100)) chmodSync(helper, stat.mode | 0o100);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  preparePty(dirname(createRequire(import.meta.url).resolve('node-pty/package.json')));
}
