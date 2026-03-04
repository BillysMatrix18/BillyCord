/**
 * electron-builder configuration
 * @see https://www.electron.build/configuration
 */
module.exports = {
  appId: 'com.discord-clone.app',
  productName: 'Discord Clone',
  copyright: 'Copyright © 2024 Discord Clone',

  directories: {
    output: 'dist-electron',
    buildResources: 'build',
  },

  files: [
    // Electron main + preload
    'electron/**/*',
    // Compiled server
    'server/dist/**/*',
    'server/package.json',
    'server/node_modules/**/*',
    // Built client (served by the server)
    'client/dist/**/*',
    // Root package
    'package.json',
  ],

  extraResources: [
    // Include server + client as extra resources so they're accessible at runtime
    {
      from: 'server/dist',
      to: 'server/dist',
      filter: ['**/*'],
    },
    {
      from: 'server/node_modules',
      to: 'server/node_modules',
      filter: ['**/*'],
    },
    {
      from: 'server/package.json',
      to: 'server/package.json',
    },
    {
      from: 'client/dist',
      to: 'client/dist',
      filter: ['**/*'],
    },
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
    shortcutName: 'Discord Clone',
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    installerHeaderIcon: 'build/icon.ico',
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    installerSidebar: null,
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
    maintainer: 'Discord Clone',
  },

  // Publish (disabled - manual distribution)
  publish: null,

  // asar packaging — disable so server can fork properly
  asar: false,
};
