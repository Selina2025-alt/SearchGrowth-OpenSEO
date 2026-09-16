# DELIVERY — T147-M2-GEO-EXACT-ENTITY-MENTION-FACT-ASSEMBLER

ROUND: 1 of 3
BASE COMMIT: 9c434c9dfb19ec3e9558e9da639fe2909115564c
STATUS: READY FOR REVIEW (implementation complete; not self-accepted)

## IMPLEMENTATION SUMMARY

Added one narrow, storage-free assembler that binds accepted T146/T144 exact
detection spans to one concrete accepted T140 parse fact and emits T141
`GeoEntityMentionFact` drafts, each paired with the match it came from.

- **One function, one input type, one draft type**
  (`geoExactEntityMentionFactAssembler.ts`):
  `assembleExactEntityMentionFacts(input): GeoEntityMentionFactDraft[]`, where
  the input is `{ parse, projectId, mentionIds, matches }` and a draft is
  `{ fact: GeoEntityMentionFact; match: GeoExactEntityMentionMatch }`. The three
  fact/port/span types are the accepted T140/T141/T144 declarations, imported
  rather than re-declared, so the boundaries cannot drift.
- **Mapping is a passthrough, not an inference.** `fact.projectId`/`parseId`
  come from the concrete parse fact, `fact.entityId` and `fact.evidenceText`
  come verbatim from the match, `fact.id` is the caller-supplied mention id at
  the same index, `mentioned` is `true`, and `recommended`,
  `mentionPosition`, and `sentiment` are explicit `null`. No recommendation,
  rank, position, sentiment, entity ownership, or alias priority is derived.
- **Match basis preserved by identity.** Each draft's `match` is the caller's
  own `GeoExactEntityMentionMatch` object (`toBe`, not a copy), so the
  canonical-vs-alias `source` (§4) and the `start`/`end`/`evidence` span stay
  auditable. The `evidence` string is carried by reference only — it is never
  read, sliced, parsed, or inspected — and nothing is mutated, cloned,
  serialized, normalized, deduplicated, or re-ordered.
- **Cross-fact context validated atomically.** Checks run in a fixed order and
  the first failure throws `GeoExactEntityMentionFactAssemblyError`, so no
  partial batch can escape: (1) runtime shape — non-empty `projectId`,
  `parse.id`, `parse.projectId`, and array `mentionIds`/`matches`; (2) the
  supplied detection Project id must strictly equal the parse fact's
  `projectId`; (3) `mentionIds.length` must equal `matches.length`; (4) every
  mention id must be a non-empty string; (5) mention ids must be unique within
  the batch; (6) a `FAILED` parse is rejected. `SUCCESS` and `PARTIAL` parses
  both assemble — a partial parser result may still carry evidence.
- **Errors name the field and the index.** The error carries `field` (for a
  list element, `mentionIds[<index>]`) and `mentionIndex` (`null` for a
  call-level field), so an audit trail can attribute a rejection without
  re-parsing the message. The only uniqueness rule is the recorder's own
  primary-key rule on caller-supplied ids; identical or colliding matches are
  never de-duplicated or resolved to a winner.
- **Pure and storage-free by construction.** The module imports only Zod and
  the three accepted sibling type/function modules. It opens no database, calls
  no reader, matcher, recorder, or provider, selects no "current" parse
  (ADR-005), reads no raw observation/response text, writes nothing, and has no
  error handling that could convert a rejection into partial output.
- **No caller is wired up.** Bundle orchestration and mention persistence
  remain later tasks, so the module is consumed only by its own spec.

## FILES CHANGED

Both source files are new and untracked; no tracked file changed, and the only
other new path is this DELIVERY itself.

| Path | Change |
| --- | --- |
| `src/server/features/search-growth/geo/services/geoExactEntityMentionFactAssembler.ts` | New: assembler (input/draft contracts, error, validation, mapping) — 226 lines |
| `src/server/features/search-growth/geo/services/geoExactEntityMentionFactAssembler.test.ts` | New: 20 focused tests (7 assembly + 9 rejection + 4 source-boundary) — 406 lines |

Public surface of the new module:

```ts
type GeoEntityMentionFactDraft = {
  fact: GeoEntityMentionFact;
  match: GeoExactEntityMentionMatch;
};

type GeoExactEntityMentionFactAssemblyInput = {
  parse: GeoObservationParseFact;
  projectId: string;
  mentionIds: string[];
  matches: GeoExactEntityMentionMatch[];
};

class GeoExactEntityMentionFactAssemblyError extends Error {
  field: string;
  mentionIndex: number | null;
}

function assembleExactEntityMentionFacts(
  input: GeoExactEntityMentionFactAssemblyInput,
): GeoEntityMentionFactDraft[];
```

The emitted fact, field by field (the mapping contract under review):

| Fact field | Source |
| --- | --- |
| `id` | `mentionIds[index]`, verbatim |
| `projectId` | the concrete parse fact's `projectId` (validated equal to the detection's Project id) |
| `parseId` | the concrete parse fact's `id` |
| `entityId` | the match's `entityId`, verbatim |
| `mentioned` | literal `true` |
| `recommended` | literal `null` |
| `mentionPosition` | literal `null` |
| `sentiment` | literal `null` |
| `evidenceText` | the match's `evidence`, verbatim (same string value) |

Validation order and the exact rejection for each defect:

| # | Check | `field` | `mentionIndex` |
| --- | --- | --- | --- |
| 1 | `projectId` non-empty string | `projectId` | `null` |
| 1 | `parse.id` / `parse.projectId` non-empty string | `parse.id` / `parse.projectId` | `null` |
| 1 | `mentionIds` / `matches` are arrays | `mentionIds` / `matches` | `null` |
| 1 | input is an object at all | `input` | `null` |
| 2 | detection Project id `===` `parse.projectId` | `projectId` | `null` |
| 3 | `mentionIds.length === matches.length` | `mentionIds` | `null` |
| 4 | mention id is a non-empty string | `mentionIds[i]` | `i` |
| 5 | mention id unique in the batch | `mentionIds[i]` | `i` |
| 6 | `parse.parseStatus !== "FAILED"` | `parse.parseStatus` | `null` |

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or generated-file change: `git status
--short` lists only the two new source files, and `git diff --stat` is empty.
The assembler holds no database handle and imports no table or driver — storage
access remains exclusively the accepted T141 recorder's, which this module never
calls. No row is read, inserted, updated, or deleted by this task.

## DEPENDENCIES CHANGED

None. No `package.json` or lockfile change (`git diff --stat -- package.json
pnpm-lock.yaml` is empty). The only non-relative import is `zod`, which is an
existing runtime dependency used the same way as in the accepted T144 matcher.
The spec uses only already-installed tooling (`vitest`, `node:fs` for the static
source boundary). The bootstrap install ran with `--frozen-lockfile` and did not
change `pnpm-lock.yaml`.

## TESTS ADDED

`geoExactEntityMentionFactAssembler.test.ts` — 20 tests in three suites:
assembly (7), rejections (9), source boundary (4). The assembler is the real
implementation, never a mock; the only spy is on `JSON.stringify` to prove no
serialization, and the source-boundary suite reads the shipped file from disk.

### Assembly suite — 7 tests

| # | Invariant |
| --- | --- |
| 1 | Two matches produce two facts bound to `parse_1`/`proj_1`, with `mentioned: true`, `recommended`/`mentionPosition`/`sentiment` explicitly `null`, and `evidenceText` equal to each match's `evidence` |
| 2 | A `PARTIAL` parse (with `accuracyStatus: "PARTIAL"`) still assembles, bound to the concrete parse and carrying its evidence |
| 3 | An empty match list yields `[]` (a detection that matched nothing is valid) |
| 4 | Order and collisions preserved: matches given out of text order (start 12 before start 0), with two different candidates having matched the identical `[0,4]` span, come back in the caller's exact order with all three drafts — no sort, dedupe, or winner |
| 5 | Traceability: `draft.match` is the caller's own object (`toBe`), `draft.match.source` is the caller's own source object (`toBe`), `[start, end]` are `[5, 11]`, and `fact.evidenceText` equals the match's `evidence` |
| 6 | Opaque evidence `'{"answer":"Ａcme <b>#1</b>\\n\\t","note":"  😀  "}  '` is carried by identity and keeps its exact length (astral + escaped + untrimmed content) |
| 7 | Purity: both `draft.match` references are the input objects, `JSON.stringify` was never called, and `structuredClone(input)` deep-equals the input after the call |

### Rejection suite — 9 tests

| # | Invariant |
| --- | --- |
| 1 | Detection Project `proj_other` against a `proj_1` parse → `field: "projectId"`, `mentionIndex: null`, message names both Projects |
| 2 | Parsed fact with `id: ""` → `field: "parse.id"` |
| 3 | `mentionIds: ["mention_1", ""]` → `field: "mentionIds[1]"`, `mentionIndex: 1` |
| 4 | Runtime `mentionIds: [42]` → `field: "mentionIds[0]"`, `mentionIndex: 0` |
| 5 | Cardinality both ways (1 id / 2 matches and 2 ids / 1 match) → `field: "mentionIds"`, message carries the counts |
| 6 | `["mention_1","mention_2","mention_1"]` → `field: "mentionIds[2]"`, `mentionIndex: 2`, naming the reused id — the whole batch is rejected, so the later primary-key failure never happens after a partial write |
| 7 | `parseStatus: "FAILED"` → `field: "parse.parseStatus"`, `mentionIndex: null` |
| 8 | Runtime `matches: "Acme"` (not a list) → `field: "matches"` |
| 9 | Runtime `null` input → `field: "input"` |

Every rejection is observed through a `captureAssemblyError` helper that fails
the test if the call returns normally, which is the atomicity evidence: a
rejected call has no drafts to inspect.

### Source boundary suite — 4 tests

Comments are stripped before the call-shape assertions, so prose that names an
API cannot be mistaken for an invocation of it.

| # | Invariant |
| --- | --- |
| 1 | Imports only `./geoObservationParseRecorder`, `./geoEntityMentionRecorder`, `./geoExactEntityMentionMatcher`, and `zod`; no `@/db`, `drizzle`, `Repository`, `node:fs`, or `process.env` import, and no `fetch(`, `process.env`, `node:fs`, `JSON.stringify`, or `console.` in the source |
| 2 | No `listCandidates(`, `matchExactEntityMentions(`, `detectExactEntityMentions(`, or `.record(` invocation — no reader, matcher, or recorder call |
| 3 | No `.sort(`, `.toSorted(`, `.reverse(`, `.filter(`, `.reduce(`, `new Set(`, `toLowerCase`, `toUpperCase`, `.trim(`, or `.normalize(` — nothing is reordered, rewritten, or de-duplicated |
| 4 | No `try`/`catch` — no failure is swallowed |

## COMMANDS RUN

Bootstrap was required: `node_modules` was absent in this worktree. Each command
was invoked on its own line, not wrapped in a chained shell operation. Read-only
git usage: `git status --short`, `git diff --stat`, `git diff --stat --
package.json pnpm-lock.yaml`, `git rev-parse HEAD`, `git ls-files --others
--exclude-standard`.

| # | Command | Exit |
| --- | --- | --- |
| 1 | `corepack pnpm install --frozen-lockfile` | 0 |
| 2 | `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoExactEntityMentionFactAssembler.ts src/server/features/search-growth/geo/services/geoExactEntityMentionFactAssembler.test.ts` | 0 |
| 3 | `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoExactEntityMentionFactAssembler.test.ts` (first run) | 0 |
| 4 | `corepack pnpm format:check` | 0 |
| 5 | `corepack pnpm types:check` | 0 |
| 6 | `corepack pnpm lint` (first run — 1 error, see COMMAND RESULTS) | 1 |
| 7 | `corepack pnpm lint` (final, after the fix) | 0 |
| 8 | `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoExactEntityMentionFactAssembler.test.ts` (final, after the fix) | 0 |
| 9 | `corepack pnpm test` | 0 |
| 10 | `corepack pnpm build` | 0 |
| 11 | `corepack pnpm ci:check` | 0 |

## COMMAND RESULTS

- **1 — install:** `Done in 1m 1.5s using pnpm v10.30.1`. No lockfile mutation
  (`git diff --stat -- package.json pnpm-lock.yaml` empty). The usual ignored
  build-script warnings for native packages were printed (pre-existing,
  unrelated).
- **2 — prettier --write:** the assembler was already conformant (`unchanged`);
  the spec was reformatted once (exit 0).
- **3 — focused test (first run):** `Test Files 1 passed (1)`,
  `Tests 20 passed (20)`, 18ms.
- **4 — format:check:** `All matched files use Prettier code style!`
  (An initial attempt to run this wrapped in a pipe plus an exit-code echo was
  sandbox-denied; the plain, unwrapped command — which is what the TASK requires
  anyway — was run instead and passed. Nothing was bypassed, and every other
  command below ran unwrapped on the first attempt.)
- **5 — types:check:** `tsc --noEmit` produced no output (clean).
- **6 — lint (first run):** exit 1, exactly one error, in the spec:
  `typescript-eslint(no-unsafe-type-assertion)` at the `null as unknown as
  GeoExactEntityMentionFactAssemblyInput` argument in the "rejects a non-input at
  the call boundary" test. The `oxlint-disable-next-line` justification comment
  sat one line above the call rather than immediately above the assertion, so it
  did not apply. The comment was moved onto the assertion line — no assertion
  was weakened or removed — and the spec re-run (command 8) stayed green.
- **7 — lint (final):** `Found 0 warnings and 0 errors. Finished in 20.5s on 961
  files using 16 threads.`
- **8 — focused test (final):** `Test Files 1 passed (1)`,
  `Tests 20 passed (20)`, 17ms.
- **9 — full test:** `Test Files 215 passed (215)`, `Tests 2189 passed (2189)`,
  duration 121.21s. The new spec appears in the run
  (`geoExactEntityMentionFactAssembler.test.ts (20 tests)`) alongside the
  accepted GEO suites (`geoExactEntityMentionDetection.test.ts` 11,
  `geoExactEntityMentionMatcher.test.ts` 12,
  `geoExactEntityMentionMatcher.rejection.test.ts` 21,
  `geoParseOutputBundle.test.ts` 8, `freshGeoSampling.test.ts` 19,
  `GeoEntityMentionRecorderRepository.query.test.ts` 38,
  `GeoObservationParseRecorderRepository.query.test.ts` 31,
  `GeoExactEntityMentionCandidateReaderRepository.query.test.ts` 23,
  `…boundary.test.ts` 5, `geo-entity-mention.test.ts` 16,
  `geo-observation-parse.test.ts` 11). No failures and no skips; only
  pre-existing stderr/stdout diagnostics (OAuth, DataForSEO, scheduler, MCP
  instrumentation) were emitted. T146's recorded baseline was 214 files / 2,169
  tests, so the delta is exactly the 1 new file and 20 new tests.
- **10 — build:** client (`✓ 3682 modules transformed`, `✓ built in 25.84s`),
  SSR (`✓ 5086 modules transformed`, `✓ built in 35.35s`) and `open_seo_audit`
  (`✓ 431 modules transformed`, `✓ built in 4.66s`) all built, and the appended
  `tsc --noEmit` re-ran clean. Only the pre-existing >500 kB chunk-size advisory
  was printed.
- **11 — ci:check:** ran Prettier (`All matched files use Prettier code style!`),
  knip (silent = clean), `tsc --noEmit`, `tsc --noEmit -p
  badseo/tsconfig.json`, `oxlint . --type-aware` (`Found 0 warnings and 0
  errors. Finished in 11.3s on 961 files using 16 threads`), and the
  plugin-skill sync check; final line `plugin skill sync clean:
  plugins/openseo/skills`. Exit 0. No aggregate gate was sandbox-denied, so
  nothing was skipped and no bypass was needed. `knip` reported no unused file
  or export, so the new module and every one of its exports are reachable
  through the spec.

## RUNTIME EVIDENCE

No runtime, provider, network, database, or production invocation was performed
and none is possible from this module. The evidence is the focused spec
exercising the shipped assembler directly; nothing below is inferred from
reading the code alone.

- **Mapping evidence:** test 1 asserts the full fact objects with `toEqual` —
  `{ id: "mention_1", projectId: "proj_1", parseId: "parse_1", entityId:
  "ent_1", mentioned: true, recommended: null, mentionPosition: null, sentiment:
  null, evidenceText: "Acme" }` and its `ent_2`/`Globex` sibling — proving the
  parse binding, the verbatim `entityId`/`evidenceText`, and the three explicit
  nulls. Test 2 shows the same mapping for a `PARTIAL` parse.
- **Error evidence:** rejection tests 1–9 assert the `field` string and the
  `mentionIndex` for cross-Project, empty parse id, empty/duplicate/non-string
  mention id, both cardinality directions, `FAILED` parse, non-array `matches`,
  and a `null` input. Each is captured through a helper that fails the test if
  the call returned, which is the atomicity evidence: a rejected call yields no
  drafts at all.
- **Evidence-preservation evidence:** test 4 asserts the exact `[id, entityId,
  start, source.kind]` sequence for an out-of-order, colliding input, so the
  caller's order and every collision survive; test 5 asserts `draft.match`,
  `draft.match.source`, and `draft.fact.evidenceText` are the caller's objects
  and value; test 6 asserts a payload with astral, escaped, and untrimmed
  characters round-trips unchanged; test 7 asserts no mutation (deep clone equal)
  and no `JSON.stringify`.
- **Boundary evidence:** boundary tests 1–4 statically prove the shipped source
  imports only the three accepted contracts plus Zod, calls no reader, matcher,
  recorder, or provider, performs no sort/reverse/filter/reduce/Set/case/trim/
  normalize call, and has no `try`/`catch`.
- **Full-suite regression evidence:** command 9 — 215 files / 2,189 tests
  passed; command 11 — the aggregate gate, including knip, both type checks, and
  type-aware lint, exited 0.

## KNOWN LIMITATIONS

- The assembler maps a positional alignment: `mentionIds[index]` becomes the id
  of the fact built from `matches[index]`. That is the contract the TASK
  specifies; the module does not try to infer a better pairing, and a caller that
  supplies ids in a different order gets facts with those ids — nothing is
  reordered to compensate. This is deliberate, since reordering would be a
  business rule this boundary must not invent.
- The parse fact's `parseStatus` is read only to reject `FAILED`. A runtime
  status that is neither `SUCCESS`, `PARTIAL`, nor `FAILED` would not be rejected
  here. Validating the enum would add a rule beyond the TASK's list (and
  `parseStatus` is never copied onto an emitted fact), so it is left to the
  accepted T140 boundary. Flagged for review.
- The fact's `evidenceText` is the match's `evidence` span, which is what the
  TASK specifies. §7's `evidence_span_ref?` (a reference to the parse's own
  evidence payload) is not produced, because no such artifact exists yet and
  producing one would require reading raw evidence.
- The `PARTIAL` parse is accepted purely on `parseStatus`; whether a partial
  parser result actually carries usable evidence is the caller's/parser's
  concern, not something this module inspects.
- Nothing calls the assembler yet, so it has no production call site: bundle
  orchestration and mention persistence are later tasks. Knip sees it through its
  spec.
- The full-suite durations and the >500 kB chunk advisory are pre-existing and
  unrelated.

## DEVIATIONS FROM TASK

None. All scope boundaries in the TASK were honored: no schema, migration,
snapshot, or dependency change; no matching/reader invocation, parser execution,
bundle orchestration, mention persistence, provider/cache, UI, CRUD/server
function, credentials, publishing, paid action, or production behavior. No
APPROVED command was wrapped in a chained shell operation and no unapproved pnpm
script was used; the only extra commands were the read-only git ones the TASK
permits. The bootstrap install was required because `node_modules` was absent in
this worktree (explicitly allowed) and did not change the lockfile. Three
implementation choices are worth flagging for review:

1. Validation is split between one Zod schema for the caller-level scalars
   (`projectId`, `parse.id`, `parse.projectId`) and the two lists, and explicit
   per-element checks thereafter (mention ids, uniqueness, cardinality, status).
   The Zod object is parsed from a copy, so the caller's parse fact is never
   cloned or rebuilt — only its two identity fields are read, and the parsed
   scalars are the values written to the facts.
2. Duplicate detection uses `mentionIds.indexOf(id) !== index` rather than a
   `Set`/`Map`, so the first duplicate's index is reported with no extra
   collection and no reordering. Mention counts are one per matched entity, so
   the quadratic worst case is not a practical concern.
3. The rejection order is shape → cross-Project → cardinality → per-id →
   uniqueness → status, following the TASK's own enumeration. Every check still
   runs before any draft is built, so order affects only which of several
   simultaneous defects is reported first.

## SECURITY NOTES

- No credential, account, provider, paid action, publishing, Prompt Explorer,
  R2/application-cache, CAPTCHA/2FA, stealth, or cookie access; no network call,
  no database access, and no production or external system contact. The spec
  runs entirely in process with plain objects.
- The assembler is storage-free: it opens no database and calls no repository,
  recorder, or provider. Persistence stays with the accepted T141 recorder,
  which this module never invokes.
- Fail-closed and atomic: the first invalid fact-level input throws before any
  draft exists, so a cross-Project or colliding batch cannot reach a recorder in
  part. There is no `try`/`catch` and no empty-result fallback.
- Caller-supplied mention ids are validated as non-empty, unique strings before
  they become primary keys, so a duplicate id cannot fail late (after part of a
  batch was stored) or overwrite an earlier mention.
- Opaque evidence is copied by reference and never read, sliced, logged,
  serialized, normalized, or interpreted; no raw provider/observation payload is
  touched.
- No scope change, no edit to `29_SCOPE_LOCK.md`, no Accepted-ADR edit, no
  acceptance-criteria weakening, no dependency addition, no
  `--dangerously-skip-permissions`, no commit, no merge, no push, and no
  production publishing. `main` and `integration/ai-v1` were not touched.
  `REVIEW.md` was neither created nor edited.

## GIT STATUS/DIFF SUMMARY

`git rev-parse HEAD` → `9c434c9dfb19ec3e9558e9da639fe2909115564c`
(`chore(control): dispatch T147 round 1`).

`git diff --stat` → empty (no tracked file modified). `git diff --stat --
package.json pnpm-lock.yaml` → empty.

`git status --short` before this DELIVERY was written:

```text
?? src/server/features/search-growth/geo/services/geoExactEntityMentionFactAssembler.test.ts
?? src/server/features/search-growth/geo/services/geoExactEntityMentionFactAssembler.ts
```

with this DELIVERY added as the third untracked path at
`control/tasks/T147-M2-GEO-EXACT-ENTITY-MENTION-FACT-ASSEMBLER/DELIVERY.md`. No
build output (`dist/`), cache, migration, snapshot, or generated file appears in
the status.

## READY FOR REVIEW

Implementation, 20 focused tests, the full suite (215 files / 2,189 tests), and
the five required gates plus the aggregate `ci:check` are complete on this final
code. The worktree contains only the two new task-scoped source files plus this
DELIVERY. Awaiting Codex review; no PASS is claimed here.
