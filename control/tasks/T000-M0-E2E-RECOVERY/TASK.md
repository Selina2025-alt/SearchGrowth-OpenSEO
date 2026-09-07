# TASK T000-M0-E2E-RECOVERY

STATUS: READY
MILESTONE: M0 Freeze & Baseline
PARENT TASK: T000-M0
ROUND LIMIT: 3
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex

## GOAL

Complete the credential-less E2E fixture contract and the two missing M0 reports. Perform the full engineer loop yourself: inspect → modify → test → inspect failures → fix → retest → DELIVERY.

## READ ONLY WHAT IS DIRECTLY RELEVANT

- Root `CLAUDE.md`.
- `21_TEST_ACCEPTANCE_PLAN.md` and `29_SCOPE_LOCK.md`.
- `control/tasks/T000-M0/REVIEW.md` and `control/tasks/T000-M0/T000-M0-E2E-RECOVERY_PROPOSAL.md` if present in this worktree; otherwise the complete requirements below are authoritative.
- Relevant code/tests only: `playwright.config.ts`, `src/serverFunctions/config.ts`, `src/serverFunctions/keywords.ts`, `e2e/fixtures/keyword-research-fixtures.ts`, the three `e2e/*.spec.ts` files, `src/client/layout/AppShell*.tsx`, and DataForSEO call boundaries needed to prove safety.

## CURRENT STATE

This worktree carries the accumulated, uncommitted T000-M0 changes. Preserve them unless this task explicitly replaces the round-4 Playwright sentinel. Existing evidence already proves install, local migrations, format, types, lint, 1,165 unit tests, and build passed before the final E2E change.

Round 4 proved `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` fixes `AUTH_MODE=local_noauth`. It then failed because:

- `getSeoApiKeyStatus` checks only `env.DATAFORSEO_API_KEY`, so `MissingSeoSetupModal` blocks E2E interactions.
- `researchKeywords` uses fixtures, but `getSerpAnalysis` bypasses the keyword fixture path and reaches live DataForSEO code.
- The fake `DATAFORSEO_API_KEY` sentinel in `playwright.config.ts` is not acceptable safety evidence.

## IN SCOPE

1. Keep explicit E2E fixture mode operational with no real DataForSEO credential.
2. Make `getSeoApiKeyStatus` respect explicit fixture mode so the setup modal does not open during fixture E2E. Production behavior must remain unchanged when fixture flags are absent.
3. Make `getSerpAnalysis` respect the keyword fixture path and return deterministic local data matching its real response contract.
4. Inspect the three E2E suites for any other DataForSEO-backed server function actually exercised and fixture only those observed paths.
5. Replace the Playwright fake credential sentinel with `DATAFORSEO_API_KEY: ""` so an inherited operator credential cannot be forwarded. Keep `AUTH_MODE=local_noauth`, both fixture flags, and `CLOUDFLARE_INCLUDE_PROCESS_ENV=true`.
6. Add focused tests that prove fixture mode bypasses the production service boundary where practical. Do not add tests that merely duplicate implementation.
7. Run the required command matrix and fix failures within this task's scope.
8. Produce repository-root `IMPLEMENTATION_BASELINE.md` using its template and `control/tasks/T000-M0-E2E-RECOVERY/DELIVERY.md` using the delivery template. Reuse prior T000 evidence in summaries; do not rerun install or migrations.

## ZERO-EXTERNAL-CALL SAFETY INVARIANT

- Never read, request, print, or use a real `DATAFORSEO_API_KEY`.
- Do not create `.env*` or `.dev.vars*` files.
- Do not call DataForSEO or any other external paid/provider endpoint.
- `createAuthenticatedFetch` reads a non-empty key before calling `fetch`. With Playwright forcing the key to an empty string, a terminal E2E PASS is evidence that every exercised provider path stayed behind fixtures.
- Do not weaken provider authentication, billing, retry, or production safeguards.

## OUT OF SCOPE

Product scope, Accepted ADR meaning, business features, schema/migrations, dependencies/lockfile, production configuration, credentials, external publishing, paid calls, connector work, and further control-plane edits. The Product Owner already approved retaining the existing formatting-only `AGENTS.md` and `CLAUDE.md` diffs; make no further changes to them.

## REQUIRED COMMANDS

Use Corepack pnpm only. Capture sanitized output, exit code, and duration under `control/tasks/T000-M0-E2E-RECOVERY/evidence/round-1/`.

1. `node --version`
2. `corepack pnpm --version`
3. Focused Vitest/Playwright commands as needed during implementation.
4. `corepack pnpm format:check`
5. `corepack pnpm types:check`
6. `corepack pnpm lint`
7. `corepack pnpm test`
8. `corepack pnpm build`
9. `corepack pnpm test:e2e`
10. `corepack pnpm ci:check`

Run each independently. A failing command must not silently skip later independent checks. Do not rerun install or any migration.

## ACCEPTANCE CRITERIA

- [ ] Explicit E2E fixture mode works with `DATAFORSEO_API_KEY` forced empty.
- [ ] The DataForSEO setup modal does not open in fixture E2E.
- [ ] `getSerpAnalysis` and every exercised DataForSEO-backed E2E path return deterministic fixtures.
- [ ] No real DataForSEO or other external provider request occurs.
- [ ] All 11 Playwright tests reach a terminal PASS summary.
- [ ] Format, types, lint, unit tests, build, and `ci:check` PASS after final changes.
- [ ] No Playwright/Vite/workerd/esbuild process is intentionally left running.
- [ ] `IMPLEMENTATION_BASELINE.md` is complete, evidence-linked, and distinguishes Prompt Explorer cache from future fresh GEO sampling.
- [ ] `DELIVERY.md` lists every changed path, exact commands/results, safety proof, limitations, and deviations.
- [ ] Accumulated diff remains within T000-M0 plus this recovery scope; Accepted ADR/spec meaning is unchanged.

## DELIVERY RULES

Do not commit or merge. Do not edit any REVIEW.md. Stop after writing complete DELIVERY. Only Codex may review, PASS, or merge.

## HUMAN GATE

NONE for this local, credential-less recovery task. Stop if a credential, external request, production action, paid action, scope change, or Accepted ADR change appears necessary.
