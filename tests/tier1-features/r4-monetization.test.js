import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('R4: Monetization & VIP Checkout', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  // Helper: Setup room
  async function setupRoom() {
    const hostRes = await request(app)
      .post('/api/rooms')
      .send({
        hostName: 'HostAlice',
        hostAvatar: '🍕',
        deckSize: 8,
      });

    const code = hostRes.body.room.code;
    const hostAuth = {
      id: hostRes.body.participant.id,
      sessionToken: hostRes.body.sessionToken,
      hostKey: hostRes.body.hostKey,
    };

    return { code, hostAuth, room: hostRes.body.room };
  }

  // =========================================================================
  // SUITE 1: Outbound Tracked Affiliate Redirects & Analytics
  // =========================================================================
  describe('Suite 1: Outbound Tracked Affiliate Redirects & Analytics', () => {
    it('redirects with 302 and sets Location with standard UTM parameters', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect?partner=opentable&venueId=venue-001&action=reserve')
        .expect(302);

      const location = res.headers.location;
      expect(location).toBeDefined();
      expect(location).toContain('opentable.com');
      expect(location).toContain('utm_source=matchbite');
      expect(location).toContain('utm_medium=referral');
      expect(location).toContain('utm_campaign=group_decision');
      expect(location).toContain('utm_content=opentable');
      expect(location).toContain('action=reserve');
    });

    it('attaches utm_term=promoted for sponsored placements', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect?partner=resy&venueId=venue-sp-001&action=reserve&promoted=true')
        .expect(302);

      const location = res.headers.location;
      expect(location).toContain('utm_term=promoted');
      expect(location).toContain('utm_content=resy');
    });

    it('supports JSON format inspection for programmatic test clients', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect?partner=doordash&venueId=venue-001&action=delivery&format=json')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.partner).toBe('doordash');
      expect(res.body.venueId).toBe('venue-001');
      expect(res.body.action).toBe('delivery');
      expect(res.body.destinationUrl).toContain('doordash.com');
      expect(res.body.clickId).toBeDefined();
    });

    it('rejects unsupported affiliate partners with 400', async () => {
      const res = await request(app)
        .get('/api/affiliate/redirect?partner=sketchy_ad_network&venueId=venue-001')
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/unsupported/i);
    });

    it('records outbound click analytics and surfaces in /api/affiliate/analytics', async () => {
      await request(app).get('/api/affiliate/redirect?partner=opentable&venueId=venue-001&action=reserve');
      await request(app).get('/api/affiliate/redirect?partner=doordash&venueId=venue-001&action=delivery');
      await request(app).get('/api/affiliate/redirect?partner=opentable&venueId=venue-002&action=reserve');

      const analyticsRes = await request(app)
        .get('/api/affiliate/analytics')
        .expect(200);

      expect(analyticsRes.body.success).toBe(true);
      expect(analyticsRes.body.analytics.totalClicks).toBeGreaterThanOrEqual(3);
      expect(analyticsRes.body.analytics.byPartner.opentable).toBeGreaterThanOrEqual(2);
      expect(analyticsRes.body.analytics.byPartner.doordash).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // SUITE 2: Native Promoted Card Placement in Curated Deck
  // =========================================================================
  describe('Suite 2: Native Promoted Card Placement in Curated Deck', () => {
    it('guarantees at least one Promoted sponsor card in top 3 cards of curated deck', async () => {
      const { code, hostAuth } = await setupRoom();

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-host-key', hostAuth.hostKey)
        .send({ participantId: hostAuth.id })
        .expect(200);

      const deck = startRes.body.deck;
      expect(deck.length).toBeGreaterThan(0);

      const topThree = deck.slice(0, 3);
      const promotedCard = topThree.find(c => c.isPromoted === true);

      expect(promotedCard).toBeDefined();
      expect(promotedCard.sponsorBadge).toBeDefined();
      expect(promotedCard.affiliateLinks).toBeDefined();
    });
  });

  // =========================================================================
  // SUITE 3: VIP Room Upgrade Mock Checkout
  // =========================================================================
  describe('Suite 3: VIP Room Upgrade Mock Checkout', () => {
    it('upgrades room to VIP using valid payment token (tok_visa)', async () => {
      const { code, hostAuth } = await setupRoom();

      const res = await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({
          participantId: hostAuth.id,
          planId: 'vip-pass',
          paymentToken: 'tok_visa',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.upgraded).toBe(true);
      expect(res.body.isVip).toBe(true);
      expect(res.body.perks.customVenuesAllowed).toBe(true);
      expect(res.body.perks.unlimitedRounds).toBe(true);

      // Verify room state has VIP enabled
      const roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
      expect(roomRes.body.room.isVip).toBe(true);
      expect(roomRes.body.room.vipPlan).toBe('vip-pass');
    });

    it('rejects declined card token with 402 Payment Required', async () => {
      const { code, hostAuth } = await setupRoom();

      const res = await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({
          participantId: hostAuth.id,
          planId: 'vip-pass',
          paymentToken: 'tok_declined',
        })
        .expect(402);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/declined/i);
    });

    it('applies 100% discount with test coupon VIPFREE without requiring card token', async () => {
      const { code, hostAuth } = await setupRoom();

      const res = await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({
          participantId: hostAuth.id,
          planId: 'vip-pass',
          couponCode: 'VIPFREE',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.upgraded).toBe(true);
      expect(res.body.discountApplied).toBe('100%');

      const roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
      expect(roomRes.body.room.isVip).toBe(true);
    });

    it('applies 50% discount with HALFOFF coupon when valid card token is provided', async () => {
      const { code, hostAuth } = await setupRoom();

      const res = await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({
          participantId: hostAuth.id,
          planId: 'vip-pass',
          couponCode: 'HALFOFF',
          paymentToken: 'tok_mastercard',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.discountApplied).toBe('50%');
    });
  });

  // =========================================================================
  // SUITE 4: Premium Features - Custom Venue Injection
  // =========================================================================
  describe('Suite 4: Premium Features - Custom Venue Injection', () => {
    it('rejects custom venue injection for non-VIP room with 403 Forbidden', async () => {
      const { code, hostAuth } = await setupRoom();

      const res = await request(app)
        .post(`/api/rooms/${code}/custom-venue`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({
          participantId: hostAuth.id,
          name: 'Secret Speakeasy',
          cuisine: 'Craft Cocktails',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/vip upgrade required/i);
    });

    it('allows VIP rooms to inject custom venues into the active deck', async () => {
      const { code, hostAuth } = await setupRoom();

      // Upgrade to VIP
      await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .send({ couponCode: 'VIPFREE' });

      // Start voting
      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-host-key', hostAuth.hostKey)
        .send({ participantId: hostAuth.id });
      const initialDeckLength = startRes.body.deck.length;

      // Inject custom venue
      const res = await request(app)
        .post(`/api/rooms/${code}/custom-venue`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({
          participantId: hostAuth.id,
          name: 'Grandpa Tony Pizzeria',
          cuisine: 'Coal-Fired Pizza',
          priceTier: 2,
          address: '45 Elm Street',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.venue.name).toBe('Grandpa Tony Pizzeria');
      expect(res.body.venue.isCustom).toBe(true);
      expect(res.body.deck.length).toBe(initialDeckLength + 1);

      // Verify custom venue appears in room deck
      const roomRes = await request(app).get(`/api/rooms/${code}`).expect(200);
      expect(roomRes.body.room.deck.some(v => v.name === 'Grandpa Tony Pizzeria')).toBe(true);
    });

    it('rejects custom venue without a name with 400 Bad Request', async () => {
      const { code } = await setupRoom();

      await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .send({ couponCode: 'VIPFREE' });

      const res = await request(app)
        .post(`/api/rooms/${code}/custom-venue`)
        .send({ name: '' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/name is required/i);
    });

    it('broadcasts room:upgraded via SSE broadcaster upon successful VIP upgrade', async () => {
      const { code, hostAuth } = await setupRoom();
      const broadcastSpy = [];
      broadcaster.broadcast = (broadcastCode, event, data) => {
        broadcastSpy.push({ broadcastCode, event, data });
      };

      await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({ couponCode: 'VIPFREE' })
        .expect(200);

      expect(broadcastSpy.some(b => b.event === 'room:upgraded' && b.data.isVip === true)).toBe(true);
    });

    it('broadcasts deck:updated via SSE broadcaster when custom venue is injected', async () => {
      const { code, hostAuth } = await setupRoom();
      await request(app).post(`/api/rooms/${code}/upgrade`).send({ couponCode: 'VIPFREE' });

      const broadcastSpy = [];
      broadcaster.broadcast = (broadcastCode, event, data) => {
        broadcastSpy.push({ broadcastCode, event, data });
      };

      await request(app)
        .post(`/api/rooms/${code}/custom-venue`)
        .set('x-session-token', hostAuth.sessionToken)
        .send({ name: 'Midnight Diner' })
        .expect(200);

      expect(broadcastSpy.some(b => b.event === 'deck:updated' && b.data.addedVenue.name === 'Midnight Diner')).toBe(true);
    });

    it('rejects upgrade on closed room with 409', async () => {
      const { code } = await setupRoom();
      const room = roomStore.getRoom(code);
      room.status = 'closed';

      const res = await request(app)
        .post(`/api/rooms/${code}/upgrade`)
        .send({ couponCode: 'VIPFREE' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/closed/i);
    });

    it('rejects custom venue addition on closed room with 409', async () => {
      const { code } = await setupRoom();
      const room = roomStore.getRoom(code);
      room.isVip = true;
      room.status = 'closed';

      const res = await request(app)
        .post(`/api/rooms/${code}/custom-venue`)
        .send({ name: 'Test Venue' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/closed/i);
    });
  });
});
