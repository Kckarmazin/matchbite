import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  PREFIXES,
} from '../../server/models/RoomCode.js';

describe('Milestone 1 Empirical Challenge: Stress, Concurrency & Boundary Suites', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  // =========================================================================
  // SUITE 1: Room Code Generation & Collision Resistance
  // =========================================================================
  describe('Suite 1: Room Code Generation, Oracles & Collision Resistance', () => {
    it('Oracle: validates 1,000 generated codes against regex ^[A-Z]{3,8}[0-9]{2,4}$', () => {
      const regex = /^[A-Z]{3,8}[0-9]{2,4}$/;
      for (let i = 0; i < 1000; i++) {
        const code = generateRoomCode();
        expect(code).toMatch(regex);
        expect(isValidRoomCode(code)).toBe(true);
      }
    });

    it('Oracle: comprehensive boundary & hostile input validation for isValidRoomCode', () => {
      // Valid codes
      expect(isValidRoomCode('TACO42')).toBe(true);
      expect(isValidRoomCode('BAR19')).toBe(true);
      expect(isValidRoomCode('PIZZA99')).toBe(true);
      expect(isValidRoomCode('ROOM1000')).toBe(true);
      expect(isValidRoomCode('RAMEN1234')).toBe(true);
      expect(isValidRoomCode('BISTRO9999')).toBe(true);
      expect(isValidRoomCode('ABC10')).toBe(true); // Min 3 letters, 2 digits
      expect(isValidRoomCode('ABCDEFGH1234')).toBe(true); // Max 8 letters, 4 digits

      // Lowercase & whitespace handling (trimmed & uppercased)
      expect(isValidRoomCode('  taco42  ')).toBe(true);
      expect(isValidRoomCode('brew88')).toBe(true);

      // Invalid prefixes (too short / too long)
      expect(isValidRoomCode('AB12')).toBe(false); // 2 letters
      expect(isValidRoomCode('A12')).toBe(false); // 1 letter
      expect(isValidRoomCode('TOOLONGNAME12')).toBe(false); // 11 letters
      expect(isValidRoomCode('ABCDEFGHI12')).toBe(false); // 9 letters

      // Invalid suffixes (too short / too long digits)
      expect(isValidRoomCode('TACO1')).toBe(false); // 1 digit
      expect(isValidRoomCode('TACO')).toBe(false); // 0 digits
      expect(isValidRoomCode('TACO12345')).toBe(false); // 5 digits

      // Invalid characters / symbols
      expect(isValidRoomCode('TACO-42')).toBe(false);
      expect(isValidRoomCode('TACO_42')).toBe(false);
      expect(isValidRoomCode('TACO 42')).toBe(false);
      expect(isValidRoomCode('TACO!42')).toBe(false);
      expect(isValidRoomCode('TACO#42')).toBe(false);

      // Hostile injections / non-strings
      expect(isValidRoomCode('<script>alert(1)</script>')).toBe(false);
      expect(isValidRoomCode("' OR 1=1--")).toBe(false);
      expect(isValidRoomCode('../../etc/passwd')).toBe(false);
      expect(isValidRoomCode('')).toBe(false);
      expect(isValidRoomCode('   ')).toBe(false);
      expect(isValidRoomCode(null)).toBe(false);
      expect(isValidRoomCode(undefined)).toBe(false);
      expect(isValidRoomCode(12345)).toBe(false);
      expect(isValidRoomCode({})).toBe(false);
      expect(isValidRoomCode([])).toBe(false);
      expect(isValidRoomCode(true)).toBe(false);
    });

    it('Stress: generates 1,000 unique room codes with zero collisions', () => {
      const generatedCodes = new Set();
      for (let i = 0; i < 1000; i++) {
        const code = generateRoomCode(generatedCodes);
        expect(generatedCodes.has(code)).toBe(false);
        expect(isValidRoomCode(code)).toBe(true);
        generatedCodes.add(code);
      }
      expect(generatedCodes.size).toBe(1000);
    });

    it('High-Volume Stress: generates 2,500 unique codes spanning primary and fallback pools', () => {
      // Primary pool capacity: 18 prefixes * 90 numbers = 1,620 codes.
      // Above 1,620, the algorithm must switch to the fallback ROOM1000-9999 pool.
      const generatedCodes = new Set();
      for (let i = 0; i < 2500; i++) {
        const code = generateRoomCode(generatedCodes);
        expect(generatedCodes.has(code)).toBe(false);
        expect(isValidRoomCode(code)).toBe(true);
        generatedCodes.add(code);
      }
      expect(generatedCodes.size).toBe(2500);

      // Verify that after 1,620 codes, fallback codes are generated
      const fallbackCodes = [...generatedCodes].filter(c => c.startsWith('ROOM'));
      expect(fallbackCodes.length).toBeGreaterThan(0);
      for (const fc of fallbackCodes) {
        expect(fc).toMatch(/^ROOM[0-9]{4}$/);
      }
    });

    it('Direct Store Stress: creates 500 active rooms in RoomStore without collision', () => {
      for (let i = 0; i < 500; i++) {
        const { room } = roomStore.createRoom({ hostName: `Host_${i}` });
        expect(room).toBeDefined();
        expect(isValidRoomCode(room.code)).toBe(true);
      }
      expect(roomStore.getRoomCount()).toBe(500);
      expect(roomStore.getActiveCodes().size).toBe(500);
    });

    it('HTTP Concurrency: handles 100 concurrent POST /api/rooms requests without code collision', async () => {
      const requests = Array.from({ length: 100 }, (_, i) =>
        request(app)
          .post('/api/rooms')
          .send({ hostName: `ConcurrentHost_${i}` })
      );

      const responses = await Promise.all(requests);
      const codes = new Set();

      for (let i = 0; i < responses.length; i++) {
        const res = responses[i];
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(isValidRoomCode(res.body.room.code)).toBe(true);
        expect(codes.has(res.body.room.code)).toBe(false);
        codes.add(res.body.room.code);
      }

      expect(codes.size).toBe(100);
      expect(roomStore.getRoomCount()).toBe(100);
    });
  });

  // =========================================================================
  // SUITE 2: Concurrency, Simultaneous Joins & Max Capacity
  // =========================================================================
  describe('Suite 2: Concurrency, Simultaneous Joins & Capacity Boundaries', () => {
    it('Simultaneous Joins: 29 concurrent participants join the same room without race conditions', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostAlice' });
      const code = createRes.body.room.code;

      // 29 guests join simultaneously
      const joinPromises = Array.from({ length: 29 }, (_, i) =>
        request(app)
          .post(`/api/rooms/${code}/join`)
          .send({
            name: `Guest_${i + 1}`,
            avatar: '🎉',
          })
      );

      const joinResponses = await Promise.all(joinPromises);

      for (const res of joinResponses) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      // Final room state check
      const finalRes = await request(app).get(`/api/rooms/${code}`);
      expect(finalRes.status).toBe(200);
      expect(finalRes.body.room.participantCount).toBe(30);

      // Verify all 30 participants have unique IDs
      const participantIds = finalRes.body.room.participants.map(p => p.id);
      expect(new Set(participantIds).size).toBe(30);

      // Exactly 1 host
      const hosts = finalRes.body.room.participants.filter(p => p.isHost);
      expect(hosts).toHaveLength(1);
      expect(hosts[0].name).toBe('HostAlice');
    });

    it('Capacity Boundary: rejects 31st participant when room reaches maximum capacity (30)', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostCapacity' });
      const code = createRes.body.room.code;

      // Fill room to 30 (1 host + 29 guests)
      for (let i = 0; i < 29; i++) {
        const joinRes = await request(app)
          .post(`/api/rooms/${code}/join`)
          .send({ name: `Guest_${i}` });
        expect(joinRes.status).toBe(200);
      }

      // Room is now full at 30
      const fullCheck = await request(app).get(`/api/rooms/${code}`);
      expect(fullCheck.body.room.participantCount).toBe(30);

      // Attempt to join 31st participant
      const overflowRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'OverflowGuest' });

      expect(overflowRes.status).toBe(409);
      expect(overflowRes.body.success).toBe(false);
      expect(overflowRes.body.error).toContain('maximum capacity');

      // Room count remains 30
      const postOverflowCheck = await request(app).get(`/api/rooms/${code}`);
      expect(postOverflowCheck.body.room.participantCount).toBe(30);
    });

    it('Concurrent Overflow: 10 concurrent requests at boundary correctly throttle to capacity', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostBoundary' });
      const code = createRes.body.room.code;

      // Fill up to 28 participants (1 host + 27 guests = 28)
      for (let i = 0; i < 27; i++) {
        await request(app).post(`/api/rooms/${code}/join`).send({ name: `PrepGuest_${i}` });
      }

      // Now 2 slots remain before 30. Send 10 concurrent requests.
      const batchPromises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post(`/api/rooms/${code}/join`)
          .send({ name: `BatchGuest_${i}` })
      );

      const batchResults = await Promise.all(batchPromises);
      const successCount = batchResults.filter(r => r.status === 200).length;
      const rejectedCount = batchResults.filter(r => r.status === 409).length;

      expect(successCount).toBe(2);
      expect(rejectedCount).toBe(8);

      const finalCheck = await request(app).get(`/api/rooms/${code}`);
      expect(finalCheck.body.room.participantCount).toBe(30);
    });

    it('Idempotent Re-join Concurrency: multiple simultaneous joins with same participantId do not duplicate roster', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostRejoin' });
      const code = createRes.body.room.code;

      // Join once
      const initialJoin = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'RefreshUser' });
      const pId = initialJoin.body.participant.id;
      const sessionToken = initialJoin.body.sessionToken;

      // Simulate 5 simultaneous requests with same participantId (e.g. multiple tabs / double clicks)
      const spamRequests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post(`/api/rooms/${code}/join`)
          .set('x-session-token', sessionToken)
          .send({
            participantId: pId,
            name: `RefreshUser_V${i}`,
          })
      );

      const spamResults = await Promise.all(spamRequests);
      for (const res of spamResults) {
        expect(res.status).toBe(200);
      }

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.participantCount).toBe(2); // 1 host + 1 guest
    });
  });

  // =========================================================================
  // SUITE 3: Boundary Inputs, Malformed Data & Hostile Payloads
  // =========================================================================
  describe('Suite 3: Boundary Inputs, Malformed Data & Hostile Payloads', () => {
    it('rejects malformed hostName types in POST /api/rooms', async () => {
      const malformedPayloads = [
        {},
        { hostName: '' },
        { hostName: '   ' },
        { hostName: null },
        { hostName: 12345 },
        { hostName: true },
        { hostName: ['Hacker'] },
        { hostName: { name: 'Hacker' } },
      ];

      for (const payload of malformedPayloads) {
        const res = await request(app).post('/api/rooms').send(payload);
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      }
    });

    it('rejects malformed participant name in POST /api/rooms/:code/join', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostValidation' });
      const code = createRes.body.room.code;

      const malformedNames = [
        {},
        { name: '' },
        { name: '   ' },
        { name: null },
        { name: 9999 },
        { name: false },
        { name: ['Guest'] },
        { name: { user: 'Guest' } },
      ];

      for (const payload of malformedNames) {
        const res = await request(app)
          .post(`/api/rooms/${code}/join`)
          .send(payload);
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('name is required');
      }
    });

    it('handles non-existent and special character room codes safely', async () => {
      const nonExistentCodes = [
        'NONEXIST99',
        'ROOM0000',
        'ABC',
        '12345',
        '../../etc/passwd',
        '<script>',
        "' OR 1=1--",
        '%20%20',
      ];

      for (const testCode of nonExistentCodes) {
        const getRes = await request(app).get(`/api/rooms/${encodeURIComponent(testCode)}`);
        expect([400, 404]).toContain(getRes.status);
        expect(getRes.body.success).toBe(false);

        const joinRes = await request(app)
          .post(`/api/rooms/${encodeURIComponent(testCode)}/join`)
          .send({ name: 'Guest' });
        expect([400, 404]).toContain(joinRes.status);
        expect(joinRes.body.success).toBe(false);
      }
    });

    it('safely encapsulates XSS payloads in participant names and avatars without crashing', async () => {
      const xssHostName = "<script>alert('xss-host')</script>";
      const xssGuestName = "<img src=x onerror=alert('xss-guest')>";
      const xssAvatar = '"><svg onload=alert(1)>';

      const createRes = await request(app)
        .post('/api/rooms')
        .send({
          hostName: xssHostName,
          hostAvatar: xssAvatar,
        });

      expect(createRes.status).toBe(201);
      const code = createRes.body.room.code;
      expect(createRes.body.participant.name).toBe(xssHostName);
      expect(createRes.body.participant.avatar).toBe(xssAvatar);

      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({
          name: xssGuestName,
          avatar: xssAvatar,
        });

      expect(joinRes.status).toBe(200);
      expect(joinRes.body.participant.name).toBe(xssGuestName);

      // Verify room returns valid JSON and headers
      const getRes = await request(app).get(`/api/rooms/${code}`);
      expect(getRes.status).toBe(200);
      expect(getRes.headers['content-type']).toContain('application/json');
    });

    it('prevents prototype pollution via hostile payloads', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostPollution' });
      const code = createRes.body.room.code;

      await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({
          name: 'Hacker',
          __proto__: { polluted: 'YES' },
          constructor: { prototype: { polluted: 'YES' } },
        });

      expect({}.polluted).toBeUndefined();
      expect(Object.prototype.polluted).toBeUndefined();
    });

    it('handles giant payloads (50KB strings) gracefully without hanging', async () => {
      const hugeName = 'A'.repeat(50000);
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: hugeName });

      expect(createRes.status).toBe(201);
      expect(createRes.body.room.participants[0].name.length).toBe(50000);
    });
  });

  // =========================================================================
  // SUITE 4: Settings Mutation & Host Privilege Boundaries
  // =========================================================================
  describe('Suite 4: Settings Mutation & Host Security Boundaries', () => {
    it('blocks settings mutation with non-existent participantId with 403 Forbidden', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'Host' });
      const code = createRes.body.room.code;

      const res = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .send({
          participantId: 'p-fake-non-existent-id',
          settings: { activityCategory: 'bars' },
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Only the room host');
    });

    it('blocks settings mutation when room code does not exist with 404', async () => {
      const res = await request(app)
        .patch('/api/rooms/NONEXIST99/settings')
        .send({
          participantId: 'p-123',
          settings: { activityCategory: 'bars' },
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('sanitizes settings updates by only merging whitelisted keys', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostWhitelist' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;
      const sessionToken = createRes.body.sessionToken;

      const patchRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', sessionToken)
        .send({
          participantId: hostId,
          settings: {
            activityCategory: 'entertainment',
            priceRange: [1, 2],
            maliciousField: 'exploit',
            isAdmin: true,
            status: 'closed',
          },
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.settings.activityCategory).toBe('entertainment');
      expect(patchRes.body.settings.priceRange).toEqual([1, 2]);
      expect(patchRes.body.settings.maliciousField).toBeUndefined();
      expect(patchRes.body.settings.isAdmin).toBeUndefined();

      // Verify stored room settings
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.settings.maliciousField).toBeUndefined();
      expect(roomRes.body.room.status).toBe('lobby'); // status was not mutated
    });

    it('rejects settings update when room is not in lobby status', () => {
      const { room, participant } = roomStore.createRoom({ hostName: 'HostStatus' });
      room.status = 'voting'; // Simulate game has started

      expect(() => {
        roomStore.updateSettings(room.code, participant.id, { activityCategory: 'bars' });
      }).toThrow('Settings can only be changed while in the lobby');
    });
  });

  // =========================================================================
  // SUITE 5: Participant Lifecycle & Host Reassignment
  // =========================================================================
  describe('Suite 5: Participant Lifecycle & Host Reassignment', () => {
    it('promotes next participant to host when host leaves, granting full mutation rights', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostOriginal' });
      const code = createRes.body.room.code;
      const originalHostId = createRes.body.participant.id;
      const originalHostToken = createRes.body.sessionToken;

      // Guest joins
      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'GuestPromotee' });
      const guestId = joinRes.body.participant.id;
      const guestToken = joinRes.body.sessionToken;

      // Original host leaves
      const leaveRes = await request(app)
        .post(`/api/rooms/${code}/leave`)
        .set('x-session-token', originalHostToken)
        .send({ participantId: originalHostId });
      expect(leaveRes.status).toBe(200);

      // Verify guest is now host
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.hostId).toBe(guestId);
      const promotedGuest = roomRes.body.room.participants.find(p => p.id === guestId);
      expect(promotedGuest.isHost).toBe(true);

      // Promoted host can now update settings
      const updateRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', guestToken)
        .send({
          participantId: guestId,
          settings: { distance: 'short_drive' },
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.settings.distance).toBe('short_drive');

      // Original host can NO LONGER update settings (403)
      const oldHostUpdate = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', originalHostToken)
        .send({
          participantId: originalHostId,
          settings: { distance: 'walkable' },
        });
      expect(oldHostUpdate.status).toBe(403);
    });

    it('handles participant leaving non-existent room safely with 200/false', async () => {
      const leaveRes = await request(app)
        .post('/api/rooms/NONEXIST99/leave')
        .send({ participantId: 'p-123' });
      expect(leaveRes.status).toBe(200);
    });

    it('handles leaving without participantId with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/rooms/TACO42/leave')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 6: SSE Broadcaster Concurrency & Client Management
  // =========================================================================
  describe('Suite 6: SSE Broadcaster Concurrency & Lifecycle', () => {
    it('accurately tracks client counts and closes room connections on delete', () => {
      const mockRes1 = {
        writeHead: () => {},
        write: () => {},
        end: () => {},
        on: () => {},
      };
      const mockReq1 = { on: () => {} };

      const mockRes2 = {
        writeHead: () => {},
        write: () => {},
        end: () => {},
        on: () => {},
      };
      const mockReq2 = { on: () => {} };

      broadcaster.addClient('TACO42', 'p-1', mockReq1, mockRes1);
      broadcaster.addClient('TACO42', 'p-2', mockReq2, mockRes2);

      expect(broadcaster.getClientCount('TACO42')).toBe(2);

      // Targeted message
      const delivered = broadcaster.sendTo('TACO42', 'p-1', 'custom:event', { data: 123 });
      expect(delivered).toBe(true);

      const failedDelivery = broadcaster.sendTo('TACO42', 'p-nonexistent', 'custom:event', {});
      expect(failedDelivery).toBe(false);

      // Close room
      broadcaster.closeRoom('TACO42');
      expect(broadcaster.getClientCount('TACO42')).toBe(0);
    });

    it('heartbeat ping does not crash with empty or active clients', () => {
      expect(() => broadcaster.sendHeartbeat('NONEXIST99')).not.toThrow();

      let written = '';
      const mockRes = {
        writeHead: () => {},
        write: (msg) => { written += msg; },
        end: () => {},
        on: () => {},
      };
      const mockReq = { on: () => {} };

      broadcaster.addClient('HEARTBEAT01', 'p-1', mockReq, mockRes);
      broadcaster.sendHeartbeat('HEARTBEAT01');
      expect(written).toContain(': heartbeat');
    });

    it('empirically observes behavior when settings is explicitly null', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostNullSettings' });
      const code = createRes.body.room.code;
      const hostId = createRes.body.participant.id;
      const sessionToken = createRes.body.sessionToken;

      // When settings is null, TypeError occurs in loop unless guarded
      const res = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', sessionToken)
        .send({
          participantId: hostId,
          settings: null,
        });

      // The unhandled TypeError returns 500 Internal Server Error
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Cannot read properties of null');
    });
  });

  // =========================================================================
  // SUITE 7: Orphaned Room & Edge Case State Invariant Tests
  // =========================================================================
  describe('Suite 7: Orphaned Host State Invariant Check', () => {
    it('empirically demonstrates orphaned host state when sole host leaves', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'SoleHost' });
      const code = createRes.body.room.code;
      const soleHostId = createRes.body.participant.id;
      const soleHostToken = createRes.body.sessionToken;

      // Sole host leaves room
      await request(app)
        .post(`/api/rooms/${code}/leave`)
        .set('x-session-token', soleHostToken)
        .send({ participantId: soleHostId });

      // Room now has 0 participants, but hostId remains soleHostId
      const emptyRoomRes = await request(app).get(`/api/rooms/${code}`);
      expect(emptyRoomRes.body.room.participantCount).toBe(0);
      expect(emptyRoomRes.body.room.hostId).toBe(soleHostId);

      // New user joins the vacated room
      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'LateComer' });
      const lateComerId = joinRes.body.participant.id;
      const lateComerToken = joinRes.body.sessionToken;

      // LateComer is NOT made host (isHost is false)
      expect(joinRes.body.participant.isHost).toBe(false);

      // LateComer cannot update settings because hostId is still soleHostId
      const lateComerUpdate = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', lateComerToken)
        .send({
          participantId: lateComerId,
          settings: { distance: 'short_drive' },
        });
      expect(lateComerUpdate.status).toBe(403);

      // SoleHost (who is no longer in the room!) CAN NO LONGER update settings
      const ghostHostUpdate = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', soleHostToken)
        .send({
          participantId: soleHostId,
          settings: { distance: 'short_drive' },
        });
      expect(ghostHostUpdate.status).toBe(403);
    });
  });

  // =========================================================================
  // SUITE 8: Tie-Breaker & Monetization Boundary & Edge Invariant Tests
  // =========================================================================
  describe('Suite 8: Tie-Breaker & Monetization Boundary & Edge Cases', () => {
    it('handles 1-person solo room tiebreaker spin gracefully', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'SoloUser', deckSize: 4 });
      const code = createRes.body.room.code;
      const hostAuth = {
        id: createRes.body.participant.id,
        sessionToken: createRes.body.sessionToken,
        hostKey: createRes.body.hostKey,
      };

      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-host-key', hostAuth.hostKey)
        .send({ participantId: hostAuth.id });

      const spinRes = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/spin`)
        .set('x-host-key', hostAuth.hostKey)
        .send({ participantId: hostAuth.id })
        .expect(200);

      expect(spinRes.body.success).toBe(true);
      expect(spinRes.body.winningVenueId).toBeDefined();
    });

    it('rejects tiebreaker spin on closed room with 409', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;
      const hostAuth = {
        id: createRes.body.participant.id,
        sessionToken: createRes.body.sessionToken,
        hostKey: createRes.body.hostKey,
      };

      // Manually close room in roomStore
      const room = roomStore.getRoom(code);
      room.status = 'closed';

      const spinRes = await request(app)
        .post(`/api/rooms/${code}/tiebreaker/spin`)
        .set('x-host-key', hostAuth.hostKey)
        .send({ participantId: hostAuth.id })
        .expect(409);

      expect(spinRes.body.success).toBe(false);
      expect(spinRes.body.error).toMatch(/closed/i);
    });

    it('rejects restart attempt with invalid hostKey or non-host sessionToken with 403', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;

      const restartRes = await request(app)
        .post(`/api/rooms/${code}/restart`)
        .set('x-host-key', 'hk-fake-invalid-key')
        .send({ participantId: 'p-fake' })
        .expect(403);

      expect(restartRes.body.success).toBe(false);
      expect(restartRes.body.error).toMatch(/host/i);
    });

    it('rejects VIP upgrade with expired card token (tok_expired) with 402', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;
      const hostToken = createRes.body.sessionToken;

      const upgradeRes = await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .set('x-session-token', hostToken)
        .send({
          paymentToken: 'tok_expired',
        })
        .expect(402);

      expect(upgradeRes.body.success).toBe(false);
      expect(upgradeRes.body.error).toMatch(/failed|declined/i);
    });

    it('requires card token when coupon code is invalid / unrecognised', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;
      const hostToken = createRes.body.sessionToken;

      const upgradeRes = await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .set('x-session-token', hostToken)
        .send({
          couponCode: 'BOGUS_COUPON',
        })
        .expect(400);

      expect(upgradeRes.body.success).toBe(false);
      expect(upgradeRes.body.error).toMatch(/payment token is required/i);
    });

    it('sanitizes and safely accepts custom venue with special characters and long descriptions', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostUser' });
      const code = createRes.body.room.code;

      // Upgrade first
      await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .send({ couponCode: 'VIPFREE' });

      const longDesc = 'A'.repeat(500);
      const customRes = await request(app)
        .post(`/api/rooms/${code}/custom-venue`)
        .send({
          name: '<script>alert("xss")</script> & Bob’s "Tacos"',
          description: longDesc,
          priceTier: 5, // out of normal range
        })
        .expect(200);

      expect(customRes.body.success).toBe(true);
      expect(customRes.body.venue.name).toContain('Bob’s "Tacos"');
    });

    it('affiliate redirect endpoint safely handles query injection attacks', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect?partner=opentable&venueId="><script>alert(1)</script>&format=json')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.destinationUrl).toBeDefined();
    });

    it('affiliate redirect rejects missing partner and target URL with 400', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect')
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/required/i);
    });
  });
});

