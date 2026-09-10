# DELIVERY — T123-M1-CONTENT-VARIANT-MEDIA-ASSET-REF-SCHEMA (round 1)

## STATUS

`BLOCKED_BY_TEST_ENVIRONMENT` — the implementation is complete and in-scope, and
every runnable approved gate in this executor session exits 0 (frozen install,
first + clean final dual-dialect `db:generate`, local D1 migration + idempotent
re-run, task-file Prettier `--write`, focused Vitest, full Vitest, read-only Git).
The aggregate whole-repo gates `format:check` / `types:check` / `lint` / `build` /
`ci:check` are auto-denied by this session's sandbox with no approval surface: the
standalone `types:check` invocation and the standalone task-file Prettier
`--check` invocation were each denied once, and the denial states any further
approval-requiring command is denied the same way for the rest of the session, so
per TASK item 5 ("record its exact denial once and stop without retry or bypass")
no further same-class gate was attempted and no exit code exists for the five.
This is reported honestly as an environment limitation, not as passing and not as
a scope/code deviation. No `PASS` verdict is written by the implementation round.

## TASK ID

`T123-M1-CONTENT-VARIANT-MEDIA-ASSET-REF-SCHEMA` — implementation round 1. No
`REVIEW.md` existed at round start (verified `ls` of the task directory showed
only `TASK.md`); none was created and none was edited.

## IMPLEMENTATION SUMMARY

Added the normalized, Project-scoped, same-Project `ContentVariant` → `MediaAsset`
reference contract across both dialects (D1/SQLite + PostgreSQL). It replaces the
legacy `schemas/domain-types.ts` `ContentVariant.assetRefs: string[]` and
`schemas/migrations-reference.sql` `content_variants.asset_refs_json` array with
explicit relational rows (05_DOMAIN_DATA_MODEL.md §10 ContentVariant derived from
ContentVersion `asset_ids[]`; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §1 canonical
source `asset://<id>`, §2 "assets", §7 Platform Variants). This slice is
schema/contract ONLY: it does not upload, store, download, transform, evaluate
rights on, render, publish or otherwise act on an asset, and it adds no
PublishedMediaRef behavior (TASK GOAL and item 3).

Storage contract shipped:

- `content_variant_media_assets` (both dialects): stable text `id` (PK), explicit
  NOT NULL `project_id` (FK → `projects(id)` ON DELETE CASCADE), required
  `content_variant_id`, required `media_asset_id`, and the append-only
  `created_at` timestamp only (TASK item 1).
- Same-Project ContentVariant ownership is database-enforced by the
  Project-leading composite FK
  `(project_id, content_variant_id) -> content_variants(project_id, id)`
  ON DELETE CASCADE.
- Same-Project MediaAsset ownership is database-enforced by the Project-leading
  composite FK
  `(project_id, media_asset_id) -> media_assets(project_id, id)`
  ON DELETE CASCADE.
- The MediaAsset composite-FK target is the accepted
  `media_assets_project_id_id_idx` (T114/T115, D1 0061 / PG 0039) and is REUSED —
  no index is added to `media_assets`. The ContentVariant composite-FK target is
  the ONE new referential parent index this task adds,
  `content_variants_project_id_id_idx` (unique on `(project_id, id)`), because the
  accepted T122 `content_variants` table carried `id` as its only identity with no
  `(project_id, id)` unique target. `id` is already the PK, so this composite
  accepts exactly the PK's rows and adds no business uniqueness.
- Edge identity `(content_variant_id, media_asset_id)` is the ONLY business
  uniqueness (unique index
  `content_variant_media_assets_unique_content_variant_media_asset_idx`); the
  media-asset → variants read path is served by the reverse non-unique index
  `content_variant_media_assets_media_asset_idx`. No other business uniqueness or
  lookup index exists on the table (TASK item 2).
- Immutable reference shape preserved: no `updated_at`, no JSON asset/reference
  ID array, no asset upload/storage/transformation, no rights evaluation, no
  asset rights/classification payload, no PublishedMediaRef behavior, no
  release/approval/publishing behavior, and no CRUD/UI (TASK items 3 and 4).
  Asset metadata/media type/rights/classification state stays on the linked
  `media_assets` row; a later Rights Gate / renderer read follows this link
  without copying state.

## FIELD RECONCILIATION

Sources: the TASK field list (authoritative), `05_DOMAIN_DATA_MODEL.md` §§10–11
(ContentVariant, MediaAsset), `09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§7–9,
`21_TEST_ACCEPTANCE_PLAN.md` §§10–12, `29_SCOPE_LOCK.md`,
`30_TRACEABILITY_MATRIX.md`, `docs/adr/ADR-006-canonical-markdown.md`, the
accepted T114/T115/T121/T122 relation patterns, and the legacy reference
artifacts `schemas/domain-types.ts` `ContentVariant.assetRefs: string[]` and
`schemas/migrations-reference.sql` `content_variants.asset_refs_json`. Reference
artifacts are read-only and were NOT edited.

| ContentVariant→MediaAsset aspect | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). |
| `project_id` | explicit non-null Project ownership | NOT NULL FK → projects(id) ON DELETE CASCADE. |
| `content_variant_id` | required ContentVariant | NOT NULL text id; same-Project composite FK `(project_id, content_variant_id) -> content_variants(project_id, id)` ON DELETE CASCADE (parent target is the new `content_variants_project_id_id_idx` added by this task's 0068/0046 — the only new parent index). |
| `media_asset_id` | required MediaAsset | NOT NULL text id; same-Project composite FK `(project_id, media_asset_id) -> media_assets(project_id, id)` ON DELETE CASCADE (parent target is the accepted `media_assets_project_id_id_idx` from T114/T115 — reused, not recreated). |
| `created_at` | creation timestamp only | NOT NULL text timestamp with DB default; the ONLY audit column. |
| `assetRefs[]` / `asset_refs_json` | legacy reference `ContentVariant` field and column | Reconciled to this normalized relation (TASK GOAL + item 3) — no JSON/text array column exists on `content_variants` or on this relation. |
| asset upload / object storage / download / transformation | 15_MEDIA_ASSET_SPEC; TASK item 3 | Reconciled OUT — this link stores an opaque reference id only. |
| rights evaluation / `rights_status` policy | 09 spec §9; 15 spec; TASK item 3 | Reconciled OUT — `rights_status`/`classification` state stays on the `media_assets` row; no Rights Gate runtime is added. |
| PublishedMediaRef | 05 §11; T115 slice | Separate accepted table — NOT duplicated, replaced, or touched here. |
| release/approval/publishing, renderer runtime, UI | TASK OUT OF SCOPE | Reconciled OUT — schema/contract only. |
| business uniqueness | TASK item 2 forbids beyond the edge identity | NOT shipped — the only unique index on the link table is `(content_variant_id, media_asset_id)`; the MediaAsset parent target already existed and is reused, and the one new ContentVariant parent index accepts exactly the PK's rows. |

## RELATION / FK / IDENTITY / DELETE DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project integrity: the Project-leading composite FKs
  `(project_id, content_variant_id) -> content_variants(project_id, id)` and
  `(project_id, media_asset_id) -> media_assets(project_id, id)`, both
  ON DELETE CASCADE (the accepted T114/T115/T121/T122 same-Project pattern). A
  link whose variant or media asset belongs to a different Project has no matching
  parent row in EITHER direction and is rejected by the DB; dangling
  variant/media-asset/Project rows are likewise rejected.
- New parent index (TASK item 2): exactly ONE —
  `content_variants_project_id_id_idx` (unique on `(project_id, id)`) added to the
  accepted T122 `content_variants` table by the new migration. It only makes the
  existing PK rows available as a composite-FK target, so it adds no business
  uniqueness. No index is added to `media_assets` — its accepted
  `media_assets_project_id_id_idx` from T114/T115 is reused.
- Edge identity: unique index `(content_variant_id, media_asset_id)` — one row per
  ContentVariant/MediaAsset edge. Both columns are globally unique PKs, so once
  the same-Project FKs hold the pair is project-isolated without listing
  `project_id` (the accepted content_package_version_media_assets /
  content_package_version_source_refs / claim_source_refs mapping pattern). The
  reverse `media_asset_id` index serves media-asset → variants reads. No other
  uniqueness rule is invented.
- Delete behavior: ON DELETE CASCADE on the Project FK and on BOTH composite
  parent FKs — deleting a content variant, a media asset, or a whole Project
  cascades its links away, so an edge can never dangle. Cascading the local link
  row does NOT delete the R2 source asset (15_MEDIA_ASSET_SPEC.md §7); only the
  stored pointer is removed.
- Immutability: the relation row carries `created_at` only; no `updated_at` and no
  mutable payload. The immutable reference shape replaces the legacy
  `assetRefs[]` / `asset_refs_json` array (TASK GOAL).

## MIGRATION IDS

- D1/SQLite: `drizzle/0068_steep_pandemic.sql` (+
  `drizzle/meta/0068_snapshot.json`, `drizzle/meta/_journal.json` idx 68).
  Drizzle generated the child table (3 FKs) + its edge-identity unique index + the
  media-asset reverse index + the new `content_variants_project_id_id_idx` unique
  index (last statement). The SQLite file was left exactly as generated: SQLite
  enforces FK parent-key uniqueness at DML time, so the parent-index-after-FK
  order is valid. The local D1 migration applied 0068 successfully.
- PostgreSQL: `drizzle-pg/0046_quick_toad.sql` (+
  `drizzle-pg/meta/0046_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 46).
  Drizzle emitted the new `content_variants_project_id_id_idx` unique index AFTER
  the two composite-FK ALTERs that reference it. PostgreSQL requires the
  referenced unique index to exist before the FK constraint is added, so the
  statement was manually reordered ahead of the FK ALTERs with an explanatory
  comment — the same adjustment the accepted T119 PG 0042 made for
  `content_package_versions_project_id_id_idx`. This is a statement-order fix
  only; the snapshot already records the schema state and the clean final
  `db:generate` reports no drift.

Accepted migrations (SQLite ≤ 0067, PG ≤ 0045) were NOT edited. Clean final
dual-dialect `db:generate` reports `No schema changes, nothing to migrate 😴` on
both dialects (59 tables each).

## FILES CHANGED

Modified (tracked, 5):

- `src/db/search-growth.schema.ts` — header `max-lines` eslint-disable comment
  updated for T123; appended the `contentVariantMediaAssets` sqliteTable; added the
  `content_variants_project_id_id_idx` unique index to `contentVariants` with the
  reconciliation / same-Project / link-identity comment block.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror (same
  columns/constraints/indexes with the `isoNow` `created_at` default) and the same
  parent unique index; header comment updated the same way.
- `src/db/schema.ts` — destructured barrel export adds
  `contentVariantMediaAssets` after `contentVariants`.
- `drizzle/meta/_journal.json` and `drizzle-pg/meta/_journal.json` —
  `db:generate` journal entries (idx 68 / idx 46).

Added (untracked, 5):

- `drizzle/0068_steep_pandemic.sql`, `drizzle/meta/0068_snapshot.json`.
- `drizzle-pg/0046_quick_toad.sql`, `drizzle-pg/meta/0046_snapshot.json`.
- `src/db/content-variant-media-asset-ref.test.ts` — the migration-backed storage
  spec (12 tests).

Task-channel file for this round: `DELIVERY.md` (this document). `REVIEW.md` did
not exist at round start and was not created/edited.

## DATABASE/MIGRATION CHANGES

- New `content_variant_media_assets` table on both dialects (5 columns / 2 indexes
  / 3 fks each): D1 0068 and PG 0046.
- One new index on the accepted `content_variants` parent:
  `content_variants_project_id_id_idx` (unique on `(project_id, id)`) — its ONLY
  referential index change (`content_variants` goes from 11 columns / 0 indexes /
  2 fks to 11 columns / 1 index / 2 fks; confirmed by the `db:generate` table
  report).
- NO index is added to `media_assets` — its accepted
  `media_assets_project_id_id_idx` is reused. `media_assets` stays 9 columns /
  2 indexes / 1 fk on each dialect.
- Snapshots (`0068_snapshot.json` / `0046_snapshot.json`) and journals (idx 68 /
  idx 46) written by `db:generate`. 59 tables on each dialect (58 accepted + 1).

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install
used the existing lockfile and reported "Lockfile is up to date").

## TESTS ADDED

- `src/db/content-variant-media-asset-ref.test.ts` — 12 migration-backed storage
  tests that build a real in-memory SQLite client, enable
  `PRAGMA foreign_keys = ON`, hand-create the `projects` table, and apply the
  actual shipped forward-migration DDL in order (`0045` market profiles, `0046`
  topics, `0049` prompts, `0055` opportunities, `0056` source_refs, `0057`
  claims — required because 0064's `content_package_version_claims` FK needs the
  claims table — `0060` media_assets, `0061` the T115 `media_assets` composite
  target, `0062` content_packages, `0063` content_package_versions, `0064` the
  `content_package_versions_project_id_id_idx` composite target the variant FK
  reuses, `0067` content_variants, then `0068` the new
  `content_variant_media_assets` + `content_variants_project_id_id_idx`, split on
  `--> statement-breakpoint`). The DDL is the source of truth, so the Project FK,
  the two same-Project composite FKs, the delete cascades, the edge identity and
  the NOT NULL rules are exercised — not an application convention. Tests cover:
  valid same-Project persistence with the full TASK field set + `created_at`
  default; cross-Project MediaAsset rejection; cross-Project ContentVariant
  rejection (both directions); dangling-variant, dangling-media-asset and
  dangling-Project FK rejection; duplicate `(content_variant_id, media_asset_id)`
  rejection; NOT NULL rejection of each direct column (`id`, `project_id`,
  `content_variant_id`, `media_asset_id`); content-variant-delete cascade;
  media-asset-delete cascade; whole-Project delete cascade (links + variants +
  versions + packages + media assets + topics); and the exact normalized relation
  column-shape assertion (the 5 link columns only — no `updated_at`, no asset
  rights/classification payload, no `asset_refs_json` JSON id-array column).
- Dialect parity: the new table and the new parent index are auto-picked-up by the
  existing `src/db/schema-parity.test.ts` (now 304 tests; +5 per-table assertions
  for the new table — columns/PK/unique/FKs/checks), which structurally compares
  every SQLite and PG table and confirms both dialects report the same structural
  change. This covers TASK item 4's "dialect parity" alongside the migration-backed
  DDL tests.

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no commit/merge/push).

1. `corepack pnpm install --frozen-lockfile` → exit 0 (lockfile up to date;
   ignored-build-scripts warning only).
2. `corepack pnpm run db:generate` (dual-dialect, first run) → exit 0 — produced
   `drizzle/0068_steep_pandemic.sql` and `drizzle-pg/0046_quick_toad.sql` with
   snapshots + journal entries (59 tables on both dialects;
   `content_variant_media_assets` = 5 columns / 2 indexes / 3 fks;
   `content_variants` = 11 columns / 1 index / 2 fks).
3. `corepack pnpm run db:migrate:local` (apply local D1 state) → exit 0 —
   0000 → 0068 all applied ✅ (`0068_steep_pandemic.sql` ✅; fresh `.wrangler`
   state so all 69 migrations applied).
4. Task-file Prettier `--write` (the 4 changed/new source files) → exit 0
   (`src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
   `src/db/content-variant-media-asset-ref.test.ts` reformatted;
   `src/db/schema.ts` unchanged).
5. Focused Vitest (`corepack pnpm exec vitest run` on the new spec + the accepted
   `content-variant` spec + `schema-parity`) → exit 0 — 3 files / 326 tests passed
   (12 content-variant-media-asset-ref + 10 content-variant + 304 parity).
6. `corepack pnpm run db:migrate:local` (idempotency re-run) → exit 0 —
   `✅ No migrations to apply!`.
7. `corepack pnpm run db:generate` (dual-dialect, clean final run) → exit 0 —
   both dialects: 59 tables, `No schema changes, nothing to migrate 😴`.
8. Full Vitest (`corepack pnpm exec vitest run`, default parallelism) → first run
   exit 1: 175 files passed, 2 failed —
   `src/server/mcp/oauth-provider.test.ts` test timeout and
   `src/server/mcp/oauth-refresh.e2e.test.ts` `beforeEach` hook timeout (30000ms),
   both cold-importing the provider graph under full-suite parallel load on the
   Windows checkout, unrelated to this task. Re-run of both files in isolation →
   exit 0 (2 files / 15 tests passed, ~10s). Full suite re-run → exit 0 —
   **177 files / 1612 tests passed** (124.75s).
9. `corepack pnpm run types:check` → **sandbox auto-denied; no exit code.** Exact
   denial: "Permission for this tool use was denied. It requires approval, and
   this session has no approval surface — nobody can answer a permission prompt
   here — so it was denied automatically. … What required approval: This command
   requires approval." Recorded once; the denial states any approval-requiring
   command is denied the same way for the rest of the session, so per TASK item 5
   the aggregate gates were not re-attempted/bypassed.
10. Task-file Prettier `--check` (the same 4 source files) → **sandbox
    auto-denied; no exit code.** Exact denial: "Permission for this tool use was
    denied. It requires approval, and this session has no approval surface …
    What required approval: This command requires approval." Recorded once; not
    re-attempted.
11. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`, journal diffs) → exit 0 — `git diff --check` clean.

## COMMAND RESULTS

Passing on the final tree: frozen install exit 0; dual-dialect `db:generate`
first run exit 0 (59 tables each) and clean final run exit 0 (`No schema changes,
nothing to migrate 😴` on both dialects); local D1 migration exit 0 (0000 → 0068
applied ✅, then idempotent `✅ No migrations to apply!`); task-file Prettier
`--write` exit 0; focused Vitest **3 files / 326 tests** exit 0; full Vitest
**177 files / 1612 tests** exit 0 at default parallelism on the final run; and
read-only Git inspection clean (`git diff --check` clean).

Transient flake (reported, not hidden): the first full-suite run had exactly two
failures — `oauth-provider.test.ts`'s test cold-import and
`oauth-refresh.e2e.test.ts`'s `beforeEach` cold-import each exceeded their 30s
deadline under full-suite parallel load (their own comments note cold-importing
the provider graph is slow on a Windows checkout). Both files pass 15/15 in
isolation and passed in the subsequent full-suite run; neither touches the schema
or migrations.

Environment limitation (reported, not hidden): this session's sandbox
auto-approval grant list denies the aggregate whole-repo command class with no
approval surface. `types:check` and the task-file Prettier `--check` were each
attempted once and auto-denied; the denial states any further approval-requiring
command is denied the same way, so `format:check`, `lint`, `build` and `ci:check`
were not separately re-attempted. **No exit code exists for any of the five
gates in this session.** This is the same environment block recorded for T121.

## RUNTIME EVIDENCE

- Full-suite Vitest final run: `Test Files 177 passed (177)`, `Tests 1612 passed
  (1612)`, exit 0 at default parallelism (124.75s). The new storage spec's 12
  tests and the extended parity suite (304) pass inside it. (1612 = prior
  accepted count 1595 + 12 media-asset-ref storage tests + 5 parity assertions for
  the new table.)
- Focused Vitest: 3 files / 326 tests, exit 0 (12 content-variant-media-asset-ref
  + 10 content-variant + 304 parity).
- `db:migrate:local`: 0068 applied successfully (✅) on the local D1 state;
  re-run reports `✅ No migrations to apply!`, exit 0 (journal complete and
  idempotent).
- `db:generate` final: D1 then PG each print 59 tables and `No schema changes,
  nothing to migrate 😴`, exit 0 — confirms both dialects' schemas exactly match
  their snapshots with no drift; `content_variant_media_assets` = 5 columns / 2
  indexes / 3 fks on both, `content_variants` = 11 columns / 1 index / 2 fks (the
  new parent index), and the reused parent `media_assets` is unchanged.
- Isolation re-run: `oauth-provider.test.ts` + `oauth-refresh.e2e.test.ts` →
  15/15 passed in ~10s, confirming the full-suite failures were load/timeout
  flakes.
- Read-only Git inspection: `git diff --check` clean; file set below is exactly
  the intended change set.
- Five full-repo gates: no exit codes (sandbox auto-denied) — see COMMAND RESULTS
  / KNOWN LIMITATIONS.

## KNOWN LIMITATIONS

- The `format:check` / `types:check` / `lint` / `build` / `ci:check` gates remain
  non-executable in this executor session: the sandbox auto-denies the aggregate
  whole-repo command class with no approval surface, so no exit code exists for
  any of the five (TASK item 5's "every runnable gate must exit 0" therefore
  cannot be fully evidenced here). This is reported as
  `BLOCKED_BY_TEST_ENVIRONMENT` — a test-environment limitation, not a scope or
  code deviation. The runnable matrix (frozen install, dual-dialect `db:generate`
  first + clean final run, local migration + re-run, focused and full Vitest,
  task-file Prettier `--write`, read-only Git) all pass, including a clean
  full-suite exit 0. A grant-enabled session, the controller/QA under the Product
  Owner's bounded acceptance-verification exception, or a human gate must produce
  the five exit codes before final acceptance.
- Type/lint surface for the new module could not be checked by `tsc`/`oxlint`
  this round (sandbox-denied); it is the same idiom as the accepted
  content_package_version_media_assets / content_package_version_source_refs
  same-Project modules, and the focused + full Vitest suites import and execute
  the new module and both schema mirrors at runtime (parity compares every
  column/index/FK/check between dialects).
- Two transient full-suite flakes were observed (OAuth cold-import test/hook
  timeouts), unrelated to this task and passing both in isolation and on the
  subsequent full run — see COMMAND RESULTS.
- Scope-shape notes (by design, not defects): the relation is schema/contract
  only — no asset upload/storage/download/transformation, rights evaluation,
  mutable asset payload, JSON id-array column, rendered/published-media,
  release/publishing behavior or CRUD/UI; the only business uniqueness is the edge
  identity `(content_variant_id, media_asset_id)`, and exactly one new parent
  index is added (`content_variants_project_id_id_idx`) while the accepted
  MediaAsset target is reused.

## DEVIATIONS FROM TASK

None in scope, field set, ownership rule, delete behavior, index set or migration
IDs. The relation ships D1 `0068` and PostgreSQL `0046` as required with forward
snapshots + journals; same-Project ownership is enforced by the two
Project-leading composite FKs `(project_id, content_variant_id) ->
content_variants(project_id, id)` and `(project_id, media_asset_id) ->
media_assets(project_id, id)`; exactly the necessary ContentVariant parent index
`content_variants_project_id_id_idx` is added and the accepted MediaAsset target
`media_assets_project_id_id_idx` is reused with NO new index on `media_assets`
(TASK item 2); the composite FKs, the Project FK, and the whole-Project delete all
cascade; and the only business uniqueness is the edge identity
`(content_variant_id, media_asset_id)` with no JSON id array, asset
upload/storage/transformation, rights evaluation, PublishedMediaRef, release/
publishing, or CRUD/UI surface. The only generated-file adjustment was the PG
`0046` statement reorder (parent unique index ahead of the FK ALTERs, required by
PostgreSQL and prefigured by the accepted T119 PG 0042) with an explanatory
comment; D1 `0068` was left exactly as generated. The only non-`0` outcomes are
environmental (two full-suite cold-import timeout flakes, and the five aggregate
gates the sandbox could not grant) — reported, not hidden, and not scope
deviations.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state (`db:migrate:local`) and in-memory
  SQLite built from the shipped forward-migration DDL.
- No network/provider/publishing action occurred. No asset upload, object
  storage, URL fetch, download, rights evaluation or transformation occurred. No
  commit, merge, or push was performed. No `main` branch was touched.
- TASK-approved command names only; the two denied invocations (`types:check`,
  task-file Prettier `--check`) were abandoned without retry or bypass after the
  sandbox denial, and the same-class aggregate gates were not separately
  re-attempted per the denial guidance.
- No asset rights/classification/verification payload, Rights Gate evaluation,
  PublishedMediaRef behavior, release/approval or publishing behavior was added
  (out of scope); the slice adds persistence/contract surface only. The relation
  row is immutable (`created_at` only), asset state stays on the `media_assets`
  row, and no content or asset leaves the project in this slice.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T123-M1-CONTENT-VARIANT-MEDIA-ASSET-REF-SCHEMA`; working tree
  is NOT committed (rounds stop at delivery). Recent commit on the branch:
  `fa2b88e control: dispatch T123 content variant media asset refs`.
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json` (db:generate journal entries idx 68 / 46);
  `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`
  (+236/−7 tracked), `src/db/schema.ts`.
- Added (untracked) files (5): `drizzle/0068_steep_pandemic.sql`,
  `drizzle/meta/0068_snapshot.json`, `drizzle-pg/0046_quick_toad.sql`,
  `drizzle-pg/meta/0046_snapshot.json`,
  `src/db/content-variant-media-asset-ref.test.ts`.
- Task-channel file: `control/tasks/T123-M1-CONTENT-VARIANT-MEDIA-ASSET-REF-SCHEMA/DELIVERY.md`
  (this document). `REVIEW.md` did not exist at round start and was not created.
- `git diff --stat` (tracked): 5 files, +236/−7. `git diff --check` clean.
- No other files are dirty or untracked.

## READY FOR REVIEW

Implementation round 1 is complete and in-scope: the normalized, Project-scoped
`content_variant_media_assets` relation ships on both dialects with forward
migrations 0068/0046, snapshots, journals, database-enforced same-Project
ownership via the Project-leading composite FKs to `content_variants` and
`media_assets`, ON DELETE CASCADE on the Project/Variant/MediaAsset FKs, the
edge-identity unique index `(content_variant_id, media_asset_id)`, exactly one new
referential parent index (`content_variants_project_id_id_idx`) with the accepted
MediaAsset target reused, an append-only `created_at` only (immutable reference
shape — no `updated_at`, no JSON id array, no asset
upload/rights/transformation/publishing payload, no CRUD surface), and no other
business uniqueness. Runnable approved gates pass on the final tree: frozen
install exit 0, dual-dialect `db:generate` first + clean final run exit 0 (`No
schema changes, nothing to migrate` on both dialects), local D1 migration exit 0
(0000 → 0068 applied, idempotent on re-run), task-file Prettier `--write` exit 0,
focused Vitest 3 files / 326 tests exit 0, full Vitest 177 files / 1612 tests exit
0 (default parallelism; two unrelated OAuth cold-import flakes on an earlier run
passed in isolation and on the final run), and read-only Git clean. The five
full-repo gates (`format:check`, `types:check`, `lint`, `build`, `ci:check`) could
not be executed because the sandbox auto-denies them with no approval surface (no
exit codes), so status is reported as `BLOCKED_BY_TEST_ENVIRONMENT`. No `PASS`
verdict is written by the implementation round.
