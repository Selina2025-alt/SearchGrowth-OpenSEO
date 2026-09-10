# TASK T127-M1-RUNTIME-CONTROL-CORE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the credential-free RuntimeControl persistence and domain contract. This is a schema/validation slice only: it records control values but must not evaluate controls, pause work, claim jobs, start or stop side effects, publish, spend, contact external systems, or expose mutation/UI behavior.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §13, `10_DISTRIBUTION_ARCHITECTURE.md` §10, `21_TEST_ACCEPTANCE_PLAN.md` §14, `24_RISK_REGISTER.md`, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, legacy RuntimeControl reference artifacts, accepted JSON/domain patterns, and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `runtime_controls` storage and matching Zod/domain contract. Reconcile the source-defined direct fields: stable control key, boolean/number/string value, optional reason, required updater identity, and update timestamp.
2. Use validated JSON storage only where needed to preserve the source value union across dialects. Keep the core value semantically equivalent in D1 and PostgreSQL, reject malformed or unsupported values, and add focused persistence/domain tests for each allowed value type, nullability/default decisions, and key identity.
3. RuntimeControl is intentionally mutable configuration: do not add append-only semantics, audit-writing workflow, control evaluation, state transitions, CAS, kill-switch behavior, publication behavior, account/credential/connector models, CRUD, UI, or production actions. `updated_by` remains opaque because this slice must not invent an actor/account relation.
4. Use forward D1 `0072` / PostgreSQL `0050` migrations, matching snapshots/journals, parity, and migration-backed storage tests.
5. Run local migration, clean dual-dialect `db:generate`, focused/full tests, format/types/lint/build/ci:check. If the executor sandbox denies an aggregate gate, record it once without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only the established safe schema-task command matrix. Do not use `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T127-M1-RUNTIME-CONTROL-CORE-SCHEMA/DELIVERY.md` with field/value reconciliation, JSON and mutability decisions, migration IDs, exact gate exits, security/scope declaration, and final Git status.
