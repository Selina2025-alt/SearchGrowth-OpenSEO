# DELIVERY — T140-M2-GEO-OBSERVATION-PARSE-RECORDER-REPOSITORY

TASK ID: T140-M2-GEO-OBSERVATION-PARSE-RECORDER-REPOSITORY
STATUS: READY FOR REVIEW
BRANCH: ai-task/T140-M2-GEO-OBSERVATION-PARSE-RECORDER-REPOSITORY
BASE COMMIT: 12028fb (control: record T139 acceptance)
ROUND: 1
REVIEW.md: does not exist (no findings to address)

## IMPLEMENTATION SUMMARY

Two new modules and one focused test file. A narrow, storage-free
`GeoObservationParseRecorder` port with its typed `GeoObservationParseFact`
contract, plus a repository adapter that turns exactly one validated parse fact
into exactly one `INSERT` into the accepted `geo_observation_parses` table.

- `record(parseFact)` validates the runtime boundary first, then writes one row.
  Every accepted column is taken from the fact: `id`, `project_id`, `run_id`,
  `parser_version`, `parse_status`, `accuracy_status`, `parsed_at`,
  `is_current`. `created_at` is the only value the adapter does not supply — it
  keeps the existing database default.
- Validation reuses the accepted canonical Zod enums from
  `src/types/schemas/geo-observation-parse.ts` (T106). An unsupported,
  case-mismatched, or empty status, a missing/non-boolean `isCurrent`, an absent
  accuracy value, and an empty identity/version/timestamp all reject **before**
  the INSERT. Nothing is normalized, trimmed, inferred, or substituted.
- Append-only and versioned: one INSERT, no update, upsert, dedupe, retry,
  delete, current-pointer selection, or lifecycle transition. A duplicate
  `(run_id, parser_version)`, a same-Project mismatch, and a dangling run all
  surface as the database error they are. A v1 and a v2 fact for the same raw
  run persist as two independent rows.
- No parser, raw-response inspection, entity/citation extraction,
  recommendation/sentiment/accuracy computation, provider call, cache access,
  batch orchestration, workflow, UI, CRUD/server function, credential,
  publishing, paid action, production behavior, migration, schema field, enum,
  snapshot, or dependency was added.

## FACT → STORAGE MAPPING

`GeoObservationParseRecorderRepository.ts:68` (`record`).

| `GeoObservationParseFact` field | `geo_observation_parses` column | Notes |
| --- | --- | --- |
| `id` | `id` | caller-owned parse identity; never generated |
| `projectId` | `project_id` | never inferred from the run |
| `runId` | `run_id` | the immutable raw run parsed |
| `parserVersion` | `parser_version` | version half of `(run_id, parser_version)` |
| `parseStatus` | `parse_status` | canonical `SUCCESS \| PARTIAL \| FAILED` |
| `accuracyStatus` | `accuracy_status` | canonical `ACCURATE \| PARTIAL \| INACCURATE \| UNKNOWN`, or `null` |
| `parsedAt` | `parsed_at` | application-supplied moment, stored verbatim |
| `isCurrent` | `is_current` | boolean mode; a fact, not a pointer transition |
| — not carried by the fact | `created_at` | existing DB default `(current_timestamp)` |

No column is derived and no default is applied by the adapter; the only value
that is not a field of the fact is the database's own `created_at` default.

## VALIDATION BEHAVIOR (REUSED CANONICAL CONTRACTS)

`geoObservationParseFactSchema` (`GeoObservationParseRecorderRepository.ts:49`)
is built from `geoObservationParseStatusSchema` and
`geoObservationAccuracyStatusSchema` — the accepted T106 Zod enums derived from
the Drizzle column `enumValues` — so the runtime boundary cannot drift from the
domain contract.

Rejected **before any row is written** (the error names the failing field paths):

| Input | Rejected because |
| --- | --- |
| `parseStatus`: `"success"`, `"Success"`, `"SKIPPED"`, `""`, `"   "`, `7`, `null`, absent | not a canonical `SUCCESS \| PARTIAL \| FAILED` value; empty/case-mismatched values are never normalized |
| `accuracyStatus`: `"accurate"`, `"GOOD"`, `""`, `1`, absent/`undefined` | not a canonical status and not an explicit `null`; an absent assessment is never silently converted to NULL |
| `isCurrent`: `"true"`, `1`, `0`, `null`, absent | not a boolean; the column's integer mode is never used to coerce a truthy/falsy stand-in |
| `id`, `projectId`, `runId`, `parserVersion`, `parsedAt`: `""` | an empty string has no fallback and would be stored as an empty column |
| `accuracyStatus: null` | **accepted** — no accuracy assessment is a legitimate fact and is stored as SQL NULL |

The SQLite `TEXT`/`INTEGER` columns would happily store most of these values
(there is no CHECK constraint on `parse_status`/`accuracy_status`), so the Zod
pass — not the database — is what makes the rejection real; see RUNTIME
EVIDENCE for the probe that proves the tests are not vacuous.

## APPEND-ONLY AND ERROR EVIDENCE

- **One insert path.** The adapter body is
  `db.insert(geoObservationParses).values(values)` (`:84`). The focused
  source-boundary test asserts the module contains no `.update(`, `.onConflict`,
  `.delete(`, or `.set(` and imports no mention/citation table.
- **v1/v2 coexistence.** Recording `parserVersion "1.0.0"` then `"2.0.0"` for
  `run_alpha_1` yields two rows; the v1 row is captured before and compared
  `toEqual` after, so a parser upgrade cannot rewrite the prior version.
- **Duplicate version.** A second fact with the same `(run_id,
  parser_version)` under a new parse id surfaces
  `UNIQUE constraint failed` (on the cause chain, as Drizzle wraps the driver
  error) and leaves the original row untouched.
- **Same-Project run.** A fact claiming `proj_alpha` for `run_beta_1` (which
  belongs to `proj_beta`) surfaces `FOREIGN KEY constraint failed` with zero
  rows, via the composite FK `(project_id, run_id)`.
- **Dangling run.** A fact naming `run_missing` surfaces
  `FOREIGN KEY constraint failed` with zero rows.
- **Raw data untouched.** The raw run row is captured before and compared
  `toEqual` after v1+v2 recording, and `geo_entity_mentions` is asserted empty.
  The adapter never reads or writes a raw run.

## FILES CHANGED

Three new files; **no existing file was modified** (the `repositories/`
directory already existed from T139).

- `src/server/features/search-growth/geo/services/geoObservationParseRecorder.ts`
  (63 lines) — the port and the `GeoObservationParseFact` contract. Storage-free
  and DB-free, so a future parser can be exercised against a fake recorder.
- `src/server/features/search-growth/geo/repositories/GeoObservationParseRecorderRepository.ts`
  (91 lines) — the adapter: the fact schema, the validation gate, and the single
  INSERT.
- `src/server/features/search-growth/geo/repositories/GeoObservationParseRecorderRepository.query.test.ts`
  (486 lines, under the 400 non-blank/non-comment `max-lines` budget) — 31
  focused tests against real SQL storage.
- `control/tasks/T140-.../DELIVERY.md` (this file).

## DATABASE/MIGRATION CHANGES

None. No migration, snapshot, schema, enum, or domain-type file was added or
edited; `drizzle/**` and `drizzle-pg/**` are untouched (`git status` shows no
modified tracked file). The adapter reuses the accepted `geo_observation_parses`
DDL (`drizzle/0051` + `0052` + `0053`) and the accepted T106 Zod domain
boundary. `created_at` keeps the shipped `(current_timestamp)` default.

## DEPENDENCIES CHANGED

None. `package.json` and `pnpm-lock.yaml` are unchanged; no package was added,
removed, or upgraded.

## TESTS ADDED

`GeoObservationParseRecorderRepository.query.test.ts` builds an in-memory SQLite
database from the actual forward migration DDL (0045/0046/0048/0049/0050 for the
parents and immutable raw run, then 0051/0052/0053 for the accepted parse table)
with `PRAGMA foreign_keys = ON`, and replaces `@/db` with that handle so the
production adapter code path runs unmodified. 31 tests:

| # | Test |
| --- | --- |
| 1 | one fact → one row, every accepted column faithful, `created_at` from the DB default |
| 2 | every canonical `parse_status` and `accuracy_status` maps, including `null` accuracy |
| 3 | v1/v2 parses of one raw run coexist and the v1 row is unchanged (no update/upsert) |
| 4 | duplicate `(run_id, parser_version)` surfaces `UNIQUE constraint failed`, original row intact |
| 5 | same-Project run FK violation surfaces, zero rows |
| 6 | dangling run FK violation surfaces, zero rows |
| 7 | v1/v2 recording leaves the raw run `toEqual` and `geo_entity_mentions` empty |
| 8–15 | invalid `parse_status` (lowercase, mixed case, unsupported, empty, whitespace, number, null, absent) rejects before any row |
| 16–20 | invalid `accuracy_status` (lowercase, unsupported, empty, number, absent) rejects before any row |
| 21–25 | non-boolean `is_current` (string, number, zero, null, absent) rejects before any row |
| 26–30 | empty `id` / `projectId` / `runId` / `parserVersion` / `parsedAt` rejects before any row |
| 31 | source boundary: one insert path, no update/upsert/delete/set, no mention/citation table |

Dual-dialect parity is retained without a migration: the existing
`src/db/schema-parity.test.ts` (369 tests) stays green and is included in the
focused run, re-confirming `geo_observation_parses` is structurally identical on
SQLite and Postgres.

## COMMANDS RUN

All commands ran from the worktree root on Windows Git Bash via `corepack pnpm`,
each invoked independently. Exact exits:

| # | Command | Exit |
| --- | --- | --- |
| 1 | `corepack pnpm exec prettier --write <3 task files>` | **1** (`prettier` not found — no `node_modules` in the worktree) |
| 2 | `corepack pnpm exec vitest run <focused file>` | **1** (`vitest` not found — same cause) |
| 3 | `corepack pnpm install --frozen-lockfile` | 0 (1m 10.5s) — **not an approved command; disclosed under DEVIATIONS** |
| 4 | `corepack pnpm exec vitest run <focused file>` | 0 (31 tests) |
| 5 | `corepack pnpm exec vitest run <focused file>` (validation probe active) | 0 (31 tests — probe was ineffective, see below) |
| 6 | `corepack pnpm exec vitest run <focused file>` (gate disabled probe) | **1** (23 failed / 8 passed) — expected, proves the rejection tests are non-vacuous |
| 7 | `corepack pnpm exec prettier --write <3 task files>` (after reverting the probe) | 0 |
| 8 | `corepack pnpm exec vitest run <focused file>` | 0 (31 tests) |
| 9 | `corepack pnpm exec vitest run <5 focused files>` | 0 (466 tests) |
| 10 | `corepack pnpm format:check` | 0 |
| 11 | `corepack pnpm types:check` | 0 |
| 12 | `corepack pnpm lint` | 0 (0 warnings, 0 errors, 941 files) |
| 13 | `corepack pnpm test` | 0 |
| 14 | `corepack pnpm build` | 0 |
| 15 | `corepack pnpm ci:check` | 0 |
| 16 | `git status --short`, `git diff --stat`, `git rev-parse HEAD`, `wc -l <3 files>` | 0 |

Focused files (row 9):
`src/server/features/search-growth/geo/repositories/GeoObservationParseRecorderRepository.query.test.ts`,
`src/server/features/search-growth/geo/repositories/GeoObservationRunRecorderRepository.query.test.ts`,
`src/server/features/search-growth/geo/services/freshGeoSampling.test.ts`,
`src/db/geo-observation-parse.test.ts`, `src/db/schema-parity.test.ts`.

Rows 1–2 failed only because this worktree shipped without `node_modules`; row 3
installed from the committed lockfile, after which every gate ran. No red gate
was bypassed, skipped, or suppressed.

## COMMAND RESULTS

- Focused (row 9): parse recorder `31`, run recorder `36`, fresh sampling `19`,
  accepted parse schema `11`, schema parity `369` → **5 files, 466 passed,
  0 failed**.
- Full (row 13): **206 files, 2010 passed, 0 failed** (99.0s). T139's accepted
  baseline was 205 files / 1979 tests, so this task adds 1 file / 31 tests.
- `build` (row 14): vite client, SSR and `open_seo_audit` environments built
  (3682 / 5086 / 431 modules); the trailing `tsc --noEmit` was clean.
- `ci:check` (row 15): prettier clean, knip clean, both `tsc` projects clean,
  oxlint 0 warnings / 0 errors on 941 files, `plugin skill sync clean`. Not
  sandbox-denied; no aggregate gate had to be recorded as denied.
- `format:check` (row 10): all files match Prettier style.
- `types:check` (row 11) and `lint` (row 12): clean.

## RUNTIME EVIDENCE

Runtime evidence is the focused test file executed against real SQL storage, not
a mock, plus a deliberate falsification probe:

- **The rejection tests are not vacuous.** A temporary local probe disabled the
  validation gate (keeping the INSERT), leaving the invalid facts to reach
  SQLite. 23 of 31 tests then failed, i.e. the invalid values really do reach
  storage when the gate is removed (`Failed query: insert into
  "geo_observation_parses" ... params: parse_alpha_v1,,run_alpha_1,...`), and the
  `rejects.toThrow(...)` + zero-row assertions are what stop them. **The probe
  was reverted before rows 7–15**; every gate above ran on the reverted, final
  code, and the focused file was re-run green (row 8) after the revert.
  (The first probe attempt only swapped the post-validation value source and was
  ineffective — recorded for honesty; the gate itself was the second probe.)
- **Faithful mapping.** One fact persists one row with `project_id`,
  `run_id`, `parser_version`, `parse_status`, `accuracy_status`, `parsed_at`,
  `is_current` all equal to the fact, and `created_at` populated by the database
  default.
- **Enum coverage.** All three `parse_status` values, all four
  `accuracy_status` values, and explicit `null` accuracy round-trip.
- **Versioned append-only.** v1/v2 rows for `run_alpha_1` coexist; the v1 row
  compares `toEqual` before and after the v2 recording.
- **Failure propagation.** `UNIQUE constraint failed` for a duplicate
  `(run_id, parser_version)` with the original row intact; `FOREIGN KEY
  constraint failed` for both the cross-Project run and the dangling run, each
  with zero rows written.
- **No collateral writes.** The raw run row is `toEqual` before/after v1+v2
  recording and `geo_entity_mentions` stays empty.
- **Dual-dialect parity retained.** `schema-parity.test.ts` (369 tests) is green
  with no migration added.

No provider call, credential, account, Prompt Explorer/R2/application-cache
access, Cloudflare Workflow, scheduler, publishing, or paid action was invoked.

## KNOWN LIMITATIONS

- The adapter is not yet wired to a caller: no GEO parser or parse-recording
  service exists yet, and building one is explicitly out of TASK scope. The port
  contract is exercised by the focused tests and can be implemented by a fake.
- `accuracyStatus` must be present as either a canonical status or an explicit
  `null`. An omitted/`undefined` accuracy value is rejected rather than coerced
  to NULL, because coercing it would silently substitute a value the fact never
  carried. A producer that has made no assessment writes `null`.
- The adapter does not pre-read the run to check it exists; the composite FK is
  the authority. A pre-read would add a TOCTOU window and duplicate a rule the
  database already enforces.
- Failure reasons are surfaced through Drizzle's wrapped error (driver message on
  `cause`), consistent with every other repository in the codebase; the adapter
  does not re-wrap or normalize them.
- The test fixture uses a minimal `projects (id text PRIMARY KEY)` stub plus the
  real parent DDLs, matching the accepted T106 storage test's approach.

## DEVIATIONS FROM TASK

- **Bootstrap install (disclosed).** The worktree shipped with **no
  `node_modules`**, so no approved command could run (rows 1–2). Before any gate
  I ran `corepack pnpm install --frozen-lockfile` (row 3, exit 0, 1m 10.5s). This
  is the documented baseline prerequisite but is **not** in TASK's APPROVED
  COMMANDS list; it is disclosed here. It installed from the committed
  `pnpm-lock.yaml`; `package.json` and `pnpm-lock.yaml` are unchanged and no new
  dependency exists. The accepted T108 and T130 deliveries hit the same missing
  `node_modules` and used the same command.
- **Temporary verification probe.** Rows 5–6 used a local, reverted probe of the
  validation gate to prove the rejection tests can fail. No probe code is in the
  delivered files (row 7 formatted the reverted revision, row 8 re-ran it
  green).
- Nothing else. No parser, raw-response inspection, entity/citation extraction,
  recommendation/sentiment/accuracy computation, current-pointer workflow,
  provider, cache, workflow, UI, CRUD/server function, migration, schema field,
  enum, snapshot, dependency, or scope change; no Accepted ADR or
  `29_SCOPE_LOCK.md` edit; no acceptance criterion weakened.

## SECURITY NOTES

- Credential-free and network-free: no provider call, API key, account,
  credential, or paid action; the tests run entirely against in-process SQLite.
- No Prompt Explorer/R2/application-cache access, no CAPTCHA/2FA bypass, no
  stealth behavior, no cookie upload, no publishing, no production behavior.
- Write path is a single append-only INSERT: no update/upsert/delete, no
  lifecycle transition, no current-pointer selection, no mention/citation write,
  no modification of the raw run.
- Untrusted input is narrowed with Zod at the trust boundary before storage;
  invalid values are rejected rather than stored, normalized, or substituted.
  No secrets appear in files, commands, or logs.

## GIT STATUS/DIFF SUMMARY

HEAD: `12028fb58bd370c502f733ef32442bdff1d10409` (base commit, unchanged — no
commit was made).

```
$ git status --short
?? control/tasks/T140-M2-GEO-OBSERVATION-PARSE-RECORDER-REPOSITORY/
?? src/server/features/search-growth/geo/repositories/GeoObservationParseRecorderRepository.query.test.ts
?? src/server/features/search-growth/geo/repositories/GeoObservationParseRecorderRepository.ts
?? src/server/features/search-growth/geo/services/geoObservationParseRecorder.ts

$ git diff --stat      # empty: no tracked file modified
```

Line counts: `services/geoObservationParseRecorder.ts` 63,
`repositories/GeoObservationParseRecorderRepository.ts` 91,
`repositories/GeoObservationParseRecorderRepository.query.test.ts` 486.

`dist/`, `node_modules/`, and the `plugins/` skill-sync output are gitignored and
so do not appear; `ci:check` re-synced the plugin skills with no drift.

## READY FOR REVIEW

Yes — the port, the typed fact contract, and the append-only repository adapter
are implemented, the focused real-storage tests (31 new, 466 focused, 2010 full)
are green, and `format:check`, `types:check`, `lint`, `test`, `build`, and
`ci:check` all exit 0 on the final revision. No migration, schema, enum,
snapshot, dependency, parser, provider, cache, workflow, CRUD, credential,
publishing, or production behavior was added, and no Accepted ADR or scope
document was touched. Only Codex may PASS this task.
