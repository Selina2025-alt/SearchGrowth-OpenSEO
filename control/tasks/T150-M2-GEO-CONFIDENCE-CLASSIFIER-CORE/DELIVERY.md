# DELIVERY — T150-M2-GEO-CONFIDENCE-CLASSIFIER-CORE

ROUND: 1 of 3
BASE COMMIT: c1ae39694b4c2bfc800a43a7cabffe84963e9542
STATUS: READY FOR REVIEW (implementation complete; not self-accepted)

## TASK ID

T150-M2-GEO-CONFIDENCE-CLASSIFIER-CORE

## IMPLEMENTATION SUMMARY

Added one small, pure, storage-free classifier that labels a caller-supplied,
already-compatible measurement cohort with the frozen Measurement Spec §4
confidence level and returns exactly `LOW`, `MEDIUM`, or `HIGH`.

- **One function, one input type, one label type**
  (`geoConfidenceClassifier.ts`): `classifyGeoConfidence(input):
  GeoConfidenceLevel`, where the input is `GeoConfidenceCohortSummary` —
  `{ successfulObservationCount, distinctPromptCount,
  hasMajorSurfaceOrModelChangeWarning }` — and the label is the union
  `"LOW" | "MEDIUM" | "HIGH"`. There is no fourth label and no `UNKNOWN`.
- **Only the frozen §4 rule runs, in one fixed order.** Below 10 successful
  observations → LOW. Otherwise, at ≥30 observations, ≥5 distinct prompts, and
  no major surface/model change warning → HIGH. Otherwise, at ≥3 distinct
  prompts → MEDIUM. Every remaining combination → LOW. The warning is consulted
  only by the HIGH branch, so it withholds HIGH and never downgrades a cohort
  that already qualifies for MEDIUM.
- **The four thresholds are named module-private constants** (`10`/`3` for
  MEDIUM, `30`/`5` for HIGH), so the frozen numbers appear once each and the
  branches read as the spec does.
- **The untrusted runtime boundary is validated before classifying.** Both
  counts must be finite, safe, non-negative integers and the warning must be a
  boolean. A value is never coerced, rounded, clamped, truncated, floored, read
  for truthiness, inferred from a string, or repaired — `"10"`, `1.5`, `-1`,
  `NaN`, `Infinity`, `2 ** 53`, `10n`, `null`, and a missing key are all
  rejected. The typed `GeoConfidenceClassifierInputError` names the offending
  field (`successfulObservationCount`, `distinctPromptCount`,
  `hasMajorSurfaceOrModelChangeWarning`) or `input` when the call argument is
  not an object at all.
- **It is narrow and deterministic by construction.** The module imports only
  Zod. It samples nothing, counts nothing, aggregates nothing, de-duplicates no
  prompt, mixes no surface or model, selects no cohort, reads no database,
  repository, cache, provider, raw response, parser, current parse (ADR-005),
  market profile, model, or prompt, produces no numerator/denominator,
  percentage, ratio, or rate, and makes no significance claim. Repeats (§3) are
  not modeled: `successfulObservationCount` is taken exactly as the caller
  supplied it. Same input, same label; the caller's object is read only and
  never mutated.

## FILES CHANGED

Both source files are new and untracked; no tracked file changed, and the only
other new path is this DELIVERY itself.

| Path | Change |
| --- | --- |
| `src/server/features/search-growth/geo/services/geoConfidenceClassifier.ts` | New: classifier (label/input types, schema, error, thresholds, `classifyGeoConfidence`) — 172 lines |
| `src/server/features/search-growth/geo/services/geoConfidenceClassifier.test.ts` | New: 13 focused tests (5 classification + 4 rejection + 4 source-boundary) — 331 lines |

Public surface of the new module:

```ts
type GeoConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

type GeoConfidenceCohortSummary = {
  successfulObservationCount: number;
  distinctPromptCount: number;
  hasMajorSurfaceOrModelChangeWarning: boolean;
};

class GeoConfidenceClassifierInputError extends Error {
  field: string;
}

function classifyGeoConfidence(
  input: GeoConfidenceCohortSummary,
): GeoConfidenceLevel;
```

The frozen §4 decision table as implemented (branch order top to bottom):

| # | Condition | Result |
| --- | --- | --- |
| 1 | `successfulObservationCount < 10` | `LOW` |
| 2 | `successfulObservationCount >= 30` **and** `distinctPromptCount >= 5` **and** `!hasMajorSurfaceOrModelChangeWarning` | `HIGH` |
| 3 | `distinctPromptCount >= 3` (observations already ≥ 10) | `MEDIUM` |
| 4 | anything else | `LOW` |

Boundary truth table exercised by the spec (`s/prompts/warning -> label`):

| Observations | Prompts | Warning | Label | Why |
| --- | --- | --- | --- | --- |
| 9 | 2 / 3 / 5 / 99 | no | LOW | below the observation floor |
| 9 | 99 | yes | LOW | the floor dominates the warning |
| 10 | 2 | no | LOW | prompt floor not met |
| 10 | 3 | no / yes | MEDIUM | both MEDIUM floors |
| 10 | 4 / 5 | no | MEDIUM | above the prompt floor, below the HIGH floors |
| 29 | 2 | no | LOW | prompt floor not met |
| 29 | 3 / 4 / 5 | no / yes | MEDIUM | HIGH needs 30 observations |
| 30 | 2 | no | LOW | prompt floor not met |
| 30 | 3 / 4 | no | MEDIUM | below/at the prompt floor, not HIGH |
| 30 | 5 | no | HIGH | all three HIGH floors met |
| 30 | 5 | yes | MEDIUM | warning withholds HIGH only |
| 30 | 6 / 31 / 100 | no | HIGH | above every floor |
| 100 | 100 | yes | MEDIUM | warning withholds HIGH only |

Validation order and the exact rejection for each defect:

| # | Check | `field` |
| --- | --- | --- |
| 1 | call argument is an object | `input` |
| 1 | `successfulObservationCount` is a finite, safe, non-negative integer | `successfulObservationCount` |
| 1 | `distinctPromptCount` is a finite, safe, non-negative integer | `distinctPromptCount` |
| 1 | `hasMajorSurfaceOrModelChangeWarning` is a boolean | `hasMajorSurfaceOrModelChangeWarning` |

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or generated-file change: `git status
--short` lists only the two new source files, and `git diff --stat` is empty.
The classifier holds no database handle and imports no table or driver — it
performs no read, insert, update, or delete of any kind.

## DEPENDENCIES CHANGED

None. No `package.json` or lockfile change (`git diff --stat -- package.json
pnpm-lock.yaml` is empty). The only import in the module is `zod` (existing
runtime dependency, used the same way as the accepted T144 matcher/T149
assembler). The spec additionally uses `vitest` and `node:fs` (for the static
source boundary), both already installed. The bootstrap install ran with
`--frozen-lockfile` and did not change `pnpm-lock.yaml`.

## TESTS ADDED

`geoConfidenceClassifier.test.ts` — 13 tests in three suites: classification
(5), rejections (4), source boundary (4). The classifier under test is the real
implementation, never a mock, and the source-boundary suite reads the shipped
file from disk. No module-level state is reset and no `vi.mock` is used.

Coverage of the TASK §5 list:

| Required invariant (TASK §5) | Test(s) |
| --- | --- |
| Threshold boundaries 9/10/29/30 observations | Classification 1 (24-case table) |
| Prompt boundaries 2/3/4/5 | Classification 1, 3 |
| Warning / no-warning | Classification 1, 2 |
| Valid MEDIUM under a warning | Classification 1, 2 |
| Valid HIGH | Classification 1, 2 |
| Insufficient combinations are LOW | Classification 1, 3 |
| No label outside LOW/MEDIUM/HIGH | Classification 4 (grid sweep) |
| Deterministic repeated calls | Classification 5 |
| Input non-mutation | Classification 5 |
| Malformed / fractional / unsafe / negative / NaN / Infinity / non-boolean inputs | Rejections 1–4 |
| Typed errors naming the field | Rejections 1–4 (via `rejectWith`) |
| Source boundary: no storage/provider/cache/raw evidence/aggregation/statistical logic | Boundary 1–4 |

### Classification suite — 5 tests

| # | Invariant |
| --- | --- |
| 1 | The 24-case §4 boundary table (9/10/29/30 observations × 2/3/4/5(+) prompts × warning on/off) returns the exact expected label for every case, compared as readable `observations/prompts/warning -> label` strings |
| 2 | A 30/5 cohort keeps `MEDIUM` under a warning, a 10/5 cohort keeps `MEDIUM` under a warning, and the same 30/5 cohort is `HIGH` with the warning cleared — a warning withholds HIGH without erasing MEDIUM |
| 3 | Six insufficient cohorts are `LOW`, including 100 observations with only 2 distinct prompts |
| 4 | A sweep of 0–40 observations × 0–7 prompts × warning on/off produces exactly the label set `{LOW, MEDIUM, HIGH}` — no fourth label exists |
| 5 | Three calls on one summary all return `HIGH` and `structuredClone` deep-equals the summary afterwards — deterministic and non-mutating |

### Rejection suite — 4 tests

| # | Invariant |
| --- | --- |
| 1 | Non-object arguments (`null`, `undefined`, `42`, `"10"`, `true`, `[]`) all reject as `field: "input"` |
| 2 | A missing count or a missing warning rejects naming its own field |
| 3 | Twelve invalid count values (`1.5`, `-1`, `-0.5`, `NaN`, `Infinity`, `-Infinity`, `Number.MAX_SAFE_INTEGER + 1`, `2 ** 53`, `"10"`, `null`, `true`, `10n`) reject for **both** count fields — nothing is coerced, rounded, or clamped |
| 4 | Seven non-boolean warning values (`"false"`, `"true"`, `0`, `1`, `null`, `undefined`, `{}`) reject rather than being read for truthiness |

Every rejection is observed through a `rejectWith` helper that fails the test if
the call returns normally, which is the fail-closed evidence: a rejected summary
yields no label at all.

### Source boundary suite — 4 tests

Comments are stripped before the call-shape assertions, so prose that names an
API cannot be mistaken for an invocation of it.

| # | Invariant |
| --- | --- |
| 1 | Imports only `"zod"`; no `@/db`, `drizzle`, `Repository`, or `node:fs` import, and no `fetch(`, `process.env`, `node:fs`, `JSON.stringify`, or `console.` in the source |
| 2 | No `.record(`, `.query(`, `.select(`, `.insert(`, `.update(`, `.delete(`, `readFileSync(`, or `.parse(`, and no `cache`, `provider`, `rawObservation`, `rawResponse`, `rawAnswer`, `providerResponse`, `geoObservationRun`, `parserVersion`, `parseId`, `isCurrent`, `marketProfile`, `modelVersion`, `promptId`, `promptText`, or `surfaceType` reference — no storage, provider, cache, parser, current parse, market, model, or prompt |
| 3 | No `.filter(`, `.reduce(`, `.sort(`, `.toSorted(`, `new Set(`, `new Map(`, `Math.`, or `.length`; and no `aggregate`, `sample`, `dedupe`, `distinct(`, `numerator`, `denominator`, `percentage`, `percent`, `confidenceInterval`, `significance`, `pValue`, `marginOfError`, or `ratio` — no counting, sampling, aggregation, de-duplication, ratio, or statistical logic |
| 4 | No `try`/`catch` (no failure is swallowed) and no `toLowerCase`/`toUpperCase`/`.trim(`/`Math.round`/`Math.floor`/`Math.ceil`/`parseInt`/`parseFloat`/`Number(`/`Boolean(`/`String(` — no value is coerced |

## COMMANDS RUN

Bootstrap was required: `node_modules` was absent in this worktree. Each command
was invoked on its own line, not wrapped in a chained shell operation. Read-only
git usage: `git status --short`, `git diff --stat`, `git diff --stat --
package.json pnpm-lock.yaml`, `git rev-parse HEAD`.

| # | Command | Exit |
| --- | --- | --- |
| 1 | `corepack pnpm install --frozen-lockfile` | 0 |
| 2 | `corepack pnpm exec prettier --write src/.../geoConfidenceClassifier.ts src/.../geoConfidenceClassifier.test.ts` | 0 |
| 3 | `corepack pnpm exec vitest run src/.../geoConfidenceClassifier.test.ts` | 0 |
| 4 | `corepack pnpm format:check` | 0 |
| 5 | `corepack pnpm types:check` | 0 |
| 6 | `corepack pnpm lint` | 0 |
| 7 | `corepack pnpm test` | 0 |
| 8 | `corepack pnpm build` | 0 |
| 9 | `corepack pnpm ci:check` | 0 |

## COMMAND RESULTS

- **1 — install:** pnpm v10.30.1 completed successfully (exit 0); no lockfile
  mutation (`git diff --stat -- package.json pnpm-lock.yaml` empty).
- **2 — prettier --write:** the classifier was already conformant (`unchanged`);
  the spec was reformatted once (exit 0). No later run changed either file.
- **3 — focused test:** `Test Files 1 passed (1)`, `Tests 13 passed (13)`,
  26ms. No failures and no skips on the first run; no test or assertion was
  weakened or removed afterwards.
- **4 — format:check:** `All matched files use Prettier code style!` (exit 0).
  Unlike the T149 round, the two Controller-owned control files
  (`control/ACCEPTANCE_LEDGER.md`, `control/PROJECT_STATE.md`) are clean on this
  base commit, so this gate is genuinely green.
- **5 — types:check:** `tsc --noEmit` produced no output (clean).
- **6 — lint:** `Found 0 warnings and 0 errors. Finished in 48.4s on 967 files
  using 16 threads.` No `max-lines` or type-aware finding.
- **7 — full test:** `Test Files 218 passed (218)`, `Tests 2237 passed (2237)`,
  duration 153.16s. The new spec appears in the run
  (`geoConfidenceClassifier.test.ts (13 tests)`) alongside the accepted GEO
  suites (`GeoCitationRecorderRepository.query.test.ts` 41,
  `GeoEntityMentionRecorderRepository.query.test.ts` 38,
  `GeoObservationRunRecorderRepository.query.test.ts` 36,
  `GeoObservationParseRecorderRepository.query.test.ts` 31,
  `GeoExactEntityMentionCandidateReaderRepository.query.test.ts` 23,
  `geoCitationFactAssembler.test.ts` 23,
  `geoExactEntityMentionMatcher.rejection.test.ts` 21,
  `geoExactEntityMentionFactAssembler.test.ts` 20,
  `freshGeoSampling.test.ts` 19,
  `geoExactEntityMentionAssembly.test.ts` 12,
  `geoExactEntityMentionMatcher.test.ts` 12,
  `geoExactEntityMentionDetection.test.ts` 11,
  `geoParseOutputBundle.test.ts` 8,
  `GeoExactEntityMentionCandidateReaderRepository.boundary.test.ts` 5, and the
  GEO schema suites). No failures and no skips; only pre-existing
  stderr/stdout diagnostics (OAuth, DataForSEO, scheduler, MCP instrumentation,
  rank-tracking summaries) were emitted. The T149 delivery recorded 217 files /
  2224 tests, so the delta is exactly the 1 new file and 13 new tests.
- **8 — build:** client (`✓ 3682 modules transformed`, `✓ built in 28.35s`),
  SSR (`✓ 5086 modules transformed`, `✓ built in 49.50s`), and `open_seo_audit`
  (`✓ 431 modules transformed`, `✓ built in 5.08s`) all built, and the appended
  `tsc --noEmit` re-ran clean (overall exit 0). Only the pre-existing >500 kB
  chunk-size advisory was printed.
- **9 — ci:check:** exit 0. The aggregate ran `prettier --check .` (clean),
  `knip` (clean), both `tsc --noEmit` projects (clean), `oxlint . --type-aware`
  (`Found 0 warnings and 0 errors. Finished in 15.5s on 967 files`),
  `sync-plugin-skills` (`Synced 9 skills into plugins/openseo/skills/`), and
  `check-plugin-skills-sync.mjs` (`plugin skill sync clean`). No step was
  skipped, sandbox-denied, or bypassed, and `git status --short` confirms the
  skill sync changed no tracked file. No aggregate gate was sandbox-denied on
  this executor, so none is recorded as such.

## RUNTIME EVIDENCE

No runtime, provider, network, database, or production invocation was performed
and none is possible from this module. The evidence is the focused spec
exercising the shipped classifier directly; nothing below is inferred from
reading the code alone.

- **Threshold evidence:** classification test 1 drives the shipped
  `classifyGeoConfidence` through all 24 boundary cases and asserts the exact
  label for each — 9 → LOW at every prompt count and warning state, 10 with 2
  prompts → LOW and 10 with 3/4/5 → MEDIUM, 29 with 2 prompts → LOW and 29 with
  3/4/5 → MEDIUM, 30 with 2 → LOW, 30 with 3/4 → MEDIUM, 30 with 5 and no
  warning → HIGH, 30 with 5 under a warning → MEDIUM, 100/100 → HIGH, and
  100/100 under a warning → MEDIUM. Test 3 adds the remaining insufficient
  cohorts, including 100 observations with 2 prompts → LOW. Test 4 sweeps
  0–40 × 0–7 × warning on/off and asserts the produced label set is exactly
  `{HIGH, LOW, MEDIUM}`, which is the no-fourth-label evidence.
- **Warning-semantics evidence:** classification test 2 shows the warning
  withholds HIGH (`30/5/warn → MEDIUM`) while leaving a qualifying MEDIUM
  intact (`10/5/warn → MEDIUM`), and that clearing the flag on the same 30/5
  cohort yields `HIGH`.
- **Determinism and non-mutation evidence:** classification test 5 calls the
  classifier three times on one summary object, asserts all three results are
  `HIGH`, and asserts `structuredClone(summary)` deep-equals the summary after
  the calls — the caller's object is unchanged.
- **Rejection evidence:** rejection tests 1–4 assert the `field` on the typed
  `GeoConfidenceClassifierInputError` for a non-object argument, a missing
  member, twelve invalid count values applied to both count fields, and seven
  non-boolean warning values. Each is captured through a helper that fails the
  test if the call returned, which is the fail-closed evidence: a rejected call
  yields no label, never a repaired or defaulted one.
- **Boundary evidence:** boundary tests 1–4 statically prove the shipped source
  imports only Zod, references no storage/provider/cache/parser/market/model/
  prompt/raw-observation symbol, invokes no repository or I/O call, performs no
  filter/reduce/sort/Set/Map/arithmetic, contains no aggregation or statistical
  vocabulary, and has no `try`/`catch` and no coercion. These assertions are
  made against the module under test read from disk, not a copy.
- **Regression evidence:** command 7 — 218 files / 2237 tests passed; commands
  4, 5, 6, 8, 9 — format, type check, lint, production build, and the full
  aggregate CI gate all exit 0.

## KNOWN LIMITATIONS

- `z.object` ignores unknown properties, so a caller that also supplies e.g. a
  surface or model field has it silently dropped rather than rejected. The label
  is computed only from the three contract fields, so nothing is mixed or
  interpreted, and rejecting unknown keys would add a rule the TASK does not
  state. Flagged for review.
- The two counts are taken exactly as supplied. The classifier cannot tell
  whether they were honestly derived, whether the observations belong to one
  surface/model, or whether the prompts are genuinely distinct — cohort
  selection and compatibility are explicitly the caller's responsibility per
  the TASK.
- Repeats (§3) are not modeled. A caller with 3 repeats per prompt passes its
  own successful-observation total; the classifier does not reconcile a repeat
  count against it and does not verify that 10 observations actually span 3
  distinct prompts. It reads `distinctPromptCount` as given.
- The major surface/model change warning is a single caller-supplied boolean. It
  is not derived, and its provenance and scope are the caller's.
- Nothing calls the classifier yet, so it has no production call site: §7's
  metric surfaces that must carry a confidence label are later work. Knip sees
  the module through its spec.
- The full-suite durations and the >500 kB chunk advisory are pre-existing and
  unrelated.

## DEVIATIONS FROM TASK

None in scope. All scope boundaries in the TASK were honored: no schema,
migration, snapshot, or dependency change; no runtime sampling, aggregation,
database access, parser, UI, CRUD/server function, credentials, publishing,
paid action, or production behavior. No APPROVED command was wrapped in a
chained shell operation and no unapproved pnpm script was used; the only extra
commands were the read-only git ones the TASK permits. The bootstrap install was
required because `node_modules` was absent in this worktree (explicitly allowed)
and did not change the lockfile.

Two implementation choices are worth flagging for review:

1. **The four thresholds are module-private constants, not exported.**
   `MEDIUM_MIN_SUCCESSFUL_OBSERVATIONS`/`MEDIUM_MIN_DISTINCT_PROMPTS` (10/3)
   and `HIGH_MIN_SUCCESSFUL_OBSERVATIONS`/`HIGH_MIN_DISTINCT_PROMPTS` (30/5)
   keep the frozen numbers in one place each so the branches read like §4.
   They are not exported because the label is the contract; exporting the
   numbers would invite callers to branch on thresholds themselves. The spec
   asserts the frozen values behaviourally through the boundary table rather
   than by re-declaring them.
2. **Invalid counts are rejected with one shared message.** Every check in the
   count chain (`z.number`, `.int`, `.nonnegative`, `Number.isSafeInteger`)
   carries the same `"must be a finite, safe, non-negative integer"` detail, so
   a fractional, unsafe, negative, `NaN`, `Infinity`, missing, or wrong-typed
   count all read identically and the `field` alone identifies the culprit.
   This keeps the error surface small and avoids leaking Zod internals.

## SECURITY NOTES

- No credential, account, provider, paid action, publishing, Prompt Explorer,
  R2/application-cache, CAPTCHA/2FA, stealth, or cookie access; no network call,
  no database access, and no production or external system contact. The spec
  runs entirely in process with plain objects.
- The classifier is storage-free: it opens no database and calls no repository,
  cache, provider, or parser. It holds no handle to any external system.
- Fail-closed and total: the first invalid field throws before any label exists,
  so an unusable cohort summary cannot be classified, defaulted, or repaired.
  There is no `try`/`catch` and no fallback label.
- No value is coerced: `"10"` is not parsed, `1.5` is not rounded, `-1` is not
  clamped, `NaN`/`Infinity`/unsafe integers are not accepted, and a non-boolean
  warning is not read for truthiness — so a caller cannot inflate a confidence
  label with a malformed count or suppress a warning by passing a truthy
  non-boolean.
- The caller's summary object is read only and never mutated, and no value is
  logged, serialized, or persisted.
- No scope change, no edit to `29_SCOPE_LOCK.md`, no Accepted-ADR edit, no
  acceptance-criteria weakening, no dependency addition, no
  `--dangerously-skip-permissions`, no commit, no merge, no push, and no
  production publishing. `main` was not touched. `REVIEW.md` was neither created
  nor edited.

## GIT STATUS/DIFF SUMMARY

`git rev-parse HEAD` → `c1ae39694b4c2bfc800a43a7cabffe84963e9542`
(`chore(search-growth): dispatch T150 round 1`).

`git diff --stat` → empty (no tracked file modified). `git diff --stat --
package.json pnpm-lock.yaml` → empty.

`git status --short` before this DELIVERY was written:

```text
?? src/server/features/search-growth/geo/services/geoConfidenceClassifier.test.ts
?? src/server/features/search-growth/geo/services/geoConfidenceClassifier.ts
```

with this DELIVERY added as the third untracked path at
`control/tasks/T150-M2-GEO-CONFIDENCE-CLASSIFIER-CORE/DELIVERY.md`. No build
output (`dist/`), cache, migration, snapshot, generated file, or plugin-skill
sync change appears in the status.

Changed paths:

- `src/server/features/search-growth/geo/services/geoConfidenceClassifier.ts` (new)
- `src/server/features/search-growth/geo/services/geoConfidenceClassifier.test.ts` (new)
- `control/tasks/T150-M2-GEO-CONFIDENCE-CLASSIFIER-CORE/DELIVERY.md` (this file)

No commit, merge, push, or branch change was made. `main` was not touched.
`node_modules`, `dist/`, and other build output are gitignored and absent from
status.

## READY FOR REVIEW

Implementation, 13 focused tests, the full suite (218 files / 2237 tests), type
check, lint, the production build, and the aggregate `ci:check` all exited 0 on
this code — no gate was sandbox-denied and none is recorded as bypassed. The
worktree contains only the two new task-scoped source files plus this DELIVERY.
Awaiting Codex review; no PASS is claimed here.

Only Codex can PASS this task.
