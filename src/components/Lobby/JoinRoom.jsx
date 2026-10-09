import React, { useState, useEffect } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import { AVATAR_OPTIONS } from '../../utils/session.js';
import { LogIn, Zap } from 'lucide-react';

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

  const effectiveCode = (code || initialCode || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('room') : '') || '').trim().toUpperCase();
  const existingName = (participant?.name || '').trim();
  const existingAvatar = participant?.avatar || avatar || '🍻';
  const hasExpressOption = Boolean(existingName && effectiveCode);

  const handleExpressJoin = async () => {
    if (!effectiveCode || !existingName) return;
    await joinRoom(effectiveCode, {
      name: existingName,
      avatar: existingAvatar,
    });
  };

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

      {/* 1-Tap Express Join for Returning Users */}
      {hasExpressOption && (
        <div
          className="express-join-card"
          style={{
            marginBottom: '20px',
            padding: '16px',
            background: 'linear-gradient(135deg, rgba(255,241,242,0.9), rgba(255,255,255,0.95))',
            borderRadius: 'var(--radius-md)',
            border: '1.5px solid #FECDD3',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.5rem' }}>{existingAvatar}</span>
              <div>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', display: 'block' }}>
                  Fast Express Join
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Room <strong>{effectiveCode}</strong> detected
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary express-join-btn"
            style={{ width: '100%', padding: '14px', fontSize: '1rem', fontWeight: 800 }}
            onClick={handleExpressJoin}
            disabled={isLoading}
          >
            <Zap size={18} fill="currentColor" />
            <span>⚡ Join Room as {existingName}</span>
          </button>

          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Or update your nickname and avatar below:
            </span>
          </div>
        </div>
      )}

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
