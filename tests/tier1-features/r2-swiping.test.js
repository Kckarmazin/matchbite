import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('R2: Card Swiping & Consensus Matching Engine', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  // Helper: Creates a populated room with N participants
  async function setupRoomWithParticipants(count = 2, settings = {}) {
    const hostRes = await request(app)
      .post('/api/rooms')
      .send({
        hostName: 'HostUser',
        hostAvatar: '🍕',
        activityCategory: 'dining',
        ...settings,
      });

    const code = hostRes.body.room.code;
    const participants = [
      {
        id: hostRes.body.participant.id,
        name: 'HostUser',
        sessionToken: hostRes.body.sessionToken,
        hostKey: hostRes.body.hostKey,
        isHost: true,
      },
    ];

    for (let i = 1; i < count; i++) {
      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({
          name: `GuestUser${i}`,
          avatar: '🍣',
        });
      participants.push({
        id: joinRes.body.participant.id,
        name: `GuestUser${i}`,
        sessionToken: joinRes.body.sessionToken,
        isHost: false,
      });
    }

    return { code, participants, hostKey: hostRes.body.hostKey };
  }

  // =========================================================================
  // SUITE 1: Deck Retrieval & Room Start Lifecycle
  // =========================================================================
  describe('Suite 1: Deck Retrieval & Room Start Lifecycle', () => {
    it('Host starts voting round: room transitions from lobby to voting with deck', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const host = participants[0];

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });

      expect(startRes.status).toBe(200);
      expect(startRes.body.success).toBe(true);
      expect(startRes.body.status).toBe('voting');
      expect(Array.isArray(startRes.body.deck)).toBe(true);
      expect(startRes.body.deck.length).toBeGreaterThanOrEqual(5);

      // Verify stored room status
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('voting');
    });

    it('Rejects voting start attempt by guest with 403 Forbidden', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const guest = participants[1];

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', guest.sessionToken)
        .send({ participantId: guest.id });

      expect(startRes.status).toBe(403);
      expect(startRes.body.success).toBe(false);
      expect(startRes.body.error).toContain('Only the room host');
    });

    it('GET /api/rooms/:code/deck returns filtered deck containing promoted card', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const host = participants[0];

      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });

      const deckRes = await request(app).get(`/api/rooms/${code}/deck`);
      expect(deckRes.status).toBe(200);
      expect(deckRes.body.success).toBe(true);
      expect(Array.isArray(deckRes.body.deck)).toBe(true);

      // Verify every card has valid schema
      for (const card of deckRes.body.deck) {
        expect(card.id).toBeDefined();
        expect(card.name).toBeDefined();
        expect(card.rating).toBeGreaterThan(0);
        expect(card.address).toBeDefined();
        expect(card.imageUrl).toBeDefined();
      }

      // Verify at least one card is promoted (R4 monetization requirement)
      const hasPromoted = deckRes.body.deck.some((c) => c.isPromoted === true);
      expect(hasPromoted).toBe(true);
    });

    it('Starting voting resets participant progress to 0', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const host = participants[0];

      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      for (const p of roomRes.body.room.participants) {
        expect(p.swipedCount).toBe(0);
        expect(p.status).toBe('swiping');
      }
    });

    it('Emits voting:started SSE broadcast when voting is initiated', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const host = participants[0];

      let broadcastFired = false;
      let broadcastPayload = null;

      const origBroadcast = broadcaster.broadcast.bind(broadcaster);
      broadcaster.broadcast = (bCode, eventName, data) => {
        if (eventName === 'voting:started') {
          broadcastFired = true;
          broadcastPayload = data;
        }
        return origBroadcast(bCode, eventName, data);
      };

      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });

      expect(broadcastFired).toBe(true);
      expect(broadcastPayload.roomStatus).toBe('voting');
      expect(broadcastPayload.deck).toBeDefined();
    });

    it('Distance filtering parses distance in getDeckForRoom', () => {
      const deckWalkable = roomStore.getDeckForRoom({
        activityCategory: 'dining',
        distance: 'walkable',
      });
      expect(deckWalkable.length).toBeGreaterThan(0);

      const deckShortDrive = roomStore.getDeckForRoom({
        activityCategory: 'bars',
        distance: 'short_drive',
      });
      expect(deckShortDrive.length).toBeGreaterThan(0);
    });

    it('Category filtering recognizes activities and aliases with entertainment', () => {
      const deck = roomStore.getDeckForRoom({
        activityCategory: 'activities',
      });
      expect(deck.length).toBeGreaterThan(0);
      const categories = new Set(deck.map(v => v.category));
      expect(categories.has('activities') || categories.has('entertainment')).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 2: Vote Submission & Authentication Validation
  // =========================================================================
  describe('Suite 2: Vote Submission & Authentication Validation', () => {
    let roomCode;
    let users;
    let venueId;

    beforeEach(async () => {
      const setup = await setupRoomWithParticipants(2);
      roomCode = setup.code;
      users = setup.participants;

      // Start voting
      const startRes = await request(app)
        .post(`/api/rooms/${roomCode}/start`)
        .set('x-session-token', users[0].sessionToken)
        .send({ participantId: users[0].id });

      venueId = startRes.body.deck[0].id;
    });

    it('Accepts valid like vote and updates progress', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[0].sessionToken)
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'like',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isMatch).toBe(false); // Guest hasn't voted yet
      expect(res.body.progress.swipedCount).toBe(1);
    });

    it('Accepts valid pass vote and updates progress', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[0].sessionToken)
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'pass',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isMatch).toBe(false);
      expect(res.body.progress.swipedCount).toBe(1);
    });

    it('Accepts valid superlike vote and updates progress', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[0].sessionToken)
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'superlike',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isMatch).toBe(false);
      expect(res.body.progress.swipedCount).toBe(1);
    });

    it('Rejects vote without sessionToken with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'like',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('token is required');
    });

    it('Rejects vote with mismatched sessionToken with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[1].sessionToken) // Using guest's token for host's vote
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'like',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Rejects invalid vote type with 400 Bad Request', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[0].sessionToken)
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'dislike',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("vote must be 'like', 'pass', or 'superlike'");
    });

    it('Rejects missing participantId or missing venueId with 400 Bad Request', async () => {
      const res1 = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[0].sessionToken)
        .send({
          venueId,
          vote: 'like',
        });
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain('participantId is required');

      const res2 = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[0].sessionToken)
        .send({
          participantId: users[0].id,
          vote: 'like',
        });
      expect(res2.status).toBe(400);
      expect(res2.body.error).toContain('venueId is required');
    });

    it('Rejects voting when room is still in lobby status with 400 Bad Request', async () => {
      // Create a fresh room in lobby status
      const lobbySetup = await setupRoomWithParticipants(1);
      const lobbyCode = lobbySetup.code;
      const solo = lobbySetup.participants[0];

      const res = await request(app)
        .post(`/api/rooms/${lobbyCode}/vote`)
        .set('x-session-token', solo.sessionToken)
        .send({
          participantId: solo.id,
          venueId: 'venue-001',
          vote: 'like',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Voting has not started');
    });

    it('Rejects voting on non-existent room code with 404 Not Found', async () => {
      const res = await request(app)
        .post('/api/rooms/FAKEROOM99/vote')
        .set('x-session-token', 'some-token')
        .send({
          participantId: 'some-id',
          venueId: 'venue-001',
          vote: 'like',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('Rejects voting by participant not in room with 404 Not Found', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', 'token-abc')
        .send({
          participantId: 'p-stranger-999',
          venueId,
          vote: 'like',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Participant not found');
    });
  });

  // =========================================================================
  // SUITE 3: Real-Time SSE Broadcasting on Votes & Match Reveal
  // =========================================================================
  describe('Suite 3: Real-Time SSE Broadcasting on Votes & Match Reveal', () => {
    it('Broadcasts participant:progress with swipedCount and totalCards on vote', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const host = participants[0];

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });
      const venueId = startRes.body.deck[0].id;

      let eventData = null;
      broadcaster.broadcast = (bCode, eventName, data) => {
        if (eventName === 'participant:progress') {
          eventData = data;
        }
      };

      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          venueId,
          vote: 'like',
        });

      expect(eventData).toBeDefined();
      expect(eventData.participantId).toBe(host.id);
      expect(eventData.swipedCount).toBe(1);
      expect(eventData.totalCards).toBe(startRes.body.deck.length);
      expect(eventData.venueId).toBe(venueId);
      expect(eventData.progressPercent).toBeDefined();
    });

    it('Broadcasts match:revealed with full venue payload upon unanimous agreement', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [host, guest] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });
      const venueId = startRes.body.deck[0].id;

      let matchEventData = null;
      const origBroadcast = broadcaster.broadcast.bind(broadcaster);
      broadcaster.broadcast = (bCode, eventName, data) => {
        if (eventName === 'match:revealed') {
          matchEventData = data;
        }
        return origBroadcast(bCode, eventName, data);
      };

      // Host votes like
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id, venueId, vote: 'like' });

      expect(matchEventData).toBeNull(); // No match yet

      // Guest votes like -> consensus!
      const matchRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guest.sessionToken)
        .send({ participantId: guest.id, venueId, vote: 'like' });

      expect(matchRes.body.isMatch).toBe(true);
      expect(matchEventData).toBeDefined();
      expect(matchEventData.venueId).toBe(venueId);
      expect(matchEventData.isUnanimous).toBe(true);
      expect(matchEventData.venue.name).toBeDefined();
      expect(matchEventData.participants).toHaveLength(2);
    });
  });

  // =========================================================================
  // SUITE 4: Consensus Matching Algorithm Matrix
  // =========================================================================
  describe('Suite 4: Consensus Matching Matrix', () => {
    it('1-person solo room: single like immediately triggers instant match', async () => {
      const { code, participants } = await setupRoomWithParticipants(1);
      const solo = participants[0];

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', solo.sessionToken)
        .send({ participantId: solo.id });
      const venueId = startRes.body.deck[0].id;

      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', solo.sessionToken)
        .send({ participantId: solo.id, venueId, vote: 'like' });

      expect(voteRes.status).toBe(200);
      expect(voteRes.body.isMatch).toBe(true);
      expect(voteRes.body.matchedVenue).toBeDefined();
      expect(voteRes.body.matchedVenue.id).toBe(venueId);

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('matched');
      expect(roomRes.body.room.matchedVenueId).toBe(venueId);
    });

    it('1-person solo room: single pass does NOT trigger match', async () => {
      const { code, participants } = await setupRoomWithParticipants(1);
      const solo = participants[0];

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', solo.sessionToken)
        .send({ participantId: solo.id });
      const venueId = startRes.body.deck[0].id;

      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', solo.sessionToken)
        .send({ participantId: solo.id, venueId, vote: 'pass' });

      expect(voteRes.status).toBe(200);
      expect(voteRes.body.isMatch).toBe(false);
      expect(voteRes.body.matchedVenue).toBeNull();
    });

    it('2-person couples session: one likes and one passes does NOT match', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [user1, user2] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', user1.sessionToken)
        .send({ participantId: user1.id });
      const venueId = startRes.body.deck[0].id;

      // User 1 likes
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', user1.sessionToken)
        .send({ participantId: user1.id, venueId, vote: 'like' });

      // User 2 passes
      const vote2Res = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', user2.sessionToken)
        .send({ participantId: user2.id, venueId, vote: 'pass' });

      expect(vote2Res.body.isMatch).toBe(false);
      expect(vote2Res.body.matchedVenue).toBeNull();

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('voting');
    });

    it('2-person couples session: both like same venue -> instant match triggered', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [u1, u2] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id });
      const venueId = startRes.body.deck[0].id;

      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id, venueId, vote: 'like' });

      const res2 = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', u2.sessionToken)
        .send({ participantId: u2.id, venueId, vote: 'like' });

      expect(res2.body.isMatch).toBe(true);
      expect(res2.body.matchedVenue.id).toBe(venueId);
    });

    it('4-person group: 3 like and 1 passes blocks match; all 4 like triggers match', async () => {
      const { code, participants } = await setupRoomWithParticipants(4);
      const [u1, u2, u3, u4] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id });
      const venueA = startRes.body.deck[0].id;
      const venueB = startRes.body.deck[1].id;

      // Venue A: 3 like, 1 pass -> NO match
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId: venueA, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId: venueA, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u3.sessionToken).send({ participantId: u3.id, venueId: venueA, vote: 'like' });
      const blockedRes = await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u4.sessionToken).send({ participantId: u4.id, venueId: venueA, vote: 'pass' });

      expect(blockedRes.body.isMatch).toBe(false);

      // Venue B: all 4 like -> MATCH!
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId: venueB, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId: venueB, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u3.sessionToken).send({ participantId: u3.id, venueId: venueB, vote: 'like' });
      const agreedRes = await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u4.sessionToken).send({ participantId: u4.id, venueId: venueB, vote: 'like' });

      expect(agreedRes.body.isMatch).toBe(true);
      expect(agreedRes.body.matchedVenue.id).toBe(venueB);
    });

    it('Superlike consensus: mix of like and superlike counts as 100% unanimous agreement', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [u1, u2] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id });
      const venueId = startRes.body.deck[0].id;

      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId, vote: 'superlike' });
      const matchRes = await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId, vote: 'like' });

      expect(matchRes.body.isMatch).toBe(true);
      expect(matchRes.body.matchedVenue.id).toBe(venueId);
    });

    it('Subsequent votes after match maintain matched status', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [u1, u2] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id });
      const [v0, v1] = startRes.body.deck;

      // Match on v0
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId: v0.id, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId: v0.id, vote: 'like' });

      // u1 swipes on v1 afterwards
      const lateVoteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id, venueId: v1.id, vote: 'like' });

      expect(lateVoteRes.body.isMatch).toBe(true);
      expect(lateVoteRes.body.matchedVenue.id).toBe(v0.id); // Stays locked to original winner
    });

    it('Idempotent voting: voting again on same venue updates vote without double incrementing count', async () => {
      const { code, participants } = await setupRoomWithParticipants(1);
      const solo = participants[0];

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', solo.sessionToken)
        .send({ participantId: solo.id });
      const venueId = startRes.body.deck[0].id;

      // Vote 1: pass
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', solo.sessionToken).send({ participantId: solo.id, venueId, vote: 'pass' });

      // Vote 2: like on same venue
      const res2 = await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', solo.sessionToken).send({ participantId: solo.id, venueId, vote: 'like' });

      expect(res2.body.progress.swipedCount).toBe(1); // Still 1 distinct venue swiped
    });
  });

  // =========================================================================
  // SUITE 5: Results Leaderboard & Consensus Scoring
  // =========================================================================
  describe('Suite 5: Results Leaderboard & Consensus Scoring', () => {
    it('GET /api/rooms/:code/results calculates weighted scores and unanimous flags', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [u1, u2] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id });
      const deck = startRes.body.deck;

      // Venue 0: u1 superlikes, u2 likes (Score = 3 + 1 = 4, Unanimous)
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId: deck[0].id, vote: 'superlike' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId: deck[0].id, vote: 'like' });

      const res = await request(app).get(`/api/rooms/${code}/results`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('matched');
      expect(res.body.matchedVenueId).toBe(deck[0].id);

      const topResult = res.body.leaderboard[0];
      expect(topResult.venueId).toBe(deck[0].id);
      expect(topResult.score).toBe(4);
      expect(topResult.isUnanimous).toBe(true);
      expect(topResult.approvalRate).toBe(100);
      expect(topResult.voters).toHaveLength(2);
    });

    it('GET /api/rooms/:code/results ranks venues by score when votes are mixed', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [u1, u2] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id });
      const deck = startRes.body.deck;

      // Venue 0: u1 passes, u2 likes (Score = 1)
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId: deck[0].id, vote: 'pass' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId: deck[0].id, vote: 'like' });

      // Venue 1: u1 superlikes, u2 passes (Score = 3)
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId: deck[1].id, vote: 'superlike' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId: deck[1].id, vote: 'pass' });

      const res = await request(app).get(`/api/rooms/${code}/results`);
      expect(res.status).toBe(200);
      expect(res.body.leaderboard[0].venueId).toBe(deck[1].id);
      expect(res.body.leaderboard[0].score).toBe(3);
      expect(res.body.leaderboard[1].venueId).toBe(deck[0].id);
      expect(res.body.leaderboard[1].score).toBe(1);
    });
  });

  // =========================================================================
  // SUITE 6: Deck Validation & Malicious Vote Prevention
  // =========================================================================
  describe('Suite 6: Deck Validation & Malicious Vote Prevention', () => {
    it('Rejects vote on valid catalog venue that was excluded from the room deck', async () => {
      const { code, participants } = await setupRoomWithParticipants(2, {
        activityCategory: 'dining',
        deckSize: 5,
      });
      const host = participants[0];

      // Start voting
      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });
      const deckIds = new Set(startRes.body.deck.map(v => v.id));

      // Pick a valid venue from catalog that is NOT in this 5-card dining deck
      const allVenues = roomStore.getDeckForRoom({ activityCategory: 'all', deckSize: 25 });
      const nonDeckVenue = allVenues.find(v => !deckIds.has(v.id));
      expect(nonDeckVenue).toBeDefined();

      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          venueId: nonDeckVenue.id,
          vote: 'like',
        });

      expect(voteRes.status).toBe(400);
      expect(voteRes.body.success).toBe(false);
      expect(voteRes.body.error).toBe('venueId is not in the room deck');
    });

    it('Does not increment participant swipedCount on rejected vote', async () => {
      const { code, participants } = await setupRoomWithParticipants(1);
      const host = participants[0];

      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });

      // Send invalid vote
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          venueId: 'invalid-id-xyz',
          vote: 'like',
        });

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.participants[0].swipedCount).toBe(0);
    });

    it('Multi-participant room: invalid votes from all participants do not trigger consensus', async () => {
      const { code, participants } = await setupRoomWithParticipants(3);
      const host = participants[0];

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });
      const validDeck = startRes.body.deck;

      // All 3 participants attempt to vote like on a fake venue
      for (const p of participants) {
        const res = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', p.sessionToken)
          .send({
            participantId: p.id,
            venueId: 'coordinated-ghost-attack',
            vote: 'like',
          });
        expect(res.status).toBe(400);
      }

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('voting');

      // Legitimate votes on valid card subsequently succeed and match
      for (const p of participants) {
        await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', p.sessionToken)
          .send({
            participantId: p.id,
            venueId: validDeck[0].id,
            vote: 'like',
          });
      }

      const matchRes = await request(app).get(`/api/rooms/${code}`);
      expect(matchRes.body.room.status).toBe('matched');
      expect(matchRes.body.room.matchedVenueId).toBe(validDeck[0].id);
      expect(matchRes.body.room.matchedVenue.id).toBe(validDeck[0].id);
    });
  });
});
