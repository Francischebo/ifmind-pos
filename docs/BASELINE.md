# cfi-POS Phase 0 Baseline Measurement Report

**Date of Measurement:** 2026-10-12  
**Git Branch:** `prod-hardening`  
**Node Version:** v22.14.0  
**Operating System:** Windows 10/11 (PowerShell)

---

## 1. Baseline Test & Check Results

| Check / Suite | Command | Result | Notes / Details |
|---|---|---|---|
| **Backend Typecheck** | `cd server && npx tsc -p tsconfig.json --noEmit` | **PASS (0 errors)** | Clean TypeScript compilation. |
| **Backend Unit Tests** | `cd server && npm test` | **PASS (65 passed / 0 failed)** | 65 tests in 7 test suites pass. |
| **Backend Integration Tests** | `cd server && npm run test:integration` | **FAIL (20 passed / 2 failed)** | 2 failures due to stale test runner configuration: (1) `run-integration.cjs` hardcodes migration count as 19 instead of 20; (2) `business-workflow.integration.test.ts` expects obsolete `CN-KRA-` prefix and public registration (now 403). |
| **Frontend Typecheck** | `npx tsc --noEmit -p tsconfig.app.json` | **PASS (0 errors)** | Clean TypeScript compilation. |
| **Frontend Lint** | `npx eslint .` | **FAIL (11 errors)** | 8 `no-explicit-any` errors, 3 `no-require-imports` errors in `PaymentController.test.ts` and `data-source.test.ts`. |
| **Frontend Production Build** | `$env:VITE_API_URL="/api"; npm run build` | **PASS (0 errors)** | Built in 33.97s. Produced production bundle in `dist/`. |
| **End-to-End Tests (Playwright)** | `npm run test:e2e` | **FAIL (13 passed / 2 failed)** | 13 passed, 2 timed out on selector waits (auth OTP submit button and locations heading visibility). |

---

## 2. Root Cause Analysis of Baseline Failures

1. **Integration Test Stale Migration Count (`run-integration.cjs`)**:
   - The runner script had `migration_count, 19`, but migration `20260330101500-AddOfflineSaleAudit.ts` brought the total to 20.
2. **Integration Test Stale Assertions (`business-workflow.integration.test.ts`)**:
   - eTIMS mock changed generated credit-note prefix to `TEST-CN-ETIMS-` to comply with test disclaimer requirements.
   - Public registration `POST /api/auth/register` is now disabled by default (returning 403) in favor of admin-provisioned users via `POST /api/users`.
3. **ESLint Errors (11 total)**:
   - `server/src/controllers/PaymentController.test.ts`:
     - Line 158: `any` in mock database manager
     - Line 361-365: `any` types on mock request/response parameters
     - Lines 1287, 1292, 1319: `require()` calls instead of standard ES6 imports
   - `server/src/data-source.test.ts`:
     - Lines 127, 154: `require()` calls for dynamic imports.
4. **E2E Flakiness**:
   - UI timing issues on headless Chromium where modal animation delays caused click timeouts.
