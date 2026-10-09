import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/index.js';
import { RoomStore } from '../server/models/RoomStore.js';
import { Broadcaster } from '../server/sync/Broadcaster.js';
import { isPrivateIp, isSafePublicUrl } from '../server/routes/images.js';
import {
  generateShareCardBlob,
  drawVectorHeroFallback,
  calculateSquadSuperlatives,
  getCuisineTheme,
} from '../src/utils/cardCanvasGenerator.js';

describe('Pre-Release QA & Security Audit Test Suite', () => {
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
  // 1. SSRF Defenses on /api/images/proxy
  // =========================================================================
  describe('Security Audit: SSRF Defenses on /api/images/proxy', () => {
    it('strictly blocks IPv4 loopback (127.0.0.1, 127.x.x.x, 0.0.0.0)', async () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('127.0.0.2')).toBe(true);
      expect(isPrivateIp('127.128.0.1')).toBe(true);
      expect(isPrivateIp('0.0.0.0')).toBe(true);

      expect(await isSafePublicUrl('http://127.0.0.1:8080/image.png')).toBe(false);
      expect(await isSafePublicUrl('http://127.0.0.2:3000/avatar.jpg')).toBe(false);
      expect(await isSafePublicUrl('http://0.0.0.0:8000/test.png')).toBe(false);
    });

    it('strictly blocks Cloud Metadata services (169.254.169.254, 169.254.x.x)', async () => {
      expect(isPrivateIp('169.254.169.254')).toBe(true);
      expect(isPrivateIp('169.254.1.1')).toBe(true);
      expect(isPrivateIp('169.254.169.2')).toBe(true);

      expect(await isSafePublicUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
      expect(await isSafePublicUrl('http://169.254.169.254/computeMetadata/v1/')).toBe(false);
      expect(await isSafePublicUrl('https://169.254.1.1/secret.png')).toBe(false);
    });

    it('strictly blocks IPv6 loopback, link-local, and bracketed notation', async () => {
      expect(isPrivateIp('::1')).toBe(true);
      expect(isPrivateIp('[::1]')).toBe(true);
      expect(isPrivateIp('fe80::1')).toBe(true);
      expect(isPrivateIp('[fe80::1]')).toBe(true);
      expect(isPrivateIp('fc00::1')).toBe(true);
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);

      expect(await isSafePublicUrl('http://[::1]:8080/image.png')).toBe(false);
      expect(await isSafePublicUrl('http://[fe80::1]/test.jpg')).toBe(false);
    });

    it('strictly blocks RFC 1918 internal subnets (10.x, 172.16-31.x, 192.168.x)', async () => {
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('10.255.255.255')).toBe(true);
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.24.1.1')).toBe(true);
      expect(isPrivateIp('172.31.255.255')).toBe(true);
      expect(isPrivateIp('192.168.0.1')).toBe(true);
      expect(isPrivateIp('192.168.1.100')).toBe(true);

      expect(await isSafePublicUrl('http://10.0.0.1/internal.jpg')).toBe(false);
      expect(await isSafePublicUrl('http://172.16.0.1/admin.png')).toBe(false);
      expect(await isSafePublicUrl('http://192.168.1.1/router.png')).toBe(false);
    });

    it('blocks internal domain patterns and dangerous URI schemes', async () => {
      expect(await isSafePublicUrl('http://localhost:3000/photo.jpg')).toBe(false);
      expect(await isSafePublicUrl('http://app.localhost/photo.jpg')).toBe(false);
      expect(await isSafePublicUrl('http://backend.internal/photo.jpg')).toBe(false);
      expect(await isSafePublicUrl('http://service.local/photo.jpg')).toBe(false);
      expect(await isSafePublicUrl('file:///etc/passwd')).toBe(false);
      expect(await isSafePublicUrl('gopher://127.0.0.1:70/')).toBe(false);
      expect(await isSafePublicUrl('ftp://example.com/photo.jpg')).toBe(false);
      expect(await isSafePublicUrl('javascript:alert(1)')).toBe(false);
    });

    it('blocks HTTP endpoint proxy attempts targeting loopback and metadata addresses', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'AuditHost' });
      const roomCode = hostRes.body.room.code;

      // Direct loopback attack
      const loopbackRes = await request(app).get(
        `/api/images/proxy?url=${encodeURIComponent('http://127.0.0.1:8080/secret.png')}&room=${roomCode}`
      );
      expect(loopbackRes.status).toBe(400);
      expect(loopbackRes.body.error).toContain('Invalid or restricted image URL');

      // Direct cloud metadata attack
      const metadataRes = await request(app).get(
        `/api/images/proxy?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data')}&room=${roomCode}`
      );
      expect(metadataRes.status).toBe(400);
      expect(metadataRes.body.error).toContain('Invalid or restricted image URL');

      // Bracketed IPv6 attack
      const ipv6Res = await request(app).get(
        `/api/images/proxy?url=${encodeURIComponent('http://[::1]:9000/image.png')}&room=${roomCode}`
      );
      expect(ipv6Res.status).toBe(400);
      expect(ipv6Res.body.error).toContain('Invalid or restricted image URL');
    });

    it('blocks SSRF open-redirect attacks that attempt to redirect to 169.254.169.254 or 127.0.0.1', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'RedirectHost' });
      const roomCode = hostRes.body.room.code;

      // Mock an external image URL that attempts to redirect to cloud metadata
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        status: 302,
        ok: false,
        headers: new Headers({
          location: 'http://169.254.169.254/latest/meta-data/credentials',
        }),
      });

      const res = await request(app).get(
        `/api/images/proxy?url=${encodeURIComponent('https://images.unsplash.com/redirect-exploit')}&room=${roomCode}`
      );

      global.fetch = originalFetch;

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Redirected to restricted or unsafe URL');
    });
  });

  // =========================================================================
  // 2. Rate Limiting on Reaction Endpoints
  // =========================================================================
  describe('Security Audit: Rate Limiting on Reaction Endpoints', () => {
    it('enforces Tier 2 per-participant rate limit (4 req/sec) and returns 429 when exceeded', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'SpamUser' });
      const roomCode = hostRes.body.room.code;
      const hostId = hostRes.body.participant.id;
      const hostToken = hostRes.body.sessionToken;

      const responses = [];
      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post(`/api/rooms/${roomCode}/reactions`)
          .set('x-session-token', hostToken)
          .send({
            emoji: '🔥',
            participantId: hostId,
            senderName: 'SpamUser',
          });
        responses.push(res);
      }

      // First 4 requests should succeed (tokens available)
      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBeGreaterThanOrEqual(4);

      // Subsequent burst requests should be rate-limited with 429
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].body.error).toBe('Rate limit exceeded');
    });

    it('enforces Tier 3 room-level aggregate ceiling (16 req/sec) and cleanly drops excess reactions (202)', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'RoomHost' });
      const roomCode = hostRes.body.room.code;

      // Burst 25 distinct participants concurrently via Promise.all
      const requests = Array.from({ length: 25 }, (_, i) =>
        request(app)
          .post(`/api/rooms/${roomCode}/reactions`)
          .send({
            emoji: '🤤',
            participantId: `guest-${i}`,
            senderName: `Guest ${i}`,
          })
      );
      const responses = await Promise.all(requests);

      const accepted200 = responses.filter((r) => r.status === 200).length;
      const dropped202 = responses.filter((r) => r.status === 202).length;

      expect(accepted200).toBeLessThanOrEqual(16);
      expect(dropped202).toBeGreaterThanOrEqual(9);
      const droppedResp = responses.find((r) => r.status === 202);
      expect(droppedResp?.body?.dropped).toBe(true);
    });

    it('ensures lobby state reactions cannot bypass rate limiting', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'LobbyHost' });
      const roomCode = hostRes.body.room.code;
      const hostId = hostRes.body.participant.id;
      const hostToken = hostRes.body.sessionToken;

      const room = roomStore.getRoom(roomCode);
      expect(room.status).toBe('lobby');

      // Send 6 reactions in lobby
      const responses = [];
      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post(`/api/rooms/${roomCode}/reactions`)
          .set('x-session-token', hostToken)
          .send({
            emoji: '🎉',
            participantId: hostId,
            senderName: 'LobbyHost',
          });
        responses.push(res);
      }

      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 3. Swipe Rewind Action & Match Reconciliations
  // =========================================================================
  describe('Cross-Feature Edge Cases: Swipe Rewind & Match Reconciliation', () => {
    it('cleanly reconciles server vote counts, distinct swiped count, and leaderboard on rewind', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'RewindUser' });
      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .set('x-host-key', hostRes.body.hostKey);

      const deck = startRes.body.deck;
      const venue1 = deck[0];

      // Cast vote
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: venue1.id, vote: 'like' });

      // Rewind vote
      const undoRes = await request(app)
        .post(`/api/rooms/${code}/undo`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: venue1.id });

      expect(undoRes.status).toBe(200);
      expect(undoRes.body.success).toBe(true);
      expect(undoRes.body.swipedCount).toBe(0);

      // Verify room state
      const room = roomStore.getRoom(code);
      expect(room.votes[venue1.id]?.[hostId]).toBeUndefined();
      expect(room.participants[hostId].swipedCount).toBe(0);

      // Leaderboard calculation should reflect zero votes
      const results = roomStore.getRoomResults(code);
      const venueResult = results.leaderboard.find((v) => v.venueId === venue1.id);
      expect(venueResult.likeCount).toBe(0);
      expect(venueResult.score).toBe(0);
    });

    it('rewinding an accidental "pass" allows re-swiping "like" to achieve unanimous consensus', async () => {
      // 2-person room
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'Alice' });
      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      const guestRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'Bob' });
      const guestToken = guestRes.body.sessionToken;
      const guestId = guestRes.body.participant.id;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .set('x-host-key', hostRes.body.hostKey);

      const venue = startRes.body.deck[0];

      // Alice likes
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: venue.id, vote: 'like' });

      // Bob accidentally passes
      const bobPassRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guestToken)
        .send({ participantId: guestId, venueId: venue.id, vote: 'pass' });

      expect(bobPassRes.body.isMatch).toBeFalsy();
      expect(roomStore.getRoom(code).status).toBe('voting');

      // Bob hits Rewind
      const undoRes = await request(app)
        .post(`/api/rooms/${code}/undo`)
        .set('x-session-token', guestToken)
        .send({ participantId: guestId, venueId: venue.id });

      expect(undoRes.status).toBe(200);

      // Bob re-swipes Like
      const bobLikeRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guestToken)
        .send({ participantId: guestId, venueId: venue.id, vote: 'like' });

      // Unanimous match achieved!
      expect(bobLikeRes.body.isMatch).toBe(true);
      expect(bobLikeRes.body.match.isUnanimous).toBe(true);
      expect(roomStore.getRoom(code).status).toBe('matched');
      expect(roomStore.getRoom(code).matchedVenueId).toBe(venue.id);
    });

    it('rewinding a match-triggering vote cleanly reverts room status to voting and enables re-matching', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'HostRevert' });
      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      const guestRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'GuestRevert' });
      const guestToken = guestRes.body.sessionToken;
      const guestId = guestRes.body.participant.id;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .set('x-host-key', hostRes.body.hostKey);

      const venue = startRes.body.deck[0];

      // Alice likes
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: venue.id, vote: 'like' });

      // Bob likes -> Match triggers
      const matchRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guestToken)
        .send({ participantId: guestId, venueId: venue.id, vote: 'like' });

      expect(matchRes.body.isMatch).toBe(true);
      expect(roomStore.getRoom(code).status).toBe('matched');

      // Bob rewinds his vote
      const undoRes = await request(app)
        .post(`/api/rooms/${code}/undo`)
        .set('x-session-token', guestToken)
        .send({ participantId: guestId, venueId: venue.id });

      expect(undoRes.status).toBe(200);
      expect(undoRes.body.matchReverted).toBe(true);
      expect(undoRes.body.roomStatus).toBe('voting');

      // Verify server state was cleanly reverted
      const room = roomStore.getRoom(code);
      expect(room.status).toBe('voting');
      expect(room.matchedVenueId).toBeNull();
      expect(room.matchedAt).toBeNull();

      // Bob likes again -> Match triggers cleanly again!
      const reMatchRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guestToken)
        .send({ participantId: guestId, venueId: venue.id, vote: 'like' });

      expect(reMatchRes.body.isMatch).toBe(true);
      expect(roomStore.getRoom(code).status).toBe('matched');
    });
  });

  // =========================================================================
  // 4. Canvas Story Card Generator Fail-safe & Zero-Taint Verification
  // =========================================================================
  describe('Cross-Feature Edge Cases: Canvas Story Card Zero-Taint & Fail-safe', () => {
    it('drawVectorHeroFallback renders procedural art without crashing or touching DOM', () => {
      // Mock Canvas 2D Context
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        clip: vi.fn(),
        createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
        createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
        fillRect: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        fillText: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
      };

      expect(() => {
        drawVectorHeroFallback(mockCtx, {
          x: 0,
          y: 0,
          width: 500,
          height: 500,
          venue: { cuisine: 'italian', name: 'Trattoria' },
        });
      }).not.toThrow();

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.fillText).toHaveBeenCalled();
    });

    it('accurately resolves cuisine themes with safe defaults for unknown types', () => {
      expect(getCuisineTheme('italian', 'pizza').emoji).toBe('🍕');
      expect(getCuisineTheme('japanese', 'sushi').emoji).toBe('🍣');
      expect(getCuisineTheme('mexican', 'tacos').emoji).toBe('🌮');
      expect(getCuisineTheme('burger', 'grill').emoji).toBe('🍔');
      expect(getCuisineTheme('unknown_exotic', 'mysterious').emoji).toBe('🍽️');
    });

    it('calculateSquadSuperlatives gracefully handles empty or null rooms without throwing', () => {
      const superlatives1 = calculateSquadSuperlatives({ room: null });
      expect(superlatives1.length).toBe(3);
      expect(superlatives1[0].badgeTitle).toBe('The Tastemaker');

      const mockRoom = {
        participants: [
          { id: '1', name: 'Host', isHost: true },
          { id: '2', name: 'Guest 1', isHost: false },
        ],
      };
      const superlatives2 = calculateSquadSuperlatives({ room: mockRoom });
      expect(superlatives2.length).toBe(2);
      expect(superlatives2[0].participantName).toBe('Host');
      expect(superlatives2[0].badgeTitle).toBe('The Tastemaker');
    });
  });
});
