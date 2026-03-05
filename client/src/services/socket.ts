import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let customServerUrl: string | null = null;

/**
 * Set a custom server URL for socket connections.
 * Called when user connects via ConnectionScreen.
 * @param url - e.g. "http://203.45.67.89:3001"
 */
export function setSocketServerUrl(url: string) {
  customServerUrl = url;
}

export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  const serverOrigin = customServerUrl || window.location.origin;

  socket = io(serverOrigin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('Socket connected');
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
