# Project: MatchBite — Group Indecision Tinder-Style Swiping Web App

## Architecture
MatchBite is a responsive, zero-friction web application designed to solve group indecision (dining, nightlife, activities) for couples, friend groups, and coworkers.

### Core Stack
- **Runtime & Backend**: Node.js (v18+) with Express 4 for REST API, Server-Sent Events (SSE) broadcasting, and static production serving.
- **Frontend**: React 18 with Vite 5 for fast modern component rendering, responsive touch/pointer swipe gestures, and dynamic animations.
- **Styling**: Modern responsive CSS / Tailwind-compatible design system optimized for mobile touchscreens and desktop viewports (zero horizontal overflow/clipping).
- **Data & State**: In-memory `RoomStore` with atomic mutations, cryptographic UUID session tokens, memorable room codes, and TTL expiration (24h).
- **Real-Time Sync**: Server-Sent Events (`/api/rooms/:code/stream`) with native browser `EventSource` + automatic Smart Polling fallback.
- **Monetization**: Tracked affiliate referral links (OpenTable, Resy, DoorDash, UberEats, Google Maps), native promoted card placements, and VIP room upgrade mock checkout.
- **Test Engine**: Vitest + Supertest for single-command (`npm test`) deterministic execution covering all unit, integration, and E2E tiers without external database dependencies.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Zero-Friction Room Creation | Host creates session with group type, activity category, filters, receiving code | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Memorable Room Codes | Phonetic, collision-free short codes (e.g. `TACO42`, `BAR19`) | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Shareable Deep Links & Web Share | 1-tap join URL (`?room=CODE`) with native clipboard copy and Web Share API | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Anonymous Participant Roster | Zero-login avatar/nickname persistence in localStorage with host privileges | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Activity Parameter Configuration | Filter by category (dining, bars, entertainment), price tier ($-$$$$), distance | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Real-time SSE / Polling Stream | Server-Sent Events hub delivering sub-second room events with polling fallback | M1 | ORIGINAL_REQUEST §R1 |
| 7 | Card-Swiping Gesture Engine | Fluid Pointer Events (touch/mouse) with rotation physics, swipe thresholds, buttons | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Keyboard & Button Accessibility | Arrow keys (Left=Pass, Right=Like, Up=Superlike) and touch action buttons | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Curated Rich Venue Decks | Comprehensive deck across 5 categories with photos, ratings, cuisine tags, distance | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Consensus Matching Algorithm | Multi-user vote tallying with instant 100% unanimous agreement detection | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Celebratory Match Reveal Screen | Confetti animation, audio chime, winning venue showcase, party agreement status | M2 | ORIGINAL_REQUEST §R2 |
| 12 | Ranked-Choice Consensus Leaderboard | Fallback leaderboard highlighting top mutually liked venues if no 100% match | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Interactive 60fps Roulette Wheel | High-performance canvas spin wheel of top contenders with angular friction physics | M3 | ORIGINAL_REQUEST §R3 |
| 14 | Synchronized Spin Outcome | Host-initiated spin synced across participants with winner lock-in | M3 | ORIGINAL_REQUEST §R3 |
| 15 | Round Replay & Reset | Host ability to restart round with remaining/fresh venues | M3 | ORIGINAL_REQUEST §R3 |
| 16 | Tracked Affiliate Action Hooks | Action buttons ("Reserve Table", "Directions", "Order Delivery") with tracked URLs | M4 | ORIGINAL_REQUEST §R4 |
| 17 | Affiliate Redirect Endpoint | `/api/affiliate/redirect` logging outbound click analytics and formatting UTM tags | M4 | ORIGINAL_REQUEST §R4 |
| 18 | Native Promoted Card Placement | Designated "Promoted" card in swipe deck with sponsor badge and exclusive perk | M4 | ORIGINAL_REQUEST §R4 |
| 19 | VIP Upgrade Mock Checkout | Interactive modal for $2.99 VIP pass (card validation, test coupons `VIPFREE`) | M4 | ORIGINAL_REQUEST §R4 |
| 20 | Premium Features Activation | Custom venue injection, unlimited rounds, roulette re-spin passes | M4 | ORIGINAL_REQUEST §R4 |
| 21 | Tier 1: Feature Test Coverage | >= 5 tests per feature for R1, R2, R3, R4 | M5 | ORIGINAL_REQUEST §R5 |
| 22 | Tier 2: Boundary & Corner Cases | 8+ boundary tests (1-person instant match, empty room, large group, decline) | M5 | ORIGINAL_REQUEST §R5 |
| 23 | Tier 3: Cross-Feature Interactions | Interaction tests (voting -> consensus -> affiliate links; VIP -> custom card) | M5 | ORIGINAL_REQUEST §R5 |
| 24 | Tier 4: Real-World Workload Scenarios | End-to-end simulations (Couples Date Night, Friends Bar Crawl, Coworker Lunch) | M5 | ORIGINAL_REQUEST §R5 |
| 25 | Single-Command Build & Startup | Clean build (`npm run build`) and startup (`npm start` / `npm run dev`) | M6 | ORIGINAL_REQUEST Acceptance |
| 26 | Tier 5 Adversarial Hardening | White-box edge case testing and code-coverage verification | M6 | Project Pattern |
| 27 | Forensic Integrity Audit | Binary veto audit verifying authentic implementations and zero facade logic | M6 | Hard Constraints |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Project Setup & Room Management Engine | package.json, server, RoomStore, room codes, Lobby UI, R1 REST API & SSE | none | DONE |
| M2 | Interactive Swiping & Consensus Matching | Swiping gestures, venue deck, real-time voting, unanimous match reveal, confetti | M1 | DONE |
| M3 | Tie-Breaking Helpers & Decision Roulette | Ranked-choice leaderboard, 60fps canvas roulette wheel, spin sync | M2 | DONE |
| M4 | Automated Monetization & External Hooks | Affiliate links & redirect, promoted card, VIP upgrade checkout flow | M2 | DONE |
| M5 | Automated Test & Quality Verification Suite | Vitest + Supertest suite (Tiers 1-4) passing 100% via `npm test` (203 tests) | M1, M2, M3, M4 | DONE |
| M6 | Final Verification, Adversarial Hardening & Audit | Tier 5 tests, production build & run validation, Forensic Audit (234 tests across 12 suites) | M5 | DONE |

---

## Interface Contracts

### Client ↔ Server REST API
- `POST /api/rooms`: `{ hostName, hostAvatar, groupType, activityCategory, priceRange, distance }` -> `{ success, room, participant, joinUrl }`
- `GET /api/rooms/:code`: Retrieve public room state
- `POST /api/rooms/:code/join`: `{ participantId, name, avatar }` -> `{ success, room, participant }`
- `PATCH /api/rooms/:code/settings`: `{ participantId, settings }` -> `{ success, settings }`
- `POST /api/rooms/:code/start`: `{ participantId }` -> `{ success, status: "voting", deck }`
- `POST /api/rooms/:code/vote`: `{ participantId, venueId, vote }` -> `{ success, isMatch, matchedVenue, progress }`
- `POST /api/rooms/:code/tiebreaker/spin`: `{ participantId }` -> `{ success, winningVenueId, spunAt }`
- `POST /api/rooms/:code/restart`: `{ participantId }` -> `{ success, status: "lobby" }`
- `GET /api/affiliate/redirect`: `?venueId=...&action=reserve|directions|delivery&partner=...` -> 302 Redirect with affiliate tags
- `POST /api/rooms/:code/upgrade`: `{ participantId, planId, paymentToken }` -> `{ success, upgraded: true, features }`
- `GET /api/rooms/:code/stream?participantId=...`: SSE stream emitting `room:init`, `participant:joined`, `settings:updated`, `voting:started`, `participant:progress`, `match:revealed`, `tiebreaker:started`

---

## Code Layout
```
niche_web_app/
├── package.json
├── vite.config.js
├── index.html
├── server/
│   ├── index.js
│   ├── config.js
│   ├── routes/
│   │   ├── rooms.js
│   │   ├── votes.js
│   │   ├── tiebreaker.js
│   │   └── monetization.js
│   ├── models/
│   │   ├── RoomStore.js
│   │   └── RoomCode.js
│   ├── sync/
│   │   └── Broadcaster.js
│   └── data/
│       └── venues.json
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   ├── context/
│   │   └── RoomContext.jsx
│   ├── components/
│   │   ├── Common/
│   │   │   ├── Header.jsx
│   │   │   ├── Modal.jsx
│   │   │   └── Toast.jsx
│   │   ├── Lobby/
│   │   │   ├── CreateRoom.jsx
│   │   │   ├── JoinRoom.jsx
│   │   │   └── RoomLobby.jsx
│   │   ├── Swiper/
│   │   │   ├── SwipeDeck.jsx
│   │   │   ├── SwipeCard.jsx
│   │   │   └── ActionControls.jsx
│   │   ├── Match/
│   │   │   ├── MatchCelebration.jsx
│   │   │   └── Confetti.js
│   │   ├── Tiebreaker/
│   │   │   ├── RouletteWheel.jsx
│   │   │   └── ConsensusLeaderboard.jsx
│   │   └── Monetization/
│   │       ├── PromotedBadge.jsx
│   │       ├── AffiliateActions.jsx
│   │       └── VipUpgradeModal.jsx
│   └── utils/
│       ├── api.js
│       └── session.js
└── tests/
    ├── setup.js
    ├── tier1-features/
    │   ├── r1-rooms.test.js
    │   ├── r2-swiping.test.js
    │   ├── r3-tiebreaker.test.js
    │   └── r4-monetization.test.js
    ├── tier2-boundaries/
    │   ├── boundary-cases.test.js
    │   ├── m2-adversarial-security.test.js
    │   └── m2-fuzzing-adversarial-probe.test.js
    ├── tier3-combinations/
    │   └── cross-feature.test.js
    ├── tier4-workloads/
    │   └── real-world-scenarios.test.js
    ├── tier5-adversarial/
    │   └── tier5-adversarial-hardening.test.js
    ├── stress-concurrency-consensus.test.js
    └── adversarial-concurrency-deep-stress.test.js
```
