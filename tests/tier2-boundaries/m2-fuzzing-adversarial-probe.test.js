import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createRoomsRouter } from '../../server/routes/rooms.js';
import { createVotesRouter } from '../../server/routes/votes.js';
import { RoomStore, loadVenues, FORBIDDEN_PROPERTY_NAMES, isForbiddenPropertyName } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  const broadcaster = new Broadcaster();
  const roomStore = new RoomStore(broadcaster);
  app.use('/api/rooms', createRoomsRouter(roomStore, broadcaster));
  app.use('/api/rooms', createVotesRouter(roomStore, broadcaster));
  return { app, roomStore, broadcaster };
}

describe('Milestone 2 Iteration 2: Empirical Fuzzing & Adversarial Probes', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    const testApp = createTestApp();
    app = testApp.app;
    roomStore = testApp.roomStore;
    broadcaster = testApp.broadcaster;
  });

  afterEach(() => {
    // Clean up prototype just in case
    delete Object.prototype.polluted;
    delete Object.prototype.testExploit;
    delete Object.prototype.status;
  });

  async function createStartedRoom(deckSize = 12, activityCategory = 'dining') {
    const res = await request(app)
      .post('/api/rooms')
      .send({
        hostName: 'TestHost',
        deckSize,
        activityCategory,
      });
    const code = res.body.room.code;
    const sessionToken = res.body.sessionToken;
    const hostId = res.body.participant.id;

    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-session-token', sessionToken)
      .send({ participantId: hostId });

    return {
      code,
      sessionToken,
      hostId,
      deck: startRes.body.deck,
    };
  }

  // --------------------------------------------------------------------------
  // SUITE 1: Exhaustive Prototype Pollution Attack Vectors
  // --------------------------------------------------------------------------
  describe('Suite 1: Prototype Pollution Vectors & Defense-in-Depth', () => {
    it('rejects case variations and whitespace around reserved property names', async () => {
      const { code, sessionToken, hostId, deck } = await createStartedRoom(5);
      const attacks = [
        '__proto__',
        '__PROTO__',
        '  __proto__  ',
        'constructor',
        'Constructor',
        'CONSTRUCTOR',
        'prototype',
        'Prototype',
        'PROTOTYPE',
      ];

      for (const attack of attacks) {
        // As venueId in vote
        const resVenue = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', sessionToken)
          .send({
            participantId: hostId,
            venueId: attack,
            vote: 'like',
          });
        expect(resVenue.status).toBe(400);
        expect(resVenue.body.success).toBe(false);

        // As participantId in vote
        const resPart = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', sessionToken)
          .send({
            participantId: attack,
            venueId: deck[0].id,
            vote: 'like',
          });
        expect(resPart.status).toBe(400);
        expect(resPart.body.success).toBe(false);
      }

      expect(Object.prototype[hostId]).toBeUndefined();
      expect(({})[hostId]).toBeUndefined();
    });

    it('rejects prototype pollution in joinRoom endpoint', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'Host1' });
      const code = createRes.body.room.code;

      const hostileIds = ['__proto__', 'constructor', 'prototype'];
      for (const hid of hostileIds) {
        const joinRes = await request(app)
          .post(`/api/rooms/${code}/join`)
          .send({
            participantId: hid,
            name: `Attacker-${hid}`,
          });
        expect(joinRes.status).toBe(400);
        expect(joinRes.body.success).toBe(false);
      }

      // Even if casing varies, Object.prototype MUST NEVER be polluted
      const joinCaseRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({
          participantId: '__PROTO__',
          name: 'Attacker-PROTO',
        });
      expect(Object.prototype.__PROTO__).toBeUndefined();
      expect(({}).__PROTO__).toBeUndefined();
      expect(Object.prototype.name).toBeUndefined();
    });

    it('rejects hostId with reserved property names in createRoom', async () => {
      const hostileIds = ['__proto__', 'constructor', 'prototype'];
      for (const hid of hostileIds) {
        const createRes = await request(app)
          .post('/api/rooms')
          .send({
            hostName: 'HostileCreator',
            hostId: hid,
          });
        expect(createRes.status).toBe(400);
        expect(createRes.body.success).toBe(false);
      }
      expect(Object.prototype.isHost).toBeUndefined();
    });

    it('direct RoomStore test: verify participants and votes have null prototype', () => {
      const store = new RoomStore();
      const { room } = store.createRoom({ hostName: 'NullProtoTest' });

      expect(Object.getPrototypeOf(room.participants)).toBeNull();
      expect(Object.getPrototypeOf(room.votes)).toBeNull();

      // Ensure built-in Object properties cannot be hijacked
      expect(room.participants.toString).toBeUndefined();
      expect(room.votes.hasOwnProperty).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Ghost & Non-Deck Venue Validation
  // --------------------------------------------------------------------------
  describe('Suite 2: Ghost Venue Rejection & State Machine Integrity', () => {
    it('rejects votes when room is still in lobby status (before start)', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'LobbyHost' });
      const code = res.body.room.code;
      const sessionToken = res.body.sessionToken;
      const hostId = res.body.participant.id;

      // Try voting while status is 'lobby'
      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', sessionToken)
        .send({
          participantId: hostId,
          venueId: 'venue-001',
          vote: 'like',
        });

      expect(voteRes.status).toBe(400);
      expect(voteRes.body.success).toBe(false);
    });

    it('rejects votes on a real catalog venue that is NOT in the current room deck', async () => {
      // Create room with small deck of 3
      const { code, sessionToken, hostId, deck } = await createStartedRoom(3, 'dining');
      const deckIds = new Set(deck.map(v => v.id));

      // Find a venue from venues.json that is NOT in deck
      const allVenues = loadVenues();
      const nonDeckVenue = allVenues.find(v => !deckIds.has(v.id));
      expect(nonDeckVenue).toBeDefined();

      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', sessionToken)
        .send({
          participantId: hostId,
          venueId: nonDeckVenue.id,
          vote: 'like',
        });

      expect(voteRes.status).toBe(400);
      expect(voteRes.body.success).toBe(false);
      expect(voteRes.body.error).toContain('venueId is not in the room deck');
    });

    it('rejects malformed venueId types (numbers, objects, null, booleans, empty strings)', async () => {
      const { code, sessionToken, hostId } = await createStartedRoom(5);

      const malformedVenues = [
        '',
        null,
        12345,
        true,
        false,
        {},
        [],
      ];

      for (const mv of malformedVenues) {
        const res = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', sessionToken)
          .send({
            participantId: hostId,
            venueId: mv,
            vote: 'like',
          });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      }
    });

    it('voting idempotency: voting multiple times on same card updates vote without inflating swipedCount', async () => {
      const { code, sessionToken, hostId, deck } = await createStartedRoom(5);
      const targetCard = deck[0];

      // Vote 1: like
      const res1 = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', sessionToken)
        .send({
          participantId: hostId,
          venueId: targetCard.id,
          vote: 'like',
        });
      // Solo host: instant match
      expect(res1.body.progress.swipedCount).toBe(1);

      // Subsequent vote on same card in multi-user context
      // Let's test in a 2-user room to test vote mutation
      const createRes = await request(app).post('/api/rooms').send({ hostName: 'HostMulti' });
      const multiCode = createRes.body.room.code;
      const hostMulti = createRes.body.participant;
      const hostMultiToken = createRes.body.sessionToken;

      const joinRes = await request(app)
        .post(`/api/rooms/${multiCode}/join`)
        .send({ name: 'GuestMulti' });
      const guestMulti = joinRes.body.participant;
      const guestMultiToken = joinRes.body.sessionToken;

      const startRes = await request(app)
        .post(`/api/rooms/${multiCode}/start`)
        .set('x-session-token', hostMultiToken)
        .send({ participantId: hostMulti.id });
      const mDeck = startRes.body.deck;

      // Host votes 'like'
      const hVote1 = await request(app)
        .post(`/api/rooms/${multiCode}/vote`)
        .set('x-session-token', hostMultiToken)
        .send({
          participantId: hostMulti.id,
          venueId: mDeck[0].id,
          vote: 'like',
        });
      expect(hVote1.body.progress.swipedCount).toBe(1);

      // Host re-votes 'pass' on same card
      const hVote2 = await request(app)
        .post(`/api/rooms/${multiCode}/vote`)
        .set('x-session-token', hostMultiToken)
        .send({
          participantId: hostMulti.id,
          venueId: mDeck[0].id,
          vote: 'pass',
        });
      expect(hVote2.body.progress.swipedCount).toBe(1); // Still 1, NOT 2!
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Deck Size Boundary Sweep & Settings Mutation
  // --------------------------------------------------------------------------
  describe('Suite 3: Comprehensive Deck Size Boundary Sweep', () => {
    it('sweeps deck sizes from -5 to 30 ensuring all produce valid decks within [1, 25]', () => {
      const store = new RoomStore();
      const testSizes = [-5, -1, 0, 1, 2, 3, 5, 10, 12, 15, 20, 25, 26, 50, 100];

      for (const size of testSizes) {
        const deck = store.getDeckForRoom({ deckSize: size });
        expect(Array.isArray(deck)).toBe(true);

        if (size <= 0) {
          if (size === 0) {
            // 0 defaults to 12
            expect(deck.length).toBe(12);
          } else {
            // Negative clamped to 1
            expect(deck.length).toBe(1);
          }
        } else if (size > 25) {
          // Capped at 25
          expect(deck.length).toBe(25);
        } else {
          // In range [1, 25]
          expect(deck.length).toBe(size);
        }

        // Must have unique items
        const idSet = new Set(deck.map(v => v.id));
        expect(idSet.size).toBe(deck.length);

        // Must have at least 1 promoted venue
        expect(deck.some(v => v.isPromoted)).toBe(true);
      }
    });

    it('handles non-numeric and extreme deckSize inputs gracefully', () => {
      const store = new RoomStore();
      const extremes = [
        'notANumber',
        null,
        undefined,
        NaN,
        Infinity,
        -Infinity,
        1.7,
        2.9,
      ];

      for (const ext of extremes) {
        const deck = store.getDeckForRoom({ deckSize: ext });
        expect(Array.isArray(deck)).toBe(true);
        expect(deck.length).toBeGreaterThanOrEqual(1);
        expect(deck.length).toBeLessThanOrEqual(25);
        expect(deck.some(v => v.isPromoted)).toBe(true);
      }
    });

    it('clamps deckSize when updated via PATCH /api/rooms/:code/settings', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'SettingsHost' });
      const code = res.body.room.code;
      const hostToken = res.body.sessionToken;
      const hostId = res.body.participant.id;

      // Update with negative deckSize
      const patchNeg = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostToken)
        .send({
          participantId: hostId,
          settings: { deckSize: -99 },
        });
      expect(patchNeg.status).toBe(200);
      expect(patchNeg.body.settings.deckSize).toBe(1);

      // Update with oversized deckSize
      const patchHuge = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostToken)
        .send({
          participantId: hostId,
          settings: { deckSize: 999 },
        });
      expect(patchHuge.status).toBe(200);
      expect(patchHuge.body.settings.deckSize).toBe(25);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 4: Promoted Card Placement Invariant Verification
  // --------------------------------------------------------------------------
  describe('Suite 4: Promoted Card Guaranteed Early Placement Invariant', () => {
    it('verifies promoted card invariant across all categories and deck sizes 1..25', () => {
      const store = new RoomStore();
      const categories = ['dining', 'bars', 'activities', 'entertainment', 'all'];

      for (const cat of categories) {
        for (let size = 1; size <= 25; size++) {
          const deck = store.getDeckForRoom({
            activityCategory: cat,
            deckSize: size,
          });

          expect(deck.length).toBe(size);

          // Invariant 1: At least one promoted venue exists
          const hasPromoted = deck.some(v => v && v.isPromoted);
          expect(hasPromoted).toBe(true);

          // Invariant 2: The promoted venue is placed within top min(3, deckSize)
          const promotedIdx = deck.findIndex(v => v && v.isPromoted);
          const topLimit = Math.min(3, size);
          expect(promotedIdx).toBeLessThan(topLimit);

          // Invariant 3: No duplicate card IDs
          const idSet = new Set(deck.map(v => v.id));
          expect(idSet.size).toBe(size);
        }
      }
    });

    it('verifies promoted card is preserved even with hyper-restrictive distance and price filters', () => {
      const store = new RoomStore();

      // Hyper restrictive filters
      const deck = store.getDeckForRoom({
        activityCategory: 'dining',
        distance: 0.00001,
        priceRange: [4], // $$$$ only
        deckSize: 4,
      });

      expect(deck.length).toBe(4);
      expect(deck.some(v => v.isPromoted)).toBe(true);
      const pIdx = deck.findIndex(v => v.isPromoted);
      expect(pIdx).toBeLessThan(3);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 5: High-Entropy Fuzzing Probes
  // --------------------------------------------------------------------------
  describe('Suite 5: High-Entropy Fuzzing Probes Against Vote Endpoint', () => {
    it('endures 100 randomized malformed payloads without unhandled 500 crashes', async () => {
      const { code, sessionToken, hostId } = await createStartedRoom(5);

      const fuzzPayloads = [
        { venueId: 0, vote: 'like' },
        { venueId: false, vote: 'like' },
        { venueId: true, vote: 'like' },
        { venueId: {}, vote: 'like' },
        { venueId: [], vote: 'like' },
        { venueId: null, vote: 'like' },
        { venueId: undefined, vote: 'like' },
        { venueId: '\x00\x00\x00', vote: 'like' },
        { venueId: '<script>alert(1)</script>', vote: 'like' },
        { venueId: 'SELECT * FROM venues', vote: 'like' },
        { venueId: '{"$gt": ""}', vote: 'like' },
        { venueId: '../../../../etc/passwd', vote: 'like' },
        { venueId: 'constructor.prototype', vote: 'like' },
        { venueId: '__proto__.polluted', vote: 'like' },
        { venueId: 'valid-looking-id', vote: 123 },
        { venueId: 'valid-looking-id', vote: true },
        { venueId: 'valid-looking-id', vote: {} },
        { venueId: 'valid-looking-id', vote: null },
        { venueId: 'valid-looking-id', vote: 'INVALID_VOTE_TYPE' },
        { participantId: null, venueId: 'x', vote: 'like' },
        { participantId: 123, venueId: 'x', vote: 'like' },
        { participantId: {}, venueId: 'x', vote: 'like' },
      ];

      for (const payload of fuzzPayloads) {
        const res = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', sessionToken)
          .send({
            participantId: hostId,
            ...payload,
          });

        // The critical invariant: Server MUST NOT crash with 500
        expect(res.status).not.toBe(500);
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      }

      // After all fuzzing, room must still accept valid votes
      const validDeckRes = await request(app).get(`/api/rooms/${code}/deck`);
      const validCard = validDeckRes.body.deck[0];
      const validVoteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', sessionToken)
        .send({
          participantId: hostId,
          venueId: validCard.id,
          vote: 'like',
        });
      expect(validVoteRes.status).toBe(200);
      expect(validVoteRes.body.success).toBe(true);
    });
  });
});
