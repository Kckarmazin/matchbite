import React, { useState, useEffect } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import { AVATAR_OPTIONS } from '../../utils/session.js';
import { LogIn } from 'lucide-react';

export function JoinRoom({ initialCode = '', onSwitchToCreate }) {
  const { participant, joinRoom, isLoading } = useRoom();

  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(participant.name || '');
  const [avatar, setAvatar] = useState(participant.avatar || '🍻');

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode.toUpperCase());
    }
  }, [initialCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode || !name.trim()) return;

    await joinRoom(cleanCode, {
      name: name.trim(),
      avatar,
    });
  };

  return (
    <div className="card">
      <h2 className="card-title">Join a Room</h2>
      <p className="card-subtitle">
        Enter the room code shared by your group to start swiping together.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Room Code</label>
          <input
            type="text"
            className="form-input input-code"
            placeholder="e.g. TACO42"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={10}
            required
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Your Name</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Alex, Jordan..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Choose Your Avatar</label>
          <div className="avatar-selector">
            {AVATAR_OPTIONS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                className={`avatar-btn ${avatar === emoji ? 'selected' : ''}`}
                onClick={() => setAvatar(emoji)}
                aria-label={`Select avatar ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary mt-4"
          disabled={isLoading || !code.trim() || !name.trim()}
        >
          <LogIn size={18} />
          {isLoading ? 'Joining...' : 'Enter Room'}
        </button>

        {onSwitchToCreate && (
          <div className="text-center mt-4">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onSwitchToCreate}
              style={{ fontSize: '0.9rem', padding: '10px' }}
            >
              Need to start a new group? Create Room
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
