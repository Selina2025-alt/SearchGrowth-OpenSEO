# TASK T114-M1-MEDIA-ASSET-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, Project-scoped MediaAsset metadata foundation. This is schema/contract only: it records V1.0 asset identity, rights, and classification without implementing upload, object storage, media processing, or publishing.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §11 MediaAsset, `09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §9 Rights Gate, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, and relevant `MediaAsset` / `MediaRightsStatus` types plus accepted schema/migration parity patterns.

## IN SCOPE

1. Add equivalent D1/PostgreSQL `media_assets` storage with stable id, explicit Project ownership, direct asset metadata `media_type`, `mime_type`, `bytes`, `sha256`, `rights_status`, and `classification`, plus only standard creation audit metadata required by established schema convention.
2. Enforce the exact domain enum unions at storage and Zod boundaries: media type `IMAGE | VIDEO | AUDIO | DOCUMENT | OTHER`; rights status `OWNED | LICENSED | APPROVED_EXTERNAL | UNKNOWN`; classification `PUBLIC_MARKETING | INTERNAL | RESTRICTED`.
3. Add the Project FK/delete behavior and only indexes required for Project lookup. Do not invent content-hash, storage-key, filename, dimensional, duplicate, or business uniqueness rules without a direct V1.0 contract.
4. Use forward D1 `0060` / PostgreSQL `0038` migrations plus snapshots/journals; never edit accepted migrations. Add migration-backed tests for valid asset persistence, enum and required-field rejection, Project ownership/delete behavior, exact metadata shape, and dialect parity.
5. Run local migration, clean final dual-dialect `db:generate`, focused tests, format, types, lint, full tests, build, and `ci:check`; every gate must exit 0.

## OUT OF SCOPE

File upload/download, object storage/storage keys, media processing or extraction, dimensions/duration, media CRUD/UI, Rights Gate runtime enforcement, ContentVersion links, publication/publishing, providers, credentials, paid/production action, dependency changes, ADR/scope change.

## APPROVED COMMANDS

Use the established safe schema-task command matrix only: node/corepack version checks, frozen install, task-file Prettier, local D1 migration, dual-dialect generation, focused Vitest, format check, types check, lint, full test, build, `ci:check`, and read-only Git inspection. Do not use unlisted commands, `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T114-M1-MEDIA-ASSET-SCHEMA/DELIVERY.md` with field reconciliation, constraints and delete behavior, migration IDs, exact gate exits, `db:generate` result, scope/security declaration, changed files, and Git status; then stop.
