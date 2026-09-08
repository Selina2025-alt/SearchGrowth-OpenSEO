# TASK T110-M1-SOURCE-REF-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add normalized, Project-scoped `SourceRef` persistence and domain validation. Schema/contract only: no claim verification, crawling, URL fetching, content, CRUD/UI, or external action.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §9 SourceRef, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, `schemas/domain-types.ts`, `schemas/migrations-reference.sql`, and accepted schema/migration/parity patterns.

## IN SCOPE

1. Add equivalent D1/PostgreSQL `source_refs` storage with id, explicit Project ownership, the V1.0 `type`, `ref`, and `captured_at` contract. Reconcile any legacy `SourceRef` type explicitly; add only directly required classification/provenance fields.
2. Database-enforce the Project FK; use Zod to validate the V1.0 SourceRef type union `URL | INTERNAL_DOC | PRODUCT_FACT | RESEARCH` and any direct classification union. Do not fetch, validate reachability, classify, or infer source content.
3. Add migration-backed valid persistence, enum rejection, dangling-Project rejection, delete behavior, append-only, and dialect-parity tests. Do not encode relationships in JSON or add business uniqueness without a direct contract.
4. Use D1 `0056` / PostgreSQL `0034`, local migration, clean dual-dialect `db:generate`, focused tests, format, types, lint, full tests, build, and `ci:check`.

## OUT OF SCOPE

Claims and verification workflow, crawler/network/provider calls, content/release, CRUD/UI, dependency changes, credentials, publishing, paid/production action, ADR/scope change.

## APPROVED COMMANDS

Use the T109 approved command matrix exactly and save evidence under `control/tasks/T110-M1-SOURCE-REF-SCHEMA/evidence/round-1/`. Do not use unlisted commands, `--dangerously-skip-permissions`, commit, merge, or touch `main`.

## DELIVERY

Write `control/tasks/T110-M1-SOURCE-REF-SCHEMA/DELIVERY.md` with reconciliation, constraints, migration IDs, exact gate exits, scope/security declaration, and Git status; then stop.
