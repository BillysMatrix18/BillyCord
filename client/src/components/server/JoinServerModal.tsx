import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { joinServer } from '../../store/serverSlice';
import { toggleJoinServer } from '../../store/uiSlice';

export default function JoinServerModal() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await dispatch(joinServer(code));
    if (joinServer.fulfilled.match(result)) {
      dispatch(toggleJoinServer());
      navigate(`/channels/${result.payload.id}`);
    } else {
      setError(result.payload as string || 'Failed to join server');
    }
  };

  return (
    <div className="modal-overlay" onClick={() => dispatch(toggleJoinServer())}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Join a Server</h2>
        <p>Enter an invite code below to join an existing server.</p>

        {error && <div className="error-message" style={{ textAlign: 'center', marginBottom: 12 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Invite Code</label>
            <input
              type="text"
              className="form-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter invite code"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={!code.trim()}>
            Join Server
          </button>
        </form>
      </div>
    </div>
  );
}
