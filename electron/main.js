const { app, BrowserWindow, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const fs = require('fs');

// Keep references to avoid garbage collection
let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let tray = null;
let isQuitting = false;

const SERVER_PORT = 3001;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const isDev = process.env.ELECTRON_DEV === 'true';

// ----- Paths -----
// In packaged mode, app resources are in process.resourcesPath
// In dev mode, everything is relative to the project root
function getProjectRoot() {
  if (isDev) {
    return path.join(__dirname, '..');
  }
  return process.resourcesPath;
}

function getServerEntry() {
  const root = getProjectRoot();
  // Packaged: server/dist/index.js (compiled JS)
  const compiled = path.join(root, 'server', 'dist', 'index.js');
  if (fs.existsSync(compiled)) return compiled;

  // Dev fallback: use tsx to run TypeScript directly
  // We'll handle this in startServer() instead
  return null;
}

function getUserDataPath() {
  return path.join(app.getPath('userData'), 'discord-clone-data');
}

// ----- Splash Screen -----
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#36393f',
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
          background: #36393f;
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
          background: #5865f2;
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          font-weight: 700;
          margin-bottom: 24px;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.9; }
        }
        h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
        .status {
          font-size: 14px;
          color: #b9bbbe;
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
          background: #202225;
          border-radius: 2px;
          margin-top: 24px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: #5865f2;
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
      <div class="logo">DC</div>
      <h1>Discord Clone</h1>
      <div class="status">Starting<span class="dots"></span></div>
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
    backgroundColor: '#36393f',
    title: 'Discord Clone',
    icon: getAppIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
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
  // Create a simple 64x64 icon programmatically if no file exists
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
      label: 'Show Discord Clone',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
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

  tray.setToolTip('Discord Clone');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ----- Server Management -----
function startServer() {
  return new Promise((resolve, reject) => {
    const serverEntry = getServerEntry();

    // Set up environment for the server process
    const serverEnv = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(SERVER_PORT),
      // In desktop mode, the app data goes to user's AppData
      UPLOAD_DIR: path.join(getUserDataPath(), 'uploads'),
    };

    // If DATABASE_URL isn't set, it'll use the default from database.ts
    // Users need PostgreSQL running locally or must set DATABASE_URL

    if (serverEntry) {
      // Packaged mode: run compiled JS
      console.log('Starting server from:', serverEntry);
      serverProcess = fork(serverEntry, [], {
        env: serverEnv,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        cwd: path.dirname(path.dirname(serverEntry)),
      });
    } else if (isDev) {
      // Dev mode: use tsx to run TypeScript directly
      const tsEntry = path.join(getProjectRoot(), 'server', 'src', 'index.ts');
      const tsxBin = path.join(getProjectRoot(), 'server', 'node_modules', '.bin', 'tsx');
      const { spawn } = require('child_process');
      console.log('Starting server in dev mode with tsx:', tsEntry);
      serverProcess = spawn(tsxBin, [tsEntry], {
        env: serverEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.join(getProjectRoot(), 'server'),
      });
    } else {
      reject(new Error('Cannot find server entry point. Run "npm run build" first.'));
      return;
    }

    let started = false;

    // Capture server output
    if (serverProcess.stdout) {
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[Server]', output.trim());
        if (output.includes('Server running on port') && !started) {
          started = true;
          resolve();
        }
      });
    }

    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', (data) => {
        console.error('[Server Error]', data.toString().trim());
      });
    }

    serverProcess.on('error', (err) => {
      console.error('Failed to start server process:', err);
      if (!started) reject(err);
    });

    serverProcess.on('exit', (code) => {
      console.log('Server process exited with code:', code);
      if (!started) {
        reject(new Error(`Server exited with code ${code} before becoming ready`));
      }
    });

    // Timeout: if server doesn't start in 30 seconds, give up
    setTimeout(() => {
      if (!started) {
        reject(new Error('Server startup timed out (30s). Make sure PostgreSQL is running.'));
      }
    }, 30000);
  });
}

function waitForServer(maxAttempts = 60, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function check() {
      attempts++;
      const req = http.get(`${SERVER_URL}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, interval);
        } else {
          reject(new Error('Server health check failed'));
        }
      });

      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, interval);
        } else {
          reject(new Error('Cannot connect to server'));
        }
      });

      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts < maxAttempts) {
          setTimeout(check, interval);
        }
      });
    }

    check();
  });
}

function stopServer() {
  if (serverProcess) {
    console.log('Stopping server...');
    serverProcess.kill('SIGTERM');
    // Force kill after 5 seconds
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }, 5000);
    serverProcess = null;
  }
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

app.on('ready', async () => {
  // Create data directory
  const dataPath = getUserDataPath();
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }

  // Show splash screen
  createSplashWindow();

  try {
    // Start the backend server
    console.log('Starting backend server...');
    await startServer();
    console.log('Server started, waiting for health check...');

    // Wait for the server to be fully ready
    await waitForServer();
    console.log('Server is ready!');

    // Create the main window and tray
    createMainWindow();
    createTray();
  } catch (error) {
    console.error('Startup error:', error);

    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }

    dialog.showErrorBox(
      'Discord Clone - Startup Error',
      `Failed to start the application.\n\n${error.message}\n\nMake sure PostgreSQL is running and DATABASE_URL is configured.\n\nYou can set DATABASE_URL in:\n${path.join(getProjectRoot(), 'server', '.env')}`
    );

    app.quit();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep running in tray
  if (process.platform !== 'darwin') {
    // Don't quit - keep running in tray
  }
});

app.on('activate', () => {
  // macOS: re-create window when dock icon clicked
  if (mainWindow === null) {
    createMainWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopServer();
});

app.on('will-quit', () => {
  stopServer();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Error', `An unexpected error occurred:\n${error.message}`);
});
