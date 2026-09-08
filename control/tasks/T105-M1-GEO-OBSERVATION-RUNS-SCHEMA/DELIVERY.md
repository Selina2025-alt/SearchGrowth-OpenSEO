# DELIVERY — T105-M1-GEO-OBSERVATION-RUNS-SCHEMA

IMPLEMENTATION STATUS: IMPLEMENTED — ROUND 1 (not accepted; only the Controller may PASS)
READY FOR REVIEW: YES

## TASK ID

T105-M1-GEO-OBSERVATION-RUNS-SCHEMA — M1 Core Domain, schema-and-contract slice establishing the
normalized, append-only `GeoObservationRun` persistence for V1.0. This is implementation **round 1**
(`REVIEW.md` does not exist yet; no findings to address). The slice ships storage and domain
contract only: it records the immutable "what occurred" facts of a GEO observation event and must
not implement observation execution, parsing, metrics, sampling, CRUD, or an external provider. All
work is on the isolated worktree branch `ai-task/T105-M1-GEO-OBSERVATION-RUNS-SCHEMA` at HEAD
`b533873` (dispatch commit). Nothing was committed, merged, or published; no other task started.

## IMPLEMENTATION SUMMARY

A single normalized, append-only `geo_observation_runs` table is shipped in both dialect schemas
(SQLite/D1 `src/db/search-growth.schema.ts`, Postgres mirror `src/db/pg/search-growth.schema.ts`)
plus the forward migrations, snapshots, journals, a domain-boundary Zod module, and
migration-backed storage/boundary tests. The task is schema and contract only: no provider/execution/
sampling/cache/parser/metrics/CRUD/UI/connector code was added, and a row is written once and never
updated.

- **`geo_observation_runs`** carries the direct V1.0 observation-fact fields from
  `05_DOMAIN_DATA_MODEL.md` §6 verbatim: `id, batch_id, project_id, prompt_id, prompt_version,
  surface_type, surface_name, fidelity, provider?, engine?, model?, model_version?, web_search?,
  search_mode?, market_profile_id?, repeat_index, application_cache_bypassed, raw_answer,
  raw_response, provider_request_id?, usage/cost, started_at, finished_at, status`, plus the
  append-only `created_at` timestamp. No `updated_at`, update API, repository, service, workflow,
  or mutation surface exists — immutability is by schema/contract shape (not a DB trigger).
- **Enums are DB text-enum columns validated at the Zod boundary.** `surface_type` is exactly the
  canonical `ObservationSurfaceType` set (`AGGREGATED_SEARCH_DATA | MODEL_API_SEARCH |
  CONSUMER_PRODUCT_OBSERVED | MANUAL_CONSUMER_OBSERVATION`), `fidelity` exactly the canonical
  `SurfaceFidelity` set (`AGGREGATED | API_SIMULATION | CONSUMER_OBSERVED | MANUAL_OBSERVED`), and
  `status` exactly the canonical run-status union (`PENDING | RUNNING | SUCCEEDED | FAILED`).
  Unsupported, case-mismatched, and empty values are rejected at the runtime boundary — no
  case-insensitive parsing or implicit/unknown fallback exists. No provider/engine/model/search-mode
  enum is invented; those are free-text provenance.
- **`repeat_index` is validated as a non-negative integer** at the Zod boundary
  (`geoObservationRepeatIndexSchema = z.number().int().min(0)`) and the storage layer enforces the
  same rule with the named `geo_observation_runs_repeat_index_nonnegative` CHECK.
- **Raw captures are raw payload text only** — `raw_answer`, `raw_response`, and `usage_json` are
  stored verbatim and never parsed or rewritten here; they are not a substitute for relational
  identity or a parsed data model (the later Parse task extracts entities/citations).
- **Ownership is database-enforced.** Every run has an explicit `project_id` FK to the existing
  OpenSEO `projects` store and belongs to a same-Project `search_prompts` row through the composite
  FK `(project_id, prompt_id) → search_prompts(project_id, id)`; an optional same-Project
  `search_market_profiles` row may scope the observation via `(project_id, market_profile_id) →
  search_market_profiles(project_id, id)`. Cross-Project references are rejected by the DB;
  NULL `market_profile_id` means "no profile attached" and that FK is not enforced. No duplicate
  Project/Prompt/MarketProfile store is added.
- **Delete behavior cannot leave dangling runs**: deleting a Prompt, a MarketProfile, or a whole
  Project cascades the run away (all three paths migration-tested). Deleting a Topic cascades its
  prompts, which in turn cascade their runs. Cascade matches the accepted tree-wide teardown
  convention of the earlier Search Growth tables and keeps whole-Project deletion operational.
- **No uniqueness rule exists on runs.** Fresh GEO sampling must later create independent rows for
  repeats of the same prompt/provider/model/surface (`21_TEST_ACCEPTANCE_PLAN.md` §3), so no unique
  index groups or dedupes rows — two independent observations with the same repeat index both
  persist. A supporting `search_prompts_project_id_id_idx(project_id, id)` unique index is added to
  `search_prompts` purely because both dialects require a unique referenced target for the composite
  FK; `id` is already the PK, so it adds no business uniqueness.
- **The typed fresh-path flag `application_cache_bypassed` is persisted** (`NOT NULL`, boolean-mode
  integer in SQLite / `boolean` in Postgres). The direct fresh-path invariant
  `application_cache_bypassed=true` is enforced by the later sampling/execution path (ADR-003); this
  slice only stores the typed flag and makes no unsupported global DB claim.
- **Forward migrations/snapshots** use the next identifiers after accepted T104: D1 **0050** and
  Postgres **0028**. The local D1 migration history applies cleanly, schema parity passes (214), and
  a final dual-dialect `db:generate` reports **no schema change** on either dialect.

### Source reconciliation (TASK in-scope items 2 and 5)

Three source views were reconciled; `05_DOMAIN_DATA_MODEL.md` §6 is the direct field contract, and
`schemas/domain-types.ts` + `schemas/migrations-reference.sql` supply context/reference fields:

- **`fidelity` (not `surface_fidelity`)** is the column name because §6 and the TASK field list name
  the direct field `fidelity`; the reference SQL's `surface_*` prefix is a design-artifact rename.
- **Raw payloads** are captured as three raw-text columns: `raw_answer` (observed answer text),
  `raw_response` (full raw provider/engine response), and `usage_json` (raw usage/cost payload,
  matching the reference's `usage_json`). The design-reference `raw_citations_json` and
  `raw_response_ref` are **not** separate columns: citations stay inside the raw response payload
  and the later Parse task extracts them into `geo_citations`; V1.0 has no external raw-response
  store to point a ref at. No relationship is encoded in JSON/text.
- **Contextual `topic_id` is not shipped**: the run's topic is the same-Project `search_prompts`'
  topic, and the prompt composite FK already keeps the run project-bound; shipping a separate
  topic_id would add a second binding that could conflict with the prompt's own topic.
- **Contextual `country`/`language` are not shipped**: country/language market context is bound
  through the optional `market_profile_id` and the prompt's `language`; no duplicated denormalized
  columns are added to an immutable fact row.
- **`observed_at` is represented by the occurrence window** `started_at`/`finished_at` (§6 ships
  these as the run timestamps), plus `created_at` as the append-only creation/observation timestamp
  the TASK requires. A recorded run always has `started_at`; `finished_at` is NULL only for a run
  that did not reach clean completion.
- **No enums/behavior are invented**: `surface_name`, `provider`, `engine`, `model`, `model_version`
  and `search_mode` are free text; no provider behavior, normalizer, parser contract, or metrics
  behavior is created.

### Append-only boundary

The row is immutable by schema/contract shape: there is no `updated_at` column (asserted by a
migration-backed `pragma_table_info` test), no update/delete API, no repository/service, no
workflow, and no mutation surface in this task. Raw observation and the later versioned parse remain
separate (ADR-005). No DB trigger is claimed to provide stronger immutability.

## FILES CHANGED

### Source — modified (tracked)
- `src/db/search-growth.schema.ts` — `searchPrompts` gains the supporting unique index
  `search_prompts_project_id_id_idx(project_id, id)` (required unique target of the runs' composite
  FK; `id` is already the PK, so no business uniqueness); appends the full `geoObservationRuns`
  sqliteTable (25 columns, Project FK + 2 same-Project composite FKs, 1 repeat-index CHECK, 4 read
  indexes) with an extensive header comment documenting the reconciliation.
- `src/db/pg/search-growth.schema.ts` — identical Postgres mirror of both changes (`boolean`
  `web_search`/`application_cache_bypassed`, `isoNow` timestamp default for `created_at`).
- `src/db/schema.ts` — provider-aware barrel: adds `geoObservationRuns` to the destructured exports.

### Migrations / metadata (untracked additions + tracked journal edits)
- `drizzle/0050_dusty_stardust.sql` (D1: `CREATE TABLE geo_observation_runs` with inline FKs and the
  CHECK, then 4 read indexes, then `CREATE UNIQUE INDEX search_prompts_project_id_id_idx`), plus
  `drizzle/meta/0050_snapshot.json`.
- `drizzle-pg/0028_brainy_firedrake.sql` (Postgres: `CREATE TABLE geo_observation_runs`; the
  supporting `search_prompts_project_id_id_idx` unique index is created **before** the composite-FK
  `ALTER TABLE`s as Postgres requires — with an explanatory comment), plus
  `drizzle-pg/meta/0028_snapshot.json`.
- `drizzle/meta/_journal.json` (idx 50, tag `0050_dusty_stardust`) and
  `drizzle-pg/meta/_journal.json` (idx 28, tag `0028_brainy_firedrake`) — tracked modifications,
  each adding exactly one entry.

### Domain-boundary module + tests — untracked additions
- `src/types/schemas/geo-observation-run.ts` — exports `GeoObservationRun` (InferSelectModel row
  type), `observationSurfaceTypeSchema`/`ObservationSurfaceType`,
  `surfaceFidelitySchema`/`SurfaceFidelity`, `geoObservationRunStatusSchema`/`GeoObservationRunStatus`
  (each `z.enum` over the column `enumValues`), and `geoObservationRepeatIndexSchema`
  (`z.number().int().min(0)`).
- `src/db/geo-observation-run.test.ts` (12 tests) — migration-backed storage contract.
- `src/types/schemas/geo-observation-run.test.ts` (8 tests) — domain boundary.

### Control channel (untracked, not repo baseline)
- `control/tasks/T105-M1-GEO-OBSERVATION-RUNS-SCHEMA/DELIVERY.md` (this file),
  `control/tasks/T105-M1-GEO-OBSERVATION-RUNS-SCHEMA/evidence/round-1/*` (14 command-evidence
  files). `REVIEW.md` does not exist and was not created/edited.

### Content-neutral format repair (tracked, outside the task diff)
- `control/ACCEPTANCE_LEDGER.md` — Prettier table-column re-alignment of the pre-existing T104 row
  (1 insertion / 1 deletion, zero content change, verified by `git diff`). Required for the
  whole-repo `format:check`/`ci:check` Prettier gate to exit 0; the same drift was repaired by the
  T104 round-2 run. This is a Controller-owned ledger; the change is byte-level whitespace only and
  is flagged here for the Controller's awareness.

## DATABASE / MIGRATION CHANGES

### `geo_observation_runs` inventory (identical on both dialects)
| property | column | type (sqlite / pg) | null | default |
| --- | --- | --- | --- | --- |
| `id` | `id` | text / text | no | PK |
| `batchId` | `batch_id` | text / text | no | — (free-form grouping id) |
| `projectId` | `project_id` | text / text | no | FK → projects(id) cascade |
| `promptId` | `prompt_id` | text / text | no | composite FK target |
| `promptVersion` | `prompt_version` | integer / integer | no | — (observed-version fact snapshot) |
| `surfaceType` | `surface_type` | text enum (4 values) | no | — |
| `surfaceName` | `surface_name` | text / text | no | — (free text) |
| `fidelity` | `fidelity` | text enum (4 values) | no | — |
| `provider` | `provider` | text / text | yes | — (free text) |
| `engine` | `engine` | text / text | yes | — (free text) |
| `model` | `model` | text / text | yes | — (free text) |
| `modelVersion` | `model_version` | text / text | yes | — (free text) |
| `webSearch` | `web_search` | integer(bool) / boolean | yes | — (3-state) |
| `searchMode` | `search_mode` | text / text | yes | — (free text) |
| `marketProfileId` | `market_profile_id` | text / text | yes | — (composite FK target) |
| `repeatIndex` | `repeat_index` | integer / integer | no | — (CHECK ≥ 0) |
| `applicationCacheBypassed` | `application_cache_bypassed` | integer(bool) / boolean | no | — (typed fresh-path flag) |
| `rawAnswer` | `raw_answer` | text / text | yes | — (raw payload capture) |
| `rawResponse` | `raw_response` | text / text | yes | — (raw payload capture) |
| `providerRequestId` | `provider_request_id` | text / text | yes | — |
| `usage` | `usage_json` | text / text | yes | — (raw payload capture) |
| `startedAt` | `started_at` | text / text | no | — |
| `finishedAt` | `finished_at` | text / text | yes | — |
| `status` | `status` | text enum (4 values) | no | — |
| `createdAt` | `created_at` | text / text | no | dialect timestamp default |

| artifact | definition |
| --- | --- |
| Project FK | `project_id → projects(id) ON DELETE CASCADE` |
| Prompt FK | `(project_id, prompt_id) → search_prompts(project_id, id) ON DELETE CASCADE` — same-Project composite |
| MarketProfile FK | `(project_id, market_profile_id) → search_market_profiles(project_id, id) ON DELETE CASCADE` — same-Project composite; NULL market_profile_id = no profile attached |
| CHECK | `geo_observation_runs_repeat_index_nonnegative` → `repeat_index >= 0` |
| Read index | `geo_observation_runs_project_idx(project_id)` (non-unique) |
| Read index | `geo_observation_runs_batch_idx(batch_id)` (non-unique) |
| Read index | `geo_observation_runs_prompt_idx(prompt_id)` (non-unique) |
| Read index | `geo_observation_runs_market_profile_idx(market_profile_id)` (non-unique) |
| Supporting unique index | `search_prompts_project_id_id_idx(project_id, id)` on `search_prompts` — required unique target of the runs' composite Prompt FK; `id` is the PK, so it adds no business uniqueness |

### Enum sets (canonical V1.0, DB text-enum + Zod boundary)
- `surface_type` (ObservationSurfaceType): `AGGREGATED_SEARCH_DATA`, `MODEL_API_SEARCH`,
  `CONSUMER_PRODUCT_OBSERVED`, `MANUAL_CONSUMER_OBSERVATION`.
- `fidelity` (SurfaceFidelity): `AGGREGATED`, `API_SIMULATION`, `CONSUMER_OBSERVED`, `MANUAL_OBSERVED`.
- `status`: `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`.

### Constraint / behavior rationale
- **Cross-Project runs are impossible at the DB**: both composite FKs bind the run's `project_id` to
  the parent row's `project_id`, so a `proj_alpha` run cannot reference a `proj_beta` prompt or
  market profile (negative migration-backed tests for both).
- **No dangling runs**: deleting a Prompt, a MarketProfile, or a Project cascades its runs away (all
  three paths migration-tested); a Topic deletion cascades prompts then runs.
- **No business uniqueness on runs**: no unique index groups or dedupes repeats — two independent
  observations of the same prompt/provider/model/surface, even at the same `repeat_index`, both
  persist (migration-tested; `21_TEST_ACCEPTANCE_PLAN.md` §3).
- **Relational data is never JSON-encoded** — Project, Prompt, and MarketProfile relations are
  explicit typed FK columns; `raw_response`/`usage_json` are raw payload captures only.
- **Enum columns** carry the canonical uppercase unions; case-mismatched/unsupported/empty values
  are rejected at the Zod boundary (no coercion/fallback).

### Migration identifiers
- D1 **0050** (`0050_dusty_stardust`), journal idx 50, `drizzle/meta/0050_snapshot.json`.
- Postgres **0028** (`0028_brainy_firedrake`), journal idx 28, `drizzle-pg/meta/0028_snapshot.json`.
Both are the next identifiers after the accepted T104 migrations (0049 / 0027). The Postgres
migration creates the supporting `search_prompts_project_id_id_idx` unique index **before** the
composite-FK `ALTER TABLE`s (Postgres requires each referenced unique index to exist first); the
SQLite migration inlines the FKs in the CREATE TABLE (SQLite validates FK targets at DML time, so
intra-file order is unconstrained). The final dual-dialect `db:generate` reports **no schema change**
on either dialect, so schemas, 0050/0028 SQL, and their snapshots agree exactly.

## DEPENDENCIES CHANGED

None. `corepack pnpm install --frozen-lockfile` exits 0 with no resolution or change;
`package.json`/`pnpm-lock.yaml` are unchanged in the final `git status`. No package was added or
updated.

## TESTS ADDED

- `src/db/geo-observation-run.test.ts` (12 tests) — a real in-memory SQLite built from the shipped
  forward migration DDL (`drizzle/0045_search_market_profiles.sql` + `drizzle/0046_search_topics.sql`
  + `drizzle/0049_gigantic_johnny_blaze.sql` + `drizzle/0050_dusty_stardust.sql`) plus a raw
  `projects` table, with `PRAGMA foreign_keys = ON`:
  1. A valid run persists with the full V1.0 field set and keeps projects isolated.
  2. Every canonical surface-type / fidelity / run-status enum value stores (4×4+4 = 20 rows).
  3. A run with no market profile and NULL optional provenance fields persists.
  4. Raw answer/response/usage payloads round-trip verbatim (raw capture, never parsed/rewritten).
  5. A negative `repeat_index` is rejected at the storage boundary (CHECK).
  6. `repeat_index` 0 and positive repeats persist as three independent run rows.
  7. A run whose prompt belongs to another Project is rejected (composite-FK violation).
  8. A run whose market profile belongs to another Project is rejected (composite-FK violation).
  9. The row is append-only by schema shape: `created_at` exists, no `updated_at` column
     (`pragma_table_info`), and two identical same-`repeat_index` rows both persist (no mutation
     uniqueness).
  10. Deleting a Prompt cascades its runs away.
  11. Deleting a MarketProfile cascades its runs away.
  12. Deleting a whole Project cascades its runs away.
- `src/types/schemas/geo-observation-run.test.ts` (8 tests) — domain boundary:
  1. Every `surface_type` column value passes `observationSurfaceTypeSchema`.
  2. Unsupported, case-mismatched, and empty surface types (e.g. `aggregated_search_data`,
     `Model_API_Search`, `SEARCH_API`, `GEO`, ``) are rejected.
  3. Every `fidelity` column value passes `surfaceFidelitySchema`.
  4. Unsupported, case-mismatched, and empty fidelity values are rejected.
  5. Every `status` column value passes `geoObservationRunStatusSchema`.
  6. Unsupported, case-mismatched, and empty statuses (e.g. `pending`, `Succeeded`, `COMPLETED`,
     `FAILED `) are rejected.
  7. `geoObservationRepeatIndexSchema` accepts 0 and positive integers; rejects negatives,
     non-integers, NaN, and Infinity.
  8. Compile-time guard: exported row/enum types stay aligned with the storage columns (nullable
     `market_profile_id`, raw payload captures, no `updated_at`).
- `src/db/schema-parity.test.ts` (214 tests, passes) — auto-compares every table on both dialect
  barrels (columns/nullability/dataType/defaults/enums, PK, unique targets incl. the supporting
  index, FKs incl. `onDelete`, CHECK names). No manual parity-test edit was needed: the test
  enumerates the exported Search Growth modules, so `geoObservationRuns` and the
  `search_prompts_project_id_id_idx` index are covered automatically.

## COMMANDS RUN

Each approved command was run independently (`corepack pnpm ...`) — no chained/wrapped shell
operations. Sanitized evidence under `control/tasks/T105-M1-GEO-OBSERVATION-RUNS-SCHEMA/evidence/round-1/`.
All commands exit 0 unless noted.

1. `node --version` → exit 0 → `v24.16.0`
2. `corepack pnpm --version` → exit 0 → `10.30.1`
3. `corepack pnpm install --frozen-lockfile` → exit 0 → dependencies satisfied; manifests/lockfile unchanged
4. `corepack pnpm exec prettier --write <6 task-touched source/test files>` → exit 0 (each file
   formatted; the domain module, both schema files, the barrel, and both test files were written in
   this round). Separately, `prettier --write control/ACCEPTANCE_LEDGER.md` → exit 0 (content-neutral
   table re-alignment, required for `format:check`).
5. `corepack pnpm run db:migrate:local` → exit 0 → fresh worktree applied the full local D1 history
   0000–0050; output tail `0050_dusty_stardust ✅`; zero "✗|Failed|Error" occurrences.
6. `corepack pnpm run db:generate` → exit 0 (both dialects) → first run generated
   `0050_dusty_stardust` + `0028_brainy_firedrake`; after the Postgres FK-ordering fix the re-run
   reported **"No schema changes, nothing to migrate"** on both dialects.
7. `corepack pnpm exec vitest run <3 focused geo-observation/schema-parity files>` → exit 0 →
   **3 files / 234 tests passed** (12 storage + 8 boundary + 214 parity).
8. `corepack pnpm format:check` → exit 0 → `All matched files use Prettier code style!`
9. `corepack pnpm types:check` → exit 0 → `tsc --noEmit` clean.
10. `corepack pnpm lint` → exit 0 → `Found 0 warnings and 0 errors.`
11. `corepack pnpm test` → exit 0 → **153 files / 1288 tests passed.**
12. `corepack pnpm build` → exit 0 → vite client + SSR + `open_seo_audit` bundles built; trailing
    `tsc --noEmit` clean.
13. `corepack pnpm ci:check` → exit 0 → prettier clean, knip clean, both `tsc --noEmit` runs clean,
    oxlint 0 errors, plugin-skill sync + sync check clean.
14. Read-only Git inspection: `git status`, `git diff --stat`, `git diff`, `git log`, `git rev-parse`,
    `git ls-files` — see GIT STATUS/DIFF SUMMARY.

### Permission-layer note on re-runs
Re-running `db:migrate:local` and `db:generate` at evidence-capture time was auto-denied by the
harness (their pnpm scripts expand to multi-operation commands and this session has no approval
surface). Both were already executed to exit 0 earlier in this round (results recorded above in
items 5–6 and corroborated by the migration-backed storage tests, the schema-parity suite, and the
green `ci:check`/`build`).

## COMMAND RESULTS (evidence)

- **db:generate consistency** — the dual-dialect run reports "No schema changes, nothing to migrate"
  on **both** dialects, so the 0050/0028 migrations and snapshots match the shipped schemas exactly
  (including `geo_observation_runs`, its CHECK, its 4 read indexes, and the supporting
  `search_prompts_project_id_id_idx` index).
- **Local migration** — `db:migrate:local` exits 0; the local D1 store is fully applied through
  `0050_dusty_stardust.sql`.
- **Focused suite** — 234/234 pass: run storage (12), domain boundary (8), and full Search Growth
  schema parity (214).
- **Aggregate gates all exit 0** — `format:check`, `types:check`, `lint`, `test`, `build`, and
  `ci:check` each ran literally and green:
  - `lint` first run flagged one task-local assertion (`row.name as string`) in
    `src/db/geo-observation-run.test.ts` under the type-aware `no-unsafe-type-assertion` rule;
    repaired with a type-guard filter (`typeof name === "string"`), re-ran to 0 warnings / 0 errors.
  - `types:check` first run flagged literal-widening on the `ALPHA_RUN` fixture's enum fields and
    the enum round-trip loop variables in `src/db/geo-observation-run.test.ts`; repaired with
    `as const` on the fixture and typed enum arrays (`as ObservationSurfaceType[]` etc.), re-ran
    clean. Vitest (transpile-only) had been green throughout; `tsc` confirmed the type fixes.
  - `format:check` needed the content-neutral `control/ACCEPTANCE_LEDGER.md` re-alignment (see
    FILES CHANGED); after that the whole-repo check is clean and is re-confirmed inside `ci:check`.
- No schema, migration, snapshot, journal, manifest, lockfile, or dependency file changed after the
  final `db:generate` no-op confirmation.

## RUNTIME EVIDENCE

- **D1/SQLite migration** — `0050_dusty_stardust.sql` is the applied head of the local D1 history;
  `db:migrate:local` exits 0.
- **Storage tests** — all 12 migration-backed run tests pass against the real 0050 DDL (with the
  0045/0046/0049 parents and `PRAGMA foreign_keys = ON`): the DB accepts a valid full-field run,
  persists all 4×4+4 canonical enum rows and NULL-profile/NULL-optional runs, round-trips raw
  payloads verbatim, rejects a negative repeat index, accepts repeat 0/positive as independent rows,
  rejects cross-Project prompt and market-profile references, exposes no `updated_at` column, allows
  two identical same-`repeat_index` rows, and cascades runs on Prompt/MarketProfile/Project deletion.
- **Domain boundary** — the Zod boundary accepts every DB enum value and rejects unsupported/
  case-mismatched/empty values; the repeat-index schema enforces non-negative integers; the exported
  types are compile-time-aligned with storage.
- **Schema parity** — `geo_observation_runs` and the supporting Prompt index are structurally
  identical on SQLite and Postgres (columns, PK, unique targets, FKs incl. `onDelete`, CHECK names);
  214/214 parity tests pass.
- **Postgres migration artifact** — pg migration SQL/journal/snapshot are consistent
  (`db:generate:pg` reports no diff); the pg DDL orders the supporting unique index before the
  composite-FK `ALTER TABLE`s as Postgres requires. A live `db:migrate:pg` still requires a real
  Postgres URL and is not in the approved command set.

## KNOWN LIMITATIONS

- `db:migrate:pg` was not executed (requires a live `POSTGRES_DATABASE_URL`; not in the approved
  command set). Postgres migration/snapshot consistency is proven via `db:generate:pg` (no diff),
  the parity tests, and review of the generated DDL ordering.
- Re-running `db:migrate:local` / `db:generate` at evidence-capture time was auto-denied by the
  harness (multi-operation pnpm scripts, no approval surface); their verified earlier exit-0 results
  are recorded as round-1 evidence and are corroborated by the migration-backed tests (which execute
  the actual 0050 DDL), the 214 schema-parity tests, and the green `test`/`build`/`ci:check`.
- Migration file names are drizzle-kit's auto-generated tags (`0050_dusty_stardust`,
  `0028_brainy_firedrake`) rather than semantic names, because `db:generate` cannot be passed a
  custom name under the approved-command set and no unlisted rename/delete command is allowed.
  Identifiers are the required next values (D1 0050, Postgres 0028); journal/snapshot/file tags agree.
- The reference-only contextual fields `topic_id`, `country`, `language`, `observed_at`,
  `raw_citations_json`, and `raw_response_ref` are intentionally not shipped (see reconciliation).
  If a later Accepted ADR defines them as first-class columns, they arrive as their own migration.
- `application_cache_bypassed` is stored as a typed flag; the fresh-path invariant
  (`= true`) is enforced by the later sampling/execution path (ADR-003), not by this storage slice.
- Per scope: no provider/execution/sampling/cache/parser/metrics/CRUD/UI/connector/later-domain
  code was added; `schemas/domain-types.ts`, `schemas/migrations-reference.sql`, and
  `05_DOMAIN_DATA_MODEL.md` were **not** edited.

## DEVIATIONS FROM TASK

None in product scope. Design decisions recorded and explained above:
- **`fidelity`** (not the migration-reference `surface_fidelity`) is the shipped column name, per §6
  and the TASK field list.
- **`raw_citations_json`/`raw_response_ref`** are not separate columns; citations remain inside the
  raw response payload for the later Parse task, and V1.0 has no external raw-response store.
- **Contextual `topic_id`, `country`, `language`, and `observed_at`** are not shipped as columns;
  the run's topic/project/market/language context is bound through the same-Project prompt FK and
  optional market-profile FK, and §6's occurrence window is recorded by `started_at`/`finished_at`
  plus the append-only `created_at`.
- Delete behavior is **cascade for all parents** (Prompt, MarketProfile, Project), matching the
  accepted T100–T104 tree-wide teardown pattern and proving "no dangling run" by migration tests.
- The supporting `search_prompts_project_id_id_idx` unique index is added to `searchPrompts` purely
  to satisfy the runs' composite-FK unique-target requirement on both dialects; `id` is already the
  PK, so it adds no business uniqueness. This mirrors the accepted `search_topics_project_id_id_idx`
  (T101/T102) and `search_market_profiles_project_id_id_idx` (T104) patterns.
- Adjacent gate-driven correctness fixes, none of which change product scope, schema, migration, or
  domain behavior:
  - `control/ACCEPTANCE_LEDGER.md` was Prettier-reformatted (pure markdown table-column
    re-alignment, zero content change) because the mandatory whole-repo `format:check` gate flagged
    that Controller-owned file at HEAD (pre-existing drift from the T104 accept commit, independent
    of any T105 change). Flagged for the Controller's awareness since the file is outside the task
    diff.
  - `src/db/geo-observation-run.test.ts` used a type-guard filter instead of `as string` for the
    `pragma_table_info` column-name mapping (type-aware `no-unsafe-type-assertion`), and typed its
    `ALPHA_RUN` fixture / enum loops to satisfy `tsc`. Assertion semantics unchanged; 12/12 tests.

## SECURITY NOTES

- No external requests, credentials, account access, CAPTCHA/2FA bypass, stealth behavior, cookie
  upload, production publishing, remote migration, or paid action was performed.
- No dependency, lockfile, manifest, ADR, scope-lock, or production resource change.
- All work is local to the isolated worktree; `db:migrate:local` touches only the gitignored local
  Wrangler D1 state.
- Run ownership and relations are explicit FK columns — no relational data is stored in JSON/text
  payloads; raw captures are stored as raw text only. No new untrusted-input, auth, credential, or
  execution path was added (storage + Zod-boundary-only change). Enum/status values are validated at
  the runtime boundary, so unsupported/case-mismatched/empty values cannot reach storage.

## GIT STATUS/DIFF SUMMARY

Branch `ai-task/T105-M1-GEO-OBSERVATION-RUNS-SCHEMA`, HEAD `b533873867d056378f99fb1e1f485af85dfccfe2`.
`git status --short`:

```
 M control/ACCEPTANCE_LEDGER.md
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? control/tasks/T105-M1-GEO-OBSERVATION-RUNS-SCHEMA/evidence/
?? drizzle-pg/0028_brainy_firedrake.sql
?? drizzle-pg/meta/0028_snapshot.json
?? drizzle/0050_dusty_stardust.sql
?? drizzle/meta/0050_snapshot.json
?? src/db/geo-observation-run.test.ts
?? src/types/schemas/geo-observation-run.test.ts
?? src/types/schemas/geo-observation-run.ts
```

`git diff --stat` (tracked modifications, 6 files, +413/−1): `src/db/search-growth.schema.ts`
(+204), `src/db/pg/search-growth.schema.ts` (+193), `src/db/schema.ts` (+1), the two `_journal.json`
files (+7 each), and the content-neutral `control/ACCEPTANCE_LEDGER.md` re-alignment (+1/−1).
Journal diffs add exactly one entry each: `drizzle/meta/_journal.json` idx 50 tag
`0050_dusty_stardust`; `drizzle-pg/meta/_journal.json` idx 28 tag `0028_brainy_firedrake`. The
`control/ACCEPTANCE_LEDGER.md` diff was verified byte-level to be whitespace-only (1 insertion / 1
deletion, no text change). Untracked additions are the two migration SQL files + two meta snapshots,
the domain-boundary module + two test files, and the control-channel `DELIVERY.md` + `evidence/round-1/*`.
No lockfile, package manifest, ADR, scope, `.greptile`, `.github`, `.agents`, or production change
is part of the diff. `dist/` and `.wrangler/` outputs are gitignored. Nothing committed; nothing
merged; no other task started; `REVIEW.md` untouched.

## READY FOR REVIEW

Both dialects define logically equivalent `geo_observation_runs` storage with only the reconciled
V1.0 observation-fact fields (TASK item 1); the row is append-only by schema/contract shape with no
`updated_at` and no mutation/workflow/API surface (item 2); surface/fidelity/status enums plus
repeat-index validation are explicit at the Zod boundary with unsupported/case-mismatched/empty and
negative/non-integer values rejected (item 3); same-Project parent relations are DB-enforced via
composite FKs with cascade delete behavior that cannot leave dangling runs, and cross-Project
references are proven impossible by focused migration-backed tests (item 4); no uniqueness rule
prevents independently stored repeat observations, and raw relationship data is not encoded in
JSON/text (item 5); forward migrations/snapshots/journals use the next identifiers after T104
(D1 0050, PG 0028), the local D1 migration succeeds, schema parity passes (214), and the final
dual-dialect `db:generate` produces no additional migration on either dialect (item 6); and no
provider/network/cache/sampling/parser/metrics/CRUD/UI/connector/later-domain work, duplicate
store, dependency/lockfile change, ADR/scope change, credential use, external request, or production
action occurred (item 7 + OUT OF SCOPE). Focused tests 234/234; full suite 153 files / 1288 tests;
`format:check`, `types:check`, `lint`, `build`, and `ci:check` all exit 0. DELIVERY maps every
changed path, source reconciliation, invariant, test, command result, limitation, security note, and
final Git diff/status above. Not committed; not merged; no other task started.
