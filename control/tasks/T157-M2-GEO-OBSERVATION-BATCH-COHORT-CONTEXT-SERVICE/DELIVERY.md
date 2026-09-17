# DELIVERY — T157-M2-GEO-OBSERVATION-BATCH-COHORT-CONTEXT-SERVICE

TASK ID: T157-M2-GEO-OBSERVATION-BATCH-COHORT-CONTEXT-SERVICE
ROUND: 1
STATUS: READY FOR REVIEW
BASE COMMIT: b283a74f207d26d8ecabb53b8fb249dfabb54552

## IMPLEMENTATION SUMMARY

Added one narrow server-side read service,
`readGeoObservationBatchCohortContext(projectId, batchId)`, that composes the
accepted T154 Project-scoped batch reader and the accepted T156 cohort context
assembler:

1. exactly one `GeoObservationBatchReaderRepository.readBatch(projectId, batchId)`
   call carries the caller's two selectors to storage;
2. exactly one `assembleGeoObservationCohortContext(rows)` call carries that
   read's rows onward;
3. the accepted T156 result is returned unchanged — its ordered `rows`, its
   T151-validated `members`, and its T152 five-field `context`.

The service owns no rule of its own. It does not validate the selector (T154
owns that), does not re-check cohort identity (T151/T152 via T156 own that), and
does not add a count, repeat fraction, rate, ratio, metric, confidence,
completeness/partial decision, or any prompt/language/window/parser field. It
performs no second read, no batch-only lookup, and no direct database query; raw
evidence is never read, rewritten, redacted, or attached to a member.

There is no `try`/`catch` and no fallback anywhere in the module: a T154 selector
rejection, a T154 storage failure, a T155 projection rejection for an unusable
stored `marketProfileId`/`modelVersion`, and every T151 rejection surfaced
through T155/T152 (including an empty batch's empty list) all propagate
unchanged. A failed or empty read is never reported as an empty assembly.

## FILES CHANGED

Added (all new; no existing file was modified):

- `src/server/features/search-growth/geo/services/geoObservationBatchCohortContextService.ts`
  — the service (42 code lines incl. boundary declaration).
- `src/server/features/search-growth/geo/services/geoObservationBatchCohortContextService.storage.test.ts`
  — real-storage focused tests (14 tests).
- `src/server/features/search-growth/geo/services/geoObservationBatchCohortContextService.boundary.test.ts`
  — static source-boundary test (5 tests).

This delivery record is the fourth new file:
`control/tasks/T157-M2-GEO-OBSERVATION-BATCH-COHORT-CONTEXT-SERVICE/DELIVERY.md`.

No other path was touched. `git status --short` lists exactly these four
untracked files and nothing else.

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or DDL change. The storage tests only read
existing forward-migration DDL (0045, 0046, 0049, 0050) into an in-memory SQLite
database; the shipped service issues no query of its own and writes nothing.

## DEPENDENCIES CHANGED

None. No `package.json` or lockfile change. `corepack pnpm install
--frozen-lockfile` was run once because the worktree had no `node_modules`; it
installed from the committed lockfile and reported "Done", with no lockfile
mutation (confirmed: `git status` shows no lockfile change).

## TESTS ADDED

`geoObservationBatchCohortContextService.storage.test.ts` (14 tests) runs the
production path against a real in-memory SQLite database built from the actual
migration DDL with foreign keys enabled and `@/db` replaced — the accepted T154
reader, T155 projector, T152 stamp, and T151 guard are the real implementations,
never re-declared or mocked:

- one Project's batch is read once and assembled into the accepted assembly, in
  the reader's deterministic `repeatIndex` then `id` order, with the exact
  five-field context and equality against the accepted T156 output for the same
  stored rows;
- another Project that reuses the same `batchId`, and a sibling batch of the
  same Project, are both excluded; a missing batch rejects as an empty cohort
  rather than falling back to the sibling's rows;
- stored rows and raw evidence come back exactly as stored (`toEqual` on the
  stored row, NULL evidence stays NULL) and evidence is never attached to a
  member (members carry exactly the six cohort identifiers);
- a rejected read and a successful read both leave every stored row and its raw
  evidence unchanged;
- an empty batch propagates T151's empty-cohort rejection
  (`GeoMeasurementCohortIdentityError`, `memberIndex: null`, `field: "members"`)
  rather than an empty assembly;
- an empty `projectId` and an empty `batchId` propagate
  `GeoObservationBatchReaderError` with the offending `field`, with decoy rows
  stored under both empty keys to prove no query ran;
- a renamed runs table propagates the driver's own "no such table" failure
  (asserted on the cause chain) rather than an empty assembly;
- each null/blank form of the nullable stored `marketProfileId`, `modelVersion`,
  and `model` propagates the typed error of the accepted boundary that owns the
  column — `GeoObservationCohortMemberProjectionError` for the two the T155
  projector must supply, `GeoMeasurementCohortIdentityError` for `model` — with
  the same name/message/field/index as that boundary produces directly;
- an unusable second row propagates the projection rejection at row index 1.

`geoObservationBatchCohortContextService.boundary.test.ts` (5 tests) asserts
from the shipped source text that the module has exactly two import specifiers
(the accepted T154 repository and the accepted T156 assembler), calls `readBatch`
once and `assembleGeoObservationCohortContext` once in that order, and contains
no direct query/write (`select`/`from`/`where`/`insert`/`update`/`delete`/`set`/
`values`/`upsert`), no provider/credential/cache/parser/workflow/environment
access, no raw-evidence field, no count/aggregation/sample/fraction/rate/ratio/
metric/confidence/completeness logic, and no `try`/`catch`/`throw`/`??`/coercion.

## COMMANDS RUN

Every command was run independently from the worktree root on Windows Git Bash
using `corepack pnpm ...`. No command was chained, wrapped, or bypassed. No
sandbox denial occurred.

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoObservationBatchCohortContextService.storage.test.ts src/server/features/search-growth/geo/services/geoObservationBatchCohortContextService.boundary.test.ts`
3. `corepack pnpm exec vitest run <7 focused GEO cohort files>` (the two new files plus `geoObservationCohortContextAssembler.test.ts`, `geoObservationCohortMemberProjector.test.ts`, `geoMeasurementCohortContextStamp.test.ts`, `geoMeasurementCohortIdentityGuard.test.ts`, `GeoObservationBatchReaderRepository.query.test.ts`, `GeoObservationBatchReaderRepository.boundary.test.ts`)
4. `corepack pnpm exec prettier --write <3 task files>`
5. `corepack pnpm format:check`
6. `corepack pnpm types:check`
7. `corepack pnpm lint`
8. `corepack pnpm test`
9. `corepack pnpm build`
10. `corepack pnpm ci:check`
11. Read-only git: `git status --short`, `git log --oneline`, `git rev-parse HEAD`.

## COMMAND RESULTS

| # | Command | Exit | Result |
| - | ------- | ---- | ------ |
| 1 | `corepack pnpm install --frozen-lockfile` | 0 | "Done in 1m 21.4s using pnpm v10.30.1"; bootstrap only, pre-existing warning that some optional native build scripts are not approved |
| 2 | focused new-file run | 0 | 2 files, 19 tests passed (14 storage + 5 boundary) |
| 3 | focused GEO cohort set | 0 | 7 files, 119 tests passed |
| 4 | `prettier --write` | 0 | 3 files formatted (one reflow only) |
| 5 | `corepack pnpm format:check` | 0 | "All matched files use Prettier code style!" |
| 6 | `corepack pnpm types:check` | 0 | `tsc --noEmit` clean |
| 7 | `corepack pnpm lint` | 0 | "Found 0 warnings and 0 errors." (983 files) |
| 8 | `corepack pnpm test` | 0 | 227 test files passed, 2370 tests passed, 0 failed |
| 9 | `corepack pnpm build` | 0 | client + SSR + audit worker bundles built; `tsc --noEmit` clean |
| 10 | `corepack pnpm ci:check` | 0 | prettier check, knip, tsc, badseo tsc, oxlint, skill sync, and plugin-skill sync check all clean |

Intermediate lint runs during development reported four issues (file length and
two `.sort()` calls in a first draft test file); those were resolved before the
final runs above, and the final `lint` and `ci:check` exits are the ones
recorded. `ci:check` runs `sync-plugin-skills`, which reported "Synced 9 skills"
and "plugin skill sync clean" without leaving any tracked modification
(`git status` confirms).

## RUNTIME EVIDENCE

- Composed read proven against real storage: the service returned rows in
  `repeatIndex` then `id` order (`run_zulu, run_alpha, run_mike, run_bravo` with
  indices `0,1,1,2`) and the members were exactly those rows projected.
- The returned assembly is `toEqual` the accepted T156 assembler's own output
  over the same stored rows, so the service adds no rule of its own.
- Project isolation: `batch_shared` for `proj_alpha` returned only
  `run_alpha_kept` while the same batch id for `proj_beta` returned only
  `run_beta`.
- Empty batch rejected with
  `GEO measurement cohort identity: members must be a non-empty list of measurement members.`
  (`memberIndex: null`, `field: "members"`) instead of an empty assembly.
- Empty selectors rejected as
  `GEO observation batch reader: projectId must be a non-empty string.` /
  `... batchId must be a non-empty string.`
- Broken storage surfaced `no such table: geo_observation_runs` from the cause
  chain.
- Malformed stored provenance surfaced the owning boundary's own error, e.g. a
  null `marketProfileId` produced the T155 projection rejection at row 0 field
  `marketProfileId`, and a blank `model` produced the T151 guard rejection at
  member 0 field `model`.
- Static boundary: exactly two import specifiers, one `readBatch(` call, one
  `assembleGeoObservationCohortContext(` call, in that order.

No runtime success is claimed beyond these executed tests and gates.

## KNOWN LIMITATIONS

- The service is a pure composition boundary and has no caller yet: no server
  function, route, or workflow invokes it in this task (deliberately out of
  scope). It is exercised by its tests.
- The storage tests use in-memory SQLite through the D1 code path only; the
  Postgres dialect is not exercised here, matching the accepted T154 reader
  test, and the service itself adds no dialect-specific behavior.
- The blank-`marketProfileId` case requires a stored market profile whose id is
  the blank string, because the composite foreign key rejects a non-NULL value
  with no parent; the test seeds that parent so the rejection being asserted is
  the accepted projector's, not the database's.

## DEVIATIONS FROM TASK

One, in test packaging only: the task asked for focused tests plus "a static
source-boundary test". Both landed as two files
(`...Service.storage.test.ts` and `...Service.boundary.test.ts`) instead of one,
because the single file exceeded the repository's `eslint/max-lines` rule (400
counted lines) and because the accepted T154 precedent also splits a storage
test from a `*.boundary.test.ts`. Test coverage and production code are
unchanged by the split.

No schema, migration, snapshot, dependency, or lockfile change. No scope
expansion. No deviation in the implementation itself.

## SECURITY NOTES

- No provider, credential, account, token, cookie, or production endpoint was
  accessed. No network call exists in the module or its tests.
- No production publishing, paid action, workflow, scheduler, or billing
  behavior was invoked.
- No Prompt Explorer, R2, or application-cache access.
- No CAPTCHA/2FA bypass, stealth behavior, or cookie upload.
- The service is read-only by construction: the static boundary test asserts it
  contains no `insert`/`update`/`delete`/`set`/`values`/`upsert` or cache
  access, and the storage test asserts stored rows and raw evidence are
  byte-identical before and after a successful read and a rejected read.
- Raw provider evidence (`raw_answer`, `raw_response`, `usage_json`) is never
  parsed, transformed, redacted, re-encoded, or attached to a member.
- Cross-Project access is impossible by construction: the only read is the
  Project-scoped T154 `SELECT`, and the tests prove another Project reusing a
  batch id is excluded.
- No secret or sensitive value appears in any test fixture or log.

## GIT STATUS/DIFF SUMMARY

`git status --short` (final, verbatim):

```
?? control/tasks/T157-M2-GEO-OBSERVATION-BATCH-COHORT-CONTEXT-SERVICE/DELIVERY.md
?? src/server/features/search-growth/geo/services/geoObservationBatchCohortContextService.boundary.test.ts
?? src/server/features/search-growth/geo/services/geoObservationBatchCohortContextService.storage.test.ts
?? src/server/features/search-growth/geo/services/geoObservationBatchCohortContextService.ts
```

Four new untracked files (three source/test plus this delivery record), no
modified or deleted tracked files, no lockfile change, nothing staged, no
commit, no merge, no push. Base commit
`b283a74f207d26d8ecabb53b8fb249dfabb54552` is unchanged (`REVIEW.md` does not
exist for this round, so there were no findings to address).

## READY FOR REVIEW

READY FOR REVIEW — implementation, focused tests, all required gates, and this
delivery record are complete, with exact command exits recorded above.
