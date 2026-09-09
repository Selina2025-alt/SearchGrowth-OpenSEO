# TASK T117-M1-CONTENT-PACKAGE-CONTAINER-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the small, normalized, Project-scoped `ContentPackage` container persistence contract. This slice establishes only the package's core identity and its Topic/optional Opportunity ownership; immutable content versions, brief/canonical content, claims, sources, assets, WebPageSpec, variants, rendering, gates, CRUD, and publishing remain later independent tasks.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §10, `09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§1–2 and §8, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, `schemas/domain-types.ts` content interfaces, `schemas/migrations-reference.sql` content package reference, accepted T101 Topic and T109 Opportunity relation patterns, and the direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `content_packages` storage with a stable id, explicit non-null `project_id`, required `topic_id`, nullable `opportunity_id`, required opaque `title`, required opaque `locale`, required opaque `status`, and established created/updated audit timestamps.
2. Enforce same-Project Topic ownership with an explicit Project-leading composite FK. When `opportunity_id` is present, enforce same-Project Opportunity ownership with a composite FK. Add only necessary referential parent indexes; do not add business uniqueness or infer a Market/Persona/keyword/prompt relation from JSON.
3. Keep `status` opaque in this container slice: do not invent a lifecycle enum, gate behavior, release state, or publication success semantics. The row is a topic container, never a ContentVersion, approved release, or public-publish proof.
4. Use forward D1 `0062` / PostgreSQL `0040` migrations with journals and snapshots. Never edit accepted migrations. Add migration-backed tests for same-Project valid persistence, cross-Project Topic/Opportunity rejection, dangling parent rejection, nullable Opportunity behavior, required fields, delete cascades, normalized exact shape, and dual-dialect parity.
5. Run local migration, clean final dual-dialect `db:generate`, focused tests, format, types, lint, full tests, build, and `ci:check`. Every runnable gate must exit 0; if the known executor sandbox denies an aggregate command, record the exact denial once and stop without retry or bypass.

## OUT OF SCOPE

ContentVersion, ContentVariant, canonical Markdown, brief, metadata/WebPageSpec JSON, claims/sources/assets mappings, target keywords/prompts, market/persona modeling, search intent/PageFit behavior, immutable/version/gate runtime, renderers, CRUD/UI, connector/publishing/credentials, paid/production action, dependencies, ADR or scope change.

## APPROVED COMMANDS

Use the established safe schema-task command matrix only: frozen install, task-file Prettier, local D1 migration, dual-dialect `db:generate`, focused Vitest, format check, types check, lint, full test, build, `ci:check`, and read-only Git inspection. Do not use `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T117-M1-CONTENT-PACKAGE-CONTAINER-SCHEMA/DELIVERY.md` with field reconciliation, relationship/delete decisions, migration IDs, exact command exits, clean generation result, changed files, scope/security declaration, and final Git status; then stop.
