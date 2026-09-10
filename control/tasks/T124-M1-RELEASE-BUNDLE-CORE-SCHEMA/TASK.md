# TASK T124-M1-RELEASE-BUNDLE-CORE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the immutable, Project-scoped ReleaseBundle core persistence contract. This is a schema/domain slice only; it must not approve, execute, publish, spend, or contact an external system.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §12, `10_DISTRIBUTION_ARCHITECTURE.md`, `21_TEST_ACCEPTANCE_PLAN.md` §§12–14, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, legacy ReleaseBundle reference artifacts, accepted ContentVersion patterns, and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `release_bundles` storage and matching Zod/domain contract. Reconcile the V1 contract from the listed sources: stable id, non-null project and ContentVersion ownership, immutable release version, lifecycle status, release strategy, bundle hash, opaque UTM policy and dry-run report fields where required by the contract, approval fields, and creation timestamp.
2. Enforce same-Project ContentVersion ownership with a Project-leading composite FK; add only a necessary supporting parent target if absent. Preserve immutability boundaries and use only source-defined enum/status values and uniqueness rules.
3. Use forward D1 `0069` / PostgreSQL `0047` migrations, snapshots/journals, migration-backed ownership/enum/identity/cascade tests, parity, and focused domain validation tests.
4. Do not implement state transitions/CAS, approval actions, execution, connector/account logic, publishing, paid action, UI, or production behavior.
5. Run migration, clean dual-dialect generation, focused/full tests, format/types/lint/build/ci:check. If sandbox denies an aggregate gate, record once without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only the established safe schema-task command matrix. Do not use `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T124-M1-RELEASE-BUNDLE-CORE-SCHEMA/DELIVERY.md` with field reconciliation, relation decisions, migration IDs, exact gate exits, security/scope declaration, and final Git status.