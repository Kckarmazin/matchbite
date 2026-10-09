# Frontend Integration & Adversarial Test Suite Requirements: Milestone 1 Security Remediation

**Project**: MatchBite — Group Indecision Tinder-Style Swiping Web App  
**Target Milestone**: Milestone 1 Remediation (Room Management & Session Logic)  
**Author**: Explorer (`explorer_m1_fix_3`)  
**Parent**: `orchestrator_2` (`20812a10-1e1e-4b2a-8eec-3122d65537ad`)  
**Reference Inputs**:
1. `ORIGINAL_REQUEST.md` (§R1 Group Session & Room Management)
2. `PROJECT.md` (Architecture, Interface Contracts & Code Layout)
3. `challenger_m1_2/handoff.md` (Critical Gate Failure: Broken Access Control & Public `hostId` Leakage)
4. `explorer_m1_fix_1/fix_strategy.md` (Decoupled Token Architecture Design)

---

## 1. Executive Summary & Problem Scope

### 1.1 The Vulnerability & Root Cause
In Milestone 1, Challenger 2 established that the room management engine suffered from critical Broken Access Control (OWASP Top 10 A01:2021):
- `RoomStore.getPublicRoom()` exported `hostId: room.hostId` in public responses to `GET /api/rooms/:code` and `POST /api/rooms/:code/join`.
- `PATCH /api/rooms/:code/settings`, `POST /api/rooms/:code/join`, and `POST /api/rooms/:code/leave` relied solely on the public `participantId` sent in the request body without authenticating that the caller possessed the session.
- Any guest or unauthenticated observer possessing the room code could hijack room settings, overwrite the host's nickname/avatar, or evict the host and seize host ownership.

### 1.2 Objective of Explorer 3
This document specifies the exact **Frontend Integration** and **Adversarial Test Suite Requirements** for the Worker (`worker_m1`):
1. How client storage (`src/utils/session.js`), API requests (`src/utils/api.js`), and context (`src/context/RoomContext.jsx`) must store, retrieve, and transmit capability tokens without introducing user-facing authentication friction (preserving zero-login anonymous participation).
2. The exact adversarial test specifications and code to be added to `tests/tier1-features/r1-rooms.test.js` to ensure the system rejects spoofed IDs, identity theft, and unauthorized eviction while allowing authentic hosts and participants to succeed.
3. Crucial updates required for existing test cases in `r1-rooms.test.js` that previously issued unauthenticated mutations.

---

## 2. Zero-Friction Anonymous Session Token Storage (`src/utils/session.js`)

### 2.1 The Zero-Friction Requirement
Per `ORIGINAL_REQUEST.md §R1` and `PROJECT.md`, MatchBite must allow couples, friend groups, and coworkers to create and join rooms *without mandatory app installs, account registration, or password prompts*.

To satisfy security without compromising usability:
- The user is **never prompted for a password or email**.
- When creating a room, the server issues a secret capability token (`sessionToken` and `hostKey`).
- When joining a room, the server issues a secret capability token (`sessionToken`).
- The client persists these tokens **transparently in client storage**.
- When the user refreshes their browser or returns to the room link, the client re-authenticates automatically using the stored tokens.

### 2.2 Storage Data Model
Currently, `src/utils/session.js` stores a single global participant ID:
```javascript
const ID_KEY = 'matchbite_participant_id';
const NAME_KEY = 'matchbite_nickname';
const AVATAR_KEY = 'matchbite_avatar';
```
This is insufficient because a user may participate in multiple rooms over time or test multiple rooms in different tabs. A per-room session registry is required:

```javascript
// LocalStorage Schema: 'matchbite_room_sessions'
{
  "TACO42": {
    "participantId": "p-123e4567-e89b-12d3-a456-426614174000",
    "sessionToken": "st-9a8b7c6d-5e4f-3a2b-1c0d-e9f8a7b6c5d4",
    "hostKey": "hk-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
    "isHost": true,
    "lastJoinedAt": "2026-10-08T22:30:00.000Z"
  },
  "BAR19": {
    "participantId": "p-987f6543-e21b-34d5-c678-543216789012",
    "sessionToken": "st-11223344-5566-7788-9900-aabbccddeeff",
    "hostKey": null,
    "isHost": false,
    "lastJoinedAt": "2026-10-08T22:35:00.000Z"
  }
}
```

In addition, an active session key (`matchbite_session_token` and `matchbite_host_key`) is maintained as a fast-path fallback for single-session contexts.

### 2.3 Comprehensive Function Additions for `src/utils/session.js`
The Worker should enhance `src/utils/session.js` with the following implementation:

```javascript
const ID_KEY = 'matchbite_participant_id';
const NAME_KEY = 'matchbite_nickname';
const AVATAR_KEY = 'matchbite_avatar';
const ROOM_SESSIONS_KEY = 'matchbite_room_sessions';
const ACTIVE_SESSION_TOKEN_KEY = 'matchbite_session_token';
const ACTIVE_HOST_KEY = 'matchbite_host_key';

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
  // If active token matches, clear it
  const activeToken = getItem(ACTIVE_SESSION_TOKEN_KEY);
  if (activeToken === map[code]?.sessionToken) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(ACTIVE_SESSION_TOKEN_KEY);
        window.localStorage.removeItem(ACTIVE_HOST_KEY);
      }
    } catch {}
  }
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
```

### 2.4 Resiliency & Private Browsing Fallback
`session.js` already includes an in-memory `memoryStore` object that catches `localStorage` access exceptions (e.g., Safari private browsing, disabled cookies). The implementation above preserves this fallback, ensuring the app remains 100% operational in locked-down browser environments without throwing runtime exceptions.

---

## 3. API Transport & Communication Layer (`src/utils/api.js`)

### 3.1 Dual-Channel Transmission & Unified Credential Naming
To ensure seamless coordination between backend models (`RoomStore`), REST routes (`rooms.js`), client storage (`session.js`), and frontend hooks (`RoomContext.jsx`), capability tokens use unified aliases:
- **Participant Secret Token**: `sessionToken` (aliases: `participantSecret`, `token`).
- **Host Capability Key**: `hostKey` (aliases: `hostSecret`, `hostKey`).

Routes and utilities must accept credentials flexibly across:
1. **HTTP Request Headers**:
   - `x-session-token` or `x-participant-secret`
   - `x-host-key` or `x-host-secret`
   - `authorization: Bearer <token>`
2. **JSON Request Body**:
   - `{ sessionToken, participantSecret, hostKey, hostSecret }`
3. **SSE Query String**:
   - `GET /api/rooms/:code/stream?participantId=...&sessionToken=...` (or `participantSecret=...`)

### 3.2 Concrete Updates to `src/utils/api.js`

```javascript
import { getStoredSessionToken, getStoredHostKey } from './session.js';

const API_BASE = '/api';

/**
 * Generic JSON fetch wrapper with automatic credential attachment.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  
  // Extract token from options or stored credentials
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
 * Creates a new room. Returns room, participant, sessionToken, hostKey, joinUrl.
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
 * Supports passing sessionToken for legitimate re-joins.
 */
export async function joinRoom(code, { participantId, name, avatar, sessionToken }) {
  return request(`/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    sessionToken: sessionToken || null,
    body: JSON.stringify({
      participantId,
      name,
      avatar,
      sessionToken: sessionToken || undefined,
    }),
  });
}

/**
 * Updates room settings (Host only).
 * Transmits sessionToken/hostKey via headers and body.
 */
export async function updateSettings(code, participantId, settings, sessionToken = null, hostKey = null) {
  const token = sessionToken || getStoredSessionToken(code);
  const key = hostKey || getStoredHostKey(code);

  return request(`/rooms/${encodeURIComponent(code)}/settings`, {
    method: 'PATCH',
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
 * Leaves a room gracefully.
 * Authenticates that caller owns the participant record.
 */
export async function leaveRoom(code, participantId, sessionToken = null) {
  const token = sessionToken || getStoredSessionToken(code);

  return request(`/rooms/${encodeURIComponent(code)}/leave`, {
    method: 'POST',
    sessionToken: token,
    body: JSON.stringify({
      participantId,
      sessionToken: token,
    }),
  });
}

/**
 * Connects to SSE stream with optional sessionToken in query string.
 */
export function connectRoomStream(code, participantId, sessionToken = null, onEvent, onError = null) {
  // If onEvent is 3rd argument (legacy signature compatibility)
  if (typeof sessionToken === 'function') {
    onError = onEvent;
    onEvent = sessionToken;
    sessionToken = getStoredSessionToken(code);
  }

  const token = sessionToken || getStoredSessionToken(code);
  const queryParams = new URLSearchParams({
    participantId,
    ...(token ? { sessionToken: token } : {}),
  });

  const url = `${API_BASE}/rooms/${encodeURIComponent(code)}/stream?${queryParams.toString()}`;
  // Native EventSource initialization and listeners remain intact...
}
```

---

## 4. React Context & State Machine Lifecycle (`src/context/RoomContext.jsx`)

### 4.1 State Management Requirements
`RoomContext.jsx` is the single source of truth for the active room session. It must:
1. Store `sessionToken` and `hostKey` in the React `participant` state object and persist them to `session.js`.
2. Inspect local storage on join or page load to allow instant session resumption.
3. Automatically supply the session token when dispatching `updateSettings` and `leaveRoom`.
4. Clear stored session credentials when `leaveRoom` is executed or when the room is closed by the server (`room:closed`).

### 4.2 Lifecycle Flow & Code Modifications

```javascript
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../utils/api.js';
import {
  getParticipantProfile,
  saveParticipantProfile,
  getRoomSession,
  saveRoomSession,
  clearRoomSession,
} from '../utils/session.js';

const RoomContext = createContext(null);

export function RoomProvider({ children }) {
  const [room, setRoom] = useState(null);
  const [participant, setParticipant] = useState(() => getParticipantProfile());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [toast, setToast] = useState(null);

  const streamDisconnectRef = useRef(null);

  // ... [Toast helpers remain intact] ...

  // Connect SSE Stream with sessionToken
  useEffect(() => {
    if (!room?.code || !participant?.id) {
      if (streamDisconnectRef.current) {
        streamDisconnectRef.current();
        streamDisconnectRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    const token = participant.sessionToken || getRoomSession(room.code)?.sessionToken;

    const disconnect = api.connectRoomStream(
      room.code,
      participant.id,
      token,
      handleRoomEvent,
      (err) => {
        console.warn('Room stream warning/fallback:', err);
      }
    );
    streamDisconnectRef.current = disconnect;
    setIsConnected(true);

    return () => {
      disconnect();
      streamDisconnectRef.current = null;
      setIsConnected(false);
    };
  }, [room?.code, participant?.id, participant?.sessionToken, handleRoomEvent]);

  // Create Room Action
  const handleCreateRoom = async (formData) => {
    setIsLoading(true);
    setError(null);
    try {
      const profile = saveParticipantProfile({
        name: formData.hostName,
        avatar: formData.hostAvatar,
      });

      const res = await api.createRoom({
        ...formData,
        hostId: profile.id,
        hostName: profile.name,
        hostAvatar: profile.avatar,
      });

      if (res.success && res.room) {
        const sessionToken = res.sessionToken || res.participant?.sessionToken;
        const hostKey = res.hostKey || null;

        // Persist room credentials
        saveRoomSession(res.room.code, {
          participantId: res.participant.id,
          sessionToken,
          hostKey,
          isHost: true,
        });

        setRoom(res.room);
        setParticipant({
          ...profile,
          id: res.participant.id,
          isHost: true,
          sessionToken,
          hostKey,
        });

        showToast(`Room created! Code: ${res.room.code}`, 'success');
        return { success: true, room: res.room, joinUrl: res.joinUrl };
      } else {
        throw new Error(res.error || 'Failed to create room');
      }
    } catch (err) {
      setError(err.message || 'Error creating room');
      showToast(err.message || 'Error creating room', 'error');
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Join Room Action (with Auto-Resume)
  const handleJoinRoom = async (code, joinData) => {
    setIsLoading(true);
    setError(null);
    try {
      const cleanCode = code.trim().toUpperCase();
      const existingSession = getRoomSession(cleanCode);

      const profile = saveParticipantProfile({
        name: joinData.name,
        avatar: joinData.avatar,
      });

      const res = await api.joinRoom(cleanCode, {
        participantId: existingSession?.participantId || profile.id,
        name: profile.name,
        avatar: profile.avatar,
        sessionToken: existingSession?.sessionToken || undefined,
      });

      if (res.success && res.room) {
        const sessionToken = res.sessionToken || res.participant?.sessionToken || existingSession?.sessionToken;
        const isHost = res.participant?.isHost ?? Boolean(existingSession?.isHost);
        const hostKey = isHost ? (res.hostKey || existingSession?.hostKey) : null;

        saveRoomSession(res.room.code, {
          participantId: res.participant.id,
          sessionToken,
          hostKey,
          isHost,
        });

        setRoom(res.room);
        setParticipant({
          ...profile,
          id: res.participant.id,
          isHost,
          sessionToken,
          hostKey,
        });

        showToast(`Joined room ${res.room.code}!`, 'success');
        return { success: true, room: res.room };
      } else {
        throw new Error(res.error || 'Failed to join room');
      }
    } catch (err) {
      setError(err.message || 'Error joining room');
      showToast(err.message || 'Error joining room', 'error');
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Update Settings Action (Host Only)
  const handleUpdateSettings = async (newSettings) => {
    if (!room?.code || !participant?.id) return;
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken;
      const hostKey = participant.hostKey || session?.hostKey;

      const res = await api.updateSettings(room.code, participant.id, newSettings, token, hostKey);
      if (res.success) {
        setRoom((prev) => (prev ? { ...prev, settings: res.settings } : prev));
        showToast('Settings saved', 'success');
        return { success: true, settings: res.settings };
      }
    } catch (err) {
      showToast(err.message || 'Failed to update settings', 'error');
      return { success: false, error: err.message };
    }
  };

  // Leave Room Action
  const handleLeaveRoom = async () => {
    if (room?.code && participant?.id) {
      try {
        const session = getRoomSession(room.code);
        const token = participant.sessionToken || session?.sessionToken;
        await api.leaveRoom(room.code, participant.id, token);
      } catch (e) {
        // ignore leave errors
      }
      clearRoomSession(room.code);
    }
    if (streamDisconnectRef.current) {
      streamDisconnectRef.current();
      streamDisconnectRef.current = null;
    }
    setRoom(null);
    setParticipant((prev) => ({ ...prev, isHost: false, sessionToken: null, hostKey: null }));
    showToast('Left the room', 'info');
  };

  // Room closed handler (in handleRoomEvent)
  // When 'room:closed' arrives:
  // if (room?.code) clearRoomSession(room.code);
```

### 4.3 UI Component Impact: Zero Breaking Changes
Because all token persistence and transmission is handled encapsulated within `session.js`, `api.js`, and `RoomContext.jsx`:
- `CreateRoom.jsx`: **0 changes required**.
- `JoinRoom.jsx`: **0 changes required**.
- `RoomLobby.jsx`: **0 changes required**. Lines 12 and 108 (`isHost = participant?.isHost || room.hostId === participant?.id`) function cleanly because `participant.isHost` is securely determined and returned by the server.

---

## 5. Adversarial Test Suite Requirements (`tests/tier1-features/r1-rooms.test.js`)

### 5.1 Critical Prerequisite: Updating Existing Tests in `r1-rooms.test.js`
Before adding new adversarial tests, the Worker must be aware that **3 existing test cases** in `r1-rooms.test.js` were written against the vulnerable M1 baseline and sent unauthenticated requests. When access control is enforced, those existing tests will fail unless updated:

1. **Line 180** (`handles idempotent re-joining with existing participantId`):
   ```javascript
   // PREVIOUS (Fails when token check is enforced):
   const join2 = await request(app)
     .post(`/api/rooms/${code}/join`)
     .send({ participantId: pId, name: 'Taylor Updated', avatar: '🥨' });

   // MUST BE UPDATED TO:
   const join2 = await request(app)
     .post(`/api/rooms/${code}/join`)
     .set('x-session-token', join1.body.sessionToken)
     .send({ participantId: pId, name: 'Taylor Updated', avatar: '🥨' });
   ```

2. **Line 224** (`allows room host to update activity settings`):
   ```javascript
   // PREVIOUS (Fails when token check is enforced):
   const updateRes = await request(app)
     .patch(`/api/rooms/${code}/settings`)
     .send({ participantId: hostId, settings: { ... } });

   // MUST BE UPDATED TO:
   const updateRes = await request(app)
     .patch(`/api/rooms/${code}/settings`)
     .set('x-session-token', createRes.body.sessionToken)
     .send({ participantId: hostId, settings: { ... } });
   ```

3. **Line 350** (`removes participant and reassigns host if host leaves`):
   ```javascript
   // PREVIOUS (Fails when token check is enforced):
   const leaveRes = await request(app)
     .post(`/api/rooms/${code}/leave`)
     .send({ participantId: hostId });

   // MUST BE UPDATED TO:
   const leaveRes = await request(app)
     .post(`/api/rooms/${code}/leave`)
     .set('x-session-token', createRes.body.sessionToken)
     .send({ participantId: hostId });
   ```

### 5.2 Dedicated Adversarial Test Suite Specification
The Worker must append a dedicated suite `describe('Security & Access Control: Adversarial Privilege Escalation Resistance', () => { ... })` containing the following 8 comprehensive tests:

#### Test 1: Settings Mutation Rejection (Leaked Public `hostId` without Token)
- **Objective**: Assert that an attacker possessing the public room state cannot update settings using the host's public ID.
- **Method**:
  ```javascript
  it('rejects settings mutation attempts using leaked public hostId without valid secret token (401/403)', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'LegitHost' });
    const code = createRes.body.room.code;

    // Attacker queries public room endpoint
    const publicRes = await request(app).get(`/api/rooms/${code}`);
    const leakedHostId = publicRes.body.room.hostId;

    // Exploit attempt without token
    const exploitRes1 = await request(app)
      .patch(`/api/rooms/${code}/settings`)
      .send({
        participantId: leakedHostId,
        settings: { activityCategory: 'hijacked_category', priceRange: [4] },
      });

    expect([401, 403]).toContain(exploitRes1.status);
    expect(exploitRes1.body.success).toBe(false);

    // Exploit attempt with forged/fake token
    const exploitRes2 = await request(app)
      .patch(`/api/rooms/${code}/settings`)
      .set('x-session-token', 'st-forged-token-999')
      .send({
        participantId: leakedHostId,
        settings: { activityCategory: 'hijacked_category' },
      });

    expect([401, 403]).toContain(exploitRes2.status);

    // Verify settings were untouched
    const verifyRes = await request(app).get(`/api/rooms/${code}`);
    expect(verifyRes.body.room.settings.activityCategory).toBe('dining');
  });
  ```

#### Test 2: Settings Mutation Rejection (Attacker Uses Guest Session Token with Host ID)
- **Objective**: Assert that a valid guest session token cannot be used to authorize host mutations.
- **Method**:
  ```javascript
  it('rejects settings mutation when a legitimate guest attempts to modify settings using host ID', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'HostUser' });
    const code = createRes.body.room.code;
    const hostId = createRes.body.participant.id;

    // Guest joins legitimately and obtains a valid guest session token
    const guestJoinRes = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({ name: 'SneakyGuest' });
    const guestToken = guestJoinRes.body.sessionToken;

    // Guest attempts to update settings passing hostId with their guest token
    const exploitRes = await request(app)
      .patch(`/api/rooms/${code}/settings`)
      .set('x-session-token', guestToken)
      .send({
        participantId: hostId,
        settings: { activityCategory: 'bars' },
      });

    expect(exploitRes.status).toBe(403);
    expect(exploitRes.body.success).toBe(false);
  });
  ```

#### Test 3: Settings Mutation Success (Genuine Host with Valid Token)
- **Objective**: Assert that legitimate hosts succeed via both header (`x-session-token`) and body (`sessionToken`).
- **Method**:
  ```javascript
  it('allows genuine host with valid secret session token to update settings', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'RealHost' });
    const code = createRes.body.room.code;
    const hostId = createRes.body.participant.id;
    const hostToken = createRes.body.sessionToken;

    const updateRes = await request(app)
      .patch(`/api/rooms/${code}/settings`)
      .set('x-session-token', hostToken)
      .send({
        participantId: hostId,
        settings: {
          activityCategory: 'bars',
          distance: 'short_drive',
          priceRange: [2, 3],
        },
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.settings.activityCategory).toBe('bars');
    expect(updateRes.body.settings.distance).toBe('short_drive');

    const verifyRes = await request(app).get(`/api/rooms/${code}`);
    expect(verifyRes.body.room.settings.activityCategory).toBe('bars');
  });
  ```

#### Test 4: Roster & Identity Impersonation Rejection via `POST /join`
- **Objective**: Assert that passing an existing `participantId` (e.g. `hostId`) without the secret token fails to hijack or rename the participant.
- **Method**:
  ```javascript
  it('rejects attempts to impersonate or overwrite host identity via POST /join without secret token', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'OriginalHost', hostAvatar: '🍕' });
    const code = createRes.body.room.code;
    const hostId = createRes.body.participant.id;

    // Attacker attempts to hijack host slot via POST /join
    const exploitRes = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({
        participantId: hostId,
        name: 'ImposterHost',
        avatar: '😈',
      });

    // Server must reject (401/403) OR mint a brand new guest ID without mutating the host
    if (exploitRes.status === 200) {
      expect(exploitRes.body.participant.id).not.toBe(hostId);
      expect(exploitRes.body.participant.isHost).toBe(false);
    } else {
      expect([401, 403]).toContain(exploitRes.status);
    }

    // Verify original host profile is completely untouched
    const verifyRes = await request(app).get(`/api/rooms/${code}`);
    const hostInRoster = verifyRes.body.room.participants.find((p) => p.id === hostId);
    expect(hostInRoster.name).toBe('OriginalHost');
    expect(hostInRoster.avatar).toBe('🍕');
    expect(hostInRoster.isHost).toBe(true);
  });
  ```

#### Test 5: Re-join Success for Legitimate Participant with Valid Token
- **Objective**: Assert that legitimate participants can refresh and update their profile when providing their secret session token.
- **Method**:
  ```javascript
  it('allows legitimate participant to reclaim profile and update nickname via POST /join with matching token', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'Host' });
    const code = createRes.body.room.code;

    const join1 = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({ name: 'Alex', avatar: '☕' });
    const pId = join1.body.participant.id;
    const token = join1.body.sessionToken;

    const join2 = await request(app)
      .post(`/api/rooms/${code}/join`)
      .set('x-session-token', token)
      .send({
        participantId: pId,
        name: 'Alex The Great',
        avatar: '☕',
      });

    expect(join2.status).toBe(200);
    expect(join2.body.participant.id).toBe(pId);
    expect(join2.body.participant.name).toBe('Alex The Great');

    // Confirm participant count did not duplicate
    const verifyRes = await request(app).get(`/api/rooms/${code}`);
    expect(verifyRes.body.room.participantCount).toBe(2);
  });
  ```

#### Test 6: Host Eviction Rejection via `POST /leave`
- **Objective**: Assert that an attacker passing the leaked `hostId` to `POST /leave` is blocked from ejecting the host.
- **Method**:
  ```javascript
  it('rejects host eviction and takeover attempts via POST /leave using leaked hostId without secret token', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'ProtectedHost' });
    const code = createRes.body.room.code;
    const hostId = createRes.body.participant.id;

    // Attacker joins as guest
    const guestRes = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({ name: 'AttackerGuest' });
    const attackerId = guestRes.body.participant.id;
    const attackerToken = guestRes.body.sessionToken;

    // Attacker attempts to evict the host without token
    const exploit1 = await request(app)
      .post(`/api/rooms/${code}/leave`)
      .send({ participantId: hostId });
    expect([401, 403]).toContain(exploit1.status);

    // Attacker attempts to evict the host using attacker's own token
    const exploit2 = await request(app)
      .post(`/api/rooms/${code}/leave`)
      .set('x-session-token', attackerToken)
      .send({ participantId: hostId });
    expect([401, 403]).toContain(exploit2.status);

    // Assert host was NOT evicted and attacker was NOT promoted
    const verifyRes = await request(app).get(`/api/rooms/${code}`);
    expect(verifyRes.body.room.participantCount).toBe(2);
    expect(verifyRes.body.room.hostId).toBe(hostId);
    const hostEntry = verifyRes.body.room.participants.find((p) => p.id === hostId);
    expect(hostEntry).toBeDefined();
    expect(hostEntry.isHost).toBe(true);
    const attackerEntry = verifyRes.body.room.participants.find((p) => p.id === attackerId);
    expect(attackerEntry.isHost).toBe(false);
  });
  ```

#### Test 7: Peer Eviction Rejection between Guests
- **Objective**: Assert that Guest A cannot evict Guest B.
- **Method**:
  ```javascript
  it('forbids participants from evicting other participants via POST /leave', async () => {
    const createRes = await request(app).post('/api/rooms').send({ hostName: 'Host' });
    const code = createRes.body.room.code;

    const guestA = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'GuestA' });
    const guestB = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'GuestB' });

    // Guest B attempts to kick Guest A using Guest B's token
    const kickRes = await request(app)
      .post(`/api/rooms/${code}/leave`)
      .set('x-session-token', guestB.body.sessionToken)
      .send({ participantId: guestA.body.participant.id });

    expect([401, 403]).toContain(kickRes.status);

    const verifyRes = await request(app).get(`/api/rooms/${code}`);
    expect(verifyRes.body.room.participantCount).toBe(3);
  });
  ```

#### Test 8: Public Room State Sanitization Audit
- **Objective**: Assert that public room state never leaks capability tokens in the root or participant records.
- **Method**:
  ```javascript
  it('ensures GET /api/rooms/:code never exposes capability tokens or secrets in public payload', async () => {
    const createRes = await request(app).post('/api/rooms').send({ hostName: 'AuditHost' });
    const code = createRes.body.room.code;
    await request(app).post(`/api/rooms/${code}/join`).send({ name: 'AuditGuest' });

    const publicRes = await request(app).get(`/api/rooms/${code}`);
    expect(publicRes.status).toBe(200);

    const room = publicRes.body.room;
    expect(room.hostKey).toBeUndefined();
    expect(room.sessionToken).toBeUndefined();
    expect(room.sessionTokens).toBeUndefined();
    expect(room.secret).toBeUndefined();

    for (const p of room.participants) {
      expect(p.sessionToken).toBeUndefined();
      expect(p.hostKey).toBeUndefined();
      expect(p.secret).toBeUndefined();
      expect(p.token).toBeUndefined();
    }
  });
  ```

---

## 6. Implementation Action Plan for Worker (`worker_m1`)

The Worker (`worker_m1`) should implement the frontend integration and test suite changes in the following sequence:

### Step 1: Update Client Storage (`src/utils/session.js`)
- Add `ROOM_SESSIONS_KEY`, `ACTIVE_SESSION_TOKEN_KEY`, and `ACTIVE_HOST_KEY`.
- Implement `getRoomSession`, `saveRoomSession`, `clearRoomSession`, `getStoredSessionToken`, and `getStoredHostKey`.
- Preserve existing avatar and profile helpers.

### Step 2: Update Client API Wrapper (`src/utils/api.js`)
- Update `request()` to inject `x-session-token` and `x-host-key` headers.
- Update `createRoom`, `joinRoom`, `updateSettings`, `leaveRoom`, and `connectRoomStream` signatures to accept and forward tokens.

### Step 3: Update React Context (`src/context/RoomContext.jsx`)
- In `handleCreateRoom`: save returned `sessionToken` and `hostKey` via `saveRoomSession()`; update React `participant` state with tokens.
- In `handleJoinRoom`: check `getRoomSession()` for cached token and forward in request; save returned tokens; update state.
- In `handleUpdateSettings`: forward session token and host key.
- In `handleLeaveRoom`: forward session token, then call `clearRoomSession()`.

### Step 4: Update Existing Tests in `tests/tier1-features/r1-rooms.test.js`
- Update lines 180, 224, and 350 to provide legitimate session tokens (`.set('x-session-token', ...)`).

### Step 5: Append Adversarial Tests in `tests/tier1-features/r1-rooms.test.js`
- Append the 8 adversarial test cases specified in Section 5.2.

### Step 6: Verification Suite Execution
1. Run `npm test` -> Verify 100% tests pass (both `r1-rooms.test.js` and `boundary-cases.test.js`).
2. Run `npm run build` -> Verify clean Vite production bundle.
3. Run `node C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs` -> Verify all assertions pass and output prints `VERDICT: APPROVE`.

---

## 7. Summary Verification Checklist for Worker

- [ ] `src/utils/session.js`: Room session persistence functions implemented with memoryStore fallback.
- [ ] `src/utils/api.js`: Header injection for `x-session-token` and `x-host-key` with body/query fallbacks.
- [ ] `src/context/RoomContext.jsx`: Credential lifecycle hooks wired without user friction.
- [ ] `r1-rooms.test.js`: Lines 180, 224, 350 updated to pass valid capability tokens.
- [ ] `r1-rooms.test.js`: 8 adversarial tests added asserting rejection of hijacked public IDs, identity theft, and unauthorized eviction.
- [ ] Single-command test suite passes: `npm test`.
- [ ] Single-command build succeeds: `npm run build`.
- [ ] Empirical stress test passes: `empirical_stress_test.mjs` returns `VERDICT: APPROVE`.
