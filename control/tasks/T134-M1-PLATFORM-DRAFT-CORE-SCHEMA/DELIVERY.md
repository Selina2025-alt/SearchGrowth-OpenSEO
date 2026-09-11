# DELIVERY — T134-M1-PLATFORM-DRAFT-CORE-SCHEMA (round 1)

## STATUS

`READY_FOR_REVIEW` — implementation round 1 of 3. No `REVIEW.md` existed at round
start, so there were no review findings to address. Every required TASK item 6
gate ran to completion in this executor session and exited 0: dual-dialect
`db:generate` (initial generation + clean re-run), local D1 migration, focused
Vitest, `format:check`, `types:check`, `lint`, full Vitest, `build`, and
`ci:check`; read-only Git inspection is clean. No `PASS` verdict is written by
the implementation round.

## TASK ID

`T134-M1-PLATFORM-DRAFT-CORE-SCHEMA` — implementation round 1. No `REVIEW.md`
existed at round start.

## IMPLEMENTATION SUMMARY

Adds the credential-free, Project-scoped `PlatformDraft` persistence contract
across both dialects (D1/SQLite + PostgreSQL), plus its matching Zod/domain
boundary and migration-backed/domain tests. ONE PlatformDraft is the evidence
that ONE approved ReleaseTarget was staged as a DRAFT on a platform and
(optionally) that the draft itself was verified
(05_DOMAIN_DATA_MODEL.md §12 PlatformDraft; 11_WECHATSYNC_DRAFT_STAGER_SPEC.md
§§5–10; 10_DISTRIBUTION_ARCHITECTURE.md §3 route WECHATSYNC_STAGED_FINALIZE;
13_PUBLISH_FINALIZER_SPEC.md; schemas/domain-types.ts `PlatformDraft`;
schemas/migrations-reference.sql `platform_drafts`). This slice is schema/contract
only: it does not stage, verify, finalize, publish, spend, contact an external
system, select/reconcile a route, or implement any credential/account/connector
behavior (TASK items 1, 3–5). A row records staged-draft evidence — it is never a
publish instruction, a finalization, a public URL, `PUBLIC_VERIFIED`, or a
receipt.

Storage contract shipped (`platform_drafts`, both dialects, 13 columns / 1 unique
index / 2 fks / 1 check):

- stable text `id` (PK), explicit NOT NULL `project_id` (FK → `projects(id)` ON
  DELETE CASCADE), required `release_target_id`, required opaque `platform`,
  required opaque `account_id` / `draft_id`, nullable `draft_url`, required
  opaque `content_hash`, required `asset_hashes_json` document, required opaque
  `stager_id` / `stager_version`, nullable `verified_at`, and the append-only
  `created_at` timestamp only.
- Project and same-Project ReleaseTarget integrity by the Project-leading
  composite FK `(project_id, release_target_id) -> release_targets(project_id, id)`
  ON DELETE CASCADE, reusing the accepted parent target
  `release_targets_project_id_id_idx` (T125, D1 0070 / PG 0048). No index is added
  to any parent.
- The source-defined draft identity rule preserved as the UNIQUE index
  `platform_drafts_platform_account_id_draft_id_idx` on
  `(platform, account_id, draft_id)` (legacy `idx_platform_draft ON
  platform_drafts(platform, account_id, draft_id)`).
- Asset-hash document validity by the named CHECK `platform_drafts_asset_hashes_valid`
  (`json_valid` on SQLite, jsonb cast on PostgreSQL) plus Zod shape validation.
- Matching Zod/domain boundary `src/types/schemas/platform-draft.ts`:
  `PlatformDraft` (`InferSelectModel`) and `platformDraftSchema` (Zod object
  mirroring the 13 direct fields).

## FIELD RECONCILIATION

Sources: the TASK item 1 direct field list (authoritative),
`05_DOMAIN_DATA_MODEL.md` §12, `10_DISTRIBUTION_ARCHITECTURE.md` §§2–9,
`11_WECHATSYNC_DRAFT_STAGER_SPEC.md` §§5–10, `13_PUBLISH_FINALIZER_SPEC.md`,
`21_TEST_ACCEPTANCE_PLAN.md` §§15–16, `29_SCOPE_LOCK.md`,
`30_TRACEABILITY_MATRIX.md`, the accepted ReleaseTarget (T125) /
PublicationExecutionPlan (T133) patterns, and the legacy reference artifacts
`schemas/domain-types.ts` `PlatformDraft` /
`schemas/migrations-reference.sql` `platform_drafts`. Reference artifacts are
read-only and were NOT edited.

| Draft aspect | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). |
| `project_id` | TASK item 1 "explicit Project identity"; item 2 Project-leading constraints | NOT NULL FK → `projects(id)` ON DELETE CASCADE. **Added** relative to the legacy reference table, which has no `project_id`. |
| `release_target_id` | one ReleaseTarget reference | NOT NULL text id; same-Project composite FK `(project_id, release_target_id) -> release_targets(project_id, id)` ON DELETE CASCADE (parent `release_targets_project_id_id_idx` from T125 0070/0048 reused). |
| `platform` | required platform | NOT NULL opaque text stored verbatim. The platform/connector catalogue is a later gated task, so no platform enum/reference is invented (mirrors the accepted opaque ReleaseTarget `platform`; TASK item 4). |
| `account_id` | opaque external account identity | NOT NULL OPAQUE text (11 §7 `account_id`). Stored identity ONLY — no publisher connection, credential, certification or account-management row is referenced/created (TASK item 4). |
| `draft_id` | opaque platform draft identity | NOT NULL OPAQUE text (11 §7 `external_draft_id`; legacy `draft_id`). Part of the source-defined identity triple; stored, never parsed. |
| `draft_url` | optional draft URL | Nullable text stored verbatim (legacy `draft_url`). NULL = none returned. It is a DRAFT url, never a public-success URL (10 §8). |
| `content_hash` | content hash | NOT NULL opaque text stored verbatim; plain non-unique column, no hash matching/dedup rule. |
| `asset_hashes_json` | asset-hashes document | NOT NULL JSON text (legacy `asset_hashes_json TEXT NOT NULL`; `domain-types.ts` `assetHashes: string[]`). DB validity CHECK + Zod shape = JSON array of hash strings. Never decomposed into relational columns. |
| `stager_id`, `stager_version` | opaque stager id/version | NOT NULL OPAQUE text stored verbatim (11 §7 `stager_id`/`stager_version`). No stager catalogue/connector reference is invented (TASK item 4). |
| `verified_at` | optional draft-verification timestamp | Nullable text (legacy `verified_at`; 11 §8 Draft Verification). Records DRAFT verification only — never `PUBLIC_VERIFIED`/public success (TASK item 3). NULL = not draft-verified. |
| `created_at` | creation timestamp | NOT NULL text timestamp with DB default; the ONLY audit column (legacy `created_at`). |
| `idx_platform_draft(platform, account_id, draft_id)` | source-defined draft identity rule | **Preserved** as the UNIQUE index `platform_drafts_platform_account_id_draft_id_idx` (TASK item 2). |
| `status` / `public_url` / `PUBLIC_VERIFIED` / `finalized_at` | — | **Reconciled OUT.** A draft row cannot assert public success or a final publish (TASK item 3; 11 §1 "草稿不是 Public Success"; 21 §15 "DRAFT_CREATED/DRAFT_VERIFIED 不算 Public 成功"). |
| Route selection / lifecycle / retry / job / receipt / publishing / approval / credential/account columns | TASK items 3–4 | **Reconciled OUT** — no such column or behavior exists in this slice. |
| `updated_at` / mutable draft editing | TASK item 3 | Reconciled OUT — the TASK field list names the creation timestamp only and the staged-draft evidence is append-only. |

## DRAFT / PUBLIC-SUCCESS BOUNDARY

- `verified_at` is the DRAFT-verification timestamp and nothing more: it asserts
  that the draft was inspected/verified (11 §8), not that the content is public.
- There is no public URL, public ID, receipt, finalization, route, status or
  lifecycle column; the row cannot represent `PUBLIC_VERIFIED`, a final publish,
  or a same-draft finalization.
- The only relational link is the owning ReleaseTarget and its Project; no
  publisher connection, credential, certification, bridge, provider, browser or
  external API model is touched (TASK item 4). `account_id` / `stager_id` /
  `stager_version` are opaque stored identities only.

## PROJECT / IDENTITY / DELETE DECISIONS

- Project ownership: single-column NOT NULL FK to `projects(id)` ON DELETE
  CASCADE, the established Project-scoping FK every Search Growth row carries.
- Same-Project integrity: Project-leading composite FK
  `(project_id, release_target_id) -> release_targets(project_id, id)` ON DELETE
  CASCADE. A draft whose target belongs to a different Project — or a dangling
  target — has no matching parent row and is rejected by the DB.
- Delete behavior (chosen, migration-backed): CASCADE on both FKs, so deleting a
  ReleaseTarget or a whole Project removes its draft records — a draft can never
  dangle.
- Identity rule: the source-defined `(platform, account_id, draft_id)` UNIQUE
  index is preserved unchanged and globally scoped, because these are opaque
  remote identities and the legacy `idx_platform_draft` is itself global (TASK
  item 2 "preserve the source-defined platform/account/draft identity rule").
  Multiple drafts per ReleaseTarget remain allowed (a target may stage to several
  platforms/accounts) — there is no one-draft-per-target rule in the reference
  contract, unlike PublicationExecutionPlan.
- Supporting parent targets: NONE added. The composite FK's parent pair
  `(project_id, id)` is the accepted `release_targets_project_id_id_idx` (T125)
  and is reused (TASK item 2 "add only necessary supporting parent targets").

## MIGRATION IDS

- D1/SQLite `0079_same_mindworm`: `drizzle/0079_same_mindworm.sql`,
  `drizzle/meta/0079_snapshot.json`, `drizzle/meta/_journal.json` (idx 79).
  Creates `platform_drafts` with both FKs, the identity UNIQUE index and the
  asset-hash validity CHECK.
- PostgreSQL `0057_complete_riptide`: `drizzle-pg/0057_complete_riptide.sql`,
  `drizzle-pg/meta/0057_snapshot.json`, `drizzle-pg/meta/_journal.json`
  (idx 57). Adds the table, the jsonb-cast asset-hash CHECK, both FK constraints
  and the UNIQUE index.
- Migration file names are generator-chosen (the TASK-approved `db:generate`
  takes no `--name`), but the forward IDs are exactly D1 `0079` and PG `0057` as
  required.
- Accepted migrations (SQLite ≤ 0078, PG ≤ 0056) were NOT edited. A clean
  dual-dialect `db:generate` re-run reports `No schema changes, nothing to
  migrate 😴` on both dialects (70 tables each; `platform_drafts` = 13 columns /
  1 index / 2 fks).

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — header `max-lines` eslint-disable updated;
  appended the `platformDrafts` sqliteTable with the full field-reconciliation /
  draft-boundary / identity / delete comment block.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror and header
  update.
- `src/db/schema.ts` — provider-aware barrel destructure adds `platformDrafts`.
- `drizzle/meta/_journal.json`, `drizzle-pg/meta/_journal.json` — generate
  entries.

Added (untracked):

- `drizzle/0079_same_mindworm.sql`, `drizzle/meta/0079_snapshot.json`.
- `drizzle-pg/0057_complete_riptide.sql`, `drizzle-pg/meta/0057_snapshot.json`.
- `src/db/platform-draft.test.ts` — migration-backed storage spec (11 tests).
- `src/types/schemas/platform-draft.ts` — Zod/domain boundary.
- `src/types/schemas/platform-draft.test.ts` — focused domain tests (6 tests).

Task-channel file: `DELIVERY.md` (this document). No `REVIEW.md` existed and none
was created or edited.

## DATABASE/MIGRATION CHANGES

- New `platform_drafts` table on both dialects (13 columns / 1 unique index /
  2 fks / 1 check each): D1 0079 and PG 0057, with snapshots + journals.
- No change to any accepted table (the composite-FK parent
  `release_targets_project_id_id_idx` is reused).
- 70 tables total on each dialect (up from 69). Local D1 migration applied the
  full forward chain through `0079_same_mindworm.sql` successfully (final state
  ✅).

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (the frozen
install used the existing lockfile).

## TESTS ADDED

- `src/db/platform-draft.test.ts` — 11 migration-backed storage tests that build
  a real in-memory SQLite client, enable `PRAGMA foreign_keys = ON`, hand-create
  `projects`, and apply the actual shipped forward-migration DDL in order
  (`0045`→`0046`→`0049`→`0055`→`0056`→`0057`→`0060`→`0061`→`0062`→`0063`→`0064`→
  `0067`→`0068`→`0069`→`0070`→`0079`, split on
  `--> statement-breakpoint`). Covers: valid same-Project persistence with the
  full field set including `draft_url`/`verified_at`; optional URL/verification
  default NULL + append-only `created_at`; malformed asset-hash JSON rejected;
  duplicate source-defined `(platform, account_id, draft_id)` identity rejected;
  different platform/account/draft id and multiple drafts per ReleaseTarget
  allowed; cross-Project ReleaseTarget rejection in EITHER direction; dangling
  target/Project rejection; cascade when the ReleaseTarget is deleted;
  whole-project cascade; NOT NULL rejection of every required direct column; and
  the exact 13-column storage shape (no public URL verification,
  `PUBLIC_VERIFIED`, route, status/lifecycle, job, receipt or credential column).
- `src/types/schemas/platform-draft.test.ts` — 6 focused domain tests: full
  contract round-trips verbatim with opaque `draftId`/`accountId` and the
  verbatim asset-hash string; minimal draft with NULL optional URL/verification;
  malformed asset-hash JSON rejected; wrong-shaped asset-hash documents rejected
  (object, mixed array, null, string); missing required field rejected; exported
  `PlatformDraft` row type has no `publicUrl` / `publicVerifiedAt` / `status` /
  `route` / `publisherConnectionId` / `updatedAt`.
- Dialect parity: the new table is auto-covered by the existing
  `src/db/schema-parity.test.ts` (now 359 tests, structurally comparing every
  SQLite and PG table including enum values, FKs, unique constraints and CHECK
  names).

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no commit/merge/push). One
environment bootstrap (`install --frozen-lockfile`) was required because this
fresh worktree had no `node_modules`; it used the existing lockfile and changed
no tracked file — the same necessity recorded by prior task deliveries.

1. `corepack pnpm install --frozen-lockfile` (bootstrap)
2. `corepack pnpm run db:generate` (initial generation)
3. `corepack pnpm run db:migrate:local`
4. `corepack pnpm exec vitest run src/db/platform-draft.test.ts src/types/schemas/platform-draft.test.ts src/db/schema-parity.test.ts`
5. `corepack pnpm run db:generate` (clean re-run)
6. `corepack pnpm exec prettier --write src/db/search-growth.schema.ts src/db/pg/search-growth.schema.ts src/db/schema.ts src/types/schemas/platform-draft.ts src/types/schemas/platform-draft.test.ts src/db/platform-draft.test.ts`
7. `corepack pnpm types:check`
8. `corepack pnpm format:check`
9. `corepack pnpm lint`
10. `corepack pnpm test`
11. `corepack pnpm build`
12. `corepack pnpm ci:check`
13. Read-only Git inspection (`git status --short`, `git diff --stat`, `git diff --check`, `git rev-parse HEAD`, `git rev-parse --abbrev-ref HEAD`)

## COMMAND RESULTS

**All required gates exit 0 on the final tree.**

1. Frozen install → exit 0 — 980 packages reused, 0 downloaded, "Done in
   2m 7.2s"; only pnpm's ignored-build-scripts warning.
2. Initial `db:generate` → exit 0 — wrote `drizzle/0079_same_mindworm.sql` and
   `drizzle-pg/0057_complete_riptide.sql`; 70 tables each;
   `platform_drafts 13 columns 1 indexes 2 fks`.
3. `db:migrate:local` → exit 0 — applied the full local D1 chain, final state
   table ends `0079_same_mindworm.sql ✅`.
4. Focused Vitest → exit 0 — 3 files / 376 tests passed (new storage 11, new
   domain 6, parity 359).
5. Clean re-run `db:generate` → exit 0 — both dialects print `No schema changes,
   nothing to migrate 😴`.
6. Task-file Prettier → exit 0 (1 file reformatted — the new domain test; the
   schema files unchanged).
7. `types:check` (`tsc --noEmit`) → exit 0, no diagnostics.
8. `format:check` → exit 0 — "All matched files use Prettier code style!".
9. `lint` (`oxlint . --type-aware`) → exit 0 — "Found 0 warnings and 0 errors.
   Finished in 56.7s on 928 files".
10. Full `test` → exit 0 — 199 files / 1864 tests passed.
11. `build` → exit 0 — vite client, SSR and open_seo_audit bundles all built,
    followed by `tsc --noEmit` with no output.
12. `ci:check` → exit 0 — prettier clean, knip clean, both `tsc --noEmit` runs
    clean, oxlint clean, plugin-skills sync clean
    (`plugin skill sync clean: plugins/openseo/skills`). (The command exceeded
    the 600s foreground timeout and completed in the background with exit 0.)
13. Read-only Git → exit 0 — `git diff --check` clean (no output).

## RUNTIME EVIDENCE

- `db:generate` (both dialects): 70 tables, `platform_drafts 13 columns 1
  indexes 2 fks`, and `No schema changes, nothing to migrate 😴` after the clean
  re-run — schema and snapshots agree with no drift.
- `db:migrate:local`: final applied migration is `0079_same_mindworm.sql ✅`.
- Snapshot check: both `0079_snapshot.json` and `0057_snapshot.json` contain the
  `platform_drafts` table, the identity UNIQUE index
  `platform_drafts_platform_account_id_draft_id_idx`, both FKs and the named
  asset-hash CHECK `platform_drafts_asset_hashes_valid`.
- Full suite: `Test Files 199 passed (199)`, `Tests 1864 passed (1864)`; the new
  storage (11), domain (6) and parity (359) suites all pass inside it.
- `build`: client/SSR/open_seo_audit bundles built, `tsc --noEmit` no
  diagnostics.
- `ci:check`: full chain completed, final line
  `plugin skill sync clean: plugins/openseo/skills`.
- Git: `git status --short` shows exactly the intended file set; `git diff
  --check` clean.

## KNOWN LIMITATIONS

- None blocking. Every TASK item 6 gate ran and exited 0 in this session; no
  `BLOCKED_BY_TEST_ENVIRONMENT` status is claimed.
- Scope-shape notes (by design, not defects): the table and boundary are
  schema/contract only — no draft staging/finalizing/verifying runtime, no
  external system, no route selection, no retry/job/lifecycle behavior, no
  credential/account/connector behavior, no UI or production behavior.
  `account_id` / `draft_id` / `platform` / `content_hash` / `stager_id` /
  `stager_version` are opaque/verbatim; `asset_hashes_json` is validated for JSON
  validity (DB) and shape (Zod) but carries no semantic hash-length/algorithm
  rule; there is no `updated_at`.
- The only non-fatal output was pnpm's ignored-build-scripts warning during
  install and vite's chunk-size warnings during build; neither affects exit
  status or this task's scope.

## DEVIATIONS FROM TASK

- None that change scope.
- `project_id` is added relative to the legacy `platform_drafts` reference table,
  because TASK items 1–2 explicitly require "explicit Project identity" and
  Project-leading same-Project database constraints.
- The asset-hash validity CHECK is added to satisfy TASK item 3 ("validate
  structured documents … at trust boundaries"); the legacy reference table has no
  such CHECK. It follows the accepted `publication_execution_plans` document
  pattern.
- Migration file names are generator-chosen (`0079_same_mindworm`,
  `0057_complete_riptide`) because the TASK-approved `db:generate` takes no
  `--name`; the forward IDs match the TASK exactly.
- The identity UNIQUE index is retained as the source-defined global
  `(platform, account_id, draft_id)` triple rather than made Project-leading,
  because the reference contract's `idx_platform_draft` is itself global and
  these are opaque remote identities (TASK item 2 "preserve the source-defined
  platform/account/draft identity rule"). Project integrity is still enforced by
  the Project-leading composite FK.
- The frozen install was an environment bootstrap (fresh worktree had no
  `node_modules`); it changed no tracked file and used the existing lockfile.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state and in-memory SQLite built from
  the shipped forward-migration DDL.
- No network/provider/publishing/connector action occurred. No capture bypass, no
  stealth behavior, no cookies, no paid action. No commit, merge, or push was
  performed. No `main` branch was touched.
- TASK-approved command names only. No `--dangerously-skip-permissions`, no
  bypass, and no retry-after-denial (no sandbox denial occurred).
- Scope declaration: this slice adds persistence/contract surface only — it does
  not stage, verify, finalize, publish, spend, contact an external system, select
  a route, or implement any credential/account/connector behavior. No publisher
  connection table, credential, account, or external integration model was
  created. A row never asserts `PUBLIC_VERIFIED`, a final publish, or public
  success.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T134-M1-PLATFORM-DRAFT-CORE-SCHEMA`; working tree is NOT
  committed (the round stops at delivery). Head:
  `f1d39d4dd96128d123d21f65d944c1c11e3de814` (`control: record T133 and prepare
  T134`).
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json`, `src/db/search-growth.schema.ts`,
  `src/db/pg/search-growth.schema.ts`, `src/db/schema.ts`.
- Added untracked files (7): `drizzle/0079_same_mindworm.sql`,
  `drizzle/meta/0079_snapshot.json`, `drizzle-pg/0057_complete_riptide.sql`,
  `drizzle-pg/meta/0057_snapshot.json`, `src/db/platform-draft.test.ts`,
  `src/types/schemas/platform-draft.ts`,
  `src/types/schemas/platform-draft.test.ts`.
- Task-channel file: `DELIVERY.md` (this document).
- `git diff --stat` (tracked): 5 files, +222/−2. `git diff --check` clean. No
  other files are dirty or untracked (plugin-skill sync left no diff).

## READY FOR REVIEW

The credential-free, Project-scoped PlatformDraft draft-evidence contract ships
on both dialects with forward migrations 0079/0057, snapshots, journals,
database-enforced Project ownership and same-Project ReleaseTarget integrity via
a Project-leading composite FK that reuses the accepted
`release_targets_project_id_id_idx` parent, ON DELETE CASCADE, the preserved
source-defined `(platform, account_id, draft_id)` identity UNIQUE index, a
DB-level asset-hash validity CHECK plus Zod shape validation, an append-only
`created_at` only, and optional `draft_url` / `verified_at` that never assert
`PUBLIC_VERIFIED` or public success — plus the matching `PlatformDraft` /
`platformDraftSchema` domain boundary and migration-backed/domain tests. Every
required gate exited 0 in this session. No `PASS` verdict is written by the
implementation round.
