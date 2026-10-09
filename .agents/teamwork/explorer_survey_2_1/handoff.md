# Formal Handoff Report: Architecture, Tech Stack & Room Management Survey (R1)

**Agent**: `explorer_survey_2_1`  
**Parent**: `orchestrator_2` (`20812a10-1e1e-4b2a-8eec-3122d65537ad`)  
**Working Directory**: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_survey_2_1`  
**Date**: 2026-10-08T22:13:30Z  
**Primary Deliverable**: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_survey_2_1\survey_architecture.md`  

---

## 1. Observation

1. **User Request & Requirements**:
   In `C:\Users\kck50\teamwork_projects\niche_web_app\ORIGINAL_REQUEST.md`, lines 43–87 (dated 2026-10-08T22:04:30Z):
   > "Build a responsive, viral web application that solves group indecision by allowing couples, friend groups, and coworkers to create a shared session, swipe right or left on bars, restaurants, or activities (Tinder-style), and instantly reveal a match when all group members agree on a spot. Include passive monetization mechanisms such as reservation/delivery affiliate links, sponsored card placements, and premium group features."
   Specific R1 requirements in lines 52–54 state:
   > "Allow users to create a shared decision session (e.g. Couples Date Night, Friends Night Out, Coworker Lunch), set activity parameters (e.g., dining, bars, entertainment, price range, distance), and invite participants via a shareable link or room code without requiring mandatory app installs or account friction."
   Acceptance criteria in lines 84–86 mandate:
   > "- The web application builds cleanly and runs locally with a single startup command."
   > "- Automated test suite runs via a single command and passes 100% of tests covering room voting logic, match triggers, and API routes."
   > "- Responsive design functions without horizontal scroll or clipping across standard mobile and desktop viewports."

2. **Workspace Status**:
   Execution of `list_dir` on `C:\Users\kck50\teamwork_projects\niche_web_app` revealed only `ORIGINAL_REQUEST.md` and an older `market_research.md`. No existing source code or package manifest exists yet, confirming a greenfield build.

3. **Peer Explorer Scope Partitioning**:
   - `explorer_survey_2_2/DISPATCH.md` lines 9–16: Focuses on UI/UX Card Swiping Engine (R2), Consensus Matching Engine (R2), and Tie-Breaking Helpers (R3).
   - `explorer_survey_2_3/DISPATCH.md` lines 9–23: Focuses on Passive Monetization & External Action Hooks (R4) and Automated Test & Verification Suite (R5).

---

## 2. Logic Chain

1. **Stack Selection**:
   - *Premise (Observation 1)*: Acceptance criteria require single-command startup (`npm start` / `npm run dev`) and single-command automated test execution (`npm test` passing 100%).
   - *Analysis*: Next.js introduces heavy build dependencies, serverless hydration quirks, and complex Jest/Vitest mocking for route handlers. Conversely, a unified **Node.js + Express** backend paired with **Vite + React (JavaScript/ESM)** in a single root `package.json` eliminates monorepo tooling, enables Express to serve both API routes and compiled static frontend assets in production with zero reverse-proxy overhead, and leverages **Vitest + Supertest** for sub-2-second test execution.
   - *Deduction*: Unified Express + Vite/React is the lowest-friction, highest-reliability stack.

2. **Room & Session Data Model (R1)**:
   - *Premise (Observation 1)*: Sessions must support zero-install, zero-account friction with short codes and shareable links across diverse groups (couples, friends, coworkers).
   - *Analysis*: Short codes generated as a 4-letter memorable food/drink word + 2-digit number (e.g., `TACO42`, `BREW19`) have over 1,600 collision-free slots, are phonetically easy to share aloud, and are easily joined via deep link (`/?room=TACO42`). Ephemeral participant IDs (`crypto.randomUUID()`) stored in client `localStorage` provide instant identity without signups.
   - *Deduction*: In-memory `RoomStore` keyed by room code with a 24-hour TTL provides instant lookups and sub-millisecond voting updates without database overhead.

3. **Real-Time State Synchronization**:
   - *Premise (Observation 1)*: Immediate consensus reveal requires synchronized group state.
   - *Analysis*: WebSockets introduce binary dependencies, complex reconnection edge cases, and firewall issues. Server-Sent Events (SSE) via native browser `EventSource` requires zero client npm libraries, auto-reconnects natively, and seamlessly streams `room:init`, `participant:joined`, `settings:updated`, `voting:started`, `voting:progress`, and `match:revealed` events. A fallback to short polling (every 2s) ensures 100% resilience even on restrictive mobile connections.
   - *Deduction*: Hybrid SSE Primary + Smart Polling Fallback provides the optimal developer experience and zero client bundle overhead.

4. **REST API Route Specifications**:
   - *Premise (Observation 1, 3)*: Downstream workers need explicit endpoints for room lifecycle and multi-user interactions.
   - *Analysis*: Standardized routes (`POST /api/rooms`, `GET /api/rooms/:code`, `POST /api/rooms/:code/join`, `PATCH /api/rooms/:code/settings`, `POST /api/rooms/:code/start`, `GET /api/rooms/:code/stream`, `POST /api/rooms/:code/vote`, `GET /api/rooms/:code/results`) provide a complete contract that interfaces cleanly with R2 swiping and R3 tie-breaking.

---

## 3. Caveats

- **In-Memory Store Persistence**: The proposed `RoomStore` resides in Node.js process memory. If the server process restarts during development, active rooms are re-initialized. This is ideal for development and ephemeral group voting sessions, but a file-backed JSON snapshot mechanism (`server/state/backup.json`) can be optionally layered if persistence across restarts is desired.
- **WebSocket Alternative**: WebSockets were explicitly omitted in favor of SSE + HTTP REST to avoid external socket dependencies, proxy upgrade issues, and test harness complexity. If bidirectional typing or chat is added in future revisions, WebSocket support can be introduced without breaking the REST contracts.
- **Venue Geocoding**: The initial venue deck uses curated mock local venues (`server/data/venues.json`). Dynamic Google Places or Yelp API integration can be connected via the same `VenueCard` schema by replacing or augmenting the dataset.

---

## 4. Conclusion

The technical survey and architectural blueprint for the Group Indecision Tinder-Style Swiping Web App is complete and documented in detail in `survey_architecture.md`:
1. **Stack**: Single root `package.json` using Node.js + Express backend, Vite + React frontend, Vitest + Supertest testing, and Tailwind/Lucide UI.
2. **Room Management**: Phonetic room codes (`TACO42`), deep links (`/?room=:code`), anonymous participant identity, and a 5-state lifecycle machine (`lobby` -> `voting` -> `matched` | `tiebreaker` -> `closed`).
3. **Synchronization**: Zero-dependency Server-Sent Events (SSE) with 15s heartbeats and automatic polling fallback.
4. **API Contracts**: Exhaustive REST route specifications and data schemas for Room, Participant, VenueCard, and Votes.

---

## 5. Verification Method

To independently verify this survey:
1. **Inspect Report Content**:
   - Check `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_survey_2_1\survey_architecture.md` (970+ lines) verifying:
     - Section 2: Stack comparison matrix, directory layout, and `package.json` specification.
     - Section 3: Room lifecycle state machine, room code generation algorithm, and TypeScript/JSDoc entity schemas.
     - Section 4: SSE streaming protocol, client EventSource lifecycle, and event schemas.
     - Section 5: REST API route specifications with full request/response JSON payloads.
     - Section 7: Single-command startup (`npm start`, `npm run dev`) and single-command test execution (`npm test`).
2. **Invalidation Conditions**:
   - If orchestrator mandates Next.js or GraphQL rather than Express + Vite/React REST.
   - If room codes must be persistent multi-week relational database entities rather than ephemeral group sessions.
