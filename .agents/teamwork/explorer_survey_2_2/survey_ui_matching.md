# Comprehensive Technical Survey: Interactive Swiping, Consensus Matching Engine, & Tie-Breaking Helpers

**Project**: `niche_web_app` — Viral Group Indecision Resolver (Tinder-Style Group Swiping)  
**Author**: Explorer Survey Agent 2 (`explorer_survey_2_2`)  
**Parent**: `orchestrator_2` (Conversation ID: `20812a10-1e1e-4b2a-8eec-3122d65537ad`)  
**Date**: 2026-10-08  
**Reference Document**: `ORIGINAL_REQUEST.md` (Specifically R2: Interactive Swiping & Consensus Matching Engine, R3: Tie-Breaking & Decision Helpers)

---

## Table of Contents
1. [Executive Summary & Core Objectives](#1-executive-summary--core-objectives)
2. [UI/UX Card Swiping Engine](#2-uiux-card-swiping-engine)
   - 2.1 Pointer Events Architecture & Cross-Platform Touch Handling
   - 2.2 Mathematical Formulations: Displacement, Rotation, & Spring Physics
   - 2.3 Gesture Thresholds & Multi-Directional Commitments (Left, Right, Up)
   - 2.4 Dynamic Stamp Overlays (LIKE, NOPE, SUPERLIKE)
   - 2.5 Card Stacking Physics & Depth Scaling
   - 2.6 Viewport Layout & Zero-Overflow Responsive Geometry
   - 2.7 Keyboard Navigation & Accessibility (a11y)
   - 2.8 Floating Action Button Dock
3. [Rich Venue Deck Design](#3-rich-venue-deck-design)
   - 3.1 Comprehensive Venue Data Schema (TypeScript)
   - 3.2 Category-Specific Deck Architecture (Bars, Dining, Activities, Coffee, Nightlife)
   - 3.3 Visual Information Hierarchy & Micro-Layouts
   - 3.4 Sponsored / Promoted Venue Card Specifications
4. [Consensus Matching Engine (R2)](#4-consensus-matching-engine-r2)
   - 4.1 Multi-Participant Vote Aggregation Algorithm
   - 4.2 Mathematical Consensus Formulation (Unanimous Detection)
   - 4.3 Real-Time State Synchronization & Event Lifecycle
   - 4.4 Celebratory Match Reveal Screen (Confetti, Haptics, Audio Synthesis)
5. [Tie-Breaking & Decision Helpers (R3)](#5-tie-breaking--decision-helpers-r3)
   - 5.1 Round Completion & No-Match Detection
   - 5.2 Helper A: Ranked-Choice Consensus Leaderboard
   - 5.3 Helper B: Interactive Canvas Roulette Wheel (Physics & Wedge Geometry)
   - 5.4 Synchronized Spin Engine & Winner Transition
6. [Component Architecture & State Management](#6-component-architecture--state-management)
   - 6.1 React Component Hierarchy & Prop Contracts
   - 6.2 Finite State Machine (FSM) & Transition Table
   - 6.3 Edge Cases & Defensive UX Mitigations
7. [Production Code Blueprints](#7-production-code-blueprints)
   - 7.1 Zero-Dependency Pointer Gesture Hook (`useSwipeGesture.ts`)
   - 7.2 Zero-Dependency Canvas Confetti Celebration Engine (`confetti.ts`)
   - 7.3 Interactive Roulette Wheel Physics Engine (`RouletteWheel.tsx`)
8. [Next Steps & Worker Handoff Guidelines](#8-next-steps--worker-handoff-guidelines)

---

## 1. Executive Summary & Core Objectives

Group indecision—the agonizing "Where should we go tonight?" loop among couples, friend groups, and coworkers—is caused by social friction: fear of rejection, hidden vetoes, and decision fatigue. This application resolves that friction through a gamified, mobile-first, synchronized card-swiping experience.

To fulfill **Requirement 2 (Interactive Swiping & Consensus Matching)** and **Requirement 3 (Tie-Breaking & Decision Helpers)**, this survey establishes the complete technical foundation for:
1. **A 60fps Native-Feel Swiping Engine**: Frictionless dragging, multi-touch immunity, zero scroll interference, realistic inertia rotation, dynamic directional stamp overlays, and elastic snap-back.
2. **Rich Multi-Category Venue Decks**: Structured venue metadata spanning 5 core lifestyle verticals (Dining, Bars, Activities, Coffee, Nightlife) with verified visual hierarchy, badges, tags, and sponsored placement support.
3. **Real-Time Unanimous Consensus Matching**: Sub-second vote aggregation that immediately freezes voting and triggers a celebratory full-screen match modal when 100% of room participants swipe right on a venue.
4. **Interactive Tie-Breaker Helpers**: A dual-mode resolution pipeline featuring a Ranked-Choice Consensus Leaderboard and a synchronized, physics-modeled spinning Roulette Wheel when no unanimous match occurs naturally.
5. **Robust Component Architecture**: A modular React/TypeScript design adhering strictly to single-command startup (`npm run dev`) and automated testing (`npm test`).

---

## 2. UI/UX Card Swiping Engine

### 2.1 Pointer Events Architecture & Cross-Platform Touch Handling

Traditional web gesture implementations frequently suffer from mouse vs. touch divergence, mobile viewport scrolling conflicts, and lost drags when the user's finger leaves the card's bounding box. 

**Architectural Standard: Modern W3C Pointer Events API**
- Use `pointerdown`, `pointermove`, `pointerup`, and `pointercancel`.
- **Crucial Pointer Capture**: On `pointerdown`, invoke `element.setPointerCapture(event.pointerId)`. This guarantees that subsequent `pointermove` and `pointerup` events fire on the card even if the cursor or finger moves completely outside the viewport or off-screen.
- **Scroll Prevention**: Apply CSS `touch-action: none` to the active swipe card element. This disables default browser touch gestures (pinch-zoom, pull-to-refresh, vertical document scrolling) on the card surface while preserving normal interaction outside the deck container.
- **Hardware Acceleration**: Render all card transforms strictly via 3D transforms (`translate3d(x, y, 0) rotate(deg)` and `will-change: transform`). This forces GPU layer creation, ensuring smooth 60fps / 120Hz frame rates on mobile Safari and Android Chrome.

### 2.2 Mathematical Formulations: Displacement, Rotation, & Spring Physics

```
          [ -Y: Superlike (Up) ]
                     ▲
                     │
    [ -X: Pass ] ◄───┼───► [ +X: Like ]
                     │
                     ▼
                 [ +Y: Cancel ]
```

#### Displacement Vector
Given touch initiation at coordinate $(x_0, y_0)$ at timestamp $t_0$, and current coordinate $(x_t, y_t)$ at timestamp $t$:
$$\Delta x = x_t - x_0, \quad \Delta y = y_t - y_0$$

#### Rotation Angle ($\theta$)
When dragging horizontally, cards naturally pivot around the user's wrist or thumb. The top of the card tilts in the direction of the drag:
$$\theta = \text{clamp}\left(\Delta x \times k_{\text{rot}}, \, -\theta_{\max}, \, \theta_{\max}\right)$$
- **Recommended constant**: $k_{\text{rot}} = 0.075^\circ/\text{px}$
- **Maximum clamp**: $\theta_{\max} = 15.0^\circ$
- *Example*: Dragging right by $+120\text{px}$ produces $\theta = +9.0^\circ$. Dragging left by $-150\text{px}$ produces $\theta = -11.25^\circ$.

#### Drag Resistance / Rubber-Banding
While horizontal movement maintains a 1:1 displacement ratio, downward displacement ($\Delta y > 0$) serves no swipe function and is dampened by a logarithmic resistance curve:
$$\Delta y_{\text{effective}} = \begin{cases} 
\Delta y & \text{if } \Delta y \le 0 \text{ (swiping up)} \\
15 \times \ln(1 + \frac{\Delta y}{15}) & \text{if } \Delta y > 0 \text{ (dragging down)}
\end{cases}$$

#### Velocity & Momentum Calculation
To support natural flick gestures (where displacement is moderate but release velocity is high), instantaneous velocity is tracked over the trailing 100ms window:
$$v_x = \frac{x_t - x_{t - \delta t}}{\delta t}, \quad v_y = \frac{y_t - y_{t - \delta t}}{\delta t}$$

#### Snap-Back Spring Physics
If the user releases the card without meeting swipe commitment thresholds, the card snaps back to origin $(0, 0, 0^\circ)$:
- **Transition Curve**: `cubic-bezier(0.175, 0.885, 0.32, 1.275)` (slight overshoot spring effect)
- **Duration**: $260\text{ms}$

### 2.3 Gesture Thresholds & Multi-Directional Commitments

A swipe is committed when either the spatial displacement OR the velocity threshold is exceeded:

| Action | Direction | Spatial Condition | Velocity Condition | Commit Trajectory |
|---|---|---|---|---|
| **LIKE (Right)** | Horizontal $+X$ | $\Delta x \ge +100\text{px}$ OR $\Delta x \ge 0.32 \times W_{\text{card}}$ | $v_x \ge +0.55\text{px/ms}$ | Fly offscreen right: $+1200\text{px}$, rotate $+25^\circ$ |
| **PASS / NOPE (Left)** | Horizontal $-X$ | $\Delta x \le -100\text{px}$ OR $\Delta x \le -0.32 \times W_{\text{card}}$ | $v_x \le -0.55\text{px/ms}$ | Fly offscreen left: $-1200\text{px}$, rotate $-25^\circ$ |
| **SUPERLIKE (Up)** | Vertical $-Y$ | $\Delta y \le -110\text{px}$ AND $|\Delta y| \ge 1.4 \times |\Delta x|$ | $v_y \le -0.60\text{px/ms}$ | Fly offscreen top: $-1200\text{px}$, rotate $0^\circ$ |

*Exit Animation Duration*: $280\text{ms}$ ease-out. After $280\text{ms}$, the card unmounts and the next card promotes to active.

### 2.4 Dynamic Stamp Overlays (LIKE, NOPE, SUPERLIKE)

As the card moves, directional visual stamps appear with opacity proportional to the drag progress:

$$\alpha_{\text{stamp}} = \text{clamp}\left(\frac{|\Delta x|}{\text{Threshold}_x}, \, 0, \, 1\right)$$

- **"LIKE" Stamp**:
  - Position: Top-left of card, rotated $-15^\circ$.
  - Style: Bold uppercase, heavy border (3px), emerald green text (`#10b981`), background `rgba(16, 185, 129, 0.15)`.
  - Trigger: Appears when $\Delta x > 15\text{px}$.
- **"NOPE" / "PASS" Stamp**:
  - Position: Top-right of card, rotated $+15^\circ$.
  - Style: Bold uppercase, heavy border (3px), crimson red text (`#ef4444`), background `rgba(239, 68, 68, 0.15)`.
  - Trigger: Appears when $\Delta x < -15\text{px}$.
- **"SUPERLIKE" Stamp**:
  - Position: Bottom-center of card, horizontal ($0^\circ$).
  - Style: Bold uppercase, blue/indigo border (3px), electric cyan/blue text (`#06b6d4`), glowing drop-shadow.
  - Trigger: Appears when $\Delta y < -25\text{px}$ and $|\Delta y| > |\Delta x|$.

### 2.5 Card Stacking Physics & Depth Scaling

To create a tactile 3D physical deck aesthetic, the deck renders the top 3 cards simultaneously:

```
[ Active Card (Index 0) ] -> scale(1.00), translateY(0px), z-index: 30, opacity: 1.00
[ Next Card   (Index 1) ] -> scale(0.95), translateY(14px), z-index: 20, opacity: 0.90
[ Third Card  (Index 2) ] -> scale(0.90), translateY(28px), z-index: 10, opacity: 0.70
```

#### Continuous Layer Interpolation
As the user drags Card 0 by distance $D = \sqrt{\Delta x^2 + \Delta y^2}$, normalized progress $p = \min(1, D / 120\text{px})$ dynamically scales Card 1 up towards the foreground:
$$\text{Scale}_1(p) = 0.95 + (0.05 \times p), \quad \text{TranslateY}_1(p) = 14\text{px} - (14\text{px} \times p)$$
This eliminates jarring layout jumps when the top card exits—the underlying card smoothly steps into active position.

### 2.6 Viewport Layout & Zero-Overflow Responsive Geometry

Group swiping is predominantly performed on mobile smartphones (iOS Safari, Android Chrome) in portrait mode, as well as desktop laptops. Clipping or horizontal scrollbars ruin the experience.

#### Layout Container Geometry
```html
<div class="h-[100dvh] w-full max-w-md mx-auto flex flex-col overflow-hidden bg-slate-950 select-none">
  <!-- Top Bar: Room Code, Active Roster, Round Filter (~56px) -->
  <header class="flex-none h-14 px-4 ..."> ... </header>
  
  <!-- Swiping Arena: Flex grow with overflow-hidden (~flex-1) -->
  <main class="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
    <!-- Card Container: Aspect ratio ~3:4 or 4:5, max height calc(100% - 8px) -->
    <div class="relative w-full h-full max-h-[580px] max-w-[380px] ...">
      <!-- Stacked Cards -->
    </div>
  </main>
  
  <!-- Bottom Action Bar: Fixed height (~84px) -->
  <footer class="flex-none h-20 px-6 ..."> ... </footer>
</div>
```

- **Dynamic Viewport Height (`dvh`)**: Mobile browser address bars collapse and expand. Using `100dvh` prevents mobile Safari navigation bars from clipping action buttons.
- **Aspect Ratio Locking**: Deck container locks to `max-w-[400px]` and `max-h-[600px]`, perfectly centered horizontally on 4K/desktop monitors with elegant drop-shadows.

### 2.7 Keyboard Navigation & Accessibility (a11y)

Desktop users must have full keyboard parity with touch gestures:
- `ArrowLeft`: Trigger Pass / Nope animation and vote
- `ArrowRight`: Trigger Like animation and vote
- `ArrowUp`: Trigger Superlike animation and vote
- `KeyZ` / `Backspace`: Undo last swipe (reverts previous card)
- `Space` / `KeyI`: Toggle Quick Look detail drawer (venue info, hours, address)
- `Escape`: Close modals (Quick Look, Match celebration, Roulette wheel)

**ARIA Integration**:
- Deck container assigned `role="region"` and `aria-label="Venue Swipe Deck"`.
- Hidden live region (`aria-live="polite"`) announces card transitions: `"Card 3 of 12: The Rusty Anchor, Craft Cocktails, 4.8 stars. Swiped Like."`

### 2.8 Floating Action Button Dock

The bottom control dock features 5 ergonomically spaced, high-contrast action buttons:

| Button | Icon | Diameter | Visual Accent | Interaction |
|---|---|---|---|---|
| **Undo / Rewind** | Curved Arrow | $44\text{px}$ | Amber (`#f59e0b`) border / dark bg | Re-mounts previous card with reverse slide |
| **Pass / Dislike** | X Mark | $58\text{px}$ | Crimson (`#ef4444`) gradient fill | Triggers Left-Swipe exit animation |
| **Superlike** | Star / Lightning | $48\text{px}$ | Electric Blue (`#3b82f6`) gradient | Triggers Up-Swipe exit animation |
| **Like / Heart** | Heart | $58\text{px}$ | Emerald (`#10b981`) gradient fill | Triggers Right-Swipe exit animation |
| **Quick Look** | Info / Chevron | $44\text{px}$ | Violet (`#8b5cf6`) border / dark bg | Expands full venue details bottom-sheet |

All buttons feature tactile active feedback (`transform: scale(0.90)` on press with active glow ring).

---

## 3. Rich Venue Deck Design

### 3.1 Comprehensive Venue Data Schema (TypeScript)

```typescript
export type VenueCategory = 'dining' | 'bars' | 'activities' | 'coffee' | 'nightlife';
export type PriceTier = 1 | 2 | 3 | 4; // 1 = $, 2 = $$, 3 = $$$, 4 = $$$$

export interface VenueReviewSummary {
  rating: number; // 1.0 to 5.0
  reviewCount: number;
  highlightReview: string;
}

export interface VenueAffiliateHooks {
  reservationUrl?: string; // OpenTable / Resy
  directionsUrl: string;   // Google Maps / Apple Maps
  deliveryUrl?: string;    // DoorDash / UberEats
  menuUrl?: string;        // Direct menu link
  ticketUrl?: string;      // Eventbrite / ticketing for activities
}

export interface VenueCard {
  id: string;
  name: string;
  category: VenueCategory;
  subcategory: string; // e.g. "Speakeasy Cocktail Lounge", "Artisanal Neapolitan Pizza"
  priceTier: PriceTier;
  pricePerPerson: string; // e.g. "$15 - $30", "$60 - $100"
  distanceMiles: number;  // e.g. 0.8
  walkingMinutes: number; // e.g. 14
  address: string;
  neighborhood: string;
  photos: string[];       // 1 to 4 photo URLs (curated, optimized)
  heroPhoto: string;
  badges: string[];       // e.g. ["Michelin Bib Gourmand", "Patio Seating", "Happy Hour 4-7PM"]
  dietaryTags: string[];   // e.g. ["Gluten-Free Friendly", "Vegan Options", "Halal"]
  vibeTags: string[];      // e.g. ["Dimly Lit & Romantic", "Lively & Loud", "Cozy Fireside"]
  hoursToday: string;     // e.g. "Open until 1:00 AM"
  highlights: string[];   // Top 3 standout offerings / dishes / drinks
  reviews: VenueReviewSummary;
  affiliateHooks: VenueAffiliateHooks;
  isPromoted?: boolean;   // Sponsored placement flag (Requirement 4)
  sponsorBadge?: string;  // e.g. "Featured Partner", "Sponsored"
  sponsorCtaText?: string;// e.g. "Get Free Dessert with Reservation"
}
```

### 3.2 Category-Specific Deck Architecture

A rich default catalog must span 5 lifestyle categories to satisfy all group social occasions (Couples Date Night, Friday Friends Night, Coworker Lunch):

```
                       ┌─────────────────────────┐
                       │  VENUE DECK CATEGORIES  │
                       └────────────┬────────────┘
         ┌──────────────┬───────────┼───────────┬──────────────┐
         ▼              ▼           ▼           ▼              ▼
    [ Dining ]      [ Bars ]  [ Activities ] [ Coffee ]   [ Nightlife ]
    - Italian       - Speakeasy- Mini Golf   - Artisan Cafe - Live Jazz
    - Taqueria      - Rooftop  - Arcade Bar  - Matcha Lab   - Underground
    - Izakaya       - Brewery  - Escape Room - Dessert Spot - Karaoke Box
    - Smashburger   - Wine Bar - Paint/Wine  - Roastery     - Dance Club
```

#### Curated Reference Catalog (15 Venues, 3 per Category):

1. **Dining**:
   - `d1`: *Trattoria Al Mare* — Fresh Handmade Pasta & Crudo ($$$, 4.8★, 0.6 mi, Patio Seating, Romantic)
   - `d2`: *Barrio Cantina & Taqueria* — Birria & Artisanal Mezcal ($$, 4.7★, 1.1 mi, Gluten-Free Friendly, Lively)
   - `d3`: *Kuro Noodle & Robata Bar* — Smoky Yakitori & Tonkotsu Ramen ($$, 4.9★, 0.4 mi, Late Night, Cozy)
2. **Bars**:
   - `b1`: *The Velvet Quill Speakeasy* — Hidden Craft Cocktail Den ($$$, 4.9★, 0.7 mi, Dimly Lit, Craft Ice)
   - `b2`: *Highline Sunset Rooftop* — Panoramic Views & Natural Wine ($$$, 4.6★, 1.4 mi, Rooftop Views, Happy Hour)
   - `b3`: *Copper Kettle Brewing Co.* — Independent Microbrewery & Taps ($, 4.7★, 0.9 mi, Dog Friendly, Casual)
3. **Activities**:
   - `a1`: *Neon Links Urban Mini-Golf* — 18-Hole Glow-in-the-Dark Course & Cocktails ($$, 4.8★, 1.2 mi, High Energy)
   - `a2`: *Pixel Bar & Arcade Lounge* — Vintage Pinball, Mario Kart & Craft Beer ($, 4.7★, 0.5 mi, Nostalgic Fun)
   - `a3`: *The Enigma Vault* — Immersive 60-Minute Themed Escape Game ($$$, 4.9★, 1.8 mi, Team Collaboration)
4. **Coffee & Casual**:
   - `c1`: *Aura Specialty Roasters* — Single-Origin Pour Over & Japanese Milk Bread ($, 4.8★, 0.3 mi, Aesthetic & Quiet)
   - `c2`: *Matcha & Moon Bakery* — Ceremonial Grade Matcha & Pistachio Croissants ($$, 4.9★, 0.8 mi, Vegan Friendly)
   - `c3`: *Velvet Bean Midnight Cafe* — Espresso Martini & Late-Night Tiramisu ($$, 4.7★, 0.6 mi, Open until 2 AM)
5. **Nightlife**:
   - `n1`: *The Blue Note Vault* — Intimate Live Jazz & Classic Martinis ($$$, 4.8★, 1.0 mi, Live Performance)
   - `n2`: *Starlight Karaoke Private Lounges* — Soundproof Rooms & Bottle Service ($$, 4.7★, 0.7 mi, Private Singing)
   - `n3`: *Subterranean Vinyl Club* — Analog Sound System & Disco/House DJs ($$, 4.6★, 1.5 mi, Dance Floor)

### 3.3 Visual Information Hierarchy & Micro-Layouts

The card surface must deliver critical decision factors in under 1.5 seconds without visual clutter:

```
+-------------------------------------------------------+
| [Category: BARS]               [0.7 mi - 12 min walk] |
|                                                       |
|                     [HERO PHOTO]                      |
|                                                       |
|                                [Rating: 4.9 (420)]    |
| [Promoted Badge]*                                     |
+-------------------------------------------------------+
| The Velvet Quill Speakeasy             $$$ ($40-60pp) |
| Downtown Arts District - Historic Alleyway            |
+-------------------------------------------------------+
| [Trending] [Patio/Garden] [Craft Ice] [Romantic Vibe] |
| "Signature smoked mezcal old fashioned & live harp"   |
| Open until 2:00 AM                                    |
| [ V View Menu & Hours ] (Tap to expand)               |
+-------------------------------------------------------+
```

1. **Top Badge Bar (Floating)**: Category pill (e.g. violet badge for Bars) and live distance pill with walking/driving estimate.
2. **Hero Image Carousel**: Full-bleed cover photo with linear gradient darkening at the bottom (`rgba(0,0,0,0) 40% -> rgba(0,0,0,0.85) 100%`) for pristine text legibility.
3. **Core Header**: Bold venue title (22px font) with price tier indicators (`$$$` where active dollar signs are bold amber and inactive are muted gray).
4. **Tag Cloud**: Horizontal flex wrap containing colored badges:
   - Green pills: Dietary accommodations (Vegan, Gluten-Free)
   - Purple pills: Atmosphere/vibe (Romantic, Cozy, High Energy)
   - Amber pills: Accolades/perks (Happy Hour, Michelin, Trending)
5. **Quick-Look Expandable Drawer**: Tapping the chevron flips or slides up a detailed card backing containing today's hours, parking advice, and curated review quotes.

### 3.4 Sponsored / Promoted Venue Card Specifications

To fulfill Requirement 4 seamlessly within Requirement 2's card deck:
- Positioned strategically as Card 4 or Card 5 in every 15-card deck.
- Clearly marked with an elegant, compliant pill: `[★ SPONSORED PARTNER]` in high-contrast gold border.
- Features a promotional offer banner: e.g., *"Free order of Truffle Fries with table reservation"*.
- Functions identically to regular cards during swiping (can be passed, liked, or superliked), maintaining total user control.

---

## 4. Consensus Matching Engine (R2)

### 4.1 Multi-Participant Vote Aggregation Algorithm

In a shared room with $N$ participants, votes occur asynchronously across different devices. The consensus engine must maintain an immutable vote ledger and continuously evaluate matching criteria upon every incoming vote.

#### Data Structures (Room State)
```typescript
export interface Participant {
  id: string;
  name: string;
  avatar: string; // Emoji or image URL
  isHost: boolean;
  joinedAt: number;
  lastActiveAt: number;
  hasFinishedDeck: boolean;
}

export type VoteType = 'like' | 'pass' | 'superlike';

export interface RoomVotesState {
  // Map of venueId -> Map of participantId -> VoteType
  [venueId: string]: {
    [participantId: string]: VoteType;
  };
}

export interface MatchResult {
  venueId: string;
  venue: VenueCard;
  matchedAt: number;
  participants: string[]; // IDs of participants who agreed
  isUnanimous: boolean;
  superlikeCount: number;
}
```

### 4.2 Mathematical Consensus Formulation (Unanimous Detection)

Let $P = \{p_1, p_2, \dots, p_N\}$ be the set of active participants in the session.  
For a given venue $v$, let $V(v, p) \in \{\text{'like'}, \text{'superlike'}, \text{'pass'}\}$ be the vote cast by participant $p$.

#### Unanimous Match Criterion
A venue $v$ achieves **Unanimous Match Status** if and only if:
$$|P| \ge 2 \quad \text{AND} \quad \forall p \in P, \quad V(v, p) \in \{\text{'like'}, \text{'superlike'}\}$$

*(Note: In Solo / Demo Mode where $|P| = 1$, the first right-swipe or manual demo triggers the match for immediate testing).*

#### Immediate Disqualification Property
If ANY participant $p_k \in P$ votes $V(v, p_k) = \text{'pass'}$, venue $v$ is permanently disqualified from Unanimous Match status:
$$\exists p_k \in P : V(v, p_k) = \text{'pass'} \implies \text{IsUnanimous}(v) = \text{FALSE}$$
However, $v$ is retained in the vote ledger to compute runner-up consensus scores in Tie-Breaking (R3).

#### Consensus Evaluation Function (Deterministic)
```typescript
export function evaluateConsensus(
  venueId: string,
  participants: Participant[],
  votes: RoomVotesState
): { isUnanimous: boolean; approvalCount: number; superlikeCount: number; vetoCount: number } {
  const venueVotes = votes[venueId] || {};
  let approvalCount = 0;
  let superlikeCount = 0;
  let vetoCount = 0;

  for (const p of participants) {
    const vote = venueVotes[p.id];
    if (vote === 'like') {
      approvalCount++;
    } else if (vote === 'superlike') {
      approvalCount++;
      superlikeCount++;
    } else if (vote === 'pass') {
      vetoCount++;
    }
  }

  const isUnanimous = participants.length > 1 
    && vetoCount === 0 
    && approvalCount === participants.length;

  return { isUnanimous, approvalCount, superlikeCount, vetoCount };
}
```

### 4.3 Real-Time State Synchronization & Event Lifecycle

```
[ Participant Device 1 ]    [ Backend / Room State ]    [ Participant Device 2 ]
          │                           │                           │
          │── POST /api/rooms/:id/vote ──►                        │
          │   { venueId, vote: 'like' }│                          │
          │                           │                           │
          │                           │── Evaluate Consensus ──┐  │
          │                           │   (isUnanimous? YES)   │  │
          │                           │◄───────────────────────┘  │
          │                           │                           │
          │◄── 200 OK { match: v1 } ──│                           │
          │                           │── SSE/Poll Event: MATCH ─►│
          │                           │   { venueId: v1 }         │
          ▼                           ▼                           ▼
  [ Instant Confetti ]         [ Room Status: ]            [ Instant Confetti ]
  [ Match Modal Reveal ]       [ "MATCHED"    ]            [ Match Modal Reveal ]
```

1. **Optimistic Local Response**: When the user swipes right, the client updates its local deck immediately without waiting for server response.
2. **Server Verification**: The vote is transmitted via `POST /api/rooms/:id/vote`.
3. **Consensus Trigger**: If the server detects unanimous approval:
   - Sets room status to `status = 'matched'`.
   - Records `winningVenueId`.
   - Dispatches SSE event / WebSocket message or returns `match: true` in polling cycle.
4. **Client Interruption**: Any active swiping screen on all connected participant devices is immediately interrupted by the full-screen Match Reveal takeover.

### 4.4 Celebratory Match Reveal Screen (Confetti, Haptics, Audio Synthesis)

The moment a match occurs, the application shifts emotional gears from focused evaluation to shared victory:

```
+-------------------------------------------------------+
|                     🎉 IT'S A MATCH! 🎉              |
|               Everyone agreed on where to go!         |
|                                                       |
|       [Avatar 1] ❤️  [Avatar 2] ❤️  [Avatar 3]        |
|             (Glowing Gold Rings & Checkmarks)         |
|                                                       |
|             +---------------------------+             |
|             |   THE VELVET QUILL        |             |
|             |   Craft Cocktails Speakeasy|             |
|             |   4.9 ★ (0.7 miles away)  |             |
|             +---------------------------+             |
|                                                       |
|   [ 🍽️ RESERVE TABLE NOW ] (Affiliate: OpenTable/Resy)|
|   [ 📍 GET DIRECTIONS    ] (Google Maps Navigation)   |
|   [ 🛵 ORDER DELIVERY    ] (DoorDash / UberEats)      |
|                                                       |
|   [ Keep Swiping More Spots ]  [ View Runner-Ups ]    |
+-------------------------------------------------------+
```

#### Multi-Sensory Celebration Elements
1. **Confetti Physics Blast**:
   - High-density particle burst from both bottom corners radiating upward at $60^\circ$ and $120^\circ$.
   - Mix of metallic gold, emerald green, and electric purple ribbons with gravity and air drag calculations.
   - 60fps canvas engine that automatically shuts down after 3.5 seconds to conserve battery.
2. **Mobile Haptic Feedback**:
   - Invokes Web Haptics API: `navigator.vibrate([100, 40, 100, 40, 250])`.
3. **Synthesized Chime Audio (Zero External Asset Overhead)**:
   - Generates a bright major-triad chord progression (C5 -> E5 -> G5 -> C6) using the Web Audio API oscillator with gain exponential ramp-down. No MP3 file downloads or 404 audio errors.
4. **Participant Alignment Stack**:
   - Displays all room participant avatars side-by-side with animated pulsing green checkmark badges.
5. **Direct Monetization Action Triggers (Requirement 4 Integration)**:
   - Primary high-contrast CTA button: "Reserve Table" (OpenTable / Resy link with affiliate partner tracking).
   - Secondary button: "Get Directions" (Google Maps geocoordinate link).
   - Tertiary button: "Order Ahead" (DoorDash / UberEats link).

---

## 5. Tie-Breaking & Decision Helpers (R3)

### 5.1 Round Completion & No-Match Detection

In real-world group dynamics, complete unanimity may not occur after swiping through the entire 15-card deck. A robust product cannot strand users on an empty screen.

#### Trigger Condition
A round is marked complete when:
$$\forall p \in P, \quad \text{CardsSwiped}(p) = \text{TotalDeckSize} \quad \text{AND} \quad \text{UnanimousMatchesCount} = 0$$
*(Or the session host taps "Wrap Up Round & Decide Now").*

When triggered, the app seamlessly transitions into **Tie-Breaking Mode (Requirement 3)**.

### 5.2 Helper A: Ranked-Choice Consensus Leaderboard

When no single venue scores 100% agreement, the consensus engine calculates an objective Weighted Consensus Score for every venue in the deck:

#### Scoring Formula
$$\text{Score}(v) = \sum_{p \in P} w\left(V(v, p)\right)$$

Where the vote weighting function $w$ is defined as:
$$w(\text{vote}) = \begin{cases}
+3.0 & \text{if vote} = \text{'superlike'} \text{ (High enthusiasm bonus)} \\
+1.0 & \text{if vote} = \text{'like'} \text{ (Standard approval)} \\
0.0 & \text{if vote} = \text{'pass'} \text{ (Neutral pass)}
\end{cases}$$

#### Approval Percentage
$$\text{ApprovalRate}(v) = \frac{|\{p \in P : V(v, p) \in \{\text{'like'}, \text{'superlike'}\}\}|}{|P|} \times 100\%$$

#### Leaderboard Presentation
The Consensus Leaderboard displays the Top 3 to 5 candidate venues ranked by Score:
- **Rank 1 (Podium Gold)**: e.g. "80% Group Approval (4 of 5 Liked)" + Participant avatar pills showing who liked it.
- **Rank 2 (Silver)**: e.g. "60% Group Approval (3 of 5 Liked)".
- **Rank 3 (Bronze)**: e.g. "60% Group Approval (1 Superlike, 2 Likes)".
- **Host Decision Action**: "Lock In Top Choice" OR "Spin the Roulette Wheel between Top 3".

### 5.3 Helper B: Interactive Canvas Roulette Wheel (Physics & Wedge Geometry)

The centerpiece of viral engagement is the **Interactive Spinning Roulette Wheel**. When the group is torn between 2 to 6 mutual runner-up venues, the wheel resolves the deadlock with undeniable finality.

```
                  ▼ [ Flapper / Pointer at Top (12:00) ]
              . '  "  ' .
          . '   Wedge 1   ' .       Wedge 1: Trattoria Al Mare (Emerald)
        /   (Trattoria)       \     Wedge 2: The Velvet Quill (Purple)
       / Wedge 4       Wedge 2 \    Wedge 3: Neon Links Mini-Golf (Amber)
      │  (Copper)      (Velvet) │   Wedge 4: Copper Kettle (Rose)
       \      Wedge 3          /
        \    (Neon Links)     /
          . '               ' .
              . '  "  ' .
            [ SPIN THE WHEEL! ]
```

#### Angular Wedge Geometry
For $K$ candidate venues ($2 \le K \le 8$):
- Each venue occupies a wedge of angular width:
  $$\Delta \phi = \frac{360^\circ}{K} = \frac{2\pi}{K} \text{ radians}$$
- Starting angle of wedge $i$:
  $$\phi_{\text{start}}(i) = i \times \Delta \phi, \quad \phi_{\text{end}}(i) = (i + 1) \times \Delta \phi$$

#### Rotational Deceleration Physics Engine
Rather than relying on basic CSS transitions, a custom requestAnimationFrame physics loop provides authentic rotational momentum and pointer flapper clicks:
- **Initial Angular Velocity**: $\omega_0 = 25.0 \text{ rad/s}$ to $35.0 \text{ rad/s}$
- **Frictional Damping**: Angular acceleration $\alpha(t) = -\mu \cdot \omega(t)$, where $\mu \approx 0.015$
- **Total Spin Duration**: $4.5 \text{ to } 5.2 \text{ seconds}$
- **Predictable Winner Target Calculation**:
  To ensure all participants see the wheel land on the exact server-selected winner $i_{\text{target}}$:
  $$\theta_{\text{target}} = 360^\circ \times N_{\text{revolutions}} + \left(360^\circ - (i_{\text{target}} \times \Delta \phi + \frac{\Delta \phi}{2})\right)$$
  Where $N_{\text{revolutions}} \in [6, 9]$ full rotations.

#### Audio & Flapper Collision
- As the wheel rotates past each wedge boundary ($\theta \pmod{\Delta \phi} \approx 0$), the pointer flapper deflects by $-20^\circ$ and snaps back with a realistic mechanical click sound (synthesized via 5ms high-frequency white noise burst in Web Audio API).

### 5.4 Synchronized Spin Engine & Winner Transition

1. **Host-Initiated or Group Vote**: Any participant or room host taps "SPIN TO DECIDE".
2. **Server Winner Resolution**: The server (or host client broadcasting state) picks the random winner $i_{\text{winner}} \in [0, K-1]$ and generates a random spin seed.
3. **Synchronized Playback**: All client devices receive the winner index and spin start timestamp, playing the exact same 5-second wheel spin simultaneously.
4. **Final Victory Modal**: When the wheel stops on the winning wedge:
   - Flapper flashes gold.
   - Mini confetti cannon triggers.
   - Winner card appears with badge: *"The Wheel Has Spoken! 🎯"*
   - Instant reservation / affiliate action buttons load directly.

---

## 6. Component Architecture & State Management

### 6.1 React Component Hierarchy & Prop Contracts

```
<App>
 └── <SessionProvider> (Room state, participants, real-time sync)
      ├── <TopNavigationHeader>
      │    ├── <RoomCodeBadge> (Copy share link button)
      │    ├── <ParticipantRosterAvatars> (Online indicators, progress pills)
      │    └── <AudioVibeToggle> (Sound effects & haptic toggle)
      │
      ├── <DeckViewContainer> (Active during SWIPING state)
      │    ├── <DeckProgressHeader> (Card counter "Card 4 of 15", Category indicator)
      │    ├── <CardStack>
      │    │    ├── <SwipeCard index={0} isActive={true}> (Active card with pointer handlers)
      │    │    │    ├── <VenueCardHeroMedia> (Photo carousel, category tag, distance)
      │    │    │    ├── <VenueCardBody> (Title, price tier, neighborhood, badges)
      │    │    │    ├── <VenueCardTags> (Dietary, vibe, accolades pills)
      │    │    │    ├── <VenueCardQuickLookDrawer> (Hours, reviews, menu details)
      │    │    │    └── <SwipeStampOverlay> (LIKE, NOPE, SUPERLIKE dynamic stamps)
      │    │    ├── <SwipeCard index={1} isNext={true}> (Pre-rendered sub-card)
      │    │    └── <SwipeCard index={2} isBackdrop={true}> (Third layer card)
      │    ├── <DeckActionControls> (Undo, Pass, Superlike, Like, Quick Look buttons)
      │    └── <KeyboardShortcutGuide> (Desktop hint banner)
      │
      ├── <MatchCelebrationModal> (Active during MATCHED state)
      │    ├── <ConfettiCanvas> (Particle physics canvas)
      │    ├── <MatchHeader> ("IT'S A MATCH!" title & celebration subtitle)
      │    ├── <ParticipantMatchStack> (Participant avatars with checkmarks)
      │    ├── <WinningVenueCard> (Full venue details & accolades)
      │    ├── <AffiliateActionDock> (Reserve Table, Directions, Delivery CTAs)
      │    └── <ContinueSwipingButton> (Explore alternative runner-ups)
      │
      └── <TieBreakerContainer> (Active during TIEBREAKER state)
           ├── <TieBreakerHeader> ("Round Complete: Finding Group Consensus")
           ├── <ConsensusLeaderboard>
           │    └── <LeaderboardRow> (Rank 1-5, approval %, voter avatar breakdown)
           ├── <RouletteWheelModal>
           │    ├── <RouletteCanvas> (Interactive spinning wheel with flapper)
           │    ├── <SpinTriggerButton> ("Spin to Decide!" with countdown)
           │    └── <WheelWinnerReveal> (Celebratory chosen spot modal)
           └── <RestartDeckButton> (Add more cards or change category)
```

### 6.2 Finite State Machine (FSM) & Transition Table

```
   [ LOBBY ] ──(Host Starts Session)──► [ SWIPING ]
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │                                               │
           (100% Unanimous Match)                          (All Cards Exhausted &
                      │                                        No Match Found)
                      ▼                                               ▼
             [ MATCH_CELEBRATION ]                               [ TIEBREAKER ]
                      │                                               │
        (User taps "Keep Swiping")                     (User selects "Spin Wheel")
                      │                                               │
                      ▼                                               ▼
                 [ SWIPING ]                                   [ ROULETTE_SPIN ]
                                                                      │
                                                           (Wheel Decelerates & Lands)
                                                                      │
                                                                      ▼
                                                               [ ROULETTE_WINNER ]
                                                                      │
                                                        (User locks in reservation)
                                                                      │
                                                                      ▼
                                                                [ COMPLETED ]
```

#### Detailed State Transition Matrix:

| Current State | Trigger Event | Next State | Actions & Side Effects |
|---|---|---|---|
| `LOBBY` | `PARTICIPANT_JOINED` | `LOBBY` | Update participant roster, re-render avatar stack |
| `LOBBY` | `START_SESSION` | `SWIPING` | Initialize venue deck, set card index = 0 |
| `SWIPING` | `VOTE_CAST(like/pass/super)` | `SWIPING` | Animate card exit (280ms), advance card index, post vote to server |
| `SWIPING` | `VOTE_UNDO` | `SWIPING` | Decrement card index, re-mount previous card with reverse slide |
| `SWIPING` | `UNANIMOUS_MATCH_DETECTED`| `MATCH_CELEBRATION` | Trigger confetti burst, chime audio, open full-screen match modal |
| `SWIPING` | `DECK_COMPLETED` (No Match) | `TIEBREAKER` | Fetch consensus rankings, render Ranked-Choice Leaderboard |
| `MATCH_CELEBRATION`| `DISMISS_OR_CONTINUE`| `SWIPING` | Resume swiping remaining cards, keep match in saved tray |
| `TIEBREAKER` | `TRIGGER_ROULETTE` | `ROULETTE_SPIN` | Load top 4 runner-up venues into wheel, start 5s physics rotation |
| `ROULETTE_SPIN` | `SPIN_SETTLED` | `ROULETTE_WINNER`| Stop wheel flapper, play victory chime, reveal winning venue |
| `ROULETTE_WINNER` | `AFFILIATE_CLICK` | `COMPLETED` | Open reservation/maps link in new tab with tracked affiliate params |

### 6.3 Edge Cases & Defensive UX Mitigations

1. **Rapid Gesture Spamming (Double-Swiping)**:
   - *Issue*: A user flicking cards furiously can trigger multiple state updates before the exit animation finishes, causing card index misalignment or duplicate votes.
   - *Mitigation*: Implement an `isAnimating` lock ref. While a card is transitioning out (280ms), all new pointer events and key presses are ignored until the new card is safely mounted.
2. **Asymmetrical Group Progress**:
   - *Issue*: User A finishes 15 cards in 30 seconds; User B takes 3 minutes.
   - *Mitigation*: When User A completes their deck, display an engaging "Waiting on your group..." holding screen with real-time progress bars (e.g., "Sarah is on card 11/15, Alex is on card 8/15") and a button to "Nudge Friends". If a unanimous match is detected while waiting, it immediately overrides the waiting screen.
3. **Single-Participant / Solo Demo Mode**:
   - *Issue*: A user testing the app alone or presenting a demo cannot form a 2-person unanimous consensus naturally.
   - *Mitigation*: Detect `participants.length === 1`. Provide a prominent "Solo Demo Mode" toggle or auto-simulate a virtual partner ("Partner AI" or "Demo Friend") who automatically agrees on the 3rd or 4th liked card, guaranteeing full demonstration of Requirement 2 and Requirement 3.
4. **Mobile Browser Address Bar Jump**:
   - *Issue*: Virtual keyboard or address bar collapsing alters viewport height, causing the card deck to jump.
   - *Mitigation*: Lock the outer viewport to `height: 100dvh` with `overflow: hidden`, and apply `overscroll-behavior: none` to `body`.

---

## 7. Production Code Blueprints

These blueprints provide concrete, copy-paste-ready, zero-dependency implementations designed for immediate adoption by future worker agents.

### 7.1 Zero-Dependency Pointer Gesture Hook (`useSwipeGesture.ts`)

```typescript
import { useState, useRef, useCallback, useEffect } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up';

interface UseSwipeGestureOptions {
  onSwipe: (direction: SwipeDirection) => void;
  thresholdX?: number; // default 100px
  thresholdY?: number; // default 110px
  maxRotation?: number; // default 15 deg
  disabled?: boolean;
}

export function useSwipeGesture({
  onSwipe,
  thresholdX = 100,
  thresholdY = 110,
  maxRotation = 15,
  disabled = false,
}: UseSwipeGestureOptions) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  const startPos = useRef({ x: 0, y: 0, time: 0 });
  const currentOffset = useRef({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || isAnimatingOut) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    startPos.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    currentOffset.current = { x: 0, y: 0 };
    setIsDragging(true);
  }, [disabled, isAnimatingOut]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || isAnimatingOut) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;

    // Dampen downward drag to prevent awkward cards
    const effectiveY = dy > 0 ? 15 * Math.log(1 + dy / 15) : dy;
    const clampedRotation = Math.max(-maxRotation, Math.min(maxRotation, dx * 0.075));

    currentOffset.current = { x: dx, y: effectiveY };
    setOffset({ x: dx, y: effectiveY });
    setRotation(clampedRotation);
  }, [isDragging, isAnimatingOut, maxRotation]);

  const commitSwipe = useCallback((direction: SwipeDirection) => {
    setIsAnimatingOut(true);
    setIsDragging(false);

    let targetX = 0;
    let targetY = 0;
    let targetRot = 0;

    if (direction === 'right') {
      targetX = window.innerWidth + 200;
      targetRot = 25;
    } else if (direction === 'left') {
      targetX = -(window.innerWidth + 200);
      targetRot = -25;
    } else if (direction === 'up') {
      targetY = -(window.innerHeight + 200);
      targetRot = 0;
    }

    setOffset({ x: targetX, y: targetY });
    setRotation(targetRot);

    setTimeout(() => {
      onSwipe(direction);
      setOffset({ x: 0, y: 0 });
      setRotation(0);
      setIsAnimatingOut(false);
    }, 280);
  }, [onSwipe]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || isAnimatingOut) return;
    setIsDragging(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored if capture already lost
    }

    const { x: dx, y: dy } = currentOffset.current;
    const elapsed = Math.max(1, Date.now() - startPos.current.time);
    const vx = dx / elapsed;
    const vy = dy / elapsed;

    // Check Superlike (Up)
    if ((dy <= -thresholdY || vy <= -0.6) && Math.abs(dy) > Math.abs(dx) * 1.3) {
      commitSwipe('up');
      return;
    }

    // Check Like (Right)
    if (dx >= thresholdX || vx >= 0.55) {
      commitSwipe('right');
      return;
    }

    // Check Pass (Left)
    if (dx <= -thresholdX || vx <= -0.55) {
      commitSwipe('left');
      return;
    }

    // Snap Back
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  }, [isDragging, isAnimatingOut, thresholdX, thresholdY, commitSwipe]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  }, [isDragging]);

  const triggerProgrammaticSwipe = useCallback((direction: SwipeDirection) => {
    if (isAnimatingOut) return;
    commitSwipe(direction);
  }, [isAnimatingOut, commitSwipe]);

  return {
    cardRef,
    offset,
    rotation,
    isDragging,
    isAnimatingOut,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
    triggerProgrammaticSwipe,
  };
}
```

### 7.2 Zero-Dependency Canvas Confetti Celebration Engine (`confetti.ts`)

```typescript
export function triggerCelebrationConfetti(durationMs: number = 3500) {
  const canvas = document.createElement('canvas');
  canvas.id = 'celebration-confetti-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#FBBF24'];
  const particleCount = 140;
  const particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    rotation: number;
    rotationSpeed: number;
    opacity: number;
  }> = [];

  // Spawn dual cannons from bottom left & right
  for (let i = 0; i < particleCount; i++) {
    const isLeft = i % 2 === 0;
    particles.push({
      x: isLeft ? window.innerWidth * 0.1 : window.innerWidth * 0.9,
      y: window.innerHeight * 0.85,
      vx: (isLeft ? 1 : -1) * (Math.random() * 8 + 4) + (Math.random() - 0.5) * 4,
      vy: -(Math.random() * 14 + 10),
      size: Math.random() * 8 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      opacity: 1,
    });
  }

  const startTime = Date.now();
  let animationId: number;

  function render() {
    if (!ctx) return;
    const elapsed = Date.now() - startTime;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.38; // gravity
      p.vx *= 0.985; // air resistance
      p.rotation += p.rotationSpeed;

      if (elapsed > durationMs * 0.7) {
        p.opacity = Math.max(0, 1 - (elapsed - durationMs * 0.7) / (durationMs * 0.3));
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    if (elapsed < durationMs) {
      animationId = requestAnimationFrame(render);
    } else {
      cancelAnimationFrame(animationId);
      canvas.remove();
    }
  }

  animationId = requestAnimationFrame(render);
}
```

### 7.3 Interactive Roulette Wheel Physics Engine (`RouletteWheel.tsx`)

```typescript
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { VenueCard } from './types';

interface RouletteWheelProps {
  candidates: VenueCard[];
  onWinnerSelected: (winner: VenueCard) => void;
  targetWinnerIndex?: number; // Optional predetermined server winner
}

const WEDGE_COLORS = [
  '#10B981', // Emerald
  '#6366F1', // Indigo
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#8B5CF6', // Purple
];

export const RouletteWheel: React.FC<RouletteWheelProps> = ({
  candidates,
  onWinnerSelected,
  targetWinnerIndex,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<VenueCard | null>(null);
  const rotationAngle = useRef(0);
  const animFrameId = useRef<number | null>(null);

  const drawWheel = useCallback((currentAngle: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 320;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const radius = size / 2 - 16;
    const totalWedges = candidates.length;
    const arc = (2 * Math.PI) / totalWedges;

    ctx.clearRect(0, 0, size, size);

    // Draw Wheel Base
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((currentAngle * Math.PI) / 180);

    for (let i = 0; i < totalWedges; i++) {
      const angle = i * arc;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, angle, angle + arc);
      ctx.fillStyle = WEDGE_COLORS[i % WEDGE_COLORS.length];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();

      // Draw Text on Wedge
      ctx.save();
      ctx.rotate(angle + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
      const label = candidates[i].name.length > 14 
        ? candidates[i].name.slice(0, 12) + '...' 
        : candidates[i].name;
      ctx.fillText(label, radius - 20, 4);
      ctx.restore();
    }

    // Center Hub
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    ctx.restore();

    // Draw Top Pointer / Flapper at 12 o'clock
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(center - 12, 6);
    ctx.lineTo(center + 12, 6);
    ctx.lineTo(center, 26);
    ctx.closePath();
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  }, [candidates]);

  useEffect(() => {
    drawWheel(0);
  }, [drawWheel]);

  const spin = useCallback(() => {
    if (isSpinning || candidates.length === 0) return;
    setIsSpinning(true);
    setWinner(null);

    const totalWedges = candidates.length;
    const arcDegrees = 360 / totalWedges;

    // Determine target index
    const winningIndex = targetWinnerIndex !== undefined 
      ? targetWinnerIndex 
      : Math.floor(Math.random() * totalWedges);

    // Pointer is at 12 o'clock (270 degrees in standard canvas, or top)
    // Offset calculation to land squarely inside the winning wedge
    const extraRevolutions = 6 * 360; // 6 full spins
    const targetWedgeCenter = winningIndex * arcDegrees + arcDegrees / 2;
    const finalAngle = extraRevolutions + (360 - targetWedgeCenter);

    const duration = 4800; // 4.8 seconds
    const startAngle = rotationAngle.current % 360;
    const totalDelta = finalAngle - startAngle;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Ease-out cubic deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = startAngle + totalDelta * easeOut;

      rotationAngle.current = current;
      drawWheel(current);

      if (progress < 1) {
        animFrameId.current = requestAnimationFrame(animate);
      } else {
        setIsSpinning(false);
        const chosen = candidates[winningIndex];
        setWinner(chosen);
        onWinnerSelected(chosen);
      }
    }

    animFrameId.current = requestAnimationFrame(animate);
  }, [isSpinning, candidates, targetWinnerIndex, drawWheel, onWinnerSelected]);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl">
      <h3 className="text-xl font-bold text-white mb-2">Decision Roulette</h3>
      <p className="text-sm text-slate-400 mb-6 text-center">
        Group divided? Let fate break the tie between your top-voted picks!
      </p>

      <div className="relative mb-6">
        <canvas ref={canvasRef} style={{ width: 320, height: 320 }} />
      </div>

      <button
        onClick={spin}
        disabled={isSpinning}
        className={`px-8 py-3.5 rounded-full font-bold text-lg shadow-lg transition-transform ${
          isSpinning
            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:scale-105 active:scale-95'
        }`}
      >
        {isSpinning ? 'Spinning...' : '🎰 SPIN THE WHEEL!'}
      </button>

      {winner && (
        <div className="mt-6 p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-center animate-fade-in">
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
            The Wheel Has Spoken! 🎯
          </span>
          <h4 className="text-lg font-bold text-white mt-1">{winner.name}</h4>
          <p className="text-sm text-emerald-300">{winner.subcategory} • {winner.pricePerPerson}</p>
        </div>
      )}
    </div>
  );
};
```

---

## 8. Next Steps & Worker Handoff Guidelines

For the upcoming Implementation Phase (Milestones M2 & M3), this survey recommends the following work decomposition:

1. **Worker M2 (Swiping Engine & Venue Deck Implementation)**:
   - Implement `useSwipeGesture.ts` using the provided Pointer Events blueprint.
   - Assemble `SwipeDeckContainer.tsx` and `VenueCard.tsx` with dynamic LIKE/NOPE/SUPERLIKE stamp overlays.
   - Integrate curated 15-venue dataset across Dining, Bars, Activities, Coffee, Nightlife with 1 promoted venue card.
   - Implement keyboard event listeners for arrow navigation.
2. **Worker M2.2 (Consensus Engine & Celebration Reveal)**:
   - Implement real-time vote aggregation and unanimous consensus evaluator (`evaluateConsensus`).
   - Integrate `triggerCelebrationConfetti` and Web Audio chord synthesis.
   - Construct `MatchCelebrationModal.tsx` displaying the matched spot and affiliate action links.
3. **Worker M3 (Tie-Breaking & Decision Helpers)**:
   - Implement round completion detection when all cards are exhausted.
   - Build `ConsensusLeaderboard.tsx` displaying weighted approval scores and participant avatars.
   - Implement `RouletteWheel.tsx` canvas engine for spinning between top mutual runner-ups.
4. **Verification Track (Testing Track M5)**:
   - Provide unit tests verifying:
     - Unanimous match detection with 2, 3, and 5 participants.
     - Veto handling (single pass invalidating unanimous match).
     - Superlike score weighting in consensus calculations.
     - Roulette wheel candidate wedge division and winner settlement.
