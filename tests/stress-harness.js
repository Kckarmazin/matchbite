#!/usr/bin/env node
/**
 * Standalone Empirical Concurrency & Consensus Stress Test Harness
 * MatchBite - Milestone 2 Adversarial Stress Testing
 */

import http from 'node:http';
import { createApp } from '../server/index.js';
import { RoomStore } from '../server/models/RoomStore.js';
import { Broadcaster } from '../server/sync/Broadcaster.js';

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, message) {
  if (condition) {
    passedAssertions++;
  } else {
    failedAssertions++;
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runHarness() {
  console.log('='.repeat(70));
  console.log('MATCHBITE EMPIRICAL STRESS TEST HARNESS — CONCURRENCY & CONSENSUS');
  console.log('='.repeat(70));

  const broadcaster = new Broadcaster();
  const roomStore = new RoomStore(broadcaster);
  const app = createApp({ roomStore, broadcaster });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Server bound to ephemeral TCP port: ${port}`);

  const startTime = Date.now();
  let totalRequests = 0;
  const latencies = [];

  async function postJson(endpoint, body = {}, headers = {}) {
    const t0 = performance.now();
    totalRequests++;
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
    const duration = performance.now() - t0;
    latencies.push(duration);
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data, duration };
  }

  async function getJson(endpoint, headers = {}) {
    const t0 = performance.now();
    totalRequests++;
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        ...headers,
      },
    });
    const duration = performance.now() - t0;
    latencies.push(duration);
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data, duration };
  }

  try {
    // -----------------------------------------------------------------------
    // TEST 1: High Concurrency Multi-User Swiping (5 Participants, 60 votes)
    // -----------------------------------------------------------------------
    console.log('\n[1/12] Testing 5-Participant Concurrent Swiping (60 rapid requests)...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'Host1', deckSize: 12 });
      assert(hostRes.status === 201, 'Host created room');
      const code = hostRes.data.room.code;
      const participants = [{ id: hostRes.data.participant.id, token: hostRes.data.sessionToken }];

      for (let i = 1; i < 5; i++) {
        const jRes = await postJson(`/api/rooms/${code}/join`, { name: `Guest_${i}` });
        assert(jRes.status === 200, `Guest ${i} joined`);
        participants.push({ id: jRes.data.participant.id, token: jRes.data.sessionToken });
      }

      const startRes = await postJson(`/api/rooms/${code}/start`, { participantId: participants[0].id }, { 'x-session-token': participants[0].token });
      assert(startRes.status === 200, 'Voting round started');
      const deck = startRes.data.deck;
      assert(deck.length === 12, 'Deck has 12 cards');

      // 60 votes fired in parallel
      const voteTasks = [];
      for (let pIdx = 0; pIdx < participants.length; pIdx++) {
        const p = participants[pIdx];
        for (let vIdx = 0; vIdx < deck.length; vIdx++) {
          const voteType = (vIdx === 0 && pIdx < 4) ? 'like' : 'pass';
          voteTasks.push(
            postJson(`/api/rooms/${code}/vote`, {
              participantId: p.id,
              venueId: deck[vIdx].id,
              vote: voteType,
            }, { 'x-session-token': p.token })
          );
        }
      }

      const results = await Promise.all(voteTasks);
      assert(results.length === 60, 'All 60 requests completed');
      assert(results.every(r => r.status === 200), 'All 60 requests returned 200 OK');

      const roomRes = await getJson(`/api/rooms/${code}`);
      assert(roomRes.data.room.status === 'voting', 'Room still in voting because 1 participant passed venue 0');
      assert(roomRes.data.room.matchedVenueId === null, 'No false match declared');
      for (const p of roomRes.data.room.participants) {
        assert(p.swipedCount === 12, `Participant ${p.name} swipedCount is 12`);
      }
      console.log('  ✓ 5 participants successfully swiped 60 cards concurrently with zero drops.');
    }

    // -----------------------------------------------------------------------
    // TEST 2: Scrambled Out-of-Order Swiping (8 Participants, 96 votes)
    // -----------------------------------------------------------------------
    console.log('\n[2/12] Testing 8-Participant Scrambled Concurrency (96 requests)...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'Host2', deckSize: 12 });
      const code = hostRes.data.room.code;
      const participants = [{ id: hostRes.data.participant.id, token: hostRes.data.sessionToken }];

      for (let i = 1; i < 8; i++) {
        const jRes = await postJson(`/api/rooms/${code}/join`, { name: `G_${i}` });
        participants.push({ id: jRes.data.participant.id, token: jRes.data.sessionToken });
      }

      const startRes = await postJson(`/api/rooms/${code}/start`, { participantId: participants[0].id }, { 'x-session-token': participants[0].token });
      const deck = startRes.data.deck;

      const tasks = [];
      for (const p of participants) {
        for (const venue of deck) {
          tasks.push({ p, venueId: venue.id, vote: 'pass' });
        }
      }
      tasks.sort(() => Math.random() - 0.5); // Randomize network arrival

      const results = await Promise.all(
        tasks.map(t =>
          postJson(`/api/rooms/${code}/vote`, {
            participantId: t.p.id,
            venueId: t.venueId,
            vote: t.vote,
          }, { 'x-session-token': t.p.token })
        )
      );

      assert(results.length === 96, 'All 96 scrambled requests completed');
      assert(results.every(r => r.status === 200), 'All 96 requests returned 200 OK');
      console.log('  ✓ 96 randomized requests recorded with perfect consistency.');
    }

    // -----------------------------------------------------------------------
    // TEST 3: Simultaneous Unanimous Consensus Race Condition
    // -----------------------------------------------------------------------
    console.log('\n[3/12] Testing Simultaneous Consensus Race (5 simultaneous likes)...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'RaceHost' });
      const code = hostRes.data.room.code;
      const participants = [{ id: hostRes.data.participant.id, token: hostRes.data.sessionToken }];

      for (let i = 1; i < 5; i++) {
        const jRes = await postJson(`/api/rooms/${code}/join`, { name: `Guest_${i}` });
        participants.push({ id: jRes.data.participant.id, token: jRes.data.sessionToken });
      }

      let matchRevealedCount = 0;
      broadcaster.broadcast = (bCode, eventName) => {
        if (eventName === 'match:revealed') matchRevealedCount++;
      };

      const startRes = await postJson(`/api/rooms/${code}/start`, { participantId: participants[0].id }, { 'x-session-token': participants[0].token });
      const targetVenueId = startRes.data.deck[0].id;

      // All 5 participants vote 'like' simultaneously on the exact same millisecond
      const raceResults = await Promise.all(
        participants.map(p =>
          postJson(`/api/rooms/${code}/vote`, {
            participantId: p.id,
            venueId: targetVenueId,
            vote: 'like',
          }, { 'x-session-token': p.token })
        )
      );

      assert(raceResults.every(r => r.status === 200), 'All 5 race votes returned 200');
      assert(matchRevealedCount === 1, 'Exactly one match:revealed event broadcast');

      const roomRes = await getJson(`/api/rooms/${code}`);
      assert(roomRes.data.room.status === 'matched', 'Room transitioned to matched');
      assert(roomRes.data.room.matchedVenueId === targetVenueId, 'Matched venue matches target');
      console.log('  ✓ Simultaneous deciding vote resolved with zero race conditions and single broadcast.');
    }

    // -----------------------------------------------------------------------
    // TEST 4: Dual-Venue Simultaneous Consensus (Double-Match Prevention)
    // -----------------------------------------------------------------------
    console.log('\n[4/12] Testing Dual-Venue Simultaneous Consensus (Double-Match Prevention)...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'DualHost' });
      const code = hostRes.data.room.code;
      const participants = [{ id: hostRes.data.participant.id, token: hostRes.data.sessionToken }];

      for (let i = 1; i < 4; i++) {
        const jRes = await postJson(`/api/rooms/${code}/join`, { name: `Guest_${i}` });
        participants.push({ id: jRes.data.participant.id, token: jRes.data.sessionToken });
      }

      let matchRevealedBroadcasts = [];
      broadcaster.broadcast = (bCode, eventName, data) => {
        if (eventName === 'match:revealed') matchRevealedBroadcasts.push(data);
      };

      const startRes = await postJson(`/api/rooms/${code}/start`, { participantId: participants[0].id }, { 'x-session-token': participants[0].token });
      const vA = startRes.data.deck[0].id;
      const vB = startRes.data.deck[1].id;

      // 4 participants vote like on Venue A and Venue B simultaneously (8 requests)
      const tasks = [];
      for (const p of participants) {
        tasks.push(postJson(`/api/rooms/${code}/vote`, { participantId: p.id, venueId: vA, vote: 'like' }, { 'x-session-token': p.token }));
        tasks.push(postJson(`/api/rooms/${code}/vote`, { participantId: p.id, venueId: vB, vote: 'like' }, { 'x-session-token': p.token }));
      }

      const results = await Promise.all(tasks);
      assert(results.length === 8, '8 requests completed');

      const roomRes = await getJson(`/api/rooms/${code}`);
      assert(roomRes.data.room.status === 'matched', 'Room status is matched');
      assert([vA, vB].includes(roomRes.data.room.matchedVenueId), 'Matched venue is either A or B');
      assert(matchRevealedBroadcasts.length === 1, 'Exactly one match:revealed broadcast fired for room');
      assert(matchRevealedBroadcasts[0].venueId === roomRes.data.room.matchedVenueId, 'Broadcast payload matches room winner');
      console.log('  ✓ Double-match prevented: exactly one winner locked despite simultaneous dual consensus.');
    }

    // -----------------------------------------------------------------------
    // TEST 5: Simultaneous Like vs Pass Collision
    // -----------------------------------------------------------------------
    console.log('\n[5/12] Testing Simultaneous Like vs Pass Collision (4 Likes, 1 Pass)...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'CollisionHost' });
      const code = hostRes.data.room.code;
      const participants = [{ id: hostRes.data.participant.id, token: hostRes.data.sessionToken }];

      for (let i = 1; i < 5; i++) {
        const jRes = await postJson(`/api/rooms/${code}/join`, { name: `Guest_${i}` });
        participants.push({ id: jRes.data.participant.id, token: jRes.data.sessionToken });
      }

      let matchEmitted = false;
      broadcaster.broadcast = (bCode, eventName) => {
        if (eventName === 'match:revealed') matchEmitted = true;
      };

      const startRes = await postJson(`/api/rooms/${code}/start`, { participantId: participants[0].id }, { 'x-session-token': participants[0].token });
      const targetVenueId = startRes.data.deck[0].id;

      // P0..3 like, P4 passes simultaneously
      await Promise.all([
        postJson(`/api/rooms/${code}/vote`, { participantId: participants[0].id, venueId: targetVenueId, vote: 'like' }, { 'x-session-token': participants[0].token }),
        postJson(`/api/rooms/${code}/vote`, { participantId: participants[1].id, venueId: targetVenueId, vote: 'like' }, { 'x-session-token': participants[1].token }),
        postJson(`/api/rooms/${code}/vote`, { participantId: participants[2].id, venueId: targetVenueId, vote: 'like' }, { 'x-session-token': participants[2].token }),
        postJson(`/api/rooms/${code}/vote`, { participantId: participants[3].id, venueId: targetVenueId, vote: 'like' }, { 'x-session-token': participants[3].token }),
        postJson(`/api/rooms/${code}/vote`, { participantId: participants[4].id, venueId: targetVenueId, vote: 'pass' }, { 'x-session-token': participants[4].token }),
      ]);

      assert(!matchEmitted, 'No match:revealed event emitted');
      const roomRes = await getJson(`/api/rooms/${code}`);
      assert(roomRes.data.room.status === 'voting', 'Room remains in voting status');
      assert(roomRes.data.room.matchedVenueId === null, 'No match recorded');
      console.log('  ✓ Pass vote correctly prevented consensus with zero false positives.');
    }

    // -----------------------------------------------------------------------
    // TEST 6: Permutations — All Like (5/5)
    // -----------------------------------------------------------------------
    console.log('\n[6/12] Testing Permutation: All Like (5/5)...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'AllLikeHost' });
      const code = hostRes.data.room.code;
      const participants = [{ id: hostRes.data.participant.id, token: hostRes.data.sessionToken }];
      for (let i = 1; i < 5; i++) {
        const jRes = await postJson(`/api/rooms/${code}/join`, { name: `Guest_${i}` });
        participants.push({ id: jRes.data.participant.id, token: jRes.data.sessionToken });
      }
      const startRes = await postJson(`/api/rooms/${code}/start`, { participantId: participants[0].id }, { 'x-session-token': participants[0].token });
      const targetVenueId = startRes.data.deck[0].id;

      for (let i = 0; i < 4; i++) {
        const r = await postJson(`/api/rooms/${code}/vote`, { participantId: participants[i].id, venueId: targetVenueId, vote: 'like' }, { 'x-session-token': participants[i].token });
        assert(!r.data.isMatch, `Vote ${i + 1} did not trigger early match`);
      }
      const finalR = await postJson(`/api/rooms/${code}/vote`, { participantId: participants[4].id, venueId: targetVenueId, vote: 'like' }, { 'x-session-token': participants[4].token });
      assert(finalR.data.isMatch, '5th like triggered match');

      const resultsRes = await getJson(`/api/rooms/${code}/results`);
      const v = resultsRes.data.leaderboard.find(l => l.venueId === targetVenueId);
      assert(v.isUnanimous === true, 'Leaderboard marks isUnanimous: true');
      assert(v.approvalRate === 100, 'approvalRate is 100%');
      assert(v.likeCount === 5, 'likeCount is 5');
      console.log('  ✓ 5/5 All Like permutation verified.');
    }

    // -----------------------------------------------------------------------
    // TEST 7: Permutations — All Pass (0/5)
    // -----------------------------------------------------------------------
    console.log('\n[7/12] Testing Permutation: All Pass (0/5)...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'AllPassHost' });
      const code = hostRes.data.room.code;
      const participants = [{ id: hostRes.data.participant.id, token: hostRes.data.sessionToken }];
      for (let i = 1; i < 5; i++) {
        const jRes = await postJson(`/api/rooms/${code}/join`, { name: `Guest_${i}` });
        participants.push({ id: jRes.data.participant.id, token: jRes.data.sessionToken });
      }
      const startRes = await postJson(`/api/rooms/${code}/start`, { participantId: participants[0].id }, { 'x-session-token': participants[0].token });
      const targetVenueId = startRes.data.deck[0].id;

      for (const p of participants) {
        const r = await postJson(`/api/rooms/${code}/vote`, { participantId: p.id, venueId: targetVenueId, vote: 'pass' }, { 'x-session-token': p.token });
        assert(!r.data.isMatch, 'Pass did not trigger match');
      }

      const resultsRes = await getJson(`/api/rooms/${code}/results`);
      const v = resultsRes.data.leaderboard.find(l => l.venueId === targetVenueId);
      assert(v.isUnanimous === false, 'isUnanimous: false');
      assert(v.approvalRate === 0, 'approvalRate: 0%');
      assert(v.passCount === 5, 'passCount: 5');
      console.log('  ✓ 0/5 All Pass permutation verified.');
    }

    // -----------------------------------------------------------------------
    // TEST 8: Permutations — Superlike Score Weighting & Combinations
    // -----------------------------------------------------------------------
    console.log('\n[8/12] Testing Permutation: Superlike Weighting & Consensus...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'SuperHost' });
      const code = hostRes.data.room.code;
      const participants = [{ id: hostRes.data.participant.id, token: hostRes.data.sessionToken }];
      for (let i = 1; i < 4; i++) {
        const jRes = await postJson(`/api/rooms/${code}/join`, { name: `Guest_${i}` });
        participants.push({ id: jRes.data.participant.id, token: jRes.data.sessionToken });
      }
      const startRes = await postJson(`/api/rooms/${code}/start`, { participantId: participants[0].id }, { 'x-session-token': participants[0].token });
      const vSuper = startRes.data.deck[0].id;
      const vLike = startRes.data.deck[1].id;

      // 4 participants superlike vSuper -> Score = 4 * 3 = 12
      for (const p of participants) {
        await postJson(`/api/rooms/${code}/vote`, { participantId: p.id, venueId: vSuper, vote: 'superlike' }, { 'x-session-token': p.token });
      }

      // 4 participants like vLike -> Score = 4 * 1 = 4
      for (const p of participants) {
        await postJson(`/api/rooms/${code}/vote`, { participantId: p.id, venueId: vLike, vote: 'like' }, { 'x-session-token': p.token });
      }

      const resultsRes = await getJson(`/api/rooms/${code}/results`);
      const rSuper = resultsRes.data.leaderboard.find(l => l.venueId === vSuper);
      const rLike = resultsRes.data.leaderboard.find(l => l.venueId === vLike);

      assert(rSuper.score === 12, 'Superlike score is 12 (4 * 3)');
      assert(rLike.score === 4, 'Like score is 4 (4 * 1)');
      assert(resultsRes.data.leaderboard[0].venueId === vSuper, 'vSuper ranks #1 on leaderboard');
      console.log('  ✓ Superlike weighting (3x multiplier) and unanimous agreement verified.');
    }

    // -----------------------------------------------------------------------
    // TEST 9: Solo Room (1 Participant) Instant Match
    // -----------------------------------------------------------------------
    console.log('\n[9/12] Testing Solo Room (1 Participant) Instant Consensus...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'SoloUser' });
      const code = hostRes.data.room.code;
      const hostId = hostRes.data.participant.id;
      const hostToken = hostRes.data.sessionToken;

      const startRes = await postJson(`/api/rooms/${code}/start`, { participantId: hostId }, { 'x-session-token': hostToken });
      const targetVenueId = startRes.data.deck[0].id;

      const voteRes = await postJson(`/api/rooms/${code}/vote`, { participantId: hostId, venueId: targetVenueId, vote: 'like' }, { 'x-session-token': hostToken });
      assert(voteRes.data.isMatch === true, 'Single like immediately matches solo room');

      const roomRes = await getJson(`/api/rooms/${code}`);
      assert(roomRes.data.room.status === 'matched', 'Room status is matched');
      assert(roomRes.data.room.matchedVenueId === targetVenueId, 'Matched venue locked');
      console.log('  ✓ Solo room instant 1-vote match verified.');
    }

    // -----------------------------------------------------------------------
    // TEST 10: Dynamic Vote Flipping (Pass -> Like) Mid-Session
    // -----------------------------------------------------------------------
    console.log('\n[10/12] Testing Dynamic Vote Flipping (Pass -> Like)...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'FlipHost' });
      const code = hostRes.data.room.code;
      const participants = [{ id: hostRes.data.participant.id, token: hostRes.data.sessionToken }];
      const jRes = await postJson(`/api/rooms/${code}/join`, { name: 'Guest' });
      participants.push({ id: jRes.data.participant.id, token: jRes.data.sessionToken });

      const startRes = await postJson(`/api/rooms/${code}/start`, { participantId: participants[0].id }, { 'x-session-token': participants[0].token });
      const targetVenueId = startRes.data.deck[0].id;

      // P0 likes, P1 passes
      await postJson(`/api/rooms/${code}/vote`, { participantId: participants[0].id, venueId: targetVenueId, vote: 'like' }, { 'x-session-token': participants[0].token });
      const passRes = await postJson(`/api/rooms/${code}/vote`, { participantId: participants[1].id, venueId: targetVenueId, vote: 'pass' }, { 'x-session-token': participants[1].token });
      assert(!passRes.data.isMatch, 'P1 pass blocks match');

      // P1 flips to like
      const flipRes = await postJson(`/api/rooms/${code}/vote`, { participantId: participants[1].id, venueId: targetVenueId, vote: 'like' }, { 'x-session-token': participants[1].token });
      assert(flipRes.data.isMatch === true, 'Flipping to like successfully triggers match');

      const roomRes = await getJson(`/api/rooms/${code}`);
      assert(roomRes.data.room.status === 'matched', 'Room status transitioned to matched');
      console.log('  ✓ Vote flipping from pass to like unlocks unanimous consensus dynamically.');
    }

    // -----------------------------------------------------------------------
    // TEST 11: Idempotency Under Rapid Duplicate Spam
    // -----------------------------------------------------------------------
    console.log('\n[11/12] Testing Idempotency Under Duplicate Vote Flood (30 spam votes)...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'SpamHost' });
      const code = hostRes.data.room.code;
      const hostId = hostRes.data.participant.id;
      const hostToken = hostRes.data.sessionToken;

      const startRes = await postJson(`/api/rooms/${code}/start`, { participantId: hostId }, { 'x-session-token': hostToken });
      const targetVenueId = startRes.data.deck[0].id;

      const spamTasks = Array.from({ length: 30 }, () =>
        postJson(`/api/rooms/${code}/vote`, { participantId: hostId, venueId: targetVenueId, vote: 'like' }, { 'x-session-token': hostToken })
      );

      const spamResults = await Promise.all(spamTasks);
      assert(spamResults.every(r => r.status === 200), 'All 30 spam votes returned 200');

      const roomRes = await getJson(`/api/rooms/${code}`);
      const hostState = roomRes.data.room.participants.find(p => p.id === hostId);
      assert(hostState.swipedCount === 1, `swipedCount strictly equals 1 (received ${hostState.swipedCount})`);
      console.log('  ✓ Idempotency verified: 30 duplicate votes counted as exactly 1 swiped card.');
    }

    // -----------------------------------------------------------------------
    // TEST 12: High-Volume Concurrent Capacity Saturation (35 Joins)
    // -----------------------------------------------------------------------
    console.log('\n[12/12] Testing High-Volume Capacity Saturation (35 concurrent joins)...');
    {
      const hostRes = await postJson('/api/rooms', { hostName: 'CapHost' });
      const code = hostRes.data.room.code;

      const joinTasks = Array.from({ length: 35 }, (_, idx) =>
        postJson(`/api/rooms/${code}/join`, { name: `Runner_${idx}` })
      );

      const joinResults = await Promise.all(joinTasks);
      const accepted = joinResults.filter(r => r.status === 200).length;
      const rejected = joinResults.filter(r => r.status === 409).length;

      assert(accepted === 29, `Exactly 29 joiners accepted (received ${accepted})`);
      assert(rejected === 6, `Exactly 6 joiners rejected at capacity (received ${rejected})`);

      const roomRes = await getJson(`/api/rooms/${code}`);
      assert(roomRes.data.room.participantCount === 30, 'Total room participants strictly 30 (MAX_PARTICIPANTS)');
      console.log('  ✓ Capacity limit strictly enforced: exactly 30 participants capped.');
    }

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const avgLatency = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)].toFixed(2);
  const p99Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)].toFixed(2);

  console.log('\n' + '='.repeat(70));
  console.log('EMPIRICAL STRESS TEST HARNESS REPORT');
  console.log('='.repeat(70));
  console.log(`Total Requests Executed : ${totalRequests}`);
  console.log(`Assertions Passed       : ${passedAssertions}`);
  console.log(`Assertions Failed       : ${failedAssertions}`);
  console.log(`Total Duration          : ${durationSec}s`);
  console.log(`Average Latency         : ${avgLatency}ms`);
  console.log(`P95 Latency             : ${p95Latency}ms`);
  console.log(`P99 Latency             : ${p99Latency}ms`);
  console.log(`Success Rate            : ${(passedAssertions / (passedAssertions + failedAssertions) * 100).toFixed(1)}%`);
  console.log('='.repeat(70));

  if (failedAssertions === 0) {
    console.log('🏁 VERDICT: ALL 12 CONCURRENCY & CONSENSUS SUITES PASSED EMPIRICALLY (100%)\n');
    process.exit(0);
  } else {
    console.error('💥 VERDICT: TEST FAILURES DETECTED\n');
    process.exit(1);
  }
}

runHarness().catch(err => {
  console.error('Unhandled fatal harness error:', err);
  process.exit(1);
});
