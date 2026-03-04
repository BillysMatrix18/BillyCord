const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  isElectron: true,
  platform: process.platform,

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Notifications
  showNotification: (title, body) => {
    ipcRenderer.send('notification:show', { title, body });
  },

  // App version
  getVersion: () => ipcRenderer.invoke('app:version'),
});
