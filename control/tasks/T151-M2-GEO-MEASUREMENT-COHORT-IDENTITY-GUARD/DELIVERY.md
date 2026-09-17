# DELIVERY — T151-M2-GEO-MEASUREMENT-COHORT-IDENTITY-GUARD

ROUND: 2 of 3
BASE COMMIT: 89d28735f90133d26dadce1bcee0eef5106f4df9
STATUS: READY FOR REVIEW (Round 1 BLOCKER fix complete; not self-accepted)

## TASK ID

T151-M2-GEO-MEASUREMENT-COHORT-IDENTITY-GUARD

## REVIEW FINDINGS ADDRESSED

Round 1 returned **BLOCKED** on exactly one finding: *unsupported observation
surfaces are accepted as a valid cohort*. `surfaceType` was validated only as a
present non-empty string, so a list whose members all repeated
`surfaceType: "UNSUPPORTED_SURFACE"` passed the guard even though it has no
accepted measurement surface.

The fix is the one the review specified and nothing more:

- `cohortMemberSchema.surfaceType` is now a storage-free runtime enum
  (`surfaceTypeSchema`) over **exactly** the four Spec §1 surfaces —
  `AGGREGATED_SEARCH_DATA`, `MODEL_API_SEARCH`, `CONSUMER_PRODUCT_OBSERVED`,
  `MANUAL_CONSUMER_OBSERVATION`. An unsupported surface is rejected at its member
  index with `field: "surfaceType"` before a baseline is established or a cohort
  returned.
- The four kinds remain distinguishable and are neither normalized nor folded:
  the enum is exact, so a mis-cased (`model_api_search`) or whitespace-padded
  (`"AGGREGATED_SEARCH_DATA "`) surface is rejected rather than trimmed or
  case-folded into a canonical one. §1's "different surfaces never share a
  numerator/denominator" cannot be bypassed by relabeling.
- The existing exact cross-context comparison, the by-identity member return,
  and every other task boundary are unchanged. No prompt/language/window/parser/
  aggregation behavior was added.

## IMPLEMENTATION SUMMARY

One small, pure, storage-free guard that a future metric aggregation crosses
before it reads caller-supplied GEO measurement members. It answers exactly one
question — do these members belong to one explicit, compatible
Project/market/surface/model cohort? — and on success hands the caller's own
ordered list straight back by identity.

- **One function, one member type, one error type**
  (`geoMeasurementCohortIdentityGuard.ts`):
  `guardGeoMeasurementCohortIdentity(members)` takes a
  `readonly GeoMeasurementCohortMember[]` and returns that same list.
  `GeoMeasurementCohortMember` carries exactly six identifiers — `runId`,
  `projectId`, `marketProfileId`, `surfaceType`, `model`, `modelVersion`. There
  is no summary, metric, rate, or label type in the module.
- **The first member is the cohort baseline.** The guard validates the list and
  every field, then compares the five cohort-defining identifiers (`projectId`,
  `marketProfileId`, `surfaceType`, `model`, `modelVersion`, held in one
  `COHORT_IDENTITY_FIELDS` constant) of each later member against member 0.
  `runId` is validated but deliberately **not** compared: §2/§3 repeats are
  separate runs of one observation, so members are expected to differ there.
- **Spec §1/§7 boundary preserved.** A different surface, market, model, model
  version, or Project is rejected rather than folded in, so surfaces can never
  share a measurement cohort and every accepted cohort retains its explicit
  market and model/version identity. A surface outside the four Spec §1 kinds is
  rejected even when every member repeats it, so an invented surface cannot
  become a cohort identity. Nothing is inferred or widened: no `GLOBAL` market is
  guessed and no surface is normalized into another.
- **All runtime fields are validated at the untrusted boundary before
  acceptance.** The five free-form identifiers must each be a non-empty string;
  `" "`, `"\n"`, a number, boolean, `null`, `undefined`, object, array, or symbol
  is rejected. `surfaceType` must additionally be one of the four canonical
  surfaces. A value is never coerced, normalized, trimmed, or repaired — case-
  only and whitespace-only differences are rejected as the mismatches they are.
- **The first error throws a typed error naming the member index and field.**
  `GeoMeasurementCohortIdentityError` exposes `memberIndex` and `field`. `field`
  is the offending identifier (`runId`, `projectId`, …, `surfaceType`), `"member"`
  when a member is not an object at all, or `"members"` when the argument is not
  a non-empty list; `memberIndex` is `null` only for the two list-level cases.
  Zod reports issues in document order, so the rejection is the earliest
  offending member and field, and `toIdentityError` maps that issue path to the
  index/field pair. A malformed member 0 is rejected at index 0, so it can never
  silently become the baseline.
- **Fail-closed and total: no partial cohort.** A rejection throws before any
  value is returned, there is no `try`/`catch`, and no fallback, default, or
  prefix list exists.
- **It is narrow and deterministic by construction.** The module imports only
  Zod. It does not decide whether a run succeeded, count samples or prompts,
  calculate a rate/numerator/denominator, classify confidence (§4), derive
  data-quality warnings, select a time window, or make a statistical claim. It
  reads no raw observation, provider response, parser output, or current parse,
  and it opens no database, repository, provider, cache, or parser. A duplicate
  member is a legitimate repeat observation and is preserved, not de-duplicated
  or sorted. Same list, same outcome; the caller's array and member objects are
  read only and never mutated.

Public surface of the new module (unchanged by the fix):

```ts
type GeoMeasurementCohortMember = {
  runId: string;
  projectId: string;
  marketProfileId: string;
  surfaceType: string;
  model: string;
  modelVersion: string;
};

class GeoMeasurementCohortIdentityError extends Error {
  memberIndex: number | null;
  field: string;
}

function guardGeoMeasurementCohortIdentity(
  members: readonly GeoMeasurementCohortMember[],
): readonly GeoMeasurementCohortMember[];
```

`surfaceType` stays typed as `string` in the exported member type on purpose:
the type is the caller's pre-validation claim, and the guard's job is to narrow
that untrusted runtime value against the Spec §1 set. Narrowing the type would
only move the same cast to the caller.

The decision table as implemented (first satisfied row wins):

| # | Condition | Outcome |
| --- | --- | --- |
| 1 | argument is not an array, or is an empty array | throw, `memberIndex: null`, `field: "members"` |
| 2 | a member is not an object | throw, index `i`, `field: "member"` |
| 3 | a member field is missing, blank, or not a non-empty string | throw, index `i`, `field: <identifier>` |
| 4 | `surfaceType` is not one of the four Spec §1 surfaces | throw, index `i`, `field: "surfaceType"` (**new in Round 2**) |
| 5 | member `i > 0` differs from member 0 on any of the five cohort fields | throw, index `i`, `field: <identifier>` |
| 6 | every member carries all six identifiers and shares the five cohort fields | return the caller's list by identity |

## FILES CHANGED

Both source files remain new and untracked; no tracked file changed, and the
only other new paths are this DELIVERY and the controller's `REVIEW.md`.

| Path | Change |
| --- | --- |
| `src/server/features/search-growth/geo/services/geoMeasurementCohortIdentityGuard.ts` | New (Round 1); Round 2 adds `OBSERVATION_SURFACE_TYPES` + `surfaceTypeSchema` and switches the member schema's `surfaceType` to it (net +30 lines) |
| `src/server/features/search-growth/geo/services/geoMeasurementCohortIdentityGuard.test.ts` | New (Round 1); Round 2 adds 3 tests and adjusts 2 (net +3 tests, 20 → 23) |
| `control/tasks/T151-M2-GEO-MEASUREMENT-COHORT-IDENTITY-GUARD/DELIVERY.md` | This file (rewritten for Round 2) |

`REVIEW.md` was read only. It was neither created nor edited by this round.

No existing module was modified, no barrel/index file was touched, and no call
site was wired: the guard is a leaf module that later aggregation work will
cross.

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or generated-file change: `git status
--short` lists only the two new source files plus the two control documents, and
`git diff --stat` is empty. The guard holds no database handle and imports no
table or driver: it performs no read, insert, update, or delete of any kind. It
also does not import the `@/types/schemas/geo-observation-run` contract, whose
module graph reaches the Drizzle schema — which is why the surface set is
declared locally rather than imported (see KNOWN LIMITATIONS).

## DEPENDENCIES CHANGED

None. No `package.json` or lockfile change. The module's only import is `zod`
(existing runtime dependency, used the same way as the accepted T150
classifier); the enum uses Zod's existing `z.enum` with a literal tuple, so the
fix adds no dependency. The spec additionally uses `vitest` and `node:fs` (for
the static source boundary), both already installed. `node_modules` was already
present in this worktree this round, so no install was required or run.

## TESTS ADDED

`geoMeasurementCohortIdentityGuard.test.ts` — 23 tests in three suites: guard
(10), rejections (9), source boundary (4). The guard under test is the real
implementation, never a mock, and the source-boundary suite reads the shipped
file from disk. No module-level state is reset and no `vi.mock` is used.

Round 2 test changes, all directly tied to the blocker fix:

| Change | Why |
| --- | --- |
| **Added** guard test: all four Spec §1 surfaces are each accepted as their own cohort, unchanged (uses a new `SUPPORTED_SURFACES` constant mirroring the Spec list) | proves the enum admits exactly the four legal surfaces and does not fold them together |
| **Added** rejection test: unsupported surface on the **baseline** member rejects at index 0 / `surfaceType` | the first-member half of the review's fix acceptance |
| **Added** rejection test: unsupported (`UNSUPPORTED_SURFACE`), mis-cased (`model_api_search`), and whitespace-padded (`"AGGREGATED_SEARCH_DATA "`) surfaces on a **later** member all reject at index 1 / `surfaceType` | the later-member half of the fix acceptance, plus proof that the enum neither case-folds nor trims |
| **Adjusted** the whitespace no-trimming test to use `model` instead of `surfaceType` | `" MODEL_API_SEARCH "` is now (correctly) rejected as an unsupported surface, so it could no longer demonstrate the *cross-context mismatch* invariant; `model` keeps that invariant under test, and the surface no-trimming evidence moved to the new padded-surface test |
| **Adjusted** the source-boundary vocabulary assertion to run against the source with string literals stripped (new `codeWithoutLiterals`), and commented why | the Spec §1 value `AGGREGATED_SEARCH_DATA` is caller data, not aggregation logic; without this, the word "AGGREGATED" would false-positive an "aggregation" match. The assertion is unchanged for every other forbidden word |

Coverage of the TASK §4 list:

| Required invariant (TASK §4) | Test(s) |
| --- | --- |
| Valid same-cohort identity return | Guard 1, 2 |
| Stable order | Guard 1 |
| Every cross-field mismatch | Guard 6 (all five cohort fields) |
| Empty/malformed/blank/non-string member fields | Rejections 3–6; Rejections 8–9 for `surfaceType` |
| Empty collection | Rejections 1 |
| Duplicate members preserved | Guard 4 |
| Input non-mutation | Guard 10 |
| No partial result | Guard 9, Rejections 1, 7 |
| Deterministic repeated calls | Guard 10 |
| Source boundary: no DB, repository, provider, cache, raw evidence, parser, aggregation, classifier, or statistical logic | Boundary 1–4 |

### Guard suite — 10 tests

| # | Invariant |
| --- | --- |
| 1 | A three-member compatible cohort (distinct run ids, equal cohort fields) is returned with `expect(cohort).toBe(members)` and member-reference identity at both ends, with run order `run_1, run_2, run_3` intact |
| 2 | A single-member list is accepted — a cohort of one has nothing to contradict it |
| 3 | Each of the four Spec §1 surfaces is accepted as its own cohort and returned unchanged |
| 4 | Three identical members (same run id, same everything) are returned by identity, still three of them — duplicates are preserved, not filtered or de-duplicated |
| 5 | Each of the five cohort fields, changed one at a time on member 1, rejects at index 1 naming that field |
| 6 | A member differing only by letter case (`gpt-5` vs `GPT-5`) rejects — no case folding |
| 7 | A member differing only by surrounding whitespace (`" gpt-5 "` vs `"gpt-5"`) rejects — no trimming |
| 8 | With member 1 mismatching `projectId` and member 2 mismatching `model`, the error is index 1 / `projectId` — the earliest offending member, not the last |
| 9 | A valid 2-member prefix followed by a member 3 `marketProfileId` mismatch rejects at index 2 — the valid prefix is not returned |
| 10 | Three calls on one list return the same list reference every time, and `structuredClone` deep-equals the members afterwards — deterministic and non-mutating |

### Rejection suite — 9 tests

| # | Invariant |
| --- | --- |
| 1 | An empty array rejects as `memberIndex: null`, `field: "members"` — there is no baseline |
| 2 | Eight non-array arguments (`null`, `undefined`, `42`, `"members"`, `true`, a bare member object, `{}`, a `Set`) all reject as `field: "members"` |
| 3 | Six non-object members (`null`, `undefined`, `42`, `"run_1"`, `true`, `[]`) at index 1 reject as `field: "member"` |
| 4 | A member missing any one of the six identifiers rejects naming that identifier at index 1 (all six covered) |
| 5 | Four blank values (`""`, `"   "`, `"\t"`, `"\n  "`) on each of the six fields reject naming that field (24 cases) |
| 6 | Seven non-string values (`42`, `0`, `null`, `true`, `{}`, `[]`, `Symbol(...)`) on each of the six fields reject naming that field (42 cases) |
| 7 | A malformed **first** member rejects at index 0 with the baseline field named — a bad baseline can never be established |
| 8 | An unsupported surface (`UNSUPPORTED_SURFACE`) on the **first** member rejects at index 0 / `surfaceType` — an invented surface can never establish a baseline |
| 9 | An unsupported, mis-cased, or whitespace-padded surface on a **later** member rejects at index 1 / `surfaceType` (3 cases) |

Every rejection is observed through a `rejectWith` helper that fails the test if
the call returns normally, which is the fail-closed evidence: a rejected list
yields no cohort at all.

### Source boundary suite — 4 tests

Comments and string literals are stripped before the vocabulary assertions, so
prose that names an API or a Spec surface value cannot be mistaken for an
invocation or for logic.

| # | Invariant |
| --- | --- |
| 1 | Imports only `"zod"`; no `@/db`, `drizzle`, `Repository`, `node:fs`, or `geoConfidenceClassifier` import, and no `fetch(`, `process.env`, `node:fs`, `JSON.stringify`, or `console.` in the source |
| 2 | No `.record(`, `.query(`, `.select(`, `.insert(`, `.update(`, `.delete(`, `readFileSync(`, or `.parse(`, and no `cache`, `provider`, `repository`, `drizzle`, `rawObservation`, `rawResponse`, `rawAnswer`, `providerResponse`, `parser`, `parseId`, `parseStatus`, `isCurrent`, or `evidence` reference — no storage, repository, provider, cache, raw evidence, or parser |
| 3 | No `.filter(`, `.reduce(`, `.sort(`, `.toSorted(`, `new Set(`, `new Map(`, or `Math.`, and no aggregation, sampling, de-duplication, `distinct`, numerator, denominator, percent, confidence, significance, p-value, margin-of-error, ratio, or rate vocabulary — the non-empty pre-condition is the only counted thing, and it is a `length` guard, not a sample count |
| 4 | No `try`/`catch` (no failure is swallowed) and no `toLowerCase`/`toUpperCase`/`.trim(`/`Math.round`/`Math.floor`/`Math.ceil`/`parseInt`/`parseFloat`/`Number(`/`Boolean(`/`String(` — no value is coerced |

## COMMANDS RUN

`node_modules` was already present in this worktree, so no bootstrap install was
needed this round. Each command was invoked on its own line, not wrapped in a
chained shell operation. Read-only git usage: `git status --short`,
`git diff --stat`, `git rev-parse HEAD`.

| # | Command | Exit |
| --- | --- | --- |
| 1 | `corepack pnpm exec prettier --write src/.../geoMeasurementCohortIdentityGuard.ts src/.../geoMeasurementCohortIdentityGuard.test.ts` | 0 |
| 2 | `corepack pnpm exec vitest run src/.../geoMeasurementCohortIdentityGuard.test.ts` | 0 |
| 3 | `corepack pnpm format:check` | 0 |
| 4 | `corepack pnpm types:check` | 0 |
| 5 | `corepack pnpm lint` | 0 |
| 6 | `corepack pnpm test` | 0 |
| 7 | `corepack pnpm build` | 0 |
| 8 | `corepack pnpm ci:check` | 0 |

Every command was run on the final, post-fix source state, so each exit below
describes the exact code under review. No gate was sandbox-denied, retried after
a failure, or bypassed.

## COMMAND RESULTS

- **1 — prettier --write:** both files reported `unchanged` (exit 0). The fix was
  written in Prettier style on the first attempt.
- **2 — focused test:** `Test Files 1 passed (1)`, `Tests 23 passed (23)`,
  duration 7.67s. Green on the first run after the fix; no test or assertion was
  weakened or removed. Round 1 recorded 20; the delta is exactly the 3 new tests.
- **3 — format:check:** `All matched files use Prettier code style!` (exit 0).
- **4 — types:check:** `tsc --noEmit` produced no output (clean, exit 0).
- **5 — lint:** `Found 0 warnings and 0 errors. Finished in 67.3s on 969 files
  using 16 threads.` No `max-lines` or type-aware finding on the enlarged module.
- **6 — full test:** `Test Files 219 passed (219)`, `Tests 2260 passed (2260)`,
  duration 139.07s. The new spec appears in the run
  (`geoMeasurementCohortIdentityGuard.test.ts (23 tests) 114ms`) alongside the
  accepted GEO suites (`GeoCitationRecorderRepository.query.test.ts` 41,
  `GeoEntityMentionRecorderRepository.query.test.ts` 38,
  `GeoObservationRunRecorderRepository.query.test.ts` 36,
  `GeoObservationParseRecorderRepository.query.test.ts` 31,
  `GeoExactEntityMentionCandidateReaderRepository.query.test.ts` 23,
  `geoCitationFactAssembler.test.ts` 23,
  `geoExactEntityMentionMatcher.rejection.test.ts` 21,
  `geoExactEntityMentionFactAssembler.test.ts` 20,
  `freshGeoSampling.test.ts` 19,
  `geoConfidenceClassifier.test.ts` 13, etc.). No failures and no skips. The
  Round 1 delivery recorded 219 files / 2257 tests, so the delta is exactly the
  3 new tests in this one file. Only pre-existing stderr/stdout diagnostics
  (OAuth, DataForSEO, scheduler, MCP instrumentation, rank-tracking summaries)
  were emitted; none is related to this change.
- **7 — build:** invoked unpiped, so the exit code is the build's own: exit 0.
  Client (`✓ 3682 modules transformed`, built in 25.73s), SSR
  (`✓ 5086 modules transformed`, built in 35.79s), and `open_seo_audit`
  (`✓ 431 modules transformed`, built in 5.09s) all built, and the appended
  `tsc --noEmit` re-ran clean. Only the pre-existing >500 kB chunk-size advisory
  was printed (client `index-CABoJbOk.js` 1,274.30 kB; SSR router/fetch/index
  chunks) — present in Round 1 and unrelated to this change.
- **8 — ci:check:** exit 0. The aggregate ran `prettier --check .` (clean),
  `knip` (clean — no unused export; the two new module-private constants are both
  referenced), both `tsc --noEmit` projects (clean and clean),
  `oxlint . --type-aware` (`Found 0 warnings and 0 errors. Finished in 18.2s on
  969 files`), `sync-plugin-skills` (`Synced 9 skills into
  plugins/openseo/skills/`), and `check-plugin-skills-sync.mjs` (`plugin skill
  sync clean: plugins/openseo/skills`). No step was skipped, sandbox-denied, or
  bypassed, and `git status --short` confirms the skill sync changed no tracked
  file.

## RUNTIME EVIDENCE

No runtime, provider, network, database, or production invocation was performed
and none is possible from this module. The evidence is the focused spec
exercising the shipped guard directly; nothing below is inferred from reading
the code alone.

- **Blocker-fix evidence (the review's fix acceptance):** guard test 3 drives all
  four Spec §1 surfaces through the shipped guard and asserts each list is
  returned by identity, unchanged. Rejection test 8 asserts an invented surface
  on member 0 rejects as `memberIndex: 0`, `field: "surfaceType"` — so an
  unsupported surface can never establish the cohort baseline. Rejection test 9
  asserts an invented, mis-cased, or whitespace-padded surface on member 1
  rejects as `memberIndex: 1`, `field: "surfaceType"` — so an unsupported surface
  on a later member is rejected before any cohort escapes, and the enum neither
  case-folds nor trims. Together these are the runtime proof that the review's
  BLOCKER is closed.
- **Identity-return evidence:** guard test 1 asserts
  `guardGeoMeasurementCohortIdentity(members)` is `toBe(members)` and that
  individual member references (`cohort[0]`, `cohort[2]`) are the caller's own
  objects, with the run order preserved. Tests 2 and 4 assert the same identity
  for a one-member list and for a duplicate-member list. This is the acceptance
  evidence that only the original, ordered member references escape.
- **Baseline and mismatch evidence:** guard test 5 drives all five cohort fields
  one at a time through the shipped guard and asserts the `memberIndex`/`field`
  pair for each; tests 6 (case) and 7 (whitespace) prove no normalization occurs;
  test 8 proves the earliest offending member wins over a later one; test 9
  proves a valid 2-member prefix is not returned when member 3 breaks the cohort.
  Rejection test 7 proves a malformed member 0 is rejected rather than becoming
  the baseline.
- **Boundary-evidence handling evidence:** rejection tests 4–6 exercise a
  missing, blank, and non-string value on every one of the six identifiers
  (6 + 24 + 42 cases) and assert the named field each time; rejection tests 1–3
  cover the empty list, a non-array argument, and a non-object member through the
  same helper.
- **Determinism and non-mutation evidence:** guard test 10 calls the guard three
  times on one list, asserts all three results are the same reference, and
  asserts `structuredClone(members)` deep-equals the members afterwards — the
  caller's array and member objects are unchanged.
- **Boundary proof:** boundary tests 1–4 statically prove the shipped source
  imports only Zod, references no storage/repository/provider/cache/parser/raw-
  evidence symbol, invokes no repository or I/O call, performs no
  filter/reduce/sort/Set/Map/arithmetic, contains no aggregation, confidence, or
  statistical vocabulary, and has no `try`/`catch` and no coercion. These
  assertions are made against the module under test read from disk, not a copy.
  The new surface enum is a literal tuple in this module, so it introduces no
  import that could reach storage.
- **Regression evidence:** command 6 — 219 files / 2260 tests passed; commands
  3, 4, 5, 7, 8 — format, type check, lint, production build, and the full
  aggregate CI gate all exit 0 on the final source state.

## KNOWN LIMITATIONS

- **The four surface literals are declared locally, duplicating the canonical
  enum.** The canonical runtime set is `observationSurfaceTypeSchema` in
  `src/types/schemas/geo-observation-run.ts`, but that module imports
  `@/db/search-growth.schema`, whose graph reaches Drizzle — importing it would
  make the guard storage-dependent and would falsify the task's storage-free
  boundary (and the source-boundary test). `schemas/zod-contracts.reference.ts`
  also lists the four values but is a root-level reference file, not a
  production source. So the guard carries its own four-value tuple, and the two
  lists must be kept in step if Spec §1 ever changes. The focused test suite
  pins all four values, so a drift would surface as a test failure only if one
  side is edited alone. Flagged for review.
- **`z.object` ignores unknown properties**, so a member carrying e.g. a
  `promptId` or `fidelity` is accepted with that extra field unread. Nothing is
  interpreted or mixed, the extra field survives untouched because the caller's
  objects are returned by identity, and rejecting unknown keys would add a rule
  the TASK does not state. Flagged for review.
- **The guard cannot tell whether the members were honestly sourced.** It
  verifies that the supplied identifiers agree and that the surface is one the
  Spec admits; it cannot verify that a run id exists, that a market profile id is
  real, or that the caller did not simply copy one member's identifiers onto
  another. Cohort membership is the caller's claim, and identity agreement is all
  this guard can check.
- **`runId` is not required to be unique.** Duplicate and repeated members are
  deliberately preserved (TASK §4), so the guard neither de-duplicates run ids
  nor asserts that repeats are distinct.
- **No runtime success is claimed for the eventual aggregation.** Nothing calls
  the guard yet, so it has no production call site: §7's metric surfaces that
  must carry surface/market/model/sample/confidence identity are later work.
  Knip sees the module through its spec.
- **The full-suite durations and the >500 kB chunk advisory are pre-existing**
  and unrelated to this change.

## DEVIATIONS FROM TASK

None in scope. All scope boundaries in the TASK were honored: no schema,
migration, snapshot, or dependency change; no runtime sampling, aggregation,
database access, parser, UI, CRUD/server function, credentials, publishing, paid
action, or production behavior; no time-window selection, confidence
classification, or statistical claim. The Round 1 blocker was fixed by the
narrow change the review prescribed, and nothing else was touched. No APPROVED
command was wrapped in a chained shell operation and no unapproved pnpm script
was used; the only extra commands were the read-only git ones the TASK permits.
No install was needed because `node_modules` was already present.

Two test-only adjustments accompany the fix and are disclosed here because they
change assertions rather than add them:

1. **The whitespace no-trimming test now uses `model`, not `surfaceType`.**
   `" MODEL_API_SEARCH "` is now correctly rejected as an *unsupported surface*
   rather than as a *cross-context mismatch*, so keeping it there would have
   mislabelled which invariant the test proves. The surface no-trimming evidence
   moved into rejection test 9 (`"AGGREGATED_SEARCH_DATA "`), and the `model`
   case still proves an exact-comparison mismatch with no trimming. No invariant
   lost coverage.
2. **The source-boundary vocabulary assertion now runs on source with string
   literals stripped.** The Spec §1 surface value `AGGREGATED_SEARCH_DATA`
   contains "AGGREGATED", which the aggregation-vocabulary regex would
   false-positive. Stripping string literals before that one assertion removes
   the false positive without weakening the check: a value in a literal is data,
   not logic, and every other forbidden word is still matched across the whole
   (comment-stripped) source. The comment above the constant documents this.

Implementation choices worth flagging for review:

1. **The guard returns the caller's list reference, not a filtered copy.** TASK
   §1 asks for the "original member list by identity", and the shortest,
   least-surprising way to satisfy both that and the acceptance criterion
   ("retains the original ordered member references") is to return the argument
   itself after validating it. Zod's parsed copies are read for comparison only,
   which is why the guard can validate without ever wrapping, cloning, or
   reordering what the caller passed.
2. **Field-level rejection vocabulary is `member` and `members` for the two
   non-field cases.** No single member field exists when the whole argument is
   not a non-empty array, or when a member is not an object at all. Rather than
   inventing a fake index or a nullable field, the error reports
   `memberIndex: null` with `field: "members"` (list-level) or `field: "member"`
   (member-level), so `memberIndex`/`field` always distinguish the case without
   the caller having to parse the message.

## SECURITY NOTES

- No credential, account, provider, paid action, publishing, Prompt Explorer,
  R2/application-cache, CAPTCHA/2FA, stealth, or cookie access; no network call,
  no database access, and no production or external system contact. The spec
  runs entirely in process with plain objects.
- The guard is storage-free: it opens no database and calls no repository,
  cache, provider, or parser. It holds no handle to any external system, and it
  does not import any module whose graph reaches the Drizzle schema — the
  surface enum is declared locally precisely to keep that true.
- Fail-closed and total: the first invalid or cross-context member throws before
  any cohort exists, so an unusable list cannot be returned, defaulted, or
  repaired. There is no `try`/`catch` and no fallback path.
- No value is coerced: blank and whitespace-only identifiers are rejected rather
  than trimmed, case variants are rejected rather than folded, and non-string
  identifiers are rejected rather than stringified. An unsupported surface is
  rejected rather than remapped onto a canonical one — so a caller cannot smuggle
  a member into a cohort by padding, casing, or relabeling its identity.
- No partial cohort can escape: a mismatch at member `i` throws at `i` and never
  returns the `0..i-1` prefix, and a malformed member 0 (including an unsupported
  surface) throws before it can become the baseline.
- The caller's array and member objects are read only and never mutated, and no
  identifier is logged, serialized, or persisted. Error messages quote the two
  identifiers that disagreed (ids, not secrets) to make the mismatch attributable
  in a log without a debugger.
- No scope change, no edit to `29_SCOPE_LOCK.md`, no Accepted-ADR edit, no
  acceptance-criteria weakening, no dependency addition, no
  `--dangerously-skip-permissions`, no commit, no merge, no push, and no
  production publishing. `main` was not touched. `REVIEW.md` was read but
  neither created nor edited.

## GIT STATUS/DIFF SUMMARY

`git rev-parse HEAD` → `89d28735f90133d26dadce1bcee0eef5106f4df9`
(`chore(search-growth): dispatch T151 round 1`). No commit, merge, push, or
branch change was made; `main` was not touched.

`git diff --stat` → empty (no tracked file modified). `git diff --stat --
package.json pnpm-lock.yaml` → empty.

`git status --short`:

```text
?? control/tasks/T151-M2-GEO-MEASUREMENT-COHORT-IDENTITY-GUARD/DELIVERY.md
?? control/tasks/T151-M2-GEO-MEASUREMENT-COHORT-IDENTITY-GUARD/REVIEW.md
?? src/server/features/search-growth/geo/services/geoMeasurementCohortIdentityGuard.test.ts
?? src/server/features/search-growth/geo/services/geoMeasurementCohortIdentityGuard.ts
```

(`REVIEW.md` is untracked because the controller created it for this round; it is
not a change made by this task.)

No build output (`dist/`), cache, migration, snapshot, generated file, or
plugin-skill sync change appears in the status.

Changed paths:

- `src/server/features/search-growth/geo/services/geoMeasurementCohortIdentityGuard.ts` (new)
- `src/server/features/search-growth/geo/services/geoMeasurementCohortIdentityGuard.test.ts` (new)
- `control/tasks/T151-M2-GEO-MEASUREMENT-COHORT-IDENTITY-GUARD/DELIVERY.md` (this file)

## READY FOR REVIEW

The Round 1 BLOCKER — unsupported observation surfaces accepted as a valid
cohort — is fixed by the storage-free runtime enum validation the review
prescribed, with first- and later-member unsupported-surface negative tests plus
a positive test over all four Spec §1 surfaces. The guard's exact comparison,
by-identity member return, fail-closed behavior, and all task boundaries are
preserved. Implementation, 23 focused tests, the full suite (219 files / 2260
tests), format check, type check, lint, the production build, and the aggregate
`ci:check` all exited 0 on this code; no gate was sandbox-denied, retried after a
failure, or bypassed. The worktree contains only the two new task-scoped source
files plus this DELIVERY. Awaiting Codex review; no PASS is claimed here.

Only Codex can PASS this task.
