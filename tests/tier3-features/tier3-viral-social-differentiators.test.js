import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';
import { ReactionCoalescer } from '../../server/sync/ReactionCoalescer.js';
import { isPrivateIp, isSafePublicUrl, TRUSTED_IMAGE_CDNS } from '../../server/routes/images.js';
import {
  calculateSquadSuperlatives,
  drawVectorHeroFallback,
  getCuisineTheme,
  CUISINE_THEMES,
} from '../../src/utils/cardCanvasGenerator.js';
import { ReactionParticle, MAX_PARTICLES } from '../../src/components/Swiper/FloatingReactionCanvas.jsx';
import { REACTIONS } from '../../src/components/Swiper/FloatingReactionDock.jsx';

describe('Tier 3 Strategic Differentiators: Viral Social Features (Rec #12 & Rec #13)', () => {
  let roomStore;
  let broadcaster;
  let app;

  beforeEach(() => {
    roomStore = new RoomStore();
    broadcaster = new Broadcaster();
    app = createApp({ roomStore, broadcaster });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // RECIPIENT 1: High-Viral Post-Match Shareable Graphic Cards (Rec #12)
  // =========================================================================
  describe('Rec #12: Shareable Graphic Cards & CORS-Hardened Proxy Pipeline', () => {
    describe('SSRF Protection (isPrivateIp & isSafePublicUrl)', () => {
      it('correctly classifies private and forbidden IP addresses', () => {
        // IPv4 Loopback
        expect(isPrivateIp('127.0.0.1')).toBe(true);
        expect(isPrivateIp('127.8.9.10')).toBe(true);
        expect(isPrivateIp('0.0.0.0')).toBe(true);

        // RFC 1918
        expect(isPrivateIp('10.0.0.1')).toBe(true);
        expect(isPrivateIp('10.254.0.1')).toBe(true);
        expect(isPrivateIp('172.16.0.1')).toBe(true);
        expect(isPrivateIp('172.31.255.255')).toBe(true);
        expect(isPrivateIp('192.168.1.1')).toBe(true);
        expect(isPrivateIp('192.168.100.50')).toBe(true);

        // Link-local & Cloud Metadata (AWS/GCP/Azure 169.254.169.254)
        expect(isPrivateIp('169.254.169.254')).toBe(true);
        expect(isPrivateIp('169.254.1.1')).toBe(true);

        // Multicast & Reserved
        expect(isPrivateIp('224.0.0.1')).toBe(true);
        expect(isPrivateIp('240.0.0.1')).toBe(true);

        // IPv6
        expect(isPrivateIp('::1')).toBe(true);
        expect(isPrivateIp('::')).toBe(true);
        expect(isPrivateIp('fe80::1')).toBe(true);
        expect(isPrivateIp('fc00::1')).toBe(true);
        expect(isPrivateIp('fd00::1')).toBe(true);

        // IPv4 mapped IPv6
        expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
        expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
        expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);

        // Valid Public IPs
        expect(isPrivateIp('8.8.8.8')).toBe(false);
        expect(isPrivateIp('1.1.1.1')).toBe(false);
        expect(isPrivateIp('151.101.1.140')).toBe(false);
      });

      it('validates public URLs and blocks SSRF vectors', async () => {
        // Rejects non-HTTP protocols
        expect(await isSafePublicUrl('file:///etc/passwd')).toBe(false);
        expect(await isSafePublicUrl('gopher://127.0.0.1')).toBe(false);
        expect(await isSafePublicUrl('ftp://example.com')).toBe(false);
        expect(await isSafePublicUrl('javascript:alert(1)')).toBe(false);

        // Rejects localhost & private domains
        expect(await isSafePublicUrl('http://localhost:3000/test.png')).toBe(false);
        expect(await isSafePublicUrl('http://myhost.localhost/test.png')).toBe(false);
        expect(await isSafePublicUrl('http://backend.internal/photo.jpg')).toBe(false);
        expect(await isSafePublicUrl('http://service.local/image.png')).toBe(false);

        // Rejects raw private IP URLs
        expect(await isSafePublicUrl('http://127.0.0.1:8080/image.jpg')).toBe(false);
        expect(await isSafePublicUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
        expect(await isSafePublicUrl('http://10.0.0.1/admin.png')).toBe(false);

        // Fast-paths trusted CDNs
        expect(await isSafePublicUrl('https://images.unsplash.com/photo-1517248135467')).toBe(true);
        expect(await isSafePublicUrl('https://lh3.googleusercontent.com/places/123')).toBe(true);
      });
    });

    describe('Backend Proxy Route: /api/images/proxy', () => {
      it('returns 400 when url parameter is missing or invalid', async () => {
        const res1 = await request(app).get('/api/images/proxy');
        expect(res1.status).toBe(400);
        expect(res1.body.error).toContain('url parameter is required');

        const res2 = await request(app).get('/api/images/proxy?url=not_a_valid_url');
        expect(res2.status).toBe(400);
      });

      it('rejects unauthorized arbitrary URLs without active room or session token', async () => {
        const res = await request(app).get(
          '/api/images/proxy?url=https://untrusted-external-site.com/food.jpg'
        );
        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Proxy requires active room session');
      });

      it('answers OPTIONS preflight requests with CORS headers', async () => {
        const res = await request(app).options('/api/images/proxy');
        expect(res.status).toBe(204);
        expect(res.headers['access-control-allow-origin']).toBe('*');
        expect(res.headers['access-control-allow-methods']).toContain('GET');
      });

      it('allows authorized proxying for active room sessions and sets CORS headers', async () => {
        const hostRes = await request(app)
          .post('/api/rooms')
          .send({ hostName: 'HostProxy' });
        const roomCode = hostRes.body.room.code;

        // Mock global fetch for upstream image
        const mockImageBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic bytes
        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'image/png' }),
          arrayBuffer: async () => mockImageBytes.buffer,
        });

        const res = await request(app).get(
          `/api/images/proxy?url=${encodeURIComponent('https://images.unsplash.com/photo-test')}&room=${roomCode}`
        );

        global.fetch = originalFetch;

        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('*');
        expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
        expect(res.headers['content-type']).toContain('image/png');
        expect(res.headers['cache-control']).toContain('public, max-age=86400');
      });

      it('rejects non-image upstream content with 415 Unsupported Media Type', async () => {
        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          arrayBuffer: async () => Buffer.from('{"error":"not an image"}'),
        });

        const res = await request(app).get(
          `/api/images/proxy?url=${encodeURIComponent('https://images.unsplash.com/not-image')}`
        );

        global.fetch = originalFetch;

        expect(res.status).toBe(415);
        expect(res.body.error).toContain('Upstream returned non-image content');
      });
    });

    describe('Squad Superlatives & Vector Graphic Fallback Engine', () => {
      it('calculates squad superlatives ("Speedy Swiper", "Picky Eater", "The Tastemaker")', () => {
        const mockRoom = {
          code: 'SQUAD1',
          participants: [
            { id: 'p1', name: 'Sarah', avatar: '🦊', isHost: true, swipedCount: 15 },
            { id: 'p2', name: 'Alex', avatar: '🐼', isHost: false, swipedCount: 15 },
            { id: 'p3', name: 'Chris', avatar: '🐶', isHost: false, swipedCount: 15 },
          ],
        };

        const superlatives = calculateSquadSuperlatives({
          room: mockRoom,
          venue: { id: 'v1', name: 'Loro Asian Smoke' },
        });

        expect(superlatives.length).toBe(3);
        const titles = superlatives.map((s) => s.badgeTitle);
        expect(titles).toContain('The Tastemaker');
        expect(titles).toContain('Speedy Swiper');
        expect(titles).toContain('Picky Eater');
      });

      it('resolves distinct cuisine themes and vector motif fallbacks', () => {
        expect(getCuisineTheme('Sushi & Sashimi', 'Dining').emoji).toBe('🍣');
        expect(getCuisineTheme('Neapolitan Pizza', 'Dining').emoji).toBe('🍕');
        expect(getCuisineTheme('Tacos & Tequila', 'Dining').emoji).toBe('🌮');
        expect(getCuisineTheme('Craft Cocktails', 'Bar').emoji).toBe('🍸');
        expect(getCuisineTheme('Dance Club', 'Nightlife').emoji).toBe('🥂');
        expect(getCuisineTheme('Specialty Coffee', 'Beverages').emoji).toBe('☕');
        expect(getCuisineTheme('French Bakery', 'Cafes').emoji).toBe('🥐');
        expect(getCuisineTheme('Unknown Fusion', 'Dining').emoji).toBe('🍽️');
      });

      it('drawVectorHeroFallback executes without throwing on 2D context', () => {
        const mockCtx = {
          save: vi.fn(),
          restore: vi.fn(),
          beginPath: vi.fn(),
          clip: vi.fn(),
          fillRect: vi.fn(),
          stroke: vi.fn(),
          fill: vi.fn(),
          arc: vi.fn(),
          fillText: vi.fn(),
          createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
          createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
          roundRect: vi.fn(),
        };

        expect(() => {
          drawVectorHeroFallback(mockCtx, {
            x: 50,
            y: 100,
            width: 900,
            height: 600,
            venue: { name: 'Sushi Bar', cuisine: 'Japanese', category: 'Dining' },
          });
        }).not.toThrow();

        expect(mockCtx.save).toHaveBeenCalled();
        expect(mockCtx.restore).toHaveBeenCalled();
        expect(mockCtx.fillRect).toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // RECIPIENT 2: Real-Time Floating Swipe Reactions & Momentum (Rec #13)
  // =========================================================================
  describe('Rec #13: Real-Time Floating Swipe Reactions & 200ms ReactionCoalescer', () => {
    describe('ReactionCoalescer Mechanics', () => {
      it('accumulates multiple reactions in 200ms tick window and flushes a single coalesced batch', async () => {
        const mockBroadcaster = {
          broadcast: vi.fn(),
        };

        const coalescer = new ReactionCoalescer(mockBroadcaster, { tickWindowMs: 50 });
        const roomCode = 'TICK01';

        // Ingest 5 rapid reactions from different participants
        coalescer.ingest(roomCode, { participantId: 'p1', participantName: 'Sarah', avatar: '🦊', emoji: '🔥' });
        coalescer.ingest(roomCode, { participantId: 'p1', participantName: 'Sarah', avatar: '🦊', emoji: '🔥' });
        coalescer.ingest(roomCode, { participantId: 'p2', participantName: 'Alex', avatar: '🐼', emoji: '🤤' });
        coalescer.ingest(roomCode, { participantId: 'p3', participantName: 'Chris', avatar: '🐶', emoji: '🥂' });
        coalescer.ingest(roomCode, { participantId: 'p2', participantName: 'Alex', avatar: '🐼', emoji: '🔥' });

        // Immediately before tick, broadcaster has NOT been called yet
        expect(mockBroadcaster.broadcast).not.toHaveBeenCalled();

        // Wait for 50ms tick to flush
        await new Promise((r) => setTimeout(r, 70));

        // Exactly 1 batch event was broadcast instead of 5 individual writes (80% reduction)
        expect(mockBroadcaster.broadcast).toHaveBeenCalledTimes(1);

        const [broadcastCode, eventName, payload, options] = mockBroadcaster.broadcast.mock.calls[0];
        expect(broadcastCode).toBe(roomCode);
        expect(eventName).toBe('reaction:batch');
        expect(options.ephemeral).toBe(true);

        expect(payload.total).toBe(5);
        expect(payload.counts['🔥']).toBe(3);
        expect(payload.counts['🤤']).toBe(1);
        expect(payload.counts['🥂']).toBe(1);
        expect(payload.contributors.length).toBeGreaterThanOrEqual(3);

        coalescer.cleanup(roomCode);
      });

      it('enforces Tier 2 participant rate limiter (max 4 reactions/sec)', () => {
        const coalescer = new ReactionCoalescer(null, { participantRateLimit: 4 });
        const roomCode = 'RATE01';

        // First 4 calls succeed
        for (let i = 0; i < 4; i++) {
          const res = coalescer.ingest(roomCode, { participantId: 'p-spam', emoji: '🔥' });
          expect(res.accepted).toBe(true);
        }

        // 5th call within 1s violates rate limit
        const excessRes = coalescer.ingest(roomCode, { participantId: 'p-spam', emoji: '🔥' });
        expect(excessRes.accepted).toBe(false);
        expect(excessRes.reason).toBe('participant_rate_limited');

        coalescer.cleanup(roomCode);
      });

      it('enforces Tier 3 room aggregate token bucket (max 16 reactions/sec ceiling)', () => {
        const coalescer = new ReactionCoalescer(null, {
          roomRateLimit: 16,
          participantRateLimit: 100, // disable participant limit for this test
        });
        const roomCode = 'ROOMCEILING';

        // Spend 16 tokens across multiple participants
        for (let i = 0; i < 16; i++) {
          const res = coalescer.ingest(roomCode, { participantId: `user-${i}`, emoji: '🔥' });
          expect(res.accepted).toBe(true);
        }

        // 17th reaction exceeds room capacity ceiling and drops cleanly
        const droppedRes = coalescer.ingest(roomCode, { participantId: 'user-17', emoji: '🔥' });
        expect(droppedRes.accepted).toBe(false);
        expect(droppedRes.reason).toBe('room_rate_limited');
        expect(droppedRes.dropped).toBe(true);

        coalescer.cleanup(roomCode);
      });
    });

    describe('Broadcaster Backpressure Control', () => {
      it('skips non-critical ephemeral frames when client socket is congested', () => {
        const bc = new Broadcaster();
        const roomCode = 'CONGEST1';

        const mockClientWrites = [];
        const mockRes = {
          writeHead: vi.fn(),
          write: vi.fn((payload) => {
            mockClientWrites.push(payload);
            return false; // Returns false to simulate socket congestion / buffer saturation!
          }),
          once: vi.fn(),
        };

        const client = bc.addClient(roomCode, 'p-slow', { on: vi.fn() }, mockRes);

        // 1. Broadcast critical room state event (not ephemeral)
        bc.broadcast(roomCode, 'room:init', { roomCode }, { ephemeral: false });
        expect(client.isCongested).toBe(true);

        // 2. Broadcast ephemeral reaction frame while socket is congested
        const writesBefore = mockClientWrites.length;
        bc.broadcast(roomCode, 'reaction:batch', { count: 5 }, { ephemeral: true });

        // Ephemeral frame was skipped cleanly to prevent buffer bloat
        expect(mockClientWrites.length).toBe(writesBefore);

        bc.closeRoom(roomCode);
      });
    });

    describe('HTTP Route: POST /api/rooms/:code/reactions', () => {
      it('ingests reactions through ReactionCoalescer and returns success', async () => {
        const hostRes = await request(app)
          .post('/api/rooms')
          .send({ hostName: 'ReactionUser' });
        const roomCode = hostRes.body.room.code;
        const hostId = hostRes.body.participant.id;
        const hostToken = hostRes.body.sessionToken;

        const reactRes = await request(app)
          .post(`/api/rooms/${roomCode}/reactions`)
          .set('x-session-token', hostToken)
          .send({
            emoji: '🤤',
            participantId: hostId,
            senderName: 'ReactionUser',
            venueId: 'venue-101',
          });

        expect(reactRes.status).toBe(200);
        expect(reactRes.body.success).toBe(true);
        expect(reactRes.body.emoji).toBe('🤤');
        expect(reactRes.body.coalesced).toBe(true);
      });
    });

    describe('Flyweight Particle Pool & Dock Configurations', () => {
      it('validates 50-slot pre-allocated ReactionParticle pool', () => {
        expect(MAX_PARTICLES).toBe(50);
        const particle = new ReactionParticle(0);

        expect(particle.active).toBe(false);
        particle.spawn('🔥', '🦊', 'Sarah', 200, 500, performance.now());
        expect(particle.active).toBe(true);
        expect(particle.emoji).toBe('🔥');
        expect(particle.senderName).toBe('Sarah');

        // Test update loop
        const active = particle.update(performance.now() + 500, 0.016, 800);
        expect(active).toBe(true);
        expect(particle.opacity).toBeGreaterThan(0);
      });

      it('validates 6 curated quick reaction palette options', () => {
        expect(REACTIONS.length).toBe(6);
        const emojis = REACTIONS.map((r) => r.emoji);
        expect(emojis).toEqual(['🔥', '🤤', '🥂', '🙅', '😂', '👀']);
      });
    });
  });
});
