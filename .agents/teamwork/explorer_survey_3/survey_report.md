# Technical Survey Report: Onboarding, Monetization, and Automated Verification Architecture

**Agent**: Explorer Survey 3 (`explorer_survey_3`)  
**Target Application**: "Runway & Tax Sentinel" (Fractional Executive & High-Earner Cash Flow, Runway & Tax Simulator)  
**Target Demographic**: Adults aged 18–50 with disposable income (Fractional executives, elite 1099 consultants, solopreneurs)  
**Date**: 2026-10-08  
**Scope**: Requirements R3 (Onboarding & Lead Capture), R4 (Monetization & Checkout Flow), and R5 (Automated Test & Verification Suite)

---

## Executive Summary

This report establishes the complete architectural blueprint for **User Onboarding and Lead Capture (R3)**, **Monetization and Interactive Checkout (R4)**, and the **Automated Test and Verification Suite (R5)** for the selected niche web application: **"Runway & Tax Sentinel"**.

1. **User Onboarding & Lead Capture (R3)**:
   - Frictionless "value-first" progressive onboarding with inline calculator capture.
   - Dual-layer validation (client-side interactive feedback + server-side strict RFC 5322 Zod schema).
   - High-performance, zero-external-binary persistence via Node 22 native `node:sqlite` (`DatabaseSync`), backed by an atomic file-backed SQLite store (`data/app.db`) and clean REST query/retrieval endpoints.
2. **Monetization & Interactive Mock Checkout (R4)**:
   - 3-tier monetization model (Starter/Free, Pro at $29/mo or $290/yr, Executive Studio at $79/mo or $790/yr).
   - Granular feature gating matrix locking multi-year forecasts, late-payment stress testing, IRS Safe Harbor tax reserve schedules, and audit-ready PDF/CSV exports.
   - 4-step interactive checkout flow featuring dynamic coupon redemption (`EARLYBIRD20`, `LAUNCH50`, `EXECUTIVE100`), mock card formatting with brand detection, realistic network latency simulation, decline handling (`4000...0002`), and instant client/server state elevation to Pro.
3. **Automated Verification Suite (R5)**:
   - Single-command execution via `npm test` using **Vitest** (with zero-dependency fallback support via Node 22 native `node:test`).
   - Comprehensive 4-tier test architecture covering:
     * **Tier 1**: Feature unit coverage (runway math, tax formulas, coupon discounts, schema validation).
     * **Tier 2**: Boundary & edge conditions (RFC email anomalies, Unicode, XSS sanitization, zero/negative cash, coupon casing, card expiry).
     * **Tier 3**: Combinatorial & integration flows (lead registration -> checkout transition -> gated feature unlock -> API error codes).
     * **Tier 4**: Real-world E2E journeys (visitor conversion, payment failure recovery, session reload persistence).

---

## 1. User Onboarding and Lead Capture Architecture (R3)

### 1.1 Demographic Alignment & Conversion Strategy
The target audience consists of busy, high-earning independent professionals ($120k–$450k/yr). They exhibit low tolerance for clunky, multi-page signup barriers before receiving value.
- **Conversion Philosophy: "Value First, Capture Second"**:
  1. The user lands on the interactive Runway & Tax Calculator and can immediately adjust cash, burn rate, and retainers to see instant calculations.
  2. When the user desires to **save their financial forecast**, **receive automated Safe Harbor tax deadline alerts (Jan 15, Apr 15, Jun 15, Sep 15)**, or **download an audit-ready executive summary**, they trigger the Onboarding & Lead Capture modal.
  3. Onboarding can also be triggered via a prominent "Create Saved Scenario" or "Sign Up for Free" header CTA.

### 1.2 Form Fields Specification

| Field Name | Type | UI Component | Requirement | Validation Rules | Description |
|:---|:---:|:---:|:---:|:---|:---|
| `fullName` | string | Text input | Required | Trimmed, 2–70 chars, letters, spaces, hyphens, apostrophes | User's full professional name |
| `email` | string | Email input | Required | Trimmed, lowercase, RFC 5322 regex compliant | Primary business email for account & alerts |
| `role` | enum | Select dropdown | Required | Enum: `fractional_executive`, `tech_consultant`, `agency_founder`, `independent_solopreneur`, `other` | Professional specialization |
| `annualRevenue` | enum | Radio/Select | Optional | Enum: `<$150k`, `$150k-$250k`, `$250k-$500k`, `$500k+` | Income bracket for tax safe harbor bracket detection |
| `taxFilingStatus` | enum | Select dropdown | Optional | Enum: `s_corp`, `llc_sole_prop`, `c_corp`, `individual_1099` | Determines tax estimation formula |
| `taxAlertsOptIn` | boolean | Checkbox | Optional | Default `true` | Opt-in for quarterly estimated tax deadline alerts |
| `termsAccepted` | boolean | Checkbox | Required | Must be `true` | Terms of service and privacy consent |

### 1.3 Client-Side & Server-Side Validation Rules

#### Client-Side Real-Time Validation:
- **Email Validation**:
  - RFC 5322 Official Regex:
    ```javascript
    const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    ```
  - Validation triggers `onBlur` and `onChange` (after the field has been touched).
  - Normalization: Automatically strips leading/trailing spaces and converts to lowercase before submission.
- **Name Validation**: Minimum 2 characters, maximum 70 characters, disallows script tags or pure whitespace.
- **Visual Feedback & Micro-Interactions**:
  - **Valid state**: Green border accent, green check icon (`✓`).
  - **Error state**: Red border accent (`border-red-500`), subtle shake animation (`shake 0.3s ease-in-out`), and an inline accessible error message linked via `aria-describedby`.
  - **Pending state**: Submit button displays an animated spinner and text changes to *"Creating your profile..."*, with the button disabled to prevent duplicate submissions.

#### Server-Side Strict Validation Schema (Zod / TypeScript):
```typescript
import { z } from 'zod';

export const LeadCaptureSchema = z.object({
  fullName: z.string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(70, "Full name must not exceed 70 characters")
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, "Name contains invalid characters"),
  email: z.string()
    .trim()
    .toLowerCase()
    .max(254, "Email is too long")
    .regex(
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
      "Please enter a valid RFC-compliant email address"
    ),
  role: z.enum([
    'fractional_executive',
    'tech_consultant',
    'agency_founder',
    'independent_solopreneur',
    'other'
  ], { errorMap: () => ({ message: "Please select your primary role" }) }),
  annualRevenue: z.enum(['<$150k', '$150k-$250k', '$250k-$500k', '$500k+']).optional(),
  taxFilingStatus: z.enum(['s_corp', 'llc_sole_prop', 'c_corp', 'individual_1099']).optional(),
  taxAlertsOptIn: z.boolean().default(true),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms of service" })
  }),
  initialScenario: z.record(z.any()).optional()
});

export type LeadCaptureInput = z.infer<typeof LeadCaptureSchema>;
```

### 1.4 Data Persistence Strategy (Node.js 22 Native SQLite)

#### Architecture Decision:
Node.js v22.20.0 includes native support for SQLite via `node:sqlite` (`DatabaseSync`), requiring **zero native compilation (`node-gyp`) or external C++ build tools**. This guarantees 100% reliable execution on Windows systems.

- **Database File Location**: `data/app.db` (auto-created on startup with automatic table migration).
- **In-Memory Fallback**: During automated testing (`NODE_ENV === 'test'`), the repository uses `new DatabaseSync(':memory:')` for ultra-fast, isolated execution without disk artifacts.

#### Database Schema:
```sql
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  annual_revenue TEXT,
  tax_filing_status TEXT,
  tax_alerts_opt_in INTEGER NOT NULL DEFAULT 1,
  tier TEXT NOT NULL DEFAULT 'free',
  scenario_data TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_tier ON leads(tier);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discount REAL NOT NULL,
  total REAL NOT NULL,
  coupon_code TEXT,
  card_last4 TEXT NOT NULL,
  card_brand TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
```

### 1.5 Query and Retrieval API Endpoints

1. **`POST /api/leads` (or `POST /api/onboarding`)**:
   - **Request**: JSON payload conforming to `LeadCaptureSchema`.
   - **Behavior**:
     - Validates payload.
     - Checks if email already exists:
       - If email exists: updates timestamp, merges scenario data, returns `200 OK` with existing profile (idempotent user return).
       - If new email: generates UUID, persists record, returns `201 Created`.
   - **Response**:
     ```json
     {
       "success": true,
       "message": "Lead profile created successfully",
       "lead": {
         "id": "lead_9f81a7b2",
         "email": "sarah.connor@fractional.io",
         "fullName": "Sarah Connor",
         "role": "fractional_executive",
         "tier": "free",
         "createdAt": "2026-10-08T21:55:00.000Z"
       }
     }
     ```

2. **`GET /api/leads/:id`**:
   - **Response**: Retrieves the lead's full saved scenario, tier, and alert settings.

3. **`GET /api/admin/leads`**:
   - **Query Params**: `?limit=50&offset=0`
   - **Response**: Returns paginated list of leads with total count, for administrative inspection, automated verification, and CSV export.

4. **`POST /api/leads/:id/scenario`**:
   - **Request**: Updated runway scenario state (`cashReserves`, `monthlyBurn`, `clients`, `taxSettings`).
   - **Response**: `200 OK` confirming scenario sync.

---

## 2. Monetization System & Interactive Mock Checkout Flow (R4)

### 2.1 Tiered Plans & Feature Gating Matrix

| Feature / Capability | Starter / Free ($0) | Professional ($29/mo or $290/yr) | Executive Studio ($79/mo or $790/yr) |
|:---|:---:|:---:|:---:|
| **Forward Cash Runway Horizon** | 3 Months Max | 24 Months Max | 36 Months Max |
| **Active Client Retainers** | Up to 2 Clients | Unlimited | Unlimited |
| **Payment Lag Modeling** | Basic (Net 0) | Variable (Net 15/30/60/90) | Variable + Custom Milestones |
| **Interactive "What-If" Stress Engine** | ❌ Locked | ✅ Full (Churn, Rate Hikes, Delays) | ✅ Multi-scenario overlays |
| **IRS Safe Harbor Tax Optimization** | Basic Single Bracket | ✅ Full Safe Harbor (100% vs 110% vs 90%) | ✅ S-Corp Wage vs Dividend Tax Alpha |
| **Quarterly Tax Set-Aside Schedule** | ❌ Locked | ✅ Detailed Calendar (Jan, Apr, Jun, Sep) | ✅ Multi-entity / Multi-state |
| **Executive PDF Financial Summary** | ❌ Watermarked Sample | ✅ Full Audit-Ready PDF Export | ✅ Custom Brandable White-Label PDF |
| **Data Export** | ❌ None | ✅ CSV / Excel Export | ✅ Automated Accounting Sync / Webhook |
| **Support SLA** | Community | Priority Email (24h) | Dedicated Advisor Onboarding |

### 2.2 Client-Side & Server-Side Feature Gating Architecture

```typescript
export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  maxRunwayMonths: number;
  maxClients: number;
  canModelPaymentLag: boolean;
  canStressTest: boolean;
  canAccessSafeHarborOptimization: boolean;
  canExportPdf: boolean;
  canExportCsv: boolean;
  canAccessSCorpOptimizer: boolean;
}

export const TIER_LIMITS: Record<SubscriptionTier, PlanLimits> = {
  free: {
    maxRunwayMonths: 3,
    maxClients: 2,
    canModelPaymentLag: false,
    canStressTest: false,
    canAccessSafeHarborOptimization: false,
    canExportPdf: false,
    canExportCsv: false,
    canAccessSCorpOptimizer: false
  },
  pro: {
    maxRunwayMonths: 24,
    maxClients: 100,
    canModelPaymentLag: true,
    canStressTest: true,
    canAccessSafeHarborOptimization: true,
    canExportPdf: true,
    canExportCsv: true,
    canAccessSCorpOptimizer: false
  },
  enterprise: {
    maxRunwayMonths: 36,
    maxClients: 500,
    canModelPaymentLag: true,
    canStressTest: true,
    canAccessSafeHarborOptimization: true,
    canExportPdf: true,
    canExportCsv: true,
    canAccessSCorpOptimizer: true
  }
};
```

#### Contextual Upgrade Trigger:
Whenever a user on the Free plan clicks a gated feature (e.g., clicks *"Export Executive PDF"*, drags the runway slider beyond 3 months, or adds a 3rd client), the UI intercepts the action and presents an **Upgrade Modal** with:
- A tailored value proposition message: *"Unlock 24-Month Projections & Audit-Ready PDF Reports"*.
- The Pro plan pre-selected with the discount toggle highlighted.

### 2.3 Interactive Mock Checkout Flow

The checkout flow operates as an interactive modal dialog with step-by-step validation and realistic simulated payment processing.

#### Flow Steps:
```
[User Selects Plan / Clicks Upgrade]
                │
                ▼
┌──────────────────────────────────────────┐
│ Step 1: Plan & Billing Interval Selection│
│ • Monthly ($29/mo) vs Annual ($290/yr)   │
│ • Annual includes "Save 17%" badge       │
└──────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│ Step 2: Interactive Checkout Modal       │
│ • Dynamic Order Summary line items       │
│ • Coupon Code Input & Live Validator     │
│ • Formatted Payment Details (Card/Expiry)│
│ • Pre-filled Test Card quick-selectors   │
└──────────────────────────────────────────┘
                │ [Clicks "Pay & Unlock Pro"]
                ▼
┌──────────────────────────────────────────┐
│ Step 3: Simulated Payment Processing     │
│ • Button disables, spinner activates     │
│ • 800ms–1200ms simulated async latency   │
│ • Card Brand Detection (Visa/MC/Amex)    │
└──────────────────────────────────────────┘
                │
        ┌───────┴───────┐
  [Card Declined] [Payment Succeeded]
        │               │
        ▼               ▼
┌──────────────┐  ┌──────────────────────────────────────────┐
│ Inline Error │  │ Step 4: Success & Instant State Upgrade  │
│ Alert shown; │  │ • Server updates lead tier to 'pro'      │
│ user retries │  │ • DB records order & transaction ID      │
└──────────────┘  │ • Client global state unlocks features   │
                  │ • Confetti / Confirmation Receipt shown  │
                  │ • Instant return to unlocked dashboard   │
                  └──────────────────────────────────────────┘
```

#### Coupon Validation Engine:
The checkout engine supports dynamic promotional discounts:
- `EARLYBIRD20`: 20% discount on total.
- `LAUNCH50`: 50% discount on total.
- `EXECUTIVE100`: 100% discount ($0 charge, instant trial activation).

**Coupon Math Formula**:
$$\text{Discount Amount} = \text{Subtotal} \times \frac{\text{Percent}}{100}$$
$$\text{Total Due} = \max(0, \text{Subtotal} - \text{Discount Amount})$$
All calculations are rounded to 2 decimal places using `Math.round(val * 100) / 100`.

#### Test Credit Cards Supported:
- `4242 4242 4242 4242` (Visa) -> **Success**: Simulates approved authorization.
- `5555 5555 5555 4444` (Mastercard) -> **Success**: Simulates approved authorization.
- `3782 822463 10005` (Amex) -> **Success**: Simulates approved authorization.
- `4000 0000 0000 0002` -> **Decline Simulation**: Displays realistic card decline error: *"Your card was declined. Please check details or use test card 4242 4242 4242 4242."*

#### Checkout API Endpoint:
- **`POST /api/checkout`**:
  - **Payload**:
    ```json
    {
      "leadId": "lead_9f81a7b2",
      "plan": "pro",
      "billingCycle": "annual",
      "couponCode": "LAUNCH50",
      "paymentDetails": {
        "cardholderName": "Sarah Connor",
        "cardNumber": "4242424242424242",
        "expiry": "12/28",
        "cvc": "123",
        "postalCode": "94107"
      }
    }
    ```
  - **Response (Success)**:
    ```json
    {
      "success": true,
      "orderId": "ord_88291a0c",
      "tier": "pro",
      "amountCharged": 145.00,
      "billingCycle": "annual",
      "transactionDate": "2026-10-08T21:56:00.000Z",
      "message": "Payment processed successfully. Pro tier activated."
    }
    ```

---

## 3. Automated Test & Verification Suite Architecture (R5)

### 3.1 Test Framework Recommendation

#### Recommendation: **Vitest** (Vite + Vitest)
- **Execution Command**: `npm test`
- **Rationale**:
  1. **Native ESM & TypeScript**: Runs TypeScript test files directly without requiring complex `ts-jest` compilation transforms or Babel pipelines.
  2. **Exceptional Speed**: In-memory execution with multithreaded worker pools.
  3. **Standard Jest Compatibility**: Full support for `describe`, `it`, `expect`, `beforeEach`, and `vi.fn()`.
  4. **Single-Command Simplicity**: Running `npm test` executes all unit, boundary, route, and E2E scenario suites with exit code 0.
  5. **Built-in Node 22 Compatibility**: Runs smoothly alongside Node 22 native modules (`node:sqlite`).

*Note*: As an auxiliary zero-dependency option, the suite can also be structured so that core unit and boundary tests can run via Node 22 native `node --test` if an environment lacks external npm packages.

### 3.2 4-Tier Test Architecture Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│                   4-TIER AUTOMATED TEST MATRIX                         │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 1: FEATURE COVERAGE                                               │
│ • Runway Burn Core Math (cash, burn, income, net delta)                │
│ • IRS Safe Harbor Tax Formulas (100% vs 110% vs 90%)                   │
│ • Lead Validation Schema (Zod / RFC 5322 rules)                        │
│ • Coupon Discount Calculations (20%, 50%, 100%)                        │
│ • SQLite Repository CRUD (insert, find, update tier)                   │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 2: BOUNDARY & CORNER CASES                                        │
│ • Email Corner Cases (RFC valid vs invalid, 254-char limits)           │
│ • String Sanitization & XSS injection payloads                         │
│ • Extreme Financial Boundaries ($0 cash, negative burn, large numbers)│
│ • Coupon Case-insensitivity & expired codes                            │
│ • Card Expiry dates (past date rejected, future date accepted)         │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 3: COMBINATORIAL & INTEGRATION FLOWS                              │
│ • Lead Registration -> Checkout -> Tier Upgrade Flow                  │
│ • Feature Access Checks before and after upgrade                       │
│ • Duplicate Lead Registration (idempotent 200 vs 500 error)            │
│ • API Route Status Codes (400 on bad body, 404 on missing, 200/201)    │
│ • State Persistence in SQLite and local storage rehydration            │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 4: REAL-WORLD END-TO-END USER JOURNEYS                            │
│ • Journey 1: Cold Visitor -> Custom Scenario -> Lead Capture ->        │
│              Pro Checkout with Coupon -> Unlocked Full Report          │
│ • Journey 2: Declined Card Handling & Error Recovery                   │
│ • Journey 3: Browser Session Refresh & Tier Persistence               │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Detailed Tier Specifications & Test Cases

#### Tier 1: Feature Coverage (Core Business Logic)
- **`runway.test.ts`**:
  - Case 1.1: Cash = $60,000, Burn = $10,000/mo, Income = $0/mo -> Runway = exactly 6.0 months.
  - Case 1.2: Cash = $60,000, Burn = $10,000/mo, Income = $6,000/mo -> Net burn = $4,000/mo -> Runway = exactly 15.0 months.
  - Case 1.3: Cash = $60,000, Burn = $10,000/mo, Income = $12,000/mo -> Net surplus = +$2,000/mo -> Runway = `Infinity` (flag: `growing_surplus`).
  - Case 1.4: Net 30 payment lag correctly delays cash inflow by 1 month, impacting immediate month-1 cash trough.
- **`tax.test.ts`**:
  - Case 1.5: Prior year tax $40,000, AGI <= $150k -> Safe Harbor annual requirement = $40,000 (100%), quarterly set-aside = $10,000.
  - Case 1.6: Prior year tax $70,000, AGI > $150k -> Safe Harbor annual requirement = $77,000 (110%), quarterly set-aside = $19,250.
  - Case 1.7: Current year projected tax $50,000 -> 90% rule requirement = $45,000, quarterly set-aside = $11,250.
  - Case 1.8: Recommends optimal strategy (lowest legal safe harbor amount to maximize runway liquidity without incurring penalties).
- **`coupon.test.ts`**:
  - Case 1.9: Annual Pro ($290.00) with `EARLYBIRD20` -> Discount = $58.00, Total = $232.00.
  - Case 1.10: Monthly Pro ($29.00) with `LAUNCH50` -> Discount = $14.50, Total = $14.50.
  - Case 1.11: Annual Pro ($290.00) with `EXECUTIVE100` -> Discount = $290.00, Total = $0.00.
- **`storage.test.ts`**:
  - Case 1.12: Successfully inserts lead into SQLite and retrieves by ID.
  - Case 1.13: Updates lead tier from `free` to `pro` and verifies persisted value.

#### Tier 2: Boundary & Corner Cases
- **`validation_boundaries.test.ts`**:
  - Case 2.1: Valid RFC emails accepted: `name+tag@sub.example.com`, `user.name@domain.co.uk`, `cmo_1@consulting.ai`.
  - Case 2.2: Invalid emails rejected: `plainaddress`, `missing@domain`, `@nodomain.com`, `user@domain..com`, `spaces in@domain.com`.
  - Case 2.3: Name boundary: 1 character rejected ("A"), 2 characters accepted ("Al"), 70 characters accepted, 71 characters rejected.
  - Case 2.4: XSS payload sanitization: `<script>alert('hack')</script>` in name is sanitized/escaped, never executed.
  - Case 2.5: Unicode names: `Renée O'Connor`, `François Müller`, `Dr. Jane Doe-Smith` all pass cleanly.
- **`financial_boundaries.test.ts`**:
  - Case 2.6: Zero cash balance ($0) with $5,000 monthly burn -> 0.0 months runway, triggers immediate high-urgency warning.
  - Case 2.7: Floating point currency precision: $29.99 * 0.20 discount calculates to exact $6.00 discount, total $23.99, preventing $23.992000000000004 float artifact.
  - Case 2.8: Huge financial input: $50,000,000 cash handled without integer overflow.
- **`checkout_boundaries.test.ts`**:
  - Case 2.9: Coupon casing insensitivity: `launch50`, `LAUNCH50`, `LaUnCh50` all normalize and evaluate identically.
  - Case 2.10: Non-existent coupon code (`FAKECODE99`) returns structured error `{ valid: false, error: "Invalid coupon code" }`.
  - Case 2.11: Card expiry in the past (`01/22`) rejected with `"Card has expired"`.
  - Case 2.12: Card expiry in the future (`12/30`) accepted.

#### Tier 3: Combinatorial & Integration Flows
- **`api_integration.test.ts`**:
  - Case 3.1: Full Lead Creation API (`POST /api/leads`) with valid body returns 201 Created and JSON lead profile.
  - Case 3.2: Submitting existing email to `POST /api/leads` returns 200 OK with existing profile (idempotent, no 500 error).
  - Case 3.3: Checkout API (`POST /api/checkout`) updates user record in SQLite from `free` to `pro`, creates order record, and returns transaction receipt.
  - Case 3.4: Admin query API (`GET /api/admin/leads`) returns list containing newly created lead.
  - Case 3.5: Missing required fields in `POST /api/leads` returns HTTP 400 Bad Request with field-specific error details.
- **`feature_gating.test.ts`**:
  - Case 3.6: Lead with `tier = 'free'` fails check for `canExportPdf` (returns `false`).
  - Case 3.7: After checkout, `lead.tier` is updated to `'pro'`; check for `canExportPdf` returns `true`, `maxRunwayMonths` increases from 3 to 24.

#### Tier 4: Real-World Scenarios (End-to-End Simulation)
- **`e2e_scenarios.test.ts`**:
  - **Scenario 4.1: Happy Path Full Conversion**:
    1. Initialize visitor state with $40,000 cash, $7,000 burn, 2 retainers ($4,000 and $3,000).
    2. Verify initial runway = 40.0 months.
    3. User triggers onboarding -> calls `POST /api/leads` -> receives `leadId = "lead_test1"`.
    4. User attempts to toggle late payment stress test -> gated feature check fails -> checkout triggered.
    5. User applies coupon `LAUNCH50` -> discount applied ($290 -> $145).
    6. User submits valid test card `4242 4242 4242 4242` -> calls `POST /api/checkout`.
    7. Verifies HTTP 200 with order receipt.
    8. Verifies database record has `tier = 'pro'`.
    9. Verifies gated features now return `true` (unlocked).
  - **Scenario 4.2: Payment Decline & Error Recovery**:
    1. User enters checkout with card `4000 0000 0000 0002`.
    2. `POST /api/checkout` returns HTTP 402 with `"Payment declined by issuer"`.
    3. User record in database remains `free`.
    4. User replaces card number with `4242 4242 4242 4242` and resubmits.
    5. `POST /api/checkout` returns HTTP 200.
    6. User record in database successfully upgrades to `pro`.
  - **Scenario 4.3: Session Hydration & Persistence Verification**:
    1. Create upgraded lead record in SQLite database.
    2. Simulate browser session restart: query `GET /api/leads/:id`.
    3. Confirm loaded state has tier `'pro'`, preserves custom retainers, and unlocks all premium dashboard components.

---

## 4. Proposed File Organization & Architecture

```
niche_web_app/
├── package.json                   # "scripts": { "test": "vitest run", "dev": "vite" }
├── vite.config.ts                 # Vite + Vitest configuration
├── tsconfig.json
├── data/
│   └── app.db                    # SQLite file store (auto-created via DatabaseSync)
├── src/
│   ├── index.html                 # Main entrypoint
│   ├── main.tsx                   # App bootstrapper
│   ├── core/                      # Pure business logic (100% deterministic & testable)
│   │   ├── runwayEngine.ts        # Runway burn & cash flow calculation formulas
│   │   ├── taxEngine.ts           # Safe harbor & estimated tax calculations
│   │   ├── couponEngine.ts        # Promotional discount calculations
│   │   └── gatingEngine.ts        # Feature permissions & limits per tier
│   ├── validation/
│   │   └── schemas.ts             # Zod validation schemas (LeadCapture, Checkout)
│   ├── storage/
│   │   ├── db.ts                  # node:sqlite DatabaseSync initialization & migrations
│   │   └── repository.ts          # Storage CRUD (leads, orders, scenarios)
│   ├── server/
│   │   ├── router.ts              # API request router & endpoint handlers
│   │   └── handlers/
│   │       ├── leadHandler.ts     # POST /api/leads, GET /api/leads/:id
│   │       ├── checkoutHandler.ts # POST /api/checkout, coupon validation
│   │       └── adminHandler.ts    # GET /api/admin/leads
│   ├── components/
│   │   ├── RunwayDashboard.tsx    # Interactive cash runway chart & sliders
│   │   ├── TaxEstimator.tsx       # Safe harbor quarterly tax calculator
│   │   ├── OnboardingModal.tsx    # Lead capture modal with real-time feedback
│   │   ├── CheckoutModal.tsx      # Multi-step checkout modal with coupon & test cards
│   │   └── GatedFeatureGuard.tsx  # Wrapper displaying lock badge or upgrade prompt
│   └── state/
│       └── store.ts               # Global reactive app state (User, Plan, Scenario)
└── tests/                         # 4-Tier Automated Verification Suite
    ├── tier1-features/
    │   ├── runway.test.ts         # Math formulas
    │   ├── tax.test.ts            # Safe harbor rules
    │   ├── coupon.test.ts         # Discount rules
    │   └── storage.test.ts        # SQLite repository CRUD
    ├── tier2-boundaries/
    │   ├── validation_boundaries.test.ts  # RFC emails, name limits, XSS
    │   ├── financial_boundaries.test.ts   # Zero cash, precision, large numbers
    │   └── checkout_boundaries.test.ts    # Casing, expired codes, card expiry
    ├── tier3-combinations/
    │   ├── api_integration.test.ts        # Endpoints, duplicate emails, errors
    │   └── feature_gating.test.ts         # State transitions & access flags
    └── tier4-scenarios/
        ├── e2e_conversion.test.ts         # Visitor -> Lead -> Upgrade -> Export
        ├── e2e_decline_recovery.test.ts   # Card decline recovery
        └── e2e_persistence.test.ts        # Session rehydration
```

---

## 5. Summary & Actionable Directives for Downstream Agents

1. **For the Project Orchestrator (`orchestrator_1`)**:
   - Approve the R3, R4, R5 architecture.
   - Proceed with Phase 1 dispatch: create base project structure with Node 22 native `node:sqlite` storage and Vitest test framework.
2. **For Worker Agents (Implementation Track)**:
   - Implement `core/runwayEngine.ts` and `core/taxEngine.ts` as pure functions first to enable immediate Tier 1 test verification.
   - Implement `storage/repository.ts` with `node:sqlite` (`DatabaseSync`), ensuring `:memory:` support for test runs.
   - Build `components/OnboardingModal.tsx` and `components/CheckoutModal.tsx` matching the validation rules, coupon codes (`EARLYBIRD20`, `LAUNCH50`, `EXECUTIVE100`), and test card behaviors specified above.
3. **For Worker Agents (Testing Track)**:
   - Implement the test files under `tests/tier1-...`, `tests/tier2-...`, `tests/tier3-...`, and `tests/tier4-...`.
   - Ensure `npm test` runs all test tiers and achieves 100% test pass rate with exit code 0.

---
*End of Technical Survey Report*
