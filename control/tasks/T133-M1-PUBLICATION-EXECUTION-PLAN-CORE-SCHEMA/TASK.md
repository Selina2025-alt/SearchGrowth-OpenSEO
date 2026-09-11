# TASK — T133-M1-PUBLICATION-EXECUTION-PLAN-CORE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add only the credential-free, immutable `PublicationExecutionPlan` persistence and Zod/domain contract that resolves one accepted `ReleaseTarget` into its fixed route plan. This is a schema/domain slice. It must not approve, execute, publish, spend, contact an external system, or create a credential/account/connector behavior.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §12; `10_DISTRIBUTION_ARCHITECTURE.md` §§2–7; the Release Safety portions of `21_TEST_ACCEPTANCE_PLAN.md`; `29_SCOPE_LOCK.md`; `30_TRACEABILITY_MATRIX.md`; accepted ReleaseBundle and ReleaseTarget patterns; legacy `publication_execution_plans` reference artifacts; and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL normalized `publication_execution_plans` storage and matching Zod/domain row contract. Reconcile only the source-defined fixed plan fields: stable id, explicit Project identity, one ReleaseTarget reference, route, optional draft-stager/finalizer/finalizer strategy, executor version, required fields document, constraints snapshot document, verification policy document, optional fallback route, plan hash, and creation timestamp.
2. Enforce the plan's Project ownership and same-Project ReleaseTarget relationship with explicit Project-leading database constraints. One ReleaseTarget may have at most one execution plan; its plan must not dangle. Use a reasonable referential delete behavior and cover it with migration-backed tests. Add only necessary supporting parent targets.
3. Preserve the immutable plan boundary: one plan row is the fixed resolved route/strategy/policy snapshot for its ReleaseTarget. Validate structured documents and source-defined enum values at trust boundaries. Do not add execution lifecycle, approval, retries, claimed jobs, runtime route selection, or mutable plan editing behavior.
4. Do not add or persist credentials, account identifiers, publisher connections, certification state, draft IDs, job/receipt/public-success state, provider calls, bridge behavior, external publishing, paid behavior, UI, or production behavior. Do not resolve the plan at runtime.
5. Use forward D1 `0078` and PostgreSQL `0056` migrations with matching journals/snapshots. Add migration-backed tests for same-Project persistence, cross-Project rejection, one-plan-per-target rejection, dangling-reference rejection, chosen delete behavior, fixed field/constraint shape, and source-defined route validation. Add focused domain validation tests.
6. Run clean dual-dialect `corepack pnpm run db:generate`, local migration, focused/full tests, format, types, lint, build, and `ci:check`, recording exact exits. If an aggregate gate is sandbox-denied, record it once and stop without bypass. Write DELIVERY and stop.

## OUT OF SCOPE

Publisher connections/certifications, account or credential storage, plan resolution runtime, publishing jobs, platform drafts, receipts, one-approval workflow, dry-run implementation, kill-switch enactment, retry/concurrency behavior, paid media, external APIs, UI, production action, and Accepted ADR or product-scope changes.

## APPROVED COMMANDS

Use only: `corepack pnpm run db:generate`, `corepack pnpm run db:migrate:local`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, or invoke external/publishing/paid behavior.

## DELIVERY

Write `control/tasks/T133-M1-PUBLICATION-EXECUTION-PLAN-CORE-SCHEMA/DELIVERY.md` with field and enum/document reconciliation, immutability and relation/delete decisions, migration IDs, exact gate exits, scope/security declaration, changed files, and final Git status; then stop.