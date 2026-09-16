# DELIVERY — T146-M2-GEO-EXACT-ENTITY-MENTION-DETECTION-SERVICE

ROUND: 1 of 3
BASE COMMIT: 8258ae855612904e90a61f4de6403d3d0faf4b8f
STATUS: READY FOR REVIEW (implementation complete; not self-accepted)

## IMPLEMENTATION SUMMARY

Added one small, storage-free detection service that transparently composes the
accepted T145 Project-scoped candidate reader with the accepted T144 exact
matcher. Given a caller-supplied `{ projectId, text }` and an injected
`GeoExactEntityMentionCandidateReader`, it awaits exactly one
`listCandidates(projectId)` call, delegates the returned candidates and the
caller's text to `matchExactEntityMentions` exactly once, and returns that
call's result unchanged.

- **One function, one input type** (`geoExactEntityMentionDetection.ts`):
  `detectExactEntityMentions(input, reader)`, where
  `GeoExactEntityMentionDetectionInput = Pick<GeoExactEntityMentionMatchInput,
  "projectId" | "text">`. Deriving the input type from the accepted T144
  `GeoExactEntityMentionMatchInput` means the two boundaries cannot drift.
- **Transparent composition only.** The body is two statements: one awaited read
  and one matcher call built from `{ projectId: input.projectId, text:
  input.text, candidates }`. No filtering, sorting, dedupe, collision winner
  selection, alias/entity lookup, matching logic, normalization, serialization,
  raw-payload inspection, parse/current selection, or status/recommendation/
  sentiment/position/metric computation exists.
- **Identity and text are forwarded verbatim.** The supplied Project id and text
  are passed through unchanged — never replaced, repaired, trimmed, or
  case-folded — and no parse, run, or sample id is attached. Parses are
  versioned (ADR-005), so binding these spans to a concrete parse and recording
  them remain later work through the accepted T143/T141 boundaries.
- **Fail closed by propagation.** There is no `try`/`catch` and no fallback: a
  reader failure reaches the caller by identity and is never converted into an
  empty match list, and a matcher rejection (including a reader candidate that
  belongs to another Project) surfaces unchanged.
- **Storage-free by construction.** The only data access is the injected reader
  port; the module imports the T145 port type and the T144 matcher function and
  nothing else.
- **No caller is wired up.** Parse orchestration and mention persistence are
  later tasks, so the module is consumed only by its own spec.

## FILES CHANGED

Both source files are new and untracked; no tracked file changed, and the only
other new path is this DELIVERY itself.

| Path | Change |
| --- | --- |
| `src/server/features/search-growth/geo/services/geoExactEntityMentionDetection.ts` | New: detection service (input type + 2-statement composition) |
| `src/server/features/search-growth/geo/services/geoExactEntityMentionDetection.test.ts` | New: 11 focused tests (8 behaviour + 3 source-boundary) |

Public surface of the new module:

```ts
type GeoExactEntityMentionDetectionInput = Pick<
  GeoExactEntityMentionMatchInput,
  "projectId" | "text"
>;

function detectExactEntityMentions(
  input: GeoExactEntityMentionDetectionInput,
  reader: GeoExactEntityMentionCandidateReader,
): Promise<GeoExactEntityMentionMatch[]>;

// body:
//   const candidates = await reader.listCandidates(input.projectId);
//   return matchExactEntityMentions({
//     projectId: input.projectId,
//     text: input.text,
//     candidates,
//   });
```

The dependency is the accepted T145 port type, imported rather than
re-declared; the matcher, its input type, and its match type are the accepted
T144 definitions, imported rather than re-declared.

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or generated-file change: `git status
--short` lists only the two new source files, and `git diff --stat` is empty.
The service holds no database handle at all — storage access is exclusively the
injected reader port, whose adapter is the already-accepted T145 repository. No
concrete database import exists in the new module.

## DEPENDENCIES CHANGED

None. No `package.json` or lockfile change (`git diff --stat -- package.json
pnpm-lock.yaml` is empty). The module uses no runtime library: it imports only
the two accepted sibling modules. The spec uses only already-installed tooling
(`vitest`, `node:fs` for the static source boundary), matching the T145
precedent.

## TESTS ADDED

`geoExactEntityMentionDetection.test.ts` — 11 tests, split into a behaviour
suite (8) and a source boundary suite (3). The reader is an in-process fake with
a `vi.fn` spy; the matcher is the real T144 implementation, never a mock, so
delegation is asserted by comparing against a direct matcher call with the same
inputs.

### Behaviour suite — 8 tests

| # | Invariant |
| --- | --- |
| 1 | Reader called exactly once with the identical Project id (`toHaveBeenCalledTimes(1)` + `toHaveBeenCalledWith("proj_1")`), and the result equals `matchExactEntityMentions({ projectId, text, candidates })` for the same inputs — including two candidates sharing start offset 0 (`"Acme"` and `"Acme Inc."`), both reported |
| 2 | Exact UTF-16 code-unit offsets and span text for two occurrences (`"Acme first, then Acme"` → `[0,4]` and `[17,21]`, each `"Acme"`) |
| 3 | Empty candidate list → `[]` on two calls (deterministic no-match), reader called twice |
| 4 | Colliding candidates (two entities' canonical `"Acme"` plus one alias `"Acme"`) → all three matches preserved in deterministic order, equal to a direct matcher call; no dedupe, no winner |
| 5 | A typed T145 `GeoExactEntityMentionCandidateReaderError` instance propagates by identity (`rejects.toBe(failure)`) instead of resolving to an empty list |
| 6 | A reader candidate belonging to another Project causes the matcher's `GeoExactEntityMentionInputError` (message matches `candidates[0].projectId`) — proves candidates are delegated unchanged |
| 7 | Non-string `text` (runtime `42`) is forwarded unchanged and rejected by the matcher with `GeoExactEntityMentionInputError` — the service neither coerces nor validates it |
| 8 | Opaque text `"  Ａcme\nAcme😀Acme  "` preserves byte-for-byte evidence at `[7,11]` and `[13,17]`: fullwidth `Ａcme` is not matched (no width/case folding), the astral emoji occupies two code units, and leading/trailing whitespace shifts offsets rather than being trimmed; `evidence === text.slice(start, end)` for every match |

### Source boundary suite — 3 tests

Comments are stripped before counting invocations, so prose that names an API
cannot be mistaken for a call.

| # | Invariant |
| --- | --- |
| 1 | Imports only `./geoExactEntityMentionCandidateReader` and `./geoExactEntityMentionMatcher`; no `@/db`, `drizzle`, `Repository`, `Recorder`, `node:fs`, or `process.env` import, and no `fetch(`, `JSON.stringify`, or `console.` in the source |
| 2 | Exactly one `listCandidates(` and one `matchExactEntityMentions(` invocation; no `.filter(`, `.map(`, `.sort(`, `.toSorted(`, `.reduce(`, `new Set(`, `toLowerCase`, `toUpperCase`, `.trim(`, `.normalize(`, or `.replace(` |
| 3 | No `try`/`catch`/`throw` (errors propagate unchanged) and no `evidence`, `rawResponse`, `parseId`, `runId`, `sampleId`, `batchId`, or `.record(` reference (no raw-payload or parse-identity handling) |

## COMMANDS RUN

Bootstrap was required: `node_modules` was absent in this worktree. Each command
was invoked on its own line, not wrapped in a chained shell operation. Read-only
git usage: `git status --short`, `git diff --stat`, `git rev-parse HEAD`.

| # | Command | Exit |
| --- | --- | --- |
| 1 | `corepack pnpm install --frozen-lockfile` | 0 |
| 2 | `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoExactEntityMentionDetection.ts src/server/features/search-growth/geo/services/geoExactEntityMentionDetection.test.ts` | 0 |
| 3 | `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoExactEntityMentionDetection.test.ts` (first run — 1 failure, see COMMAND RESULTS) | 1 |
| 4 | `corepack pnpm exec prettier --write` (same two task files, after the fix) | 0 |
| 5 | `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoExactEntityMentionDetection.test.ts` (final) | 0 |
| 6 | `corepack pnpm format:check` | 0 |
| 7 | `corepack pnpm types:check` | 0 |
| 8 | `corepack pnpm lint` | 0 |
| 9 | `corepack pnpm test` | 0 |
| 10 | `corepack pnpm build` | 0 |
| 11 | `corepack pnpm ci:check` | 0 |

## COMMAND RESULTS

- **1 — install:** `Done in 59.3s using pnpm v10.30.1`. No lockfile mutation
  (`git diff --stat -- package.json pnpm-lock.yaml` empty). The usual ignored
  build-script warnings for native packages were printed (pre-existing,
  unrelated).
- **2 — prettier --write:** the service was already conformant
  (`unchanged`); the spec was reformatted once (exit 0).
- **3 — focused test (first run):** `Test Files 1 failed (1)`,
  `Tests 1 failed | 10 passed (11)`. The failing boundary test counted
  `listCandidates(` twice in the raw source — once in an API invocation and once
  in the module's own doc comment (`awaits exactly one
  \`listCandidates(projectId)\``). The count is a real invariant, so the spec was
  fixed rather than the assertion weakened: comment blocks are now stripped
  before invocation counting.
- **4 — prettier --write (fix):** spec reformatted (exit 0).
- **5 — focused test (final):** `Test Files 1 passed (1)`,
  `Tests 11 passed (11)` (8 behaviour + 3 boundary).
- **6 — format:check:** `All matched files use Prettier code style!`
- **7 — types:check:** `tsc --noEmit` produced no output (clean).
- **8 — lint:** `Found 0 warnings and 0 errors. Finished in 31.5s on 959 files
  using 16 threads.`
- **9 — full test:** `Test Files 214 passed (214)`, `Tests 2169 passed (2169)`,
  duration 141.38s. The new spec appears in the run
  (`geoExactEntityMentionDetection.test.ts (11 tests)`), alongside the accepted
  GEO suites (`geoExactEntityMentionMatcher.test.ts` 12,
  `geoExactEntityMentionMatcher.rejection.test.ts` 21,
  `GeoExactEntityMentionCandidateReaderRepository.query.test.ts` 23,
  `…boundary.test.ts` 5, `geoParseOutputBundle.test.ts` 8,
  `freshGeoSampling.test.ts` 19). No failures and no skips; only pre-existing
  stderr/stdout diagnostics (OAuth, DataForSEO, scheduler, MCP instrumentation)
  were emitted. T145's recorded baseline was 213 files / 2,158 tests, so the
  delta is exactly the 1 new file and 11 new tests.
- **10 — build:** client (`✓ 3682 modules transformed`, `✓ built in 27.90s`),
  SSR (`✓ 5086 modules transformed`, `✓ built in 39.06s`) and `open_seo_audit`
  (`✓ 431 modules transformed`, `✓ built in 4.55s`) all built, and the appended
  `tsc --noEmit` re-ran clean. Only the pre-existing >500 kB chunk-size advisory
  was printed.
- **11 — ci:check:** ran Prettier (`All matched files use Prettier code
  style!`), knip, `tsc --noEmit`, `tsc --noEmit -p badseo/tsconfig.json`,
  `oxlint . --type-aware` (`Found 0 warnings and 0 errors. Finished in 12.9s on
  959 files`), and the plugin-skill sync check; final line
  `plugin skill sync clean: plugins/openseo/skills`. Exit 0. No gate was
  sandbox-denied, so nothing was skipped and no bypass was needed.

## RUNTIME EVIDENCE

No runtime, provider, network, or production invocation was performed. The
evidence is the focused spec exercising the shipped service end to end against
an in-process fake reader and the real T144 matcher; no claim below is inferred
from reading the code alone.

- **Composition evidence:** test 1 asserts `listCandidates` was called exactly
  once with `"proj_1"` and that the returned array `toEqual`s
  `matchExactEntityMentions({ projectId: "proj_1", text: "Acme Inc. is not
  Acme.", candidates })` — three matches, with the two candidates at start 0
  (`"Acme"`, `"Acme Inc."`) and the `"Acme"` at offset 17 all reported, so no
  filtering, dedupe, sorting, or re-shaping happened between the reader and the
  caller.
- **Determinism evidence:** test 3 calls the service twice on an empty candidate
  list and asserts `[]` both times; test 4 asserts the colliding result equals a
  direct matcher call and fixed `[[ent_1, CANONICAL_NAME], [ent_2,
  CANONICAL_NAME], [ent_2, ALIAS]]`.
- **Offset/opacity evidence:** test 2 asserts the exact `[0,4]` / `[17,21]`
  spans; test 8 asserts `[7,11]` / `[13,17]` on
  `"  Ａcme\nAcme😀Acme  "` and that every `evidence` equals
  `text.slice(start, end)`, proving no trimming, width folding, or case folding.
- **Error-identity evidence:** test 5 throws a constructed
  `GeoExactEntityMentionCandidateReaderError` from the fake reader and asserts
  `rejects.toBe(failure)` — the same object, not a copy, and a rejection rather
  than `[]`. Test 6 delegates a candidate with `projectId: "proj_other"` and
  asserts the real matcher's `GeoExactEntityMentionInputError` naming
  `candidates[0].projectId`; test 7 passes runtime `text: 42` and asserts the
  matcher's input error, proving neither the Project id nor the text is replaced
  or coerced.
- **Boundary evidence:** boundary tests 1–3 statically prove the shipped source
  has no storage/repository/recorder/network import or call, exactly one reader
  invocation and one matcher invocation, no transforming array/string calls, and
  no error handling or raw-payload/parse-identity reference.
- **Full-suite regression evidence:** command 9 — 214 files / 2,169 tests
  passed; command 11 — the aggregate gate, including knip, type checks, and
  type-aware lint, exited 0.

## KNOWN LIMITATIONS

- The service validates nothing itself. Non-empty `projectId` and string `text`
  are the accepted reader's and matcher's runtime rules; enforcing them here
  would replace the dependencies' typed errors with a service-local one and break
  the required identity propagation, so the contracts are enforced at exactly
  the accepted boundaries. Tests 5–7 pin that behaviour.
- Only the exact/case-sensitive matching the T144 matcher implements is
  reachable. The other §4 match modes remain out of scope and are not
  approximated.
- The service is a pure composition point and adds no orchestration: parse
  selection, run/sample binding, span persistence, and collision resolution are
  later tasks. Nothing calls it yet, so it has no production call site and knip
  sees it only through its spec.
- The reader's candidates are trusted to be Project-consistent by the accepted
  T145 adapter; the T144 matcher still rejects a cross-Project candidate
  (test 6), so an inconsistent reader cannot silently produce matches.
- The full-suite durations and the >500 kB chunk advisory are pre-existing and
  unrelated.

## DEVIATIONS FROM TASK

None. All scope boundaries in the TASK were honored: no schema, migration,
snapshot, or dependency change; no concrete database import, direct repository
use, entity/alias mutation, parser/extractor, bundle orchestration, mention
persistence, provider/cache, UI, CRUD/server function, credential, publishing,
paid action, or production behavior. No APPROVED command was wrapped in a
chained shell operation and no unapproved pnpm script was used; the only extra
commands were the read-only git ones the TASK permits. The bootstrap install was
required because `node_modules` was absent in this worktree (explicitly allowed)
and did not change the lockfile. Two implementation choices are worth flagging
for review:

1. The dependency is passed as a plain second argument
   (`detectExactEntityMentions(input, reader)`) rather than through a ports
   object or factory, because there is exactly one dependency — matching the
   flat `GeoFreshSamplePorts`-style precedent without a speculative wrapper.
2. The input type is derived with `Pick` from the accepted T144
   `GeoExactEntityMentionMatchInput` instead of re-declaring `projectId`/`text`,
   so the two boundaries cannot drift. The service still constructs its own
   matcher input object (it must not forward a `candidates` member it does not
   own).

## SECURITY NOTES

- No credential, account, provider, paid action, publishing, Prompt Explorer,
  R2/application-cache, CAPTCHA/2FA, stealth, or cookie access; no network call,
  no database access, and no production or external system contact. The spec
  runs entirely in process with an in-memory fake reader.
- The service is composition-only and storage-free: it opens no database and
  calls no repository, recorder, or provider directly; storage is reachable only
  through the injected T145 port.
- Fail-closed by propagation: a reader failure is re-raised by identity and can
  never masquerade as a genuine "not mentioned" result, because no failure is
  caught and no empty fallback exists.
- Caller-supplied Project id and text are opaque and forwarded verbatim; nothing
  is logged, serialized, normalized, trimmed, case-folded, or interpreted, and
  no span is bound to a parse, run, or sample identity.
- No scope change, no edit to `29_SCOPE_LOCK.md`, no Accepted-ADR edit, no
  acceptance-criteria weakening, no dependency addition, no
  `--dangerously-skip-permissions`, no commit, no merge, no push, and no
  production publishing. `main` and `integration/ai-v1` were not touched.
  `REVIEW.md` was neither created nor edited.

## GIT STATUS/DIFF SUMMARY

`git rev-parse HEAD` → `8258ae855612904e90a61f4de6403d3d0faf4b8f`
(`chore(control): dispatch T146 round 1`).

`git diff --stat` → empty (no tracked file modified). `git diff --stat --
package.json pnpm-lock.yaml` → empty.

`git status --short` before this DELIVERY was written:

```text
?? src/server/features/search-growth/geo/services/geoExactEntityMentionDetection.test.ts
?? src/server/features/search-growth/geo/services/geoExactEntityMentionDetection.ts
```

with this DELIVERY added as the third untracked path at
`control/tasks/T146-M2-GEO-EXACT-ENTITY-MENTION-DETECTION-SERVICE/DELIVERY.md`.
No build output, cache, or generated file appears in the status.

## READY FOR REVIEW

Implementation, 11 focused tests, the full suite (214 files / 2,169 tests), and
the five required gates plus the aggregate `ci:check` are complete on this final
code. The worktree contains only the two new task-scoped source files plus this
DELIVERY. Awaiting Codex review; no PASS is claimed here.
