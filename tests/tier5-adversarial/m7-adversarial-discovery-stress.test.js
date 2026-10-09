import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { PlacesService, calculateDistanceMiles, deduplicateVenues, globalPlacesService } from '../../server/services/PlacesService.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('Tier 5 Adversarial Stress: Milestone 7 Venue Discovery & Distance Precision', () => {
  let app;
  let roomStore;
  let broadcaster;
  let placesService;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    placesService = new PlacesService();
    app = createApp({ roomStore, broadcaster });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    roomStore.clear();
  });

  // =========================================================================
  // SUITE 1: Deep Multi-Batch Discovery & Cross-Provider Deduplication
  // =========================================================================
  describe('Suite 1: Multi-Batch Discovery & Cross-Provider Deduplication', () => {
    it('returns 50+ unique venues with zero duplicate IDs across 12 Table A parallel Google batches', async () => {
      const originalFetch = globalThis.fetch;
      // Simulate 12 distinct Table A categories returning 20 places each = 240 raw candidate items
      // With deliberate overlap: 40 places share IDs or co-located names to test deduplication
      const tableATypes = [
        'restaurant', 'american_restaurant', 'italian_restaurant', 'mexican_restaurant',
        'asian_restaurant', 'japanese_restaurant', 'korean_restaurant', 'vietnamese_restaurant',
        'pizza_restaurant', 'bar', 'cafe', 'seafood_restaurant',
      ];

      let reqCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
        const body = opts && opts.body ? JSON.parse(opts.body) : {};
        const types = body.includedTypes || ['restaurant'];
        const typeTag = types[0] || 'spot';

        const places = [];
        for (let i = 0; i < 20; i++) {
          // Intentional overlap: spots 0-2 in every batch share the exact same ID and location
          const id = i < 3 ? `shared_global_anchor_${i}` : `gplace_${typeTag}_${i}`;
          places.push({
            id,
            displayName: { text: i < 3 ? `Anchor Bistro ${i}` : `${typeTag} Delight ${i}` },
            primaryTypeDisplayName: { text: typeTag },
            location: {
              latitude: 30.2672 + (i * 0.002),
              longitude: -97.7431 + (i * 0.002),
            },
            formattedAddress: `${100 + i} Congress Ave, Austin, TX`,
            rating: 4.6,
            userRatingCount: 250,
            priceLevel: 'PRICE_LEVEL_MODERATE',
            photos: [],
          });
        }
        reqCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ places }),
        };
      });

      const venues = await placesService.fetchLiveFromGoogle({
        lat: 30.2672,
        lng: -97.7431,
        category: 'dining',
        maxDistanceMiles: 15.0,
        limit: 'all',
        apiKey: 'adversarial-mock-key',
      });

      globalThis.fetch = originalFetch;

      expect(venues).toBeDefined();
      expect(Array.isArray(venues)).toBe(true);
      // With 12 batches x 20 items = 240, minus overlapping anchors, we should have > 150 unique venues
      expect(venues.length).toBeGreaterThanOrEqual(50);
      expect(venues.length).toBeGreaterThan(100);

      // Verify zero duplicate IDs exist
      const idSet = new Set();
      for (const v of venues) {
        expect(idSet.has(v.id)).toBe(false);
        idSet.add(v.id);
      }
      expect(idSet.size).toBe(venues.length);

      // Verify zero co-located venues with identical clean name within 0.15 mi
      for (let i = 0; i < venues.length; i++) {
        for (let j = i + 1; j < venues.length; j++) {
          const vA = venues[i];
          const vB = venues[j];
          if (vA.name.trim().toLowerCase() === vB.name.trim().toLowerCase()) {
            const dist = calculateDistanceMiles(vA.lat, vA.lng, vB.lat, vB.lng);
            expect(dist).toBeGreaterThanOrEqual(0.15);
          }
        }
      }
    });

    it('cross-provider deduplication collapses Google + Overpass + Seed duplicates < 0.15 mi while keeping distant branches > 0.5 mi', () => {
      const candidateList = [
        // Co-located venue across 3 different providers (< 0.15 mi)
        { id: 'google-chilis-downtown', name: "Chili's Grill & Bar", lat: 30.2672, lng: -97.7431, distance: '0.4 mi' },
        { id: 'osm-chilis-downtown-node', name: "  Chili's Grill & Bar  ", lat: 30.2674, lng: -97.7433, distance: '0.4 mi' },
        { id: 'venue-chilis-seed', name: "chili's grill & bar", lat: 30.2673, lng: -97.7432, distance: '0.4 mi' },

        // Separate branch at 45th & Lamar (approx 3.8 miles away)
        { id: 'google-chilis-45th-lamar', name: "Chili's Grill & Bar", lat: 30.3142, lng: -97.7389, distance: '3.8 mi' },

        // Separate branch in South Austin (approx 6.1 miles away)
        { id: 'osm-chilis-south', name: "Chili's Grill & Bar", lat: 30.2012, lng: -97.7812, distance: '6.1 mi' },

        // Distinct different venue
        { id: 'google-franklin-bbq', name: 'Franklin Barbecue', lat: 30.2701, lng: -97.7313, distance: '0.9 mi' },
      ];

      const deduplicated = deduplicateVenues(candidateList);

      // Expected: 1 downtown Chili's, 1 at 45th & Lamar, 1 in South Austin, 1 Franklin BBQ = 4 venues
      expect(deduplicated.length).toBe(4);

      const chilisVenues = deduplicated.filter(v => v.name.toLowerCase().includes("chili's"));
      expect(chilisVenues.length).toBe(3);

      const chilisIds = chilisVenues.map(v => v.id);
      expect(chilisIds).toContain('google-chilis-downtown');
      expect(chilisIds).toContain('google-chilis-45th-lamar');
      expect(chilisIds).toContain('osm-chilis-south');
      expect(chilisIds).not.toContain('osm-chilis-downtown-node');
      expect(chilisIds).not.toContain('venue-chilis-seed');
    });

    it('spatial boundary sensitivity: collapses at 0.14 mi and preserves at 0.16 mi', () => {
      // 30.2672, -97.7431
      // 0.002 deg latitude is approximately 0.138 miles
      // 0.0025 deg latitude is approximately 0.172 miles
      const baseLat = 30.2672;
      const baseLng = -97.7431;

      // Calculate exact delta for 0.14 miles (should collapse)
      // 1 deg lat = ~69 miles -> 0.14 / 69 = ~0.002028 deg
      const latCollapse = baseLat + (0.14 / 69);
      const distCollapse = calculateDistanceMiles(baseLat, baseLng, latCollapse, baseLng);
      expect(distCollapse).toBeLessThan(0.15);

      // Calculate exact delta for 0.16 miles (should be preserved)
      const latPreserve = baseLat + (0.16 / 69);
      const distPreserve = calculateDistanceMiles(baseLat, baseLng, latPreserve, baseLng);
      expect(distPreserve).toBeGreaterThan(0.15);

      const testPool = [
        { id: 'v1', name: 'Blue Dahlia Bistro', lat: baseLat, lng: baseLng },
        { id: 'v2-close', name: 'Blue Dahlia Bistro', lat: latCollapse, lng: baseLng },
        { id: 'v3-far', name: 'Blue Dahlia Bistro', lat: latPreserve, lng: baseLng },
      ];

      const result = deduplicateVenues(testPool);
      expect(result.length).toBe(2);
      expect(result.some(v => v.id === 'v1')).toBe(true);
      expect(result.some(v => v.id === 'v2-close')).toBe(false);
      expect(result.some(v => v.id === 'v3-far')).toBe(true);
    });

    it('robustness against corrupt, malformed, and adversarial inputs in deduplicateVenues', () => {
      expect(deduplicateVenues(null)).toEqual([]);
      expect(deduplicateVenues(undefined)).toEqual([]);
      expect(deduplicateVenues('not an array')).toEqual([]);
      expect(deduplicateVenues(42)).toEqual([]);

      const corruptPool = [
        null,
        undefined,
        {},
        { id: null, name: 'Ghost Spot' },
        { id: '', name: 'Empty ID Spot' },
        { id: 'v-valid-1', name: null, lat: 30.2672, lng: -97.7431 },
        { id: 'v-valid-2', name: 'Valid Spot', lat: 'invalid', lng: null },
        { id: 'v-valid-3', name: 'Valid Spot', lat: 30.2672, lng: -97.7431 }, // cleanName matches v-valid-2, one has coords and one doesn't -> collapsed
        { id: 'v-valid-4', name: '   TRIMMED SPOT   ', lat: 30.25, lng: -97.75 },
        { id: 'v-valid-5', name: 'trimmed spot', lat: 30.25, lng: -97.75 }, // duplicate of v-valid-4
        { id: 'v-valid-6', name: 'Polluted Spot', lat: NaN, lng: Infinity },
      ];

      const clean = deduplicateVenues(corruptPool);
      expect(Array.isArray(clean)).toBe(true);
      expect(clean.some(v => v.id === 'v-valid-1')).toBe(true);
      expect(clean.some(v => v.id === 'v-valid-2')).toBe(true);
      expect(clean.some(v => v.id === 'v-valid-4')).toBe(true);
      expect(clean.some(v => v.id === 'v-valid-5')).toBe(false); // Collapsed
      expect(clean.some(v => v.id === 'v-valid-6')).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 2: Geographic Distance Calculation & Ascending Sorting Invariants
  // =========================================================================
  describe('Suite 2: Distance Accuracy & Ascending Sorting Invariants', () => {
    it('verifies Haversine distance accuracy across benchmark coordinates', () => {
      // Austin City Hall (30.2672, -97.7431) to Austin-Bergstrom International Airport (30.1975, -97.6664)
      // True distance ~6.4 miles
      const distAustinAirport = calculateDistanceMiles(30.2672, -97.7431, 30.1975, -97.6664);
      expect(distAustinAirport).toBeGreaterThan(6.0);
      expect(distAustinAirport).toBeLessThan(7.0);

      // Austin City Hall to Round Rock downtown (30.5083, -97.6789)
      // True distance ~17.0 miles
      const distRoundRock = calculateDistanceMiles(30.2672, -97.7431, 30.5083, -97.6789);
      expect(distRoundRock).toBeGreaterThan(16.0);
      expect(distRoundRock).toBeLessThan(18.0);

      // Austin City Hall to Dallas downtown (32.7767, -96.7970)
      // True distance ~182 miles
      const distDallas = calculateDistanceMiles(30.2672, -97.7431, 32.7767, -96.7970);
      expect(distDallas).toBeGreaterThan(175.0);
      expect(distDallas).toBeLessThan(190.0);

      // Missing coords fallback to 1.0
      expect(calculateDistanceMiles(null, -97.74, 30.26, -97.74)).toBe(1.0);
      expect(calculateDistanceMiles(30.26, null, 30.26, -97.74)).toBe(1.0);
    });

    it('deck candidate pool enforces strictly ascending distance order regardless of catalog order', () => {
      // 1. Test with seed catalog (dining has 6 venues)
      const deckSeed = roomStore.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2672,
        lng: -97.7431,
        distance: 'metro_area',
        deckSize: 'all',
      });

      expect(deckSeed.length).toBe(6);

      // Filter out promoted venue which is anchored at index 2
      const nonPromotedSeed = deckSeed.filter(v => !v.isPromoted);

      for (let i = 0; i < nonPromotedSeed.length - 1; i++) {
        const dCurrent = parseFloat(nonPromotedSeed[i].distance);
        const dNext = parseFloat(nonPromotedSeed[i + 1].distance);
        expect(dCurrent).toBeLessThanOrEqual(dNext);
      }

      // 2. Test with primed live venue cache containing 60+ venues
      const primeGridKey = placesService.getGridKey(30.2672, -97.7431, 'dining', [], 'metro_area');
      const primedVenues = [];
      for (let i = 0; i < 65; i++) {
        const distNum = (0.2 + (i * 0.15));
        primedVenues.push({
          id: `primed-spot-${i}`,
          name: `Primed Bistro ${i}`,
          category: 'dining',
          distance: `${distNum.toFixed(1)} mi`,
          lat: 30.2672 + (i * 0.001),
          lng: -97.7431 + (i * 0.001),
          priceTier: 2,
          rating: 4.5,
          isPromoted: i === 0,
        });
      }

      // Scramble order intentionally
      primedVenues.reverse();

      globalPlacesService.cache.set(primeGridKey, {
        venues: primedVenues,
        timestamp: Date.now(),
      });

      const deckLive = roomStore.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2672,
        lng: -97.7431,
        distance: 'metro_area',
        deckSize: 'all',
      });

      expect(deckLive.length).toBe(65);
      const nonPromotedLive = deckLive.filter(v => !v.isPromoted);
      for (let i = 0; i < nonPromotedLive.length - 1; i++) {
        const dCurrent = parseFloat(nonPromotedLive[i].distance);
        const dNext = parseFloat(nonPromotedLive[i + 1].distance);
        expect(dCurrent).toBeLessThanOrEqual(dNext);
      }
      globalPlacesService.clearCache();
    });

    it('promoted card anchoring behavior across various deck sizes (1, 2, 3, 12, all)', () => {
      // Deck size 1
      const deck1 = roomStore.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2672,
        lng: -97.7431,
        deckSize: 1,
      });
      expect(deck1.length).toBe(1);
      expect(deck1[0].isPromoted).toBe(true);

      // Deck size 2
      const deck2 = roomStore.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2672,
        lng: -97.7431,
        deckSize: 2,
      });
      expect(deck2.length).toBe(2);
      expect(deck2[1].isPromoted).toBe(true);

      // Deck size 6 (index 2 must be promoted)
      const deck6 = roomStore.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2672,
        lng: -97.7431,
        deckSize: 6,
      });
      expect(deck6.length).toBe(6);
      expect(deck6[2].isPromoted).toBe(true);
      expect(deck6[0].isPromoted).toBeFalsy();
      expect(deck6[1].isPromoted).toBeFalsy();

      // Deck size 'all' (index 2 must be promoted)
      const deckAll = roomStore.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2672,
        lng: -97.7431,
        deckSize: 'all',
      });
      expect(deckAll.length).toBeGreaterThanOrEqual(4);
      expect(deckAll[2].isPromoted).toBe(true);
    });

    it('adversarial check: strictly enforces walkable radius (<= 1.0 mi) when live venues are cached', () => {
      const walkableKey = placesService.getGridKey(30.2672, -97.7431, 'dining', [], 'walkable');
      const mixedVenues = [
        { id: 'live-w-1', name: 'Close Spot 1', distance: '0.4 mi', lat: 30.267, lng: -97.743, isPromoted: true },
        { id: 'live-w-2', name: 'Close Spot 2', distance: '0.6 mi', lat: 30.268, lng: -97.743 },
        { id: 'live-w-3', name: 'Close Spot 3', distance: '0.8 mi', lat: 30.269, lng: -97.743 },
        { id: 'live-w-4', name: 'Close Spot 4', distance: '0.9 mi', lat: 30.270, lng: -97.743 },
        { id: 'live-w-5', name: 'Far Out Spot 5', distance: '3.5 mi', lat: 30.310, lng: -97.743 },
        { id: 'live-w-6', name: 'Metro Spot 6', distance: '8.2 mi', lat: 30.380, lng: -97.743 },
      ];

      globalPlacesService.cache.set(walkableKey, {
        venues: mixedVenues,
        timestamp: Date.now(),
      });

      const deck = roomStore.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2672,
        lng: -97.7431,
        distance: 'walkable',
        deckSize: 'all',
      });

      globalPlacesService.clearCache();

      // Since 4 in-radius spots exist (<= 1.0 mi), venues > 1.0 mi must NOT be in the deck
      for (const venue of deck) {
        const d = parseFloat(venue.distance);
        expect(d).toBeLessThanOrEqual(1.0);
      }

      // The promoted card must be anchored at index 2 (topLimit - 1)
      expect(deck.findIndex(v => v.isPromoted)).toBe(2);
    });
  });

  // =========================================================================
  // SUITE 3: Interactive Lobby Adjustment Stress & Concurrency Under Load
  // =========================================================================
  describe('Suite 3: Interactive Lobby Adjustment Stress & Concurrency', () => {
    it('handles 50 rapid concurrent settings updates without race conditions, deadlocks, or desync', async () => {
      // Create room with host and 5 participants
      const createRes = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'HostStress',
          activityCategory: 'dining',
          distance: 'walkable',
          lat: 30.2672,
          lng: -97.7431,
        });

      expect(createRes.status).toBe(201);
      const code = createRes.body.room.code;
      const hostSession = createRes.body.sessionToken;
      const hostId = createRes.body.participant.id;
      const hostKey = createRes.body.hostKey;

      // Join 5 participants
      const participants = [];
      for (let i = 1; i <= 5; i++) {
        const joinRes = await request(app)
          .post(`/api/rooms/${code}/join`)
          .send({ name: `Participant_${i}` });
        expect(joinRes.status).toBe(200);
        participants.push(joinRes.body.participant);
      }

      // Prepare 50 alternating settings mutations
      const distanceOptions = ['walkable', 'short_drive', 'metro_area'];
      const deckSizeOptions = [4, 6, 12, 'all'];
      const categoryOptions = ['dining', 'bars', 'activities'];

      const patchPromises = [];
      for (let i = 0; i < 50; i++) {
        const newDist = distanceOptions[i % distanceOptions.length];
        const newDeckSize = deckSizeOptions[i % deckSizeOptions.length];
        const newCat = categoryOptions[i % categoryOptions.length];

        const p = request(app)
          .patch(`/api/rooms/${code}/settings`)
          .set('x-session-token', hostSession)
          .send({
            participantId: hostId,
            hostKey,
            settings: {
              distance: newDist,
              deckSize: newDeckSize,
              activityCategory: newCat,
            },
          });
        patchPromises.push(p);
      }

      // Execute all 50 concurrent requests simultaneously
      const results = await Promise.all(patchPromises);

      // All 50 requests must succeed with 200 OK
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deck).toBeDefined();
        expect(Array.isArray(res.body.deck)).toBe(true);
        expect(res.body.deck.length).toBeGreaterThanOrEqual(4);
      }

      // Inspect final coherent room state
      const finalRoom = roomStore.getRoom(code);
      expect(finalRoom).toBeDefined();
      expect(finalRoom.deck.length).toBeGreaterThanOrEqual(4);

      // Verify every participant's totalCards is in perfect sync with the room deck length
      for (const p of Object.values(finalRoom.participants)) {
        expect(p.totalCards).toBe(finalRoom.deck.length);
      }
    });

    it('rejects unauthorized settings updates from regular participants during lobby adjustments', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'HostAlex',
          activityCategory: 'dining',
          distance: 'walkable',
        });

      const code = createRes.body.room.code;
      const hostSession = createRes.body.sessionToken;

      // Join regular participant
      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'GuestUser' });

      const guestId = joinRes.body.participant.id;
      const guestSession = joinRes.body.sessionToken;

      // Guest attempts to PATCH settings
      const unauthorizedRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', guestSession)
        .send({
          participantId: guestId,
          settings: { distance: 'metro_area' },
        });

      expect(unauthorizedRes.status).toBe(403);
      expect(unauthorizedRes.body.success).toBe(false);

      // Verify settings remained untouched
      const room = roomStore.getRoom(code);
      expect(room.settings.distance).toBe('walkable');
    });

    it('prevents settings updates once voting has started to prevent card deck desynchronization', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'HostSam',
          activityCategory: 'dining',
          distance: 'short_drive',
          deckSize: 6,
        });

      const code = createRes.body.room.code;
      const hostSession = createRes.body.sessionToken;
      const hostId = createRes.body.participant.id;
      const hostKey = createRes.body.hostKey;

      // Start voting
      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostSession)
        .send({ participantId: hostId, hostKey });

      expect(startRes.status).toBe(200);
      expect(startRes.body.status).toBe('voting');

      // Attempt settings update while voting is active
      const patchRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostSession)
        .send({
          participantId: hostId,
          hostKey,
          settings: { distance: 'metro_area', deckSize: 12 },
        });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.error).toContain('lobby');

      // Verify deck was not modified
      const room = roomStore.getRoom(code);
      expect(room.deck.length).toBe(6);
      expect(room.status).toBe('voting');
    });
  });
});
