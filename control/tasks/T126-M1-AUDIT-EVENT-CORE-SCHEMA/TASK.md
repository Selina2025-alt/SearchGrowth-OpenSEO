# TASK T126-M1-AUDIT-EVENT-CORE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the credential-free, Project-scoped, append-only AuditEvent persistence and domain contract. This is a schema/validation slice only: it records no external action and must not implement runtime-control mutation, release execution, publishing, spend, credentials, accounts, or UI.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §13, `20_DATABASE_SCHEMA_GUIDE.md` §§1/3/6, `21_TEST_ACCEPTANCE_PLAN.md` §§13–14, `24_RISK_REGISTER.md` R42, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, legacy AuditEvent reference artifacts, accepted Project-scoped immutable-table patterns, and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `search_growth_audit_events` storage and matching Zod/domain contract. Reconcile the source-defined direct fields: stable id, explicit Project ownership, actor id, action, object type/id, optional before/after references, metadata, correlation id, and creation timestamp.
2. Preserve the append-only contract at the database boundary: migration-backed tests must prove valid persistence, Project ownership, required/optional fields, metadata validation, and that direct update/delete of an event is rejected. Add only minimal dialect-equivalent mechanisms necessary to enforce this invariant.
3. Treat actor, object, correlation, and before/after values as opaque audit data in this core slice; do not invent foreign keys, event taxonomies, business uniqueness, runtime-control state, execution/publishing/paid behavior, credential/account/connector models, CRUD, UI, or production behavior.
4. Use forward D1 `0071` / PostgreSQL `0049` migrations, matching snapshots/journals, parity, focused domain tests, and migration-backed storage tests.
5. Run local migration, clean dual-dialect `db:generate`, focused/full tests, format/types/lint/build/ci:check. If the executor sandbox denies an aggregate gate, record it once without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only the established safe schema-task command matrix. Do not use `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T126-M1-AUDIT-EVENT-CORE-SCHEMA/DELIVERY.md` with field/metadata reconciliation, append-only enforcement decision, migration IDs, exact gate exits, security/scope declaration, and final Git status.
