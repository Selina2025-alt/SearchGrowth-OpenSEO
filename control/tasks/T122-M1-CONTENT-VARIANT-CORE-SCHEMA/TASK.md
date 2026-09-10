# TASK T122-M1-CONTENT-VARIANT-CORE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the immutable, Project-scoped ContentVariant core contract for a
platform-native rendering of one ContentVersion. A variant is not a mechanical
copy or publishing instruction; it stores no execution, approval, account, or
public-success state.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §10,
`09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§7–8,
`21_TEST_ACCEPTANCE_PLAN.md` §§10 and 12, `29_SCOPE_LOCK.md`,
`30_TRACEABILITY_MATRIX.md`, `docs/adr/ADR-006-canonical-markdown.md`, the
legacy `schemas/domain-types.ts` and `schemas/migrations-reference.sql` variant
contracts, accepted T118–T121 patterns, and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `content_variants` storage with
   stable id, explicit non-null `project_id`, required
   `content_package_version_id`, required opaque platform and format strings,
   required title and body, required opaque platform-native `metadata_json`,
   required `body_hash`, required `renderer_version`, and creation timestamp
   only. `metadata_json` is renderer metadata (for the §7 platform-native
   presentation contract), not a relational ID container.
2. Database-enforce same-Project ownership with a Project-leading composite FK
   `(project_id, content_package_version_id)` to ContentVersion, reusing the
   accepted `content_package_versions_project_id_id_idx`. Add no business
   uniqueness rule: stable id is the only identity in this core slice.
3. Add matching Zod/domain representation for the direct fields. Preserve the
   immutable contract: no `updated_at`, no mutable version overwrite behavior,
   no JSON asset/reference IDs, no variant asset mapping, no release/approval,
   no publishing/execution/account state, and no CRUD/UI.
4. Use forward D1 `0067` / PostgreSQL `0045` migrations plus snapshots and
   journals. Add migration-backed tests for same-Project persistence,
   cross-Project and dangling-parent rejection, required fields, cascade
   deletion, exact storage shape, immutable timestamp-only shape, and dialect
   parity. Add focused domain validation tests for the direct contract.
5. Run local migration, clean final dual-dialect `db:generate`, focused tests,
   format, types, lint, full tests, build, and `ci:check`; every runnable gate
   must exit 0. If the executor sandbox denies an aggregate gate, record its
   exact denial once and stop without retry or bypass.

## OUT OF SCOPE

Platform account/connector choice, target routing, asset mapping, tag/category
normalization, renderer runtime, HTML conversion, release/approval/publishing,
credentials, UI, production/paid action, dependency, ADR, or scope change.

## APPROVED COMMANDS

Use the established safe schema-task command matrix only: frozen install,
task-file Prettier, local D1 migration, dual-dialect `db:generate`, focused
Vitest, format check, types check, lint, full test, build, `ci:check`, and
read-only Git inspection. Do not use `--dangerously-skip-permissions`, commit,
merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T122-M1-CONTENT-VARIANT-CORE-SCHEMA/DELIVERY.md` with
field reconciliation, relation and immutability decisions, migration IDs, exact
command exits, clean generation result, scope/security declaration, and final
Git status; then stop.
