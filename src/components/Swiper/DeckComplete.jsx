import React from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import { Users, Clock, Trophy, Bell, UserX, Zap } from 'lucide-react';

export function DeckComplete({ participants: propParticipants = [], onViewResults }) {
  const { room, participant, kickParticipant, nudgeParticipant, startSuddenDeath } = useRoom();

  const participantsList = propParticipants?.length
    ? propParticipants
    : (Array.isArray(room?.participants) ? room.participants : Object.values(room?.participants || {}));

  const isHost = Boolean(participant?.isHost || room?.hostId === participant?.id);

  return (
    <div className="card text-center deck-complete-card">
      <div className="complete-icon-wrap">
        <Clock size={40} className="pulse-icon" />
      </div>

      <h2 className="card-title">You're All Caught Up!</h2>
      <p className="card-subtitle">
        Waiting for your group to finish swiping through the deck...
      </p>

      {/* Participants Live Swiping Status */}
      <div className="progress-roster-box">
        <h4 className="roster-heading">
          <Users size={16} /> Group Swiping Progress
        </h4>
        <div className="roster-list">
          {participantsList.map((p) => {
            const swiped = p.swipedCount || 0;
            const total = p.totalCards || room?.deck?.length || 12;
            const pct = Math.min(100, Math.round((swiped / total) * 100));
            const isDone = swiped >= total;
            const isSelf = p.id === participant?.id;

            return (
              <div key={p.id} className="participant-progress-item">
                <div className="participant-info-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="p-avatar">{p.avatar || '👤'}</span>
                    <span className="p-name">{p.name}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="p-count">
                      {isDone ? 'Finished! ✅' : `${swiped} / ${total} cards`}
                    </span>

                    {isHost && !isDone && !isSelf && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => nudgeParticipant(p.id)}
                          title={`Nudge ${p.name}`}
                          style={{
                            background: 'rgba(245, 158, 11, 0.12)',
                            border: '1px solid rgba(245, 158, 11, 0.35)',
                            borderRadius: '999px',
                            padding: '2px 6px',
                            cursor: 'pointer',
                            color: '#D97706',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        >
                          <Bell size={10} />
                          <span>Nudge</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Remove ${p.name} from this session?`)) {
                              kickParticipant(p.id);
                            }
                          }}
                          title={`Remove ${p.name}`}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '999px',
                            padding: '2px 6px',
                            cursor: 'pointer',
                            color: '#DC2626',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        >
                          <UserX size={10} />
                          <span>Kick</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="progress-bar-bg">
                  <div
                    className={`progress-bar-fill ${isDone ? 'fill-done' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isHost && (
        <button
          type="button"
          className="btn btn-primary mt-3"
          onClick={() => startSuddenDeath(3)}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #F59E0B, #DC2626)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontWeight: 700,
          }}
        >
          <Zap size={16} fill="white" />
          <span>⚡ Sudden Death (Top 3 Showdown)</span>
        </button>
      )}

      {onViewResults && (
        <button
          type="button"
          className="btn btn-secondary mt-3"
          onClick={onViewResults}
          style={{ width: '100%' }}
        >
          <Trophy size={18} /> View Leaderboard & Consensus
        </button>
      )}
    </div>
  );
}

export default DeckComplete;
