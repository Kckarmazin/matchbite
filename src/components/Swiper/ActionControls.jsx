import React from 'react';
import { X, Star, Heart } from 'lucide-react';

export function ActionControls({ onSwipe, disabled = false }) {
  return (
    <div className="action-controls-bar">
      <button
        type="button"
        className="ctrl-btn ctrl-pass"
        onClick={() => onSwipe('pass')}
        disabled={disabled}
        aria-label="Pass on venue"
        title="Pass (Left Arrow or A)"
      >
        <X size={28} />
      </button>

      <button
        type="button"
        className="ctrl-btn ctrl-superlike"
        onClick={() => onSwipe('superlike')}
        disabled={disabled}
        aria-label="Superlike venue"
        title="Superlike (Up Arrow or W)"
      >
        <Star size={24} fill="currentColor" />
      </button>

      <button
        type="button"
        className="ctrl-btn ctrl-like"
        onClick={() => onSwipe('like')}
        disabled={disabled}
        aria-label="Like venue"
        title="Like (Right Arrow or D)"
      >
        <Heart size={28} fill="currentColor" />
      </button>
    </div>
  );
}

export default ActionControls;
