# TASK — T135-M1-PUBLISHING-JOB-CORE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add only the credential-free, Project-scoped `PublishingJob` persistence and Zod/domain contract. This is a storage slice for a later orchestration workflow; it must not claim/lease work, execute a route, stage/finalize/publish, spend, contact an external system, or create credential/account/connector behavior.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §12; relevant `18_WORKFLOW_STATE_MACHINES.md` publishing-job portions; `10_DISTRIBUTION_ARCHITECTURE.md` §§2–7; `21_TEST_ACCEPTANCE_PLAN.md` route/isolation sections; `29_SCOPE_LOCK.md`; `30_TRACEABILITY_MATRIX.md`; accepted ReleaseTarget, PublicationExecutionPlan, PlatformDraft, RuntimeControl and AuditEvent patterns; legacy `publishing_jobs` / `PublishingJobStatus` reference artifacts; and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL normalized `publishing_jobs` storage and matching Zod/domain row contract. Reconcile only the source-defined job record fields: stable id, explicit Project identity, ReleaseTarget and PublicationExecutionPlan references, opaque executor id/version, source-defined status, attempts/max-attempts, idempotency key, optional lease holder/expiry, opaque external draft/task/content identifiers, optional public URL, optional safe error code/message, creation timestamp, and update timestamp.
2. Enforce Project ownership and same-Project target/plan ownership with explicit Project-leading database constraints. At the database level also ensure the chosen execution plan belongs to the same ReleaseTarget as the job, not merely the same Project. Add only the supporting unique referential parent target(s) needed through this forward migration; do not modify accepted historical migrations.
3. Preserve the source-defined idempotency identity and validate the source-defined status enum and safe numeric attempt boundaries at database and Zod trust boundaries. Storage of lease fields is allowed; do not implement claim, lease renewal, state transition/CAS, retry scheduling, concurrency, cancellation, kill-switch enforcement, or job execution behavior.
4. External identifiers and `public_url` are opaque recorded fields only. They must not be used to represent `PUBLIC_VERIFIED`, a publication receipt, a real remote action, or a production result. Do not add publisher connections, credentials, bridge, provider, browser, external API, paid behavior, or UI.
5. Use forward D1 `0080` and PostgreSQL `0058` migrations with matching journals/snapshots. Add migration-backed tests for valid complete same-Project persistence, cross-Project and plan-target mismatch rejection, dangling references, idempotency-key rejection, enum and attempt-bound rejection, chosen delete behavior, lease/external/error optionality, and exact storage shape; add focused domain contract tests.
6. Run clean dual-dialect `corepack pnpm run db:generate`, local migration, focused/full tests, format, types, lint, build, and `ci:check`, recording exact exits. If an aggregate gate is sandbox-denied, record it once and stop without bypass. Write DELIVERY and stop.

## OUT OF SCOPE

Claiming/leasing runtime, scheduler/retry/backoff, status transition/CAS, execution, route resolution, staging/finalizing/publishing, external systems, connector or credential/account behavior, bridge, approval/dry run behavior, receipt/public verification, paid action, production action, UI, and Accepted ADR or product-scope changes.

## APPROVED COMMANDS

Use only: `corepack pnpm run db:generate`, `corepack pnpm run db:migrate:local`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, or invoke external/publishing/paid behavior.

## DELIVERY

Write `control/tasks/T135-M1-PUBLISHING-JOB-CORE-SCHEMA/DELIVERY.md` with field/status reconciliation, Project/target-plan integrity and delete decisions, lease/external/public-success boundaries, migration IDs, exact gate exits, scope/security declaration, changed files, and final Git status; then stop.