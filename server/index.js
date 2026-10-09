import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';
import { createRoomsRouter } from './routes/rooms.js';
import { createVotesRouter } from './routes/votes.js';
import { createTiebreakerRouter } from './routes/tiebreaker.js';
import { createMonetizationRouter } from './routes/monetization.js';
import { globalRoomStore } from './models/RoomStore.js';
import { globalBroadcaster } from './sync/Broadcaster.js';
import { globalPlacesService } from './services/PlacesService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

export function createApp(options = {}) {
  const app = express();
  const roomStore = options.roomStore || globalRoomStore;
  const broadcaster = options.broadcaster || globalBroadcaster;

  if (!roomStore.broadcaster && broadcaster) {
    roomStore.broadcaster = broadcaster;
  }

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Health and telemetry endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      success: true,
      status: 'healthy',
      activeRooms: roomStore.getRoomCount(),
      timestamp: new Date().toISOString(),
    });
  });

  // Diagnostics endpoint to verify Google Places API key and permissions
  app.get('/api/places/diagnostics', async (req, res) => {
    const key = process.env.GOOGLE_MAPS_API_KEY || process.env.PLACES_API_KEY || CONFIG.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return res.status(200).json({
        success: false,
        hasGoogleKey: false,
        message: 'No GOOGLE_MAPS_API_KEY found in environment variables. Falling back to OpenStreetMap.',
      });
    }

    try {
      const testRes = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.photos',
        },
        body: JSON.stringify({
          includedTypes: ['restaurant'],
          maxResultCount: 1,
          locationRestriction: {
            circle: {
              center: { latitude: 40.7580, longitude: -73.9855 },
              radius: 1000,
            },
          },
        }),
      });

      const data = await testRes.json().catch(() => ({}));
      return res.status(200).json({
        success: testRes.ok,
        hasGoogleKey: true,
        keyLength: key.length,
        googleHttpStatus: testRes.status,
        googleOk: testRes.ok,
        googleResponse: data,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        hasGoogleKey: true,
        error: err.message,
      });
    }
  });

  // Cache for resolved Google photo CDN URLs (avoids redundant API requests)
  const photoCdnCache = new Map();

  // High-performance photo proxy endpoint for Google Places
  app.get('/api/places/photo', async (req, res) => {
    try {
      const { name, ref } = req.query;
      const key = process.env.GOOGLE_MAPS_API_KEY || process.env.PLACES_API_KEY || CONFIG.GOOGLE_MAPS_API_KEY;

      if (!key) {
        return res.redirect(302, 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80');
      }

      // 1. Google Places API (New) photo resource name (places/.../photos/...)
      if (name) {
        if (photoCdnCache.has(name)) {
          return res.redirect(302, photoCdnCache.get(name));
        }

        const apiUrl = `https://places.googleapis.com/v1/${encodeURI(name)}/media?maxHeightPx=800&maxWidthPx=800&skipHttpRedirect=true&key=${key}`;
        const photoRes = await fetch(apiUrl);
        if (photoRes.ok) {
          const photoData = await photoRes.json().catch(() => null);
          if (photoData && photoData.photoUri) {
            photoCdnCache.set(name, photoData.photoUri);
            return res.redirect(302, photoData.photoUri);
          }
        }

        return res.redirect(302, `https://places.googleapis.com/v1/${encodeURI(name)}/media?maxHeightPx=800&maxWidthPx=800&key=${key}`);
      }

      // 2. Google Places Legacy photo reference
      if (ref) {
        return res.redirect(302, `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${encodeURIComponent(ref)}&key=${key}`);
      }

      return res.redirect(302, 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80');
    } catch {
      return res.redirect(302, 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80');
    }
  });

  // Geocoding endpoint for zip codes & cities (zero API keys)
  app.get('/api/places/geocode', async (req, res) => {
    try {
      const query = req.query.query || req.query.q;
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ success: false, error: 'query parameter is required' });
      }
      const coords = await globalPlacesService.resolveLocationCoordinatesAsync(query.trim());
      if (!coords) {
        return res.status(404).json({ success: false, error: 'Location not found' });
      }
      return res.status(200).json({ success: true, ...coords });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Dedicated live places exploration & verification endpoint (free, zero API keys)
  app.get('/api/places/live', async (req, res) => {
    try {
      const { lat, lng, location, category = 'dining', limit = 20 } = req.query;
      const parsedLat = lat != null ? parseFloat(lat) : null;
      const parsedLng = lng != null ? parseFloat(lng) : null;
      const venues = await globalPlacesService.getLiveVenues({
        lat: parsedLat,
        lng: parsedLng,
        locationName: location,
        activityCategory: category,
        deckSize: Number(limit) || 20,
      });

      if (!venues || venues.length === 0) {
        const fallback = globalPlacesService.getCachedOrSeedVenues({
          lat: parsedLat,
          lng: parsedLng,
          locationName: location,
          activityCategory: category,
          deckSize: Number(limit) || 20,
        });
        return res.status(200).json({
          success: true,
          source: 'seed-catalog',
          count: fallback.length,
          venues: fallback,
        });
      }

      return res.status(200).json({
        success: true,
        source: 'openstreetmap-overpass',
        count: venues.length,
        venues,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // Mount API routers
  app.use('/api/rooms', createRoomsRouter(roomStore, broadcaster));
  app.use('/api/rooms', createVotesRouter(roomStore, broadcaster));
  app.use('/api/rooms', createTiebreakerRouter(roomStore, broadcaster));
  app.use('/api', createMonetizationRouter(roomStore, broadcaster));

  // Structured JSON 404 for unmatched API routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      error: `API route ${req.method} ${req.path} not found`,
    });
  });

  // In production (or if dist/ exists), serve built static SPA
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));

    // Client-side SPA routing fallback
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Internal Server Error',
    });
  });

  return app;
}

export const app = createApp();

// Start server if executed directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  const server = app.listen(CONFIG.PORT, () => {
    console.log(`MatchBite server running on http://localhost:${CONFIG.PORT}`);
  });

  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
}
