# Milestone 2 Adversarial Challenge Report: Boundary, Security & Malicious Input

**Agent**: `challenger_m2_2`  
**Role**: Adversarial Challenger (Critic / Specialist)  
**Target Milestone**: Milestone 2 (Interactive Swiping & Consensus Matching Engine)  
**Coordination Directory**: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\challenger_m2_2`  
**Verdict**: **REQUEST_CHANGES**  
**Date**: 2026-10-09  

---

## 1. Observation

### 1.1 Empirical Verification Test Execution
An adversarial test suite was authored and executed at:  
`tests/tier2-boundaries/m2-adversarial-security.test.js` (22 tests).

Full project test suite execution:
```powershell
npm test
```
**Command Output**:
```
 RUN  v2.1.9 C:/Users/kck50/teamwork_projects/niche_web_app

 ✓ tests/tier1-features/r1-rooms.test.js (30 tests) 296ms
 ✓ tests/tier1-features/r2-swiping.test.js (29 tests) 464ms
 ✓ tests/tier2-boundaries/m2-adversarial-security.test.js (22 tests) 558ms
 ✓ tests/tier2-boundaries/boundary-cases.test.js (27 tests) 873ms
 ✓ tests/stress-concurrency-consensus.test.js (18 tests) 1121ms

 Test Files  5 passed (5)
      Tests  126 passed (126)
   Start at  23:14:22
   Duration  1.99s (transform 263ms, setup 401ms, collect 1.64s, tests 3.31s, environment 1ms, prepare 875ms)
```

Production build execution:
```powershell
npm run build
```
**Command Output**:
```
vite v5.4.21 building for production...
✓ 1930 modules transformed.
dist/index.html                   0.86 kB │ gzip:  0.49 kB
dist/assets/index-C_4cscFA.css   16.89 kB │ gzip:  4.03 kB
dist/assets/index-BKfWM_fq.js   211.42 kB │ gzip: 66.09 kB
✓ built in 2.75s
```

---

### 1.2 Confirmed Findings & Observations

#### Finding 1 (CRITICAL): Prototype Pollution Vulnerability in `RoomStore.recordVote`
- **Location**: `server/models/RoomStore.js`, lines 552–556:
```javascript
// Record the vote in room.votes map
if (!room.votes[venueId]) {
  room.votes[venueId] = {};
}
room.votes[venueId][participantId] = vote;
```
- **Direct Observation**:
  - `room.votes` is initialized as `{}` in `createRoom` (line 108), inheriting from `Object.prototype`.
  - When an authenticated client calls `POST /api/rooms/:code/vote` with `{ venueId: "__proto__", vote: "like" }`, `!room.votes["__proto__"]` is false because `Object.prototype` exists.
  - The runtime executes `room.votes["__proto__"][participantId] = vote`, directly assigning `Object.prototype[participantId] = "like"`.
  - In `tests/tier2-boundaries/m2-adversarial-security.test.js` (lines 197–228):
    ```javascript
    expect(Object.prototype[host.id]).toBe('like');
    expect(({})[host.id]).toBe('like');
    ```
    This assertion passed, empirically proving that all ordinary objects across the entire Node.js server runtime were polluted with `[host.id] = "like"`.

#### Finding 2 (HIGH): Unvalidated / Ghost `venueId` Allows Room State Corruption
- **Location**: `server/models/RoomStore.js`, lines 537–541, 596–620; `server/routes/votes.js`, lines 71–76:
- **Direct Observation**:
  - The route only checks `if (!venueId) return res.status(400)`. It does NOT verify whether `venueId` exists in `room.deck` or `loadVenues()`.
  - When a solo participant or all participants submit votes on an arbitrary fake ID (e.g. `venueId: "phantom-venue-99999"`), `roomStore.recordVote` accepts it, records it in `room.votes["phantom-venue-99999"]`, and evaluates consensus.
  - Because all active participants voted 'like', consensus is triggered:
    ```javascript
    const matchedVenue = (room.deck || []).find(d => d.id === venueId) || this.getVenueById(venueId);
    room.status = 'matched';
    room.matchedVenueId = venueId;
    ```
  - `matchedVenue` resolves to `null`.
  - The room enters `status: "matched"` with `matchedVenue: null` and `matchedVenueId: "phantom-venue-99999"`.
  - In `src/components/Match/MatchCelebration.jsx` (lines 73–81):
    ```jsx
    if (!venue) {
      return (
        <div className="card text-center" style={{ padding: '40px 20px' }}>
          <Sparkles size={40} color="var(--primary)" style={{ margin: '0 auto 16px' }} />
          <h2 className="card-title">Match Found!</h2>
          <p className="card-subtitle">Loading winning venue details...</p>
        </div>
      );
    }
    ```
    The UI renders a permanent, unrecoverable "Loading winning venue details..." spinner without buttons or action controls.

#### Finding 3 (MEDIUM): Negative `deckSize` Truncates Deck to Empty Array
- **Location**: `server/models/RoomStore.js`, line 354 and line 420:
```javascript
const deckSize = Number(settings.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12;
...
return candidatePool.slice(0, deckSize);
```
- **Direct Observation**:
  - In JavaScript, `Number(-10)` evaluates to `-10` (truthy).
  - Therefore, `Number(-10) || 12` evaluates to `-10`.
  - `candidatePool.slice(0, -10)` slices off the last 10 elements.
  - When `candidatePool.length <= 10`, `slice(0, -10)` returns an empty array `[]` (0 cards).
  - Calling `POST /api/rooms/:code/start` returns `deck: []`.
  - In `tests/tier2-boundaries/m2-adversarial-security.test.js` (line 696):
    ```javascript
    expect(startResNeg.body.deck.length).toBe(0);
    ```
    This leaves all participants in a voting round with 0 cards, unable to swipe or finish the round.

#### Finding 4 (MEDIUM): Promoted Card Placement Fails to Guarantee Top 3 Position and Drops on Small Decks
- **Location**: `server/models/RoomStore.js`, lines 411–420:
```javascript
// 5. Ensure at least one promoted venue is present (R4 monetization requirement)
const hasPromoted = candidatePool.some(v => v.isPromoted);
if (!hasPromoted) {
  const promotedVenue = allVenues.find(v => v.isPromoted);
  if (promotedVenue) {
    const insertIdx = Math.min(2, candidatePool.length);
    candidatePool.splice(insertIdx, 0, promotedVenue);
  }
}

return candidatePool.slice(0, deckSize);
```
- **Direct Observation**:
  - `worker_m2` claimed in `handoff.md` line 57: *"Guaranteed at least one sponsored venue (`isPromoted: true`) placed within the top 3 cards for R4 monetization."*
  - In `server/data/venues.json`, `venue-sp-002` (`L'Amore Bistro & Wine Bar`, dining, `isPromoted: true`) is at the end of the dining catalog.
  - When filtering for `activityCategory: 'dining'`, `candidatePool` contains `venue-sp-002` at index 3 or index 5.
  - Because `candidatePool.some(v => v.isPromoted)` is already true, `if (!hasPromoted)` does NOT execute, and the promoted card is NOT moved into the top 3 positions.
  - Furthermore, when `deckSize: 3` (e.g. quick 3-card swipe round), `candidatePool.slice(0, 3)` slices off `venue-sp-002` (which was at index 3), resulting in `[ { id: 'venue-001' }, { id: 'venue-003' }, { id: 'venue-021' } ]`. Zero promoted cards exist in the deck!
  - In `tests/tier2-boundaries/m2-adversarial-security.test.js` (lines 813–818):
    ```javascript
    expect(smallDeck.length).toBe(3);
    expect(smallDeck.some(v => v.isPromoted)).toBe(false);
    ```
    This assertion passed, empirically proving the promoted card starvation bug.

---

## 2. Logic Chain

1. **Premise 1**: In Node.js, modifying `Object.prototype` alters default properties for all object instances in the process. `RoomStore.js` uses an unkeyed object literal `room.votes = {}`, allowing an attacker who passes `venueId = '__proto__'` to mutate `Object.prototype` via `room.votes[venueId][participantId] = vote`. (Supported by Observation 1.2, Finding 1).
2. **Premise 2**: A state machine that transitions to a terminal state (`matched`) based on external inputs must validate that the agreed-upon entity exists within the bounded candidate set (`room.deck`). Because `recordVote` accepts any arbitrary string for `venueId`, an attacker or malformed client can force consensus on a null entity, breaking UI rendering and requiring manual session teardown. (Supported by Observation 1.2, Finding 2).
3. **Premise 3**: Numeric settings must enforce domain bounds ($deckSize \ge 1$). Because `Number(settings.deckSize) || 12` permits negative numbers, `.slice(0, -10)` empties the card deck. (Supported by Observation 1.2, Finding 3).
4. **Premise 4**: The business requirement and worker claim specify that a sponsored card is present in the swipe deck and positioned early (top 3) for affiliate visibility. Checking `candidatePool.some()` before `.slice(0, deckSize)` causes cards positioned beyond `deckSize` to be dropped entirely, leading to sponsor card starvation. (Supported by Observation 1.2, Finding 4).
5. **Conclusion**: While standard happy-path swiping and dual-token authentication boundaries function well, the codebase contains critical prototype pollution and denial-of-service vulnerabilities, along with edge case topology defects. Therefore, the verdict is **REQUEST_CHANGES**.

---

## 3. Caveats

- **Scope Boundary**: This evaluation tested the server-side REST API, in-memory `RoomStore`, room topology edge cases, and security boundaries. Client-side Pointer Events drag mechanics were tested against browser mock interfaces and pass cleanly.
- **Single Process In-Memory Architecture**: The current server uses an in-memory `Map` with local timers. Prototype pollution in this environment affects all active rooms and sessions across the process.
- No other caveats.

---

## 4. Conclusion & Required Mitigations

**Verdict**: **REQUEST_CHANGES**

To resolve these empirical findings before Milestone 3, the following changes are required in `server/models/RoomStore.js` and `server/routes/votes.js`:

1. **Mitigate Prototype Pollution**:
   - Initialize `room.votes = Object.create(null)` or use a `Map()`.
   - In `recordVote`: reject blacklisted property names (`['__proto__', 'constructor', 'prototype'].includes(venueId)`).
2. **Validate `venueId` Against Room Deck**:
   - In `recordVote`: verify `const validVenue = (room.deck || []).some(v => v.id === venueId);`. If false, throw `400 Bad Request` (`'venueId is not in the room deck'`).
3. **Sanitize `deckSize`**:
   - In `createRoom` and `getDeckForRoom`: enforce `const deckSize = Math.max(1, Math.min(25, Number(settings.deckSize) || CONFIG.DEFAULT_DECK_SIZE));`.
4. **Fix Promoted Card Placement**:
   - In `getDeckForRoom`: after assembling `candidatePool`, ensure that at least one promoted venue is positioned within the first $\min(3, deckSize)$ elements of the sliced deck. If a promoted venue is present beyond index 2, swap or move it to index $\min(2, candidatePool.length - 1)$.

---

## 5. Verification Method

### 5.1 Verification Commands
From the project root (`C:\Users\kck50\teamwork_projects\niche_web_app`):

1. **Run the Adversarial Security & Boundary Test Suite**:
   ```powershell
   npx vitest run tests/tier2-boundaries/m2-adversarial-security.test.js
   ```
   *Expected Output*: 22 passed (22), exit code 0.

2. **Run Full Project Test Suite**:
   ```powershell
   npm test
   ```
   *Expected Output*: 5 test files passed, 126 passed (126), 0 failed, exit code 0.

3. **Run Production Build**:
   ```powershell
   npm run build
   ```
   *Expected Output*: Clean build without errors, exit code 0.

### 5.2 Key Files to Inspect
- `tests/tier2-boundaries/m2-adversarial-security.test.js` (Adversarial harness with 22 test cases)
- `server/models/RoomStore.js` (Lines 354, 411–420, 537–556, 596–620)
- `server/routes/votes.js` (Lines 71–83)
- `src/components/Match/MatchCelebration.jsx` (Lines 73–81)

### 5.3 Invalidation Conditions
- Any assertion in `tests/tier2-boundaries/m2-adversarial-security.test.js` fails.
- `Object.prototype` remains immune to pollution when `venueId = '__proto__'` is passed without sanitization (our test proved it is currently polluted).
- Voting on arbitrary non-deck `venueId` throws an error rather than creating a null match (our test proved it currently creates a null match).
