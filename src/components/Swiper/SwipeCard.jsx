import React, { useState, useRef, useEffect } from 'react';
import { Star, MapPin, DollarSign } from 'lucide-react';
import { PromotedBadge } from '../Monetization/PromotedBadge.jsx';

export function SwipeCard({
  venue,
  index = 0,
  isTop = false,
  onSwipe,
  programmaticSwipe = null,
}) {
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFlyingOut, setIsFlyingOut] = useState(false);
  const [flyDirection, setFlyDirection] = useState(null);

  const cardRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0, time: 0 });

  // Handle Programmatic Swipes (from button taps or keyboard shortcuts)
  useEffect(() => {
    if (!programmaticSwipe || !isTop || isFlyingOut) return;
    if (programmaticSwipe.venueId && programmaticSwipe.venueId !== venue.id) return;
    triggerFlyOut(programmaticSwipe.direction);
  }, [programmaticSwipe, isTop, venue.id]);

  const triggerFlyOut = (direction) => {
    setIsFlyingOut(true);
    setFlyDirection(direction);
    setTimeout(() => {
      if (onSwipe) {
        onSwipe(direction, venue);
      }
    }, 280);
  };

  const handlePointerDown = (e) => {
    if (!isTop || isFlyingOut || e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored if capture unsupported
    }

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !isTop) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    let deltaY = e.clientY - dragStartRef.current.y;

    // Damping downward pulls since we only swipe up for superlike
    if (deltaY > 0) {
      deltaY *= 0.25;
    }

    setDragOffset({ x: deltaX, y: deltaY });
  };

  const handlePointerUp = (e) => {
    if (!isDragging || !isTop) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignored
    }
    setIsDragging(false);

    const deltaX = dragOffset.x;
    const deltaY = dragOffset.y;
    const elapsed = Math.max(1, performance.now() - dragStartRef.current.time);
    const vx = deltaX / elapsed;
    const vy = deltaY / elapsed;

    const thresholdX = typeof window !== 'undefined'
      ? Math.min(110, window.innerWidth * 0.28)
      : 100;

    // Evaluate Swipe Thresholds & Velocity Flicks
    if ((deltaY < -90 && Math.abs(deltaX) < 75) || (vy < -0.6 && deltaY < -40)) {
      triggerFlyOut('superlike');
    } else if (deltaX > thresholdX || (vx > 0.55 && deltaX > 35)) {
      triggerFlyOut('like');
    } else if (deltaX < -thresholdX || (vx < -0.55 && deltaX < -35)) {
      triggerFlyOut('pass');
    } else {
      // Below threshold: spring-back bounce to center
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const handlePointerCancel = (e) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignored
    }
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
  };

  // Rotation physics: theta = deltaX * 0.0533 deg, clamped between -16 and 16
  const rawAngle = dragOffset.x * 0.0533;
  const rotation = isTop ? Math.max(-16, Math.min(16, rawAngle)) : 0;

  // Stamp Opacities based on drag displacement
  const likeOpacity = isTop ? Math.max(0, Math.min(1, (dragOffset.x - 20) / 70)) : 0;
  const passOpacity = isTop ? Math.max(0, Math.min(1, (-dragOffset.x - 20) / 70)) : 0;
  const superOpacity = isTop && Math.abs(dragOffset.x) < 60
    ? Math.max(0, Math.min(1, (-dragOffset.y - 30) / 60))
    : 0;

  // Compute CSS Transforms
  let transform = '';
  let transition = 'none';

  if (isFlyingOut) {
    transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.28s ease';
    if (flyDirection === 'like') {
      transform = 'translate3d(140vw, 0, 0) rotate(22deg)';
    } else if (flyDirection === 'pass') {
      transform = 'translate3d(-140vw, 0, 0) rotate(-22deg)';
    } else if (flyDirection === 'superlike') {
      transform = 'translate3d(0, -120vh, 0) rotate(0deg)';
    }
  } else if (isTop) {
    if (!isDragging) {
      transition = 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    }
    transform = `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${rotation}deg)`;
  } else {
    // Stack preview styling for background cards
    const baseScale = index === 1 ? 0.95 : 0.90;
    const baseTranslateY = index === 1 ? 12 : 24;
    transform = `translate3d(0, ${baseTranslateY}px, 0) scale(${baseScale})`;
    transition = 'transform 0.3s ease-out';
  }

  const zIndex = Math.max(1, 30 - index * 10);
  const priceDisplay = '$'.repeat(venue.priceTier || 2);

  return (
    <div
      ref={cardRef}
      className={`swipe-card ${isTop ? 'top-card' : 'preview-card'}`}
      style={{
        transform,
        transition,
        zIndex,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      aria-label={`Venue card: ${venue.name}`}
    >
      {/* Visual Stamps */}
      {isTop && (
        <>
          <div className="swipe-stamp stamp-like" style={{ opacity: likeOpacity }}>
            LIKE
          </div>
          <div className="swipe-stamp stamp-pass" style={{ opacity: passOpacity }}>
            PASS
          </div>
          <div className="swipe-stamp stamp-super" style={{ opacity: superOpacity }}>
            SUPERLIKE
          </div>
        </>
      )}

      {/* Card Photo & Badges */}
      <div className="card-image-wrap">
        <img
          src={venue.imageUrl}
          alt={venue.name}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onError={(e) => {
            // Elegant fallback photo
            e.target.src = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80';
          }}
        />
        {venue.isPromoted && (
          <PromotedBadge badge={venue.sponsorBadge} cta={venue.sponsorCta} />
        )}
      </div>

      {/* Card Details Body */}
      <div className="card-info">
        <div className="card-header-row">
          <h2 className="venue-name">{venue.name}</h2>
          <div className="venue-rating">
            <Star size={16} fill="#F59E0B" color="#F59E0B" />
            <span>{venue.rating}</span>
            {venue.reviewCount && (
              <span className="review-count">({venue.reviewCount})</span>
            )}
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
          <MapPin size={13} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '3px' }} />
          {venue.address}
        </p>

        <p className="venue-desc">{venue.description}</p>

        <div className="venue-tags">
          {(venue.tags || []).map((tag) => (
            <span key={tag} className="venue-tag">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SwipeCard;
