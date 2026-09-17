# DELIVERY — T154-M2-GEO-OBSERVATION-BATCH-READER

TASK ID: T154-M2-GEO-OBSERVATION-BATCH-READER
MILESTONE: M2 GEO
ROUND: 1 of 3
REVIEW.md: not present (nothing to address)
STATUS: implementation complete, awaiting Codex review

## IMPLEMENTATION SUMMARY

Added one credential-free, strictly read-only repository module that reads a
single Project-scoped batch of immutable GEO observation runs.

- `GeoObservationBatchReaderRepository.readBatch(projectId, batchId)` validates
  both selector fields at the untrusted runtime boundary before any query, then
  issues exactly one SELECT over `geo_observation_runs` whose WHERE clause
  constrains **both** `project_id` and `batch_id`. A batch-only lookup is not
  expressible: the Project predicate is unconditional, which matters because
  `batch_id` is a free-form grouping id (V1.0 defines no batch table) with no
  cross-Project uniqueness.
- The result is the stored rows themselves, typed as the accepted
  `GeoObservationRun` row type and returned as `readonly GeoObservationRun[]`.
  `raw_answer`, `raw_response`, `usage_json` and every provenance field are
  handed back exactly as stored. Nothing is parsed, normalized, serialized,
  reconstructed, redacted, copied into a new evidence format, or filtered by
  status — a FAILED run with NULL evidence is still a row of its batch.
- Order is deterministic: `repeatIndex`, then `id`. The sort is applied to the
  read rows via Remeda's `sortBy` rather than pushed into SQL `ORDER BY`,
  because ids are text and dialect collations disagree about punctuation
  (SQLite BINARY vs. a locale-aware Postgres collation can order `run-a` and
  `runa` differently); one implementation makes the order total and identical
  on both dialects. It is a presentation order only — no row is preferred or
  dropped.
- Failure model: no `try`/`catch` exists in the module, so a database failure
  propagates as the driver's own error and can never be reported as an empty
  batch. An unusable selector raises `GeoObservationBatchReaderError` naming
  the offending field (`projectId` first, then `batchId`), before storage is
  touched.
- No aggregation, counting, completeness decision, cohort compatibility check,
  confidence classification, mention/citation extraction, repeat-count or
  fraction/metric computation, provider/credential, Prompt Explorer/R2 cache,
  scheduler, parser, UI, server function, workflow, or write path is present.
  The module contains no INSERT, UPDATE, DELETE, upsert, `.set`, `.onConflict`,
  or `.returning`.

## FILES CHANGED

Added (all untracked; no existing file modified):

- `src/server/features/search-growth/geo/repositories/GeoObservationBatchReaderRepository.ts`
  — the reader module (query, selector validation, typed error).
- `src/server/features/search-growth/geo/repositories/GeoObservationBatchReaderRepository.query.test.ts`
  — focused query tests against real local storage (17 tests).
- `src/server/features/search-growth/geo/repositories/GeoObservationBatchReaderRepository.boundary.test.ts`
  — static read-only / no-added-scope boundary proof (7 tests).

No other file, and no existing test, was touched.

## DATABASE/MIGRATION CHANGES

None. No schema, no migration, no snapshot, no index, and no Drizzle schema
edit. The reader consumes the accepted `geo_observation_runs` table (T105,
migration `0050_dusty_stardust.sql`) unchanged. The query is dialect-neutral
`select`/`where` Drizzle SQL and stays compatible with SQLite and Postgres.

## DEPENDENCIES CHANGED

None. No dependency added, removed, or upgraded; `pnpm-lock.yaml` is unchanged
and the bootstrap install ran with `--frozen-lockfile`. The module reuses
already-present dependencies: `drizzle-orm`, `remeda` (`sortBy`, the project's
sanctioned replacement for ES2023 `toSorted`), and `zod` (v4, matching the
sibling readers).

## TESTS ADDED

`GeoObservationBatchReaderRepository.query.test.ts` — real in-memory SQLite
built from the actual forward migration DDL for `geo_observation_runs` (0050)
plus its market-profile (0045), topic (0046) and prompt (0049) parents, foreign
keys enabled, `@/db` replaced with that handle so the production code path runs
unmodified. Rows are seeded directly as accepted storage, not through the T139
recorder.

1. batch rows come back in `repeatIndex` then `id` order, identically on repeat
   calls (insertion order and id order each contradict the asserted order);
2. another batch of the same Project is excluded;
3. another Project reusing the *same* batch id is excluded, in both directions;
4. an empty matching batch returns `[]` while a sibling batch is still stored;
5. stored raw evidence and provenance are returned exactly as stored — full-row
   `toEqual` against a direct select, plus an own-key-set comparison proving no
   field added or dropped, plus NULL evidence staying NULL for a FAILED repeat;
6. a read mutates nothing (whole table compared before/after two reads);
7. a database failure propagates: with the accepted table moved aside, the
   caller receives the driver's own `no such table: geo_observation_runs`
   reason from the cause chain instead of an empty list;
8. invalid `projectId` / `batchId` (number, null, undefined, object) each reject
   with the field named;
9. empty `projectId` and empty `batchId` reject *before* any query — each has a
   decoy row stored under the empty key, so a skipped validation would have
   returned that row instead of throwing.

`GeoObservationBatchReaderRepository.boundary.test.ts` — static proof that the
module performs exactly one `.select(` and no write verb of any kind, reads only
`geoObservationRuns` through the provider-aware `@/db` handle, constrains both
selector columns, orders by the two stored keys, reuses the accepted
`GeoObservationRun` type instead of re-declaring it, contains no parse/serialize
/aggregate/classify or provider/credential/cache/scheduler/filesystem access, and
has no `catch` that could turn a storage failure into an empty batch.

## COMMANDS RUN

Run independently with `corepack pnpm` (bare `pnpm` is not on PATH here):

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm exec prettier --write <the three task files>`
3. `corepack pnpm exec vitest run src/server/features/search-growth/geo/repositories/GeoObservationBatchReaderRepository.query.test.ts src/server/features/search-growth/geo/repositories/GeoObservationBatchReaderRepository.boundary.test.ts`
4. `corepack pnpm format:check`
5. `corepack pnpm types:check`
6. `corepack pnpm lint`
7. `corepack pnpm test`
8. `corepack pnpm build`
9. `corepack pnpm ci:check`
10. read-only `git status`

## COMMAND RESULTS

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `install --frozen-lockfile` | 0 | Dependencies were absent in this worktree; 980 packages installed, lockfile unchanged, "Lockfile is up to date" |
| 2 | `prettier --write` (3 files) | 0 | All three already formatted ("unchanged") |
| 3 | `vitest run` (2 task files) | 0 | **2 files / 24 tests passed** (7 boundary + 17 query) |
| 4 | `format:check` | 0 | "All matched files use Prettier code style!" |
| 5 | `types:check` | 0 | `tsc --noEmit` clean |
| 6 | `lint` | 0 | "Found 0 warnings and 0 errors" (976 files, type-aware) |
| 7 | `test` | 0 | **223 files / 2,313 tests passed** |
| 8 | `build` | 0 | client + SSR + audit worker bundles built |
| 9 | `ci:check` | 0 | prettier + knip + both `tsc` projects + oxlint + plugin-skill sync all clean |
| 10 | `git status` | 0 | only the three new files listed (untracked); no other modification |

Intermediate-run disclosure: the first run of command 3 failed 11 tests. Ten
cascaded from one test helper that renamed the `geo_observation_runs` table
aside and then tried to rename it back using a hard-coded source name, leaving
the table renamed for later `beforeEach` teardown; the eleventh failed because
Drizzle wraps the driver error, so the "no such table" reason is on the cause
chain. Both were test defects, not reader defects. They were fixed (helper takes
both table names; the failure assertion walks the cause chain) before every
recorded run above, including the focused run, and all subsequent runs of
commands 3–9 are on that corrected code. No gate was sandbox-denied, no
aggregate gate was bypassed, and no production, provider, credential, cache,
publishing, or paid action was invoked. No command outside the TASK-approved
list was used.

## RUNTIME EVIDENCE

- The reader executed a real SQL SELECT against a real SQLite engine (libsql
  `file::memory:`) built from the repository's actual migration DDL, with
  foreign keys on — not a mocked query builder. Row isolation, ordering, empty
  result, verbatim evidence, mutation-freedom, rejection-before-query, and
  failure propagation were all observed against that engine.
- Observed storage failure text reaching the caller unchanged:
  `Failed query: select ... from "geo_observation_runs" where (...) | ... |
  no such table: geo_observation_runs`.
- No provider call, network request, credential, cache, Prompt Explorer/R2
  access, billing/paid path, publishing, or production action was performed.
  The only commands executed are the approved ones listed above.

## KNOWN LIMITATIONS

- The reader is one self-contained module with no port type, because no consumer
  exists yet in the repository and TASK.md asks for one module. A later
  cohort/metric caller can introduce a port around `readBatch` without changing
  its behaviour.
- Ordering `id` is text order in UTF-16 code units. It is total and identical on
  both dialects, but it is not a business ranking; the batch's meaning does not
  depend on it.
- The read is unpaginated — a batch is bounded by the §3 repeat count (3, or 5
  for high-value prompts), so no limit/offset was invented.
- No composite `(project_id, batch_id)` index was added: that would be a schema
  change, which the task forbids; the accepted single-column
  `geo_observation_runs_project_idx` and `_batch_idx` cover the predicate.
- Selector validation rejects non-string and empty ids only. A whitespace-only
  id is a non-empty string and is passed through as a (matching-nothing) key;
  the task's stated rule is "non-empty", and trimming would invent a content
  policy the schema does not define.

## DEVIATIONS FROM TASK

- One extra test file (the static boundary test) beyond the required focused
  query tests. It is test-only evidence for the task's read-only and
  no-added-scope acceptance criteria, mirroring the accepted T145 boundary test;
  it changes no production code.
- The single module exports an object (`GeoObservationBatchReaderRepository`)
  whose method is `readBatch`, matching the export shape of every sibling
  repository in this folder, rather than a bare function.
- No other deviation. No scope was added, and no acceptance criterion was
  weakened.

## SECURITY NOTES

- Credential-free: no provider, API key, OAuth token, account, cookie, or
  environment secret is read or referenced.
- Read-only and append-only-preserving: the module has no write verb, no cache
  invalidation, no Prompt Explorer/R2 access, and no scheduler or workflow
  trigger. It cannot mutate or re-create evidence (ADR-005).
- Trust boundary: both selector fields are runtime-validated with Zod before any
  query, and the Project predicate is mandatory, so a caller cannot read across
  Projects with a shared batch id.
- Fail-closed: no `catch` and no empty-list fallback, so a storage failure is
  never disguised as an empty (and therefore apparently valid) batch.
- No data leaves the process: no logging, no telemetry, no serialization, no
  network egress. Raw evidence is returned to the caller, never redacted or
  exported.
- No production publishing, paid behavior, CAPTCHA/2FA bypass, stealth
  behavior, or cookie upload; no `.greptile/**`, `AGENTS.md`, `CLAUDE.md`,
  `.agents/skills/**`, or `.github/**` file was modified.

## GIT STATUS/DIFF SUMMARY

Branch: `ai-task/T154-M2-GEO-OBSERVATION-BATCH-READER` (not merged, not
committed, no push). `git status --short` reports exactly four untracked files —
the three code/test files below plus this DELIVERY.md — and no modification to
any tracked file:

```
?? control/tasks/T154-M2-GEO-OBSERVATION-BATCH-READER/DELIVERY.md
?? src/server/features/search-growth/geo/repositories/GeoObservationBatchReaderRepository.boundary.test.ts
?? src/server/features/search-growth/geo/repositories/GeoObservationBatchReaderRepository.query.test.ts
?? src/server/features/search-growth/geo/repositories/GeoObservationBatchReaderRepository.ts
```

`pnpm-lock.yaml`, `drizzle/**`, `drizzle-pg/**`, `schemas/**`,
`src/db/search-growth.schema.ts`, and all existing geo modules are unchanged.

## READY FOR REVIEW

Implementation, focused tests, and all required gates are complete on this
worktree; no REVIEW.md findings were pending (round 1). Waiting on Codex
review. Not claiming PASS — only Codex can pass this task. Stopping here.
