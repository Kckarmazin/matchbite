# Milestone 2 Iteration 2 Synthesis Report: Adversarial Defect Remediation

## Consensus
All 3 Explorers (`explorer_m2_it2_1`, `explorer_m2_it2_2`, `explorer_m2_it2_3`) agreed on the complete fix strategy and test synchronization:

1. **Prototype Pollution Remediation (Finding 1)**:
   - In `server/models/RoomStore.js`:
     - Initialize `room.votes = Object.create(null)` in `createRoom`.
     - When creating venue vote maps: `room.votes[venueId] = Object.create(null)`.
     - In `recordVote`: check `if (['__proto__', 'constructor', 'prototype'].includes(String(venueId).toLowerCase())) throw Object.assign(new Error('Invalid venueId'), { statusCode: 400 });`.
     - In `server/routes/votes.js`: reject prototype keys with 400 Bad Request.

2. **Room Deck Membership Validation (Finding 2)**:
   - In `server/models/RoomStore.js` `recordVote`:
     - Validate: `const inDeck = Array.isArray(room.deck) && room.deck.some(v => v && v.id === venueId);`
     - If not in deck, throw `Object.assign(new Error('venueId is not in the room deck'), { statusCode: 400 });`.
   - In `server/routes/votes.js`: reject non-deck venue IDs with 400 Bad Request before attempting to record vote.
   - In `src/components/Match/MatchCelebration.jsx`: add fallback resolution of venue from `room.deck` and graceful timeout recovery controls (Return to Lobby, Swipe Again).

3. **Deck Size Bounding & Sanitization (Finding 3)**:
   - In `server/models/RoomStore.js` (`createRoom`, `updateSettings`, `getDeckForRoom`):
     - `const deckSize = Math.floor(Math.max(1, Math.min(25, Number(settings?.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12)));`
     - This guarantees that negative numbers, non-numeric strings, 0, or excessive values clamp strictly to `[1, 25]`.

4. **Promoted Card Top 3 Placement Guarantee (Finding 4)**:
   - In `server/models/RoomStore.js` `getDeckForRoom`:
     - Calculate `const topLimit = Math.min(3, deckSize);`
     - Find promoted index in `candidatePool`.
     - If `promotedIdx >= topLimit`, splice and move to index `topLimit - 1`.
     - If `promotedIdx === -1`, retrieve a promoted venue from `allVenues` and insert at index `Math.max(0, Math.min(topLimit - 1, candidatePool.length))`.
     - Then slice `candidatePool.slice(0, deckSize)`.

5. **Test Suite Synchronization**:
   - In `tests/tier2-boundaries/m2-adversarial-security.test.js`:
     - Update test assertions from proving the vulnerability to verifying the fix:
       - Prototype pollution attempt returns 400 Bad Request and `Object.prototype` remains unpolluted (`undefined`).
       - Ghost `venueId` returns 400 Bad Request and room remains in `'voting'` status.
       - Negative `deckSize` clamps to valid positive deck size.
       - Small decks (`deckSize: 3`) contain at least one promoted card.

## Worker Assignment
- Assigned Worker: `worker_m2_remediation`
- Exclusive write ownership:
  - `server/models/RoomStore.js`
  - `server/routes/votes.js`
  - `src/components/Match/MatchCelebration.jsx`
  - `tests/tier2-boundaries/m2-adversarial-security.test.js`
  - `tests/tier1-features/r2-swiping.test.js`
