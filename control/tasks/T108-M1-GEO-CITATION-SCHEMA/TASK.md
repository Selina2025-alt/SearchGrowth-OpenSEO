# TASK T108-M1-GEO-CITATION-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, Project-scoped `GeoCitation` persistence and contract foundation. Schema only: no parser, URL normalization implementation, ownership classification logic, matching, provider, CRUD, UI, or external action.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` GeoCitation, `20_DATABASE_SCHEMA_GUIDE.md`, `21_TEST_ACCEPTANCE_PLAN.md`, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, ADR-005, `schemas/domain-types.ts`, `schemas/migrations-reference.sql`, and T105–T107 schema/migration/test patterns.

## IN SCOPE

1. Add equivalent D1/Postgres `geo_citations` storage for direct/reconciled citation facts: stable id, explicit project key, concrete run and/or parse relation only where supported, raw/normalized URL, domain, title, position, source ownership, optional publication receipt relation, and append-only timestamp.
2. Use composite Project FKs so every citation parent and optional receipt, when present, belongs to the same Project. Reuse T107's explicit Project ownership pattern; add only composite-target support indexes, never business uniqueness.
3. Add Zod validation for the direct source-ownership enum exactly: `OWNED_DOMAIN | CONTROLLED_PUBLICATION | EARNED_THIRD_PARTY | COMPETITOR | UNKNOWN`; reject unsupported/case-mismatched/empty values. Do not classify, normalize, or match URLs.
4. Keep rows append-only with no `updated_at`, current pointer, parser runtime, or JSON relationship payload. Define migration-backed delete behavior and Parse-version isolation.
5. Add migration-backed valid/same-Project/cross-Project/mismatched-project/optional-parent/delete/enum/append-only tests and parity. Use next migrations D1 `0054`, Postgres `0032`, local migration, clean final dual-dialect `db:generate`, focused tests, format, types, lint, full tests, build, and `ci:check`.

## OUT OF SCOPE

Parser/extraction, URL normalization, attribution, receipt matching, provider/network calls, runtime/workflow, CRUD/UI, dependency changes, credentials, publishing, paid or production action, ADR/scope change.

## APPROVED COMMANDS

Use the existing T107 approved command matrix exactly, saving concise evidence in `control/tasks/T108-M1-GEO-CITATION-SCHEMA/evidence/round-1/`. Do not use unlisted commands, `--dangerously-skip-permissions`, commit, merge, or touch `main`.

## DELIVERY

Write `control/tasks/T108-M1-GEO-CITATION-SCHEMA/DELIVERY.md` with field reconciliation, ownership FKs, migration IDs, test/gate exits, scope/security declaration, and final Git status; then stop.
