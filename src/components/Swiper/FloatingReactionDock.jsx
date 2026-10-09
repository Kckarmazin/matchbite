import React, { useState, useEffect, useRef } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import * as api from '../../utils/api.js';

export const REACTIONS = [
  { emoji: '🔥', label: 'Fire' },
  { emoji: '🤤', label: 'Craving' },
  { emoji: '🥂', label: 'Vibes' },
  { emoji: '🙅', label: 'Veto' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '👀', label: 'Intrigued' },
];

export function FloatingReactionDock({ activeVenueId }) {
  const { room, participant, triggerLocalReaction } = useRoom();
  const [tokens, setTokens] = useState(5);
  const [isLocked, setIsLocked] = useState(false);
  const cooldownRef = useRef(null);

  // Client token bucket refill: +1 token every 750ms (up to max capacity 5)
  useEffect(() => {
    cooldownRef.current = setInterval(() => {
      setTokens((prev) => Math.min(5, prev + 1));
    }, 750);
    return () => clearInterval(cooldownRef.current);
  }, []);

  const handleSend = async (emoji) => {
    if (tokens <= 0 || isLocked || !room?.code) return;

    // Deduct client token
    setTokens((prev) => {
      const next = prev - 1;
      if (next === 0) {
        setIsLocked(true);
        setTimeout(() => setIsLocked(false), 750);
      }
      return next;
    });

    // 0ms Perceived Latency: Spawn locally into canvas particle pool immediately
    if (triggerLocalReaction) {
      triggerLocalReaction({
        emoji,
        avatar: participant?.avatar || '🦊',
        name: participant?.name || 'You',
        venueId: activeVenueId,
      });
    }

    // Send HTTP POST to server coalescer
    try {
      await api.sendReaction(room.code, {
        participantId: participant?.id,
        participantName: participant?.name,
        avatar: participant?.avatar,
        emoji,
        venueId: activeVenueId,
      });
    } catch (err) {
      console.debug('Reaction delivery skipped:', err.message);
    }
  };

  return (
    <div className="reaction-dock-container" role="toolbar" aria-label="Quick Reactions">
      <div className={`reaction-dock-pill ${tokens === 0 || isLocked ? 'cooling-down' : ''}`}>
        {REACTIONS.map(({ emoji, label }) => (
          <button
            key={emoji}
            type="button"
            className="reaction-dock-btn"
            disabled={tokens <= 0}
            onClick={() => handleSend(emoji)}
            aria-label={`Send ${label} reaction`}
            title={label}
          >
            <span className="reaction-emoji">{emoji}</span>
          </button>
        ))}
      </div>
      {tokens === 0 && (
        <span className="reaction-cooldown-badge" aria-live="polite">
          Wait 1s...
        </span>
      )}
    </div>
  );
}

export default FloatingReactionDock;
