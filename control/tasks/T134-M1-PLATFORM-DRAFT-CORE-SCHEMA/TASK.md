# TASK — T134-M1-PLATFORM-DRAFT-CORE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add only the credential-free, Project-scoped `PlatformDraft` persistence and Zod/domain contract for recording an externally staged draft associated with one ReleaseTarget. This is a schema/domain slice; it must not stage, verify, finalize, publish, spend, contact an external system, or create credential/account/connector behavior.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §12; `10_DISTRIBUTION_ARCHITECTURE.md` §§2–6; `21_TEST_ACCEPTANCE_PLAN.md` route/draft acceptance sections; `29_SCOPE_LOCK.md`; `30_TRACEABILITY_MATRIX.md`; accepted ReleaseTarget and PublicationExecutionPlan patterns; legacy `platform_drafts` reference artifacts; and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL normalized `platform_drafts` storage and matching Zod/domain row contract. Reconcile only the source-defined draft-record fields: stable id, explicit Project identity, ReleaseTarget reference, platform, opaque external account identity, opaque platform draft identity, optional draft URL, content hash, asset-hashes document, opaque stager id/version, optional draft-verification timestamp, and creation timestamp.
2. Enforce Project ownership and same-Project ReleaseTarget integrity with explicit Project-leading database constraints. Preserve the source-defined platform/account/draft identity rule if it is required by the reference contract. Add only necessary supporting parent targets and choose a referential delete behavior covered by migration-backed tests.
3. Preserve the draft evidence boundary: this row can record a staged draft and optional draft verification only. It must not assert `PUBLIC_VERIFIED`, represent a final publish, trigger an action, select/reconcile a route, add lifecycle/retry/job behavior, or mutate credentials/accounts.
4. `account_id`, `stager_id`, and `stager_version` are opaque stored identities only. Do not add publisher connections, credentials, certification, bridge, provider, browser, external API, or account-management implementation.
5. Use forward D1 `0079` and PostgreSQL `0057` migrations with matching journals/snapshots. Add migration-backed tests for same-Project persistence, cross-Project and dangling-target rejection, source-defined draft identity uniqueness, chosen delete behavior, optional fields, and exact storage shape; add focused domain contract tests.
6. Run clean dual-dialect `corepack pnpm run db:generate`, local migration, focused/full tests, format, types, lint, build, and `ci:check`, recording exact exits. If an aggregate gate is sandbox-denied, record it once and stop without bypass. Write DELIVERY and stop.

## OUT OF SCOPE

Publisher connections/certifications, credential or account-management behavior, draft staging/finalizing/verifying runtime, external APIs/browser automation, same-draft finalization, publishing jobs, receipts, `PUBLIC_VERIFIED`, one approval, dry-run execution, paid media, UI, production action, and Accepted ADR or product-scope changes.

## APPROVED COMMANDS

Use only: `corepack pnpm run db:generate`, `corepack pnpm run db:migrate:local`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, or invoke external/publishing/paid behavior.

## DELIVERY

Write `control/tasks/T134-M1-PLATFORM-DRAFT-CORE-SCHEMA/DELIVERY.md` with field reconciliation, draft/public-success boundary, Project and identity/delete decisions, migration IDs, exact gate exits, scope/security declaration, changed files, and final Git status; then stop.