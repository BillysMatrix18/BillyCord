import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from './hooks/useAppDispatch';
import { fetchUser } from './store/authSlice';
import { useSocket } from './hooks/useSocket';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MainLayout from './components/common/MainLayout';
import ConnectionScreen from './components/common/ConnectionScreen';
import { setApiBaseUrl } from './services/api';
import { setSocketServerUrl } from './services/socket';

/**
 * Detect if the app is being served from the BillyCord server itself.
 * If so, we can skip the ConnectionScreen and use the current origin directly.
 * This happens when:
 *  - The Electron client loads the React build from the server
 *  - A user opens the app directly in a browser pointed at the server
 * We detect this by checking if /api/health is reachable at the current origin.
 */
async function detectServerAtOrigin(): Promise<boolean> {
  // In dev mode (Vite dev server), skip auto-detection
  if (window.location.port === '5173' || window.location.port === '5174') {
    return false;
  }
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      return data.serverName === 'BillyCord';
    }
  } catch {
    // Not served from the server
  }
  return false;
}

function App() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);
  const { theme } = useAppSelector((state) => state.ui);
  const [isConnected, setIsConnected] = useState(false);
  const [isDetecting, setIsDetecting] = useState(true);

  useSocket();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // On mount, check if we're already served from the BillyCord server
  useEffect(() => {
    detectServerAtOrigin().then((isServer) => {
      if (isServer) {
        // App is served from the server — use current origin, skip ConnectionScreen
        console.log('[App] Served from BillyCord server at', window.location.origin);
        const origin = window.location.origin;
        setApiBaseUrl(origin);
        setSocketServerUrl(origin);
        setIsConnected(true);
      }
      setIsDetecting(false);
    });
  }, []);

  useEffect(() => {
    if (isAuthenticated && !user && isConnected) {
      dispatch(fetchUser());
    }
  }, [isAuthenticated, user, dispatch, isConnected]);

  const handleConnected = useCallback((address: string) => {
    const serverUrl = `http://${address}`;
    setApiBaseUrl(serverUrl);
    setSocketServerUrl(serverUrl);
    setIsConnected(true);
  }, []);

  // While detecting server, show nothing (takes < 100ms)
  if (isDetecting) {
    return null;
  }

  // Only show ConnectionScreen if we're NOT served from the server
  // (e.g. dev mode, or direct browser access without server)
  if (!isConnected) {
    return <ConnectionScreen onConnected={handleConnected} />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/channels/@me" /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/channels/@me" /> : <RegisterPage />}
      />
      <Route
        path="/channels/*"
        element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/channels/@me' : '/login'} />} />
    </Routes>
  );
}

export default App;
