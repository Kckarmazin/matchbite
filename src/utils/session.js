const ID_KEY = 'matchbite_participant_id';
const NAME_KEY = 'matchbite_nickname';
const AVATAR_KEY = 'matchbite_avatar';
const ROOM_SESSIONS_KEY = 'matchbite_room_sessions';
const ACTIVE_SESSION_TOKEN_KEY = 'matchbite_session_token';
const ACTIVE_HOST_KEY = 'matchbite_host_key';

export const AVATAR_OPTIONS = [
  '🍕', '🌮', '🍣', '🍔', '🍜', '🍻', '🍸', '🍩',
  '🥑', '🥞', '🥨', '🍦', '🍷', '🥂', '🥟', '🥪'
];

/**
 * Fallback in-memory storage if localStorage is restricted.
 */
const memoryStore = {};

function getItem(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    // localStorage restricted or disabled
  }
  return memoryStore[key] || null;
}

function setItem(key, value) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch (e) {
    // localStorage restricted or disabled
  }
  memoryStore[key] = value;
}

function removeItem(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
  } catch (e) {}
  delete memoryStore[key];
}

export function getRandomAvatar() {
  const index = Math.floor(Math.random() * AVATAR_OPTIONS.length);
  return AVATAR_OPTIONS[index];
}

export function generateParticipantId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `p-${crypto.randomUUID()}`;
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export function getStoredParticipantId() {
  let id = getItem(ID_KEY);
  if (!id) {
    id = generateParticipantId();
    setItem(ID_KEY, id);
  }
  return id;
}

export function getStoredNickname() {
  return getItem(NAME_KEY) || '';
}

export function setStoredNickname(name) {
  if (name) {
    setItem(NAME_KEY, name.trim());
  }
}

export function getStoredAvatar() {
  let avatar = getItem(AVATAR_KEY);
  if (!avatar) {
    avatar = getRandomAvatar();
    setItem(AVATAR_KEY, avatar);
  }
  return avatar;
}

export function setStoredAvatar(avatar) {
  if (avatar) {
    setItem(AVATAR_KEY, avatar);
  }
}

export function getParticipantProfile() {
  return {
    id: getStoredParticipantId(),
    name: getStoredNickname(),
    avatar: getStoredAvatar(),
  };
}

export function saveParticipantProfile({ name, avatar }) {
  if (name) setStoredNickname(name);
  if (avatar) setStoredAvatar(avatar);
  return getParticipantProfile();
}

/**
 * Retrieves the full map of room sessions.
 */
function getRoomSessionsMap() {
  const raw = getItem(ROOM_SESSIONS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

/**
 * Persists the map of room sessions.
 */
function saveRoomSessionsMap(map) {
  setItem(ROOM_SESSIONS_KEY, JSON.stringify(map));
}

/**
 * Retrieves the credentials for a specific room.
 * @param {string} rawCode - Room code (case-insensitive)
 * @returns {{ participantId: string, sessionToken: string, hostKey?: string, isHost: boolean } | null}
 */
export function getRoomSession(rawCode) {
  if (!rawCode) return null;
  const code = String(rawCode).trim().toUpperCase();
  const map = getRoomSessionsMap();
  return map[code] || null;
}

/**
 * Saves session credentials for a specific room.
 * @param {string} rawCode - Room code
 * @param {object} sessionData - { participantId, sessionToken, hostKey, isHost }
 */
export function saveRoomSession(rawCode, { participantId, sessionToken, hostKey = null, isHost = false }) {
  if (!rawCode || !sessionToken) return;
  const code = String(rawCode).trim().toUpperCase();
  const map = getRoomSessionsMap();
  map[code] = {
    participantId: participantId || map[code]?.participantId || null,
    sessionToken,
    hostKey: hostKey !== undefined ? hostKey : (map[code]?.hostKey || null),
    isHost: Boolean(isHost),
    lastJoinedAt: new Date().toISOString(),
  };
  saveRoomSessionsMap(map);

  // Update active fast-path tokens
  setItem(ACTIVE_SESSION_TOKEN_KEY, sessionToken);
  if (hostKey) {
    setItem(ACTIVE_HOST_KEY, hostKey);
  }
}

/**
 * Clears session credentials when leaving a room.
 * @param {string} rawCode - Room code
 */
export function clearRoomSession(rawCode) {
  if (!rawCode) return;
  const code = String(rawCode).trim().toUpperCase();
  const map = getRoomSessionsMap();
  if (map[code]) {
    delete map[code];
    saveRoomSessionsMap(map);
  }
  removeItem(ACTIVE_SESSION_TOKEN_KEY);
  removeItem(ACTIVE_HOST_KEY);
}

/**
 * Retrieves the active session token for a room, falling back to active token key.
 */
export function getStoredSessionToken(roomCode = null) {
  if (roomCode) {
    const session = getRoomSession(roomCode);
    if (session?.sessionToken) return session.sessionToken;
  }
  return getItem(ACTIVE_SESSION_TOKEN_KEY) || null;
}

export function setStoredSessionToken(token) {
  if (token) setItem(ACTIVE_SESSION_TOKEN_KEY, token);
}

/**
 * Retrieves the host key for a room, if present.
 */
export function getStoredHostKey(roomCode = null) {
  if (roomCode) {
    const session = getRoomSession(roomCode);
    if (session?.hostKey) return session.hostKey;
  }
  return getItem(ACTIVE_HOST_KEY) || null;
}

export function setStoredHostKey(key) {
  if (key) setItem(ACTIVE_HOST_KEY, key);
}

export function clearStoredTokens() {
  removeItem(ACTIVE_SESSION_TOKEN_KEY);
  removeItem(ACTIVE_HOST_KEY);
}
