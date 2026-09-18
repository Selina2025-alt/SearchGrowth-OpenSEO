# DELIVERY — T159-M2-GEO-ENTITY-MENTION-BATCH-READER

TASK ID: T159-M2-GEO-ENTITY-MENTION-BATCH-READER
ROUND: Implementation round 1 (no REVIEW.md present)
STATUS: READY FOR REVIEW (Codex is the only acceptance owner)

## IMPLEMENTATION SUMMARY

Added one narrow read-only repository, `GeoEntityMentionBatchReaderRepository`,
that returns the persisted `geo_entity_mentions` rows for exactly one Project,
one observation batch, one tracked entity, and one parser version.

- **Four required selectors, validated before the query.** `readBatchMentions(projectId, batchId, entityId, parserVersion)`
  validates each of the four selectors as a non-empty string via a Zod schema
  before any storage access. An unusable selector throws
  `GeoEntityMentionBatchReaderError`, naming the offending field; no selector is
  optional and none is defaulted, coerced, or inferred.
- **One read over the accepted relations.** A single `db.select(...).from(geoEntityMentions)`
  with two `innerJoin`s: mention → same-Project versioned parse on
  `(project_id, id)`, parse → same-Project immutable run on `(project_id, id)`.
  The `WHERE` constrains all four selectors: `geoEntityMentions.projectId`,
  `geoObservationRuns.batchId`, `geoEntityMentions.entityId`, and
  `geoObservationParses.parserVersion`.
- **Version-explicit, never "current".** `parserVersion` is matched by equality
  only. There is no latest-version selection, no `isCurrent` consultation, no
  version collapsing, and no reparse/current-pointer behavior.
- **Rows preserved, plus only the trace identifiers.** Each result row is the
  stored mention row verbatim (`$inferSelect`, including the stored `mentioned`
  verdict and every nullable field) with a single added `runId` from the joined
  parse's run. `parseId` is already a stored mention column. Nothing is parsed,
  normalized, inferred, filtered, deduplicated, counted, aggregated, or turned
  into a fraction/rate/metric/confidence.
- **Deterministic, dialect-stable order.** Sorted in one implementation by run
  `repeatIndex`, run id, parse id, then mention id. Sorting in JS (remeda
  `sortBy`) rather than SQL `ORDER BY` avoids SQLite/Postgres collation
  disagreement on text ids; the four stored keys make the order total.
- **Fail loudly.** No `try`/`catch`, no fallback, no default, no `?? []`. An
  empty array is returned only after a successful scoped query and means only
  "this explicit four-part selector matched no stored mention"; a database
  failure propagates to the caller.
- **No write, provider, credential, cache, workflow, parser runtime, UI, server
  function, or publishing behavior.** No INSERT/UPDATE/DELETE/upsert, and no
  raw observation, entity, alias, or cohort table is read or mutated.

A prior session in this worktree had already produced the three files below;
this round verified them against TASK.md, corrected one imprecise test fixture
(the cross-entity decoy now genuinely shares its run and parse, matching its
stated intent), formatted, and ran the full gate set to exact exits.

## FILES CHANGED

Added (new, untracked):

- `src/server/features/search-growth/geo/repositories/GeoEntityMentionBatchReaderRepository.ts` (179 lines)
- `src/server/features/search-growth/geo/repositories/GeoEntityMentionBatchReaderRepository.query.test.ts` (783 lines, 29 tests)
- `src/server/features/search-growth/geo/repositories/GeoEntityMentionBatchReaderRepository.boundary.test.ts` (101 lines, 9 tests)

No other file was modified. `control/tasks/T159-M2-GEO-ENTITY-MENTION-BATCH-READER/TASK.md`
shows as ` M` in `git status` but has an empty `git diff --numstat` — the change
is a CRLF/LF working-copy line-ending artifact from dispatch, not a content
edit; this round did not touch it.

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or index change. The repository reads only
existing accepted storage (`geo_entity_mentions`, `geo_observation_parses`,
`geo_observation_runs`).

## DEPENDENCIES CHANGED

None. No `package.json`/lockfile change. The implementation reuses already
installed `drizzle-orm`, `remeda`, `zod`, and `@/db`.

## TESTS ADDED

Two focused test files (38 tests total).

`GeoEntityMentionBatchReaderRepository.query.test.ts` — actual-storage spec
against an in-memory SQLite database built from the real forward migration DDL
(0045–0053), with `PRAGMA foreign_keys = ON` and `@/db` replaced by that handle
so the production code path runs unmodified. Covers:

- four-selector slice with the exact order `repeatIndex`, run id, parse id,
  mention id (and repeat-call stability);
- cross-Project decoy reusing the batch id and parser version verbatim;
- cross-batch decoy of the same Project reusing entity and parser version;
- cross-entity decoy on the same run and parse;
- multiple parser versions of one run (v1 and v2 coexist; each read returns
  exactly its own version, no collapse, no "current");
- preservation of both stored verdicts and every stored field (including all
  NULLs and a stored `false`), asserted field-for-field against a re-SELECT of
  the stored row with only `runId` added;
- valid selector matching nothing returns `[]` beside a readable sibling slice;
- non-mutation of run, parse, mention, and entity rows across reads;
- database failure (table renamed) propagates the driver's own reason instead
  of becoming an empty list;
- selector validation: numeric, null, undefined, and object values for each of
  the four fields, plus empty-string rejection for each field with a live decoy
  that the empty value would otherwise have matched (proving no query ran).

`GeoEntityMentionBatchReaderRepository.boundary.test.ts` — static source
boundary: exactly one `.select(`/`.from(`, zero writes, exactly two inner joins
through the accepted same-Project keys, no outer joins, no
entity/alias/citation/prompt/topic storage, all four selector predicates
present, the four ordering keys present, no `isCurrent`/`orderBy`/`desc`/`limit`,
`$inferSelect` reuse instead of a re-declared row type, provider-aware `@/db`
only, no raw payload fields, no match/count/aggregate/`Math.`/`JSON.`, no
`fetch`/env/fs/console/crypto, and no `try`/`catch`/`?? []`.

## COMMANDS RUN

All run independently from the worktree root on Windows Git Bash via
`corepack pnpm ...` (bare `pnpm` is not on PATH). No chained shell operations.

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `corepack pnpm exec prettier --write <3 task files>` | 0 | all 3 `(unchanged)` — already formatted |
| 2 | `corepack pnpm exec vitest run <both focused test files>` | 0 | 2 files, 38 tests passed |
| 3 | `corepack pnpm format:check` | 0 | "All matched files use Prettier code style!" |
| 4 | `corepack pnpm types:check` | 0 | `tsc --noEmit` clean |
| 5 | `corepack pnpm lint` | 0 | 0 warnings, 0 errors, 989 files |
| 6 | `corepack pnpm test` | 0 | 231 files, 2436 tests passed |
| 7 | `corepack pnpm build` | 0 | `vite build && tsc --noEmit` succeeded |
| 8 | `corepack pnpm ci:check` | 0 | prettier + knip + tsc (`badseo` too) + oxlint + plugin-skill sync all clean |

Commands 2–8 were run again after the final test-file edit (round-1 fixture
correction) so the exits above correspond to the exact delivered file contents.

## COMMAND RESULTS

- Focused: **2 test files passed, 38 tests passed** (query spec 29, boundary 9),
  ~7.5 s after warm transform.
- Full suite: **231 test files passed, 2436 tests passed**, 0 failed.
- Lint: **0 warnings and 0 errors** across 989 files.
- Build: production `vite` build completed for both the app and
  `open_seo_audit` worker environments, then `tsc --noEmit` clean.
- `ci:check`: completed the full chain through
  `plugin skill sync clean: plugins/openseo/skills`.
- `format:check`: no formatting drift; all files Prettier-clean.

All required gates ran to completion with exit 0. No gate was sandbox-denied
and no bypass was used.

## RUNTIME EVIDENCE

- The 29-test query spec executes the shipped adapter against a real in-memory
  SQLite database created from the actual migration DDL (0050 runs, 0051
  parses, 0052 mentions, 0053 same-Project rebuilds) with foreign keys
  enforced. Isolation, ordering, verdict/field preservation, empty-read,
  error-propagation, and non-mutation assertions are evaluated against real SQL
  results, not mocks.
- The database-failure test renames `geo_entity_mentions` mid-test and asserts
  the surfaced failure contains the driver's own `no such table:
  geo_entity_mentions` reason — dynamic evidence that a broken read cannot
  masquerade as `[]`.
- The full-suite and build runs are the aggregate-gate evidence. No production,
  provider, credential, publishing, or network action was performed.

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
  repository read only, and the reader is a deliberate leaf for a later
  entity-mention measurement caller.

## DEVIATIONS FROM TASK

None. The implementation adds no selector, no filter, no default, and no
meaning beyond the TASK.md contract. The only round-1 change to pre-existing
work was making the cross-entity test decoy share its run and parse with the
kept row, which tightens (does not weaken) the isolation assertion and matches
the test's own stated intent.

## SECURITY NOTES

- Read-only: the module contains no write path of any kind (no
  INSERT/UPDATE/DELETE/upsert/cache) and no second query.
- No provider, network, credential, account, Prompt Explorer/R2, application
  cache, publishing, paid, or production behavior is touched. No CAPTCHA/2FA
  handling, no stealth behavior, and no cookie handling.
- Raw observation payload columns (`rawAnswer`, `rawResponse`) are never
  selected, and no raw evidence is read or mutated.
- Failures propagate; there is no catch/fallback that could hide a broken read.
- No secrets or sensitive data are logged (the module has no logging).

## GIT STATUS/DIFF SUMMARY

`git status --porcelain` at delivery:

```
 M control/tasks/T159-M2-GEO-ENTITY-MENTION-BATCH-READER/TASK.md
?? src/server/features/search-growth/geo/repositories/GeoEntityMentionBatchReaderRepository.boundary.test.ts
?? src/server/features/search-growth/geo/repositories/GeoEntityMentionBatchReaderRepository.query.test.ts
?? src/server/features/search-growth/geo/repositories/GeoEntityMentionBatchReaderRepository.ts
```

- `git diff --stat` for tracked files: empty (the `TASK.md` `M` is a CRLF/LF
  working-copy artifact with no content diff).
- Net new: 3 files, 1063 lines, all additive and untracked. No file was
  deleted or renamed. `ci:check`'s plugin-skill sync produced no file changes.
- Not committed, not merged, not pushed — per task constraints.

## READY FOR REVIEW

READY FOR REVIEW. All acceptance-criteria tests pass and all required gates ran
to exit 0. No gate was skipped or bypassed, and no production publishing was
performed. Awaiting Codex acceptance.
