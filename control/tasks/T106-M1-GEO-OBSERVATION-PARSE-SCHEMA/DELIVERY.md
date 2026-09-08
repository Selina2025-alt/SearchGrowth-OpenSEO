# DELIVERY — T106-M1-GEO-OBSERVATION-PARSE-SCHEMA

IMPLEMENTATION STATUS: IMPLEMENTED — ROUND 1 (not accepted; only the Controller may PASS)
READY FOR REVIEW: YES

## TASK ID

T106-M1-GEO-OBSERVATION-PARSE-SCHEMA — M1 Core Domain, schema-and-contract slice establishing the
normalized, append-only `GeoObservationParse` persistence for V1.0. This is implementation **round 1**
(`REVIEW.md` does not exist for this task yet; no findings to address). The slice ships storage and
domain contract only: immutable, versioned parse records that reference an already stored raw
`GeoObservationRun`; it must not implement a parser, reparse workflow, current-pointer behavior,
metrics, entity/citation extraction, recommendation logic, or any provider action. All work is on the
isolated worktree branch `ai-task/T106-M1-GEO-OBSERVATION-PARSE-SCHEMA` at HEAD `ae749c50` (dispatch
commit). Nothing was committed, merged, or published; no other task started.

## IMPLEMENTATION SUMMARY

A single normalized, append-only `geo_observation_parses` table is shipped in both dialect schemas
(SQLite/D1 `src/db/search-growth.schema.ts`, Postgres mirror `src/db/pg/search-growth.schema.ts`)
plus the forward migrations, snapshots, journals, a domain-boundary Zod module, and
migration-backed storage/boundary tests. The task is schema and contract only: no parser/current
pointer/update/delete API/repository/service/entity/citation/recommendation/provider/network/CRUD/UI
code was added, and a parse row is written once and never updated.

- **`geo_observation_parses`** carries the direct V1.0 parse fields from `05_DOMAIN_DATA_MODEL.md` §7
  verbatim: `id, run_id, parser_version, parse_status, accuracy_status, parsed_at, is_current`, plus
  the append-only `created_at` system timestamp the task requires. No `updated_at`, update API,
  repository, service, workflow, or mutation surface exists — immutability is by schema/contract
  shape (not a DB trigger).
- **Enums are DB text-enum columns validated at the Zod boundary.** `parse_status` is exactly the
  canonical `GeoObservationParse.parseStatus` set (`SUCCESS | PARTIAL | FAILED`) and the optional
  `accuracy_status` is exactly the canonical `accuracyStatus` set
  (`ACCURATE | PARTIAL | INACCURATE | UNKNOWN`) when present. Unsupported, case-mismatched, and
  empty values are rejected at the runtime boundary — no case-insensitive parsing or
  implicit/unknown fallback exists. `parser_version` is free TEXT (parser package/version
  identifier), not a numeric ordinal.
- **`is_current` is a required typed boolean with a documented storage default of `false`**
  (boolean-mode integer in SQLite / `boolean` in Postgres). It persists a current-marker
  fact/default only; selecting or switching the pointer is later workflow logic and is not
  implemented here — no partial unique index or update behavior exists.
- **Ownership is database-enforced.** Every parse has an explicit `run_id` FK to the immutable
  `geo_observation_runs(id)`; the run (and, through the run's own Project/Prompt cascade, a whole
  Project or Prompt) is the only parent. Delete behavior is **cascade**: deleting a run cascades its
  parses away, so a parse can never dangle (migration-tested for both run deletion and whole-Project
  deletion).
- **The SOLE version-identity rule is the unique index on `(run_id, parser_version)`**
  (migrations-reference.sql `idx_geo_parse_version`): it permits v1/v2 parses of the same raw run to
  coexist and rejects a duplicate parser version of the same run. There is no global or
  current-pointer uniqueness rule — the same parser version on two different runs is legal and is
  migration-tested.
- **The raw run is never touched by parse writes.** Storage tests prove the run row is
  byte-identical before and after v1/v2 parses exist (`21_TEST_ACCEPTANCE_PLAN.md` §6, ADR-005).
- **Forward migrations/snapshots** use the next identifiers after accepted T105: D1 **0051** and
  Postgres **0029**. The local D1 migration history applies cleanly, schema parity passes (219), and
  a final dual-dialect `db:generate` reports **no schema change** on either dialect.

### Source reconciliation (TASK in-scope item 5)

Four source views were reconciled; `05_DOMAIN_DATA_MODEL.md` §7 is the direct field contract, and
`schemas/domain-types.ts` `GeoObservationParse` + `schemas/migrations-reference.sql`
`geo_observation_parses` supply reference/context fields:

- **`parsed_at` is shipped** because §7 (the direct V1.0 field contract) lists it and the TASK field
  list names it. Neither the domain type nor the reference SQL has it; §7 wins as the direct
  contract. `created_at` is the separate append-only system insert timestamp the TASK requires —
  `parsed_at` is the application-supplied moment the parse was produced, `created_at` is the DB
  insert time.
- **`parser_model`, `recommendation`, `recommendation_confidence`, and `parsed_json` are NOT
  shipped**: the TASK explicitly forbids shipping any of them absent a direct cited V1.0 contract,
  and parsed entities/citations/relationships must NOT be encoded in JSON/text — later normalized
  `GeoEntityMention`/`GeoCitation` tasks own that data. The storage test asserts the exact §7 column
  set so none of these reference-only fields can silently reappear.
- **`accuracy_status` is nullable** (`ACCURATE | PARTIAL | INACCURATE | UNKNOWN` when present):
  domain-types marks `accuracyStatus?` optional and the reference declares `accuracy_status TEXT`
  (no `NOT NULL`). NULL means no accuracy assessment was made (e.g. a FAILED parse).
- **`parser_version` is TEXT** (`schemas/domain-types.ts parserVersion: string`;
  `migrations-reference.sql parser_version TEXT NOT NULL`): the parser package/version identifier.
- **No separate `run_id` non-unique index is added.** The `(run_id, parser_version)` unique index
  leads with `run_id`, which serves run→parses reads and the run-delete cascade path; the migration
  reference defines no other index either, so an extra index would be redundant.

### Append-only boundary

The row is immutable by schema/contract shape: there is no `updated_at` column (asserted by a
migration-backed `pragma_table_info` test that also proves no parser-model/recommendation/parsed-JSON
column exists), no update/delete API, no repository/service, no workflow, and no mutation surface in
this task. A parser upgrade creates another row (ADR-005); v1/v2 may coexist for one run; raw
observation and versioned parse remain separate. No DB trigger is claimed to provide stronger
immutability.

## FILES CHANGED

### Source — modified (tracked)
- `src/db/search-growth.schema.ts` — appends the full `geoObservationParses` sqliteTable (8 columns:
  id PK, run_id FK → geoObservationRuns(id) cascade, parser_version, parse_status, accuracy_status?,
  parsed_at, is_current boolean default false, created_at; 1 unique index
  `geo_observation_parses_run_version_unique_idx(run_id, parser_version)`) with an extensive header
  comment documenting the reconciliation.
- `src/db/pg/search-growth.schema.ts` — identical Postgres mirror (`boolean` `is_current`,
  `isoNow` timestamp default for `created_at`).
- `src/db/schema.ts` — provider-aware barrel: adds `geoObservationParses` to the destructured exports.

### Migrations / metadata (untracked additions + tracked journal edits)
- `drizzle/0051_cuddly_matthew_murdock.sql` (D1: `CREATE TABLE geo_observation_parses` with the
  inline run FK and the `CREATE UNIQUE INDEX geo_observation_parses_run_version_unique_idx`), plus
  `drizzle/meta/0051_snapshot.json`.
- `drizzle-pg/0029_exotic_wither.sql` (Postgres: `CREATE TABLE geo_observation_parses`, then the
  `ALTER TABLE ... ADD CONSTRAINT` run FK, then the unique index), plus
  `drizzle-pg/meta/0029_snapshot.json`.
- `drizzle/meta/_journal.json` (idx 51, tag `0051_cuddly_matthew_murdock`) and
  `drizzle-pg/meta/_journal.json` (idx 29, tag `0029_exotic_wither`) — tracked modifications, each
  adding exactly one entry.

### Domain-boundary module + tests — untracked additions
- `src/types/schemas/geo-observation-parse.ts` — exports `GeoObservationParse` (InferSelectModel row
  type), `geoObservationParseStatusSchema`/`GeoObservationParseStatus`, and
  `geoObservationAccuracyStatusSchema`/`GeoObservationAccuracyStatus` (each `z.enum` over the column
  `enumValues`).
- `src/db/geo-observation-parse.test.ts` (10 tests) — migration-backed storage contract.
- `src/types/schemas/geo-observation-parse.test.ts` (5 tests) — domain boundary.

### Control channel (untracked, not repo baseline)
- `control/tasks/T106-M1-GEO-OBSERVATION-PARSE-SCHEMA/DELIVERY.md` (this file),
  `control/tasks/T106-M1-GEO-OBSERVATION-PARSE-SCHEMA/evidence/round-1/*` (14 command-evidence
  files). `REVIEW.md` does not exist and was not created/edited.

No content-neutral format repair was needed this round: `format:check` passed on the first whole-repo
run (the `control/ACCEPTANCE_LEDGER.md` drift repaired in the accepted T105 round is already in the
baseline).

## DATABASE / MIGRATION CHANGES

### `geo_observation_parses` inventory (identical on both dialects)
| property | column | type (sqlite / pg) | null | default |
| --- | --- | --- | --- | --- |
| `id` | `id` | text / text | no | PK |
| `runId` | `run_id` | text / text | no | FK → geo_observation_runs(id) cascade |
| `parserVersion` | `parser_version` | text / text | no | — (free parser version text) |
| `parseStatus` | `parse_status` | text enum (3 values) | no | — |
| `accuracyStatus` | `accuracy_status` | text enum (4 values) | yes | — (no assessment = NULL) |
| `parsedAt` | `parsed_at` | text / text | no | — (parse-produced moment, §7) |
| `isCurrent` | `is_current` | integer(bool) / boolean | no | `false` (documented storage default) |
| `createdAt` | `created_at` | text / text | no | dialect timestamp default |

| artifact | definition |
| --- | --- |
| Run FK | `run_id → geo_observation_runs(id) ON DELETE CASCADE` — deleting a run (or a whole Project/Prompt through the run's own cascades) removes its parses |
| Unique index | `geo_observation_parses_run_version_unique_idx(run_id, parser_version)` — SOLE version-identity rule; v1/v2 coexist, duplicate version per run rejected |
| Enum sets | `parse_status`: `SUCCESS`, `PARTIAL`, `FAILED`; `accuracy_status` (optional): `ACCURATE`, `PARTIAL`, `INACCURATE`, `UNKNOWN` |

### Constraint / behavior rationale
- **No dangling parse**: the run FK cascades on delete; both the direct run-delete path and the
  whole-Project delete path (run cascade → parse cascade) are migration-tested.
- **Versioned identity is the only uniqueness**: `(run_id, parser_version)` is the reference-defined
  rule. Two parser versions of the same raw run are two records; a duplicate parser version of the
  same run is rejected; the same parser version on two different runs is allowed (no global or
  current-pointer uniqueness).
- **No relationship is encoded in JSON/text**: the parse stores only typed scalar fields and the
  explicit run FK. No parsed entity/citation/relationship payload column exists.
- **Enum columns** carry the canonical uppercase unions; case-mismatched/unsupported/empty values
  are rejected at the Zod boundary (no coercion/fallback).

### Migration identifiers
- D1 **0051** (`0051_cuddly_matthew_murdock`), journal idx 51, `drizzle/meta/0051_snapshot.json`.
- Postgres **0029** (`0029_exotic_wither`), journal idx 29, `drizzle-pg/meta/0029_snapshot.json`.
Both are the next identifiers after the accepted T105 migrations (0050 / 0028). The final
dual-dialect `db:generate` reports **no schema change** on either dialect, so schemas, 0051/0029 SQL,
and their snapshots agree exactly.

## DEPENDENCIES CHANGED

None. `corepack pnpm install --frozen-lockfile` exits 0 with no resolution or change;
`package.json`/`pnpm-lock.yaml` are unchanged in the final `git status`. No package was added or
updated.

## TESTS ADDED

- `src/db/geo-observation-parse.test.ts` (10 tests) — a real in-memory SQLite built from the shipped
  forward migration DDL (`drizzle/0045_search_market_profiles.sql` + `0046_search_topics.sql` +
  `0049_gigantic_johnny_blaze.sql` + `0050_dusty_stardust.sql` + `0051_cuddly_matthew_murdock.sql`)
  plus a raw `projects` table, with `PRAGMA foreign_keys = ON`:
  1. A valid parse persists with the full §7 field set (`id, run_id, parser_version, parse_status,
     accuracy_status, parsed_at, is_current`) plus the `created_at` system timestamp.
  2. Every canonical parse_status (3) and accuracy_status (4) enum value stores (7 rows total).
  3. NULL `accuracy_status` and the documented `is_current` default `false` persist via a raw insert
     that omits both columns.
  4. v1/v2 parses of the same raw run coexist (2 rows; parser versions `1.0.0`/`2.0.0`).
  5. A duplicate `(run_id, parser_version)` of the same run is rejected (`UNIQUE constraint
     failed`) and only the first row remains.
  6. The same parser version on two DIFFERENT runs is allowed (no global uniqueness).
  7. The raw run row is byte-identical (`toEqual`) before and after v1/v2 parses exist — raw is
     never UPDATE (21_TEST_ACCEPTANCE_PLAN.md §6, ADR-005).
  8. Deleting the raw run cascades its parses away (no dangling parse).
  9. Deleting a whole Project cascades parses away through the run.
  10. Append-only schema shape with ONLY the direct §7 fields: `pragma_table_info` returns exactly
      `[accuracy_status, created_at, id, is_current, parse_status, parsed_at, parser_version,
      run_id]` — no `updated_at` and no `parser_model`/`recommendation`/`parsed_json` column.
- `src/types/schemas/geo-observation-parse.test.ts` (5 tests) — domain boundary:
  1. Every `parse_status` column value passes `geoObservationParseStatusSchema`.
  2. Unsupported, case-mismatched, and empty parse statuses (e.g. `success`, `Partial`, `SUCCESS `,
     `SUCCEEDED`, `ERROR`, `UNKNOWN`, ``) are rejected.
  3. Every `accuracy_status` column value passes `geoObservationAccuracyStatusSchema`.
  4. Unsupported, case-mismatched, and empty accuracy statuses (e.g. `accurate`, `Inaccurate`,
     `ACCURATE `, `TRUE`, `NONE`, ``) are rejected; `null` is not a valid enum value.
  5. Compile-time guard: exported row/enum types stay aligned with the storage columns (required
     `is_current`, nullable `accuracy_status`, no updated/parser-model/parsed-JSON field).
- `src/db/schema-parity.test.ts` (219 tests, passes) — auto-compares every table on both dialect
  barrels (columns/nullability/dataType/defaults/enums, PK, unique targets incl. the new unique
  index, FKs incl. `onDelete`). No manual parity-test edit was needed: the test enumerates the
  exported Search Growth modules, so `geoObservationParses` is covered automatically (+5 tests).

## COMMANDS RUN

Each approved command was run independently (`corepack pnpm ...`) — no chained/wrapped shell
operations except a single captured prettier write of the task files. Sanitized evidence under
`control/tasks/T106-M1-GEO-OBSERVATION-PARSE-SCHEMA/evidence/round-1/`. All commands exit 0 unless
noted.

1. `node --version` → exit 0 → `v24.16.0` (`01-node-version.log`)
2. `corepack pnpm --version` → exit 0 → `10.30.1` (`02-pnpm-version.log`)
3. `corepack pnpm install --frozen-lockfile` → exit 0 → dependencies satisfied in 36.8s;
   manifests/lockfile unchanged (`03-install.log`)
4. `corepack pnpm exec prettier --write <6 task-touched source/test files>` → exit 0 (each file
   formatted; the schema files, the barrel, the domain module and both test files were written)
   (`04-prettier-write.log`)
5. `corepack pnpm run db:migrate:local` → exit 0 → fresh worktree applied the full local D1 history
   0000–0051; output tail `0051_cuddly_matthew_murdock.sql ✅`; zero "✗|Failed|Error" occurrences
   (`05-db-migrate-local.log`)
6. `corepack pnpm run db:generate` → exit 0 (both dialects) → first run generated
   `0051_cuddly_matthew_murdock` + `0029_exotic_wither` (`06-db-generate.log`); the re-run reported
   **"No schema changes, nothing to migrate"** on both dialects (`06b-db-generate-nodiff.log`)
7. `corepack pnpm exec vitest run <3 focused geo-parse/schema-parity files>` → exit 0 →
   **3 files / 234 tests passed** (10 storage + 5 boundary + 219 parity) (`07-vitest-focused.log`)
8. `corepack pnpm format:check` → exit 0 → `All matched files use Prettier code style!`
   (`08-format-check.log`)
9. `corepack pnpm types:check` → exit 0 → `tsc --noEmit` clean (`09-types-check.log`)
10. `corepack pnpm lint` → exit 0 → `Found 0 warnings and 0 errors.` (`10-lint.log`)
11. `corepack pnpm test` → exit 0 → **155 files / 1308 tests passed.** (`11-test.log`)
12. `corepack pnpm build` → exit 0 → vite client + SSR + `open_seo_audit` bundles built; trailing
    `tsc --noEmit` clean (`12-build.log`)
13. `corepack pnpm ci:check` → exit 0 → prettier clean, knip clean, both `tsc --noEmit` runs clean,
    oxlint 0 errors, plugin-skill sync + sync check clean (`13-ci-check.log`)
14. Read-only Git inspection: `git status`, `git rev-parse`, `git diff`, `git diff --stat` — see GIT
    STATUS/DIFF SUMMARY.

## COMMAND RESULTS (evidence)

- **db:generate consistency** — the dual-dialect run reports "No schema changes, nothing to migrate"
  on **both** dialects, so the 0051/0029 migrations and snapshots match the shipped schemas exactly
  (including `geo_observation_parses`, its run FK, and the `(run_id, parser_version)` unique index).
- **Local migration** — `db:migrate:local` exits 0; the local D1 store is fully applied through
  `0051_cuddly_matthew_murdock.sql`.
- **Focused suite** — 234/234 pass: parse storage (10), domain boundary (5), and full Search Growth
  schema parity (219).
- **Aggregate gates all exit 0** — `format:check`, `types:check`, `lint`, `test`, `build`, and
  `ci:check` each ran literally and green:
  - `lint` first run flagged three task-local issues in `src/db/geo-observation-parse.test.ts`:
    two `unicorn/no-array-sort` hits (`.sort()` on parser versions and the pragma column list) and
    `eslint/max-lines` (410 counted lines > 400). Repaired by importing Remeda's non-mutating `sort`
    and compacting the file with a `parseValues`/`insertParse`/`seedRun` helper (10 tests, same
    invariants, now well under the limit); re-ran to 0 warnings / 0 errors.
  - `types:check` first run flagged literal-widening on the `seedRun` overrides parameter
    (`Partial<typeof ALPHA_RUN>` narrowed `id`/`projectId`/`promptId` to the `as const` literals);
    repaired by typing the overrides `{ id?: string; projectId?: string; promptId?: string }`,
    re-ran clean. Vitest (transpile-only) had been green throughout; `tsc` confirmed the type fix.
  - `format:check` needed no whole-repo repair this round (the accepted T105 round already fixed the
    pre-existing `control/ACCEPTANCE_LEDGER.md` drift).
- No schema, migration, snapshot, journal, manifest, lockfile, or dependency file changed after the
  final `db:generate` no-op confirmation.

## RUNTIME EVIDENCE

- **D1/SQLite migration** — `0051_cuddly_matthew_murdock.sql` is the applied head of the local D1
  history; `db:migrate:local` exits 0.
- **Storage tests** — all 10 migration-backed parse tests pass against the real 0051 DDL (with the
  0045/0046/0049/0050 parents and `PRAGMA foreign_keys = ON`): the DB accepts a valid §7 parse,
  persists all 3+4 canonical enum rows and NULL-accuracy/`is_current`-default rows, allows v1/v2
  parses of one run while rejecting a duplicate `(run_id, parser_version)`, allows the same parser
  version on different runs, keeps the raw run byte-identical while parses coexist, cascades parses
  on run and whole-Project deletion, and exposes exactly the §7 column set with no `updated_at` or
  reference-only parser-model/recommendation/parsed-JSON column.
- **Domain boundary** — the Zod boundary accepts every DB enum value and rejects unsupported/
  case-mismatched/empty values; the exported row/enum types are compile-time-aligned with storage.
- **Schema parity** — `geo_observation_parses` is structurally identical on SQLite and Postgres
  (columns, PK, unique target, FK incl. `onDelete`, enums); 219/219 parity tests pass.
- **Postgres migration artifact** — pg migration SQL/journal/snapshot are consistent
  (`db:generate:pg` reports no diff). A live `db:migrate:pg` still requires a real Postgres URL and
  is not in the approved command set.

## KNOWN LIMITATIONS

- `db:migrate:pg` was not executed (requires a live `POSTGRES_DATABASE_URL`; not in the approved
  command set). Postgres migration/snapshot consistency is proven via `db:generate:pg` (no diff),
  the parity tests, and review of the generated DDL ordering (the FK `ALTER TABLE` correctly follows
  the already-existing `geo_observation_runs` table from 0028).
- Migration file names are drizzle-kit's auto-generated tags (`0051_cuddly_matthew_murdock`,
  `0029_exotic_wither`) rather than semantic names, because `db:generate` cannot be passed a custom
  name under the approved-command set and no unlisted rename/delete command is allowed. Identifiers
  are the required next values (D1 0051, Postgres 0029); journal/snapshot/file tags agree.
- The reference/domain-types-only fields `parser_model`, `recommendation`,
  `recommendation_confidence`, and `parsed_json` are intentionally not shipped (see reconciliation).
  If a later Accepted ADR defines them as first-class columns, they arrive as their own migration —
  alongside the normalized GeoEntityMention/GeoCitation tables that own parsed entity/citation data.
- `is_current` persists a current-marker fact/default only (documented default `false`); selecting
  or switching the pointer requires later workflow logic and is out of scope for this schema slice.
- Per scope: no parser/current-pointer/reparse/update/delete-API/repository/service/entity/citation/
  recommendation/provider/network/CRUD/UI code was added; `schemas/domain-types.ts`,
  `schemas/migrations-reference.sql`, and `05_DOMAIN_DATA_MODEL.md` were **not** edited.

## DEVIATIONS FROM TASK

None in product scope. Design decisions recorded and explained above:
- **`parsed_at` is shipped as a required text column** because §7 (the direct V1.0 field contract)
  lists it, even though neither the reference domain type nor the migration reference has it; it is
  the application-supplied parse moment, distinct from the required append-only `created_at`.
- **`parser_model`, `recommendation`, `recommendation_confidence`, and `parsed_json` are omitted**
  per the TASK's explicit reconciliation instruction and the no-JSON-relationship rule; the storage
  test pins the exact §7 column set to keep them out.
- **No separate `run_id` non-unique index** is added; the `(run_id, parser_version)` unique index
  leads with `run_id` and serves run→parse reads and the run-delete cascade path (the migration
  reference defines no other index either).
- Delete behavior is **cascade** (run → parses, and whole-Project → runs → parses), matching the
  accepted T100–T105 tree-wide teardown pattern and proving "no dangling parse" by migration tests.
- Adjacent gate-driven correctness fixes, none of which change product scope, schema, migration, or
  domain behavior:
  - `src/db/geo-observation-parse.test.ts` uses Remeda `sort` instead of mutating `Array#sort`
    (`unicorn/no-array-sort`) and was compacted below the 400-line `eslint/max-lines` cap with
    `parseValues`/`insertParse`/`seedRun` helpers; assertion semantics unchanged — 10/10 tests.
  - The same file types its `seedRun` overrides as `{ id?: string; projectId?: string;
    promptId?: string }` instead of `Partial<typeof ALPHA_RUN>` to satisfy `tsc` literal-widening;
    assertion semantics unchanged.

## SECURITY NOTES

- No external requests, credentials, account access, CAPTCHA/2FA bypass, stealth behavior, cookie
  upload, production publishing, remote migration, or paid action was performed.
- No dependency, lockfile, manifest, ADR, scope-lock, or production resource change.
- All work is local to the isolated worktree; `db:migrate:local` touches only the gitignored local
  Wrangler D1 state.
- The parse's relation to its raw run is an explicit typed FK column — no relational data is stored
  in JSON/text and no parsed entity/citation payload is stored. No new untrusted-input, auth,
  credential, or execution path was added (storage + Zod-boundary-only change). Enum/status values
  are validated at the runtime boundary, so unsupported/case-mismatched/empty values cannot reach
  storage.

## GIT STATUS/DIFF SUMMARY

Branch `ai-task/T106-M1-GEO-OBSERVATION-PARSE-SCHEMA`, HEAD `ae749c50d9f5bf664fe5ed5564c418fdb0e4ca1f`.
`git status --short`:

```
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? control/tasks/T106-M1-GEO-OBSERVATION-PARSE-SCHEMA/evidence/
?? drizzle-pg/0029_exotic_wither.sql
?? drizzle-pg/meta/0029_snapshot.json
?? drizzle/0051_cuddly_matthew_murdock.sql
?? drizzle/meta/0051_snapshot.json
?? src/db/geo-observation-parse.test.ts
?? src/types/schemas/geo-observation-parse.test.ts
?? src/types/schemas/geo-observation-parse.ts
```

`git diff --stat` (tracked modifications, 5 files, +212): `src/db/search-growth.schema.ts` (+115),
`src/db/pg/search-growth.schema.ts` (+82), `src/db/schema.ts` (+1), and the two `_journal.json` files
(+7 each). Journal diffs add exactly one entry each: `drizzle/meta/_journal.json` idx 51 tag
`0051_cuddly_matthew_murdock`; `drizzle-pg/meta/_journal.json` idx 29 tag `0029_exotic_wither`.
Untracked additions are the two migration SQL files + two meta snapshots, the domain-boundary module
+ two test files, and the control-channel `DELIVERY.md` + `evidence/round-1/*`. No lockfile, package
manifest, ADR, scope, `.greptile`, `.github`, `.agents`, or production change is part of the diff.
`dist/` and `.wrangler/` outputs are gitignored. Nothing committed; nothing merged; no other task
started; `REVIEW.md` untouched.

## READY FOR REVIEW

Both dialects define logically equivalent `geo_observation_parses` storage with only the
direct/reconciled V1.0 fields (`id, run_id, parser_version, parse_status, accuracy_status,
parsed_at, is_current` + append-only `created_at`) (TASK item 1); the row is append-only by
schema/contract shape with no `updated_at` and no mutation/workflow/API surface (item 2);
parse_status/accuracy_status enums are explicit at the Zod boundary with unsupported/case-mismatched/
empty values rejected, and `is_current` is a required typed boolean with a documented `false`
storage default (item 3); the run FK and the `(run_id, parser_version)` uniqueness are
migration-backed and tested — duplicate version rejected, v1/v2 coexist, same version on different
runs allowed, and cascade delete behavior cannot leave dangling parses (item 4); no
parser-model/recommendation/parsed-JSON field, parser/current-pointer behavior, entity/citation data,
provider/network work, or relationship-in-JSON encoding is introduced (item 5); forward
migrations/snapshots use `0051`/`0029`, local D1 migration succeeds, schema parity passes (219), and
the final dual-dialect `db:generate` produces no additional migration on either dialect (item 6 +
acceptance); and no dependency/lockfile, Accepted ADR/scope, credential, external request, or
production change occurred (item 7 + OUT OF SCOPE). Focused tests 234/234; full suite 155 files /
1308 tests; `format:check`, `types:check`, `lint`, `build`, and `ci:check` all exit 0. DELIVERY maps
every changed path, source reconciliation, field inventory, invariant, test, command result,
limitation, security note, and final Git diff/status above. Not committed; not merged; no other task
started.
