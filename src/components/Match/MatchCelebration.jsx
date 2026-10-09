import React, { useEffect, useState } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import { fireCelebrationConfetti, playMatchChime } from './Confetti.js';
import { PromotedBadge } from '../Monetization/PromotedBadge.jsx';
import { ViralMatchCardModal } from './ViralMatchCardModal.jsx';
import {
  Sparkles,
  Star,
  MapPin,
  Calendar,
  Navigation,
  ShoppingBag,
  ExternalLink,
  Share2,
  RotateCcw,
  CheckCircle,
} from 'lucide-react';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';

export function MatchCelebration({
  venue: propVenue = null,
  match: propMatch = null,
  onRestart = null,
}) {
  const { room, participant, showToast, leaveRoom } = useRoom();
  const [copiedLink, setCopiedLink] = useState(false);
  const [isLoadingTimedOut, setIsLoadingTimedOut] = useState(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);

  // Derive venue and match details from props or room state with deck fallback
  const venue = propVenue
    || room?.matchedVenue
    || room?.match?.venue
    || (room?.matchedVenueId && room?.deck ? room.deck.find(v => v && v.id === room.matchedVenueId) : null)
    || null;
  const matchData = propMatch || room?.match || null;
  const participants = matchData?.participants || (room?.participants || []).map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    vote: 'like',
  }));

  useEffect(() => {
    if (!venue) {
      const timer = setTimeout(() => {
        setIsLoadingTimedOut(true);
      }, 3500);
      return () => clearTimeout(timer);
    } else {
      setIsLoadingTimedOut(false);
    }
  }, [venue]);

  // Trigger celebratory confetti and audio arpeggio on mount
  useEffect(() => {
    fireCelebrationConfetti();
    playMatchChime();
    try {
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    } catch {
      // Gracefully ignored on standard browsers
    }
  }, []);

  const handleShareResult = async () => {
    const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
    const shareText = venue
      ? `🎉 Our group matched on ${venue.name} using MatchBite!`
      : '🎉 We found a group match on MatchBite!';

    try {
      await Share.share({
        title: 'MatchBite Match Revealed!',
        text: shareText,
        url: shareUrl,
        dialogTitle: 'Share your group match',
      });
      return;
    } catch {
      // Fallback to navigator.share or clipboard
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'MatchBite Match Revealed!',
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        setCopiedLink(true);
        showToast('Match summary copied to clipboard! 📋', 'success');
        setTimeout(() => setCopiedLink(false), 2500);
      } catch {
        showToast('Unable to copy link', 'error');
      }
    }
  };

  if (!venue) {
    if (!isLoadingTimedOut) {
      return (
        <div className="card text-center" style={{ padding: '40px 20px' }}>
          <Sparkles size={40} color="var(--primary)" style={{ margin: '0 auto 16px' }} />
          <h2 className="card-title">Match Found!</h2>
          <p className="card-subtitle">Loading winning venue details...</p>
          <div style={{ marginTop: '20px' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={leaveRoom}
            >
              Return to Lobby
            </button>
          </div>
        </div>
      );
    }

    // Graceful Recovery Fallback Card when loading timed out or venue is missing:
    return (
      <div className="match-celebration-container">
        <div className="celebration-hero-header">
          <div className="match-banner-pill">
            <Sparkles size={16} className="sparkle-anim" />
            <span>Consensus Reached!</span>
          </div>
          <h1 className="celebration-headline">The Group Has Spoken!</h1>
          <p className="celebration-subtitle">
            Everyone agreed on a match, but winning venue details could not be loaded.
          </p>
        </div>

        <div className="celebration-card" style={{ padding: '28px', textAlign: 'center' }}>
          {room?.matchedVenueId && (
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
              Venue Reference: <code>{room.matchedVenueId}</code>
            </p>
          )}

          {/* Render unanimous roster so participants still see group agreement */}
          {participants.length > 0 && (
            <div className="unanimous-roster-box" style={{ marginBottom: '24px' }}>
              <div className="unanimous-roster-header">
                <CheckCircle size={16} color="var(--success)" />
                <span>100% Unanimous Agreement</span>
              </div>
              <div className="unanimous-members-row">
                {participants.map((p) => (
                  <div key={p.id} className="roster-avatar-badge" title={`${p.name} agreed!`}>
                    <span className="roster-avatar">{p.avatar || '👤'}</span>
                    <span className="roster-name">{p.name}</span>
                    <span className="roster-reaction">{p.vote === 'superlike' ? '⭐' : '❤️'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="match-footer-controls" style={{ justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => window.location.reload()}
            >
              Reload Session
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={leaveRoom}
            >
              Return to Lobby
            </button>
            {onRestart && participant?.isHost && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onRestart}
              >
                <RotateCcw size={18} />
                <span>Swipe Again</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const priceDisplay = '$'.repeat(venue.priceTier || 2);
  const affiliate = venue.affiliateLinks || {};

  return (
    <div className="match-celebration-container">
      {/* Victory Header */}
      <div className="celebration-hero-header">
        <div className="match-banner-pill">
          <Sparkles size={16} className="sparkle-anim" />
          <span>It's a Match!</span>
        </div>
        <h1 className="celebration-headline">The Group Has Spoken!</h1>
        <p className="celebration-subtitle">Everyone agreed on the perfect spot.</p>
      </div>

      {/* Winning Venue Showcase Card */}
      <div className="celebration-card">
        <div className="venue-hero-image-wrap">
          <img
            src={venue.imageUrl}
            alt={venue.name}
            className="venue-hero-image"
            draggable={false}
            onError={(e) => {
              e.target.src = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80';
            }}
          />
          {venue.isPromoted && (
            <div className="hero-promoted-tag">
              <PromotedBadge badge={venue.sponsorBadge} cta={venue.sponsorCta} />
            </div>
          )}
        </div>

        <div className="celebration-venue-info">
          <div className="venue-name-row">
            <h2 className="winning-venue-title">{venue.name}</h2>
            <div className="venue-rating-badge">
              <Star size={16} fill="#F59E0B" color="#F59E0B" />
              <span>{venue.rating}</span>
              {venue.reviewCount && <span className="review-sub">({venue.reviewCount})</span>}
            </div>
          </div>

          <p className="venue-meta">
            <span className="meta-cuisine">{venue.cuisine}</span>
            <span className="meta-divider">•</span>
            <span className="meta-price">{priceDisplay}</span>
            <span className="meta-divider">•</span>
            <span className="meta-distance">{venue.distance}</span>
          </p>

          <p className="venue-address">
            <MapPin size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
            {venue.address}
          </p>

          <p className="venue-desc">{venue.description}</p>

          {/* Tags */}
          <div className="venue-tags">
            {(venue.tags || []).map((t) => (
              <span key={t} className="venue-tag">
                {t}
              </span>
            ))}
          </div>

          {/* 100% Unanimous Agreement Section */}
          <div className="unanimous-roster-box">
            <div className="unanimous-roster-header">
              <CheckCircle size={16} color="var(--success)" />
              <span>100% Unanimous Agreement</span>
            </div>
            <div className="unanimous-members-row">
              {participants.map((p) => (
                <div key={p.id} className="roster-avatar-badge" title={`${p.name} agreed!`}>
                  <span className="roster-avatar">{p.avatar || '👤'}</span>
                  <span className="roster-name">{p.name}</span>
                  <span className="roster-reaction">
                    {p.vote === 'superlike' ? '⭐' : '❤️'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons (Affiliate-Ready Monetization Hooks) */}
          <div className="affiliate-actions-grid">
            {affiliate.reservationUrl && (
              <a
                href={affiliate.reservationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="affiliate-btn btn-reserve"
              >
                <Calendar size={18} />
                <span>Reserve Table</span>
              </a>
            )}

            {affiliate.directionsUrl && (
              <a
                href={affiliate.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="affiliate-btn btn-directions"
              >
                <Navigation size={18} />
                <span>Get Directions</span>
              </a>
            )}

            {affiliate.deliveryUrl && (
              <a
                href={affiliate.deliveryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="affiliate-btn btn-delivery"
              >
                <ShoppingBag size={18} />
                <span>Order Delivery</span>
              </a>
            )}

            {affiliate.menuUrl && (
              <a
                href={affiliate.menuUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="affiliate-btn btn-menu"
              >
                <ExternalLink size={18} />
                <span>View Menu</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Share and Restart Controls */}
      <div className="match-footer-controls">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsCardModalOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Sparkles size={18} />
          <span>Story Card 📸</span>
        </button>

        <button
          type="button"
          className="btn btn-outline"
          onClick={handleShareResult}
        >
          <Share2 size={18} />
          <span>{copiedLink ? 'Copied to Clipboard!' : 'Share Match'}</span>
        </button>

        {onRestart && participant?.isHost && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRestart}
          >
            <RotateCcw size={18} />
            <span>Swipe Again</span>
          </button>
        )}
      </div>

      <ViralMatchCardModal
        venue={venue}
        isOpen={isCardModalOpen}
        onClose={() => setIsCardModalOpen(false)}
      />
    </div>
  );
}

export default MatchCelebration;
