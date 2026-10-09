# E2E Test Infra: MatchBite Web App

## Test Philosophy
- Opaque-box, requirement-driven verification derived directly from `ORIGINAL_REQUEST.md` (Update 2026-10-08T22:04:30Z).
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.
- Single-command automated execution (`npm test` via Vitest + Supertest) with 100% pass guarantee and sub-3-second run time.

---

## Feature Inventory Test Coverage
| # | Feature | Source (Requirement) | Tier 1 (Features) | Tier 2 (Boundaries) | Tier 3 (Combinations) | Tier 4 (Real-World) |
|---|---------|---------------------|:-----------------:|:-------------------:|:---------------------:|:-------------------:|
| 1 | R1: Room Creation & Codes | ORIGINAL_REQUEST §R1 | 5+ | ✓ | ✓ | ✓ |
| 2 | R1: Zero-Friction Joining & Roster | ORIGINAL_REQUEST §R1 | 5+ | ✓ | ✓ | ✓ |
| 3 | R1: Activity Settings & Lifecycle | ORIGINAL_REQUEST §R1 | 5+ | ✓ | ✓ | ✓ |
| 4 | R2: Card Swiping & Voting | ORIGINAL_REQUEST §R2 | 5+ | ✓ | ✓ | ✓ |
| 5 | R2: Instant Unanimous Match | ORIGINAL_REQUEST §R2 | 5+ | ✓ | ✓ | ✓ |
| 6 | R3: Tie-Breaker Leaderboard & Fallback | ORIGINAL_REQUEST §R3 | 5+ | ✓ | ✓ | ✓ |
| 7 | R3: Interactive Roulette Wheel | ORIGINAL_REQUEST §R3 | 5+ | ✓ | ✓ | ✓ |
| 8 | R4: Tracked Affiliate Action Links | ORIGINAL_REQUEST §R4 | 5+ | ✓ | ✓ | ✓ |
| 9 | R4: Promoted Card Placement | ORIGINAL_REQUEST §R4 | 5+ | ✓ | ✓ | ✓ |
| 10 | R4: VIP Upgrade & Mock Checkout | ORIGINAL_REQUEST §R4 | 5+ | ✓ | ✓ | ✓ |

---

## Test Architecture
- **Runner**: Vitest (in-memory execution with native ESM support) + Supertest for Express HTTP/SSE integration.
- **Single Execution Command**: `npm test`
- **Output Semantics**: Exit code 0 on 100% pass, non-zero on failure.
- **Directory Layout**:
  - `tests/tier1-features/r1-rooms.test.js`: Room creation, memorable codes, join flows, settings mutation.
  - `tests/tier1-features/r2-swiping.test.js`: Vote recording, unanimous match detection, match payload.
  - `tests/tier1-features/r3-tiebreaker.test.js`: Non-unanimous fallback, top contender ranking, roulette spin outcome.
  - `tests/tier1-features/r4-monetization.test.js`: Affiliate link formatting, `/api/affiliate/redirect` 302s, promoted deck card, VIP checkout validation & coupons.
  - `tests/tier2-boundaries/boundary-cases.test.js`: 1-person solo room (instant 1-vote match), empty room, large 20-person group, invalid room codes, 100% pass/dislike deck, declined payment tokens.
  - `tests/tier2-boundaries/m2-adversarial-security.test.js`: Prototype pollution defense, token tampering, cross-room contamination.
  - `tests/tier2-boundaries/m2-fuzzing-adversarial-probe.test.js`: Empirical fuzzing, malformed payloads, unicode edge cases.
  - `tests/tier3-combinations/cross-feature.test.js`: Voting -> unanimous match -> affiliate action URL verification; deck completion -> tiebreaker wheel -> delivery redirect; promoted card consensus -> sponsor perk banner; mid-session VIP upgrade -> custom venue injection -> instant voting.
  - `tests/tier4-workloads/real-world-scenarios.test.js`:
    1. Couples Date Night (2 participants, dining filter, rapid swiping to match on Italian bistro, affiliate reservation link generated).
    2. Friday Friends Bar Crawl (4 participants, bars filter, mixed votes leading to tie-breaker roulette spin to resolve winner).
    3. Coworker Lunch Indecision (5 participants, quick casual filter, sponsor perk redeemed, split votes resolved via consensus leaderboard).
  - `tests/tier5-adversarial/tier5-adversarial-hardening.test.js`: Production static serving & SPA fallback, API 404 routing isolation, open redirect defense, session token lifecycle anomalies, solo room instant matching, VIP coupon cases, roulette math determinism, Broadcaster socket error resiliency.
  - `tests/stress-concurrency-consensus.test.js`: Multi-user concurrency, scrambled vote ordering, and consensus stress.
  - `tests/adversarial-concurrency-deep-stress.test.js`: Massive 500-request bursts and 1,000 multi-room concurrent stress tests.

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥ 24 test cases (94 tests active).
- **Tier 2 (Boundary & Corner Cases)**: ≥ 8 test cases (76 tests active).
- **Tier 3 (Cross-Feature Combinations)**: ≥ 6 test cases (6 tests active).
- **Tier 4 (Real-World Application Scenarios)**: 3 comprehensive multi-step persona journeys (3 tests active).
- **Tier 5 (Adversarial Hardening & Startup Integrity)**: 31 white-box security, startup, and fault-tolerance tests.
- **Deep Concurrency & Stress Suites**: 24 tests across high-load multi-room scenarios.
- **Total Verification**: 234 automated tests passing 100% across 12 test suites.
