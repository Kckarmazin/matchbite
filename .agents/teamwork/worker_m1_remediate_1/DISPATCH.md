## 2026-10-08T22:41:15Z

You are Worker M1 (Remediation) for the niche_web_app project.
Your working directory is: C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\worker_m1_remediate_1
Your parent is orchestrator_2 (Conversation ID: 20812a10-1e1e-4b2a-8eec-3122d65537ad).

MANDATORY INPUTS (Read these files first):
1. C:\Users\kck50\teamwork_projects\niche_web_app\ORIGINAL_REQUEST.md
2. C:\Users\kck50\teamwork_projects\niche_web_app\PROJECT.md
3. C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\challenger_m1_2\handoff.md (Challenger 2 vulnerability findings: public hostId leakage, unauthorized settings hijacking, impersonation via /join, host eviction via /leave)
4. C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m1_fix_1\fix_strategy.md (Security Architecture strategy)
5. C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m1_fix_2\fix_strategy.md (Backend Store & Route strategy)
6. C:\Users\kck50\teamwork_projects\niche_web_app\.agents\teamwork\explorer_m1_fix_3\fix_strategy.md (Frontend & Test Suite strategy)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

TASK OBJECTIVE:
Implement the security remediation across backend, frontend, and tests to resolve Broken Access Control:
1. Backend (`server/models/RoomStore.js` & `server/routes/rooms.js`):
   - Implement Dual-Token Capability Architecture (`hostKey` / `sessionToken`).
   - `createRoom`: generate unique `hostKey` and `sessionToken`. Return them ONLY to the creator.
   - `joinRoom`: generate unique `sessionToken` for joining participant. Return it ONLY to that participant. Authenticate re-joins.
   - `getPublicRoom`: sanitize public payload. Do NOT leak raw `hostId` or any secret tokens. Roster lists participants (`id`, `name`, `avatar`, `isHost: boolean`, `status`).
   - `updateSettings`: validate `hostKey` (via header `x-host-key` / `x-session-token` or body `hostKey`). Return 401/403 for unauthorized requests.
   - `leaveRoom`: authenticate that caller owns the `sessionToken` for the participant leaving. Ejecting other participants or the host without their token must be rejected with 401/403.
2. Frontend (`src/utils/session.js`, `src/utils/api.js`, `src/context/RoomContext.jsx`):
   - Update `session.js` to store room session tokens in localStorage (with memory fallback).
   - Update `api.js` to automatically attach tokens via headers (`x-session-token`, `x-host-key`) and body.
   - Ensure zero-friction experience: users never type passwords; tokens are seamlessly managed.
3. Tests (`tests/tier1-features/r1-rooms.test.js`):
   - Update any existing tests to use valid tokens.
   - Add comprehensive adversarial test cases explicitly verifying:
     * Non-hosts cannot update settings even if they know the public host participant ID (401/403).
     * Non-hosts cannot hijack or rename the host via `/join` (401/403/409).
     * Non-hosts cannot evict the host via `/leave` (401/403).
     * Genuine host with valid `hostKey` updates settings successfully (200).
     * `getPublicRoom` output never contains secret capability tokens.
4. Verification:
   - Run `npm test` and `npm run build` using `run_command` in `C:\Users\kck50\teamwork_projects\niche_web_app`.
   - Ensure 100% of all tests pass and build succeeds.

WRITE OWNERSHIP:
You exclusively own:
- `server/models/RoomStore.js`, `server/routes/rooms.js`
- `src/utils/session.js`, `src/utils/api.js`, `src/context/RoomContext.jsx`
- `tests/tier1-features/r1-rooms.test.js`
