# TASK T118-M1-CONTENT-VERSION-CORE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the immutable, Project-scoped `ContentVersion` core persistence contract. This task records canonical content and version identity only; normalized Claim/SourceRef/MediaAsset mappings and all release/publishing behavior remain separate tasks.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §10, `09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§1, 4, and 8, `21_TEST_ACCEPTANCE_PLAN.md` §10, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, `schemas/domain-types.ts` ContentPackageVersion, `schemas/migrations-reference.sql`, accepted T110–T117 schema/relation patterns, and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `content_package_versions` storage with stable id, explicit non-null `project_id`, required `content_package_id`, required `version_no`, required `canonical_markdown`, required `canonical_metadata_json`, nullable `web_page_spec_json`, required opaque `content_hash`, required `gate_status`, required DataClassification `classification`, and creation timestamp only.
2. Enforce same-Project ContentPackage ownership through a Project-leading composite FK. Add only the required supporting `(project_id, id)` parent index on `content_packages` and the specified version identity `(content_package_id, version_no)`; no other business uniqueness.
3. Preserve immutable-row shape: no `updated_at`, mutable workflow, release approval, publishing or public-success behavior. `gate_status` records only the core value; do not implement Gate evaluation or allow an agent to override it. Keep metadata/WebPageSpec as opaque structured document payloads; do not encode relational Claim/SourceRef/MediaAsset mappings in JSON.
4. Use forward D1 `0063` / PostgreSQL `0041` migrations with journals/snapshots; never edit accepted migrations. Add migration-backed tests for same/cross-Project persistence, dangling parent rejection, duplicate version rejection, nullable WebPageSpec, required fields, delete cascade, immutable normalized shape, classification enum rejection, and dual-dialect parity.
5. Run local migration, clean final dual-dialect `db:generate`, focused tests, format, types, lint, full tests, build, and `ci:check`; every runnable gate must exit 0. If the known executor sandbox denies an aggregate gate, report that exact denial once and stop without retry or bypass.

## OUT OF SCOPE

ContentPackage CRUD, ContentVariant, Claim/SourceRef/MediaAsset mapping tables, gate runtime, release/dry-run/approval, renderer, publishing, connector, credential, UI, production/paid action, dependency, ADR, or scope change.

## APPROVED COMMANDS

Use the established safe schema-task command matrix only: frozen install, task-file Prettier, local D1 migration, dual-dialect `db:generate`, focused Vitest, format check, types check, lint, full test, build, `ci:check`, and read-only Git inspection. Do not use `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T118-M1-CONTENT-VERSION-CORE-SCHEMA/DELIVERY.md` with field reconciliation, immutability/relationship decisions, migration IDs, exact command exits, clean generation result, changed files, scope/security declaration, and final Git status; then stop.
