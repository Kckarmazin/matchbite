# Milestone 2 Investigation Report: Card-Swiping Gesture Engine and Client Interaction

**Project**: MatchBite — Group Indecision Tinder-Style Swiping Web App  
**Milestone**: Milestone 2 (Interactive Swiping & Consensus Matching Engine)  
**Target Architecture**: React 18, Vite 5, Node.js / Express, Native Pointer Events, CSS Transforms, Server-Sent Events (SSE)  
**Coordination Directory**: `C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m2_1`  
**Date**: 2026-10-09  

---

## Executive Summary

This report establishes the complete architectural blueprint and physics specifications for **Milestone 2: Card-Swiping Gesture Engine and Client Interaction**.

In Milestone 1, the core room lifecycle, in-memory `RoomStore`, dual-token security (`sessionToken` + `hostKey`), and real-time SSE streaming were implemented and verified with 57 automated tests passing. 

Milestone 2 activates the central user journey: transitioning from the room lobby into an ultra-responsive, mobile-first card swiping deck. The card engine must emulate high-fidelity native swipe mechanics (similar to Tinder / Bumble) with zero heavy external animation libraries (such as Framer Motion or React-Spring), maintaining sub-16ms frame budgets (60fps/120fps) on modern and lower-end mobile devices through standard DOM **Pointer Events** (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) and GPU-accelerated CSS `transform: translate3d(...) rotate(...)`.

---

## 1. Gesture Stack & Component Architecture

### 1.1 Architectural Component Hierarchy

```
App.jsx
 └── (room.status === 'voting')
      └── SwipeDeck.jsx [Deck Controller & Gesture Host]
           ├── Deck Header & Progress Indicator (Cards remaining, Roster count)
           ├── Stack Container (.swipe-deck-container)
           │    ├── SwipeCard.jsx (index: 2, Bottom preview card - scaled 0.90)
           │    ├── SwipeCard.jsx (index: 1, Middle preview card - scaled 0.95)
           │    └── SwipeCard.jsx (index: 0, Top interactive card - draggable)
           │         ├── PromotedBadge.jsx (if venue.isPromoted)
           │         ├── Stamp Badges (LIKE, PASS / NOPE, SUPERLIKE)
           │         └── Venue Details (Photo, Tags, Price, Rating, Distance)
           ├── ActionControls.jsx (Pass, Superlike, Like action buttons)
           └── Keyboard Navigation Handler (ArrowLeft, ArrowRight, ArrowUp)
 └── (room.status === 'matched')
      └── MatchCelebration.jsx [Celebratory Reveal Modal]
           ├── Confetti.js (canvas-confetti particle cannons)
           └── Venue Winner Showcase & Affiliate Action Links
```

### 1.2 Responsibilities by Component

| Component | Responsibility | Props / State |
|---|---|---|
| **`SwipeDeck.jsx`** | Orchestrates card deck lifecycle, keyboard event listener, optimistic vote submission, deck exhaustion handling, and delegating programmatic swipe triggers. | **Props**: `deck` (array), `roomCode`, `participantId`, `onMatch` (callback).<br>**State**: `currentIndex` (int), `isVoting` (bool), `programmaticTrigger` (obj). |
| **`SwipeCard.jsx`** | Encapsulates single-card rendering, venue metadata layout, continuous pointer event drag tracking, rotation physics, stamp opacity interpolation, and exit/fly-out animation. | **Props**: `venue` (obj), `index` (int), `isTop` (bool), `onSwipe` (callback), `programmaticSwipe` (obj).<br>**State**: `dragPos` ({x, y}), `isDragging` (bool), `isFlyingOut` (bool), `flyDirection` (string). |
| **`ActionControls.jsx`** | Touch and desktop button controls (Pass, Superlike, Like) offering 1-tap programmatic swiping for accessibility and touch alternatives. | **Props**: `onSwipe` (callback), `disabled` (bool). |
| **`DeckComplete.jsx`** | Displayed when all cards in the deck are swiped; shows waiting spinner and live participant swiping progress from SSE. | **Props**: `room` (obj), `participants` (array), `onViewResults` (callback). |
| **`MatchCelebration.jsx`**| Instant celebratory overlay revealed when unanimous consensus is achieved; triggers confetti, chimes, and affiliate hooks. | **Props**: `venue` (obj), `matchData` (obj), `onClose` (callback). |
| **`PromotedBadge.jsx`** | Visual indicator and exclusive offer badge for sponsored cards (R4 monetization). | **Props**: `badge` (string), `cta` (string). |

---

## 2. Pointer Event Handling & Drag Physics Engine

### 2.1 Why Native Pointer Events Over Mouse/Touch Events
1. **Unified Device Handling**: `PointerEvent` abstracts mouse, touchscreen fingers, and stylus pens into a unified API.
2. **Pointer Capture (`setPointerCapture`)**: Calling `e.currentTarget.setPointerCapture(e.pointerId)` on `pointerdown` ensures that even when the user's finger or cursor accelerates outside the card boundaries or off the browser viewport edge, all subsequent `pointermove`, `pointerup`, and `pointercancel` events are guaranteed to be delivered to the card element. This completely prevents "stuck card" bugs.
3. **Hardware Acceleration**: Applying changes directly via inline CSS `transform: translate3d(Xpx, Ypx, 0) rotate(Rdeg)` triggers hardware GPU composite layers without re-triggering browser layout reflows.

### 2.2 Mathematical Physics Formulas

#### Drag Delta Calculation
Upon `pointerdown`:
$$\text{startX} = e.\text{clientX}, \quad \text{startY} = e.\text{clientY}, \quad \text{startTime} = \text{performance.now()}$$

During `pointermove`:
$$\Delta X = e.\text{clientX} - \text{startX}$$
$$\Delta Y = e.\text{clientY} - \text{startY}$$

*Vertical Clamping*: Dragging downward serves no swipe action. To maintain intuitive feel, downward movement is damped:
$$\Delta Y_{\text{clamped}} = \begin{cases} \Delta Y & \text{if } \Delta Y < 0 \text{ (swiping up)} \\ \Delta Y \times 0.25 & \text{if } \Delta Y \ge 0 \text{ (damped pull-down)} \end{cases}$$

#### Dynamic Rotation Formula
Card rotation must be directly proportional to horizontal displacement $\Delta X$:
$$\theta = \left(\frac{\Delta X}{\text{maxRotationDistance}}\right) \times \text{maxAngle}$$
Where:
- $\text{maxRotationDistance} = 300\text{px}$
- $\text{maxAngle} = 16^\circ$
$$\theta = \Delta X \times 0.0533^\circ$$
*(Example: at $\Delta X = +150\text{px}$, $\theta = +8^\circ$; at $\Delta X = -200\text{px}$, $\theta = -10.66^\circ$.)*

#### Dynamic Stamp Badge Opacities
Live visual feedback indicates user intent before release:
- **LIKE stamp (Green, Top-Left)**:
  $$\text{Opacity}_{\text{LIKE}} = \text{clamp}\left(\frac{\Delta X - 20}{70}, 0, 1\right) \quad (\text{active when } \Delta X > 20)$$
- **PASS / NOPE stamp (Red, Top-Right)**:
  $$\text{Opacity}_{\text{PASS}} = \text{clamp}\left(\frac{-\Delta X - 20}{70}, 0, 1\right) \quad (\text{active when } \Delta X < -20)$$
- **SUPERLIKE stamp (Purple/Blue, Bottom-Center)**:
  $$\text{Opacity}_{\text{SUPER}} = \text{clamp}\left(\frac{-\Delta Y - 30}{60}, 0, 1\right) \quad (\text{active when } \Delta Y < -30 \text{ and } |\Delta X| < 60)$$

### 2.3 Release Thresholds & Flick Velocity

When the user lifts their pointer (`pointerup`):
$$\Delta t = \text{performance.now()} - \text{startTime} \quad (\text{ms})$$
$$v_x = \frac{\Delta X}{\Delta t} \quad (\text{px/ms}), \quad v_y = \frac{\Delta Y}{\Delta t} \quad (\text{px/ms})$$

A swipe action is accepted if **either** distance threshold **or** flick velocity threshold is satisfied:

1. **Distance Thresholds**:
   - Horizontal threshold: $D_{\text{threshold}} = \min(110\text{px}, \text{viewportWidth} \times 0.28)$
   - Vertical threshold: $D_{\text{super}} = -90\text{px}$
2. **Velocity Threshold (Flick Detection)**:
   - Velocity threshold: $|v_x| \ge 0.55\text{ px/ms}$ with displacement $|\Delta X| \ge 35\text{px}$.

#### Decision Tree:
- **Case 1: Superlike (Up)**:
  - If $(\Delta Y < D_{\text{super}} \text{ and } |\Delta X| < 75) \text{ or } (v_y < -0.6 \text{ and } \Delta Y < -40)$:
  - **Action**: Fly out upward: `translate3d(0, -120vh, 0) rotate(0deg)`. Call `onSwipe('superlike')`.
- **Case 2: Like (Right)**:
  - If $\Delta X > D_{\text{threshold}} \text{ or } (v_x > 0.55 \text{ and } \Delta X > 35)$:
  - **Action**: Fly out right: `translate3d(140vw, ΔY, 0) rotate(22deg)`. Call `onSwipe('like')`.
- **Case 3: Pass (Left)**:
  - If $\Delta X < -D_{\text{threshold}} \text{ or } (v_x < -0.55 \text{ and } \Delta X < -35)$:
  - **Action**: Fly out left: `translate3d(-140vw, ΔY, 0) rotate(-22deg)`. Call `onSwipe('pass')`.
- **Case 4: Below Threshold (Spring-Back Bounce)**:
  - If none of the above conditions are met:
  - **Action**: Spring back to origin $(0, 0, 0^\circ)$ using overshoot cubic-bezier curve:
    `transition: transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);`

---

## 3. Card Stacking Mechanics & Background Transforms

### 3.1 Stack Depth Windowing (3-Card Limit)
To prevent DOM bloat and ensure 60fps rendering, `SwipeDeck` limits DOM rendering to at most **3 visible cards**:
$$\text{visibleCards} = \text{deck}.\text{slice}(\text{currentIndex}, \text{currentIndex} + 3)$$

Cards are rendered in reverse order (bottom to top) so that Card 0 naturally has the highest stacking order:

| Stack Index | Role | Base Transform | Z-Index | Pointer Events |
|---|---|---|---|---|
| `0` (Top) | Active Draggable Card | `translate3d(0, 0, 0) scale(1.0)` | `30` | `auto` |
| `1` (Middle) | Staged Card | `translate3d(0, 12px, 0) scale(0.95)` | `20` | `none` |
| `2` (Bottom) | Background Anchor | `translate3d(0, 24px, 0) scale(0.90)` | `10` | `none` |

### 3.2 Dynamic Stack Scale/Offset Interpolation
When the top card (Index 0) is dragged, background cards dynamically float forward based on drag progress:
$$p = \min\left(1.0, \frac{|\Delta X|}{D_{\text{threshold}}}\right)$$

- **Card 1 (Middle)**:
  $$\text{scale} = 0.95 + (0.05 \times p)$$
  $$\text{translateY} = 12\text{px} - (12\text{px} \times p)$$
  *(At full swipe threshold $p=1$, Card 1 scales to 1.0 and translateY reaches 0px, providing seamless promotion to top!)*
- **Card 2 (Bottom)**:
  $$\text{scale} = 0.90 + (0.05 \times p)$$
  $$\text{translateY} = 24\text{px} - (12\text{px} \times p)$$

---

## 4. Keyboard Accessibility & Button Controls

### 4.1 Keyboard Interaction Map
| Key | Action | Gesture Equivalent | Visual Animation |
|---|---|---|---|
| `ArrowLeft` / `KeyA` | Pass | Swipe Left | Card rotates -20° and flies off to `-140vw` |
| `ArrowRight` / `KeyD` | Like | Swipe Right | Card rotates +20° and flies off to `+140vw` |
| `ArrowUp` / `KeyW` | Superlike | Swipe Up | Card flies straight up to `-120vh` |
| `Space` / `Enter` | Toggle Card Info | Click / Tap | Expands venue description & full address |

### 4.2 Guardrails for Keyboard Listeners
- **Input Field Isolation**: Check `e.target.matches('input, textarea, select, [contenteditable="true"]')`. If true, do not intercept keys to allow normal form entry.
- **Debounce / Lock**: While a card is in its exit animation (`isFlyingOut = true`), ignore additional keydown events to prevent race conditions or skipping cards.
- **ARIA Live Announcements**: Deck wrapper contains an `aria-live="polite"` region announcing:
  `"Venue ${currentIndex + 1} of ${deck.length}: ${venue.name}, ${venue.cuisine}, rating ${venue.rating}"`.

### 4.3 Action Controls (`ActionControls.jsx`)
Three touch buttons positioned below the card deck:
1. **Pass Button**: Red circular button with `X` icon, `aria-label="Pass on venue"`.
2. **Superlike Button**: Purple circular button with `Star` icon, `aria-label="Superlike venue"`.
3. **Like Button**: Green circular button with `Heart` icon, `aria-label="Like venue"`.
- Buttons trigger programmatic fly-outs identical to manual swipes.

---

## 5. Mobile Hardening & Cross-Platform Defenses

| Challenge / Vulnerability | Manifestation | Required Defense |
|---|---|---|
| **Pull-to-refresh & Native Scroll Interception** | Mobile browsers (Safari iOS, Chrome Android) capture pointerdown for page pull-down or swipe-back navigation. | Apply `touch-action: none;` on `.swipe-card`. |
| **Accidental Text Selection** | Dragging selects card text, showing blue selection boxes. | Apply `user-select: none; -webkit-user-select: none;` on card container. |
| **HTML5 Native Drag Image Ghosting** | Dragging an `<img>` tag spawns browser ghost thumbnail. | Set `draggable={false}` and `onDragStart={(e) => e.preventDefault()}` on all images. |
| **Horizontal Viewport Spillover / Clipping** | Cards flying out to `translateX(140vw)` cause mobile browser to create horizontal scrollbars and jitter. | Wrap deck in `.swipe-deck-container` with `overflow: hidden; max-width: 100vw; position: relative;`. |
| **Finger Exiting Viewport Edge** | Rapid swipe flick moves finger off-screen, dropping `pointerup`. | `setPointerCapture(pointerId)` on `pointerdown` and release on `pointerup`/`pointercancel`. |

---

## 6. Real-Time Consensus Integration & Match Engine (M2)

### 6.1 End-to-End Sequence Diagram

```
Participant A (Host)          Express Server (RoomStore)         Participant B (Client)
      |                                  |                                  |
      |-- POST /api/rooms/:code/start -->|                                  |
      |   (Host starts voting)           |                                  |
      |<-- { success: true, deck } ------|                                  |
      |                                  |-- SSE: 'voting:started' -------->|
      |                                  |   (Deck received)                |
      |                                  |                                  |
      |-- Swipe Right (Like Venue 1) --->|                                  |
      |   POST /api/rooms/:code/vote     |                                  |
      |<-- { isMatch: false } -----------|                                  |
      |                                  |-- SSE: 'participant:progress' -->|
      |                                  |   (Participant A swiped 1 card)  |
      |                                  |                                  |
      |                                  |<-- Swipe Right (Like Venue 1) ---|
      |                                  |    POST /api/rooms/:code/vote    |
      |                                  |                                  |
      |                                  | [Consensus Algorithm]:           |
      |                                  | - All participants voted? YES    |
      |                                  | - All votes 'like'/'superlike'? YES
      |                                  | - UNANIMOUS CONSENSUS ACHIEVED!  |
      |                                  |                                  |
      |                                  |<-- { isMatch: true, venue } -----|
      |<-- SSE: 'match:revealed' --------|                                  |
      |                                  |                                  |
      |==================================|==================================|
      |     REVEAL MATCH CELEBRATION!    |     REVEAL MATCH CELEBRATION!    |
      |     (canvas-confetti bursts)     |     (canvas-confetti bursts)     |
      |==================================|==================================|
```

### 6.2 Consensus Criteria in `RoomStore.js`
In `RoomStore.recordVote`:
```javascript
const activeParticipants = Object.values(room.participants);
const venueVotes = room.votes[venueId] || {};

const allVoted = activeParticipants.length > 0 && activeParticipants.every(p => venueVotes[p.id] !== undefined);
const allAgreed = activeParticipants.length > 0 && activeParticipants.every(p => {
  const v = venueVotes[p.id];
  return v === 'like' || v === 'superlike';
});

if (allVoted && allAgreed && room.status !== 'matched') {
  // Triggers match:revealed and updates room.status = 'matched'
}
```

---

## 7. Precise File Layout & Implementation Blueprints

### 7.1 Proposed File Layout
```
src/
├── components/
│   ├── Swiper/
│   │   ├── SwipeDeck.jsx          # Deck manager, stack rendering, keyboard & API dispatch
│   │   ├── SwipeCard.jsx          # Gesture entity with pointer physics & stamp overlays
│   │   ├── ActionControls.jsx     # Bottom Pass / Superlike / Like action buttons
│   │   └── DeckComplete.jsx       # Waiting / completion screen with group progress
│   ├── Match/
│   │   ├── MatchCelebration.jsx   # Celebratory match reveal with winning venue showcase
│   │   └── Confetti.js            # canvas-confetti particle wrapper
│   └── Monetization/
│       └── PromotedBadge.jsx      # Sponsor tag and exclusive promo perk
```

### 7.2 Implementation Details: `src/components/Swiper/SwipeCard.jsx`
```jsx
// Key physics implementation details
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Star, MapPin, DollarSign, Sparkles } from 'lucide-react';
import { PromotedBadge } from '../Monetization/PromotedBadge.jsx';

export function SwipeCard({ venue, index, isTop, onSwipe, programmaticSwipe }) {
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFlyingOut, setIsFlyingOut] = useState(false);
  const [flyDirection, setFlyDirection] = useState(null);

  const cardRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0, time: 0 });

  // Handle Programmatic Swiping (via buttons or keyboard)
  useEffect(() => {
    if (!programmaticSwipe || !isTop || isFlyingOut) return;
    triggerFlyOut(programmaticSwipe.direction);
  }, [programmaticSwipe, isTop]);

  const triggerFlyOut = (direction) => {
    setIsFlyingOut(true);
    setFlyDirection(direction);
    setTimeout(() => {
      onSwipe(direction, venue);
    }, 280);
  };

  const handlePointerDown = (e) => {
    if (!isTop || isFlyingOut || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !isTop) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    let deltaY = e.clientY - dragStartRef.current.y;
    // Damping downward pulls
    if (deltaY > 0) deltaY *= 0.25;
    setDragOffset({ x: deltaX, y: deltaY });
  };

  const handlePointerUp = (e) => {
    if (!isDragging || !isTop) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);

    const deltaX = dragOffset.x;
    const deltaY = dragOffset.y;
    const elapsed = performance.now() - dragStartRef.current.time;
    const vx = deltaX / elapsed;
    const vy = deltaY / elapsed;

    const thresholdX = Math.min(110, window.innerWidth * 0.28);

    // Evaluate Swipe Thresholds
    if ((deltaY < -90 && Math.abs(deltaX) < 75) || (vy < -0.6 && deltaY < -40)) {
      triggerFlyOut('superlike');
    } else if (deltaX > thresholdX || (vx > 0.55 && deltaX > 35)) {
      triggerFlyOut('like');
    } else if (deltaX < -thresholdX || (vx < -0.55 && deltaX < -35)) {
      triggerFlyOut('pass');
    } else {
      // Spring-back
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const handlePointerCancel = (e) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
  };

  // Rotation and Stamp Opacities
  const rotation = isTop ? dragOffset.x * 0.0533 : 0;
  const likeOpacity = isTop ? Math.max(0, Math.min(1, (dragOffset.x - 20) / 70)) : 0;
  const passOpacity = isTop ? Math.max(0, Math.min(1, (-dragOffset.x - 20) / 70)) : 0;
  const superOpacity = isTop && Math.abs(dragOffset.x) < 60
    ? Math.max(0, Math.min(1, (-dragOffset.y - 30) / 60))
    : 0;

  // Transform computation
  let transform = '';
  let transition = 'none';

  if (isFlyingOut) {
    transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.28s ease';
    if (flyDirection === 'like') transform = 'translate3d(140vw, 0, 0) rotate(22deg)';
    else if (flyDirection === 'pass') transform = 'translate3d(-140vw, 0, 0) rotate(-22deg)';
    else if (flyDirection === 'superlike') transform = 'translate3d(0, -120vh, 0) rotate(0deg)';
  } else if (isTop) {
    if (!isDragging) {
      transition = 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    }
    transform = `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${rotation}deg)`;
  } else {
    // Background Stacking
    const baseScale = index === 1 ? 0.95 : 0.90;
    const baseTranslateY = index === 1 ? 12 : 24;
    transform = `translate3d(0, ${baseTranslateY}px, 0) scale(${baseScale})`;
    transition = 'transform 0.3s ease-out';
  }

  const zIndex = 30 - index * 10;

  return (
    <div
      ref={cardRef}
      className={`swipe-card ${isTop ? 'top-card' : ''}`}
      style={{
        transform,
        transition,
        zIndex,
        touchAction: 'none',
        userSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Visual Stamps */}
      {isTop && (
        <>
          <div className="swipe-stamp stamp-like" style={{ opacity: likeOpacity }}>LIKE</div>
          <div className="swipe-stamp stamp-pass" style={{ opacity: passOpacity }}>PASS</div>
          <div className="swipe-stamp stamp-super" style={{ opacity: superOpacity }}>SUPERLIKE</div>
        </>
      )}

      {/* Card Media & Details */}
      <div className="card-image-wrap">
        <img src={venue.imageUrl} alt={venue.name} draggable={false} />
        {venue.isPromoted && <PromotedBadge badge={venue.sponsorBadge} cta={venue.sponsorCta} />}
      </div>

      <div className="card-info">
        <div className="card-header-row">
          <h2 className="venue-name">{venue.name}</h2>
          <div className="venue-rating"><Star size={16} fill="#F59E0B" /> {venue.rating}</div>
        </div>
        <p className="venue-meta">
          <span>{venue.cuisine}</span> • <span>{'$'.repeat(venue.priceTier)}</span> • <span>{venue.distance}</span>
        </p>
        <p className="venue-desc">{venue.description}</p>
        <div className="venue-tags">
          {(venue.tags || []).map(tag => <span key={tag} className="venue-tag">{tag}</span>)}
        </div>
      </div>
    </div>
  );
}
```

### 7.3 Implementation Details: `src/components/Swiper/ActionControls.jsx`
```jsx
import React from 'react';
import { X, Star, Heart } from 'lucide-react';

export function ActionControls({ onSwipe, disabled }) {
  return (
    <div className="action-controls-bar">
      <button
        type="button"
        className="ctrl-btn ctrl-pass"
        onClick={() => onSwipe('pass')}
        disabled={disabled}
        aria-label="Pass on venue"
        title="Pass (Left arrow)"
      >
        <X size={28} />
      </button>

      <button
        type="button"
        className="ctrl-btn ctrl-superlike"
        onClick={() => onSwipe('superlike')}
        disabled={disabled}
        aria-label="Superlike venue"
        title="Superlike (Up arrow)"
      >
        <Star size={24} fill="currentColor" />
      </button>

      <button
        type="button"
        className="ctrl-btn ctrl-like"
        onClick={() => onSwipe('like')}
        disabled={disabled}
        aria-label="Like venue"
        title="Like (Right arrow)"
      >
        <Heart size={28} fill="currentColor" />
      </button>
    </div>
  );
}
```

### 7.4 Implementation Details: `src/components/Match/Confetti.js`
```javascript
import confetti from 'canvas-confetti';

export function fireCelebrationConfetti() {
  const duration = 3000;
  const animationEnd = Date.now() + duration;

  const frame = () => {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: ['#FF5A5F', '#8B5CF6', '#10B981', '#F59E0B'],
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: ['#FF5A5F', '#8B5CF6', '#10B981', '#F59E0B'],
    });

    if (Date.now() < animationEnd) {
      requestAnimationFrame(frame);
    }
  };

  // Center star burst
  confetti({
    particleCount: 80,
    spread: 100,
    origin: { y: 0.6 },
    scalar: 1.2,
  });

  frame();
}
```

---

## 8. CSS Design System Specifications for Swiper

```css
/* Swiper Deck Container */
.swipe-deck-container {
  position: relative;
  width: 100%;
  max-width: 420px;
  height: 560px;
  margin: 0 auto;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Individual Swipe Card */
.swipe-card {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--surface-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  will-change: transform;
}

.swipe-card.top-card {
  cursor: grab;
}

.swipe-card.top-card:active {
  cursor: grabbing;
}

/* Card Visual Badges */
.swipe-stamp {
  position: absolute;
  top: 24px;
  padding: 6px 16px;
  font-size: 1.4rem;
  font-weight: 800;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 2px;
  pointer-events: none;
  z-index: 50;
  transition: opacity 0.05s ease-out;
}

.stamp-like {
  left: 24px;
  color: var(--success);
  border: 3px solid var(--success);
  transform: rotate(-15deg);
}

.stamp-pass {
  right: 24px;
  color: var(--danger);
  border: 3px solid var(--danger);
  transform: rotate(15deg);
}

.stamp-super {
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--secondary);
  border: 3px solid var(--secondary);
}

/* Action Controls Bar */
.action-controls-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 18px;
  width: 100%;
}

.ctrl-btn {
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFF;
  border: 2px solid var(--border);
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.ctrl-btn:active:not(:disabled) {
  transform: scale(0.92);
}

.ctrl-pass {
  width: 56px;
  height: 56px;
  color: var(--danger);
}

.ctrl-pass:hover:not(:disabled) {
  border-color: var(--danger);
  background: #FEF2F2;
}

.ctrl-superlike {
  width: 48px;
  height: 48px;
  color: var(--secondary);
}

.ctrl-superlike:hover:not(:disabled) {
  border-color: var(--secondary);
  background: #F5F3FF;
}

.ctrl-like {
  width: 56px;
  height: 56px;
  color: var(--success);
}

.ctrl-like:hover:not(:disabled) {
  border-color: var(--success);
  background: #ECFDF5;
}
```

---

## 9. Verification & Acceptance Criteria for Milestone 2

To declare Milestone 2 complete and verified:
1. **Automated Test Coverage**:
   - Create `tests/tier1-features/r2-swiping.test.js` with ≥ 10 test cases covering:
     - Starting voting sessions (`POST /api/rooms/:code/start`) with authorization checks.
     - Submitting valid and invalid votes (`POST /api/rooms/:code/vote`).
     - Progress broadcasting via SSE (`participant:progress`).
     - Instant unanimous match resolution for pairs and groups (`isMatch: true`).
     - Rejection of non-unanimous venues.
     - Leaderboard and consensus calculation (`GET /api/rooms/:code/results`).
   - Run `npm test` and verify that all test suites pass with 100% success rate.
2. **Interactive UI Verification**:
   - Host clicks "Start Swiping!", transitions into active card deck.
   - Pointer drag smoothly rotates top card, reveals LIVE stamp badges, and releases cleanly.
   - Spring-back returns card to center if below threshold.
   - Action buttons (Pass, Like, Superlike) smoothly trigger fly-out animations.
   - Keyboard arrows (`ArrowLeft`, `ArrowRight`, `ArrowUp`) smoothly trigger card swipes.
   - When all participants swipe "Like" on the same venue, the Celebratory Match screen appears with confetti and winning venue details.
