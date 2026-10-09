# Milestone 1 Verification Report & Adversarial Challenge: Room Management & Session Logic

**Agent**: Challenger 2 (`challenger_m1_2`)  
**Verdict**: **REQUEST_CHANGES**  
**Overall Risk Assessment**: **CRITICAL**

---

## 1. Observation

### 1.1 Baseline Test Suite & Build Verification
- Executed `npm test` at `C:\Users\kck50\teamwork_projects\niche_web_app`:
  ```
  RUN  v2.1.9 C:/Users/kck50/teamwork_projects/niche_web_app
  ✓ tests/tier1-features/r1-rooms.test.js (20 tests) 131ms
  Test Files  1 passed (1)
       Tests  20 passed (20)
  ```
- Executed `npm run build` at `C:\Users\kck50\teamwork_projects\niche_web_app`:
  ```
  vite v5.4.21 building for production...
  ✓ 1922 modules transformed.
  dist/index.html                   0.86 kB │ gzip:  0.49 kB
  dist/assets/index-BygCqJZl.css    6.95 kB │ gzip:  2.12 kB
  dist/assets/index-CFrCbBEm.js   174.46 kB │ gzip: 54.78 kB
  ✓ built in 2.25s
  ```

### 1.2 SSE Streaming Resilience & Disconnect Behavior
- Tested via executable harness `C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs`:
  - **Multi-client SSE connectivity**: Host and 5 participants established active connections to `GET /api/rooms/:code/stream?participantId=...`. All streams received `room:init` snapshot immediately (`Broadcaster.getClientCount(code) === 2`).
  - **Live event broadcasting**: `POST /api/rooms/:code/join` and `PATCH /api/rooms/:code/settings` successfully broadcast `participant:joined` and `settings:updated` to 100% of connected clients.
  - **Graceful client disconnect**: When a client destroyed its request socket, `Broadcaster.js` line 45-53 cleanup handler decremented the connection counter without leaking memory (`Broadcaster.getClientCount(code)` dropped from 2 to 1).
  - **Client reconnect**: Reconnecting with the same `participantId` restored client count to 2 and immediately delivered a fresh `room:init` snapshot.
  - **Abrupt socket severance**: When a client's TCP socket was abruptly severed (`socket.destroy()`), `Broadcaster.broadcast` caught the write error, pruned the dead client from the active set (`Broadcaster.js` line 82), and successfully delivered the broadcast to surviving clients without throwing unhandled exceptions.
  - **Burst concurrency**: Tested 10 concurrent streams under a rapid burst of 50 consecutive broadcasts. All 10 clients received all 50 events (500 delivered events total) with 0% dropped events in under 2ms.
  - **TTL purge & stream closure**: Forcing room TTL expiration and triggering `RoomStore.cleanupExpiredRooms()` correctly called `Broadcaster.closeRoom(code)`, writing `room:closed` to connected clients and ending the HTTP responses cleanly (`streamEnded === true`).

### 1.3 Privilege Escalation Vulnerabilities: Public `hostId` Leakage
Inspection of `server/models/RoomStore.js` and `server/routes/rooms.js` revealed:
1. In `server/models/RoomStore.js` lines 125-155 (`getPublicRoom`):
   ```javascript
   144: hostId: room.hostId,
   145: participants: participantList,
   ```
   where `participantList` exposes `id: p.id` for every participant.
2. In `server/routes/rooms.js` lines 81-93 (`GET /api/rooms/:code`) and lines 112-133 (`POST /api/rooms/:code/join`):
   The unredacted output of `roomStore.getPublicRoom(code)` is returned to anyone querying the room or joining as a guest.
3. In `server/routes/rooms.js` lines 145-175 (`PATCH /api/rooms/:code/settings`):
   ```javascript
   148: const { participantId, settings } = req.body || {};
   158: const updatedSettings = roomStore.updateSettings(code, participantId, settings);
   ```
   And in `server/models/RoomStore.js` lines 242-246:
   ```javascript
   242: if (room.hostId !== participantId) {
   243:   const err = new Error('Only the room host can update settings');
   244:   err.statusCode = 403;
   245:   throw err;
   246: }
   ```
   Because `room.hostId` is exposed to all participants in `getPublicRoom()`, an adversarial guest simply supplies `participantId = room.hostId`.
4. In `server/models/RoomStore.js` lines 188-193 (`joinRoom`):
   ```javascript
   188: if (participantId && room.participants[participantId]) {
   189:   participant = room.participants[participantId];
   190:   participant.name = trimmedName;
   191:   if (avatar) participant.avatar = avatar;
   192:   participant.lastSeenAt = now;
   193: }
   ```
   An adversary passing `participantId = room.hostId` in `POST /api/rooms/:code/join` overwrites the host's nickname/avatar and receives `{ isHost: true }`.
5. In `server/models/RoomStore.js` lines 296-314 (`leaveRoom`):
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
   An adversary passing `participantId = room.hostId` in `POST /api/rooms/:code/leave` ejects the real host, and the server automatically promotes the remaining participant (the attacker) to become room host (`isHost: true`).

### 1.4 Verbatim Empirical Reproduction Outputs
Running `node C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs`:
```
  [VULNERABILITY / FINDING - CRITICAL]: Public hostId Leak Enables Non-Host Settings Hijacking
  Description: RoomStore.getPublicRoom() exposes hostId in public REST response. Any participant or unauthenticated observer can send PATCH /settings with participantId = room.hostId, bypassing the host check.
  Proof: {
  "endpoint": "PATCH /api/rooms/:code/settings",
  "sentParticipantId": "p-7e7fbd6a-6af9-42f4-b638-a0e73d6604c0",
  "resultSettings": {
    "groupType": "friends",
    "activityCategory": "hijacked_category",
    "priceRange": [ 4 ],
    "distance": "walkable",
    "deckSize": 12,
    "tieBreakerType": "wheel"
  }
}

  [VULNERABILITY / FINDING - CRITICAL]: Host Account & Roster Slot Impersonation via POST /join
  Description: POST /join accepts an existing participantId without authenticating possession. Passing the leaked hostId renames the host and returns full host status to the attacker.
  Proof: {
  "endpoint": "POST /api/rooms/:code/join",
  "hijackedParticipant": {
    "id": "p-7e7fbd6a-6af9-42f4-b638-a0e73d6604c0",
    "name": "ImposterHost",
    "avatar": "😈",
    "isHost": true,
    "status": "lobby"
  }
}

  [VULNERABILITY / FINDING - CRITICAL]: Host Eviction & Host Ownership Takeover via POST /leave
  Description: POST /leave accepts any participantId without session authentication. Supplying leaked hostId removes the real host from the room and promotes the attacker (SneakyGuest) to room host.
  Proof: {
  "endpoint": "POST /api/rooms/:code/leave",
  "newHostId": "p-5275443c-f874-4501-bab2-efedbaffc2e5",
  "promotedParticipant": {
    "id": "p-5275443c-f874-4501-bab2-efedbaffc2e5",
    "name": "SneakyGuest",
    "avatar": "🍻",
    "isHost": true,
    "status": "lobby"
  }
}
```

---

## 2. Logic Chain

1. **Contract Requirement**: `PROJECT.md` line 10 specifies `"In-memory RoomStore with atomic mutations, cryptographic UUID session tokens, memorable room codes, and TTL expiration (24h)"`. `ORIGINAL_REQUEST §R1` mandates robust room management where host parameters control the group activity.
2. **Authorization Mechanism**: `server/models/RoomStore.js` uses `room.hostId === participantId` as the sole authorization gate to determine host status for mutating room settings (`updateSettings`).
3. **Information Disclosure**: `server/models/RoomStore.js` line 144 exports `hostId: room.hostId` in `getPublicRoom()`. This payload is sent over the wire in response to unauthenticated requests: `GET /api/rooms/:code`, `POST /api/rooms/:code/join`, and `POST /api/rooms`.
4. **Broken Access Control (OWASP Top 10 A01:2021)**: Because the secret capability token (`hostId`) is broadcast publicly, any client (guest, spectator, or automated script) possessing the room code also possesses the host capability token.
5. **Exploitation**: An adversary can submit `participantId: room.hostId` to:
   - `PATCH /api/rooms/:code/settings` to override activity parameters against the host's will.
   - `POST /api/rooms/:code/join` to overwrite host identity.
   - `POST /api/rooms/:code/leave` to eject the host and become the new room host.
6. **False Sense of Test Coverage**: In `tests/tier1-features/r1-rooms.test.js` lines 240-263, the test `forbids non-hosts from modifying settings with 403 Forbidden` only tested a cooperative guest who passes their own `guestId`. It did not test adversarial input using the publicly returned `room.hostId`.
7. **Task Objective Failure**: Task Objective 2 explicitly directs: *"Test host privilege escalation resistance: ensure non-host participants cannot hijack settings or restart/close rooms."* Since non-host participants can hijack settings, the acceptance criteria are not met.

---

## 3. Caveats

- **Restart and Close Endpoints**: The test verified that `POST /api/rooms/:code/restart` and `POST /api/rooms/:code/close` currently return 404 Not Found. Non-hosts cannot hijack restart/close via dedicated REST routes because those routes have not yet been implemented (restart is scheduled for Milestone 3 per `PROJECT.md` line 56).
- **Settings Whitelist**: `RoomStore.updateSettings` correctly implements an `allowedKeys` whitelist, preventing arbitrary prototype pollution or overwriting `room.status` or `room.hostId` directly via the settings object.
- **SSE Engine Quality**: The SSE streaming subsystem (`Broadcaster.js`) is well-engineered and demonstrated 100% resilience under abrupt socket termination, high-concurrency burst traffic (500 messages across 10 clients in 2ms), and automated TTL cleanup.

---

## 4. Conclusion

Milestone 1 **CANNOT BE APPROVED** in its current state. While the project foundation, Vite build, SSE broadcasting, and UI components are well constructed, a **CRITICAL privilege escalation and session hijacking vulnerability** exists in the room management engine.

### Required Changes for Worker (`worker_m1`):
1. **Mask or Separate Private Session Tokens from Public Participant Identifiers**:
   - `RoomStore.getPublicRoom()` must NOT leak the host's capability token or private participant IDs to everyone.
   - Alternatively, decouple public `participantId` (visible on roster) from a private `sessionToken` / `hostToken` (returned strictly to the host/participant upon creation/joining, or stored in an HTTP-only cookie / auth header).
2. **Prevent Arbitrary Participant Eviction and Identity Stealing**:
   - `POST /api/rooms/:code/leave` and `POST /api/rooms/:code/join` must authenticate that the caller possesses the session token corresponding to the requested `participantId`.
3. **Add Adversarial Host Privilege Escalation Tests to `tests/tier1-features/r1-rooms.test.js`**:
   - Verify that guests possessing the public room state cannot modify settings.
   - Verify that guests cannot eject the host or hijack the host slot in the roster.

---

## 5. Verification Method

To independently verify these findings:

1. **Execute the Empirical Stress Test Harness**:
   ```powershell
   node C:\Users\kck50\.gemini\antigravity\scratch\empirical_stress_test.mjs
   ```
   *Expected Output*: Displays all 25 passing assertions and verbatim proof payloads for the 3 Critical Findings, culminating in `VERDICT: REQUEST_CHANGES`.

2. **Run One-Liner Host Eviction Reproduction**:
   ```powershell
   node -e "import('file:///C:/Users/kck50/teamwork_projects/niche_web_app/server/index.js').then(async ({ createApp }) => { const { RoomStore } = await import('file:///C:/Users/kck50/teamwork_projects/niche_web_app/server/models/RoomStore.js'); const http = await import('node:http'); const store = new RoomStore(); const app = createApp({ roomStore: store }); const server = http.createServer(app); server.listen(0, async () => { const base = 'http://127.0.0.1:' + server.address().port; const r1 = await fetch(base + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostName: 'LegitHost' }) }).then(r => r.json()); const r2 = await fetch(base + '/api/rooms/' + r1.room.code + '/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Attacker' }) }).then(r => r.json()); const kick = await fetch(base + '/api/rooms/' + r1.room.code + '/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantId: r2.room.hostId }) }).then(r => r.json()); const after = await fetch(base + '/api/rooms/' + r1.room.code).then(r => r.json()); console.log('Original Host:', r1.room.hostId, '| Host After Attacker Kick:', after.room.hostId); server.close(); }); });"
   ```
   *Expected Output*: Shows the original host ID was evicted and replaced by the attacker's ID.

3. **Baseline Suite Execution**:
   ```powershell
   cd C:\Users\kck50\teamwork_projects\niche_web_app
   npm test
   npm run build
   ```
