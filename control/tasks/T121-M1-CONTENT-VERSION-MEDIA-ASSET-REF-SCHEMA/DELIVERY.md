# DELIVERY — T121-M1-CONTENT-VERSION-MEDIA-ASSET-REF-SCHEMA (round 1)

## STATUS

`BLOCKED_BY_TEST_ENVIRONMENT` — the implementation is complete and in-scope;
every approved gate the executor sandbox permits runs and exits 0 (frozen
install, dual-dialect `db:generate` first + clean final run, local D1 migration +
idempotency re-run, task-file Prettier `--write`, focused Vitest, full Vitest,
read-only Git). The whole-repo aggregate gate `format:check` is auto-denied by
this session's sandbox with no approval surface (identical to the T111–T115,
T117–T120 block). It was attempted exactly once and denied; the denial states any
further approval-requiring command is denied the same way for the rest of the
session, so per TASK item 5 ("record its exact denial once and stop without retry
or bypass") the same-class gates `types:check`, `lint`, `build` and `ci:check`
were NOT separately re-attempted, and no exit code exists for any of the five.
This is reported honestly as an environment limitation, not as passing and not as
a scope/code deviation. No `PASS` verdict is written by the implementation round.

## TASK ID

`T121-M1-CONTENT-VERSION-MEDIA-ASSET-REF-SCHEMA` — implementation round 1. No
`REVIEW.md` existed at round start (verified `ls` of the task directory showed
only `TASK.md`); none was created.

## IMPLEMENTATION SUMMARY

Added the normalized, Project-scoped `content_package_versions` → `media_assets`
reference contract across both dialects (D1/SQLite + PostgreSQL). This replaces
the V1.0 conceptual `asset_ids[]` array on a content version with explicit
relational rows (05_DOMAIN_DATA_MODEL.md §10 ContentVersion `asset_ids[]`;
09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §1 canonical source `asset://<id>` and §2
"assets"; 21_TEST_ACCEPTANCE_PLAN.md §10 "ContentVersion 保存 ... evidence refs").
This slice is schema/contract ONLY: it does not upload, store, transform, evaluate
rights on, render, publish or otherwise act on an asset (TASK GOAL and item 3).

Storage contract shipped:

- `content_package_version_media_assets` (both dialects): stable text `id` (PK),
  explicit NOT NULL `project_id` (FK → `projects(id)` ON DELETE CASCADE),
  required `content_package_version_id`, required `media_asset_id`, and the
  append-only `created_at` timestamp only (TASK item 1).
- Same-Project ContentVersion ownership is database-enforced by the
  Project-leading composite FK
  `(project_id, content_package_version_id) -> content_package_versions(project_id, id)`
  ON DELETE CASCADE.
- Same-Project MediaAsset ownership is database-enforced by the Project-leading
  composite FK
  `(project_id, media_asset_id) -> media_assets(project_id, id)`
  ON DELETE CASCADE.
- Both composite-FK target unique indexes already exist on the accepted parents
  and are REUSED: `content_package_versions_project_id_id_idx` (added by the
  accepted T119 migrations, D1 0064 / PG 0042) and
  `media_assets_project_id_id_idx` (added by the accepted T114/T115 migrations,
  D1 0061 / PG 0039). Per TASK item 2 this slice therefore adds NO index to
  either parent.
- Edge identity `(content_package_version_id, media_asset_id)` is the ONLY
  business uniqueness (unique index
  `content_package_version_media_assets_unique_content_package_version_media_asset_idx`);
  the media-asset → versions read path is served by the reverse non-unique index
  `content_package_version_media_assets_media_asset_idx`. No other business
  uniqueness or lookup index exists on the table (TASK item 2).
- Immutable reference shape preserved: no `updated_at`, no JSON id array, no
  asset rights/classification/transformation payload, no upload/storage mutation,
  no published-media behavior, no release/publishing behavior, and no CRUD/UI
  (TASK items 1 and 3). Asset metadata/rights/classification state stays on the
  linked `media_assets` row; a later Rights Gate / renderer read follows this
  link without copying state.

## FIELD RECONCILIATION

Sources: the TASK field list (authoritative), `05_DOMAIN_DATA_MODEL.md` §§10–11
(ContentVersion `asset_ids[]`, MediaAsset), `09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md`
§§2–4 and §10, `21_TEST_ACCEPTANCE_PLAN.md` §10, `29_SCOPE_LOCK.md`,
`30_TRACEABILITY_MATRIX.md`, the accepted T114/T115/T117/T118/T119/T120
same-Project relation patterns, and the legacy reference artifacts
`schemas/domain-types.ts` ContentPackageVersion (`assetIds: string[]`) and
`schemas/migrations-reference.sql` `content_package_versions` (`asset_ids_json`).
Reference artifacts are read-only and were NOT edited.

| ContentVersion→MediaAsset aspect | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). |
| `project_id` | explicit non-null Project ownership | NOT NULL FK → projects(id) ON DELETE CASCADE. |
| `content_package_version_id` | required ContentVersion | NOT NULL text id; same-Project composite FK `(project_id, content_package_version_id) -> content_package_versions(project_id, id)` ON DELETE CASCADE (parent target is the accepted `content_package_versions_project_id_id_idx` from T119 — reused, not recreated). |
| `media_asset_id` | required MediaAsset | NOT NULL text id; same-Project composite FK `(project_id, media_asset_id) -> media_assets(project_id, id)` ON DELETE CASCADE (parent target is the accepted `media_assets_project_id_id_idx` from T114/T115 — reused, not recreated). |
| `created_at` | creation timestamp only | NOT NULL text timestamp with DB default; the ONLY audit column. |
| `asset_ids[]` / `asset_ids_json` | V1.0 conceptual array / legacy JSON column | Reconciled to this normalized relation (TASK GOAL + item 3) — no JSON/text array column exists on `content_package_versions` or on this relation. |
| asset upload / object storage / transformation | 15_MEDIA_ASSET_SPEC; TASK item 3 | Reconciled OUT — this link stores an opaque reference id only. |
| rights evaluation / `rights_status` policy | 09 spec §9; 15 spec; TASK item 3 | Reconciled OUT — `rights_status`/`classification` state stays on the `media_assets` row; no Rights Gate runtime is added. |
| PublishedMediaRef | §11; T115 slice | Separate accepted table — NOT duplicated or replaced here. |
| business uniqueness | TASK item 2 forbids beyond the edge identity | NOT shipped — the only unique index on the table is `(content_package_version_id, media_asset_id)`; both parent targets already existed and were reused, so no parent index is added. |

## RELATION / FK / IDENTITY / DELETE DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project integrity: the Project-leading composite FKs
  `(project_id, content_package_version_id) -> content_package_versions(project_id, id)`
  and `(project_id, media_asset_id) -> media_assets(project_id, id)`, both
  ON DELETE CASCADE (the accepted T114/T115/T119/T120 same-Project pattern). A
  link whose version or media asset belongs to a different Project has no
  matching parent row in EITHER direction and is rejected by the DB; dangling
  version/media-asset/Project rows are likewise rejected.
- Reused parent targets only: no index is added to `content_package_versions`
  (its accepted `content_package_versions_project_id_id_idx` from T119 is reused)
  or to `media_assets` (its accepted `media_assets_project_id_id_idx` from
  T114/T115 is reused). This is what TASK item 2 requires.
- Edge identity: unique index `(content_package_version_id, media_asset_id)` —
  one row per ContentVersion/MediaAsset edge. Both columns are globally unique
  PKs, so once the same-Project FKs hold the pair is project-isolated without
  listing `project_id` (the accepted search_topic_keyword_refs /
  claim_source_refs / content_package_version_claims /
  content_package_version_source_refs mapping pattern). The reverse
  `media_asset_id` index serves media-asset → versions reads.
- Delete behavior: ON DELETE CASCADE on the Project FK and on BOTH composite
  parent FKs — deleting a content package version, a media asset, or a whole
  Project cascades its links away, so an edge can never dangle. Cascading the
  local link row does NOT delete the R2 source asset
  (15_MEDIA_ASSET_SPEC.md §7); only the stored pointer is removed.
- Immutability: the relation row carries `created_at` only; no `updated_at` and
  no mutable payload. The immutable reference shape replaces the conceptual
  `asset_ids[]` array (TASK GOAL).

## MIGRATION IDS

- D1/SQLite: `drizzle/0066_glossy_microbe.sql` (+ `drizzle/meta/0066_snapshot.json`,
  `drizzle/meta/_journal.json` idx 66). Drizzle generated the child table +its
  edge-identity unique index + the media-asset reverse index; no parent index
  statement is present because both composite targets already exist from 0061 and
  0064. The order is valid for SQLite (FK parent-key uniqueness is enforced at
  DML time) and the local D1 migration applied 0066 successfully, so the SQLite
  file was left as generated (no manual edit).
- PostgreSQL: `drizzle-pg/0044_silly_gideon.sql` (+
  `drizzle-pg/meta/0044_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 44).
  The generated file adds the child table, the three FK constraints, and the two
  indexes. No FK-before-parent-index reorder was required: both referenced unique
  indexes (`content_package_versions_project_id_id_idx` from PG 0042 and
  `media_assets_project_id_id_idx` from PG 0039) already exist in earlier
  accepted migrations, so the file is exactly as generated (no manual edit).

Accepted migrations (SQLite ≤ 0065, PG ≤ 0043) were NOT edited. Clean final
dual-dialect `db:generate` re-run reports `No schema changes, nothing to migrate
😴` on both dialects (57 tables each).

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — updated the header `max-lines` eslint-disable
  comment to include T121 content_package_version_media_assets; appended the
  `contentPackageVersionMediaAssets` sqliteTable at end of file with a full
  field-reconciliation/same-Project/edge-identity comment block.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror (same
  columns/constraints/indexes with the `isoNow` `created_at` default); header
  comment updated the same way.
- `src/db/schema.ts` — destructured barrel export adds
  `contentPackageVersionMediaAssets` after `contentPackageVersionSourceRefs`.
- `drizzle/meta/_journal.json` and `drizzle-pg/meta/_journal.json` —
  `db:generate` journal entries (idx 66 / idx 44).

Added (untracked):

- `drizzle/0066_glossy_microbe.sql` and `drizzle/meta/0066_snapshot.json`.
- `drizzle-pg/0044_silly_gideon.sql` and `drizzle-pg/meta/0044_snapshot.json`.
- `src/db/content-package-version-media-asset-ref.test.ts` — the migration-backed
  storage spec (12 tests).

Task-channel file for this round: `DELIVERY.md` (this document).

## DATABASE/MIGRATION CHANGES

- New `content_package_version_media_assets` table on both dialects (5 columns /
  2 indexes / 3 fks each): D1 0066 and PG 0044.
- NO index is added to `content_package_versions` or `media_assets` — both
  same-Project composite-FK targets already exist and are reused (TASK item 2).
  `content_package_versions` stays 11 columns / 2 indexes / 2 fks and
  `media_assets` stays 9 columns / 2 indexes / 1 fk on each dialect (confirmed by
  the `db:generate` table report).
- Snapshots (`0066_snapshot.json` / `0044_snapshot.json`) and journals (idx 66 /
  idx 44) written by `db:generate`. 57 tables on each dialect (56 accepted + 1).

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install
used the existing lockfile).

## TESTS ADDED

- `src/db/content-package-version-media-asset-ref.test.ts` — 12 migration-backed
  storage tests that build a real in-memory SQLite client, enable
  `PRAGMA foreign_keys = ON`, hand-create the `projects` table, and apply the
  actual shipped forward-migration DDL in order (`0045` market profiles, `0046`
  topics, `0049` prompts, `0055` opportunities, `0056` source_refs, `0057`
  claims — required because 0064's `content_package_version_claims` FK needs the
  claims table — `0060` media_assets, `0061` the T115 `media_assets` composite
  target, `0062` content_packages, `0063` content_package_versions, `0064` the
  reused `content_package_versions_project_id_id_idx` composite-FK target, then
  `0066` the new `content_package_version_media_assets`, split on
  `--> statement-breakpoint`). The DDL is the source of truth, so the Project FK,
  the two same-Project composite FKs, the delete cascades, the edge identity and
  the NOT NULL rules are exercised — not an application convention. Tests cover:
  valid same-Project persistence with the full TASK field set + `created_at`
  default; cross-Project MediaAsset rejection; cross-Project ContentPackageVersion
  rejection (both directions); dangling-version, dangling-media-asset and
  dangling-Project FK rejection; duplicate
  `(content_package_version_id, media_asset_id)` rejection; NOT NULL rejection of
  each direct column (`id`, `project_id`, `content_package_version_id`,
  `media_asset_id`); content-package-version-delete cascade; media-asset-delete
  cascade; whole-Project delete cascade (links + versions + media assets +
  packages + topics); and the exact normalized relation column-shape assertion
  (the 5 link columns only — no `updated_at`, no asset rights/classification
  payload, no JSON id-array column).
- Dialect parity: the new table is auto-picked-up by the existing
  `src/db/schema-parity.test.ts` (now 294 tests: +5 per-table assertions for the
  new table — columns/PK/unique/FKs/checks), which structurally compares every
  SQLite and PG table. It also confirms both dialects report the same structural
  change and that no index was added to either parent.

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no commit/merge/push).

1. `corepack pnpm install --frozen-lockfile` → exit 0 (lockfile up to date,
   resolution skipped; 980 packages; ignored-build-scripts warning only).
2. `corepack pnpm run db:generate` (dual-dialect, first run) → exit 0 — produced
   `drizzle/0066_glossy_microbe.sql` and `drizzle-pg/0044_silly_gideon.sql` with
   snapshots + journal entries (57 tables on both dialects;
   `content_package_version_media_assets` = 5 columns / 2 indexes / 3 fks on both;
   no parent index added).
3. `corepack pnpm run db:migrate:local` (apply local D1 state) → exit 0 —
   0000 → 0066 all ✅ (`0066_glossy_microbe.sql` ✅).
4. Task-file Prettier `--write` (each of the 4 changed/new source files, one at a
   time) → exit 0 (`unchanged` on all four; already formatted).
5. Focused Vitest (`corepack pnpm exec vitest run` with the 7 task-related files)
   → exit 0 — 7 files / 363 tests passed (12 media-asset-ref + 12 source-ref + 12
   claim + 14 version + 9 media-asset + 10 published-media-ref + 294 parity).
6. `corepack pnpm run db:migrate:local` (idempotency re-run) → exit 0 —
   `✅ No migrations to apply!`.
7. `corepack pnpm run db:generate` (dual-dialect, clean final run) → exit 0 —
   both dialects: 57 tables, `No schema changes, nothing to migrate 😴`.
8. Full Vitest (`corepack pnpm exec vitest run`, default parallelism) → first run
   174 files / 1576 passed + 1 failed; the only failure was
   `src/server/mcp/oauth-refresh.e2e.test.ts` `beforeEach` cold-import hook timeout
   (30000ms) under full-suite parallel load — unrelated to this task. Re-run of
   that file alone → 8/8 passed in 2.4s (confirms flake). Full suite re-run →
   exit 0 — **174 files / 1577 tests passed** (completed 100.31s).
9. `corepack pnpm run format:check` → **sandbox auto-denied; no exit code.**
   Exact denial: "Permission for this tool use was denied. It requires approval,
   and this session has no approval surface — nobody can answer a permission
   prompt here — so it was denied automatically. … What required approval: This
   Bash command contains multiple operations. The following part requires
   approval: corepack pnpm run format:check." Recorded once; per TASK item 5 the
   same-class whole-repo gates `types:check`, `lint`, `build`, `ci:check` were not
   separately re-attempted/bypassed — the denial states any approval-requiring
   command is denied the same way for the rest of the session.
10. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`) → exit 0 — `git diff --check` clean (no output).

## COMMAND RESULTS

Passing on the final tree: frozen install exit 0; dual-dialect `db:generate`
first run exit 0 (57 tables each) and clean final run exit 0 (`No schema changes,
nothing to migrate 😴` on both dialects); local D1 migration exit 0 (0000 → 0066
applied ✅, then idempotent `✅ No migrations to apply!`); task-file Prettier
`--write` exit 0; focused Vitest **7 files / 363 tests** exit 0; full Vitest
**174 files / 1577 tests** exit 0 at default parallelism on the final run
(completed 100.31s); read-only Git inspection clean (`git diff --check` clean).

Transient flake (reported, not hidden): the first full-suite run had exactly one
failure — `src/server/mcp/oauth-refresh.e2e.test.ts`'s `beforeEach` cold-import
hook exceeded its 30s timeout under full-suite parallel load (its own comment
notes cold-importing the provider graph is slow on a Windows checkout). The file
passes 8/8 in isolation (2.4s) and passed in the subsequent full-suite run; the
test does not touch the schema or migrations.

Environment limitation (reported, not hidden): the sandbox auto-approval grant
list for this executor session does not include `format:check` (nor, by the
denial's own statement, any other approval-requiring command). `format:check`
was attempted as a standalone invocation and auto-denied; per TASK item 5 the
exact denial was recorded once and no retry/bypass was attempted, and the
same-class whole-repo gates `types:check`, `lint`, `build`, `ci:check` were not
separately re-attempted. **No exit code exists for any of the five gates in this
session.** This is the same environment block recorded for T111–T115, T117, T118,
T119 and T120.

## RUNTIME EVIDENCE

- Full-suite Vitest final run: `Test Files 174 passed (174)`, `Tests 1577 passed
  (1577)`, exit 0 at default parallelism. The new storage spec's 12 tests and the
  extended parity suite (294) pass inside it. (1577 = prior accepted count 1560 +
  12 media-asset-ref storage tests + 5 parity assertions for the new table.)
- Focused Vitest: 7 files / 363 tests, exit 0 (12 media-asset-ref + 12 source-ref
  + 12 claim + 14 version + 9 media-asset + 10 published-media-ref + 294 parity).
- `db:migrate:local`: 0066 applied successfully (✅) on the local D1 state;
  re-run reports `✅ No migrations to apply!`, exit 0 (journal complete and
  idempotent).
- `db:generate` final: D1 then PG each print 57 tables and `No schema changes,
  nothing to migrate 😴`, exit 0 — confirms both dialects' schemas exactly match
  their snapshots with no drift; `content_package_version_media_assets` = 5
  columns / 2 indexes / 3 fks on both, and the two reused parent tables are
  unchanged (`content_package_versions` 11/2/2, `media_assets` 9/2/1).
- Read-only Git inspection: `git diff --check` clean; file set below is exactly
  the intended change set.
- Five full-repo gates: no exit codes (sandbox auto-denied) — see COMMAND
  RESULTS / KNOWN LIMITATIONS.

## KNOWN LIMITATIONS

- The `format:check` / `types:check` / `lint` / `build` / `ci:check` gates remain
  non-executable in this executor session: the sandbox auto-denies the aggregate
  whole-repo command class with no approval surface, so no exit code exists for
  any of the five (TASK item 5's "every runnable gate must exit 0" therefore
  cannot be fully evidenced here). This is the same environment block recorded
  across T111–T115, T117–T120 and is reported as `BLOCKED_BY_TEST_ENVIRONMENT` —
  a test-environment limitation, not a scope or code deviation. The runnable
  matrix (frozen install, dual-dialect `db:generate` first + clean final run,
  local migration + re-run, focused and full Vitest, task-file Prettier,
  read-only Git) all pass, including a clean full-suite exit 0. A grant-enabled
  session, the controller/QA under the Product Owner's bounded
  acceptance-verification exception, or a human gate must produce the five exit
  codes before final acceptance.
- Type/lint surface for the new module could not be checked by `tsc`/`oxlint`
  this round (sandbox-denied); it is the same idiom as the accepted
  claim_source_refs / content_package_version_claims /
  content_package_version_source_refs same-Project modules, and the focused +
  full Vitest suites import and execute the new module and both schema mirrors at
  runtime (parity compares every column/index/FK/check between dialects).
- One transient full-suite flake was observed (OAuth e2e cold-import hook
  timeout), unrelated to this task and passing both in isolation and on the
  subsequent full run — see COMMAND RESULTS.
- Scope-shape notes (by design, not defects): the relation is schema/contract
  only — no asset upload/storage/transformation, rights evaluation, mutable asset
  payload, JSON id-array column, rendered/published-media, release/publishing
  behavior or CRUD/UI; the only business uniqueness is the edge identity
  `(content_package_version_id, media_asset_id)` and no parent index is added
  (both composite targets are reused per TASK item 2).

## DEVIATIONS FROM TASK

None in scope, field set, ownership rule, delete behavior, index set or
migration IDs. The relation ships D1 `0066` and PostgreSQL `0044` as required
with forward snapshots + journals; same-Project ownership is enforced by the two
Project-leading composite FKs `(project_id, content_package_version_id) ->
content_package_versions(project_id, id)` and `(project_id, media_asset_id) ->
media_assets(project_id, id)`; both parent composite target indexes are the
accepted ones (`content_package_versions_project_id_id_idx` from T119,
`media_assets_project_id_id_idx` from T114/T115) and are reused with NO new parent
index (TASK item 2); the composite FKs, the Project FK, and the whole-Project
delete all cascade; and the only business uniqueness is the edge identity
`(content_package_version_id, media_asset_id)` with no JSON id array, asset
upload/storage/transformation, rights evaluation, published-media, release/
publishing, or CRUD/UI surface. No generated-file adjustment was needed: both
`0066_glossy_microbe.sql` and `0044_silly_gideon.sql` are exactly as generated
because both composite parent unique indexes already exist from earlier accepted
migrations. The only non-`0` outcome is environmental: the five full-repo gates
could not be granted by the sandbox in this round (see KNOWN LIMITATIONS) —
reported as an environment limitation, not a scope deviation.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state (`db:migrate:local`) and in-memory
  SQLite built from the shipped forward-migration DDL.
- No network/provider/publishing action occurred. No asset upload, object
  storage, URL fetch, rights evaluation or transformation occurred. No commit,
  merge, or push was performed. No `main` branch was touched.
- TASK-approved command names only; the one denied invocation (`format:check`)
  was abandoned without retry or bypass after the sandbox denial, and the
  same-class whole-repo gates were not separately re-attempted per the denial
  guidance.
- No asset rights/classification/verification payload, Rights Gate evaluation,
  release/approval or publishing behavior was added (out of scope); the slice
  adds persistence/contract surface only. The relation row is immutable
  (`created_at` only), asset state stays on the `media_assets` row, and no
  content or asset leaves the project in this slice.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T121-M1-CONTENT-VERSION-MEDIA-ASSET-REF-SCHEMA`; working tree
  is NOT committed (rounds stop at delivery). Recent commit on the branch:
  `9280888 control: dispatch T121 content version media asset refs`.
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json` (db:generate journal entries);
  `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
  `src/db/schema.ts`.
- Added (untracked) files (5): `drizzle/0066_glossy_microbe.sql`,
  `drizzle/meta/0066_snapshot.json`, `drizzle-pg/0044_silly_gideon.sql`,
  `drizzle-pg/meta/0044_snapshot.json`,
  `src/db/content-package-version-media-asset-ref.test.ts`.
- Task-channel file: `control/tasks/T121-M1-CONTENT-VERSION-MEDIA-ASSET-REF-SCHEMA/DELIVERY.md`
  (this document). `REVIEW.md` did not exist at round start and was not created.
- `git diff --stat` (tracked): 5 files, +209/−2. `git diff --check` clean.
- No other files are dirty or untracked.

## READY FOR REVIEW

Implementation round 1 is complete and in-scope: the normalized, Project-scoped
`content_package_version_media_assets` relation ships on both dialects with
forward migrations 0066/0044, snapshots, journals, database-enforced same-Project
ownership via the Project-leading composite FKs to `content_package_versions`
and `media_assets`, ON DELETE CASCADE on the Project/ContentVersion/MediaAsset
FKs, the edge-identity unique index
`(content_package_version_id, media_asset_id)`, an append-only `created_at` only
(immutable reference shape — no `updated_at`, no JSON id array, no asset
rights/transformation payload, no gate/release/publishing/CRUD surface), and no
other business uniqueness. Both composite-FK target indexes are the accepted
parent indexes and are reused, so neither parent table gains an index (TASK item
2). Runnable approved gates pass on the final tree: frozen install exit 0,
dual-dialect `db:generate` first + clean final run exit 0 (`No schema changes,
nothing to migrate` on both dialects), local D1 migration exit 0 (0000 → 0066
applied, idempotent on re-run), task-file Prettier `--write` exit 0, focused
Vitest 7 files / 363 tests exit 0, full Vitest 174 files / 1577 tests exit 0
(default parallelism; one unrelated OAuth e2e cold-import flake on an earlier run
passed in isolation and on the final run), and read-only Git clean. The five
full-repo gates (`format:check`, `types:check`, `lint`, `build`, `ci:check`)
could not be executed because the sandbox auto-denies them with no approval
surface (no exit codes), so status is reported as `BLOCKED_BY_TEST_ENVIRONMENT`.
No `PASS` verdict is written by the implementation round.
