import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import authRoutes from './routes/auth';
import serverRoutes from './routes/servers';
import messageRoutes from './routes/messages';
import friendRoutes from './routes/friends';
import dmRoutes from './routes/dm';
import adminRoutes from './routes/admin';
import { generalLimiter } from './middleware/rateLimit';
import { initializeSocket } from './services/socket';
import { runMigrations } from './config/migrate';
import { initRedis } from './config/redis';
import { startDiscoveryBeacon, getLanIp } from './services/discovery';
import { startLogExporter } from './services/logExporter';
import { loadSettings, getSettingBool } from './services/settingsCache';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
// Allow all origins — friends connect from Electron .exe on the local network
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(generalLimiter);

// Ensure uploads directory exists
const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Maintenance mode check (skip admin routes so admin can disable it)
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/admin')) return next();
  if (getSettingBool('maintenance_mode', false)) {
    res.status(503).json({ error: 'Server is under maintenance. Please try again later.' });
    return;
  }
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api', messageRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve client build in production
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const electronResources = (process as any).resourcesPath as string | undefined;
const candidatePaths = [
  path.join(__dirname, '../../client/dist'),        // from server/src or server/dist
  path.join(__dirname, '../../../client/dist'),      // deeper nesting (e.g. server/dist/src)
  path.join(process.cwd(), 'client/dist'),           // from project root cwd
  electronResources ? path.join(electronResources, 'client', 'dist') : '',
  electronResources ? path.join(electronResources, 'client-dist') : '',
].filter(Boolean);
const clientBuildPath = candidatePaths.find(p => {
  try { return fs.existsSync(path.join(p, 'index.html')); } catch { return false; }
});

if (clientBuildPath) {
  console.log('Serving client build from:', clientBuildPath);
  app.use(express.static(clientBuildPath));

  // SPA fallback: any non-API route serves index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  console.log('No client build found, searched:', candidatePaths);
  console.log('Run "npm run build:client" to build the frontend.');
  // Fallback: non-API routes get a helpful HTML page instead of JSON error
  app.get('*', (_req, res) => {
    if (_req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Route not found' });
      return;
    }
    res.status(503).send(`<!DOCTYPE html><html><head><title>BillyCord</title>
<style>body{font-family:'Segoe UI',sans-serif;background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;padding:40px}.logo{font-size:48px;font-weight:700;color:#3B82F6;margin-bottom:16px}
p{color:#8892b0;font-size:16px;line-height:1.6}</style></head>
<body><div class="box"><div class="logo">BillyCord</div>
<p>The server is running but the client has not been built yet.<br>
Run <code style="background:#0d1117;padding:4px 8px;border-radius:4px">npm run build:client</code> on the server machine.</p>
</div></body></html>`);
  });
}

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize Socket.IO
const io = initializeSocket(httpServer);
app.set('io', io);

const PORT = parseInt(process.env.PORT || '3001', 10);

// Startup
async function start() {
  try {
    console.log('Initializing database...');
    await runMigrations();

    await initRedis();

    // Load admin settings into memory cache
    await loadSettings();

    httpServer.listen(PORT, '0.0.0.0', () => {
      const lanIp = getLanIp();
      console.log(`Server running on port ${PORT}`);
      console.log(`LAN address: http://${lanIp}:${PORT}`);
      console.log(`WebSocket server initialized`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Start UDP discovery beacon so BillyCord.exe clients can find this server
    startDiscoveryBeacon(PORT);

    // Start hourly log export to database folder (CSV + JSON)
    startLogExporter();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { app, httpServer, io };
