# DELIVERY — T118-M1-CONTENT-VERSION-CORE-SCHEMA (round 1)

## STATUS

`BLOCKED_BY_TEST_ENVIRONMENT` — the implementation itself is complete and
in-scope; every approved gate that the executor sandbox permits runs and exits 0
(frozen install, dual-dialect `db:generate` first + clean final run, local D1
migration + idempotency re-run, task-file Prettier, focused Vitest, full Vitest,
read-only Git). The five whole-repo gates required by TASK item 5
(`format:check`, `types:check`, `lint`, `build`, `ci:check`) are auto-denied by
this session's sandbox with no approval surface — `format:check` was attempted
exactly once as the representative aggregate command and denied ("This command
requires approval"); the denial message states that any other approval-requiring
command will be denied the same way for the rest of the session, so per TASK
item 5 ("report that exact denial once and stop without retry or bypass") no
exit code exists for any of the five. This is the same environment block
recorded across T111–T115 and T117 and is reported honestly as an environment
limitation, not as passing and not as a scope/code deviation.

## TASK ID

`T118-M1-CONTENT-VERSION-CORE-SCHEMA` — implementation round 1. No `REVIEW.md`
existed at round start (verified before implementation); none was created.

## IMPLEMENTATION SUMMARY

Added the normalized, Project-scoped, immutable `content_package_versions`
storage contract across both dialects (D1/SQLite + PostgreSQL). This slice is
schema/contract ONLY: the TASK records canonical content and version identity
only. Normalized Claim/SourceRef/MediaAsset mapping tables, ContentVariant, Gate
evaluation, and all release/dry-run/approval/publishing behavior remain separate
tasks.

Storage contract shipped:

- `content_package_versions` (both dialects): stable text `id` (PK), explicit
  NOT NULL `project_id` (FK → `projects(id)` ON DELETE CASCADE), required
  `content_package_id` and required `version_no`, required `canonical_markdown`
  and required `canonical_metadata_json`, nullable `web_page_spec_json`,
  required opaque `content_hash`, required `gate_status`
  (DRAFT | BLOCKED | PASSED), required DataClassification `classification`
  (PUBLIC_MARKETING | INTERNAL | RESTRICTED), and the append-only `created_at`
  timestamp only.
- Same-Project ContentPackage ownership is database-enforced by the
  Project-leading composite FK
  `(project_id, content_package_id) -> content_packages(project_id, id)` ON
  DELETE CASCADE. The parent `(project_id, id)` target was not previously
  unique, so the new migrations add exactly one supporting unique index to the
  accepted T117 `content_packages` table (`content_packages_project_id_id_idx`)
  — the only new referential parent index this slice requires (added in the new
  forward migrations, never by editing the accepted T117 migrations 0062/0040
  or any other accepted migration).
- Version identity `(content_package_id, version_no)` is the ONLY business
  uniqueness (unique index
  `content_package_versions_unique_content_package_version_idx`); no other
  business uniqueness or lookup index exists on the table.
- Immutable-row shape preserved: no `updated_at`, no mutable workflow/release
  approval/publishing or public-success column. `gate_status` records only the
  core value — no Gate evaluation is implemented and an agent cannot override
  it. Metadata/WebPageSpec stay opaque structured document JSON payloads; no
  relational Claim/SourceRef/MediaAsset mapping is encoded in JSON (TASK item
  3).

## FIELD RECONCILIATION

Sources: the TASK field list (authoritative), `05_DOMAIN_DATA_MODEL.md` §10
ContentVersion, `09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§1, 4 and 8,
`21_TEST_ACCEPTANCE_PLAN.md` §10, `29_SCOPE_LOCK.md`,
`30_TRACEABILITY_MATRIX.md`, the accepted T117 content-package relation pattern,
and the legacy reference artifacts `schemas/domain-types.ts`
ContentPackageVersion and `schemas/migrations-reference.sql`
`content_package_versions`. Reference artifacts are read-only and were NOT
edited.

| ContentVersion aspect | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). |
| `project_id` | explicit non-null Project ownership | NOT NULL FK → projects(id) ON DELETE CASCADE. |
| `content_package_id` | required ContentPackage ownership | NOT NULL text id; same-Project composite FK `(project_id, content_package_id) -> content_packages(project_id, id)` ON DELETE CASCADE (parent target made unique by the new `content_packages_project_id_id_idx` supporting index). |
| `version_no` | required version identity | NOT NULL integer; the unique index on `(content_package_id, version_no)` enforces one row per version per package (09 spec §8 immutable versions — a content change creates a new version_no, never an in-place edit). |
| `canonical_markdown` | required canonical Markdown | NOT NULL text, stored verbatim as the canonical body document. |
| `canonical_metadata_json` | required canonical structured metadata | NOT NULL text JSON document, stored verbatim (opaque payload; no relational extraction). |
| `web_page_spec_json` | nullable WebPageSpec | Nullable text JSON document; NULL means the version does not (yet) carry a page spec. |
| `content_hash` | required opaque content hash | NOT NULL text, stored verbatim; deliberately a plain non-unique column — no content-hash matching/dedup rule is invented. |
| `gate_status` | required gate core value | NOT NULL DB text-enum DRAFT \| BLOCKED \| PASSED (domain-types.ts `gateStatus`) + named CHECK; records only the core value, no Gate evaluation and no agent override (TASK item 3). |
| `classification` | required DataClassification | NOT NULL DB text-enum PUBLIC_MARKETING \| INTERNAL \| RESTRICTED + named CHECK. |
| `created_at` | creation timestamp only | NOT NULL text timestamp with DB default; the ONLY audit column. |
| `updated_at` / mutable workflow / release approval / publishing / public-success | TASK item 3 forbids on an immutable row | Reconciled OUT — no such column exists. |
| `brief_json`, `claim_ids_json`, `source_ref_ids_json`, `asset_ids_json`, `gate_report_json`, `created_by` | legacy reference columns on `content_package_versions` | Reconciled OUT — the TASK field list does not name them, and normalized Claim/SourceRef/MediaAsset mappings (never JSON arrays on this row) plus Gate/release behavior are separate tasks (TASK items 1 and 3). |
| business uniqueness | TASK item 2 forbids beyond the version identity | NOT shipped — the only unique index on the table is `(content_package_id, version_no)`; the new `content_packages_project_id_id_idx` is a referential-support target (id is already the PK, so the composite accepts exactly the PK's rows). |

## RELATION / FK / IDENTITY / DELETE DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project integrity: the Project-leading composite FK
  `(project_id, content_package_id) -> content_packages(project_id, id)` ON
  DELETE CASCADE (the accepted T111/T115/T117 same-Project pattern). It makes it
  impossible to record a version whose ContentPackage belongs to a different
  Project in EITHER direction and impossible to attach a version to a dangling
  ContentPackage.
- Necessary referential parent key only: the single added unique index
  `content_packages_project_id_id_idx` on the accepted T117 `content_packages`
  table exists solely as the composite-FK target. It is NOT a business
  uniqueness rule on content packages (the package `id` PK remains the identity;
  the composite accepts exactly the rows the PK accepts).
- Version identity: unique index `(content_package_id, version_no)`. Because
  `content_package_id` is a globally unique PK, the pair is project-isolated
  without listing `project_id` (the accepted mapping/version pattern). Its
  leading `content_package_id` serves the content-package -> versions read
  path, so no other index exists on the table (matching the
  migrations-reference `idx_content_version` shape).
- Delete behavior: ON DELETE CASCADE on the Project FK AND on the composite
  ContentPackage FK — deleting a content package or a whole Project cascades its
  versions away, so an immutable version can never dangle.
- Immutability: the row carries `created_at` only; there is no `updated_at` and
  no mutable workflow/gate/release/publishing/public-success state (TASK item 3;
  09 spec §8). `gate_status` is a plain stored core value, not a computed Gate
  and not agent-overridable in this slice.

## MIGRATION IDS

- D1/SQLite: `drizzle/0063_sudden_lyja.sql` (+ `drizzle/meta/0063_snapshot.json`,
  `drizzle/meta/_journal.json` idx 63). Drizzle generated the SQLite file with
  the child table + its version-identity unique index + the parent
  `content_packages_project_id_id_idx` unique index in an order that is valid
  for SQLite (FK parent-key uniqueness is enforced at DML time), so it was left
  as generated.
- PostgreSQL: `drizzle-pg/0041_thick_firelord.sql` (+
  `drizzle-pg/meta/0041_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 41).
  Drizzle generated this file with the content_package_versions ->
  content_packages FK ALTER BEFORE the supporting parent unique index, which
  Postgres rejects at FK-ADD time. I rewrote the file so
  `content_packages_project_id_id_idx` is created BEFORE the composite-FK ALTER
  (the accepted T111/T115/T117 fix pattern recorded in `drizzle-pg/0035`,
  `0039` and `0040`), keeping all other generated statements unchanged.

Accepted migrations (SQLite ≤ 0062, PG ≤ 0040) were NOT edited. Clean final
dual-dialect `db:generate` re-run reports `No schema changes, nothing to migrate
😴` on both dialects (54 tables each).

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — updated the header `max-lines` eslint-disable
  comment to include T118 content_package_versions; updated the `contentPackages`
  ownership/no-business-uniqueness comment to note the new
  `content_packages_project_id_id_idx` supporting target (added for the T118
  version composite FK) and added that unique index to the content package table
  callback; appended the `contentPackageVersions` sqliteTable at end of file with
  a full field-reconciliation/immutability/ownership/no-other-business-uniqueness
  comment block.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror (same
  supporting unique index + same `contentPackageVersions` pgTable with `isoNow`
  default); header and content package comments updated the same way.
- `src/db/schema.ts` — destructured barrel export adds `contentPackageVersions`
  after `contentPackages`.
- `drizzle/meta/_journal.json` and `drizzle-pg/meta/_journal.json` —
  `db:generate` journal entries (idx 63 / idx 41).

Added (untracked):

- `drizzle/0063_sudden_lyja.sql` and `drizzle/meta/0063_snapshot.json`.
- `drizzle-pg/0041_thick_firelord.sql` and `drizzle-pg/meta/0041_snapshot.json`.
- `src/db/content-package-version.test.ts` — the migration-backed storage spec
  (14 tests).

Task-channel file for this round: `DELIVERY.md` (this document).

## DATABASE/MIGRATION CHANGES

- New `content_package_versions` table on both dialects (11 columns / 1 index /
  2 fks each): D1 0063 and PG 0041.
- One supporting unique index added to the accepted T117 `content_packages`
  table on both dialects (referential target of the new same-Project composite
  ContentPackage FK): `content_packages_project_id_id_idx`.
- Snapshots (`0063_snapshot.json` / `0041_snapshot.json`) and journals (idx 63 /
  idx 41) written by `db:generate`. 54 tables on each dialect.

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install
used the existing lockfile).

## TESTS ADDED

- `src/db/content-package-version.test.ts` — 14 migration-backed storage tests
  that build a real in-memory SQLite client, enable `PRAGMA foreign_keys = ON`,
  hand-create the `projects` table, and apply the actual shipped forward-migration
  DDL in order (`0045` market profiles, `0046` topics, `0049` prompts, `0055`
  opportunities, `0062` content_packages, then `0063` content_package_versions,
  split on `--> statement-breakpoint`). The DDL is the source of truth, so the
  Project FK, the same-Project composite ContentPackage FK, the delete cascades,
  the version identity and the enum CHECKs are exercised — not an application
  convention. Tests cover: valid same-Project persistence with the full TASK
  field set + `created_at` default; nullable `web_page_spec_json` (exact NULL
  round-trip when omitted, verbatim value when present); cross-Project
  ContentPackage rejection in BOTH directions; dangling-ContentPackage and
  dangling-Project FK rejection; duplicate `(content_package_id, version_no)`
  rejection; NOT NULL rejection of each required direct column (`id`,
  `project_id`, `content_package_id`, `version_no`, `canonical_markdown`,
  `canonical_metadata_json`, `content_hash`, `gate_status`, `classification`);
  DB-level `gate_status` enum rejection (unsupported + case-mismatched values);
  DB-level `classification` enum rejection (unsupported + case-mismatched
  values); ContentPackage delete cascade; whole-Project delete cascade; exact
  column-shape assertion (the 11 canonical/version columns only — no
  `updated_at`, no brief/claim_ids/source_ref_ids/asset_ids/gate_report/created_by
  JSON column and no business-unique content_hash).
- Dialect parity: the new table is auto-picked-up by the existing
  `src/db/schema-parity.test.ts` (now 279 tests: +5 per-table assertions for the
  new table — columns/PK/unique/FKs/indexes/checks), which structurally compares
  every SQLite and PG table. It also confirms both dialects now report the same
  structural change to `content_packages` (the added unique supporting index).

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no chained shell
operations).

1. `node --version` → v24.16.0.
2. `corepack pnpm --version` → 10.30.1.
3. `corepack pnpm install --frozen-lockfile` → exit 0 (lockfile up to date,
   resolution skipped; 980 packages linked; ignored-build-scripts warning only).
4. `corepack pnpm run db:generate` (dual-dialect, first run) → exit 0 —
   produced `drizzle/0063_sudden_lyja.sql` and
   `drizzle-pg/0041_thick_firelord.sql` with snapshots + journal entries
   (54 tables on both dialects; `content_package_versions` = 11 columns / 1
   index / 2 fks on both; `content_packages` now 9 columns / 4 indexes / 3 fks
   on both).
5. `corepack pnpm run db:migrate:local` (apply local D1 state) → exit 0 —
   0000 → 0063 all ✅ (`0063_sudden_lyja.sql` ✅).
6. Task-file Prettier: `corepack pnpm exec prettier --write <4 changed/new task
   source files>` → exit 0 (both schema files, `schema.ts` and the new storage
   test — already formatted, unchanged).
7. Focused Vitest (`corepack pnpm exec vitest run` with the 3 task-related
   files) → exit 0 — 3 files / 307 tests passed (14 content-package-version +
   14 content-package + 279 parity).
8. `corepack pnpm run db:generate` (dual-dialect, clean final run) → exit 0 —
   both dialects: 54 tables, `No schema changes, nothing to migrate 😴`.
9. `corepack pnpm run db:migrate:local` (idempotency re-run) → exit 0 —
   `✅ No migrations to apply!`.
10. Full Vitest (`corepack pnpm exec vitest run`, default parallelism) — two
    runs: run 1 exit 1 (2 load-flakes: `oauth-provider.test.ts` test timed out
    in 30000ms and `oauth-refresh.e2e.test.ts` beforeEach hook timed out in
    30000ms under parallel load — both cold-import the workers-oauth-provider
    graph; 1524 passed / 2 failed); run 2 exit 0 — **171 files / 1526 tests
    passed**. Both flaked files pass in isolation and in the final clean full
    run.
11. `corepack pnpm run format:check` → **sandbox auto-denied; no exit code**
    (recorded exactly once; per TASK item 5 the remaining same-class whole-repo
    gates were not separately retried/bypassed — the denial message states any
    approval-requiring command is denied for the rest of the session).
12. `corepack pnpm run types:check` → **sandbox-denied class; no exit code**
    (same aggregate whole-repo gate class; not retried after the recorded
    denial).
13. `corepack pnpm run lint` → **sandbox-denied class; no exit code**.
14. `corepack pnpm run build` → **sandbox-denied class; no exit code**.
15. `corepack pnpm run ci:check` → **sandbox-denied class; no exit code**.
16. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`) → exit 0 — `git diff --check` clean.

## COMMAND RESULTS

Passing on the final tree: frozen install exit 0; dual-dialect `db:generate`
first run exit 0 (54 tables each) and clean final run exit 0 (`No schema
changes, nothing to migrate 😴` on both dialects); local D1 migration exit 0
(0000 → 0063 applied ✅, then idempotent `✅ No migrations to apply!`); task-file
Prettier exit 0 (files already formatted); focused Vitest **3 files / 307
tests** exit 0; full Vitest **171 files / 1526 tests** exit 0 at default
parallelism on the final clean run (completed 102.65s); read-only Git inspection
clean (`git diff --check` clean).

Environment limitation (reported, not hidden): the sandbox auto-approval grant
list for this executor session does not include `format:check`, `types:check`,
`lint`, `build`, `ci:check`. `format:check` was attempted as a standalone
invocation and auto-denied with no approval surface ("This command requires
approval"); the denial message states that any other approval-requiring command
will be denied the same way for the rest of the session, so **no exit code exists
for any of the five gates in this session**. Per TASK item 5 the exact denial was
recorded once and no retry/bypass was attempted. This is the same environment
block recorded for T111–T115 and T117.

## RUNTIME EVIDENCE

- Full-suite Vitest final clean run: `Test Files 171 passed (171)`, `Tests 1526
  passed (1526)`, exit 0 at default parallelism. The new storage spec's 14 tests
  and the extended parity suite (279) pass inside it. (1526 = prior accepted
  count 1507 + 14 content-package-version storage tests + 5 parity assertions
  for the new table.) An earlier full run hit two unrelated, load-sensitive
  cold-import hook/test timeouts (`oauth-provider.test.ts` 30s test;
  `oauth-refresh.e2e.test.ts` 30s beforeEach) under heavy parallel CPU
  contention; both files pass in isolation (15 tests) and both pass in the final
  clean full run.
- Focused Vitest: 3 files / 307 tests, exit 0 (14 content-package-version + 14
  content-package + 279 parity).
- `db:migrate:local`: 0063 applied successfully (✅) on the local D1 state;
  re-run reports `✅ No migrations to apply!`, exit 0 (journal complete and
  idempotent).
- `db:generate` final: D1 then PG each print 54 tables and `No schema changes,
  nothing to migrate 😴`, exit 0 — confirms both dialects' schemas exactly match
  their snapshots with no drift; `content_package_versions` = 11 columns / 1
  index / 2 fks and `content_packages` = 9 columns / 4 indexes / 3 fks on both.
- Read-only Git inspection: `git diff --check` clean; file set below is exactly
  the intended change set.
- Five full-repo gates: no exit codes (sandbox auto-denied) — see COMMAND
  RESULTS / KNOWN LIMITATIONS.

## KNOWN LIMITATIONS

- The `format:check` / `types:check` / `lint` / `build` / `ci:check` gates
  remain non-executable in this executor session: the sandbox auto-denies the
  aggregate whole-repo command class with no approval surface, so no exit code
  exists for any of the five (TASK item 5's "every gate must exit 0" therefore
  cannot be fully evidenced here). This is the same environment block recorded
  across T111–T115 and T117 and is reported as `BLOCKED_BY_TEST_ENVIRONMENT` — a
  test-environment limitation, not a scope or code deviation. The runnable matrix
  (frozen install, dual-dialect `db:generate` first + clean final run, local
  migration + re-run, focused and full Vitest, task-file Prettier, read-only Git)
  all pass, including a clean full-suite exit 0. A grant-enabled session, the
  controller/QA under the Product Owner's bounded acceptance-verification
  exception, or a human gate must produce the five exit codes before final
  acceptance.
- One of the two full-suite runs in this session hit two unrelated,
  load-sensitive cold-import hook/test timeouts under heavy parallel CPU
  contention (`oauth-provider.test.ts` and `oauth-refresh.e2e.test.ts`); both
  pass in isolation and in the final clean full run. This is an environment load
  artifact of the shared executor, not a defect in this change set.
- Type/lint surface for the new module could not be checked by `tsc`/`oxlint`
  this round (sandbox-denied); it is the same idiom as the accepted
  topic/opportunity/media-asset/content-package same-Project modules, and the
  focused + full Vitest suites import and execute the new module and both schema
  mirrors at runtime (parity compares every column/index/FK/check between
  dialects).
- Scope-shape notes (by design, not defects): the table is schema/contract only —
  no Claim/SourceRef/MediaAsset mapping, ContentVariant, Gate runtime,
  release/dry-run/approval or publishing behavior; `gate_status` records the
  core DRAFT/BLOCKED/PASSED value only; metadata/WebPageSpec are opaque JSON
  document payloads; `content_hash` is opaque non-unique; there is no
  `updated_at`; and the only business uniqueness is the version identity
  `(content_package_id, version_no)` plus the referential-support
  `content_packages_project_id_id_idx` target (see FIELD RECONCILIATION).

## DEVIATIONS FROM TASK

None in scope, field set, ownership rule, delete behavior, index set or
migration IDs. The table ships D1 `0063` and PostgreSQL `0041` as required with
forward snapshots + journals; same-Project ownership is enforced by the
Project-leading composite FK `(project_id, content_package_id) ->
content_packages(project_id, id)`; the single necessary new referential parent
key `content_packages_project_id_id_idx` is added to the accepted T117
content_packages table; the composite FK, the Project FK, and the whole-Project
delete all cascade; `gate_status`/`classification` are DB text-enum columns with
named CHECKs (core value only — no Gate evaluation/agent override); and no
`updated_at`, mutable workflow/release/publishing column, brief/claim/source/
asset/gate-report JSON column, or extra business uniqueness exists. The one
generated-file adjustment is an implementation detail required for PostgreSQL
correctness: `drizzle-pg/0041` was reordered so the parent unique index is
created before the composite-FK ALTER (the accepted T111/T115/T117 fix pattern
in `drizzle-pg/0035`, `0039` and `0040`); the SQLite 0063 ordering was left as
generated (valid for SQLite). The only non-`0` outcomes are environmental: the
five full-repo gates could not be granted by the sandbox in this round, and one
of two full-suite runs hit two unrelated load-sensitive hook/test timeouts
before the final clean exit-0 run (see KNOWN LIMITATIONS) — both reported as
environment limitations, not scope deviations.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state (`db:migrate:local`) and
  in-memory SQLite built from the shipped forward-migration DDL.
- No network/provider/publishing action occurred. No commit, merge, or push was
  performed. No `main` branch was touched.
- TASK-approved command names only; the one denied invocation (`format:check`)
  was abandoned without retry or bypass after the sandbox denial, and the
  same-class whole-repo gates were not separately re-attempted per the denial
  guidance.
- No Claim/SourceRef/MediaAsset mapping, ContentVariant, Gate runtime, release/
  approval or publishing behavior was added (out of scope); the slice adds
  persistence/contract surface only. The content-version row is immutable
  (`created_at` only) and `classification` is the DataClassification union that
  later distribution policy will enforce — no content leaves the project in this
  slice.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T118-M1-CONTENT-VERSION-CORE-SCHEMA`; working tree is NOT
  committed (rounds stop at delivery). Recent commit on the branch: `2390979
  control: accept T117 and dispatch T118`.
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json` (db:generate journal entries);
  `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
  `src/db/schema.ts`.
- Added (untracked) files (5): `drizzle/0063_sudden_lyja.sql`,
  `drizzle/meta/0063_snapshot.json`, `drizzle-pg/0041_thick_firelord.sql`,
  `drizzle-pg/meta/0041_snapshot.json`, `src/db/content-package-version.test.ts`.
- Task-channel file: `control/tasks/T118-M1-CONTENT-VERSION-CORE-SCHEMA/DELIVERY.md`
  (this document). `REVIEW.md` did not exist at round start and was not created.
- `git diff --stat` (tracked): 5 files, +332/−16. `git diff --check` clean.
- No other files are dirty or untracked.

## READY FOR REVIEW

Implementation round 1 is complete and in-scope: the normalized, Project-scoped,
immutable `content_package_versions` table ships on both dialects with forward
migrations 0063/0041, snapshots, journals, database-enforced same-Project
ownership via the Project-leading composite FK `(project_id, content_package_id)
-> content_packages(project_id, id)` (plus the single necessary referential
unique target `content_packages_project_id_id_idx` added to the accepted T117
content_packages table), ON DELETE CASCADE on the Project/ContentPackage FKs, the
version identity unique index `(content_package_id, version_no)`, DB-enum +
CHECK `gate_status` (DRAFT|BLOCKED|PASSED) and `classification`
(PUBLIC_MARKETING|INTERNAL|RESTRICTED), opaque JSON canonical-metadata/WebPageSpec
payloads, an append-only `created_at` only (immutable-row shape — no
`updated_at`/workflow/release/publishing state), and no other business
uniqueness or JSON mapping surface. Runnable approved gates pass on the final
tree: frozen install exit 0, dual-dialect `db:generate` first + clean final run
exit 0 (`No schema changes, nothing to migrate` on both dialects), local D1
migration exit 0 (0000 → 0063 applied, idempotent on re-run), task-file Prettier
exit 0, focused Vitest 3 files / 307 tests exit 0, full Vitest 171 files / 1526
tests exit 0 (default parallelism, final clean run), and read-only Git clean.
The five full-repo gates (`format:check`, `types:check`, `lint`, `build`,
`ci:check`) could not be executed because the sandbox auto-denies them with no
approval surface (no exit codes), so status is reported as
`BLOCKED_BY_TEST_ENVIRONMENT`. No `PASS` verdict is written by the
implementation round.
