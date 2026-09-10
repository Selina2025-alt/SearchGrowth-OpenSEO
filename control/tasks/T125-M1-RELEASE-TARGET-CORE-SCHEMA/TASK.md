# TASK T125-M1-RELEASE-TARGET-CORE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the credential-free, immutable, Project-scoped ReleaseTarget core persistence contract. This is a schema/domain slice only. It must not approve, execute, publish, spend, contact an external system, or create credential/account behavior.

## READ ONLY

Read `CLAUDE.md`, the ReleaseTarget portions of `05_DOMAIN_DATA_MODEL.md` and `10_DISTRIBUTION_ARCHITECTURE.md`, `21_TEST_ACCEPTANCE_PLAN.md` §§12–14, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, accepted ReleaseBundle / ContentVariant patterns, legacy ReleaseTarget reference artifacts, and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `release_targets` storage and matching Zod/domain contract. Reconcile the V1 core contract from the listed sources: stable id, non-null Project ownership, non-null ReleaseBundle and ContentVariant ownership, platform, source-defined target intent, required flag, optional schedule, optional target dependency, optional UTM URL, target hash, and creation timestamp.
2. Enforce same-Project ReleaseBundle and ContentVariant ownership with Project-leading composite FKs. Add only necessary supporting parent targets. If the source-defined optional dependency is persisted, enforce it as a same-Project self-reference with a safe delete behavior; do not leave an unconstrained relational id.
3. Do not persist an unconstrained `publisher_connection_id` and do not create a publisher connection, credential, account, connector, or external integration model. That relation belongs to a later gated credential-bound task.
4. Preserve ReleaseTarget's immutable core boundary. Use only source-defined enum values and uniqueness rules; do not add business uniqueness rules, lifecycle transitions, execution, approval actions, publishing, paid behavior, UI, or production behavior.
5. Use forward D1 `0070` / PostgreSQL `0048` migrations, snapshots/journals, migration-backed ownership/enum/identity/dependency/cascade tests as applicable, parity, and focused domain validation tests.
6. Run local migration, clean dual-dialect `db:generate`, focused/full tests, format/types/lint/build/ci:check. If the executor sandbox denies an aggregate gate, record it once without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only the established safe schema-task command matrix. Do not use `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T125-M1-RELEASE-TARGET-CORE-SCHEMA/DELIVERY.md` with field reconciliation (including the deferred publisher connection relation), relation/delete decisions, migration IDs, exact gate exits, security/scope declaration, and final Git status.
