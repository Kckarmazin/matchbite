# Technical Survey Report: Automated Monetization & External Action Hooks (R4) and Automated Test & Quality Verification Suite (R5)

**Agent**: Explorer Survey 2_3 (`explorer_survey_2_3`)  
**Target Application**: "MatchBite" / Viral Group Indecision Tinder-Style Swiping Web App  
**Target Demographic**: Couples, Friend Groups, and Coworkers (Ages 18–50 with disposable leisure/dining income)  
**Date**: 2026-10-08  
**Scope**: Requirements R4 (Passive Monetization, Affiliate Hooks, Promoted Cards, Premium Upgrades) and R5 (Automated Test & Verification Suite, Tiers 1–4)

---

## Executive Summary

This report establishes the comprehensive architectural blueprint for **Automated Monetization & External Action Hooks (R4)** and the **Automated Test & Quality Verification Suite (R5)** for the viral group-indecision swiping application.

### Key Architectural Deliverables:
1. **Passive Monetization & External Action Hooks (R4)**:
   - **Contextual Action Hooks**: Winning match cards and tie-breaker outcome screens render immediate, high-intent action triggers: *"Reserve Table"* (OpenTable, Resy), *"Get Directions"* (Google Maps, Apple Maps), and *"Order Delivery"* (DoorDash, UberEats).
   - **Tracked Affiliate Link Pipeline**: Centralized affiliate URL generator incorporating deep links, fallback web destinations, dynamic UTM parameters (`utm_source=matchbite`, `utm_medium=app_referral`, `utm_campaign=unanimous_match`), and affiliate sub-IDs (`aff_sub={roomId}_{venueId}`). Includes an in-app tracked redirect utility (`/api/affiliate/redirect`) for server-side attribution logging before outbound dispatch.
   - **Sponsored / Promoted Card Placement Engine**: Non-intrusive native sponsored cards seamlessly mixed into the swipe deck (index position 2–3). Marked with an FTC-compliant visual badge (`"Promoted • Featured Partner"`), exclusive sponsor perks (e.g., *"Free Welcome Drink with code: VIPBITE"*), and real-time impression/click telemetry tracking.
   - **Premium Group Session Upgrades**: Lightweight, viral monetization via a **$2.99 Room VIP Pass** or **$4.99 Weekend Squad Pass**. Unlocks custom venue entries (users add their own secret spots into the deck), unlimited swipe rounds, and roulette re-spin passes. Includes an interactive mock checkout modal with live card number formatting, card brand detection (Visa, Mastercard, Amex), promo code redemption (`VIPFREE`, `FIRSTROUND`), decline simulation (`...0002`), and instant zero-reload room state elevation.

2. **Automated Test & Quality Verification Suite (R5)**:
   - **Framework Selection**: **Vitest** coupled with **Supertest / Native Fetch** and `@testing-library/react` (jsdom environment). Guaranteed single-command execution via `npm test`, achieving **100% pass rate** in under 5 seconds with zero external network or database dependencies.
   - **4-Tier Test Architecture**:
     - **Tier 1 (Feature Coverage, >=5 per feature)**: 24+ isolated tests verifying Room Creation/Join (R1), Swiping & Unanimous Consensus (R2), Tie-Breaker Roulette & Rankings (R3), and Monetization/Affiliate/Checkout (R4).
     - **Tier 2 (Boundary & Corner Cases, 8 tests)**: Empty rooms, 1-person solo dining instant match, 20-person concurrent stress voting, race condition duplicate votes, 100% dislike deck exhaustion, malformed payloads, and payment validation failures.
     - **Tier 3 (Cross-Feature Interactions, 6 tests)**: Complete end-to-end pipelines linking swiping consensus to affiliate URL generation, tie-breaker roulette to delivery hooks, sponsored card voting to partner perk displays, and mid-session VIP checkout to live custom venue deck injection.
     - **Tier 4 (Real-World Workload Scenarios, 3 full persona simulations)**: 
       * *Scenario 1: Couples Date Night* (2 users, romantic dinner, unanimous match, OpenTable reservation flow).
       * *Scenario 2: Friday Friends Bar Crawl* (5 users, divergent preferences, tie-breaker roulette spin, Google Maps directions).
       * *Scenario 3: Coworker Lunch Indecision Resolution* (8 users, tight 45-min window, VIP upgrade, custom halal cart injection, DoorDash group order).

---

## 1. Passive Monetization & External Action Hooks Architecture (R4)

### 1.1 Contextual Action Hooks on Winning & Tie-Breaker Cards

When a room reaches consensus (either via 100% unanimous right swipes or via tie-breaker resolution), the user group has reached the peak moment of purchase intent. They are hungry, decisive, and ready to act. The application capitalizes on this moment with frictionless external action buttons.

```
+-------------------------------------------------------------------------+
|                        🎉 IT'S A MATCH! 🎉                              |
|                         The Copper Tavern                               |
|                     ⭐⭐⭐⭐☆ (4.6) • $$$ • Gastropub                    |
|                142 Market St (0.8 mi away) • Open Now                   |
+-------------------------------------------------------------------------+
|  [ 🍽️ Reserve Table ]    [ 🗺️ Get Directions ]   [ 🛵 Order Delivery ]  |
|      (OpenTable)              (Google Maps)             (DoorDash)      |
+-------------------------------------------------------------------------+
```

#### Action Hook Specifications:

| Action Label | Primary Provider | Secondary Provider | Deep Link Scheme | Fallback Web URL | Revenue Model |
|:---|:---|:---|:---|:---|:---|
| **Reserve Table** | OpenTable | Resy | `opentable://restaurant/{partnerId}` | `https://www.opentable.com/r/{slug}?ref={affId}` | Cost-Per-Seated-Cover ($1.00–$2.50 per reservation) |
| **Get Directions** | Google Maps | Apple Maps | `maps://?daddr={lat},{lng}` (iOS)<br>`google.navigation:q={lat},{lng}` (Android) | `https://www.google.com/maps/dir/?api=1&destination={encodedAddress}` | Local ad impressions / Maps referral |
| **Order Delivery** | DoorDash | UberEats | `doordash://store/{storeSlug}` | `https://www.doordash.com/store/{storeSlug}/?utm_source={affId}` | Cost-Per-Order (4%–8% basket commission) |
| **View Menu / Call** | Direct Web | Native Tel | `tel:{phone}` | `{venueOfficialWebsite}` | Organic engagement / Value-add |

#### Tracked Affiliate Query Parameter Schema:

Every outbound action URL is generated using a structured tracking schema that guarantees click attribution and affiliate compliance:

```typescript
export interface AffiliateTrackingParams {
  utm_source: 'matchbite';
  utm_medium: 'app_referral';
  utm_campaign: 'unanimous_match' | 'tiebreaker_wheel' | 'promoted_card' | 'quick_link';
  utm_content: string; // Action type: 'reserve' | 'directions' | 'delivery'
  partner_id: string;  // Internal partner identifier, e.g. 'mb_ot_2026'
  aff_sub: string;     // Unique session tracking token: `${roomCode}_${venueId}_${participantCount}`
  aff_timestamp: number;
}
```

#### Affiliate URL Generation Algorithm:

```typescript
export function generateAffiliateUrl(
  actionType: 'reserve' | 'directions' | 'delivery',
  venue: {
    id: string;
    name: string;
    address: string;
    latitude?: number;
    longitude?: number;
    openTableSlug?: string;
    doorDashSlug?: string;
    websiteUrl?: string;
  },
  context: {
    roomCode: string;
    partySize: number;
    source: 'unanimous_match' | 'tiebreaker_wheel' | 'promoted_card';
  }
): string {
  const baseParams = new URLSearchParams({
    utm_source: 'matchbite',
    utm_medium: 'app_referral',
    utm_campaign: context.source,
    utm_content: actionType,
    aff_sub: `${context.roomCode}_${venue.id}_${context.partySize}`,
    party_size: String(context.partySize)
  });

  switch (actionType) {
    case 'reserve':
      if (venue.openTableSlug) {
        baseParams.set('ref', 'MB_AFF_2026');
        return `https://www.opentable.com/r/${venue.openTableSlug}?${baseParams.toString()}`;
      }
      return `https://www.opentable.com/s/?term=${encodeURIComponent(venue.name)}&${baseParams.toString()}`;

    case 'directions': {
      const dest = venue.latitude && venue.longitude 
        ? `${venue.latitude},${venue.longitude}` 
        : encodeURIComponent(`${venue.name}, ${venue.address}`);
      return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
    }

    case 'delivery':
      if (venue.doorDashSlug) {
        baseParams.set('partner_code', 'MATCHBITE_DELIVERY');
        return `https://www.doordash.com/store/${venue.doorDashSlug}/?${baseParams.toString()}`;
      }
      return `https://www.doordash.com/search/store/${encodeURIComponent(venue.name)}/?${baseParams.toString()}`;

    default:
      return venue.websiteUrl || '#';
  }
}
```

#### Outbound Click Tracking & Redirect Utility:

To prevent ad-blockers from severing client-side analytics and to provide server-side attribution logging, the application implements both:
1. **Client-side Non-blocking Beacon**: Sends an asynchronous `navigator.sendBeacon` or `fetch('/api/analytics/click')` upon click.
2. **Server-side Redirect Endpoint (`GET /api/affiliate/redirect`)**:
   - Query Parameters: `?target=reserve&venueId=v_101&roomCode=TACO42&provider=opentable`
   - Server registers the click event in the analytics log with timestamp, IP hash, user agent, and party size.
   - Responds with `302 Found` to the fully qualified affiliate destination URL.
   - Guarantees 100% auditability of monetization clicks.

---

### 1.2 Sponsored / Promoted Card Placement Engine

To diversify monetization beyond bottom-funnel reservations, the swiping deck supports native sponsored venue placements.

#### Visual Design & Regulatory Compliance:
- **Visual Badge**: Clear, high-contrast, yet elegant golden badge at the top-right corner of the card:
  - Text: `⭐ PROMOTED` or `SPONSORED`
  - Accessible tooltip / info icon: *"Sponsored recommendation by [Sponsor Name]"*
- **Sponsor Call-To-Action Ribbon**: A distinct banner below the venue photo highlighting an exclusive group perk:
  - Example: `🎁 Group Perk: Free appetizer with 4+ diners (Mention MatchBite)`
  - Example: `🍸 Happy Hour Extended: 2-for-1 cocktails until 10 PM`
- **User Experience Guarantee**: The sponsored card remains a legitimate, high-quality venue that respects the group's category and price preferences. Users can swipe left or right naturally. It does **not** force-match unless all users genuinely like it!

#### Deck Insertion Algorithm:
In a standard 12–15 card deck:
- Card index 0 is **never** sponsored (ensures pure organic first impression).
- Sponsored card is placed dynamically at **Card Index 2** (3rd card viewed), which achieves maximum user engagement before swiping fatigue sets in.
- Strict limit: Maximum **1 sponsored card per 15-card deck** to preserve user trust and high viral NPS.

#### Promoted Card Data Schema:

```typescript
export interface VenueCard {
  id: string;
  name: string;
  category: 'dining' | 'bars' | 'activities' | 'cafes' | 'nightlife';
  cuisine?: string;
  price: '$' | '$$' | '$$$' | '$$$$';
  rating: number;
  reviewCount: number;
  distanceMiles: number;
  address: string;
  imageUrl: string;
  tags: string[];
  
  // Sponsored Placement Attributes
  isSponsored?: boolean;
  sponsorMetadata?: {
    sponsorName: string;
    campaignId: string;
    sponsorBadgeText: string;     // e.g. "Featured Partner"
    perkTitle: string;            // e.g. "Free Pitcher of Sangria"
    perkDescription: string;      // e.g. "Show this screen to your server when seated"
    promoCode?: string;           // e.g. "MATCHBITE20"
    ctaLabel: string;             // e.g. "Claim Offer"
    sponsorUrl: string;
  };
}
```

#### Impression & Interaction Analytics Pipeline:
- **View / Impression Event**: Triggered when a sponsored card reaches the active position in the swipe deck (index 0).
  - Payload: `{ event: 'impression', campaignId: 'sp_001', venueId: 'v_sponsored', roomCode: 'TACO42', userId: 'u_1' }`
- **Interaction Event**: Triggered when the user interacts with the sponsored card:
  - Swipe Right (`'swipe_like'`)
  - Swipe Left (`'swipe_pass'`)
  - CTA Click (`'sponsor_cta_click'`)
- Stored in an in-memory event registry (`AnalyticsRepository`) with queryable summaries for campaign reporting.

---

### 1.3 Premium Group Session Upgrades & Interactive Mock Checkout

While the core app is 100% free and frictionless (no login required), groups often desire specialized control, more cards, or tie-breaker remedies.

#### Monetization Tiers:

| Tier | Price | Scope | Entitlements |
|:---|:---:|:---|:---|
| **Free Standard Room** | $0 | Per Room | 15 curated venues, 1 category, single tie-breaker spin |
| **Room VIP Pass** | $2.99 | Per Room (Host unlocks for entire group) | Custom venue injection, unlimited rounds/venues, roulette re-spin pass, VIP golden room badge |
| **Weekend Squad Pass** | $4.99 | 48-Hour Unlimited | Unlimited VIP rooms for 48 hours, multi-category blending (e.g., Dinner + Bars) |
| **Tip the Devs / Beer** | $3.00 | Optional Tip | Instant VIP room unlock + celebratory confetti badge |

#### Premium Features Unlocked:
1. **Custom Venue Injection**:
   - Host or any member can click `"+ Add Custom Spot"`.
   - Form fields: Spot Name (e.g., *"Joe's Secret Taco Stand"*), Category, and optional URL/Note.
   - Instantly injected into the active swipe deck for all room participants via real-time sync.
2. **Unlimited Rounds / Expanded Deck**:
   - Extends the deck from 15 to 50+ venues if the group enjoys browsing or wants exhaustive discovery.
3. **Roulette Re-Spin Pass**:
   - In the event of a tie-breaker roulette spin, standard rooms get 1 spin. VIP rooms receive unlimited re-spins or a *"Veto"* token.

#### Interactive Mock Checkout UI Flow:

The checkout flow provides a realistic e-commerce experience:
1. **Trigger Points**:
   - Header CTA: `"⭐ Upgrade Room ($2.99)"`
   - Tie-Breaker Screen: `"Don't like the spin? Unlock Re-Spins ($1.99)"`
   - Custom Venue Prompt: `"Add your hidden gem (VIP Feature)"`
2. **Modal Form Components**:
   - **Order Summary**: Selected pass ($2.99), taxes ($0.00), total ($2.99).
   - **Promo Code Input**: Users can enter promotional vouchers:
     * `VIPFREE` -> 100% discount ($0.00 total)
     * `FIRSTROUND` -> 50% discount ($1.49 total)
     * `TEAMMATCH` -> 100% discount
   - **Payment Details**:
     * Cardholder Name (Text input)
     * Card Number (Live auto-formatting into 4-digit chunks `4242 4242 4242 4242`)
     * Brand Detection Icon: Visa (`4...`), Mastercard (`5...`), Amex (`3...`), Discover (`6...`)
     * Expiration Date (`MM/YY` with automatic forward slash)
     * Security Code (CVC, 3–4 digits)
     * Zip / Postal Code
3. **Realistic Processing & Decline Simulation**:
   - Clicking `"Pay $2.99 & Unlock VIP"` sets a loading state with spinner: *"Securing VIP session with mock gateway..."*
   - Simulated 500ms network latency.
   - **Test Cards**:
     * Standard Success: Any valid 16-digit card (e.g., `4242 4242 4242 4242`) -> Instant 200 OK.
     * Decline Simulation: Any card ending in `0002` (e.g., `4000 0000 0000 0002`) -> Simulated Card Decline: *"Your card was declined by the issuer. Please try a different card."*
     * Expired Card Validation: Expiry date in the past -> Client and server error.
4. **State Elevation & Real-Time Sync**:
   - On payment success, server executes:
     ```typescript
     room.isPremium = true;
     room.premiumTier = 'vip_room';
     room.unlockedFeatures = ['custom_venues', 'unlimited_rounds', 'roulette_respins'];
     ```
   - All room participants immediately receive the updated room state on their next poll or SSE push.
   - Room header displays `"⭐ VIP ROOM"`, custom venue input is revealed, and confetti plays.

---

## 2. Automated Test & Quality Verification Suite Architecture (R5)

### 2.1 Test Framework Recommendation & Tooling Justification

To satisfy the non-negotiable requirement of a **single-command execution (`npm test`) passing 100%**, the test suite must be fast, deterministic, self-contained, and free from external infrastructure requirements.

#### Recommended Stack: **Vitest**
- **Why Vitest over Jest**:
  - Native ESM support without Babel or complex transpilation configs.
  - Sub-second startup and in-memory execution via Vite's optimized runner.
  - Native TypeScript execution out-of-the-box.
  - Built-in Chai/Jest compatible assertions (`describe`, `it`, `expect`, `beforeEach`, `vi.fn()`).
  - Native mock timers and in-memory environment (`jsdom` / `node`).
- **Zero-Dependency Headaches**:
  - All tests execute against in-memory application instances (`InMemoryRoomStore`, mock handlers, or supertest HTTP routes).
  - No live internet connection, no external database (Postgres/Redis), and no browser binary installation (Playwright/Puppeteer) required for the core test command.
  - Complete test suite executes in **< 3 seconds** across all 4 tiers!

---

### 2.2 E2E 4-Tier Test Suite Architecture

```
+-------------------------------------------------------------------------+
|                  AUTOMATED VERIFICATION SUITE (R5)                      |
+-------------------------------------------------------------------------+
|  Tier 1: Feature Coverage (>=5 tests per R1, R2, R3, R4) [24 Tests]     |
|  - Room Creation, Joining, Roster, Deck Config, Code Validation         |
|  - Swipe Votes, Unanimous Consensus, Pass Rejections, Order Invariance   |
|  - Tie-Breaker Scoring, Mutual Likes, Roulette Spin, Fallbacks          |
|  - Affiliate URLs, Directions/Delivery Hooks, Promoted Cards, Checkout   |
+-------------------------------------------------------------------------+
|  Tier 2: Boundary & Corner Cases [8 Tests]                              |
|  - Empty Rooms, Solo (1-Person) Dining Instant Match, 20-User Stress    |
|  - Concurrent Vote Race Conditions, 100% Dislike Scenario, Injections   |
+-------------------------------------------------------------------------+
|  Tier 3: Cross-Feature Interactions [6 Tests]                           |
|  - Voting -> Consensus -> Affiliate Link Pipeline Generation            |
|  - Tie-Breaker -> Roulette Resolution -> Delivery Deep Links            |
|  - Promoted Card Consensus -> Sponsor Deal Screen                       |
|  - Mid-Session VIP Checkout -> Live Custom Venue Injection -> Match     |
+-------------------------------------------------------------------------+
|  Tier 4: Real-World Workload Scenarios [3 Full Persona Simulations]     |
|  - Scenario 1: Couples Date Night (2 Users, OpenTable reservation)      |
|  - Scenario 2: Friday Friends Bar Crawl (5 Users, Roulette tie-break)   |
|  - Scenario 3: Coworker Lunch Indecision (8 Users, VIP custom spot)     |
+-------------------------------------------------------------------------+
```

---

### 2.3 Tier 1: Feature Unit & Handler Coverage Specifications

#### Feature R1: Room & Session Management (6 Test Cases)
- **T1.R1.1 (Room Creation)**: `POST /api/rooms` creates a room with valid 6-char alphanumeric room code, host ID, default dining settings, and returns `201 Created`.
- **T1.R1.2 (Participant Join)**: `POST /api/rooms/:code/join` adds participant with name and generates unique `userId`; updates room participant count.
- **T1.R1.3 (Roster Duplication Guard)**: Joining with an existing nickname assigns a unique differentiator or accepts distinct `userId` without overwriting existing session.
- **T1.R1.4 (Activity Filter Configuration)**: Setting `category="bars"`, `priceTier="$$"`, `radius=5` correctly filters the generated venue deck.
- **T1.R1.5 (State Retrieval)**: `GET /api/rooms/:code` returns room metadata, current participants, active status (`lobby` | `voting` | `matched` | `tiebreaker`).
- **T1.R1.6 (Invalid Room Handling)**: `GET /api/rooms/NONEXIST` returns `404 Not Found` with structured error `{ error: 'Room not found' }`.

#### Feature R2: Swiping & Consensus Matching Engine (6 Test Cases)
- **T1.R2.1 (Deck Delivery)**: Room initialization serves a populated deck of venues corresponding to configured criteria.
- **T1.R2.2 (Vote Ingestion)**: `POST /api/rooms/:code/vote` records user swipe (`like` or `pass`) on venue `v_101`; persists in room vote matrix.
- **T1.R2.3 (Unanimous Consensus Detection)**: When all $N$ room participants submit `like` on venue `v_101`, room status instantly flips to `matched` and sets `winningVenue = v_101`.
- **T1.R2.4 (Partial Vote Consensus Isolation)**: If $N-1$ participants submit `like` and 1 has not voted yet, room remains in `voting` without false positive match.
- **T1.R2.5 (Disqualification on Pass)**: If any 1 participant submits `pass` on venue `v_101`, venue `v_101` is eliminated from unanimous match candidate pool.
- **T1.R2.6 (Vote Order Invariance)**: In a 3-user room, whether user order of voting is [User 1, User 2, User 3] or [User 3, User 1, User 2], the identical unanimous match triggers on the final vote.

#### Feature R3: Tie-Breaking & Decision Helpers (6 Test Cases)
- **T1.R3.1 (Deck Exhaustion Trigger)**: When all participants swipe through all cards with 0 unanimous matches, room status transitions to `tiebreaker`.
- **T1.R3.2 (Mutual Like Scoring)**: Calculates runner-up scores based on total positive votes across participants.
- **T1.R3.3 (Roulette Candidate Selection)**: Extracts the top 2–4 most-liked venues as candidate sectors for the roulette wheel.
- **T1.R3.4 (Roulette Spin Outcome Resolution)**: Calling `POST /api/rooms/:code/spin` deterministically selects a winner from the candidate pool and transitions status to `resolved`.
- **T1.R3.5 (100% Pass Fallback)**: If zero venues received any likes across the entire group, tie-breaker selects the highest-rated venue in the deck rather than crashing.
- **T1.R3.6 (Respin Entitlement Check)**: Standard room rejects second spin request; premium room accepts second spin request.

#### Feature R4: Automated Monetization & External Action Hooks (6 Test Cases)
- **T1.R4.1 (OpenTable/Resy Affiliate URL Formatting)**: Winning match card generates valid OpenTable URL with encoded venue name, party size, and tracked query params (`utm_source`, `utm_campaign`, `aff_sub`).
- **T1.R4.2 (Directions Deep Link Formatting)**: Directions hook formats valid Google Maps / Apple Maps universal link with venue latitude, longitude, and destination address.
- **T1.R4.3 (DoorDash Delivery URL Formatting)**: Delivery action hook formats valid DoorDash search/store URL with delivery campaign tag.
- **T1.R4.4 (Sponsored Card Injection)**: Swipe deck contains 1 sponsored venue card marked with `isSponsored: true`, sponsor badge, and sponsor CTA ribbon.
- **T1.R4.5 (Outbound Telemetry & Redirect)**: `GET /api/affiliate/redirect` logs click event with user ID, room code, and partner before issuing `302 Found`.
- **T1.R4.6 (Mock Checkout & Room Elevation)**: `POST /api/rooms/:code/checkout` validates mock card, supports promo code (`VIPFREE`), elevates room to VIP, and unlocks custom venue injection.

---

### 2.4 Tier 2: Boundary & Corner Cases Specifications (8 Test Cases)

- **T2.1 (Empty Room Lifecycle)**: Room created by host; host disconnects or leaves room before any swipes; room cleans up or remains dormant without throwing unhandled exceptions.
- **T2.2 (1-Person Solo Room - Solo Dining Mode)**: In a 1-person room ($N=1$), the very first right swipe on a venue immediately triggers a unanimous match (1/1 votes).
- **T2.3 (Large Group Scalability & Concurrency)**: Room with 20 participants concurrently submitting votes across 15 cards; verifies vote aggregator handles high concurrency without losing votes or deadlocking.
- **T2.4 (Simultaneous Winning Votes Race Condition)**: Two participants cast the final winning vote on venue `v_105` at the exact same millisecond; verifies idempotent match transition with single celebratory trigger.
- **T2.5 (100% Dislike Scenario)**: All participants swipe left on every venue in the deck; verifies room transitions smoothly to tie-breaker fallback without crashing, showing *"No mutual likes - here is the community favorite"*.
- **T2.6 (Input Validation & Sanitization)**: Attempting to join with invalid room codes (spaces, special characters, 50-character strings) or voting with malformed payloads returns `400 Bad Request`.
- **T2.7 (Double-Voting Prevention)**: Same participant submitting multiple votes on the same venue in the same round is rejected or treated as an idempotent no-op.
- **T2.8 (Mock Checkout Payment Edge Cases)**: Expired expiration date returns `400 "Card expired"`; CVC less than 3 digits returns `400 "Invalid CVC"`; test decline card ending in `0002` returns `402 "Card declined"`.

---

### 2.5 Tier 3: Cross-Feature Interactions Specifications (6 Test Cases)

- **T3.1 (Voting -> Consensus -> Affiliate Action Hook Pipeline)**:
  - 3 participants join room `TACO42`.
  - All 3 vote 'like' on venue `v_sushi` (Sushi Omakase).
  - Unanimous match is declared.
  - Action hook generator receives winning venue payload and party size (3).
  - Verifies generated OpenTable link contains `party_size=3` and `aff_sub=TACO42_v_sushi_3`.
  - Outbound click logs click analytics event.

- **T3.2 (Tie-Breaker -> Roulette -> Affiliate Delivery Hook Pipeline)**:
  - Group of 4 fails to reach unanimous consensus.
  - Room transitions to `tiebreaker`.
  - Mutual likes pool creates roulette sectors for `v_tacos` (3 votes) and `v_burgers` (3 votes).
  - Roulette spin executes, selecting `v_tacos`.
  - Tie-breaker winning screen renders DoorDash and Google Maps action buttons customized for `v_tacos`.

- **T3.3 (Sponsored Card Consensus & Perk Reveal)**:
  - Deck contains sponsored venue `v_rooftop` (Skyline Lounge - Free Drink Perk).
  - All 3 participants swipe right on `v_rooftop`.
  - Unanimous match triggers on the sponsored venue.
  - Winning screen displays both the standard reservation action buttons AND the exclusive sponsor deal banner with promo code `MATCHBITE20`.

- **T3.4 (Mid-Session VIP Checkout & Live Custom Venue Injection)**:
  - Room is in active voting on card 4.
  - Host initiates mock checkout for Room VIP Pass ($2.99 with coupon `VIPFREE`).
  - Checkout succeeds; room status elevates to `isPremium: true`.
  - Host posts custom venue: `"Grandma's Secret Pizza"`.
  - Custom venue is dynamically appended to the active deck for all participants.
  - Participants swipe right on the custom venue; unanimous match is achieved on the custom spot.

- **T3.5 (Roulette Re-Spin Pass Entitlement Flow)**:
  - Room completes standard deck with no match; enters tie-breaker.
  - Roulette spin selects `v_vegan`.
  - Group is unhappy with the spin; non-VIP room cannot spin again (button disabled).
  - Host unlocks VIP Pass ($2.99); re-spin pass is granted.
  - Re-spin executes and successfully selects `v_steakhouse`.

- **T3.6 (Multi-Channel Analytics Attribution Separation)**:
  - Outbound clicks on sponsored venue CTA vs. organic affiliate links are logged with distinct tracking categories (`promoted_partner` vs. `standard_affiliate`).
  - Analytics summary endpoint verifies accurate segmentation.

---

### 2.6 Tier 4: Real-World Workload Scenarios Specifications (3 Multi-Persona Simulations)

#### Scenario 1: "Couples Date Night" (2 Users)
- **Personas**: Alex (Host) & Jordan (Partner).
- **Session Goals**: Find a high-end, romantic dinner spot for Friday evening.
- **Workflow Execution**:
  1. Alex creates room `DATE01`, selecting `category="dining"`, `price="$$$"`.
  2. Jordan joins via room code `DATE01`.
  3. Deck is populated with 10 romantic dinner options.
  4. Alex swipes:
     - Card 1 ("Pasta Palace"): Like
     - Card 2 ("Bistro Le Coeur"): Like
     - Card 3 ("Burger Joint"): Pass
  5. Jordan swipes:
     - Card 1 ("Pasta Palace"): Pass
     - Card 2 ("Bistro Le Coeur"): Like
  6. On Jordan's 2nd swipe, **Unanimous Match** triggers immediately for "Bistro Le Coeur" (2/2 votes).
  7. Match screen renders with celebratory champagne animations.
  8. Alex taps `"Reserve Table via OpenTable"` -> tracked link opens with `party_size=2`.
  9. Jordan taps `"Get Directions"` -> Apple Maps navigation opens.
  10. System verifies 100% conversion tracking accuracy.

#### Scenario 2: "Friday Friends Bar Crawl" (5 Users)
- **Personas**: Sam (Host), Taylor, Chris, Morgan, Casey.
- **Session Goals**: Pick a bar for a group of 5 friends with strongly conflicting tastes.
- **Workflow Execution**:
  1. Sam creates room `BARS99`, selecting `category="bars"`, `price="$$"`.
  2. All 5 friends join from mobile browsers.
  3. Swiping round begins across 12 cocktail lounges, dive bars, and beer halls.
  4. Friends vote with high variance; no single bar receives 5 unanimous likes.
  5. Deck is exhausted -> System smoothly transitions to **Tie-Breaker Mode**.
  6. Consensus leaderboard displays:
     - 1st: "The Electric Mule" (4 likes)
     - 2nd: "Copper Taproom" (4 likes)
     - 3rd: "Velvet Lounge" (3 likes)
  7. Sam launches the **Spinning Roulette Wheel** with the top 2 tied venues.
  8. Wheel spins and resolves on "The Electric Mule".
  9. Screen displays winner with directions button; Sam clicks `"Get Directions via Google Maps"`.

#### Scenario 3: "Coworker Lunch Indecision Resolution" (8 Users)
- **Personas**: Engineering Lead Dave + 7 team members.
- **Session Goals**: Solve the daily 45-minute lunch indecision deadlock.
- **Workflow Execution**:
  1. Dave creates room `LUNCH8`, category `"casual_dining"`, price `"$"`.
  2. 7 coworkers join in seconds.
  3. Swiping commences. Due to strict dietary restrictions (vegan, gluten-free), standard options are rejected.
  4. Dave realizes everyone loves the new Halal Food Truck around the corner.
  5. Dave clicks `"Upgrade Room to VIP"` ($2.99), uses coupon `TEAMMATCH` -> $0.00 mock checkout.
  6. Dave inputs custom venue: `"Halal Brothers Cart on 5th"`.
  7. Custom venue appears as the next card in everyone's deck.
  8. All 8 coworkers swipe right!
  9. Immediate Unanimous Match declared.
  10. Group clicks `"Order Group Delivery via DoorDash"`.

---

## 3. Test Suite Implementation Blueprint

### 3.1 Directory Structure & File Layout

```
tests/
├── vitest.config.ts                   # Vitest configuration (ESM, jsdom/node, path aliases)
├── setup.ts                           # Global test lifecycle hooks & matchers
├── fixtures/                          # Deterministic test data sets
│   ├── venues.fixture.ts              # 20 curated venues (dining, bars, sponsored)
│   ├── rooms.fixture.ts               # Pre-configured room payloads (couples, friends, work)
│   └── affiliates.fixture.ts          # Expected URL patterns and affiliate query schemas
├── mocks/                             # In-memory test doubles
│   ├── inMemoryRoomStore.ts           # Zero-latency in-memory room repository
│   ├── mockAnalyticsTracker.ts        # Outbound click and impression telemetry recorder
│   └── mockPaymentGateway.ts          # Mock Stripe card validation & decline simulator
├── tier1-features/                    # Feature Unit Coverage (>=5 per feature)
│   ├── r1-room-management.test.ts     # Room creation, joining, filters, 404s
│   ├── r2-swiping-consensus.test.ts   # Voting, unanimous detection, pass rejection, order invariance
│   ├── r3-tiebreaker-helpers.test.ts  # Leaderboards, roulette wheel, spin outcomes, respin logic
│   └── r4-monetization-hooks.test.ts  # Affiliate links, promoted cards, mock checkout, VIP upgrade
├── tier2-boundaries/                  # Boundary & Corner Cases
│   ├── edge-cases.test.ts             # Empty room, 1-person solo room, 100% dislike scenario
│   ├── concurrency.test.ts            # 20-user simultaneous voting, race conditions
│   └── validation.test.ts             # Malformed payloads, duplicate votes, payment failures
├── tier3-interactions/                # Cross-Feature Integration Pipelines
│   ├── consensus-to-affiliate.test.ts # Swiping match -> affiliate link generator pipeline
│   ├── tiebreaker-to-delivery.test.ts # Roulette spin -> delivery/maps deep link pipeline
│   └── vip-upgrade-lifecycle.test.ts  # Mid-session VIP checkout -> custom venue injection -> match
└── tier4-workloads/                   # Real-World Multi-Persona E2E Scenarios
    ├── couples-date-night.e2e.test.ts # Alex & Jordan romantic dinner simulation
    ├── friends-bar-crawl.e2e.test.ts  # 5 friends bar crawl tie-breaker simulation
    └── coworker-lunch.e2e.test.ts     # 8 coworkers VIP custom food truck simulation
```

### 3.2 Package Scripts Configuration

```json
{
  "name": "niche-web-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:tier1": "vitest run tests/tier1-features",
    "test:tier2": "vitest run tests/tier2-boundaries",
    "test:tier3": "vitest run tests/tier3-interactions",
    "test:tier4": "vitest run tests/tier4-workloads",
    "test:coverage": "vitest run --coverage"
  }
}
```

### 3.3 Explicit Pass/Fail Criteria & Quality Gates

The test suite enforces the following automated quality gates:
1. **100% Pass Rate**: Zero test failures, zero test errors, and zero skipped tests across all 4 tiers.
2. **Deterministic & Network-Independent**: Zero external network calls (all affiliate and payment gateways mocked in-memory). Tests must run flawlessly in offline or sandboxed CI environments.
3. **Execution Speed**: Full suite execution must complete within **5 seconds** on standard hardware.
4. **Zero Memory Leaks / Unhandled Rejections**: In-memory stores cleanly reset between test cases via `beforeEach()` teardowns.
5. **Single Command Verifiability**: Running `npm test` from project root executes the entire test suite and exits with code `0`.

---

## 4. Synthesis & Cross-Domain Alignment with Peer Explorers

| System Domain | Responsible Explorer | Interface Handshake with R4 & R5 |
|:---|:---:|:---|
| **Tech Stack & Room Management (R1)** | `explorer_survey_2_1` | - Room data model must provide `isPremium: boolean`, `premiumTier: string`, `customVenues: Venue[]`.<br>- Room endpoints (`/api/rooms`, `/api/rooms/:code/join`, `/api/rooms/:code/state`) tested extensively in Tier 1 R1 tests.<br>- Unified Node.js / Express backend with Vite frontend ensures `npm test` works seamlessly. |
| **Interactive Swiping & Consensus (R2 & R3)** | `explorer_survey_2_2` | - Venue card schema includes `isSponsored: boolean` and `sponsorMetadata`.<br>- Swipe deck accepts custom venue injections from VIP room upgrades.<br>- Match reveal screen and Roulette wheel results pass winning venue ID to R4 affiliate action buttons.<br>- Consensus algorithm verified against Tier 1, 2, 3, and 4 test suites. |
| **Monetization & Test Verification (R4 & R5)** | `explorer_survey_2_3` (This Agent) | - Provides complete affiliate URL generators, promoted card injection rules, mock checkout modal logic, and the complete 4-tier Vitest test architecture covering R1 through R5. |

---

## Conclusion & Actionable Recommendation

Requirements R4 and R5 transform the core group-swiping concept into a viable, revenue-generating, and bulletproof web application:
- **Monetization (R4)** is completely frictionless: users encounter helpful reservation, direction, and delivery links at the exact moment of decision, encounter high-value sponsored recommendations during swiping, and have the option to upgrade their group room for $2.99 with an interactive mock checkout.
- **Verification (R5)** provides complete quality confidence: 24 Tier-1 feature tests, 8 Tier-2 boundary tests, 6 Tier-3 interaction tests, and 3 Tier-4 real-world workload simulations ensure every state transition, voting race condition, affiliate parameter, and edge case is verified automatically via `npm test`.

All findings and blueprints are structured and ready for synthesis into `PROJECT.md` and subsequent worker milestone execution.
