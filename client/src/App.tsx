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

function App() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);
  const { theme } = useAppSelector((state) => state.ui);
  const [isConnected, setIsConnected] = useState(false);

  useSocket();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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

  // Always show connection screen first — user enters IP every launch
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
