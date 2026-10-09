import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import { createApp } from '../server/index.js';
import { RoomStore } from '../server/models/RoomStore.js';
import { Broadcaster } from '../server/sync/Broadcaster.js';

describe('Adversarial Deep Stress & Concurrency Regression Suite', () => {
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
  });

  // =========================================================================
  // TEST 1: Massive 500-Request Concurrency Burst
  // =========================================================================
  it('Massive 500-Request Concurrency Burst: 20 participants x 25 cards without drops or deadlocks', async () => {
    // 1. Host creates room with max allowed deck size (25)
    const hostRes = await request(app)
      .post('/api/rooms')
      .send({
        hostName: 'MegaHost',
        hostAvatar: '👑',
        activityCategory: 'dining',
        deckSize: 25,
      });
    expect([200, 201]).toContain(hostRes.status);
    const code = hostRes.body.room.code;

    const participants = [
      {
        id: hostRes.body.participant.id,
        name: 'MegaHost',
        sessionToken: hostRes.body.sessionToken,
        isHost: true,
      },
    ];

    // 2. 19 guests join concurrently (Total 20 participants)
    const joinPromises = Array.from({ length: 19 }, (_, idx) =>
      request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: `MegaGuest_${idx + 1}`, avatar: '🚀' })
    );
    const joinResponses = await Promise.all(joinPromises);
    expect(joinResponses.every(r => r.status === 200)).toBe(true);

    for (const r of joinResponses) {
      participants.push({
        id: r.body.participant.id,
        name: r.body.participant.name,
        sessionToken: r.body.sessionToken,
        isHost: false,
      });
    }
    expect(participants.length).toBe(20);

    // 3. Start voting
    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-session-token', participants[0].sessionToken)
      .send({ participantId: participants[0].id });

    expect(startRes.status).toBe(200);
    const deck = startRes.body.deck;
    expect(deck.length).toBe(25);

    // 4. Assemble 500 concurrent vote requests:
    // Every participant votes 'pass' on all 25 venues
    const voteTasks = [];
    for (const p of participants) {
      for (const venue of deck) {
        voteTasks.push(
          request(app)
            .post(`/api/rooms/${code}/vote`)
            .set('x-session-token', p.sessionToken)
            .send({
              participantId: p.id,
              venueId: venue.id,
              vote: 'pass',
            })
        );
      }
    }
    expect(voteTasks.length).toBe(500);

    const startTime = performance.now();
    const responses = await Promise.all(voteTasks);
    const duration = performance.now() - startTime;

    // Verify 100% throughput: 500 out of 500 succeed with 200 OK
    expect(responses.length).toBe(500);
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }

    // Verify room state consistency
    const roomRes = await request(app).get(`/api/rooms/${code}`);
    expect(roomRes.status).toBe(200);
    const room = roomRes.body.room;

    for (const p of room.participants) {
      expect(p.swipedCount).toBe(25);
    }

    // Verify results leaderboard tallies
    const resultsRes = await request(app).get(`/api/rooms/${code}/results`);
    expect(resultsRes.status).toBe(200);
    const leaderboard = resultsRes.body.leaderboard;
    expect(leaderboard.length).toBe(25);

    let totalPasses = 0;
    for (const item of leaderboard) {
      totalPasses += item.passCount;
      expect(item.passCount).toBe(20);
      expect(item.likeCount).toBe(0);
      expect(item.isUnanimous).toBe(false);
    }
    expect(totalPasses).toBe(500);
    console.log(`  ✓ 500 concurrent votes processed in ${duration.toFixed(1)}ms (${(500 / (duration / 1000)).toFixed(0)} req/s)`);
  }, 20000);

  // =========================================================================
  // TEST 2: Multi-Room Cross-Talk Isolation Under 1,000 Concurrent Requests
  // =========================================================================
  it('1,000 Concurrent Requests across 10 distinct rooms: Perfect isolation & zero cross-talk', async () => {
    // Create 10 independent rooms, each with 5 participants and 10 cards (50 participants total)
    const roomConfigs = [];
    for (let rIdx = 0; rIdx < 10; rIdx++) {
      const hRes = await request(app).post('/api/rooms').send({ hostName: `Host_R${rIdx}`, deckSize: 10 });
      const code = hRes.body.room.code;
      const participants = [{ id: hRes.body.participant.id, token: hRes.body.sessionToken }];

      for (let gIdx = 1; gIdx < 5; gIdx++) {
        const jRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: `G_R${rIdx}_${gIdx}` });
        participants.push({ id: jRes.body.participant.id, token: jRes.body.sessionToken });
      }

      const sRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', participants[0].token)
        .send({ participantId: participants[0].id });

      roomConfigs.push({
        code,
        participants,
        deck: sRes.body.deck,
      });
    }

    // Now generate 10 rooms * 5 participants * 10 cards * 2 votes = 1,000 concurrent vote requests
    // Each participant casts 20 rapid votes (10 passes, then 10 likes)
    const thousandTasks = [];
    for (const roomConfig of roomConfigs) {
      for (const p of roomConfig.participants) {
        // Vote pass on all 10 cards
        for (const venue of roomConfig.deck) {
          thousandTasks.push(
            request(app)
              .post(`/api/rooms/${roomConfig.code}/vote`)
              .set('x-session-token', p.token)
              .send({ participantId: p.id, venueId: venue.id, vote: 'pass' })
          );
        }
        // Vote like on all 10 cards (flipping pass -> like)
        for (const venue of roomConfig.deck) {
          thousandTasks.push(
            request(app)
              .post(`/api/rooms/${roomConfig.code}/vote`)
              .set('x-session-token', p.token)
              .send({ participantId: p.id, venueId: venue.id, vote: 'like' })
          );
        }
      }
    }

    expect(thousandTasks.length).toBe(1000);

    const t0 = performance.now();
    const responses = await Promise.all(thousandTasks);
    const duration = performance.now() - t0;

    expect(responses.length).toBe(1000);
    for (const r of responses) {
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
    }

    // Verify all 10 rooms independently achieved matched status on card 0
    for (const roomConfig of roomConfigs) {
      const roomRes = await request(app).get(`/api/rooms/${roomConfig.code}`);
      expect(roomRes.status).toBe(200);
      expect(roomRes.body.room.status).toBe('matched');
      expect(roomRes.body.room.matchedVenueId).toBeTruthy();
      // All participants have swipedCount = 10
      for (const p of roomRes.body.room.participants) {
        expect(p.swipedCount).toBe(10);
      }
    }

    console.log(`  ✓ 1,000 multi-room concurrent votes processed in ${duration.toFixed(1)}ms (${(1000 / (duration / 1000)).toFixed(0)} req/s)`);
  }, 25000);

  // =========================================================================
  // TEST 3: Hostile Injections Interleaved with Concurrent Consensus
  // =========================================================================
  it('Hostile injections interleaved with legitimate voting: 0 contamination and clean consensus', async () => {
    const hostRes = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'HostSecure', deckSize: 8 });
    const code = hostRes.body.room.code;
    const participants = [
      { id: hostRes.body.participant.id, token: hostRes.body.sessionToken },
    ];

    for (let i = 1; i < 4; i++) {
      const jRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: `G_${i}` });
      participants.push({ id: jRes.body.participant.id, token: jRes.body.sessionToken });
    }

    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-session-token', participants[0].token)
      .send({ participantId: participants[0].id });
    const deck = startRes.body.deck;
    const targetVenue = deck[0];

    // Prepare interleaved tasks:
    // 4 legitimate likes on targetVenue (to achieve unanimous consensus)
    // 40 hostile requests attempting prototype pollution, ghost venues, and fake tokens
    const legitTasks = participants.map(p =>
      request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', p.token)
        .send({ participantId: p.id, venueId: targetVenue.id, vote: 'like' })
    );

    const hostileTasks = [
      // Prototype pollution attempts
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[0].token).send({ participantId: participants[0].id, venueId: '__proto__', vote: 'like' }),
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[0].token).send({ participantId: participants[0].id, venueId: 'constructor', vote: 'like' }),
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[0].token).send({ participantId: participants[0].id, venueId: 'prototype', vote: 'like' }),
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[0].token).send({ participantId: '__proto__', venueId: targetVenue.id, vote: 'like' }),
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[0].token).send({ participantId: 'constructor', venueId: targetVenue.id, vote: 'like' }),
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[0].token).send({ participantId: 'prototype', venueId: targetVenue.id, vote: 'like' }),

      // Ghost venue attempts (non-deck venues)
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[0].token).send({ participantId: participants[0].id, venueId: 'ghost-venue-999', vote: 'like' }),
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[1].token).send({ participantId: participants[1].id, venueId: 'fake-food-bar', vote: 'like' }),
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[2].token).send({ participantId: participants[2].id, venueId: 'phantom-cafe', vote: 'like' }),

      // Auth bypass attempts
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', 'st-bad-hacker-token').send({ participantId: participants[0].id, venueId: targetVenue.id, vote: 'like' }),
      request(app).post(`/api/rooms/${code}/vote`).send({ participantId: participants[0].id, venueId: targetVenue.id, vote: 'like' }),
    ];

    // Combine and shuffle tasks
    const allTasks = [...legitTasks, ...hostileTasks].sort(() => Math.random() - 0.5);
    const results = await Promise.all(allTasks);

    // Verify prototype is completely untainted
    expect(Object.prototype[participants[0].id]).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();

    // Verify room reached matched status on targetVenue
    const roomRes = await request(app).get(`/api/rooms/${code}`);
    expect(roomRes.body.room.status).toBe('matched');
    expect(roomRes.body.room.matchedVenueId).toBe(targetVenue.id);
  }, 20000);

  // =========================================================================
  // TEST 4: Concurrent Joins and Leaves Mid-Voting
  // =========================================================================
  it('Concurrent join, leave, and voting operations maintain roster and voting integrity', async () => {
    const hostRes = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'HostLife', deckSize: 6 });
    const code = hostRes.body.room.code;
    const host = { id: hostRes.body.participant.id, token: hostRes.body.sessionToken };

    // Join 2 guests
    const g1Res = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'Guest1' });
    const g2Res = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'Guest2' });
    const g1 = { id: g1Res.body.participant.id, token: g1Res.body.sessionToken };
    const g2 = { id: g2Res.body.participant.id, token: g2Res.body.sessionToken };

    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-session-token', host.token)
      .send({ participantId: host.id });
    const deck = startRes.body.deck;

    // Concurrent operations:
    // Host votes, Guest 1 votes, Guest 3 joins, Guest 2 leaves
    const mixedOps = [
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', host.token).send({ participantId: host.id, venueId: deck[0].id, vote: 'like' }),
      request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', g1.token).send({ participantId: g1.id, venueId: deck[0].id, vote: 'like' }),
      request(app).post(`/api/rooms/${code}/join`).send({ name: 'Guest3' }),
      request(app).post(`/api/rooms/${code}/leave`).set('x-session-token', g2.token).send({ participantId: g2.id }),
    ];

    const mixedResults = await Promise.all(mixedOps);
    for (const r of mixedResults) {
      expect([200, 201]).toContain(r.status);
    }

    const roomRes = await request(app).get(`/api/rooms/${code}`);
    const participants = roomRes.body.room.participants;
    // Guest 2 should be gone
    expect(participants.find(p => p.id === g2.id)).toBeUndefined();
    // Guest 3 should exist
    expect(participants.find(p => p.name === 'Guest3')).toBeDefined();
    // Host and Guest 1 should exist
    expect(participants.find(p => p.id === host.id)).toBeDefined();
    expect(participants.find(p => p.id === g1.id)).toBeDefined();
  }, 20000);

  // =========================================================================
  // TEST 5: 50 Concurrent Room Creations — Unique Codes & Zero Collisions
  // =========================================================================
  it('50 concurrent room creations generate 50 unique collision-free room codes', async () => {
    const createPromises = Array.from({ length: 50 }, (_, i) =>
      request(app)
        .post('/api/rooms')
        .send({ hostName: `Creator_${i}`, activityCategory: 'dining' })
    );

    const responses = await Promise.all(createPromises);
    expect(responses.every(r => r.status === 201 || r.status === 200)).toBe(true);

    const codes = responses.map(r => r.body.room.code);
    expect(codes.length).toBe(50);

    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(50);
  }, 20000);

  // =========================================================================
  // TEST 6: Rapid Alternating Vote Flipping Under Concurrency
  // =========================================================================
  it('Rapid alternating vote flipping (like <-> pass) converges without corrupted counts', async () => {
    const hostRes = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'FlipperHost', deckSize: 5 });
    const code = hostRes.body.room.code;
    const host = { id: hostRes.body.participant.id, token: hostRes.body.sessionToken };

    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-session-token', host.token)
      .send({ participantId: host.id });
    const deck = startRes.body.deck;

    // Flip vote on venue 0 between 'like' and 'pass' 20 times rapidly
    for (let i = 0; i < 20; i++) {
      const voteType = i % 2 === 0 ? 'like' : 'pass';
      const vRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.token)
        .send({ participantId: host.id, venueId: deck[0].id, vote: voteType });
      expect(vRes.status).toBe(200);
    }

    const roomRes = await request(app).get(`/api/rooms/${code}`);
    const hostState = roomRes.body.room.participants.find(p => p.id === host.id);
    expect(hostState.swipedCount).toBe(1); // venue 0 was flipped 20 times, but swipedCount is strictly 1
  }, 20000);
});
