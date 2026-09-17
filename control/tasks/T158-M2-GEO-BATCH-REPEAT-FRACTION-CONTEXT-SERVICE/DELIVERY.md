# DELIVERY — T158-M2-GEO-BATCH-REPEAT-FRACTION-CONTEXT-SERVICE

TASK ID: T158-M2-GEO-BATCH-REPEAT-FRACTION-CONTEXT-SERVICE
ROUND: 1
STATUS: READY FOR REVIEW
BASE COMMIT: 5166dabfed8f68b90dd6483c8e50a3fba19b538c

## IMPLEMENTATION SUMMARY

Added one narrow server-side read service,
`readGeoBatchRepeatFractionContext(projectId, batchId, requestedRepeatCount)`,
that composes the accepted T157 batch cohort context service with the accepted
T153 repeat-fraction presenter:

1. exactly one `readGeoObservationBatchCohortContext(projectId, batchId)` call
   (T157) carries the caller's two selectors to the accepted Project-scoped read
   and cohort assembly;
2. the returned rows are scanned once, counting only those whose stored `status`
   is exactly `SUCCEEDED` — a row of any other status is excluded from the count
   and otherwise left untouched;
3. exactly one `presentGeoRepeatFraction({ completedSampleCount,
   requestedRepeatCount })` call (T153) renders the display;
4. the result is T157's own `rows`, `members`, and `context` (the very
   references T157 returned) plus T153's exact `display` object.

The service owns no rule of its own. It does not validate the selector (T157/T154
own that), does not re-check cohort identity (T151/T152 via T157 own that), does
not validate the 3-or-5 repeat setting or the completion-not-above-request rule
(T153 owns both), and adds no rate, percentage, ratio, metric, confidence,
completeness/partial decision, retry, run-status change, or prompt/language/
window/parser field. It issues no query, selects no other batch, filters,
sorts, or de-duplicates no returned row, and never re-reads, rewrites, redacts,
or re-shapes raw evidence.

There is no `try`/`catch` and no fallback anywhere in the module. T157 selector
rejections, storage failures, and every cohort rejection surfaced from
T151/T152/T155/T156 (including an empty batch's empty list), plus T153's input
rejection, all propagate unchanged — a failed read is never reported as a
`0/3`-style zero fraction, and no partial assembly or display is returned.

## FILES CHANGED

Added (all new; no existing file was modified):

- `src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.ts`
  — the service (114 lines incl. boundary declaration and comments).
- `src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.storage.test.ts`
  — real-storage focused tests (22 tests).
- `src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.boundary.test.ts`
  — static source-boundary test (6 tests).

This delivery record is the fourth new file:
`control/tasks/T158-M2-GEO-BATCH-REPEAT-FRACTION-CONTEXT-SERVICE/DELIVERY.md`.

No other path was touched. `git status --short` lists exactly the three new
source/test files plus this delivery record. No lockfile, schema, migration,
snapshot, or dependency file changed.

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or DDL change. The storage tests only read
existing forward-migration DDL (0045, 0046, 0049, 0050) into an in-memory SQLite
database; the shipped service issues no query of its own and writes nothing.

## DEPENDENCIES CHANGED

None. No `package.json` or lockfile change. `corepack pnpm install
--frozen-lockfile` was run once because the worktree had no `node_modules`; it
installed from the committed lockfile and reported "Done", with no lockfile
mutation (`git status` shows no lockfile change).

## TESTS ADDED

`geoBatchRepeatFractionContextService.storage.test.ts` (22 tests) runs the
production path against a real in-memory SQLite database built from the actual
migration DDL with foreign keys enabled and `@/db` replaced — the accepted T157
service, T154 reader, T156 assembler, T155 projector, T152 stamp, T151 guard,
and T153 presenter are the real implementations, never re-declared or mocked:

- all-success batch: three stored `SUCCEEDED` rows read once and assembled into
  the accepted T157 output in the reader's deterministic `repeatIndex` then `id`
  order, with the exact five-field context, the exact `3/3` display, and
  `toEqual` equality of `rows`/`members`/`context` against the accepted T157
  output for the same stored rows;
- mixed batch: one `SUCCEEDED` of four rows (`PENDING`, `RUNNING`, `FAILED`
  stored) yields exactly `1/3` — not `1/4` — while every non-SUCCEEDED row stays
  in `rows` and `members` in order, with the stored row and its raw evidence
  returned verbatim;
- no-success batch: two non-SUCCEEDED rows yield exactly `0/3` with both rows
  retained;
- requested 5: three successes of five rows yield exactly `3/5` with all five
  rows and members present, proving the caller's setting is passed to T153
  verbatim and the count is not capped by it;
- Project/batch isolation: `batch_shared` for `proj_alpha` counts only that
  Project's one row (`1/3`), while the same batch id for `proj_beta` counts its
  two rows (`2/3`); a sibling batch of the same Project is excluded;
- unsupported/invalid requested counts (`0, 1, 2, 4, 6, 10, -3, 1.5, NaN,
  Infinity, "3", null`) propagate `GeoRepeatFractionPresenterInputError` with
  `field: "requestedRepeatCount"` and no display;
- a four-success batch under a 3-repeat request propagates T153's own
  `completedSampleCount` rejection, proving the counted figure reaches T153;
- an empty batch propagates T157's surfaced T151 rejection
  (`GeoMeasurementCohortIdentityError`, `memberIndex: null`, `field: "members"`)
  instead of a `0/3` display;
- an empty `projectId` and an empty `batchId` propagate
  `GeoObservationBatchReaderError` with the offending `field`;
- a renamed runs table propagates the driver's own "no such table" failure
  (asserted on the cause chain) instead of a zero fraction;
- a successful read and a rejected read both leave every stored row and its raw
  evidence unchanged.

`geoBatchRepeatFractionContextService.boundary.test.ts` (6 tests) asserts from
the shipped source text that the module has exactly two import specifiers (the
accepted T157 service and the accepted T153 presenter), exactly one exported
symbol, calls `readGeoObservationBatchCohortContext` once and
`presentGeoRepeatFraction` once in that order, and contains no direct
query/write, no provider/credential/cache/parser/workflow/environment access, no
raw-evidence field, exactly one `status === "SUCCEEDED"` check with no other
stored status literal, no filter/reorder/aggregate (`filter`/`map`/`sort`/
`reduce`/`Set`/`Map`/`Math.`), no rate/percentage/ratio/metric/confidence logic,
and no `try`/`catch`/`??`/coercion.

## COMMANDS RUN

Every command was run independently from the worktree root on Windows Git Bash
using `corepack pnpm ...`. No command was chained or bypassed. No sandbox denial
occurred on any gate.

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.storage.test.ts src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.boundary.test.ts`
3. `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.ts src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.storage.test.ts src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.boundary.test.ts`
4. `corepack pnpm format:check`
5. `corepack pnpm types:check`
6. `corepack pnpm lint`
7. `corepack pnpm test`
8. `corepack pnpm build`
9. `corepack pnpm ci:check`
10. Read-only git: `git status --short`, `git rev-parse HEAD`.

## COMMAND RESULTS

| # | Command | Exit | Result |
| - | ------- | ---- | ------ |
| 1 | `corepack pnpm install --frozen-lockfile` | 0 | "Done in 2m 3.6s using pnpm v10.30.1"; bootstrap only, pre-existing warning that some optional native build scripts are not approved |
| 2 | focused new-file run | 0 | 2 files, 28 tests passed (22 storage + 6 boundary) |
| 3 | `prettier --write` | 0 | 3 files formatted (storage test reflow only) |
| 4 | `corepack pnpm format:check` | 0 | "All matched files use Prettier code style!" |
| 5 | `corepack pnpm types:check` | 0 | `tsc --noEmit` clean |
| 6 | `corepack pnpm lint` | 0 | "Found 0 warnings and 0 errors." (986 files) |
| 7 | `corepack pnpm test` | 0 | 229 test files passed, 2398 tests passed, 0 failed |
| 8 | `corepack pnpm build` | 0 | client + SSR + audit worker bundles built; `tsc --noEmit` clean |
| 9 | `corepack pnpm ci:check` | 0 | prettier check, knip, tsc, badseo tsc, oxlint, skill sync, and plugin-skill sync check all clean |
| 10 | `git status --short` / `git rev-parse HEAD` | 0 | four new untracked paths (three source/test plus this record); HEAD `5166dab` |

Intermediate runs during development (all resolved before the final runs above)
are recorded for honesty:

- the first focused run failed 1 of 28 tests: a `toBe` identity assertion
  compared two independently read T157 arrays; the accepted T157 suite itself
  asserts `toEqual` for the same reason, so the assertion was changed to
  `toEqual` and the claim narrowed to value equality;
- the first `types:check` failed (exit 2) with `TS2459` because
  `GeoObservationCohortContextAssembly` is not re-exported by the accepted T157
  service; the result type now derives from T157's own return type
  (`Awaited<ReturnType<typeof readGeoObservationBatchCohortContext>>`), which
  also avoids reaching past T157 into its internal assembler module and keeps
  exactly two dependency import specifiers. The six `TS7006` implicit-`any`
  errors in the test file were downstream of that same failure and cleared with
  it;
- the first `lint` failed (exit 1) with one `eslint/max-lines` error (the
  storage test had 401 counted lines against the 400 limit); a redundant
  reader re-check assertion and its now-unused binding were removed, after which
  lint reported 0 warnings and 0 errors.

`ci:check` runs `sync-plugin-skills`, which reported "Synced 9 skills" and
"plugin skill sync clean" without leaving any tracked modification (`git status`
confirms).

## RUNTIME EVIDENCE

- Composed read proven against real storage: an all-success batch returned rows
  in `repeatIndex` then `id` order (`run_zulu, run_alpha, run_mike`) with the
  exact five-field context and the exact `3/3` display, and its
  `rows`/`members`/`context` were `toEqual` the accepted T157 service's own
  output over the same stored rows.
- Exact SUCCEEDED-only counting: a four-row batch containing `PENDING`,
  `RUNNING`, and `FAILED` rows rendered `1/3` (not `1/4`) with all four rows and
  all four members still present in reader order; a two-row all-failed batch
  rendered `0/3` with both rows present; three successes of five under a
  5-repeat request rendered `3/5`.
- Project isolation: `batch_shared` for `proj_alpha` returned only `run_alpha`
  and rendered `1/3`, while the same batch id for `proj_beta` returned only
  `run_beta_1, run_beta_2` and rendered `2/3`.
- Request validation propagation: `0, 1, 2, 4, 6, 10, -3, 1.5, NaN, Infinity,
  "3", null` each raised `GeoRepeatFractionPresenterInputError` naming
  `requestedRepeatCount`; four stored successes under a 3-repeat request raised
  the same error naming `completedSampleCount`.
- Empty batch raised
  `GEO measurement cohort identity: members must be a non-empty list of measurement members.`
  (`memberIndex: null`, `field: "members"`) instead of `0/3`.
- Empty selectors raised
  `GEO observation batch reader: projectId must be a non-empty string.` /
  `... batchId must be a non-empty string.`
- Broken storage surfaced `no such table: geo_observation_runs` from the cause
  chain instead of a zero fraction.
- Static boundary: exactly two import specifiers, exactly one exported symbol,
  one `readGeoObservationBatchCohortContext(` call and one
  `presentGeoRepeatFraction(` call in that order, and exactly one
  `status === "SUCCEEDED"` check.

No runtime success is claimed beyond these executed tests and gates.

## KNOWN LIMITATIONS

- The service is a pure composition boundary and has no caller yet: no server
  function, route, or workflow invokes it in this task (deliberately out of
  scope). It is exercised by its tests.
- The storage tests use in-memory SQLite through the D1 code path only; the
  Postgres dialect is not exercised here, matching the accepted T157/T154
  reader tests, and the service itself adds no dialect-specific behavior.
- The count is deliberately not capped at the requested setting: a batch whose
  stored `SUCCEEDED` rows exceed a 3-repeat request is rejected by T153 (proven
  by a test) rather than clamped, because T153 owns the
  completion-not-above-request rule and clamping here would duplicate it.
- "By identity" for `rows`/`members`/`context` means the service returns the
  exact references T157 produced; because a second T157 call reads storage
  again, the tests assert value equality across calls rather than reference
  equality, as the accepted T157 suite does.

## DEVIATIONS FROM TASK

Two, both packaging/typing, neither changing production behavior or coverage:

1. Focused tests and the static boundary test landed as two files
   (`...Service.storage.test.ts` and `...Service.boundary.test.ts`) instead of
   one, following the accepted T154/T157 precedent and keeping each file inside
   the repository's `eslint/max-lines` rule (400 counted lines).
2. The result type is module-local rather than exported, and is derived from
   T157's own function return type (`Awaited<ReturnType<...>>`) rather than by
   importing `GeoObservationCohortContextAssembly` directly. The accepted T157
   service does not re-export that type, and importing it from the assembler
   would add a third dependency import to a boundary the task requires to show
   only the T157/T153 dependencies; an exported-but-unused type would also be a
   `knip` finding. No behavior differs.

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
  unchanged before and after a successful read and a rejected read.
- Raw provider evidence (`raw_answer`, `raw_response`, `usage_json`) is never
  parsed, transformed, redacted, re-encoded, or attached to a member; the
  returned rows are exactly the stored ones.
- Cross-Project access is impossible by construction: the only read is inside
  the accepted Project-scoped T157 boundary, and the tests prove another Project
  reusing a batch id is counted separately.
- No secret or sensitive value appears in any test fixture or log.

## GIT STATUS/DIFF SUMMARY

`git status --short` (final, before this record was written; after writing it,
the record appears as a fourth untracked path):

```
 M control/tasks/T158-M2-GEO-BATCH-REPEAT-FRACTION-CONTEXT-SERVICE/TASK.md
?? src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.boundary.test.ts
?? src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.storage.test.ts
?? src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.ts
```

The `M TASK.md` entry is a CRLF-to-LF working-copy artifact only: `git diff` on
that path shows no content change (`warning: ... CRLF will be replaced by LF`),
and it pre-dates this round. Beyond it there are no modified or deleted tracked
files, no lockfile change, nothing staged, no commit, no merge, and no push.
Base commit `5166dabfed8f68b90dd6483c8e50a3fba19b538c` is unchanged and no
`REVIEW.md` exists for this round, so there were no findings to address.

## READY FOR REVIEW

READY FOR REVIEW — implementation, focused tests, all required gates, and this
delivery record are complete, with exact command exits recorded above.
