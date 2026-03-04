import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const serverTarget = process.env.API_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Allow Replit to connect
    host: '0.0.0.0',
    hmr: {
      // Replit uses a proxy; need clientPort for HMR to work
      clientPort: 443,
    },
    proxy: {
      '/api': {
        target: serverTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: serverTarget,
        ws: true,
      },
    },
  },
  // Build output goes to dist/ which the server will serve
  build: {
    outDir: 'dist',
  },
});
