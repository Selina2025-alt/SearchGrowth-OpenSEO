# TASK T121-M1-CONTENT-VERSION-MEDIA-ASSET-REF-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, Project-scoped ContentVersion-to-MediaAsset reference
contract. This replaces the V1.0 conceptual `asset_ids[]` with explicit
relational rows; it does not upload, publish, transform, or otherwise act on an
asset.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §§10–11,
`09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§2–4 and §10,
`21_TEST_ACCEPTANCE_PLAN.md` §10, `29_SCOPE_LOCK.md`,
`30_TRACEABILITY_MATRIX.md`, accepted T114/T115/T118/T119/T120 relation
patterns, and the direct schema, migration, and test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL normalized
   `content_package_version_media_assets` storage with stable id, explicit
   non-null `project_id`, required `content_package_version_id`, required
   `media_asset_id`, and creation timestamp only.
2. Database-enforce same-Project ownership with Project-leading composite FKs
   to ContentVersion and MediaAsset. Reuse the accepted composite target indexes
   on both parents. Enforce one edge per
   `(content_package_version_id, media_asset_id)` and add no other business
   uniqueness.
3. Preserve immutable reference shape: no JSON id array, asset upload, storage
   mutation, transformation, rights evaluation, publishing behavior, or CRUD/UI.
4. Use forward D1 `0066` / PostgreSQL `0044` migrations plus snapshots and
   journals. Add migration-backed tests for same-Project persistence, both
   cross-Project directions, dangling parents, duplicate edge rejection,
   required fields, delete cascades, normalized shape, and dialect parity.
5. Run local migration, clean final dual-dialect `db:generate`, focused tests,
   format, types, lint, full tests, build, and `ci:check`; every runnable gate
   must exit 0. If the executor sandbox denies an aggregate gate, record its
   exact denial once and stop without retry or bypass.

## OUT OF SCOPE

ContentVersion/MediaAsset CRUD, R2 or other storage, upload/download,
transformation, rights evaluation, PublishedMediaRef behavior, release/approval/
publishing, provider/credentials, UI, production/paid action, dependency, ADR,
or scope change.

## APPROVED COMMANDS

Use the established safe schema-task command matrix only: frozen install,
task-file Prettier, local D1 migration, dual-dialect `db:generate`, focused
Vitest, format check, types check, lint, full test, build, `ci:check`, and
read-only Git inspection. Do not use `--dangerously-skip-permissions`, commit,
merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T121-M1-CONTENT-VERSION-MEDIA-ASSET-REF-SCHEMA/DELIVERY.md`
with relation decisions, migration IDs, exact command exits, clean generation
result, scope/security declaration, and final Git status; then stop.
