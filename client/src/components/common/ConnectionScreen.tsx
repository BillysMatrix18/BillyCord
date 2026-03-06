import { useState } from 'react';

const STORAGE_KEY = 'serverAddress';

function getServerAddress(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

function saveServerAddress(address: string) {
  localStorage.setItem(STORAGE_KEY, address);
}

export function clearServerAddress() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getServerBaseUrl(): string | null {
  const address = getServerAddress();
  if (!address) return null;
  return `http://${address}`;
}

function validateAddress(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return 'Please enter a server address.';
  const parts = trimmed.split(':');
  if (parts.length !== 2) return 'Invalid format. Use IP:PORT (e.g., 203.45.67.89:3001)';
  const [host, portStr] = parts;
  if (!host) return 'Invalid format. Use IP:PORT (e.g., 203.45.67.89:3001)';
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) return 'Port must be a number between 1 and 65535.';
  return null;
}

async function testConnection(address: string): Promise<{ ok: boolean; error?: string }> {
  const url = `http://${address}/api/health`;
  console.log('[ConnectionScreen] Testing connection to:', url);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      mode: 'cors',
    });
    clearTimeout(timeoutId);
    console.log('[ConnectionScreen] Response status:', response.status);
    if (response.ok) {
      const data = await response.json().catch(() => null);
      console.log('[ConnectionScreen] Connection successful:', data);
      return { ok: true };
    }
    return { ok: false, error: `Server responded with status ${response.status}. Check if the address is correct.` };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    console.error('[ConnectionScreen] Connection failed:', err);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'Connection timed out after 10 seconds. Server not responding.' };
    }
    if (err instanceof TypeError && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
      return { ok: false, error: 'Network error. Make sure the server is running and the IP address is correct.' };
    }
    return { ok: false, error: 'Could not connect to server. Check your address and try again.' };
  }
}

interface ConnectionScreenProps {
  onConnected: (address: string) => void;
}

export default function ConnectionScreen({ onConnected }: ConnectionScreenProps) {
  // Pre-fill with saved address for convenience, but always show the screen
  const [address, setAddress] = useState(() => getServerAddress() || '');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    console.log('[ConnectionScreen] Connect button clicked');
    const trimmed = address.trim();
    console.log('[ConnectionScreen] Address:', trimmed);

    const validationError = validateAddress(trimmed);
    if (validationError) {
      console.log('[ConnectionScreen] Validation failed:', validationError);
      setError(validationError);
      return;
    }

    setError('');
    setIsConnecting(true);
    console.log('[ConnectionScreen] Testing connection to:', trimmed);

    const result = await testConnection(trimmed);

    if (result.ok) {
      console.log('[ConnectionScreen] Connection successful, saving address');
      saveServerAddress(trimmed);
      onConnected(trimmed);
    } else {
      console.log('[ConnectionScreen] Connection failed:', result.error);
      setError(result.error || 'Could not connect to server.');
      setIsConnecting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isConnecting) {
      handleConnect();
    }
  };

  return (
    <div className="connection-screen">
      <div className="connection-card">
        <div className="connection-logo">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        </div>
        <h1 className="connection-title">Connect to BillyCord Server</h1>
        <p className="connection-subtitle">Enter your server address</p>

        <div className="connection-form">
          <div className="form-group">
            <label>Server Address</label>
            <input
              type="text"
              className={`form-input connection-input ${error ? 'input-error' : ''}`}
              placeholder="192.168.0.15:3001 or YOUR_PUBLIC_IP:3001"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              disabled={isConnecting}
              autoFocus
            />
            <div className="connection-hint">
              Format: IP:PORT (e.g., 203.45.67.89:3001)
            </div>
          </div>

          {error && (
            <div className="connection-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            className="btn btn-primary connection-btn"
            onClick={handleConnect}
            disabled={isConnecting || !address.trim()}
          >
            {isConnecting ? (
              <span className="connection-btn-content">
                <div className="loading-spinner connection-btn-spinner" />
                Connecting...
              </span>
            ) : (
              <span className="connection-btn-content">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                Connect
              </span>
            )}
          </button>
        </div>

        <div className="connection-footer">
          <p>Make sure your BillyCord server is running and accessible on the network.</p>
        </div>
      </div>
    </div>
  );
}
