# TASK T115-M1-PUBLISHED-MEDIA-REF-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the internal, Project-scoped `PublishedMediaRef` persistence contract that records a media asset's opaque remote reference. This task adds no publisher connector, account authorization, upload, or external request.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §11 PublishedMediaRef, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, the accepted T114 MediaAsset schema/migration/tests, relevant domain types, and accepted same-Project relation patterns.

## IN SCOPE

1. Add equivalent D1/PostgreSQL `published_media_refs` storage with stable id, explicit Project ownership, `media_asset_id`, opaque `platform`, nullable opaque `account_id`, `external_media_id`, `public_url`, optional remote `sha256`, and creation timestamp.
2. Database-enforce same-Project ownership between reference and MediaAsset through a composite FK and only a necessary referential parent key. Keep URL/account/external id opaque; do not validate reachability or access a remote service.
3. Do not invent success/status semantics, account credentials, publication uniqueness, or public-verification behavior. A row is only a stored reference, never proof of public success.
4. Use forward D1 `0061` / PostgreSQL `0039` migrations plus snapshots/journals; never edit accepted migrations. Add migration-backed tests for same-Project persistence, cross-Project and dangling asset rejection, deletion behavior, nullable opaque fields, normalized shape, and parity.
5. Run local migration, clean final dual-dialect `db:generate`, focused tests, format, types, lint, full tests, build, and `ci:check`; every gate must exit 0.

## OUT OF SCOPE

Publisher connectors, uploads, account/credential handling, remote API calls, URL reachability, publication execution, `PUBLIC_VERIFIED` logic, CRUD/UI, paid/production action, dependency changes, ADR/scope change.

## APPROVED COMMANDS

Use the established safe schema-task command matrix only: node/corepack version checks, frozen install, task-file Prettier, local D1 migration, dual-dialect generation, focused Vitest, format check, types check, lint, full test, build, `ci:check`, and read-only Git inspection. Do not use unlisted commands, `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T115-M1-PUBLISHED-MEDIA-REF-SCHEMA/DELIVERY.md` with field reconciliation, same-Project/delete decisions, migration IDs, exact gate exits, `db:generate` result, scope/security declaration, changed files, and Git status; then stop.
