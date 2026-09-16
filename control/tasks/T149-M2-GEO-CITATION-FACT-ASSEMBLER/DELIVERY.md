# DELIVERY — T149-M2-GEO-CITATION-FACT-ASSEMBLER

ROUND: 1 of 3
BASE COMMIT: e22a822d5b5f8029501db41d1f5e6bb0b8676465
STATUS: READY FOR REVIEW (implementation complete; not self-accepted)

## TASK ID

T149-M2-GEO-CITATION-FACT-ASSEMBLER

## IMPLEMENTATION SUMMARY

Added one narrow, storage-free assembler that binds an ordered list of
caller-supplied citation evidence candidates to one concrete accepted T140 parse
fact and emits T142 `GeoCitationFact` drafts, each paired with the candidate it
came from by identity.

- **One function, one input type, one draft type**
  (`geoCitationFactAssembler.ts`): `assembleCitationFacts(input):
  GeoCitationFactDraft[]`, where the input is `{ parse, projectId, citationIds,
  candidates }` and a draft is `{ fact: GeoCitationFact; candidate:
  GeoCitationEvidenceCandidate }`. The fact type and the
  `CitationSourceOwnership` enum are the accepted T142/`geo-citation`
  declarations, imported rather than re-declared, so the boundaries cannot
  drift.
- **The candidate is the recordable T142 leaf contract.** The new
  `GeoCitationEvidenceCandidate` carries exactly the seven caller-extracted
  values the recorder persists: `rawUrl`, `normalizedUrl`, `domain`, `title`,
  `position`, `sourceOwnership`, `matchedPublicationReceiptId`. It is a pure
  evidence type: no project, parse, or citation id — those come from the inputs.
- **Mapping is a passthrough, not an inference.** `fact.projectId`/`parseId`
  come from the concrete parse fact, `fact.id` is the caller-supplied citation
  id at the same index, and every citation leaf is copied verbatim from the
  aligned candidate. No URL is parsed or normalized, no domain is derived, no
  ownership is classified, and no receipt is matched.
- **Opaque URL/domain evidence is preserved by identity.** Each draft's
  `candidate` is the caller's own object (`toBe`, not a copy), and the leaf
  strings are the caller's own values. Nothing is parsed, normalized, trimmed,
  lower-cased, serialized, cloned, rewritten, deduplicated, sorted, ranked,
  inferred, or semantically URL/domain-equivalence-checked. The caller's arrays,
  parse, and candidates are never mutated.
- **Cross-fact context validated atomically.** Checks run in a fixed order and
  the first failure throws `GeoCitationFactAssemblyError`, so no partial batch
  can escape: (1) runtime shape — non-empty `projectId`, `parse.id`,
  `parse.projectId`, and array `citationIds`/`candidates`; (2) the extraction
  Project id must strictly equal the parse fact's `projectId`; (3)
  `citationIds.length` must equal `candidates.length`; (4) every citation id
  must be a non-empty string; (5) citation ids must be unique within the batch;
  (6) a `FAILED` parse is rejected; (7) every candidate must satisfy the
  recordable leaf contract. `SUCCESS` and `PARTIAL` parses both assemble.
- **Errors name the field and the index.** The error carries `field` (for a list
  element, `citationIds[<index>]` or `candidates[<index>].<field>`) and
  `citationIndex` (`null` for a call-level field), so an audit trail can
  attribute a rejection without re-parsing the message. The only uniqueness rule
  is the recorder's own primary-key rule on caller-supplied ids; identical or
  colliding citations are never de-duplicated or resolved to a winner.
- **Pure and storage-free by construction.** The module imports only Zod, the
  accepted `@/types/schemas/geo-citation` enum, and two sibling type modules. It
  opens no database, calls no repository, recorder, reader, extractor, or
  provider, selects no "current" parse (ADR-005), reads no raw
  observation/response text, writes nothing, and has no error handling that
  could convert a rejection into partial output.
- **No caller is wired up.** Citation extraction, URL identity, receipt
  matching, and persistence remain later tasks, so the module is consumed only
  by its own spec.

## FILES CHANGED

Both source files are new and untracked; no tracked file changed, and the only
other new path is this DELIVERY itself.

| Path | Change |
| --- | --- |
| `src/server/features/search-growth/geo/services/geoCitationFactAssembler.ts` | New: assembler (candidate/draft/input contracts, error, validation, mapping) — 310 lines |
| `src/server/features/search-growth/geo/services/geoCitationFactAssembler.test.ts` | New: 23 focused tests (8 assembly + 11 rejection + 4 source-boundary) — 487 lines |

Public surface of the new module:

```ts
type GeoCitationEvidenceCandidate = {
  rawUrl: string;
  normalizedUrl: string;
  domain: string;
  title: string | null;
  position: number | null;
  sourceOwnership: CitationSourceOwnership;
  matchedPublicationReceiptId: string | null;
};

type GeoCitationFactDraft = {
  fact: GeoCitationFact;
  candidate: GeoCitationEvidenceCandidate;
};

type GeoCitationFactAssemblyInput = {
  parse: GeoObservationParseFact;
  projectId: string;
  citationIds: string[];
  candidates: GeoCitationEvidenceCandidate[];
};

class GeoCitationFactAssemblyError extends Error {
  field: string;
  citationIndex: number | null;
}

function assembleCitationFacts(
  input: GeoCitationFactAssemblyInput,
): GeoCitationFactDraft[];
```

The emitted fact, field by field (the mapping contract under review):

| Fact field | Source |
| --- | --- |
| `id` | `citationIds[index]`, verbatim |
| `projectId` | the concrete parse fact's `projectId` (validated equal to the extraction's Project id) |
| `parseId` | the concrete parse fact's `id` |
| `rawUrl` | the candidate's `rawUrl`, verbatim (opaque, never normalized) |
| `normalizedUrl` | the candidate's `normalizedUrl`, verbatim (caller-supplied identity, not derived) |
| `domain` | the candidate's `domain`, verbatim (never re-derived from the URL) |
| `title` | the candidate's `title`, verbatim (`null` preserved) |
| `position` | the candidate's `position`, verbatim (`null`/`0` preserved) |
| `sourceOwnership` | the candidate's `sourceOwnership`, verbatim (never classified or defaulted) |
| `matchedPublicationReceiptId` | the candidate's `matchedPublicationReceiptId`, verbatim (`null` preserved, never matched) |

Validation order and the exact rejection for each defect:

| # | Check | `field` | `citationIndex` |
| --- | --- | --- | --- |
| 1 | input is an object at all | `input` | `null` |
| 1 | `projectId` non-empty string | `projectId` | `null` |
| 1 | `parse.id` / `parse.projectId` non-empty string | `parse.id` / `parse.projectId` | `null` |
| 1 | `citationIds` / `candidates` are arrays | `citationIds` / `candidates` | `null` |
| 2 | extraction Project id `===` `parse.projectId` | `projectId` | `null` |
| 3 | `citationIds.length === candidates.length` | `citationIds` | `null` |
| 4 | citation id is a non-empty string | `citationIds[i]` | `i` |
| 5 | citation id unique in the batch | `citationIds[i]` | `i` |
| 6 | `parse.parseStatus !== "FAILED"` | `parse.parseStatus` | `null` |
| 7 | candidate leaf contract (non-empty `rawUrl`/`normalizedUrl`/`domain`; `title` string-or-null; `position` non-negative integer-or-null; accepted `sourceOwnership`; `matchedPublicationReceiptId` non-empty string-or-null) | `candidates[i].<field>` | `i` |

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or generated-file change: `git status
--short` lists only the two new source files, and `git diff --stat` is empty.
The assembler holds no database handle and imports no table or driver — storage
access remains exclusively the accepted T142 recorder's, which this module never
calls. No row is read, inserted, updated, or deleted by this task.

## DEPENDENCIES CHANGED

None. No `package.json` or lockfile change (`git diff --stat -- package.json
pnpm-lock.yaml` is empty). The only non-relative imports are `zod` (existing
runtime dependency, used the same way as the accepted T144 matcher/T147
assembler) and the accepted `@/types/schemas/geo-citation` domain enum. The spec
uses only already-installed tooling (`vitest`, `node:fs` for the static source
boundary). The bootstrap install ran with `--frozen-lockfile` and did not change
`pnpm-lock.yaml`.

## TESTS ADDED

`geoCitationFactAssembler.test.ts` — 23 tests in three suites: assembly (8),
rejections (11), source boundary (4). The assembler is the real implementation,
never a mock; the only spy is on `JSON.stringify` to prove no serialization, and
the source-boundary suite reads the shipped file from disk.

Coverage of the TASK §4 list:

| Required invariant (TASK §4) | Test(s) |
| --- | --- |
| Successful ordered construction and identity | Assembly 1 |
| Zero citations | Assembly 4 |
| Explicit null optionals | Assembly 1, 3 |
| Same-project success | Assembly 1, 5 (SUCCESS + PARTIAL) |
| Cross-project rejection | Rejection 1 |
| Duplicate / malformed id | Rejection 3, 5 |
| Cardinality mismatch | Rejection 4 |
| Malformed candidate fields | Rejection 7 (7 leaf cases) |
| Invalid ownership | Rejection 8 (5 values) |
| Negative / fractional position | Rejection 9 (2 values) |
| FAILED parse | Rejection 6 |
| Candidate/input non-mutation | Assembly 8 |
| No partial output | Rejection 10 |
| Opaque URL never normalized/changed | Assembly 7 + boundary 3 |
| Source boundary (no DB/repo/recorder/provider/network/raw-observation or URL/ownership/receipt logic) | Boundary 1–4 |

### Assembly suite — 8 tests

| # | Invariant |
| --- | --- |
| 1 | Two candidates produce two facts bound to `parse_1`/`proj_1` in the caller's order, with the caller's ids and every leaf verbatim; each `draft.candidate` is the caller's own object (`toBe`) |
| 2 | A real title, `position: 0`, `OWNED_DOMAIN`, and a matched receipt id round-trip verbatim (nothing rounded, classified, or substituted) |
| 3 | Explicit `null` title/position/receipt leaves stay `null` |
| 4 | An empty citation-id/candidate pair yields `[]` |
| 5 | A `PARTIAL` parse (with `accuracyStatus: "PARTIAL"`) still assembles, bound to the concrete parse and carrying its evidence |
| 6 | Order and collisions preserved: two candidates citing the identical URL under the same domain come back in the caller's exact order with all three drafts — no sort, dedupe, or winner |
| 7 | Opaque URL evidence `"  HTTPS://Exämple.COM:443/Path/?utm_source=ChatGPT&q=😀#Frag  "` (mixed case, default port, trailing slash, query, fragment, IDN, astral, untrimmed) plus a deliberately non-URL `normalizedUrl` and mixed-case `domain` all survive byte-for-byte |
| 8 | Purity: both `draft.candidate` references are the input objects, `JSON.stringify` was never called, and `structuredClone(input)` deep-equals the input after the call |

### Rejection suite — 11 tests

| # | Invariant |
| --- | --- |
| 1 | Extraction Project `proj_other` against a `proj_1` parse → `field: "projectId"`, `citationIndex: null`, message names both Projects |
| 2 | Parsed fact with `id: ""` → `field: "parse.id"` |
| 3 | `citationIds: ["cite_1", ""]` and runtime `[42]` → `citationIds[1]` / `citationIds[0]` with the matching index |
| 4 | Cardinality both ways (1 id / 2 candidates and 2 ids / 1 candidate) → `field: "citationIds"`, message carries the counts |
| 5 | `["cite_1","cite_2","cite_1"]` → `field: "citationIds[2]"`, `citationIndex: 2`, naming the reused id — the whole batch is rejected, so the later primary-key failure never happens after a partial write |
| 6 | `parseStatus: "FAILED"` → `field: "parse.parseStatus"`, `citationIndex: null` |
| 7 | Leaf contract, 7 cases, each naming `candidates[0].<field>`: `rawUrl: 42`, empty `normalizedUrl`, empty `domain`, `title: 7`, absent `title`, empty `matchedPublicationReceiptId`, absent `matchedPublicationReceiptId` (absent ≠ null) |
| 8 | Ownership outside the accepted set (`PARTNER`, `owned_domain`, `""`, `null`, `1`) → `candidates[0].sourceOwnership` |
| 9 | `position: -1` and `position: 1.5` → `candidates[0].position` (nothing clamped or rounded) |
| 10 | A valid first candidate plus an invalid second → the call throws at `candidates[1].rawUrl` with no drafts returned (atomicity) |
| 11 | Runtime `candidates: "https://x"` → `field: "candidates"`; runtime `null` input → `field: "input"` |

Every rejection is observed through a `rejectWith` helper that fails the test if
the call returns normally, which is the atomicity evidence: a rejected call has
no drafts to inspect.

### Source boundary suite — 4 tests

Comments are stripped before the call-shape assertions, so prose that names an
API cannot be mistaken for an invocation of it.

| # | Invariant |
| --- | --- |
| 1 | Imports only `./geoCitationRecorder`, `./geoObservationParseRecorder`, `@/types/schemas/geo-citation`, and `zod`; no `@/db`, `drizzle`, `Repository`, `node:fs`, or `process.env` import, and no `fetch(`, `process.env`, `node:fs`, `JSON.stringify`, or `console.` in the source |
| 2 | No `.record(`, `listCandidates(`, `extractCitations(`, `detectExactEntityMentions(`, `matchExactEntityMentions(`, `readFileSync(`, `.query(`, or `.insert(` invocation, and no `rawObservation`/`rawResponse`/`geoObservationRun`/`promptRun`/`providerResponse` reference — no repository, recorder, reader, extractor, provider, or raw observation |
| 3 | No `new URL(`, `URL.parse`, `.normalize(`, `toLowerCase`, `toUpperCase`, `.trim(`, `punycode`, `decodeURI`, `encodeURI` — nothing is URL/domain-normalized; and no ownership literal (`OWNED_DOMAIN`/`CONTROLLED_PUBLICATION`/`EARNED_THIRD_PARTY`/`COMPETITOR`) or `sourceOwnership ===` / `matchedPublicationReceiptId ===` comparison — no ownership classification or receipt matching |
| 4 | No `.sort(`, `.toSorted(`, `.reverse(`, `.filter(`, `.reduce(`, `new Set(` — nothing is reordered, rewritten, or de-duplicated; and no `try`/`catch` — no failure is swallowed |

## COMMANDS RUN

Bootstrap was required: `node_modules` was absent in this worktree. Each command
was invoked on its own line, not wrapped in a chained shell operation. Read-only
git usage: `git status --short`, `git diff --stat`, `git diff --stat --
package.json pnpm-lock.yaml`, `git rev-parse HEAD`, `git log --oneline`,
`git show --stat`, `git ls-files --others --exclude-standard`.

| # | Command | Exit |
| --- | --- | --- |
| 1 | `corepack pnpm install --frozen-lockfile` | 0 |
| 2 | `corepack pnpm exec prettier --write src/.../geoCitationFactAssembler.ts src/.../geoCitationFactAssembler.test.ts` | 0 |
| 3 | `corepack pnpm exec vitest run src/.../geoCitationFactAssembler.test.ts` (first run — 2 failures, see COMMAND RESULTS) | 1 |
| 4 | `corepack pnpm exec prettier --write <both files>` (after the source fix) | 0 |
| 5 | `corepack pnpm exec vitest run src/.../geoCitationFactAssembler.test.ts` | 0 |
| 6 | `corepack pnpm format:check` | 1 |
| 7 | `corepack pnpm types:check` | 0 |
| 8 | `corepack pnpm lint` (first run — 1 `max-lines` error, see COMMAND RESULTS) | 1 |
| 9 | `corepack pnpm exec prettier --write <both files>` (after the spec rewrite) | 0 |
| 10 | `corepack pnpm exec vitest run src/.../geoCitationFactAssembler.test.ts` | 0 |
| 11 | `corepack pnpm lint` (second run — still 1 line over) | 1 |
| 12 | `corepack pnpm exec prettier --write src/.../geoCitationFactAssembler.test.ts` (after the trims) | 0 |
| 13 | `corepack pnpm lint` (final) | 0 |
| 14 | `corepack pnpm exec vitest run src/.../geoCitationFactAssembler.test.ts` (final) | 0 |
| 15 | `corepack pnpm types:check` (final) | 0 |
| 16 | `corepack pnpm test` | 0 |
| 17 | `corepack pnpm build` | 0 |
| 18 | `corepack pnpm ci:check` | 1 |

## COMMAND RESULTS

- **1 — install:** `Done in 55.4s using pnpm v10.30.1`, 980 packages linked. No
  lockfile mutation (`git diff --stat -- package.json pnpm-lock.yaml` empty). The
  usual ignored build-script warnings for native packages were printed
  (pre-existing, unrelated).
- **2 — prettier --write:** the assembler was already conformant (`unchanged`);
  the spec was reformatted once (exit 0).
- **3 — focused test (first run):** exit 1, 2 of 26 failed, and both failures
  were correct catches by the new spec:
  1. the `FAILED`-parse test failed because the status check read the
     Zod-parsed context copy, which carries only `id`/`projectId` and therefore
     strips `parseStatus`. Fixed by reading the caller's own object
     (`input.parse.parseStatus`), which is where the fact's status actually
     lives; and
  2. the source-boundary "reorders/rewrites/de-duplicates nothing" test caught
     `.filter(` in the error-path helper — the helper now builds the field name
     without it. No assertion was weakened.
- **4 — prettier --write (after the source fix):** both files `unchanged`.
- **5 — focused test:** `Test Files 1 passed (1)`, `Tests 26 passed (26)`.
- **6 — format:check:** **exit 1, and this is a pre-existing condition that is
  not part of this task.** `prettier --check .` reported exactly two files:
  `control/ACCEPTANCE_LEDGER.md` and `control/PROJECT_STATE.md`. Both are tracked
  and **unmodified by this task** (`git status --short` lists only the two new
  source files; `git diff --stat` is empty). `.prettierignore` excludes
  `control/tasks/` but not these two `control/` root files. `git show` proves the
  drift was introduced by the Controller's own T149 commits: `1edd5e7`
  (`chore(search-growth): plan T149 citation fact assembly`) appended a trailing
  blank line to `control/ACCEPTANCE_LEDGER.md` and removed/changed the ending of
  `control/PROJECT_STATE.md`, and `e22a822` (`chore(search-growth): dispatch T149
  round 1`) appended a further trailing blank line to `control/PROJECT_STATE.md`.
  Both files now end with more than one trailing newline, which is what Prettier
  rejects. Prettier is clean on every task file, and the T148 delivery recorded
  `format:check` exit 0, so this regression postdates the accepted baseline. It
  is not fixed here because these are Controller-owned control-plane artifacts
  and editing them is outside this task's scope (see DEVIATIONS FROM TASK).
- **7 — types:check:** `tsc --noEmit` produced no output (clean).
- **8 — lint (first run):** exit 1, exactly one error, in the spec:
  `eslint(max-lines)` — 451 counted lines against the configured 400
  (`skipBlankLines`/`skipComments` are on). The spec was rewritten to remove
  repetition: a `rejectWith(input, field, index)` helper replaced the repeated
  capture/assert blocks, and the leaf-contract, ownership, and id cases use
  compact tables. Coverage was preserved (every TASK §4 invariant still has a
  test); only duplicated assertion boilerplate was removed.
- **9/10 — prettier + focused test after the rewrite:** exit 0; `Test Files 1
  passed (1)`, `Tests 23 passed (23)`. The count dropped from 26 to 23 because
  merged cases became assertions inside a single test, not because coverage was
  dropped.
- **11 — lint (second run):** exit 1 again, `eslint(max-lines)` — 401 counted
  lines, one over. Two genuinely redundant constructions were trimmed (a
  `toHaveLength` that duplicated a byte-exact `toBe`, and two
  position-rejection calls folded into one loop). No assertion lost.
- **12/13 — prettier + lint (final):** prettier `unchanged`; lint `Found 0
  warnings and 0 errors. Finished in 16.1s on 965 files using 16 threads.`
- **14 — focused test (final):** `Test Files 1 passed (1)`,
  `Tests 23 passed (23)`, 20ms.
- **15 — types:check (final):** no output (clean).
- **16 — full test:** `Test Files 217 passed (217)`, `Tests 2224 passed (2224)`,
  duration 124.23s. The new spec appears in the run
  (`geoCitationFactAssembler.test.ts (23 tests)`) alongside the accepted GEO
  suites (`GeoCitationRecorderRepository.query.test.ts` 41,
  `geoExactEntityMentionFactAssembler.test.ts` 20,
  `GeoEntityMentionRecorderRepository.query.test.ts` 38,
  `GeoObservationParseRecorderRepository.query.test.ts` 31,
  `GeoExactEntityMentionCandidateReaderRepository.query.test.ts` 23,
  `geoExactEntityMentionAssembly.test.ts` 12,
  `geoExactEntityMentionDetection.test.ts` 11,
  `geoExactEntityMentionMatcher.rejection.test.ts` 21,
  `geoParseOutputBundle.test.ts` 8, `freshGeoSampling.test.ts` 19,
  `geo-citation.test.ts` 12, `geo-entity-mention.test.ts` 16,
  `geo-observation-parse.test.ts` 11). No failures and no skips; only
  pre-existing stderr/stdout diagnostics (OAuth, DataForSEO, scheduler, MCP
  instrumentation) were emitted. The T148 delivery recorded 216 files / 2201
  tests, so the delta is exactly the 1 new file and 23 new tests.
- **17 — build:** client (`✓ 3682 modules transformed`, `✓ built in 20.16s`),
  SSR (`✓ 5086 modules transformed`, `✓ built in 26.72s`) and `open_seo_audit`
  (`✓ 431 modules transformed`, `✓ built in 3.08s`) all built, and the appended
  `tsc --noEmit` re-ran clean (overall exit 0). Only the pre-existing >500 kB
  chunk-size advisory was printed.
- **18 — ci:check:** exit 1. The aggregate begins with `prettier --check . &&
  …`, so it stopped at the same two pre-existing control files from command 6
  (`control/ACCEPTANCE_LEDGER.md`, `control/PROJECT_STATE.md`) and never reached
  knip, either `tsc`, `oxlint`, or the plugin-skill sync. This is **not** a
  sandbox denial and **not** a failure of any task file — it is the same
  Controller-owned formatting drift. It was recorded once and not bypassed.

## RUNTIME EVIDENCE

No runtime, provider, network, database, or production invocation was performed
and none is possible from this module. The evidence is the focused spec
exercising the shipped assembler directly; nothing below is inferred from
reading the code alone.

- **Mapping evidence:** assembly test 1 asserts the full fact objects with
  `toEqual` — `{ id: "cite_1", projectId: "proj_1", parseId: "parse_1", rawUrl:
  "https://example.com/post?utm_source=chatgpt#section", normalizedUrl:
  "https://example.com/post", domain: "example.com", title: null, position:
  null, sourceOwnership: "UNKNOWN", matchedPublicationReceiptId: null }` and its
  `cite_2` sibling — proving the parse/id binding, the verbatim leaves, and the
  explicit nulls; each `draft.candidate` is the caller's own object. Test 2
  proves a real title (with its surrounding whitespace), `position: 0`,
  `OWNED_DOMAIN`, and a matched receipt id are carried unchanged; test 5 shows
  the same binding for a `PARTIAL` parse.
- **Error evidence:** rejection tests 1–11 assert the `field` string and the
  `citationIndex` for cross-Project, empty parse id, empty/non-string id, both
  cardinality directions, a reused id, `FAILED` parse, seven leaf-contract
  defects, five out-of-set ownership values, negative/fractional position, and
  the two call-level shape defects. Each is captured through a helper that fails
  the test if the call returned, which is the atomicity evidence: a rejected
  call yields no drafts at all.
- **Opaque-evidence preservation evidence:** assembly test 7 feeds a
  deliberately un-normalized URL (`"  HTTPS://Exämple.COM:443/Path/?utm_source=
  ChatGPT&q=😀#Frag  "`), a value that is not a URL at all as `normalizedUrl`,
  and a mixed-case `domain`, and asserts all three are byte-identical on the
  emitted fact — no trim, no case fold, no port/slash/query handling. Assembly
  test 6 asserts an exact `[id, domain, rawUrl]` sequence for an input
  containing two citations of the identical URL, so the caller's order and every
  collision survive. Assembly test 8 asserts no mutation (deep clone equal) and
  no `JSON.stringify`.
- **Boundary evidence:** boundary tests 1–4 statically prove the shipped source
  imports only the accepted contracts plus Zod, calls no repository, recorder,
  reader, extractor, or provider, references no raw observation/response,
  performs no URL/domain normalization or ownership/receipt logic, performs no
  sort/reverse/filter/reduce/Set call, and has no `try`/`catch`.
- **Regression evidence:** command 16 — 217 files / 2224 tests passed;
  commands 13, 15, 17 — lint, type check, and the full production build all exit
  0. Command 18 (`ci:check`) could not reach its non-Prettier steps because of
  the pre-existing control-file drift recorded above; the constituent type
  checks and lint it would have run are covered by commands 15 and 13, which are
  green.

## KNOWN LIMITATIONS

- The assembler maps a positional alignment: `citationIds[index]` becomes the id
  of the fact built from `candidates[index]`. That is the contract the TASK
  specifies; the module does not try to infer a better pairing, and a caller
  that supplies ids in a different order gets facts with those ids — nothing is
  reordered to compensate. This is deliberate, since reordering would be a
  business rule this boundary must not invent.
- `normalizedUrl` and `domain` are accepted as caller-supplied opaque facts and
  validated only as non-empty strings. §8's normalization/own-domain/receipt
  pipeline is explicitly later work, so an inconsistent pair (e.g. a
  `normalizedUrl` that does not correspond to `rawUrl`, or a `domain` that is
  not the URL's host) is passed through rather than checked. Flagged for review.
- The parse fact's `parseStatus` is read only to reject `FAILED`. A runtime
  status that is neither `SUCCESS`, `PARTIAL`, nor `FAILED` would not be rejected
  here. Validating the enum would add a rule beyond the TASK's list (and
  `parseStatus` is never copied onto an emitted fact), so it is left to the
  accepted T140 boundary. Flagged for review.
- The `PARTIAL` parse is accepted purely on `parseStatus`; whether a partial
  parser result actually carries usable citation evidence is the
  caller's/parser's concern, not something this module inspects.
- `title` is validated as string-or-null, matching T142's accepted storage rule,
  so an empty-string title is accepted rather than rejected. The TASK wording
  ("title … explicit as string-or-null") does not require non-empty, unlike
  `rawUrl`/`normalizedUrl`/`domain`/`matchedPublicationReceiptId`.
- Nothing calls the assembler yet, so it has no production call site: citation
  extraction, URL identity, receipt matching, and persistence are later tasks.
  Knip sees it through its spec.
- `format:check` and therefore `ci:check` are red on this base commit for the
  two Controller-owned control files described above. This is outside the task
  and was not fixed.
- The full-suite durations and the >500 kB chunk advisory are pre-existing and
  unrelated.

## DEVIATIONS FROM TASK

None in scope. All scope boundaries in the TASK were honored: no schema,
migration, snapshot, or dependency change; no URL normalization/identity, receipt
matching, ownership classification, parser execution, persistence,
bundle orchestration, provider/cache, UI, CRUD/server function, credentials,
publishing, paid action, or production behavior. No APPROVED command was wrapped
in a chained shell operation and no unapproved pnpm script was used; the only
extra commands were the read-only git ones the TASK permits. The bootstrap
install was required because `node_modules` was absent in this worktree
(explicitly allowed) and did not change the lockfile.

Four implementation choices and one non-action are worth flagging for review:

1. **The `FAILED`-parse correction (command 3).** The first focused run caught
   that checking `parseStatus` on the Zod-parsed context object silently accepted
   a `FAILED` parse, because that copy intentionally carries only `id`/
   `projectId`. The check now reads `input.parse.parseStatus`. This is a real
   behaviour fix found by the task's own negative test.
2. **`GeoCitationEvidenceCandidate` is defined here.** No citation-candidate type
   existed yet (T145's reader is entity-specific and T142 exposes only the fact),
   so the assembler declares the seven-leaf evidence contract it validates. It
   deliberately carries no `projectId`/`parseId`/`id`, keeping identity and
   binding exclusively with the inputs as the TASK requires.
3. **The accepted ownership enum is imported, not re-declared.**
   `citationSourceOwnershipSchema`/`CitationSourceOwnership` come from
   `@/types/schemas/geo-citation` (itself derived from the Drizzle column), so
   the accepted classification set cannot drift. This mirrors the accepted T142
   recorder. The import specifier is the type/schema module, not `@/db`.
4. **Duplicate detection uses `citationIds.indexOf(id) !== index`** rather than a
   `Set`/`Map`, so the first duplicate's index is reported with no extra
   collection, no reordering, and no `.filter(`/`new Set(` in the source (the
   boundary spec asserts their absence). Citation counts are small.
5. **The two Prettier-dirty control files were left untouched.** Fixing them
   would have been a one-character whitespace edit, but
   `control/PROJECT_STATE.md` and `control/ACCEPTANCE_LEDGER.md` are
   Controller-owned control-plane artifacts (the same class of path as
   `REVIEW.md`), and this task is scoped to the assembler. They are therefore
   reported rather than edited. If the Controller prefers, the fix is to strip
   the extra trailing newline these commits appended, or to add `control/*.md`
   to `.prettierignore`.

## SECURITY NOTES

- No credential, account, provider, paid action, publishing, Prompt Explorer,
  R2/application-cache, CAPTCHA/2FA, stealth, or cookie access; no network call,
  no database access, and no production or external system contact. The spec
  runs entirely in process with plain objects.
- The assembler is storage-free: it opens no database and calls no repository,
  recorder, reader, extractor, or provider. Persistence stays with the accepted
  T142 recorder, which this module never invokes.
- Fail-closed and atomic: the first invalid input throws before any draft
  exists, so a cross-Project, wrong-cardinality, duplicate-id, FAILED-parse, or
  malformed-leaf batch cannot reach a recorder in part. There is no `try`/`catch`
  and no empty-result fallback.
- Caller-supplied citation ids are validated as non-empty, unique strings before
  they become primary keys, so a duplicate id cannot fail late (after part of a
  batch was stored) or overwrite an earlier citation.
- Opaque URL/domain/ownership/receipt evidence is copied by reference and never
  read, parsed, normalized, classified, matched, logged, or interpreted; no raw
  provider/observation payload is touched.
- No scope change, no edit to `29_SCOPE_LOCK.md`, no Accepted-ADR edit, no
  acceptance-criteria weakening, no dependency addition, no
  `--dangerously-skip-permissions`, no commit, no merge, no push, and no
  production publishing. `main` and `integration/ai-v1` were not touched.
  `REVIEW.md` was neither created nor edited.

## GIT STATUS/DIFF SUMMARY

`git rev-parse HEAD` → `e22a822d5b5f8029501db41d1f5e6bb0b8676465`
(`chore(search-growth): dispatch T149 round 1`).

`git diff --stat` → empty (no tracked file modified). `git diff --stat --
package.json pnpm-lock.yaml` → empty.

`git status --short` before this DELIVERY was written:

```text
?? src/server/features/search-growth/geo/services/geoCitationFactAssembler.test.ts
?? src/server/features/search-growth/geo/services/geoCitationFactAssembler.ts
```

with this DELIVERY added as the third untracked path at
`control/tasks/T149-M2-GEO-CITATION-FACT-ASSEMBLER/DELIVERY.md`. No build output
(`dist/`), cache, migration, snapshot, or generated file appears in the status.

Changed paths:

- `src/server/features/search-growth/geo/services/geoCitationFactAssembler.ts` (new)
- `src/server/features/search-growth/geo/services/geoCitationFactAssembler.test.ts` (new)
- `control/tasks/T149-M2-GEO-CITATION-FACT-ASSEMBLER/DELIVERY.md` (this file)

No commit, merge, push, or branch change was made. `main` was not touched.
`node_modules`, `dist/`, and other build output are gitignored and absent from
status.

## READY FOR REVIEW

Implementation, 23 focused tests, the full suite (217 files / 2224 tests), type
check, lint, and the production build all exited 0 on this final code. Two gates
returned non-zero for a single pre-existing, Controller-owned cause that is
outside this task: `format:check` (exit 1) and therefore `ci:check` (exit 1)
reject the trailing blank lines that commits `1edd5e7`/`e22a822` appended to
`control/ACCEPTANCE_LEDGER.md` and `control/PROJECT_STATE.md`; every task file is
Prettier-clean and no tracked file was modified by this task. The worktree
contains only the two new task-scoped source files plus this DELIVERY. Awaiting
Codex review; no PASS is claimed here.

Only Codex can PASS this task.
