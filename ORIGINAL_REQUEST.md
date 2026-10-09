# Original User Request

## 2026-10-08T21:45:02Z

Conduct comprehensive market research to identify profitable digital product niches targeting adults aged 18–50 with disposable income, document the findings across 3–5 candidate niches, select the highest-potential niche, and build an interactive web application / SaaS utility tailored to attract, onboard, and monetize that audience.

Working directory: C:\Users\kck50\teamwork_projects\niche_web_app
Integrity mode: development

## Requirements

### R1. Market and Niche Analysis
Analyze market opportunities targeting adults aged 18–50 with disposable income. Produce a structured research report (`market_research.md`) evaluating 3–5 distinct niches against target demographic pain points, monetization feasibility, competition, and acquisition potential, documenting clear rationale for the selected niche.

### R2. Interactive Web Application Utility
Build a responsive, modern web application delivering immediate interactive utility for the chosen niche. The application must support complete core user journeys from landing to task completion.

### R3. User Onboarding and Lead Capture
Implement an onboarding and lead capture mechanism (e.g., account signup or email capture) that validates input data, handles error states gracefully, and persists submissions.

### R4. Monetization System
Implement functional monetization touchpoints (e.g., tiered feature access, premium subscriptions, or digital purchase) with an interactive mock checkout and upgrade flow.

### R5. Automated Test & Verification Suite
Provide an automated verification suite that validates core business logic, web routes/APIs, lead capture, and checkout flows without requiring manual testing.

## Acceptance Criteria

### Market Research
- [ ] `market_research.md` is generated detailing 3–5 distinct niches with demographic fit, revenue models, competitor overview, and final selection criteria.

### Application Functionality
- [ ] The web application builds cleanly and starts without errors via standard project commands.
- [ ] The core interactive utility is fully functional and produces valid output or interactive state transitions from user input.
- [ ] User onboarding / lead capture form validates input (e.g., email format) and confirms persistence.
- [ ] Monetization flow (plan selection, checkout modal/form, confirmation) executes end-to-end.

### Quality and Verification
- [ ] Automated test suite runs via a single command and passes 100% of tests covering core workflows and API handlers.
- [ ] The user interface renders responsively across desktop and mobile viewports without unhandled runtime exceptions.


## 2026-10-08T22:04:30Z

Build a responsive, viral web application that solves group indecision by allowing couples, friend groups, and coworkers to create a shared session, swipe right or left on bars, restaurants, or activities (Tinder-style), and instantly reveal a match when all group members agree on a spot. Include passive monetization mechanisms such as reservation/delivery affiliate links, sponsored card placements, and premium group features.

Working directory: C:\Users\kck50\teamwork_projects\niche_web_app
Integrity mode: development

## Requirements

### R1. Group Session & Room Management
Allow users to create a shared decision session (e.g. Couples Date Night, Friends Night Out, Coworker Lunch), set activity parameters (e.g., dining, bars, entertainment, price range, distance), and invite participants via a shareable link or room code without requiring mandatory app installs or account friction.

### R2. Interactive Swiping & Consensus Matching Engine
Provide an engaging card-swiping interface (swipe right to approve, left to pass) displaying venue details, imagery, cuisine/activity type, price tier, and reviews. Calculate participant votes in real-time or via asynchronous lobby, triggering an instant celebratory "Match!" reveal screen when everyone in the group has swiped right on the same venue.

### R3. Tie-Breaking & Decision Helpers
Include interactive tie-breaker tools (such as a spinning roulette wheel of mutual runner-up likes, or ranked-choice scoring) in case groups fail to achieve a 100% unanimous swipe match within a set round.

### R4. Automated Monetization & External Action Hooks
Incorporate passive monetization hooks on match and result cards:
- Direct action buttons (e.g., "Reserve Table", "Get Directions", "Order Delivery") formatted for affiliate referral partnerships (OpenTable, Resy, DoorDash, UberEats, Google Maps).
- A native mock sponsored placement card in the swipe deck (labeled "Promoted").
- Optional premium session upgrades (e.g., custom venue additions, unlimited rounds, or tie-breaker unlock).

### R5. Automated Test & Quality Verification Suite
Provide an automated test suite verifying room creation, multi-user vote aggregation, unanimous match resolution, tie-breaker logic, and responsive mobile/desktop UI rendering.

## Acceptance Criteria

### Core Functionality & Swiping
- [ ] Users can create a new session, select group type/activity category, and obtain a shareable join link or room code.
- [ ] Swiping interface functions smoothly on both mobile touch and desktop click/keyboard interactions with animated card transitions.
- [ ] Room engine tracks multiple participant votes and triggers the unanimous match screen immediately when all participants in a room vote "Yes" on a venue.
- [ ] If no unanimous match occurs after a swipe deck, a tie-breaker fallback (e.g., top-voted consensus list or spin wheel) is presented.

### Monetization & Action Integration
- [ ] Winning match card displays direct action links (mock reservation/booking, directions, menu, delivery) with tracked affiliate URL structures.
- [ ] The swipe deck displays at least one clearly designated "Promoted / Sponsored" venue card.
- [ ] A lightweight monetization touchpoint (e.g., premium pass or tip/coffee modal) is implemented end-to-end.

### Quality & Performance
- [ ] The web application builds cleanly and runs locally with a single startup command.
- [ ] Automated test suite runs via a single command and passes 100% of tests covering room voting logic, match triggers, and API routes.
- [ ] Responsive design functions without horizontal scroll or clipping across standard mobile and desktop viewports.


## 2026-10-09T02:43:49Z

Resume execution of the MatchBite project at C:\Users\kck50\teamwork_projects\niche_web_app.

Milestone 1 is complete and verified (57 tests passing, room management, SSE streaming, dual-token host security).

Pick up immediately from Milestone 2:
1. Complete Milestone 2: Interactive Swiping & Consensus Matching Engine (wire swipe card UI to voting endpoints, real-time vote tallying, celebratory match screen with confetti).
2. Execute Milestone 3: Tie-Breaking Helpers & Decision Roulette (ranked-choice leaderboard, canvas spin wheel with sync).
3. Execute Milestone 4: Monetization & External Action Hooks (affiliate reservation/delivery links, promoted card placement, VIP upgrade checkout modal).
5. Execute Milestone 5: Automated Test Suite (Vitest + Supertest, 100% pass rate across unit, integration, boundary, and E2E tiers).
6. Milestone 6: Final verification, clean build, and victory audit.

All project requirements and specifications are defined in:
- C:\Users\kck50\teamwork_projects\niche_web_app\ORIGINAL_REQUEST.md
- C:\Users\kck50\teamwork_projects\niche_web_app\PROJECT.md

Integrity mode: development. Keep progress.md and BRIEFING.md updated. When all acceptance criteria pass with 100% tests and clean audit, report completion.

## 2026-10-09T17:04:54Z

Expand MatchBite's venue discovery engine to return a significantly larger selection of local restaurants and venues, and fix distance radius filtering so venues are accurately measured and prioritized by true geographic distance from the search origin.

Working directory: `C:\Users\kck50\teamwork_projects\niche_web_app`
Integrity mode: development

## Requirements

### R1. Deep Multi-Batch Venue Selection
- The venue discovery engine must return a substantially larger selection of venues (targeting 50–100+ unique spots when "All Places" is selected in populated areas) across Google Places API and OpenStreetMap Overpass.
- Parallelize multi-category queries, handle pagination/type expansion, and prevent duplicate entries across overlapping searches.
- Ensure that selecting specific cuisine filters returns all available matching venues in the search area without artificially capping at single-batch API limits.

### R2. Accurate Geographic Distance & Radius Filtering
- Compute real geographic distance (Haversine formula from room coordinates / zip code) for every venue, ensuring displayed distance tags and values match actual physical proximity.
- Incorporate distance settings into cache keys (`getGridKey`) so switching between Walkable (<1mi), Short Drive (<5mi), and Metro Area (<15mi) fetches and serves the appropriate geographic radius rather than stale cache hits from different radii.
- Sort the candidate deck by distance ascending (closest first) so users always swipe through nearby spots before further ones.
- Strictly prioritize venues within the selected radius (`walkable` <= 1.0 mi, `short_drive` <= 5.0 mi, `metro_area` <= 15.0 mi), with flexible fallback padding only if fewer than 4-6 spots exist in the immediate perimeter.

### R3. Interactive Lobby Adjustments & Deck Synchronization
- Ensure changes made to distance, cuisines, or deck size in the lobby (via the "Adjust" settings drawer) immediately invalidate mismatched caches and rebuild the swiping deck to match the updated radius and filters.
- Display verified distance on cards and ensure the frontend deck correctly renders the expanded venue pool.

### R4. Regression Guard & Test Verification
- All 254 existing Vitest tests must continue to pass with 100% success rate.
- Add targeted automated tests verifying distance calculation accuracy, distance sorting order, and cache separation across different radius tiers.

## Acceptance Criteria

### Venue Volume & Variety
- [ ] Querying with `deckSize: 'all'` in an active metro area returns 50+ unique venues when using Google Places API or Overpass.
- [ ] No duplicate venues exist in the swiping deck (verified by unique Place ID / coordinates / name deduplication).

### Distance Precision
- [ ] Venues in the candidate deck are sorted ascending by geographic distance from the search origin.
- [ ] When `walkable` (<1mi) is chosen, places are within 1.0 mile (unless the area has < 4 spots, in which case closest available fallbacks are provided).
- [ ] Cache keys in `PlacesService` distinguish between distance tiers so changing radius does not return stale caches.

### Stability & Verification
- [ ] `npm test` passes 100% across all test suites without regressions.
- [ ] `npm run build` compiles cleanly with zero errors.
