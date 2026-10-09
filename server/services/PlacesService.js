import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const venuesPath = path.resolve(__dirname, '../data/venues.json');

/**
 * High-resolution authentic food, drink, and venue photography mapped by cuisine/category.
 */
export const CUISINE_PHOTOS = Object.freeze({
  pizza: [
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1528137871618-79d2761e3fd5?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=800&q=80',
  ],
  mexican: [
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1504544750208-dc0358e63f7f?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1584208632869-05fa0bdeaa5f?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1534352956036-cd81e27dd615?auto=format&fit=crop&w=800&q=80',
  ],
  burger: [
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1565299507177-b0ac66763828?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1521305916504-4a1121188589?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=800&q=80',
  ],
  sushi: [
    'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1611143669185-af224c5e3252?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1562436260-8c9216eeb703?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80',
  ],
  italian: [
    'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1546549032-9571cd6b27df?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1621996346565-e3d5d6281093?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1608897013039-887f21d8c804?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1579684947550-22e945225d9a?auto=format&fit=crop&w=800&q=80',
  ],
  seafood: [
    'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1534604973900-c43ab4c2e0ab?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
  ],
  asian: [
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1541696490-8744a5dc0228?auto=format&fit=crop&w=800&q=80',
  ],
  bbq: [
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80',
  ],
  steak: [
    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80',
  ],
  cafe: [
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=800&q=80',
  ],
  brunch: [
    'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1484723091739-0045614eb776?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?auto=format&fit=crop&w=800&q=80',
  ],
  dessert: [
    'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=800&q=80',
  ],
  bar: [
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1560512823-829485b8bf24?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1587271407850-8d438ca9fdf2?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=800&q=80',
  ],
  brewery: [
    'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1584225064785-c62a8b43d148?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1584225064785-c62a8b43d148?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?auto=format&fit=crop&w=800&q=80',
  ],
  entertainment: [
    'https://images.unsplash.com/photo-1511882150382-421056c89033?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1511882150382-421056c89033?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=800&q=80',
  ],
  general: [
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=800&q=80',
  ],
});

/**
 * Pre-cached coordinate database for top global metro areas.
 */
export const POPULAR_CITIES = Object.freeze({
  'austin': { lat: 30.2672, lng: -97.7431, name: 'Austin, TX' },
  'austin, tx': { lat: 30.2672, lng: -97.7431, name: 'Austin, TX' },
  'new york': { lat: 40.7128, lng: -74.0060, name: 'New York, NY' },
  'nyc': { lat: 40.7128, lng: -74.0060, name: 'New York, NY' },
  'new york, ny': { lat: 40.7128, lng: -74.0060, name: 'New York, NY' },
  'san francisco': { lat: 37.7749, lng: -122.4194, name: 'San Francisco, CA' },
  'sf': { lat: 37.7749, lng: -122.4194, name: 'San Francisco, CA' },
  'chicago': { lat: 41.8781, lng: -87.6298, name: 'Chicago, IL' },
  'chicago, il': { lat: 41.8781, lng: -87.6298, name: 'Chicago, IL' },
  'los angeles': { lat: 34.0522, lng: -118.2437, name: 'Los Angeles, CA' },
  'la': { lat: 34.0522, lng: -118.2437, name: 'Los Angeles, CA' },
  'miami': { lat: 25.7617, lng: -80.1918, name: 'Miami, FL' },
  'miami, fl': { lat: 25.7617, lng: -80.1918, name: 'Miami, FL' },
  'seattle': { lat: 47.6062, lng: -122.3321, name: 'Seattle, WA' },
  'dallas': { lat: 32.7767, lng: -96.7970, name: 'Dallas, TX' },
  'houston': { lat: 29.7604, lng: -95.3698, name: 'Houston, TX' },
  'denver': { lat: 39.7392, lng: -104.9903, name: 'Denver, CO' },
  'nashville': { lat: 36.1627, lng: -86.7816, name: 'Nashville, TN' },
  'boston': { lat: 42.3601, lng: -71.0589, name: 'Boston, MA' },
  'atlanta': { lat: 33.7490, lng: -84.3880, name: 'Atlanta, GA' },
  'london': { lat: 51.5074, lng: -0.1278, name: 'London, UK' },
  'paris': { lat: 48.8566, lng: 2.3522, name: 'Paris, France' },
  'tokyo': { lat: 35.6762, lng: 139.6503, name: 'Tokyo, Japan' },
  'toronto': { lat: 43.6532, lng: -79.3832, name: 'Toronto, Canada' },
});

export function calculateDistanceMiles(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 1.0;
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
  return R * c;
}

export function deduplicateVenues(venues) {
  if (!Array.isArray(venues)) return [];
  const seenIds = new Set();
  const unique = [];

  for (const venue of venues) {
    if (!venue || !venue.id) continue;
    if (seenIds.has(venue.id)) continue;

    const cleanName = (venue.name || '').trim().toLowerCase();
    const vLat = venue.lat != null ? Number(venue.lat) : null;
    const vLng = venue.lng != null ? Number(venue.lng) : null;

    let isCoLocatedDuplicate = false;
    for (const existing of unique) {
      const existingCleanName = (existing.name || '').trim().toLowerCase();
      if (existingCleanName === cleanName) {
        const eLat = existing.lat != null ? Number(existing.lat) : null;
        const eLng = existing.lng != null ? Number(existing.lng) : null;

        if (vLat != null && vLng != null && eLat != null && eLng != null) {
          const distMiles = calculateDistanceMiles(vLat, vLng, eLat, eLng);
          if (distMiles < 0.15) {
            isCoLocatedDuplicate = true;
            break;
          }
        } else {
          isCoLocatedDuplicate = true;
          break;
        }
      }
    }

    if (!isCoLocatedDuplicate) {
      seenIds.add(venue.id);
      unique.push(venue);
    }
  }

  return unique;
}

export class PlacesService {
  constructor() {
    this.cache = new Map();
    this.geoCache = new Map();
    this.cacheTtlMs = 24 * 60 * 60 * 1000;
  }

  deduplicateVenues(venues) {
    return deduplicateVenues(venues);
  }

  getGridKey(lat, lng, category = 'dining', cuisinePreferences = [], distance = 'short_drive') {
    const distKey = String(distance || 'short_drive').toLowerCase();
    const catKey = (category || 'dining').toLowerCase();
    const cuisineSuffix = Array.isArray(cuisinePreferences) && cuisinePreferences.length > 0
      ? `_${cuisinePreferences.slice().sort().join('-')}`
      : '';
    if (lat == null || lng == null) return `global_${catKey}_dist-${distKey}${cuisineSuffix}`;
    const gridLat = (Math.round(lat * 50) / 50).toFixed(2);
    const gridLng = (Math.round(lng * 50) / 50).toFixed(2);
    return `grid_${gridLat}_${gridLng}_${catKey}_dist-${distKey}${cuisineSuffix}`;
  }

  loadSeedVenues() {
    try {
      const raw = fs.readFileSync(venuesPath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error('Failed to read seed venues:', err);
      return [];
    }
  }

  /**
   * Asynchronously resolves any US zip code, city name, or address to { lat, lng, name }.
   * Uses zippopotam.us (zero API keys, ~100ms) for zip codes, and Nominatim for worldwide cities.
   */
  async resolveLocationCoordinatesAsync(locationName) {
    if (!locationName || typeof locationName !== 'string') return null;
    const clean = locationName.trim().toLowerCase();

    // 1. Check in-memory geocoding cache
    if (this.geoCache.has(clean)) {
      return this.geoCache.get(clean);
    }

    // 2. Direct dictionary check
    const syncResult = this.resolveLocationCoordinates(clean);
    if (syncResult) {
      this.geoCache.set(clean, syncResult);
      return syncResult;
    }

    // 3. Check for 5-digit US zip code (e.g., '78704', '90210')
    const zipMatch = clean.match(/\b\d{5}\b/);
    if (zipMatch) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(`https://api.zippopotam.us/us/${zipMatch[0]}`, {
          signal: controller.signal,
          headers: { 'User-Agent': 'MatchBite/1.0' },
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.places) && data.places.length > 0) {
            const p = data.places[0];
            const result = {
              lat: parseFloat(p.latitude),
              lng: parseFloat(p.longitude),
              name: `${p['place name']}, ${p['state abbreviation']}`,
              city: p['place name'],
              state: p['state abbreviation'],
              zip: zipMatch[0],
            };
            this.geoCache.set(clean, result);
            this.geoCache.set(zipMatch[0], result);
            return result;
          }
        }
      } catch {
        // continue to Nominatim fallback
      }
    }

    // 4. Fallback to OpenStreetMap Nominatim for any worldwide city/address
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1`,
        {
          signal: controller.signal,
          headers: { 'User-Agent': 'MatchBite/1.0 (https://matchbite.app)' },
        }
      );
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
          const result = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            name: data[0].display_name,
          };
          this.geoCache.set(clean, result);
          return result;
        }
      }
    } catch {
      // geocoding failure ignored
    }

    return null;
  }

  resolveLocationCoordinates(locationName) {
    if (!locationName || typeof locationName !== 'string') return null;
    const clean = locationName.trim().toLowerCase();

    // Check geoCache first
    if (this.geoCache && this.geoCache.has(clean)) {
      return this.geoCache.get(clean);
    }

    // 1. Direct match in dictionary
    if (POPULAR_CITIES[clean]) {
      return POPULAR_CITIES[clean];
    }

    // 2. Exact word boundary or substring match
    for (const [key, loc] of Object.entries(POPULAR_CITIES)) {
      if (key.length <= 2) {
        // Short abbreviation codes (e.g., 'la', 'sf', 'ny') require word boundaries
        const regex = new RegExp(`(^|[^a-z])${key}([^a-z]|$)`, 'i');
        if (regex.test(clean)) return loc;
      } else {
        if (clean.includes(key)) return loc;
      }
    }
    return null;
  }

  getImageForVenue(name, cuisine, category) {
    const text = `${name} ${cuisine || ''} ${category || ''}`.toLowerCase();
    let pool = CUISINE_PHOTOS.general;

    if (text.includes('pizza') || text.includes('pizzeria')) pool = CUISINE_PHOTOS.pizza;
    else if (text.includes('taco') || text.includes('mexican') || text.includes('cantina') || text.includes('taqueria') || text.includes('burrito')) pool = CUISINE_PHOTOS.mexican;
    else if (text.includes('bbq') || text.includes('barbecue') || text.includes('smokehouse') || text.includes('ribs') || text.includes('brisket')) pool = CUISINE_PHOTOS.bbq;
    else if (text.includes('steak') || text.includes('chophouse') || text.includes('prime')) pool = CUISINE_PHOTOS.steak;
    else if (text.includes('burger') || text.includes('smash') || text.includes('slider')) pool = CUISINE_PHOTOS.burger;
    else if (text.includes('sushi') || text.includes('ramen') || text.includes('japanese') || text.includes('izakaya')) pool = CUISINE_PHOTOS.sushi;
    else if (text.includes('pasta') || text.includes('italian') || text.includes('trattoria') || text.includes('risotto')) pool = CUISINE_PHOTOS.italian;
    else if (text.includes('seafood') || text.includes('oyster') || text.includes('fish') || text.includes('lobster') || text.includes('crab')) pool = CUISINE_PHOTOS.seafood;
    else if (text.includes('brunch') || text.includes('breakfast') || text.includes('pancake') || text.includes('waffle')) pool = CUISINE_PHOTOS.brunch;
    else if (text.includes('dessert') || text.includes('ice cream') || text.includes('gelato') || text.includes('pastry') || text.includes('bakery')) pool = CUISINE_PHOTOS.dessert;
    else if (text.includes('brewery') || text.includes('brewing') || text.includes('beer') || text.includes('taproom') || text.includes('biergarten')) pool = CUISINE_PHOTOS.brewery;
    else if (text.includes('asian') || text.includes('thai') || text.includes('chinese') || text.includes('noodle') || text.includes('vietnamese') || text.includes('pho') || text.includes('dim sum') || text.includes('korean')) pool = CUISINE_PHOTOS.asian;
    else if (text.includes('cafe') || text.includes('coffee') || text.includes('espresso') || text.includes('roaster')) pool = CUISINE_PHOTOS.cafe;
    else if (text.includes('bar') || text.includes('lounge') || text.includes('pub') || text.includes('cocktail') || category === 'bars') pool = CUISINE_PHOTOS.bar;
    else if (category === 'entertainment' || category === 'activities' || text.includes('arcade') || text.includes('bowling') || text.includes('cinema')) pool = CUISINE_PHOTOS.entertainment;

    let hash = 0;
    const seed = `${name} ${cuisine || ''} ${category || ''}`;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    return pool[Math.abs(hash) % pool.length];
  }

  /**
   * Fetches real live places from OpenStreetMap Overpass (free, zero API keys).
   * Pulls all available restaurants, bars, and cafes (nodes & buildings) near coordinates.
   */
  async fetchLiveFromOverpass({ lat, lng, category = 'dining', cuisinePreferences = [], maxDistanceMiles = 5.0, limit = 150 }) {
    if (process.env.NODE_ENV === 'test') {
      return [];
    }

    const radiusMeters = Math.min(30000, Math.max(1500, Math.round(maxDistanceMiles * 1609.34)));
    
    let amenityFilter = `node["amenity"~"restaurant|fast_food|food_court|bistro|cafe"](around:${radiusMeters},${lat},${lng});
  way["amenity"~"restaurant|fast_food|food_court|bistro|cafe"](around:${radiusMeters},${lat},${lng});`;
    if (category === 'bars' || category === 'nightlife') {
      amenityFilter = `node["amenity"~"bar|pub|biergarten|lounge"](around:${radiusMeters},${lat},${lng});
  way["amenity"~"bar|pub|biergarten|lounge"](around:${radiusMeters},${lat},${lng});`;
    } else if (category === 'coffee') {
      amenityFilter = `node["amenity"~"cafe|bakery"](around:${radiusMeters},${lat},${lng});
  way["amenity"~"cafe|bakery"](around:${radiusMeters},${lat},${lng});`;
    } else if (category === 'entertainment' || category === 'activities') {
      amenityFilter = `node["amenity"~"cinema|theatre|nightclub|arts_centre|bowling_alley"](around:${radiusMeters},${lat},${lng});
  way["amenity"~"cinema|theatre|nightclub|arts_centre|bowling_alley"](around:${radiusMeters},${lat},${lng});`;
    }

    if (Array.isArray(cuisinePreferences) && cuisinePreferences.length > 0 && category === 'dining') {
      const cuisineRegex = cuisinePreferences.map(c => String(c).toLowerCase().trim()).join('|');
      amenityFilter = `node["amenity"~"restaurant|fast_food|bistro|cafe"]["cuisine"~"${cuisineRegex}",i](around:${radiusMeters},${lat},${lng});
  way["amenity"~"restaurant|fast_food|bistro|cafe"]["cuisine"~"${cuisineRegex}",i](around:${radiusMeters},${lat},${lng});
  node["amenity"~"restaurant|fast_food|bistro|cafe"](around:${radiusMeters},${lat},${lng});
  way["amenity"~"restaurant|fast_food|bistro|cafe"](around:${radiusMeters},${lat},${lng});`;
    }

    const queryLimit = limit === 'all' || Number(limit) >= 150 ? 250 : (Number(limit) || 150);
    const query = `[out:json][timeout:12];
(
  ${amenityFilter}
);
out center ${queryLimit};`;

    const mirrors = [
      'https://overpass.openstreetmap.fr/api/interpreter',
      'https://z.overpass-api.de/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://overpass-api.de/api/interpreter',
    ];

    let data = null;
    for (const endpoint of mirrors) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8500);
        const res = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': 'MatchBite/1.0 (https://matchbite.app)' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            const parsed = await res.json();
            if (parsed && Array.isArray(parsed.elements) && parsed.elements.length > 0) {
              data = parsed;
              break;
            }
          }
        }
      } catch {
        // try next mirror
      }
    }

    if (!data || !Array.isArray(data.elements) || data.elements.length === 0) {
      return [];
    }

    const validElements = data.elements.filter(e => {
      const hasTags = e.tags && e.tags.name;
      const elLat = e.lat ?? e.center?.lat;
      const elLon = e.lon ?? e.center?.lon;
      return hasTags && elLat != null && elLon != null;
    });

    const mappedVenues = validElements.map((node, idx) => {
      const name = node.tags.name.trim();
      const nodeLat = node.lat ?? node.center?.lat ?? lat;
      const nodeLon = node.lon ?? node.center?.lon ?? lng;
      const rawCuisine = node.tags.cuisine ? node.tags.cuisine.split(';')[0].replace(/_/g, ' ') : null;
      const amenity = node.tags.amenity || category;
      const cuisine = rawCuisine
        ? rawCuisine.charAt(0).toUpperCase() + rawCuisine.slice(1)
        : (amenity === 'bar' ? 'Cocktails & Spirits' : (amenity === 'cafe' ? 'Coffee & Bakery' : 'Local Eatery'));

      const distanceNum = calculateDistanceMiles(lat, lng, nodeLat, nodeLon);
      const street = node.tags['addr:street'];
      const housenumber = node.tags['addr:housenumber'] || '';
      const address = street ? `${housenumber} ${street}`.trim() : (node.tags['addr:city'] || 'Local Neighborhood');

      const hash = Math.abs(node.id) % 100;
      const rating = Number((4.3 + (hash % 7) * 0.1).toFixed(1));
      const reviewCount = 120 + ((hash * 13) % 750);
      const priceTier = (hash % 3) + 1;

      const imageUrl = this.getImageForVenue(name, cuisine, category);

      // Extract rich OpenStreetMap metadata
      const website = node.tags.website || node.tags['contact:website'] || node.tags.url || null;
      const phone = node.tags.phone || node.tags['contact:phone'] || null;
      const openingHours = node.tags.opening_hours || null;
      const outdoorSeating = node.tags.outdoor_seating === 'yes';
      const takeaway = node.tags.takeaway === 'yes' || node.tags.takeaway === 'only';
      const delivery = node.tags.delivery === 'yes';
      const brewery = Boolean(node.tags.brewery || node.tags.microbrewery || node.tags.craft);
      const vegetarian = node.tags['diet:vegetarian'] === 'yes' || node.tags['diet:vegan'] === 'yes';
      const wifi = node.tags.internet_access === 'wlan' || node.tags.internet_access === 'yes' || node.tags.internet_access === 'free';

      // Dynamic rich feature tags
      const tags = [cuisine, `${distanceNum.toFixed(1)} mi`];
      if (outdoorSeating) tags.push('☀️ Patio');
      if (takeaway) tags.push('🥡 Takeout');
      if (delivery) tags.push('🛵 Delivery');
      if (brewery) tags.push('🍺 Craft Brews');
      if (vegetarian) tags.push('🌱 Veg Friendly');
      if (wifi) tags.push('📶 Free Wi-Fi');
      if (website) tags.push('🌐 Website');

      // Ensure at least 3-4 lively tags per card
      if (tags.length < 3) {
        const atmosphereTags = ['Popular Spot', 'Neighborhood Gem', 'Great Ambiance', 'Group Friendly', 'Cozy Vibe'];
        tags.push(atmosphereTags[hash % atmosphereTags.length]);
      }

      // Dynamic contextual description
      const descPrefixes = ['Beloved neighborhood', 'Vibrant local', 'Highly rated', 'Cozy community', 'Charming neighborhood'];
      const prefix = descPrefixes[hash % descPrefixes.length];
      const highlights = [];
      if (outdoorSeating) highlights.push('outdoor patio seating');
      if (takeaway || delivery) highlights.push('takeout & delivery options');
      if (brewery) highlights.push('house craft beverages');
      if (wifi) highlights.push('Wi-Fi access');
      const highlightSentence = highlights.length > 0 
        ? ` Highlights include ${highlights.join(' and ')}.` 
        : ' Serving signature local favorites in a welcoming atmosphere.';
      const description = `${prefix} ${cuisine.toLowerCase()} spot rated ${rating}★ based on ${reviewCount} reviews.${highlightSentence}`;

      return {
        id: `osm-${node.id}`,
        name,
        category: category.toLowerCase(),
        cuisine,
        priceTier,
        rating,
        reviewCount,
        distance: `${distanceNum.toFixed(1)} mi`,
        address,
        imageUrl,
        lat: nodeLat,
        lng: nodeLon,
        tags,
        description,
        websiteUrl: website,
        phone,
        openHours: openingHours || 'Open Daily • Check website or call for hours',
        isPromoted: idx === 0,
        sponsorBadge: idx === 0 ? 'Featured' : null,
        sponsorPerk: idx === 0 ? 'Free appetizer with table reservation' : null,
        affiliateLinks: {
          directionsUrl: `https://maps.google.com/?q=${encodeURIComponent(name + ' ' + address)}`,
          reservationUrl: `/api/affiliate/redirect?partner=opentable&venueId=osm-${node.id}`,
          deliveryUrl: `/api/affiliate/redirect?partner=doordash&venueId=osm-${node.id}`,
          menuUrl: website || `https://www.google.com/search?q=${encodeURIComponent(name + ' menu ' + address)}`,
          websiteUrl: website,
        },
      };
    });

    return this.deduplicateVenues(mappedVenues);
  }

  /**
   * Fetches real live places from Google Places API (New & Legacy Nearby Search fallback).
   */
  async fetchLiveFromGoogle({ lat, lng, category = 'dining', cuisinePreferences = [], maxDistanceMiles = 5.0, limit = 25, apiKey = null }) {
    const key = apiKey || process.env.GOOGLE_MAPS_API_KEY || process.env.PLACES_API_KEY;
    if (!key) return null;

    const radiusMeters = Math.min(50000, Math.max(1000, Math.round(maxDistanceMiles * 1609.34)));

    let googleType = 'restaurant';
    let newApiType = 'restaurant';
    if (category === 'bars' || category === 'nightlife') {
      googleType = 'bar';
      newApiType = 'bar';
    } else if (category === 'coffee') {
      googleType = 'cafe';
      newApiType = 'cafe';
    } else if (category === 'entertainment' || category === 'activities') {
      googleType = 'movie_theater';
      newApiType = 'movie_theater';
    }

    // 1. Try Google Places API (New) - v1/places:searchNearby
    try {
      const typeGroups = [];
      const CUISINE_MAP = {
        pizza: [['pizza_restaurant'], ['italian_restaurant'], ['pizza_restaurant', 'fast_food_restaurant']],
        italian: [['italian_restaurant'], ['pizza_restaurant'], ['mediterranean_restaurant']],
        mexican: [['mexican_restaurant'], ['latin_american_restaurant'], ['mexican_restaurant', 'barbecue_restaurant']],
        american: [['american_restaurant'], ['hamburger_restaurant'], ['steak_house'], ['barbecue_restaurant']],
        japanese: [['japanese_restaurant'], ['sushi_restaurant'], ['ramen_restaurant'], ['asian_restaurant']],
        asian: [['asian_restaurant'], ['chinese_restaurant'], ['thai_restaurant'], ['japanese_restaurant'], ['vietnamese_restaurant'], ['korean_restaurant']],
        seafood: [['seafood_restaurant'], ['american_restaurant', 'seafood_restaurant']],
        steakhouse: [['steak_house'], ['barbecue_restaurant'], ['american_restaurant']],
        mediterranean: [['mediterranean_restaurant'], ['greek_restaurant'], ['middle_eastern_restaurant']],
        indian: [['indian_restaurant'], ['asian_restaurant', 'indian_restaurant']],
        thai: [['thai_restaurant'], ['asian_restaurant', 'thai_restaurant'], ['vietnamese_restaurant']],
        cafe: [['cafe'], ['coffee_shop'], ['bakery'], ['breakfast_restaurant'], ['brunch_restaurant']],
      };

      if (Array.isArray(cuisinePreferences) && cuisinePreferences.length > 0) {
        for (const c of cuisinePreferences) {
          const mapped = CUISINE_MAP[c.toLowerCase()];
          if (mapped) {
            for (const grp of mapped) {
              typeGroups.push(grp);
            }
          }
        }
      }

      if (typeGroups.length === 0) {
        typeGroups.push([newApiType]);
        if (limit > 20 || limit === 'all') {
          if (category === 'dining') {
            typeGroups.push(['american_restaurant']);
            typeGroups.push(['italian_restaurant']);
            typeGroups.push(['mexican_restaurant']);
            typeGroups.push(['asian_restaurant']);
            typeGroups.push(['japanese_restaurant']);
            typeGroups.push(['korean_restaurant']);
            typeGroups.push(['vietnamese_restaurant']);
            typeGroups.push(['pizza_restaurant']);
            typeGroups.push(['bar']);
            typeGroups.push(['cafe']);
            typeGroups.push(['seafood_restaurant']);
            typeGroups.push(['steak_house']);
          } else if (category === 'bars' || category === 'nightlife') {
            typeGroups.push(['pub']);
            typeGroups.push(['night_club']);
            typeGroups.push(['brewery']);
            typeGroups.push(['wine_bar']);
            typeGroups.push(['cocktail_bar']);
          } else if (category === 'coffee') {
            typeGroups.push(['coffee_shop']);
            typeGroups.push(['bakery']);
            typeGroups.push(['cafe']);
          } else if (category === 'entertainment' || category === 'activities') {
            typeGroups.push(['bowling_alley']);
            typeGroups.push(['amusement_center']);
            typeGroups.push(['movie_theater']);
            typeGroups.push(['sports_club']);
          }
        }
      }

      const results = await Promise.all(
        typeGroups.map(async (types) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': key,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.location,places.photos',
              },
              body: JSON.stringify({
                includedTypes: types,
                maxResultCount: 20,
                locationRestriction: {
                  circle: {
                    center: { latitude: lat, longitude: lng },
                    radius: radiusMeters,
                  },
                },
              }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (res.ok) {
              const data = await res.json();
              return Array.isArray(data.places) ? data.places : [];
            } else {
              const errText = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
              console.warn(`[PlacesService] Google Places API (New) error ${res.status}:`, errText);
            }
          } catch (err) {
            console.warn('[PlacesService] Google Places API (New) fetch threw:', err.message);
          }
          return [];
        })
      );

      const combinedPlaces = [];
      const seenIds = new Set();
      for (const group of results) {
        for (const place of group) {
          if (place && place.id && !seenIds.has(place.id)) {
            seenIds.add(place.id);
            combinedPlaces.push(place);
          }
        }
      }

      if (combinedPlaces.length > 0) {
        const targetLimit = limit === 'all' ? combinedPlaces.length : (Number(limit) || 20);
        const mappedGoogle = combinedPlaces.slice(0, targetLimit).map((place, idx) => {
          const name = place.displayName?.text || 'Local Spot';
          const rawCuisine = place.primaryTypeDisplayName?.text || category;
          const cuisine = rawCuisine ? rawCuisine.charAt(0).toUpperCase() + rawCuisine.slice(1) : 'Local Eatery';
          const placeLat = place.location?.latitude ?? lat;
          const placeLng = place.location?.longitude ?? lng;
          const distanceNum = calculateDistanceMiles(lat, lng, placeLat, placeLng);
          const address = place.formattedAddress || 'Nearby';
          const rating = Number((place.rating || (4.3 + (idx % 5) * 0.1)).toFixed(1));
          const reviewCount = place.userRatingCount || (100 + (idx * 27));

          let priceTier = 2;
          if (place.priceLevel === 'PRICE_LEVEL_INEXPENSIVE') priceTier = 1;
          else if (place.priceLevel === 'PRICE_LEVEL_MODERATE') priceTier = 2;
          else if (place.priceLevel === 'PRICE_LEVEL_EXPENSIVE') priceTier = 3;
          else if (place.priceLevel === 'PRICE_LEVEL_VERY_EXPENSIVE') priceTier = 4;

          let imageUrl = null;
          if (place.photos && place.photos.length > 0 && place.photos[0].name) {
            imageUrl = `/api/places/photo?name=${encodeURIComponent(place.photos[0].name)}`;
          } else {
            imageUrl = this.getImageForVenue(name, cuisine, category);
          }

          return {
            id: `google-${place.id}`,
            name,
            category: category.toLowerCase(),
            cuisine,
            priceTier,
            rating,
            reviewCount,
            distance: `${distanceNum.toFixed(1)} mi`,
            address,
            imageUrl,
            lat: placeLat,
            lng: placeLng,
            tags: [cuisine, `${distanceNum.toFixed(1)} mi`, 'Google Verified'],
            description: `Highly-rated ${cuisine} venue (${rating}★, ${reviewCount} reviews).`,
            isPromoted: idx === 0,
            sponsorBadge: idx === 0 ? 'Featured' : null,
            sponsorPerk: idx === 0 ? 'Free appetizer with table reservation' : null,
            affiliateLinks: {
              directionsUrl: `https://maps.google.com/?q=${encodeURIComponent(name + ' ' + address)}`,
              reservationUrl: `/api/affiliate/redirect?partner=opentable&venueId=google-${place.id}`,
              deliveryUrl: `/api/affiliate/redirect?partner=doordash&venueId=google-${place.id}`,
            },
          };
        });
        return this.deduplicateVenues(mappedGoogle);
      }
    } catch (err) {
      console.warn('[PlacesService] Google Places API (New) request threw:', err.message);
    }

    // 2. Fallback to Google Places Legacy Nearby Search
    try {
      const legacyTypes = (limit > 20 || limit === 'all') && category === 'dining'
        ? ['restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway']
        : [googleType];

      const legacyResults = await Promise.all(
        legacyTypes.map(async (t) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&type=${t}&key=${key}`;
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
              const data = await res.json();
              if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
                console.warn(`[PlacesService] Google Places Legacy status: ${data.status} - ${data.error_message || ''}`);
              }
              if (data && Array.isArray(data.results)) {
                return data.results;
              }
            } else {
              const errText = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
              console.warn(`[PlacesService] Google Places Legacy error ${res.status}:`, errText);
            }
          } catch (err) {
            console.warn('[PlacesService] Google Places Legacy request threw:', err.message);
          }
          return [];
        })
      );

      const combinedLegacy = [];
      const seenPlaceIds = new Set();
      for (const group of legacyResults) {
        for (const place of group) {
          if (place && place.place_id && !seenPlaceIds.has(place.place_id)) {
            seenPlaceIds.add(place.place_id);
            combinedLegacy.push(place);
          }
        }
      }

      if (combinedLegacy.length > 0) {
        const targetLimit = limit === 'all' ? combinedLegacy.length : (Number(limit) || 20);
        const mappedLegacy = combinedLegacy.slice(0, targetLimit).map((place, idx) => {
          const name = place.name || 'Local Spot';
          const cuisine = place.types?.[0]?.replace(/_/g, ' ') || 'Local Eatery';
          const formattedCuisine = cuisine.charAt(0).toUpperCase() + cuisine.slice(1);
          const placeLat = place.geometry?.location?.lat ?? lat;
          const placeLng = place.geometry?.location?.lng ?? lng;
          const distanceNum = calculateDistanceMiles(lat, lng, placeLat, placeLng);
          const address = place.vicinity || 'Nearby';
          const rating = Number((place.rating || (4.2 + (idx % 6) * 0.1)).toFixed(1));
          const reviewCount = place.user_ratings_total || (120 + (idx * 31));
          const priceTier = place.price_level || 2;

          let imageUrl = null;
          if (place.photos && place.photos.length > 0 && place.photos[0].photo_reference) {
            imageUrl = `/api/places/photo?ref=${encodeURIComponent(place.photos[0].photo_reference)}`;
          } else {
            imageUrl = this.getImageForVenue(name, formattedCuisine, category);
          }

          return {
            id: `gplace-${place.place_id}`,
            name,
            category: category.toLowerCase(),
            cuisine: formattedCuisine,
            priceTier,
            rating,
            reviewCount,
            distance: `${distanceNum.toFixed(1)} mi`,
            address,
            imageUrl,
            lat: placeLat,
            lng: placeLng,
            tags: [formattedCuisine, `${distanceNum.toFixed(1)} mi`, 'Google Verified'],
            description: `Local ${formattedCuisine} venue (${rating}★, ${reviewCount} reviews).`,
            isPromoted: idx === 0,
            sponsorBadge: idx === 0 ? 'Featured' : null,
            sponsorPerk: idx === 0 ? 'Free appetizer with table reservation' : null,
            affiliateLinks: {
              directionsUrl: `https://maps.google.com/?q=${encodeURIComponent(name + ' ' + address)}`,
              reservationUrl: `/api/affiliate/redirect?partner=opentable&venueId=gplace-${place.place_id}`,
              deliveryUrl: `/api/affiliate/redirect?partner=doordash&venueId=gplace-${place.place_id}`,
            },
          };
        });
        return this.deduplicateVenues(mappedLegacy);
      }
    } catch (err) {
      console.warn('[PlacesService] Google Places Legacy request threw:', err.message);
    }

    return null;
  }

  /**
   * Pluggable provider dispatcher:
   * Prefers Google Places API if GOOGLE_MAPS_API_KEY or PLACES_API_KEY is present.
   * Gracefully falls back to OpenStreetMap Overpass (0 cost, no API keys).
   */
  async fetchLivePlaces({ lat, lng, category = 'dining', cuisinePreferences = [], maxDistanceMiles = 5.0, limit = 150 }) {
    if (process.env.NODE_ENV === 'test') {
      return [];
    }

    if (process.env.GOOGLE_MAPS_API_KEY || process.env.PLACES_API_KEY) {
      try {
        const googleVenues = await this.fetchLiveFromGoogle({
          lat,
          lng,
          category,
          cuisinePreferences,
          maxDistanceMiles,
          limit,
        });
        if (googleVenues && Array.isArray(googleVenues) && googleVenues.length >= 4) {
          return googleVenues;
        }
      } catch (err) {
        console.warn('Google Places API request failed, falling back to Overpass:', err.message);
      }
    }

    return this.fetchLiveFromOverpass({ lat, lng, category, maxDistanceMiles, limit });
  }

  /**
   * Asynchronously preloads real venues into grid cache (non-blocking).
   */
  async preloadLiveVenues(settings = {}) {
    if (process.env.NODE_ENV === 'test') return;
    let lat = settings.lat != null ? Number(settings.lat) : null;
    let lng = settings.lng != null ? Number(settings.lng) : null;
    const category = (settings.activityCategory || 'dining').toLowerCase();

    if ((lat == null || lng == null) && settings.locationName) {
      const resolved = await this.resolveLocationCoordinatesAsync(settings.locationName);
      if (resolved) {
        lat = resolved.lat;
        lng = resolved.lng;
        if (settings.lat == null) settings.lat = resolved.lat;
        if (settings.lng == null) settings.lng = resolved.lng;
      }
    }

    if (lat == null || lng == null) return;

    const gridKey = this.getGridKey(lat, lng, category, settings.cuisinePreferences, settings.distance);
    if (this.cache.has(gridKey)) return;

    let maxDistanceMiles = 5.0;
    if (settings.distance === 'metro_area') maxDistanceMiles = 15.0;
    else if (settings.distance === 'short_drive') maxDistanceMiles = 5.0;
    else if (settings.distance === 'walkable') maxDistanceMiles = 1.0;
    else if (typeof settings.distance === 'number') maxDistanceMiles = settings.distance;

    const limit = settings.deckSize === 'all' ? 150 : (Number(settings.deckSize) ? Math.min(150, Number(settings.deckSize)) : 150);

    try {
      const places = await this.fetchLivePlaces({ lat, lng, category, cuisinePreferences: settings.cuisinePreferences, maxDistanceMiles, limit });
      if (places && places.length >= 4) {
        this.cache.set(gridKey, {
          venues: places,
          timestamp: Date.now(),
        });
      }
    } catch {
      // background preload failure ignored
    }
  }

  /**
   * Ensures live venues are loaded for settings, waiting up to timeoutMs if not yet cached.
   */
  async ensureLiveVenues(settings = {}, timeoutMs = 6000) {
    if (process.env.NODE_ENV === 'test') return;
    let lat = settings.lat != null ? Number(settings.lat) : null;
    let lng = settings.lng != null ? Number(settings.lng) : null;
    const category = (settings.activityCategory || 'dining').toLowerCase();

    if ((lat == null || lng == null) && settings.locationName) {
      const resolved = await this.resolveLocationCoordinatesAsync(settings.locationName);
      if (resolved) {
        lat = resolved.lat;
        lng = resolved.lng;
        if (settings.lat == null) settings.lat = resolved.lat;
        if (settings.lng == null) settings.lng = resolved.lng;
      }
    }

    if (lat == null || lng == null) return;

    const gridKey = this.getGridKey(lat, lng, category, settings.cuisinePreferences, settings.distance);
    const cached = this.cache.get(gridKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs && cached.venues?.length >= 4) {
      return;
    }

    const preloadPromise = this.preloadLiveVenues(settings);
    const timeoutPromise = new Promise(resolve => setTimeout(resolve, timeoutMs));
    await Promise.race([preloadPromise, timeoutPromise]);
  }

  /**
   * Synchronously returns cached live places if already fetched for this grid, or null.
   */
  getCachedLiveVenues(settings = {}) {
    let lat = settings.lat != null ? Number(settings.lat) : null;
    let lng = settings.lng != null ? Number(settings.lng) : null;
    const category = (settings.activityCategory || 'dining').toLowerCase();
    const isAll = settings.deckSize === 'all' || settings.deckSize === 'All' || settings.deckSize === 0;
    const deckSize = isAll ? 'all' : (Number(settings.deckSize) ? Math.floor(Math.max(1, Math.min(150, Number(settings.deckSize)))) : 'all');

    if ((lat == null || lng == null) && settings.locationName) {
      const resolved = this.resolveLocationCoordinates(settings.locationName);
      if (resolved) {
        lat = resolved.lat;
        lng = resolved.lng;
      }
    }

    if (lat == null || lng == null) return null;

    const gridKey = this.getGridKey(lat, lng, category, settings.cuisinePreferences, settings.distance);
    const cached = this.cache.get(gridKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs && Array.isArray(cached.venues) && cached.venues.length >= 4) {
      return this.sliceDeck(cached.venues, deckSize);
    }
    return null;
  }

  /**
   * Asynchronously fetches or retrieves cached live venues from OpenStreetMap Overpass.
   */
  async getLiveVenues(settings = {}) {
    let lat = settings.lat != null ? Number(settings.lat) : null;
    let lng = settings.lng != null ? Number(settings.lng) : null;
    const category = (settings.activityCategory || 'dining').toLowerCase();
    const isAll = settings.deckSize === 'all' || settings.deckSize === 'All' || settings.deckSize === 0;
    const deckSize = isAll ? 'all' : (Number(settings.deckSize) ? Math.floor(Math.max(1, Math.min(150, Number(settings.deckSize)))) : 'all');

    if ((lat == null || lng == null) && settings.locationName) {
      const resolved = this.resolveLocationCoordinates(settings.locationName);
      if (resolved) {
        lat = resolved.lat;
        lng = resolved.lng;
      }
    }

    if (lat == null || lng == null) return null;

    const gridKey = this.getGridKey(lat, lng, category, settings.cuisinePreferences, settings.distance);
    const cached = this.cache.get(gridKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs && Array.isArray(cached.venues) && cached.venues.length >= 4) {
      return this.sliceDeck(cached.venues, deckSize);
    }

    let maxDistanceMiles = 5.0;
    if (settings.distance === 'metro_area') maxDistanceMiles = 15.0;
    else if (settings.distance === 'short_drive') maxDistanceMiles = 5.0;
    else if (settings.distance === 'walkable') maxDistanceMiles = 1.0;
    else if (typeof settings.distance === 'number') maxDistanceMiles = settings.distance;

    const limit = isAll ? 150 : (Number(deckSize) ? Math.min(150, Number(deckSize)) : 150);

    try {
      const live = await this.fetchLivePlaces({ lat, lng, category, cuisinePreferences: settings.cuisinePreferences, maxDistanceMiles, limit });
      if (live && live.length >= 4) {
        this.cache.set(gridKey, {
          venues: live,
          timestamp: Date.now(),
        });
        return this.sliceDeck(live, deckSize);
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Synchronously returns cached live places if available, or localized seed venues.
   */
  getCachedOrSeedVenues(settings = {}) {
    let lat = settings.lat != null ? Number(settings.lat) : null;
    let lng = settings.lng != null ? Number(settings.lng) : null;
    const category = (settings.activityCategory || 'dining').toLowerCase();
    const isAll = settings.deckSize === 'all' || settings.deckSize === 'All' || settings.deckSize === 0;
    const deckSize = isAll ? 'all' : (Number(settings.deckSize) ? Math.floor(Math.max(1, Math.min(150, Number(settings.deckSize)))) : 12);

    if ((lat == null || lng == null) && settings.locationName) {
      const resolved = this.resolveLocationCoordinates(settings.locationName);
      if (resolved) {
        lat = resolved.lat;
        lng = resolved.lng;
      }
    }

    const gridKey = this.getGridKey(lat, lng, category, settings.cuisinePreferences, settings.distance);

    // 1. Check if real Overpass places are already cached for this grid
    const cached = this.cache.get(gridKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs && cached.venues.length >= 4) {
      return this.sliceDeck(cached.venues, deckSize);
    }

    // 2. Otherwise, trigger background preload for next round
    if (lat != null && lng != null) {
      this.preloadLiveVenues(settings).catch(() => {});
    }

    // 3. Return rich seed catalog with localized distances & directions
    const seedVenues = this.loadSeedVenues();
    let filtered = seedVenues.filter(v => {
      const vCat = (v.category || '').toLowerCase();
      if (category && category !== 'all' && vCat !== category) {
        if (!(category === 'activities' && vCat === 'entertainment') &&
            !(category === 'entertainment' && vCat === 'activities')) {
          return false;
        }
      }
      return true;
    });

    if (filtered.length < 4) {
      filtered = seedVenues;
    }

    const targetDeckSize = isAll ? seedVenues.length : (Number(deckSize) || 12);
    if (filtered.length < targetDeckSize) {
      const existingIds = new Set(filtered.map(v => v.id));
      for (const v of seedVenues) {
        if (filtered.length >= targetDeckSize) break;
        if (!existingIds.has(v.id)) {
          filtered.push(v);
          existingIds.add(v.id);
        }
      }
    }

    const localized = filtered.map((v) => {
      let distStr = v.distance;
      if (lat != null && lng != null && v.lat != null && v.lng != null) {
        const distMiles = calculateDistanceMiles(lat, lng, v.lat, v.lng);
        distStr = `${distMiles.toFixed(1)} mi`;
      }
      const address = settings.locationName ? `${v.address}, ${settings.locationName}` : v.address;
      return {
        ...v,
        distance: distStr,
        affiliateLinks: {
          ...v.affiliateLinks,
          directionsUrl: `https://maps.google.com/?q=${encodeURIComponent(v.name + ' ' + address)}`,
        },
      };
    });

    return this.sliceDeck(localized, deckSize);
  }

  /**
   * Invalidates cached venues for a specific room or location.
   */
  invalidateCacheForRoom(settings = {}) {
    let lat = settings.lat != null ? Number(settings.lat) : null;
    let lng = settings.lng != null ? Number(settings.lng) : null;
    const category = (settings.activityCategory || 'dining').toLowerCase();

    if ((lat == null || lng == null) && settings.locationName) {
      const resolved = this.resolveLocationCoordinates(settings.locationName);
      if (resolved) {
        lat = resolved.lat;
        lng = resolved.lng;
      }
    }

    if (lat != null && lng != null) {
      const gridLat = (Math.round(lat * 50) / 50).toFixed(2);
      const gridLng = (Math.round(lng * 50) / 50).toFixed(2);
      const prefix = `grid_${gridLat}_${gridLng}`;
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    } else {
      for (const key of this.cache.keys()) {
        if (key.includes(category)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Clears the entire venues and geocoding cache.
   */
  clearCache() {
    this.cache.clear();
  }

  sliceDeck(pool, deckSize) {
    if (!pool || pool.length === 0) return [];
    const isAll = deckSize === 'all' || deckSize == null || deckSize === 'All' || deckSize === 0;
    const targetLimit = isAll ? pool.length : Math.max(1, Number(deckSize));
    const topLimit = Math.min(3, targetLimit);
    const targetIdx = Math.max(0, topLimit - 1);
    let candidate = [...pool];

    const hasDistances = candidate.some(v => v && (v.distance != null || v.distanceNum != null));
    if (hasDistances) {
      // 1. Sort candidate venues strictly ascending by distance
      candidate.sort((a, b) => {
        const distA = a ? (a.distanceNum !== undefined ? a.distanceNum : parseFloat(a.distance)) : NaN;
        const distB = b ? (b.distanceNum !== undefined ? b.distanceNum : parseFloat(b.distance)) : NaN;
        if (!isNaN(distA) && !isNaN(distB)) return distA - distB;
        if (!isNaN(distA)) return -1;
        if (!isNaN(distB)) return 1;
        return 0;
      });

      // 2. Anchor promoted card at index Math.max(0, topLimit - 1)
      const promotedIdx = candidate.findIndex(v => v && v.isPromoted);
      if (promotedIdx !== -1 && candidate.length >= topLimit && promotedIdx !== targetIdx) {
        const [promoted] = candidate.splice(promotedIdx, 1);
        candidate.splice(targetIdx, 0, promoted);
      } else if (promotedIdx === -1 && candidate.length > 0) {
        const pIdx = Math.min(targetIdx, candidate.length - 1);
        candidate[pIdx] = {
          ...candidate[pIdx],
          isPromoted: true,
          sponsorBadge: 'Featured',
        };
      }
    } else {
      // Backward compatibility for legacy test fixtures lacking distance attributes
      const promotedIdx = candidate.findIndex(v => v && v.isPromoted);
      if (promotedIdx >= topLimit) {
        const [promoted] = candidate.splice(promotedIdx, 1);
        candidate.splice(targetIdx, 0, promoted);
      } else if (promotedIdx === -1 && candidate.length > 0) {
        candidate[0] = {
          ...candidate[0],
          isPromoted: true,
          sponsorBadge: 'Featured',
        };
      }
    }

    if (isAll) {
      return candidate;
    }
    return candidate.slice(0, targetLimit);
  }
}

export const globalPlacesService = new PlacesService();
