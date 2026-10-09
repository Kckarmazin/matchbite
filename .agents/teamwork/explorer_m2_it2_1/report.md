# Finding 1 Security Investigation: Prototype Pollution & Object Hardening in RoomStore

**Document**: Finding 1 Remediation Analysis & Implementation Specification  
**Author**: Explorer 1 (`explorer_m2_it2_1`)  
**Target Milestone**: Milestone 2 Iteration 2  
**Target Vulnerability**: Finding 1 from Challenger 2 (`challenger_m2_2`) — Prototype Pollution via Unvalidated `venueId: '__proto__'`  
**Date**: 2026-10-09  

---

## 1. Executive Summary

During Milestone 2 verification, Challenger 2 identified a **CRITICAL** prototype pollution vulnerability in `RoomStore.recordVote` (`server/models/RoomStore.js`, lines 552–556). When an authenticated participant submits a vote payload with `venueId: '__proto__'`, the unkeyed object literal `room.votes = {}` evaluates `room.votes['__proto__']` as `Object.prototype`. The subsequent assignment `room.votes[venueId][participantId] = vote` mutates `Object.prototype[participantId] = 'like'`, corrupting the prototype of every ordinary JavaScript object across the entire Node.js runtime process.

This report delivers:
1. **Root cause analysis** of prototype pollution across the V8 runtime in MatchBite's in-memory multi-tenant architecture.
2. **A comprehensive security audit** of all data structures and dictionary maps across `server/models/RoomStore.js`, `server/routes/rooms.js`, `server/routes/votes.js`, and `server/sync/Broadcaster.js`, identifying a secondary prototype vulnerability in `room.participants`.
3. **Comparative analysis of remediation strategies**, establishing why a 4-layer defense-in-depth model (`Object.create(null)` storage + Reserved Property Blacklist + Room Deck Whitelist + Route Boundary Validation) is superior to single-point mitigations or full ES6 Map refactoring.
4. **Exact code fix specifications** for `server/models/RoomStore.js` and `server/routes/votes.js` with before/after line diffs.
5. **A regression test specification**, detailing how to convert Challenger 2's empirical demonstration test into a permanent regression barrier and defining exhaustive edge-case test suites.

---

## 2. Vulnerability Analysis: Finding 1

### 2.1 The Vulnerability Mechanism
In `server/models/RoomStore.js`:
- In `createRoom` (line 108): `votes: {}`
- In `startVoting` (line 468): `room.votes = {}`
- In `recordVote` (lines 552–556):
  ```javascript
  // Record the vote in room.votes map
  if (!room.votes[venueId]) {
    room.votes[venueId] = {};
  }
  room.votes[venueId][participantId] = vote;
  ```

In JavaScript, plain object literals (`{}`) inherit from `Object.prototype`. The accessor property `Object.prototype.__proto__` provides a getter and setter that accesses or mutates an object's prototype.
When `venueId` equals `'__proto__'`:
1. `room.votes['__proto__']` invokes `Object.prototype.__proto__`'s getter, returning `Object.prototype`.
2. Because `Object.prototype` is an object (truthy), `!room.votes[venueId]` evaluates to `false`.
3. Line 553 (`room.votes[venueId] = {}`) is bypassed.
4. Line 555 executes: `room.votes['__proto__'][participantId] = vote`.
5. Because `room.votes['__proto__']` is `Object.prototype`, this statement evaluates directly to:
   ```javascript
   Object.prototype[participantId] = vote;
   ```
6. Every newly instantiated or existing plain object in the Node.js process inherits `[participantId]: vote`.

### 2.2 Empirical Proof of Exploitability
In `tests/tier2-boundaries/m2-adversarial-security.test.js` (lines 206–233), Challenger 2 executed the following proof-of-concept:
```javascript
const resProto = await request(app)
  .post(`/api/rooms/${code}/vote`)
  .set('x-session-token', host.sessionToken)
  .send({
    participantId: host.id,
    venueId: '__proto__',
    vote: 'like',
  });

expect(resProto.status).toBe(200);
expect(Object.prototype[host.id]).toBe('like');
expect(({})[host.id]).toBe('like');
```
This test currently passes in the test suite, verifying that:
- The HTTP endpoint accepts `venueId: '__proto__'` with `200 OK`.
- `Object.prototype[host.id]` becomes `'like'`.
- Any empty object literal `({})` anywhere in the application now resolves `({})[host.id]` as `'like'`.

### 2.3 Danger Assessment & Blast Radius
MatchBite operates as a single-process in-memory server where all concurrent rooms and participant sessions share the same Node.js heap.
- **Cross-Room Contamination**: An attacker in room A can pollute `Object.prototype` with keys that alter the control flow or authorization of rooms B, C, and D.
- **Denial of Service (DoS)**: Overwriting inherited properties such as `toString`, `valueOf`, `constructor`, `isPrototypeOf`, or Express/Node internal properties causes unhandled exceptions on downstream requests, crashing or crippling the server.
- **Authorization Bypass**: If application logic checks property truthiness (e.g. `if (participant.isHost)` or `if (req.user)`), an injected prototype property can grant unauthorized privileges.

---

## 3. Comprehensive Audit of RoomStore Data Structures

We conducted a complete audit of all maps, dictionaries, and dynamic key assignments across the server codebase to detect any additional prototype pollution attack vectors.

| Data Structure | Location in Code | Current Implementation | Untrusted Input Key? | Vulnerability Assessment | Required Remediation |
|---|---|---|---|---|---|
| `room.votes` | `RoomStore.js`: 108, 468, 552–556 | Object literal `{}` with nested sub-maps `{}` | **YES** (`venueId` from `req.body.venueId`) | **CRITICAL** (Finding 1): Pollutes `Object.prototype` via `venueId: '__proto__'`. | Use `Object.create(null)` for map and all sub-maps; reject blacklisted keys; validate against `room.deck`. |
| `room.votes[venueId]` | `RoomStore.js`: 555 | Object literal `{}` | **YES** (`participantId` from `req.body.participantId`) | **MEDIUM**: If sub-map is an ordinary object, `participantId: '__proto__'` could invoke prototype setter. | Sub-maps must use `Object.create(null)`; reject blacklisted keys. |
| `room.participants` | `RoomStore.js`: 104, 219, 239, 254 | Object literal `{ [hostId]: hostParticipant }` | **YES** (`participantId` from `req.body.participantId` or `hostId`) | **HIGH**: If client joins with `participantId: 'toString'` or `'__proto__'`, `room.participants[participantId]` accesses `Object.prototype`. Updating status (`line 752`) pollutes prototype. | Initialize `room.participants` via `Object.create(null)`; reject `['__proto__', 'constructor', 'prototype']` for `participantId` and `hostId`. |
| `this.rooms` | `RoomStore.js`: 26, 118, 135 | Native ES6 `Map` | Normalized code (`normalizeRoomCode`) | **SAFE**: ES6 `Map` instances do not use prototype property lookups for `.get()`, `.set()`, `.has()`. | None required. |
| `room.settings` | `RoomStore.js`: 93, 314–328 | Object literal `{ ... }` | Controlled whitelist `allowedKeys` | **SAFE**: `updateSettings` loops only over explicit whitelist keys (`groupType`, `activityCategory`, etc.). Hostile keys like `__proto__` are ignored. | None required. |
| `Broadcaster.rooms` | `Broadcaster.js`: 8, 32–43 | Native ES6 `Map` with `Set` values | Room code | **SAFE**: Native `Map` and `Set` collections. | None required. |

### Secondary Finding Identified: `room.participants` Map Vulnerability
In `RoomStore.js`:
- Line 104–106: `participants: { [hostParticipantId]: hostParticipant }`
- Line 219: `if (participantId && room.participants[participantId])`
- Line 254: `room.participants[pId] = participant`
- Line 752: `room.participants[participantId].status = status;`

If an attacker calls `POST /api/rooms/:code/join` with `{ participantId: "__proto__", name: "Attacker" }`:
- In `joinRoom`, `room.participants['__proto__']` evaluates to `Object.prototype`.
- If `updateParticipantStatus(code, '__proto__', 'swiping')` is called, it executes:
  `room.participants['__proto__'].status = 'swiping'`, directly polluting `Object.prototype.status = 'swiping'`!
- Furthermore, if `participantId: 'toString'`, `room.participants['toString']` evaluates to `Object.prototype.toString` (a function), confusing session reclamation checks.
- **Conclusion**: `room.participants` MUST also be initialized with `Object.create(null)` and protected with the reserved property blacklist.

---

## 4. Remediation Strategy & Architectural Decision

### 4.1 Evaluation of Candidate Fix Strategies

#### Option 1: Migrate `room.votes` to Native ES6 `Map`
- **Mechanism**: Use `room.votes = new Map()` where keys are `venueId` and values are `new Map(participantId -> vote)`.
- **Pros**: Native language immunity to prototype pollution.
- **Cons**:
  - Breaks property access patterns across the codebase (e.g. `room.votes[venueId]`, `Object.keys(room.votes)`, `const vVotes = room.votes[venue.id] || {}`).
  - Serialization: `JSON.stringify()` serializes `Map` to `{}` (empty object), requiring custom serialization adapters for SSE broadcasting and state inspection.
  - High regression risk across Milestone 2 voting and Milestone 3 tiebreaker features.

#### Option 2: Pure Key Blacklisting (`['__proto__', 'constructor', 'prototype']`)
- **Mechanism**: Check `if (['__proto__', 'constructor', 'prototype'].includes(venueId)) throw 400`.
- **Pros**: Minimal code modification.
- **Cons**:
  - Fragile if applied only at one layer. Any internal call or alternate method that bypasses the blacklist still pollutes `Object.prototype`.
  - Does not fix other property collisions (e.g. `valueOf`, `hasOwnProperty`, `toString`).

#### Option 3: Prototype-less Objects (`Object.create(null)`)
- **Mechanism**: Initialize `room.votes = Object.create(null)` and each `room.votes[venueId] = Object.create(null)`.
- **Pros**:
  - Objects created with `Object.create(null)` have `[[Prototype]]: null`.
  - Accessing `obj.__proto__` evaluates to `undefined` (no getter on prototype chain).
  - Assigning `obj['__proto__'] = val` creates an own property `'__proto__'`, completely incapable of polluting `Object.prototype`.
  - Compatible with `Object.keys()`, `Object.values()`, `for...in`, and `JSON.stringify()`.
  - Compatible with existing bracket syntax `room.votes[venueId][participantId]`.
- **Cons**:
  - Instance methods like `.hasOwnProperty()` do not exist directly on the instance (must use `Object.hasOwn()` or bracket lookups).

### 4.2 Recommended Approach: 4-Layer Defense in Depth
Rather than relying on any single technique, we recommend a robust, defense-in-depth model:

```
[Layer 1: Express Route Boundary]
   └── Reject blacklisted property names with HTTP 400 Bad Request
[Layer 2: RoomStore Model Validation]
   └── Recheck blacklist on venueId, participantId, and hostId
[Layer 3: Room Deck Whitelist (Finding 1 + Finding 2)]
   └── Verify venueId exists in room.deck (blocks any arbitrary string)
[Layer 4: Data Structure Immunity]
   └── Use Object.create(null) for room.votes, sub-maps, and room.participants
```

Even if an attacker bypassed Layer 1 and Layer 2, Layer 3 stops them because `'__proto__'` is not a venue in the deck. Even if Layer 3 were somehow bypassed, Layer 4 guarantees that `room.votes` has no prototype chain to pollute.

---

## 5. Concrete Code Fix Specification

### 5.1 Constant Definition: Reserved Property Blacklist
In `server/models/RoomStore.js`, export the reserved properties constant and helper:

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

---

### 5.2 Target File 1: `server/models/RoomStore.js`

#### Change 1: Add reserved property definitions and helper (Top of file)
- **Target Location**: Lines 7–10
- **Diff Specification**:
```javascript
// BEFORE (Lines 6-8):
import { CONFIG } from '../config.js';
import { globalBroadcaster } from '../sync/Broadcaster.js';

// AFTER:
import { CONFIG } from '../config.js';
import { globalBroadcaster } from '../sync/Broadcaster.js';

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

#### Change 2: Initialize `participants` and `votes` with `Object.create(null)` in `createRoom`
- **Target Location**: Lines 62–109
- **Diff Specification**:
```javascript
// BEFORE (Lines 62-65):
    if (!hostName || typeof hostName !== 'string' || !hostName.trim()) {
      throw new Error('hostName is required');
    }

// AFTER:
    if (!hostName || typeof hostName !== 'string' || !hostName.trim()) {
      throw new Error('hostName is required');
    }

    if (hostId && isForbiddenPropertyName(hostId)) {
      const err = new Error(`Invalid hostId: '${hostId}' is a reserved property name`);
      err.statusCode = 400;
      throw err;
    }

// BEFORE (Lines 104-108):
      participants: {
        [hostParticipantId]: hostParticipant,
      },
      deck: [],
      votes: {}, // venueId -> { participantId: 'like' | 'pass' | 'superlike' }

// AFTER:
      participants: Object.assign(Object.create(null), {
        [hostParticipantId]: hostParticipant,
      }),
      deck: [],
      votes: Object.create(null), // venueId -> { participantId: 'like' | 'pass' | 'superlike' }
```

#### Change 3: Validate `participantId` against forbidden names in `joinRoom`
- **Target Location**: Lines 212–215
- **Diff Specification**:
```javascript
// BEFORE (Lines 212-215):
    const trimmedName = name.trim();
    const now = new Date().toISOString();
    let isNew = false;
    let participant;

// AFTER:
    const trimmedName = name.trim();
    const now = new Date().toISOString();
    let isNew = false;
    let participant;

    if (participantId && isForbiddenPropertyName(participantId)) {
      const err = new Error(`Invalid participantId: '${participantId}' is a reserved property name`);
      err.statusCode = 400;
      throw err;
    }
```

#### Change 4: Initialize `room.votes` with `Object.create(null)` in `startVoting`
- **Target Location**: Lines 466–469
- **Diff Specification**:
```javascript
// BEFORE (Line 468):
    room.status = 'voting';
    room.deck = deck;
    room.votes = {};

// AFTER:
    room.status = 'voting';
    room.deck = deck;
    room.votes = Object.create(null);
```

#### Change 5: Hardened Validation & `Object.create(null)` sub-maps in `recordVote`
- **Target Location**: Lines 536–556
- **Diff Specification**:
```javascript
// BEFORE (Lines 537-556):
    if (!venueId) {
      const err = new Error('venueId is required');
      err.statusCode = 400;
      throw err;
    }

    if (!['like', 'pass', 'superlike'].includes(vote)) {
      const err = new Error(`Invalid vote type '${vote}'. Must be 'like', 'pass', or 'superlike'`);
      err.statusCode = 400;
      throw err;
    }

    const now = new Date().toISOString();

    // Record the vote in room.votes map
    if (!room.votes[venueId]) {
      room.votes[venueId] = {};
    }
    room.votes[venueId][participantId] = vote;

// AFTER:
    if (!venueId || typeof venueId !== 'string') {
      const err = new Error('venueId is required');
      err.statusCode = 400;
      throw err;
    }

    if (isForbiddenPropertyName(venueId)) {
      const err = new Error(`Invalid venueId: '${venueId}' is a reserved property name`);
      err.statusCode = 400;
      throw err;
    }

    if (isForbiddenPropertyName(participantId)) {
      const err = new Error(`Invalid participantId: '${participantId}' is a reserved property name`);
      err.statusCode = 400;
      throw err;
    }

    // Validate venueId against room.deck (Resolves Finding 1 + Finding 2)
    const validVenue = (room.deck || []).some(v => v.id === venueId);
    if (!validVenue) {
      const err = new Error(`venueId '${venueId}' is not in the room deck`);
      err.statusCode = 400;
      throw err;
    }

    if (!['like', 'pass', 'superlike'].includes(vote)) {
      const err = new Error(`Invalid vote type '${vote}'. Must be 'like', 'pass', or 'superlike'`);
      err.statusCode = 400;
      throw err;
    }

    const now = new Date().toISOString();

    // Ensure room.votes is a prototype-less object
    if (!room.votes || Object.getPrototypeOf(room.votes) !== null) {
      const safeVotes = Object.create(null);
      if (room.votes) {
        Object.assign(safeVotes, room.votes);
      }
      room.votes = safeVotes;
    }

    // Record the vote in room.votes map using prototype-less sub-maps
    if (!room.votes[venueId] || Object.getPrototypeOf(room.votes[venueId]) !== null) {
      const safeSubMap = Object.create(null);
      if (room.votes[venueId]) {
        Object.assign(safeSubMap, room.votes[venueId]);
      }
      room.votes[venueId] = safeSubMap;
    }
    room.votes[venueId][participantId] = vote;
```

#### Change 6: Safe fallbacks in consensus evaluation and `getRoomResults`
- **Target Location**: Lines 588 & 691
- **Diff Specification**:
```javascript
// Line 588 BEFORE:
    const venueVotes = room.votes[venueId] || {};

// Line 588 AFTER:
    const venueVotes = room.votes[venueId] || Object.create(null);

// Line 691 BEFORE:
    const vVotes = room.votes[venue.id] || {};

// Line 691 AFTER:
    const vVotes = room.votes[venue.id] || Object.create(null);
```

---

### 5.3 Target File 2: `server/routes/votes.js`

#### Change 1: Validate `venueId` and `participantId` at Route Boundary
- **Target Location**: Lines 71–83 in `server/routes/votes.js`
- **Diff Specification**:
```javascript
// BEFORE (Lines 71-76):
    if (!venueId) {
      return res.status(400).json({
        success: false,
        error: 'venueId is required',
      });
    }

// AFTER:
    if (!venueId || typeof venueId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'venueId is required',
      });
    }

    const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];
    if (FORBIDDEN_KEYS.includes(venueId.trim())) {
      return res.status(400).json({
        success: false,
        error: `Invalid venueId: '${venueId}' is a reserved property name`,
      });
    }

    if (FORBIDDEN_KEYS.includes(participantId)) {
      return res.status(400).json({
        success: false,
        error: `Invalid participantId: '${participantId}' is a reserved property name`,
      });
    }
```

---

## 6. Regression Test Specification

### 6.1 Update Existing Test in `tests/tier2-boundaries/m2-adversarial-security.test.js`
In `tests/tier2-boundaries/m2-adversarial-security.test.js` (lines 206–233), the test was originally designed to demonstrate that the vulnerability existed (asserting `200 OK` and `Object.prototype[host.id] === 'like'`).

**Required Modification**:
Replace lines 206–233 with:

```javascript
    it('rejects prototype pollution attack via venueId: "__proto__" with 400 Bad Request and preserves Object.prototype immunity', async () => {
      const { code, participants } = await setupActiveVotingRoom(2);
      const host = participants[0];

      // Ensure prototype is initially clean
      delete Object.prototype[host.id];
      delete Object.prototype.polluted;

      // Attack: Send vote with venueId = '__proto__'
      const resProto = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          venueId: '__proto__',
          vote: 'like',
        });

      // Verification: Attack must be rejected with 400 Bad Request
      expect(resProto.status).toBe(400);
      expect(resProto.body.success).toBe(false);
      expect(resProto.body.error).toMatch(/(reserved property name|not in the room deck)/i);

      // Verify Object.prototype is completely unpolluted across the process
      expect(Object.prototype[host.id]).toBeUndefined();
      expect(({})[host.id]).toBeUndefined();
      expect(Object.prototype.polluted).toBeUndefined();
      expect(({}).polluted).toBeUndefined();

      // Teardown cleanup
      delete Object.prototype[host.id];
      delete Object.prototype.polluted;
    });
```

---

### 6.2 New Exhaustive Regression Test Suite
Create a dedicated describe block in `tests/tier2-boundaries/m2-adversarial-security.test.js` (or in a new test file `tests/tier2-boundaries/prototype-pollution-hardening.test.js`):

```javascript
describe('Reserved Property & Prototype Pollution Hardening Matrix', () => {
  it('Rejects venueId: "constructor" with 400 Bad Request and leaves Object.constructor intact', async () => {
    const { code, participants } = await setupActiveVotingRoom(2);
    const host = participants[0];

    const res = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', host.sessionToken)
      .send({
        participantId: host.id,
        venueId: 'constructor',
        vote: 'like',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/(reserved property name|not in the room deck)/i);
    expect(Object[host.id]).toBeUndefined();
  });

  it('Rejects venueId: "prototype" with 400 Bad Request', async () => {
    const { code, participants } = await setupActiveVotingRoom(2);
    const host = participants[0];

    const res = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', host.sessionToken)
      .send({
        participantId: host.id,
        venueId: 'prototype',
        vote: 'like',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/(reserved property name|not in the room deck)/i);
  });

  it('Rejects participantId: "__proto__" in vote request with 400 Bad Request', async () => {
    const { code, deck } = await setupActiveVotingRoom(2);

    const res = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', 'st-test-token')
      .send({
        participantId: '__proto__',
        venueId: deck[0].id,
        vote: 'like',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/reserved property name/i);
  });

  it('Rejects participantId: "__proto__" in join request with 400 Bad Request', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'JoinTestHost' });
    const code = createRes.body.room.code;

    const joinRes = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({
        participantId: '__proto__',
        name: 'HostileJoiner',
      });

    expect(joinRes.status).toBe(400);
    expect(joinRes.body.success).toBe(false);
    expect(joinRes.body.error).toMatch(/reserved property name/i);
    expect(Object.prototype.status).toBeUndefined();
  });

  it('Direct RoomStore Unit Test: recordVote with "__proto__" throws 400 Error and preserves null prototype', () => {
    const store = new RoomStore();
    const { room, participant, sessionToken } = store.createRoom({ hostName: 'DirectTest' });
    store.startVoting(room.code, participant.sessionToken);

    // Verify room.votes has null prototype
    expect(Object.getPrototypeOf(room.votes)).toBeNull();

    // Verify direct recordVote with '__proto__' throws
    expect(() => {
      store.recordVote(room.code, {
        participantId: participant.id,
        sessionToken,
        venueId: '__proto__',
        vote: 'like',
      });
    }).toThrow(/(reserved property name|not in the room deck)/i);

    expect(Object.prototype[participant.id]).toBeUndefined();
  });

  it('Legitimate voting, consensus matching, and leaderboard calculation function flawlessly with Object.create(null)', async () => {
    const { code, participants, deck } = await setupActiveVotingRoom(2);
    const [u1, u2] = participants;
    const targetVenue = deck[0].id;

    // Both participants vote 'like' on targetVenue
    const res1 = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', u1.sessionToken)
      .send({ participantId: u1.id, venueId: targetVenue, vote: 'like' });
    expect(res1.status).toBe(200);
    expect(res1.body.isMatch).toBe(false);

    const res2 = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', u2.sessionToken)
      .send({ participantId: u2.id, venueId: targetVenue, vote: 'like' });
    expect(res2.status).toBe(200);
    expect(res2.body.isMatch).toBe(true);
    expect(res2.body.matchedVenue.id).toBe(targetVenue);

    // Leaderboard calculation check
    const resultsRes = await request(app).get(`/api/rooms/${code}/results`);
    expect(resultsRes.status).toBe(200);
    expect(resultsRes.body.matchedVenueId).toBe(targetVenue);
    expect(resultsRes.body.leaderboard[0].venueId).toBe(targetVenue);
    expect(resultsRes.body.leaderboard[0].isUnanimous).toBe(true);
  });
});
```

---

## 7. Verification Method & Success Criteria

### 7.1 Independent Verification Commands
Once the implementation worker applies the code fix and updates the test harness:

1. **Run the Adversarial Security Suite**:
   ```powershell
   npx vitest run tests/tier2-boundaries/m2-adversarial-security.test.js
   ```
   *Expected Result*: All 22 tests pass, including the updated prototype pollution test asserting 400 Bad Request and clean `Object.prototype`.

2. **Run the Full Test Suite**:
   ```powershell
   npm test
   ```
   *Expected Result*: All test suites pass (126+ tests passing, 0 failing, exit code 0).

3. **Run Production Build**:
   ```powershell
   npm run build
   ```
   *Expected Result*: Vite production bundle builds cleanly in < 3 seconds without errors.

### 7.2 Invalidation Conditions
- Any attempt to submit `venueId: '__proto__'` returns HTTP 200 or 500 instead of 400.
- `Object.prototype[key]` or `({})[key]` is truthy after submitting hostile vote or join payloads.
- `Object.getPrototypeOf(room.votes)` does not evaluate to `null`.
- Existing voting, consensus triggers, or results calculation tests fail or throw unexpected `TypeError`s.
