# TASK T123-M1-CONTENT-VARIANT-MEDIA-ASSET-REF-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, Project-scoped ContentVariant-to-MediaAsset reference
contract. This replaces the legacy `assetRefs` / `asset_refs_json` array with
explicit relational rows; it does not upload, transform, evaluate rights for, or
publish an asset.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §§10–11,
`09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§7–9,
`21_TEST_ACCEPTANCE_PLAN.md` §§10–12, `29_SCOPE_LOCK.md`,
`30_TRACEABILITY_MATRIX.md`, `docs/adr/ADR-006-canonical-markdown.md`, legacy
ContentVariant reference artifacts, accepted T114/T115/T121/T122 relation
patterns, and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL normalized
   `content_variant_media_assets` storage with stable id, explicit non-null
   `project_id`, required `content_variant_id`, required `media_asset_id`, and
   creation timestamp only.
2. Database-enforce same-Project ownership with Project-leading composite FKs
   to ContentVariant and MediaAsset. Add only the necessary `(project_id, id)`
   referential parent index to ContentVariant; reuse the accepted MediaAsset
   target. Enforce one edge per `(content_variant_id, media_asset_id)` and no
   other business uniqueness.
3. Preserve immutable reference shape: no JSON asset/reference ID array, no
   asset upload/storage/transformation, no rights evaluation, no PublishedMediaRef
   behavior, no release/approval/publishing behavior, and no CRUD/UI.
4. Use forward D1 `0068` / PostgreSQL `0046` migrations plus snapshots and
   journals. Add migration-backed tests for same-Project persistence, both
   cross-Project directions, dangling parents, duplicate edge rejection,
   required fields, delete cascades, normalized shape, and dialect parity.
5. Run local migration, clean final dual-dialect `db:generate`, focused tests,
   format, types, lint, full tests, build, and `ci:check`; every runnable gate
   must exit 0. If the executor sandbox denies an aggregate gate, record its
   exact denial once and stop without retry or bypass.

## OUT OF SCOPE

ContentVariant/MediaAsset CRUD, R2 or other storage, upload/download,
transformation, rights evaluation, renderer runtime, PublishedMediaRef behavior,
release/approval/publishing, provider/credentials, UI, production/paid action,
dependency, ADR, or scope change.

## APPROVED COMMANDS

Use the established safe schema-task command matrix only: frozen install,
task-file Prettier, local D1 migration, dual-dialect `db:generate`, focused
Vitest, format check, types check, lint, full test, build, `ci:check`, and
read-only Git inspection. Do not use `--dangerously-skip-permissions`, commit,
merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T123-M1-CONTENT-VARIANT-MEDIA-ASSET-REF-SCHEMA/DELIVERY.md`
with relation decisions, migration IDs, exact command exits, clean generation
result, scope/security declaration, and final Git status; then stop.
