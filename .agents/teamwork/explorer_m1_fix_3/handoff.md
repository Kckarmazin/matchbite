# Milestone 1 Security Remediation Handoff: Frontend Integration & Adversarial Test Suite

**Agent**: Explorer (`explorer_m1_fix_3`)  
**Target Milestone**: Milestone 1 Remediation (Room Management & Session Logic)  
**Parent**: `orchestrator_2` (`20812a10-1e1e-4b2a-8eec-3122d65537ad`)  
**Handoff Type**: Hard (Task Complete)  
**Related Documents**:
- Fix Strategy: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m1_fix_3\fix_strategy.md`
- Challenger 2 Report: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\challenger_m1_2\handoff.md`
- Explorer 1 Strategy: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m1_fix_1\fix_strategy.md`
- Explorer 2 Strategy: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m1_fix_2\fix_strategy.md`

---

## 1. Observation

### 1.1 Challenger 2 Empirical Failure Evidence
Challenger 2 demonstrated three critical privilege escalation vulnerabilities in `challenger_m1_2/handoff.md`:
1. **Settings Hijack**: Any guest querying `GET /api/rooms/:code` receives `room.hostId` and can issue `PATCH /api/rooms/:code/settings` with `participantId: room.hostId` to overwrite room settings against the host's intent (`challenger_m1_2/handoff.md` lines 89-102).
2. **Host Account & Slot Impersonation**: Any guest passing `participantId: room.hostId` to `POST /api/rooms/:code/join` overwrites the host's name/avatar and receives `{ isHost: true }` without proving ownership (`challenger_m1_2/handoff.md` lines 104-115).
3. **Host Eviction & Takeover**: Any guest passing `participantId: room.hostId` to `POST /api/rooms/:code/leave` deletes the real host and is promoted to host by the server's auto-promotion logic (`challenger_m1_2/handoff.md` lines 117-129).

### 1.2 Inspection of Existing Frontend Implementation
1. **`src/utils/session.js` (lines 50-57, 84-90)**:
   - Stores only a single `matchbite_participant_id` (`p-UUID`), `matchbite_nickname`, and `matchbite_avatar` in `localStorage`.
   - Has zero storage or tracking for capability secrets (`sessionToken`, `hostKey`, `participantSecret`, `hostSecret`).
   - Does not isolate sessions between multiple rooms.
2. **`src/utils/api.js` (lines 56-81)**:
   - `joinRoom`: Sends `{ participantId, name, avatar }` without token.
   - `updateSettings`: Sends `{ participantId, settings }` without token.
   - `leaveRoom`: Sends `{ participantId }` without token.
   - Generic `request()` wrapper sets only `'Content-Type': 'application/json'` and never attaches authorization headers.
3. **`src/context/RoomContext.jsx` (lines 132-235)**:
   - `handleCreateRoom`: Receives `{ success, room, participant, joinUrl }`, saves only name and avatar, drops capability tokens.
   - `handleJoinRoom`: Sends client's stored `participantId` blindly without token authentication.
   - `handleUpdateSettings`: Dispatches `api.updateSettings(room.code, participant.id, newSettings)` without tokens.
   - `handleLeaveRoom`: Dispatches `api.leaveRoom(room.code, participant.id)` without tokens.
4. **`src/components/Lobby/RoomLobby.jsx` (lines 12, 108)**:
   - Uses `isHost = participant?.isHost || room.hostId === participant?.id;`
   - Relies on `participant.isHost` returned from server state.

### 1.3 Inspection of Existing Test Suite (`tests/tier1-features/r1-rooms.test.js`)
Inspection revealed that 3 existing tests in `r1-rooms.test.js` were written against the unauthenticated baseline:
- **Line 180**: `handles idempotent re-joining with existing participantId` sends `{ participantId: pId, name: 'Taylor Updated' }` without a token.
- **Line 224**: `allows room host to update activity settings` sends `{ participantId: hostId, settings: ... }` without a token.
- **Line 350**: `removes participant and reassigns host if host leaves` sends `{ participantId: hostId }` without a token.
*When the backend enforces capability tokens, these 3 tests will immediately fail unless updated to provide the token returned during room creation or join.*

### 1.4 Baseline Test & Build Verification
Executed on the current codebase:
- `npm test`: 47 passed (20 in `r1-rooms.test.js`, 27 in `boundary-cases.test.js`).
- `npm run build`: Built in 2.31s without errors.

---

## 2. Logic Chain

1. **Contract Requirement**: `PROJECT.md` line 10 mandates `"In-memory RoomStore with atomic mutations, cryptographic UUID session tokens..."` while `ORIGINAL_REQUEST.md §R1` requires inviting participants *"without requiring mandatory app installs or account friction"*.
2. **Decoupled Token Invariant**: Public participant identifiers (`id: p-xxx`) and room leader indicators (`room.hostId`) must remain visible in public roster state for UI rendering, but must possess **zero authorization authority**. All mutating operations must require cryptographic capability tokens (`sessionToken` / `hostKey`).
3. **Zero-Friction Invariant**: Users must not be subjected to login forms, passwords, or emails. Therefore, capability tokens must be generated transparently by the server upon room creation or guest join, returned in the response payload, and persisted automatically in client storage (`session.js`).
4. **Multi-Room & Persistence Invariant**: Because a user may join multiple rooms or reload a share link (`/?room=TACO42`), client storage must maintain a per-room session registry (`matchbite_room_sessions`), falling back to an in-memory dictionary if `localStorage` is restricted.
5. **Transport Invariant**: To support standard REST architecture and Supertest ergonomics while accommodating browser `EventSource` constraints:
   - REST endpoints accept tokens via headers (`x-session-token`, `x-host-key`, `authorization: Bearer`) and request body (`sessionToken`, `participantSecret`, `hostKey`, `hostSecret`).
   - SSE stream endpoints accept tokens via query parameter (`?participantId=...&sessionToken=...`).
6. **State Invariant in `RoomContext.jsx`**: When creating or joining a room, `RoomContext` saves the returned tokens into `session.js` and local React state. Subsequent settings mutations and room leave actions automatically pull and attach these tokens.
7. **Adversarial Test Coverage Invariant**: To prevent future regressions, `r1-rooms.test.js` must contain explicit adversarial assertions that:
   - Settings mutation with leaked `hostId` but no token or guest token returns 401/403.
   - Settings mutation by genuine host with valid token returns 200 OK.
   - POST `/join` with existing `participantId` without matching token returns 401/403 (or mints a new non-host ID without mutating the target).
   - Re-joining with matching token succeeds and updates nickname idempotently.
   - POST `/leave` with target `hostId` without matching token returns 401/403 and prevents eviction/takeover.
   - Legitimate participant leaving with matching token returns 200 OK.
   - Public GET `/api/rooms/:code` exposes zero secret tokens.

---

## 3. Caveats

1. **Downstream Milestones (M2/M3/M4)**: Future endpoints (`POST /api/rooms/:code/start`, `POST /api/rooms/:code/vote`, `POST /api/rooms/:code/tiebreaker/spin`) will also require `sessionToken` or `hostKey`. By establishing `api.request()` header injection and `RoomContext` credential persistence now in M1, all downstream milestones inherit this security foundation automatically.
2. **Browser `EventSource` Header Limitation**: HTML5 `EventSource` does not support custom headers. SSE stream authentication relies on query parameters (`?sessionToken=...`).
3. **Token Terminology Unification**: Explorer 1 referred to tokens as `sessionToken` / `hostKey`, while Explorer 2 referred to them as `participantSecret` / `hostSecret`. The frontend and test strategy explicitly unifies both as recognized aliases, ensuring complete compatibility regardless of backend naming choice.

---

## 4. Conclusion

The Milestone 1 gate failure can be resolved cleanly without affecting user experience or changing the component hierarchy.

### Required Actions for Worker (`worker_m1`):
1. **Update `src/utils/session.js`**:
   - Implement `ROOM_SESSIONS_KEY` storage map.
   - Add `getRoomSession`, `saveRoomSession`, `clearRoomSession`, `getStoredSessionToken`, and `getStoredHostKey` while maintaining `memoryStore` fallback.
2. **Update `src/utils/api.js`**:
   - Enhance `request()` to auto-attach `x-session-token` and `x-host-key` headers.
   - Update `joinRoom`, `updateSettings`, `leaveRoom`, and `connectRoomStream` to accept and transmit credentials.
3. **Update `src/context/RoomContext.jsx`**:
   - Store credentials on `createRoom` and `joinRoom`.
   - Pass credentials on `updateSettings` and `leaveRoom`.
   - Clear credentials on room leave or room closure.
4. **Update Existing Tests in `tests/tier1-features/r1-rooms.test.js`**:
   - Update lines 180, 224, and 350 to provide legitimate session tokens (`.set('x-session-token', ...)`).
5. **Append Dedicated Adversarial Test Suite in `tests/tier1-features/r1-rooms.test.js`**:
   - Add the 8 adversarial test cases detailed in Section 5.2 of `fix_strategy.md`.

---

## 5. Verification Method

To independently verify the implementation:

1. **Run Vitest Test Suite**:
   ```powershell
   cd C:\Users\kck50\teamwork_projects\niche_web_app
   npm test
   ```
   *Expected Output*: 100% test pass rate across `r1-rooms.test.js` (including all 8 adversarial tests) and `boundary-cases.test.js`.

2. **Run Production Build**:
   ```powershell
   npm run build
   ```
   *Expected Output*: Vite transforms 1922+ modules and produces clean bundle without errors.

3. **Execute Empirical Stress Test Harness**:
   ```powershell
   node C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs
   ```
   *Expected Output*: All 25 assertions pass, 0 critical findings reported, and output concludes with `VERDICT: APPROVE`.

4. **Verify Adversarial Invalidation Condition**:
   - If an unauthenticated request to `PATCH /api/rooms/:code/settings` with `participantId = hostId` returns 200 OK, the fix has failed and the gate must not be approved.
   - If an unauthenticated request to `POST /api/rooms/:code/leave` with `participantId = hostId` succeeds in ejecting the host, the fix has failed.
