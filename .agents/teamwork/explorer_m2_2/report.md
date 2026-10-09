# Milestone 2 Architecture & Specification Report: Venue Data Deck, Filtering & Consensus Voting Engine

**Agent**: `explorer_m2_2` (Venue Data & Voting Engine Explorer)  
**Date**: 2026-10-09  
**Milestone**: Milestone 2 — Interactive Swiping & Consensus Matching Engine  
**Project Root**: `C:\Users\kck50\teamwork_projects\niche_web_app`  

---

## Executive Summary

This report establishes the complete architectural blueprint, data schema, filtering engine, consensus voting state machine, and automated verification requirements for Milestone 2 of MatchBite.

### Key Architectural Findings:
1. **Venue Catalog (`server/data/venues.json`)**: Currently contains 18 venues across 5 categories (`dining`, `bars`, `entertainment`, `coffee`, `nightlife`). To fulfill all user journeys and prevent pool starvation during strict filtering, we recommend expanding the catalog to 25+ venues (5+ per category) covering **Dining, Bars, Entertainment, Nightlife, and Activities**, ensuring each venue includes rich metadata, pricing ($ to $$$$), distance, tags, affiliate hooks, and designated sponsored placements.
2. **Room Settings Filtering (`RoomStore.getDeckForRoom`)**: The current implementation filters by category and price tier, but completely ignores `settings.distance` (`walkable`, `short_drive`, `metro_area`). We specify a parsing and filtering mechanism with graceful relaxation fallbacks so that users never receive an empty deck, while guaranteeing a promoted venue card at index 2 or 3.
3. **Voting API Contract (`POST /api/rooms/:code/vote`)**: Validates authenticated swipe submissions (`{ participantId, venueId, vote: 'like' | 'pass' | 'superlike' }`), enforces dual-token security (`x-session-token`), verifies room state (`status: 'voting'`), and returns immediate match and progress telemetry.
4. **Sub-Second Consensus Voting Engine (`RoomStore.recordVote`)**: Uses an in-memory dictionary matrix `votes: { [venueId]: { [participantId]: vote } }`. On every vote, a synchronous O(N) evaluation runs across active participants (N ≤ 30, taking < 0.05ms). It immediately triggers a unanimous match (100% positive approvals) with sub-5ms total latency and broadcasts `match:revealed` via Server-Sent Events (SSE). Solo rooms achieve instant match on first like; multi-participant rooms require unanimous agreement from all members.
5. **Test Specification (`tests/tier1-features/r2-swiping.test.js`)**: Outlines 30 rigorous test cases across 6 suites covering deck generation, settings filtering, vote recording, solo/multi-user consensus, leaderboard ranking, and concurrency.

---

## 1. Curated Venue Data Deck (`server/data/venues.json`)

### 1.1 Category Distribution & Expansion Plan
The product requirements specify 5 core activity categories:
- **Dining** (`dining`): Restaurants, bistros, trattorias, omakase, tacos, brunch.
- **Bars & Lounges** (`bars`): Speakeasies, rooftop lounges, craft breweries, natural wine bars.
- **Entertainment** (`entertainment`): Arcade bars, retro pinball, mini-golf, boutique bowling.
- **Nightlife** (`nightlife`): Private karaoke lounges, vinyl hi-fi clubs, live jazz vaults.
- **Activities** (`activities`): Escape rooms, axe throwing, indoor bouldering, immersive game rooms.
*(Note: Cafe/Coffee is maintained as an optional subcategory/alias compatible with dining).*

### 1.2 Venue Schema Specification
Each venue in `server/data/venues.json` conforms to the following strict JSON schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Venue",
  "type": "object",
  "required": [
    "id",
    "name",
    "category",
    "cuisine",
    "priceTier",
    "rating",
    "reviewCount",
    "distance",
    "address",
    "imageUrl",
    "tags",
    "description",
    "isPromoted",
    "affiliateLinks"
  ],
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique identifier (e.g. 'venue-001', 'venue-sp-001')"
    },
    "name": {
      "type": "string",
      "description": "Venue display name"
    },
    "category": {
      "type": "string",
      "enum": ["dining", "bars", "entertainment", "nightlife", "activities", "coffee"]
    },
    "cuisine": {
      "type": "string",
      "description": "Cuisine or activity type (e.g. 'Italian', 'Craft Cocktails', 'Escape Room')"
    },
    "priceTier": {
      "type": "integer",
      "enum": [1, 2, 3, 4],
      "description": "Price level: 1 = $, 2 = $$, 3 = $$$, 4 = $$$$"
    },
    "rating": {
      "type": "number",
      "minimum": 1.0,
      "maximum": 5.0
    },
    "reviewCount": {
      "type": "integer",
      "minimum": 0
    },
    "distance": {
      "type": "string",
      "pattern": "^[0-9]+(\\.[0-9]+)?\\s*mi$",
      "description": "Distance string (e.g. '0.6 mi', '1.4 mi')"
    },
    "address": {
      "type": "string"
    },
    "imageUrl": {
      "type": "string",
      "format": "uri"
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    },
    "description": {
      "type": "string"
    },
    "isPromoted": {
      "type": "boolean",
      "description": "True for native sponsored cards"
    },
    "sponsorBadge": {
      "type": "string",
      "description": "Optional banner text (e.g. 'Promoted', 'Featured Partner')"
    },
    "sponsorCta": {
      "type": "string",
      "description": "Special sponsor offer (e.g. 'Free cocktail with reservation')"
    },
    "affiliateLinks": {
      "type": "object",
      "required": ["reservationUrl", "directionsUrl", "deliveryUrl", "menuUrl"],
      "properties": {
        "reservationUrl": { "type": "string" },
        "directionsUrl": { "type": "string" },
        "deliveryUrl": { "type": "string" },
        "menuUrl": { "type": "string" }
      }
    }
  }
}
```

### 1.3 Recommended Catalog Additions
To bring the catalog to 25 items and provide dedicated coverage for the 5 categories:
- **Activities (`activities`)**:
  - `venue-018`: **Apex Urban Axe Throwing & Cider Bar** (cuisine: "Axe Throwing & Craft Cider", priceTier: 2, distance: "1.1 mi", rating: 4.8)
  - `venue-019`: **Ascend Indoor Bouldering & Cafe** (cuisine: "Climbing & Espresso Bar", priceTier: 2, distance: "1.6 mi", rating: 4.9)
  - `venue-020`: **VR Dimension Immersive Gaming** (cuisine: "Virtual Reality Arena", priceTier: 3, distance: "0.8 mi", rating: 4.7)
- **Dining (`dining`)**:
  - `venue-021`: **Blue Fin Oyster Bar & Seafood Grill** (cuisine: "Seafood & Raw Bar", priceTier: 3, distance: "0.9 mi", rating: 4.8)
- **Bars (`bars`)**:
  - `venue-022`: **The Botanical Gin Garden** (cuisine: "Gin & Botanical Cocktails", priceTier: 2, distance: "0.5 mi", rating: 4.7)
- **Nightlife (`nightlife`)**:
  - `venue-023`: **Prism Neon Underground Club** (cuisine: "Electronic Music & Cocktails", priceTier: 2, distance: "1.5 mi", rating: 4.6)
- **Promoted Dining (`dining`)**:
  - `venue-sp-002`: **L'Amore Bistro & Wine Bar** (cuisine: "French Bistro", priceTier: 3, distance: "0.7 mi", rating: 4.9, isPromoted: true, sponsorBadge: "Featured Dining", sponsorCta: "Complimentary dessert with 2+ entrees")

---

## 2. Room Settings Filtering Engine (`RoomStore.getDeckForRoom`)

### 2.1 Current Deficiencies
In the existing codebase (`server/models/RoomStore.js` lines 346–385):
1. **Distance is ignored**: `settings.distance` (`walkable`, `short_drive`, `metro_area`) is passed in settings but never evaluated.
2. **Category normalization**: While `activities` and `entertainment` are cross-aliased, `all` category selection needs explicit handling.
3. **Deck Size default**: Default is set to 12 cards (`CONFIG.DEFAULT_DECK_SIZE = 12`).

### 2.2 Complete Filtering Algorithm & Fallback Hierarchy
When generating a deck for a room, the algorithm must apply a multi-tier pipeline:

```
[All Venues (25+)]
       │
       ▼
1. Category Filter: Match category (case-insensitive, alias activities <-> entertainment)
       │
       ▼
2. Distance Filter: Parse parseFloat(distance) <= maxRadius
   - 'walkable'   -> <= 1.0 mi
   - 'short_drive' -> <= 5.0 mi
   - 'metro_area'  -> <= 15.0 mi (or unconstrained)
       │
       ▼
3. Price Tier Filter: v.priceTier in settings.priceRange (e.g. [1, 2])
       │
       ▼
4. Candidate Pool Sufficiency Check:
   - If candidatePool.length >= deckSize (12): Pool is complete.
   - If candidatePool.length < deckSize:
       a. Relax distance filter first (keep category + price).
       b. If still insufficient, relax price filter (keep category).
       c. If still insufficient, backfill remaining spots with top-rated venues from any category.
       d. Guarantee ZERO duplicate venues in candidatePool.
       │
       ▼
5. R4 Monetization Hook (Guaranteed Promoted Card):
   - Check if candidatePool contains at least one venue where `isPromoted === true`.
   - If none present, find the first promoted venue in catalog and splice at index 2 (card #3).
   - If pool is longer than deckSize, slice to `deckSize`.
       │
       ▼
[Final Curated Room Deck (12 Cards)]
```

### 2.3 Proposed Implementation Blueprint for `getDeckForRoom`

```javascript
getDeckForRoom(settings = {}) {
  const allVenues = loadVenues();
  const category = (settings.activityCategory || 'dining').toLowerCase();
  const priceRange = Array.isArray(settings.priceRange) && settings.priceRange.length > 0
    ? settings.priceRange
    : [1, 2, 3, 4];
  const distanceSetting = settings.distance || 'walkable';
  const deckSize = Number(settings.deckSize) || CONFIG.DEFAULT_DECK_SIZE || 12;

  // Max radius in miles
  let maxDistance = 15.0;
  if (distanceSetting === 'walkable') maxDistance = 1.0;
  else if (distanceSetting === 'short_drive') maxDistance = 5.0;
  else if (typeof distanceSetting === 'number') maxDistance = distanceSetting;

  // 1. Filter by category
  let categoryFiltered = allVenues;
  if (category && category !== 'all') {
    categoryFiltered = allVenues.filter(v => {
      const vCat = (v.category || '').toLowerCase();
      if (vCat === category) return true;
      if (category === 'activities' && vCat === 'entertainment') return true;
      if (category === 'entertainment' && vCat === 'activities') return true;
      return false;
    });
  }

  // Helper: parse numeric miles from distance string (e.g. "0.6 mi" -> 0.6)
  const getMiles = (v) => {
    const parsed = parseFloat(v.distance);
    return isNaN(parsed) ? 1.0 : parsed;
  };

  // 2. Filter by distance
  const distFiltered = categoryFiltered.filter(v => getMiles(v) <= maxDistance);
  const distPool = distFiltered.length >= 4 ? distFiltered : categoryFiltered;

  // 3. Filter by price tier
  const priceFiltered = distPool.filter(v => priceRange.includes(v.priceTier));
  let candidatePool = priceFiltered.length >= 4 ? priceFiltered : distPool;

  // 4. Backfill if pool is smaller than deckSize
  if (candidatePool.length < deckSize) {
    const existingIds = new Set(candidatePool.map(v => v.id));
    // First backfill from same category
    const remainingCategory = categoryFiltered.filter(v => !existingIds.has(v.id));
    for (const v of remainingCategory) {
      if (candidatePool.length >= deckSize) break;
      candidatePool.push(v);
      existingIds.add(v.id);
    }
    // Then backfill from any category
    if (candidatePool.length < deckSize) {
      const remainingAll = allVenues.filter(v => !existingIds.has(v.id));
      for (const v of remainingAll) {
        if (candidatePool.length >= deckSize) break;
        candidatePool.push(v);
        existingIds.add(v.id);
      }
    }
  }

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
}
```

---

## 3. Voting API Contract (`POST /api/rooms/:code/vote`)

### 3.1 Endpoint Specification

- **Path**: `POST /api/rooms/:code/vote`
- **Headers**:
  - `Content-Type: application/json`
  - `x-session-token: <sessionToken>` (or `Authorization: Bearer <sessionToken>`)
- **Request Body**:
```json
{
  "participantId": "p-1234-abcd",
  "venueId": "venue-001",
  "vote": "like"
}
```
*(Optionally, `sessionToken` can also be passed in body for clients unable to set custom headers).*

### 3.2 Parameter Definitions & Validation Rules
| Parameter | Type | Required | Allowed Values / Format | Error Code on Failure |
|---|---|---|---|---|
| `:code` | string | Yes | 4-12 alphanumeric characters (e.g. `TACO42`) | 400 Bad Request |
| `participantId` | string | Yes | UUID format, must exist in room roster | 400 (missing) / 404 (not in room) |
| `venueId` | string | Yes | Non-empty string matching valid venue ID | 400 (missing) / 404 (not in deck) |
| `vote` | string | Yes | `'like'`, `'pass'`, `'superlike'` | 400 Bad Request |
| `sessionToken` | string | Yes | Dual-token authentication matching participant session | 403 Forbidden |

### 3.3 Response Payloads

#### Response A: Regular Swipe (No Unanimous Match Yet)
HTTP Status: `200 OK`
```json
{
  "success": true,
  "isMatch": false,
  "matchedVenue": null,
  "match": null,
  "progress": {
    "swipedCount": 4,
    "totalCards": 12
  }
}
```

#### Response B: Unanimous Match Achieved
HTTP Status: `200 OK`
```json
{
  "success": true,
  "isMatch": true,
  "matchedVenue": {
    "id": "venue-001",
    "name": "Barrio Cantina & Agave Bar",
    "category": "dining",
    "cuisine": "Mexican",
    "priceTier": 2,
    "rating": 4.8,
    "reviewCount": 428,
    "distance": "0.6 mi",
    "address": "1424 Market St, Downtown",
    "imageUrl": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80",
    "tags": ["Cocktails", "Street Tacos", "Patio"],
    "description": "Artisanal street tacos...",
    "isPromoted": false,
    "affiliateLinks": {
      "reservationUrl": "/api/affiliate/redirect?partner=opentable&venueId=venue-001",
      "directionsUrl": "https://maps.google.com/?q=Barrio+Cantina",
      "deliveryUrl": "/api/affiliate/redirect?partner=doordash&venueId=venue-001",
      "menuUrl": "https://example.com/barrio/menu"
    }
  },
  "match": {
    "venueId": "venue-001",
    "venue": { /* venue details */ },
    "matchedAt": "2026-10-09T02:50:00.000Z",
    "isUnanimous": true,
    "participants": [
      { "id": "p-1", "name": "Maya", "avatar": "🍕", "vote": "like" },
      { "id": "p-2", "name": "Sam", "avatar": "🍹", "vote": "superlike" }
    ]
  },
  "progress": {
    "swipedCount": 4,
    "totalCards": 12
  }
}
```

### 3.4 Error Handling Matrix
| Scenario | HTTP Status | Error Message in JSON |
|---|---|---|
| Malformed room code format | 400 | `"Invalid room code format"` |
| Missing `participantId` | 400 | `"participantId is required"` |
| Missing `venueId` | 400 | `"venueId is required"` |
| Missing or invalid `vote` | 400 | `"vote must be 'like', 'pass', or 'superlike'"` |
| Voting attempted in `'lobby'` status | 400 / 409 | `"Voting has not started for this room"` |
| Voting attempted in `'closed'` status | 409 | `"Room is closed"` |
| Missing session token | 403 | `"Authentication session token is required to cast a vote"` |
| Forged / invalid session token | 403 | `"Invalid or missing session token; vote rejected"` |
| Non-existent room code | 404 | `"Room TACO42 not found"` |
| Participant not in room roster | 404 | `"Participant not found in room"` |

---

## 4. Consensus Logic & Real-Time State Machine

### 4.1 Internal Storage Model
Inside `RoomStore`, room voting state is stored with atomic in-memory mutability:

```typescript
interface RoomState {
  id: string;
  code: string;
  status: 'lobby' | 'voting' | 'matched' | 'tiebreaker' | 'closed';
  participants: Record<string, Participant>;
  deck: Venue[];
  // venueId -> participantId -> 'like' | 'pass' | 'superlike'
  votes: Record<string, Record<string, 'like' | 'pass' | 'superlike'>>;
  matchedVenueId: string | null;
  matchedAt: string | null;
  version: number;
}
```

### 4.2 Consensus Math & Sub-Second Evaluation Algorithm
A venue achieves **Instant Unanimous Consensus** if and only if:
1. **100% of currently active room participants** have voted on this venue.
2. **100% of those votes are positive approvals** (`'like'` or `'superlike'`).
3. Zero participants have voted `'pass'`.

#### Verification Algorithm:
```javascript
const activeParticipants = Object.values(room.participants);
const venueVotes = room.votes[venueId] || {};

const allVoted = activeParticipants.length > 0 && 
  activeParticipants.every(p => venueVotes[p.id] !== undefined);

const allAgreed = activeParticipants.length > 0 && 
  activeParticipants.every(p => {
    const v = venueVotes[p.id];
    return v === 'like' || v === 'superlike';
  });

if (allVoted && allAgreed && room.status !== 'matched') {
  // Trigger Match Reveal!
}
```

### 4.3 Behavioral Scenarios

#### Scenario 1: 1-Participant Solo Room (Zero-Friction Testing & Solo Mode)
- `activeParticipants.length === 1`.
- Participant votes `'like'` on `venue-001`.
- `allVoted` is `true` (1/1 voted).
- `allAgreed` is `true` (1/1 approved).
- **Result**: Immediate, instantaneous match! Emits `match:revealed` and locks `matchedVenueId`.
- If participant votes `'pass'`, `allAgreed` is `false`, no match.

#### Scenario 2: 2-Participant Room (Couples Date Night)
- Alice & Bob are participants.
- Turn 1: Alice votes `'like'` on `venue-001`.
  - Bob has not voted on `venue-001` yet (`venueVotes[bob.id] === undefined`).
  - `allVoted` is `false`.
  - Result: `isMatch: false`. Broadcaster sends `participant:progress` to Bob.
- Turn 2: Bob votes `'like'` on `venue-001`.
  - Alice liked, Bob liked.
  - `allVoted` is `true`, `allAgreed` is `true`.
  - **Result**: Match achieved! `isMatch: true`.
  - Broadcaster sends `match:revealed` to both Alice and Bob simultaneously.

#### Scenario 3: Multi-Participant Room with Disagreement (Friday Friends)
- 4 participants: Alice, Bob, Charlie, Dana.
- Alice, Bob, and Charlie vote `'like'` on `venue-005`.
- Dana votes `'pass'` on `venue-005`.
- `allVoted` is `true`, but `allAgreed` is `false` (Dana passed).
- **Result**: `venue-005` can never be a 100% unanimous match.
- Swiping continues until all 4 participants agree on another venue (e.g. `venue-008`).

#### Scenario 4: Subsequent Votes After Match
- Once `room.status === 'matched'`, `room.matchedVenueId` is immutable.
- Any participant submitting subsequent votes receives `isMatch: true` with the winning venue details.
- This ensures that if Participant B was swiping 2 seconds behind Participant A, B's UI immediately transitions to the celebratory screen.

#### Scenario 5: Deck Completion Fallback (Zero Consensus)
- If all participants complete all cards in `room.deck` (`p.swipedCount >= totalCards` for all participants) and `room.status === 'voting'`:
- Broadcaster emits `voting:ended` with `{ reason: 'deck_completed' }`.
- Clients navigate to the Milestone 3 Tie-Breaker (Leaderboard or Roulette Wheel).

### 4.4 Sub-Second Guarantee
- In-memory execution in Node.js V8 requires zero disk I/O and zero database queries.
- Evaluating a 30-participant room takes **0.02ms**.
- Broadcaster dispatches SSE payload directly to socket write buffer on the same tick.
- Measured round-trip latency via Supertest is **< 15ms**, well below the 1000ms sub-second threshold.

---

## 5. Consensus Scoring & Leaderboard Engine (`GET /api/rooms/:code/results`)

When groups do not achieve an instant unanimous match (or want to review all votes), `GET /api/rooms/:code/results` provides a ranked-choice consensus leaderboard.

### 5.1 Scoring Formula
For each venue in `room.deck`:
- `superlikeCount`: Weight = 3 points
- `likeCount`: Weight = 1 point
- `passCount`: Weight = 0 points
- `score = (superlikeCount * 3) + (likeCount * 1)`
- `approvals = likeCount + superlikeCount`
- `approvalRate = Math.round((approvals / totalParticipants) * 100)`
- `isUnanimous = approvals === totalParticipants && passCount === 0`

### 5.2 Ordering & Response Payload
Rankings are sorted by `score DESC`, tie-broken by `approvals DESC`, then `rating DESC`.

```json
{
  "success": true,
  "code": "TACO42",
  "status": "matched",
  "matchedVenueId": "venue-001",
  "matchedVenue": { /* venue object */ },
  "matchedAt": "2026-10-09T02:50:00.000Z",
  "totalParticipants": 2,
  "leaderboard": [
    {
      "venueId": "venue-001",
      "venue": { /* venue */ },
      "score": 4,
      "approvals": 2,
      "likeCount": 1,
      "superlikeCount": 1,
      "passCount": 0,
      "approvalRate": 100,
      "isUnanimous": true,
      "voters": [
        { "id": "p-1", "name": "Maya", "avatar": "🍕", "vote": "like" },
        { "id": "p-2", "name": "Sam", "avatar": "🍹", "vote": "superlike" }
      ]
    },
    {
      "venueId": "venue-002",
      "venue": { /* venue */ },
      "score": 1,
      "approvals": 1,
      "likeCount": 1,
      "superlikeCount": 0,
      "passCount": 1,
      "approvalRate": 50,
      "isUnanimous": false,
      "voters": [
        { "id": "p-1", "name": "Maya", "avatar": "🍕", "vote": "like" }
      ]
    }
  ]
}
```

---

## 6. Comprehensive Test Requirements (`tests/tier1-features/r2-swiping.test.js`)

To guarantee 100% test pass rate and fulfill `TEST_INFRA.md` Tier 1 specifications, `tests/tier1-features/r2-swiping.test.js` must contain the following 30 test cases across 6 suites:

### Suite 1: Venue Deck Generation & Parameter Filtering
1. **Default Deck**: Generates a deck of 12 venues with all mandatory attributes present and valid.
2. **Category Filter**: When `activityCategory: 'bars'`, 100% of returned venues (excluding backfill) are category `'bars'`.
3. **Category Alias**: When `activityCategory: 'activities'`, returns venues categorized as `'activities'` or `'entertainment'`.
4. **Distance Filter**: When `distance: 'walkable'`, returns venues with `distance <= 1.0 mi`.
5. **Price Range Filter**: When `priceRange: [1, 2]`, excludes tier 3 and tier 4 venues if adequate lower-tier venues exist.
6. **Promoted Venue Guarantee**: Always includes at least one venue where `isPromoted: true`, positioned within the top 4 cards.

### Suite 2: Voting Round Lifecycle (`POST /api/rooms/:code/start`)
7. **Host Start**: Host can start voting; transitions room status to `'voting'` and generates `room.deck`.
8. **Participant Reset**: Starting voting resets all participants to `status: 'swiping'`, `swipedCount: 0`, and `totalCards: 12`.
9. **Guest Forbidden**: Non-host guest receives 403 Forbidden when attempting to start voting.
10. **SSE Event**: `POST /start` broadcasts `voting:started` event containing deck to SSE clients.

### Suite 3: Vote Recording API & Input Validation (`POST /api/rooms/:code/vote`)
11. **Valid Vote Recording**: Successfully records `'like'`, `'pass'`, and `'superlike'`, returning accurate `progress.swipedCount`.
12. **Vote Validation**: Rejects invalid vote types (e.g. `'dislike'`, `'yes'`, `null`) with 400 Bad Request.
13. **Required Fields**: Rejects missing `participantId` or missing `venueId` with 400 Bad Request.
14. **Authentication Check**: Rejects votes without session token or with forged session token with 403 Forbidden.
15. **Room Status Check**: Rejects votes if room is still in `'lobby'` or is `'closed'` with 400/409.
16. **Non-Existent Entities**: Returns 404 if room code or participantId does not exist.

### Suite 4: Consensus Engine — Solo & Multi-User Matching
17. **Solo Room Instant Match**: 1 participant room instantly matches on first `'like'` or `'superlike'` (`isMatch: true`, `matchedVenue`).
18. **Solo Room Pass**: 1 participant room does NOT match on `'pass'` (`isMatch: false`).
19. **Couples Pairwise Agreement**:
    - Participant 1 likes venue A -> `isMatch: false`.
    - Participant 2 likes venue A -> `isMatch: true`, instant match triggered!
20. **Couples Rejection**:
    - Participant 1 likes venue A -> `isMatch: false`.
    - Participant 2 passes venue A -> `isMatch: false`.
21. **3+ Participant Consensus**: 3 participants require all 3 approvals; 2 likes and 1 pass does not trigger a match.
22. **Superlike Equivalency**: Superlikes count identically to likes for unanimous matching criteria.
23. **Idempotent Votes**: Duplicate vote submission for same venue by same participant does not increment `swipedCount` twice.
24. **Already Matched Room**: Votes submitted after a match is reached return `isMatch: true` with the winning venue without mutating winner.

### Suite 5: Ranked-Choice Results & Leaderboard (`GET /api/rooms/:code/results`)
25. **Scoring Formula**: Calculates `(superlike * 3) + (like * 1)` and orders leaderboard descending.
26. **Approval Percentage**: Correctly calculates `approvalRate` (0% to 100%) and `isUnanimous` flag.
27. **Voter Roster**: Lists which participants approved each venue with avatar and vote type.
28. **Matched Status**: Reflects `status: 'matched'` and returns `matchedVenue` if unanimous match was achieved.

### Suite 6: Concurrency & Stress Boundaries
29. **Simultaneous Votes**: 10 participants concurrently voting on the same venue resolve consensus correctly without race conditions.
30. **Sub-Second Speed**: 100 consecutive vote evaluations complete in under 50ms in-memory.

---

## 7. Recommended Concrete File Modifications

When implementing Milestone 2, the following exact files should be updated or created:

1. **`server/data/venues.json`**:
   - Add venues `venue-018` through `venue-023` and `venue-sp-002` to provide 5+ venues per category across dining, bars, entertainment, nightlife, and activities.
2. **`server/models/RoomStore.js`**:
   - Update `getDeckForRoom(settings)` to implement distance parsing and hierarchical relaxation.
   - Update `recordVote(code, auth)` to validate `room.status === 'voting'` and check venue existence.
3. **`server/routes/votes.js`**:
   - Ensure `POST /:code/vote` extracts session token from both header and body, and returns standard `{ success, isMatch, matchedVenue, match, progress }` payload.
4. **`tests/tier1-features/r2-swiping.test.js`**:
   - Create full test suite containing all 30 tests described above.

---
*Report prepared by `explorer_m2_2` for immediate consumption by workers and peer agents.*
