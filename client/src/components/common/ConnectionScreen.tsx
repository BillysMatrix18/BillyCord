import { useState, useEffect, useCallback } from 'react';

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
  // Must contain colon and port
  const parts = trimmed.split(':');
  if (parts.length !== 2) return 'Invalid format. Use IP:PORT (e.g., 203.45.67.89:3001)';
  const [host, portStr] = parts;
  if (!host) return 'Invalid format. Use IP:PORT (e.g., 203.45.67.89:3001)';
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) return 'Port must be a number between 1 and 65535.';
  return null;
}

async function testConnection(address: string): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`http://${address}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      return { ok: true };
    }
    return { ok: false, error: 'Server responded but returned an error.' };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'Server not responding. Connection timed out after 10 seconds.' };
    }
    return { ok: false, error: 'Could not connect to server. Check your address and try again.' };
  }
}

interface ConnectionScreenProps {
  onConnected: (address: string) => void;
}

export default function ConnectionScreen({ onConnected }: ConnectionScreenProps) {
  const [address, setAddress] = useState(() => getServerAddress() || '');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [autoConnecting, setAutoConnecting] = useState(false);

  // Auto-connect on mount if we have a saved address
  const attemptAutoConnect = useCallback(async () => {
    const saved = getServerAddress();
    if (!saved) return;
    setAutoConnecting(true);
    setAddress(saved);
    const result = await testConnection(saved);
    if (result.ok) {
      onConnected(saved);
    } else {
      // Saved address failed, clear it and show screen
      clearServerAddress();
      setAutoConnecting(false);
      setError('Previously saved server is unreachable. Please reconnect.');
    }
  }, [onConnected]);

  useEffect(() => {
    attemptAutoConnect();
  }, [attemptAutoConnect]);

  const handleConnect = async () => {
    const trimmed = address.trim();
    const validationError = validateAddress(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setIsConnecting(true);

    const result = await testConnection(trimmed);

    if (result.ok) {
      saveServerAddress(trimmed);
      onConnected(trimmed);
    } else {
      setError(result.error || 'Could not connect to server.');
      setIsConnecting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isConnecting) {
      handleConnect();
    }
  };

  // Show loading while auto-connecting
  if (autoConnecting) {
    return (
      <div className="connection-screen">
        <div className="connection-card">
          <div className="connection-logo">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
          </div>
          <h1 className="connection-title">Connecting to BillyCord...</h1>
          <p className="connection-subtitle">Reaching your server</p>
          <div className="connection-spinner-container">
            <div className="loading-spinner connection-spinner" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="connection-screen">
      <div className="connection-card">
        <div className="connection-logo">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        </div>
        <h1 className="connection-title">Connect to BillyCord Server</h1>
        <p className="connection-subtitle">Enter your server address to get started</p>

        <div className="connection-form">
          <div className="form-group">
            <label>Server Address</label>
            <input
              type="text"
              className={`form-input connection-input ${error ? 'input-error' : ''}`}
              placeholder="192.168.0.15:3001"
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
          <p>Need help? Make sure your BillyCord server is running and accessible on the network.</p>
        </div>
      </div>
    </div>
  );
}
