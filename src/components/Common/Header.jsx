import React from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import { Flame, LogOut, Radio } from 'lucide-react';

export function Header() {
  const { room, participant, isConnected, leaveRoom, setIsVipModalOpen } = useRoom();

  return (
    <header className="app-header">
      <div className="brand-logo">
        <span className="brand-icon">🔥</span>
        <span>MatchBite</span>
      </div>

      {room && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {room.isVip ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
                color: '#B45309',
                padding: '4px 8px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 800,
                fontSize: '0.75rem',
                border: '1px solid #FCD34D',
              }}
              title="VIP Session Active"
            >
              <span>⭐</span>
              <span>VIP</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsVipModalOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
                color: '#B45309',
                border: '1px solid #FDE68A',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              ⭐ Upgrade
            </button>
          )}

          <div className="room-badge" title={isConnected ? 'Real-time connected' : 'Connecting...'}>
            <span className={`live-dot ${!isConnected ? 'offline' : ''}`} />
            <span>{room.code}</span>
          </div>

          <button
            onClick={leaveRoom}
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '6px 10px', borderRadius: 'var(--radius-full)' }}
            title="Leave room"
            aria-label="Leave room"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </header>
  );
}
