import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { PlacesService, calculateDistanceMiles, POPULAR_CITIES, CUISINE_PHOTOS, cleanVenueDescription } from '../../server/services/PlacesService.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('PlacesService: Zero API Key Real Venue Data Pipeline', () => {
  let placesService;
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    placesService = new PlacesService();
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  describe('Location Resolution & Spatial Math', () => {
    it('resolves popular metro area names to coordinates', () => {
      const austin = placesService.resolveLocationCoordinates('Austin, TX');
      expect(austin).toBeDefined();
      expect(austin.lat).toBeCloseTo(30.2672, 2);
      expect(austin.lng).toBeCloseTo(-97.7431, 2);

      const nyc = placesService.resolveLocationCoordinates('nyc');
      expect(nyc).toBeDefined();
      expect(nyc.lat).toBeCloseTo(40.7128, 2);

      const unknown = placesService.resolveLocationCoordinates('Atlantis City');
      expect(unknown).toBeNull();
    });

    it('calculates accurate Haversine distance in miles', () => {
      // Austin downtown to The Domain (~11 miles)
      const dist = calculateDistanceMiles(30.2672, -97.7431, 30.4014, -97.7246);
      expect(dist).toBeGreaterThan(8);
      expect(dist).toBeLessThan(14);

      // Distance to self is 0
      const distSelf = calculateDistanceMiles(30.2672, -97.7431, 30.2672, -97.7431);
      expect(distSelf).toBeCloseTo(0, 1);
    });

    it('generates consistent spatial grid keys for spatial caching', () => {
      const key1 = placesService.getGridKey(30.2672, -97.7431, 'dining');
      const key2 = placesService.getGridKey(30.2680, -97.7420, 'dining');
      // Very close points fall into same ~0.7-mile grid bucket
      expect(key1).toBe(key2);

      const diffKey = placesService.getGridKey(40.7128, -74.0060, 'dining');
      expect(key1).not.toBe(diffKey);
    });
  });

  describe('Cuisine Photography & Venue Enrichment', () => {
    it('assigns relevant high-res Unsplash photos based on venue name and cuisine', () => {
      const pizzaPhoto = placesService.getImageForVenue('Home Slice Pizza', 'Pizza', 'dining');
      expect(pizzaPhoto).toContain('unsplash.com');
      expect(CUISINE_PHOTOS.pizza).toContain(pizzaPhoto);

      const tacoPhoto = placesService.getImageForVenue('Torchy\'s Tacos', 'Mexican', 'dining');
      expect(tacoPhoto).toContain('unsplash.com');
      expect(CUISINE_PHOTOS.mexican).toContain(tacoPhoto);

      const cocktailPhoto = placesService.getImageForVenue('Midnight Cowboy', 'Cocktails', 'bars');
      expect(cocktailPhoto).toContain('unsplash.com');
      expect(CUISINE_PHOTOS.bar).toContain(cocktailPhoto);
    });

    it('guarantees promoted sponsor venue placement within top min(3, deckSize)', () => {
      const deck = placesService.getCachedOrSeedVenues({
        deckSize: 10,
        activityCategory: 'dining',
      });

      expect(deck.length).toBe(10);
      const top3 = deck.slice(0, 3);
      const hasPromotedInTop3 = top3.some(v => v.isPromoted && v.sponsorBadge);
      expect(hasPromotedInTop3).toBe(true);
    });

    it('attaches valid navigation and directions links', () => {
      const deck = placesService.getCachedOrSeedVenues({
        locationName: 'Austin, TX',
        lat: 30.2672,
        lng: -97.7431,
      });

      expect(deck.length).toBeGreaterThan(0);
      const first = deck[0];
      expect(first.affiliateLinks).toBeDefined();
      expect(first.affiliateLinks.directionsUrl).toContain('maps.google.com');
      expect(first.affiliateLinks.reservationUrl).toBeDefined();
    });
  });

  describe('Synchronous Cache & Live Endpoint', () => {
    it('returns null from getCachedLiveVenues when grid is not yet cached', () => {
      const cached = placesService.getCachedLiveVenues({ lat: 55.0, lng: 12.0 });
      expect(cached).toBeNull();
    });

    it('stores and retrieves cached venues synchronously once populated', () => {
      const gridKey = placesService.getGridKey(30.2672, -97.7431, 'dining');
      const mockPlaces = [
        { id: 'osm-1', name: 'Mock Diner 1', isPromoted: true, sponsorBadge: 'Featured' },
        { id: 'osm-2', name: 'Mock Diner 2' },
        { id: 'osm-3', name: 'Mock Diner 3' },
        { id: 'osm-4', name: 'Mock Diner 4' },
      ];

      placesService.cache.set(gridKey, {
        venues: mockPlaces,
        timestamp: Date.now(),
      });

      const retrieved = placesService.getCachedLiveVenues({
        lat: 30.2672,
        lng: -97.7431,
        activityCategory: 'dining',
        deckSize: 4,
      });

      expect(retrieved).not.toBeNull();
      expect(retrieved.length).toBe(4);
      expect(retrieved[0].name).toBe('Mock Diner 1');
    });

    it('GET /api/places/live endpoint returns structured venue list', async () => {
      const res = await request(app)
        .get('/api/places/live')
        .query({ location: 'Austin, TX', category: 'dining', limit: 8 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.venues)).toBe(true);
      expect(res.body.venues.length).toBeGreaterThanOrEqual(4);
      expect(res.body.venues[0]).toHaveProperty('name');
      expect(res.body.venues[0]).toHaveProperty('affiliateLinks');
    });
  });

  describe('Pluggable Provider Architecture & Scale Adapters', () => {
    it('returns null from fetchLiveFromGoogle if no API key is present', async () => {
      const result = await placesService.fetchLiveFromGoogle({
        lat: 30.2672,
        lng: -97.7431,
        apiKey: null,
      });
      expect(result).toBeNull();
    });

    it('gracefully handles missing or invalid Google API response without throwing', async () => {
      // Mock global fetch to return 403 Forbidden (e.g. invalid key)
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Invalid API key' }),
      });

      try {
        const result = await placesService.fetchLiveFromGoogle({
          lat: 30.2672,
          lng: -97.7431,
          apiKey: 'fake-key-test',
        });
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('correctly maps Google Places API payload into unified MatchBite Venue contract', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url) => {
        if (typeof url === 'string' && url.includes('places.googleapis.com')) {
          return {
            ok: true,
            json: async () => ({
              places: [
                {
                  id: 'ChIJ123456789',
                  displayName: { text: 'Franklin Barbecue' },
                  primaryTypeDisplayName: { text: 'Barbecue' },
                  rating: 4.8,
                  userRatingCount: 6500,
                  priceLevel: 'PRICE_LEVEL_MODERATE',
                  formattedAddress: '900 E 11th St, Austin, TX 78702',
                  location: { latitude: 30.2701, longitude: -97.7313 },
                },
              ],
            }),
          };
        }
        return { ok: false };
      };

      try {
        const venues = await placesService.fetchLiveFromGoogle({
          lat: 30.2672,
          lng: -97.7431,
          category: 'dining',
          apiKey: 'valid-test-key',
        });

        expect(venues).not.toBeNull();
        expect(venues.length).toBe(1);
        const venue = venues[0];
        expect(venue.id).toBe('google-ChIJ123456789');
        expect(venue.name).toBe('Franklin Barbecue');
        expect(venue.cuisine).toBe('Barbecue');
        expect(venue.rating).toBe(4.8);
        expect(venue.reviewCount).toBe(6500);
        expect(venue.priceTier).toBe(2);
        expect(venue.isPromoted).toBe(true);
        expect(venue.affiliateLinks.directionsUrl).toContain('maps.google.com');
        expect(venue.affiliateLinks.reservationUrl).toContain('opentable');
        expect(venue.affiliateLinks.deliveryUrl).toContain('doordash');
        expect(venue.websiteUrl).toBeDefined();
        expect(venue.websiteUrl).toMatch(/^https?:\/\//);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('guarantees valid websiteUrl with https:// scheme on all seed catalog venues', () => {
      const venues = placesService.getCachedOrSeedVenues({ deckSize: 15 });
      expect(venues.length).toBeGreaterThan(0);
      for (const v of venues) {
        expect(v.websiteUrl).toBeDefined();
        expect(typeof v.websiteUrl).toBe('string');
        expect(v.websiteUrl).toMatch(/^https?:\/\//);
      }
    });

    it('guarantees valid websiteUrl and highlights in room deck generation', () => {
      roomStore.createRoom({
        hostName: 'HostUser',
        locationName: 'Austin, TX',
      });
      const room = Array.from(roomStore.rooms.values())[0];
      roomStore.startVoting(room.code, { hostKey: room.hostKey });
      const updated = roomStore.getRoom(room.code);
      expect(updated.deck.length).toBeGreaterThan(0);
      for (const v of updated.deck) {
        expect(v.websiteUrl).toBeDefined();
        expect(v.websiteUrl).toMatch(/^https?:\/\//);
        expect(Array.isArray(v.highlights)).toBe(true);
        // Website must NOT be in highlights or tags
        for (const hl of v.highlights) {
          expect(hl.toLowerCase()).not.toContain('website');
          expect(hl).not.toContain('🌐');
        }
        for (const tag of v.tags || []) {
          expect(tag.toLowerCase()).not.toContain('website');
          expect(tag).not.toContain('🌐');
        }
        if (v.description) {
          expect(v.description.toLowerCase()).not.toContain('website');
          expect(v.description).not.toContain('🌐');
        }
      }
    });

    it('cleanVenueDescription removes website mentions and redundant Highlights include text', () => {
      const contaminated1 = 'Vibrant local local eatery spot rated 4.6★ based on 523 reviews. Highlights include 🌐 Website.';
      const cleaned1 = cleanVenueDescription(contaminated1);
      expect(cleaned1).not.toContain('Website');
      expect(cleaned1).not.toContain('🌐');
      expect(cleaned1).not.toContain('local local');
      expect(cleaned1).not.toContain('Highlights include');
      expect(cleaned1).toBe('Vibrant local eatery spot rated 4.6★ based on 523 reviews.');

      const contaminated2 = 'Beloved neighborhood dining spot rated 4.8★ based on 120 reviews. Highlights include Outdoor Patio Seating and 🌐 Website.';
      const cleaned2 = cleanVenueDescription(contaminated2);
      expect(cleaned2).not.toContain('Website');
      expect(cleaned2).not.toContain('🌐');
      expect(cleaned2).not.toContain('Highlights include');
      expect(cleaned2).toBe('Beloved neighborhood dining spot rated 4.8★ based on 120 reviews.');
    });
  });
});

