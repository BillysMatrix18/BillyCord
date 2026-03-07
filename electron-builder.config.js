/**
 * electron-builder configuration
 * @see https://www.electron.build/configuration
 */
module.exports = {
  appId: 'com.billycord.app',
  productName: 'BillyCord 0.1.1',
  copyright: 'Copyright © 2024 BillyCord',

  directories: {
    output: 'dist-electron',
    buildResources: 'build',
  },

  files: [
    // Electron main + preload (thin client — no server/client bundled)
    'electron/**/*',
    'package.json',
  ],

  // Windows configuration
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: 'build/icon.png',
  },

  // NSIS installer configuration
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'BillyCord 0.1.1',
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
  },

  // macOS configuration
  mac: {
    target: ['dmg'],
    icon: 'build/icon.png',
    category: 'public.app-category.social-networking',
  },

  // Linux configuration
  linux: {
    target: ['AppImage', 'deb'],
    icon: 'build/icon.png',
    category: 'Network;Chat;InstantMessaging;',
    maintainer: 'BillyCord',
  },

  // Publish to GitHub Releases for auto-updates
  publish: {
    provider: 'github',
    owner: 'BillysMatrix18',
    repo: 'BillyCord',
    releaseType: 'release',
  },

  // asar packaging — enabled since no server forking needed
  asar: true,
};
