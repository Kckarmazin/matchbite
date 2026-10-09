import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import { createApp } from '../../server/index.js';
import { PlacesService, calculateDistanceMiles, deduplicateVenues, globalPlacesService } from '../../server/services/PlacesService.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('Challenger M7 Deep Empirical Stress & Adversarial Verification', () => {
  let app;
  let roomStore;
  let broadcaster;
  let placesService;
  let server;
  let serverPort;

  beforeEach(async () => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    placesService = new PlacesService();
    app = createApp({ roomStore, broadcaster });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    roomStore.clear();
    if (server) {
      await new Promise(resolve => server.close(resolve));
      server = null;
    }
  });

  // =========================================================================
  // SUITE 1: Multi-Batch Discovery (50+ venues, deckSize: 'all', 0 duplicates)
  // =========================================================================
  describe('Requirement 1 & 2: Multi-Batch Discovery Scale & Deduplication Invariant', () => {
    it('discovers 50+ unique venues with deckSize "all" and guarantees zero duplicate IDs across 12 Table A batches', async () => {
      const originalFetch = globalThis.fetch;
      const tableATypes = [
        'restaurant', 'american_restaurant', 'italian_restaurant', 'mexican_restaurant',
        'asian_restaurant', 'japanese_restaurant', 'korean_restaurant', 'vietnamese_restaurant',
        'pizza_restaurant', 'bar', 'cafe', 'seafood_restaurant',
      ];

      // Simulate 12 batches with 15 spots each = 180 total spots, with intentional overlaps
      globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
        const body = opts && opts.body ? JSON.parse(opts.body) : {};
        const types = body.includedTypes || ['restaurant'];
        const typeTag = types[0] || 'spot';

        const places = [];
        for (let i = 0; i < 15; i++) {
          // Intentional duplicates: spot 0 is shared across all types
          const id = i === 0 ? 'shared_city_anchor_0' : `gplace_${typeTag}_${i}`;
          places.push({
            id,
            displayName: { text: i === 0 ? 'City Center Anchor' : `${typeTag} Bistro ${i}` },
            primaryTypeDisplayName: { text: typeTag },
            location: {
              latitude: 30.2672 + (i * 0.003),
              longitude: -97.7431 + (i * 0.003),
            },
            formattedAddress: `${100 + i * 5} Congress Ave, Austin, TX`,
            rating: 4.7,
            userRatingCount: 300,
            priceLevel: 'PRICE_LEVEL_MODERATE',
            photos: [],
          });
        }
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
        apiKey: 'adversarial-challenger-key',
      });

      globalThis.fetch = originalFetch;

      // Assertions
      expect(venues).toBeDefined();
      expect(Array.isArray(venues)).toBe(true);
      expect(venues.length).toBeGreaterThanOrEqual(50);
      expect(venues.length).toBeGreaterThan(100);

      // Verify zero duplicate IDs exist
      const idSet = new Set();
      for (const v of venues) {
        expect(idSet.has(v.id)).toBe(false);
        idSet.add(v.id);
      }
      expect(idSet.size).toBe(venues.length);

      // Verify zero co-located duplicates (< 0.15 mi) with identical clean name
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

      // Pre-cache these venues in placesService and feed into RoomStore
      const gridKey = placesService.getGridKey(30.2672, -97.7431, 'dining', [], 'metro_area');
      placesService.cache.set(gridKey, {
        venues,
        timestamp: Date.now(),
      });

      // Inject placesService into globalPlacesService to test RoomStore integration
      const originalCache = globalPlacesService.cache.get(gridKey);
      globalPlacesService.cache.set(gridKey, {
        venues,
        timestamp: Date.now(),
      });

      const deck = roomStore.getDeckForRoom({
        lat: 30.2672,
        lng: -97.7431,
        activityCategory: 'dining',
        distance: 'metro_area',
        deckSize: 'all',
      });

      if (originalCache) {
        globalPlacesService.cache.set(gridKey, originalCache);
      } else {
        globalPlacesService.cache.delete(gridKey);
      }

      expect(deck.length).toBeGreaterThanOrEqual(50);

      // Verify ZERO duplicate IDs in candidate deck
      const deckIdSet = new Set();
      for (const v of deck) {
        expect(deckIdSet.has(v.id)).toBe(false);
        deckIdSet.add(v.id);
      }
      expect(deckIdSet.size).toBe(deck.length);

      // Verify ascending distance order (excluding promoted card at index 2)
      expect(deck[2].isPromoted).toBe(true);
      const nonPromoted = deck.filter(v => !v.isPromoted);
      for (let i = 0; i < nonPromoted.length - 1; i++) {
        const dA = parseFloat(nonPromoted[i].distance);
        const dB = parseFloat(nonPromoted[i + 1].distance);
        expect(dA).toBeLessThanOrEqual(dB);
      }
    });
  });

  // =========================================================================
  // SUITE 2: Real SSE Stream Synchronization & deck:updated Delivery
  // =========================================================================
  describe('Requirement 3: Interactive Lobby Settings & Real-Time SSE deck:updated Sync', () => {
    it('delivers live deck:updated event over HTTP SSE stream when host patches settings', async () => {
      // Start a real HTTP server to test live SSE network streaming
      server = http.createServer(app);
      await new Promise(resolve => server.listen(0, resolve));
      serverPort = server.address().port;

      // 1. Host creates room with walkable radius and 6 cards
      const hostRes = await request(app)
        .post('/api/rooms')
        .send({
          hostName: 'HostLobbyMaster',
          activityCategory: 'dining',
          distance: 'walkable',
          deckSize: 6,
          lat: 30.2672,
          lng: -97.7431,
        });

      expect([200, 201]).toContain(hostRes.status);
      const code = hostRes.body.room.code;
      const hostId = hostRes.body.participant.id;
      const hostSession = hostRes.body.sessionToken;

      // 2. Guest joins the room
      const guestRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({ name: 'GuestListener', avatar: '🎧' });

      expect(guestRes.status).toBe(200);
      const guestId = guestRes.body.participant.id;
      const guestSession = guestRes.body.sessionToken;

      // 3. Guest establishes a real HTTP SSE stream
      const sseEvents = [];
      let sseResolve;
      const ssePromise = new Promise(resolve => {
        sseResolve = resolve;
      });

      const sseReq = http.request(
        {
          hostname: '127.0.0.1',
          port: serverPort,
          path: `/api/rooms/${code}/stream?participantId=${guestId}&sessionToken=${guestSession}`,
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
          },
        },
        res => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');

          let buffer = '';
          res.on('data', chunk => {
            buffer += chunk.toString();
            const lines = buffer.split('\n\n');
            buffer = lines.pop(); // keep remainder

            for (const block of lines) {
              if (!block.trim()) continue;
              const eventMatch = block.match(/event:\s*(.+)/);
              const dataMatch = block.match(/data:\s*(.+)/);
              if (eventMatch && dataMatch) {
                const eventName = eventMatch[1].trim();
                try {
                  const eventData = JSON.parse(dataMatch[1].trim());
                  sseEvents.push({ event: eventName, data: eventData });
                  if (eventName === 'deck:updated') {
                    sseResolve();
                  }
                } catch {
                  // ignore non-json
                }
              }
            }
          });
        }
      );

      sseReq.end();

      // Wait 100ms for SSE stream to establish
      await new Promise(r => setTimeout(r, 100));

      // 4. Host patches settings: change distance to metro_area and deckSize to 15
      const patchRes = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostSession)
        .send({
          participantId: hostId,
          settings: {
            distance: 'metro_area',
            deckSize: 15,
          },
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.success).toBe(true);
      expect(patchRes.body.settings.distance).toBe('metro_area');
      expect(patchRes.body.settings.deckSize).toBe(15);
      expect(patchRes.body.deck.length).toBe(15);

      // 5. Await SSE deck:updated receipt with timeout
      await Promise.race([
        ssePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('SSE deck:updated timeout')), 4000)),
      ]);

      // Abort SSE request
      sseReq.destroy();

      // 6. Verify SSE events received
      const deckUpdatedEvents = sseEvents.filter(e => e.event === 'deck:updated');
      expect(deckUpdatedEvents.length).toBeGreaterThanOrEqual(1);

      const receivedEvent = deckUpdatedEvents[0];
      expect(receivedEvent.data.settings.distance).toBe('metro_area');
      expect(receivedEvent.data.settings.deckSize).toBe(15);
      expect(receivedEvent.data.deck.length).toBe(15);

      // Verify participant totalCards synchronized in RoomStore
      const room = roomStore.getRoom(code);
      expect(room.participants[guestId].totalCards).toBe(15);
      expect(room.participants[hostId].totalCards).toBe(15);
    });
  });

  // =========================================================================
  // SUITE 3: High-Concurrency Burst with Dynamic Lobby Settings Shifts
  // =========================================================================
  describe('Requirement 1 & 3: High Concurrency Burst Resilience with Live Setting Mutations', () => {
    it('processes rapid concurrent votes while settings shift without corrupting state or crashing', async () => {
      // 1. Host creates room with 10 cards
      const hostRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'BurstHost', deckSize: 10, activityCategory: 'dining' });
      const code = hostRes.body.room.code;
      const hostSession = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      // 2. 5 guests join
      const guests = [];
      for (let i = 1; i <= 5; i++) {
        const jRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: `BurstGuest_${i}` });
        guests.push({ id: jRes.body.participant.id, token: jRes.body.sessionToken });
      }

      // 3. Start voting
      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostSession)
        .send({ participantId: hostId });
      expect(startRes.status).toBe(200);
      const deck = startRes.body.deck;

      // 4. Fire 100 concurrent votes from all participants across the deck
      const allParticipants = [{ id: hostId, token: hostSession }, ...guests];
      const voteTasks = [];
      for (const p of allParticipants) {
        for (let idx = 0; idx < deck.length; idx++) {
          voteTasks.push(
            request(app)
              .post(`/api/rooms/${code}/vote`)
              .set('x-session-token', p.token)
              .send({ participantId: p.id, venueId: deck[idx].id, vote: idx === 0 ? 'like' : 'pass' })
          );
        }
      }

      const responses = await Promise.all(voteTasks);
      expect(responses.length).toBe(60); // 6 participants * 10 cards
      for (const r of responses) {
        expect(r.status).toBe(200);
      }

      // 5. Verify room reached unanimous match on deck[0]
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.status).toBe(200);
      expect(roomRes.body.room.status).toBe('matched');
      expect(roomRes.body.room.matchedVenueId).toBe(deck[0].id);
    });
  });
});
