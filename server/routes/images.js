import { Router } from 'express';
import dns from 'node:dns/promises';
import { globalRoomStore } from '../models/RoomStore.js';
import { extractAuthTokens } from './rooms.js';

export const TRUSTED_IMAGE_CDNS = [
  'images.unsplash.com',
  'lh3.googleusercontent.com',
  'places.googleapis.com',
  'maps.googleapis.com',
  'images.pexels.com',
  'cdn.pixabay.com',
  'upload.wikimedia.org',
];

const proxyCache = new Map();
const MAX_CACHE_ITEMS = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Checks whether an IP address belongs to RFC 1918, loopback, link-local,
 * cloud metadata, or other non-public network ranges.
 */
export function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;

  const cleanIp = ip.trim().replace(/^\[|\]$/g, '');

  // IPv4 mapped IPv6 (::ffff:192.168.1.1)
  if (cleanIp.startsWith('::ffff:')) {
    return isPrivateIp(cleanIp.replace('::ffff:', ''));
  }

  // IPv4 Loopback & Unspecified
  if (/^127\./.test(cleanIp) || cleanIp === '0.0.0.0') return true;

  // RFC 1918 Private Subnets
  if (/^10\./.test(cleanIp)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)) return true;
  if (/^192\.168\./.test(cleanIp)) return true;

  // Link-Local / Cloud Metadata (169.254.169.254, etc.)
  if (/^169\.254\./.test(cleanIp)) return true;

  // Multicast & Reserved (224.0.0.0 - 255.255.255.255)
  if (/^2(2[4-9]|[3-5][0-9])\./.test(cleanIp)) return true;

  // IPv6 Loopback, Link-Local, and Unique Local
  if (
    cleanIp === '::1' ||
    cleanIp === '::' ||
    cleanIp.toLowerCase().startsWith('fe80:') ||
    cleanIp.toLowerCase().startsWith('fc00:') ||
    cleanIp.toLowerCase().startsWith('fd00:')
  ) {
    return true;
  }

  return false;
}

/**
 * Validates whether a target URL is public and safe to fetch, preventing SSRF.
 */
export async function isSafePublicUrl(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost, .localhost, and private local domains
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return false;
  }

  // Fast-path known trusted CDNs
  if (TRUSTED_IMAGE_CDNS.some((cdn) => hostname === cdn || hostname.endsWith(`.${cdn}`))) {
    return true;
  }

  // Check if raw hostname is already a private IP string
  if (isPrivateIp(hostname)) {
    return false;
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) return false;
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return false;
      }
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Creates the Authenticated Server-Side Image Proxy router.
 * Features:
 * - SSRF protection with isPrivateIp and isSafePublicUrl
 * - W3C CORS headers to eliminate canvas origin tainting
 * - In-memory LRU caching with 24h TTL
 * - 6MB size cap and image/* MIME validation
 */
export function createImagesRouter(roomStore = globalRoomStore) {
  const router = Router();

  // CORS preflight handler
  router.options('/proxy', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, x-session-token');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.sendStatus(204);
  });

  router.get('/proxy', async (req, res) => {
    const { url: targetUrl, room: roomCode, token: queryToken } = req.query;
    const { sessionToken: headerToken } = extractAuthTokens(req);
    const effectiveToken = headerToken || queryToken;

    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ success: false, error: 'url parameter is required' });
    }

    // 1. Authorization Verification:
    // Approved CDNs are fast-tracked without room session;
    // Arbitrary external URLs require an active room code or valid participant session token.
    let isAuthorized = false;
    try {
      const parsed = new URL(targetUrl);
      if (TRUSTED_IMAGE_CDNS.some((cdn) => parsed.hostname === cdn || parsed.hostname.endsWith(`.${cdn}`))) {
        isAuthorized = true;
      }
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid URL format' });
    }

    if (!isAuthorized && roomCode && roomStore.getRoom(roomCode)) {
      isAuthorized = true;
    }

    if (!isAuthorized && effectiveToken) {
      const allRooms = roomStore.getAllRooms ? roomStore.getAllRooms() : [];
      if (allRooms.some((r) => r.participants?.some((p) => p.sessionToken === effectiveToken))) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: 'Proxy requires active room session or trusted image host',
      });
    }

    // 2. SSRF Guard
    if (!(await isSafePublicUrl(targetUrl))) {
      return res.status(400).json({ success: false, error: 'Invalid or restricted image URL' });
    }

    // 3. Cache Check
    const cached = proxyCache.get(targetUrl);
    if (cached && Date.now() < cached.expiresAt) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.setHeader('ETag', cached.etag);
      return res.status(200).send(cached.buffer);
    }

    // 4. Upstream Fetch with 6s Timeout & Manual Safe Redirect Follow
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      let currentUrl = targetUrl;
      let upstreamRes = null;
      let redirectHops = 0;
      const MAX_REDIRECT_HOPS = 3;

      while (true) {
        upstreamRes = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: 'manual',
        });

        // If redirect status, validate new location before following
        if ([301, 302, 303, 307, 308].includes(upstreamRes.status)) {
          redirectHops++;
          if (redirectHops > MAX_REDIRECT_HOPS) {
            clearTimeout(timeout);
            return res.status(400).json({
              success: false,
              error: 'Too many redirects',
            });
          }

          const locationHeader = upstreamRes.headers.get('location');
          if (!locationHeader) {
            clearTimeout(timeout);
            return res.status(502).json({
              success: false,
              error: 'Redirect missing location header',
            });
          }

          const nextUrl = new URL(locationHeader, currentUrl).href;
          if (!(await isSafePublicUrl(nextUrl))) {
            clearTimeout(timeout);
            return res.status(400).json({
              success: false,
              error: 'Redirected to restricted or unsafe URL',
            });
          }

          currentUrl = nextUrl;
          continue;
        }

        break;
      }

      clearTimeout(timeout);

      if (!upstreamRes.ok) {
        return res.status(upstreamRes.status).json({
          success: false,
          error: `Upstream image responded with status ${upstreamRes.status}`,
        });
      }

      const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
      if (!contentType.toLowerCase().startsWith('image/')) {
        return res.status(415).json({
          success: false,
          error: 'Upstream returned non-image content',
        });
      }

      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      if (buffer.length > 6 * 1024 * 1024) {
        return res.status(413).json({
          success: false,
          error: 'Image exceeds 6MB limit',
        });
      }

      const etag = `W/"mb-${buffer.length}-${Date.now().toString(36)}"`;

      // Evict oldest item if cache is full
      if (proxyCache.size >= MAX_CACHE_ITEMS) {
        const oldestKey = proxyCache.keys().next().value;
        if (oldestKey) proxyCache.delete(oldestKey);
      }

      proxyCache.set(targetUrl, {
        contentType,
        buffer,
        etag,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.setHeader('ETag', etag);
      return res.status(200).send(buffer);
    } catch (err) {
      clearTimeout(timeout);
      return res.status(502).json({
        success: false,
        error: 'Failed to proxy image: ' + (err.name === 'AbortError' ? 'Request timed out' : err.message),
      });
    }
  });

  return router;
}

export const imagesRouter = createImagesRouter();
