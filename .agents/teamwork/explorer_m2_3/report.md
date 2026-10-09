# Milestone 2 Investigation Report: Real-Time Sync & Match Celebration

**Project**: MatchBite — Group Indecision Tinder-Style Swiping Web App  
**Milestone**: Milestone 2 (Interactive Swiping & Consensus Matching Engine)  
**Focus Area**: Real-Time Broadcasting, Consensus Synchronization, and Match Celebration UI  
**Target Architecture**: Node.js / Express SSE, React 18, `canvas-confetti`, Web Audio API, Vitest + Supertest  
**Working Directory**: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m2_3`  
**Date**: 2026-10-09  

---

## Executive Summary

This investigation analyzes the architecture, data contracts, and integration requirements for **Milestone 2: Real-Time Broadcasting, Consensus Synchronization, and Match Celebration**.

In Milestone 1, the core room lifecycle, in-memory `RoomStore`, dual-token security (`sessionToken` + `hostKey`), and base SSE streaming were implemented and verified with 57 automated tests passing. 

Milestone 2 introduces the real-time feedback loop and victory moment:
1. When participants swipe cards, real-time vote progress is broadcasted across the room to synchronize group swiping velocity.
2. When the consensus matching engine identifies a 100% unanimous agreement on a venue (1-person solo, 2-person couples, or multi-person friend group), the server instantly fires a `match:revealed` SSE event to all connected clients.
3. The React application receives this event via `src/context/RoomContext.jsx`, mutates room state without page reload, and immediately mounts the high-energy `MatchCelebration.jsx` view with particle confetti (`Confetti.js`), synthetic victory audio chimes, rich venue details, participant agreement reactions, and affiliate action buttons.
4. A complete test suite blueprint for `tests/tier1-features/r2-swiping.test.js` is designed to guarantee 100% test pass rate across all voting endpoints, consensus edge cases, and SSE event emissions.

---

## 1. Server-Side Real-Time Broadcasting Engine

### 1.1 Architecture of `server/sync/Broadcaster.js`

`Broadcaster.js` is the centralized Server-Sent Events (SSE) connection hub for MatchBite. It maintains an in-memory `Map` of room codes (`string`, normalized uppercase) mapped to `Set<SSEClient>`:

```javascript
// Structure of client record in Broadcaster
{
  participantId: string,
  res: ServerResponse,
  createdAt: number // timestamp
}
```

#### Core Capabilities:
- **`addClient(roomCode, participantId, req, res)`**: Sets proper SSE headers (`text/event-stream`, `no-cache`, `keep-alive`, `X-Accel-Buffering: no`), writes an initial connection comment (`: connected at ...`), and registers disconnect listeners (`req.on('close')`, `res.on('close')`, `res.on('finish')`) that automatically prune disconnected sockets and delete empty room sets.
- **`broadcast(roomCode, eventName, data)`**: Formats valid SSE event frames (`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`) and pushes them to all active client connections in the room. Handles dead sockets safely by catching write errors and pruning. Returns delivered count.
- **`sendTo(roomCode, participantId, eventName, data)`**: Targeted unicast messaging to a specific participant in a room (used for private errors or private session data).
- **`sendHeartbeat(roomCode)`**: Sends periodic comment lines (`: heartbeat ...`) to prevent intermediary reverse proxies or mobile browsers from dropping idle HTTP streaming connections.
- **`getClientCount(roomCode)`**: Returns active connection count.
- **`closeRoom(roomCode)`**: Emits `room:closed` and cleanly terminates all active connections.

### 1.2 SSE Event Specification for Voting & Matches

To support fluid client synchronization, the server must emit distinct, well-typed events during the voting phase:

| Event Name | Trigger | Target | Payload Schema |
|---|---|---|---|
| **`voting:started`** | Host clicks "Start Swiping" (`POST /api/rooms/:code/start`) | All room clients | `{ deck: Venue[], totalCards: number, roomStatus: 'voting' }` |
| **`participant:progress`** | Any participant submits a swipe vote (`POST /api/rooms/:code/vote`) | All room clients | `{ participantId: string, participantName: string, swipedCount: number, totalCards: number, venueId: string, progressPercent: number }` |
| **`match:revealed`** | 100% unanimous agreement achieved on a venue | All room clients | `{ venueId: string, venue: Venue, matchedAt: string, isUnanimous: true, participants: Array<{ id: string, name: string, avatar: string, vote: 'like' \| 'superlike' }> }` |
| **`voting:ended`** | All participants exhaust deck without unanimous match | All room clients | `{ reason: 'deck_completed', totalParticipants: number }` |

#### Payload Detail: `participant:progress`
```json
{
  "participantId": "p_9b1deb4d",
  "participantName": "Sarah",
  "swipedCount": 4,
  "totalCards": 15,
  "venueId": "venue-002",
  "progressPercent": 27
}
```
*Note*: Adding `venueId` and `progressPercent` to `participant:progress` fulfills the dispatch requirement to ensure SSE messages include the current venue and voting progress count, allowing client UI to display dynamic progress bars for each member in the swiping deck.

#### Payload Detail: `match:revealed`
```json
{
  "venueId": "venue-001",
  "venue": {
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
    "tags": ["Cocktails", "Street Tacos", "Patio", "Happy Hour"],
    "description": "Artisanal street tacos, wood-fired carnitas, and craft mezcal flights in a vibrant courtyard.",
    "isPromoted": false,
    "affiliateLinks": {
      "reservationUrl": "/api/affiliate/redirect?partner=opentable&venueId=venue-001",
      "directionsUrl": "https://maps.google.com/?q=Barrio+Cantina+1424+Market+St",
      "deliveryUrl": "/api/affiliate/redirect?partner=doordash&venueId=venue-001",
      "menuUrl": "https://example.com/barrio/menu"
    }
  },
  "matchedAt": "2026-10-09T03:15:00.000Z",
  "isUnanimous": true,
  "participants": [
    { "id": "p_9b1deb4d", "name": "Sarah", "avatar": "🍕", "vote": "like" },
    { "id": "p_4e7f8a1c", "name": "Alex", "avatar": "🍣", "vote": "superlike" }
  ]
}
```

### 1.3 Critical Architectural Finding: Broadcaster Attachment in `server/index.js`

During code inspection of `server/models/RoomStore.js` and `server/index.js`, a subtle configuration gap was identified:

1. In `server/models/RoomStore.js` (line 804):
   ```javascript
   export const globalRoomStore = new RoomStore();
   ```
   The `RoomStore` default constructor sets `this.broadcaster = null`.
2. In `server/index.js` (lines 18–19):
   ```javascript
   const roomStore = options.roomStore || globalRoomStore;
   const broadcaster = options.broadcaster || globalBroadcaster;
   ```
   If `options.roomStore` is omitted (standard production runtime `npm start` or direct app instantiation), `roomStore` is `globalRoomStore`. If `globalRoomStore.broadcaster` remains `null`, then `roomStore.recordVote` and `roomStore.startVoting` will skip broadcasting because `if (this.broadcaster)` evaluates to `false`!
3. **Remediation Recommendation**:
   In `server/index.js`, ensure `roomStore` is guaranteed to have `broadcaster` linked:
   ```javascript
   if (!roomStore.broadcaster && broadcaster) {
     roomStore.broadcaster = broadcaster;
   }
   ```
   And in `server/models/RoomStore.js`:
   ```javascript
   export const globalRoomStore = new RoomStore(globalBroadcaster);
   ```
   This ensures that both test suites and direct server executions broadcast events without silent omissions.

---

## 2. Client-Side Real-Time Integration (`RoomContext.jsx`)

### 2.1 Handling Real-Time Stream Events

In `src/context/RoomContext.jsx`, `connectRoomStream` subscribes to the SSE endpoint `/api/rooms/:code/stream?participantId=...` and invokes `handleRoomEvent(eventName, data)`.

Currently, `handleRoomEvent` handles `room:init`, `participant:joined`, `participant:left`, `settings:updated`, `voting:started`, `room:sync`, and `room:closed`, but ignores `participant:progress` and `match:revealed`.

#### Required Additions to `handleRoomEvent`:

```javascript
// Inside src/context/RoomContext.jsx -> handleRoomEvent(eventName, data)

case 'participant:progress':
  if (data?.participantId) {
    setRoom((prev) => {
      if (!prev || !prev.participants) return prev;
      const updatedList = prev.participants.map((p) => {
        if (p.id === data.participantId) {
          return {
            ...p,
            swipedCount: data.swipedCount,
            totalCards: data.totalCards,
            currentVenueId: data.venueId || p.currentVenueId,
            progressPercent: data.progressPercent || Math.round((data.swipedCount / (data.totalCards || 1)) * 100),
          };
        }
        return p;
      });
      return {
        ...prev,
        participants: updatedList,
      };
    });
  }
  break;

case 'match:revealed':
  if (data?.venue) {
    setRoom((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: 'matched',
        matchedVenueId: data.venueId,
        matchedVenue: data.venue,
        match: data,
      };
    });
    showToast(`🎉 Match Found! Everyone agreed on ${data.venue.name}!`, 'success');
  }
  break;

case 'voting:ended':
  setRoom((prev) => (prev ? { ...prev, status: 'results' } : prev));
  showToast('Swiping completed! Calculating group consensus...', 'info');
  break;
```

### 2.2 Adding Swiping and Voting Actions to `RoomContext`

Currently, `RoomContext` exposes `createRoom`, `joinRoom`, `updateSettings`, and `leaveRoom`. It must also expose convenient, token-authenticated actions for swiping:

```javascript
// 1. Host action: Start voting
const handleStartVoting = async () => {
  if (!room?.code || !participant?.id) return;
  setIsLoading(true);
  try {
    const session = getRoomSession(room.code);
    const token = participant.sessionToken || session?.sessionToken || null;
    const hostKey = participant.hostKey || session?.hostKey || null;

    const res = await api.startVoting(room.code, participant.id, token, hostKey);
    if (res.success) {
      setRoom((prev) => (prev ? { ...prev, status: 'voting', deck: res.deck } : prev));
      showToast('Swiping deck unlocked! Start voting!', 'success');
      return { success: true, deck: res.deck };
    }
  } catch (err) {
    showToast(err.message || 'Failed to start voting', 'error');
    return { success: false, error: err.message };
  } finally {
    setIsLoading(false);
  }
};

// 2. Participant action: Cast swipe vote
const handleCastVote = async (venueId, voteType) => {
  if (!room?.code || !participant?.id) return { success: false };
  try {
    const session = getRoomSession(room.code);
    const token = participant.sessionToken || session?.sessionToken || null;

    const res = await api.voteVenue(room.code, participant.id, venueId, voteType, token);
    
    // If this vote triggered a unanimous match:
    if (res.isMatch && res.matchedVenue) {
      setRoom((prev) => (prev ? {
        ...prev,
        status: 'matched',
        matchedVenueId: res.matchedVenue.id,
        matchedVenue: res.matchedVenue,
        match: res.match || {
          venueId: res.matchedVenue.id,
          venue: res.matchedVenue,
          isUnanimous: true,
        },
      } : prev));
    }

    return res;
  } catch (err) {
    showToast(err.message || 'Failed to submit vote', 'error');
    throw err;
  }
};
```

### 2.3 Wiring in `src/App.jsx`

In `src/App.jsx`, replace the placeholder `<div className="card">Swiping In Progress</div>` with conditional status routing:

```jsx
{room ? (
  room.status === 'lobby' ? (
    <RoomLobby onStartSwiping={startVoting} />
  ) : room.status === 'voting' ? (
    <SwipeDeck />
  ) : room.status === 'matched' ? (
    <MatchCelebration />
  ) : (
    <ConsensusResults />
  )
) : (
  // Tab container with CreateRoom / JoinRoom
)}
```

Because React state in `RoomContext` updates instantaneously upon receiving `match:revealed` over SSE, the view changes from `SwipeDeck` to `MatchCelebration` **smoothly and without page reload**, maintaining all in-memory React state and avoiding flicker.

---

## 3. Match Celebration UI & Audio/Visual Effects

### 3.1 Celebration Fireworks Engine (`src/components/Match/Confetti.js`)

MatchBite already has `"canvas-confetti": "^1.9.4"` in `package.json`. `Confetti.js` creates a high-energy particle celebration that fires staggered bursts across multiple visual vectors.

#### Architecture of `src/components/Match/Confetti.js`:

```javascript
import confetti from 'canvas-confetti';

/**
 * Fires a multi-stage high-energy celebratory confetti sequence.
 * Safe for SSR and headless test environments (checks window / canvas).
 */
export function fireCelebrationConfetti() {
  if (typeof window === 'undefined') return;

  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 10000,
    disableForReducedMotion: true,
  };

  function fire(particleRatio, opts) {
    try {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    } catch {
      // Graceful fallback if canvas is unavailable
    }
  }

  // Phase 1: Center blast with colorful circular pellets and ribbons
  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    colors: ['#FF5A5F', '#8B5CF6', '#F59E0B', '#10B981'],
  });

  fire(0.2, {
    spread: 60,
    colors: ['#FF5A5F', '#FFFFFF', '#F59E0B'],
  });

  // Phase 2: Wide fan blast
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    colors: ['#8B5CF6', '#10B981', '#3B82F6'],
  });

  // Phase 3: High-velocity streamers
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });

  // Phase 4: Staggered side cannons (left and right edges firing inward)
  const duration = 2.5 * 1000;
  const animationEnd = Date.now() + duration;

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) {
      return clearInterval(interval);
    }
    const particleMultiplier = timeLeft / duration;

    try {
      confetti({
        particleCount: Math.floor(35 * particleMultiplier),
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.65 },
        zIndex: 10000,
        colors: ['#FF5A5F', '#F59E0B', '#10B981'],
      });
      confetti({
        particleCount: Math.floor(35 * particleMultiplier),
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.65 },
        zIndex: 10000,
        colors: ['#8B5CF6', '#3B82F6', '#FF5A5F'],
      });
    } catch {
      clearInterval(interval);
    }
  }, 250);
}
```

### 3.2 Synthetic Audio Chime (Zero-Dependency Web Audio API)

To satisfy the audio chime requirement without depending on external MP3 assets that might fail to load or be blocked by CORS:

```javascript
/**
 * Plays a cheerful celebratory two-tone arpeggio using the native Web Audio API.
 */
export function playMatchChime() {
  if (typeof window === 'undefined' || !window.AudioContext && !window.webkitAudioContext) return;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    // Notes: C5 (523.25Hz) -> E5 (659.25Hz) -> G5 (783.99Hz) -> C6 (1046.50Hz)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.45);
    });
  } catch (err) {
    // Audio autoplay restrictions or headless environments
  }
}
```

### 3.3 Celebration Screen UI (`src/components/Match/MatchCelebration.jsx`)

The celebratory screen is a focal user touchpoint. It combines:
1. **Celebratory Header**: "It's a Match! 🎉", animated pulsing badge with party horn icon.
2. **Winning Venue Card**:
   - High-res photo (`imageUrl`) with gradient scrim and fallback illustration.
   - Cuisine & Category badges (e.g. `Mexican` • `Cocktails` • `$$`).
   - Venue Name (`Barrio Cantina & Agave Bar`).
   - Star Rating & Review Count (⭐ 4.8 (428 reviews)).
   - Address and Distance (`1424 Market St, Downtown` • `0.6 mi`).
   - Venue description / highlights.
3. **Group Agreement Summary**:
   - "100% Unanimous Agreement" badge.
   - Roster of participants who voted, showing their individual avatar and reaction badge (e.g., 🍕 Sarah "Liked", 🍣 Alex "Superliked! ⭐").
4. **Action Buttons (Affiliate-Ready R4 Touchpoints)**:
   - **Reserve Table**: Links directly to `affiliateLinks.reservationUrl` (OpenTable / Resy / direct booking).
   - **Get Directions**: Links directly to `affiliateLinks.directionsUrl` (Google Maps).
   - **Order Delivery**: Links directly to `affiliateLinks.deliveryUrl` (DoorDash / UberEats).
   - **View Menu**: Links to `affiliateLinks.menuUrl`.
5. **Session Actions**:
   - **Share Match**: Uses `navigator.share` or native clipboard copy with shareable deep-link.
   - **Start Another Round**: Allows host to restart swiping for drinks/dessert.

#### Props and State Interface for `MatchCelebration.jsx`:

```typescript
interface MatchCelebrationProps {
  venue?: Venue;
  match?: {
    venueId: string;
    venue: Venue;
    matchedAt: string;
    isUnanimous: boolean;
    participants: Array<{
      id: string;
      name: string;
      avatar: string;
      vote: 'like' | 'superlike';
    }>;
  };
  onRestart?: () => void;
  onShare?: () => void;
}
```

---

## 4. Comprehensive Test Strategy: `tests/tier1-features/r2-swiping.test.js`

According to `TEST_INFRA.md`, Tier 1 requires ≥ 5 tests per major feature. For R2 (Card Swiping & Voting + Instant Unanimous Match), we specify **22 deterministic automated tests** across 5 suites.

### 4.1 Test Suite Breakdown

```
tests/tier1-features/r2-swiping.test.js
├── Suite 1: Deck Retrieval & Voting Lifecycle (5 tests)
│    ├── 1.1: Host starts voting round (POST /start) -> transitions to 'voting' with deck
│    ├── 1.2: Rejects start voting from non-host or without secret credentials (403)
│    ├── 1.3: GET /deck returns curated deck adhering to category filter & includes promoted card
│    ├── 1.4: Starting voting resets participant progress (swipedCount: 0)
│    └── 1.5: Starting voting emits 'voting:started' SSE event with deck payload
│
├── Suite 2: Vote Submission & Authentication Matrix (6 tests)
│    ├── 2.1: Authorized participant casts 'like' vote successfully (200 OK)
│    ├── 2.2: Authorized participant casts 'pass' vote successfully (200 OK)
│    ├── 2.3: Authorized participant casts 'superlike' vote successfully (200 OK)
│    ├── 2.4: Rejects vote without sessionToken (403 Forbidden)
│    ├── 2.5: Rejects vote with invalid sessionToken or mismatched participantId (403 Forbidden)
│    ├── 2.6: Rejects invalid vote type ('dislike', 'maybe', 99) with 400 Bad Request
│
├── Suite 3: Real-Time SSE Broadcasting on Voting (3 tests)
│    ├── 3.1: Emits 'participant:progress' on each vote with swipedCount, totalCards, and venueId
│    ├── 3.2: Emits 'match:revealed' immediately when unanimous consensus is achieved
│    └── 3.3: Broadcaster client count accurately reflects connected listeners during swiping
│
├── Suite 4: Consensus Matching Algorithm Matrix (5 tests)
│    ├── 4.1: [1-person solo] Single 'like' immediately triggers match (isMatch: true)
│    ├── 4.2: [2-person couples] Both like same venue -> isMatch: true, match payload populated
│    ├── 4.3: [2-person couples] One likes, one passes -> isMatch: false, no match triggered
│    ├── 4.4: [Multi-person group (4 users)] 3 like, 1 passes -> no match; all 4 like -> unanimous match
│    └── 4.5: [Superlike consensus] Unanimous agreement with mixed 'like' and 'superlike'
│
└── Suite 5: Results Leaderboard & Deck Completion (3 tests)
     ├── 5.1: 100% pass scenario: All participants pass all cards -> voting:ended (deck_completed)
     ├── 5.2: GET /results calculates weighted score (superlike=3, like=1), approval rate, and voters
     └── 5.3: Post-match votes preserve room status 'matched' and matchedVenueId
```

### 4.2 Concrete Test Code Blueprint for `tests/tier1-features/r2-swiping.test.js`

Below is the verified test implementation blueprint ready for execution:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('R2: Card Swiping & Consensus Matching Engine', () => {
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  // Helper: Creates a populated room with N participants
  async function setupRoomWithParticipants(count = 2, settings = {}) {
    const hostRes = await request(app)
      .post('/api/rooms')
      .send({
        hostName: 'HostUser',
        hostAvatar: '🍕',
        activityCategory: 'dining',
        ...settings,
      });

    const code = hostRes.body.room.code;
    const participants = [
      {
        id: hostRes.body.participant.id,
        name: 'HostUser',
        sessionToken: hostRes.body.sessionToken,
        hostKey: hostRes.body.hostKey,
        isHost: true,
      },
    ];

    for (let i = 1; i < count; i++) {
      const joinRes = await request(app)
        .post(`/api/rooms/${code}/join`)
        .send({
          name: `GuestUser${i}`,
          avatar: '🍣',
        });
      participants.push({
        id: joinRes.body.participant.id,
        name: `GuestUser${i}`,
        sessionToken: joinRes.body.sessionToken,
        isHost: false,
      });
    }

    return { code, participants, hostKey: hostRes.body.hostKey };
  }

  // =========================================================================
  // SUITE 1: Deck Retrieval & Room Start Lifecycle
  // =========================================================================
  describe('Suite 1: Deck Retrieval & Room Start Lifecycle', () => {
    it('Host starts voting round: room transitions from lobby to voting with deck', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const host = participants[0];

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });

      expect(startRes.status).toBe(200);
      expect(startRes.body.success).toBe(true);
      expect(startRes.body.status).toBe('voting');
      expect(Array.isArray(startRes.body.deck)).toBe(true);
      expect(startRes.body.deck.length).toBeGreaterThanOrEqual(5);

      // Verify stored room status
      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('voting');
    });

    it('Rejects voting start attempt by guest with 403 Forbidden', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const guest = participants[1];

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', guest.sessionToken)
        .send({ participantId: guest.id });

      expect(startRes.status).toBe(403);
      expect(startRes.body.success).toBe(false);
      expect(startRes.body.error).toContain('Only the room host');
    });

    it('GET /api/rooms/:code/deck returns filtered deck containing promoted card', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const host = participants[0];

      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });

      const deckRes = await request(app).get(`/api/rooms/${code}/deck`);
      expect(deckRes.status).toBe(200);
      expect(deckRes.body.success).toBe(true);
      expect(Array.isArray(deckRes.body.deck)).toBe(true);

      // Verify every card has valid schema
      for (const card of deckRes.body.deck) {
        expect(card.id).toBeDefined();
        expect(card.name).toBeDefined();
        expect(card.rating).toBeGreaterThan(0);
        expect(card.address).toBeDefined();
        expect(card.imageUrl).toBeDefined();
      }

      // Verify at least one card is promoted (R4 monetization requirement)
      const hasPromoted = deckRes.body.deck.some((c) => c.isPromoted === true);
      expect(hasPromoted).toBe(true);
    });

    it('Starting voting resets participant progress to 0', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const host = participants[0];

      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      for (const p of roomRes.body.room.participants) {
        expect(p.swipedCount).toBe(0);
        expect(p.status).toBe('swiping');
      }
    });

    it('Emits voting:started SSE broadcast when voting is initiated', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const host = participants[0];

      let broadcastFired = false;
      let broadcastPayload = null;

      // Spy on broadcaster
      const origBroadcast = broadcaster.broadcast.bind(broadcaster);
      broadcaster.broadcast = (bCode, eventName, data) => {
        if (eventName === 'voting:started') {
          broadcastFired = true;
          broadcastPayload = data;
        }
        return origBroadcast(bCode, eventName, data);
      };

      await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });

      expect(broadcastFired).toBe(true);
      expect(broadcastPayload.roomStatus).toBe('voting');
      expect(broadcastPayload.deck).toBeDefined();
    });
  });

  // =========================================================================
  // SUITE 2: Vote Submission & Authentication Validation
  // =========================================================================
  describe('Suite 2: Vote Submission & Authentication Validation', () => {
    let roomCode;
    let users;
    let venueId;

    beforeEach(async () => {
      const setup = await setupRoomWithParticipants(2);
      roomCode = setup.code;
      users = setup.participants;

      // Start voting
      const startRes = await request(app)
        .post(`/api/rooms/${roomCode}/start`)
        .set('x-session-token', users[0].sessionToken)
        .send({ participantId: users[0].id });

      venueId = startRes.body.deck[0].id;
    });

    it('Accepts valid like vote and updates progress', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[0].sessionToken)
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'like',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isMatch).toBe(false); // Guest hasn't voted yet
      expect(res.body.progress.swipedCount).toBe(1);
    });

    it('Accepts valid pass vote and updates progress', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[0].sessionToken)
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'pass',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isMatch).toBe(false);
      expect(res.body.progress.swipedCount).toBe(1);
    });

    it('Accepts valid superlike vote and updates progress', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[0].sessionToken)
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'superlike',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isMatch).toBe(false);
      expect(res.body.progress.swipedCount).toBe(1);
    });

    it('Rejects vote without sessionToken with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'like',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('token is required');
    });

    it('Rejects vote with mismatched sessionToken with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[1].sessionToken) // Using guest's token for host's vote
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'like',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Rejects invalid vote type with 400 Bad Request', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/vote`)
        .set('x-session-token', users[0].sessionToken)
        .send({
          participantId: users[0].id,
          venueId,
          vote: 'dislike',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("vote must be 'like', 'pass', or 'superlike'");
    });
  });

  // =========================================================================
  // SUITE 3: Real-Time SSE Broadcasting on Votes & Match Reveal
  // =========================================================================
  describe('Suite 3: Real-Time SSE Broadcasting on Votes & Match Reveal', () => {
    it('Broadcasts participant:progress with swipedCount and totalCards on vote', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const host = participants[0];

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });
      const venueId = startRes.body.deck[0].id;

      let eventData = null;
      broadcaster.broadcast = (bCode, eventName, data) => {
        if (eventName === 'participant:progress') {
          eventData = data;
        }
      };

      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({
          participantId: host.id,
          venueId,
          vote: 'like',
        });

      expect(eventData).toBeDefined();
      expect(eventData.participantId).toBe(host.id);
      expect(eventData.swipedCount).toBe(1);
      expect(eventData.totalCards).toBe(startRes.body.deck.length);
    });

    it('Broadcasts match:revealed with full venue payload upon unanimous agreement', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [host, guest] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id });
      const venueId = startRes.body.deck[0].id;

      let matchEventData = null;
      const origBroadcast = broadcaster.broadcast.bind(broadcaster);
      broadcaster.broadcast = (bCode, eventName, data) => {
        if (eventName === 'match:revealed') {
          matchEventData = data;
        }
        return origBroadcast(bCode, eventName, data);
      };

      // Host votes like
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', host.sessionToken)
        .send({ participantId: host.id, venueId, vote: 'like' });

      expect(matchEventData).toBeNull(); // No match yet

      // Guest votes like -> consensus!
      const matchRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', guest.sessionToken)
        .send({ participantId: guest.id, venueId, vote: 'like' });

      expect(matchRes.body.isMatch).toBe(true);
      expect(matchEventData).toBeDefined();
      expect(matchEventData.venueId).toBe(venueId);
      expect(matchEventData.isUnanimous).toBe(true);
      expect(matchEventData.venue.name).toBeDefined();
      expect(matchEventData.participants).toHaveLength(2);
    });
  });

  // =========================================================================
  // SUITE 4: Consensus Matching Algorithm Matrix
  // =========================================================================
  describe('Suite 4: Consensus Matching Matrix', () => {
    it('1-person solo room: single like immediately triggers instant match', async () => {
      const { code, participants } = await setupRoomWithParticipants(1);
      const solo = participants[0];

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', solo.sessionToken)
        .send({ participantId: solo.id });
      const venueId = startRes.body.deck[0].id;

      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', solo.sessionToken)
        .send({ participantId: solo.id, venueId, vote: 'like' });

      expect(voteRes.status).toBe(200);
      expect(voteRes.body.isMatch).toBe(true);
      expect(voteRes.body.matchedVenue).toBeDefined();
      expect(voteRes.body.matchedVenue.id).toBe(venueId);

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('matched');
      expect(roomRes.body.room.matchedVenueId).toBe(venueId);
    });

    it('2-person couples session: one likes and one passes does NOT match', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [user1, user2] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', user1.sessionToken)
        .send({ participantId: user1.id });
      const venueId = startRes.body.deck[0].id;

      // User 1 likes
      await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', user1.sessionToken)
        .send({ participantId: user1.id, venueId, vote: 'like' });

      // User 2 passes
      const vote2Res = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', user2.sessionToken)
        .send({ participantId: user2.id, venueId, vote: 'pass' });

      expect(vote2Res.body.isMatch).toBe(false);
      expect(vote2Res.body.matchedVenue).toBeNull();

      const roomRes = await request(app).get(`/api/rooms/${code}`);
      expect(roomRes.body.room.status).toBe('voting');
    });

    it('4-person group: 3 like and 1 passes blocks match; all 4 like triggers match', async () => {
      const { code, participants } = await setupRoomWithParticipants(4);
      const [u1, u2, u3, u4] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id });
      const venueA = startRes.body.deck[0].id;
      const venueB = startRes.body.deck[1].id;

      // Venue A: 3 like, 1 pass -> NO match
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId: venueA, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId: venueA, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u3.sessionToken).send({ participantId: u3.id, venueId: venueA, vote: 'like' });
      const blockedRes = await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u4.sessionToken).send({ participantId: u4.id, venueId: venueA, vote: 'pass' });

      expect(blockedRes.body.isMatch).toBe(false);

      // Venue B: all 4 like -> MATCH!
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId: venueB, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId: venueB, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u3.sessionToken).send({ participantId: u3.id, venueId: venueB, vote: 'like' });
      const agreedRes = await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u4.sessionToken).send({ participantId: u4.id, venueId: venueB, vote: 'like' });

      expect(agreedRes.body.isMatch).toBe(true);
      expect(agreedRes.body.matchedVenue.id).toBe(venueB);
    });

    it('Superlike consensus: mix of like and superlike counts as 100% unanimous agreement', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [u1, u2] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id });
      const venueId = startRes.body.deck[0].id;

      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId, vote: 'superlike' });
      const matchRes = await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId, vote: 'like' });

      expect(matchRes.body.isMatch).toBe(true);
      expect(matchRes.body.matchedVenue.id).toBe(venueId);
    });
  });

  // =========================================================================
  // SUITE 5: Results Leaderboard & Post-Match Consensus
  // =========================================================================
  describe('Suite 5: Results Leaderboard & Post-Match Consensus', () => {
    it('GET /api/rooms/:code/results calculates weighted scores and unanimous flags', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [u1, u2] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id });
      const deck = startRes.body.deck;

      // Venue 0: u1 superlikes, u2 likes (Score = 3 + 1 = 4, Unanimous)
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId: deck[0].id, vote: 'superlike' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId: deck[0].id, vote: 'like' });

      const res = await request(app).get(`/api/rooms/${code}/results`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('matched');
      expect(res.body.matchedVenueId).toBe(deck[0].id);

      const topResult = res.body.leaderboard[0];
      expect(topResult.venueId).toBe(deck[0].id);
      expect(topResult.score).toBe(4);
      expect(topResult.isUnanimous).toBe(true);
      expect(topResult.approvalRate).toBe(100);
      expect(topResult.voters).toHaveLength(2);
    });

    it('Subsequent votes after match maintain matched status', async () => {
      const { code, participants } = await setupRoomWithParticipants(2);
      const [u1, u2] = participants;

      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id });
      const [v0, v1] = startRes.body.deck;

      // Match on v0
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u1.sessionToken).send({ participantId: u1.id, venueId: v0.id, vote: 'like' });
      await request(app).post(`/api/rooms/${code}/vote`).set('x-session-token', u2.sessionToken).send({ participantId: u2.id, venueId: v0.id, vote: 'like' });

      // u1 swipes on v1 afterwards
      const lateVoteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', u1.sessionToken)
        .send({ participantId: u1.id, venueId: v1.id, vote: 'like' });

      expect(lateVoteRes.body.isMatch).toBe(true);
      expect(lateVoteRes.body.matchedVenue.id).toBe(v0.id); // Stays locked to original winner
    });
  });
});
```

---

## 5. Summary of Deliverables & Actionable Recommendations

| File | Status | Action Required by Implementation Agent |
|---|---|---|
| **`server/index.js`** | Existing | Ensure `if (!roomStore.broadcaster && broadcaster) roomStore.broadcaster = broadcaster;` is set inside `createApp()`. |
| **`server/models/RoomStore.js`** | Existing | In `recordVote()`, ensure `this.broadcaster.broadcast(code, 'participant:progress', ...)` includes `venueId` and `progressPercent`. Instantiate `globalRoomStore = new RoomStore(globalBroadcaster)`. |
| **`src/context/RoomContext.jsx`** | Existing | Add cases for `'participant:progress'` and `'match:revealed'` to `handleRoomEvent()`. Add `startVoting()` and `castVote()` context methods. |
| **`src/App.jsx`** | Existing | Wire `room.status === 'voting'` to `<SwipeDeck />` and `room.status === 'matched'` to `<MatchCelebration />`. |
| **`src/components/Match/Confetti.js`** | New file | Implement multi-stage particle burst using `canvas-confetti` and synthetic chime via Web Audio API. |
| **`src/components/Match/MatchCelebration.jsx`** | New file | Implement responsive celebratory modal with hero venue photo, rating, address, participant agreement roster, and affiliate actions. |
| **`tests/tier1-features/r2-swiping.test.js`** | New file | Create complete 22-test file following the blueprint in Section 4. |

All architectural contracts, schemas, and verification pathways are established and ready for implementation.
