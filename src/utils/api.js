import { getStoredSessionToken, getStoredHostKey } from './session.js';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL)
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')
  : '/api';

/**
 * Generic JSON fetch wrapper with error extraction and auto-credential attachment.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const sessionToken = options.sessionToken || (options.roomCode ? getStoredSessionToken(options.roomCode) : getStoredSessionToken());
  const hostKey = options.hostKey || (options.roomCode ? getStoredHostKey(options.roomCode) : getStoredHostKey());

  const headers = {
    'Content-Type': 'application/json',
    ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
    ...(hostKey ? { 'x-host-key': hostKey } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

/**
 * Creates a new room.
 */
export async function createRoom(roomData) {
  return request('/rooms', {
    method: 'POST',
    body: JSON.stringify(roomData),
  });
}

/**
 * Fetches public room details by room code.
 */
export async function getRoom(code) {
  return request(`/rooms/${encodeURIComponent(code)}`, {
    method: 'GET',
    roomCode: code,
  });
}

/**
 * Joins an existing room.
 */
export async function joinRoom(code, { participantId, name, avatar, sessionToken }) {
  const token = sessionToken || getStoredSessionToken(code);
  return request(`/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    body: JSON.stringify({
      participantId,
      name,
      avatar,
      sessionToken: token || undefined,
    }),
  });
}

/**
 * Updates room settings (Host only).
 */
export async function updateSettings(code, participantId, settings, sessionToken = null, hostKey = null) {
  const token = sessionToken || getStoredSessionToken(code);
  const key = hostKey || getStoredHostKey(code);
  return request(`/rooms/${encodeURIComponent(code)}/settings`, {
    method: 'PATCH',
    roomCode: code,
    sessionToken: token,
    hostKey: key,
    body: JSON.stringify({
      participantId,
      settings,
      sessionToken: token,
      hostKey: key,
    }),
  });
}

/**
 * Leaves a room.
 */
export async function leaveRoom(code, participantId, sessionToken = null) {
  const token = sessionToken || getStoredSessionToken(code);
  return request(`/rooms/${encodeURIComponent(code)}/leave`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    body: JSON.stringify({
      participantId,
      sessionToken: token,
    }),
  });
}

/**
 * Starts voting for the room (Host only).
 */
export async function startVoting(code, participantId, sessionToken = null, hostKey = null) {
  const token = sessionToken || getStoredSessionToken(code);
  const key = hostKey || getStoredHostKey(code);
  return request(`/rooms/${encodeURIComponent(code)}/start`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    hostKey: key,
    body: JSON.stringify({
      participantId,
      sessionToken: token,
      hostKey: key,
    }),
  });
}

/**
 * Submits a swipe vote on a venue.
 */
export async function voteVenue(code, participantId, venueId, vote, sessionToken = null) {
  const token = sessionToken || getStoredSessionToken(code);
  return request(`/rooms/${encodeURIComponent(code)}/vote`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    body: JSON.stringify({
      participantId,
      venueId,
      vote,
      sessionToken: token,
    }),
  });
}

/**
 * Undoes the last swipe vote on a venue.
 */
export async function undoVote(code, participantId, venueId, sessionToken = null) {
  const token = sessionToken || getStoredSessionToken(code);
  return request(`/rooms/${encodeURIComponent(code)}/undo`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    body: JSON.stringify({
      participantId,
      venueId,
      sessionToken: token,
    }),
  });
}

/**
 * Broadcasts an ephemeral reaction emoji (supports lobby and in-round swiping).
 */
export async function sendReaction(code, { emoji, participantId, senderName, participantName, avatar, venueId } = {}) {
  return request(`/rooms/${encodeURIComponent(code)}/reactions`, {
    method: 'POST',
    roomCode: code,
    body: JSON.stringify({
      emoji,
      participantId,
      senderName: senderName || participantName,
      participantName: participantName || senderName,
      avatar,
      venueId,
    }),
  });
}

/**
 * Retrieves room consensus results & leaderboard.
 */
export async function getRoomResults(code) {
  return request(`/rooms/${encodeURIComponent(code)}/results`, {
    method: 'GET',
    roomCode: code,
  });
}

/**
 * Retrieves current deck for the room.
 */
export async function getDeck(code) {
  return request(`/rooms/${encodeURIComponent(code)}/deck`, {
    method: 'GET',
    roomCode: code,
  });
}

/**
 * Connects to the real-time event stream via SSE with automatic smart polling fallback.
 * @param {string} code - Room code
 * @param {string} participantId - Current participant ID
 * @param {string|function} sessionTokenOrOnEvent - Optional sessionToken or onEvent callback
 * @param {function} onEventOrOnError - Callback for incoming room events
 * @param {function} maybeOnError - Optional error callback
 * @returns {function} Cleanup/disconnect function
 */
export function connectRoomStream(code, participantId, sessionTokenOrOnEvent, onEventOrOnError = null, maybeOnError = null) {
  let sessionToken = null;
  let onEvent = null;
  let onError = null;

  if (typeof sessionTokenOrOnEvent === 'function') {
    onEvent = sessionTokenOrOnEvent;
    onError = onEventOrOnError;
    sessionToken = getStoredSessionToken(code);
  } else {
    sessionToken = sessionTokenOrOnEvent || getStoredSessionToken(code);
    onEvent = onEventOrOnError;
    onError = maybeOnError;
  }

  let eventSource = null;
  let pollingInterval = null;
  let isClosed = false;
  let sseFailed = false;

  const startPollingFallback = () => {
    if (pollingInterval || isClosed) return;
    sseFailed = true;

    // Immediate poll followed by interval
    const poll = async () => {
      if (isClosed) return;
      try {
        const res = await getRoom(code);
        if (res.success && res.room) {
          onEvent('room:sync', res.room);
        }
      } catch (err) {
        if (onError) onError(err);
      }
    };

    poll();
    pollingInterval = setInterval(poll, 2500);
  };

  try {
    if (typeof EventSource !== 'undefined') {
      const queryParams = new URLSearchParams({
        participantId,
        ...(sessionToken ? { sessionToken } : {}),
      });
      const url = `${API_BASE}/rooms/${encodeURIComponent(code)}/stream?${queryParams.toString()}`;
      eventSource = new EventSource(url);

      const eventNames = [
        'room:init',
        'participant:joined',
        'participant:left',
        'settings:updated',
        'voting:started',
        'participant:progress',
        'match:revealed',
        'tiebreaker:started',
        'tiebreaker:spin',
        'room:restarted',
        'room:upgraded',
        'deck:updated',
        'room:closed',
        'lobby:reaction',
        'reaction:batch',
      ];

      for (const name of eventNames) {
        eventSource.addEventListener(name, (e) => {
          if (isClosed) return;
          try {
            const data = JSON.parse(e.data);
            onEvent(name, data);
          } catch {
            onEvent(name, e.data);
          }
        });
      }

      eventSource.onerror = (err) => {
        if (isClosed) return;
        if (eventSource.readyState === EventSource.CLOSED) {
          if (eventSource) eventSource.close();
          startPollingFallback();
        }
        if (onError) onError(err);
      };
    } else {
      // EventSource not supported in environment
      startPollingFallback();
    }
  } catch (err) {
    startPollingFallback();
    if (onError) onError(err);
  }

  // Return unsubscribe/disconnect function
  return () => {
    isClosed = true;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  };
}

/**
 * Retrieves top tie-breaker candidate venues for a room.
 */
export async function getTiebreakerCandidates(code, limit = 6) {
  return request(`/rooms/${encodeURIComponent(code)}/tiebreaker/candidates?limit=${limit}`, {
    method: 'GET',
    roomCode: code,
  });
}

/**
 * Executes tie-breaker roulette spin (Host only).
 */
export async function spinTiebreaker(code, participantId, options = {}, sessionToken = null, hostKey = null) {
  const token = sessionToken || getStoredSessionToken(code);
  const key = hostKey || getStoredHostKey(code);
  return request(`/rooms/${encodeURIComponent(code)}/tiebreaker/spin`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    hostKey: key,
    body: JSON.stringify({
      participantId,
      sessionToken: token,
      hostKey: key,
      ...options,
    }),
  });
}

/**
 * Host manually selects a winner from the leaderboard.
 */
export async function selectTiebreakerWinner(code, participantId, venueId, sessionToken = null, hostKey = null) {
  const token = sessionToken || getStoredSessionToken(code);
  const key = hostKey || getStoredHostKey(code);
  return request(`/rooms/${encodeURIComponent(code)}/tiebreaker/select`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    hostKey: key,
    body: JSON.stringify({
      participantId,
      venueId,
      sessionToken: token,
      hostKey: key,
    }),
  });
}

/**
 * Restarts the room round (Host only).
 */
export async function restartRoom(code, participantId, options = {}, sessionToken = null, hostKey = null) {
  const token = sessionToken || getStoredSessionToken(code);
  const key = hostKey || getStoredHostKey(code);
  return request(`/rooms/${encodeURIComponent(code)}/restart`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    hostKey: key,
    body: JSON.stringify({
      participantId,
      sessionToken: token,
      hostKey: key,
      ...options,
    }),
  });
}

/**
 * Upgrades a room to VIP status.
 */
export async function upgradeRoom(code, participantId, upgradeData = {}, sessionToken = null, hostKey = null) {
  const token = sessionToken || getStoredSessionToken(code);
  const key = hostKey || getStoredHostKey(code);
  return request(`/rooms/${encodeURIComponent(code)}/upgrade`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    hostKey: key,
    body: JSON.stringify({
      participantId,
      sessionToken: token,
      hostKey: key,
      ...upgradeData,
    }),
  });
}

/**
 * Adds a custom user-defined venue to the deck (VIP only).
 */
export async function addCustomVenue(code, participantId, venueData = {}, sessionToken = null, hostKey = null) {
  const token = sessionToken || getStoredSessionToken(code);
  const key = hostKey || getStoredHostKey(code);
  return request(`/rooms/${encodeURIComponent(code)}/custom-venue`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    hostKey: key,
    body: JSON.stringify({
      participantId,
      sessionToken: token,
      hostKey: key,
      ...venueData,
    }),
  });
}

/**
 * Retrieves affiliate conversion analytics.
 */
export async function getAffiliateAnalytics() {
  return request('/affiliate/analytics', {
    method: 'GET',
  });
}

/**
 * Evicts an inactive or disruptive participant (Host only).
 */
export async function kickParticipant(code, participantId, targetParticipantId, sessionToken = null, hostKey = null) {
  const token = sessionToken || getStoredSessionToken(code);
  const key = hostKey || getStoredHostKey(code);
  return request(`/rooms/${encodeURIComponent(code)}/kick`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    hostKey: key,
    body: JSON.stringify({
      participantId,
      targetParticipantId,
      sessionToken: token,
      hostKey: key,
    }),
  });
}

/**
 * Nudges an inactive participant to alert them (Host only).
 */
export async function nudgeParticipant(code, participantId, targetParticipantId, sessionToken = null, hostKey = null) {
  const token = sessionToken || getStoredSessionToken(code);
  const key = hostKey || getStoredHostKey(code);
  return request(`/rooms/${encodeURIComponent(code)}/nudge`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    hostKey: key,
    body: JSON.stringify({
      participantId,
      targetParticipantId,
      sessionToken: token,
      hostKey: key,
    }),
  });
}

/**
 * Starts a Sudden Death round with top 3 contenders (Host only).
 */
export async function startSuddenDeath(code, participantId, limit = 3, sessionToken = null, hostKey = null) {
  const token = sessionToken || getStoredSessionToken(code);
  const key = hostKey || getStoredHostKey(code);
  return request(`/rooms/${encodeURIComponent(code)}/sudden-death`, {
    method: 'POST',
    roomCode: code,
    sessionToken: token,
    hostKey: key,
    body: JSON.stringify({
      participantId,
      limit,
      sessionToken: token,
      hostKey: key,
    }),
  });
}


