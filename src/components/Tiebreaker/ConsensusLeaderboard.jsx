import React, { useState, useEffect } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import * as api from '../../utils/api.js';
import { Trophy, Star, Sparkles, RotateCcw, Award, CheckCircle, Zap } from 'lucide-react';

export function ConsensusLeaderboard({ onOpenWheel, onRestart }) {
  const { room, participant, selectWinner, restartRoom, startSuddenDeath, showToast } = useRoom();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isStartingSuddenDeath, setIsStartingSuddenDeath] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchResults = async () => {
      if (!room?.code) return;
      try {
        const data = await api.getRoomResults(room.code);
        if (isMounted) {
          setResults(data);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load results:', err);
          setLoading(false);
        }
      }
    };

    fetchResults();
    const interval = setInterval(fetchResults, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [room?.code, room?.version]);

  const leaderboard = results?.leaderboard || [];
  const isHost = Boolean(participant?.isHost);

  const handleSelect = async (venueId) => {
    if (!isHost || isSelecting) return;
    setIsSelecting(true);
    try {
      await selectWinner(venueId);
    } catch (err) {
      console.error('Error selecting winner:', err);
    } finally {
      setIsSelecting(false);
    }
  };

  const handleRestart = async () => {
    if (!isHost) return;
    try {
      if (onRestart) {
        onRestart();
      } else {
        await restartRoom({ reshuffleDeck: false });
      }
    } catch (err) {
      console.error('Error restarting:', err);
    }
  };

  const handleSuddenDeath = async () => {
    if (!isHost || isStartingSuddenDeath) return;
    setIsStartingSuddenDeath(true);
    try {
      await startSuddenDeath(3);
    } catch (err) {
      console.error('Error starting sudden death:', err);
    } finally {
      setIsStartingSuddenDeath(false);
    }
  };

  if (loading && !results) {
    return (
      <div className="card text-center" style={{ padding: '40px 20px' }}>
        <Trophy size={40} color="var(--primary)" style={{ margin: '0 auto 16px' }} />
        <h2 className="card-title">Tallying Group Votes...</h2>
        <p className="card-subtitle">Calculating ranked-choice consensus...</p>
      </div>
    );
  }

  return (
    <div className="leaderboard-container">
      {/* Header */}
      <div className="leaderboard-header text-center" style={{ marginBottom: '20px' }}>
        <div className="match-banner-pill" style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)' }}>
          <Trophy size={16} />
          <span>Consensus Rankings</span>
        </div>
        <h1 className="card-title" style={{ fontSize: '1.6rem', marginTop: '8px' }}>
          Group Leaderboard
        </h1>
        <p className="card-subtitle">
          {leaderboard.length > 0 && leaderboard[0].score > 0
            ? 'Top contenders based on mutual group approvals and superlikes.'
            : 'Explore top venues from your session.'}
        </p>
      </div>

      {/* Host Sudden Death Showdown Banner & Trigger */}
      {isHost && leaderboard.length >= 2 && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(239, 68, 68, 0.08))',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#D97706', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Zap size={15} fill="#D97706" /> Sudden Death Tiebreaker
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Top {Math.min(3, leaderboard.length)} finalists</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Can't agree? Deal a rapid mini-deck of the top {Math.min(3, leaderboard.length)} contenders for everyone to re-swipe!
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #DC2626)',
              border: 'none',
              padding: '10px 14px',
              fontSize: '0.9rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '4px',
            }}
            onClick={handleSuddenDeath}
            disabled={isStartingSuddenDeath}
          >
            <Zap size={16} fill="white" />
            <span>{isStartingSuddenDeath ? 'Launching Showdown...' : 'Start Sudden Death (Top 3 Showdown)'}</span>
          </button>
        </div>
      )}

      {/* Host Control Action Bar */}
      <div className="leaderboard-actions-bar" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          onClick={onOpenWheel}
        >
          <Sparkles size={18} />
          <span>Spin Decision Roulette 🎡</span>
        </button>

        {isHost && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ width: 'auto', padding: '0 16px' }}
            onClick={handleRestart}
            title="Restart voting round"
          >
            <RotateCcw size={18} />
          </button>
        )}
      </div>

      {/* Leaderboard List */}
      <div className="leaderboard-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {leaderboard.map((item, index) => {
          const venue = item.venue;
          const rank = index + 1;
          const isTopThree = rank <= 3;
          const rankColor = rank === 1 ? '#F59E0B' : rank === 2 ? '#94A3B8' : rank === 3 ? '#D97706' : '#64748B';

          return (
            <div
              key={venue.id}
              className={`leaderboard-card ${rank === 1 ? 'rank-first' : ''}`}
              style={{
                background: 'var(--surface-card)',
                border: rank === 1 ? '2px solid #FCD34D' : '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: rank === 1 ? '0 4px 12px rgba(245, 158, 11, 0.15)' : 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {/* Rank Badge */}
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--radius-full)',
                    background: isTopThree ? `${rankColor}1A` : 'var(--surface-muted)',
                    color: rankColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1rem',
                    flexShrink: 0,
                  }}
                >
                  #{rank}
                </div>

                {/* Venue Thumbnail */}
                <img
                  src={venue.imageUrl}
                  alt={venue.name}
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: 'var(--radius-sm)',
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                  onError={(e) => {
                    e.target.src = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=200&q=80';
                  }}
                />

                {/* Venue Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <h3
                      style={{
                        fontSize: '1rem',
                        fontWeight: 700,
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {venue.name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.85rem', color: '#D97706', fontWeight: 700 }}>
                      <Star size={13} fill="#F59E0B" color="#F59E0B" />
                      <span>{venue.rating}</span>
                    </div>
                  </div>

                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {venue.cuisine} • {'$'.repeat(venue.priceTier || 2)} • {venue.distance}
                  </p>
                </div>
              </div>

              {/* Score and Approval Metrics */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                  Score: <strong>{item.score} pts</strong> ({item.approvals} approval{item.approvals === 1 ? '' : 's'})
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {item.approvalRate}% Group Approval
                </span>
              </div>

              {/* Approval Bar */}
              <div style={{ width: '100%', height: '6px', background: 'var(--surface-muted)', borderRadius: '9999px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${item.approvalRate}%`,
                    height: '100%',
                    background: rank === 1 ? 'var(--primary)' : 'var(--secondary)',
                    borderRadius: '9999px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              {/* Voter reactions list */}
              {item.voters && item.voters.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '2px' }}>Liked by:</span>
                  {item.voters.map((v) => (
                    <span
                      key={v.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'var(--surface-muted)',
                        padding: '2px 6px',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                      }}
                      title={`${v.name} (${v.vote})`}
                    >
                      <span>{v.avatar || '👤'}</span>
                      <span>{v.vote === 'superlike' ? '⭐' : '❤️'}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Host Select Button */}
              {isHost && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ marginTop: '4px', width: '100%', fontSize: '0.85rem', padding: '6px 12px' }}
                  onClick={() => handleSelect(venue.id)}
                  disabled={isSelecting}
                >
                  <Award size={14} />
                  <span>Lock in as Winner</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ConsensusLeaderboard;
