import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../hooks/useAppDispatch';
import { login, clearError } from '../store/authSlice';

export default function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector((state) => state.auth);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    dispatch(clearError());
    // Send as 'email' field since the server expects that key (but accepts username too)
    dispatch(login({ email: loginId, password }));
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Welcome back!</h1>
        <p className="subtitle">We're so excited to see you again!</p>

        {error && <div className="error-message" style={{ marginBottom: 16, textAlign: 'center' }}>{error}</div>}

        <div className="form-group">
          <label>Email or Username</label>
          <input
            type="text"
            className="form-input"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="Enter your email or username"
            required
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            className="form-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className="btn-link" style={{ marginTop: 4 }}>
            Forgot your password?
          </button>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Logging in...' : 'Log In'}
        </button>

        <p className="footer">
          Need an account? <Link to="/register">Register</Link>
        </p>
      </form>
    </div>
  );
}
