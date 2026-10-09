import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('Milestone 2 Adversarial Challenge: Boundary, Security & Malicious Input Suite', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  afterEach(() => {
    // Teardown: ensure prototype is clean in case of prototype pollution tests
    const polluters = ['SecurityHost', 'p-host-proto', 'p-evil-guest', 'polluted'];
    for (const p of polluters) {
      delete Object.prototype[p];
    }
  });

  // Helper to create an active room with N participants and started voting round
  async function setupActiveVotingRoom(participantCount = 2, settings = {}) {
    const hostRes = await request(app)
      .post('/api/rooms')
      .send({
        hostName: 'SecurityHost',
        hostAvatar: '🛡️',
        activityCategory: 'dining',
        ...settings,
      });

    const code = hostRes.body.room.code;
    const participants = [
      {
        id: hostRes.body.participant.id,
        name: 'SecurityHost',
        sessionToken: hostRes.body.sessionToken,
        hostKey: hostRes.body.hostKey,
        isHost: true,
      },
    ];

    for (let i = 1; i < participantCount; i++) {
      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({
          name: `GuestUser${i}`,
          avatar: '🧪',
        });
      participants.push({
        id: joinRes.body.participant.id,
        name: `GuestUser${i}`,
        sessionToken: joinRes.body.sessionToken,
        isHost: false,
      });
    }

    // Start voting round by host
    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-session-token', participants[0].sessionToken)
      .send({ participantId: participants[0].id });

    return {
      code,
      participants,
      deck: startRes.body.deck,
      hostKey: hostRes.body.hostKey,
    };
  }

  // =========================================================================
  // SUITE 1: Malformed and Malicious Vote Inputs
  // =========================================================================
  describe('Suite 1: Malformed & Malicious Vote Inputs', () => {
    it('Rejects invalid vote types with 400 Bad Request', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(2);
      const host = participants[0];
      const validVenueId = deck[0].id;

      const invalidVoteTypes = [
        'maybe',
        'dislike',
        'yes',
        'no',
        'LIKE', // case sensitivity
        'Pass',
        '',
        123,
        0,
        -1,
        true,
        false,
        null,
        [],
        {},
      ];

      for (const badVote of invalidVoteTypes) {
        const res = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', host.sessionToken)
          .send({
            participantId: host.id,
            venueId: validVenueId,
            vote: badVote,
          });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toMatch(/vote must be 'like', 'pass', or 'superlike'/i);
      }
    });

    it('Rejects missing or undefined venueId with 400 Bad Request', async () => {
      const { code, participants } = await setupActiveVotingRoom(2);
      const host = participants[0];

      // Undefined / omitted venueId
      const res1 = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          vote: 'like',
        });
      expect(res1.status).toBe(400);
      expect(res1.body.success).toBe(false);
      expect(res1.body.error).toContain('venueId is required');

      // Empty string venueId
      const res2 = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          venueId: '',
          vote: 'like',
        });
      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
      expect(res2.body.error).toContain('venueId is required');

      // Null venueId
      const res3 = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          venueId: null,
          vote: 'like',
        });
      expect(res3.status).toBe(400);
      expect(res3.body.success).toBe(false);
      expect(res3.body.error).toContain('venueId is required');
    });

    it('Safely handles SQL and script injection strings without 500 crashes or SQL errors', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(2);
      const host = participants[0];
      const validVenueId = deck[0].id;

      const hostileStrings = [
        "' OR '1'='1",
        "'; DROP TABLE rooms; --",
        '<script>alert("xss")</script>',
        '"><img src=x onerror=alert(1)>',
        '../../../../etc/passwd',
        '{"$gt": ""}',
        '${7*7}',
        'A'.repeat(5000), // Buffer overload string
      ];

      for (const injection of hostileStrings) {
        // Test hostile string as vote parameter -> Must be rejected with 400
        const resVote = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', host.sessionToken)
          .send({
            participantId: host.id,
            venueId: validVenueId,
            vote: injection,
          });
        expect(resVote.status).toBe(400);
        expect(resVote.body.success).toBe(false);

        // Test hostile string as venueId
        const resVenue = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', host.sessionToken)
          .send({
            participantId: host.id,
            venueId: injection,
            vote: 'like',
          });
        // Server must not crash with 500
        expect(resVenue.status).not.toBe(500);
      }
    });

    it('rejects prototype pollution attack via venueId: "__proto__" with 400 Bad Request and preserves Object.prototype immunity', async () => {
      const { code, participants } = await setupActiveVotingRoom(2);
      const host = participants[0];

      // Ensure prototype is initially clean
      delete Object.prototype[host.id];
      delete Object.prototype.polluted;

      // Attack: Send vote with venueId = '__proto__'
      const resProto = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          venueId: '__proto__',
          vote: 'like',
        });

      // Verification: Attack must be rejected with 400 Bad Request
      expect(resProto.status).toBe(400);
      expect(resProto.body.success).toBe(false);
      expect(resProto.body.error).toMatch(/(reserved property name|not in the room deck)/i);

      // Verify Object.prototype is completely unpolluted across the process
      expect(Object.prototype[host.id]).toBeUndefined();
      expect(({})[host.id]).toBeUndefined();
      expect(Object.prototype.polluted).toBeUndefined();
      expect(({}).polluted).toBeUndefined();

      // Teardown cleanup
      delete Object.prototype[host.id];
      delete Object.prototype.polluted;
    });

    it('rejects voting on ghost non-deck venueId with 400 Bad Request and preserves room state', async () => {
      const { code, participants } = await setupActiveVotingRoom(1);
      const soloHost = participants[0];

      // Vote on an arbitrary non-deck ghost venueId
      const ghostVenueId = 'phantom-venue-99999';
      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', soloHost.sessionToken)
        .send({
          participantId: soloHost.id,
          venueId: ghostVenueId,
          vote: 'like',
        });

      // Must be rejected with 400 Bad Request
      expect(voteRes.status).toBe(400);
      expect(voteRes.body.success).toBe(false);
      expect(voteRes.body.error).toContain('venueId is not in the room deck');

      // Verify room status remains 'voting' and no match is created
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('voting');
      expect(roomRes.body.room.matchedVenueId).toBeNull();
      expect(roomRes.body.room.matchedVenue).toBeNull();
    });

    it('Rejects venueId: "constructor" with 400 Bad Request and leaves Object.constructor intact', async () => {
      const { code, participants } = await setupActiveVotingRoom(2);
      const host = participants[0];

      const res = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          venueId: 'constructor',
          vote: 'like',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/(reserved property name|not in the room deck)/i);
      expect(Object[host.id]).toBeUndefined();
    });

    it('Rejects venueId: "prototype" with 400 Bad Request', async () => {
      const { code, participants } = await setupActiveVotingRoom(2);
      const host = participants[0];

      const res = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          venueId: 'prototype',
          vote: 'like',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/(reserved property name|not in the room deck)/i);
    });

    it('Rejects participantId: "__proto__" in vote request with 400 Bad Request', async () => {
      const { code, deck } = await setupActiveVotingRoom(2);

      const res = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', 'st-test-token')
        .send({
          participantId: '__proto__',
          venueId: deck[0].id,
          vote: 'like',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/reserved property name/i);
    });

    it('Rejects participantId: "__proto__" in join request with 400 Bad Request', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'JoinTestHost' });
      const code = createRes.body.room.code;

      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({
          participantId: '__proto__',
          name: 'HostileJoiner',
        });

      expect(joinRes.status).toBe(400);
      expect(joinRes.body.success).toBe(false);
      expect(joinRes.body.error).toMatch(/reserved property name/i);
      expect(Object.prototype.status).toBeUndefined();
    });

    it('Direct RoomStore Unit Test: recordVote with "__proto__" throws 400 Error and preserves null prototype', () => {
      const store = new RoomStore();
      const { room, participant, sessionToken } = store.createRoom({ hostName: 'DirectTest' });
      store.startVoting(room.code, participant.sessionToken);

      // Verify room.votes has null prototype
      expect(Object.getPrototypeOf(room.votes)).toBeNull();

      // Verify direct recordVote with '__proto__' throws
      expect(() => {
        store.recordVote(room.code, {
          participantId: participant.id,
          sessionToken,
          venueId: '__proto__',
          vote: 'like',
        });
      }).toThrow(/(reserved property name|not in the room deck)/i);

      expect(Object.prototype[participant.id]).toBeUndefined();
    });

    it('Rejects votes before room starts (while in lobby status) with 400 Bad Request', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'LobbyHost' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;
      const sessionToken = createRes.body.sessionToken;

      // Attempt to vote before POST /api/rooms/:code/start
      const res = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', sessionToken)
        .send({
          participantId: hostId,
          venueId: 'venue-001',
          vote: 'like',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Voting has not started for this room');
    });

    it('Rejects votes after room is closed with 409 Conflict', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(2);
      const host = participants[0];

      // Force room status to closed in roomStore
      const room = roomStore.getRoom(code);
      room.status = 'closed';

      const res = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          venueId: deck[0].id,
          vote: 'like',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Room is closed');
    });

    it('Returns 404 for votes on non-existent room code', async () => {
      const res = await request(app)
        .post('/api/rooms/NONEXIST99/vote')
        .set('x-session-token', 'st-any-token')
        .send({
          participantId: 'p-12345',
          venueId: 'venue-001',
          vote: 'like',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('Returns 400 for empty or whitespace-only room codes in normalizeRoomCode', async () => {
      // Empty code via encoded spaces
      const res = await request(app)
        .post('/api/rooms/%20%20/vote')
        .set('x-session-token', 'st-any-token')
        .send({
          participantId: 'p-12345',
          venueId: 'venue-001',
          vote: 'like',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid room code format');
    });
  });

  // =========================================================================
  // SUITE 2: Dual-Token Security Boundaries
  // =========================================================================
  describe('Suite 2: Dual-Token Security Boundaries', () => {
    it('Rejects vote attempt with missing sessionToken with 403 Forbidden', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(2);
      const host = participants[0];

      const res = await request(app)
        .post(`/api/rooms/${code}/vote`)
        // No x-session-token header, no body token
        .send({
          participantId: host.id,
          venueId: deck[0].id,
          vote: 'like',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Authentication session token is required');
    });

    it('Rejects vote attempt with forged / fabricated sessionToken with 403 Forbidden', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(2);
      const host = participants[0];

      const forgedTokens = [
        'st-fake-token-00000',
        'st-00000000-0000-0000-0000-000000000000',
        'bearer-forged',
        'random-gibberish-string',
      ];

      for (const fakeToken of forgedTokens) {
        const res = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', fakeToken)
          .send({
            participantId: host.id,
            venueId: deck[0].id,
            vote: 'like',
          });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('Invalid or missing session token');
      }
    });

    it('Rejects vote attempt when participantId and sessionToken belong to different participants', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(2);
      const host = participants[0];
      const guest = participants[1];

      // Host tries to vote using Guest's participantId with Host's token
      const spoofRes1 = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: guest.id, // Mismatched ID!
          venueId: deck[0].id,
          vote: 'like',
        });
      expect(spoofRes1.status).toBe(403);
      expect(spoofRes1.body.success).toBe(false);
      expect(spoofRes1.body.error).toContain('Invalid or missing session token');

      // Guest tries to vote using Host's participantId with Guest's token
      const spoofRes2 = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guest.sessionToken)
        .send({
          participantId: host.id, // Mismatched ID!
          venueId: deck[0].id,
          vote: 'like',
        });
      expect(spoofRes2.status).toBe(403);
      expect(spoofRes2.body.success).toBe(false);
      expect(spoofRes2.body.error).toContain('Invalid or missing session token');
    });

    it('Rejects vote attempt with non-existent participantId with 404 Not Found', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(2);
      const host = participants[0];

      const res = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: 'p-ghost-does-not-exist',
          venueId: deck[0].id,
          vote: 'like',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Participant not found in room');
    });

    it('Rejects vote attempt when participant has left / been evicted from room', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(2);
      const guest = participants[1];

      // Guest leaves the room
      const leaveRes = await request(app)
        .post(`/api/rooms/${code}/leave`)
        .set('x-session-token', guest.sessionToken)
        .send({ participantId: guest.id });
      expect(leaveRes.status).toBe(200);

      // Evicted guest attempts to vote with previous sessionToken
      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guest.sessionToken)
        .send({
          participantId: guest.id,
          venueId: deck[0].id,
          vote: 'like',
        });

      expect(voteRes.status).toBe(404);
      expect(voteRes.body.success).toBe(false);
      expect(voteRes.body.error).toContain('Participant not found in room');
    });

    it('Accepts authorization via Bearer Authorization header, custom headers, and body fallback', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(2);
      const host = participants[0];

      // 1. Bearer header
      const resBearer = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('authorization', `Bearer ${host.sessionToken}`)
        .send({
          participantId: host.id,
          venueId: deck[0].id,
          vote: 'like',
        });
      expect(resBearer.status).toBe(200);
      expect(resBearer.body.success).toBe(true);

      // 2. x-participant-secret header
      const resSecret = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-participant-secret', host.sessionToken)
        .send({
          participantId: host.id,
          venueId: deck[1].id,
          vote: 'pass',
        });
      expect(resSecret.status).toBe(200);
      expect(resSecret.body.success).toBe(true);

      // 3. Body fallback
      const resBody = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .send({
          participantId: host.id,
          sessionToken: host.sessionToken,
          venueId: deck[2].id,
          vote: 'superlike',
        });
      expect(resBody.status).toBe(200);
      expect(resBody.body.success).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 3: Edge Case Room Topologies
  // =========================================================================
  describe('Suite 3: Edge Case Room Topologies', () => {
    it('Handles 0-participant room safely when sole host departs', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'LeavingHost' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;
      const hostToken = createRes.body.sessionToken;

      // Sole host leaves
      await request(app)
        .post(`/api/rooms/${code}/leave`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });

      // Verify room has 0 participants
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.status).toBe(200);
      expect(roomRes.body.room.participantCount).toBe(0);

      // Attempting to start voting on 0-participant room must fail
      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });
      expect(startRes.status).toBe(403);

      // Attempting to vote on 0-participant room must fail
      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostToken)
        .send({
          participantId: hostId,
          venueId: 'venue-001',
          vote: 'like',
        });
      expect(voteRes.status).toBe(400); // voting has not started or participant not found
    });

    it('Solo 1-participant room: instant unanimous match on first like or superlike, no match on pass', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(1);
      const soloHost = participants[0];
      expect(participants.length).toBe(1);

      // 1. Solo host passes on first venue: NO match, progress increments
      const passRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', soloHost.sessionToken)
        .send({
          participantId: soloHost.id,
          venueId: deck[0].id,
          vote: 'pass',
        });

      expect(passRes.status).toBe(200);
      expect(passRes.body.isMatch).toBe(false);
      expect(passRes.body.matchedVenue).toBeNull();
      expect(passRes.body.progress.swipedCount).toBe(1);

      // Check room status remains voting
      const roomMidRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomMidRes.body.room.status).toBe('voting');

      // 2. Solo host likes second venue: INSTANT UNANIMOUS MATCH (100% agreement of active roster)
      const likeRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', soloHost.sessionToken)
        .send({
          participantId: soloHost.id,
          venueId: deck[1].id,
          vote: 'like',
        });

      expect(likeRes.status).toBe(200);
      expect(likeRes.body.isMatch).toBe(true);
      expect(likeRes.body.matchedVenue.id).toBe(deck[1].id);
      expect(likeRes.body.match.isUnanimous).toBe(true);
      expect(likeRes.body.match.participants.length).toBe(1);
      expect(likeRes.body.match.participants[0].id).toBe(soloHost.id);

      // Check room status transitioned to matched
      const roomMatchRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomMatchRes.body.room.status).toBe('matched');
      expect(roomMatchRes.body.room.matchedVenueId).toBe(deck[1].id);
    });

    it('Solo 1-participant room: instant match on first superlike', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(1);
      const soloHost = participants[0];

      const superlikeRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', soloHost.sessionToken)
        .send({
          participantId: soloHost.id,
          venueId: deck[0].id,
          vote: 'superlike',
        });

      expect(superlikeRes.status).toBe(200);
      expect(superlikeRes.body.isMatch).toBe(true);
      expect(superlikeRes.body.matchedVenue.id).toBe(deck[0].id);
      expect(superlikeRes.body.match.isUnanimous).toBe(true);
    });

    it('Large rooms (14 participants): unanimous match requires 100% agreement, 13/14 likes does NOT match', async () => {
      const participantCount = 14;
      const { code, participants, deck } = await setupActiveVotingRoom(participantCount);
      expect(participants.length).toBe(14);

      const targetVenueId = deck[0].id;

      // First 13 participants vote 'like' on targetVenueId
      for (let i = 0; i < 13; i++) {
        const p = participants[i];
        const res = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', p.sessionToken)
          .send({
            participantId: p.id,
            venueId: targetVenueId,
            vote: 'like',
          });

        expect(res.status).toBe(200);
        expect(res.body.isMatch).toBe(false); // MUST NOT match prematurely
        expect(res.body.matchedVenue).toBeNull();
      }

      // Check room status is still 'voting'
      const roomVotingRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomVotingRes.body.room.status).toBe('voting');

      // 14th participant votes 'pass' -> Fails unanimous consensus
      const p14 = participants[13];
      const passRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', p14.sessionToken)
        .send({
          participantId: p14.id,
          venueId: targetVenueId,
          vote: 'pass',
        });

      expect(passRes.status).toBe(200);
      expect(passRes.body.isMatch).toBe(false);
      expect(passRes.body.matchedVenue).toBeNull();

      // Now all 14 vote 'like' on venue 2
      const venue2Id = deck[1].id;
      for (let i = 0; i < 13; i++) {
        const p = participants[i];
        const res = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', p.sessionToken)
          .send({
            participantId: p.id,
            venueId: venue2Id,
            vote: 'like',
          });
        expect(res.body.isMatch).toBe(false);
      }

      // The 14th participant also votes 'like' -> INSTANT UNANIMOUS MATCH
      const finalRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', p14.sessionToken)
        .send({
          participantId: p14.id,
          venueId: venue2Id,
          vote: 'like',
        });

      expect(finalRes.status).toBe(200);
      expect(finalRes.body.isMatch).toBe(true);
      expect(finalRes.body.matchedVenue.id).toBe(venue2Id);
      expect(finalRes.body.match.isUnanimous).toBe(true);
      expect(finalRes.body.match.participants.length).toBe(14);
    });

    it('validates deck size sanitization: 0 defaults to 12, negative deckSize clamped to 1, oversized capped at 25', async () => {
      // 1. deckSize: 0 -> Falsy, so `Number(0) || CONFIG.DEFAULT_DECK_SIZE` defaults to 12
      const res0 = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'ZeroDeckHost',
          deckSize: 0,
        });
      const code0 = res0.body.room.code;
      const host0Token = res0.body.sessionToken;
      const host0Id = res0.body.participant.id;

      const startRes0 = await request(app)
        .post(`/api/rooms/${code0}/start`)
        .set('x-session-token', host0Token)
        .send({ participantId: host0Id });

      expect(startRes0.status).toBe(200);
      expect(startRes0.body.deck.length).toBe(12);

      // 2. deckSize: -10 -> Sanitized and clamped to 1
      const resNeg = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'NegDeckHost',
          deckSize: -10,
        });
      const codeNeg = resNeg.body.room.code;
      const hostNegToken = resNeg.body.sessionToken;
      const hostNegId = resNeg.body.participant.id;

      const startResNeg = await request(app)
        .post(`/api/rooms/${codeNeg}/start`)
        .set('x-session-token', hostNegToken)
        .send({ participantId: hostNegId });

      expect(startResNeg.status).toBe(200);
      // Remediated: negative deckSize is sanitized and clamped to minimum 1 card
      expect(startResNeg.body.deck.length).toBe(1);
      expect(startResNeg.body.deck[0].isPromoted).toBe(true);

      // 3. Oversized deckSize: 100 -> capped at available catalog size without duplicate cards
      const resHuge = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'HugeDeckHost',
          deckSize: 100,
        });
      const codeHuge = resHuge.body.room.code;
      const startResHuge = await request(app)
        .post(`/api/rooms/${codeHuge}/start`)
        .set('x-session-token', resHuge.body.sessionToken)
        .send({ participantId: resHuge.body.participant.id });

      expect(startResHuge.status).toBe(200);
      const hugeDeck = startResHuge.body.deck;
      const uniqueIds = new Set(hugeDeck.map(v => v.id));
      expect(uniqueIds.size).toBe(hugeDeck.length);
      expect(hugeDeck.length).toBe(25); // Total curated catalog size
    });

    it('guarantees promoted card placement within top min(3, deckSize) cards across categories and deck sizes', async () => {
      // 1. In activities category: promoted card is guaranteed in top 3
      const resActivities = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'ActivitiesHost',
          activityCategory: 'activities',
          distance: 0.0001, // Hyper-restrictive
        });
      const codeAct = resActivities.body.room.code;
      const startAct = await request(app)
        .post(`/api/rooms/${codeAct}/start`)
        .set('x-session-token', resActivities.body.sessionToken)
        .send({ participantId: resActivities.body.participant.id });

      expect(startAct.status).toBe(200);
      const actDeck = startAct.body.deck;
      expect(actDeck.length).toBeGreaterThanOrEqual(4);
      expect(actDeck.some(v => v.isPromoted)).toBe(true);
      const actPromotedIdx = actDeck.findIndex(v => v.isPromoted);
      expect(actPromotedIdx).toBeLessThan(3);
      expect(actPromotedIdx).toBe(2);

      // 2. In dining category: promoted venue-sp-002 repositioned to index 2 (top 3)
      const resDining = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'DiningHost',
          activityCategory: 'dining',
          distance: 0.0001,
        });
      const codeDin = resDining.body.room.code;
      const startDin = await request(app)
        .post(`/api/rooms/${codeDin}/start`)
        .set('x-session-token', resDining.body.sessionToken)
        .send({ participantId: resDining.body.participant.id });

      expect(startDin.status).toBe(200);
      const dinDeck = startDin.body.deck;
      expect(dinDeck.length).toBeGreaterThanOrEqual(4);
      const dinPromotedIdx = dinDeck.findIndex(v => v.isPromoted);
      expect(dinPromotedIdx).toBeLessThan(3);
      expect(dinPromotedIdx).toBe(2);

      // 3. Small deck (deckSize: 3): guaranteed promoted card in top 3
      const resSmall = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'SmallDeckHost',
          activityCategory: 'dining',
          deckSize: 3,
        });
      const codeSmall = resSmall.body.room.code;
      const startSmall = await request(app)
        .post(`/api/rooms/${codeSmall}/start`)
        .set('x-session-token', resSmall.body.sessionToken)
        .send({ participantId: resSmall.body.participant.id });

      expect(startSmall.status).toBe(200);
      const smallDeck = startSmall.body.deck;
      expect(smallDeck.length).toBe(3);
      const smallHasPromoted = smallDeck.some(v => v.isPromoted);
      expect(smallHasPromoted).toBe(true);
      const smallPromotedIdx = smallDeck.findIndex(v => v.isPromoted);
      expect(smallPromotedIdx).toBeLessThan(3);
    });

    it('Concurrent voting stress: multiple participants voting simultaneously on diverse venues', async () => {
      const { code, participants, deck } = await setupActiveVotingRoom(4);

      // All 4 participants vote concurrently on card 0 with mixed votes
      const votePromises = participants.map((p, idx) => {
        const voteType = idx === 0 ? 'like' : (idx === 1 ? 'pass' : 'superlike');
        return request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', p.sessionToken)
          .send({
            participantId: p.id,
            venueId: deck[0].id,
            vote: voteType,
          });
      });

      const results = await Promise.all(votePromises);
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      // Check results endpoint accurately tallies votes
      const resultsRes = await request(app).get(`/api/rooms/${code}/results`);
      expect(resultsRes.status).toBe(200);
      const venue0Result = resultsRes.body.leaderboard.find(item => item.venueId === deck[0].id);
      expect(venue0Result).toBeDefined();
      expect(venue0Result.likeCount).toBe(1);
      expect(venue0Result.passCount).toBe(1);
      expect(venue0Result.superlikeCount).toBe(2);
      expect(venue0Result.approvals).toBe(3);
    });
  });
});
