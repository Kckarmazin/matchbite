import React from 'react';
import { Calendar, Navigation, ShoppingBag, ExternalLink, Globe } from 'lucide-react';

export function AffiliateActions({ venue, partner = null }) {
  if (!venue) return null;

  const links = venue.affiliateLinks || {};
  const venueId = venue.id;
  const isPromoted = Boolean(venue.isPromoted);

  // Helper to build redirect URL
  const getActionUrl = (defaultUrl, action, defaultPartner) => {
    if (defaultUrl && defaultUrl.startsWith('/api/affiliate/redirect')) {
      return defaultUrl;
    }
    const p = partner || defaultPartner;
    const params = new URLSearchParams({
      partner: p,
      venueId,
      action,
      ...(isPromoted ? { promoted: 'true' } : {}),
    });
    if (defaultUrl) {
      params.set('url', defaultUrl);
    }
    return `/api/affiliate/redirect?${params.toString()}`;
  };

  const reservationHref = getActionUrl(links.reservationUrl, 'reserve', 'opentable');
  const directionsHref = getActionUrl(links.directionsUrl, 'directions', 'googlemaps');
  const deliveryHref = getActionUrl(links.deliveryUrl, 'delivery', 'doordash');
  const menuHref = getActionUrl(links.menuUrl, 'menu', 'direct');

  const rawWeb = venue.websiteUrl || links.websiteUrl || links.menuUrl;
  const webTarget = rawWeb
    ? (/^https?:\/\//i.test(rawWeb.trim()) ? rawWeb.trim() : `https://${rawWeb.trim()}`)
    : `https://www.google.com/search?q=${encodeURIComponent(`${venue.name} ${venue.address || ''}`.trim())}`;
  const websiteHref = getActionUrl(webTarget, 'website', 'direct');

  return (
    <div className="affiliate-actions-grid">
      <a
        href={reservationHref}
        target="_blank"
        rel="noopener noreferrer"
        className="affiliate-btn btn-reserve"
      >
        <Calendar size={18} />
        <span>Reserve Table</span>
      </a>

      <a
        href={directionsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="affiliate-btn btn-directions"
      >
        <Navigation size={18} />
        <span>Get Directions</span>
      </a>

      <a
        href={deliveryHref}
        target="_blank"
        rel="noopener noreferrer"
        className="affiliate-btn btn-delivery"
      >
        <ShoppingBag size={18} />
        <span>Order Delivery</span>
      </a>

      {links.menuUrl && (
        <a
          href={menuHref}
          target="_blank"
          rel="noopener noreferrer"
          className="affiliate-btn btn-menu"
        >
          <ExternalLink size={18} />
          <span>View Menu</span>
        </a>
      )}

      <a
        href={websiteHref}
        target="_blank"
        rel="noopener noreferrer"
        className="affiliate-btn btn-website"
      >
        <Globe size={18} />
        <span>Official Website</span>
      </a>
    </div>
  );
}

export default AffiliateActions;
