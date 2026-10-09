export const CONFIG = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  ROOM_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  CLEANUP_INTERVAL_MS: 30 * 60 * 1000, // 30 minutes
  DEFAULT_DECK_SIZE: 12,
  MAX_PARTICIPANTS: 30,
  HEARTBEAT_INTERVAL_MS: 15000, // 15s SSE heartbeat
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || process.env.PLACES_API_KEY || null,
  REDIS_URL: process.env.REDIS_URL || null,
  DEFAULT_SETTINGS: {
    groupType: 'friends',
    activityCategory: 'dining',
    cuisinePreferences: [],
    priceRange: [1, 2, 3],
    distance: 'walkable',
    deckSize: 12,
    tieBreakerType: 'wheel',
  },
};

