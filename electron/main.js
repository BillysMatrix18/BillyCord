const { app, BrowserWindow, dialog, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Keep references to avoid garbage collection
let mainWindow = null;
let splashWindow = null;
let tray = null;
let isQuitting = false;
let updateAvailable = false;

// ----- Remote Server Configuration -----
// The server URL is resolved in this order:
// 1. BILLYCORD_SERVER_URL environment variable
// 2. Saved URL in userData/server-url.txt (set via "Change Server URL" in tray)
// 3. Default fallback
const DEFAULT_SERVER_URL = 'https://billypapastavro-discord-clone-test.replit.app';
const isDev = process.env.ELECTRON_DEV === 'true';

function getServerUrlFile() {
  return path.join(app.getPath('userData'), 'server-url.txt');
}

function loadServerUrl() {
  // Environment variable takes top priority
  if (process.env.BILLYCORD_SERVER_URL) {
    return process.env.BILLYCORD_SERVER_URL;
  }
  // Check for saved URL
  const urlFile = getServerUrlFile();
  if (fs.existsSync(urlFile)) {
    const saved = fs.readFileSync(urlFile, 'utf-8').trim();
    if (saved) return saved;
  }
  return DEFAULT_SERVER_URL;
}

function saveServerUrl(url) {
  fs.writeFileSync(getServerUrlFile(), url, 'utf-8');
}

let SERVER_URL = DEFAULT_SERVER_URL;

// ----- Splash Screen -----
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const splashHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
          background: #1a1a2e;
          color: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          -webkit-app-region: drag;
          user-select: none;
        }
        .logo {
          width: 80px;
          height: 80px;
          background: #000;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          font-weight: 700;
          color: #3B82F6;
          margin-bottom: 24px;
          border: 2px solid #3B82F6;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
          50% { transform: scale(1.05); box-shadow: 0 0 20px 4px rgba(59,130,246,0.2); }
        }
        h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; color: #fff; }
        .status {
          font-size: 14px;
          color: #8892b0;
          margin-top: 16px;
        }
        .dots::after {
          content: '';
          animation: dots 1.5s steps(4, end) infinite;
        }
        @keyframes dots {
          0% { content: ''; }
          25% { content: '.'; }
          50% { content: '..'; }
          75% { content: '...'; }
        }
        .progress-bar {
          width: 200px;
          height: 4px;
          background: #0d1117;
          border-radius: 2px;
          margin-top: 24px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: #3B82F6;
          border-radius: 2px;
          animation: progress 3s ease-in-out infinite;
        }
        @keyframes progress {
          0% { width: 0%; }
          50% { width: 80%; }
          100% { width: 100%; }
        }
      </style>
    </head>
    <body>
      <div class="logo">BC</div>
      <h1>BillyCord</h1>
      <div class="status">Connecting<span class="dots"></span></div>
      <div class="progress-bar"><div class="progress-fill"></div></div>
    </body>
    </html>
  `;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
}

// ----- Main Window -----
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 940,
    minHeight: 500,
    frame: true,
    show: false,
    backgroundColor: '#1a1a2e',
    title: 'BillyCord',
    icon: getAppIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.webContents.on('did-finish-load', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }

    dialog.showMessageBox({
      type: 'error',
      title: 'BillyCord - Connection Error',
      message: `Could not connect to the BillyCord server.\n\nServer URL: ${SERVER_URL}\nError: ${errorDescription}\n\nMake sure the server is running and you have an internet connection.`,
      buttons: ['Retry', 'Change Server URL', 'Quit'],
      defaultId: 0,
    }).then(async (result) => {
      if (result.response === 0) {
        createSplashWindow();
        mainWindow.loadURL(SERVER_URL);
      } else if (result.response === 1) {
        await promptForServerUrl();
      } else {
        isQuitting = true;
        app.quit();
      }
    });
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open devtools in dev mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ----- App Icon -----
function getAppIcon() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  return nativeImage.createEmpty();
}

// ----- System Tray -----
function createTray() {
  const icon = getAppIcon();
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAIdJREFUWIXt17ENgDAMRNH/C+yCxGZILMBu7EAJBY2lKFackS6ybCd6DjkAYPPxdoEDdwGAAQDAuXOGuy8fRcvIeWYeIuL2E+6+5pwP5n+K2J89YLlBZr59FW8A6DQEAAA9oNOQiIj7T7iPyXlnHtnLr+Ke4x/g8EFA/4MAAADAMHKecQJIrUfyILmfOQAAAABJRU5ErkJggg=='
  ) : icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show BillyCord',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Change Server URL',
      click: async () => {
        if (mainWindow) {
          mainWindow.show();
          await promptForServerUrl();
        }
      },
    },
    {
      label: 'Check for Updates',
      click: () => {
        autoUpdater.checkForUpdates().catch((err) => {
          console.error('Manual update check failed:', err);
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Updates',
            message: 'Could not check for updates. Please try again later.',
          });
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('BillyCord');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ----- Server URL Prompt -----
async function promptForServerUrl() {
  const { BrowserWindow: BW } = require('electron');
  const inputWin = new BW({
    width: 500,
    height: 220,
    frame: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    modal: true,
    backgroundColor: '#1a1a2e',
    title: 'BillyCord - Server URL',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
    },
  });

  const html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', sans-serif; background: #1a1a2e; color: #fff; padding: 24px; }
  h2 { font-size: 16px; margin-bottom: 8px; }
  p { font-size: 13px; color: #8892b0; margin-bottom: 16px; }
  input { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #3B82F6; background: #0d1117; color: #fff; font-size: 14px; outline: none; }
  .buttons { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
  button { padding: 8px 20px; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; }
  .save { background: #3B82F6; color: #fff; }
  .cancel { background: #333; color: #aaa; }
</style></head><body>
  <h2>Enter your BillyCord server URL</h2>
  <p>This is your Replit deployment URL (e.g. https://your-app.replit.app)</p>
  <input id="url" value="${SERVER_URL}" autofocus />
  <div class="buttons">
    <button class="cancel" onclick="window.close()">Cancel</button>
    <button class="save" onclick="save()">Connect</button>
  </div>
  <script>
    const {ipcRenderer} = require('electron');
    function save() {
      const url = document.getElementById('url').value.trim();
      if (url) {
        document.title = 'URL:' + url;
        window.close();
      }
    }
    document.getElementById('url').addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  </script>
</body></html>`;

  inputWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  inputWin.setMenuBarVisibility(false);

  return new Promise((resolve) => {
    inputWin.on('page-title-updated', (_event, title) => {
      if (title.startsWith('URL:')) {
        const newUrl = title.slice(4);
        SERVER_URL = newUrl;
        saveServerUrl(newUrl);
        inputWin.close();
        createSplashWindow();
        mainWindow.loadURL(SERVER_URL);
        resolve(newUrl);
      }
    });
    inputWin.on('closed', () => {
      resolve(null);
    });
  });
}

// ----- Auto Updater -----
function setupAutoUpdater() {
  if (isDev) {
    console.log('Skipping auto-update in dev mode');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    updateAvailable = true;
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (v${info.version}) is available. It will be downloaded in the background.`,
        buttons: ['OK'],
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart now to apply the update?`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      }).then((result) => {
        if (result.response === 0) {
          isQuitting = true;
          autoUpdater.quitAndInstall(false, true);
        }
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });

  // Check for updates after a short delay to not block startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Update check failed:', err);
    });
  }, 5000);
}

// ----- Application Lifecycle -----
// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on('ready', () => {
  // Load the configured server URL
  SERVER_URL = loadServerUrl();

  // Show splash screen
  createSplashWindow();

  // Create the main window (connects to remote server)
  createMainWindow();
  createTray();

  // Check for updates
  setupAutoUpdater();

  console.log('BillyCord desktop client started');
  console.log('Connecting to server:', SERVER_URL);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit - keep running in tray
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Error', `An unexpected error occurred:\n${error.message}`);
});
