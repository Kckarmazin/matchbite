import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateRoomCode, normalizeRoomCode } from './RoomCode.js';
import { CONFIG } from '../config.js';
import { globalBroadcaster } from '../sync/Broadcaster.js';
import { globalPlacesService, calculateDistanceMiles, cleanVenueDescription } from '../services/PlacesService.js';

export const FORBIDDEN_PROPERTY_NAMES = Object.freeze([
  '__proto__',
  'constructor',
  'prototype',
]);

export function isForbiddenPropertyName(key) {
  if (!key || typeof key !== 'string') return false;
  return FORBIDDEN_PROPERTY_NAMES.includes(key.trim());
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const venuesPath = path.resolve(__dirname, '../data/venues.json');

export function loadVenues() {
  try {
    const raw = fs.readFileSync(venuesPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading venues.json:', err);
    return [];
  }
}

export class RoomStore {
  constructor(broadcaster = null) {
    // Map of roomCode (uppercase) -> Room object
    this.rooms = new Map();
    this.broadcaster = broadcaster;
    this.affiliateClicks = [];

    // Start background TTL cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredRooms();
    }, CONFIG.CLEANUP_INTERVAL_MS);

    // Prevent interval from keeping Node process alive in tests
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Returns a Set of all currently active uppercase room codes.
   */
  getActiveCodes() {
    return new Set(this.rooms.keys());
  }

  /**
   * Creates a new decision room with the given host details and settings.
   */
  createRoom({
    hostName,
    hostAvatar = '🍕',
    hostId = null,
    groupType = 'friends',
    activityCategory = 'dining',
    cuisinePreferences = [],
    priceRange = [1, 2, 3],
    distance = 'walkable',
    deckSize = CONFIG.DEFAULT_DECK_SIZE,
    tieBreakerType = 'wheel',
    locationName = null,
    lat = null,
    lng = null,
    dietaryFilters = [],
    minRating = 4.0,
  }) {
    if (!hostName || typeof hostName !== 'string' || !hostName.trim()) {
      throw new Error('hostName is required');
    }

    if (hostId && isForbiddenPropertyName(hostId)) {
      const err = new Error(`Invalid hostId: '${hostId}' is a reserved property name`);
      err.statusCode = 400;
      throw err;
    }

    const trimmedHostName = hostName.trim();
    const code = generateRoomCode(this.getActiveCodes());
    const roomId = crypto.randomUUID();
    const hostParticipantId = hostId || `p-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CONFIG.ROOM_TTL_MS).toISOString();

    const hostSessionToken = `st-${crypto.randomUUID()}`;
    const hostKey = `hk-${crypto.randomUUID()}`;

    const hostParticipant = {
      id: hostParticipantId,
      name: trimmedHostName,
      avatar: hostAvatar || '🍕',
      isHost: true,
      sessionToken: hostSessionToken,
      status: 'lobby',
      swipedCount: 0,
      totalCards: 0,
      joinedAt: now,
      lastSeenAt: now,
    };

    const room = {
      id: roomId,
      code,
      status: 'lobby',
      settings: {
        groupType: groupType || 'friends',
        activityCategory: activityCategory || 'dining',
        cuisinePreferences: Array.isArray(cuisinePreferences) ? cuisinePreferences : [],
        priceRange: Array.isArray(priceRange) && priceRange.length > 0 ? priceRange : [1, 2, 3],
        distance: distance || 'walkable',
        deckSize: deckSize === 'all' || deckSize === 'All' ? 'all' : Math.floor(Math.max(1, Math.min(25, Number(deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12))),
        tieBreakerType: tieBreakerType || 'wheel',
        locationName: locationName || null,
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
        dietaryFilters: Array.isArray(dietaryFilters) ? dietaryFilters : [],
        minRating: minRating != null ? Number(minRating) : 4.0,
      },
      hostId: hostParticipantId,
      hostKey,
      participants: Object.assign(Object.create(null), {
        [hostParticipantId]: hostParticipant,
      }),
      deck: [],
      votes: Object.create(null), // venueId -> { participantId: 'like' | 'pass' | 'superlike' }
      matchedVenueId: null,
      matchedAt: null,
      tiebreakerResult: null,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      version: 1,
    };

    this.rooms.set(code, room);

    if (process.env.NODE_ENV !== 'test' && globalPlacesService && typeof globalPlacesService.preloadLiveVenues === 'function') {
      globalPlacesService.preloadLiveVenues(room.settings).catch(() => {});
    }

    return {
      room,
      participant: hostParticipant,
      sessionToken: hostSessionToken,
      hostKey,
    };
  }

  /**
   * Finds an active room by code. Purges if expired.
   */
  getRoom(rawCode) {
    const code = normalizeRoomCode(rawCode);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) return null;

    // Check expiration
    if (new Date(room.expiresAt).getTime() <= Date.now()) {
      this.deleteRoom(code);
      return null;
    }

    return room;
  }

  /**
   * Formats a room for public client consumption.
   */
  getPublicRoom(rawCode) {
    const room = this.getRoom(rawCode);
    if (!room) return null;

    const participantList = Object.values(room.participants).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.isHost,
      status: p.status,
      swipedCount: p.swipedCount,
      totalCards: p.totalCards,
    }));

    const matchedVenue = room.matchedVenueId
      ? ((room.deck || []).find(v => v.id === room.matchedVenueId) || this.getVenueById(room.matchedVenueId))
      : null;

    return {
      id: room.id,
      code: room.code,
      status: room.status,
      settings: { ...room.settings },
      hostId: room.hostId,
      participants: participantList,
      participantCount: participantList.length,
      deck: room.deck || [],
      matchedVenueId: room.matchedVenueId,
      matchedVenue,
      matchedAt: room.matchedAt,
      tiebreakerResult: room.tiebreakerResult,
      isVip: Boolean(room.isVip),
      vipPlan: room.vipPlan || null,
      vipPerks: room.vipPerks || null,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      expiresAt: room.expiresAt,
      version: room.version,
    };
  }

  /**
   * Joins an existing room with zero friction.
   */
  joinRoom(rawCode, { participantId, sessionToken, name, avatar }) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);

    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found or has expired`);
      err.statusCode = 404;
      throw err;
    }

    if (room.status === 'closed') {
      const err = new Error(`Room ${code} is closed`);
      err.statusCode = 409;
      throw err;
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      const err = new Error('Participant name is required');
      err.statusCode = 400;
      throw err;
    }

    const trimmedName = name.trim();
    const now = new Date().toISOString();
    let isNew = false;
    let participant;

    if (participantId && isForbiddenPropertyName(participantId)) {
      const err = new Error(`Invalid participantId: '${participantId}' is a reserved property name`);
      err.statusCode = 400;
      throw err;
    }

    // Check if participant is re-joining with existing ID
    if (participantId && room.participants[participantId]) {
      const existing = room.participants[participantId];
      if (!sessionToken || existing.sessionToken !== sessionToken) {
        const err = new Error('Invalid session token for participant; cannot reclaim session');
        err.statusCode = 403;
        throw err;
      }
      participant = existing;
      participant.name = trimmedName;
      if (avatar) participant.avatar = avatar;
      participant.lastSeenAt = now;
    } else {
      // Check room capacity limit
      const currentCount = Object.keys(room.participants).length;
      if (currentCount >= CONFIG.MAX_PARTICIPANTS) {
        const err = new Error('Room is at maximum capacity');
        err.statusCode = 409;
        throw err;
      }

      const pId = participantId && !room.participants[participantId] ? participantId : `p-${crypto.randomUUID()}`;
      const newSessionToken = `st-${crypto.randomUUID()}`;
      participant = {
        id: pId,
        name: trimmedName,
        avatar: avatar || '🍻',
        isHost: false,
        sessionToken: newSessionToken,
        status: room.status === 'voting' ? 'swiping' : 'lobby',
        swipedCount: 0,
        totalCards: room.deck ? room.deck.length : 0,
        joinedAt: now,
        lastSeenAt: now,
      };

      room.participants[pId] = participant;
      isNew = true;
    }

    room.updatedAt = now;
    room.version++;

    return {
      room,
      participant,
      sessionToken: participant.sessionToken,
      isNew,
    };
  }

  /**
   * Updates settings for a room (Host only).
   */
  updateSettings(rawCode, authData, newSettings = {}) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);

    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (room.status !== 'lobby') {
      const err = new Error('Settings can only be changed while in the lobby');
      err.statusCode = 400;
      throw err;
    }

    let participantId = null;
    let hostKey = null;
    let sessionToken = null;

    if (typeof authData === 'object' && authData !== null) {
      participantId = authData.participantId || null;
      hostKey = authData.hostKey || null;
      sessionToken = authData.sessionToken || null;
    } else if (typeof authData === 'string') {
      participantId = authData;
    }

    const hostParticipant = room.participants[room.hostId];
    const isAuthorized = Boolean(
      (hostKey && room.hostKey && hostKey === room.hostKey) ||
      (sessionToken && hostParticipant && hostParticipant.sessionToken === sessionToken) ||
      (sessionToken && room.hostKey && sessionToken === room.hostKey)
    );

    if (!isAuthorized) {
      const err = new Error('Only the room host can update settings');
      err.statusCode = 403;
      throw err;
    }

    // Merge allowed settings
    const allowedKeys = [
      'groupType',
      'activityCategory',
      'cuisinePreferences',
      'priceRange',
      'distance',
      'deckSize',
      'tieBreakerType',
      'locationName',
      'lat',
      'lng',
      'dietaryFilters',
      'minRating',
    ];

    for (const key of allowedKeys) {
      if (newSettings[key] !== undefined) {
        if (key === 'deckSize') {
          if (newSettings.deckSize === 'all' || newSettings.deckSize === 'All') {
            room.settings.deckSize = 'all';
          } else {
            room.settings.deckSize = Math.floor(
              Math.max(1, Math.min(25, Number(newSettings.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12))
            );
          }
        } else if (key === 'minRating') {
          room.settings.minRating = Number(newSettings.minRating);
        } else {
          room.settings[key] = newSettings[key];
        }
      }
    }

    room.updatedAt = new Date().toISOString();
    room.version++;

    // Invalidate mismatched cache in PlacesService
    if (globalPlacesService && typeof globalPlacesService.invalidateCacheForRoom === 'function') {
      globalPlacesService.invalidateCacheForRoom(room.settings);
    }

    // Rebuild room.deck based on updated settings
    room.deck = this.getDeckForRoom(room.settings);

    // Update totalCards for all participants
    if (room.participants) {
      for (const p of Object.values(room.participants)) {
        if (p) {
          p.totalCards = room.deck.length;
        }
      }
    }

    // Broadcast deck:updated via broadcaster
    const broadcaster = this.broadcaster || globalBroadcaster;
    if (broadcaster && typeof broadcaster.broadcast === 'function') {
      broadcaster.broadcast(code, 'deck:updated', {
        deck: room.deck,
        settings: room.settings,
      });
    }

    if (process.env.NODE_ENV !== 'test' && globalPlacesService && typeof globalPlacesService.preloadLiveVenues === 'function') {
      globalPlacesService.preloadLiveVenues(room.settings).catch(() => {});
    }

    return room.settings;
  }

  /**
   * Retrieves a single venue by ID.
   */
  getVenueById(venueId) {
    if (!venueId) return null;
    if (globalPlacesService && globalPlacesService.cache) {
      for (const cached of globalPlacesService.cache.values()) {
        if (Array.isArray(cached.venues)) {
          const found = cached.venues.find(v => v.id === venueId);
          if (found) return found;
        }
      }
    }
    const venues = loadVenues();
    return venues.find(v => v.id === venueId) || null;
  }

  /**
   * Generates a curated deck of venues based on room settings.
   * If live OpenStreetMap venues were preloaded/cached for this grid, serves them immediately.
   */
  getDeckForRoom(settings = {}) {
    // If live venues are pre-cached for this grid/location, use them as candidate source
    let candidateSource = null;
    if (globalPlacesService && typeof globalPlacesService.getCachedLiveVenues === 'function') {
      const live = globalPlacesService.getCachedLiveVenues({ ...settings, deckSize: 'all' });
      if (Array.isArray(live) && live.length >= 4) {
        candidateSource = live;
      }
    }

    const allVenues = candidateSource || loadVenues();
    const category = (settings.activityCategory || 'dining').toLowerCase();
    const priceRange = Array.isArray(settings.priceRange) && settings.priceRange.length > 0
      ? settings.priceRange
      : [1, 2, 3, 4];
    const distanceSetting = settings.distance || 'walkable';
    const isAll = settings.deckSize === 'all' || settings.deckSize === 'All';
    const deckSize = isAll ? 9999 : Math.floor(Math.max(1, Math.min(25, Number(settings.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12)));

    // Max radius in miles
    let maxDistance = 15.0;
    if (distanceSetting === 'walkable') maxDistance = 1.0;
    else if (distanceSetting === 'short_drive') maxDistance = 5.0;
    else if (distanceSetting === 'metro_area') maxDistance = 15.0;
    else if (typeof distanceSetting === 'number') maxDistance = distanceSetting;

    const originLat = settings.lat != null ? Number(settings.lat) : null;
    const originLng = settings.lng != null ? Number(settings.lng) : null;

    // Helper: calculate or parse numeric miles
    const getMiles = (v) => {
      if (originLat != null && originLng != null && v.lat != null && v.lng != null) {
        return calculateDistanceMiles(originLat, originLng, v.lat, v.lng);
      }
      const parsed = parseFloat(v.distance);
      return isNaN(parsed) ? 1.0 : parsed;
    };

    const localizedVenues = allVenues.map(v => {
      const miles = getMiles(v);
      const rawWeb = v.websiteUrl || v.affiliateLinks?.websiteUrl || v.affiliateLinks?.menuUrl;
      const seedWebsite = rawWeb
        ? (/^https?:\/\//i.test(rawWeb.trim()) ? rawWeb.trim() : `https://${rawWeb.trim()}`)
        : `https://www.google.com/search?q=${encodeURIComponent(`${v.name} ${v.address || ''}`.trim())}`;
      
      const cleanTags = (v.tags || []).filter(t => typeof t === 'string' && !t.toLowerCase().includes('website') && !t.includes('🌐'));
      const rawHighlights = v.highlights || (cleanTags.length > 0 ? cleanTags : ['Top Rated', 'Popular with Groups', 'Great Ambience']);
      const cleanHighlights = rawHighlights.filter(h => typeof h === 'string' && !h.toLowerCase().includes('website') && !h.includes('🌐'));

      return {
        ...v,
        distance: `${miles.toFixed(1)} mi`,
        distanceNum: miles,
        websiteUrl: seedWebsite,
        tags: cleanTags,
        highlights: cleanHighlights.length > 0 ? cleanHighlights : ['Top Rated Local Spot', 'Popular with Groups', 'Great Ambience'],
        description: cleanVenueDescription(v.description),
        affiliateLinks: {
          ...v.affiliateLinks,
          directionsUrl: v.affiliateLinks?.directionsUrl || `https://maps.google.com/?q=${encodeURIComponent(`${v.name} ${v.address || ''}`.trim())}`,
          websiteUrl: seedWebsite,
        },
      };
    });

    const getVenueMiles = (v) => (v.distanceNum !== undefined ? v.distanceNum : (parseFloat(v.distance) || 1.0));

    // 1. Filter by category
    let categoryFiltered = localizedVenues;
    if (category && category !== 'all') {
      categoryFiltered = localizedVenues.filter(v => {
        if (!v.category && candidateSource) return true;
        const vCat = (v.category || '').toLowerCase();
        if (!vCat && candidateSource) return true;
        if (vCat === category) return true;
        if (category === 'activities' && vCat === 'entertainment') return true;
        if (category === 'entertainment' && vCat === 'activities') return true;
        return false;
      });
    }

    // Sort category venues ascending by distance
    const sortedCategory = [...categoryFiltered].sort((a, b) => getVenueMiles(a) - getVenueMiles(b));

    // 2. Strictly enforce radius bounds & proximity fallback padding
    const inRadius = sortedCategory.filter(v => getVenueMiles(v) <= maxDistance);
    let distPool;
    if (inRadius.length >= 4) {
      distPool = inRadius;
    } else {
      // Proximity fallback padding: retain all in-radius venues first,
      // pad with closest available out-of-radius spots from sortedCategory to reach at least 4 spots
      const inRadiusIds = new Set(inRadius.map(v => v.id));
      const outOfRadius = sortedCategory.filter(v => !inRadiusIds.has(v.id));
      distPool = [...inRadius];
      for (const v of outOfRadius) {
        if (distPool.length >= 4) break;
        distPool.push(v);
      }
    }

    // 3. Filter by price tier
    const priceFiltered = distPool.filter(v => priceRange.includes(v.priceTier));
    let candidatePool = priceFiltered.length >= 4 ? priceFiltered : distPool;

    // 3b. Optional Dietary & Lifestyle filter
    if (Array.isArray(settings.dietaryFilters) && settings.dietaryFilters.length > 0) {
      const dietTerms = settings.dietaryFilters.map(d => String(d).toLowerCase());
      const dietFiltered = candidatePool.filter(v => {
        const text = `${v.name} ${v.cuisine} ${v.description || ''} ${(v.tags || []).join(' ')}`.toLowerCase();
        return dietTerms.some(term => text.includes(term) || (term === 'gluten_free' && text.includes('gluten')));
      });
      if (dietFiltered.length >= 4) {
        candidatePool = dietFiltered;
      }
    }

    // 3c. Optional Cuisine Preferences filter
    const hasCuisineFilter = Array.isArray(settings.cuisinePreferences) && settings.cuisinePreferences.length > 0;
    if (hasCuisineFilter) {
      const cuisineTerms = settings.cuisinePreferences.map(c => String(c).toLowerCase().trim());
      const cuisineFiltered = candidatePool.filter(v => {
        const text = `${v.name} ${v.cuisine} ${v.description || ''} ${(v.tags || []).join(' ')}`.toLowerCase();
        return cuisineTerms.some(term => {
          if (term === 'american') return text.includes('american') || text.includes('burger') || text.includes('grill') || text.includes('bbq');
          if (term === 'asian') return text.includes('asian') || text.includes('chinese') || text.includes('thai') || text.includes('noodle');
          if (term === 'japanese') return text.includes('japanese') || text.includes('sushi') || text.includes('ramen');
          if (term === 'steakhouse') return text.includes('steak') || text.includes('bbq') || text.includes('barbecue');
          return text.includes(term);
        });
      });
      if (cuisineFiltered.length >= 4 || (isAll && cuisineFiltered.length > 0)) {
        candidatePool = cuisineFiltered;
      }
    }

    // 3d. Optional Minimum Rating filter (Default: 4.0+)
    const minRating = settings.minRating != null ? Number(settings.minRating) : 4.0;
    if (minRating > 0) {
      const ratingFiltered = candidatePool.filter(v => {
        const r = typeof v.rating === 'number' ? v.rating : parseFloat(v.rating);
        return !isNaN(r) && r >= minRating;
      });
      if (ratingFiltered.length >= 4 || isAll) {
        candidatePool = ratingFiltered;
      }
    }

    // 4. Backfill if pool is smaller than deckSize (only when numeric deckSize is requested or pool < 4)
    if (!isAll ? candidatePool.length < deckSize : candidatePool.length < 4) {
      const targetCount = isAll ? 4 : deckSize;
      const existingIds = new Set(candidatePool.map(v => v.id));

      // First backfill from same category (sorted ascending by distance)
      const remainingCategory = sortedCategory.filter(v => !existingIds.has(v.id));
      for (const v of remainingCategory) {
        if (candidatePool.length >= targetCount) break;
        if (originLat != null && originLng != null && candidatePool.length >= 4 && getVenueMiles(v) > maxDistance) {
          continue;
        }
        if (minRating > 0 && candidatePool.length >= 4 && (Number(v.rating) || 0) < minRating) {
          continue;
        }
        candidatePool.push(v);
        existingIds.add(v.id);
      }

      // Then backfill from all venues (sorted ascending by distance)
      if (candidatePool.length < targetCount) {
        const sortedAll = [...localizedVenues].sort((a, b) => getVenueMiles(a) - getVenueMiles(b));
        const remainingAll = sortedAll.filter(v => !existingIds.has(v.id));
        for (const v of remainingAll) {
          if (candidatePool.length >= targetCount) break;
          if (originLat != null && originLng != null && candidatePool.length >= 4 && getVenueMiles(v) > maxDistance) {
            continue;
          }
          if (minRating > 0 && candidatePool.length >= 4 && (Number(v.rating) || 0) < minRating) {
            continue;
          }
          candidatePool.push(v);
          existingIds.add(v.id);
        }
      }
    }

    // 4b. Ensure candidatePool is sorted ascending by distance
    candidatePool.sort((a, b) => getVenueMiles(a) - getVenueMiles(b));

    // 5. Ensure promoted venue placement at index Math.max(0, topLimit - 1) (index 2 for topLimit=3)
    const effectiveLimit = isAll ? candidatePool.length : Math.min(candidatePool.length, deckSize);
    const topLimit = Math.min(3, effectiveLimit);
    const targetIdx = Math.max(0, topLimit - 1);
    let promotedIdx = candidatePool.findIndex(v => v && v.isPromoted);

    if (promotedIdx === -1) {
      // Find promoted venue from matching category first, then all
      const promotedVenue =
        localizedVenues.find(v => v && (v.category || '').toLowerCase() === category && (inRadius.length < 4 || getVenueMiles(v) <= maxDistance) && v.isPromoted) ||
        localizedVenues.find(v => v && (inRadius.length < 4 || getVenueMiles(v) <= maxDistance) && v.isPromoted) ||
        localizedVenues.find(v => v && (v.category || '').toLowerCase() === category && v.isPromoted) ||
        localizedVenues.find(v => v && v.isPromoted);
      if (promotedVenue) {
        const miles = getMiles(promotedVenue);
        const localizedPromoted = {
          ...promotedVenue,
          distance: `${miles.toFixed(1)} mi`,
          distanceNum: miles,
        };
        const insertIdx = Math.max(0, Math.min(targetIdx, candidatePool.length));
        candidatePool.splice(insertIdx, 0, localizedPromoted);
      } else if (candidatePool.length > 0) {
        const pIdx = Math.min(targetIdx, candidatePool.length - 1);
        candidatePool[pIdx].isPromoted = true;
        candidatePool[pIdx].sponsorBadge = 'Featured';
      }
    } else if (candidatePool.length >= topLimit && promotedIdx !== targetIdx) {
      const [promotedVenue] = candidatePool.splice(promotedIdx, 1);
      candidatePool.splice(targetIdx, 0, promotedVenue);
    }

    return isAll ? candidatePool : candidatePool.slice(0, deckSize);
  }

  /**
   * Starts a voting round for the room (Host only).
   */
  startVoting(rawCode, authData) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);

    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    let participantId = null;
    let hostKey = null;
    let sessionToken = null;

    if (typeof authData === 'object' && authData !== null) {
      participantId = authData.participantId || null;
      hostKey = authData.hostKey || null;
      sessionToken = authData.sessionToken || null;
    } else if (typeof authData === 'string') {
      sessionToken = authData;
    }

    const hostParticipant = room.participants[room.hostId];
    const isAuthorized = Boolean(
      (hostKey && room.hostKey && hostKey === room.hostKey) ||
      (sessionToken && hostParticipant && hostParticipant.sessionToken === sessionToken) ||
      (sessionToken && room.hostKey && sessionToken === room.hostKey) ||
      (participantId && participantId === room.hostId && sessionToken && hostParticipant && hostParticipant.sessionToken === sessionToken)
    );

    if (!isAuthorized) {
      const err = new Error('Only the room host can start voting');
      err.statusCode = 403;
      throw err;
    }

    // Build curated or live real venue deck based on room settings
    const deck = this.getDeckForRoom(room.settings);
    const now = new Date().toISOString();

    room.status = 'voting';
    room.deck = deck;
    room.votes = Object.create(null);
    room.matchedVenueId = null;
    room.matchedAt = null;
    room.updatedAt = now;
    room.version++;

    // Reset each participant's progress
    for (const p of Object.values(room.participants)) {
      p.status = 'swiping';
      p.swipedCount = 0;
      p.totalCards = deck.length;
      p.lastSeenAt = now;
    }

    // Broadcast voting:started via SSE
    if (this.broadcaster) {
      this.broadcaster.broadcast(code, 'voting:started', {
        deck,
        totalCards: deck.length,
        roomStatus: 'voting',
      });
    }

    return {
      room: this.getPublicRoom(code),
      deck,
    };
  }

  /**
   * Records a participant's vote on a venue and evaluates consensus matching.
   */
  recordVote(rawCode, { participantId, sessionToken, venueId, vote }) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);

    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (room.status === 'closed') {
      const err = new Error('Room is closed');
      err.statusCode = 409;
      throw err;
    }

    if (room.status === 'lobby') {
      const err = new Error('Voting has not started for this room');
      err.statusCode = 400;
      throw err;
    }

    if (!participantId || !room.participants[participantId]) {
      const err = new Error('Participant not found in room');
      err.statusCode = 404;
      throw err;
    }

    const participant = room.participants[participantId];

    // Authenticate participant sessionToken
    if (!sessionToken || participant.sessionToken !== sessionToken) {
      const err = new Error('Invalid or missing session token; vote rejected');
      err.statusCode = 403;
      throw err;
    }

    if (!venueId || typeof venueId !== 'string') {
      const err = new Error('venueId is required');
      err.statusCode = 400;
      throw err;
    }

    if (isForbiddenPropertyName(venueId)) {
      const err = new Error(`Invalid venueId: '${venueId}' is a reserved property name`);
      err.statusCode = 400;
      throw err;
    }

    if (isForbiddenPropertyName(participantId)) {
      const err = new Error(`Invalid participantId: '${participantId}' is a reserved property name`);
      err.statusCode = 400;
      throw err;
    }

    // Validate that venueId exists within the room's active deck
    const isVenueInDeck = Array.isArray(room.deck) && room.deck.some(v => v && v.id === venueId);
    if (!isVenueInDeck) {
      const err = new Error('venueId is not in the room deck');
      err.statusCode = 400;
      throw err;
    }

    if (!['like', 'pass', 'superlike'].includes(vote)) {
      const err = new Error(`Invalid vote type '${vote}'. Must be 'like', 'pass', or 'superlike'`);
      err.statusCode = 400;
      throw err;
    }

    const now = new Date().toISOString();

    // Ensure room.votes is a prototype-less object
    if (!room.votes || Object.getPrototypeOf(room.votes) !== null) {
      const safeVotes = Object.create(null);
      if (room.votes) {
        Object.assign(safeVotes, room.votes);
      }
      room.votes = safeVotes;
    }

    // Record the vote in room.votes map using prototype-less sub-maps
    if (!room.votes[venueId] || Object.getPrototypeOf(room.votes[venueId]) !== null) {
      const safeSubMap = Object.create(null);
      if (room.votes[venueId]) {
        Object.assign(safeSubMap, room.votes[venueId]);
      }
      room.votes[venueId] = safeSubMap;
    }
    room.votes[venueId][participantId] = vote;

    // Track swiped count for this participant
    let distinctSwiped = 0;
    for (const vId of Object.keys(room.votes)) {
      if (room.votes[vId] && room.votes[vId][participantId]) {
        distinctSwiped++;
      }
    }
    participant.swipedCount = distinctSwiped;
    participant.lastSeenAt = now;
    room.updatedAt = now;
    room.version++;

    const totalCards = room.deck ? room.deck.length : 0;
    const progressPercent = totalCards > 0 ? Math.round((distinctSwiped / totalCards) * 100) : 0;

    // Broadcast participant progress via SSE
    if (this.broadcaster) {
      this.broadcaster.broadcast(code, 'participant:progress', {
        participantId,
        participantName: participant.name,
        swipedCount: distinctSwiped,
        totalCards,
        venueId,
        progressPercent,
      });
    }

    // Evaluate Consensus Matching Engine:
    // A venue achieves unanimous consensus if all active participants have voted on it,
    // and ALL votes are positive ('like' or 'superlike').
    const activeParticipants = Object.values(room.participants);
    const venueVotes = room.votes[venueId] || Object.create(null);

    const allVoted = activeParticipants.length > 0 && activeParticipants.every(p => venueVotes[p.id] !== undefined);
    const allAgreed = activeParticipants.length > 0 && activeParticipants.every(p => {
      const v = venueVotes[p.id];
      return v === 'like' || v === 'superlike';
    });

    if (allVoted && allAgreed && room.status !== 'matched') {
      // Unanimous match achieved!
      const matchedVenue = (room.deck || []).find(d => d.id === venueId) || this.getVenueById(venueId);
      room.status = 'matched';
      room.matchedVenueId = venueId;
      room.matchedAt = now;

      const matchPayload = {
        venueId,
        venue: matchedVenue,
        matchedAt: now,
        isUnanimous: true,
        participants: activeParticipants.map(p => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          vote: venueVotes[p.id],
        })),
      };

      if (this.broadcaster) {
        this.broadcaster.broadcast(code, 'match:revealed', matchPayload);
      }

      return {
        success: true,
        isMatch: true,
        matchedVenue,
        match: matchPayload,
        progress: {
          swipedCount: participant.swipedCount,
          totalCards,
        },
      };
    }

    // Check if room is already matched on another venue
    if (room.status === 'matched') {
      const matchedVenue = (room.deck || []).find(d => d.id === room.matchedVenueId) || this.getVenueById(room.matchedVenueId);
      return {
        success: true,
        isMatch: true,
        matchedVenue,
        match: {
          venueId: room.matchedVenueId,
          venue: matchedVenue,
          matchedAt: room.matchedAt,
          isUnanimous: true,
        },
        progress: {
          swipedCount: participant.swipedCount,
          totalCards,
        },
      };
    }

    // Check deck completion without unanimous match
    const allCompleted = totalCards > 0 && activeParticipants.every(p => p.swipedCount >= totalCards);
    if (allCompleted && room.status === 'voting') {
      if (this.broadcaster) {
        this.broadcaster.broadcast(code, 'voting:ended', {
          reason: 'deck_completed',
          totalParticipants: activeParticipants.length,
        });
      }
    }

    return {
      success: true,
      isMatch: false,
      matchedVenue: null,
      progress: {
        swipedCount: participant.swipedCount,
        totalCards,
      },
    };
  }

  /**
   * Undoes a participant's vote on a venue, updating swiped count and broadcasting progress.
   */
  undoVote(rawCode, { participantId, sessionToken, venueId }) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);

    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (room.status === 'closed') {
      const err = new Error('Room is closed');
      err.statusCode = 409;
      throw err;
    }

    if (!participantId || !room.participants[participantId]) {
      const err = new Error('Participant not found in room');
      err.statusCode = 404;
      throw err;
    }

    const participant = room.participants[participantId];

    // Authenticate participant sessionToken
    if (!sessionToken || participant.sessionToken !== sessionToken) {
      const err = new Error('Invalid or missing session token; undo vote rejected');
      err.statusCode = 403;
      throw err;
    }

    if (!venueId || typeof venueId !== 'string') {
      const err = new Error('venueId is required');
      err.statusCode = 400;
      throw err;
    }

    // Delete vote for this participant on venueId
    if (room.votes && room.votes[venueId] && room.votes[venueId][participantId] !== undefined) {
      delete room.votes[venueId][participantId];
    }

    // Reconcile unanimous match triggers:
    // If the room was matched on this venue, but this participant rewound their positive vote,
    // evaluate whether consensus still holds. If not, revert room status back to voting.
    let matchReverted = false;
    if (room.status === 'matched' && room.matchedVenueId === venueId) {
      const activeParticipants = Object.values(room.participants);
      const venueVotes = (room.votes && room.votes[venueId]) || Object.create(null);
      const stillUnanimous =
        activeParticipants.length > 0 &&
        activeParticipants.every(p => {
          const v = venueVotes[p.id];
          return v === 'like' || v === 'superlike';
        });

      if (!stillUnanimous) {
        room.status = 'voting';
        room.matchedVenueId = null;
        room.matchedAt = null;
        matchReverted = true;

        if (this.broadcaster) {
          this.broadcaster.broadcast(code, 'match:reverted', {
            venueId,
            participantId,
            reason: 'vote_undone',
            roomStatus: 'voting',
          });
        }
      }
    }

    // Recalculate distinct swiped count
    let distinctSwiped = 0;
    for (const vId of Object.keys(room.votes || {})) {
      if (room.votes[vId] && room.votes[vId][participantId] !== undefined) {
        distinctSwiped++;
      }
    }
    participant.swipedCount = distinctSwiped;
    const now = new Date().toISOString();
    participant.lastSeenAt = now;
    room.updatedAt = now;
    room.version++;

    const totalCards = room.deck ? room.deck.length : 0;
    const progressPercent = totalCards > 0 ? Math.round((distinctSwiped / totalCards) * 100) : 0;

    // Broadcast participant progress via SSE
    if (this.broadcaster) {
      this.broadcaster.broadcast(code, 'participant:progress', {
        participantId,
        participantName: participant.name,
        swipedCount: distinctSwiped,
        totalCards,
        venueId,
        progressPercent,
      });
    }

    return {
      success: true,
      swipedCount: distinctSwiped,
      totalCards,
      progressPercent,
      roomStatus: room.status,
      matchReverted,
    };
  }

  /**
   * Computes consensus rankings, tallying votes across all venues.
   */
  getRoomResults(rawCode) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);

    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    const participantList = Object.values(room.participants);
    const deck = room.deck || [];

    const leaderboard = deck.map(venue => {
      const vVotes = room.votes[venue.id] || Object.create(null);
      let likeCount = 0;
      let superlikeCount = 0;
      let passCount = 0;
      const voters = [];

      for (const p of participantList) {
        const v = vVotes[p.id];
        if (v === 'like') {
          likeCount++;
          voters.push({ id: p.id, name: p.name, avatar: p.avatar, vote: v });
        } else if (v === 'superlike') {
          superlikeCount++;
          voters.push({ id: p.id, name: p.name, avatar: p.avatar, vote: v });
        } else if (v === 'pass') {
          passCount++;
        }
      }

      const approvals = likeCount + superlikeCount;
      const score = (superlikeCount * 3) + (likeCount * 1);
      const approvalRate = participantList.length > 0 ? Math.round((approvals / participantList.length) * 100) : 0;
      const isUnanimous = participantList.length > 0 && approvals === participantList.length && passCount === 0;

      return {
        venueId: venue.id,
        venue,
        score,
        approvals,
        likeCount,
        superlikeCount,
        passCount,
        approvalRate,
        isUnanimous,
        voters,
      };
    }).sort((a, b) => b.score - a.score || b.approvals - a.approvals);

    const matchedVenue = room.matchedVenueId
      ? ((room.deck || []).find(v => v.id === room.matchedVenueId) || this.getVenueById(room.matchedVenueId))
      : null;

    return {
      code: room.code,
      status: room.status,
      matchedVenueId: room.matchedVenueId,
      matchedVenue,
      matchedAt: room.matchedAt,
      totalParticipants: participantList.length,
      leaderboard,
    };
  }

  /**
   * Sets participant status (e.g., 'ready', 'swiping', 'finished').
   */
  updateParticipantStatus(rawCode, participantId, status) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);
    if (!room || !room.participants[participantId]) return null;

    room.participants[participantId].status = status;
    room.participants[participantId].lastSeenAt = new Date().toISOString();
    room.updatedAt = new Date().toISOString();
    room.version++;

    return room.participants[participantId];
  }

  /**
   * Gracefully leaves or disconnects a participant.
   */
  leaveRoom(rawCode, authData) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);

    let participantId = null;
    let sessionToken = null;
    let hostKey = null;

    if (typeof authData === 'object' && authData !== null) {
      participantId = authData.participantId || null;
      sessionToken = authData.sessionToken || null;
      hostKey = authData.hostKey || null;
    } else if (typeof authData === 'string') {
      participantId = authData;
    }

    if (!room || !participantId || !room.participants[participantId]) return false;

    const targetParticipant = room.participants[participantId];
    const isOwner = Boolean(
      (sessionToken && targetParticipant.sessionToken === sessionToken) ||
      (hostKey && room.hostKey === hostKey)
    );

    if (!isOwner) {
      const err = new Error('Unauthorized: cannot evict other participants');
      err.statusCode = 403;
      throw err;
    }

    delete room.participants[participantId];
    room.updatedAt = new Date().toISOString();
    room.version++;

    // If host left and others remain, assign new host
    const remainingIds = Object.keys(room.participants);
    if (room.hostId === participantId) {
      if (remainingIds.length > 0) {
        const nextHostId = remainingIds[0];
        room.hostId = nextHostId;
        room.participants[nextHostId].isHost = true;
        room.hostKey = room.participants[nextHostId].sessionToken;
      } else {
        // Keep room.hostId = participantId for telemetry/history, but invalidate host capability
        room.hostKey = null;
      }
    }

    return true;
  }

  /**
   * Helper to verify if caller has host privileges for the room.
   */
  isAuthorizedHost(room, authData) {
    if (!room) return false;
    let participantId = null;
    let hostKey = null;
    let sessionToken = null;

    if (typeof authData === 'object' && authData !== null) {
      participantId = authData.participantId || null;
      hostKey = authData.hostKey || null;
      sessionToken = authData.sessionToken || null;
    } else if (typeof authData === 'string') {
      sessionToken = authData;
    }

    const hostParticipant = room.participants[room.hostId];
    return Boolean(
      (hostKey && room.hostKey && hostKey === room.hostKey) ||
      (sessionToken && hostParticipant && hostParticipant.sessionToken === sessionToken) ||
      (sessionToken && room.hostKey && sessionToken === room.hostKey) ||
      (participantId && participantId === room.hostId && sessionToken && hostParticipant && hostParticipant.sessionToken === sessionToken)
    );
  }

  /**
   * Kicks or evicts an inactive or disruptive participant (Host only).
   * Recalculates room consensus immediately in case remaining participants now agree.
   */
  kickParticipant(rawCode, targetParticipantId, authData) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);

    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (!this.isAuthorizedHost(room, authData)) {
      const err = new Error('Unauthorized: only the room host can kick participants');
      err.statusCode = 403;
      throw err;
    }

    if (!targetParticipantId || !room.participants[targetParticipantId]) {
      const err = new Error('Participant not found in room');
      err.statusCode = 404;
      throw err;
    }

    if (targetParticipantId === room.hostId) {
      const err = new Error('Host cannot kick themselves from the room');
      err.statusCode = 400;
      throw err;
    }

    const kickedParticipant = room.participants[targetParticipantId];
    delete room.participants[targetParticipantId];

    // Clean up votes cast by the kicked participant
    if (room.votes) {
      for (const venueId of Object.keys(room.votes)) {
        if (room.votes[venueId] && room.votes[venueId][targetParticipantId]) {
          delete room.votes[venueId][targetParticipantId];
        }
      }
    }

    room.updatedAt = new Date().toISOString();
    room.version++;

    // Check if remaining active participants now reach unanimous consensus on any venue
    const remainingParticipants = Object.values(room.participants);
    let newlyMatchedVenue = null;
    if (remainingParticipants.length > 0 && room.status === 'voting' && !room.matchedVenueId) {
      for (const venue of (room.deck || [])) {
        const vVotes = room.votes[venue.id] || {};
        const allRemainingApproved = remainingParticipants.every(
          p => vVotes[p.id] === 'like' || vVotes[p.id] === 'superlike'
        );
        if (allRemainingApproved) {
          room.status = 'matched';
          room.matchedVenueId = venue.id;
          room.matchedAt = new Date().toISOString();
          newlyMatchedVenue = venue;
          break;
        }
      }
    }

    if (this.broadcaster) {
      this.broadcaster.broadcast(code, 'participant:kicked', {
        kickedId: targetParticipantId,
        kickedName: kickedParticipant.name,
        remainingParticipants: remainingParticipants.length,
      });

      if (newlyMatchedVenue) {
        this.broadcaster.broadcast(code, 'consensus:match', {
          matchedVenueId: newlyMatchedVenue.id,
          venue: newlyMatchedVenue,
          matchedAt: room.matchedAt,
          isUnanimous: true,
        });
      }
    }

    return {
      success: true,
      kickedId: targetParticipantId,
      kickedName: kickedParticipant.name,
      remainingCount: remainingParticipants.length,
      isMatch: Boolean(newlyMatchedVenue),
      matchedVenue: newlyMatchedVenue,
    };
  }

  /**
   * Nudges an inactive participant to alert them that their group is waiting (Host only).
   */
  nudgeParticipant(rawCode, targetParticipantId, authData) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);

    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (!this.isAuthorizedHost(room, authData)) {
      const err = new Error('Unauthorized: only the room host can nudge participants');
      err.statusCode = 403;
      throw err;
    }

    if (!targetParticipantId || !room.participants[targetParticipantId]) {
      const err = new Error('Participant not found in room');
      err.statusCode = 404;
      throw err;
    }

    const targetParticipant = room.participants[targetParticipantId];
    const hostParticipant = room.participants[room.hostId] || { name: 'Host' };

    if (this.broadcaster) {
      this.broadcaster.broadcast(code, 'participant:nudged', {
        targetParticipantId,
        targetName: targetParticipant.name,
        senderName: hostParticipant.name,
        message: `${hostParticipant.name} is nudging you! Your group is waiting for your vote.`,
      });
    }

    return {
      success: true,
      targetParticipantId,
      targetName: targetParticipant.name,
    };
  }

  /**
   * Starts a Sudden Death round with the top 3-5 contenders from the current session (Host only).
   */
  startSuddenDeath(rawCode, authData, customLimit = 3) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);

    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (!this.isAuthorizedHost(room, authData)) {
      const err = new Error('Unauthorized: only the room host can start Sudden Death');
      err.statusCode = 403;
      throw err;
    }

    const results = this.getRoomResults(code);
    const candidates = results.leaderboard || [];

    if (candidates.length === 0) {
      const err = new Error('No candidates available for Sudden Death');
      err.statusCode = 400;
      throw err;
    }

    const limit = Math.min(candidates.length, Math.max(2, customLimit));
    const suddenDeathDeck = candidates.slice(0, limit).map(c => c.venue);

    const now = new Date().toISOString();
    room.status = 'voting';
    room.isSuddenDeath = true;
    room.deck = suddenDeathDeck;
    room.votes = Object.create(null);
    room.matchedVenueId = null;
    room.matchedAt = null;
    room.updatedAt = now;
    room.version++;

    for (const p of Object.values(room.participants)) {
      p.status = 'swiping';
      p.swipedCount = 0;
      p.totalCards = suddenDeathDeck.length;
      p.lastSeenAt = now;
    }

    if (this.broadcaster) {
      this.broadcaster.broadcast(code, 'voting:started', {
        deck: suddenDeathDeck,
        totalCards: suddenDeathDeck.length,
        roomStatus: 'voting',
        isSuddenDeath: true,
      });
    }

    return {
      success: true,
      status: 'voting',
      isSuddenDeath: true,
      deck: suddenDeathDeck,
      totalCards: suddenDeathDeck.length,
    };
  }

  /**
   * Retrieves top candidate venues for tie-breaker resolution.
   */
  getTiebreakerCandidates(rawCode, limit = 6) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);
    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    const results = this.getRoomResults(code);
    const leaderboard = results.leaderboard || [];

    // Filter top candidates with positive scores/approvals
    let candidates = leaderboard.filter(c => c.score > 0 || c.approvals > 0);
    if (candidates.length < 2) {
      // Fallback: take top venues from leaderboard or deck to ensure at least 2 candidates for wheel
      const fallbackCount = Math.max(2, Math.min(limit, leaderboard.length));
      candidates = leaderboard.slice(0, fallbackCount);
    } else {
      candidates = candidates.slice(0, limit);
    }

    return {
      code,
      status: room.status,
      candidates,
      totalCandidates: candidates.length,
    };
  }

  /**
   * Executes synchronized tie-breaker roulette spin (Host only).
   */
  spinTiebreaker(rawCode, authData, options = {}) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);
    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (room.status === 'closed') {
      const err = new Error('Room is closed');
      err.statusCode = 409;
      throw err;
    }

    if (!this.isAuthorizedHost(room, authData)) {
      const err = new Error('Only the room host can trigger the tie-breaker roulette spin');
      err.statusCode = 403;
      throw err;
    }

    const candidatesRes = this.getTiebreakerCandidates(code);
    let candidates = [...candidatesRes.candidates];

    if (Array.isArray(options.candidateVenueIds) && options.candidateVenueIds.length > 0) {
      const filtered = candidates.filter(c => options.candidateVenueIds.includes(c.venueId));
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    if (!candidates || candidates.length === 0) {
      const deckFallback = (room.deck || []).slice(0, 4).map(v => ({ venueId: v.id, venue: v, score: 0 }));
      if (deckFallback.length > 0) {
        candidates = deckFallback;
      } else {
        const err = new Error('No candidates available for tie-breaker spin');
        err.statusCode = 400;
        throw err;
      }
    }

    // Determine winning candidate
    let winningCandidate = null;
    if (options.winningVenueId) {
      winningCandidate = candidates.find(c => c.venueId === options.winningVenueId || c.venue?.id === options.winningVenueId);
      if (!winningCandidate) {
        const venueInDeck = (room.deck || []).find(v => v.id === options.winningVenueId);
        if (venueInDeck) {
          winningCandidate = { venueId: venueInDeck.id, venue: venueInDeck, score: 0 };
          candidates.push(winningCandidate);
        }
      }
    }

    if (!winningCandidate) {
      const randomIndex = Math.floor(Math.random() * candidates.length);
      winningCandidate = candidates[randomIndex];
    }

    const winningIndex = Math.max(0, candidates.findIndex(c => (c.venueId || c.venue?.id) === (winningCandidate.venueId || winningCandidate.venue?.id)));
    const winningVenue = winningCandidate.venue || this.getVenueById(winningCandidate.venueId);
    const now = new Date().toISOString();
    const durationMs = Number(options.durationMs) || 3800;

    const numWedges = Math.max(1, candidates.length);
    const wedgeAngle = 360 / numWedges;
    const targetWedgeCenter = (winningIndex + 0.5) * wedgeAngle;
    const targetAngle = (5 * 360) + (360 - targetWedgeCenter);

    const tiebreakerResult = {
      winningVenueId: winningVenue.id,
      winningVenue,
      winningIndex,
      candidateVenueIds: candidates.map(c => c.venueId || c.venue?.id),
      candidates: candidates.map(c => c.venue || c),
      durationMs,
      targetAngle,
      spunAt: now,
      isTiebreaker: true,
    };

    room.status = 'matched';
    room.matchedVenueId = winningVenue.id;
    room.matchedAt = now;
    room.tiebreakerResult = tiebreakerResult;
    room.updatedAt = now;
    room.version++;

    if (this.broadcaster) {
      this.broadcaster.broadcast(code, 'tiebreaker:spin', tiebreakerResult);
      this.broadcaster.broadcast(code, 'match:revealed', {
        venueId: winningVenue.id,
        venue: winningVenue,
        matchedAt: now,
        isUnanimous: false,
        isTiebreaker: true,
        tiebreakerResult,
      });
    }

    return {
      success: true,
      winningVenueId: winningVenue.id,
      winningVenue,
      winningIndex,
      targetAngle,
      durationMs,
      spunAt: now,
      tiebreakerResult,
    };
  }

  /**
   * Host manually selects a contender as the winning match.
   */
  selectTiebreakerWinner(rawCode, authData, venueId) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);
    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (room.status === 'closed') {
      const err = new Error('Room is closed');
      err.statusCode = 409;
      throw err;
    }

    if (!this.isAuthorizedHost(room, authData)) {
      const err = new Error('Only the room host can manually select a winner');
      err.statusCode = 403;
      throw err;
    }

    if (!venueId || typeof venueId !== 'string') {
      const err = new Error('venueId is required');
      err.statusCode = 400;
      throw err;
    }

    const matchedVenue = (room.deck || []).find(v => v.id === venueId) || this.getVenueById(venueId);
    if (!matchedVenue) {
      const err = new Error(`Venue ${venueId} not found in room deck`);
      err.statusCode = 404;
      throw err;
    }

    const now = new Date().toISOString();
    room.status = 'matched';
    room.matchedVenueId = venueId;
    room.matchedAt = now;
    room.tiebreakerResult = {
      winningVenueId: venueId,
      winningVenue: matchedVenue,
      isManualSelection: true,
      selectedAt: now,
    };
    room.updatedAt = now;
    room.version++;

    if (this.broadcaster) {
      this.broadcaster.broadcast(code, 'match:revealed', {
        venueId,
        venue: matchedVenue,
        matchedAt: now,
        isUnanimous: false,
        isManualSelection: true,
      });
    }

    return {
      success: true,
      venueId,
      venue: matchedVenue,
    };
  }

  /**
   * Restarts the room voting session (Host only).
   */
  restartRoom(rawCode, authData, options = {}) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);
    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (room.status === 'closed') {
      const err = new Error('Room is closed');
      err.statusCode = 409;
      throw err;
    }

    if (!this.isAuthorizedHost(room, authData)) {
      const err = new Error('Only the room host can restart the session');
      err.statusCode = 403;
      throw err;
    }

    const now = new Date().toISOString();
    const newStatus = options.status === 'lobby' ? 'lobby' : 'voting';

    if (options.reshuffleDeck) {
      room.deck = this.getDeckForRoom(room.settings);
    }

    room.status = newStatus;
    room.votes = Object.create(null);
    room.matchedVenueId = null;
    room.matchedAt = null;
    room.tiebreakerResult = null;
    room.updatedAt = now;
    room.version++;

    for (const p of Object.values(room.participants)) {
      p.status = newStatus === 'voting' ? 'swiping' : 'lobby';
      p.swipedCount = 0;
      p.totalCards = (room.deck || []).length;
      p.lastSeenAt = now;
    }

    const publicRoom = this.getPublicRoom(code);

    if (this.broadcaster) {
      this.broadcaster.broadcast(code, 'room:restarted', {
        room: publicRoom,
        deck: room.deck,
        status: newStatus,
      });
      if (newStatus === 'voting') {
        this.broadcaster.broadcast(code, 'voting:started', {
          deck: room.deck,
          totalCards: room.deck.length,
          roomStatus: 'voting',
        });
      }
    }

    return {
      success: true,
      status: newStatus,
      room: publicRoom,
      deck: room.deck,
    };
  }

  /**
   * Upgrades a room to VIP status with premium perks.
   */
  upgradeRoom(rawCode, { participantId, sessionToken, hostKey, planId = 'vip-pass', paymentToken, couponCode } = {}) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);
    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (room.status === 'closed') {
      const err = new Error('Room is closed');
      err.statusCode = 409;
      throw err;
    }

    const upperCoupon = typeof couponCode === 'string' ? couponCode.trim().toUpperCase() : '';
    const isVipFree = upperCoupon === 'VIPFREE';
    const isHalfOff = upperCoupon === 'HALFOFF';

    if (!isVipFree) {
      if (!paymentToken || typeof paymentToken !== 'string') {
        const err = new Error('Payment token is required for upgrade');
        err.statusCode = 400;
        throw err;
      }

      if (['tok_declined', 'tok_cvv_fail', 'tok_expired'].includes(paymentToken)) {
        const err = new Error(`Payment declined: card verification failed (${paymentToken})`);
        err.statusCode = 402;
        throw err;
      }
    }

    const now = new Date().toISOString();
    room.isVip = true;
    room.vipPlan = planId || 'vip-pass';
    room.vipPerks = {
      customVenuesAllowed: true,
      unlimitedRounds: true,
      respinPasses: 3,
      priorityMatching: true,
      adFree: true,
    };
    room.updatedAt = now;
    room.version++;

    if (this.broadcaster) {
      this.broadcaster.broadcast(code, 'room:upgraded', {
        isVip: true,
        vipPlan: planId,
        vipPerks: room.vipPerks,
        upgradedAt: now,
      });
    }

    return {
      success: true,
      upgraded: true,
      isVip: true,
      vipPlan: planId,
      discountApplied: isVipFree ? '100%' : (isHalfOff ? '50%' : 'none'),
      perks: room.vipPerks,
      room: this.getPublicRoom(code),
    };
  }

  /**
   * Adds a custom user-defined venue to the room deck (VIP only).
   */
  addCustomVenue(rawCode, authData, venueData) {
    const code = normalizeRoomCode(rawCode);
    const room = this.getRoom(code);
    if (!room) {
      const err = new Error(`Room ${code || rawCode} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (room.status === 'closed') {
      const err = new Error('Room is closed');
      err.statusCode = 409;
      throw err;
    }

    if (!room.isVip) {
      const err = new Error('VIP upgrade required to add custom venues');
      err.statusCode = 403;
      throw err;
    }

    if (!venueData || !venueData.name || typeof venueData.name !== 'string' || !venueData.name.trim()) {
      const err = new Error('Venue name is required');
      err.statusCode = 400;
      throw err;
    }

    const now = new Date().toISOString();
    const customVenue = {
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      name: venueData.name.trim(),
      category: venueData.category || room.settings?.activityCategory || 'dining',
      cuisine: venueData.cuisine || 'Custom Pick',
      priceTier: Number(venueData.priceTier) || 2,
      rating: 5.0,
      reviewCount: 1,
      distance: venueData.distance || '0.5 mi',
      address: venueData.address || 'User Custom Location',
      imageUrl: venueData.imageUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
      tags: Array.isArray(venueData.tags) ? venueData.tags : ['Custom', 'Secret Spot'],
      description: venueData.description || 'Custom venue added by VIP group member.',
      isCustom: true,
      isPromoted: false,
      affiliateLinks: venueData.affiliateLinks || {
        directionsUrl: `https://maps.google.com/?q=${encodeURIComponent(venueData.name.trim())}`,
      },
    };

    if (!Array.isArray(room.deck)) {
      room.deck = [];
    }
    room.deck.push(customVenue);

    for (const p of Object.values(room.participants)) {
      p.totalCards = room.deck.length;
    }

    room.updatedAt = now;
    room.version++;

    if (this.broadcaster) {
      this.broadcaster.broadcast(code, 'deck:updated', {
        deck: room.deck,
        addedVenue: customVenue,
        totalCards: room.deck.length,
      });
    }

    return {
      success: true,
      venue: customVenue,
      deck: room.deck,
    };
  }

  /**
   * Logs an affiliate click for outbound attribution analytics.
   */
  recordAffiliateClick({ partner, venueId, action, promoted = false, ip = null, userAgent = null } = {}) {
    const record = {
      id: crypto.randomUUID(),
      partner: partner || 'unknown',
      venueId: venueId || 'unknown',
      action: action || 'redirect',
      promoted: Boolean(promoted),
      timestamp: new Date().toISOString(),
      ip,
      userAgent,
    };
    if (!this.affiliateClicks) {
      this.affiliateClicks = [];
    }
    this.affiliateClicks.push(record);
    return record;
  }

  /**
   * Retrieves aggregated affiliate click analytics.
   */
  getAffiliateAnalytics() {
    const clicks = this.affiliateClicks || [];
    const byPartner = {};
    const byAction = {};

    for (const c of clicks) {
      byPartner[c.partner] = (byPartner[c.partner] || 0) + 1;
      byAction[c.action] = (byAction[c.action] || 0) + 1;
    }

    return {
      totalClicks: clicks.length,
      byPartner,
      byAction,
      recentClicks: clicks.slice(-20),
    };
  }

  /**
   * Deletes a room and terminates SSE broadcaster clients.
   */
  deleteRoom(rawCode) {
    const code = normalizeRoomCode(rawCode);
    if (this.rooms.has(code)) {
      if (this.broadcaster) {
        this.broadcaster.closeRoom(code);
      }
      this.rooms.delete(code);
      return true;
    }
    return false;
  }

  /**
   * Cleans up all rooms past their TTL.
   */
  cleanupExpiredRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (new Date(room.expiresAt).getTime() <= now) {
        this.deleteRoom(code);
      }
    }
  }

  /**
   * Clears all rooms (used for test teardown).
   */
  clear() {
    for (const code of this.rooms.keys()) {
      if (this.broadcaster) {
        this.broadcaster.closeRoom(code);
      }
    }
    this.rooms.clear();
  }

  /**
   * Returns total count of active rooms.
   */
  getRoomCount() {
    return this.rooms.size;
  }
}

export const globalRoomStore = new RoomStore(globalBroadcaster);
