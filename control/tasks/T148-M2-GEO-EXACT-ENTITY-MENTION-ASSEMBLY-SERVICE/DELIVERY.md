# DELIVERY — T148-M2-GEO-EXACT-ENTITY-MENTION-ASSEMBLY-SERVICE

ROUND: 1 of 3
EXECUTOR: Claude Code + DeepSeek Implementation Engineer
BASE COMMIT: f0ac64d1f0cf3d9b76d63235a3fc06e70a3f2371

## TASK ID

T148-M2-GEO-EXACT-ENTITY-MENTION-ASSEMBLY-SERVICE

## IMPLEMENTATION SUMMARY

Added one narrow, storage-free application service that composes the accepted
T146 exact detection with the accepted T147 fact assembler for ONE
caller-supplied concrete parse.

- `assembleExactEntityMentionFactsForParse(input, reader)` takes the concrete
  `GeoObservationParseFact`, the parsed text belonging to that parse, the
  ordered caller-supplied mention-id list, and an injected
  `GeoExactEntityMentionCandidateReader`.
- It awaits `detectExactEntityMentions({ projectId: input.parse.projectId, text:
  input.text }, reader)` exactly once, then calls
  `assembleExactEntityMentionFacts({ parse: input.parse, projectId:
  input.parse.projectId, mentionIds: input.mentionIds, matches })` exactly once,
  and returns that call's result unchanged (no `.map`, no copy, no rewrite).
- The detection Project is derived exclusively from the given parse fact. The
  parse object, the text, and the mention-id array are forwarded verbatim; no
  run, sample, market, or batch identity is attached.
- The service is transparent: no candidate read or match logic, no filtering,
  sorting, dedupe, collision selection, id generation, text/raw-evidence
  mutation, parse/current selection, status/recommendation/sentiment/position
  calculation, persistence, or error handling. Reader, detection, and assembly
  failures propagate unchanged; a reader failure is never an empty draft list.
- T147 remains the authoritative Project / FAILED / id-cardinality guard (the
  service re-decides none of it); T143 remains the later bundle consistency
  boundary. Recording stays a later task — the service returns unpersisted
  drafts only.

The input type derives its `parse` and `mentionIds` members from the accepted
T147 `GeoExactEntityMentionFactAssemblyInput` via `Pick`, so the two boundaries
cannot drift apart; `text` (owned by this composition) is added explicitly.

Boundary declaration and rationale are documented in the module header of
`geoExactEntityMentionAssembly.ts`, in the style of the accepted T146/T147
sibling modules.

## FILES CHANGED

Added (2 files, both new; no tracked file modified):

- `src/server/features/search-growth/geo/services/geoExactEntityMentionAssembly.ts`
  (88 lines) — the service contract (`GeoExactEntityMentionAssemblyInput`), the
  implementation (`assembleExactEntityMentionFactsForParse`), and the boundary
  declaration.
- `src/server/features/search-growth/geo/services/geoExactEntityMentionAssembly.test.ts`
  (358 lines) — 12 focused tests (8 behavior + 4 source-boundary).

`git diff --stat` is empty: no pre-existing file (including the accepted T146
detection, T147 assembler, T144 matcher, T145 reader port, T140/T141 ports, the
T143 bundle guard, and the repositories) was touched.

## DATABASE/MIGRATION CHANGES

None. No schema, table, column, index, migration, or snapshot change. No direct
database import exists in the new module; the only data access is the injected
reader port.

## DEPENDENCIES CHANGED

None. No `package.json` or lockfile change (`git status` shows no modification
to either). The service uses only existing modules: the accepted T146 detection,
the accepted T147 assembler, and the accepted T145 reader contract. No new
runtime or dev dependency, and no `zod` need arises here because the service
validates nothing of its own.

## TESTS ADDED

`geoExactEntityMentionAssembly.test.ts` — 12 tests. The reader is an in-process
fake; detection and assembly are the real accepted implementations and are
never mocked. Invariants covered (TASK in-scope item 4):

1. Detects under the parse fact's own Project (`listCandidates` called exactly
   once with `proj_parse_7`, the parse's Project, not a constant) and returns
   the assembler's drafts unchanged — the whole draft array is asserted
   literally (fact id/projectId/parseId/entityId/mentioned/null semantics/
   evidenceText plus the embedded match entity/source-kind/offsets/evidence).
   Canonical-name and alias candidates both appear, in match order.
2. No-match: an empty candidate list yields `[]` with the reader still consulted
   exactly once.
3. Colliding candidates: three candidates matching the same span stay three
   separate drafts in the caller's order with `CANONICAL_NAME`/`ALIAS` provenance
   retained (and the alias `aliasId` retained) — no winner selection, no dedupe.
4. PARTIAL parse (`parseStatus`/`accuracyStatus` `PARTIAL`) assembles, bound to
   the concrete parse id/Project.
5. Opaque text preserved byte-for-byte at UTF-16 code-unit offsets (untrimmed
   whitespace, fullwidth character not width-folded, astral emoji spanning two
   code units), the caller's parse and mention-id array held by identity, and
   the whole input unchanged (`structuredClone` snapshot comparison).
6. Reader failure propagates by identity (the same error instance) instead of an
   empty draft list; the reader was called once.
7. Assembly failure (id/match cardinality mismatch) propagates as
   `GeoExactEntityMentionFactAssemblyError` with `field: "mentionIds"` and
   `mentionIndex: null` — the ids are not repaired or padded.
8. Assembly failure (FAILED parse) propagates with `field:
   "parse.parseStatus"`; because the contract runs detection first, the reader
   was consulted exactly once before T147 rejected the batch.

Source-boundary tests (comment-stripped code assertions):

9. The module imports exactly the three accepted contracts
   (`geoExactEntityMentionCandidateReader`, `geoExactEntityMentionDetection`,
   `geoExactEntityMentionFactAssembler`) — asserted as an exact module list, so
   no DB/repository/recorder/provider import can be introduced silently; no
   `fetch(`/`process.env`/`node:fs`/`JSON.stringify`/`console.`.
10. Exactly one `detectExactEntityMentions(` call site and exactly one
    `assembleExactEntityMentionFacts(` call site; no `listCandidates(`,
    `matchExactEntityMentions(`, or `.record(`; no `evidence`/raw-payload or
    `parseStatus`/`runId`/`sampleId`/`marketId`/`batchId` token.
11. No `.filter`/`.map`/`.sort`/`.toSorted`/`.reverse`/`.reduce`/`new Set`/
    case-folding/`.trim`/`.normalize`/`.replace`, and no `===`/`!==`/`FAILED` —
    i.e. no independent decision, transform, or duplicate business rule.
12. No `try`/`catch`/`throw` — the service swallows no failure.

## COMMANDS RUN

Run independently, in order, each with its own exit code (no chained
aggregation). All pnpm invocations used `corepack pnpm` because bare `pnpm` is
not on PATH on this Windows Git Bash executor.

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoExactEntityMentionAssembly.test.ts`
3. `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoExactEntityMentionAssembly.ts src/server/features/search-growth/geo/services/geoExactEntityMentionAssembly.test.ts`
4. `corepack pnpm format:check`
5. `corepack pnpm types:check`
6. `corepack pnpm lint`
7. `corepack pnpm test`
8. `corepack pnpm build`
9. `corepack pnpm ci:check`
10. `git status`, `git diff --stat`, `git log`, `git rev-parse HEAD`
    (read-only)

## COMMAND RESULTS

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `corepack pnpm install --frozen-lockfile` | 0 | Worktree bootstrap only — `node_modules` was absent. "Lockfile is up to date, resolution step is skipped"; 980 packages resolved/reused; completed in 44.5s. No lockfile change (frozen). |
| 2 | `corepack pnpm exec vitest run <focused file>` | 0 | 1 file passed, 12/12 tests passed (19 ms test time, 5.13 s total). |
| 3 | `corepack pnpm exec prettier --write <task files>` | 0 | Both task files formatted; final re-run reported both unchanged. |
| 4 | `corepack pnpm format:check` | 0 | "All matched files use Prettier code style!" |
| 5 | `corepack pnpm types:check` | 0 | `tsc --noEmit` clean, no diagnostics. |
| 6 | `corepack pnpm lint` | 0 | `oxlint . --type-aware`: 0 warnings, 0 errors (963 files, 16 threads, 24.7s). |
| 7 | `corepack pnpm test` | 0 | Full suite: 216 test files passed, 2201 tests passed, 0 failed (126.21s). Prior accepted baseline was 215 files / 2189 tests, so this task adds exactly 1 file / 12 tests and regresses nothing. |
| 8 | `corepack pnpm build` | 0 | `vite build && tsc --noEmit` succeeded for all three environments (client, ssr, `open_seo_audit`); only the pre-existing chunk-size advisory warning was printed. |
| 9 | `corepack pnpm ci:check` | 0 | `prettier --check .` clean, `knip` clean, `tsc --noEmit` clean, `tsc --noEmit -p badseo/tsconfig.json` clean, `oxlint . --type-aware` 0/0, `sync-plugin-skills` reported "plugin skill sync clean" (no files changed). Not sandbox-denied — the aggregate gate ran to completion. |
| 10 | read-only git | 0 | See GIT STATUS/DIFF SUMMARY. |

No command was sandbox-denied, so no gate was skipped or bypassed.

## RUNTIME EVIDENCE

Composition (focused test 1, acceptance criterion 1): with parse
`{ id: "parse_1", projectId: "proj_parse_7", … }`, text `"Acme and Globex"`,
`mentionIds ["mention_1", "mention_2"]`, and a fake reader returning one
canonical `Acme` candidate (`ent_1`) and one alias `Globex` candidate
(`ent_2`/`alias_1`), the service produced exactly:

```
[
  { fact: { id: "mention_1", projectId: "proj_parse_7", parseId: "parse_1",
            entityId: "ent_1", mentioned: true, recommended: null,
            mentionPosition: null, sentiment: null, evidenceText: "Acme" },
    match: { entityId: "ent_1", source: { kind: "CANONICAL_NAME" },
             start: 0, end: 4, evidence: "Acme" } },
  { fact: { id: "mention_2", projectId: "proj_parse_7", parseId: "parse_1",
            entityId: "ent_2", mentioned: true, recommended: null,
            mentionPosition: null, sentiment: null, evidenceText: "Globex" },
    match: { entityId: "ent_2", source: { kind: "ALIAS", aliasId: "alias_1" },
             start: 9, end: 15, evidence: "Globex" } },
]
```

The reader was called exactly once with `"proj_parse_7"` (the parse fact's
Project), confirming the Project is derived from the parse and not supplied
independently. The drafts are exactly the accepted T147 output for the accepted
T146 spans — nothing added, replaced, reordered, or repaired.

Error propagation (focused tests 6–8): a
`GeoExactEntityMentionCandidateReaderError` thrown by the reader reaches the
caller as the identical instance (`rejects.toBe(failure)`), proving no
empty-list fallback. A cardinality mismatch (`mentionIds: []` against one
detected match) and a `FAILED` parse both surface the accepted
`GeoExactEntityMentionFactAssemblyError` with `field` `"mentionIds"` /
`"parse.parseStatus"` unchanged.

Evidence preservation (focused test 5): for text `"  Ａcme\nAcme😀Acme  "` the
service returned spans `[7, 11]` and `[13, 17]` with `evidenceText ===
text.slice(start, end)`, i.e. offsets and bytes are the caller's own; the
fullwidth `Ａcme` was not width-folded and the astral emoji kept its two
code-unit width. The input object and the mention-id array were compared against
a `structuredClone` snapshot and are unchanged, and both are held by identity.

Source boundary (focused tests 9–12): the shipped module imports exactly three
accepted contracts and contains exactly one detection call site, one assembly
call site, zero candidate reads, zero matcher or recorder calls, zero
comparisons (`===`/`!==`), zero FAILED/parse-status handling, and zero
`try`/`catch`/`throw`.

Repository-level runtime evidence: the full `vitest run` (216 files / 2201
tests), `oxlint`, both `tsc` projects, `knip`, the three-environment `vite
build`, and the aggregate `ci:check` all exited 0 on this worktree.

## KNOWN LIMITATIONS

- The service is pure composition; it has no production caller yet. Recording,
  parse/current selection, bundle consistency (T143), and every provider/cache
  concern remain later or separate tasks by design, so the new module is
  currently exercised only by its focused tests (which is why `knip` stays
  clean — the test imports it).
- Detection runs before the accepted T147 guard by explicit contract, so a
  `FAILED` parse costs one candidate read before the batch is rejected. This is
  the specified call order, not a defect; the reader is read-only and the guard
  still rejects atomically. Covered and documented by focused test 8.
- The service performs no runtime validation of its own inputs (by task
  requirement: no error handling). A caller that violates the TypeScript
  contract — e.g. passing no parse object at all — fails with a raw
  property-access `TypeError` rather than a domain error. The untrusted-input
  boundary is T146/T147, whose validators reject the malformed values that
  reach them.
- The service returns drafts (facts plus the original match objects), not
  persisted mentions; nothing here proves a storage round trip, because
  persistence is a later task.

## DEVIATIONS FROM TASK

None. In-scope items 1–6 were implemented as written. Specifically:

- Exactly one detection call and exactly one assembly call, in the specified
  order, with the specified arguments; the assembly result is returned
  unchanged.
- No reader/match/filter/sort/dedupe/collision/id-generation/status/persistence
  logic, and no error handling.
- The detection Project is taken exclusively from the parse fact.
- The concrete parse contract reaches the service through the accepted T147
  input type (`Pick<GeoExactEntityMentionFactAssemblyInput, "parse" |
  "mentionIds"> & { text: string }`) rather than a direct
  `geoObservationParseRecorder` import. This keeps the two boundaries from
  drifting apart while still receiving exactly one accepted
  `GeoObservationParseFact`; the focused boundary test documents it.
- No test mocks detection or assembly; the only fake is the injected reader.
- No schema, migration, snapshot, dependency, provider/cache, UI, CRUD/server
  function, credential, publishing, paid, or production behavior was touched.

## SECURITY NOTES

- Scope: implementation only. No merge, no branch switch, no commit, no push, no
  `main` access, no production access, no provider invocation, no credential or
  account access, no Prompt Explorer/R2/application-cache access, no publishing
  or paid action, and no `--dangerously-skip-permissions`.
- The module is storage-free and network-free: its only data access is the
  injected `GeoExactEntityMentionCandidateReader` port. It reads no raw
  observation/response payload, logs nothing, and serializes nothing.
- No secret, token, credential, or personal data is read, written, or logged by
  the service or its tests.
- Fail-closed posture: reader/detection failures and T147 rejections propagate
  by identity and are never converted into an empty or partial draft list, so a
  measurement run cannot silently under-report mentions on a storage error.
- No product scope change; `29_SCOPE_LOCK.md` and all Accepted ADRs are
  untouched.

## GIT STATUS/DIFF SUMMARY

`git status --porcelain --untracked-files=all`:

```
?? src/server/features/search-growth/geo/services/geoExactEntityMentionAssembly.test.ts
?? src/server/features/search-growth/geo/services/geoExactEntityMentionAssembly.ts
```

- `git diff --stat`: empty (no tracked file modified; T146/T147/T144/T145
  accepted sources, repository adapters, schema, and lockfile are all unchanged).
- Working tree contains exactly the two new files listed above; `dist/` build
  output is gitignored. Nothing staged, nothing committed.
- HEAD: `f0ac64d1f0cf3d9b76d63235a3fc06e70a3f2371` (unchanged; no commit made).

## READY FOR REVIEW

READY FOR REVIEW. Focused tests, `format:check`, `types:check`, `lint`, the full
`test` suite, `build`, and `ci:check` all exited 0. Awaiting Codex review; only
Codex can PASS this task. Not merged.
