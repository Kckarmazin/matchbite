import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('R3: Tie-Breaking Helpers & Decision Roulette', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  // Helper: Setup room with 3 participants in voting state
  async function setupVotingRoom(deckSize = 6) {
    const hostRes = await request(app)
      .post('/api/rooms')
      .send({
        hostName: 'HostAlice',
        hostAvatar: '🍕',
        deckSize,
      });

    const code = hostRes.body.room.code;
    const hostAuth = {
      id: hostRes.body.participant.id,
      sessionToken: hostRes.body.sessionToken,
      hostKey: hostRes.body.hostKey,
    };

    const guest1Res = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({ name: 'GuestBob', avatar: '🍣' });

    const guest2Res = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({ name: 'GuestCharlie', avatar: '🌮' });

    const guests = [
      { id: guest1Res.body.participant.id, sessionToken: guest1Res.body.sessionToken },
      { id: guest2Res.body.participant.id, sessionToken: guest2Res.body.sessionToken },
    ];

    // Start voting
    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-host-key', hostAuth.hostKey)
      .send({ participantId: hostAuth.id });

    return { code, hostAuth, guests, deck: startRes.body.deck };
  }

  // =========================================================================
  // SUITE 1: Candidate Generation & Weighted Leaderboard Scoring
  // =========================================================================
  describe('Suite 1: Candidate Generation & Weighted Leaderboard Scoring', () => {
    it('ranks venues according to weighted scoring (superlike=3, like=1, pass=0)', async () => {
      const { code, hostAuth, guests, deck } = await setupVotingRoom(6);
      const v0 = deck[0].id;
      const v1 = deck[1].id;
      const v2 = deck[2].id;

      // Alice superlikes v0, likes v1, passes v2
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({ participantId: hostAuth.id, venueId: v0, vote: 'superlike' });
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({ participantId: hostAuth.id, venueId: v1, vote: 'like' });
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({ participantId: hostAuth.id, venueId: v2, vote: 'pass' });

      // Bob likes v0, passes v1, passes v2
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guests[0].sessionToken)
        .send({ participantId: guests[0].id, venueId: v0, vote: 'like' });
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guests[0].sessionToken)
        .send({ participantId: guests[0].id, venueId: v1, vote: 'pass' });

      // Charlie passes v0
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guests[1].sessionToken)
        .send({ participantId: guests[1].id, venueId: v0, vote: 'pass' });

      // Retrieve candidates
      const res = await request(app)
        .get(`/api/rooms/${code}/tiebreaker/candidates`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.candidates.length).toBeGreaterThanOrEqual(2);

      // v0 score: superlike(3) + like(1) = 4 points
      const topCandidate = res.body.candidates[0];
      expect(topCandidate.venueId).toBe(v0);
      expect(topCandidate.score).toBe(4);
      expect(topCandidate.approvals).toBe(2);

      // v1 score: like(1) = 1 point
      const secondCandidate = res.body.candidates[1];
      expect(secondCandidate.venueId).toBe(v1);
      expect(secondCandidate.score).toBe(1);
      expect(secondCandidate.approvals).toBe(1);
    });

    it('falls back to top deck venues when no positive votes were cast', async () => {
      const { code, hostAuth, deck } = await setupVotingRoom(4);

      // Cast all pass votes on first venue
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({ participantId: hostAuth.id, venueId: deck[0].id, vote: 'pass' });

      const res = await request(app)
        .get(`/api/rooms/${code}/tiebreaker/candidates`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.candidates.length).toBeGreaterThanOrEqual(2);
      expect(res.body.candidates[0].venue).toBeDefined();
    });

    it('respects limit query parameter', async () => {
      const { code } = await setupVotingRoom(6);

      const res = await request(app)
        .get(`/api/rooms/${code}/tiebreaker/candidates?limit=3`)
        .expect(200);

      expect(res.body.candidates.length).toBeLessThanOrEqual(3);
    });

    it('returns 404 for non-existent room code', async () => {
      const res = await request(app)
        .get('/api/rooms/GHOST999/tiebreaker/candidates')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  // =========================================================================
  // SUITE 2: Synchronized Roulette Spin Outcome
  // =========================================================================
  describe('Suite 2: Synchronized Roulette Spin Outcome', () => {
    it('enforces host privileges: rejects non-host spin attempt with 403', async () => {
      const { code, guests } = await setupVotingRoom(4);

      const res = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/spin`)
        .set('x-session-token', guests[0].sessionToken)
        .send({ participantId: guests[0].id })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/host/i);
    });

    it('allows host to execute spin and returns deterministic target angle & winning venue', async () => {
      const { code, hostAuth, deck } = await setupVotingRoom(4);
      const targetWinnerId = deck[2].id;

      const res = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/spin`)
        .set('x-host-key', hostAuth.hostKey)
        .send({
          participantId: hostAuth.id,
          winningVenueId: targetWinnerId,
          durationMs: 4000,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.winningVenueId).toBe(targetWinnerId);
      expect(res.body.winningVenue.id).toBe(targetWinnerId);
      expect(res.body.durationMs).toBe(4000);
      expect(typeof res.body.targetAngle).toBe('number');
      expect(res.body.tiebreakerResult).toBeDefined();

      // Verify room state transitioned to matched
      const roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
      expect(roomRes.body.room.status).toBe('matched');
      expect(roomRes.body.room.matchedVenueId).toBe(targetWinnerId);
      expect(roomRes.body.room.tiebreakerResult.winningVenueId).toBe(targetWinnerId);
    });

    it('selects valid random contender when no specific winner is provided', async () => {
      const { code, hostAuth, deck } = await setupVotingRoom(4);

      const res = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/spin`)
        .set('x-host-key', hostAuth.hostKey)
        .send({ participantId: hostAuth.id })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.winningVenueId).toBeDefined();
      expect(deck.some(v => v.id === res.body.winningVenueId)).toBe(true);
    });

    it('broadcasts tiebreaker:spin and match:revealed over SSE hub', async () => {
      const { code, hostAuth, deck } = await setupVotingRoom(4);
      const broadcastSpy = [];
      broadcaster.broadcast = (broadcastCode, event, data) => {
        broadcastSpy.push({ broadcastCode, event, data });
      };

      await request(app)
        .post(`/api/rooms/${code}/tiebreaker/spin`)
        .set('x-host-key', hostAuth.hostKey)
        .send({ participantId: hostAuth.id, winningVenueId: deck[0].id })
        .expect(200);

      expect(broadcastSpy.some(b => b.event === 'tiebreaker:spin' && b.data.winningVenueId === deck[0].id)).toBe(true);
      expect(broadcastSpy.some(b => b.event === 'match:revealed' && b.data.venueId === deck[0].id)).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 3: Manual Winner Selection
  // =========================================================================
  describe('Suite 3: Manual Winner Selection', () => {
    it('allows host to manually select winner from leaderboard', async () => {
      const { code, hostAuth, deck } = await setupVotingRoom(4);
      const chosenVenue = deck[1];

      const res = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/select`)
        .set('x-host-key', hostAuth.hostKey)
        .send({
          participantId: hostAuth.id,
          venueId: chosenVenue.id,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.venueId).toBe(chosenVenue.id);
      expect(res.body.venue.name).toBe(chosenVenue.name);

      const roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
      expect(roomRes.body.room.status).toBe('matched');
      expect(roomRes.body.room.matchedVenueId).toBe(chosenVenue.id);
    });

    it('rejects manual selection from non-host with 403', async () => {
      const { code, guests, deck } = await setupVotingRoom(4);

      const res = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/select`)
        .set('x-session-token', guests[0].sessionToken)
        .send({
          participantId: guests[0].id,
          venueId: deck[0].id,
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('rejects manual selection of non-existent venue with 404', async () => {
      const { code, hostAuth } = await setupVotingRoom(4);

      const res = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/select`)
        .set('x-host-key', hostAuth.hostKey)
        .send({
          participantId: hostAuth.id,
          venueId: 'venue-non-existent-999',
        })
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 4: Round Restart & Reset
  // =========================================================================
  describe('Suite 4: Round Restart & Reset', () => {
    it('resets votes and participants swiped count on restart', async () => {
      const { code, hostAuth, guests, deck } = await setupVotingRoom(4);

      // Host and guest swipe on first card
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({ participantId: hostAuth.id, venueId: deck[0].id, vote: 'like' });
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guests[0].sessionToken)
        .send({ participantId: guests[0].id, venueId: deck[0].id, vote: 'pass' });

      // Host restarts session
      const restartRes = await request(app)
        .post(`/api/rooms/${code}/restart`)
        .set('x-host-key', hostAuth.hostKey)
        .send({ participantId: hostAuth.id })
        .expect(200);

      expect(restartRes.body.success).toBe(true);
      expect(restartRes.body.status).toBe('voting');

      // Verify clean state
      const roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
      expect(roomRes.body.room.status).toBe('voting');
      expect(roomRes.body.room.matchedVenueId).toBeNull();
      expect(roomRes.body.room.participants.every(p => p.swipedCount === 0)).toBe(true);
    });

    it('rejects restart from non-host with 403', async () => {
      const { code, guests } = await setupVotingRoom(4);

      const res = await request(app)
        .post(`/api/rooms/${code}/restart`)
        .set('x-session-token', guests[0].sessionToken)
        .send({ participantId: guests[0].id })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/host/i);
    });

    it('broadcasts room:restarted and voting:started on restart', async () => {
      const { code, hostAuth } = await setupVotingRoom(4);
      const broadcastSpy = [];
      broadcaster.broadcast = (broadcastCode, event, data) => {
        broadcastSpy.push({ broadcastCode, event, data });
      };

      await request(app)
        .post(`/api/rooms/${code}/restart`)
        .set('x-host-key', hostAuth.hostKey)
        .send({ participantId: hostAuth.id })
        .expect(200);

      expect(broadcastSpy.some(b => b.event === 'room:restarted')).toBe(true);
      expect(broadcastSpy.some(b => b.event === 'voting:started')).toBe(true);
    });

    it('supports resetting room back to lobby status if requested', async () => {
      const { code, hostAuth } = await setupVotingRoom(4);

      const restartRes = await request(app)
        .post(`/api/rooms/${code}/restart`)
        .set('x-host-key', hostAuth.hostKey)
        .send({ participantId: hostAuth.id, status: 'lobby' })
        .expect(200);

      expect(restartRes.body.status).toBe('lobby');

      const roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
      expect(roomRes.body.room.status).toBe('lobby');
    });
  });
});
