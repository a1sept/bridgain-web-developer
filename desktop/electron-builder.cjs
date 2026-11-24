// GitHub supplies an empty string for an unset secret. electron-builder treats
// an empty CSC_LINK as a certificate path (the current directory), not as absent.
for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD']) {
  if (process.env[key] === '') delete process.env[key];
}
const repository = process.env.DESKTOP_RELEASE_REPOSITORY || 'a1sept/bridgain-web-developer';
if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error('Set DESKTOP_RELEASE_REPOSITORY to the public owner/repository hosting desktop releases.');
}
const [owner, repo] = repository.split('/');
module.exports = {
  appId: 'com.bridgain.desktop',
  productName: 'Bridgain',
  extraMetadata: {
    desktopReleaseRepository: repository,
    desktopUpdateMode: process.env.CSC_LINK ? 'automatic' : 'manual',
  },
  directories: { output: 'release' },
  artifactName: 'Bridgain-${version}-${os}-${arch}.${ext}',
  files: ['*.mjs', '*.cjs', '*.html', '*.css', '*.js', 'providers/**', 'package.json', '!electron-builder.cjs', '!check.mjs', '!prepare-pty.mjs', '!remote*'],
  asarUnpack: ['node_modules/node-pty/**'],
  npmRebuild: true,
  forceCodeSigning: Boolean(process.env.CSC_LINK),
  publish: [{ provider: 'github', owner, repo, releaseType: 'release' }],
  mac: {
    target: ['dmg', 'zip'], category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    entitlements: 'entitlements.mac.plist', entitlementsInherit: 'entitlements.mac.plist',
    notarize: Boolean(process.env.APPLE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD),
  },
  win: { target: ['nsis'] },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false },
  linux: { target: ['AppImage'], category: 'Development' },
  afterPack: async context => {
    if (context.electronPlatformName !== 'darwin') return;
    const { join } = require('node:path');
    const { preparePty } = await import('./prepare-pty.mjs');
    const root = join(context.appOutDir, 'Bridgain.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty');
    preparePty(root, 'darwin', context.arch === 3 ? 'arm64' : 'x64');
  },
};
