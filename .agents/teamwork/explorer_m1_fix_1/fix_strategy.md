# Architectural Fix Strategy: Decoupled Capability Tokens & Access Control Hardening

**Project**: MatchBite — Group Indecision Tinder-Style Swiping Web App  
**Target Milestone**: Milestone 1 Remediation (Room Management & Session Logic)  
**Author**: Explorer (`explorer_m1_fix_1`)  
**Parent**: `orchestrator_2` (`20812a10-1e1e-4b2a-8eec-3122d65537ad`)  
**Reference Input**: Challenger 2 Gate Failure Report (`challenger_m1_2/handoff.md`)  

---

## 1. Executive Summary & Problem Root Cause

### 1.1 The Vulnerability: Broken Access Control (OWASP Top 10 A01:2021)
Challenger 2 empirically demonstrated that the current room management implementation exhibits three critical privilege escalation vulnerabilities:
1. **Non-Host Settings Hijacking**: Any observer or guest querying `GET /api/rooms/:code` receives `room.hostId`. By sending `PATCH /api/rooms/:code/settings` with `participantId: room.hostId`, the guest bypasses the authorization check (`room.hostId === participantId`) and overwrites activity filters, price tiers, and categories.
2. **Host Account & Roster Slot Impersonation**: Sending `POST /api/rooms/:code/join` with `participantId: room.hostId` overwrites the host's nickname and avatar, returning `{ isHost: true }` to the attacker.
3. **Host Eviction & Host Ownership Takeover**: Sending `POST /api/rooms/:code/leave` with `participantId: room.hostId` deletes the authentic host from the room. The server's auto-promotion logic promotes the remaining participant (the attacker) to become room host.

### 1.2 Root Cause Analysis
The fundamental flaw in the Milestone 1 implementation is the **conflation of public identification with authorization credentials**:
- The public roster identifier (`p-${uuid}`) was simultaneously treated as the authorization secret (`room.hostId`).
- `getPublicRoom()` exported `hostId: room.hostId` across unauthenticated public REST endpoints.
- Neither `PATCH /settings`, `POST /join`, nor `POST /leave` validated that the caller actually possessed or owned the session associated with the target `participantId`.

To permanently remediate this vulnerability while maintaining zero-friction guest onboarding, the architecture must **decouple public participant IDs from cryptographic capability tokens**.

---

## 2. Decoupled Token Architecture Design

```
+-----------------------------------------------------------------------------------------+
|                                    ROOM DATA MODEL                                      |
+-----------------------------------------------------------------------------------------+
|  Public State (Visible in getPublicRoom)          Secret State (Never Exposed in Public) |
|  ---------------------------------------          -------------------------------------- |
|  - room.code (e.g. "TACO42")                      - room.hostKey ("hk-9a8b...")          |
|  - room.status ("lobby")                          - room.participants[id].sessionToken   |
|  - room.hostId ("p-123" -> public ID)                                ("st-4c5d...")     |
|  - room.participants: [                           - room.sessionTokens: Map<st, pId>     |
|      { id: "p-123", name: "Host", isHost: true }                                        |
|      { id: "p-456", name: "Guest", isHost: false }                                       |
|    ]                                                                                     |
+-----------------------------------------------------------------------------------------+
```

### 2.1 Identifiers vs. Capability Tokens

| Token / ID | Format | Visibility | Role & Permissions | Storage |
|---|---|---|---|---|
| **Public Participant ID** (`participantId` / `id`) | `p-${crypto.randomUUID()}` | **Public**: Included in `getPublicRoom()`, roster UI, SSE broadcasts | Roster identification, avatar display, voting progress counters, match calculation. **Possesses ZERO authorization authority.** | In-memory `room.participants`, client `localStorage` |
| **Participant Session Token** (`sessionToken`) | `st-${crypto.randomUUID()}` | **Private**: Returned ONLY to the participant creating or joining | Proof of session ownership. Required for re-joining with existing profile, leaving/disconnecting, submitting personal votes (`POST /vote`), and SSE authentication. | Client `localStorage`, server `sessionTokens` map |
| **Host Capability Key** (`hostKey`) | `hk-${crypto.randomUUID()}` | **Private**: Returned ONLY to the host upon room creation or upon legitimate host promotion | Proof of host administrative privileges. Required for updating settings (`PATCH /settings`), starting rounds (`POST /start`), spinning tiebreaker (`POST /spin`), and resetting rounds (`POST /restart`). | Client `localStorage` (host only), server `room.hostKey` |

### 2.2 Host Token Lifecycle & Reassignment
- **Creation**: When `roomStore.createRoom()` runs, it generates both `hostParticipantId` (`p-xxx`), `hostSessionToken` (`st-xxx`), and `hostKey` (`hk-xxx`).
  *(Note: For architectural simplicity and ergonomics, `hostKey` can either be a dedicated `hk-...` UUID or mapped to the host participant's `sessionToken`. Supporting both provides maximum flexibility.)*
- **Reassignment upon Host Departure**: When the current host legitimately departs via `leaveRoom()` (authenticated with their session token), the server selects the next remaining participant (`nextHostId = remainingIds[0]`). The server promotes that participant (`isHost = true`) and re-keys `room.hostKey = room.participants[nextHostId].sessionToken`. The promoted participant can immediately manage settings without a separate handshake.

---

## 3. REST API Transmission & Validation Strategy

### 3.1 Transmission Protocol
To ensure high developer ergonomics, compatibility with automated testing (Supertest), and compatibility with browser clients, capability tokens will be accepted via dual channels:

1. **Standard HTTP Headers (Preferred for REST APIs)**:
   - `x-session-token`: `<sessionToken>`
   - `x-host-key`: `<hostKey>`
   - `Authorization`: `Bearer <sessionToken>`
2. **JSON Request Body (Supported for REST API mutations)**:
   - `{ sessionToken: "st-...", hostKey: "hk-..." }`
3. **Query Parameter (Required for Browser SSE `EventSource`)**:
   - `GET /api/rooms/:code/stream?participantId=p-123&sessionToken=st-...`
   *(Since the standard HTML5 `EventSource` API does not allow setting custom request headers).*

### 3.2 Request Token Extraction Utility
In `server/routes/rooms.js` (or a shared middleware):
```javascript
export function extractAuthTokens(req) {
  const headerToken = req.headers['x-session-token'] ||
    (req.headers['authorization']?.startsWith('Bearer ')
      ? req.headers['authorization'].slice(7).trim()
      : null);

  const headerHostKey = req.headers['x-host-key'];

  const sessionToken = headerToken || req.body?.sessionToken || req.query?.sessionToken || null;
  const hostKey = headerHostKey || req.body?.hostKey || null;
  const participantId = req.body?.participantId || req.query?.participantId || null;

  return { sessionToken, hostKey, participantId };
}
```

### 3.3 Endpoint Authorization Matrix

| Endpoint | Method | Required Capability | Behavior on Missing / Invalid Token |
|---|---|---|---|
| `/api/rooms` | `POST` | None (Public) | Generates `pId`, `sessionToken`, and `hostKey`. Returns all three to creator. |
| `/api/rooms/:code` | `GET` | None (Public) | Returns sanitized public room state (`getPublicRoom`). Never exposes capability tokens. |
| `/api/rooms/:code/join` (New Guest) | `POST` | None (Public) | Generates new `pId` and `sessionToken`. Returns both in response. |
| `/api/rooms/:code/join` (Re-claim Slot) | `POST` | `sessionToken` matching `participantId` | If `sessionToken` matches existing participant, updates nickname/avatar. If token is invalid or missing, rejects with **403 Forbidden** (`Unauthorized: invalid session token for participant`). |
| `/api/rooms/:code/settings` | `PATCH` | `hostKey` OR host's `sessionToken` | Verifies caller possesses host privileges. If caller passes guest token or public `hostId` without token, rejects with **403 Forbidden** (`Only the room host can update settings`). |
| `/api/rooms/:code/leave` | `POST` | `sessionToken` matching `participantId` | Verifies caller owns the participant record being removed. If token does not match target participant, rejects with **403 Forbidden** (`Unauthorized: cannot evict other participants`). |
| `/api/rooms/:code/stream` | `GET` | Optional/Validated `sessionToken` | Validates session token against `participantId`. Connects client to SSE stream. |

---

## 4. Public Room State Sanitization (`getPublicRoom`)

### 4.1 Strict Sanitization Contract
The output of `roomStore.getPublicRoom(code)` MUST be strictly sanitized to ensure zero internal capability credentials leak into public payloads:

```javascript
getPublicRoom(rawCode) {
  const room = this.getRoom(rawCode);
  if (!room) return null;

  const participantList = Object.values(room.participants).map(p => ({
    id: p.id,                   // Public identifier (safe)
    name: p.name,               // Public nickname (safe)
    avatar: p.avatar,           // Public emoji/avatar (safe)
    isHost: p.isHost,           // Public role flag (safe)
    status: p.status,           // Public readiness status (safe)
    swipedCount: p.swipedCount, // Public counter (safe)
    totalCards: p.totalCards,   // Public counter (safe)
    // NOTE: p.sessionToken is STRICTLY STRIPPED
  }));

  return {
    id: room.id,
    code: room.code,
    status: room.status,
    settings: { ...room.settings },
    hostId: room.hostId,         // Public participant ID of the host (e.g. 'p-123')
    participants: participantList,
    participantCount: participantList.length,
    matchedVenueId: room.matchedVenueId,
    matchedAt: room.matchedAt,
    tiebreakerResult: room.tiebreakerResult,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    expiresAt: room.expiresAt,
    version: room.version,
    // NOTE: room.hostKey, room.sessionTokens map are STRICTLY STRIPPED
  };
}
```

### 4.2 Why Retaining Public `hostId` is Safe
Retaining `hostId: room.hostId` as the public `p-xxx` string is **fully secure and recommended**:
- `hostId` simply indicates which participant in the public roster is the current room leader (matching `p.isHost === true`).
- Because authorization checks in `updateSettings`, `start`, `spin`, etc., validate the secret `hostKey` / `sessionToken`, knowledge of the public `hostId` grants **zero capability**.
- An attacker submitting `participantId: room.hostId` will be rejected with `401 Unauthorized` / `403 Forbidden` because they cannot produce the corresponding secret `sessionToken` or `hostKey`.
- This preserves 100% compatibility with frontend UI checks (`RoomLobby.jsx` line 12: `isHost = participant?.isHost || room.hostId === participant?.id`) and existing test assertions (`expect(room.hostId).toBe(hostId)`).

---

## 5. End-to-End Data Flow & State Verification

### 5.1 Host Creates Room (`POST /api/rooms`)
```
Client (Host)                               Server (Express / RoomStore)
      |                                                  |
      |-- POST /api/rooms { hostName: "Alice" } -------->|
      |                                                  |-- Generate code ("TACO42")
      |                                                  |-- Generate hostParticipantId ("p-111")
      |                                                  |-- Generate hostSessionToken ("st-aaa")
      |                                                  |-- Generate hostKey ("hk-999")
      |                                                  |-- Store in room.participants["p-111"]
      |                                                  |-- Store in room.hostKey = "hk-999"
      |<-- 201 Created ----------------------------------|
      |    {                                             |
      |      room: { code: "TACO42", hostId: "p-111", ... },
      |      participant: { id: "p-111", isHost: true }, |
      |      sessionToken: "st-aaa",                     |
      |      hostKey: "hk-999",                          |
      |      joinUrl: "http://...?room=TACO42"           |
      |    }                                             |
      |                                                  |
 Client stores sessionToken & hostKey in localStorage    |
```

### 5.2 Guest Joins Room (`POST /api/rooms/:code/join`)
```
Client (Guest)                              Server (Express / RoomStore)
      |                                                  |
      |-- POST /api/rooms/TACO42/join { name: "Bob" } -->|
      |                                                  |-- Generate guestParticipantId ("p-222")
      |                                                  |-- Generate guestSessionToken ("st-bbb")
      |                                                  |-- Store in room.participants["p-222"]
      |<-- 200 OK ---------------------------------------|
      |    {                                             |
      |      room: { code: "TACO42", participants: [...] },
      |      participant: { id: "p-222", isHost: false },|
      |      sessionToken: "st-bbb"                      |
      |    }                                             |
      |                                                  |
 Client stores sessionToken in localStorage              |
```

### 5.3 Adversary Attempts Settings Hijack (Blocked)
```
Adversary (Guest or Observer)               Server (Express / RoomStore)
      |                                                  |
      |-- GET /api/rooms/TACO42 ------------------------>|
      |<-- 200 OK { room: { hostId: "p-111" } } --------|
      |                                                  |
      |-- PATCH /api/rooms/TACO42/settings ------------->|
      |   Headers: [x-session-token: "st-bbb"]           |
      |   Body: { participantId: "p-111", settings: ... }|
      |                                                  |-- Validate: sessionToken "st-bbb"
      |                                                  |   belongs to "p-222" (isHost: false).
      |                                                  |   Caller does NOT possess hostKey!
      |<-- 403 Forbidden --------------------------------|
      |   { error: "Only the room host can update settings" }
```

### 5.4 Adversary Attempts Host Eviction (Blocked)
```
Adversary (Guest)                           Server (Express / RoomStore)
      |                                                  |
      |-- POST /api/rooms/TACO42/leave ----------------->|
      |   Headers: [x-session-token: "st-bbb"]           |
      |   Body: { participantId: "p-111" }              |
      |                                                  |-- Validate: sessionToken "st-bbb"
      |                                                  |   does NOT match target "p-111" token!
      |<-- 403 Forbidden --------------------------------|
      |   { error: "Unauthorized: cannot evict other participants" }
```

---

## 6. Client-Side Integration Strategy

### 6.1 `src/utils/session.js` Updates
Add dedicated local token accessors:
```javascript
const SESSION_TOKEN_KEY = 'matchbite_session_token';
const HOST_KEY = 'matchbite_host_key';

export function getStoredSessionToken() {
  return getItem(SESSION_TOKEN_KEY);
}

export function setStoredSessionToken(token) {
  if (token) setItem(SESSION_TOKEN_KEY, token);
}

export function getStoredHostKey() {
  return getItem(HOST_KEY);
}

export function setStoredHostKey(key) {
  if (key) setItem(HOST_KEY, key);
}

export function clearStoredTokens() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
      window.localStorage.removeItem(HOST_KEY);
    }
  } catch (e) {}
}
```

### 6.2 `src/utils/api.js` Updates
Ensure the generic `request()` wrapper automatically passes capability headers:
```javascript
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const sessionToken = options.sessionToken || getStoredSessionToken();
  const hostKey = options.hostKey || getStoredHostKey();

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
```
And in `connectRoomStream`:
```javascript
const sessionToken = getStoredSessionToken();
const url = `${API_BASE}/rooms/${encodeURIComponent(code)}/stream?participantId=${encodeURIComponent(participantId)}${sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : ''}`;
```

### 6.3 `src/context/RoomContext.jsx` Updates
- On `handleCreateRoom`:
  - When API returns `{ success: true, room, participant, sessionToken, hostKey }`:
  - Call `setStoredSessionToken(res.sessionToken)` and `setStoredHostKey(res.hostKey)`.
- On `handleJoinRoom`:
  - When API returns `{ success: true, room, participant, sessionToken }`:
  - Call `setStoredSessionToken(res.sessionToken)`. If not host, clear any stale host key.
- On `handleLeaveRoom`:
  - Pass stored `sessionToken` in leave request, then call `clearStoredTokens()`.

---

## 7. Concrete Step-by-Step Fix Instructions for Worker (`worker_m1`)

The Worker (`worker_m1`) should implement the remediation in the following exact sequence:

### Step 1: Update `server/models/RoomStore.js`
1. **`createRoom`**:
   - Generate `hostSessionToken = 'st-' + crypto.randomUUID()` and `hostKey = 'hk-' + crypto.randomUUID()`.
   - Store `sessionToken: hostSessionToken` on the host participant object.
   - Store `room.hostKey = hostKey`.
   - Initialize `room.sessionTokens = new Map()` mapping token -> `participantId`.
   - Return `{ room, participant: hostParticipant, sessionToken: hostSessionToken, hostKey }`.
2. **`joinRoom`**:
   - If `participantId` is provided: verify that incoming `sessionToken` matches `room.participants[participantId].sessionToken`. If missing or mismatched, throw 403 error.
   - If new participant: generate `sessionToken = 'st-' + crypto.randomUUID()`, store on participant object and in `sessionTokens` map.
   - Return `{ room, participant, sessionToken, isNew }`.
3. **`updateSettings`**:
   - Accept `(rawCode, { participantId, sessionToken, hostKey }, newSettings)`.
   - Validate authorization:
     `const isHost = (hostKey && room.hostKey === hostKey) || (sessionToken && room.participants[room.hostId]?.sessionToken === sessionToken);`
   - If `!isHost`: throw Error `'Only the room host can update settings'` with `statusCode = (sessionToken || hostKey ? 403 : 401)`.
4. **`leaveRoom`**:
   - Accept `(rawCode, { participantId, sessionToken, hostKey })`.
   - Validate that caller owns `participantId` (`room.participants[participantId].sessionToken === sessionToken || room.hostKey === hostKey`). If invalid, throw 403 error.
   - If departing participant was host and others remain: promote next participant (`room.hostId = nextHostId; room.participants[nextHostId].isHost = true; room.hostKey = room.participants[nextHostId].sessionToken;`).
5. **`getPublicRoom`**:
   - Ensure output strictly omits `sessionToken`, `hostKey`, and `sessionTokens` map, while keeping `hostId: room.hostId` as the public leader ID.

### Step 2: Update `server/routes/rooms.js`
1. Implement `extractAuthTokens(req)` extracting `sessionToken`, `hostKey`, and `participantId` from headers (`x-session-token`, `x-host-key`, `authorization`) and body.
2. In `POST /api/rooms`: Return `{ success: true, room, participant, sessionToken, hostKey, joinUrl }`.
3. In `POST /api/rooms/:code/join`: Pass extracted tokens to `roomStore.joinRoom()`. Return `sessionToken` in response.
4. In `PATCH /api/rooms/:code/settings`: Pass extracted tokens to `roomStore.updateSettings()`.
5. In `POST /api/rooms/:code/leave`: Pass extracted tokens to `roomStore.leaveRoom()`.
6. In `GET /api/rooms/:code/stream`: Pass query `sessionToken` to broadcaster / connection handler.

### Step 3: Update Client Utilities
1. Update `src/utils/session.js`: add token persistence helpers (`getStoredSessionToken`, `setStoredSessionToken`, `getStoredHostKey`, `setStoredHostKey`, `clearStoredTokens`).
2. Update `src/utils/api.js`: auto-attach `x-session-token` and `x-host-key` headers in `request()`.
3. Update `src/context/RoomContext.jsx`: store tokens upon create/join and clear on leave.

### Step 4: Update & Expand Test Suite (`tests/tier1-features/r1-rooms.test.js`)
1. Ensure existing test cases pass capability tokens when asserting authorized operations (or verify that `request(app)` helpers pass tokens).
2. **Add Adversarial Test Cases** in `tests/tier1-features/r1-rooms.test.js`:
   - `blocks settings update when attacker uses leaked public hostId without host token`: Verify that `PATCH /settings` with `participantId: hostId` from a non-host returns 403.
   - `blocks roster hijacking when attacker joins with existing participantId without session token`: Verify that `POST /join` with `participantId: hostId` returns 403 and does not overwrite host.
   - `blocks host eviction when attacker leaves with hostId without host token`: Verify that `POST /leave` with `participantId: hostId` from non-host returns 403 and leaves host intact.
   - `allows legitimate host to update settings using x-session-token or x-host-key header`: Verify 200 OK.
   - `transfers host capability key when host departs legitimately`: Verify promoted guest can update settings using their session token.

### Step 5: Verification & Gate Re-evaluation
1. Execute `npm test` -> Confirm 100% test pass rate across all tiers.
2. Execute `node C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs` -> Confirm all 25 assertions pass, 0 critical findings, and `VERDICT: APPROVE`.
3. Execute `npm run build` -> Confirm clean production build without errors.

---

## 8. Summary Checklist for Worker

- [ ] `RoomStore.js` generates and stores cryptographic capability tokens (`sessionToken`, `hostKey`).
- [ ] `RoomStore.getPublicRoom()` never exposes `hostKey` or `sessionToken`.
- [ ] `PATCH /settings` enforces host capability token check (header or body).
- [ ] `POST /join` authenticates existing `participantId` re-joins with matching `sessionToken`.
- [ ] `POST /leave` authenticates caller possesses `sessionToken` matching `participantId`.
- [ ] `rooms.js` extracts `x-session-token` and `x-host-key` headers with body/query fallback.
- [ ] `src/utils/session.js` & `api.js` persist and transmit capability tokens seamlessly.
- [ ] Adversarial tests added to `r1-rooms.test.js` validating resistance to public `hostId` spoofing.
- [ ] Vitest suite passes 100% (`npm test`).
- [ ] Empirical stress test passes with zero critical findings (`empirical_stress_test.mjs`).
- [ ] Vite build passes cleanly (`npm run build`).
