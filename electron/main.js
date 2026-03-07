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
let manualUpdateCheck = false;

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
// discoveryPromise: optional – if provided, auto-fills the input when a server is found
function showManualIpEntry(discoveryPromise) {
  return new Promise((resolve) => {
    const saved = loadSavedUrl();
    const savedHost = saved ? saved.replace(/^https?:\/\//, '') : '';

    const ipWindow = new BrowserWindow({
      width: 500, height: 420, frame: false,
      resizable: false, alwaysOnTop: true, backgroundColor: '#1a1a2e',
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });

    const html = `<!DOCTYPE html><html><head><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',sans-serif;background:#1a1a2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;-webkit-app-region:drag;user-select:none}
      .card{-webkit-app-region:no-drag;background:#0d1117;border:1px solid #1e2a3a;border-radius:12px;padding:32px;width:430px;text-align:center}
      .logo{font-size:28px;font-weight:800;color:#3B82F6;margin-bottom:4px;letter-spacing:-0.5px}
      h2{font-size:18px;font-weight:600;margin-bottom:4px;color:#fff}
      .subtitle{font-size:13px;color:#8892b0;margin-bottom:20px;line-height:1.5}
      label{display:block;text-align:left;font-size:12px;font-weight:600;color:#8892b0;text-transform:uppercase;margin-bottom:8px;letter-spacing:0.5px}
      input{width:100%;padding:12px 14px;background:#161b22;border:2px solid #1e2a3a;border-radius:8px;color:#fff;font-size:15px;outline:none;transition:border-color 0.2s,box-shadow 0.2s}
      input:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,0.15)}
      input::placeholder{color:#444}
      .hint{font-size:11px;color:#555;margin-top:6px;text-align:left}
      .discovered{font-size:12px;color:#22c55e;margin-top:8px;text-align:left;display:none}
      .discovered::before{content:'✓ '}
      .error{font-size:12px;color:#f44;margin-top:8px;min-height:18px}
      .buttons{display:flex;gap:10px;margin-top:18px}
      button{flex:1;padding:11px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s,transform 0.15s}
      .btn-primary{background:#3B82F6;color:#fff}
      .btn-primary:hover{background:#2563EB}
      .btn-primary:active{transform:scale(0.97)}
      .btn-primary:disabled{background:#1e3a5f;color:#6a8bb5;cursor:not-allowed;transform:none}
      .btn-secondary{background:#1e2a3a;color:#8892b0}
      .btn-secondary:hover{background:#263245}
      .connecting{color:#3B82F6;font-size:13px;margin-top:8px}
      .divider{display:flex;align-items:center;gap:12px;margin:16px 0 12px;color:#555;font-size:11px;text-transform:uppercase;letter-spacing:1px}
      .divider::before,.divider::after{content:'';flex:1;height:1px;background:#1e2a3a}
    </style></head><body>
      <div class="card">
        <div class="logo">BillyCord</div>
        <h2>Connect to Server</h2>
        <p class="subtitle">Ask the server admin for the IP address and port,<br>then enter it below to connect.</p>
        <label for="ip">Server Address</label>
        <input id="ip" type="text" placeholder="192.168.0.15:3001 or 203.45.67.89:3001" value="${savedHost}" autofocus />
        <div class="hint">Format: IP:PORT — ask your server admin for this</div>
        <div class="discovered" id="discovered"></div>
        <div class="error" id="error"></div>
        <div class="connecting" id="status"></div>
        <div class="buttons">
          <button class="btn-secondary" id="cancelBtn">Quit</button>
          <button class="btn-primary" id="connectBtn">Connect</button>
        </div>
      </div>
      <script>
        console.log('[IPEntry] Script loaded');
        let ipcRenderer;
        try {
          ipcRenderer = require('electron').ipcRenderer;
          console.log('[IPEntry] ipcRenderer loaded successfully');
        } catch (err) {
          console.error('[IPEntry] Failed to load ipcRenderer:', err);
        }

        const input = document.getElementById('ip');
        const errorEl = document.getElementById('error');
        const statusEl = document.getElementById('status');
        const discoveredEl = document.getElementById('discovered');
        const connectBtn = document.getElementById('connectBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        input.addEventListener('input', () => { errorEl.textContent = ''; });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') connectBtn.click(); });

        cancelBtn.addEventListener('click', () => {
          console.log('[IPEntry] Quit button clicked');
          if (ipcRenderer) {
            ipcRenderer.send('manual-ip-cancel');
          } else {
            console.error('[IPEntry] ipcRenderer not available for cancel');
            window.close();
          }
        });

        connectBtn.addEventListener('click', () => {
          console.log('[IPEntry] Connect button clicked');
          let addr = input.value.trim();
          if (!addr) { errorEl.textContent = 'Please enter a server address.'; return; }

          const parts = addr.split(':');
          if (parts.length < 2) { errorEl.textContent = 'Include a port number (e.g. 192.168.1.5:3001)'; return; }
          const port = parseInt(parts[parts.length - 1]);
          if (isNaN(port) || port < 1 || port > 65535) { errorEl.textContent = 'Invalid port number (1-65535)'; return; }

          errorEl.textContent = '';
          statusEl.textContent = 'Connecting...';
          connectBtn.disabled = true;
          console.log('[IPEntry] Sending connect for address:', addr);

          if (ipcRenderer) {
            ipcRenderer.send('manual-ip-connect', addr);
          } else {
            console.error('[IPEntry] ipcRenderer not available for connect');
            errorEl.textContent = 'Internal error: IPC not available. Please restart the app.';
            connectBtn.disabled = false;
          }
        });

        if (ipcRenderer) {
          ipcRenderer.on('manual-ip-error', (_e, msg) => {
            console.log('[IPEntry] Received error:', msg);
            statusEl.textContent = '';
            errorEl.textContent = msg;
            connectBtn.disabled = false;
          });

          ipcRenderer.on('manual-ip-discovered', (_e, addr) => {
            console.log('[IPEntry] Server discovered:', addr);
            if (!input.value.trim()) {
              input.value = addr;
              discoveredEl.textContent = 'Server found on your network! Click Connect.';
              discoveredEl.style.display = 'block';
              input.style.borderColor = '#22c55e';
              setTimeout(() => { input.style.borderColor = ''; }, 2000);
            }
          });
        }
      </script>
    </body></html>`;

    ipWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // If a discovery promise was provided, send the result to the window
    if (discoveryPromise) {
      discoveryPromise.then((discoveredUrl) => {
        if (discoveredUrl && !ipWindow.isDestroyed()) {
          const addr = discoveredUrl.replace(/^https?:\/\//, '');
          ipWindow.webContents.send('manual-ip-discovered', addr);
        }
      }).catch(() => {});
    }

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
// First-time users always see the IP entry screen.
// Returning users with a saved address get auto-connected (with UDP fallback).
async function startConnectionFlow() {
  const saved = loadSavedUrl();

  // --- First-time launch: no saved address → show IP entry screen immediately ---
  if (!saved) {
    console.log('No saved server address – showing manual IP entry screen');

    // Try auto-discovery silently in the background while showing the entry screen
    const discoveryPromise = discoverServer(4000);

    const url = await showManualIpEntry(discoveryPromise);
    if (url) {
      SERVER_URL = url;
      saveServerUrl(url);
      createMainWindow();
    } else {
      // User cancelled – quit
      isQuitting = true;
      app.quit();
    }
    return;
  }

  // --- Returning user: try saved address, then UDP, then prompt ---
  createSplashWindow('Connecting to server');

  // Step 1: Try saved address first (fastest path for returning users)
  console.log('Trying saved server address:', saved);
  const savedHealthy = await checkServerHealth(saved);
  if (savedHealthy) {
    SERVER_URL = saved;
    createMainWindow();
    return;
  }

  // Step 2: Saved address failed – try UDP auto-discovery
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      `document.querySelector('.status').innerHTML = 'Searching for server<span class="dots"></span>'`
    ).catch(() => {});
  }

  console.log('Saved address unreachable, trying auto-discovery...');
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

  // Step 3: Nothing worked – close splash and show error with manual entry option
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close(); splashWindow = null;
  }

  dialog.showMessageBox({
    type: 'error',
    title: 'BillyCord - Server Offline',
    message: `Could not connect to the saved server (${saved.replace(/^https?:\/\//, '')}).\n\nThe server admin needs to start the server, or you can enter a new IP address.`,
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
      manualUpdateCheck = true;
      autoUpdater.checkForUpdates().catch(() => {
        manualUpdateCheck = false;
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

  autoUpdater.on('update-not-available', (info) => {
    console.log('No update available. Current version:', app.getVersion(), 'Latest:', info.version);
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'No Updates',
          message: `You're on the latest version (v${app.getVersion()}).`,
          buttons: ['OK'],
        });
      }
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

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'error', title: 'Update Error',
          message: `Could not check for updates: ${err.message}`,
          buttons: ['OK'],
        });
      }
    }
  });

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
