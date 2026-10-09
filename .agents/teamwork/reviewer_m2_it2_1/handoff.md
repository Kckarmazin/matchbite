# Review & Adversarial Challenge Report: Milestone 2 Iteration 2

**Reviewer Agent**: `reviewer_m2_it2_1`  
**Roles**: Reviewer, Adversarial Critic  
**Working Directory**: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\reviewer_m2_it2_1`  
**Target Milestone**: Milestone 2 Iteration 2 Remediation Review  
**Date**: 2026-10-09  

---

## Review Summary

**Verdict**: **APPROVE**  
**Integrity Audit**: **PASS** (Zero integrity violations; no hardcoded test values, no facade logic, no bypassed tests).  
**Overall Risk Assessment**: **LOW**

---

## 1. Observation

### 1.1 Prototype Pollution Defense Implementation
- In `server/models/RoomStore.js` (lines 9–18):
  ```javascript
  export const FORBIDDEN_PROPERTY_NAMES = Object.freeze([
    '__proto__',
    'constructor',
    'prototype',
  ]);

  export function isForbiddenPropertyName(key) {
    if (!key || typeof key !== 'string') return false;
    return FORBIDDEN_PROPERTY_NAMES.includes(key.trim());
  }
  ```
- In `server/models/RoomStore.js` (lines 77–81, 121–125):
  - `createRoom` validates `hostId` using `isForbiddenPropertyName(hostId)` and initializes:
    ```javascript
    participants: Object.assign(Object.create(null), {
      [hostParticipantId]: hostParticipant,
    }),
    deck: [],
    votes: Object.create(null),
    ```
- In `server/models/RoomStore.js` `joinRoom` (lines 235–239):
  ```javascript
  if (participantId && isForbiddenPropertyName(participantId)) {
    const err = new Error(`Invalid participantId: '${participantId}' is a reserved property name`);
    err.statusCode = 400;
    throw err;
  }
  ```
- In `server/models/RoomStore.js` `recordVote` (lines 582–592, 611–627):
  - Explicitly throws HTTP 400 when `isForbiddenPropertyName(venueId)` or `isForbiddenPropertyName(participantId)`.
  - Ensures `room.votes` and each nested `room.votes[venueId]` sub-map are initialized with `Object.create(null)`.
- In `server/routes/votes.js` (lines 78–91):
  ```javascript
  const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];
  if (FORBIDDEN_KEYS.includes(venueId.trim().toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: `Invalid venueId: '${venueId}' is a reserved property name`,
    });
  }

  if (FORBIDDEN_KEYS.includes(String(participantId).trim().toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: `Invalid participantId: '${participantId}' is a reserved property name`,
    });
  }
  ```

### 1.2 Deck Membership Validation & Client Fallback
- In `server/models/RoomStore.js` `recordVote` (lines 595–600):
  ```javascript
  const isVenueInDeck = Array.isArray(room.deck) && room.deck.some(v => v && v.id === venueId);
  if (!isVenueInDeck) {
    const err = new Error('venueId is not in the room deck');
    err.statusCode = 400;
    throw err;
  }
  ```
- In `server/routes/votes.js` (lines 93–99):
  ```javascript
  const room = roomStore.getRoom(code);
  if (room && room.status === 'voting' && Array.isArray(room.deck) && !room.deck.some(v => v && v.id === venueId)) {
    return res.status(400).json({
      success: false,
      error: 'venueId is not in the room deck',
    });
  }
  ```
- In `src/components/Match/MatchCelebration.jsx` (lines 28–32, 42–50, 109–177):
  - Resolves `venue` with fallback to `room.deck` by `room.matchedVenueId`:
    ```javascript
    const venue = propVenue
      || room?.matchedVenue
      || room?.match?.venue
      || (room?.matchedVenueId && room?.deck ? room.deck.find(v => v && v.id === room.matchedVenueId) : null)
      || null;
    ```
  - Arms a 3.5s timeout (`isLoadingTimedOut`) and renders a full recovery card with the unanimous participant agreement roster, venue reference ID, and recovery action buttons (`Reload Session`, `Return to Lobby`, `Swipe Again`).

### 1.3 `deckSize` Sanitization & Clamping
- In `server/models/RoomStore.js` `createRoom` (line 116):
  ```javascript
  deckSize: Math.floor(Math.max(1, Math.min(25, Number(deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12)))
  ```
- In `server/models/RoomStore.js` `updateSettings` (lines 350–352):
  ```javascript
  room.settings.deckSize = Math.floor(
    Math.max(1, Math.min(25, Number(newSettings.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12))
  );
  ```
- In `server/models/RoomStore.js` `getDeckForRoom` (line 383):
  ```javascript
  const deckSize = Math.floor(Math.max(1, Math.min(25, Number(settings.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12)));
  ```

### 1.4 Guaranteed Promoted Card Placement in Top min(3, deckSize)
- In `server/models/RoomStore.js` `getDeckForRoom` (lines 440–459):
  ```javascript
  const topLimit = Math.min(3, deckSize);
  const promotedIdx = candidatePool.findIndex(v => v && v.isPromoted);

  if (promotedIdx >= topLimit) {
    // Promoted venue exists in pool but is outside top min(3, deckSize)
    const [promotedVenue] = candidatePool.splice(promotedIdx, 1);
    const targetIdx = Math.max(0, topLimit - 1);
    candidatePool.splice(targetIdx, 0, promotedVenue);
  } else if (promotedIdx === -1) {
    // No promoted venue in pool; find from allVenues (prefer matching category)
    const promotedVenue =
      allVenues.find(v => v && (v.category || '').toLowerCase() === category && v.isPromoted) ||
      allVenues.find(v => v && v.isPromoted);
    if (promotedVenue) {
      const insertIdx = Math.max(0, Math.min(topLimit - 1, candidatePool.length));
      candidatePool.splice(insertIdx, 0, promotedVenue);
    }
  }

  return candidatePool.slice(0, deckSize);
  ```

### 1.5 Test & Build Execution Outputs
- Executed `npm test`:
  ```
   RUN  v2.1.9 C:/Users/kck50/teamwork_projects/niche_web_app

   ✓ tests/tier1-features/r1-rooms.test.js (30 tests) 264ms
   ✓ tests/tier1-features/r2-swiping.test.js (32 tests) 451ms
   ✓ tests/tier2-boundaries/m2-adversarial-security.test.js (27 tests) 558ms
   ✓ tests/tier2-boundaries/boundary-cases.test.js (27 tests) 841ms
   ✓ tests/stress-concurrency-consensus.test.js (18 tests) 1110ms

   Test Files  5 passed (5)
        Tests  134 passed (134)
     Duration  1.98s
  ```
  Exit code: 0.
- Executed `npm run build`:
  ```
  vite v5.4.21 building for production...
  ✓ 1930 modules transformed.
  dist/index.html                   0.86 kB │ gzip:  0.49 kB
  dist/assets/index-C_4cscFA.css   16.89 kB │ gzip:  4.03 kB
  dist/assets/index-Lb7IwBU6.js   213.68 kB │ gzip: 66.40 kB
  ✓ built in 2.87s
  ```
  Exit code: 0.

---

## 2. Logic Chain

1. **Defense-in-Depth against Prototype Pollution**:
   - `Object.create(null)` creates objects with a `null` prototype, having no prototype chain (`[[Prototype]]: null`). As a result, properties like `__proto__`, `toString`, or `constructor` are treated as normal own-properties rather than invoking prototype accessors.
   - In addition, explicit rejection of `['__proto__', 'constructor', 'prototype']` at both HTTP route handlers (`server/routes/votes.js`) and core domain models (`server/models/RoomStore.js`) stops malicious payload keys before any lookup or assignment takes place.
   - In `tests/tier2-boundaries/m2-adversarial-security.test.js`, tests verify that sending `venueId: '__proto__'` returns HTTP 400 and `Object.prototype[host.id]` remains `undefined`. (Supported by Observation 1.1).

2. **Integrity of Voting and Consensus Engine**:
   - Requiring `room.deck.some(v => v && v.id === venueId)` guarantees that votes can only be registered for venues presented in the room's active deck.
   - Non-deck venue votes are rejected with HTTP 400 Bad Request before mutating state. Consequently, `participant.swipedCount` does not increment on rejected votes, and malicious or out-of-sync clients cannot manufacture a match on non-existent or unpresented venues.
   - In `tests/tier1-features/r2-swiping.test.js` Suite 6, tests confirm that voting on out-of-deck venues is blocked, `swipedCount` remains uncorrupted, and coordinated ghost votes cannot trigger consensus. (Supported by Observation 1.2).

3. **Mathematical Bounding of Deck Sizes**:
   - The expression `Math.floor(Math.max(1, Math.min(25, Number(x) || 12)))` clamps all numeric values to $[1, 25]$.
   - Falsy values (`0`, `null`, `undefined`, empty string) and non-numeric strings (`NaN`) evaluate to `12`.
   - Negative numbers are clamped to `1`, floats are truncated via `Math.floor`, and oversized numbers are capped at `25` (the full size of `venues.json`).
   - Slicing `candidatePool.slice(0, deckSize)` guarantees the deck length is always between 1 and 25 cards without out-of-bounds slicing or empty decks. (Supported by Observation 1.3).

4. **Guaranteed Promoted Card Monetization**:
   - For any deck size $D \in [1, 25]$, `topLimit = Math.min(3, D)`.
   - If a promoted venue is already in the top $topLimit$ (index $< topLimit$), it is preserved.
   - If a promoted venue is found beyond index $topLimit - 1$, it is spliced out and inserted at index $topLimit - 1$.
   - If no promoted venue is present, one is fetched from `allVenues` and inserted at index $\min(topLimit - 1, candidatePool.length)$.
   - Because $topLimit - 1 < D$, the promoted venue is guaranteed to appear within the first $\min(3, D)$ cards, fulfilling the R4 sponsorship requirement across all categories and deck sizes. (Supported by Observation 1.4).

5. **Adversarial & Integrity Assessment**:
   - Independent verification confirmed no hardcoded outputs or test-specific bypasses.
   - Code was executed across all test suites with 100% pass rate (134/134 tests).
   - Production Vite build compiled cleanly with zero errors. (Supported by Observation 1.5).

---

## 3. Caveats

- **No Caveats**: All 4 security and functional defect areas were thoroughly inspected, verified via live execution, and confirmed to have zero regressions.

---

## 4. Conclusion

The remediation performed by `worker_m2_remediation` completely addresses the vulnerabilities identified in Milestone 2 Iteration 1:
1. **Prototype Pollution**: Defended with both input validation (`isForbiddenPropertyName`) and null-prototype data structures (`Object.create(null)`).
2. **Ghost Venue Consensus**: Prevented via mandatory deck membership validation at both route and model levels; supported by resilient client fallback and recovery in `MatchCelebration.jsx`.
3. **Deck Size Clamping**: Mathematical normalization guarantees decks between 1 and 25 cards for all input types.
4. **Promoted Card Placement**: Deterministic positioning within top $\min(3, deckSize)$ cards ensures reliable sponsor monetization.
5. **Quality & Test Verification**: All 134 tests pass with exit code 0; clean production build.

Verdict: **APPROVE**.

---

## 5. Verification Method

To independently reproduce and verify this review:

1. **Run Full Test Suite**:
   ```powershell
   npm test
   ```
   *Expected Result*: 5 test suites passed, 134 tests passed, 0 failures, exit code 0.

2. **Run Adversarial Security Suite**:
   ```powershell
   npx vitest run tests/tier2-boundaries/m2-adversarial-security.test.js
   ```
   *Expected Result*: 27 passed, exit code 0.

3. **Run Swiping Feature Suite**:
   ```powershell
   npx vitest run tests/tier1-features/r2-swiping.test.js
   ```
   *Expected Result*: 32 passed, exit code 0.

4. **Run Production Build**:
   ```powershell
   npm run build
   ```
   *Expected Result*: Vite builds production bundle in `dist/` with 0 errors, exit code 0.

5. **Inspect Implementation Files**:
   - `server/models/RoomStore.js`: Lines 9–18, 77–81, 116, 121–125, 235–239, 350–352, 383, 440–459, 582–627.
   - `server/routes/votes.js`: Lines 78–99.
   - `src/components/Match/MatchCelebration.jsx`: Lines 28–32, 42–50, 109–177.
