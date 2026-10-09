# Technical Investigation & Fix Specification: Deck Size Sanitization & Promoted Card Top 3 Placement

**Agent**: `explorer_m2_it2_3` (Explorer 3)  
**Milestone**: Milestone 2 Iteration 2  
**Target Issues**: Challenger 2 Finding 3 (Negative `deckSize` Truncation) & Finding 4 (Promoted Card Placement & Starvation)  
**Working Directory**: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m2_it2_3`  
**Date**: 2026-10-09  

---

## 1. Executive Summary

This report delivers a comprehensive root-cause analysis, mathematical fix strategy, code-level implementation blueprints, and regression test specifications for Findings 3 and 4 identified by `challenger_m2_2`:

1. **Finding 3 (MEDIUM): Negative `deckSize` Truncates Deck to Empty Array (`deck: []`)**
   - **Root Cause**: `server/models/RoomStore.js` evaluated `Number(settings.deckSize) || CONFIG.DEFAULT_DECK_SIZE`. In JavaScript, negative numbers (e.g. `-10`) are truthy, causing `deckSize` to evaluate to `-10`. Subsequently, `candidatePool.slice(0, -10)` strips elements from the end of the array, returning an empty array (`[]`) when `candidatePool.length <= 10`.
   - **Impact**: When a room is started, participants receive an empty deck of 0 cards (`deck.length === 0`), causing the swiping UI to lock in an empty state where voting and consensus cannot proceed. Furthermore, `PATCH /api/rooms/:code/settings` assigned `deckSize` with zero sanitization.
   - **Remediation**: Implement strict bounded sanitization: `Math.floor(Math.max(1, Math.min(25, Number(deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12)))` across `createRoom`, `updateSettings`, and `getDeckForRoom`.

2. **Finding 4 (MEDIUM): Promoted Card Placement Fails to Guarantee Top 3 Position and Starves on Small Decks (`deckSize: 3`)**
   - **Root Cause**: In `RoomStore.getDeckForRoom`, Step 5 verified `candidatePool.some(v => v.isPromoted)`. In the `dining` category, `venue-sp-002` exists at index 5. In the `activities` category, step 4 backfill appended `venue-sp-001` at index 8. Because `some(v => v.isPromoted)` evaluated to `true`, step 5 skipped inserting or repositioning the promoted venue into the top 3 cards. When `deckSize: 3` was requested, `candidatePool.slice(0, 3)` sliced off indices 3+, resulting in a 3-card deck with **0 promoted cards** (breaking requirement R4 monetization and affiliate visibility).
   - **Remediation**: In `getDeckForRoom`, define `topLimit = Math.min(3, deckSize)`. If a promoted card exists at index $\ge topLimit$, splice and reposition it to index `topLimit - 1`. If no promoted card exists in `candidatePool`, retrieve one from `allVenues` and insert at `Math.max(0, Math.min(topLimit - 1, candidatePool.length))`. This mathematically guarantees that at least one promoted card is present within the first $\min(3, deckSize)$ cards of the returned sliced deck for all deck sizes $1 \le deckSize \le 25$.

---

## 2. Root Cause Analysis & Empirical Evidence

### 2.1 Finding 3: Negative `deckSize` Truncation Bug

#### Code Locations
1. `server/models/RoomStore.js`, line 99 (`createRoom`):
   ```javascript
   deckSize: Number(deckSize) || CONFIG.DEFAULT_DECK_SIZE,
   ```
2. `server/models/RoomStore.js`, lines 324–328 (`updateSettings`):
   ```javascript
   for (const key of allowedKeys) {
     if (newSettings[key] !== undefined) {
       room.settings[key] = newSettings[key];
     }
   }
   ```
3. `server/models/RoomStore.js`, line 354 and line 420 (`getDeckForRoom`):
   ```javascript
   const deckSize = Number(settings.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12;
   ...
   return candidatePool.slice(0, deckSize);
   ```

#### Failure Mechanics
- JavaScript truthiness rules: `Number(-10)` returns `-10`, which is a truthy number.
- `Number(-10) || 12` evaluates to `-10`.
- In `Array.prototype.slice(start, end)`, a negative `end` parameter specifies an offset from the end of the array: `slice(0, -10)` returns all elements *except* the last 10 elements.
- When `candidatePool` has length 4 to 10 (such as after filtering by category, distance, or price tier), `candidatePool.slice(0, -10)` returns `[]` (an empty array).
- In `startVoting()` (line 467): `room.deck = deck;`. Each participant's status is set to `swiping`, and `totalCards = 0`.
- In `src/components/Swiper/SwipeDeck.jsx` (lines 92–101):
  ```javascript
  if (!deck.length) {
    return (
      <div className="card text-center" style={{ padding: '60px 20px' }}>
        <p className="card-subtitle">No cards available in this deck.</p>
      </div>
    );
  }
  ```
  The entire group is locked in a dead-end state with no swipeable cards and no voting mechanism.

#### Existing Adversarial Proof in `tests/tier2-boundaries/m2-adversarial-security.test.js`
At lines 712–729:
```javascript
const resNeg = await request(app)
  .post('/api/rooms')
  .send({ hostName: 'NegDeckHost', deckSize: -10 });
const codeNeg = resNeg.body.room.code;
const startResNeg = await request(app)
  .post(`/api/rooms/${codeNeg}/start`)
  .set('x-session-token', resNeg.body.sessionToken)
  .send({ participantId: resNeg.body.participant.id });

expect(startResNeg.status).toBe(200);
// Empirically demonstrates the negative deckSize truncation bug:
expect(startResNeg.body.deck.length).toBe(0);
```
Challenger 2 verified that passing `-10` causes `deck.length` to be `0`.

---

### 2.2 Finding 4: Promoted Card Placement & Starvation Bug

#### Code Locations
`server/models/RoomStore.js`, lines 410–420 (`getDeckForRoom`):
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

#### Failure Mechanics
The implementation suffered from two distinct failure modes:

1. **Failure Mode A: Non-Top-3 Positioning in Large Decks**
   - In `server/data/venues.json`, `venue-sp-002` (`L'Amore Bistro & Wine Bar`, `isPromoted: true`) is in the `dining` category at index 5 of the dining list.
   - When filtering by `activityCategory: 'dining'`, `candidatePool` contains `venue-sp-002` at index 5.
   - `candidatePool.some(v => v.isPromoted)` evaluates to `true`.
   - The block `if (!hasPromoted)` does NOT execute.
   - `venue-sp-002` remains at index 5 (the 6th card). It is NOT placed in the top 3 cards!
   - Similarly, in `activityCategory: 'activities'`, `candidatePool` initially has no promoted venue. Step 4 backfill from `allVenues` appends `venue-sp-001` at index 8. Then Step 5 sees `hasPromoted === true`, leaving `venue-sp-001` at index 8 (the 9th card).

2. **Failure Mode B: Promoted Card Starvation on Small Decks (`deckSize: 3`)**
   - Suppose the host configures a fast decision round with `deckSize: 3` and `activityCategory: 'dining'`.
   - `candidatePool` contains 4 or more dining venues, with `venue-sp-002` positioned at index 3 or index 5.
   - `hasPromoted` evaluates to `true` on `candidatePool`.
   - `if (!hasPromoted)` is skipped.
   - Line 420 executes: `candidatePool.slice(0, 3)`.
   - Cards at index 0, 1, and 2 are returned. Index 3+ is sliced off!
   - The returned 3-card deck has **ZERO promoted cards**: `deck.some(v => v.isPromoted) === false`.
   - This directly violates Project Specification Feature 18 ("Native Promoted Card Placement") and R4 Monetization Requirements ("The swipe deck displays at least one clearly designated 'Promoted / Sponsored' venue card").

#### Existing Adversarial Proof in `tests/tier2-boundaries/m2-adversarial-security.test.js`
At lines 771–820:
```javascript
// 1. Activities category backfill: promoted card at index 8 instead of top 3
expect(actPromotedIdx).toBe(8);

// 2. Dining category: promoted card at index 5 instead of top 3
expect(dinPromotedIdx).toBe(5);

// 3. Small deck (deckSize: 3): drops promoted card completely
const smallHasPromoted = smallDeck.some(v => v.isPromoted);
expect(smallHasPromoted).toBe(false);
```

---

## 3. Coordinated Fix Strategy

### 3.1 Sanitization Strategy (`deckSize`)

We establish the domain invariant:
$$\forall s \in \text{Settings}, \quad 1 \le s.\text{deckSize} \le 25 \quad \text{and} \quad s.\text{deckSize} \in \mathbb{Z}$$

We define a canonical sanitization helper `sanitizeDeckSize(value, defaultSize)`:
```javascript
export function sanitizeDeckSize(value, defaultSize = CONFIG.DEFAULT_DECK_SIZE || 12) {
  const num = Number(value);
  // If value is NaN, 0, or not provided, fall back to defaultSize
  const val = Number.isFinite(num) && num !== 0 ? num : defaultSize;
  // Clamp between 1 and total catalog size (25) and ensure integer
  return Math.floor(Math.max(1, Math.min(25, val)));
}
```

Equivalently using the concise formula requested in the dispatch:
```javascript
Math.floor(Math.max(1, Math.min(25, Number(settings.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12)))
```
This formula evaluates correctly across all boundary inputs:
- `deckSize: -10` $\rightarrow Number(-10) \rightarrow -10 \rightarrow \max(1, \min(25, -10)) = 1$
- `deckSize: 0` $\rightarrow 0 \text{ is falsy} \rightarrow 0 \parallel 12 = 12 \rightarrow \max(1, \min(25, 12)) = 12$
- `deckSize: 1` $\rightarrow \max(1, \min(25, 1)) = 1$
- `deckSize: 3` $\rightarrow \max(1, \min(25, 3)) = 3$
- `deckSize: 25` $\rightarrow \max(1, \min(25, 25)) = 25$
- `deckSize: 100` $\rightarrow \max(1, \min(25, 100)) = 25$
- `deckSize: "invalid"` $\rightarrow Number("invalid") = \text{NaN} \rightarrow \text{NaN} \parallel 12 = 12 \rightarrow 12$
- `deckSize: undefined` $\rightarrow \text{NaN} \parallel 12 = 12 \rightarrow 12$
- `deckSize: 4.8` $\rightarrow \text{Math.floor}(4.8) = 4$

#### Application Points in `server/models/RoomStore.js`
1. **In `createRoom`**: Apply to `room.settings.deckSize`.
2. **In `updateSettings`**: Apply when `key === 'deckSize'`.
3. **In `getDeckForRoom`**: Apply at function entry to sanitize any ad-hoc settings passed to deck generation.

---

### 3.2 Promoted Card Placement Strategy (`getDeckForRoom`)

We define the requirement invariant:
$$\text{Let } k = \min(3, \text{deckSize}). \quad \exists i \in [0, k-1] \text{ such that } \text{deck}[i].\text{isPromoted} = \text{true}.$$

#### Algorithm Design
```javascript
// 5. Ensure at least one promoted venue is present within the top min(3, deckSize) positions
const topLimit = Math.min(3, deckSize);
const promotedIdx = candidatePool.findIndex(v => v.isPromoted);

if (promotedIdx >= topLimit) {
  // Case A: Promoted venue exists in candidatePool, but is positioned beyond topLimit (e.g. index 3, 5, 8).
  // Reposition it to index (topLimit - 1).
  const [promotedVenue] = candidatePool.splice(promotedIdx, 1);
  const targetIdx = Math.max(0, topLimit - 1);
  candidatePool.splice(targetIdx, 0, promotedVenue);
} else if (promotedIdx === -1) {
  // Case B: No promoted venue exists in candidatePool.
  // Find a promoted venue from allVenues (prefer matching category).
  const promotedVenue =
    allVenues.find(v => v.category === category && v.isPromoted) ||
    allVenues.find(v => v.isPromoted);
  if (promotedVenue) {
    const insertIdx = Math.max(0, Math.min(topLimit - 1, candidatePool.length));
    candidatePool.splice(insertIdx, 0, promotedVenue);
  }
}
// Case C: promotedIdx >= 0 && promotedIdx < topLimit.
// Already in top min(3, deckSize) positions. No modification required.

return candidatePool.slice(0, deckSize);
```

#### Mathematical Proof of Correctness
1. **For `deckSize = 1`**:
   - `topLimit = \min(3, 1) = 1`.
   - `targetIdx = \max(0, 1 - 1) = 0`.
   - If promoted venue exists at index $\ge 1$, it is moved to index `0`.
   - If none exists, promoted venue is inserted at index `0`.
   - If already at index `0`, it remains at index `0`.
   - `candidatePool.slice(0, 1)` yields `[promotedVenue]`. Card count is 1, and `deck[0].isPromoted === true`.
2. **For `deckSize = 2`**:
   - `topLimit = \min(3, 2) = 2`.
   - `targetIdx = 1`.
   - If promoted venue is at index $\ge 2$, it is moved to index `1`.
   - If none exists, it is inserted at index `1`.
   - If already at index 0 or 1, it remains in place.
   - `candidatePool.slice(0, 2)` yields 2 cards, with promoted card at index 0 or 1.
3. **For `deckSize = 3`**:
   - `topLimit = \min(3, 3) = 3`.
   - `targetIdx = 2`.
   - If promoted venue was at index 3 or index 5, it is spliced and moved to index `2`.
   - `candidatePool.slice(0, 3)` yields 3 cards, with promoted card guaranteed at index 2 (or 0/1 if already earlier).
   - Zero-card promoted starvation is eliminated.
4. **For $deckSize \ge 4$ (e.g. 12, 25)**:
   - `topLimit = \min(3, deckSize) = 3`.
   - `targetIdx = 2`.
   - Any promoted venue beyond index 2 is moved to index 2 (the 3rd card in the swipe deck).
   - The user sees cards 1 and 2, and card 3 is the sponsored card.
   - Guaranteed affiliate exposure within the first 3 swipes!

#### Invariant Verification
- **No card duplication**: When `promotedIdx >= topLimit`, `candidatePool.splice(promotedIdx, 1)` removes the item before `splice(targetIdx, 0, promotedVenue)` re-inserts it. Total pool length is unchanged, and all card IDs remain distinct.
- **Card preservation**: When moving to `targetIdx`, existing elements shift right by one index without truncation until `.slice(0, deckSize)` is called.

---

## 4. Code Fix Specification (Target: `server/models/RoomStore.js`)

The implementer must apply the following edits to `server/models/RoomStore.js`:

### 4.1 Edit 1: Helper Definition or Sanitization in `createRoom`
**File**: `server/models/RoomStore.js`  
**Location**: Line 99

#### Before:
```javascript
      settings: {
        groupType: groupType || 'friends',
        activityCategory: activityCategory || 'dining',
        cuisinePreferences: Array.isArray(cuisinePreferences) ? cuisinePreferences : [],
        priceRange: Array.isArray(priceRange) && priceRange.length > 0 ? priceRange : [1, 2, 3],
        distance: distance || 'walkable',
        deckSize: Number(deckSize) || CONFIG.DEFAULT_DECK_SIZE,
        tieBreakerType: tieBreakerType || 'wheel',
      },
```

#### After:
```javascript
      settings: {
        groupType: groupType || 'friends',
        activityCategory: activityCategory || 'dining',
        cuisinePreferences: Array.isArray(cuisinePreferences) ? cuisinePreferences : [],
        priceRange: Array.isArray(priceRange) && priceRange.length > 0 ? priceRange : [1, 2, 3],
        distance: distance || 'walkable',
        deckSize: Math.floor(Math.max(1, Math.min(25, Number(deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12))),
        tieBreakerType: tieBreakerType || 'wheel',
      },
```

---

### 4.2 Edit 2: Sanitization in `updateSettings`
**File**: `server/models/RoomStore.js`  
**Location**: Lines 324–328

#### Before:
```javascript
    for (const key of allowedKeys) {
      if (newSettings[key] !== undefined) {
        room.settings[key] = newSettings[key];
      }
    }
```

#### After:
```javascript
    for (const key of allowedKeys) {
      if (newSettings[key] !== undefined) {
        if (key === 'deckSize') {
          room.settings.deckSize = Math.floor(
            Math.max(1, Math.min(25, Number(newSettings.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12))
          );
        } else {
          room.settings[key] = newSettings[key];
        }
      }
    }
```

---

### 4.3 Edit 3: Sanitization & Promoted Placement in `getDeckForRoom`
**File**: `server/models/RoomStore.js`  
**Location**: Lines 354 and Lines 410–420

#### Before:
```javascript
    const deckSize = Number(settings.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12;
...
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

#### After:
```javascript
    const deckSize = Math.floor(Math.max(1, Math.min(25, Number(settings.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12)));
...
    // 5. Ensure at least one promoted venue is present within the top min(3, deckSize) positions (R4 monetization requirement)
    const topLimit = Math.min(3, deckSize);
    const promotedIdx = candidatePool.findIndex(v => v.isPromoted);

    if (promotedIdx >= topLimit) {
      // Promoted venue exists in pool but is outside top min(3, deckSize)
      const [promotedVenue] = candidatePool.splice(promotedIdx, 1);
      const targetIdx = Math.max(0, topLimit - 1);
      candidatePool.splice(targetIdx, 0, promotedVenue);
    } else if (promotedIdx === -1) {
      // No promoted venue in pool; find from allVenues (prefer matching category)
      const promotedVenue =
        allVenues.find(v => v.category === category && v.isPromoted) ||
        allVenues.find(v => v.isPromoted);
      if (promotedVenue) {
        const insertIdx = Math.max(0, Math.min(topLimit - 1, candidatePool.length));
        candidatePool.splice(insertIdx, 0, promotedVenue);
      }
    }

    return candidatePool.slice(0, deckSize);
```

---

## 5. Transitioning Adversarial Tests to Regression Assertions

When the fixes are implemented in `RoomStore.js`, the adversarial test file `tests/tier2-boundaries/m2-adversarial-security.test.js` authored by Challenger 2 will fail because it originally asserted the bug conditions. The implementer must update the test assertions to verify the remediated behaviors:

### 5.1 Negative Deck Size Update (`m2-adversarial-security.test.js`, lines 728–729)
#### Before:
```javascript
      expect(startResNeg.status).toBe(200);
      // Empirically demonstrates the negative deckSize truncation bug:
      expect(startResNeg.body.deck.length).toBe(0);
```
#### After:
```javascript
      expect(startResNeg.status).toBe(200);
      // Remediated: negative deckSize is sanitized to minimum 1 card
      expect(startResNeg.body.deck.length).toBe(1);
      expect(startResNeg.body.deck[0].isPromoted).toBe(true);
```

### 5.2 Activities Promoted Card Placement Update (`m2-adversarial-security.test.js`, lines 771–774)
#### Before:
```javascript
      const actPromotedIdx = actDeck.findIndex(v => v.isPromoted);
      // Because Step 4 backfill from allVenues appends venue-sp-001 at index 8,
      // Step 5 (!hasPromoted) sees hasPromoted === true and does NOT place it in top 3!
      expect(actPromotedIdx).toBe(8); // Empirically proves promoted card is NOT placed in top 3
```
#### After:
```javascript
      const actPromotedIdx = actDeck.findIndex(v => v.isPromoted);
      // Remediated: promoted card is guaranteed positioned in top 3 positions
      expect(actPromotedIdx).toBeLessThan(3);
      expect(actPromotedIdx).toBe(2);
```

### 5.3 Dining Promoted Card Placement Update (`m2-adversarial-security.test.js`, line 796)
#### Before:
```javascript
      const dinPromotedIdx = dinDeck.findIndex(v => v.isPromoted);
      expect(dinPromotedIdx).toBe(5); // At index 5
```
#### After:
```javascript
      const dinPromotedIdx = dinDeck.findIndex(v => v.isPromoted);
      // Remediated: venue-sp-002 repositioned from index 5 to index 2 (top 3)
      expect(dinPromotedIdx).toBeLessThan(3);
      expect(dinPromotedIdx).toBe(2);
```

### 5.4 Small Deck Starvation Update (`m2-adversarial-security.test.js`, lines 816–820)
#### Before:
```javascript
      expect(smallDeck.length).toBe(3);
      // Empirically proves the bug: 3-card deck has 0 promoted cards despite worker claim of guaranteed promoted card in top 3!
      const smallHasPromoted = smallDeck.some(v => v.isPromoted);
      expect(smallHasPromoted).toBe(false);
```
#### After:
```javascript
      expect(smallDeck.length).toBe(3);
      // Remediated: promoted card starvation eliminated; guaranteed promoted card in top 3
      const smallHasPromoted = smallDeck.some(v => v.isPromoted);
      expect(smallHasPromoted).toBe(true);
      const smallPromotedIdx = smallDeck.findIndex(v => v.isPromoted);
      expect(smallPromotedIdx).toBeLessThan(3);
```

---

## 6. Regression Test Specification

The implementer should add the following dedicated regression test suite (e.g. in `tests/tier2-boundaries/m2-deck-and-promoted-remediation.test.js` or integrated into `tests/tier2-boundaries/boundary-cases.test.js`):

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('M2 Regression: Deck Size Sanitization & Promoted Card Top 3 Guarantee', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  describe('Deck Size Sanitization Matrix', () => {
    it.each([
      [-10, 1],
      [-1, 1],
      [0, 12],
      [1, 1],
      [3, 3],
      [12, 12],
      [25, 25],
      [50, 25],
      [100, 25],
      ['invalid', 12],
      [null, 12],
      [undefined, 12],
    ])('sanitizes deckSize %s to %i on POST /api/rooms', async (inputVal, expectedDeckSize) => {
      const res = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'SanitizeHost', deckSize: inputVal });

      expect(res.status).toBe(201);
      expect(res.body.room.settings.deckSize).toBe(expectedDeckSize);

      const startRes = await request(app)
        .post(`/api/rooms/${res.body.room.code}/start`)
        .set('x-session-token', res.body.sessionToken)
        .send({ participantId: res.body.participant.id });

      expect(startRes.status).toBe(200);
      expect(startRes.body.deck.length).toBe(expectedDeckSize);
    });

    it('sanitizes deckSize mutations on PATCH /api/rooms/:code/settings', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'HostSettings' });
      const code = createRes.body.room.code;
      const hostToken = createRes.body.sessionToken;
      const hostId = createRes.body.participant.id;

      // Negative update
      const patchNeg = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, settings: { deckSize: -99 } });
      expect(patchNeg.status).toBe(200);
      expect(patchNeg.body.settings.deckSize).toBe(1);

      // Oversized update
      const patchHuge = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, settings: { deckSize: 999 } });
      expect(patchHuge.status).toBe(200);
      expect(patchHuge.body.settings.deckSize).toBe(25);

      // Zero update (falls back to default 12)
      const patchZero = await request(app)
        .patch(`/api/rooms/${code}/settings`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, settings: { deckSize: 0 } });
      expect(patchZero.status).toBe(200);
      expect(patchZero.body.settings.deckSize).toBe(12);
    });

    it('floors fractional deckSize values', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'FractionHost', deckSize: 4.8 });
      expect(res.status).toBe(201);
      expect(res.body.room.settings.deckSize).toBe(4);
    });
  });

  describe('Promoted Card Top min(3, deckSize) Guarantee', () => {
    it.each([
      [1, 1],
      [2, 2],
      [3, 3],
      [5, 3],
      [12, 3],
      [25, 3],
    ])('guarantees promoted card within top %i cards for deckSize %i', async (deckSize, maxExpectedIndex) => {
      const res = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'PlacementHost', activityCategory: 'dining', deckSize });
      const code = res.body.room.code;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', res.body.sessionToken)
        .send({ participantId: res.body.participant.id });

      expect(startRes.status).toBe(200);
      const deck = startRes.body.deck;
      expect(deck.length).toBe(deckSize);

      const promotedIdx = deck.findIndex(v => v.isPromoted);
      expect(promotedIdx).toBeGreaterThanOrEqual(0);
      expect(promotedIdx).toBeLessThan(maxExpectedIndex);
      expect(deck[promotedIdx].sponsorBadge).toBeDefined();
    });

    it('guarantees promoted card in top 3 across all categories', async () => {
      const categories = ['dining', 'bars', 'activities', 'entertainment', 'all'];

      for (const cat of categories) {
        const res = await request(app)
          .post('/api/rooms')
          .send({ hostName: 'CatHost', activityCategory: cat, deckSize: 12 });
        const code = res.body.room.code;

        const startRes = await request(app)
          .post(`/api/rooms/${code}/start`)
          .set('x-session-token', res.body.sessionToken)
          .send({ participantId: res.body.participant.id });

        expect(startRes.status).toBe(200);
        const deck = startRes.body.deck;
        expect(deck.length).toBe(12);

        const promotedIdx = deck.findIndex(v => v.isPromoted);
        expect(promotedIdx).toBeGreaterThanOrEqual(0);
        expect(promotedIdx).toBeLessThan(3);

        // Verify card uniqueness (no duplicates caused by splice/insert)
        const uniqueIds = new Set(deck.map(v => v.id));
        expect(uniqueIds.size).toBe(deck.length);
      }
    });

    it('prevents promoted card starvation when deckSize is 3 in dining category', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'Dining3Host', activityCategory: 'dining', deckSize: 3 });
      const code = res.body.room.code;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', res.body.sessionToken)
        .send({ participantId: res.body.participant.id });

      expect(startRes.status).toBe(200);
      const deck = startRes.body.deck;
      expect(deck.length).toBe(3);
      expect(deck.some(v => v.isPromoted)).toBe(true);
      expect(deck.some(v => v.id === 'venue-sp-002')).toBe(true);
    });
  });
});
```

---

## 7. Verification Method

Once the implementer applies the changes:

1. **Verify Adversarial Suite**:
   ```powershell
   npx vitest run tests/tier2-boundaries/m2-adversarial-security.test.js
   ```
   *Expected Result*: All 22 tests pass (with updated assertions reflecting remediated behavior).

2. **Verify Full Project Test Suite**:
   ```powershell
   npm test
   ```
   *Expected Result*: 5 test files passed, 100% pass rate, sub-3-second run time.

3. **Verify Production Build**:
   ```powershell
   npm run build
   ```
   *Expected Result*: Exit code 0, 0 build warnings or syntax errors.
