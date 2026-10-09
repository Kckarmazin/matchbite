# Milestone 1 Gate Failure Analysis & Remediation Handoff Report

**Agent**: Explorer (`explorer_m1_fix_1`)  
**Parent**: Orchestrator 2 (`orchestrator_2`, ID: `20812a10-1e1e-4b2a-8eec-3122d65537ad`)  
**Target Next Agent**: Worker 1 (`worker_m1`)  
**Handoff Type**: Hard (Task Complete)  
**Primary Deliverable**: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m1_fix_1\fix_strategy.md`  

---

## 1. Observation

### 1.1 Empirical Verification of Vulnerability
Executed `node C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs` at `C:\Users\kck50\teamwork_projects\niche_web_app`:
- **Result**: 25 assertions passed, but **3 CRITICAL FINDINGS** were empirically proven:
  1. `Public hostId Leak Enables Non-Host Settings Hijacking`:
     - Endpoint: `PATCH /api/rooms/:code/settings`
     - Supplied: `sentParticipantId: "p-1a9c8b41-b2d9-41f9-9e8e-200bbd851b59"` (retrieved from unauthenticated `GET /api/rooms/:code`)
     - Outcome: Settings modified to `activityCategory: "hijacked_category"`, HTTP 200 OK.
  2. `Host Account & Roster Slot Impersonation via POST /join`:
     - Endpoint: `POST /api/rooms/:code/join`
     - Supplied: `participantId: leakedHostId`, `name: "ImposterHost"`, `avatar: "😈"`
     - Outcome: Returned `isHost: true`, host nickname and avatar overwritten, HTTP 200 OK.
  3. `Host Eviction & Host Ownership Takeover via POST /leave`:
     - Endpoint: `POST /api/rooms/:code/leave`
     - Supplied: `participantId: leakedHostId`
     - Outcome: Original host deleted from `room.participants`, attacker (`SneakyGuest`) promoted to room host (`isHost: true`, `room.hostId = guestId`), HTTP 200 OK.
- Harness Verdict: `VERDICT: REQUEST_CHANGES (due to host privilege escalation vulnerabilities)`.

### 1.2 Codebase Source Code Observations
1. **`server/models/RoomStore.js` Lines 125-155 (`getPublicRoom`)**:
   ```javascript
   144: hostId: room.hostId,
   145: participants: participantList,
   ```
   `participantList` outputs `{ id: p.id, name: p.name, ... }`. Public responses unmask the host's exact ID.
2. **`server/models/RoomStore.js` Lines 242-246 (`updateSettings`)**:
   ```javascript
   242: if (room.hostId !== participantId) {
   243:   const err = new Error('Only the room host can update settings');
   244:   err.statusCode = 403;
   245:   throw err;
   246: }
   ```
   Authorization relies entirely on equality between `room.hostId` and `participantId`, with no token verification.
3. **`server/models/RoomStore.js` Lines 188-193 (`joinRoom`)**:
   ```javascript
   188: if (participantId && room.participants[participantId]) {
   189:   participant = room.participants[participantId];
   190:   participant.name = trimmedName;
   ```
   Accepts any existing `participantId` without verifying that the caller owns the session for that ID.
4. **`server/models/RoomStore.js` Lines 296-314 (`leaveRoom`)**:
   ```javascript
   299: if (!room || !room.participants[participantId]) return false;
   301: delete room.participants[participantId];
   ```
   Deletes any participant without verifying caller identity, triggering host promotion if `participantId === room.hostId`.
5. **`tests/tier1-features/r1-rooms.test.js` Lines 240-262**:
   The existing host privilege test only verified that a cooperative guest passing their own `guestId` receives 403. It did not test an adversarial guest passing the public `room.hostId`.

---

## 2. Logic Chain

1. **System Requirement**: `PROJECT.md` line 10 mandates *"In-memory RoomStore with atomic mutations, cryptographic UUID session tokens, memorable room codes, and TTL expiration (24h)"*.
2. **Conflation of Public ID with Secret Capability**: In the current implementation, `pId` is used both as the public roster identifier and as the sole authorization key for mutating room settings, claiming roster slots, and deleting participants.
3. **Information Leakage**: Because `getPublicRoom()` returns `hostId: room.hostId` across unauthenticated public routes (`GET /api/rooms/:code`, `POST /api/rooms/:code/join`), the authorization key is broadcast to every participant and spectator.
4. **Direct Exploitation**: Any client in possession of the room code can copy `room.hostId` and transmit it as `participantId` in `PATCH /settings`, `POST /join`, and `POST /leave`.
5. **Decoupled Architecture Solution**:
   - Decouple public roster identity (`participantId`) from secret capability tokens (`sessionToken`, `hostKey`).
   - `participantId` is public (rendered in UI roster, sent in SSE broadcasts), but confers zero authorization privilege.
   - `sessionToken` (per participant) and `hostKey` (for host) are cryptographic secrets generated via `crypto.randomUUID()`.
   - `sessionToken` and `hostKey` are returned strictly to the respective caller upon `createRoom` or `joinRoom`, and are never included in `getPublicRoom()` or SSE payloads.
   - Requests mutating settings, claiming slots, or leaving require presenting the valid capability token via standard headers (`x-session-token`, `x-host-key`) or body parameters (and query string for SSE `EventSource`).
   - Host promotion on host departure re-keys `room.hostKey` to the promoted participant's session token, maintaining smooth zero-friction room continuation.

---

## 3. Caveats

1. **Browser EventSource Limitation**: Native browser `EventSource` does not support custom HTTP request headers. Therefore, SSE stream authentication (`GET /api/rooms/:code/stream`) must accept `sessionToken` via query parameters (`?participantId=...&sessionToken=...`).
2. **Existing Vitest Suites**: Current tests in `r1-rooms.test.js` and `boundary-cases.test.js` send `{ participantId: hostId }` in request bodies. When the Worker implements capability token validation, existing tests should be updated to send the token (via `.set('x-session-token', token)` or body `{ sessionToken: token }`), while preserving the existing test assertions.
3. **Public `hostId` Field**: `getPublicRoom()` can safely keep `hostId: room.hostId` as the public leader ID (`p-xxx`), because public IDs will no longer grant any mutation permissions. This prevents breaking frontend UI checks (`isHost = participant?.isHost || room.hostId === participant?.id`).

---

## 4. Conclusion

The Milestone 1 Gate Failure has been completely diagnosed, and a detailed architectural remediation strategy has been authored at:
`C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m1_fix_1\fix_strategy.md`.

### Core Recommendations for Worker (`worker_m1`):
1. **Model Layer (`server/models/RoomStore.js`)**:
   - Generate `sessionToken` and `hostKey` (`crypto.randomUUID()`) on `createRoom` and `joinRoom`.
   - Store `sessionToken` on participants and in an internal `room.sessionTokens` lookup.
   - Authorize `updateSettings` only when caller possesses `hostKey` or host's `sessionToken`.
   - Authorize `leaveRoom` only when caller possesses the `sessionToken` matching the leaving participant.
   - Authorize `joinRoom` with existing `participantId` only when caller possesses the matching `sessionToken`.
   - Transfer `hostKey` capability to next participant upon legitimate host departure.
   - Ensure `getPublicRoom()` strips all capability tokens.
2. **Route Layer (`server/routes/rooms.js`)**:
   - Implement `extractAuthTokens(req)` parsing `x-session-token`, `x-host-key`, `Authorization`, body, and query.
   - Return tokens in `POST /api/rooms` and `POST /api/rooms/:code/join` responses.
   - Pass tokens into `RoomStore` mutation methods.
3. **Frontend Client Layer (`src/utils/session.js`, `src/utils/api.js`, `src/context/RoomContext.jsx`)**:
   - Store `sessionToken` and `hostKey` in `localStorage`.
   - Auto-attach headers `x-session-token` and `x-host-key` in `api.request()`.
   - Save tokens upon create/join and clear upon leave.
4. **Adversarial Test Suite (`tests/tier1-features/r1-rooms.test.js`)**:
   - Add explicit tests for spoofing public `hostId` without host session token across `PATCH /settings`, `POST /join`, and `POST /leave`, verifying they return 401/403.
   - Add test verifying legitimate host settings updates with capability tokens.

---

## 5. Verification Method

To independently verify the fix once implemented by the Worker:

1. **Execute Empirical Stress Test Harness**:
   ```powershell
   node C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs
   ```
   *Expected Output*:
   - All 25 assertions pass.
   - Critical Findings: 0.
   - Verdict: `VERDICT: APPROVE`.

2. **Execute Full Vitest Suite**:
   ```powershell
   cd C:\Users\kck50\teamwork_projects\niche_web_app
   npm test
   ```
   *Expected Output*: 100% tests passing in `tests/tier1-features/r1-rooms.test.js` and `tests/tier2-boundaries/boundary-cases.test.js` (including new adversarial tests).

3. **Verify Production Frontend Build**:
   ```powershell
   npm run build
   ```
   *Expected Output*: Vite production build completes in under 3s with zero errors.
