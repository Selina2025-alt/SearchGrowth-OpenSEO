# TASK — T128-BASELINE-FULL-TEST-STABILITY

## GOAL

Restore a reliable `corepack pnpm test` exit 0 for the existing integration baseline so frozen T128 can complete its required acceptance evidence. This is test-maintenance only; it is not a T128 implementation round and must not change the IndexingObservation schema, migrations, domain contracts, or business behavior.

## EVIDENCE

Controller verification on 2026-09-11 in the preserved T128 worktree exited 1 after 197.15 seconds: 181 files passed, 6 failed, 1,716 tests passed, 5 timed out. Failures were timeout-only in:

- `src/server/auth/workspace-merge.test.ts`
- `src/server/features/rank-tracking/repositories/RankTrackingRepository.query.test.ts`
- `src/db/schema-parity.test.ts` (`no direct db.batch` filesystem scan)
- `src/server/mcp/oauth-provider.test.ts`
- `src/server/mcp/oauth-refresh.e2e.test.ts`
- `src/server/features/keywords/services/research/saved-keywords.test.ts`

The set varies between full-suite runs. T128's focused tests pass.

## IN SCOPE

1. Diagnose the full-suite-only timeout source in the listed baseline test/harness paths.
2. Apply the smallest test-only or test-runner configuration correction that retains each test's assertions and production behavior.
3. Do not change T128 files, schemas, migrations, domain contracts, server business logic, production runtime behavior, credentials, external calls, publishing, or paid functionality.
4. Run the directly affected tests, then `corepack pnpm test`. Record exact exits and write DELIVERY.
5. If aggregate quality commands are allowed and complete, record their exits; do not retry sandbox-denied equivalents.

## ACCEPTANCE CRITERIA

- A final `corepack pnpm test` exits 0 in this task worktree.
- The listed tests retain their existing behavioral assertions; any timeout/configuration change must be evidence-based and no broader than needed.
- Diff is confined to test files and test-runner configuration required for the timeout repair.
- No T128 product files change.
- Focused affected tests and the full suite pass; DELIVERY includes changed files, diagnosis, exact commands/exits, scope/security declaration, and final status.

## READ ONLY

Read `CLAUDE.md`, this TASK, the listed failures, the repository's Vitest configuration, and only directly related test/harness files.

## APPROVED COMMANDS

Use only: `corepack pnpm exec vitest run <files>`, `corepack pnpm test`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm build`, `corepack pnpm ci:check`, `corepack pnpm exec prettier --write <task-files>`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, production access, external accounts, or paid actions.

## DELIVERY

Write `control/tasks/T128-BASELINE-FULL-TEST-STABILITY/DELIVERY.md` and stop.