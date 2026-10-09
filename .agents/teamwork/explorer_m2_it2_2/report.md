# Investigation & Remediation Report: Finding 2 (Ghost Venue ID Consensus & Match Freeze)

**Target Milestone**: Milestone 2 Iteration 2 (`explorer_m2_it2_2`)  
**Finding Reference**: Finding 2 from Challenger 2 (`challenger_m2_2/handoff.md`)  
**Scope**: Server-side vote validation (`server/routes/votes.js`, `server/models/RoomStore.js`), Client-side match recovery (`src/components/Match/MatchCelebration.jsx`), and Regression Test Suite.  
**Role**: Explorer (Read-Only Analysis & Specification)

---

## 1. Executive Summary

During the Milestone 2 adversarial security evaluation, Challenger 2 identified a high-severity integrity defect:
An authenticated client (or attacker) can submit swipe votes on arbitrary, non-existent `venueId` strings (e.g. `"phantom-venue-99999"`). Because neither the HTTP route (`server/routes/votes.js`) nor the domain model (`server/models/RoomStore.js`) validates `venueId` against the active room deck (`room.deck`), the server records votes on ghost entities. In a 1-person room (or if all active participants vote "like" on the ghost ID), the consensus algorithm immediately transitions the room to `status: 'matched'`, storing `matchedVenueId: "phantom-venue-99999"` and resolving `matchedVenue: null`.

When clients render the match state, `src/components/Match/MatchCelebration.jsx` encounters `!venue` and permanently displays `"Loading winning venue details..."` with zero action buttons, zero timeout fallback, and no navigation controls. This bricks the entire room and forces participants to manually clear their browser storage or abandon the room.

This report establishes:
1. The exact root cause and execution path leading to state corruption and UI lockup.
2. A two-tier defense-in-depth fix strategy on the server: route-level validation in `votes.js` and model-level validation in `RoomStore.js`, rejecting invalid IDs with `400 Bad Request ('venueId is not in the room deck')`.
3. A client-side resilience strategy in `MatchCelebration.jsx` featuring deck fallback lookup, a 3.5s loading timeout, and an actionable recovery card allowing users to return to the lobby or reload.
4. A complete regression test specification across server and client layers.

---

## 2. Root Cause & Architectural Trace

### 2.1 Server-Side Vulnerability Path

In `server/routes/votes.js` (lines 71–76):
```javascript
if (!venueId) {
  return res.status(400).json({
    success: false,
    error: 'venueId is required',
  });
}
```
The endpoint only verifies that `venueId` is truthy. It does NOT check whether `venueId` belongs to `room.deck`.

Execution then enters `server/models/RoomStore.js` at `recordVote` (lines 537–556):
```javascript
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
```
1. `recordVote` performs no membership check against `room.deck`.
2. It allocates an entry in `room.votes[venueId]` for the arbitrary ID.
3. It increments `participant.swipedCount`.
4. At lines 584–620, the consensus engine runs:
   ```javascript
   const activeParticipants = Object.values(room.participants);
   const venueVotes = room.votes[venueId] || {};

   const allVoted = activeParticipants.length > 0 && activeParticipants.every(p => venueVotes[p.id] !== undefined);
   const allAgreed = activeParticipants.length > 0 && activeParticipants.every(p => {
     const v = venueVotes[p.id];
     return v === 'like' || v === 'superlike';
   });

   if (allVoted && allAgreed && room.status !== 'matched') {
     const matchedVenue = (room.deck || []).find(d => d.id === venueId) || this.getVenueById(venueId);
     room.status = 'matched';
     room.matchedVenueId = venueId;
     room.matchedAt = now;
   ```
5. If `activeParticipants.length === 1` (or all participants vote 'like' on `venueId`), `allVoted` and `allAgreed` are `true`.
6. `(room.deck || []).find(...)` fails, and `this.getVenueById("phantom-venue-99999")` returns `null`.
7. `room.status` transitions to `'matched'`, and `room.matchedVenueId` is set to the ghost ID.
8. The SSE stream broadcasts `match:revealed` with `{ venue: null }`.
9. The public room state (`getPublicRoom()`) now permanently returns:
   - `status: "matched"`
   - `matchedVenueId: "phantom-venue-99999"`
   - `matchedVenue: null`

### 2.2 Client-Side Freeze in `MatchCelebration.jsx`

In `src/App.jsx` (lines 48–50):
```jsx
room.status === 'matched' ? (
  <MatchCelebration />
) : ...
```
When `room.status === 'matched'`, React renders `<MatchCelebration />`.

In `src/components/Match/MatchCelebration.jsx` (lines 26–35, 73–81):
```jsx
const venue = propVenue || room?.matchedVenue || room?.match?.venue || null;

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
Because `venue === null`:
- The component enters an early return with a static loading message.
- There is no timeout, no error recovery, and no buttons.
- The user is completely stranded.

---

## 3. Server Fix Specification

We specify a **defense-in-depth** strategy: validate in both the API route handler (`server/routes/votes.js`) and the core business model (`server/models/RoomStore.js`).

### 3.1 Changes in `server/models/RoomStore.js`

In `RoomStore.prototype.recordVote`, immediately after checking `if (!venueId)` (line 541):

#### Proposed Code:
```javascript
// Before (lines 537-542):
if (!venueId) {
  const err = new Error('venueId is required');
  err.statusCode = 400;
  throw err;
}

// Target Insertion:
// Validate that venueId exists within the room's active deck
const isVenueInDeck = Array.isArray(room.deck) && room.deck.some(v => v && v.id === venueId);
if (!isVenueInDeck) {
  const err = new Error('venueId is not in the room deck');
  err.statusCode = 400;
  throw err;
}
```

#### Rationale:
1. `RoomStore` is the authoritative custodian of game state. Enforcing deck validation inside `recordVote` guarantees that NO caller—whether REST handler, WebSocket, background script, or unit test—can inject votes for cards not in `room.deck`.
2. Throwing an error with `err.statusCode = 400` ensures Express automatically forwards HTTP 400 Bad Request to the client.
3. Placing this check before `room.votes[venueId] = ...` completely prevents prototype pollution attempts via `venueId: '__proto__'` or `venueId: 'constructor'`, as those keys will never match a legitimate card in `room.deck`.

### 3.2 Changes in `server/routes/votes.js`

In `router.post('/:code/vote', ...)` (lines 71–77):

#### Proposed Code:
```javascript
// Before (lines 71-76):
if (!venueId) {
  return res.status(400).json({
    success: false,
    error: 'venueId is required',
  });
}

// Target Insertion (Route-Level Defense in Depth):
const room = roomStore.getRoom(code);
if (room && room.deck && !room.deck.some(v => v && v.id === venueId)) {
  return res.status(400).json({
    success: false,
    error: 'venueId is not in the room deck',
  });
}
```

#### Rationale:
1. Immediately rejects out-of-deck payloads at the HTTP gateway before executing deeper model transactions.
2. Returns a clear, predictable `{ success: false, error: 'venueId is not in the room deck' }` JSON contract with status `400`.

---

## 4. Client Recovery & Fallback Specification

While server-side validation completely prevents corrupt rooms from being created, client-side resilience is essential for handling transient network delays or dropped payloads.

### 4.1 Changes in `src/components/Match/MatchCelebration.jsx`

#### 1. Fallback Venue Resolution
Enhance venue derivation to look up `room.matchedVenueId` inside `room.deck` if `room.matchedVenue` is null:
```javascript
const venue = propVenue
  || room?.matchedVenue
  || room?.match?.venue
  || (room?.matchedVenueId && room?.deck ? room.deck.find(v => v.id === room.matchedVenueId) : null)
  || null;
```

#### 2. Loading Timeout & Recovery State
Add state and an effect to track if loading has exceeded 3.5 seconds:
```javascript
const { room, participant, showToast, leaveRoom } = useRoom();
const [isLoadingTimedOut, setIsLoadingTimedOut] = useState(false);

useEffect(() => {
  if (!venue) {
    const timer = setTimeout(() => {
      setIsLoadingTimedOut(true);
    }, 3500);
    return () => clearTimeout(timer);
  } else {
    setIsLoadingTimedOut(false);
  }
}, [venue]);
```

#### 3. Graceful Render When `!venue`
Replace lines 73–81 with:
```jsx
if (!venue) {
  if (!isLoadingTimedOut) {
    return (
      <div className="card text-center" style={{ padding: '40px 20px' }}>
        <Sparkles size={40} color="var(--primary)" style={{ margin: '0 auto 16px' }} />
        <h2 className="card-title">Match Found!</h2>
        <p className="card-subtitle">Loading winning venue details...</p>
        <div style={{ marginTop: '20px' }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={leaveRoom}
          >
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Graceful Recovery Fallback Card when loading timed out or venue is missing:
  return (
    <div className="match-celebration-container">
      <div className="celebration-hero-header">
        <div className="match-banner-pill">
          <Sparkles size={16} className="sparkle-anim" />
          <span>Consensus Reached!</span>
        </div>
        <h1 className="celebration-headline">The Group Has Spoken!</h1>
        <p className="celebration-subtitle">
          Everyone agreed on a match, but winning venue details could not be loaded.
        </p>
      </div>

      <div className="celebration-card" style={{ padding: '28px', textAlign: 'center' }}>
        {room?.matchedVenueId && (
          <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
            Venue Reference: <code>{room.matchedVenueId}</code>
          </p>
        )}

        {/* Render unanimous roster so participants still see group agreement */}
        {participants.length > 0 && (
          <div className="unanimous-roster-box" style={{ marginBottom: '24px' }}>
            <div className="unanimous-roster-header">
              <CheckCircle size={16} color="var(--success)" />
              <span>100% Unanimous Agreement</span>
            </div>
            <div className="unanimous-members-row">
              {participants.map((p) => (
                <div key={p.id} className="roster-avatar-badge" title={`${p.name} agreed!`}>
                  <span className="roster-avatar">{p.avatar || '👤'}</span>
                  <span className="roster-name">{p.name}</span>
                  <span className="roster-reaction">{p.vote === 'superlike' ? '⭐' : '❤️'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="match-footer-controls" style={{ justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => window.location.reload()}
          >
            Reload Session
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={leaveRoom}
          >
            Return to Lobby
          </button>
          {onRestart && participant?.isHost && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onRestart}
            >
              <RotateCcw size={18} />
              <span>Swipe Again</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 5. Regression Test Specification

### 5.1 Update Existing Adversarial Test
File: `tests/tier2-boundaries/m2-adversarial-security.test.js` (lines 235–262)

#### Current Test (asserting the bug):
```javascript
it('empirically demonstrates unvalidated venueId allows voting and consensus on ghost non-deck venues', async () => { ... expect(voteRes.status).toBe(200); expect(voteRes.body.matchedVenue).toBeNull(); });
```

#### Updated Specification (asserting the fix):
```javascript
it('rejects voting on ghost non-deck venueId with 400 Bad Request and preserves room state', async () => {
  const { code, participants } = await setupActiveVotingRoom(1);
  const soloHost = participants[0];

  // Vote on an arbitrary non-deck ghost venueId
  const ghostVenueId = 'phantom-venue-99999';
  const voteRes = await request(app)
    .post(`/api/rooms/${code}/vote`)
    .set('x-session-token', soloHost.sessionToken)
    .send({
      participantId: soloHost.id,
      venueId: ghostVenueId,
      vote: 'like',
    });

  // Must be rejected with 400 Bad Request
  expect(voteRes.status).toBe(400);
  expect(voteRes.body.success).toBe(false);
  expect(voteRes.body.error).toContain('venueId is not in the room deck');

  // Verify room status remains 'voting' and no match is created
  const roomRes = await request(app).get(`/api/rooms/${code}`);
  expect(roomRes.body.room.status).toBe('voting');
  expect(roomRes.body.room.matchedVenueId).toBeNull();
  expect(roomRes.body.room.matchedVenue).toBeNull();
});
```

### 5.2 New Feature/Integration Tests in `tests/tier1-features/r2-swiping.test.js`

Add the following test suite:
```javascript
describe('Deck Validation & Malicious Vote Prevention', () => {
  it('Rejects vote on valid catalog venue that was excluded from the room deck', async () => {
    const { code, participants } = await setupRoomWithParticipants(2, {
      activityCategory: 'dining',
      deckSize: 5,
    });
    const host = participants[0];

    // Start voting
    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-session-token', host.sessionToken)
      .send({ participantId: host.id });
    const deckIds = new Set(startRes.body.deck.map(v => v.id));

    // Pick a valid venue from catalog that is NOT in this 5-card dining deck
    const allVenues = (new RoomStore()).loadVenues();
    const nonDeckVenue = allVenues.find(v => !deckIds.has(v.id));
    expect(nonDeckVenue).toBeDefined();

    const voteRes = await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', host.sessionToken)
      .send({
        participantId: host.id,
        venueId: nonDeckVenue.id,
        vote: 'like',
      });

    expect(voteRes.status).toBe(400);
    expect(voteRes.body.success).toBe(false);
    expect(voteRes.body.error).toBe('venueId is not in the room deck');
  });

  it('Does not increment participant swipedCount on rejected vote', async () => {
    const { code, participants } = await setupRoomWithParticipants(1);
    const host = participants[0];

    await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-session-token', host.sessionToken)
      .send({ participantId: host.id });

    // Send invalid vote
    await request(app)
      .post(`/api/rooms/${code}/vote`)
      .set('x-session-token', host.sessionToken)
      .send({
        participantId: host.id,
        venueId: 'invalid-id-xyz',
        vote: 'like',
      });

    const roomRes = await request(app).get(`/api/rooms/${code}`);
    expect(roomRes.body.room.participants[0].swipedCount).toBe(0);
  });

  it('Multi-participant room: invalid votes from all participants do not trigger consensus', async () => {
    const { code, participants } = await setupRoomWithParticipants(3);
    const host = participants[0];

    const startRes = await request(app)
      .post(`/api/rooms/${code}/start`)
      .set('x-session-token', host.sessionToken)
      .send({ participantId: host.id });
    const validDeck = startRes.body.deck;

    // All 3 participants attempt to vote like on a fake venue
    for (const p of participants) {
      const res = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', p.sessionToken)
        .send({
          participantId: p.id,
          venueId: 'coordinated-ghost-attack',
          vote: 'like',
        });
      expect(res.status).toBe(400);
    }

    const roomRes = await request(app).get(`/api/rooms/${code}`);
    expect(roomRes.body.room.status).toBe('voting');

    // Legitimate votes on valid card subsequently succeed and match
    for (const p of participants) {
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', p.sessionToken)
        .send({
          participantId: p.id,
          venueId: validDeck[0].id,
          vote: 'like',
        });
    }

    const matchRes = await request(app).get(`/api/rooms/${code}`);
    expect(matchRes.body.room.status).toBe('matched');
    expect(matchRes.body.room.matchedVenueId).toBe(validDeck[0].id);
    expect(matchRes.body.room.matchedVenue.id).toBe(validDeck[0].id);
  });
});
```

---

## 6. Verification and Invalidation Method

### 6.1 Independent Verification Commands
```powershell
# 1. Run swiping feature tests
npx vitest run tests/tier1-features/r2-swiping.test.js

# 2. Run adversarial security test suite
npx vitest run tests/tier2-boundaries/m2-adversarial-security.test.js

# 3. Run full test suite
npm test

# 4. Run production build
npm run build
```

### 6.2 Invalidation Conditions
The fix is invalid if:
1. `POST /api/rooms/:code/vote` returns `200 OK` when `venueId` is not present in `room.deck`.
2. A room transitions to `status: 'matched'` with `matchedVenue: null` under any voting sequence.
3. `MatchCelebration.jsx` remains in a permanent, buttonless loading state when `venue` is null for > 3.5 seconds.
4. Any legitimate swipe vote on a card within `room.deck` is incorrectly rejected.
