# TASK — T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add only the credential-free, Project-scoped `PublicationReceipt` persistence and Zod/domain contract. This is an evidence-record storage slice; it must not submit/finalize/publish, invoke public verification, execute a route, spend, contact an external system, or create credential/account/connector behavior.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §12; `10_DISTRIBUTION_ARCHITECTURE.md` §8; relevant `13_PUBLISH_FINALIZER_SPEC.md`, `18_WORKFLOW_STATE_MACHINES.md`, and `21_TEST_ACCEPTANCE_PLAN.md` public-success/receipt portions; `29_SCOPE_LOCK.md`; `30_TRACEABILITY_MATRIX.md`; accepted ReleaseTarget, PublishingJob, PublicationExecutionPlan, PlatformDraft and indexing-observation patterns; legacy `publication_receipts` / `PublicationReceipt` reference artifacts; and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL normalized `publication_receipts` storage and matching Zod/domain row contract. Reconcile only the source-defined receipt fields: stable id, explicit Project identity, PublishingJob and ReleaseTarget references, opaque platform and executor id/version, optional opaque external draft/task/content identifiers, optional public URL, content hash, media-hashes document, source-defined status, optional submission/publish/verification timestamps, verification document, and creation timestamp.
2. Enforce Project ownership and same-Project PublishingJob / ReleaseTarget integrity with explicit Project-leading database constraints. At the database level ensure the receipt's job belongs to the same ReleaseTarget as its receipt. Preserve the source-defined one-receipt-per-job identity. Add only the supporting unique referential parent target(s) needed through this forward migration; do not modify accepted historical migrations.
3. Validate source-defined status values and the two structured documents at database and Zod trust boundaries. The row may record an evidence snapshot, but must not implement state transitions, public URL reachability checks, verifier logic, status derivation, or an automatic success decision. It must not treat draft URLs, submitted states, remote task IDs, or raw stored URLs as `PUBLIC_VERIFIED`.
4. External identifiers and URLs are opaque recorded evidence only. Do not add publisher connections, credentials, certification, bridge, provider, browser, external API, paid behavior, UI, production behavior, or citation/attribution runtime.
5. Use forward D1 `0081` and PostgreSQL `0059` migrations with matching journals/snapshots. Add migration-backed tests for valid same-Project persistence, cross-Project and job-target mismatch rejection, dangling references, one-receipt-per-job rejection, enum/document rejection, chosen delete behavior, optional evidence timestamps/IDs, and exact storage shape; add focused domain contract tests.
6. Run clean dual-dialect `corepack pnpm run db:generate`, local migration, focused/full tests, format, types, lint, build, and `ci:check`, recording exact exits. If an aggregate gate is sandbox-denied, record it once and stop without bypass. Write DELIVERY and stop.

## OUT OF SCOPE

Publishing/finalizing/staging, public verification or URL reachability, status transition/CAS, route execution, job scheduling/retry/lease, connector/credential/account behavior, bridge, paid action, production action, receipt-to-citation attribution, UI, and Accepted ADR or product-scope changes.

## APPROVED COMMANDS

Use only: `corepack pnpm run db:generate`, `corepack pnpm run db:migrate:local`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, or invoke external/publishing/paid behavior.

## DELIVERY

Write `control/tasks/T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA/DELIVERY.md` with field/status reconciliation, Project/job-target integrity and delete decisions, public-success evidence boundary, migration IDs, exact gate exits, scope/security declaration, changed files, and final Git status; then stop.