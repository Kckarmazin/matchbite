import React from 'react';
import { Sparkles, Gift } from 'lucide-react';

export function PromotedBadge({ badge = 'Promoted', cta = null }) {
  return (
    <div className="promoted-badge-wrapper">
      <div className="promoted-tag">
        <Sparkles size={12} className="promoted-sparkle" />
        <span>{badge}</span>
      </div>
      {cta && (
        <div className="promoted-perk">
          <Gift size={12} className="perk-icon" />
          <span className="perk-text">{cta}</span>
        </div>
      )}
    </div>
  );
}

export default PromotedBadge;
