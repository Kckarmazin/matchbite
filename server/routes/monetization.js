import { Router } from 'express';
import { globalRoomStore } from '../models/RoomStore.js';
import { globalBroadcaster } from '../sync/Broadcaster.js';
import { normalizeRoomCode } from '../models/RoomCode.js';
import { extractAuthTokens } from './rooms.js';

export const VALID_AFFILIATE_PARTNERS = Object.freeze([
  'opentable',
  'resy',
  'doordash',
  'ubereats',
  'googlemaps',
  'maps',
  'grubhub',
  'yelp',
]);

export function buildAffiliateUrl({ partner, venue, venueId, action, url, promoted }) {
  let targetUrl = url;

  if (!targetUrl) {
    const venueName = venue?.name || venueId || 'Restaurant';
    switch (partner) {
      case 'opentable':
        targetUrl = `https://www.opentable.com/s?term=${encodeURIComponent(venueName)}`;
        break;
      case 'resy':
        targetUrl = `https://resy.com/cities/search?query=${encodeURIComponent(venueName)}`;
        break;
      case 'doordash':
        targetUrl = `https://www.doordash.com/search/store/${encodeURIComponent(venueName)}`;
        break;
      case 'ubereats':
        targetUrl = `https://www.ubereats.com/search?q=${encodeURIComponent(venueName)}`;
        break;
      case 'googlemaps':
      case 'maps':
        targetUrl = `https://maps.google.com/?q=${encodeURIComponent(venueName)}`;
        break;
      case 'grubhub':
        targetUrl = `https://www.grubhub.com/search?queryText=${encodeURIComponent(venueName)}`;
        break;
      default:
        targetUrl = `https://example.com/partner/${encodeURIComponent(partner)}?venue=${encodeURIComponent(venueId || venueName)}`;
        break;
    }
  }

  // Append UTM tracking parameters
  const delimiter = targetUrl.includes('?') ? '&' : '?';
  const utmParams = new URLSearchParams({
    utm_source: 'matchbite',
    utm_medium: 'referral',
    utm_campaign: 'group_decision',
    utm_content: partner || 'direct',
  });

  if (action) {
    utmParams.set('action', action);
  }

  if (promoted) {
    utmParams.set('utm_term', 'promoted');
  }

  return `${targetUrl}${delimiter}${utmParams.toString()}`;
}

export function createMonetizationRouter(roomStore = globalRoomStore, broadcaster = globalBroadcaster) {
  const router = Router();

  /**
   * GET /api/affiliate/redirect
   * Outbound affiliate tracking endpoint formatting standard UTM tags and 302 redirect.
   */
  router.get('/affiliate/redirect', (req, res) => {
    const { partner, venueId, action, url, promoted, format } = req.query;
    const cleanPartner = typeof partner === 'string' ? partner.trim().toLowerCase() : '';
    const isPromoted = promoted === 'true' || promoted === true;

    if (!cleanPartner && !url) {
      return res.status(400).json({
        success: false,
        error: 'Valid affiliate partner or target url is required',
      });
    }

    if (url) {
      const trimmedUrl = String(url).trim();
      if (!/^https?:\/\//i.test(trimmedUrl)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid target URL: only http:// and https:// protocols are supported',
        });
      }
    }

    if (cleanPartner && !VALID_AFFILIATE_PARTNERS.includes(cleanPartner) && !url) {
      return res.status(400).json({
        success: false,
        error: `Unsupported affiliate partner '${cleanPartner}'. Valid partners: ${VALID_AFFILIATE_PARTNERS.join(', ')}`,
      });
    }

    const venue = venueId ? roomStore.getVenueById(venueId) : null;
    const destinationUrl = buildAffiliateUrl({
      partner: cleanPartner,
      venue,
      venueId,
      action,
      url,
      promoted: isPromoted,
    });

    // Record outbound attribution analytics
    const clickRecord = roomStore.recordAffiliateClick({
      partner: cleanPartner || 'custom',
      venueId: venueId || null,
      action: action || 'redirect',
      promoted: isPromoted,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Respond with JSON if requested (useful for tests and programmatic clients)
    if (format === 'json') {
      return res.status(200).json({
        success: true,
        partner: cleanPartner,
        venueId,
        action,
        promoted: isPromoted,
        destinationUrl,
        clickId: clickRecord.id,
      });
    }

    // Default: 302 Temporary Redirect
    res.set('Location', destinationUrl);
    return res.redirect(302, destinationUrl);
  });

  /**
   * GET /api/affiliate/analytics
   * Retrieves aggregated click analytics for affiliate conversions.
   */
  router.get('/affiliate/analytics', (req, res) => {
    try {
      const analytics = roomStore.getAffiliateAnalytics();
      return res.status(200).json({
        success: true,
        analytics,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Failed to retrieve analytics',
      });
    }
  });

  /**
   * POST /api/rooms/:code/upgrade
   * Upgrades session to VIP status with card verification and coupon codes.
   */
  router.post('/rooms/:code/upgrade', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const auth = extractAuthTokens(req);

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    try {
      const result = roomStore.upgradeRoom(code, {
        ...req.body,
        ...auth,
      });
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to upgrade room',
      });
    }
  });

  /**
   * POST /api/rooms/:code/custom-venue
   * Injects a user-defined venue into the room deck (VIP exclusive).
   */
  router.post('/rooms/:code/custom-venue', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const auth = extractAuthTokens(req);

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    try {
      const result = roomStore.addCustomVenue(code, auth, req.body || {});
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to add custom venue',
      });
    }
  });

  return router;
}
