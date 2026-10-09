import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('Tier 3: Cross-Feature Combinations & Complex Interactions', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  // Helper to create and start a multi-user room
  async function setupRoomWithUsers(userNames = ['Alice', 'Bob'], category = 'dining', deckSize = 6) {
    const hostRes = await request(app)
      .post('/api/rooms')
      .send({
        hostName: userNames[0],
        activityCategory: category,
        deckSize,
      });

    const code = hostRes.body.room.code;
    const hostAuth = {
      id: hostRes.body.participant.id,
      sessionToken: hostRes.body.sessionToken,
      hostKey: hostRes.body.hostKey,
    };

    const participants = [hostAuth];

    for (let i = 1; i < userNames.length; i++) {
      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: userNames[i] });

      participants.push({
        id: joinRes.body.participant.id,
        sessionToken: joinRes.body.sessionToken,
      });
    }

    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-host-key', hostAuth.hostKey)
      .send({ participantId: hostAuth.id });

    return { code, hostAuth, participants, deck: startRes.body.deck };
  }

  it('Interaction 1: Voting -> Unanimous Match -> Affiliate Action URL verification', async () => {
    const { code, participants, deck } = await setupRoomWithUsers(['Alice', 'Bob'], 'dining', 5);
    const targetVenue = deck[0];

    // Alice votes like
    const vote1 = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', participants[0].sessionToken)
      .send({ participantId: participants[0].id, venueId: targetVenue.id, vote: 'like' })
      .expect(200);

    expect(vote1.body.isMatch).toBe(false);

    // Bob votes like -> triggers unanimous match!
    const vote2 = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', participants[1].sessionToken)
      .send({ participantId: participants[1].id, venueId: targetVenue.id, vote: 'like' })
      .expect(200);

    expect(vote2.body.isMatch).toBe(true);
    expect(vote2.body.matchedVenue.id).toBe(targetVenue.id);

    // Verify affiliate reservation redirect for the matched venue
    const redirectRes = await request(app)
      .get(`/api/affiliate/redirect?partner=opentable&venueId=${targetVenue.id}&action=reserve&format=json`)
      .expect(200);

    expect(redirectRes.body.destinationUrl).toContain('opentable.com');
    expect(redirectRes.body.destinationUrl).toContain('utm_source=matchbite');
    expect(redirectRes.body.destinationUrl).toContain('utm_medium=referral');
  });

  it('Interaction 2: Deck completion -> Tiebreaker Wheel -> Winner -> Delivery Redirect', async () => {
    const { code, hostAuth, participants, deck } = await setupRoomWithUsers(['Alex', 'Sam'], 'dining', 4);

    // Split votes on all cards (Alex likes, Sam passes)
    for (const card of deck) {
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', participants[0].sessionToken)
        .send({ participantId: participants[0].id, venueId: card.id, vote: 'like' });

      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', participants[1].sessionToken)
        .send({ participantId: participants[1].id, venueId: card.id, vote: 'pass' });
    }

    // Check room has no unanimous match
    const roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
    expect(roomRes.body.room.status).not.toBe('matched');

    // Host spins tiebreaker wheel targeting second contender
    const winningCandidate = deck[1];
    const spinRes = await request(app)
      .post(`/api/rooms/${code}/tiebreaker/spin`)
      .set('x-host-key', hostAuth.hostKey)
      .send({
        participantId: hostAuth.id,
        winningVenueId: winningCandidate.id,
      })
      .expect(200);

    expect(spinRes.body.success).toBe(true);
    expect(spinRes.body.winningVenueId).toBe(winningCandidate.id);

    // Verify outbound DoorDash delivery redirect for winner
    const deliveryRes = await request(app)
      .get(`/api/affiliate/redirect?partner=doordash&venueId=${winningCandidate.id}&action=delivery&format=json`)
      .expect(200);

    expect(deliveryRes.body.destinationUrl).toContain('doordash.com');
    expect(deliveryRes.body.destinationUrl).toContain('action=delivery');
  });

  it('Interaction 3: Promoted Card Consensus -> Sponsor Badge & utm_term=promoted attribution', async () => {
    const { code, participants, deck } = await setupRoomWithUsers(['Jordan', 'Taylor'], 'bars', 6);
    const promotedCard = deck.find(v => v.isPromoted === true);
    expect(promotedCard).toBeDefined();

    // Both swipe superlike on promoted card
    await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', participants[0].sessionToken)
      .send({ participantId: participants[0].id, venueId: promotedCard.id, vote: 'superlike' });

    const matchRes = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', participants[1].sessionToken)
      .send({ participantId: participants[1].id, venueId: promotedCard.id, vote: 'superlike' })
      .expect(200);

    expect(matchRes.body.isMatch).toBe(true);
    expect(matchRes.body.matchedVenue.isPromoted).toBe(true);

    // Outbound affiliate link contains promoted tag
    const redirectRes = await request(app)
      .get(`/api/affiliate/redirect?partner=resy&venueId=${promotedCard.id}&promoted=true&format=json`)
      .expect(200);

    expect(redirectRes.body.promoted).toBe(true);
    expect(redirectRes.body.destinationUrl).toContain('utm_term=promoted');
  });

  it('Interaction 4: Mid-Session VIP Upgrade -> Custom Venue Injection -> Instant Swiping & Match', async () => {
    const { code, hostAuth, participants } = await setupRoomWithUsers(['Elena', 'Marcus'], 'dining', 4);

    // Room upgrades to VIP using free coupon
    const upgradeRes = await request(app)
      .post(`/api/rooms/${code}/upgrade`)
      .set('x-session-token', hostAuth.sessionToken)
      .send({
        participantId: hostAuth.id,
        couponCode: 'VIPFREE',
      })
      .expect(200);

    expect(upgradeRes.body.isVip).toBe(true);

    // VIP injects custom favorite restaurant
    const customVenueRes = await request(app)
      .post(`/api/rooms/${code}/custom-venue`)
      .set('x-session-token', hostAuth.sessionToken)
      .send({
        participantId: hostAuth.id,
        name: 'Mama Maria Secret Trattoria',
        cuisine: 'Calabrian Italian',
      })
      .expect(200);

    const customVenue = customVenueRes.body.venue;
    expect(customVenue.isCustom).toBe(true);

    // Both participants vote 'like' on the injected custom venue
    await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', participants[0].sessionToken)
      .send({ participantId: participants[0].id, venueId: customVenue.id, vote: 'like' });

    const finalVote = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', participants[1].sessionToken)
      .send({ participantId: participants[1].id, venueId: customVenue.id, vote: 'like' })
      .expect(200);

    expect(finalVote.body.isMatch).toBe(true);
    expect(finalVote.body.matchedVenue.name).toBe('Mama Maria Secret Trattoria');
    expect(finalVote.body.matchedVenue.isCustom).toBe(true);
  });

  it('Interaction 5: Leaderboard Manual Selection -> Winning Match -> Reservation Link', async () => {
    const { code, hostAuth, deck } = await setupRoomWithUsers(['HostDan', 'GuestEva'], 'dining', 5);
    const chosen = deck[2];

    const selectRes = await request(app)
      .post(`/api/rooms/${code}/tiebreaker/select`)
      .set('x-host-key', hostAuth.hostKey)
      .send({
        participantId: hostAuth.id,
        venueId: chosen.id,
      })
      .expect(200);

    expect(selectRes.body.venueId).toBe(chosen.id);

    const roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
    expect(roomRes.body.room.status).toBe('matched');
    expect(roomRes.body.room.matchedVenueId).toBe(chosen.id);

    const redirectRes = await request(app)
      .get(`/api/affiliate/redirect?partner=opentable&venueId=${chosen.id}&action=reserve&format=json`)
      .expect(200);

    expect(redirectRes.body.venueId).toBe(chosen.id);
  });

  it('Interaction 6: Tiebreaker Spin -> Round Restart -> Fresh Voting Round -> Unanimous Consensus', async () => {
    const { code, hostAuth, participants, deck } = await setupRoomWithUsers(['HostLiam', 'GuestNoah'], 'dining', 4);

    // Spin tiebreaker
    await request(app)
      .post(`/api/rooms/${code}/tiebreaker/spin`)
      .set('x-host-key', hostAuth.hostKey)
      .send({ participantId: hostAuth.id })
      .expect(200);

    let roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
    expect(roomRes.body.room.status).toBe('matched');

    // Host restarts session to swipe again
    const restartRes = await request(app)
      .post(`/api/rooms/${code}/restart`)
      .set('x-host-key', hostAuth.hostKey)
      .send({ participantId: hostAuth.id })
      .expect(200);

    expect(restartRes.body.status).toBe('voting');

    roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
    expect(roomRes.body.room.status).toBe('voting');
    expect(roomRes.body.room.matchedVenueId).toBeNull();

    // New round voting achieves unanimous match on deck[0]
    await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', participants[0].sessionToken)
      .send({ participantId: participants[0].id, venueId: deck[0].id, vote: 'like' });

    const newRoundMatch = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', participants[1].sessionToken)
      .send({ participantId: participants[1].id, venueId: deck[0].id, vote: 'like' })
      .expect(200);

    expect(newRoundMatch.body.isMatch).toBe(true);
    expect(newRoundMatch.body.matchedVenue.id).toBe(deck[0].id);
  });
});
