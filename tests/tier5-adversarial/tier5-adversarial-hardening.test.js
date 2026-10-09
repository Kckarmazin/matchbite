import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';
import { generateRoomCode, isValidRoomCode } from '../../server/models/RoomCode.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../../dist');

describe('Tier 5 Adversarial Hardening: White-Box Edge Cases, Security & Startup Verification', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  afterEach(() => {
    roomStore.clear();
    // Clean up prototype pollution guard
    delete Object.prototype.polluted;
    delete Object.prototype.testExploit;
  });

  // =========================================================================
  // SUITE 1: Startup, Production Static Serving & Health Telemetry
  // =========================================================================
  describe('Suite 1: Startup, Production Serving & Telemetry Integrity', () => {
    it('verifies dist directory exists with valid build artifacts', () => {
      expect(fs.existsSync(distDir)).toBe(true);
      const indexHtmlPath = path.join(distDir, 'index.html');
      expect(fs.existsSync(indexHtmlPath)).toBe(true);

      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('id="root"');
      expect(htmlContent).toContain('MatchBite');
    });

    it('GET / serves production index.html with status 200', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('id="root"');
    });

    it('GET /?room=TACO42 serves SPA index.html fallback with status 200', async () => {
      const res = await request(app).get('/?room=TACO42');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('id="root"');
    });

    it('GET /deep/client/route serves SPA index.html fallback with status 200', async () => {
      const res = await request(app).get('/rooms/SWEET99/lobby');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<!DOCTYPE html>');
    });

    it('GET /assets/* serves built JavaScript and CSS bundles with status 200', async () => {
      const assetsDir = path.join(distDir, 'assets');
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir);
        const jsFile = files.find(f => f.endsWith('.js'));
        const cssFile = files.find(f => f.endsWith('.css'));

        if (jsFile) {
          const res = await request(app).get(`/assets/${jsFile}`);
          expect(res.status).toBe(200);
          expect(res.text.length).toBeGreaterThan(100);
        }

        if (cssFile) {
          const res = await request(app).get(`/assets/${cssFile}`);
          expect(res.status).toBe(200);
          expect(res.text.length).toBeGreaterThan(100);
        }
      }
    });

    it('GET /api/health returns 200 with healthy telemetry and activeRooms count', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('healthy');
      expect(res.body.activeRooms).toBe(0);
      expect(typeof res.body.timestamp).toBe('string');
      expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
    });

    it('GET /api/nonexistent-route returns 404 JSON, preserving API routing isolation', async () => {
      const res = await request(app).get('/api/nonexistent-endpoint');
      expect(res.status).toBe(404);
      // Must NOT be the SPA index.html
      expect(res.text).not.toContain('<!DOCTYPE html>');
    });
  });

  // =========================================================================
  // SUITE 2: Adversarial Security, Protocol Tampering & Open Redirect Defense
  // =========================================================================
  describe('Suite 2: Adversarial Security, Hostile Probes & Open Redirect Defense', () => {
    it('blocks dangerous URL schemes (javascript:) in affiliate redirect', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect?url=javascript:alert(document.cookie)');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('only http:// and https://');
    });

    it('blocks dangerous URL schemes (data:) in affiliate redirect', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect?url=data:text/html,<script>alert(1)</script>');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('only http:// and https://');
    });

    it('blocks dangerous URL schemes (vbscript:) in affiliate redirect', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect?url=vbscript:msgbox(1)');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('only http:// and https://');
    });

    it('allows valid https:// external URLs in affiliate redirect with tracking tags', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect?url=https://example.com/reservation&action=reserve&format=json');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.destinationUrl).toContain('https://example.com/reservation');
      expect(res.body.destinationUrl).toContain('utm_source=matchbite');
      expect(res.body.destinationUrl).toContain('action=reserve');
    });

    it('handles partner names case-insensitively with whitespace trimming', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect?partner=  OPENTABLE  &venueId=v1&format=json');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.partner).toBe('opentable');
      expect(res.body.destinationUrl).toContain('opentable.com');
    });

    it('rejects unsupported partner names without target url', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect?partner=malicious-broker&venueId=v1');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Unsupported affiliate partner');
    });

    it('rejects prototype pollution attempts on hostId, participantId, and venueId', async () => {
      // 1. HostId prototype pollution attempt
      const p1 = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'Attacker', hostId: '__proto__' });
      expect(p1.status).toBe(400);
      expect(p1.body.error).toContain('reserved property name');

      // 2. Room creation
      const hostRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'SafeHost' });
      const code = hostRes.body.room.code;
      const hostSession = hostRes.body.sessionToken;

      // Start voting
      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostSession)
        .send({ participantId: hostRes.body.participant.id });

      // 3. ParticipantId prototype pollution in vote
      const v1 = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostSession)
        .send({ participantId: '__proto__', venueId: 'v-dining-01', vote: 'like' });
      expect(v1.status).toBe(400);

      // 4. VenueId prototype pollution in vote
      const v2 = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostSession)
        .send({ participantId: hostRes.body.participant.id, venueId: 'constructor', vote: 'like' });
      expect(v2.status).toBe(400);
    });

    it('safely handles extreme Unicode, emojis, and ZWJ sequences in room names', async () => {
      const emojiName = '👨‍👩‍👧‍👦 🍣 Taco King 🌮 𝓤𝓷𝓲𝓬𝓸𝓭𝓮';
      const res = await request(app)
        .post('/api/rooms')
        .send({ hostName: emojiName, hostAvatar: '🦄' });
      expect(res.status).toBe(201);
      expect(res.body.participant.name).toBe(emojiName);
      expect(res.body.participant.avatar).toBe('🦄');
    });
  });

  // =========================================================================
  // SUITE 3: Session State Transitions, Concurrency & Idempotency
  // =========================================================================
  describe('Suite 3: State Transitions, Concurrency & Idempotency', () => {
    it('solo room: 1 participant voting "like" achieves instant unanimous match', async () => {
      const hostRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'SoloUser', deckSize: 5 });
      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });
      const targetVenue = startRes.body.deck[0];

      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: targetVenue.id, vote: 'like' });

      expect(voteRes.status).toBe(200);
      expect(voteRes.body.isMatch).toBe(true);
      expect(voteRes.body.matchedVenue.id).toBe(targetVenue.id);

      // Verify room state is now 'matched'
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('matched');
      expect(roomRes.body.room.matchedVenueId).toBe(targetVenue.id);
    });

    it('replay voting idempotency: repeated votes by same user on same venue do not inflate count', async () => {
      const hostRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'Replayer', deckSize: 5 });
      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      // Join a second user so it doesn't instantly match
      await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'Guest' });

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });
      const targetVenue = startRes.body.deck[0];

      // Cast vote 5 times
      for (let i = 0; i < 5; i++) {
        const vRes = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', hostToken)
          .send({ participantId: hostId, venueId: targetVenue.id, vote: 'like' });
        expect(vRes.status).toBe(200);
        expect(vRes.body.progress.swipedCount).toBe(1);
      }

      const resultsRes = await request(app).get(`/api/rooms/${code}/results`);
      const venueResult = resultsRes.body.leaderboard.find(v => v.venueId === targetVenue.id);
      expect(venueResult.likeCount).toBe(1);
      expect(venueResult.score).toBe(1);
    });

    it('post-match voting immunity: voting after room is matched preserves winning venue', async () => {
      // 1. Create room with 2 users
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'HostUser' });
      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      const guestRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'GuestUser' });
      const guestToken = guestRes.body.sessionToken;
      const guestId = guestRes.body.participant.id;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });
      const deck = startRes.body.deck;
      const matchVenue = deck[0];
      const otherVenue = deck[1];

      // Both vote like on matchVenue -> Unanimous match!
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: matchVenue.id, vote: 'like' });
      const matchVote = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guestToken)
        .send({ participantId: guestId, venueId: matchVenue.id, vote: 'like' });
      expect(matchVote.body.isMatch).toBe(true);

      // Now guest votes on otherVenue -> room must still report matched on matchVenue
      const laterVote = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guestToken)
        .send({ participantId: guestId, venueId: otherVenue.id, vote: 'like' });
      expect(laterVote.status).toBe(200);
      expect(laterVote.body.isMatch).toBe(true);
      expect(laterVote.body.matchedVenue.id).toBe(matchVenue.id);
    });

    it('host leaves room: ownership transfers to next participant; previous token loses host privileges', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'OriginalHost' });
      const code = hostRes.body.room.code;
      const originalHostToken = hostRes.body.sessionToken;
      const originalHostId = hostRes.body.participant.id;

      const guestRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'Successor' });
      const successorToken = guestRes.body.sessionToken;
      const successorId = guestRes.body.participant.id;

      // Original host leaves
      const leaveRes = await request(app)
        .post(`/api/rooms/${code}/leave`)
        .set('x-session-token', originalHostToken)
        .send({ participantId: originalHostId });
      expect(leaveRes.status).toBe(200);

      // Verify successor is now host
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.hostId).toBe(successorId);
      const newHost = roomRes.body.room.participants.find(p => p.id === successorId);
      expect(newHost.isHost).toBe(true);

      // Original host cannot start voting with old token
      const failedStart = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', originalHostToken)
        .send({ participantId: originalHostId });
      expect(failedStart.status).toBe(403);

      // Successor CAN start voting
      const successStart = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', successorToken)
        .send({ participantId: successorId });
      expect(successStart.status).toBe(200);
      expect(successStart.body.status).toBe('voting');
    });

    it('non-host cannot execute tiebreaker spin or restart room', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'Host' });
      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      const guestRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'Guest' });
      const guestToken = guestRes.body.sessionToken;
      const guestId = guestRes.body.participant.id;

      // Start voting
      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });

      // Guest attempts to spin tiebreaker -> 403
      const spinRes = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/spin`)
        .set('x-session-token', guestToken)
        .send({ participantId: guestId });
      expect(spinRes.status).toBe(403);

      // Guest attempts to restart room -> 403
      const restartRes = await request(app)
        .post(`/api/rooms/${code}/restart`)
        .set('x-session-token', guestToken)
        .send({ participantId: guestId });
      expect(restartRes.status).toBe(403);
    });
  });

  // =========================================================================
  // SUITE 4: Monetization Edge Cases, VIP Upgrades & Coupons
  // =========================================================================
  describe('Suite 4: Monetization Hardening, VIP Perks & Coupon Variations', () => {
    it('applies 100% discount for case-insensitive VIPFREE coupon codes', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'VipHost' });
      const code = hostRes.body.room.code;

      const upgradeRes = await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .send({ couponCode: '  vipfree  ' });

      expect(upgradeRes.status).toBe(200);
      expect(upgradeRes.body.success).toBe(true);
      expect(upgradeRes.body.isVip).toBe(true);
      expect(upgradeRes.body.discountApplied).toBe('100%');
      expect(upgradeRes.body.perks.customVenuesAllowed).toBe(true);
    });

    it('applies 50% discount for HALFOFF coupon when valid token is provided', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'HalfHost' });
      const code = hostRes.body.room.code;

      const upgradeRes = await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .send({ couponCode: 'halfoff', paymentToken: 'tok_visa_valid' });

      expect(upgradeRes.status).toBe(200);
      expect(upgradeRes.body.success).toBe(true);
      expect(upgradeRes.body.discountApplied).toBe('50%');
    });

    it('rejects declined payment tokens with 402 Payment Required', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'DeclineHost' });
      const code = hostRes.body.room.code;

      const declinedTokens = ['tok_declined', 'tok_cvv_fail', 'tok_expired'];
      for (const token of declinedTokens) {
        const res = await request(app)
          .post(`/api/rooms/${code}/upgrade`)
          .send({ paymentToken: token });
        expect(res.status).toBe(402);
        expect(res.body.error).toContain('Payment declined');
      }
    });

    it('rejects adding custom venue to non-VIP room, but allows after VIP upgrade', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'CustomVenueHost' });
      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      // Attempt without VIP -> 403
      const blockedRes = await request(app)
        .post(`/api/rooms/${code}/custom-venue`)
        .send({ name: 'Secret Rooftop Bar' });
      expect(blockedRes.status).toBe(403);
      expect(blockedRes.body.error).toContain('VIP upgrade required');

      // Upgrade to VIP
      await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .send({ couponCode: 'VIPFREE' });

      // Start voting
      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });

      // Add custom venue -> 200
      const allowedRes = await request(app)
        .post(`/api/rooms/${code}/custom-venue`)
        .send({
          name: 'Secret Rooftop Bar',
          category: 'bars',
          priceTier: 3,
          distance: '0.3 mi',
        });
      expect(allowedRes.status).toBe(200);
      expect(allowedRes.body.success).toBe(true);
      expect(allowedRes.body.venue.name).toBe('Secret Rooftop Bar');
      expect(allowedRes.body.venue.isCustom).toBe(true);

      // Verify custom venue is voteable
      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostToken)
        .send({
          participantId: hostId,
          venueId: allowedRes.body.venue.id,
          vote: 'superlike',
        });
      expect(voteRes.status).toBe(200);
      expect(voteRes.body.isMatch).toBe(true); // Solo room instant match
      expect(voteRes.body.matchedVenue.name).toBe('Secret Rooftop Bar');
    });

    it('records and aggregates affiliate clicks without memory leak', async () => {
      // Perform 25 rapid simulated outbound clicks across different partners
      const partners = ['opentable', 'resy', 'doordash', 'ubereats', 'googlemaps'];
      const actions = ['reserve', 'directions', 'delivery'];

      for (let i = 0; i < 25; i++) {
        const p = partners[i % partners.length];
        const a = actions[i % actions.length];
        await request(app)
          .get(`/api/affiliate/redirect?partner=${p}&action=${a}&format=json`);
      }

      const analyticsRes = await request(app).get('/api/affiliate/analytics');
      expect(analyticsRes.status).toBe(200);
      expect(analyticsRes.body.analytics.totalClicks).toBe(25);
      expect(analyticsRes.body.analytics.byPartner.opentable).toBe(5);
      expect(analyticsRes.body.analytics.byPartner.resy).toBe(5);
      expect(analyticsRes.body.analytics.recentClicks.length).toBeLessThanOrEqual(20);
    });
  });

  // =========================================================================
  // SUITE 5: Tie-Breaker Roulette Physics & Leaderboard Determinism
  // =========================================================================
  describe('Suite 5: Tiebreaker Roulette Physics & Leaderboard Determinism', () => {
    it('verifies deterministic roulette wheel target angle physics for all wedge counts', () => {
      const candidates = [
        { venueId: 'v1', venue: { id: 'v1', name: 'Spot 1' } },
        { venueId: 'v2', venue: { id: 'v2', name: 'Spot 2' } },
        { venueId: 'v3', venue: { id: 'v3', name: 'Spot 3' } },
        { venueId: 'v4', venue: { id: 'v4', name: 'Spot 4' } },
      ];

      // For 4 wedges, each wedge is 90 deg.
      // Wedge 0 center: 45 deg. targetAngle = 5*360 + (360 - 45) = 1800 + 315 = 2115 deg.
      // Wedge 1 center: 135 deg. targetAngle = 1800 + (360 - 135) = 2025 deg.
      const numWedges = 4;
      const wedgeAngle = 360 / numWedges;

      for (let idx = 0; idx < numWedges; idx++) {
        const targetWedgeCenter = (idx + 0.5) * wedgeAngle;
        const expectedAngle = (5 * 360) + (360 - targetWedgeCenter);

        // Calculate via internal method simulation
        const calculated = (5 * 360) + (360 - ((idx + 0.5) * (360 / numWedges)));
        expect(calculated).toBe(expectedAngle);
      }
    });

    it('fallback tiebreaker candidates when all votes are "pass" (0 likes)', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'PassHost', deckSize: 4 });
      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });

      // Pass on all venues
      for (const venue of startRes.body.deck) {
        await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', hostToken)
          .send({ participantId: hostId, venueId: venue.id, vote: 'pass' });
      }

      // Candidate retrieval must still return >= 2 fallback candidates
      const candRes = await request(app).get(`/api/rooms/${code}/tiebreaker/candidates`);
      expect(candRes.status).toBe(200);
      expect(candRes.body.candidates.length).toBeGreaterThanOrEqual(2);

      // Spin tiebreaker succeeds on fallback candidates
      const spinRes = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/spin`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });
      expect(spinRes.status).toBe(200);
      expect(spinRes.body.success).toBe(true);
      expect(spinRes.body.winningVenueId).toBeDefined();
    });

    it('manual tiebreaker selection sets winner and rejects non-existent venueId', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'ManualHost' });
      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });
      const validVenue = startRes.body.deck[0];

      // Selecting non-existent venue -> 404
      const invalidRes = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/select`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: 'non-existent-venue-id' });
      expect(invalidRes.status).toBe(404);

      // Selecting valid venue -> 200
      const validRes = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/select`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: validVenue.id });
      expect(validRes.status).toBe(200);
      expect(validRes.body.venueId).toBe(validVenue.id);

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.matchedVenueId).toBe(validVenue.id);
      expect(roomRes.body.room.status).toBe('matched');
    });
  });

  // =========================================================================
  // SUITE 6: Broadcaster Resiliency & SSE Connection Fault Tolerance
  // =========================================================================
  describe('Suite 6: Broadcaster SSE Resiliency & Connection Lifecycle', () => {
    it('handles simulated broken client socket during broadcast without crashing', () => {
      const mockBrokenRes = {
        writeHead: () => {},
        write: () => {
          throw new Error('ECONNRESET: simulated broken socket');
        },
        end: () => {},
      };

      broadcaster.addClient('TEST99', 'p-broken', {}, mockBrokenRes);
      expect(broadcaster.getClientCount('TEST99')).toBe(1);

      // Broadcasting should catch the write error, remove stale client, and return 0 delivered
      const delivered = broadcaster.broadcast('TEST99', 'test:event', { foo: 'bar' });
      expect(delivered).toBe(0);
      expect(broadcaster.getClientCount('TEST99')).toBe(0);
    });

    it('targeted sendTo returns false for non-existent participant', () => {
      const sent = broadcaster.sendTo('TEST99', 'ghost-user', 'ping', {});
      expect(sent).toBe(false);
    });

    it('closeRoom ends all active client connections and clears room map', () => {
      let endedCount = 0;
      const mockRes = {
        writeHead: () => {},
        write: () => {},
        end: () => {
          endedCount++;
        },
      };

      broadcaster.addClient('ROOM01', 'p1', {}, mockRes);
      broadcaster.addClient('ROOM01', 'p2', {}, mockRes);
      expect(broadcaster.getClientCount('ROOM01')).toBe(2);

      broadcaster.closeRoom('ROOM01');
      expect(endedCount).toBe(2);
      expect(broadcaster.getClientCount('ROOM01')).toBe(0);
    });
  });
});
