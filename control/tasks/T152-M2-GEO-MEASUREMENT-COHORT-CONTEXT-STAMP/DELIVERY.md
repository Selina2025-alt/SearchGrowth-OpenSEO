# T152-M2-GEO-MEASUREMENT-COHORT-CONTEXT-STAMP — DELIVERY

## TASK ID

T152-M2-GEO-MEASUREMENT-COHORT-CONTEXT-STAMP (M2 GEO, implementation round 1)

## IMPLEMENTATION SUMMARY

Added one small, pure composition service that consumes the accepted T151 cohort
identity guard and returns an explicit, collision-free structured context stamp
for the validated cohort.

`stampGeoMeasurementCohortContext(members)`:

1. calls `guardGeoMeasurementCohortIdentity(members)` exactly once (one call site
   in the shipped module);
2. returns `{ members, context }`, where `members` is the guard's return value —
   the caller's own array by identity — and `context` is a fresh object holding
   exactly `projectId`, `marketProfileId`, `surfaceType`, `model`, and
   `modelVersion` copied verbatim from the validated baseline (member index 0);
3. performs no validation of its own: an empty or malformed list, a malformed
   member, or a member from another Project, market profile, surface, model, or
   model version throws the guard's own `GeoMeasurementCohortIdentityError`
   unchanged, with no wrapping, fallback, or partial result.

`GeoMeasurementCohortContext` is `Pick<GeoMeasurementCohortMember, ...>` of the
five cohort-defining fields, so the context cannot drift from the accepted T151
member contract and cannot silently gain `runId`. `runId` is deliberately absent
from the stamp: the guard already treats repeats (which differ only by run id) as
one cohort, so a stamp that carried run identity would over-distinguish one
cohort, and it is not a metric or aggregation input.

The context is structured fields only — no `join`, no concatenation, no hash, no
`JSON.stringify`, no normalization, no generated id, and no storage key. Two
cohorts that a delimited key would collide (e.g. `marketProfileId: "a|b"` +
`model: "c"` versus `marketProfileId: "a"` + `model: "b|c"`, both `"a|b|c"` when
joined) remain distinguishable through the fields.

No schema, migration, snapshot, dependency, UI, server function, database,
repository, provider, cache, parser, credential, publishing, or production
change was made.

## FILES CHANGED

Added (both untracked; nothing else in the tree changed):

- `src/server/features/search-growth/geo/services/geoMeasurementCohortContextStamp.ts`
  — the pure composition service: `GeoMeasurementCohortContext`,
  `GeoMeasurementCohortContextStamp`, `stampGeoMeasurementCohortContext`.
- `src/server/features/search-growth/geo/services/geoMeasurementCohortContextStamp.test.ts`
  — 15 focused tests (context mapping, identity preservation, verbatim copy,
  exact key set, collision resistance, run-id-only variation, determinism and
  non-mutation, all T151 rejection propagation, source boundary).

No existing source file was modified; the accepted T151 guard is consumed
read-only through its public export.

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or query change. The service is
storage-free: it imports only the accepted T151 guard module, which itself opens
no database, repository, provider, cache, or parser.

## DEPENDENCIES CHANGED

None. `package.json`, `pnpm-lock.yaml`, and the dependency tree are unchanged.
`corepack pnpm install --frozen-lockfile` was run only to materialize the
worktree's `node_modules` (the worktree had none); the lockfile was already up to
date and no package was added or removed.

## TESTS ADDED

`geoMeasurementCohortContextStamp.test.ts` — 15 tests in three suites:

- context mapping and identity: caller's ordered member list returned by identity
  with the baseline's five-field context; single-member cohort; verbatim copy
  without trimming or normalizing (padded model, trailing newline version);
- collision-free structure: exactly the five context keys and no `runId`; context
  is an object and not the baseline member; two cohorts a `join("|")` key would
  collide stay distinct; members differing only by run id share one context;
  deterministic repeated calls with no caller mutation;
- rejection propagation: unusable list (empty, non-array, member object, `Set`,
  …), malformed member (missing/blank/non-string for each of the six identifiers,
  non-object member, malformed baseline), and every cross-context mismatch on
  each of the five cohort-defining fields plus an unsupported surface — each
  asserted equal in `name`, `message`, `memberIndex`, and `field` to the error the
  accepted T151 guard itself produces for the same input, with no stamp returned;
- source boundary: imports only the accepted T151 guard; exactly one
  `guardGeoMeasurementCohortIdentity(` call site; no `.parse`/`.safeParse`, no
  storage/record/query; no join, `JSON.`, hash, crypto, Buffer, base64,
  normalization, or `runId` reference; no map/filter/reduce/sort/Set/Map/Math or
  `.length`; no aggregation, sample, count, confidence, rate, ratio, cache,
  provider, parser, prompt, language, window, or warning vocabulary; no
  try/catch/throw and no coercion.

No test re-declares a production class; the real T151 guard is used, not a mock.

## COMMANDS RUN

Every command was run independently from the worktree root on Windows Git Bash
with `corepack pnpm`; no command was chained with another.

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoMeasurementCohortContextStamp.ts src/server/features/search-growth/geo/services/geoMeasurementCohortContextStamp.test.ts`
3. `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoMeasurementCohortContextStamp.test.ts`
4. `corepack pnpm format:check`
5. `corepack pnpm types:check`
6. `corepack pnpm lint`
7. `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoMeasurementCohortContextStamp.test.ts src/server/features/search-growth/geo/services/geoMeasurementCohortIdentityGuard.test.ts`
8. `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoMeasurementCohortContextStamp.test.ts` (after the lint fix)
9. `corepack pnpm types:check` (after the lint fix)
10. `corepack pnpm test`
11. `corepack pnpm build`
12. `corepack pnpm ci:check`
13. `git status --short`, `git rev-parse HEAD`, `git rev-parse --abbrev-ref HEAD`

## COMMAND RESULTS

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `corepack pnpm install --frozen-lockfile` | 0 | Lockfile up to date; 980 packages resolved; "Done in 1m 43.9s" |
| 2 | `prettier --write` (2 task files) | 0 | Service unchanged; test file reformatted |
| 3 | `vitest run` (stamp suite) | 0 | 1 file / 15 tests passed |
| 4 | `format:check` | 0 | "All matched files use Prettier code style!" |
| 5 | `types:check` | 0 | `tsc --noEmit`, no diagnostics |
| 6 | `lint` (first run) | 1 | 2 oxlint `eslint-plugin-unicorn(no-array-sort)` errors in the new test file only (`.sort()` on the context-key assertion). No production-source error |
| 7 | `vitest run` (stamp + T151 guard) | 0 | 2 files / 38 tests passed (15 + 23) |
| 8 | `prettier --write` (test file) | 0 | Unchanged (already formatted) |
| 9 | `types:check` | 0 | `tsc --noEmit`, no diagnostics |
| 10 | `lint` (after fix) | 0 | "Found 0 warnings and 0 errors" on 971 files |
| 11 | `test` | 0 | 220 files / 2275 tests passed |
| 12 | `build` | 0 | `vite build && tsc --noEmit`; client, SSR, and audit environments built |
| 13 | `ci:check` | 0 | prettier check, knip, `tsc --noEmit`, badseo `tsc`, oxlint, plugin-skill sync all clean |

Lint correction (round 1, before the gates were final): the context-key-set
assertion used `Array#sort()`, which the repository's unicorn rule rejects. It was
replaced with an order-independent `Set` comparison plus a length assertion, and
every gate was re-run afterwards (rows 7–13 are all post-fix).

`ci:check` was not sandbox-denied; it completed with exit 0 and no bypass.

## RUNTIME EVIDENCE

- Focused: `vitest run geoMeasurementCohortContextStamp.test.ts` → exit 0, 1 file
  / 15 tests passed (49 ms of test time).
- Combined with the accepted T151 suite: exit 0, 2 files / 38 tests passed, so the
  consumed guard surface is unchanged by this task.
- Full suite: exit 0, 220 files / 2275 tests passed (baseline before this task:
  219 files / 2260 tests — the delta is exactly this task's one file / 15 tests).
- Build: exit 0; the service is not imported by any application entry point yet,
  which is expected — TASK.md adds a composition primitive for a future metric,
  not a wired-in feature. Its behavior is proven only by the focused tests above.
- Source evidence: the shipped module has exactly one
  `guardGeoMeasurementCohortIdentity(` call site and one import.

## KNOWN LIMITATIONS

- The stamp carries only the five cohort-defining identifiers in scope for this
  task. Spec §7 also lists sample count, confidence, and data-quality warnings as
  metric accompaniments; those are explicitly out of scope here (they are
  metrics/aggregations, which this task forbids) and are not attached implicitly.
- Prompt, language, time window, timezone, data-lag, and parser identity are not
  part of the stamp, matching the accepted T151 scope. A future aggregation that
  needs them must carry them explicitly.
- Nothing in the application consumes the stamp yet; it is a pure primitive, so
  there is no end-to-end runtime path to demonstrate.

## DEVIATIONS FROM TASK

None. The service is a single pure function plus two types; no revalidation,
filtering, sorting, dedupe, transformation, mutation, query, aggregation, count,
confidence, rate/metric, prompt/language/window/parser data, storage access,
schema, migration, or dependency was added. No T151 file was edited.

## SECURITY NOTES

- No credentials, secrets, tokens, provider calls, network access, database
  access, cache access, or paid behavior is introduced.
- The module is total and fail-closed: every untrusted runtime input is rejected
  by the accepted T151 guard before any result is produced, and this service adds
  no `try`/`catch`, coercion, normalization, or fallback of its own.
- No production publishing, browser session, CAPTCHA/2FA, or stealth behavior is
  involved.
- No security-sensitive control-plane file (`.greptile/**`, `AGENTS.md`,
  `CLAUDE.md`, `.agents/skills/**`, `.github/**`) was touched.

## GIT STATUS/DIFF SUMMARY

Branch: `ai-task/T152-M2-GEO-MEASUREMENT-COHORT-CONTEXT-STAMP`
HEAD at delivery: `a276c8caec067f34601e4b36de0be5fb29ebdea9`

`git status --short`:

```
?? control/tasks/T152-M2-GEO-MEASUREMENT-COHORT-CONTEXT-STAMP/DELIVERY.md
?? src/server/features/search-growth/geo/services/geoMeasurementCohortContextStamp.test.ts
?? src/server/features/search-growth/geo/services/geoMeasurementCohortContextStamp.ts
```

Exactly three new untracked files — the two source files above and this delivery
record. No modified, deleted, or renamed tracked file. `dist/` build output is
gitignored and does not appear. Nothing was committed, merged, pushed, or
stashed.

The same `git status --short` before this record was written showed only the two
source files, so the commands above changed no tracked path.

## READY FOR REVIEW

Ready for Controller review. Focused tests, formatting, types, lint, full test,
build, and `ci:check` all completed with exit 0 (the single round-1 lint failure
and its fix are recorded above). No PASS is claimed; acceptance belongs to Codex.
