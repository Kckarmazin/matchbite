# Milestone 1 Fix Strategy: Host & Participant Secret Architecture

**Document**: Backend Fix Strategy & Implementation Blueprint  
**Target Milestone**: Milestone 1 (Room Management & Session Logic)  
**Author**: Explorer (`explorer_m1_fix_2`)  
**Intended Implementer**: Worker (`worker_m1`)  

---

## 1. Executive Summary & Vulnerability Diagnosis

Challenger 2 issued a `REQUEST_CHANGES` veto due to three critical privilege escalation and session hijacking vulnerabilities in the Milestone 1 backend implementation (`server/models/RoomStore.js` and `server/routes/rooms.js`).

### Root Cause Analysis
The vulnerabilities stem from **confusing public identification with private authorization**:
1. `RoomStore.getPublicRoom()` returns `hostId: room.hostId` and `participants: [{ id: p.id, ... }]` to all clients over unauthenticated endpoints (`GET /api/rooms/:code`, `POST /join`, and SSE stream `room:init`).
2. The mutation endpoints (`PATCH /settings`, `POST /join`, and `POST /leave`) used `participantId` as the sole authorization gate without requiring any private secret token.
3. Because all participant and host IDs were publicly observable, an adversarial guest or unauthenticated observer could forge requests using `participantId: room.hostId` to:
   - Hijack room activity settings (`PATCH /api/rooms/:code/settings`).
   - Hijack and rename the host roster slot and obtain `isHost: true` (`POST /api/rooms/:code/join`).
   - Evict the real host and claim host promotion (`POST /api/rooms/:code/leave`).

To remediate these vulnerabilities and satisfy `PROJECT.md` line 10 (*"In-memory RoomStore with atomic mutations, cryptographic UUID session tokens..."*), the backend must decouple public identifiers from private capability secrets using a **Dual-Token Capability Pattern**:
- **Public Identifiers**: `participant.id` and `room.hostId` (safe to expose publicly for UI display and roster mapping).
- **Private Secrets**: `participantSecret` (unique per participant) and `hostSecret` (authorizes room management actions), known only to authorized session holders and strictly redacted from public state representations.

---

## 2. Secrets Data Model & Storage Architecture in `RoomStore`

### 2.1 Room Object Structure
Each room entry in `RoomStore.rooms` Map will maintain:
```javascript
{
  id: roomId,                      // UUID
  code: 'TACO42',                  // Normalized uppercase code
  status: 'lobby',                 // 'lobby' | 'voting' | 'closed'
  settings: { ... },               // Filter and game settings
  hostId: pId,                     // Public ID of current host (e.g. 'p-uuid')
  hostSecret: hostSecret,          // Cryptographic UUID secret authorizing host operations
  participants: {                  // participantId -> Participant object
    [pId]: {
      id: pId,                     // Public ID
      name: 'Sarah',               // Nickname
      avatar: '🍕',                // Avatar emoji
      isHost: true,                // Boolean host flag
      participantSecret: secret,   // Cryptographic UUID secret for this specific participant
      status: 'lobby',
      swipedCount: 0,
      totalCards: 0,
      joinedAt: timestamp,
      lastSeenAt: timestamp
    }
  },
  deck: [],
  votes: {},
  matchedVenueId: null,
  matchedAt: null,
  tiebreakerResult: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  expiresAt: timestamp,
  version: 1
}
```

### 2.2 Secret Generation & Lifecycle Rules
1. **Room Creation**:
   - `crypto.randomUUID()` generates `hostSecret`.
   - Host's participant object is created with `participantSecret = hostSecret`.
   - `room.hostSecret` is stored at the room level.
2. **Guest Joining**:
   - For every new participant joining, `crypto.randomUUID()` generates a unique `participantSecret`.
   - Stored strictly on `room.participants[pId].participantSecret`.
3. **Host Migration (When Host Leaves)**:
   - If the current host leaves and participants remain, the next participant (`remainingIds[0]`) is promoted to host (`isHost: true`).
   - `room.hostId` is updated to the promoted participant's ID.
   - `room.hostSecret` is reassigned to the promoted participant's `participantSecret` (`room.hostSecret = room.participants[nextHostId].participantSecret`).
   - This ensures the newly promoted host immediately possesses valid host credentials using their existing secret, while the departed host's credentials are completely invalidated.
4. **Sole Host Departs (Orphan Prevention)**:
   - If the sole host leaves and no participants remain, `room.hostId = null` and `room.hostSecret = null`, preventing former hosts from modifying orphaned rooms.

---

## 3. Exact Method Modifications for `server/models/RoomStore.js`

### 3.1 `createRoom(options)`
- **Behavior**:
  - Validates `hostName` (trimmed, non-empty string).
  - Generates `code`, `roomId`, and `pId = hostId || 'p-' + crypto.randomUUID()`.
  - Generates `hostSecret = crypto.randomUUID()`.
  - Attaches `participantSecret: hostSecret` to the `hostParticipant`.
  - Stores `room.hostSecret = hostSecret`.
  - Stores `room.hostId = pId`.
- **Return Value**:
  ```javascript
  return {
    room,
    participant: hostParticipant,
    hostSecret,
  };
  ```

### 3.2 `getPublicRoom(rawCode)`
- **Behavior**:
  - Retrieves active unexpired room. Returns `null` if expired or not found.
  - Formats public roster by mapping `room.participants`:
    - Copies: `id`, `name`, `avatar`, `isHost`, `status`, `swipedCount`, `totalCards`.
    - **CRITICAL**: Excludes `participantSecret`.
  - Formats public room object:
    - Copies: `id`, `code`, `status`, `settings`, `hostId`, `participants`, `participantCount`, `matchedVenueId`, `matchedAt`, `tiebreakerResult`, `createdAt`, `updatedAt`, `expiresAt`, `version`.
    - **CRITICAL**: Excludes `room.hostSecret`.
- **Return Value**: Public snapshot object with zero secret leakage.

### 3.3 `joinRoom(rawCode, { participantId, participantSecret, name, avatar })`
- **Behavior**:
  - Case A (`participantId` matches existing participant in `room.participants`):
    - Authenticate caller: Verify `participantSecret` is provided and strictly equals `room.participants[participantId].participantSecret`.
    - If missing or mismatch: Throw `Error('Invalid participant credentials; cannot reclaim participant session')` with `err.statusCode = 403`.
    - If valid: Update `participant.name = trimmedName`, `avatar` (if provided), `lastSeenAt = now`. Set `isNew = false`.
  - Case B (New participant):
    - Check room capacity: If `Object.keys(room.participants).length >= CONFIG.MAX_PARTICIPANTS`, throw `409 Conflict`.
    - Generate `pId = participantId || 'p-' + crypto.randomUUID()`.
    - Generate `newSecret = crypto.randomUUID()`.
    - Create participant with `id: pId`, `isHost: false`, `participantSecret: newSecret`.
    - Set `room.participants[pId] = participant`. Set `isNew = true`.
- **Return Value**:
  ```javascript
  return {
    room,
    participant,
    isNew,
  };
  ```

### 3.4 `updateSettings(rawCode, authData, newSettings = {})`
- **Parameter `authData`**:
  Supports `{ hostSecret, participantId, participantSecret }`.
- **Host Authorization Gate**:
  ```javascript
  const hostSecret = typeof authData === 'object' ? authData.hostSecret : null;
  const participantId = typeof authData === 'object' ? authData.participantId : authData;
  const participantSecret = typeof authData === 'object' ? authData.participantSecret : null;

  const isAuthorizedHost =
    Boolean(hostSecret && room.hostSecret && hostSecret === room.hostSecret) ||
    Boolean(
      participantId &&
      participantSecret &&
      room.hostId === participantId &&
      room.participants[participantId]?.participantSecret === participantSecret
    );

  if (!isAuthorizedHost) {
    const err = new Error('Only the room host can update settings');
    err.statusCode = 403;
    throw err;
  }
  ```
- **State Validation**: If `room.status !== 'lobby'`, throw `400 Bad Request`.
- **Settings Whitelist**: Validate `newSettings` is an object, only merge whitelisted keys (`groupType`, `activityCategory`, `cuisinePreferences`, `priceRange`, `distance`, `deckSize`, `tieBreakerType`).
- **Return Value**: Updated `room.settings`.

### 3.5 `leaveRoom(rawCode, participantId, authSecret)`
- **Behavior**:
  - Retrieve room. If `!room || !room.participants[participantId]`, return `false`.
  - Authenticate caller:
    - Must possess the participant's own secret: `authSecret === room.participants[participantId].participantSecret`, OR
    - Must possess the room's host secret: `authSecret === room.hostSecret`.
    - If neither: Throw `Error('Unauthorized to remove this participant')` with `err.statusCode = 403`.
  - Delete participant: `delete room.participants[participantId]`.
  - Host migration:
    - If `room.hostId === participantId`:
      - If remaining participants exist (`remainingIds.length > 0`):
        - `nextHostId = remainingIds[0];`
        - `room.hostId = nextHostId;`
        - `room.participants[nextHostId].isHost = true;`
        - `room.hostSecret = room.participants[nextHostId].participantSecret;`
      - Else (no participants remain):
        - `room.hostId = null;`
        - `room.hostSecret = null;`
- **Return Value**: `true`.

---

## 4. Exact Route Modifications for `server/routes/rooms.js`

### 4.1 Credential Ingestion Strategy
Routes must accept credentials flexibly via:
1. JSON body (`hostSecret`, `participantSecret`)
2. HTTP headers (`X-Host-Secret`, `X-Participant-Secret`)
3. Standard Authorization header (`Authorization: Bearer <secret>`)

### 4.2 Route Implementations

#### `POST /api/rooms`
- Calls `roomStore.createRoom(...)`.
- Returns:
  ```json
  {
    "success": true,
    "room": { /* getPublicRoom() without secrets */ },
    "participant": {
      "id": "p-...",
      "name": "Sarah",
      "avatar": "🍕",
      "isHost": true,
      "participantSecret": "...",
      "hostSecret": "..."
    },
    "hostSecret": "...",
    "participantSecret": "...",
    "joinUrl": "http://localhost:3000/?room=CODE"
  }
  ```

#### `GET /api/rooms/:code`
- Unchanged in contract. Returns `{ success: true, room: roomStore.getPublicRoom(code) }`.
- Guarantees zero secrets in response payload.

#### `POST /api/rooms/:code/join`
- Extracts:
  - `participantId` from `req.body.participantId`
  - `participantSecret` from `req.body.participantSecret || req.headers['x-participant-secret'] || bearerToken`
  - `name`, `avatar`
- Calls `roomStore.joinRoom(code, { participantId, participantSecret, name, avatar })`.
- Broadcasts SSE event `participant:joined` containing sanitized public participant object (NEVER leaks `participantSecret`).
- Returns:
  ```json
  {
    "success": true,
    "room": { /* getPublicRoom() */ },
    "participant": {
      "id": "p-...",
      "name": "...",
      "avatar": "...",
      "isHost": false,
      "participantSecret": "..."
    }
  }
  ```

#### `PATCH /api/rooms/:code/settings`
- Extracts:
  - `participantId` from `req.body.participantId`
  - `hostSecret` from `req.body.hostSecret || req.headers['x-host-secret'] || bearerToken`
  - `participantSecret` from `req.body.participantSecret || req.headers['x-participant-secret'] || bearerToken`
  - `settings` from `req.body.settings`
- Guards against missing credentials:
  If `!participantId && !hostSecret && !participantSecret`, return `400 Bad Request`.
- Calls `roomStore.updateSettings(code, { participantId, hostSecret, participantSecret }, settings)`.
- On error with `err.statusCode`, return `res.status(err.statusCode).json({ success: false, error: err.message })`.
- Broadcasts SSE event `settings:updated`.
- Returns `200 OK` with `{ success: true, settings: updatedSettings }`.

#### `POST /api/rooms/:code/leave`
- Extracts:
  - `participantId` from `req.body.participantId`
  - `authSecret` from `req.body.participantSecret || req.body.hostSecret || req.headers['x-participant-secret'] || req.headers['x-host-secret'] || bearerToken`
- Guards against missing required parameters:
  If `!code || !participantId`, return `400 Bad Request`.
- Calls `roomStore.leaveRoom(code, participantId, authSecret)`.
- If unauthorized (status code 403), return `403 Forbidden`.
- If successful, broadcasts SSE `participant:left`.
- Returns `200 OK` with `{ success: true }`.

---

## 5. Prevention of the 3 Specific Challenger Attacks

| Challenger 2 Attack | Vulnerability Vector | New Defense Mechanism | Expected Result |
|---------------------|----------------------|-----------------------|-----------------|
| **1. Non-Host Settings Hijack** | Attacker queries public room, obtains `room.hostId`, and sends `PATCH /settings` with `participantId: room.hostId`. | `updateSettings` verifies `hostSecret === room.hostSecret` or `room.participants[participantId]?.participantSecret === participantSecret`. Neither is known to the attacker. | `403 Forbidden` (`Only the room host can update settings`). Settings untouched. |
| **2. Host Identity Hijacking via `POST /join`** | Attacker sends `POST /join` with `participantId: room.hostId`, renaming the host and obtaining `isHost: true`. | `joinRoom` detects existing `participantId` and requires matching `participantSecret`. Since attacker lacks host's `participantSecret`, request is rejected. | `403 Forbidden` (`Invalid participant credentials; cannot reclaim participant session`). Host identity preserved. |
| **3. Host Eviction & Takeover via `POST /leave`** | Attacker sends `POST /leave` with `participantId: room.hostId`, deleting host and being promoted to new host. | `leaveRoom` requires target's `participantSecret` or `room.hostSecret`. Attacker possesses neither. | `403 Forbidden` (`Unauthorized to remove this participant`). Real host remains intact. |

---

## 6. Frontend & Client Synchronization Plan

To ensure seamless end-to-end user experience, the client-side session and API layer must store and transmit secrets:

1. **`src/utils/session.js`**:
   - Add storage keys:
     - `matchbite_participant_secret`: Stores current participant's secret.
     - `matchbite_host_secret`: Stores host secret for the current room.
   - Export getters and setters:
     - `getStoredParticipantSecret()` / `setStoredParticipantSecret(secret)`
     - `getStoredHostSecret()` / `setStoredHostSecret(secret)`
     - Update `saveParticipantProfile` and profile getters to retain secrets.

2. **`src/utils/api.js`**:
   - `createRoom(roomData)`: Receives `{ participant, hostSecret }` and caches both secrets.
   - `joinRoom(code, { participantId, participantSecret, name, avatar })`: Sends cached `participantSecret` when rejoining. Caches returned `participant.participantSecret`.
   - `updateSettings(code, participantId, settings, hostSecret)`: Passes `hostSecret` and `participantSecret` in request payload and/or headers.
   - `leaveRoom(code, participantId, participantSecret)`: Passes `participantSecret` in request payload.

3. **`src/context/RoomContext.jsx`**:
   - Cache `hostSecret` and `participantSecret` in React state upon room creation / joining.
   - Supply them automatically to `api.updateSettings` and `api.leaveRoom`.

---

## 7. Verification & Adversarial Test Plan

The Worker must execute and pass the following testing layers before requesting sign-off:

### 7.1 Update Legitimate Tests in `tests/tier1-features/r1-rooms.test.js`
- Update existing legitimate settings update tests to supply `hostSecret` (e.g. `const hostSecret = createRes.body.hostSecret; ... send({ participantId: hostId, hostSecret, settings })`).
- Update existing legitimate re-join test to supply `participantSecret` (e.g. `send({ participantId: pId, participantSecret: join1.body.participant.participantSecret, name: 'Taylor Updated' })`).
- Update existing legitimate leave test to supply `participantSecret` (e.g. `send({ participantId: hostId, participantSecret: hostSecret })`).

### 7.2 Add Dedicated Adversarial Security Suite in `tests/tier1-features/r1-rooms.test.js`
Add `describe('Adversarial Security & Privilege Escalation Resistance')` containing:
1. `rejects settings update when attacker uses public hostId without hostSecret with 403 Forbidden`
2. `rejects identity hijacking in POST /join when attacker attempts to reclaim hostId without participantSecret with 403 Forbidden`
3. `rejects host eviction in POST /leave when attacker attempts to remove hostId without credentials with 403 Forbidden`
4. `ensures public room endpoint and roster redact all hostSecret and participantSecret values`

### 7.3 Update Test Calls in `tests/tier2-boundaries/boundary-cases.test.js`
- Ensure tests that update settings or leave supply their legitimate secrets.
- Verify all 27 boundary tests pass 100%.

### 7.4 Empirical Harness Verification
- Run `node C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs`.
- Verify:
  - Total assertions pass: 100%.
  - Critical findings: 0.
  - Final printed verdict: `VERDICT: APPROVE`.

### 7.5 Single-Command Suite Verification
- Run `npm test` -> Must pass 100% of tests.
- Run `npm run build` -> Clean Vite build.
