const { app, BrowserWindow, dialog, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork, spawn } = require('child_process');
const os = require('os');
const https = require('https');

let mainWindow = null;
let serverProcess = null;
let serverRunning = false;

const isDev = process.env.ELECTRON_DEV === 'true';

// Admin credentials
const ADMIN_USER = 'billyp';
const ADMIN_PASS = 'Billy@115';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'billycord-admin-2024';
const SERVER_PORT = 3001;

// ----- Paths -----
function getProjectRoot() {
  return path.join(__dirname, '..');
}

function getServerEntry() {
  const root = getProjectRoot();
  // Try compiled JS first
  const compiled = path.join(root, 'server', 'dist', 'index.js');
  if (fs.existsSync(compiled)) return { entry: compiled, useTsx: false };
  // Dev fallback: TypeScript source
  const tsEntry = path.join(root, 'server', 'src', 'index.ts');
  if (fs.existsSync(tsEntry)) return { entry: tsEntry, useTsx: true };
  return null;
}

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function getPublicIp() {
  return new Promise((resolve) => {
    https.get('https://api.ipify.org', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data.trim()));
    }).on('error', () => resolve('Unavailable'));
    setTimeout(() => resolve('Unavailable'), 5000);
  });
}

function getAppIcon() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  return nativeImage.createEmpty();
}

// ----- Server Process Management -----
function startServer() {
  return new Promise((resolve) => {
    if (serverProcess) {
      resolve({ success: false, error: 'Server is already running' });
      return;
    }

    const entry = getServerEntry();
    if (!entry) {
      resolve({ success: false, error: 'Server files not found. Run "npm run build:server" first.' });
      return;
    }

    const serverEnv = {
      ...process.env,
      PORT: String(SERVER_PORT),
      NODE_ENV: 'development',
      ADMIN_SECRET,
    };

    const serverCwd = path.join(getProjectRoot(), 'server');

    sendLog('info', `Starting server from: ${entry.entry}`);
    sendLog('info', `Working directory: ${serverCwd}`);
    sendLog('info', `Mode: ${entry.useTsx ? 'TypeScript (tsx)' : 'Compiled JS'}`);

    let resolved = false;
    function resolveOnce(result) {
      if (!resolved) { resolved = true; resolve(result); }
    }

    try {
      if (entry.useTsx) {
        // Use tsx (no watch) - the server's app.listen() keeps the process alive
        // tsx watch spawns a child process internally which causes premature exit detection
        const tsxCli = path.join(serverCwd, 'node_modules', 'tsx', 'dist', 'cli.mjs');
        sendLog('info', `tsx CLI: ${tsxCli}`);

        // Check tsx CLI exists
        if (!fs.existsSync(tsxCli)) {
          sendLog('error', `tsx CLI not found at: ${tsxCli}`);
          resolveOnce({ success: false, error: 'tsx not installed in server/node_modules' });
          return;
        }

        serverProcess = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
          env: serverEnv,
          cwd: serverCwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } else {
        serverProcess = fork(entry.entry, [], {
          env: serverEnv,
          cwd: serverCwd,
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
      }
    } catch (err) {
      sendLog('error', `Failed to spawn server process: ${err.message}`);
      resolveOnce({ success: false, error: `Failed to spawn: ${err.message}` });
      return;
    }

    const pid = serverProcess.pid;
    sendLog('info', `Server process spawned (PID: ${pid})`);

    serverProcess.stdout?.on('data', (data) => {
      const text = data.toString().trim();
      if (!text) return;
      sendLog('info', text);
      // Detect when server is actually listening
      if (text.includes('running on port') || text.includes('listening on') || text.includes(`port ${SERVER_PORT}`)) {
        serverRunning = true;
        mainWindow?.webContents.send('server:status', true);
        sendLog('info', 'Server is online and listening!');
        resolveOnce({ success: true });
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      const text = data.toString().trim();
      if (text) sendLog('error', text);
    });

    serverProcess.on('exit', (code, signal) => {
      const wasRunning = serverRunning;
      serverRunning = false;
      serverProcess = null;
      sendLog('warn', `Server process exited (code: ${code}, signal: ${signal})`);
      mainWindow?.webContents.send('server:status', false);
      if (!wasRunning) {
        resolveOnce({ success: false, error: `Server exited before starting (code: ${code}, signal: ${signal})` });
      }
    });

    serverProcess.on('error', (err) => {
      serverRunning = false;
      serverProcess = null;
      sendLog('error', `Server process error: ${err.message}`);
      mainWindow?.webContents.send('server:status', false);
      resolveOnce({ success: false, error: `Process error: ${err.message}` });
    });

    // Fallback timeout - if no "running on port" detected in 15s, check if process is still alive
    setTimeout(() => {
      if (serverProcess && !resolved) {
        // Process is still alive but hasn't logged the listen message - mark as running anyway
        serverRunning = true;
        mainWindow?.webContents.send('server:status', true);
        sendLog('info', 'Server process is alive (timeout fallback)');
        resolveOnce({ success: true });
      } else if (!resolved) {
        resolveOnce({ success: false, error: 'Server failed to start within 15 seconds' });
      }
    }, 15000);
  });
}

function stopServer() {
  if (!serverProcess) return { success: false, error: 'Server is not running' };

  const pid = serverProcess.pid;
  sendLog('warn', `Stopping server (PID: ${pid})...`);

  try {
    if (process.platform === 'win32' && pid) {
      // On Windows, kill the entire process tree to ensure child processes are cleaned up
      spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { shell: true, windowsHide: true });
    } else {
      serverProcess.kill('SIGTERM');
      // Force kill after 5 seconds if still alive
      const proc = serverProcess;
      setTimeout(() => {
        try {
          if (proc && !proc.killed) proc.kill('SIGKILL');
        } catch (_) { /* already dead */ }
      }, 5000);
    }
  } catch (err) {
    sendLog('error', `Error stopping server: ${err.message}`);
  }

  serverProcess = null;
  serverRunning = false;
  mainWindow?.webContents.send('server:status', false);
  sendLog('warn', 'Server stopped');
  return { success: true };
}

function sendLog(level, message) {
  mainWindow?.webContents.send('server:log', { level, message });
}

// ----- IPC Handlers -----
ipcMain.handle('admin:login', (_event, { username, password }) => {
  return username === ADMIN_USER && password === ADMIN_PASS;
});

ipcMain.handle('server:start', () => startServer());
ipcMain.handle('server:stop', () => stopServer());
ipcMain.handle('server:restart', async () => {
  stopServer();
  await new Promise((r) => setTimeout(r, 2000));
  return startServer();
});
ipcMain.handle('server:getStatus', () => serverRunning);
ipcMain.handle('admin:getSecret', () => ADMIN_SECRET);
ipcMain.handle('admin:getPort', () => SERVER_PORT);

ipcMain.handle('admin:getIps', async () => {
  const lan = getLanIp();
  const pub = await getPublicIp();
  return { lan, public: pub, port: SERVER_PORT };
});

// ----- Window -----
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    title: 'BillyCord Admin Dashboard',
    icon: getAppIcon(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'dashboard.html'));
  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ----- App Lifecycle -----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});

app.on('before-quit', () => {
  stopServer();
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Error', `An unexpected error occurred:\n${error.message}`);
});
