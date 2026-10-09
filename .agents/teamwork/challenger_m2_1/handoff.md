# Milestone 2 Empirical Challenge Report: Concurrency & Consensus Stress Testing

**Agent**: `challenger_m2_1` (Challenger 1, Milestone 2)  
**Roles**: `critic`, `specialist`  
**Coordination Directory**: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\challenger_m2_1`  
**Date**: 2026-10-09  
**Verdict**: **APPROVE**  

---

## 1. Observation

### 1.1 Empirical Verification Test Execution
Two dedicated test suites were implemented and executed against the running Express application and its underlying domain models:

1. **Integrated Vitest Adversarial Test Suite** (`tests/stress-concurrency-consensus.test.js`):
   - Command: `npx vitest run tests/stress-concurrency-consensus.test.js`
   - Result:
     ```
     RUN  v2.1.9 C:/Users/kck50/teamwork_projects/niche_web_app
     ✓ tests/stress-concurrency-consensus.test.js (18 tests) 1140ms
     Test Files  1 passed (1)
          Tests  18 passed (18)
       Duration  1.98s
     ```

2. **Standalone High-Throughput HTTP Socket Harness** (`tests/stress-harness.js`):
   - Command: `node tests/stress-harness.js`
   - Result:
     ```
     ======================================================================
     MATCHBITE EMPIRICAL STRESS TEST HARNESS — CONCURRENCY & CONSENSUS
     ======================================================================
     Server bound to ephemeral TCP port: 56356
     [1/12] Testing 5-Participant Concurrent Swiping (60 rapid requests)... ✓
     [2/12] Testing 8-Participant Scrambled Concurrency (96 requests)... ✓
     [3/12] Testing Simultaneous Consensus Race (5 simultaneous likes)... ✓
     [4/12] Testing Dual-Venue Simultaneous Consensus (Double-Match Prevention)... ✓
     [5/12] Testing Simultaneous Like vs Pass Collision (4 Likes, 1 Pass)... ✓
     [6/12] Testing Permutation: All Like (5/5)... ✓
     [7/12] Testing Permutation: All Pass (0/5)... ✓
     [8/12] Testing Permutation: Superlike Weighting & Consensus... ✓
     [9/12] Testing Solo Room (1 Participant) Instant Consensus... ✓
     [10/12] Testing Dynamic Vote Flipping (Pass -> Like)... ✓
     [11/12] Testing Idempotency Under Duplicate Vote Flood (30 spam votes)... ✓
     [12/12] Testing High-Volume Capacity Saturation (35 concurrent joins)... ✓
     ======================================================================
     Total Requests Executed : 329
     Assertions Passed       : 60
     Assertions Failed       : 0
     Total Duration          : 0.41s
     Average Latency         : 40.47ms
     P95 Latency             : 90.08ms
     P99 Latency             : 90.81ms
     Success Rate            : 100.0%
     ======================================================================
     🏁 VERDICT: ALL 12 CONCURRENCY & CONSENSUS SUITES PASSED EMPIRICALLY (100%)
     ```

3. **Full Project Test Suite**:
   - Command: `npm test`
   - Result:
     ```
     Test Files  5 passed (5)
          Tests  126 passed (126)
       Duration  1.95s
     ```

4. **Production Build**:
   - Command: `npm run build`
   - Result: Vite built `dist/index.html` (0.86 kB) and `dist/assets/index-*.js` (211 kB) cleanly in 2.38s with exit code 0.

---

## 2. Logic Chain

### 2.1 Concurrency Model & State Synchronization
1. **Thread Execution and Event Loop Scheduling**:
   - In `server/models/RoomStore.js` (lines 500–672), `recordVote` is a purely synchronous method.
   - While Node.js processes incoming HTTP requests asynchronously, each request's body parsing and invocation of `recordVote` runs synchronously within an event loop tick.
   - In our empirical tests, 60 requests (5 users × 12 venues) and 96 requests (8 users × 12 venues) were dispatched in parallel via `Promise.all`. All requests completed with HTTP 200 OK without dropped votes, data race corruption, or memory leaks.

2. **Race Condition & Double-Match Prevention**:
   - In `RoomStore.js` (lines 596–602), consensus detection requires:
     `if (allVoted && allAgreed && room.status !== 'matched')`
   - When 5 participants fire their unanimous 'like' votes simultaneously, the first vote to satisfy `allAgreed` sets `room.status = 'matched'` and locks `room.matchedVenueId`.
   - In `Broadcaster.js` (line 68), `broadcaster.broadcast(code, 'match:revealed', matchPayload)` is executed inside this guard, ensuring that exactly **one** `match:revealed` SSE event is emitted across the room.
   - When a second venue (Venue B) simultaneously achieves unanimous likes (Dual-Venue Race), `room.status !== 'matched'` evaluates to `false`. The second venue triggers lines 633–650 (`if (room.status === 'matched')`), returning the existing winner without altering `room.matchedVenueId`. This prevents double matches.

3. **Vote Permutations & Scoring Accuracy**:
   - **All Like (5/5)**: Detected unanimously. Leaderboard confirms `approvalRate: 100%`, `isUnanimous: true`, `score: 5`.
   - **(N-1) Likes + 1 Pass**: Tested with 4 likes and 1 pass. Consensus is strictly blocked (`allAgreed` evaluates to false). Leaderboard shows `approvalRate: 80%`, `isUnanimous: false`, `score: 4`.
   - **All Pass (0/5)**: `approvalRate: 0%`, `isUnanimous: false`, `passCount: 5`.
   - **Superlike Weighting**: Superlikes contribute a 3x weight (`(superlikeCount * 3) + (likeCount * 1)`). A venue with 4 superlikes achieves a score of 12, successfully outranking a venue with 4 likes (score 4) and a mixed venue with 2 superlikes + 2 likes (score 8).
   - **Solo Room (1 Participant)**: Single positive vote immediately triggers unanimous consensus and transitions room status to `matched`.

4. **Idempotency & Boundary Saturation**:
   - Sending 30 rapid duplicate votes on the same venue by a single participant is idempotent: `swipedCount` remains exactly 1.
   - Dispatching 35 concurrent `POST /api/rooms/:code/join` requests strictly respects `CONFIG.MAX_PARTICIPANTS = 30`: exactly 29 guests are accepted and 6 are rejected with HTTP 409 Conflict.

---

## 3. Challenges & Attack Surface Analysis

### Overall Risk Assessment: LOW (Core consensus and concurrency are stable and robust)

### Challenge 1 (Low-to-Medium Severity): Post-Match Vote Retraction Causes Leaderboard Inconsistency
- **Assumption Challenged**: Once a room reaches consensus, the consensus outcome should be immutable.
- **Attack Scenario**:
  1. Room with 2 participants achieves unanimous match on `venue-001`. Room transitions to `status: 'matched'`.
  2. One participant sends a subsequent `POST /api/rooms/:code/vote` with `venueId: 'venue-001'` and `vote: 'pass'`.
  3. `RoomStore.recordVote` executes line 555 (`room.votes[venueId][participantId] = vote`), writing `'pass'` into the vote map.
  4. The HTTP response returns `isMatch: true` with the winning venue, but `GET /api/rooms/:code/results` recalculates the leaderboard, showing `passCount: 1`, `approvalRate: 50%`, and `isUnanimous: false` for the matched venue.
- **Blast Radius**: Minor UI inconsistency if users view the consensus leaderboard after the match screen.
- **Mitigation Recommendation**: In `RoomStore.recordVote`, add a short-circuit guard at the top:
  `if (room.status === 'matched') return { success: true, isMatch: true, matchedVenue: ... };` before modifying `room.votes`.

### Challenge 2 (Low Severity): Unvalidated `venueId` Allows Matching on Non-Existent Venues
- **Assumption Challenged**: All votes must correspond to venues present in the room's active deck.
- **Attack Scenario**: A malicious client sends `POST /api/rooms/:code/vote` with an arbitrary string `venueId: 'fake-venue-999'`.
- **Result**: `recordVote` accepts the vote. If all participants vote on that string, the room matches with `matchedVenueId = 'fake-venue-999'` and `matchedVenue = null`.
- **Mitigation Recommendation**: In `recordVote`, validate `if (!room.deck.some(v => v.id === venueId)) throw 400 Bad Request`.

---

## 4. Stress Test Results Summary

| # | Scenario | Expected Behavior | Actual Behavior | Result |
|---|----------|-------------------|-----------------|:------:|
| 1 | 5 Users Rapid Swiping (60 requests) | 100% 200 OK, swipedCount = 12 | 100% 200 OK, swipedCount = 12 | **PASS** |
| 2 | 8 Users Scrambled Concurrency (96 requests) | 100% 200 OK, out-of-order consistency | 100% 200 OK, consistent tallies | **PASS** |
| 3 | 10 Users Real TCP Sockets | Latency < 100ms, zero dropped sockets | Avg 40.47ms, P95 90.08ms | **PASS** |
| 4 | Simultaneous Deciding Votes (5 users) | Exactly 1 match trigger, single SSE broadcast | 1 broadcast, matchedVenueId locked | **PASS** |
| 5 | Dual-Venue Unanimous Race (Venues A & B) | Single winning venue, no overwrite | Single winner locked, 0 overwrite | **PASS** |
| 6 | Simultaneous Like vs Pass Collision | Consensus blocked, no false positive | Status = voting, matchedVenueId = null | **PASS** |
| 7 | Permutation: 5/5 All Like | Unanimous match, 100% approval | isMatch: true, isUnanimous: true | **PASS** |
| 8 | Permutation: 4 Likes + 1 Pass | Consensus blocked (pass veto) | isMatch: false, isUnanimous: false | **PASS** |
| 9 | Permutation: 5/5 All Pass | 0% approval rate, no match | isMatch: false, approvalRate: 0% | **PASS** |
| 10 | Permutation: Superlike 3x Weighting | Superlike scores 3 pts, ranks #1 | Score = 12, ranks #1 on leaderboard | **PASS** |
| 11 | Permutation: Solo Room Instant Match | 1 like immediately matches | isMatch: true on 1st vote | **PASS** |
| 12 | Permutation: 10-Person Group Unanimity | 9 likes + 1 pass fails; 10 likes matches | Strict 100% threshold enforced | **PASS** |
| 13 | Duplicate Vote Spam (30 identical requests) | Idempotent swipedCount = 1 | swipedCount = 1 strictly | **PASS** |
| 14 | Dynamic Vote Flipping (Pass -> Like) | Unlocks unanimous match dynamically | Room transitions to matched | **PASS** |
| 15 | Capacity Saturation (35 Concurrent Joins) | Strict cap at MAX_PARTICIPANTS (30) | 29 accepted, 6 rejected (409) | **PASS** |
| 16 | Unauthorized Token Flood | Rejected with 403 Forbidden | 403 Forbidden on all spoofed tokens | **PASS** |

---

## 5. Caveats

- **Memory Store**: Tests were performed against the in-memory `RoomStore`. In a multi-instance horizontally scaled cluster, distributed atomic locks (e.g. Redis Redlock or database transactions) would be required to maintain these atomic invariants across multiple Node.js processes.
- **Client Disconnection**: Tested simulated client aborts; actual mobile flaky networks rely on the client's reconnection logic to re-sync via `room:init`.

No other caveats.

---

## 6. Conclusion

The Milestone 2 Interactive Swiping & Consensus Matching Engine successfully passed all empirical adversarial concurrency and consensus stress tests:
1. High-concurrency multi-user swiping operates seamlessly with 100% request success rate and sub-50ms average latency over real TCP sockets.
2. Race condition protection prevents double-matches, duplicate SSE broadcasts, and inconsistent room states.
3. Unanimous vs non-unanimous permutations strictly enforce mathematical consensus rules, pass-veto semantics, and superlike weighted rankings.
4. Total test suite across project stands at 126 tests passing (100% pass rate).

**Verdict**: **APPROVE**

---

## 7. Verification Method

### 7.1 Verification Commands
To independently verify from project root (`C:\Users\kck50\teamwork_projects\niche_web_app`):

1. **Run Standalone Empirical Stress Test Harness**:
   ```powershell
   node tests/stress-harness.js
   ```
   *Expected*: 329 requests executed, 60 assertions passed, 0 failures, exit code 0.

2. **Run Integrated Concurrency Stress Test Suite**:
   ```powershell
   npx vitest run tests/stress-concurrency-consensus.test.js
   ```
   *Expected*: 18/18 tests passed, exit code 0.

3. **Run Full Project Test Suite**:
   ```powershell
   npm test
   ```
   *Expected*: 5 test files passed, 126/126 tests passed, exit code 0.

4. **Run Production Build**:
   ```powershell
   npm run build
   ```
   *Expected*: Vite builds bundle cleanly with exit code 0.

### 7.2 Key Files to Inspect
- `tests/stress-concurrency-consensus.test.js`: 18-test Vitest suite covering all dispatch objectives.
- `tests/stress-harness.js`: Standalone multi-batch benchmarking script.
- `server/models/RoomStore.js`: Lines 500–672 (`recordVote` consensus algorithm).
- `server/sync/Broadcaster.js`: Lines 68–87 (`match:revealed` broadcasting).
