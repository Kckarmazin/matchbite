# Project: Runway & Tax Sentinel (niche_web_app)

## Architecture
A modern, responsive full-stack web application tailored for fractional executives, high-earning independent consultants, and senior freelancers (ages 26–48, $120k–$450k/yr).

- **Frontend**: React 18/19 (TypeScript), Vite 6, Tailwind CSS, Lucide Icons, responsive SVG data visualizations.
- **Backend**: Express.js REST API server in TypeScript/Node.js v22.
- **Persistence**: Zero-external-dependency Node 22 native `node:sqlite` (`DatabaseSync` at `data/app.db`) for leads, saved scenarios, and checkout transactions.
- **Testing**: Single-command automated verification suite (`npm test`) using Vitest / Supertest with 100% automated coverage.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Market Research Report | Comprehensive evaluation of 4 candidate niches, demographic fit, monetization models, competitors, MCDA scoring, and rationale in `market_research.md` | M1 | Survey E1 |
| 2 | Interactive Financial Engine | Pure TS calculation engine: Net monthly burn, Zero-Cash date, Runway burndown timeline, IRS Safe Harbor quarterly tax allocation | M2 | Survey E2 |
| 3 | Responsive Web UI & Charts | Modern desktop/mobile dashboard with real-time slider inputs, summary metrics, and responsive visual charts | M2 | Survey E2 |
| 4 | "What-If" Stress Simulator | Interactive toggles for 30/60-day client payment lag, client churn shock, and rate renegotiation | M2 | Survey E2 |
| 5 | Lead Capture & Validation | Form modal validating full name, RFC 5322 email, filing status, with inline error feedback and persistence | M3 | Survey E3 |
| 6 | Lead Persistence API | REST endpoints (`POST /api/leads`, `GET /api/leads/:id`, `GET /api/admin/leads`) storing records in `data/app.db` | M3 | Survey E3 |
| 7 | Tiered Monetization Plans | 3-tier model (Starter Free, Pro $29/mo, Executive $79/mo) with explicit feature gating flags | M4 | Survey E3 |
| 8 | Interactive Mock Checkout | Checkout modal with card brand detection, dynamic coupon engine (`EARLYBIRD20`, `LAUNCH50`), simulated decline handling, and immediate tier upgrade | M4 | Survey E3 |
| 9 | Single-Command Test Suite | Automated test runner (`npm test`) executing 4-tier test matrix with 100% pass guarantee | M5 | Survey E3 |
| 10 | End-to-End User Journeys | Full workflow: landing -> runway calculation -> scenario stress test -> lead capture -> mock checkout -> upgraded export | M6 | Survey E1-3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Market Research (R1) | Author authoritative `market_research.md` evaluating 4 niches and justifying Runway Sentinel | none | PLANNED |
| M2 | Core Web Utility (R2) | Scaffolding, Express API, React UI, financial calculation engine, burndown charts, and scenario simulator | M1 | PLANNED |
| M3 | Lead Onboarding (R3) | Progressive capture modal, RFC validation, SQLite repository, REST lead endpoints | M2 | PLANNED |
| M4 | Monetization System (R4) | Tiered feature gating, mock checkout modal, coupon engine, test card simulation, state upgrade | M3 | PLANNED |
| M5 | Automated Test Suite (R5) | 4-Tier test suite (unit math, boundary/corner, API routes, E2E conversion flows), TEST_READY.md | M2, M3, M4 | PLANNED |
| M6 | Final Verification & Audit | 100% test pass, clean build/start, forensic audit verification, project completion claim | M1, M2, M3, M4, M5 | PLANNED |

## Interface Contracts

### Financial Calculation Engine (`src/domain/financialEngine.ts`)
```typescript
export interface FinancialInputs {
  cashOnHand: number;
  monthlyBurn: number;
  monthlyRevenue: number;
  paymentLagDays: number;
  taxFilingStatus: 'single' | 'married_joint' | 's_corp';
  annualTaxRate: number; // e.g. 0.30
}

export interface RunwayMetrics {
  netMonthlyBurn: number;
  runwayMonths: number;
  zeroCashDate: string; // ISO date or 'Solvent (> 36 months)'
  healthStatus: 'critical' | 'caution' | 'healthy' | 'exceptional';
  recommendedTaxEscrowMonthly: number;
  safeHarborQuarterlyEscrow: number;
  timeline: Array<{ month: number; date: string; startingCash: number; cashEnding: number; isSolvent: boolean }>;
}
```

### Lead Capture API (`/api/leads`)
```typescript
// POST /api/leads
// Request:
export interface CreateLeadRequest {
  fullName: string;
  email: string;
  role: string;
  annualRevenue?: number;
  taxFilingStatus?: string;
  source?: string;
}
// Response (201 / 200):
export interface LeadResponse {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
  status: 'active' | 'existing';
}
```

### Checkout API (`/api/checkout`)
```typescript
// POST /api/checkout
// Request:
export interface CheckoutRequest {
  planId: 'starter' | 'pro_monthly' | 'pro_annual' | 'executive_monthly';
  email: string;
  couponCode?: string;
  cardNumber: string; // e.g. 4242... (success) or 4000...0002 (decline)
  expMonth: string;
  expYear: string;
  cvc: string;
}
// Response (200 / 402):
export interface CheckoutResponse {
  success: boolean;
  transactionId?: string;
  tier: 'starter' | 'pro' | 'executive';
  amountCharged: number;
  currency: 'USD';
  message: string;
}
```

## Code Layout
```
C:\Users\kck50\teamwork_projects\niche_web_app\
├── ORIGINAL_REQUEST.md
├── market_research.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── data\
│   └── app.db (SQLite database)
├── src\
│   ├── client\
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components\
│   │   │   ├── Header.tsx
│   │   │   ├── RunwayCalculator.tsx
│   │   │   ├── BurndownChart.tsx
│   │   │   ├── WhatIfSimulator.tsx
│   │   │   ├── OnboardingModal.tsx
│   │   │   ├── PricingModal.tsx
│   │   │   └── CheckoutModal.tsx
│   │   ├── hooks\
│   │   │   ├── useRunwayCalculator.ts
│   │   │   └── useSubscription.ts
│   │   └── styles\
│   │       └── index.css
│   ├── server\
│   │   ├── server.ts
│   │   ├── app.ts
│   │   ├── db.ts
│   │   ├── routes\
│   │   │   ├── leads.ts
│   │   │   ├── checkout.ts
│   │   │   └── health.ts
│   │   └── services\
│   │       ├── leadService.ts
│   │       └── checkoutService.ts
│   └── domain\
│       ├── financialEngine.ts
│       ├── coupons.ts
│       └── validationSchemas.ts
└── test\
    ├── domain\
    │   ├── financialEngine.test.ts
    │   ├── coupons.test.ts
    │   └── validation.test.ts
    ├── api\
    │   ├── leadsApi.test.ts
    │   ├── checkoutApi.test.ts
    │   └── healthApi.test.ts
    └── e2e\
        └── fullUserJourney.test.ts
```
