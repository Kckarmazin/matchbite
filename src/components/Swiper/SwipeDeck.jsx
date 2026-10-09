import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import { SwipeCard } from './SwipeCard.jsx';
import { ActionControls } from './ActionControls.jsx';
import { DeckComplete } from './DeckComplete.jsx';
import { FloatingReactionDock } from './FloatingReactionDock.jsx';
import { FloatingReactionCanvas } from './FloatingReactionCanvas.jsx';
import { CustomVenueModal } from '../Monetization/CustomVenueModal.jsx';
import { Sparkles, Layers, Trophy, PlusCircle, Zap } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export function SwipeDeck({ onViewResults = null }) {
  const { room, participant, castVote, undoVote, showToast, setViewMode, setIsVipModalOpen } = useRoom();
  const deck = useMemo(() => room?.deck || [], [room?.deck]);

  const [currentIndex, setCurrentIndex] = useState(() => {
    // Resume from participant's already swiped count if returning to room
    return participant?.swipedCount || 0;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [programmaticTrigger, setProgrammaticTrigger] = useState(null);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  // Reset or adjust currentIndex when Sudden Death begins or deck changes
  useEffect(() => {
    if (room?.isSuddenDeath || participant?.swipedCount !== undefined) {
      setCurrentIndex(participant?.swipedCount || 0);
    }
  }, [room?.isSuddenDeath, room?.deck]);

  // Top card
  const topCard = deck[currentIndex] || null;

  // Windowing: at most 3 cards visible at any time
  const visibleCards = useMemo(() => {
    if (!deck.length) return [];
    return deck.slice(currentIndex, currentIndex + 3);
  }, [deck, currentIndex]);

  // Execute swipe vote
  const handleCardSwipe = useCallback(async (direction, venue) => {
    if (!venue || !room?.code) return;

    // Trigger mobile haptic feedback if running on device
    try {
      if (direction === 'superlike') {
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
      } else {
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      }
    } catch {
      // Gracefully ignored on browsers
    }

    // Advance deck index
    setCurrentIndex((prev) => prev + 1);
    setProgrammaticTrigger(null);

    try {
      setIsSubmitting(true);
      await castVote(venue.id, direction);
    } catch (err) {
      console.error('Error casting vote:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [room?.code, castVote]);

  // Step back 1 card to undo accidental swipe
  const handleUndo = useCallback(async () => {
    if (currentIndex <= 0 || isSubmitting) return;
    const targetIndex = currentIndex - 1;
    const prevVenue = deck[targetIndex];
    if (!prevVenue) return;

    setCurrentIndex(targetIndex);
    setProgrammaticTrigger(null);

    try {
      setIsSubmitting(true);
      if (undoVote) {
        await undoVote(prevVenue.id);
      }
      showToast(`Rewound to ${prevVenue.name}`, 'info');
    } catch (err) {
      console.error('Error undoing vote:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [currentIndex, isSubmitting, deck, undoVote, showToast]);

  // Trigger programmatic swipe (e.g. from buttons or keyboard)
  const handleActionClick = useCallback((direction) => {
    if (!topCard || isSubmitting) return;
    setProgrammaticTrigger({
      direction,
      venueId: topCard.id,
      timestamp: Date.now(),
    });
  }, [topCard, isSubmitting]);

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is currently typing in an input or textarea
      if (e.target && e.target.matches('input, textarea, select, [contenteditable="true"]')) {
        return;
      }

      if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (!topCard || isSubmitting) return;

      if (e.key === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        handleActionClick('pass');
      } else if (e.key === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        handleActionClick('like');
      } else if (e.key === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        handleActionClick('superlike');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [topCard, isSubmitting, handleActionClick, handleUndo]);

  // If deck is exhausted, render DeckComplete screen
  if (deck.length > 0 && currentIndex >= deck.length) {
    return (
      <DeckComplete
        participants={room?.participants || []}
        onViewResults={onViewResults || (() => setViewMode('leaderboard'))}
      />
    );
  }

  // If no cards in deck yet
  if (!deck.length) {
    return (
      <div className="card text-center" style={{ padding: '40px 20px' }}>
        <Sparkles size={36} color="var(--primary)" style={{ margin: '0 auto 16px' }} />
        <h3 className="card-title">Preparing Your Deck...</h3>
        <p className="card-subtitle">Loading curated venues matching your preferences.</p>
      </div>
    );
  }

  const progressPercent = Math.round((currentIndex / deck.length) * 100);

  return (
    <div className="swipe-deck-wrapper">
      {/* Sudden Death Showdown Banner */}
      {room?.isSuddenDeath && (
        <div
          style={{
            background: 'linear-gradient(135deg, #F59E0B, #DC2626)',
            color: '#FFFFFF',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '10px',
            fontSize: '0.82rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: '0 2px 10px rgba(220, 38, 38, 0.3)',
            letterSpacing: '0.02em',
          }}
        >
          <Zap size={16} fill="white" />
          <span>⚡ SUDDEN DEATH ROUND: Top Finalists — Vote to Break the Tie!</span>
        </div>
      )}

      {/* Deck Header & Progress Indicator */}
      <div className="deck-progress-header">
        <div className="progress-info-row">
          <span className="card-counter">
            <Layers size={14} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '4px' }} />
            Spot <strong>{currentIndex + 1}</strong> of {deck.length}
          </span>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.75rem', padding: '2px 8px', height: '24px' }}
              onClick={() => {
                if (room?.isVip) {
                  setIsCustomModalOpen(true);
                } else {
                  setIsVipModalOpen(true);
                }
              }}
              title={room?.isVip ? 'Add secret spot' : 'Upgrade to VIP to add custom spots'}
            >
              <PlusCircle size={12} />
              <span>Spot</span>
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.75rem', padding: '2px 8px', height: '24px' }}
              onClick={() => setViewMode('leaderboard')}
              title="View Leaderboard"
            >
              <Trophy size={12} />
              <span>Scores</span>
            </button>
            <span className="deck-category-badge">
              {room?.settings?.activityCategory || 'Dining'}
            </span>
          </div>
        </div>
        <div className="deck-progress-track">
          <div
            className="deck-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 3D Stack Container */}
      <div className="swipe-deck-container">
        {visibleCards
          .map((venue, idx) => ({ venue, stackIdx: idx }))
          .reverse()
          .map(({ venue, stackIdx }) => {
            const isTop = stackIdx === 0;
            return (
              <SwipeCard
                key={venue.id}
                venue={venue}
                index={stackIdx}
                isTop={isTop}
                onSwipe={handleCardSwipe}
                programmaticSwipe={isTop ? programmaticTrigger : null}
              />
            );
          })}
      </div>

      {/* Real-Time Floating Swipe Reactions */}
      <FloatingReactionDock activeVenueId={topCard?.id} />

      {/* Accessible Action Controls Bar */}
      <ActionControls
        onSwipe={handleActionClick}
        onUndo={handleUndo}
        canUndo={currentIndex > 0 && !isSubmitting}
        disabled={isSubmitting || !topCard}
      />

      <div className="keyboard-shortcuts-hint">
        <span>Use <strong>↺ / Z</strong> Rewind, <strong>←</strong> Pass, <strong>↑</strong> Superlike, <strong>→</strong> Like</span>
      </div>

      <FloatingReactionCanvas />

      <CustomVenueModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
      />
    </div>
  );
}

export default SwipeDeck;
