import React, { useState } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import { Share2, Copy, Play, Check, Users, Sparkles, SlidersHorizontal, Bell, UserX } from 'lucide-react';

export function RoomLobby({ onStartSwiping }) {
  const { room, participant, updateSettings, showToast, kickParticipant, nudgeParticipant } = useRoom();
  const [copied, setCopied] = useState(false);
  const [showSettingsEdit, setShowSettingsEdit] = useState(false);

  if (!room) return null;

  const isHost = participant?.isHost || room.hostId === participant?.id;
  const joinUrl = `${window.location.origin}/?room=${room.code}`;

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(joinUrl);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = joinUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      showToast('Invite link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      showToast('Could not copy link automatically', 'error');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join our MatchBite room!',
          text: `Help us pick where to go! Join room ${room.code}:`,
          url: joinUrl,
        });
      } catch (err) {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  const participantsList = Array.isArray(room.participants)
    ? room.participants
    : Object.values(room.participants || {});

  return (
    <div>
      {/* Code Banner */}
      <div className="code-display">
        <span className="code-title">Room Code</span>
        <span className="code-number">{room.code}</span>
        <p style={{ fontSize: '0.85rem', color: '#9F1239', marginTop: '6px' }}>
          Share this code with your friends or send the direct link below!
        </p>

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', width: '100%', maxWidth: '320px' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '10px 14px', fontSize: '0.9rem' }}
            onClick={handleCopyLink}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? 'Copied!' : 'Copy Link'}</span>
          </button>

          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '10px 14px', fontSize: '0.9rem' }}
              onClick={handleShare}
            >
              <Share2 size={16} />
              <span>Share</span>
            </button>
          )}
        </div>
      </div>

      {/* Participants Roster Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} color="var(--primary)" />
            <span>Group Members ({participantsList.length})</span>
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {participantsList.length > 1 ? 'Ready to vote' : 'Waiting for friends...'}
          </span>
        </div>

        <div className="roster-grid">
          {participantsList.map((p) => {
            const isSelf = p.id === participant?.id;
            const isTargetHost = p.isHost || p.id === room.hostId;

            return (
              <div
                key={p.id}
                className="roster-badge"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '1.2rem' }}>{p.avatar || '🍕'}</span>
                  <span>{p.name}</span>
                  {isTargetHost && (
                    <span className="host-tag">Host</span>
                  )}
                </div>

                {isHost && !isSelf && !isTargetHost && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                    <button
                      type="button"
                      onClick={() => nudgeParticipant(p.id)}
                      title={`Nudge ${p.name}`}
                      style={{
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        borderRadius: '999px',
                        padding: '2px 7px',
                        cursor: 'pointer',
                        color: '#D97706',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                      }}
                    >
                      <Bell size={11} />
                      <span>Nudge</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remove ${p.name} from this room?`)) {
                          kickParticipant(p.id);
                        }
                      }}
                      title={`Remove ${p.name}`}
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '999px',
                        padding: '2px 7px',
                        cursor: 'pointer',
                        color: '#DC2626',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                      }}
                    >
                      <UserX size={11} />
                      <span>Remove</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity Settings Summary */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 className="card-title" style={{ fontSize: '1.15rem' }}>Session Settings</h3>
          {isHost && (
            <button
              type="button"
              onClick={() => setShowSettingsEdit(!showSettingsEdit)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--primary)',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <SlidersHorizontal size={14} />
              <span>{showSettingsEdit ? 'Close' : 'Adjust'}</span>
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.9rem' }}>
          <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>CATEGORY</div>
            <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{room.settings?.activityCategory || 'Dining'}</div>
          </div>

          <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>GROUP VIBE</div>
            <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{room.settings?.groupType || 'Friends'}</div>
          </div>

          <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>PRICE</div>
            <div style={{ fontWeight: 700 }}>
              {(room.settings?.priceRange || [1, 2]).map((tier) => '$'.repeat(tier)).join(', ')}
            </div>
          </div>

          <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>DISTANCE</div>
            <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>
              {room.settings?.distance === 'walkable' ? 'Walkable (<1mi)' : 'Short Drive (<5mi)'}
            </div>
          </div>

          {room.settings?.dietaryFilters && room.settings.dietaryFilters.length > 0 && (
            <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', gridColumn: 'span 2' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>DIETARY & VIBE</div>
              <div style={{ fontWeight: 700, display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                {room.settings.dietaryFilters.map((f) => (
                  <span
                    key={f}
                    style={{
                      background: 'var(--surface-card)',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '0.78rem',
                      border: '1px solid var(--border)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {f.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Start Swiping CTA */}
      <div style={{ marginTop: '16px' }}>
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '16px', fontSize: '1.1rem' }}
            onClick={onStartSwiping}
          >
            <Play size={20} />
            <span>Start Swiping!</span>
          </button>
        ) : (
          <div
            className="card text-center"
            style={{
              background: 'var(--primary-light)',
              border: '1px solid #FECDD3',
              padding: '16px',
            }}
          >
            <p style={{ fontWeight: 700, color: 'var(--primary)' }}>
              Waiting for host to start the swiping round...
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Keep this screen open. Swiping will start automatically!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
