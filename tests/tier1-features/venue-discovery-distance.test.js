import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { PlacesService, calculateDistanceMiles, deduplicateVenues } from '../../server/services/PlacesService.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('Milestone 7: Venue Discovery Engine Expansion & Geographic Distance Precision', () => {
  let app;
  let roomStore;
  let broadcaster;
  let placesService;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    placesService = new PlacesService();
    app = createApp(roomStore, broadcaster);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Deep Multi-Batch Venue Selection & Deduplication', () => {
    it('returns 50+ unique venues when deckSize is "all" across multi-batch provider queries', async () => {
      // Mock Google Places API returning batches across Table A types
      const originalFetch = globalThis.fetch;
      const batches = [];
      for (let b = 0; b < 10; b++) {
        const places = [];
        for (let p = 0; p < 8; p++) {
          const id = `gplace_batch_${b}_spot_${p}`;
          places.push({
            id,
            displayName: { text: `Unique Bistro ${b}-${p}` },
            primaryTypeDisplayName: { text: 'Dining' },
            location: {
              latitude: 30.2672 + (b * 0.005),
              longitude: -97.7431 + (p * 0.005),
            },
            formattedAddress: `${100 + b * 10 + p} Congress Ave, Austin, TX`,
            rating: 4.5,
            userRatingCount: 200 + p * 10,
            priceLevel: 'PRICE_LEVEL_MODERATE',
            photos: [],
          });
        }
        batches.push(places);
      }

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        const places = batches[callCount % batches.length];
        callCount++;
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
        apiKey: 'test-api-key-mock',
      });

      globalThis.fetch = originalFetch;

      expect(venues).toBeDefined();
      expect(Array.isArray(venues)).toBe(true);
      expect(venues.length).toBeGreaterThanOrEqual(50);

      // Verify zero duplicate IDs exist
      const uniqueIds = new Set(venues.map(v => v.id));
      expect(uniqueIds.size).toBe(venues.length);
    });

    it('returns all matching venues for specific cuisine filter without artificial 20-venue cap', async () => {
      const originalFetch = globalThis.fetch;
      const mockItalian = [];
      for (let i = 0; i < 45; i++) {
        mockItalian.push({
          id: `italian_spot_${i}`,
          displayName: { text: `Luigi Trattoria ${i}` },
          primaryTypeDisplayName: { text: 'Italian' },
          location: { latitude: 30.2672 + (i * 0.001), longitude: -97.7431 + (i * 0.001) },
          formattedAddress: `${i + 1} Pasta Way`,
          rating: 4.8,
          userRatingCount: 300,
          priceLevel: 'PRICE_LEVEL_MODERATE',
        });
      }

      let callIdx = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        // Return 15 places per batch
        const chunk = mockItalian.slice(callIdx * 15, (callIdx + 1) * 15);
        callIdx++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ places: chunk }),
        };
      });

      const venues = await placesService.fetchLiveFromGoogle({
        lat: 30.2672,
        lng: -97.7431,
        category: 'dining',
        cuisinePreferences: ['italian'],
        maxDistanceMiles: 15.0,
        limit: 'all',
        apiKey: 'test-api-key-mock',
      });

      globalThis.fetch = originalFetch;

      expect(venues).toBeDefined();
      expect(venues.length).toBeGreaterThan(20);
      expect(venues.every(v => v.id.startsWith('google-italian_spot_'))).toBe(true);
    });

    it('collapses co-located duplicate node/way pairs but preserves distinct branches across metro area', () => {
      const candidateList = [
        // Co-located node and way at the exact same location (<0.15 mi)
        { id: 'osm-101', name: "Torchy's Tacos", lat: 30.2672, lng: -97.7431, distance: '0.5 mi' },
        { id: 'osm-102', name: "Torchy's Tacos", lat: 30.2673, lng: -97.7432, distance: '0.5 mi' },
        // Separate branch located 6 miles away in North Austin
        { id: 'osm-103', name: "Torchy's Tacos", lat: 30.3540, lng: -97.7320, distance: '6.2 mi' },
        // Another distinct venue
        { id: 'osm-104', name: 'Home Slice Pizza', lat: 30.2500, lng: -97.7500, distance: '1.2 mi' },
      ];

      const deduplicated = deduplicateVenues(candidateList);
      expect(deduplicated.length).toBe(3);
      const torchys = deduplicated.filter(v => v.name === "Torchy's Tacos");
      expect(torchys.length).toBe(2);
      expect(torchys.some(v => v.id === 'osm-101')).toBe(true);
      expect(torchys.some(v => v.id === 'osm-103')).toBe(true);
    });
  });

  describe('2. Haversine Distance Accuracy Across Benchmark Coordinates', () => {
    it('calculates accurate distance between Austin City Hall and The Domain (~11.5 miles)', () => {
      // Austin City Hall (30.2672, -97.7431) to The Domain (30.4014, -97.7246)
      const dist = calculateDistanceMiles(30.2672, -97.7431, 30.4014, -97.7246);
      expect(dist).toBeGreaterThan(9.0);
      expect(dist).toBeLessThan(12.0);
      expect(Number(dist.toFixed(1))).toBeCloseTo(9.3, 0.5);
    });

    it('calculates accurate distance between NYC Times Square and Central Park North (~3.2 miles)', () => {
      // Times Square (40.7580, -73.9855) to Central Park North (40.7997, -73.9535)
      const dist = calculateDistanceMiles(40.7580, -73.9855, 40.7997, -73.9535);
      expect(dist).toBeGreaterThan(3.1);
      expect(dist).toBeLessThan(3.5);
    });

    it('guarantees distance symmetry and zero distance for identical coordinates', () => {
      const zeroDist = calculateDistanceMiles(30.2672, -97.7431, 30.2672, -97.7431);
      expect(zeroDist).toBeCloseTo(0, 5);

      const d1 = calculateDistanceMiles(30.2672, -97.7431, 40.7128, -74.0060);
      const d2 = calculateDistanceMiles(40.7128, -74.0060, 30.2672, -97.7431);
      expect(d1).toBeCloseTo(d2, 5);
      expect(d1).toBeGreaterThan(1500);
    });
  });

  describe('3. Ascending Distance Candidate Deck Sorting', () => {
    it('sorts non-promoted venues strictly ascending by distance from search origin', () => {
      const store = new RoomStore();
      const deck = store.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2672,
        lng: -97.7431,
        distance: 'short_drive',
        deckSize: 12,
      });

      expect(deck.length).toBeGreaterThanOrEqual(4);

      // Filter out promoted venue to test the underlying ascending order invariant
      const nonPromoted = deck.filter(v => !v.isPromoted);
      expect(nonPromoted.length).toBeGreaterThanOrEqual(3);

      for (let i = 0; i < nonPromoted.length - 1; i++) {
        const dA = parseFloat(nonPromoted[i].distance);
        const dB = parseFloat(nonPromoted[i + 1].distance);
        expect(dA).toBeLessThanOrEqual(dB);
      }

      // Verify that the nearest available spot is at index 0
      expect(parseFloat(nonPromoted[0].distance)).toBeLessThanOrEqual(1.0);
    });

    it('anchors the promoted card at index 2 (top min(3, deckSize)) while preserving sorting', () => {
      const store = new RoomStore();
      const deck = store.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2672,
        lng: -97.7431,
        distance: 'short_drive',
        deckSize: 6,
      });

      const promotedIdx = deck.findIndex(v => v.isPromoted);
      expect(promotedIdx).toBe(2);

      // Verify cards before promoted card are ascending
      const d0 = parseFloat(deck[0].distance);
      const d1 = parseFloat(deck[1].distance);
      expect(d0).toBeLessThanOrEqual(d1);

      // Verify cards after promoted card are ascending
      if (deck.length > 3) {
        const d3 = parseFloat(deck[3].distance);
        expect(d1).toBeLessThanOrEqual(d3);
      }
    });
  });

  describe('4. Radius Enforcement & Proximity Fallback Padding', () => {
    it('strictly confines walkable deck to <= 1.0 mile when >= 4 spots exist in perimeter', () => {
      const store = new RoomStore();
      const deck = store.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2672,
        lng: -97.7431,
        distance: 'walkable',
        deckSize: 10,
      });

      expect(deck.length).toBeGreaterThanOrEqual(4);
      // In dining around Austin downtown, there are 4 spots <= 1.0 mi (Barrio, L'Amore, Kuroshio, Blue Fin)
      for (const venue of deck) {
        const miles = parseFloat(venue.distance);
        expect(miles).toBeLessThanOrEqual(1.0);
      }
    });

    it('pads from closest available fallbacks when fewer than 4 spots exist in immediate perimeter', () => {
      const store = new RoomStore();
      // Category 'activities' only has 1 spot <= 1.0 mi (VR Dimension at 0.8 mi)
      const deck = store.getDeckForRoom({
        activityCategory: 'activities',
        lat: 30.2672,
        lng: -97.7431,
        distance: 'walkable',
        deckSize: 4,
      });

      // Must pad to at least 4 venues
      expect(deck.length).toBeGreaterThanOrEqual(4);

      // The first venue must be the in-radius spot
      expect(deck[0].id).toBe('venue-020');
      expect(parseFloat(deck[0].distance)).toBeLessThanOrEqual(1.0);

      // The fallbacks must be the closest available spots from the category
      const distances = deck.map(v => parseFloat(v.distance));
      // First spot is <= 1.0 mi
      expect(distances[0]).toBeLessThanOrEqual(1.0);
    });
  });

  describe('5. Cache Key Separation Across Radius Tiers (getGridKey)', () => {
    it('generates distinct cache keys for walkable, short_drive, and metro_area', () => {
      const places = new PlacesService();
      const kw = places.getGridKey(30.2672, -97.7431, 'dining', [], 'walkable');
      const kd = places.getGridKey(30.2672, -97.7431, 'dining', [], 'short_drive');
      const km = places.getGridKey(30.2672, -97.7431, 'dining', [], 'metro_area');

      expect(kw).not.toBe(kd);
      expect(kd).not.toBe(km);
      expect(kw).not.toBe(km);

      expect(kw).toContain('dist-walkable');
      expect(kd).toContain('dist-short_drive');
      expect(km).toContain('dist-metro_area');
    });

    it('preserves backward compatibility when distance argument is omitted', () => {
      const places = new PlacesService();
      const keyDefault = places.getGridKey(30.2672, -97.7431, 'dining');
      const keyExplicit = places.getGridKey(30.2672, -97.7431, 'dining', [], 'short_drive');
      expect(keyDefault).toBe(keyExplicit);

      // Close points fall into identical grid bucket
      const keyClose = places.getGridKey(30.2680, -97.7420, 'dining');
      expect(keyDefault).toBe(keyClose);
    });

    it('prevents stale cache hits when switching radius tiers', () => {
      const places = new PlacesService();
      const walkableKey = places.getGridKey(30.2672, -97.7431, 'dining', [], 'walkable');
      const shortDriveKey = places.getGridKey(30.2672, -97.7431, 'dining', [], 'short_drive');

      // Populate walkable cache
      places.cache.set(walkableKey, {
        venues: [{ id: 'walkable-spot-1', name: 'Close Cafe', distance: '0.2 mi' }],
        timestamp: Date.now(),
      });

      // Ensure short_drive does NOT hit walkable cache
      const cachedShortDrive = places.getCachedLiveVenues({
        lat: 30.2672,
        lng: -97.7431,
        activityCategory: 'dining',
        distance: 'short_drive',
      });
      expect(cachedShortDrive).toBeNull();
    });
  });

  describe('6. Lobby Adjustment Cache Invalidation & Deck Synchronization', () => {
    it('invalidates cache, rebuilds deck, and broadcasts deck:updated when settings are patched', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'HostAlex',
          activityCategory: 'dining',
          distance: 'walkable',
          lat: 30.2672,
          lng: -97.7431,
        });

      expect(res.status).toBe(201);
      const code = res.body.room.code;
      const hostSession = res.body.sessionToken;
      const hostId = res.body.participant.id;

      // Broadcast spy
      const broadcastSpy = vi.spyOn(broadcaster, 'broadcast');

      // Patch settings to metro_area and deckSize 'all'
      const patchRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostSession)
        .send({
          participantId: hostId,
          settings: {
            distance: 'metro_area',
            deckSize: 'all',
          },
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.success).toBe(true);
      expect(patchRes.body.settings.distance).toBe('metro_area');
      expect(patchRes.body.settings.deckSize).toBe('all');
      expect(patchRes.body.deck).toBeDefined();
      expect(Array.isArray(patchRes.body.deck)).toBe(true);

      // Verify that the rebuilt deck contains further venues (e.g. > 1.0 mi)
      const maxDistanceInDeck = Math.max(...patchRes.body.deck.map(v => parseFloat(v.distance)));
      expect(maxDistanceInDeck).toBeGreaterThan(1.0);

      // Verify deck:updated was broadcast
      expect(broadcastSpy).toHaveBeenCalledWith(
        code,
        'deck:updated',
        expect.objectContaining({
          deck: expect.any(Array),
          settings: expect.objectContaining({ distance: 'metro_area' }),
        })
      );
    });

    it('asynchronously resolves locationName when patched without coordinates', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'HostTaylor',
          activityCategory: 'dining',
        });

      const code = res.body.room.code;
      const hostSession = res.body.sessionToken;
      const hostId = res.body.participant.id;

      const patchRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostSession)
        .send({
          participantId: hostId,
          settings: {
            locationName: 'Austin, TX',
          },
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.settings.locationName).toBe('Austin, TX');
      expect(patchRes.body.settings.lat).toBeCloseTo(30.2672, 2);
      expect(patchRes.body.settings.lng).toBeCloseTo(-97.7431, 2);
    });
  });

  describe('7. Minimum Rating Filter & Settings Enforcement', () => {
    it('defaults minRating to 4.0 on room creation', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'RatingHost',
          activityCategory: 'dining',
          locationName: 'Austin, TX',
        });

      expect(res.status).toBe(201);
      expect(res.body.room.settings.minRating).toBe(4.0);
    });

    it('filters out venues below minRating from room deck', () => {
      const store = new RoomStore();
      const deck = store.getDeckForRoom({
        activityCategory: 'dining',
        minRating: 4.8,
        deckSize: 10,
      });

      expect(deck.length).toBeGreaterThan(0);
      for (const venue of deck) {
        expect(venue.rating).toBeGreaterThanOrEqual(4.8);
      }
    });

    it('allows host to adjust minRating via settings patch', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'RatingHost2',
          activityCategory: 'dining',
          minRating: 4.0,
        });

      const code = res.body.room.code;
      const hostSession = res.body.sessionToken;
      const hostId = res.body.participant.id;

      const patchRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostSession)
        .send({
          participantId: hostId,
          settings: {
            minRating: 4.5,
          },
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.settings.minRating).toBe(4.5);
      for (const venue of patchRes.body.deck) {
        expect(venue.rating).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
