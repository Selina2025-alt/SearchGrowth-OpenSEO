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

## DELIVERY

Write `control/tasks/T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA/DELIVERY.md` with field/enum/JSON reconciliation, relation decisions, migration IDs, exact gate exits, security/scope declaration, and final Git status.
