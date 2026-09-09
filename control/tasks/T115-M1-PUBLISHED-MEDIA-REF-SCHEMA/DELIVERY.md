# DELIVERY — T115-M1-PUBLISHED-MEDIA-REF-SCHEMA (round 1)

## STATUS

`BLOCKED_BY_TEST_ENVIRONMENT` — the implementation itself is complete and
in-scope; every approved gate that the executor sandbox permits runs and exits 0
(local D1 migration + idempotency re-run, dual-dialect `db:generate` first +
clean final run, task-file Prettier, focused Vitest, full Vitest, read-only Git).
The five whole-repo gates required by TASK item 5 (`format:check`, `types:check`,
`lint`, `build`, `ci:check`) are auto-denied by this session's sandbox with no
approval surface — no exit code exists for any of them (each exact command was
attempted exactly once and abandoned). This is the same environment block
recorded across T111 rounds 1–3, T112 rounds 1–2, T113 round 1 and T114 round 1,
and is reported honestly as an environment limitation, not as passing and not as
a scope/code deviation.

## TASK ID

`T115-M1-PUBLISHED-MEDIA-REF-SCHEMA` — implementation round 1.

## IMPLEMENTATION SUMMARY

Added the internal, Project-scoped `published_media_refs` persistence contract
across both dialects (D1/SQLite + PostgreSQL). This is schema/contract only: it
records a media asset's opaque remote reference without any publisher connector,
account authorization, upload, remote API call, URL-reachability check,
publication execution, or public-verification behavior.

Storage contract shipped:

- `published_media_refs` (both dialects): stable text `id` (PK), explicit
  `project_id` (NOT NULL FK → `projects(id)` ON DELETE CASCADE), `media_asset_id`
  (NOT NULL), opaque `platform` (NOT NULL), the four nullable opaque remote
  fields `account_id` / `external_media_id` / `public_url` / `sha256`, plus the
  creation audit timestamp `created_at`
  (DEFAULT `(current_timestamp)` / PG `to_char(now() AT TIME ZONE 'utc', ...)`).
- Same-Project ownership is database-enforced by a composite FK
  `(project_id, media_asset_id) → media_assets(project_id, id)` ON DELETE
  CASCADE. That FK needs a unique referential target on the parent, so the new
  migrations add exactly one supporting unique index to the accepted T114
  `media_assets` table (`media_assets_project_id_id_idx` on `(project_id, id)`) —
  added in the new forward migrations, never by editing the accepted 0060/0038.
- Two non-unique lookup indexes on the reference row:
  `published_media_refs_project_idx` (project_id) and
  `published_media_refs_media_asset_idx` (media_asset_id).
- No invented semantics: no success/status/verification column, no account
  credentials/secret columns, no publication-uniqueness rule, and no public-
  verification behavior (TASK item 3). A row is only a stored reference — never
  proof of public success.

## FIELD RECONCILIATION

Sources: `05_DOMAIN_DATA_MODEL.md` §11 PublishedMediaRef (the TASK field list is
authoritative), `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, the accepted
T114 MediaAsset schema/migration/tests, and the legacy reference artifacts
`schemas/domain-types.ts` PublishedMediaRef and
`schemas/migrations-reference.sql` published_media_refs. Reference artifacts are
read-only and were NOT edited.

| PublishedMediaRef aspect | TASK field list (authoritative) | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). |
| `project` / Project scope | explicit Project ownership | NOT NULL FK → projects(id) ON DELETE CASCADE. |
| `media_asset_id` | the referenced MediaAsset | NOT NULL plain text id (NOT unique). |
| `platform` | opaque `platform` | NOT NULL opaque text, stored verbatim (`WeChat-OA`, `YouTube`). No platform allowlist. |
| `account_id` | nullable opaque account | Nullable opaque text, stored verbatim; no credential semantics. |
| `external_media_id` | §11/legacy nullable | Nullable opaque text, stored verbatim; no parsing/verification. |
| `public_url` | §11/legacy nullable | Nullable opaque text URL, stored verbatim; no reachability/remote check (out of scope). |
| `sha256` | optional remote sha256 | Nullable opaque text, stored verbatim; plain column, no uniqueness. |
| `created_at` | creation timestamp | NOT NULL text timestamp, DB default (established convention). |
| `adapter_version` | §15_MEDIA_ASSET_SPEC §4 only | Reconciled OUT — not present in the TASK field list; no adapter contract is authorized here. |
| `updated_at` / `deleted_at` | (not in the TASK field list) | NOT shipped — append-only reference row; a later workflow that mutates in place adds its own forward migration. |
| success/status/verified columns | (not in the TASK field list) | NOT shipped — TASK item 3 forbids inventing success/status/public-verification semantics; a row is only a stored reference. |
| publication uniqueness | (not in the TASK field list) | NOT shipped — no unique index beyond the PK and the composite-FK referential target. |

## RELATION / FK / IDENTITY / DELETE DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project integrity: composite FK
  `(project_id, media_asset_id) → media_assets(project_id, id)` ON DELETE CASCADE
  with `project_id` leading (the accepted T111–T114 same-Project pattern). It
  makes it impossible to record a reference whose asset belongs to a different
  Project in EITHER direction and impossible to attach a reference to a dangling
  asset.
- Necessary referential parent key only: the single added unique index on
  `media_assets (project_id, id)` (`media_assets_project_id_id_idx`) exists solely
  as the composite-FK target. It is NOT a business-uniqueness rule on media
  assets (the media_assets `id` PK remains the asset identity); TASK item 3
  forbids publication/dedup uniqueness, and none is added to
  `published_media_refs` itself.
- Delete behavior: ON DELETE CASCADE on BOTH the Project FK and the composite
  media-asset FK — deleting a media asset, or a whole Project, cascades its
  references away, so a stored reference can never dangle.
- Indexes: only the Project FK path (`published_media_refs_project_idx`), the
  media-asset FK/lookup path (`published_media_refs_media_asset_idx`), and the
  required referential unique target on the parent. No business/unique index on
  the reference row.
- Creation audit only: `created_at` with a DB default; no `updated_at`.

## MIGRATION IDS

- D1/SQLite: `drizzle/0061_windy_sally_floyd.sql` (+
  `drizzle/meta/0061_snapshot.json`, `drizzle/meta/_journal.json` idx 61). Drizzle
  generated the SQLite file with the table + indexes in an order that is valid
  for SQLite (FK parent-key uniqueness is enforced at DML time, so the table can
  precede the parent unique index in the same migration — the accepted
  `drizzle/0057` pattern), so it was left as generated.
- PostgreSQL: `drizzle-pg/0039_fair_doctor_octopus.sql` (+
  `drizzle-pg/meta/0039_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 39).
  Drizzle generated this file with the composite-FK ALTER before the parent
  unique index, which Postgres rejects at FK-ADD time. I rewrote the file to
  create `media_assets_project_id_id_idx` BEFORE the two FK ALTERs (the accepted
  T111 fix pattern recorded in `drizzle-pg/0035`), keeping all other generated
  statements unchanged.

Accepted migrations (SQLite ≤ 0060, PG ≤ 0038) were NOT edited. Clean final
dual-dialect `db:generate` re-run reports `No schema changes, nothing to migrate
😴` on both dialects (52 tables each).

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — rewrote the `mediaAssets` OWNERSHIP /
  NO-BUSINESS-UNIQUENESS comments to state that the new
  `media_assets_project_id_id_idx` unique index exists only as the T115
  composite-FK referential target; added that unique index to the mediaAssets
  callback; appended the `publishedMediaRefs` sqliteTable at end of file with a
  field-reconciliation comment block; header `max-lines` eslint-disable comment
  updated to include T115.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror (same
  unique index + same `publishedMediaRefs` pgTable with `isoNow` default); header
  comment updated the same way.
- `src/db/schema.ts` — destructured barrel export adds `publishedMediaRefs`
  after `mediaAssets`.
- `drizzle/meta/_journal.json` and `drizzle-pg/meta/_journal.json` —
  `db:generate` journal entries (idx 61 / idx 39).

Added (untracked):

- `drizzle/0061_windy_sally_floyd.sql` and `drizzle/meta/0061_snapshot.json`.
- `drizzle-pg/0039_fair_doctor_octopus.sql` and
  `drizzle-pg/meta/0039_snapshot.json`.
- `src/db/published-media-ref.test.ts` — the migration-backed storage spec (10
  tests).

Task-channel file for this round: `DELIVERY.md` (this document). No `REVIEW.md`
existed at round start (verified before implementation); none was created.

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install
used the existing lockfile).

## TESTS ADDED

- `src/db/published-media-ref.test.ts` — 10 migration-backed storage tests that
  build a real in-memory SQLite client, enable `PRAGMA foreign_keys = ON`,
  hand-create the `projects` table, and apply the actual shipped forward-migration
  DDL in order (`drizzle/0060_nervous_gwen_stacy.sql` then
  `drizzle/0061_windy_sally_floyd.sql`, split on `--> statement-breakpoint`). The
  DDL is the source of truth, so the Project FK, the same-Project composite FK,
  and both cascades are exercised — not an application convention. Tests cover:
  valid same-Project persistence with the full §11/TASK field set + `created_at`
  default; verbatim round-trip of the opaque platform/account/external-id/URL/
  sha256 values and exact NULL round-trip of the four nullable remote fields;
  cross-Project rejection in BOTH directions (asset on the other Project, and the
  reference's own `project_id` set to the other Project); dangling-asset and
  dangling-Project FK rejection; NOT NULL rejection of each required direct
  column (`id`, `project_id`, `media_asset_id`, `platform`); media-asset delete
  cascade; whole-Project delete cascade; exact column-shape assertion
  (`account_id, created_at, external_media_id, id, media_asset_id, platform,
  project_id, public_url, sha256` — no adapter_version/status/credential/
  updated/deleted column).
- Dialect parity: the new table is auto-picked-up by the existing
  `src/db/schema-parity.test.ts` (now 269 tests: +5 per-table assertions for the
  new table — columns/PK/unique/FKs/indexes), which structurally compares every
  SQLite and PG table. It also confirms both dialects now report the same
  structural change to `media_assets` (the added unique index).

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no chained shell
operations).

1. `node --version` → v24.16.0.
2. `corepack pnpm --version` → 10.30.1.
3. `corepack pnpm install --frozen-lockfile` → exit 0 (lockfile up to date,
   resolution skipped; 980 packages linked; ignored-build-scripts warning only).
4. `corepack pnpm run db:generate` (dual-dialect, first run) → exit 0 —
   produced `drizzle/0061_windy_sally_floyd.sql` and
   `drizzle-pg/0039_fair_doctor_octopus.sql` with snapshots + journal entries
   (52 tables on both dialects; `published_media_refs` = 9 columns / 2 indexes /
   2 fks on both).
5. `corepack pnpm run db:migrate:local` (apply local D1 state) → exit 0 —
   0000 → 0061 all ✅ (`0061_windy_sally_floyd.sql` ✅).
6. Task-file Prettier: `corepack pnpm exec prettier --write <4 changed/new task
   source files>` → exit 0 (the two schema files and schema.ts already formatted
   — unchanged; the new storage test reformatted).
7. Focused Vitest (`corepack pnpm exec vitest run` with the 3 task-related
   files) → exit 0 — 3 files / 288 tests passed (10 storage + 9 media-asset +
   269 parity).
8. `corepack pnpm run db:generate` (dual-dialect, clean final run) → exit 0 —
   both dialects: 52 tables, `No schema changes, nothing to migrate 😴`.
9. `corepack pnpm run db:migrate:local` (idempotency re-run) → exit 0 —
   `✅ No migrations to apply!`.
10. Full Vitest (`corepack pnpm exec vitest run`, default parallelism) → exit 0
    (completed at 169.02s) — **169 files / 1488 tests passed**.
11. `corepack pnpm run format:check` → **sandbox auto-denied; no exit code**.
12. `corepack pnpm run types:check` → **sandbox auto-denied; no exit code**.
13. `corepack pnpm run lint` → **sandbox auto-denied; no exit code**.
14. `corepack pnpm run build` → **sandbox auto-denied; no exit code**.
15. `corepack pnpm run ci:check` → **sandbox auto-denied; no exit code**.
16. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`) → exit 0 — `git diff --check` clean.

## COMMAND RESULTS

Passing on the final tree: frozen install exit 0; local D1 migration exit 0
(0000 → 0061 applied ✅, then idempotent `✅ No migrations to apply!`); clean
final dual-dialect `db:generate` exit 0 (`No schema changes, nothing to migrate
😴` on both dialects, 52 tables each); task-file Prettier exit 0; focused Vitest
**3 files / 288 tests** exit 0; full Vitest **169 files / 1488 tests** exit 0 at
default parallelism (completed 169.02s); read-only Git inspection clean
(`git diff --check` clean).

Environment limitation (reported, not hidden): the sandbox auto-approval grant
list for this executor session does not include `format:check`, `types:check`,
`lint`, `build`, `ci:check`. Each exact approved command was attempted as a
standalone invocation and auto-denied with no approval surface to escalate to, so
**no exit code exists for any of the five gates in this session**. The denial
message instructs not to claim success and not to retry; each was attempted
exactly once and abandoned. This is the same environment block recorded for T111
rounds 1–3, T112 rounds 1–2, T113 round 1 and T114 round 1.

## RUNTIME EVIDENCE

- Full-suite Vitest: `Test Files 169 passed (169)`, `Tests 1488 passed (1488)`,
  exit 0 at default parallelism. The new storage spec's 10 tests and the extended
  parity suite (269) pass inside it. (1488 = prior accepted count 1473 + 10
  published-media-ref storage tests + 5 parity assertions for the new table.)
- Focused Vitest: 3 files / 288 tests, exit 0 (10 storage + 9 media-asset + 269
  parity).
- `db:migrate:local`: 0061 applied successfully (✅) on the local D1 state;
  re-run reports `✅ No migrations to apply!`, exit 0 (journal complete and
  idempotent).
- `db:generate` final: D1 then PG each print 52 tables and `No schema changes,
  nothing to migrate 😴`, exit 0 — confirms both dialects' schemas exactly match
  their snapshots with no drift; `published_media_refs` = 9 columns / 2 indexes /
  2 fks and `media_assets` = 9 columns / 2 indexes / 1 fk on both.
- Read-only Git inspection: `git diff --check` clean; file set below is exactly
  the intended change set.
- Five full-repo gates: no exit codes (sandbox auto-denied) — see COMMAND
  RESULTS / KNOWN LIMITATIONS.

## KNOWN LIMITATIONS

- The `format:check` / `types:check` / `lint` / `build` / `ci:check` gates
  remain non-executable in this executor session: the sandbox auto-denies each
  exact command with no approval surface, so no exit code exists for any of the
  five (TASK item 5's "every gate must exit 0" therefore cannot be fully
  evidenced here). This is the same environment block recorded across T111 rounds
  1–3, T112 rounds 1–2, T113 round 1 and T114 round 1 and is reported as
  `BLOCKED_BY_TEST_ENVIRONMENT` — a test-environment limitation, not a scope or
  code deviation. The runnable matrix (frozen install, local migration + re-run,
  dual-dialect `db:generate` first + clean final run, focused and full Vitest,
  task-file Prettier, read-only Git) all pass. A grant-enabled session, the
  controller/QA under the Product Owner's bounded acceptance-verification
  exception, or a human gate must produce the five exit codes before final
  acceptance.
- Type/lint surface for the new module could not be checked by `tsc`/`oxlint`
  this round (sandbox-denied); it is the same idiom as the accepted
  claims/source-ref same-Project modules, and the focused + full Vitest suites
  import and execute the new module and both schema mirrors at runtime (parity
  compares every column/index/FK between dialects).
- Scope-shape notes (by design, not defects): the table is schema/contract only —
  no publisher connector, upload, account authorization, remote API call, URL
  reachability check, publication execution, `PUBLIC_VERIFIED` logic, CRUD/UI,
  or success/status semantics; `platform`/`account_id`/`external_media_id`/
  `public_url`/`sha256` are opaque verbatim text; `created_at` is DB-defaulted
  text (the established convention) and no `updated_at`/`deleted_at`/
  credential/secret/adapter-version column is shipped (see FIELD
  RECONCILIATION).

## DEVIATIONS FROM TASK

None in scope, field set, ownership rule, delete behavior, index set or
migration IDs. The table ships D1 `0061` and PostgreSQL `0039` as required with
forward snapshots + journals; same-Project ownership is enforced by the composite
FK `(project_id, media_asset_id) → media_assets(project_id, id)` with the single
necessary referential parent key `media_assets_project_id_id_idx`; both FKs
cascade on delete; the four nullable opaque fields round-trip NULL exactly; and
only the creation audit timestamp is added. The one generated-file adjustment is
an implementation detail required for PostgreSQL correctness: `drizzle-pg/0039`
was reordered so the parent unique index is created before the composite-FK ALTER
(the accepted T111 fix pattern in `drizzle-pg/0035`); the SQLite 0061 ordering
was left as generated (valid for SQLite). The only non-`0` outcome is
environmental: the five full-repo gates could not be granted by the sandbox in
this round (see KNOWN LIMITATIONS) — reported as an environment limitation, not a
scope deviation.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state (`db:migrate:local`) and
  in-memory SQLite built from the shipped forward-migration DDL.
- No network/provider/publishing action occurred. No commit, merge, or push was
  performed. No `main` branch was touched.
- TASK-approved command names only; every denied invocation was abandoned
  without retry or bypass after the sandbox denial.
- No upload, account authorization, remote API call, URL-reachability check,
  publication execution or `PUBLIC_VERIFIED` behavior was added (out of scope);
  the slice adds persistence/contract surface only. `account_id` is stored as an
  opaque nullable identifier — it is never interpreted as a credential, and no
  secret/credential column exists on the row.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T115-M1-PUBLISHED-MEDIA-REF-SCHEMA`; working tree is NOT
  committed (rounds stop at delivery). Recent commits on the branch: `288153f
  control: accept T114 and dispatch T115`, `a3231e8 merge: accept T114 media
  asset schema`, `729c6dd feat(search-growth): add media asset schema`.
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json` (db:generate journal entries);
  `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
  `src/db/schema.ts`.
- Added (untracked) files (5): `drizzle/0061_windy_sally_floyd.sql`,
  `drizzle/meta/0061_snapshot.json`, `drizzle-pg/0039_fair_doctor_octopus.sql`,
  `drizzle-pg/meta/0039_snapshot.json`, `src/db/published-media-ref.test.ts`.
- Task-channel file: `control/tasks/T115-M1-PUBLISHED-MEDIA-REF-SCHEMA/DELIVERY.md`
  (this document). `REVIEW.md` did not exist at round start and was not created.
- `git diff --stat` (tracked): 5 files, +267/−12. `git diff --check` clean.
- No other files are dirty or untracked.

## READY FOR REVIEW

Implementation round 1 is complete and in-scope: the internal, Project-scoped
`published_media_refs` table ships on both dialects with forward migrations
0061/0039, snapshots, journals, database-enforced same-Project ownership via the
composite FK to the media asset (plus its single necessary referential unique
target on `media_assets`), ON DELETE CASCADE on both the Project and media-asset
FKs, verbatim opaque remote fields, and no invented success/status/uniqueness/
credential semantics. Runnable approved gates pass on the final tree: frozen
install exit 0, local D1 migration exit 0 (0000 → 0061 applied, idempotent on
re-run), clean final dual-dialect `db:generate` exit 0 (`No schema changes,
nothing to migrate` on both dialects), task-file Prettier exit 0, focused Vitest
3 files / 288 tests exit 0, full Vitest 169 files / 1488 tests exit 0 (default
parallelism), and read-only Git clean. The five full-repo gates (`format:check`,
`types:check`, `lint`, `build`, `ci:check`) could not be executed because the
sandbox auto-denies them with no approval surface (no exit codes), so status is
reported as `BLOCKED_BY_TEST_ENVIRONMENT`. No `PASS` verdict is written by the
implementation round.
