# Technical Survey & Architecture Specification: System Architecture, Tech Stack & Room Management (R1)

**Project**: Group Indecision Tinder-Style Swiping Web App (`niche_web_app`)  
**Document Status**: Proposal & Technical Specification  
**Author**: Explorer Survey Agent (`explorer_survey_2_1`)  
**Date**: October 2026  
**Reference Document**: `ORIGINAL_REQUEST.md` (Update 2026-10-08T22:04:30Z)

---

## 1. Executive Summary & Architectural Vision

### 1.1 The Core Problem & Product Mission
Couples, friend groups, and coworkers routinely suffer from social indecision when picking dining, nightlife, or weekend activities. Endless group chat debates ("What are you in the mood for?", "I don't care, whatever you want") waste time and generate decision fatigue.

This application solves indecision through a frictionless, viral, Tinder-style card swiping mechanism:
1. **Zero-friction entry**: A host creates a room in under 10 seconds. Friends join via a short, memorable room code (e.g., `TACO42`) or 1-tap shareable link—**no app store installs, no mandatory account signups, no passwords**.
2. **Synchronous or asynchronous swiping**: Each participant swipes Right (Like) or Left (Pass) on a curated deck of local spots (dining, bars, entertainment).
3. **Instant consensus trigger**: The millisecond all active room members vote "Right" on the same venue, the app triggers an immediate celebratory "Match!" screen with confetti and direct booking/directions action links.
4. **Tie-breaking safety net**: If the deck concludes without a 100% unanimous match, the app automatically transitions to an interactive runner-up decision helper (roulette spin wheel or ranked-choice scoring).
5. **Passive monetization**: Winning cards feature tracked affiliate actions (OpenTable, Resy, DoorDash, UberEats, Google Maps), promoted venue cards appear natively in the deck, and optional premium room upgrades provide monetization touchpoints.

### 1.2 Architectural Tenets
To ensure viral sharing, flawless execution in automated testing, and zero deployment friction:
- **Zero-Dependency Headache**: A single root `package.json` containing standard, battle-tested dependencies. No complex monorepo tooling (`lerna`, `turborepo`, `nx`), no native C++ compile steps, no SQLite/Postgres binaries required for local evaluation.
- **Single-Command Startup**:
  - `npm run dev`: Boots full-stack development environment in one command.
  - `npm start`: Runs production-ready Node.js server serving both API endpoints and the compiled single-page application (SPA).
- **Single-Command Verification**: `npm test` runs a comprehensive Vitest + Supertest suite executing 100% of unit, integration, and API tests in seconds.
- **Dual-Mode State Sync**: Primary real-time synchronization via native **Server-Sent Events (SSE)** paired with an automatic **Smart Polling Fallback** for legacy or restricted mobile networks.

---

## 2. Technology Stack Evaluation & Recommendation

### 2.1 Stack Candidates Comparison Matrix

| Evaluation Criteria | Option A: Express + Vite/React (Recommended) | Option B: Next.js (App Router) | Option C: Remix / React Router v7 | Option D: Pure Node HTTP + Vanilla JS |
| :--- | :--- | :--- | :--- | :--- |
| **Startup Reliability (`npm start`)** | **High** (Deterministic Node process serving static SPA) | **Medium** (Hydration quirks, standalone build overhead) | **Medium** (Adapter complexity, build artifacts) | **High** (Minimal, but UI complexity explodes) |
| **Test Runner Speed (`npm test`)** | **Ultra-Fast** (<2s via Vitest + Supertest) | **Slow** (Jest/Next test runner configuration overhead) | **Medium** (Vitest with server mock setup) | **Fast** (Node test runner) |
| **Real-time SSE / Streaming** | **Native & Trivial** (Standard Express `res.write` chunking) | **Complex** (Edge/Serverless timeouts, buffering bugs) | **Moderate** (Server-Sent Event helpers) | **Native** (Manual stream handling) |
| **Touch/Swipe UI Ecosystem** | **Rich** (React hooks, Framer Motion, touch event abstractions) | **Rich** (React components) | **Rich** (React components) | **Poor** (Hand-crafted DOM manipulation & state bugs) |
| **Zero-Install / Frictionless** | **100%** (Client SPA loads in <200ms) | **Good** (Heavier initial JS bundle) | **Good** | **100%** |
| **Monorepo Complexity** | **None** (Unified single `package.json` at root) | **None** | **None** | **None** |

### 2.2 Recommended Architecture: Unified Express + Vite/React
We recommend a unified fullstack structure with **Node.js + Express** on the backend and **Vite + React (JavaScript/ESM)** on the frontend.

#### Why this wins:
1. **Zero-Configuration Vitest Integration**: Vitest natively shares Vite's build pipeline and executes both backend Supertest API tests and frontend utility/component tests without Babel, Webpack, or ts-node compilation hurdles.
2. **Clean Production Serving**: In production (`npm start`), Express acts as both the API server and the static asset server for the compiled Vite build in `dist/`. No reverse proxy (NGINX/Caddy) is mandatory for local preview or automated verification.
3. **Flawless SSE Implementation**: Express handles long-lived HTTP streaming connections (`text/event-stream`) cleanly without the connection-lifecycle limitations of serverless lambdas.
4. **Lightweight In-Memory Session Engine**: An in-memory room store with TTL expiration provides sub-millisecond query latency, instantaneous lock-free vote calculations, and zero external database setup.

### 2.3 Proposed Project Directory Structure
```
niche_web_app/
├── package.json               # Unified single package manifest
├── vite.config.js             # Vite configuration with /api proxy
├── index.html                 # Single Page Application HTML entry
├── .gitignore
├── server/
│   ├── index.js               # Express application entry & static server
│   ├── config.js              # Port, environment variables, TTL constants
│   ├── routes/
│   │   ├── rooms.js           # Room creation, joining, settings routes (R1)
│   │   ├── votes.js           # Swipe vote recording & consensus check (R2)
│   │   ├── tiebreaker.js      # Tie-breaking logic & wheel state (R3)
│   │   └── monetization.js    # Affiliate redirect & checkout routes (R4)
│   ├── models/
│   │   ├── RoomStore.js       # In-memory room repository with TTL cleanup
│   │   └── RoomCode.js        # Memorable room code generation engine
│   ├── sync/
│   │   └── Broadcaster.js     # Server-Sent Events (SSE) connection hub
│   └── data/
│       └── venues.json        # Curated venue deck (Dining, Bars, Coffee, Promoted)
├── src/
│   ├── main.jsx               # React DOM entry
│   ├── App.jsx                # Top-level view router & state provider
│   ├── index.css              # Responsive mobile-first CSS styling
│   ├── context/
│   │   └── RoomContext.jsx    # Real-time room state & synchronization provider
│   ├── components/
│   │   ├── Common/            # Header, Badges, Modals, Toast notifications
│   │   ├── Lobby/             # Room code display, QR/Link share, Roster, Settings
│   │   ├── Swiper/            # Card stack, touch drag gestures, action buttons
│   │   ├── Match/             # Instant match celebratory modal, confetti, actions
│   │   ├── Tiebreaker/        # Interactive roulette wheel & ranked leaderboard
│   │   └── Monetization/      # Promoted card badge, mock checkout modal
│   └── utils/
│       ├── api.js             # Fetch client & SSE event source manager
│       └── session.js         # LocalStorage participant identity persistence
└── tests/
    ├── setup.js               # Global test configuration
    ├── api/
    │   ├── rooms.test.js      # API tests for Room lifecycle & joining (R1)
    │   ├── votes.test.js      # Multi-user voting & match engine tests (R2)
    │   ├── tiebreaker.test.js # Tie-breaking fallback tests (R3)
    │   └── monetization.test.js # Affiliate tracking & checkout tests (R4)
    └── unit/
        ├── roomCode.test.js   # Code generation & collision tests
        ├── broadcaster.test.js# SSE dispatch unit tests
        └── matching.test.js   # Consensus algorithm unit tests
```

### 2.4 Recommended `package.json` Manifest
```json
{
  "name": "matchswipe-app",
  "version": "1.0.0",
  "description": "Tinder-style group indecision swiping web app with instant consensus matching",
  "type": "module",
  "scripts": {
    "dev:server": "node server/index.js",
    "dev:client": "vite",
    "dev": "concurrently --kill-others-on-fail -n \"SERVER,CLIENT\" -c \"blue,green\" \"npm:dev:server\" \"npm:dev:client\"",
    "build": "vite build",
    "start": "NODE_ENV=production node server/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "canvas-confetti": "^1.9.4",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "lucide-react": "^0.450.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.2",
    "concurrently": "^9.0.1",
    "supertest": "^7.0.0",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

#### Why this dependency set is optimal:
- **Zero Heavy Binary Dependencies**: No native modules, no node-gyp, no Python compilation steps. Installs smoothly in under 15 seconds on any Windows, macOS, or Linux platform.
- **Native Browser APIs Used**: Native `fetch` on client and server (Node 18+), native `EventSource` on client for SSE, native `crypto.randomUUID()` for participant tokens.
- **Single-Command Portability**:
  - `npm start` executes `server/index.js`, which checks if `dist/` exists and serves it statically alongside the Express `/api` routes on a single port (e.g., `PORT=3000`).
  - `npm test` runs Vitest in CI/headless mode and finishes in ~1.5 seconds.

---

## 3. Session & Room Data Model (R1 Deep-Dive)

### 3.1 Room State Lifecycle Machine

```
                      +-------------------+
                      |      CREATED      |
                      +-------------------+
                                |
                                v
                      +-------------------+
                      |       LOBBY       |<--------------------+
                      | (Invites, Config) |                     |
                      +-------------------+                     |
                                |                               |
                       [Host clicks Start]                      |
                                |                               |
                                v                               |
                      +-------------------+                     |
                      |      VOTING       |                     |
                      | (Swiping Active)  |                     |
                      +-------------------+                     |
                         /             \                        |
       [100% Group Unanimous]       [All Participants Finish   |
               /                     Without Unanimous Match]   |
              v                                \                |
    +-------------------+                       v               |
    |      MATCHED      |             +-------------------+     |
    | (Celebration UI,  |             |    TIEBREAKER     |-----+
    |  Affiliate Action)|             | (Spin Wheel / Top)|  [Play Again /
    +-------------------+             +-------------------+   New Round]
              \                                /
               \                              /
                v                            v
              +--------------------------------+
              |            CLOSED              |
              | (TTL 24h Expiry / Left Room)   |
              +--------------------------------+
```

#### State Definitions & Invariants:
1. **`lobby`**:
   - Initial state upon creation.
   - Participants join via room code or shareable URL.
   - Host can configure category, cuisine filters, price tier, and distance.
   - Participants can toggle "Ready" status.
   - Transition to `voting` is triggered by Host action (`POST /api/rooms/:code/start`).
2. **`voting`**:
   - Swiping deck is locked and distributed to all participants.
   - Real-time vote recording per participant per venue.
   - If ANY venue accumulates votes from **all active participants** with `vote === 'like' || vote === 'superlike'`, the room **immediately transitions to `matched`**.
   - If all participants finish swiping through the entire deck and NO venue has unanimous likes, the room automatically transitions to **`tiebreaker`**.
3. **`matched`**:
   - Terminal active state for the round.
   - Displays the winning venue details, confetti animation, and affiliate action buttons (Reservations, Directions, Delivery).
   - Host may trigger "Swipe Again" (`POST /api/rooms/:code/restart`), which resets votes with fresh or remaining venues and returns the room to `lobby`.
4. **`tiebreaker`**:
   - Fallback state activated when unanimous agreement fails.
   - Aggregates venues that received the most total likes into an interactive roulette wheel or ranked leaderboard.
   - A wheel spin locks in the winning spot and transitions to a finalized outcome.
5. **`closed`**:
   - Inactivity timeout (>24 hours) or manual room termination cleans up memory.

---

### 3.2 Room Code Generation Engine

Room codes must be:
1. **Phonetically unambiguous**: Easily spoken aloud at a loud dinner table or bar.
2. **Short & memorable**: 4-letter food/drink/vibe keyword + 2-digit number (e.g., `TACO42`, `BAR77`, `BREW19`).
3. **Typo-resistant**: Excludes visually ambiguous characters (e.g., words avoid letters that look like digits; uppercase only).
4. **Collision-free**: Cryptographically checked against active rooms in memory.

#### Recommended Implementation Specification:
```javascript
// server/models/RoomCode.js
const PREFIXES = [
  'TACO', 'BREW', 'PIZZA', 'SUSHI', 'BURGER', 'RAMEN',
  'TAPAS', 'BAR', 'CAFE', 'WINE', 'DANCE', 'VIBE',
  'CHILL', 'BEER', 'BBQ', 'BISTRO', 'SNACK', 'SWEET'
];

export function generateRoomCode(existingCodes = new Set()) {
  const maxAttempts = 50;
  for (let i = 0; i < maxAttempts; i++) {
    const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
    const num = Math.floor(10 + Math.random() * 90); // 10 - 99
    const code = `${prefix}${num}`;
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  // Fallback for high volume
  return `ROOM${Math.floor(1000 + Math.random() * 9000)}`;
}
```
- **Total Unique Code Space**: 18 prefixes × 90 numbers = 1,620 concurrent short codes; fallback provides 9,000 additional codes. For typical local group sessions with 24-hour TTL, collision probability is < 0.1%.
- **Validation Regex**: `/^[A-Z]{3,8}[0-9]{2,4}$/`

---

### 3.3 Shareable Links & Deep Linking
To eliminate friction, the app supports three link sharing modalities:
1. **Deep Link URL**: `http://<domain>/?room=TACO42` or `http://<domain>/join/TACO42`
   - Client automatically detects the `room` search parameter on landing.
   - If the user doesn't have an active session, it opens the instant "Join Room" modal with the code pre-filled, prompting only for their name (e.g., "Alex 🍕").
2. **Native Web Share API**:
   - On mobile devices, clicking "Invite Friends" invokes `navigator.share({ title: 'Join our MatchSwipe!', text: "Help us pick dinner! Join room TACO42:", url: joinUrl })`.
3. **Clipboard Copy Fallback**:
   - Automatically copies link to clipboard with visual confirmation toast ("Link copied! Send to your group!").

---

### 3.4 Zero-Install, Zero-Login Participant Model
To ensure viral conversion, **no email signup, password, or third-party OAuth is required**:
- **Participant Identity**:
  - The client checks `localStorage.getItem('matchswipe_participant_id')`.
  - If null, generates a standard UUID: `const participantId = crypto.randomUUID();`.
  - Nickname and emoji avatar are cached locally: `localStorage.setItem('matchswipe_nickname', name)`.
- **Participant Roles & Permissions**:
  - `isHost: true`: Assigned to the creator of the room. Allowed to:
    - Edit activity category, cuisine tags, price range, and distance.
    - Start the swiping round (`POST /api/rooms/:code/start`).
    - Trigger tiebreaker wheel spin or reset the round.
  - `isHost: false`: Guests who join via room code. Allowed to:
    - Toggle ready status.
    - Submit votes on venue cards.
    - View live participant roster and final match/tiebreaker results.
- **Heartbeat & Disconnect Resilience**:
  - Participants track `lastSeenAt`.
  - If a participant closes their browser, the room's active member count is maintained. If a participant has submitted votes, their votes remain valid for consensus calculation so the group is not blocked.

---

### 3.5 Detailed Data Schemas

#### Room Entity Schema (`Room`)
```typescript
interface Room {
  id: string;                      // Internal UUID: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
  code: string;                    // Short code: "TACO42"
  status: 'lobby' | 'voting' | 'matched' | 'tiebreaker' | 'closed';
  
  // Room Configuration (R1)
  settings: {
    groupType: 'couples' | 'friends' | 'coworkers' | 'family';
    activityCategory: 'dining' | 'bars' | 'entertainment' | 'coffee' | 'nightlife';
    cuisinePreferences: string[];  // e.g. ["Italian", "Mexican", "Japanese", "Vegan"]
    priceRange: number[];          // e.g. [1, 2, 3] (1 = $, 2 = $$, 3 = $$$, 4 = $$$$)
    distance: 'walkable' | 'short_drive' | 'metro_area'; // 1mi, 5mi, 15mi
    deckSize: number;              // default: 12 cards
    tieBreakerType: 'wheel' | 'ranked_choice';
  };

  // Participant Roster
  hostId: string;                  // participantId of the room host
  participants: Record<string, Participant>; // keyed by participantId

  // Swiping & Voting State (R2)
  deck: VenueCard[];               // Curated list of venues for this round
  votes: {
    // venueId -> { participantId -> 'like' | 'pass' | 'superlike' }
    [venueId: string]: Record<string, 'like' | 'pass' | 'superlike'>;
  };

  // Results & Match Resolution
  matchedVenueId: string | null;   // Set immediately upon 100% consensus
  matchedAt: string | null;        // ISO timestamp
  tiebreakerResult: {
    winningVenueId: string | null;
    spunAt: string | null;
    topContenders: string[];       // Array of venueIds
  } | null;

  // Metadata & Lifecycle
  createdAt: string;               // ISO timestamp
  updatedAt: string;               // ISO timestamp
  expiresAt: string;               // ISO timestamp (createdAt + 24 hours)
  version: number;                 // Incremented on every mutation for client sync
}
```

#### Participant Entity Schema (`Participant`)
```typescript
interface Participant {
  id: string;                      // UUID
  name: string;                    // "Sarah", "Jake"
  avatar: string;                  // Emoji character or icon key, e.g. "🍕", "🌮", "🍸"
  isHost: boolean;
  status: 'lobby' | 'ready' | 'swiping' | 'finished';
  swipedCount: number;             // Number of cards swiped so far
  totalCards: number;              // Total cards in deck
  joinedAt: string;                // ISO timestamp
  lastSeenAt: string;              // ISO timestamp
}
```

#### Venue Card Entity Schema (`VenueCard`)
```typescript
interface VenueCard {
  id: string;                      // "venue-001"
  name: string;                    // "Barrio Cantina & Agave Bar"
  category: 'dining' | 'bars' | 'entertainment' | 'coffee' | 'nightlife';
  cuisine: string;                 // "Oaxacan Mexican"
  priceTier: 1 | 2 | 3 | 4;        // 2 ($$)
  rating: number;                  // 4.8
  reviewCount: number;             // 428
  distance: string;                // "0.6 mi"
  address: string;                 // "1424 Market St, Downtown"
  imageUrl: string;                // High-res photo URL
  tags: string[];                  // ["Cocktails", "Patio", "Tacos", "Late Night"]
  description: string;             // "Artisanal street tacos, wood-fired carnitas, and mezcal flights."
  
  // Monetization Hooks (R4)
  isPromoted: boolean;             // true if sponsored card
  sponsorBadge?: string;           // "Sponsored / Featured Partner"
  sponsorCta?: string;             // "Complimentary appetizer with table reservation"
  affiliateLinks: {
    reservationUrl: string;        // "https://opentable.com/...&ref=matchswipe_app"
    directionsUrl: string;         // "https://maps.google.com/?q=Barrio+Cantina"
    deliveryUrl: string;           // "https://doordash.com/...&utm_source=matchswipe"
    menuUrl: string;               // "https://barriocantina.com/menu"
  };
}
```

---

## 4. Real-Time State Synchronization Engine

### 4.1 Communication Pattern Evaluation

We evaluated three synchronization mechanisms for group voting:
1. **WebSockets (`ws` / `socket.io`)**:
   - *Pros*: Bi-directional, sub-20ms latency.
   - *Cons*: Additional binary dependencies, complex reconnection edge cases, strict proxy/firewall websocket upgrade issues, cumbersome integration testing with standard HTTP test runners (Supertest).
2. **Short Polling (Every 1.5 - 2s)**:
   - *Pros*: Completely standard HTTP, no stateful connections.
   - *Cons*: Up to 2-second delay on the "Match!" reveal screen, battery drain from frequent HTTP handshakes.
3. **Server-Sent Events (SSE) with HTTP POST Actions (Selected Optimal Architecture)**:
   - *Pros*:
     - **Native browser standard**: Uses built-in `EventSource` with zero npm client libraries.
     - **Automatic connection management**: Browser handles auto-reconnect and backoff natively.
     - **Clean separation of concerns**: Read stream is push-based SSE; mutations (Vote, Join, Start) are clean REST POST endpoints with explicit status codes and error validation.
     - **Testable via standard HTTP tools**: Easily verified using Supertest or Vitest.
     - **Lightweight on server**: Express easily maintains hundreds of idle event streams with simple memory footprint.

### 4.2 Hybrid Synchronization Architecture: SSE + Smart Polling Fallback

```
+-----------------------------------------------------------------------------------+
|                                CLIENT APPLICATION                                 |
|                                                                                   |
|  [User Swipes Card]                      [EventSource Listener / Polling Fallback]|
|          |                                                  ^                     |
|          | HTTP POST /api/rooms/:code/vote                  | Real-Time Events    |
|          v                                                  | (Match! Progress)   |
+----------|--------------------------------------------------|---------------------+
           |                                                  |
           v                                                  |
+-----------------------------------------------------------------------------------+
|                               EXPRESS BACKEND SERVER                              |
|                                                                                   |
|  [REST Route Handler]                                  [SSE Broadcaster]          |
|          |                                                  ^                     |
|          +-----> [RoomStore.recordVote(code, vote)] --------+                     |
|                           |                                                       |
|                           +---> Unanimous? YES                                    |
|                                     |                                             |
|                                     v                                             |
|                             room.status = 'matched'                               |
|                             broadcast('match:revealed', { venue })                |
+-----------------------------------------------------------------------------------+
```

#### Client Fallback Strategy:
- When joining a room, the frontend initializes `new EventSource('/api/rooms/:code/stream?participantId=...')`.
- If `EventSource` encounters an error or is unavailable (e.g. strict corporate proxy), the client gracefully switches to **Smart Polling** (`GET /api/rooms/:code` every 2 seconds).
- This guarantees **100% connectivity resilience** under all mobile and network circumstances.

### 4.3 SSE Event Stream Protocol & Payload Specifications

#### Endpoint: `GET /api/rooms/:code/stream?participantId=:participantId`
Headers sent by server:
```http
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

#### Event Catalog:

1. **`room:init`** — Sent immediately upon connection:
   ```json
   {
     "event": "room:init",
     "data": {
       "room": { /* Full RoomPublic object */ },
       "participantId": "p-123",
       "timestamp": "2026-10-08T22:15:00Z"
     }
   }
   ```

2. **`participant:joined`** — Broadcast when a new participant enters the lobby:
   ```json
   {
     "event": "participant:joined",
     "data": {
       "participant": {
         "id": "p-456",
         "name": "Jordan 🌮",
         "avatar": "🌮",
         "isHost": false,
         "status": "lobby"
       },
       "totalParticipants": 3
     }
   }
   ```

3. **`settings:updated`** — Broadcast when the host updates filters/parameters:
   ```json
   {
     "event": "settings:updated",
     "data": {
       "settings": {
         "activityCategory": "dining",
         "cuisinePreferences": ["Mexican", "Tapas"],
         "priceRange": [1, 2],
         "distance": "walkable"
       }
     }
   }
   ```

4. **`voting:started`** — Broadcast when host starts the round:
   ```json
   {
     "event": "voting:started",
     "data": {
       "deck": [ /* Array of VenueCard objects */ ],
       "totalCards": 12,
       "startedAt": "2026-10-08T22:15:30Z"
     }
   }
   ```

5. **`participant:progress`** — Broadcast as participants swipe cards (without revealing secret individual likes):
   ```json
   {
     "event": "participant:progress",
     "data": {
       "participantId": "p-456",
       "swipedCount": 5,
       "totalCards": 12,
       "status": "swiping"
     }
   }
   ```

6. **`match:revealed`** — Instant celebration event sent the instant unanimous consensus is reached:
   ```json
   {
     "event": "match:revealed",
     "data": {
       "venue": { /* Full winning VenueCard */ },
       "agreedBy": ["p-123", "p-456", "p-789"],
       "matchedAt": "2026-10-08T22:16:15Z"
     }
   }
   ```

7. **`tiebreaker:started`** — Broadcast if deck finishes with no unanimous winner:
   ```json
   {
     "event": "tiebreaker:started",
     "data": {
       "type": "wheel",
       "topContenders": [
         { "venueId": "venue-001", "name": "Barrio Cantina", "likes": 2 },
         { "venueId": "venue-004", "name": "Ramen Tatsu", "likes": 2 }
       ]
     }
   }
   ```

8. **`heartbeat`** — Sent every 15 seconds to prevent intermediate cellular network gateway timeouts:
   ```
   : heartbeat 2026-10-08T22:16:30Z\n\n
   ```

---

## 5. Detailed REST API Route Specifications & Data Schemas (R1)

### 5.1 Route Matrix Summary

| Method | Endpoint | Description | Auth / Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/rooms` | Create new session & generate short room code | Public (Creator becomes Host) |
| `GET` | `/api/rooms/:code` | Retrieve current room state and participant roster | Public (Room participants) |
| `POST` | `/api/rooms/:code/join` | Join existing room with name & avatar | Public (Valid room code required) |
| `PATCH`| `/api/rooms/:code/settings` | Update activity filters and room settings | Host Only (`participantId === hostId`) |
| `POST` | `/api/rooms/:code/start` | Start swiping round & generate curated deck | Host Only (`participantId === hostId`) |
| `GET` | `/api/rooms/:code/stream` | Establish real-time SSE event stream | Participant (`?participantId=...`) |
| `POST` | `/api/rooms/:code/vote` | Submit swipe vote for a venue (R2 baseline) | Participant in room |
| `GET` | `/api/rooms/:code/results` | Get consensus status & match/tiebreaker state | Participant in room |
| `POST` | `/api/rooms/:code/leave` | Leave room or disconnect gracefully | Participant in room |
| `GET` | `/api/health` | Service health & active rooms telemetry | Public / Automated Verification |

---

### 5.2 Detailed Endpoint Specifications

#### 1. Create Room: `POST /api/rooms`
- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "hostName": "Sarah",
  "hostAvatar": "🍕",
  "groupType": "friends",
  "activityCategory": "dining",
  "cuisinePreferences": ["Italian", "Tapas"],
  "priceRange": [1, 2, 3],
  "distance": "walkable",
  "deckSize": 12,
  "tieBreakerType": "wheel"
}
```
- **Validation**:
  - `hostName`: string, required, trimmed length 1–30.
  - `groupType`: enum `['couples', 'friends', 'coworkers', 'family']`, optional (default: `'friends'`).
  - `activityCategory`: enum `['dining', 'bars', 'entertainment', 'coffee', 'nightlife']`, optional (default: `'dining'`).
  - `priceRange`: array of numbers in `[1, 2, 3, 4]`, default `[1, 2, 3]`.
- **Response 201 Created**:
```json
{
  "success": true,
  "room": {
    "id": "c1f7608d-8a5e-4efb-b8bc-06bf9a7c3902",
    "code": "TACO42",
    "status": "lobby",
    "settings": {
      "groupType": "friends",
      "activityCategory": "dining",
      "cuisinePreferences": ["Italian", "Tapas"],
      "priceRange": [1, 2, 3],
      "distance": "walkable",
      "deckSize": 12,
      "tieBreakerType": "wheel"
    },
    "hostId": "p-e9a38f32-72dc-4a7a-8742-83679f1dbf1a",
    "participants": {
      "p-e9a38f32-72dc-4a7a-8742-83679f1dbf1a": {
        "id": "p-e9a38f32-72dc-4a7a-8742-83679f1dbf1a",
        "name": "Sarah",
        "avatar": "🍕",
        "isHost": true,
        "status": "lobby",
        "swipedCount": 0,
        "totalCards": 0
      }
    },
    "participantCount": 1,
    "createdAt": "2026-10-08T22:10:00.000Z",
    "expiresAt": "2026-10-09T22:10:00.000Z"
  },
  "participant": {
    "id": "p-e9a38f32-72dc-4a7a-8742-83679f1dbf1a",
    "name": "Sarah",
    "avatar": "🍕",
    "isHost": true
  },
  "joinUrl": "http://localhost:3000/?room=TACO42"
}
```
- **Error Responses**:
  - `400 Bad Request`: `{ "success": false, "error": "hostName is required" }`

---

#### 2. Get Room State: `GET /api/rooms/:code`
- **Request Parameters**: `code` (string, e.g. `TACO42`, case-insensitive)
- **Response 200 OK**:
```json
{
  "success": true,
  "room": {
    "code": "TACO42",
    "status": "lobby",
    "settings": {
      "groupType": "friends",
      "activityCategory": "dining",
      "cuisinePreferences": ["Italian", "Tapas"],
      "priceRange": [1, 2, 3],
      "distance": "walkable"
    },
    "hostId": "p-e9a38f32-72dc-4a7a-8742-83679f1dbf1a",
    "participants": [
      {
        "id": "p-e9a38f32-72dc-4a7a-8742-83679f1dbf1a",
        "name": "Sarah",
        "avatar": "🍕",
        "isHost": true,
        "status": "lobby"
      },
      {
        "id": "p-991f8c12-348b-4b21-8172-1928374a5e92",
        "name": "Alex",
        "avatar": "🍻",
        "isHost": false,
        "status": "lobby"
      }
    ],
    "participantCount": 2,
    "createdAt": "2026-10-08T22:10:00.000Z"
  }
}
```
- **Error Responses**:
  - `404 Not Found`: `{ "success": false, "error": "Room TACO42 not found or has expired" }`

---

#### 3. Join Room: `POST /api/rooms/:code/join`
- **Request Parameters**: `code` (string)
- **Request Body**:
```json
{
  "participantId": "p-991f8c12-348b-4b21-8172-1928374a5e92",
  "name": "Alex",
  "avatar": "🍻"
}
```
- **Behavior**:
  - If `participantId` is already a member of this room (e.g. page refresh), re-attaches existing participant state.
  - If new, adds participant to the room roster, increments participant count, and broadcasts `participant:joined` to all connected SSE clients.
  - Disallows joining if room status is `closed`.
- **Response 200 OK**:
```json
{
  "success": true,
  "room": { /* Current Room state */ },
  "participant": {
    "id": "p-991f8c12-348b-4b21-8172-1928374a5e92",
    "name": "Alex",
    "avatar": "🍻",
    "isHost": false,
    "status": "lobby"
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: Missing or invalid `name`.
  - `404 Not Found`: Room code does not exist.
  - `409 Conflict`: Room is currently in a state that cannot accept new joins (`closed`).

---

#### 4. Update Room Settings: `PATCH /api/rooms/:code/settings`
- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "participantId": "p-e9a38f32-72dc-4a7a-8742-83679f1dbf1a",
  "settings": {
    "activityCategory": "bars",
    "priceRange": [2, 3],
    "distance": "short_drive"
  }
}
```
- **Validation**:
  - Validates that `participantId === room.hostId`. Non-hosts receive `403 Forbidden`.
  - Can only be updated while `room.status === 'lobby'`.
- **Response 200 OK**:
```json
{
  "success": true,
  "settings": {
    "groupType": "friends",
    "activityCategory": "bars",
    "cuisinePreferences": ["Italian", "Tapas"],
    "priceRange": [2, 3],
    "distance": "short_drive",
    "deckSize": 12,
    "tieBreakerType": "wheel"
  }
}
```
- **Broadcast Action**: Pushes `settings:updated` event to all participants.

---

#### 5. Start Swiping Round: `POST /api/rooms/:code/start`
- **Request Body**:
```json
{
  "participantId": "p-e9a38f32-72dc-4a7a-8742-83679f1dbf1a"
}
```
- **Logic**:
  - Validates host authorization.
  - Filters curated venue list matching `settings.activityCategory`, `priceRange`, and cuisine tags.
  - Ensures at least one Promoted card (`isPromoted: true`) is included in the deck.
  - Sets `room.status = 'voting'`, resets votes map, and sets all participants to `status: 'swiping'`.
  - Broadcasts `voting:started` with the deck.
- **Response 200 OK**:
```json
{
  "success": true,
  "status": "voting",
  "deckSize": 12,
  "deck": [ /* Array of 12 VenueCard objects */ ]
}
```

---

#### 6. Record Swipe Vote (R2 Baseline Integration): `POST /api/rooms/:code/vote`
- **Request Body**:
```json
{
  "participantId": "p-991f8c12-348b-4b21-8172-1928374a5e92",
  "venueId": "venue-002",
  "vote": "like"
}
```
- **Vote Values**: `'like'`, `'pass'`, `'superlike'`
- **Consensus Evaluation**:
  - If `vote === 'like'` or `'superlike'`, server records vote in `room.votes[venueId][participantId]`.
  - Checks if `Object.keys(room.votes[venueId]).length === Object.keys(room.participants).length`.
  - If YES: **Unanimous Match Found!**
    - Sets `room.status = 'matched'`.
    - Sets `room.matchedVenueId = venueId`.
    - Broadcasts `match:revealed` with winning venue details.
- **Response 200 OK**:
```json
{
  "success": true,
  "isMatch": true,
  "matchedVenue": { /* VenueCard */ },
  "progress": {
    "swipedCount": 4,
    "totalCards": 12
  }
}
```

---

#### 7. Results & Consensus Query: `GET /api/rooms/:code/results`
- **Response 200 OK**:
```json
{
  "success": true,
  "status": "matched",
  "matchedVenue": { /* Winning VenueCard if matched, otherwise null */ },
  "topContenders": [
    {
      "venue": { /* VenueCard */ },
      "likeCount": 3,
      "totalParticipants": 3,
      "matchPercentage": 100
    }
  ],
  "tiebreaker": null
}
```

---

## 6. Curated Venue Dataset & Mock Sponsor Architecture

### 6.1 Curated Venue Dataset Specification (`server/data/venues.json`)
The application requires a rich, realistic seed deck of 20+ venues across primary entertainment categories to deliver an immediate, delightful out-of-the-box experience:

```json
[
  {
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
  {
    "id": "venue-sp-001",
    "name": "The Highline Rooftop Lounge",
    "category": "bars",
    "cuisine": "Craft Cocktails & Small Plates",
    "priceTier": 3,
    "rating": 4.9,
    "reviewCount": 892,
    "distance": "0.4 mi",
    "address": "800 Panorama Way, 24th Floor",
    "imageUrl": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
    "tags": ["Skyline Views", "Fire Pits", "DJ Sets", "Craft Drinks"],
    "description": "Breathtaking 360-degree skyline views, heated fire pits, and signature mixology.",
    "isPromoted": true,
    "sponsorBadge": "Featured Partner",
    "sponsorCta": "Free signature cocktail with party of 3+ reservation",
    "affiliateLinks": {
      "reservationUrl": "/api/affiliate/redirect?partner=resy&venueId=venue-sp-001&promoted=true",
      "directionsUrl": "https://maps.google.com/?q=The+Highline+Rooftop",
      "deliveryUrl": "/api/affiliate/redirect?partner=ubereats&venueId=venue-sp-001",
      "menuUrl": "https://example.com/highline/menu"
    }
  }
]
```

---

## 7. Buildability, Startup & Test Execution Design

### 7.1 Single-Command Startup Architecture
To satisfy the strict acceptance criteria:
- **Development Mode (`npm run dev`)**:
  - Uses `concurrently` to run both Express (`server/index.js` on port `3001`) and Vite (`vite` on port `3000`).
  - Vite dev server proxies `/api` calls directly to `http://localhost:3001`.
  - Immediate Hot Module Replacement (HMR) for rapid UI iteration.
- **Production Mode (`npm start`)**:
  - `server/index.js` inspects `NODE_ENV`. If production (or if `dist/` folder exists), Express serves the static production build directly via `express.static(path.join(__dirname, '../dist'))`.
  - Handles client-side routing fallback: `app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../dist/index.html')))`.
  - Thus, **a single Node.js process hosts the entire app on one single port** with zero reverse-proxy configuration.

### 7.2 Single-Command Test Execution (`npm test`)
- Driven by **Vitest**:
  - Fast execution time (~1.5s).
  - Integrates with `supertest` for testing Express HTTP API routes.
  - No external test server needed: `supertest(app)` spins up Express ephemerally in-memory, avoiding port conflicts in CI environments.
  - Vitest configuration (`vite.config.js` or `vitest.config.js`) includes both unit tests and API integration tests in one unified run.

```javascript
// Example Supertest Route Test: tests/api/rooms.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';

describe('Room & Session Management API (R1)', () => {
  let app;
  beforeEach(() => {
    app = createApp(); // Fresh in-memory app instance per test suite
  });

  it('creates a room with a short room code and host participant', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'Maya', hostAvatar: '🍕', groupType: 'friends' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.room.code).toMatch(/^[A-Z]{3,8}[0-9]{2,4}$/);
    expect(res.body.participant.name).toBe('Maya');
    expect(res.body.participant.isHost).toBe(true);
  });

  it('allows second user to join room via short code', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ hostName: 'Maya' });
    const code = createRes.body.room.code;

    const joinRes = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({ name: 'Sam', avatar: '🍻' });

    expect(joinRes.status).toBe(200);
    expect(joinRes.body.success).toBe(true);
    expect(joinRes.body.participant.name).toBe('Sam');
    expect(joinRes.body.participant.isHost).toBe(false);
  });
});
```

---

## 8. Risk Analysis & Mitigation Strategies

| Risk / Failure Mode | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Room Code Collision** | Two distinct groups share the same room code | Generator attempts up to 50 prefix-number combinations against the active `existingCodes` Set. If collision rate spikes, appends 4-digit random numbers (`ROOM1029`). |
| **Mobile Sleep / Network Drop** | SSE connection closed when phone screen turns off | Browser `EventSource` automatically attempts reconnection. Client maintains exponential backoff with instant HTTP sync fallback upon window focus (`visibilitychange` listener). |
| **Participant Drops / Inactive Swiper** | Group blocked waiting for 1 inactive participant to swipe | Voting engine tracks active participants. Host has "Bypass / Calculate Current Votes" button, or group can trigger tiebreaker if participant is idle > 60s. |
| **Server Memory Growth** | Stale rooms accumulate in memory | `RoomStore` implements an active interval cleanup (every 30 mins) that purges rooms where `Date.now() > expiresAt` (TTL: 24 hours). |
| **Test Port Collision in CI** | `EADDRINUSE` errors if tests bind to fixed ports | Tests use `supertest(createApp())` which operates directly over Node HTTP request abstraction without binding to a physical TCP port. |

---

## 9. Alignment with Peer Work Streams

To ensure seamless integration across the subagent team:
1. **With Explorer 2 (UI Swiping & Matching - R2/R3)**:
   - Data models for `VenueCard` and `Room.votes` provided here directly feed the swiping gesture component, swipe animations, and the unanimous match detection algorithm.
   - The tie-breaker trigger in `Room.status` provides the exact state transition required to launch the interactive roulette wheel.
2. **With Explorer 3 (Monetization & E2E Testing - R4/R5)**:
   - Every `VenueCard` contains structured `affiliateLinks` (`reservationUrl`, `directionsUrl`, `deliveryUrl`) and sponsor flags (`isPromoted`, `sponsorBadge`).
   - The test setup and API route specifications enable the 4-tier E2E test suite architecture required by R5.

---

## 10. Summary & Recommended Action Plan

1. **Adopt Unified Express + Vite/React Architecture**: Single `package.json`, zero binary bloat, single-command run and test.
2. **Implement Ephemeral In-Memory RoomStore with TTL**: Zero database setup, sub-millisecond query speed, perfect for ephemeral group voting sessions.
3. **Deploy SSE Primary + Smart Polling Fallback**: Native browser event streaming with zero client dependencies, guaranteed connectivity on all mobile browsers.
4. **Enforce Clean API Route Contracts**: Well-structured REST endpoints for room creation, joining, settings mutation, voting, and match queries.
