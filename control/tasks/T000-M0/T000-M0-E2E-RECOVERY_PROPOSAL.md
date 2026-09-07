# T000-M0-E2E-RECOVERY Proposal

STATUS: PENDING PRODUCT OWNER AUTHORIZATION
PARENT ACCEPTANCE TASK: T000-M0
MAX EXECUTOR ROUNDS: 3

## Problem proven by round 4

The Cloudflare Worker now receives `AUTH_MODE=local_noauth`, but the credential-less E2E contract is incomplete:

1. `getSeoApiKeyStatus` in `src/serverFunctions/config.ts` checks only `env.DATAFORSEO_API_KEY`, so the app opens `MissingSeoSetupModal`. Its full-screen overlay intercepts Playwright clicks.
2. `researchKeywords` uses fixtures, but `getSerpAnalysis` in `src/serverFunctions/keywords.ts` bypasses fixture mode and calls `KeywordResearchService.getSerpAnalysis`, which reaches `src/server/lib/dataforseo/core.ts`.
3. The proposed sentinel `DATAFORSEO_API_KEY` in `playwright.config.ts` is insufficient and would weaken the proof that fixture E2E makes zero external DataForSEO requests.

## Proposed bounded implementation

1. Keep `CLOUDFLARE_INCLUDE_PROCESS_ENV=true`, `AUTH_MODE=local_noauth`, and the two existing E2E fixture flags.
2. Remove the fake `DATAFORSEO_API_KEY` sentinel from Playwright configuration. No real or fake provider credential will be supplied.
3. In `getSeoApiKeyStatus`, treat explicit E2E fixture mode as locally configured so the setup modal does not obstruct fixture tests. Production behavior remains unchanged when fixture flags are absent.
4. Extend the keyword fixture boundary to `getSerpAnalysis` with deterministic local fixture data matching its existing response contract. Audit the three E2E suites for any other DataForSEO-backed server function they invoke and fixture only those observed paths.
5. Preserve fail-closed proof: because `createAuthenticatedFetch` reads `DATAFORSEO_API_KEY` before `fetch`, a full E2E PASS with that binding absent proves no tested path reached a real DataForSEO request.
6. Add only meaningful tests for the shared fixture-mode decision or newly added fixture response. Do not change production service behavior, paid-provider safeguards, or acceptance criteria.
7. Run targeted checks, all 11 E2E tests, `ci:check`, and any broader check invalidated by the final diff. Capture terminal exit codes and verify no child process remains.
8. Finish `IMPLEMENTATION_BASELINE.md` and `DELIVERY.md`, reusing already-green evidence from T000-M0.

## Acceptance conditions

- No DataForSEO credential or sentinel is present in E2E configuration or logs.
- `MissingSeoSetupModal` does not open in explicit fixture mode.
- `getSerpAnalysis` and every DataForSEO-backed path exercised by these E2Es resolve from deterministic fixtures.
- All 11 Playwright tests PASS with a terminal summary.
- `ci:check` PASS.
- No Playwright/Vite/workerd/esbuild orphan remains.
- Required baseline and delivery reports exist and account for the accumulated diff.
- No product scope, Accepted ADR meaning, dependency, lockfile, migration, external call, production action, or paid action changes.

## Controller disposition

This proposal is a new bounded recovery task rather than an unauthorized fifth T000-M0 executor round. It will not be dispatched until the Product Owner approves it.
