import dgram from 'dgram';
import os from 'os';

const DISCOVERY_PORT = 41234;
const BROADCAST_INTERVAL = 3000;

export function getLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

export function startDiscoveryBeacon(serverPort: number): () => void {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const lanIp = getLanIp();

  const message = Buffer.from(JSON.stringify({
    app: 'billycord',
    port: serverPort,
    ip: lanIp,
    version: 'Alpha 0.1.0',
  }));

  let interval: ReturnType<typeof setInterval> | null = null;

  socket.bind(0, () => {
    socket.setBroadcast(true);
    console.log(`Discovery beacon active on LAN (${lanIp}:${serverPort})`);

    interval = setInterval(() => {
      socket.send(message, 0, message.length, DISCOVERY_PORT, '255.255.255.255', (err) => {
        if (err && (err as NodeJS.ErrnoException).code !== 'EPERM') {
          // Silently ignore permission errors on some networks
        }
      });
    }, BROADCAST_INTERVAL);
  });

  socket.on('error', (err) => {
    console.warn('Discovery beacon error (non-fatal):', err.message);
  });

  return () => {
    if (interval) clearInterval(interval);
    try { socket.close(); } catch {}
  };
}
