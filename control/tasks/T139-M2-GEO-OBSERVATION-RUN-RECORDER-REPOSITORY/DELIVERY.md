# DELIVERY — T139-M2-GEO-OBSERVATION-RUN-RECORDER-REPOSITORY

TASK ID: T139-M2-GEO-OBSERVATION-RUN-RECORDER-REPOSITORY
STATUS: READY FOR REVIEW
BRANCH: ai-task/T139-M2-GEO-OBSERVATION-RUN-RECORDER-REPOSITORY
BASE COMMIT: b1e75de (control: record T138 and plan T139)
ROUND: 3 (final)

## REVIEW FINDINGS ADDRESSED

### BLOCKER — JSON-safe traversal rejects valid evidence and still permits several lossy shapes → FIXED

All four boundary corrections were applied, and only those. The INSERT mapping,
schema/migrations, sampling/core behavior, and scope are untouched.

**1. Nested blank strings were rejected — now preserved.**

`assertJsonSafeRawResponse` no longer inspects string content: a `string` case
returns immediately, so `""` nested at any depth is accepted and stored as the
JSON text `""`. The nonblank rule now lives only at the root, where it already
belonged — `serializeGeoRawResponse` still rejects a blank/whitespace-only root
string before delegating (`GeoObservationRunRecorderRepository.ts:79`).
`{ optionalAnswer: "" }` now round-trips: stored text equals
`JSON.stringify(payload)` and parses back `toStrictEqual`.

**2. Array symbol-keyed own properties were not checked — now rejected.**

`assertJsonSafeArray` gained the same `Object.getOwnPropertySymbols` guard the
object path already had (`:127`). `Object.assign([1], { [Symbol("s")]: 1 })`
passes the density check (own names are `["0","length"]`) and previously
validated, while `JSON.stringify` silently dropped the symbol property. It is
now rejected with zero rows written.

**3. Enumerable accessors were validated through `Reflect.get` — now rejected.**

New `readOwnDataValue` (`:48`) reads an own property **only** through its
property descriptor and throws `accessor property` when the descriptor is
missing or has no `value`. Both `assertJsonSafeArray` (`:139`) and
`assertJsonSafeObject` (`:168`) now use it in place of indexed reads /
`Reflect.get`. A getter can no longer return one value to the validator and a
different value — or run a side effect — when `JSON.stringify` reads the same
property, so the persisted text is proven to be the validated raw evidence.
Enumerable getters on objects and at array indices both reject with zero rows.

**4. `-0` was finite but not preserved — now rejected.**

The number branch rejects `Object.is(value, -0)` (`:87`) alongside the existing
non-finite check, because JSON serializes `-0` as `0`.

Everything else the review verified as correct is unchanged: non-finite numbers,
`undefined`, functions, symbols, BigInts, `Date`/`Map`/custom objects,
non-enumerable properties, sparse/extended arrays, and cycles still reject
before the INSERT; a DAG (a value repeated in sibling branches) is still
accepted. Accepted payloads remain opaque — validation inspects value types and
property shape only, never business content.

### Why the round-2 justification was wrong

Round 2 read the review's acceptance sentence — "nonempty strings" among the
accepted values — as a content policy applying at every depth, and documented
that reading as an interpretation note. That was an invention: JSON carries
every string, and only the root capture must be usable evidence. The rule is now
scoped to the root, where ADR-003's usable-evidence requirement actually applies.

## IMPLEMENTATION SUMMARY

One credential-free persistence adapter implementing the accepted T138
`GeoObservationRunRecorder` port. `record(runFact)` turns a validated
`GeoObservationRunFact` into exactly one `INSERT` into the accepted
`geo_observation_runs` table, mapping every provenance field faithfully and
persisting opaque raw evidence verbatim (root string) or as JSON text
(JSON-safe tree). Raw evidence that JSON text cannot carry back unchanged is
rejected before the INSERT, and a rejected fact writes no row.

There is no update, upsert, dedupe, retry, lifecycle transition, parser,
provider, cache, workflow, migration, or schema change.

The adapter is a plain repository-style object (`@/db` + `@/db/schema`), so it
runs unchanged on both backends through the provider-aware `db` handle; the
existing `src/db/schema-parity.test.ts` remains the dual-dialect drift guard
(`geo_observation_runs` is included via the search-growth schema barrels).

### Fact → storage mapping (`GeoObservationRunRecorderRepository.ts:200`)

| `GeoObservationRunFact` field | `geo_observation_runs` column |
| --- | --- |
| `id` | `id` |
| `batchId` | `batch_id` |
| `projectId` | `project_id` |
| `promptId` | `prompt_id` |
| `promptVersion` | `prompt_version` |
| `surfaceType` | `surface_type` |
| `surfaceName` | `surface_name` |
| `fidelity` | `fidelity` |
| `provider` | `provider` |
| `engine ?? null` | `engine` |
| `model` | `model` |
| `modelVersion ?? null` | `model_version` |
| `webSearch ?? null` | `web_search` (boolean mode) |
| `searchMode ?? null` | `search_mode` |
| `marketProfileId ?? null` | `market_profile_id` |
| `repeatIndex` | `repeat_index` |
| `applicationCacheBypassed` (literal `true`) | `application_cache_bypassed` |
| `rawResponse` (validated, see below) | `raw_response` |
| `providerRequestId` | `provider_request_id` |
| `startedAt` | `started_at` |
| `finishedAt` | `finished_at` |
| `status` (`"SUCCEEDED"`) | `status` |
| — not carried by the fact | `raw_answer` = NULL, `usage_json` = NULL |
| — not carried by the fact | `created_at` = existing DB default |

No field is synthesized; the only values not derived from the fact are the two
NULL optional raw columns and the existing `created_at` database default. The
mapping is byte-for-byte the same as round 2.

### Raw-evidence serialization / rejection (`GeoObservationRunRecorderRepository.ts:202`)

- root non-empty **string** → stored verbatim, never trimmed or rewritten;
- `null` / `undefined` root → rejected as an absent capture;
- any other value → walked by `assertJsonSafeRawResponse`, then stored as
  `JSON.stringify(value)` only if every node provably round-trips.

**Accepted and stored opaque:**

- **any string at a nested path, including `""` and whitespace-only**;
- booleans, finite non-`-0` numbers, nested `null`, dense arrays, and plain
  objects (`Object.prototype` or `null` prototype) whose own enumerable
  string-keyed properties are data descriptors that are recursively safe.

**Rejected before the INSERT (record throws; zero rows written):**

| Rejected anywhere in the tree | Why JSON text cannot carry it back |
| --- | --- |
| non-finite number (`NaN`, `±Infinity`) | serializes as the token `null` |
| `-0` | serializes as `0` |
| `undefined` (root, property, or element) | dropped from objects, becomes `null` in arrays |
| function, symbol | dropped; no JSON token |
| BigInt | no JSON token (stringify throws) |
| non-plain/custom object (`Date`, `Map`, `Set`, class instance) | rewritten via `toJSON`/enumerable shape |
| symbol-keyed own property (object **or array**) | dropped from the output |
| non-enumerable own property | dropped from the output |
| accessor (getter/setter) own property, object or array index | re-read at serialization: the stored text is not proven to be the validated value |
| sparse array or array with extra own properties | hole becomes `null`, extras dropped |
| circular reference (root or nested) | stringify throws |
| root blank/whitespace-only string | unusable evidence (root-only rule) |
| root `undefined` / `null` | absent capture |

A value repeated in sibling branches (a DAG) is **not** a cycle and is accepted —
it serializes faithfully as a copy.

## FILES CHANGED

Two new files (the `repositories/` directory is new); **no existing file was
modified**, and no other file in the worktree changed.

- `src/server/features/search-growth/geo/repositories/GeoObservationRunRecorderRepository.ts`
  (233 lines) — the adapter, the JSON-safety validator, and the data-descriptor
  reader.
- `src/server/features/search-growth/geo/repositories/GeoObservationRunRecorderRepository.query.test.ts`
  (477 lines) — focused repository tests against the real accepted storage
  contract.

Round 3 changed only the raw-evidence validation path and its tests. The
`record` mapping, INSERT shape, append-only behavior, and error propagation are
identical to the revision the review already verified.

## DATABASE/MIGRATION CHANGES

None. No migration, schema, snapshot, enum, or domain-type file was added or
edited. The adapter reuses the accepted `geo_observation_runs` DDL
(`drizzle/0050_dusty_stardust.sql`) and its accepted Zod domain boundary
(`src/types/schemas/geo-observation-run.ts`).

## DEPENDENCIES CHANGED

None. `package.json` / `pnpm-lock.yaml` are untouched; no new package was added,
and no install command was run (`node_modules` was already present).

## TESTS ADDED

`GeoObservationRunRecorderRepository.query.test.ts` builds an in-memory SQLite
database from the actual forward migration DDL for `geo_observation_runs` (0050)
plus its market profile (0045), topic (0046) and prompt (0049) parents, with
`PRAGMA foreign_keys = ON`, and replaces `@/db` with that handle so the
production adapter code path runs unmodified. **36 tests** (round 2 had 31):

| # | Test | Round |
| --- | --- | --- |
| 1 | one fact → one row, every provenance field faithful; `raw_answer`/`usage_json` NULL; `created_at` from the DB default | 1 |
| 2 | root string raw response verbatim (leading/embedded whitespace kept) | 1 |
| 3 | nested JSON-safe raw response round-trips unchanged (nested objects/arrays, `null`, booleans, finite numbers, a shared sub-object, empty array/object) | 2 |
| 4 | **nested empty string preserved**: `{ optionalAnswer: "", … }` stores exactly `JSON.stringify(payload)` and parses back `toStrictEqual` | **3** |
| 5 | repeats (indices 0–2, distinct ids/request ids) persist as independent rows, no dedupe | 1 |
| 6 | a pre-existing run row is unchanged after a later `record` (append-only) | 1 |
| 7 | same-Project FK violation propagates, zero rows written | 1 |
| 8 | duplicate run id propagates, original row untouched | 1 |
| 9 | root blank/whitespace string still rejects (part of the root table below) | 1 |
| 10–21 | `it.each` **root** rejection: undefined, null, `""`, `"   "`, function, symbol, BigInt, `NaN`, `Infinity`, **`-0` (new)**, `Date`, `Map` — each with zero rows | 1/2/**3** |
| 22–35 | `it.each` **nested** rejection: undefined / function / symbol / BigInt / `NaN` property, `Infinity` array element, **`-0` property (new)**, `-Infinity` two levels deep, `Date` property, array of functions, non-enumerable property, **array with a symbol-keyed property (new)**, **accessor property (new)**, **accessor array element (new)** — each with zero rows | 2/**3** |
| 36 | circular raw responses (root and nested) rejected, zero rows written | 2 |
| — | sparse array (`["a", <hole>, "c"]`) rejected with zero rows written | 2 |

The round-2 case that asserted `{ answer: "" }` **rejects** was deleted: that
assertion encoded the invented content policy this round removes, and a test
asserting wrong behavior must not survive the fix.

Two test-local helpers keep the file inside the lint line budget without
suppressing a rule: `expectRawRejected(rawResponse)` (records expected-to-fail
evidence, asserts the error and zero rows) and `withAccessor(target, key)`
(defines an enumerable getter on a plain object/array). Both are test fixtures;
neither is production code.

## COMMANDS RUN

All commands run from the worktree root on Windows Git Bash via `corepack pnpm`,
each invoked independently. Exact exits:

| # | Command | Exit |
| --- | --- | --- |
| 1 | `corepack pnpm exec vitest run <4 focused files>` | 0 |
| 2 | `corepack pnpm exec prettier --write <2 task files>` | 0 |
| 3 | `corepack pnpm exec vitest run <4 focused files>` | 0 |
| 4 | `corepack pnpm format:check` | 0 |
| 5 | `corepack pnpm types:check` | 0 |
| 6 | `corepack pnpm lint` | **1** |
| 7 | `corepack pnpm exec prettier --write <2 task files>` | 0 |
| 8 | `corepack pnpm lint` | 0 |
| 9 | `corepack pnpm exec vitest run <4 focused files>` | 0 |
| 10 | `corepack pnpm types:check` | 0 |
| 11 | `corepack pnpm format:check` | 0 |
| 12 | `corepack pnpm test` | 0 |
| 13 | `corepack pnpm build` | 0 |
| 14 | `corepack pnpm ci:check` | 0 |
| 15 | `git status --short`, `git diff --stat`, `git ls-files --others --exclude-standard <dir>`, `git rev-parse HEAD`, `wc -l` | 0 |

Focused files: `src/server/features/search-growth/geo/repositories/GeoObservationRunRecorderRepository.query.test.ts`,
`src/db/geo-observation-run.test.ts`, `src/db/schema-parity.test.ts`,
`src/server/features/search-growth/geo/services/freshGeoSampling.test.ts`.

**Intermediate red run #6, fixed not bypassed.** The first `lint` after the
round-3 additions failed with one error:
`eslint(max-lines): File has too many lines (406). Maximum allowed is 400.` on
the test file (this repo counts non-blank, non-comment lines). Fixed by
extracting the two test-local helpers described above and collapsing the
multi-line `it.each` entry form — the tests, their assertions, and their count
are unchanged. No lint rule, config, or suppression was touched, no test was
deleted or weakened to fit, and the file was not split to dodge the rule.

Rows 1–5 were an intermediate revision; rows 7–14 are the final revision, and
`format:check`, `types:check`, `lint`, `test`, `build`, and `ci:check` all ran
on it.

## COMMAND RESULTS

- Focused (final, run #9): recorder `(36)`, `geo-observation-run.test.ts` `(12)`,
  `schema-parity.test.ts` `(369)`, `freshGeoSampling.test.ts` `(19)` →
  **4 files, 436 passed, 0 failed**.
- Full (final, run #12): **205 files, 1979 passed, 0 failed** (254.56s).
- `build` (final, run #13): vite client (3682 modules), SSR (5086 modules) and
  `open_seo_audit` (431 modules) environments built; `tsc --noEmit` clean.
- `ci:check` (final, run #14): prettier clean, knip clean, both `tsc` projects
  clean, oxlint clean (938 files), `plugin skill sync clean`. Not sandbox-denied.
- `format:check` (final, run #11): all files match Prettier style.
- Round-2 baseline: 431 focused / 1974 full → round 3 adds **5 focused tests**
  (31 → 36) and **5 full-suite tests**.

## RUNTIME EVIDENCE

Runtime evidence is the focused repository test executed against real SQL
storage, not a mock. Review reproductions now behave correctly:

- `{ optionalAnswer: "" }` (previously rejected) — **accepted**; stored text
  equals `JSON.stringify(payload)` and `JSON.parse(stored)` is `toStrictEqual`
  to the payload.
- `Object.assign([1], { [Symbol("s")]: 1 })` (previously accepted, symbol
  silently dropped) — **rejected**, zero rows.
- An enumerable getter property (previously validated through `Reflect.get`) —
  **rejected**, zero rows; an enumerable getter at an array index — **rejected**,
  zero rows.
- Root `-0` and nested `-0` (`{ usage: { cost: -0 } }`) — **rejected**, zero rows.
- Root `""` and `"   "` — still **rejected**, zero rows (root rule retained).

Retained round-1/round-2 evidence, all still green on this revision:

- one valid fact persisted as exactly one row with all fields round-tripping
  (`raw_response`, `web_search = 1`, `application_cache_bypassed = 1`,
  `status = SUCCEEDED`, `created_at` populated by the DB default);
- string raw evidence (`"  line one\n\ttabbed line  "`) stored byte-for-byte;
- a nested JSON-safe payload stored as `JSON.stringify(payload)`, reparsed
  `toStrictEqual` to the original (shared sub-object, nested `null`, empty
  array/object);
- three repeats of one batch stored as three independent rows with distinct
  `provider_request_id` values;
- an existing raw run row compared `toEqual` before and after a later recording;
- same-Project FK violation surfaces `FOREIGN KEY constraint failed`, duplicate
  id surfaces `UNIQUE constraint failed`, both with the expected row counts and
  the original row intact;
- non-finite numbers, `undefined`, functions, symbols, BigInts, `Date`, `Map`,
  non-enumerable properties, array-of-functions, sparse arrays, and root + nested
  cycles each reject with **zero rows written**;
- `schema-parity.test.ts` (369 tests) re-confirms `geo_observation_runs` is
  structurally identical across SQLite and Postgres, with no migration added.

No provider call, credential, account, Prompt Explorer/R2/application-cache
access, Cloudflare Workflow, scheduler, publishing, or paid action was invoked.

## KNOWN LIMITATIONS

- The adapter is not yet wired to a caller (no GEO sampling workflow/server
  function/service exists yet); it satisfies the T138 port contract and is
  exercised by the focused tests. Wiring is a later task by scope.
- Failure reasons are surfaced through Drizzle's wrapped error (driver message on
  `cause`), consistent with every other repository in the codebase; the adapter
  does not re-wrap or normalize them.
- The test uses a minimal `projects (id text PRIMARY KEY)` stub plus the real
  parent DDLs, matching the accepted T105 storage test's fixture approach.
- JSON-safety validation is a full O(tree) walk before the INSERT, so a very
  large raw payload is read twice (validate, then serialize). Raw captures are
  provider response bodies; this is a deliberate correctness-over-speed trade
  that keeps the stored text provably faithful.

## DEVIATIONS FROM TASK

- None. No bootstrap command was needed (`node_modules` was already present), so
  no command outside the APPROVED COMMANDS list was run.
- Round 3 is confined to the four boundary corrections the review named plus
  their focused tests. The INSERT mapping, append-only behavior, failure
  propagation, schema/migrations, sampling core, cache/provider behavior,
  workflow/retry policy, and every other scope bound are unchanged.
- No provider adapter, workflow, cache access, scheduling, batch failure/retry
  policy, parser/metrics/UI/CRUD/server function, migration, or schema/enum
  change was added.

## SECURITY NOTES

- No credentials, API keys, accounts, or provider calls; entirely in-process
  SQLite for tests.
- Opaque raw provider evidence is stored as captured and never parsed,
  interpreted, or logged; no new store was added. Validation inspects value
  types and property shape only — never business content — and now also refuses
  to execute user-supplied accessors during validation.
- Append-only write path only: no update/upsert/delete, no lifecycle transition,
  no parse-row writes, no modification of existing run rows.
- No Prompt Explorer/R2/application-cache access; no CAPTCHA/2FA, stealth,
  cookie upload, publishing, or production action.
- No secrets appear in files, commands, or logs.

## GIT STATUS/DIFF SUMMARY

HEAD: `b1e75de316a9d9c92d288c8ab36d6d74ef51427d` (base commit, unchanged — no
commit was made).

```
$ git status --short
?? control/tasks/T139-M2-GEO-OBSERVATION-RUN-RECORDER-REPOSITORY/DELIVERY.md
?? control/tasks/T139-M2-GEO-OBSERVATION-RUN-RECORDER-REPOSITORY/REVIEW.md
?? src/server/features/search-growth/geo/repositories/

$ git diff --stat      # empty: no tracked file modified
```

Untracked task source files (the `repositories/` directory is new):

```
src/server/features/search-growth/geo/repositories/GeoObservationRunRecorderRepository.ts             233 lines
src/server/features/search-growth/geo/repositories/GeoObservationRunRecorderRepository.query.test.ts  477 lines
```

`DELIVERY.md` and `REVIEW.md` are untracked control documents (this file was
rewritten for round 3; `REVIEW.md` was not edited). `dist/`, `node_modules/`,
and the `plugins/` skill-sync output are gitignored and unchanged.

## READY FOR REVIEW

Yes — all four round-3 boundary corrections are implemented at the root
(nested blank strings preserved, array symbol keys / accessors / `-0` rejected
before INSERT), the previously invented nested content policy is removed, the
focused and full suites are green on the final revision, `format:check` /
`types:check` / `lint` / `test` / `build` / `ci:check` all exit 0, and no
migration, dependency, provider, cache, workflow, or production behavior was
added. Only Codex may PASS this task.
