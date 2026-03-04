module.exports = {
  appId: 'com.billycord.admin',
  productName: 'BillyCord Admin',
  copyright: 'Copyright © 2024 BillyCord',

  directories: {
    output: 'dist',
    buildResources: '../build',
  },

  files: [
    'main.js',
    'dashboard.html',
    'package.json',
  ],

  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: '../build/icon.png',
  },

  nsis: {
    oneClick: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'BillyCord Admin',
    runAfterFinish: true,
  },

  mac: {
    target: ['dmg'],
    icon: '../build/icon.png',
    category: 'public.app-category.utilities',
  },

  linux: {
    target: ['AppImage'],
    icon: '../build/icon.png',
    category: 'Utility;',
  },

  publish: null,
  asar: true,
};
