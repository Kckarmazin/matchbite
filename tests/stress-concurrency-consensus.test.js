import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import { createApp } from '../server/index.js';
import { RoomStore } from '../server/models/RoomStore.js';
import { Broadcaster } from '../server/sync/Broadcaster.js';

describe('Empirical Adversarial Stress Testing: Concurrency & Consensus Engine', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  // Helper to construct a room with N participants and start voting
  async function createActiveVotingRoom(participantCount = 5, deckSize = 12) {
    const hostRes = await request(app)
      .post('/api/rooms')
      .send({
        hostName: 'HostUser',
        hostAvatar: '🍕',
        activityCategory: 'dining',
        deckSize,
      });

    expect([200, 201]).toContain(hostRes.status);
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

    for (let i = 1; i < participantCount; i++) {
      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({
          name: `GuestUser_${i}`,
          avatar: '🍔',
        });
      expect(joinRes.status).toBe(200);
      participants.push({
        id: joinRes.body.participant.id,
        name: `GuestUser_${i}`,
        sessionToken: joinRes.body.sessionToken,
        isHost: false,
      });
    }

    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-session-token', participants[0].sessionToken)
      .send({ participantId: participants[0].id });

    expect(startRes.status).toBe(200);
    expect(startRes.body.status).toBe('voting');
    const deck = startRes.body.deck;

    return { code, participants, deck };
  }

  // =========================================================================
  // SECTION 1: High Concurrency Multi-User Swiping
  // =========================================================================
  describe('1. High Concurrency Multi-User Swiping', () => {
    it('Simulates 5 participants concurrently voting across 12 venues (60 rapid requests)', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(5, 12);
      expect(participants.length).toBe(5);
      expect(deck.length).toBe(12);

      // Prepare 60 vote requests: each participant votes on all 12 venues
      // Participants 0..3 like venue 0, participant 4 passes venue 0 (no consensus on venue 0)
      // All 5 participants pass on venues 1..11
      const voteTasks = [];
      for (let pIdx = 0; pIdx < participants.length; pIdx++) {
        const p = participants[pIdx];
        for (let vIdx = 0; vIdx < deck.length; vIdx++) {
          const venue = deck[vIdx];
          const voteType = vIdx === 0 && pIdx < 4 ? 'like' : 'pass';
          voteTasks.push(
            request(app)
              .post(`/api/rooms/${code}/vote`)
              .set('x-session-token', p.sessionToken)
              .send({
                participantId: p.id,
                venueId: venue.id,
                vote: voteType,
              })
          );
        }
      }

      // Fire all 60 requests in parallel
      const responses = await Promise.all(voteTasks);

      // Verify 100% of responses succeeded with 200 OK
      expect(responses.length).toBe(60);
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.progress).toBeDefined();
      }

      // Verify room state consistency
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.status).toBe(200);
      const room = roomRes.body.room;

      // Since participant 4 passed venue 0 and all passed others, no unanimous match
      expect(room.status).toBe('voting');
      expect(room.matchedVenueId).toBeNull();

      // Verify every participant swiped all 12 cards
      for (const p of room.participants) {
        expect(p.swipedCount).toBe(12);
      }

      // Verify results leaderboard
      const resultsRes = await request(app).get(`/api/rooms/${code}/results`);
      expect(resultsRes.status).toBe(200);
      expect(resultsRes.body.leaderboard.length).toBe(12);

      const topVenue = resultsRes.body.leaderboard[0];
      expect(topVenue.venueId).toBe(deck[0].id);
      expect(topVenue.likeCount).toBe(4);
      expect(topVenue.passCount).toBe(1);
      expect(topVenue.isUnanimous).toBe(false);
    });

    it('Simulates 8 participants voting with scrambled/randomized order concurrently (96 requests)', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(8, 12);
      expect(participants.length).toBe(8);

      const voteTasks = [];
      for (const p of participants) {
        for (const venue of deck) {
          voteTasks.push({
            p,
            venueId: venue.id,
            vote: 'pass',
          });
        }
      }

      // Shuffle tasks to simulate asynchronous out-of-order network arrival
      const shuffledTasks = voteTasks.sort(() => Math.random() - 0.5);

      const responses = await Promise.all(
        shuffledTasks.map(t =>
          request(app)
            .post(`/api/rooms/${code}/vote`)
            .set('x-session-token', t.p.sessionToken)
            .send({
              participantId: t.p.id,
              venueId: t.venueId,
              vote: t.vote,
            })
        )
      );

      expect(responses.length).toBe(96);
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      for (const p of roomRes.body.room.participants) {
        expect(p.swipedCount).toBe(12);
      }
    });

    it('Executes high concurrency over live HTTP TCP server with 10 participants', async () => {
      const server = http.createServer(app);
      await new Promise(resolve => server.listen(0, resolve));
      const port = server.address().port;
      const baseUrl = `http://localhost:${port}`;

      try {
        // Create room via HTTP fetch
        const hostRes = await fetch(`${baseUrl}/api/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostName: 'HostNet', activityCategory: 'dining', deckSize: 6 }),
        });
        const hostData = await hostRes.json();
        const code = hostData.room.code;
        const participants = [
          {
            id: hostData.participant.id,
            sessionToken: hostData.sessionToken,
          },
        ];

        // 9 guests join
        for (let i = 1; i < 10; i++) {
          const joinRes = await fetch(`${baseUrl}/api/rooms/${code}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `NetGuest_${i}` }),
          });
          const joinData = await joinRes.json();
          participants.push({
            id: joinData.participant.id,
            sessionToken: joinData.sessionToken,
          });
        }

        // Start voting
        const startRes = await fetch(`${baseUrl}/api/rooms/${code}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-token': participants[0].sessionToken,
          },
          body: JSON.stringify({ participantId: participants[0].id }),
        });
        const startData = await startRes.json();
        const deck = startData.deck;
        expect(deck.length).toBe(6);

        // 10 participants concurrently cast 60 votes over real network sockets
        const fetchTasks = [];
        for (const p of participants) {
          for (const venue of deck) {
            fetchTasks.push(
              fetch(`${baseUrl}/api/rooms/${code}/vote`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-session-token': p.sessionToken,
                },
                body: JSON.stringify({
                  participantId: p.id,
                  venueId: venue.id,
                  vote: 'like', // All like -> first card should trigger unanimous match!
                }),
              }).then(r => r.json())
            );
          }
        }

        const results = await Promise.all(fetchTasks);
        expect(results.length).toBe(60);

        for (const r of results) {
          expect(r.success).toBe(true);
        }

        // Verify room matched
        const roomCheck = await fetch(`${baseUrl}/api/rooms/${code}`).then(r => r.json());
        expect(roomCheck.room.status).toBe('matched');
        expect(roomCheck.room.matchedVenueId).toBeTruthy();
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    });
  });

  // =========================================================================
  // SECTION 2: Race Condition Validation & Double-Match Prevention
  // =========================================================================
  describe('2. Race Condition Validation & Double-Match Prevention', () => {
    it('Simultaneous unanimous like votes trigger consensus with zero double-matches and single broadcast', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(5, 8);
      const targetVenue = deck[0];

      let matchBroadcastCount = 0;
      let revealedPayload = null;
      broadcaster.broadcast = (bCode, eventName, data) => {
        if (eventName === 'match:revealed') {
          matchBroadcastCount++;
          revealedPayload = data;
        }
      };

      // All 5 participants fire their like vote simultaneously on targetVenue
      const voteResponses = await Promise.all(
        participants.map(p =>
          request(app)
            .post(`/api/rooms/${code}/vote`)
            .set('x-session-token', p.sessionToken)
            .send({
              participantId: p.id,
              venueId: targetVenue.id,
              vote: 'like',
            })
        )
      );

      // Verify all 5 votes succeeded
      for (const res of voteResponses) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      // Exactly ONE vote transitioned the room and triggered the broadcast
      expect(matchBroadcastCount).toBe(1);
      expect(revealedPayload.venueId).toBe(targetVenue.id);
      expect(revealedPayload.isUnanimous).toBe(true);

      // The last response in event loop returned isMatch: true and matchedVenue
      // And room status is locked
      const finalRoomRes = await request(app).get(`/api/rooms/${code}`);
      expect(finalRoomRes.body.room.status).toBe('matched');
      expect(finalRoomRes.body.room.matchedVenueId).toBe(targetVenue.id);
    });

    it('Simultaneous dual-venue unanimous race: second unanimous venue does NOT overwrite first winner', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(4, 6);
      const venueA = deck[0];
      const venueB = deck[1];

      let matchBroadcasts = [];
      broadcaster.broadcast = (bCode, eventName, data) => {
        if (eventName === 'match:revealed') {
          matchBroadcasts.push(data);
        }
      };

      // 4 participants vote like on BOTH Venue A and Venue B simultaneously (8 requests total)
      const tasks = [];
      for (const p of participants) {
        tasks.push(
          request(app)
            .post(`/api/rooms/${code}/vote`)
            .set('x-session-token', p.sessionToken)
            .send({ participantId: p.id, venueId: venueA.id, vote: 'like' }),
          request(app)
            .post(`/api/rooms/${code}/vote`)
            .set('x-session-token', p.sessionToken)
            .send({ participantId: p.id, venueId: venueB.id, vote: 'like' })
        );
      }

      const results = await Promise.all(tasks);
      expect(results.length).toBe(8);

      // Room must be matched
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('matched');

      // The matchedVenueId must be either venueA or venueB, but NOT both and NOT overwritten
      const winningId = roomRes.body.room.matchedVenueId;
      expect([venueA.id, venueB.id]).toContain(winningId);

      // Crucial: exactly ONE match:revealed broadcast was emitted for the room winner
      expect(matchBroadcasts.length).toBe(1);
      expect(matchBroadcasts[0].venueId).toBe(winningId);

      // Leaderboard shows both venues received unanimous approval, but room lock is preserved
      const resultsRes = await request(app).get(`/api/rooms/${code}/results`);
      expect(resultsRes.body.matchedVenueId).toBe(winningId);
      const matchedLeaderboardEntry = resultsRes.body.leaderboard.find(v => v.venueId === winningId);
      expect(matchedLeaderboardEntry.isUnanimous).toBe(true);
    });

    it('Simultaneous like vs pass: 4 likes and 1 pass arriving simultaneously produces NO match', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(5, 6);
      const testVenue = deck[0];

      let matchEmitted = false;
      broadcaster.broadcast = (bCode, eventName) => {
        if (eventName === 'match:revealed') matchEmitted = true;
      };

      // P0..3 vote 'like', P4 votes 'pass' simultaneously
      const responses = await Promise.all([
        request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[0].sessionToken).send({ participantId: participants[0].id, venueId: testVenue.id, vote: 'like' }),
        request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[1].sessionToken).send({ participantId: participants[1].id, venueId: testVenue.id, vote: 'like' }),
        request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[2].sessionToken).send({ participantId: participants[2].id, venueId: testVenue.id, vote: 'like' }),
        request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[3].sessionToken).send({ participantId: participants[3].id, venueId: testVenue.id, vote: 'like' }),
        request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[4].sessionToken).send({ participantId: participants[4].id, venueId: testVenue.id, vote: 'pass' }),
      ]);

      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      // Assert NO match occurred
      expect(matchEmitted).toBe(false);
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('voting');
      expect(roomRes.body.room.matchedVenueId).toBeNull();
    });

    it('Post-match vote bombardment: subsequent 40 votes on other cards maintain matched winner lock', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(4, 8);
      const winningVenue = deck[0];

      // Achieve unanimous match on winningVenue
      for (const p of participants) {
        await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', p.sessionToken)
          .send({ participantId: p.id, venueId: winningVenue.id, vote: 'like' });
      }

      const roomRes1 = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes1.body.room.status).toBe('matched');
      expect(roomRes1.body.room.matchedVenueId).toBe(winningVenue.id);

      // Now bombard room with 40 votes on other cards
      const postMatchTasks = [];
      for (const p of participants) {
        for (let i = 1; i < deck.length; i++) {
          postMatchTasks.push(
            request(app)
              .post(`/api/rooms/${code}/vote`)
              .set('x-session-token', p.sessionToken)
              .send({ participantId: p.id, venueId: deck[i].id, vote: 'like' })
          );
        }
      }

      const postResponses = await Promise.all(postMatchTasks);
      for (const res of postResponses) {
        expect(res.status).toBe(200);
        // All post-match votes should return isMatch: true and identify winningVenue
        expect(res.body.isMatch).toBe(true);
        expect(res.body.matchedVenue.id).toBe(winningVenue.id);
      }

      // Verify room remains locked to winningVenue
      const roomRes2 = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes2.body.room.status).toBe('matched');
      expect(roomRes2.body.room.matchedVenueId).toBe(winningVenue.id);
    });
  });

  // =========================================================================
  // SECTION 3: Unanimous vs Non-Unanimous Vote Permutations
  // =========================================================================
  describe('3. Unanimous vs Non-Unanimous Permutations', () => {
    it('Permutation: 5/5 All Like -> 100% unanimous match', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(5, 5);
      const venue = deck[0];

      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', participants[i].sessionToken)
          .send({ participantId: participants[i].id, venueId: venue.id, vote: 'like' });
        expect(res.body.isMatch).toBe(false);
      }

      // 5th like triggers match
      const finalRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', participants[4].sessionToken)
        .send({ participantId: participants[4].id, venueId: venue.id, vote: 'like' });

      expect(finalRes.body.isMatch).toBe(true);
      expect(finalRes.body.matchedVenue.id).toBe(venue.id);

      const resultsRes = await request(app).get(`/api/rooms/${code}/results`);
      const vResult = resultsRes.body.leaderboard.find(l => l.venueId === venue.id);
      expect(vResult.isUnanimous).toBe(true);
      expect(vResult.approvalRate).toBe(100);
      expect(vResult.likeCount).toBe(5);
      expect(vResult.score).toBe(5);
    });

    it('Permutation: N-1 Likes, 1 Pass -> NO match (Pass vetoes)', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(5, 5);
      const venue = deck[0];

      for (let i = 0; i < 4; i++) {
        await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', participants[i].sessionToken)
          .send({ participantId: participants[i].id, venueId: venue.id, vote: 'like' });
      }

      // 5th participant passes
      const finalRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', participants[4].sessionToken)
        .send({ participantId: participants[4].id, venueId: venue.id, vote: 'pass' });

      expect(finalRes.body.isMatch).toBe(false);
      expect(finalRes.body.matchedVenue).toBeNull();

      const resultsRes = await request(app).get(`/api/rooms/${code}/results`);
      const vResult = resultsRes.body.leaderboard.find(l => l.venueId === venue.id);
      expect(vResult.isUnanimous).toBe(false);
      expect(vResult.approvalRate).toBe(80);
      expect(vResult.likeCount).toBe(4);
      expect(vResult.passCount).toBe(1);
      expect(vResult.score).toBe(4);
    });

    it('Permutation: 5/5 All Pass -> 0% approval, NO match', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(5, 5);
      const venue = deck[0];

      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', participants[i].sessionToken)
          .send({ participantId: participants[i].id, venueId: venue.id, vote: 'pass' });
        expect(res.body.isMatch).toBe(false);
      }

      const resultsRes = await request(app).get(`/api/rooms/${code}/results`);
      const vResult = resultsRes.body.leaderboard.find(l => l.venueId === venue.id);
      expect(vResult.isUnanimous).toBe(false);
      expect(vResult.approvalRate).toBe(0);
      expect(vResult.passCount).toBe(5);
      expect(vResult.score).toBe(0);
    });

    it('Permutation: Superlike combinations and score weighting', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(4, 5);
      const venueAllSuper = deck[0];
      const venueMixed = deck[1];
      const venueSuperWithPass = deck[2];

      // Venue 0: 4 Superlikes -> Match, Score = 4 * 3 = 12
      for (const p of participants) {
        await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', p.sessionToken)
          .send({ participantId: p.id, venueId: venueAllSuper.id, vote: 'superlike' });
      }

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('matched');
      expect(roomRes.body.room.matchedVenueId).toBe(venueAllSuper.id);

      // Venue 1: 2 superlikes + 2 likes -> Score = (2*3) + (2*1) = 8
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[0].sessionToken).send({ participantId: participants[0].id, venueId: venueMixed.id, vote: 'superlike' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[1].sessionToken).send({ participantId: participants[1].id, venueId: venueMixed.id, vote: 'superlike' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[2].sessionToken).send({ participantId: participants[2].id, venueId: venueMixed.id, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[3].sessionToken).send({ participantId: participants[3].id, venueId: venueMixed.id, vote: 'like' });

      // Venue 2: 3 superlikes + 1 pass -> Score = 3*3 = 9, but NOT unanimous
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[0].sessionToken).send({ participantId: participants[0].id, venueId: venueSuperWithPass.id, vote: 'superlike' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[1].sessionToken).send({ participantId: participants[1].id, venueId: venueSuperWithPass.id, vote: 'superlike' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[2].sessionToken).send({ participantId: participants[2].id, venueId: venueSuperWithPass.id, vote: 'superlike' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[3].sessionToken).send({ participantId: participants[3].id, venueId: venueSuperWithPass.id, vote: 'pass' });

      const resultsRes = await request(app).get(`/api/rooms/${code}/results`);
      const rAllSuper = resultsRes.body.leaderboard.find(v => v.venueId === venueAllSuper.id);
      const rMixed = resultsRes.body.leaderboard.find(v => v.venueId === venueMixed.id);
      const rSuperWithPass = resultsRes.body.leaderboard.find(v => v.venueId === venueSuperWithPass.id);

      expect(rAllSuper.score).toBe(12);
      expect(rAllSuper.isUnanimous).toBe(true);

      expect(rMixed.score).toBe(8);
      expect(rMixed.isUnanimous).toBe(true);
      expect(rMixed.superlikeCount).toBe(2);
      expect(rMixed.likeCount).toBe(2);

      expect(rSuperWithPass.score).toBe(9);
      expect(rSuperWithPass.isUnanimous).toBe(false);
      expect(rSuperWithPass.passCount).toBe(1);

      // Superlike weighting: Venue 0 (score 12) > Venue 2 (score 9) > Venue 1 (score 8)
      expect(resultsRes.body.leaderboard[0].venueId).toBe(venueAllSuper.id);
      expect(resultsRes.body.leaderboard[1].venueId).toBe(venueSuperWithPass.id);
      expect(resultsRes.body.leaderboard[2].venueId).toBe(venueMixed.id);
    });

    it('Permutation: Solo room (1 participant) matches instantly on first like or superlike', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(1, 4);
      const solo = participants[0];

      // Pass on venue 0 -> No match
      const passRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', solo.sessionToken)
        .send({ participantId: solo.id, venueId: deck[0].id, vote: 'pass' });
      expect(passRes.body.isMatch).toBe(false);

      // Like on venue 1 -> Instant match
      const likeRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', solo.sessionToken)
        .send({ participantId: solo.id, venueId: deck[1].id, vote: 'like' });
      expect(likeRes.body.isMatch).toBe(true);
      expect(likeRes.body.matchedVenue.id).toBe(deck[1].id);

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('matched');
    });

    it('Permutation: Large 10-person room requires 10/10 agreement (9 likes + 1 pass fails)', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(10, 4);
      const venue = deck[0];

      // 9 participants vote like
      for (let i = 0; i < 9; i++) {
        const res = await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', participants[i].sessionToken)
          .send({ participantId: participants[i].id, venueId: venue.id, vote: 'like' });
        expect(res.body.isMatch).toBe(false);
      }

      // 10th participant votes pass
      const passRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', participants[9].sessionToken)
        .send({ participantId: participants[9].id, venueId: venue.id, vote: 'pass' });
      expect(passRes.body.isMatch).toBe(false);

      // On venue 1, all 10 participants vote like
      for (let i = 0; i < 9; i++) {
        await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', participants[i].sessionToken)
          .send({ participantId: participants[i].id, venueId: deck[1].id, vote: 'like' });
      }
      const matchRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', participants[9].sessionToken)
        .send({ participantId: participants[9].id, venueId: deck[1].id, vote: 'like' });

      expect(matchRes.body.isMatch).toBe(true);
      expect(matchRes.body.matchedVenue.id).toBe(deck[1].id);
    });
  });

  // =========================================================================
  // SECTION 4: Boundary & Concurrency Attacks
  // =========================================================================
  describe('4. Boundary & Concurrency Attacks', () => {
    it('Rapid duplicate vote spam from single user is idempotent and does not corrupt swipedCount', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(3, 4);
      const p1 = participants[0];
      const venue = deck[0];

      // Fire 25 identical concurrent like requests from p1
      const spamRequests = Array.from({ length: 25 }, () =>
        request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', p1.sessionToken)
          .send({ participantId: p1.id, venueId: venue.id, vote: 'like' })
      );

      const responses = await Promise.all(spamRequests);
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.progress.swipedCount).toBe(1);
      }

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      const hostState = roomRes.body.room.participants.find(p => p.id === p1.id);
      expect(hostState.swipedCount).toBe(1); // strictly 1, never inflated
    });

    it('Unauthorized token injection attempts during concurrent voting are rejected with 403', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(3, 4);
      const legitimate = participants[0];
      const attackerFakeToken = 'st-fake-token-666';

      const tasks = [
        // 5 legitimate votes
        request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', legitimate.sessionToken).send({ participantId: legitimate.id, venueId: deck[0].id, vote: 'like' }),
        // 5 attacker spoofing legitimate participantId
        request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', attackerFakeToken).send({ participantId: legitimate.id, venueId: deck[1].id, vote: 'like' }),
        // attacker with missing token
        request(app).post(`/api/rooms/${code}/vote`).send({ participantId: legitimate.id, venueId: deck[2].id, vote: 'like' }),
      ];

      const [legitRes, spoofRes, noTokenRes] = await Promise.all(tasks);
      expect(legitRes.status).toBe(200);
      expect(spoofRes.status).toBe(403);
      expect(noTokenRes.status).toBe(403);
    });

    it('Voting rejects invalid room state: lobby rejects with 400, closed rejects with 409', async () => {
      // Create room in lobby
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'HostState' });
      const code = hostRes.body.room.code;
      const hostId = hostRes.body.participant.id;
      const hostToken = hostRes.body.sessionToken;

      // Try voting while still in lobby
      const lobbyVote = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: 'venue-001', vote: 'like' });
      expect(lobbyVote.status).toBe(400);
      expect(lobbyVote.body.error).toContain('Voting has not started');

      // Start voting
      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId });

      // Close room manually in store
      const internalRoom = roomStore.getRoom(code);
      internalRoom.status = 'closed';

      // Try voting while closed
      const closedVote = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: 'venue-001', vote: 'like' });
      expect(closedVote.status).toBe(409);
      expect(closedVote.body.error).toContain('closed');
    });

    it('Dynamic vote flipping: participant flips vote from pass to like mid-round, unlocking unanimous match', async () => {
      const { code, participants, deck } = await createActiveVotingRoom(3, 4);
      const venue = deck[0];

      // P0 and P1 vote like
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[0].sessionToken).send({ participantId: participants[0].id, venueId: venue.id, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[1].sessionToken).send({ participantId: participants[1].id, venueId: venue.id, vote: 'like' });

      // P2 votes pass initially -> No match
      const initialP2Res = await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[2].sessionToken).send({ participantId: participants[2].id, venueId: venue.id, vote: 'pass' });
      expect(initialP2Res.body.isMatch).toBe(false);

      const roomMidRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomMidRes.body.room.status).toBe('voting');

      // P2 changes mind to like -> Triggers instant consensus!
      const flippedP2Res = await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', participants[2].sessionToken).send({ participantId: participants[2].id, venueId: venue.id, vote: 'like' });
      expect(flippedP2Res.body.isMatch).toBe(true);
      expect(flippedP2Res.body.matchedVenue.id).toBe(venue.id);

      const roomFinalRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomFinalRes.body.room.status).toBe('matched');
      expect(roomFinalRes.body.room.matchedVenueId).toBe(venue.id);
    });

    it('Concurrent capacity saturation: 35 concurrent joins strictly cap room at MAX_PARTICIPANTS (30)', async () => {
      const hostRes = await request(app).post('/api/rooms').send({ hostName: 'HostCapacity' });
      const code = hostRes.body.room.code;

      // 35 simultaneous join requests
      const joinTasks = Array.from({ length: 35 }, (_, idx) =>
        request(app).post(`/api/rooms/${code}/join`).send({ name: `Contender_${idx}` })
      );

      const results = await Promise.all(joinTasks);
      const successes = results.filter(r => r.status === 200);
      const rejections = results.filter(r => r.status === 409);

      // 1 host already exists, so 29 guests succeed, 6 fail
      expect(successes.length).toBe(29);
      expect(rejections.length).toBe(6);

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.participantCount).toBe(30);
    });
  });
});

