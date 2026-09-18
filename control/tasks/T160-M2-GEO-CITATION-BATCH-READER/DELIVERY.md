# DELIVERY — T160-M2-GEO-CITATION-BATCH-READER

TASK ID: T160-M2-GEO-CITATION-BATCH-READER
ROUND: Implementation round 1 (no REVIEW.md present)
STATUS: READY FOR REVIEW (Codex is the only acceptance owner)

## IMPLEMENTATION SUMMARY

Added one narrow read-only repository, `GeoCitationBatchReaderRepository`, that
returns the persisted `geo_citations` rows for exactly one Project, one
observation batch, and one parser version.

- **Three required selectors, validated before the query.**
  `readBatchCitations(projectId, batchId, parserVersion)` validates each selector
  as a non-empty string via a Zod schema before any storage access. An unusable
  selector throws `GeoCitationBatchReaderError`, naming the offending field; no
  selector is optional and none is defaulted, coerced, or inferred.
- **One read over the accepted relations.** A single
  `db.select(...).from(geoCitations)` with two `innerJoin`s: citation →
  same-Project versioned parse on `(project_id, id)`, parse → same-Project
  immutable run on `(project_id, id)`. The `WHERE` constrains all three
  selectors: `geoCitations.projectId`, `geoObservationRuns.batchId`, and
  `geoObservationParses.parserVersion`.
- **Version-explicit, never "current".** `parserVersion` is matched by equality
  only. There is no latest-version selection, no `isCurrent` consultation, no
  version collapsing, and no reparse/current-pointer behavior.
- **Rows preserved, plus only the trace identifier.** Each result row is the
  stored citation row verbatim (`$inferSelect` — raw/normalized URL, domain,
  nullable title/position, `sourceOwnership`, and the nullable
  `matchedPublicationReceiptId`) with a single added `runId` from the joined
  parse's run. `parseId` is already a stored citation column. Nothing is
  normalized, parsed, classified, matched, filtered, deduplicated, counted,
  aggregated, or turned into a fraction/rate/metric/confidence.
- **Deterministic, dialect-stable order.** Sorted in one implementation by run
  `repeatIndex`, run id, parse id, then citation id. Sorting in JS (remeda
  `sortBy`) rather than SQL `ORDER BY` avoids SQLite/Postgres collation
  disagreement on text ids; the four stored keys make the order total.
- **Fail loudly.** No `try`/`catch`, no fallback, no default, no `?? []`. An
  empty array is returned only after a successful scoped query and means only
  "this explicit three-part selector matched no stored citation"; a database
  failure propagates to the caller.
- **No write, provider, credential, cache, workflow, parser runtime, URL
  normalizer, publication matcher, UI, server function, or publishing
  behavior.** No INSERT/UPDATE/DELETE/upsert, and no raw observation, receipt,
  publication, entity, or cohort table is read or mutated.

## FILES CHANGED

Added (new, untracked):

- `src/server/features/search-growth/geo/repositories/GeoCitationBatchReaderRepository.ts` (177 lines)
- `src/server/features/search-growth/geo/repositories/GeoCitationBatchReaderRepository.query.test.ts` (846 lines, 23 tests)
- `src/server/features/search-growth/geo/repositories/GeoCitationBatchReaderRepository.boundary.test.ts` (115 lines, 9 tests)

No other file was modified. `control/tasks/T160-M2-GEO-CITATION-BATCH-READER/TASK.md`
shows as ` M` in `git status` but has an empty `git diff --numstat` — the change
is a CRLF/LF working-copy line-ending artifact from dispatch, not a content
edit; this round did not touch it.

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or index change. The repository reads only
existing accepted storage (`geo_citations`, `geo_observation_parses`,
`geo_observation_runs`).

## DEPENDENCIES CHANGED

None. No `package.json`/lockfile change. The implementation reuses already
installed `drizzle-orm`, `remeda`, `zod`, and `@/db`.
`corepack pnpm install --frozen-lockfile` reported "Lockfile is up to date" and
completed without altering the lockfile.

## TESTS ADDED

Two focused test files (32 tests total).

`GeoCitationBatchReaderRepository.query.test.ts` — actual-storage spec against an
in-memory SQLite database built from the real forward migration DDL (0045–0082,
including 0054's direct citation fields and 0082's same-Project matched-receipt
composite FK and its full receipt parent chain), with `PRAGMA foreign_keys = ON`
and `@/db` replaced by that handle so the production code path runs unmodified.
Covers:

- three-selector slice with the exact order `repeatIndex`, run id, parse id,
  citation id, beside a stored other-version citation that would otherwise sort
  next to it (and repeat-call stability);
- cross-Project decoy reusing the batch id, parser version, raw URL, normalized
  URL, domain, and title verbatim;
- cross-batch decoy of the same Project;
- multiple parser versions of one immutable run (v1 and v2 coexist; each read
  returns exactly its own version, no collapse, no "current");
- preservation of every stored citation field, asserted field-for-field against
  a re-SELECT of the stored row with only `runId` added, including an opaque
  raw URL (mixed case, query string, fragment), a `normalizedUrl` that is
  deliberately *not* a normalization of it, a mixed-case domain, a title with
  leading/trailing whitespace and a newline, a position, a real stored
  `matchedPublicationReceiptId` under the 0082 FK, and a second row with every
  optional column NULL and the explicit `UNKNOWN` ownership;
- valid selector matching nothing returns `[]` beside a readable sibling slice,
  for each of the three selectors;
- non-mutation of citation, parse, run, and receipt rows across reads;
- database failure (table renamed) propagates the driver's own
  `no such table: geo_citations` reason instead of becoming an empty list;
- selector validation: numeric, null, undefined, and object values for each of
  the three fields, plus empty-string rejection for each field with a live decoy
  that the empty value would otherwise have matched (proving no query ran).

`GeoCitationBatchReaderRepository.boundary.test.ts` — static source boundary:
exactly one `.select(`/`.from(`, zero writes, exactly two inner joins through the
accepted same-Project keys, no outer joins, no receipt/publication/entity/
mention/prompt/topic storage, all three selector predicates present, the four
ordering keys present, no `isCurrent`/`orderBy`/`desc`/`limit`, `$inferSelect`
reuse instead of a re-declared row type, provider-aware `@/db` only, no raw
payload fields, no normalization/classification/matching tokens, no
count/aggregate/`Math.`/`JSON.`, no `fetch`/env/fs/console/crypto, and no
`try`/`catch`/`?? []`. Every check inspects the source **with its comments
stripped**, so documentation prose can neither satisfy a positive check nor trip
a negative one.

## COMMANDS RUN

All run independently from the worktree root on Windows Git Bash via
`corepack pnpm ...` (bare `pnpm` is not on PATH, and `prettier`/`vitest` are not
on PATH before install). No chained shell operations.

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `corepack pnpm install --frozen-lockfile` | 0 | 980 packages, lockfile unchanged |
| 2 | `corepack pnpm exec prettier --write <3 task files>` | 0 | query spec reformatted; later run all 3 `(unchanged)` |
| 3 | `corepack pnpm exec vitest run <both focused test files>` | 1 → 0 | see note below; final 2 files, 32 tests passed |
| 4 | `corepack pnpm format:check` | 0 | "All matched files use Prettier code style!" |
| 5 | `corepack pnpm types:check` | 0 | `tsc --noEmit` clean |
| 6 | `corepack pnpm lint` | 0 | 0 warnings, 0 errors, 992 files |
| 7 | `corepack pnpm test` | 0 | 233 files, 2468 tests passed |
| 8 | `corepack pnpm build` | 0 | `vite build && tsc --noEmit` succeeded |
| 9 | `corepack pnpm ci:check` | 0 | prettier + knip + tsc (`badseo` too) + oxlint + plugin-skill sync all clean |

Note on #3: the first focused run exited 1 with exactly one failure — the
empty-`projectId` decoy fixture died on the `search_topics` → `projects` foreign
key because the test database never created a Project row for the empty id. The
fix was a test-only `ensureProject` insert (`INSERT OR IGNORE INTO projects`),
matching the fixture pattern T159 used; no production code and no assertion
changed. Every gate in #4–#9 was then run **after** that fix and after the final
formatting pass, so the exits above correspond to the exact delivered file
contents.

## COMMAND RESULTS

- Focused: **2 test files passed, 32 tests passed** (query spec 23, boundary 9).
- Full suite: **233 test files passed, 2468 tests passed**, 0 failed.
- Lint: **0 warnings and 0 errors** across 992 files.
- Build: production `vite` build completed for the client, `ssr`, and
  `open_seo_audit` worker environments, then `tsc --noEmit` clean.
- `ci:check`: completed the full chain through
  `plugin skill sync clean: plugins/openseo/skills`.
- `format:check`: no formatting drift.

All required gates ran to completion with exit 0. No aggregate gate was
sandbox-denied and no bypass was used.

## RUNTIME EVIDENCE

- The 23-test query spec executes the shipped adapter against a real in-memory
  SQLite database created from the actual migration DDL (0050 runs, 0051/0053
  parses, 0054 citations, 0082 citations same-Project receipt rebuild) with
  foreign keys enforced. Isolation, ordering, field/receipt preservation,
  empty-read, non-mutation, and error-propagation assertions are evaluated
  against real SQL results, not mocks.
- The database-failure test renames `geo_citations` mid-test and asserts the
  surfaced failure contains the driver's own `no such table: geo_citations`
  reason — dynamic evidence that a broken read cannot masquerade as `[]`.
- The full-suite, build, and `ci:check` runs are the aggregate-gate evidence. No
  production, provider, credential, publishing, or network action was performed.

## KNOWN LIMITATIONS

- The order key `parse id` is effectively unreachable as a tiebreaker under a
  single `parserVersion` selector, because `(run_id, parser_version)` is unique
  in storage, so two rows sharing a run cannot carry different parse ids for the
  same version. The key is retained because TASK.md mandates that exact order;
  it is harmless and remains correct if that uniqueness ever changes.
- Selector validation rejects empty and non-string values; a whitespace-only
  string is treated as a non-empty key, consistent with the "non-empty string"
  contract.
- No service or server-function wrapper is added; TASK.md scopes this to the
  repository read only, and the reader is a deliberate leaf for a later citation
  measurement caller.
- The receipt-parent fixture graph in the query spec is written out locally
  rather than shared with `GeoCitationRecorderRepository.query.test.ts`. The
  repository has no shared geo fixture module, and extracting one would mean
  editing an accepted T142 test file, which is outside this task's scope.

## DEVIATIONS FROM TASK

None. The implementation adds no selector, no filter, no default, and no meaning
beyond the TASK.md contract. The one round-1 failure described under COMMANDS RUN
#3 was a test-fixture gap (no Project row for the empty-selector decoy), fixed
in the test file only; no assertion was weakened and no production behavior
changed.

## SECURITY NOTES

- Read-only: the module contains no write path of any kind (no
  INSERT/UPDATE/DELETE/upsert/cache) and no second query.
- No provider, network, credential, account, Prompt Explorer/R2, application
  cache, publishing, paid, or production behavior is touched. No CAPTCHA/2FA
  handling, no stealth behavior, and no cookie handling.
- Raw observation payload columns (`rawAnswer`, `rawResponse`) are never
  selected, and no raw evidence is read or mutated. No receipt or publication
  row is read or matched, so the stored `matchedPublicationReceiptId` is passed
  through as an opaque stored value only.
- Failures propagate; there is no catch/fallback that could hide a broken read.
- No secrets or sensitive data are logged (the module has no logging).

## GIT STATUS/DIFF SUMMARY

`git status --porcelain` at delivery:

```
 M control/tasks/T160-M2-GEO-CITATION-BATCH-READER/TASK.md
?? src/server/features/search-growth/geo/repositories/GeoCitationBatchReaderRepository.boundary.test.ts
?? src/server/features/search-growth/geo/repositories/GeoCitationBatchReaderRepository.query.test.ts
?? src/server/features/search-growth/geo/repositories/GeoCitationBatchReaderRepository.ts
```

- `git diff --numstat` for tracked files: empty (the `TASK.md` `M` is a CRLF/LF
  working-copy artifact with no content diff).
- Net new: 3 files, 1138 lines, all additive and untracked. No file was deleted
  or renamed. `ci:check`'s plugin-skill sync produced no file changes.
- Not committed, not merged, not pushed — per task constraints.

## READY FOR REVIEW

READY FOR REVIEW. All acceptance-criteria tests pass and all required gates ran
to exit 0. No gate was skipped or bypassed, and no production publishing was
performed. Awaiting Codex acceptance.
