# DELIVERY — T144-M2-GEO-EXACT-ENTITY-MENTION-MATCHER-CORE

ROUND: 1 of 3
BASE COMMIT: 63be0656907d04ec287977bf474cfd15a2656bad
STATUS: READY FOR REVIEW (implementation complete; not self-accepted)

## IMPLEMENTATION SUMMARY

Added one small, storage-free, deterministic matcher for literal `EXACT`
entity/alias surfaces: the first bounded deterministic parser slice of
`07_GEO_MEASUREMENT_SPEC.md` §5.

- New pure function `matchExactEntityMentions(input)`. The caller supplies the
  `projectId`, the parsed `text`, and an ordered `candidates` list; each
  candidate carries the stable `entityId` (ADR-004), its `projectId`, the exact
  `surface` literal, and its source identity — `{ kind: "CANONICAL_NAME" }` or
  `{ kind: "ALIAS", aliasId }` (05_DOMAIN_DATA_MODEL.md §4). Nothing is looked
  up, loaded, or inferred: no entity row, no alias row, no raw provider
  response, no stored parse.
- It returns `GeoExactEntityMentionMatch[]`, each with the four auditable facts
  the TASK names — `entityId`, the caller's `source` identity, zero-based
  `start`/`end` code-unit offsets, and `evidence` (exactly
  `text.slice(start, end)`). `source` is carried by object identity, so a span
  stays traceable to the exact stored surface that produced it without a second
  lookup. No match carries a `projectId`, a persistence id, a score, or any
  interpretation.
- Only literal, case-sensitive matching happens. Each candidate is scanned with
  `indexOf(surface, previousEnd)`, which yields every non-overlapping occurrence
  and guarantees progress. Neither the text nor a surface is normalized,
  trimmed, lower-cased, case-folded, tokenized, HTML/URL-parsed, serialized, or
  otherwise altered — a decomposed `e`+U+0301 is a different literal from
  precomposed `é`, and leading whitespace inside a surface is matched verbatim.
  The other §4 modes (case-insensitive, word-boundary, unicode-substring,
  domain) are neither implemented nor approximated.
- Ordering is a total order and therefore deterministic: ascending `start`, then
  the caller's candidate index, then occurrence index. Implemented with
  Remeda's `sortBy` (matching the repo's `unicorn/no-array-sort` rule and the
  ES2022 browser floor documented in `tsconfig.json`).
- Candidates stay independent. Two candidates with the same literal surface each
  report their own spans, and spans that overlap across candidates are both
  reported — this matcher invents no cross-entity priority, dedupe,
  ownership/uniqueness classification, or persistence identity.
- The whole input is validated before any matching, because these TypeScript
  types do not exist at runtime. A malformed, cross-Project, or
  empty-identifier call throws `GeoExactEntityMentionInputError`, which carries
  a structured `field` (`candidates[<index>].<field>` for a candidate field)
  and `candidateIndex` (`null` for a call-level field). No candidate is ever
  silently skipped, substituted, or repaired, and no partial result is returned.
  An empty parsed text is a *valid* input that yields zero matches (the TASK
  rejects only absent/non-string text); a whitespace-only surface is a valid
  literal.
- The module is pure: it mutates nothing, serializes nothing, opens no database,
  calls no repository or recorder, and touches no provider, cache, credential,
  or persisted state. It also selects no "current" parse and computes no
  recommendation, sentiment, position, metric, or confidence (ADR-005: parses
  are versioned, so what a span means is the caller's decision).
- No caller is wired up: mention persistence and parse orchestration are later
  tasks, so the module is consumed only by its own focused specs.

## FILES CHANGED

All four source files are new and untracked; no tracked file changed, and the
only other new path is this DELIVERY itself.

| Path | Change |
| --- | --- |
| `src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.ts` | New: 1 pure function, 1 error class, 5 exported types |
| `src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher-test-fixtures.ts` | New: shared valid/invalid fixture factories |
| `src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.test.ts` | New: 12 literal-matching / boundary tests |
| `src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.rejection.test.ts` | New: 21 rejection-contract tests |

The specs were split into a shared fixture module plus two spec files because
`geoExactEntityMentionMatcher.test.ts` exceeded oxlint's `max-lines` (400) when
it held the whole table. This follows the existing shared-fixture pattern in
`src/server/features/ga4/services/ga4-test-fixtures.ts`; no lint rule was
weakened and no disable comment was added for `max-lines`.

Public surface of the new module:

```ts
type GeoExactEntityMentionSource =
  | { kind: "CANONICAL_NAME" }
  | { kind: "ALIAS"; aliasId: string };

type GeoExactEntityMentionCandidate = {
  projectId: string;
  entityId: string;
  surface: string;
  source: GeoExactEntityMentionSource;
};

type GeoExactEntityMentionMatchInput = {
  projectId: string;
  text: string;
  candidates: GeoExactEntityMentionCandidate[];
};

type GeoExactEntityMentionMatch = {
  entityId: string;
  source: GeoExactEntityMentionSource;
  start: number;
  end: number;
  evidence: string;
};

class GeoExactEntityMentionInputError extends Error {
  readonly field: string;
  readonly candidateIndex: number | null;
  // message = `GEO exact entity mention matcher: ${field} ${detail}.`
}

function matchExactEntityMentions(
  input: GeoExactEntityMentionMatchInput,
): GeoExactEntityMentionMatch[];
```

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, repository, or query change. The new
module imports no `@/db` module and no Drizzle type, names no table and no
column, and calls no recorder — the boundary test in the matching spec asserts
the source text itself contains no `@/db`, `drizzle`, `insert(`, `.query(`,
`recorder`, `fetch(`, `process.env`, or `node:fs` reference.

## DEPENDENCIES CHANGED

None. No `package.json` or lockfile change; `git diff --stat -- package.json
pnpm-lock.yaml` is empty. Only already-installed runtime libraries are used
(`remeda` for the ES2022-safe sort, `zod` for boundary validation). No new
runtime or dev dependency, and no provider, cache, or credential dependency.

## TESTS ADDED

### `geoExactEntityMentionMatcher.test.ts` — 12 tests

| # | Invariant |
| --- | --- |
| 1 | Every non-overlapping occurrence of a repeated surface is returned, case-sensitively (`"Acme and Acme again. ACME."` → `[0,4)` and `[9,13)`; `ACME` is not a match) |
| 2 | One candidate never matches itself overlapping (`"aaaa"` / `"aa"` → `[0,2)`, `[2,4)`) |
| 3 | Overlapping surfaces of different candidates stay independent (`"Acme Corporation"` → `ent_full [0,16)` then `ent_short [0,4)`) |
| 4 | Deterministic ordering: ascending `start`, then caller candidate order, then occurrence order — asserted with an exact `[start, entityId, evidence]` triple list, plus a second identical call compared with `toEqual` |
| 5 | Two candidates with the same literal surface stay separate (4 matches; the alias candidate's `aliasId` is asserted per match) |
| 6 | Code-unit offsets and evidence across astral characters (`"\u{1F680} Acme \u{1F680}"` → `start 3`, `end 7`, evidence `"Acme"`) |
| 7 | Non-ASCII surface matched verbatim with no normalization: precomposed `é` matches and returns the exact slice; the decomposed `e`+U+0301 spelling of the same surface returns `[]`. Fixtures are built with `String.fromCharCode` so the two spellings cannot be collapsed by an editor |
| 8 | No trimming on either side: surface `" Acme"` in `"  Acme"` → `start 1` with evidence `" Acme"`; surface `"Acme"` in the same text → `start 2` |
| 9 | A whitespace-only surface is the literal string it is (`"  "` in `"Acme  Inc"` → `[4,6)`, evidence `"  "`) |
| 10 | Empty parsed text and empty candidate list both yield `[]` (valid input, no matches) |
| 11 | Identity / non-mutation / non-serialization: the caller's `source` objects come back by `toBe` identity, a `structuredClone` before/after `toEqual` proves no mutation, and a `vi.spyOn(JSON, "stringify")` proves nothing is serialized — with the result annotated `GeoExactEntityMentionMatch[]` |
| 12 | Boundary: the module source contains no database, recorder, provider, env, or `node:fs` reference |

### `geoExactEntityMentionMatcher.rejection.test.ts` — 21 tests

An 18-row table driven by `it.each`, each row asserting the raised error is a
`GeoExactEntityMentionInputError`, its structured `field`, its
`candidateIndex`, and that the message contains the field name:

| Rejected input | Named field | Index |
| --- | --- | --- |
| absent `text` | `text` | `null` |
| non-string `text` | `text` | `null` |
| empty `projectId` | `projectId` | `null` |
| non-string `projectId` | `projectId` | `null` |
| absent `candidates` | `candidates` | `null` |
| non-array `candidates` | `candidates` | `null` |
| non-object candidate | `candidates[0]` | `0` |
| empty candidate `projectId` | `candidates[0].projectId` | `0` |
| non-string candidate `projectId` | `candidates[0].projectId` | `0` |
| empty `entityId` | `candidates[0].entityId` | `0` |
| non-string `entityId` | `candidates[0].entityId` | `0` |
| empty `surface` | `candidates[0].surface` | `0` |
| non-string `surface` | `candidates[0].surface` | `0` |
| absent `source` | `candidates[0].source` | `0` |
| unknown `source.kind` | `candidates[0].source.kind` | `0` |
| alias source without `aliasId` | `candidates[0].source.aliasId` | `0` |
| empty `aliasId` | `candidates[0].source.aliasId` | `0` |
| non-string `aliasId` | `candidates[0].source.aliasId` | `0` |

Plus three message-exact tests:

- the offending candidate is rejected **by index** — a valid candidate at index
  0 does not make the invalid one at index 1 tolerated, and the message is
  exactly
  `GEO exact entity mention matcher: candidates[1].surface must be a non-empty string.`
- a cross-Project candidate is rejected with exactly
  `GEO exact entity mention matcher: candidates[1].projectId belongs to project "proj_2", but the supplied projectId is "proj_1".`
- the accepted source kinds are named in the error: exactly
  `GEO exact entity mention matcher: candidates[0].source.kind must be "CANONICAL_NAME" or "ALIAS".`

## COMMANDS RUN

Bootstrap was required: `node_modules` was absent in this worktree.

| # | Command | Exit |
| --- | --- | --- |
| 1 | `corepack pnpm install --frozen-lockfile` | 0 |
| 2 | `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.ts src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher-test-fixtures.ts src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.test.ts src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.rejection.test.ts` | 0 |
| 3 | `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.test.ts src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.rejection.test.ts` | 0 |
| 4 | `corepack pnpm format:check` | 0 |
| 5 | `corepack pnpm types:check` | 0 |
| 6 | `corepack pnpm lint` | 0 |
| 7 | `corepack pnpm test` | 0 |
| 8 | `corepack pnpm build` | 0 |
| 9 | `corepack pnpm ci:check` | 0 |

Each command was invoked on its own line, not wrapped in a chained shell
operation. Read-only git usage: `git status --short`, `git diff --stat`,
`git rev-parse HEAD`.

## COMMAND RESULTS

- **1 — install:** `Lockfile is up to date, resolution step is skipped`;
  `Done in 47s using pnpm v10.30.1`. No lockfile mutation (`git diff --stat --
  package.json pnpm-lock.yaml` empty). Pre-existing ignored-build-script
  warnings for native packages were printed; Vitest, TypeScript, oxlint, and
  Prettier all run without them.
- **2 — prettier --write:** all four task files reported `(unchanged)`; the
  files were already conformant.
- **3 — focused test:** `Test Files 2 passed (2)`, `Tests 33 passed (33)`,
  duration 6.26s — `geoExactEntityMentionMatcher.test.ts (12 tests)` and
  `geoExactEntityMentionMatcher.rejection.test.ts (21 tests)`.
- **4 — format:check:** `All matched files use Prettier code style!`
- **5 — types:check:** `tsc --noEmit` produced no output (clean).
- **6 — lint:** `Found 0 warnings and 0 errors. Finished in 14.9s on 953 files
  using 16 threads.`
- **7 — full test:** `Test Files 211 passed (211)`, `Tests 2130 passed (2130)`,
  duration 126.91s. Both new suites appear in the run
  (`geoExactEntityMentionMatcher.rejection.test.ts (21 tests) 26ms`,
  `geoExactEntityMentionMatcher.test.ts (12 tests) 59ms`). No failures and no
  skips; only pre-existing stderr/stdout diagnostics (OAuth, DataForSEO,
  scheduler, MCP instrumentation) were emitted. Baseline in this worktree
  before the task was 209 files / 2097 tests, so the delta is exactly the 2 new
  files and 33 new tests.
- **8 — build:** Vite client (`✓ 3682 modules transformed`, `✓ built in
  22.17s`), SSR (`✓ 5086 modules transformed`, `✓ built in 36.67s`), and
  `open_seo_audit` (`✓ 431 modules transformed`, `✓ built in 4.14s`) all built,
  and the appended `tsc --noEmit` re-ran clean. Only the pre-existing >500 kB
  chunk-size advisory was printed.
- **9 — ci:check:** ran Prettier (`All matched files use Prettier code style!`),
  knip, `tsc --noEmit`, `tsc --noEmit -p badseo/tsconfig.json`,
  `oxlint . --type-aware` (`Found 0 warnings and 0 errors. Finished in 11.9s on
  953 files`), and the plugin-skill sync check; final line
  `plugin skill sync clean: plugins/openseo/skills`. Exit 0. No gate was
  sandbox-denied, so nothing was skipped and no bypass was needed.

## RUNTIME EVIDENCE

No runtime, provider, database, network, or production invocation was performed —
this is pure domain code, and its focused tests are the only execution evidence:

- **Literal-match evidence:** focused run test 1 returns exactly
  `[{entityId: "ent_1", source: {kind: "CANONICAL_NAME"}, start: 0, end: 4,
  evidence: "Acme"}, {…, start: 9, end: 13, evidence: "Acme"}]` for
  `"Acme and Acme again. ACME."` — the third `ACME` is absent, proving
  case-sensitive matching only. Test 6 asserts offsets `3 → 7` around an astral
  emoji, proving code-unit (not code-point) offsets. Test 7 asserts that
  precomposed `é` matches with `evidence === composedText.slice(0, 4)` while the
  decomposed spelling returns `[]`, proving no normalization. Test 8 asserts
  `start 1` with evidence `" Acme"`, proving no trimming. Test 9 asserts the
  whitespace-only surface `"  "` matches at `[4,6)`.
- **Determinism evidence:** test 4 asserts the exact ordering
  `[[0,"ent_b","Beta"],[5,"ent_a","Acme"],[10,"ent_a","Acme"]]` and re-runs the
  same call to compare with `toEqual`.
- **Independence evidence:** test 3 reports both `ent_full [0,16)` and
  `ent_short [0,4)` for overlapping surfaces; test 5 reports all four matches
  for two candidates sharing the surface `"Acme"`, each with its own `entityId`
  and source identity.
- **Rejection evidence:** the 18-row table plus 3 message-exact tests executed
  in `geoExactEntityMentionMatcher.rejection.test.ts`, each asserting the error
  class, the structured `field`, the structured `candidateIndex`, and (for the
  three message-exact tests) the complete verbatim message. The index test
  proves a valid candidate at index 0 does not rescue an invalid index 1; the
  cross-Project test proves the guard fires on the id mismatch rather than
  matching against the wrong Project.
- **Purity evidence:** test 11 compares a `structuredClone` of the input before
  and after with `toEqual`, asserts the caller's `source` objects come back by
  `toBe` identity, and asserts a `JSON.stringify` spy was never called. Test 12
  reads the module source and asserts no database/recorder/provider/env/`node:fs`
  reference exists at all.
- **Full-suite regression evidence:** `corepack pnpm test` — 211 files / 2130
  tests passed, including the accepted T138/T141/T142/T143 GEO suites
  (`freshGeoSampling.test.ts`, `GeoEntityMentionRecorderRepository.query.test.ts`,
  `GeoCitationRecorderRepository.query.test.ts`, `geoParseOutputBundle.test.ts`).

## KNOWN LIMITATIONS

- Only `EXACT` matching is implemented. The other §4 modes
  (`CASE_INSENSITIVE_EXACT`, `WORD_BOUNDARY`, `UNICODE_SUBSTRING`, `DOMAIN`) are
  deliberately out of scope and are neither implemented nor approximated.
- Overlap is resolved only *within* one candidate (each scan resumes past its
  own previous hit). Across candidates, overlapping spans are all returned by
  design — resolving them needs a priority/ownership rule this task forbids
  inventing, so it is left to a later caller.
- A surface may legitimately match inside a larger word (`"Acme"` in
  `"AcmeCorp"`), because word-boundary matching is a different mode and literal
  substring search must not approximate it.
- Nothing calls the matcher yet — persistence and parse orchestration are later
  tasks — so the module has no production call site and knip sees it only
  through its two specs.
- The matcher validates input shape and Project ownership only; it does not
  verify that an `entityId` or `aliasId` exists, and it does not check that a
  candidate's surface actually equals the stored surface it claims to come
  from. Those are entity/alias lookup concerns, explicitly excluded here.
- Returned `start`/`end` are JavaScript UTF-16 code-unit offsets (so astral
  characters count as two), which is what the TASK specifies; a consumer that
  needs code points must convert.
- The install emitted ignored-build-script warnings for native packages;
  unrelated to this task and identical on a clean checkout.

## DEVIATIONS FROM TASK

None. No APPROVED command was wrapped in a chained shell operation, no
unapproved pnpm script was used, and the only extra commands were the read-only
git ones the TASK permits. The bootstrap install was needed because
`node_modules` was absent in this worktree, which the TASK explicitly allows,
and it did not change the lockfile. One implementation choice worth flagging for
review: the matching spec was split into a shared fixture module plus two spec
files (instead of one spec file) to stay under oxlint's `max-lines`; the
rejection contract still lives in its own spec with all 21 tests.

## SECURITY NOTES

- No credential, account, provider, paid action, publishing, Prompt Explorer,
  R2/application-cache, CAPTCHA/2FA, stealth, or cookie access; no network call
  and no database access.
- The parsed text and every surface stay opaque: the matcher never logs,
  serializes, normalizes, or interprets them, and only ever echoes back the
  exact slice the caller supplied. No raw provider response, HTML, or URL is
  fetched or parsed.
- Invalid input fails closed: a rejected call throws before any result exists,
  and no candidate is skipped or repaired, so a malformed candidate can never
  silently produce a partial or misleading match set.
- No scope change, no edit to `29_SCOPE_LOCK.md`, no Accepted-ADR edit, no
  acceptance-criteria weakening, no dependency addition, and no
  `--dangerously-skip-permissions`.
- Not committed, not merged, not pushed; `main` and `integration/ai-v1` were not
  touched. `REVIEW.md` was neither created nor edited.

## GIT STATUS/DIFF SUMMARY

`git rev-parse HEAD` → `63be0656907d04ec287977bf474cfd15a2656bad`
(`chore(control): dispatch T144 round 1`).

`git diff --stat` → empty (no tracked file modified).

`git status --short` before this DELIVERY was written:

```text
?? src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher-test-fixtures.ts
?? src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.rejection.test.ts
?? src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.test.ts
?? src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.ts
```

with this DELIVERY added as the fifth untracked path at
`control/tasks/T144-M2-GEO-EXACT-ENTITY-MENTION-MATCHER-CORE/DELIVERY.md`.

## READY FOR REVIEW

Implementation, focused tests (33), the five required gates, and the aggregate
`ci:check` are complete on this final code, and the worktree contains only the
four new task-scoped source files plus this DELIVERY. Awaiting Codex review; no
PASS is claimed here.
