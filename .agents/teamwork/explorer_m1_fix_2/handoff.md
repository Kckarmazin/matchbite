# Milestone 1 Gate Failure Analysis & Backend Fix Strategy Handoff

**Agent**: Explorer (`explorer_m1_fix_2`)  
**Working Directory**: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m1_fix_2`  
**Parent Agent**: Orchestrator 2 (`20812a10-1e1e-4b2a-8eec-3122d65537ad`)  
**Target Recipient**: Orchestrator 2 / Worker (`worker_m1`)  

---

## 1. Observation

### 1.1 Verbatim Code Inspection of Existing Implementation
1. **Information Leakage in `server/models/RoomStore.js` (lines 125-155, `getPublicRoom`)**:
   ```javascript
   144: hostId: room.hostId,
   145: participants: participantList,
   ```
   Where `participantList` maps every participant directly:
   ```javascript
   129: const participantList = Object.values(room.participants).map(p => ({
   130:   id: p.id,
   131:   name: p.name,
   132:   avatar: p.avatar,
   133:   isHost: p.isHost,
   134:   status: p.status,
   ...
   ```
   All participant IDs and the host ID are broadcast to anyone querying `GET /api/rooms/:code`, joining as a guest (`POST /api/rooms/:code/join`), or connecting to the SSE stream (`GET /api/rooms/:code/stream`).

2. **Flawed Authorization in `server/models/RoomStore.js` (lines 242-246, `updateSettings`)**:
   ```javascript
   242: if (room.hostId !== participantId) {
   243:   const err = new Error('Only the room host can update settings');
   244:   err.statusCode = 403;
   245:   throw err;
   246: }
   ```
   And in `server/routes/rooms.js` lines 145-158:
   ```javascript
   148: const { participantId, settings } = req.body || {};
   ...
   158: const updatedSettings = roomStore.updateSettings(code, participantId, settings);
   ```
   The server accepts any `participantId` sent in the request body. If the caller sends `participantId = room.hostId` (which was obtained from the public room state), the authorization check passes.

3. **Session Hijacking in `server/models/RoomStore.js` (lines 188-193, `joinRoom`)**:
   ```javascript
   188: if (participantId && room.participants[participantId]) {
   189:   participant = room.participants[participantId];
   190:   participant.name = trimmedName;
   191:   if (avatar) participant.avatar = avatar;
   192:   participant.lastSeenAt = now;
   193: }
   ```
   And in `server/routes/rooms.js` lines 128-132:
   ```javascript
   128: return res.status(200).json({
   129:   success: true,
   130:   room: publicRoom,
   131:   participant,
   132: });
   ```
   If a client submits `POST /api/rooms/:code/join` with `participantId = room.hostId`, the room store mutates the existing host participant without validating session possession, returning `{ isHost: true }` and full host status to the attacker.

4. **Arbitrary Eviction and Host Takeover in `server/models/RoomStore.js` (lines 296-314, `leaveRoom`)**:
   ```javascript
   299: if (!room || !room.participants[participantId]) return false;
   301: delete room.participants[participantId];
   ...
   307: if (room.hostId === participantId && remainingIds.length > 0) {
   308:   const nextHostId = remainingIds[0];
   309:   room.hostId = nextHostId;
   310:   room.participants[nextHostId].isHost = true;
   311: }
   ```
   In `server/routes/rooms.js` lines 184-193:
   ```javascript
   184: const { participantId } = req.body || {};
   ...
   193: const success = roomStore.leaveRoom(code, participantId);
   ```
   Any client can send `POST /api/rooms/:code/leave` with `participantId = room.hostId`. The host is deleted without authentication, and the first remaining participant is automatically promoted to host.

### 1.2 Verbatim Challenger 2 Failure Findings
Running `node C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs` produced:
```
  [VULNERABILITY / FINDING - CRITICAL]: Public hostId Leak Enables Non-Host Settings Hijacking
  Description: RoomStore.getPublicRoom() exposes hostId in public REST response. Any participant or unauthenticated observer can send PATCH /settings with participantId = room.hostId, bypassing the host check.

  [VULNERABILITY / FINDING - CRITICAL]: Host Account & Roster Slot Impersonation via POST /join
  Description: POST /join accepts an existing participantId without authenticating possession. Passing the leaked hostId renames the host and returns full host status to the attacker.

  [VULNERABILITY / FINDING - CRITICAL]: Host Eviction & Host Ownership Takeover via POST /leave
  Description: POST /leave accepts any participantId without session authentication. Supplying leaked hostId removes the real host from the room and promotes the attacker (SneakyGuest) to room host.

VERDICT: REQUEST_CHANGES (due to host privilege escalation vulnerabilities)
```

---

## 2. Logic Chain

1. **Premise**: In `PROJECT.md` line 10, the architectural specification requires: `"In-memory RoomStore with atomic mutations, cryptographic UUID session tokens, memorable room codes, and TTL expiration (24h)"`.
2. **Identification vs. Authorization Flaw**: The initial implementation used `participantId` (and `room.hostId`) as both a public identifier and an authorization credential.
3. **Public Exposure**: `getPublicRoom()` returns `hostId` and participant `id`s to all clients. Therefore, anyone who joins or queries a room knows the host's ID.
4. **Vulnerability 1 (Settings Hijack)**: Because `updateSettings` checked only `if (room.hostId !== participantId)`, an attacker passing the public `room.hostId` was treated as the authenticated host, allowing arbitrary modification of game settings.
5. **Vulnerability 2 (Identity Hijack)**: Because `joinRoom` checked only `if (participantId && room.participants[participantId])` without verifying possession of a secret, an attacker passing `room.hostId` could rename the host, take over their avatar, and receive `{ isHost: true }`.
6. **Vulnerability 3 (Eviction & Host Promotion Hijack)**: Because `leaveRoom` deleted `room.participants[participantId]` on arbitrary request, an attacker passing `room.hostId` could delete the legitimate host and be promoted to host.
7. **Resolution Architecture (Dual-Token Capability Pattern)**:
   - Separate public identifiers (`id`, `hostId`) from private secrets (`participantSecret`, `hostSecret`).
   - `RoomStore` stores `hostSecret` on `room.hostSecret` and `participantSecret` on each participant.
   - `getPublicRoom()` never exports `hostSecret` or `participantSecret`.
   - `updateSettings` requires a matching `hostSecret` or `participantSecret` belonging to the current host.
   - `joinRoom` requires matching `participantSecret` when attempting to reclaim an existing participant slot.
   - `leaveRoom` requires the target's `participantSecret` or the room's `hostSecret`.
   - On host departure, host authority (`room.hostSecret`) migrates cleanly to the promoted participant's secret, or is nullified if no participants remain (preventing orphaned ghost updates).

---

## 3. Caveats

1. **Read-Only Explorer Scope**: In accordance with the Explorer role constraints, no source code in `server/` or `src/` has been directly altered. The implementation must be executed by Worker (`worker_m1`).
2. **Existing Test Modernization**: Existing tests in `tests/tier1-features/r1-rooms.test.js` and `tests/tier2-boundaries/boundary-cases.test.js` that perform legitimate operations (e.g., host updates settings, participant leaves, participant re-joins) must be updated to pass their assigned secrets so that test suites pass with 100% adherence.
3. **Empirical Scratch Harness**: The scratch script `C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs` was created by Challenger 2. Its benign actions (sections 1.6 and 2.6) should pass credentials, while its exploit steps (section 1.8) will be thwarted by 403 Forbidden responses, resulting in `0 Critical Findings` and `VERDICT: APPROVE`.

---

## 4. Conclusion

The Milestone 1 Gate Failure is completely understood, reproducible, and solvable.
A comprehensive fix blueprint has been authored and documented in:
`C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m1_fix_2\fix_strategy.md`.

### Core Requirements for Worker (`worker_m1`):
1. **`server/models/RoomStore.js`**:
   - In `createRoom`: Generate `hostSecret = crypto.randomUUID()`. Assign `room.hostSecret = hostSecret` and `hostParticipant.participantSecret = hostSecret`. Return `{ room, participant, hostSecret }`.
   - In `getPublicRoom`: Exclude `room.hostSecret` and all `p.participantSecret` fields. Keep `room.hostId` as public label.
   - In `joinRoom`: For existing `participantId`, require matching `participantSecret`; throw 403 on mismatch. For new participants, generate and attach unique `participantSecret`.
   - In `updateSettings`: Validate caller possesses `room.hostSecret` or valid `participantSecret` of current host; throw 403 on failure.
   - In `leaveRoom`: Validate caller possesses target's `participantSecret` or `room.hostSecret`; throw 403 on failure. Migrate `room.hostSecret` to promoted host upon departure, or nullify on empty room.
2. **`server/routes/rooms.js`**:
   - In `POST /api/rooms`: Return `hostSecret` and `participantSecret`.
   - In `POST /api/rooms/:code/join`: Extract and pass `participantSecret` (body/header).
   - In `PATCH /api/rooms/:code/settings`: Extract and pass `hostSecret` and `participantSecret` (body/header/bearer). Return 403 on authorization failure.
   - In `POST /api/rooms/:code/leave`: Extract and pass `participantSecret` / `hostSecret`. Return 403 on authorization failure.
3. **Client Utilities & State (`src/utils/session.js`, `src/utils/api.js`, `src/context/RoomContext.jsx`)**:
   - Persist `participantSecret` and `hostSecret` in session storage.
   - Transmit secrets in `updateSettings`, `leaveRoom`, and reconnect `joinRoom`.
4. **Verification & Adversarial Tests**:
   - Add the 3 adversarial attack tests to `tests/tier1-features/r1-rooms.test.js` to ensure permanent regression prevention.
   - Verify `npm test` passes 100% and `empirical_stress_test.mjs` outputs `VERDICT: APPROVE`.

---

## 5. Verification Method

To independently verify the analysis and subsequent Worker implementation:

1. **Review Fix Strategy**:
   Inspect `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m1_fix_2\fix_strategy.md`.

2. **Run Empirical Stress Harness (Baseline vs Post-Fix)**:
   ```powershell
   node C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs
   ```
   - Current Baseline: Displays 3 Critical Findings and `VERDICT: REQUEST_CHANGES`.
   - Post-Worker Implementation: All 3 exploits return 403 Forbidden, 0 critical findings are logged, and verdict resolves to `VERDICT: APPROVE`.

3. **Execute Vitest Verification Suite**:
   ```powershell
   cd C:\Users\kck50\teamwork_projects\niche_web_app
   npm test
   ```
   Must pass 100% of test files (`r1-rooms.test.js` and `boundary-cases.test.js`).

4. **Execute Production Build Verification**:
   ```powershell
   cd C:\Users\kck50\teamwork_projects\niche_web_app
   npm run build
   ```
   Must compile cleanly without bundle errors.
