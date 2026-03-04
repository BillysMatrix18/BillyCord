import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { createServer } from '../../store/serverSlice';
import { toggleCreateServer } from '../../store/uiSlice';

export default function CreateServerModal() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await dispatch(createServer({ name, description }));
    if (createServer.fulfilled.match(result)) {
      dispatch(toggleCreateServer());
      navigate(`/channels/${result.payload.id}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => dispatch(toggleCreateServer())}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create a Server</h2>
        <p>Your server is where you and your friends hang out. Make yours and start talking.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Server Name</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Server"
              required
              maxLength={100}
            />
          </div>

          <div className="form-group">
            <label>Description (optional)</label>
            <input
              type="text"
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's your server about?"
              maxLength={1024}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            Create
          </button>
        </form>
      </div>
    </div>
  );
}
