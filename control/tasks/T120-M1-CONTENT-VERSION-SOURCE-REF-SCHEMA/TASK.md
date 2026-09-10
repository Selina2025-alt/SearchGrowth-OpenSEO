# TASK T120-M1-CONTENT-VERSION-SOURCE-REF-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, Project-scoped ContentVersion-to-SourceRef reference
contract. This replaces the V1.0 conceptual `source_refs[]` with explicit
relational rows; it does not assess, verify, publish, or otherwise act on a
source.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §§9–10,
`09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§2–4 and §10,
`21_TEST_ACCEPTANCE_PLAN.md` §10, `29_SCOPE_LOCK.md`,
`30_TRACEABILITY_MATRIX.md`, accepted T110/T118/T119 relation patterns, and
the direct schema, migration, and test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL normalized
   `content_package_version_source_refs` storage with stable id, explicit
   non-null `project_id`, required `content_package_version_id`, required
   `source_ref_id`, and creation timestamp only.
2. Database-enforce same-Project ownership with Project-leading composite FKs
   to ContentVersion and SourceRef. Reuse the accepted composite target indexes
   on both parents. Enforce one edge per
   `(content_package_version_id, source_ref_id)` and add no other business
   uniqueness.
3. Preserve immutable reference shape: no JSON id array, mutable evidence
   payload, source validation/revalidation, Claim gate behavior, release or
   publishing behavior, or CRUD/UI.
4. Use forward D1 `0065` / PostgreSQL `0043` migrations plus snapshots and
   journals. Add migration-backed tests for same-Project persistence, both
   cross-Project directions, dangling parents, duplicate edge rejection,
   required fields, delete cascades, normalized shape, and dialect parity.
5. Run local migration, clean final dual-dialect `db:generate`, focused tests,
   format, types, lint, full tests, build, and `ci:check`; every runnable gate
   must exit 0. If the executor sandbox denies an aggregate gate, record its
   exact denial once and stop without retry or bypass.

## OUT OF SCOPE

ContentVersion/SourceRef CRUD, source verification or scoring, Claim behavior,
MediaAsset mappings, ContentVariant, release/approval/publishing,
provider/credentials, UI, production/paid action, dependency, ADR, or scope
change.

## APPROVED COMMANDS

Use the established safe schema-task command matrix only: frozen install,
task-file Prettier, local D1 migration, dual-dialect `db:generate`, focused
Vitest, format check, types check, lint, full test, build, `ci:check`, and
read-only Git inspection. Do not use `--dangerously-skip-permissions`, commit,
merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T120-M1-CONTENT-VERSION-SOURCE-REF-SCHEMA/DELIVERY.md`
with relation decisions, migration IDs, exact command exits, clean generation
result, scope/security declaration, and final Git status; then stop.
