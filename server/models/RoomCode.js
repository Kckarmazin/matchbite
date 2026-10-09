export const PREFIXES = [
  'TACO', 'BREW', 'PIZZA', 'SUSHI', 'BURGER', 'RAMEN',
  'TAPAS', 'BAR', 'CAFE', 'WINE', 'DANCE', 'VIBE',
  'CHILL', 'BEER', 'BBQ', 'BISTRO', 'SNACK', 'SWEET'
];

/**
 * Validates whether a room code adheres to the phonetic convention:
 * 3-8 uppercase alphabetic characters followed by 2-4 digits.
 */
export function isValidRoomCode(code) {
  if (!code || typeof code !== 'string') return false;
  return /^[A-Z]{3,8}[0-9]{2,4}$/.test(code.trim().toUpperCase());
}

/**
 * Normalizes user-entered room codes (trimmed, uppercase).
 */
export function normalizeRoomCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

/**
 * Generates a memorable, phonetic room code avoiding collisions with existing active rooms.
 * @param {Set<string>|Iterable<string>} existingCodes - Set or collection of active room codes
 * @returns {string} - Unique room code (e.g. "TACO42")
 */
export function generateRoomCode(existingCodes = new Set()) {
  const codeSet = existingCodes instanceof Set ? existingCodes : new Set(existingCodes);
  const maxAttempts = 60;

  for (let i = 0; i < maxAttempts; i++) {
    const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
    const num = Math.floor(10 + Math.random() * 90); // 10 - 99
    const code = `${prefix}${num}`;
    if (!codeSet.has(code)) {
      return code;
    }
  }

  // Fallback generation for high volume
  for (let i = 0; i < 100; i++) {
    const fallback = `ROOM${Math.floor(1000 + Math.random() * 9000)}`;
    if (!codeSet.has(fallback)) {
      return fallback;
    }
  }

  return `ROOM${Date.now().toString().slice(-4)}`;
}
