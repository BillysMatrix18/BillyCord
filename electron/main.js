const { app, BrowserWindow, dialog, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const http = require('http');

// Keep references to avoid garbage collection
let mainWindow = null;
let splashWindow = null;
let tray = null;
let isQuitting = false;
let updateAvailable = false;

const isDev = process.env.ELECTRON_DEV === 'true';
const DISCOVERY_PORT = 41234;

let SERVER_URL = '';

// ----- Server URL persistence -----
function getServerUrlFile() {
  return path.join(app.getPath('userData'), 'server-address.txt');
}

function loadSavedUrl() {
  const f = getServerUrlFile();
  if (fs.existsSync(f)) {
    const saved = fs.readFileSync(f, 'utf-8').trim();
    if (saved) return saved;
  }
  return null;
}

function saveServerUrl(url) {
  fs.writeFileSync(getServerUrlFile(), url, 'utf-8');
}

// ----- UDP Auto-Discovery -----
// Listens for BillyCord server beacon broadcasts on the local network
function discoverServer(timeoutMs = 5000) {
  return new Promise((resolve) => {
    let found = false;
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      resolve(null);
      return;
    }

    socket.on('message', (msg, rinfo) => {
      if (found) return;
      try {
        const data = JSON.parse(msg.toString());
        if (data.app === 'billycord' && data.port) {
          found = true;
          const url = `http://${rinfo.address}:${data.port}`;
          try { socket.close(); } catch {}
          resolve(url);
        }
      } catch {}
    });

    socket.on('error', () => {
      if (!found) resolve(null);
      try { socket.close(); } catch {}
    });

    socket.bind(DISCOVERY_PORT, () => {
      // Listening for server beacons
    });

    setTimeout(() => {
      if (!found) {
        try { socket.close(); } catch {}
        resolve(null);
      }
    }, timeoutMs);
  });
}

// ----- Manual IP Entry Window -----
function showManualIpEntry() {
  return new Promise((resolve) => {
    const saved = loadSavedUrl();
    const savedHost = saved ? saved.replace(/^https?:\/\//, '') : '';

    const ipWindow = new BrowserWindow({
      width: 480, height: 380, frame: false,
      resizable: false, alwaysOnTop: true, backgroundColor: '#1a1a2e',
      webPreferences: { nodeIntegration: false, contextIsolation: false },
    });

    const html = `<!DOCTYPE html><html><head><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',sans-serif;background:#1a1a2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;-webkit-app-region:drag;user-select:none}
      .card{-webkit-app-region:no-drag;background:#0d1117;border:1px solid #1e2a3a;border-radius:12px;padding:32px;width:400px;text-align:center}
      h2{font-size:20px;font-weight:700;margin-bottom:4px;color:#fff}
      .subtitle{font-size:13px;color:#8892b0;margin-bottom:24px}
      label{display:block;text-align:left;font-size:12px;font-weight:600;color:#8892b0;text-transform:uppercase;margin-bottom:8px;letter-spacing:0.5px}
      input{width:100%;padding:12px 14px;background:#161b22;border:2px solid #1e2a3a;border-radius:8px;color:#fff;font-size:15px;outline:none;transition:border-color 0.2s}
      input:focus{border-color:#3B82F6}
      input::placeholder{color:#444}
      .hint{font-size:11px;color:#555;margin-top:6px;text-align:left}
      .error{font-size:12px;color:#f44;margin-top:8px;min-height:18px}
      .buttons{display:flex;gap:10px;margin-top:20px}
      button{flex:1;padding:10px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s,transform 0.15s}
      .btn-primary{background:#3B82F6;color:#fff}
      .btn-primary:hover{background:#2563EB}
      .btn-primary:active{transform:scale(0.97)}
      .btn-primary:disabled{background:#1e3a5f;color:#6a8bb5;cursor:not-allowed;transform:none}
      .btn-secondary{background:#1e2a3a;color:#8892b0}
      .btn-secondary:hover{background:#263245}
      .connecting{color:#3B82F6;font-size:13px;margin-top:8px}
    </style></head><body>
      <div class="card">
        <h2>Connect to Server</h2>
        <p class="subtitle">Enter the IP address and port of the BillyCord server</p>
        <label for="ip">Server Address</label>
        <input id="ip" type="text" placeholder="192.168.0.15:3001 or 203.45.67.89:3001" value="${savedHost}" autofocus />
        <div class="hint">Format: IP:PORT (e.g. 192.168.1.5:3001)</div>
        <div class="error" id="error"></div>
        <div class="connecting" id="status"></div>
        <div class="buttons">
          <button class="btn-secondary" id="cancelBtn">Cancel</button>
          <button class="btn-primary" id="connectBtn">Connect</button>
        </div>
      </div>
      <script>
        const {ipcRenderer} = require('electron');
        const input = document.getElementById('ip');
        const errorEl = document.getElementById('error');
        const statusEl = document.getElementById('status');
        const connectBtn = document.getElementById('connectBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        input.addEventListener('input', () => { errorEl.textContent = ''; });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') connectBtn.click(); });

        cancelBtn.addEventListener('click', () => {
          ipcRenderer.send('manual-ip-cancel');
        });

        connectBtn.addEventListener('click', () => {
          let addr = input.value.trim();
          if (!addr) { errorEl.textContent = 'Please enter a server address.'; return; }

          // Basic validation
          const parts = addr.split(':');
          if (parts.length < 2) { errorEl.textContent = 'Include a port number (e.g. 192.168.1.5:3001)'; return; }
          const port = parseInt(parts[parts.length - 1]);
          if (isNaN(port) || port < 1 || port > 65535) { errorEl.textContent = 'Invalid port number (1-65535)'; return; }

          errorEl.textContent = '';
          statusEl.textContent = 'Connecting...';
          connectBtn.disabled = true;

          ipcRenderer.send('manual-ip-connect', addr);
        });

        ipcRenderer.on('manual-ip-error', (_e, msg) => {
          statusEl.textContent = '';
          errorEl.textContent = msg;
          connectBtn.disabled = false;
        });
      </script>
    </body></html>`;

    ipWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const { ipcMain } = require('electron');

    const onConnect = (_event, address) => {
      const url = `http://${address}`;
      checkServerHealth(url).then((healthy) => {
        if (healthy) {
          cleanup();
          if (!ipWindow.isDestroyed()) ipWindow.close();
          resolve(url);
        } else {
          if (!ipWindow.isDestroyed()) {
            ipWindow.webContents.send('manual-ip-error', `Could not reach server at ${address}. Make sure the server is running.`);
          }
        }
      });
    };

    const onCancel = () => {
      cleanup();
      if (!ipWindow.isDestroyed()) ipWindow.close();
      resolve(null);
    };

    function cleanup() {
      ipcMain.removeListener('manual-ip-connect', onConnect);
      ipcMain.removeListener('manual-ip-cancel', onCancel);
    }

    ipcMain.on('manual-ip-connect', onConnect);
    ipcMain.on('manual-ip-cancel', onCancel);

    ipWindow.on('closed', () => {
      cleanup();
      resolve(null);
    });
  });
}

// ----- Health check -----
function checkServerHealth(url) {
  return new Promise((resolve) => {
    const req = http.get(`${url}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

// ----- Splash Screen -----
function createSplashWindow(statusText) {
  if (splashWindow && !splashWindow.isDestroyed()) return;

  splashWindow = new BrowserWindow({
    width: 400, height: 300, frame: false,
    resizable: false, alwaysOnTop: true, backgroundColor: '#1a1a2e',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const splashHTML = `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#1a1a2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;-webkit-app-region:drag;user-select:none}
    .logo{width:80px;height:80px;background:#000;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;color:#3B82F6;margin-bottom:24px;border:2px solid #3B82F6;animation:pulse 2s ease-in-out infinite}
    @keyframes pulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(59,130,246,0.4)}50%{transform:scale(1.05);box-shadow:0 0 20px 4px rgba(59,130,246,0.2)}}
    h1{font-size:24px;font-weight:700;margin-bottom:8px}
    .status{font-size:14px;color:#8892b0;margin-top:16px}
    .dots::after{content:'';animation:dots 1.5s steps(4,end) infinite}
    @keyframes dots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}
    .progress-bar{width:200px;height:4px;background:#0d1117;border-radius:2px;margin-top:24px;overflow:hidden}
    .progress-fill{height:100%;background:#3B82F6;border-radius:2px;animation:progress 3s ease-in-out infinite}
    @keyframes progress{0%{width:0}50%{width:80%}100%{width:100%}}
  </style></head><body>
    <div class="logo">BC</div><h1>BillyCord</h1>
    <div class="status">${statusText || 'Searching for server'}<span class="dots"></span></div>
    <div class="progress-bar"><div class="progress-fill"></div></div>
  </body></html>`;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
}

// ----- Main Window -----
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 720, minWidth: 940, minHeight: 500,
    frame: true, show: false, backgroundColor: '#1a1a2e',
    title: 'BillyCord', icon: getAppIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Remove the File/Edit/View/Window/Help menu bar completely
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);

  mainWindow.loadURL(SERVER_URL);

  mainWindow.webContents.on('did-finish-load', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close(); splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-fail-load', (_event, _code, errorDescription) => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close(); splashWindow = null;
    }

    dialog.showMessageBox({
      type: 'error',
      title: 'BillyCord - Server Offline',
      message: `Could not connect to the BillyCord server.\n\nServer: ${SERVER_URL}\nError: ${errorDescription}\n\nThe server admin needs to start the server. Try again later.`,
      buttons: ['Enter IP Manually', 'Retry', 'Quit'],
      defaultId: 0,
    }).then(async (result) => {
      if (result.response === 0) {
        const url = await showManualIpEntry();
        if (url) {
          SERVER_URL = url;
          saveServerUrl(url);
          createMainWindow();
        } else {
          startConnectionFlow();
        }
      } else if (result.response === 1) {
        startConnectionFlow();
      } else {
        isQuitting = true;
        app.quit();
      }
    });
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) { event.preventDefault(); mainWindow.hide(); }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ----- Connection Flow -----
// 1. Try UDP discovery (find server on LAN)
// 2. If not found, try saved address
// 3. If nothing works, show offline message
async function startConnectionFlow() {
  createSplashWindow('Searching for server');

  // Step 1: UDP auto-discovery
  console.log('Searching for BillyCord server on local network...');
  const discovered = await discoverServer(5000);

  if (discovered) {
    console.log('Server discovered at:', discovered);
    const healthy = await checkServerHealth(discovered);
    if (healthy) {
      SERVER_URL = discovered;
      saveServerUrl(discovered);
      createMainWindow();
      return;
    }
  }

  // Step 2: Try saved address
  const saved = loadSavedUrl();
  if (saved) {
    console.log('Trying saved server address:', saved);
    const healthy = await checkServerHealth(saved);
    if (healthy) {
      SERVER_URL = saved;
      createMainWindow();
      return;
    }
  }

  // Step 3: Nothing found – offer manual IP entry
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close(); splashWindow = null;
  }

  dialog.showMessageBox({
    type: 'error',
    title: 'BillyCord - Server Offline',
    message: 'Could not find the BillyCord server.\n\nThe server admin needs to start the server on their PC.\nOr enter the server IP address manually.',
    buttons: ['Enter IP Manually', 'Retry', 'Quit'],
    defaultId: 0,
  }).then(async (result) => {
    if (result.response === 0) {
      const url = await showManualIpEntry();
      if (url) {
        SERVER_URL = url;
        saveServerUrl(url);
        createMainWindow();
      } else {
        startConnectionFlow();
      }
    } else if (result.response === 1) {
      startConnectionFlow();
    } else {
      isQuitting = true;
      app.quit();
    }
  });
}

// ----- App Icon -----
function getAppIcon() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  return nativeImage.createEmpty();
}

// ----- System Tray -----
function createTray() {
  const icon = getAppIcon();
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAIdJREFUWIXt17ENgDAMRNH/C+yCxGZILMBu7EAJBY2lKFackS6ybCd6DjkAYPPxdoEDdwGAAQDAuXOGuy8fRcvIeWYeIuL2E+6+5pwP5n+K2J89YLlBZr59FW8A6DQEAAA9oNOQiIj7T7iPyXlnHtnLr+Ke4x/g8EFA/4MAAADAMHKecQJIrUfyILmfOQAAAABJRU5ErkJggg=='
  ) : icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show BillyCord', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: 'Check for Updates', click: () => {
      autoUpdater.checkForUpdates().catch(() => {
        dialog.showMessageBox(mainWindow, { type: 'info', title: 'Updates', message: 'Could not check for updates.' });
      });
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('BillyCord');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// ----- Auto Updater -----
function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    updateAvailable = true;
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info', title: 'Update Available',
        message: `A new version (v${info.version}) is available. It will be downloaded in the background.`,
        buttons: ['OK'],
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info', title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart now to apply the update?`,
        buttons: ['Restart Now', 'Later'], defaultId: 0,
      }).then((result) => {
        if (result.response === 0) { isQuitting = true; autoUpdater.quitAndInstall(false, true); }
      });
    }
  });

  autoUpdater.on('error', (err) => { console.error('Auto-updater error:', err); });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => { console.error('Update check failed:', err); });
  }, 5000);
}

// ----- Application Lifecycle -----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show(); mainWindow.focus();
    }
  });
}

app.on('ready', () => {
  createTray();
  setupAutoUpdater();
  startConnectionFlow();
  console.log('BillyCord desktop client started');
});

app.on('window-all-closed', () => { /* keep running in tray */ });

app.on('activate', () => {
  if (mainWindow === null) startConnectionFlow();
  else mainWindow.show();
});

app.on('before-quit', () => { isQuitting = true; });

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Error', `An unexpected error occurred:\n${error.message}`);
});
