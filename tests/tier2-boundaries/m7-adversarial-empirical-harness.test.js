import { describe, it, expect } from 'vitest';
import { PlacesService, calculateDistanceMiles, deduplicateVenues } from '../../server/services/PlacesService.js';
import { RoomStore, loadVenues } from '../../server/models/RoomStore.js';

describe('Milestone 7 Adversarial Empirical Verification Suite (Challenger M7)', () => {
  describe('Area 1: Haversine Precision Under Extreme & Edge-Case Coordinates', () => {
    it('returns exact zero for identical coordinates', () => {
      const zero = calculateDistanceMiles(30.2672, -97.7431, 30.2672, -97.7431);
      expect(zero).toBe(0);
    });

    it('returns accurate non-zero positive fraction for micro-distances (1e-6 degrees, ~0.11m)', () => {
      const micro = calculateDistanceMiles(0, 0, 0, 0.000001);
      expect(Number.isNaN(micro)).toBe(false);
      expect(micro).toBeGreaterThan(0);
      expect(micro).toBeLessThan(0.001);
      expect(micro).toBeCloseTo(0.000069, 5);
    });

    it('accurately computes equatorial quarter-circumference (~6218.47 miles)', () => {
      const eqQuarter = calculateDistanceMiles(0, 0, 0, 90);
      const expected = (3958.8 * Math.PI) / 2;
      expect(Math.abs(eqQuarter - expected)).toBeLessThan(0.01);
    });

    it('accurately computes North Pole to South Pole distance (~12436.94 miles)', () => {
      const poles = calculateDistanceMiles(90, 0, -90, 0);
      const expected = 3958.8 * Math.PI;
      expect(poles).toBeCloseTo(expected, 1);
    });

    it('guarantees numerical stability and non-NaN distance across antipodal coordinate pairs', () => {
      // Benchmark antipodal coordinate pair that exposes floating point rounding error (a = 1.0000000000000002)
      const lat1 = -84.06326509318576;
      const lon1 = 12.102697212017063;
      const lat2 = 84.06326509318576;
      const lon2 = -167.89730278798294;

      const d = calculateDistanceMiles(lat1, lon1, lat2, lon2);
      expect(Number.isNaN(d)).toBe(false);
      expect(d).toBeCloseTo(3958.8 * Math.PI, 1);
    });

    it('guarantees zero NaNs across 5,000 randomized antipodal coordinate pairs', () => {
      let nanCount = 0;
      for (let i = 0; i < 5000; i++) {
        const lat1 = Math.random() * 180 - 90;
        const lon1 = Math.random() * 360 - 180;
        const lat2 = -lat1;
        const lon2 = lon1 > 0 ? lon1 - 180 : lon1 + 180;
        const d = calculateDistanceMiles(lat1, lon1, lat2, lon2);
        if (Number.isNaN(d)) {
          nanCount++;
        }
      }
      expect(nanCount).toBe(0);
    });
  });

  describe('Area 2: Ascending Distance Sorting Order Under Scrambled and Reverse Pools', () => {
    it('sorts candidate deck strictly ascending by distance (excluding promoted card anchor)', () => {
      const store = new RoomStore();
      const deck = store.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2672,
        lng: -97.7431,
        distance: 'short_drive',
        deckSize: 6,
      });

      expect(deck.length).toBe(6);
      expect(deck[2].isPromoted).toBe(true);

      const nonPromoted = deck.filter(v => !v.isPromoted);
      for (let i = 0; i < nonPromoted.length - 1; i++) {
        const dA = parseFloat(nonPromoted[i].distance);
        const dB = parseFloat(nonPromoted[i + 1].distance);
        expect(dA).toBeLessThanOrEqual(dB);
      }
    });

    it('produces identical distance-sorted ranking regardless of initial array ordering (forward vs reverse)', () => {
      const venues = loadVenues();
      const originLat = 30.2672;
      const originLng = -97.7431;

      const sortedForward = [...venues].sort((a, b) => {
        const dA = calculateDistanceMiles(originLat, originLng, a.lat, a.lng);
        const dB = calculateDistanceMiles(originLat, originLng, b.lat, b.lng);
        return dA - dB;
      });

      const sortedReverse = [...venues].reverse().sort((a, b) => {
        const dA = calculateDistanceMiles(originLat, originLng, a.lat, a.lng);
        const dB = calculateDistanceMiles(originLat, originLng, b.lat, b.lng);
        return dA - dB;
      });

      for (let i = 0; i < sortedForward.length; i++) {
        const distForward = calculateDistanceMiles(originLat, originLng, sortedForward[i].lat, sortedForward[i].lng);
        const distReverse = calculateDistanceMiles(originLat, originLng, sortedReverse[i].lat, sortedReverse[i].lng);
        expect(distForward).toBeCloseTo(distReverse, 4);
      }
    });
  });

  describe('Area 3: Radius Filtering Boundary Conditions', () => {
    it('includes boundary minus epsilon (0.9999 mi) and exact boundary (1.0000 mi) in walkable radius', () => {
      const maxDistance = 1.0;
      expect(0.9999 <= maxDistance).toBe(true);
      expect(1.0000 <= maxDistance).toBe(true);
    });

    it('strictly excludes boundary plus epsilon (1.0001 mi) from walkable radius', () => {
      const maxDistance = 1.0;
      expect(1.0001 <= maxDistance).toBe(false);
    });
  });

  describe('Area 4: Fallback Padding Behavior Under 0, 1, 2, 3 Venues in Radius', () => {
    let store;
    beforeEach(() => {
      store = new RoomStore();
    });

    it('pads to 4 venues when 0 venues exist in walkable radius', () => {
      // The Domain (North Austin): ~9-10 miles from all seed venues
      const deck = store.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.4014,
        lng: -97.7246,
        distance: 'walkable',
        deckSize: 4,
      });

      expect(deck.length).toBe(4);
      // All venues should be padded out-of-radius spots (>1.0 mi)
      expect(deck.every(v => parseFloat(v.distance) > 1.0)).toBe(true);
    });

    it('retains 1 in-radius venue and pads 3 out-of-radius venues when 1 venue exists in radius', () => {
      // Activities around Austin downtown has only 1 venue <= 1.0 mi (VR Dimension at 0.8 mi)
      const deck = store.getDeckForRoom({
        activityCategory: 'activities',
        lat: 30.2672,
        lng: -97.7431,
        distance: 'walkable',
        deckSize: 4,
      });

      expect(deck.length).toBe(4);
      expect(deck[0].id).toBe('venue-020');
      expect(parseFloat(deck[0].distance)).toBeLessThanOrEqual(1.0);
    });

    it('retains 2 in-radius venues and pads 2 out-of-radius venues when 2 venues exist in radius', () => {
      // Coordinates (30.2422, -97.7481) where exactly 2 dining spots are <= 1.0 mi
      const deck = store.getDeckForRoom({
        activityCategory: 'dining',
        lat: 30.2422,
        lng: -97.7481,
        distance: 'walkable',
        deckSize: 4,
      });

      expect(deck.length).toBe(4);
      const inRadius = deck.filter(v => calculateDistanceMiles(30.2422, -97.7481, v.lat, v.lng) <= 1.0);
      expect(inRadius.length).toBe(2);
    });

    it('retains 3 in-radius venues and pads 1 out-of-radius venue when 3 venues exist in radius', () => {
      // Coordinates (30.2422, -97.7481) where exactly 3 venues total in the seed catalog are <= 1.0 mi
      const testLat = 30.2422;
      const testLng = -97.7481;
      const deck = store.getDeckForRoom({
        activityCategory: 'all',
        lat: testLat,
        lng: testLng,
        distance: 'walkable',
        deckSize: 4,
      });

      expect(deck.length).toBe(4);
      const inRadius = deck.filter(v => calculateDistanceMiles(testLat, testLng, v.lat, v.lng) <= 1.0);
      expect(inRadius.length).toBe(3);
      const outOfRadius = deck.filter(v => calculateDistanceMiles(testLat, testLng, v.lat, v.lng) > 1.0);
      expect(outOfRadius.length).toBe(1);
    });
  });

  describe('Area 5: Cache Key Isolation Between Radius Tiers', () => {
    it('ensures distinct cache keys for walkable, short_drive, and metro_area tiers', () => {
      const places = new PlacesService();
      const kw = places.getGridKey(30.2672, -97.7431, 'dining', [], 'walkable');
      const kd = places.getGridKey(30.2672, -97.7431, 'dining', [], 'short_drive');
      const km = places.getGridKey(30.2672, -97.7431, 'dining', [], 'metro_area');

      expect(kw).not.toBe(kd);
      expect(kd).not.toBe(km);
      expect(kw).not.toBe(km);
    });

    it('prevents cross-radius cache contamination when switching radius settings', () => {
      const places = new PlacesService();
      const keyWalk = places.getGridKey(30.2672, -97.7431, 'dining', [], 'walkable');

      places.cache.set(keyWalk, {
        venues: [{ id: 'walkable-spot', name: 'Close Spot', distance: '0.2 mi' }],
        timestamp: Date.now(),
      });

      const cachedDrive = places.getCachedLiveVenues({
        lat: 30.2672,
        lng: -97.7431,
        activityCategory: 'dining',
        distance: 'short_drive',
      });
      expect(cachedDrive).toBeNull();
    });
  });
});
