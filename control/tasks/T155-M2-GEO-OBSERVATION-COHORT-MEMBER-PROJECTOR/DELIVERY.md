# DELIVERY — T155-M2-GEO-OBSERVATION-COHORT-MEMBER-PROJECTOR

TASK ID: T155-M2-GEO-OBSERVATION-COHORT-MEMBER-PROJECTOR
MILESTONE: M2 GEO
ROUND: 2 of 3
REVIEW.md: present (round 1, VERDICT: BLOCKED) — its single blocker is addressed
STATUS: scoped repair complete; aggregate gate `ci:check` blocked by an executor
environment out-of-memory failure (recorded below, not bypassed)
READY FOR REVIEW: yes, with the one recorded environment-blocked gate

## REVIEW FINDINGS ADDRESSED (round 2 scope)

Round 1 raised exactly one BLOCKER:

> projector revalidates model instead of propagating T151.
> Fix acceptance: remove the projector-owned model check and revise focused tests
> so malformed model input demonstrates unchanged T151 error propagation; retain
> explicit projector errors for marketProfileId and modelVersion.

The repair is exactly that and nothing else:

- `model` was removed from the projector-owned row schema. The projector now
  validates only `marketProfileId` and `modelVersion`.
- `model` is copied directly from the stored row into the member, with no
  projector check, default, trim, or substitution.
- A malformed, absent, null, or blank stored `model` now reaches the accepted
  T151 guard, which rejects it with its own unchanged
  `GeoMeasurementCohortIdentityError` (member index / field `model`).
- Focused tests were revised accordingly: the projector-owned rejection loop no
  longer includes `model`, and a new test proves malformed `model` input
  propagates the guard's rejection unchanged for nine malformed values.

No other schema, storage, ordering, aggregation, or unrelated change was made.

## IMPLEMENTATION SUMMARY

One storage-free projection service turning accepted immutable GEO
observation-run rows into accepted T151 cohort members without measuring
anything.

- `projectGeoObservationCohortMembers(rows)` returns `{ rows, members }`. `rows`
  is the caller's own array, returned by identity and never copied, filtered,
  re-ordered, or mutated. `members` holds one new member per row, in the
  caller's row order, with the six stored identity columns copied directly: the
  row's `id` becomes `runId`, and `projectId`, `marketProfileId`, `surfaceType`,
  `model`, and `modelVersion` keep their names and values.
- The only checks this boundary owns are the two nullable columns TASK item 2
  names: `marketProfileId` and `modelVersion`. Each row is validated before any
  member is built; the first unusable row throws
  `GeoObservationCohortMemberProjectionError` naming the row index and column
  (`row 1 marketProfileId must be a non-empty string`), so no partial, repaired,
  or defaulted projection can escape. The same `/\S/` non-blank rule the T151
  guard uses is applied, so surrounding whitespace is preserved verbatim rather
  than trimmed into an identity the row did not store. A row that is not an
  object is rejected as `row`; an argument that is not a list is rejected as
  `rows` with `rowIndex === null`.
- `model` is deliberately not checked here. It is copied from the row exactly as
  stored — no default, trim, normalization, or substitution — and the T151
  member contract owns its validation. The projected members are handed to the
  accepted `guardGeoMeasurementCohortIdentity` exactly once with no `try`/`catch`
  and no wrapping, so every T151 rejection (empty list, malformed `model`,
  malformed other member field, unsupported surface, or a member from another
  Project, market profile, surface, model, or model version) reaches the caller
  as the guard's own error, byte-for-byte.
- It decides nothing else. No row is filtered, sorted, de-duplicated,
  re-batched, preferred, or sampled; no count, completeness decision, fraction,
  rate, ratio, metric, sample size, or confidence label is produced; no raw
  evidence is read; and no database, repository, reader, provider, cache,
  parser, workflow, server function, UI, or environment is reached. Same rows,
  same projection.

## FILES CHANGED

Round 2 modified only the two files added in round 1 (both still untracked; no
tracked file touched):

- `src/server/features/search-growth/geo/services/geoObservationCohortMemberProjector.ts`
  — `model` removed from `sourceRowSchema`; the member's `model` now comes from
  the stored row; boundary and function documentation updated to state that the
  guard, not the projector, owns `model`.
- `src/server/features/search-growth/geo/services/geoObservationCohortMemberProjector.test.ts`
  — the projector-owned rejection loop is narrowed to `marketProfileId` and
  `modelVersion`; a new test proves malformed `model` propagates T151 unchanged;
  a few helper bodies were compacted to stay inside the repository's 400-line
  per-file lint limit now that the file grew.

The accepted T151 guard, T152 stamp, T154 reader, Drizzle schema, migrations,
and every other module are unchanged (`git status --short` shows no tracked
modification).

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, index, seed, or Drizzle edit. The service
imports the accepted `GeoObservationRun` row type only as a TypeScript type; it
opens no connection and issues no query, so SQLite/Postgres compatibility is
unaffected.

## DEPENDENCIES CHANGED

None. No dependency added, removed, or upgraded; `pnpm-lock.yaml` is unchanged
and no install was needed in round 2 (dependencies were already present from the
round-1 `--frozen-lockfile` bootstrap). The module reuses already-present
dependencies only: `zod` (v4, the repository's runtime boundary validator,
matching the accepted T151/T152 sibling services).

## TESTS ADDED

`geoObservationCohortMemberProjector.test.ts` — 20 tests (round 1 had 19; one
added), all in-process against the real T151 guard, nothing mocked:

- carried over unchanged from round 1: ordered direct projection; verbatim
  column copy (no trim/normalize); member shape (six fields, no `batchId` or
  `rawAnswer`); single-row projection; row-list identity plus row-object
  identity with new member objects; duplicate preservation; determinism and
  non-mutation across three calls; first-offending-row naming; non-object rows
  rejected as `row`; non-list arguments rejected as `rows`; empty list
  propagated to T151; every cross-context mismatch propagated at member index 1;
  unsupported surface and malformed non-nullable columns propagated; and the
  static source-boundary proof (imports, single guard call, column set, absent
  storage/aggregation/metric/coercion behavior).
- revised: the projector-owned rejection loop now covers only `marketProfileId`
  and `modelVersion` (nine unusable values each: `undefined`, `null`, `""`,
  `"   "`, `"\n"`, `42`, `true`, `{}`, `[]`), still asserting the exact row index,
  field, and message.
- **new**: `propagates a malformed stored model to the T151 guard instead of
  rejecting it` — for the same nine malformed values, the projector raises the
  guard's own `GeoMeasurementCohortIdentityError` (compared against an
  independently computed guard rejection for the equivalent member list) at
  member index 0, field `model`. A projector-owned error would fail this test.

## COMMANDS RUN

Run independently with `corepack pnpm` (bare `pnpm` is not on PATH here), in
this order:

1. `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoObservationCohortMemberProjector.test.ts`
2. `corepack pnpm exec prettier --write <the two task files>`
3. `corepack pnpm exec vitest run <the same focused file>`
4. `corepack pnpm lint`
5. `corepack pnpm format:check`
6. `corepack pnpm types:check`
7. `corepack pnpm test`
8. `corepack pnpm build`
9. `corepack pnpm ci:check` (four attempts)
10. read-only `git status --short`, `git rev-parse HEAD`

No command outside the TASK-approved list was used. No `dangerously-skip-permissions`,
commit, merge, push, main-branch touch, production access, provider call,
credential/account access, Prompt Explorer/R2/application-cache access, or
publishing/paid action was invoked.

## COMMAND RESULTS

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `vitest run` (focused, interim) | 0 | 1 file / 20 tests passed — run before formatting |
| 2 | `prettier --write` (2 files) | 0 | service unchanged; test file reformatted |
| 3 | `vitest run` (focused, final) | 0 | **1 file / 20 tests passed** (7.85 s) |
| 4 | `lint` | 0 | **"Found 0 warnings and 0 errors"** — 978 files, type-aware, 27.6 s |
| 5 | `format:check` | 0 | "All matched files use Prettier code style!" |
| 6 | `types:check` | 0 | `tsc --noEmit` clean, no output |
| 7 | `test` | 0 | **224 files / 2,333 tests passed** (round 1 was 224 / 2,332; +1 test) |
| 8 | `build` | 0 | client + SSR + audit worker bundles built; trailing `tsc --noEmit` clean |
| 9 | `ci:check` | **1** | **environment failure, not a finding** — 4/4 attempts aborted inside the `oxlint . --type-aware` stage with a `tsgolint` Go runtime OOM (`runtime: VirtualAlloc of 8192 bytes failed with errno=1455` / `fatal error: out of memory` / `Error running tsgolint: "exit status: exit code: 2"`). The `prettier --check .` stage inside the same run passed ("All matched files use Prettier code style!"); `knip`, both `tsc` projects produced no output before the crash, which is their success behavior here. |
| 10 | `git status --short`, `git rev-parse HEAD` | 0 | exactly the three untracked files below; HEAD still `2fcabe5` |

Additional disclosure on command 4: after commands 7 and 8 (full test suite and
production build) had run, the machine ran out of commit memory. Re-running
`lint` alone then failed with the identical `tsgolint` OOM and exit code 1 (it
previously exited 0 on the identical, unchanged source), and a plain
`prettier --check` inside `ci:check` still passed. The successful `lint` exit 0
in row 4 was obtained **after** the final `prettier --write` and before any
further source change, so it covers the exact delivered content. Nothing was
changed, retried with altered flags, or bypassed to work around the OOM; no
gate result is claimed that was not observed.

## RUNTIME EVIDENCE

- The projector ran in-process under vitest against the real accepted T151 guard
  module — no mock, no stub, no re-declared guard. The rejection-path tests
  compute the guard's own error independently for the equivalent member list and
  compare `name`, `message`, `memberIndex`, and `field`.
- Observed projector rejection text (owned checks only):
  `GEO observation cohort member projection: row 1 marketProfileId must be a non-empty string.`
- Observed propagation for a malformed stored `model`: for `undefined`, `null`,
  `""`, `"   "`, `"\n"`, `42`, `true`, `{}`, and `[]` the raised error is a
  `GeoMeasurementCohortIdentityError` at member index 0, field `model` — the
  projector's own `GeoObservationCohortMemberProjectionError` is not raised for
  `model` at all.
- Observed identity evidence: `projection.rows === rows` and
  `projection.rows[0] === rows[0]` hold for the same call that returns the
  projected members.
- The source-boundary test reads the shipped module from disk and asserts its
  import list, single guard call, column set, and absent storage/aggregation/
  measurement behavior statically.
- No storage engine, provider call, network request, credential, cache, Prompt
  Explorer/R2 access, billing/paid path, publishing, or production action was
  involved anywhere in this task.

## KNOWN LIMITATIONS

- **`ci:check` could not be observed passing in round 2** (see row 9). Its only
  failing stage is `oxlint . --type-aware`, which is character-for-character the
  `lint` script that exited 0 with 0 warnings / 0 errors on the identical
  unchanged source (row 4). The crash is a Go runtime out-of-memory in the
  `tsgolint` binary on this Windows executor, reproducible on re-run after the
  full test suite and build, and it reports no lint finding. This is recorded as
  an environment block; it was not bypassed, and no PASS is claimed.
- No consumer is wired. TASK.md asks for one projection service, so no server
  function, service port, or caller was added; the accepted T154 reader's output
  can be passed straight in by a later caller.
- The projector reads `id`, `projectId`, and `surfaceType` from the row without a
  check of its own and lets T151 judge them; a malformed value there is the
  guard's rejection (tested). The row index and field still point at the
  offending row because member order equals row order.
- When a row has both an unusable `marketProfileId`/`modelVersion` **and** a
  malformed `model`, the projector's own error is raised first, because TASK
  item 2 requires rejecting before any projection is returned. Both paths
  reject; no invalid input is accepted and no partial projection escapes.
- Members are newly constructed objects (that is what projection means); only
  the row list is returned by identity, which is what TASK.md requires.
- The call is a single O(n) pass with no batching, pagination, or short-circuit;
  the list is bounded by the §3 repeat setting (3, or 5 for high-value prompts).
- No measurement, sample count, completeness, confidence, or metric field is
  attached by design; those remain the callers' (§§4, 7) decisions.

## DEVIATIONS FROM TASK

- The one round-1 deviation is now removed: the projector no longer validates
  `model`, exactly as the round-1 review required. The projector owns only the
  two columns TASK item 2 names.
- `model` is copied through a **compile-time-only** type assertion
  (`row.model as string`) carrying a single-line `oxlint-disable-next-line
  typescript/no-unsafe-type-assertion` with a stated reason. The stored column is
  `string | null` while the T151 member type requires `string`, so the compiler
  needs narrowing; the assertion has no runtime effect whatsoever — it adds no
  coercion, default, trim, or check — which is what keeps the runtime behavior
  the review required (the raw stored value is handed to T151). The alternative,
  asserting on the whole member object, is the same construct at a wider scope,
  and a runtime re-check is exactly the finding being repaired. The repository
  already uses this disable for the same nullable-column reason in this task's
  test file.
- The source-boundary proof still lives in the same test file as the behavior
  tests (as in the accepted T152 pattern) rather than a second
  `.boundary.test.ts` file, so the task adds exactly two files.
- `zod` is used for the two-column row boundary instead of hand-written runtime
  checks, matching the accepted T151/T152 sibling services; no new dependency is
  introduced.
- To stay inside `eslint/max-lines` (400, comments and blank lines excluded) now
  that the focused test file grew by one test, an existing helper's equivalent
  assertions were compacted (`toMatchObject` on the four compared error fields,
  single-line `if` returns) rather than dropping any assertion or test.
- No scope was added and no acceptance criterion was weakened.

## SECURITY NOTES

- Credential-free: no provider, API key, OAuth token, account, cookie, or
  environment secret is read or referenced.
- Storage-free: the module imports no `@/db`, Drizzle, repository, reader,
  filesystem, or cache handle and performs no query or write of any kind.
- Fail-closed: no `try`/`catch` and no fallback; a rejected row or a rejected
  cohort throws instead of yielding an empty, partial, or repaired projection.
- Trust boundary: the two nullable stored identity columns this boundary owns
  are runtime validated with Zod before any member is built, because the
  TypeScript row type does not exist at runtime and the caller may be untrusted.
  `model` is intentionally **not** runtime validated here; it is copied as
  stored and validated by the accepted T151 guard at the same trust boundary.
- Data-minimizing: the projection copies six identity columns and reads no raw
  answer, raw response, usage, or provenance field; nothing is logged,
  serialized, telemetered, or exported.
- No production publishing, paid behavior, CAPTCHA/2FA bypass, stealth behavior,
  or cookie upload; no `.greptile/**`, `AGENTS.md`, `CLAUDE.md`,
  `.agents/skills/**`, or `.github/**` file was modified, and no
  `29_SCOPE_LOCK.md` or accepted ADR was touched.

## GIT STATUS/DIFF SUMMARY

Branch: `ai-task/T155-M2-GEO-OBSERVATION-COHORT-MEMBER-PROJECTOR` (not merged,
not committed, no push). HEAD is unchanged at `2fcabe50c04431a6a117d7f86429167a257b561d`.
`git status --short` reports exactly three untracked files and no modification to
any tracked file:

```
?? control/tasks/T155-M2-GEO-OBSERVATION-COHORT-MEMBER-PROJECTOR/DELIVERY.md
?? src/server/features/search-growth/geo/services/geoObservationCohortMemberProjector.test.ts
?? src/server/features/search-growth/geo/services/geoObservationCohortMemberProjector.ts
```

`pnpm-lock.yaml`, `drizzle/**`, `drizzle-pg/**`, `schemas/**`,
`src/db/search-growth.schema.ts`, and all existing geo modules (including the
accepted T151 guard, T152 stamp, and T154 reader) are unchanged.

## READY FOR REVIEW

The round-1 blocker is repaired in the two files it named, focused tests pass
(20/20, including the new malformed-`model` propagation proof), and
`format:check`, `types:check`, `lint`, the full test suite, and `build` all
exited 0 on the delivered content. `ci:check` is recorded as blocked by an
executor out-of-memory failure in its `oxlint --type-aware` stage, which is the
`lint` script that exited 0 on the same unchanged source; it was not bypassed.

Not claiming PASS — only Codex can pass this task. Stopping here.
