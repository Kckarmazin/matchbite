import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../../server/models/RoomCode.js';

describe('R1: Room & Session Management Engine', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  describe('Room Code Generation & Validation', () => {
    it('generates phonetic room codes matching convention (prefix + digits)', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateRoomCode();
        expect(code).toMatch(/^[A-Z]{3,8}[0-9]{2,4}$/);
        expect(isValidRoomCode(code)).toBe(true);
      }
    });

    it('avoids collisions when existing codes are passed', () => {
      const existing = new Set(['TACO42', 'BAR19', 'BREW88']);
      const code = generateRoomCode(existing);
      expect(existing.has(code)).toBe(false);
    });

    it('normalizes room codes to uppercase and trimmed format', () => {
      expect(normalizeRoomCode('  taco42  ')).toBe('TACO42');
      expect(normalizeRoomCode('pizza99')).toBe('PIZZA99');
      expect(normalizeRoomCode('')).toBe('');
      expect(normalizeRoomCode(null)).toBe('');
    });
  });

  describe('POST /api/rooms — Room Creation', () => {
    it('creates a new room with short code, host participant, and join URL', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'Sarah',
          hostAvatar: '🍕',
          groupType: 'couples',
          activityCategory: 'dining',
          priceRange: [2, 3],
          distance: 'walkable',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.room).toBeDefined();
      expect(res.body.room.code).toMatch(/^[A-Z]{3,8}[0-9]{2,4}$/);
      expect(res.body.room.status).toBe('lobby');
      expect(res.body.room.participantCount).toBe(1);

      expect(res.body.participant).toBeDefined();
      expect(res.body.participant.name).toBe('Sarah');
      expect(res.body.participant.avatar).toBe('🍕');
      expect(res.body.participant.isHost).toBe(true);

      expect(res.body.joinUrl).toContain(res.body.room.code);
    });

    it('applies default settings if optional parameters are omitted', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'Jake' });

      expect(res.status).toBe(201);
      expect(res.body.room.settings.groupType).toBe('friends');
      expect(res.body.room.settings.activityCategory).toBe('dining');
      expect(res.body.room.settings.distance).toBe('walkable');
      expect(res.body.room.settings.priceRange).toEqual([1, 2, 3]);
    });

    it('rejects room creation with 400 when hostName is missing or whitespace', async () => {
      const res1 = await request(app)
        .post('/api/rooms')
        .send({});

      expect(res1.status).toBe(400);
      expect(res1.body.success).toBe(false);
      expect(res1.body.error).toContain('hostName is required');

      const res2 = await request(app)
        .post('/api/rooms')
        .send({ hostName: '   ' });

      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
    });
  });

  describe('GET /api/rooms/:code — Retrieve Room Details', () => {
    it('retrieves public room state with participant roster', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'Elena', hostAvatar: '🍣' });

      const code = createRes.body.room.code;

      const getRes = await request(app)
        .get(`/api/rooms/${code}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.success).toBe(true);
      expect(getRes.body.room.code).toBe(code);
      expect(getRes.body.room.participants).toHaveLength(1);
      expect(getRes.body.room.participants[0].name).toBe('Elena');
    });

    it('supports case-insensitive room code lookup', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'Marcus' });

      const code = createRes.body.room.code;
      const lowerCode = code.toLowerCase();

      const getRes = await request(app)
        .get(`/api/rooms/${lowerCode}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.room.code).toBe(code);
    });

    it('returns 404 when room code does not exist', async () => {
      const res = await request(app)
        .get('/api/rooms/NONEXIST99');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('POST /api/rooms/:code/join — Zero-Friction Joining', () => {
    it('allows guests to join a room with custom nickname and avatar', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;

      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({
          name: 'GuestUser',
          avatar: '🍹',
        });

      expect(joinRes.status).toBe(200);
      expect(joinRes.body.success).toBe(true);
      expect(joinRes.body.participant.name).toBe('GuestUser');
      expect(joinRes.body.participant.avatar).toBe('🍹');
      expect(joinRes.body.participant.isHost).toBe(false);
      expect(joinRes.body.room.participantCount).toBe(2);
    });

    it('handles idempotent re-joining with existing participantId without duplicating roster', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;

      // First join
      const join1 = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'Taylor', avatar: '🥨' });
      const pId = join1.body.participant.id;
      const token = join1.body.sessionToken;
      expect(join1.body.room.participantCount).toBe(2);

      // Re-join with same ID (e.g. browser refresh)
      const join2 = await request(app)
        .post(`/api/rooms/${code}/join`)
        .set('x-session-token', token)
        .send({ participantId: pId, name: 'Taylor Updated', avatar: '🥨' });

      expect(join2.status).toBe(200);
      expect(join2.body.participant.id).toBe(pId);
      expect(join2.body.participant.name).toBe('Taylor Updated');
      expect(join2.body.room.participantCount).toBe(2);
    });

    it('returns 400 when participant name is missing', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;

      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: '' });

      expect(joinRes.status).toBe(400);
      expect(joinRes.body.success).toBe(false);
      expect(joinRes.body.error).toContain('name is required');
    });

    it('returns 404 when joining non-existent room', async () => {
      const joinRes = await request(app)
        .post('/api/rooms/FAKE123/join')
        .send({ name: 'Guest' });

      expect(joinRes.status).toBe(404);
      expect(joinRes.body.success).toBe(false);
    });
  });

  describe('PATCH /api/rooms/:code/settings — Settings Mutation', () => {
    it('allows room host to update activity settings', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;
      const hostToken = createRes.body.sessionToken;

      const updateRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostToken)
        .send({
          participantId: hostId,
          settings: {
            activityCategory: 'bars',
            priceRange: [3, 4],
            distance: 'short_drive',
          },
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.settings.activityCategory).toBe('bars');
      expect(updateRes.body.settings.priceRange).toEqual([3, 4]);
      expect(updateRes.body.settings.distance).toBe('short_drive');
    });

    it('forbids non-hosts from modifying settings with 403 Forbidden', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;

      // Guest joins
      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'GuestUser' });
      const guestId = joinRes.body.participant.id;
      const guestToken = joinRes.body.sessionToken;

      const updateRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', guestToken)
        .send({
          participantId: guestId,
          settings: { activityCategory: 'bars' },
        });

      expect(updateRes.status).toBe(403);
      expect(updateRes.body.success).toBe(false);
      expect(updateRes.body.error).toContain('Only the room host');
    });

    it('returns 400 if participantId is missing from settings update request', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;

      const updateRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .send({ settings: { activityCategory: 'bars' } });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.success).toBe(false);
    });
  });

  describe('GET /api/rooms/:code/stream — Real-Time SSE Stream', () => {
    it('establishes text/event-stream connection and sends room:init event', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'StreamUser' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;
      const hostToken = createRes.body.sessionToken;

      // Open SSE connection and abort after initial chunk
      const sseRequest = request(app)
        .get(`/api/rooms/${code}/stream?participantId=${hostId}&sessionToken=${hostToken}`);

      const bufferChunks = [];
      await new Promise((resolve, reject) => {
        sseRequest
          .buffer(false)
          .parse((res, callback) => {
            res.on('data', (chunk) => {
              bufferChunks.push(chunk.toString());
              if (chunk.toString().includes('room:init')) {
                resolve();
              }
            });
            res.on('error', reject);
          })
          .end((err) => {
            if (err) reject(err);
          });
      });

      const fullOutput = bufferChunks.join('');
      expect(fullOutput).toContain('event: room:init');
      expect(fullOutput).toContain(code);
    });

    it('returns 404 for stream connection to non-existent room', async () => {
      const res = await request(app)
        .get('/api/rooms/NOTREAL/stream?participantId=p-123');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/health — Health & Telemetry', () => {
    it('returns healthy status and accurate active room count', async () => {
      const resBefore = await request(app).get('/api/health');
      expect(resBefore.status).toBe(200);
      expect(resBefore.body.success).toBe(true);
      expect(resBefore.body.activeRooms).toBe(0);

      // Create a room
      await request(app).post('/api/rooms').send({ hostName: 'HealthCheck' });

      const resAfter = await request(app).get('/api/health');
      expect(resAfter.status).toBe(200);
      expect(resAfter.body.activeRooms).toBe(1);
    });
  });

  describe('POST /api/rooms/:code/leave — Participant Leave', () => {
    it('removes participant and reassigns host if host leaves', async () => {
      const createRes = await request(app).post('/api/rooms').send({ hostName: 'Host' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;
      const hostToken = createRes.body.sessionToken;

      const joinRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'Guest' });
      const guestId = joinRes.body.participant.id;

      // Host leaves with valid session token
      const leaveRes = await request(app)
        .post(`/api/rooms/${code}/leave`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });

      expect(leaveRes.status).toBe(200);
      expect(leaveRes.body.success).toBe(true);

      // Inspect updated room
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.participantCount).toBe(1);
      expect(roomRes.body.room.participants[0].id).toBe(guestId);
      expect(roomRes.body.room.participants[0].isHost).toBe(true);
    });
  });

  describe('Security & Access Control: Adversarial Privilege Escalation Resistance', () => {
    it('rejects settings mutation attempts using leaked public hostId without valid secret token (401/403)', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'LegitHost' });
      const code = createRes.body.room.code;

      // Attacker queries public room endpoint
      const publicRes = await request(app).get(`/api/rooms/${code}`);
      const leakedHostId = publicRes.body.room.hostId;

      // Exploit attempt without token
      const exploitRes1 = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .send({
          participantId: leakedHostId,
          settings: { activityCategory: 'hijacked_category', priceRange: [4] },
        });

      expect([401, 403]).toContain(exploitRes1.status);
      expect(exploitRes1.body.success).toBe(false);

      // Exploit attempt with forged/fake token
      const exploitRes2 = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', 'st-forged-token-999')
        .send({
          participantId: leakedHostId,
          settings: { activityCategory: 'hijacked_category' },
        });

      expect([401, 403]).toContain(exploitRes2.status);

      // Verify settings were untouched
      const verifyRes = await request(app).get(`/api/rooms/${code}`);
      expect(verifyRes.body.room.settings.activityCategory).toBe('dining');
    });

    it('rejects settings mutation when a legitimate guest attempts to modify settings using host ID', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;

      // Guest joins legitimately and obtains a valid guest session token
      const guestJoinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'SneakyGuest' });
      const guestToken = guestJoinRes.body.sessionToken;

      // Guest attempts to update settings passing hostId with their guest token
      const exploitRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', guestToken)
        .send({
          participantId: hostId,
          settings: { activityCategory: 'bars' },
        });

      expect([401, 403]).toContain(exploitRes.status);
      expect(exploitRes.body.success).toBe(false);
    });

    it('allows genuine host with valid secret session token to update settings', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'RealHost' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;
      const hostToken = createRes.body.sessionToken;

      const updateRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostToken)
        .send({
          participantId: hostId,
          settings: {
            activityCategory: 'bars',
            distance: 'short_drive',
            priceRange: [2, 3],
          },
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.settings.activityCategory).toBe('bars');
      expect(updateRes.body.settings.distance).toBe('short_drive');

      const verifyRes = await request(app).get(`/api/rooms/${code}`);
      expect(verifyRes.body.room.settings.activityCategory).toBe('bars');
    });

    it('allows genuine host with valid hostKey in header or body to update settings', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostKeyUser' });
      const code = createRes.body.room.code;
      const hostKey = createRes.body.hostKey;

      // Update via x-host-key header
      const updateRes1 = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-host-key', hostKey)
        .send({
          settings: { activityCategory: 'entertainment' },
        });

      expect(updateRes1.status).toBe(200);
      expect(updateRes1.body.settings.activityCategory).toBe('entertainment');

      // Update via body hostKey
      const updateRes2 = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .send({
          hostKey,
          settings: { activityCategory: 'bars' },
        });

      expect(updateRes2.status).toBe(200);
      expect(updateRes2.body.settings.activityCategory).toBe('bars');
    });

    it('rejects attempts to impersonate or overwrite host identity via POST /join without secret token', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'OriginalHost', hostAvatar: '🍕' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;

      // Attacker attempts to hijack host slot via POST /join
      const exploitRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({
          participantId: hostId,
          name: 'ImposterHost',
          avatar: '😈',
        });

      // Server must reject (401/403) OR mint a brand new guest ID without mutating the host
      if (exploitRes.status === 200) {
        expect(exploitRes.body.participant.id).not.toBe(hostId);
        expect(exploitRes.body.participant.isHost).toBe(false);
      } else {
        expect([401, 403]).toContain(exploitRes.status);
      }

      // Verify original host profile is completely untouched
      const verifyRes = await request(app).get(`/api/rooms/${code}`);
      const hostInRoster = verifyRes.body.room.participants.find((p) => p.id === hostId);
      expect(hostInRoster.name).toBe('OriginalHost');
      expect(hostInRoster.avatar).toBe('🍕');
      expect(hostInRoster.isHost).toBe(true);
    });

    it('allows legitimate participant to reclaim profile and update nickname via POST /join with matching token', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'Host' });
      const code = createRes.body.room.code;

      const join1 = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'Alex', avatar: '☕' });
      const pId = join1.body.participant.id;
      const token = join1.body.sessionToken;

      const join2 = await request(app)
        .post(`/api/rooms/${code}/join`)
        .set('x-session-token', token)
        .send({
          participantId: pId,
          name: 'Alex The Great',
          avatar: '☕',
        });

      expect(join2.status).toBe(200);
      expect(join2.body.participant.id).toBe(pId);
      expect(join2.body.participant.name).toBe('Alex The Great');

      // Confirm participant count did not duplicate
      const verifyRes = await request(app).get(`/api/rooms/${code}`);
      expect(verifyRes.body.room.participantCount).toBe(2);
    });

    it('rejects host eviction and takeover attempts via POST /leave using leaked hostId without secret token', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'ProtectedHost' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;

      // Attacker joins as guest
      const guestRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'AttackerGuest' });
      const attackerId = guestRes.body.participant.id;
      const attackerToken = guestRes.body.sessionToken;

      // Attacker attempts to evict the host without token
      const exploit1 = await request(app)
        .post(`/api/rooms/${code}/leave`)
        .send({ participantId: hostId });
      expect([401, 403]).toContain(exploit1.status);

      // Attacker attempts to evict the host using attacker's own token
      const exploit2 = await request(app)
        .post(`/api/rooms/${code}/leave`)
        .set('x-session-token', attackerToken)
        .send({ participantId: hostId });
      expect([401, 403]).toContain(exploit2.status);

      // Assert host was NOT evicted and attacker was NOT promoted
      const verifyRes = await request(app).get(`/api/rooms/${code}`);
      expect(verifyRes.body.room.participantCount).toBe(2);
      expect(verifyRes.body.room.hostId).toBe(hostId);
      const hostEntry = verifyRes.body.room.participants.find((p) => p.id === hostId);
      expect(hostEntry).toBeDefined();
      expect(hostEntry.isHost).toBe(true);
      const attackerEntry = verifyRes.body.room.participants.find((p) => p.id === attackerId);
      expect(attackerEntry.isHost).toBe(false);
    });

    it('forbids participants from evicting other participants via POST /leave', async () => {
      const createRes = await request(app).post('/api/rooms').send({ hostName: 'Host' });
      const code = createRes.body.room.code;

      const guestA = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'GuestA' });
      const guestB = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'GuestB' });

      // Guest B attempts to kick Guest A using Guest B's token
      const kickRes = await request(app)
        .post(`/api/rooms/${code}/leave`)
        .set('x-session-token', guestB.body.sessionToken)
        .send({ participantId: guestA.body.participant.id });

      expect([401, 403]).toContain(kickRes.status);

      const verifyRes = await request(app).get(`/api/rooms/${code}`);
      expect(verifyRes.body.room.participantCount).toBe(3);
    });

    it('transfers host capability key when host departs legitimately', async () => {
      const createRes = await request(app).post('/api/rooms').send({ hostName: 'DepartingHost' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;
      const hostToken = createRes.body.sessionToken;

      const guestRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'SuccessorGuest' });
      const guestId = guestRes.body.participant.id;
      const guestToken = guestRes.body.sessionToken;

      // Host leaves with hostToken
      const leaveRes = await request(app)
        .post(`/api/rooms/${code}/leave`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });
      expect(leaveRes.status).toBe(200);

      // Verify guest is promoted to host
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.hostId).toBe(guestId);

      // Promoted host can update settings using their session token
      const updateRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', guestToken)
        .send({
          participantId: guestId,
          settings: { distance: 'short_drive' },
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.settings.distance).toBe('short_drive');
    });

    it('ensures GET /api/rooms/:code never exposes capability tokens or secrets in public payload', async () => {
      const createRes = await request(app).post('/api/rooms').send({ hostName: 'AuditHost' });
      const code = createRes.body.room.code;
      await request(app).post(`/api/rooms/${code}/join`).send({ name: 'AuditGuest' });

      const publicRes = await request(app).get(`/api/rooms/${code}`);
      expect(publicRes.status).toBe(200);

      const room = publicRes.body.room;
      expect(room.hostKey).toBeUndefined();
      expect(room.sessionToken).toBeUndefined();
      expect(room.sessionTokens).toBeUndefined();
      expect(room.secret).toBeUndefined();

      for (const p of room.participants) {
        expect(p.sessionToken).toBeUndefined();
        expect(p.hostKey).toBeUndefined();
        expect(p.secret).toBeUndefined();
        expect(p.token).toBeUndefined();
      }
    });
  });
});
