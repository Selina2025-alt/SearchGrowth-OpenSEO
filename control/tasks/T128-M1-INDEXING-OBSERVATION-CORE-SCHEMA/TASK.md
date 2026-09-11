# TASK T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the credential-free, Project-scoped IndexingObservation core persistence and domain contract. This is a schema/validation slice only: it must not crawl URLs, query search engines, resolve URL identity, create publication receipts, perform publishing, use credentials, spend, or perform production behavior.

## READ ONLY

Read `CLAUDE.md`, `20_DATABASE_SCHEMA_GUIDE.md` §§1/5/6, `21_TEST_ACCEPTANCE_PLAN.md` §§27–29, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, legacy IndexingObservation reference artifacts, accepted SearchMarketProfile/observation patterns, and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `indexing_observations` storage and matching Zod/domain contract. Reconcile the source-defined direct fields: stable id, explicit Project ownership, URL, search engine, optional MarketProfile, observation type, status, details JSON, and observed timestamp.
2. Enforce same-Project MarketProfile ownership with a Project-leading composite FK when the optional profile is present. Keep URL as an opaque observation value in this slice; URL normalization/identity, crawl execution, and publication-receipt linkage are separately scoped later work. Do not persist an unconstrained `publication_receipt_id` before that credential-bound receipt domain exists.
3. Validate the JSON document at the database boundary, use only source-defined enum/status values where an authoritative source defines them, and add no business uniqueness rule, URL deduplication rule, lifecycle transition, ranking/measurement runtime, crawler, external call, CRUD, UI, or production action.
4. Use forward D1 `0073` / PostgreSQL `0051` migrations, matching snapshots/journals, parity, and migration-backed storage plus focused domain tests for ownership, required/optional fields, enum/status/JSON decisions, and persistence.
5. Run local migration, clean dual-dialect `db:generate`, focused/full tests, format/types/lint/build/ci:check. If the executor sandbox denies an aggregate gate, record it once without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only the established safe schema-task command matrix. Do not use `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## ROUND 1 CONTINUATION

Round 1 has preserved partial implementation in the existing task worktree after an executor max-turns interruption. Inspect the current diff and complete only missing validation, formatting, gates, and DELIVERY; do not restart implementation or discard any worktree change.

Use the task-scoped allowlist's exact command forms only: `corepack pnpm run db:generate`, `corepack pnpm run db:migrate:local`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, and `corepack pnpm ci:check`. Do not retry denied shorthand or equivalent commands.

## DELIVERY

Write `control/tasks/T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA/DELIVERY.md` with field/enum/JSON reconciliation, relation decisions, migration IDs, exact gate exits, security/scope declaration, and final Git status.

## ROUND 2 — FULL-TEST GATE RECOVERY

Round 1 implementation, migrations, snapshots, focused tests, and all aggregate quality gates are preserved and frozen. The only unresolved acceptance item is a final successful `corepack pnpm test`; prior aggregate attempts failed with unrelated parallel-load timeouts despite the affected files passing in isolation.

First run the exact approved command `corepack pnpm test` in the current worktree. If it exits 0, preserve the implementation and update `DELIVERY.md` with the final evidence. If it fails, inspect only the failure tail. Do not modify unrelated server, auth, or MCP tests/code to make this task pass. Change product code only if the failure is demonstrably caused by T128; then keep that change within this indexing-observation slice and rerun focused tests and the complete suite. Do not redo completed migration work, alter schema scope, create a new migration, or use alternative denied command forms. Write a new DELIVERY.md and stop.
