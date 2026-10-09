import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('Tier 4: Real-World Workload Scenarios', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  // =========================================================================
  // SCENARIO 1: Couples Date Night
  // =========================================================================
  it('Scenario 1: Couples Date Night (2 users, dining, instant match & reservation)', async () => {
    // 1. Partner A creates a romantic dining room
    const createRes = await request(app)
      .post('/api/rooms')
      .send({
        hostName: 'Chloe',
        hostAvatar: '👩‍🦰',
        groupType: 'couples',
        activityCategory: 'dining',
        priceRange: [2, 3],
        distance: 'walkable',
        deckSize: 8,
      })
      .expect(201);

    const code = createRes.body.room.code;
    const partnerA = {
      id: createRes.body.participant.id,
      sessionToken: createRes.body.sessionToken,
      hostKey: createRes.body.hostKey,
    };

    // 2. Partner B joins via 1-tap link code
    const joinRes = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({
        name: 'Liam',
        avatar: '👨‍🦱',
      })
      .expect(200);

    const partnerB = {
      id: joinRes.body.participant.id,
      sessionToken: joinRes.body.sessionToken,
    };

    // 3. Partner A starts voting
    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-host-key', partnerA.hostKey)
      .send({ participantId: partnerA.id })
      .expect(200);

    const deck = startRes.body.deck;
    expect(deck.length).toBeGreaterThanOrEqual(4);

    // Target a spot both like (deck[1])
    const chosenSpot = deck[1];

    // Card 0: Chloe likes, Liam passes
    await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', partnerA.sessionToken)
      .send({ participantId: partnerA.id, venueId: deck[0].id, vote: 'like' })
      .expect(200);

    await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', partnerB.sessionToken)
      .send({ participantId: partnerB.id, venueId: deck[0].id, vote: 'pass' })
      .expect(200);

    // Card 1: Chloe superlikes
    const chloeVote = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', partnerA.sessionToken)
      .send({ participantId: partnerA.id, venueId: chosenSpot.id, vote: 'superlike' })
      .expect(200);

    expect(chloeVote.body.isMatch).toBe(false);

    // Liam also likes Card 1 -> instant celebratory match!
    const liamVote = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', partnerB.sessionToken)
      .send({ participantId: partnerB.id, venueId: chosenSpot.id, vote: 'like' })
      .expect(200);

    expect(liamVote.body.isMatch).toBe(true);
    expect(liamVote.body.matchedVenue.id).toBe(chosenSpot.id);

    // 4. Partner A clicks "Reserve Table" -> tracked OpenTable redirect
    const redirectRes = await request(app)
      .get(`/api/affiliate/redirect?partner=opentable&venueId=${chosenSpot.id}&action=reserve&format=json`)
      .expect(200);

    expect(redirectRes.body.success).toBe(true);
    expect(redirectRes.body.destinationUrl).toContain('opentable.com');
    expect(redirectRes.body.destinationUrl).toContain('utm_source=matchbite');
  });

  // =========================================================================
  // SCENARIO 2: Friday Friends Bar Crawl
  // =========================================================================
  it('Scenario 2: Friday Friends Bar Crawl (4 users, nightlife, split votes, roulette tiebreaker)', async () => {
    // 1. Host creates bar crawl session
    const createRes = await request(app)
      .post('/api/rooms')
      .send({
        hostName: 'Maya',
        hostAvatar: '🍸',
        groupType: 'friends',
        activityCategory: 'bars',
        deckSize: 6,
      })
      .expect(201);

    const code = createRes.body.room.code;
    const host = {
      id: createRes.body.participant.id,
      sessionToken: createRes.body.sessionToken,
      hostKey: createRes.body.hostKey,
    };

    // 2. 3 friends join
    const friends = [host];
    for (const name of ['Zack', 'Devon', 'Nia']) {
      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name })
        .expect(200);
      friends.push({
        id: joinRes.body.participant.id,
        sessionToken: joinRes.body.sessionToken,
      });
    }

    expect(friends.length).toBe(4);

    // 3. Start voting
    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-host-key', host.hostKey)
      .send({ participantId: host.id })
      .expect(200);

    const deck = startRes.body.deck;

    // 4. All 4 participants swipe on all cards, but no venue gets 100% agreement (split votes)
    for (let i = 0; i < deck.length; i++) {
      const card = deck[i];
      // 2 friends like, 2 friends pass
      for (let f = 0; f < friends.length; f++) {
        const vote = (f + i) % 2 === 0 ? 'like' : 'pass';
        await request(app)
          .post(`/api/rooms/${code}/vote`)
          .set('x-session-token', friends[f].sessionToken)
          .send({ participantId: friends[f].id, venueId: card.id, vote });
      }
    }

    // Verify room has NOT reached unanimous match
    const roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
    expect(roomRes.body.room.matchedVenueId).toBeNull();

    // 5. Host fetches tiebreaker candidates
    const candidatesRes = await request(app)
      .get(`/api/rooms/${code}/tiebreaker/candidates`)
      .expect(200);

    expect(candidatesRes.body.candidates.length).toBeGreaterThanOrEqual(2);

    // 6. Host triggers synchronized Decision Roulette Wheel spin
    const spinRes = await request(app)
      .post(`/api/rooms/${code}/tiebreaker/spin`)
      .set('x-host-key', host.hostKey)
      .send({ participantId: host.id })
      .expect(200);

    expect(spinRes.body.success).toBe(true);
    expect(spinRes.body.winningVenueId).toBeDefined();

    // 7. Verify winning venue is locked in and directions URL is available
    const postSpinRoom = await request(app).get(`/api/rooms/${code}`).expect(200);
    expect(postSpinRoom.body.room.status).toBe('matched');
    expect(postSpinRoom.body.room.matchedVenueId).toBe(spinRes.body.winningVenueId);

    // 8. Participants get directions via Google Maps
    const mapsRes = await request(app)
      .get(`/api/affiliate/redirect?partner=googlemaps&venueId=${spinRes.body.winningVenueId}&action=directions&format=json`)
      .expect(200);

    expect(mapsRes.body.destinationUrl).toContain('maps.google.com');
  });

  // =========================================================================
  // SCENARIO 3: Coworker Lunch Indecision
  // =========================================================================
  it('Scenario 3: Coworker Lunch Indecision (5 users, promoted perk, VIP upgrade & secret taco truck)', async () => {
    // 1. Coworker creates lunch session
    const createRes = await request(app)
      .post('/api/rooms')
      .send({
        hostName: 'Sarah (PM)',
        hostAvatar: '💼',
        groupType: 'coworkers',
        activityCategory: 'dining',
        deckSize: 6,
      })
      .expect(201);

    const code = createRes.body.room.code;
    const host = {
      id: createRes.body.participant.id,
      sessionToken: createRes.body.sessionToken,
      hostKey: createRes.body.hostKey,
    };

    // 2. 4 coworkers join
    const team = [host];
    for (const name of ['Kevin (Eng)', 'Priya (Design)', 'Brian (Sales)', 'Rachel (HR)']) {
      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name })
        .expect(200);
      team.push({
        id: joinRes.body.participant.id,
        sessionToken: joinRes.body.sessionToken,
      });
    }

    expect(team.length).toBe(5);

    // 3. Start voting
    await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-host-key', host.hostKey)
      .send({ participantId: host.id })
      .expect(200);

    // 4. Host upgrades room to VIP with test coupon VIPFREE
    const upgradeRes = await request(app)
      .post(`/api/rooms/${code}/upgrade`)
      .set('x-session-token', host.sessionToken)
      .send({
        participantId: host.id,
        couponCode: 'VIPFREE',
      })
      .expect(200);

    expect(upgradeRes.body.isVip).toBe(true);

    // 5. Host injects the office favorite food truck into the active deck
    const truckRes = await request(app)
      .post(`/api/rooms/${code}/custom-venue`)
      .set('x-session-token', host.sessionToken)
      .send({
        participantId: host.id,
        name: 'El Jefe Secret Birria Truck',
        cuisine: 'Mexican Street Food',
        priceTier: 1,
        address: 'Parked outside building B',
      })
      .expect(200);

    const customTruck = truckRes.body.venue;
    expect(customTruck.isCustom).toBe(true);

    // 6. All 5 team members swipe 'superlike' or 'like' on the secret taco truck
    for (let i = 0; i < team.length; i++) {
      const voteType = i === 0 ? 'superlike' : 'like';
      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', team[i].sessionToken)
        .send({
          participantId: team[i].id,
          venueId: customTruck.id,
          vote: voteType,
        })
        .expect(200);

      if (i === team.length - 1) {
        // Last vote triggers unanimous agreement
        expect(voteRes.body.isMatch).toBe(true);
        expect(voteRes.body.matchedVenue.name).toBe('El Jefe Secret Birria Truck');
      }
    }

    // 7. Team orders lunch via DoorDash delivery redirect
    const orderRes = await request(app)
      .get(`/api/affiliate/redirect?partner=doordash&venueId=${customTruck.id}&action=delivery&format=json`)
      .expect(200);

    expect(orderRes.body.destinationUrl).toContain('doordash.com');
  });
});
