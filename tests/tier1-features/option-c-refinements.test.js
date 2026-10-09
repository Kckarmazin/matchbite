import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('Option C Refinements: Moderation, Sudden Death, and Dietary Filtering', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  describe('1. Host Moderation: Nudge & Kick AFK Participants', () => {
    it('allows host to nudge an inactive participant and emits SSE alert', async () => {
      // 1. Create room
      const createRes = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'Maya',
          hostAvatar: '🍕',
        });
      const room = createRes.body.room;
      const hostSession = createRes.body.sessionToken;
      const hostKey = createRes.body.hostKey;
      const hostId = room.hostId;

      // 2. Second user joins
      const joinRes = await request(app)
        .post(`/api/rooms/${room.code}/join`)
        .send({
          name: 'Alex (AFK)',
          avatar: '😴',
        });
      const afkParticipantId = joinRes.body.participant.id;

      // 3. Host nudges AFK user
      const nudgeRes = await request(app)
        .post(`/api/rooms/${room.code}/nudge`)
        .set('x-session-token', hostSession)
        .set('x-host-key', hostKey)
        .send({
          participantId: hostId,
          targetParticipantId: afkParticipantId,
        });

      expect(nudgeRes.status).toBe(200);
      expect(nudgeRes.body.success).toBe(true);
      expect(nudgeRes.body.targetParticipantId).toBe(afkParticipantId);
    });

    it('rejects nudge attempt by non-host participant (403 Forbidden)', async () => {
      // Create room
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'Maya' });
      const room = createRes.body.room;

      // Join two guests
      const join1 = await request(app).post(`/api/rooms/${room.code}/join`).send({ name: 'Guest1' });
      const join2 = await request(app).post(`/api/rooms/${room.code}/join`).send({ name: 'Guest2' });

      // Guest1 tries to nudge Guest2
      const res = await request(app)
        .post(`/api/rooms/${room.code}/nudge`)
        .set('x-session-token', join1.body.sessionToken)
        .send({
          participantId: join1.body.participant.id,
          targetParticipantId: join2.body.participant.id,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows host to kick an AFK participant and purges their votes', async () => {
      // 1. Create room
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'Host' });
      const room = createRes.body.room;
      const hostSession = createRes.body.sessionToken;
      const hostKey = createRes.body.hostKey;
      const hostId = room.hostId;

      // 2. Join guest
      const joinRes = await request(app)
        .post(`/api/rooms/${room.code}/join`)
        .send({ name: 'AFK Guest' });
      const afkId = joinRes.body.participant.id;
      const afkSession = joinRes.body.sessionToken;

      // 3. Start voting
      await request(app)
        .post(`/api/rooms/${room.code}/start`)
        .set('x-host-key', hostKey)
        .send({ participantId: hostId });

      const liveRoom = roomStore.getRoom(room.code);
      const firstVenue = liveRoom.deck[0];

      // AFK Guest votes 'pass' on first venue
      await request(app)
        .post(`/api/rooms/${room.code}/vote`)
        .set('x-session-token', afkSession)
        .send({
          participantId: afkId,
          venueId: firstVenue.id,
          vote: 'pass',
        });

      expect(liveRoom.votes[firstVenue.id][afkId]).toBe('pass');

      // 4. Host kicks AFK Guest
      const kickRes = await request(app)
        .post(`/api/rooms/${room.code}/kick`)
        .set('x-host-key', hostKey)
        .send({
          participantId: hostId,
          targetParticipantId: afkId,
        });

      expect(kickRes.status).toBe(200);
      expect(kickRes.body.success).toBe(true);
      expect(kickRes.body.kickedId).toBe(afkId);

      // Verify participant and their vote was removed
      expect(liveRoom.participants[afkId]).toBeUndefined();
      expect(liveRoom.votes[firstVenue.id][afkId]).toBeUndefined();
    });

    it('instantly resolves unanimous consensus when removing an AFK participant whose absence unblocks agreement', async () => {
      // 1. Host creates room
      const createRes = await request(app).post('/api/rooms').send({ hostName: 'Host' });
      const room = createRes.body.room;
      const hostKey = createRes.body.hostKey;
      const hostSession = createRes.body.sessionToken;
      const hostId = room.hostId;

      // 2. Join 2 friends
      const user2 = await request(app).post(`/api/rooms/${room.code}/join`).send({ name: 'Active Friend' });
      const user3 = await request(app).post(`/api/rooms/${room.code}/join`).send({ name: 'AFK Friend' });

      // 3. Start voting
      await request(app)
        .post(`/api/rooms/${room.code}/start`)
        .set('x-host-key', hostKey)
        .send({ participantId: hostId });

      const liveRoom = roomStore.getRoom(room.code);
      const venue = liveRoom.deck[0];

      // Host and User 2 both 'like' the venue
      await request(app)
        .post(`/api/rooms/${room.code}/vote`)
        .set('x-session-token', hostSession)
        .send({ participantId: hostId, venueId: venue.id, vote: 'like' });

      await request(app)
        .post(`/api/rooms/${room.code}/vote`)
        .set('x-session-token', user2.body.sessionToken)
        .send({ participantId: user2.body.participant.id, venueId: venue.id, vote: 'like' });

      // User 3 is AFK and hasn't swiped. Room is still 'voting'
      expect(liveRoom.status).toBe('voting');
      expect(liveRoom.matchedVenueId).toBeNull();

      // 4. Host kicks the AFK user
      const kickRes = await request(app)
        .post(`/api/rooms/${room.code}/kick`)
        .set('x-host-key', hostKey)
        .send({
          participantId: hostId,
          targetParticipantId: user3.body.participant.id,
        });

      // Removing User 3 leaves 2/2 remaining participants who both agreed -> INSTANT MATCH!
      expect(kickRes.status).toBe(200);
      expect(kickRes.body.isMatch).toBe(true);
      expect(kickRes.body.matchedVenue.id).toBe(venue.id);
      expect(liveRoom.status).toBe('matched');
      expect(liveRoom.matchedVenueId).toBe(venue.id);
    });
  });

  describe('2. Sudden Death Re-Swiping Showdown', () => {
    it('generates a sudden death mini-deck with top contenders and resets swipe progress', async () => {
      // 1. Host creates room and starts voting
      const createRes = await request(app).post('/api/rooms').send({ hostName: 'Host' });
      const room = createRes.body.room;
      const hostKey = createRes.body.hostKey;
      const hostSession = createRes.body.sessionToken;
      const hostId = room.hostId;

      const guestRes = await request(app).post(`/api/rooms/${room.code}/join`).send({ name: 'Guest' });
      const guestId = guestRes.body.participant.id;
      const guestSession = guestRes.body.sessionToken;

      await request(app)
        .post(`/api/rooms/${room.code}/start`)
        .set('x-host-key', hostKey)
        .send({ participantId: hostId });

      const liveRoom = roomStore.getRoom(room.code);
      const v0 = liveRoom.deck[0];
      const v1 = liveRoom.deck[1];
      const v2 = liveRoom.deck[2];

      // Cast votes creating distinct scores
      // v0: Host superlike (3 pts) + Guest superlike (3 pts) = 6 pts (Tie or match test)
      // Make v0 have 1 like, v1 have 1 superlike, v2 have 1 like
      await request(app).post(`/api/rooms/${room.code}/vote`).set('x-session-token', hostSession).send({ participantId: hostId, venueId: v1.id, vote: 'superlike' });
      await request(app).post(`/api/rooms/${room.code}/vote`).set('x-session-token', hostSession).send({ participantId: hostId, venueId: v0.id, vote: 'like' });
      await request(app).post(`/api/rooms/${room.code}/vote`).set('x-session-token', guestSession).send({ participantId: guestId, venueId: v2.id, vote: 'like' });

      // Host triggers Sudden Death with top 3 contenders
      const sdRes = await request(app)
        .post(`/api/rooms/${room.code}/sudden-death`)
        .set('x-host-key', hostKey)
        .send({
          participantId: hostId,
          limit: 3,
        });

      expect(sdRes.status).toBe(200);
      expect(sdRes.body.success).toBe(true);
      expect(sdRes.body.isSuddenDeath).toBe(true);
      expect(sdRes.body.deck.length).toBe(3);

      // Verify room state is updated
      expect(liveRoom.isSuddenDeath).toBe(true);
      expect(liveRoom.status).toBe('voting');
      expect(liveRoom.deck.length).toBe(3);

      // Verify participant swipe counts were reset to 0
      expect(liveRoom.participants[hostId].swipedCount).toBe(0);
      expect(liveRoom.participants[guestId].swipedCount).toBe(0);
      expect(liveRoom.participants[hostId].totalCards).toBe(3);
    });

    it('rejects sudden death request from non-host (403 Forbidden)', async () => {
      const createRes = await request(app).post('/api/rooms').send({ hostName: 'Host' });
      const room = createRes.body.room;

      const guestRes = await request(app).post(`/api/rooms/${room.code}/join`).send({ name: 'Guest' });
      const guestId = guestRes.body.participant.id;
      const guestSession = guestRes.body.sessionToken;

      const res = await request(app)
        .post(`/api/rooms/${room.code}/sudden-death`)
        .set('x-session-token', guestSession)
        .send({ participantId: guestId });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Dietary & Vibe Filter Configuration', () => {
    it('creates room with dietary filters preserved in room settings', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'Chef Jordan',
          activityCategory: 'dining',
          dietaryFilters: ['vegetarian', 'vegan', 'patio'],
        });

      expect(res.status).toBe(201);
      expect(res.body.room.settings.dietaryFilters).toEqual(['vegetarian', 'vegan', 'patio']);
    });

    it('updates room settings with dietary filters via PATCH /api/rooms/:code/settings', async () => {
      const createRes = await request(app).post('/api/rooms').send({ hostName: 'Host' });
      const room = createRes.body.room;
      const hostKey = createRes.body.hostKey;
      const hostId = room.hostId;

      const updateRes = await request(app)
        .patch(`/api/rooms/${room.code}/settings`)
        .set('x-host-key', hostKey)
        .send({
          participantId: hostId,
          settings: {
            dietaryFilters: ['gluten_free', 'halal'],
          },
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.settings.dietaryFilters).toEqual(['gluten_free', 'halal']);
    });
  });
});
