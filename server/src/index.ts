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
const candidatePaths = [
  path.join(__dirname, '../../client/dist'),
  process.resourcesPath ? path.join(process.resourcesPath, 'client/dist') : '',
].filter(Boolean);
const clientBuildPath = candidatePaths.find(p => fs.existsSync(p)) || candidatePaths[0];
if (fs.existsSync(clientBuildPath)) {
  console.log('Serving client build from:', clientBuildPath);
  app.use(express.static(clientBuildPath));

  // SPA fallback: any non-API route serves index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  console.log('No client build found at', clientBuildPath, '- API-only mode');
  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
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

    httpServer.listen(PORT, '0.0.0.0', () => {
      const lanIp = getLanIp();
      console.log(`Server running on port ${PORT}`);
      console.log(`LAN address: http://${lanIp}:${PORT}`);
      console.log(`WebSocket server initialized`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Start UDP discovery beacon so BillyCord.exe clients can find this server
    startDiscoveryBeacon(PORT);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { app, httpServer, io };
