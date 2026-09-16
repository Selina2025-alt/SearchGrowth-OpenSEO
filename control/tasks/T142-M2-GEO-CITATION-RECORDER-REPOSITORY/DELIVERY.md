# DELIVERY — T142-M2-GEO-CITATION-RECORDER-REPOSITORY

ROUND: 1 of 3
STATUS: implementation complete, awaiting Codex review

## TASK ID

T142-M2-GEO-CITATION-RECORDER-REPOSITORY

## IMPLEMENTATION SUMMARY

Added one credential-free persistence port and one repository adapter that turn
exactly one accepted `GeoCitationFact` into exactly one append-only
`geo_citations` INSERT using the accepted T108/T136 schema.

- **Port** — `geoCitationRecorder.ts` defines the storage-free `GeoCitationFact`
  contract (identity + `projectId` + concrete `parseId` + `rawUrl` +
  `normalizedUrl` + `domain` + optional `title`/`position` + the accepted
  `sourceOwnership` + optional `matchedPublicationReceiptId`) and the
  `GeoCitationRecorder` port with a single `record(fact): Promise<void>`. It
  names no table, driver, or schema, so a producer can be exercised against an
  in-process fake recorder (mirrors the T141 `GeoEntityMentionRecorder` and T140
  `GeoObservationParseRecorder` ports in the same `services/` directory).
- **Adapter** — `GeoCitationRecorderRepository.ts` re-validates the runtime trust
  boundary with Zod, then performs one `db.insert(geoCitations)`. Every accepted
  column is taken from the fact; `created_at` keeps its existing database default
  and is the only synthesized value.
- **No workflow.** There is no URL parser/canonicalizer, citation extraction
  runtime, entity matching, attribution, receipt matching, evidence parsing,
  provider call, cache access, batch orchestration, UI, CRUD, server function,
  migration, schema field, enum, snapshot, or dependency change.

## FACT-TO-STORAGE MAPPING

| Fact member | Fact type (runtime rule) | `geo_citations` column | Stored value |
| --- | --- | --- | --- |
| `id` | nonempty string | `id` (PK) | verbatim |
| `projectId` | nonempty string | `project_id` | verbatim |
| `parseId` | nonempty string | `parse_id` | verbatim (composite FK `(project_id, parse_id)`) |
| `rawUrl` | nonempty string | `raw_url` (NOT NULL) | verbatim; opaque, never normalized |
| `normalizedUrl` | nonempty string | `normalized_url` (NOT NULL) | verbatim; caller-supplied identity, not derived |
| `domain` | nonempty string | `domain` (NOT NULL) | verbatim; never re-derived from the URL |
| `title` | string or explicit `null` | `title` | verbatim; `null` → SQL NULL |
| `position` | integer or explicit `null` | `position` | verbatim; `null` → SQL NULL, `0` preserved |
| `sourceOwnership` | accepted canonical enum | `source_ownership` (NOT NULL) | verbatim; never classified or defaulted |
| `matchedPublicationReceiptId` | string or explicit `null` | `matched_publication_receipt_id` | verbatim (composite FK `(project_id, matched_publication_receipt_id)`); `null` → SQL NULL, never matched or substituted |
| *(absent)* | — | `created_at` | **database default `(current_timestamp)` only** |

No other column is written, and no written value is derived, inferred,
normalized, classified, matched, or substituted.

## VALIDATION BEHAVIOR

Validation runs before the INSERT, in the adapter, because the TypeScript fact
type does not exist at runtime:

- `id`, `projectId`, `parseId`, `rawUrl`, `normalizedUrl`, `domain` —
  `z.string().min(1)`. A missing, empty, or non-string identifier is rejected
  rather than trimmed, defaulted, or substituted.
- `sourceOwnership` — the accepted `citationSourceOwnershipSchema` from
  `src/types/schemas/geo-citation.ts` (itself derived from
  `geoCitations.sourceOwnership.enumValues`) is reused verbatim, so validation
  cannot drift from the domain contract. Lowercase (`owned_domain`), mixed-case,
  an unsupported value (`PARTNER`), an empty string, a number, `null`, and an
  absent member are all rejected; UNKNOWN is an explicit value, never an
  implicit fallback.
- `title`, `matchedPublicationReceiptId` — `z.string().nullable()`. Only a
  string or an explicit `null` passes; a number, a boolean, and an absent member
  are rejected. No URL parsing, receipt matching, or value synthesis occurs.
- `position` — `z.number().int().nullable()`. Only an integer or an explicit
  `null` passes. A fraction (`1.5`), `NaN`, `Infinity`, a numeric string
  (`"3"`), a word, and an absent member are rejected; nothing is rounded,
  parsed, ranked, or coerced.
- **Absent ≠ null.** A missing optional member is rejected, not treated as NULL:
  "nothing was recorded" is a fact the caller must state explicitly, so there is
  no fallback to substitute.
- Rejections throw a `GEO citation recorder: refusing to persist an invalid
  citation fact (<failed field paths>)` error naming every failed field path.

## APPEND-ONLY AND ERROR EVIDENCE

- One supplied fact produces exactly one row; the adapter source contains exactly
  one `db.insert(geoCitations)` and no `.update(`, `.set(`, `.delete(`, or
  `.onConflict` anywhere.
- **No new uniqueness rule.** Two facts naming the same parse with the same raw
  and normalized URL persist as two independent rows (asserted in real SQL);
  the migration reference's `(run_id, normalized_url)` unique index is still
  intentionally not shipped.
- Cross-Project parse, cross-Project receipt, and dangling parse/receipt parents
  surface as the accepted composite-FK `FOREIGN KEY constraint failed` error and
  write no row. Nothing is retried, swallowed, repaired, or nulled.
- Raw run, parse, entity mention, publication receipt, release target, tracked
  entity, and alias rows are byte-identical after recording (captured
  before/after in real SQL; mentions, entities, and aliases are additionally
  asserted empty). No release/bundle/job/plan row is written or modified.
- Parse-version isolation is structural: the fact binds the concrete `parseId`,
  so a parser upgrade appends beside the prior version's citations rather than
  rewriting them. No current-pointer selection exists.

## DATABASE/MIGRATION CHANGES

None. No migration, schema file, schema field, enum, or snapshot was added or
edited. The adapter writes only the accepted columns of the existing
`geo_citations` table (migrations 0054 and the 0082 rebuild that adds the
same-Project matched-receipt FK). `drizzle/` and `drizzle-pg/` are untouched.

## DEPENDENCIES CHANGED

None. `package.json` and `pnpm-lock.yaml` are unmodified (verified with
`git status --porcelain` after install; no lockfile output). No new runtime or
dev dependency was added.

## TESTS ADDED

`src/server/features/search-growth/geo/repositories/GeoCitationRecorderRepository.query.test.ts`
— 41 tests over real SQLite built from the shipped forward migration DDL
(0045, 0046, 0048–0054 for the parse chain and the citation table, the
publication-receipt parent chain 0055–0057, 0060–0064, 0067–0070, 0078, 0080,
0081, and 0082 for the matched-receipt composite FK) with
`PRAGMA foreign_keys = ON`. `@/db` is replaced with the real libsql handle, so
the production adapter path runs unmodified.

Coverage of the TASK §4 list:

| Required invariant | Tests |
| --- | --- |
| Faithful valid mapping (all columns, DB `created_at` default) | 1 |
| Every canonical ownership value round-trips | 1 |
| Nullable/present title/position/receipt mapping (real value vs SQL NULL, `0` preserved) | 1 |
| Multiple facts remain independent (no uniqueness rule) | 1 |
| Cross-Project Parse rejection | 1 |
| Dangling Parse rejection | 1 |
| Cross-Project Receipt rejection | 1 |
| Dangling Receipt rejection | 1 |
| Raw run/parse/mention/receipt/release unchanged | 1 |
| Invalid runtime values rejected before a row | 31 (12 identifiers/URLs, 7 ownership, 3 title, 6 position, 3 receipt id) |
| Source boundary: one insert, no other table write | 1 |

Existing dual-dialect schema parity is retained and re-run unchanged
(`src/db/schema-parity.test.ts`, 369 tests) alongside the accepted citation
storage spec (`src/db/geo-citation.test.ts`, 12 tests) and the accepted citation
schema boundary spec (`src/types/schemas/geo-citation.test.ts`, 3 tests). No
migration was created, so no new parity artifact was needed.

## COMMANDS RUN

Run independently on this Windows Git Bash executor via `corepack pnpm`:

1. `corepack pnpm install --frozen-lockfile` (worktree bootstrap)
2. `corepack pnpm exec vitest run src/server/features/search-growth/geo/repositories/GeoCitationRecorderRepository.query.test.ts`
3. `corepack pnpm exec vitest run src/db/schema-parity.test.ts src/db/geo-citation.test.ts src/types/schemas/geo-citation.test.ts`
4. `corepack pnpm exec prettier --write <3 task files>`
5. `corepack pnpm format:check`
6. `corepack pnpm types:check`
7. `corepack pnpm lint`
8. `corepack pnpm test`
9. `corepack pnpm build`
10. `corepack pnpm ci:check`
11. Read-only: `git status --porcelain`, `git diff --stat`, `git log`, `git show`

## COMMAND RESULTS

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `install --frozen-lockfile` | 0 | `Done in 30.4s using pnpm v10.30.1`; `node_modules` was absent in this isolated worktree before it. Lockfile unchanged ("Lockfile is up to date"); only the standard "Ignored build scripts" advisory was printed. |
| 2 | focused citation recorder | 0 | **1 file / 41 tests passed** |
| 3 | focused + parity set | 0 | **3 files / 384 tests passed** (369 + 12 + 3) |
| 4 | `prettier --write <task files>` | 0 | 2 files unchanged, 1 reformatted |
| 5 | `format:check` | 0 | `All matched files use Prettier code style!` |
| 6 | `types:check` | 0 | no output (clean) |
| 7 | `lint` | 0 | `Found 0 warnings and 0 errors` (947 files, 10.3s) |
| 8 | `test` | 0 | **208 files / 2089 tests passed** (100.34s) |
| 9 | `build` | 0 | client + SSR + `open_seo_audit` worker built; `tsc --noEmit` inside it clean |
| 10 | `ci:check` | 0 | prettier + knip + `tsc` (app and `badseo`) + oxlint + plugin-skill sync all clean |

Intermediate correction during this round, before the final results above:
`lint` first failed once with `eslint-plugin-unicorn(no-array-sort)` in the new
test (reviewing the ownership set used `Array#sort` on the mapped array); fixed
by using the repository's existing `sort` helper from `remeda` (as
`src/db/geo-citation.test.ts` does), after which `prettier --write` was re-run
on the file because the added import changed formatting. Every gate was re-run
to exit 0 on the final code; no gate was bypassed or skipped.

## RUNTIME EVIDENCE

The focused declaration is real-storage, not mocked: an in-memory libsql SQLite
database is created from the actual shipped `drizzle/*.sql` forward migrations
with foreign keys enabled, `@/db` is replaced by that handle, and the production
adapter is imported and invoked unmodified. The suite demonstrates, against real
SQL:

- one fact → exactly one row with every accepted column faithful and the DB
  `created_at` default applied; `rawUrl` (`...?utm_source=chatgpt`),
  `normalizedUrl`, and `domain` are stored byte-for-byte with no normalization;
- all five canonical ownership values (`OWNED_DOMAIN`,
  `CONTROLLED_PUBLICATION`, `EARNED_THIRD_PARTY`, `COMPETITOR`, `UNKNOWN`)
  round-trip;
- a real title/position/receipt persist; explicit `null`s persist as SQL NULL;
  `position: 0` is preserved and does not collapse to NULL;
- two facts for the same parse and same URLs persist as two independent rows;
- cross-Project parse (`parse_beta` under `proj_beta` claimed as `proj_alpha`),
  cross-Project receipt (`receipt_beta` under `proj_beta` claimed as
  `proj_alpha`), and dangling `parse_missing` / `receipt_missing` references all
  raise `FOREIGN KEY constraint failed` and leave the table empty;
- after recording two citations the raw run, parse, publication-receipt, and
  release-target rows are identical to their pre-record snapshots, and the entity
  mention, tracked entity, and alias tables stay empty;
- each invalid runtime value is rejected before any row exists (the assertion
  also proves zero rows were written).

The adapter source boundary is asserted separately: exactly one
`db.insert(geoCitations)`, no update/set/delete/onConflict, and no raw run,
parse, entity mention, publication receipt, or release table named as a Drizzle
argument.

No provider call, network access, credential use, cache access, or publishing
behavior was involved at any point.

## KNOWN LIMITATIONS

- The port and adapter are intentionally unwired: no server function, service,
  or producer consumes `GeoCitationRecorder` yet. The consuming extraction/
  attribution workflow is a later task, so the adapter is currently reachable
  only from its test.
- `rawUrl`, `normalizedUrl`, `domain`, and `sourceOwnership` are stored as
  caller-supplied opaque facts. This slice deliberately contains no URL
  normalization, domain derivation, ownership classification, or receipt
  matching (07_GEO_MEASUREMENT_SPEC.md §8 belongs to later tasks), so a caller
  that hands over unclassified values simply persists them.
- `position` is a plain integer fact; no ranking, ordinal, or gap semantics are
  defined or enforced beyond "integer or null".
- Tests run on the SQLite/D1 dialect (as the established repository query-test
  pattern does). Postgres parity is covered structurally by
  `src/db/schema-parity.test.ts` (369 tests, green), not by executing the
  adapter against a live Postgres instance.

## DEVIATIONS FROM TASK

None material.

- The focused test file declares `/* eslint-disable max-lines -- ... */`. This is
  the repository's existing precedent for a single migration-backed storage spec
  (`src/db/geo-citation.test.ts` line 1) and is disclosed here. No lint rule was
  globally weakened and no other file is affected.
- The test's migration fixture list spans the full publication-receipt parent
  chain (0055–0082) beyond the 0054 head T108 used, because the accepted
  same-Project matched-receipt composite FK on `geo_citations` is added by the
  0082 rebuild and a real receipt fixture is required to prove valid mapping,
  cross-Project rejection, dangling rejection, and receipt immutability. Every
  file in the list is already-shipped and accepted; none was created or
  modified.
- `matchedPublicationReceiptId` follows the TASK wording exactly — "a string or
  an explicit `null`" — so `z.string().nullable()` is used rather than
  `z.string().min(1).nullable()`. An empty-string reference is therefore a
  storage-level dangling reference rejected by the composite FK, not a
  boundary-level rejection; it is not a coercible stand-in.
- `corepack pnpm install --frozen-lockfile` was used once because this isolated
  worktree had no `node_modules`. TASK §6 explicitly permits this; it is recorded
  here and above. Every final gate ran after it.

## SECURITY NOTES

- No credentials, tokens, API keys, cookies, accounts, `.env` files, or secrets
  were read, written, logged, or transmitted.
- No real provider (DataForSEO, GA4, GSC, LLM, or model-API) was invoked; no
  network or paid action occurred.
- No Prompt Explorer, R2, application-cache, or production resource was
  accessed. No prompt-runner, browser, or stealth behavior exists.
- No publishing behavior was run; no draft/submitted/taskSetId/button-click
  state is treated as published.
- No CAPTCHA/2FA was bypassed. No `--dangerously-skip-permissions` was used.
- The adapter performs a single local INSERT into a caller-scoped Project row;
  same-Project ownership of both the Parse and the optional Receipt is enforced
  by the accepted database composite FKs rather than by application trust.
- Validation rejects unknown/coercible runtime values before they reach storage,
  so a malformed fact cannot persist a misleading citation or ownership claim.

## GIT STATUS/DIFF SUMMARY

`git status --porcelain` (final):

```text
?? control/tasks/T142-M2-GEO-CITATION-RECORDER-REPOSITORY/
?? src/server/features/search-growth/geo/repositories/GeoCitationRecorderRepository.query.test.ts
?? src/server/features/search-growth/geo/repositories/GeoCitationRecorderRepository.ts
?? src/server/features/search-growth/geo/services/geoCitationRecorder.ts
```

`git diff --stat` — empty (no tracked file modified).

Changed paths:

- `src/server/features/search-growth/geo/services/geoCitationRecorder.ts` (new)
- `src/server/features/search-growth/geo/repositories/GeoCitationRecorderRepository.ts` (new)
- `src/server/features/search-growth/geo/repositories/GeoCitationRecorderRepository.query.test.ts` (new)
- `control/tasks/T142-M2-GEO-CITATION-RECORDER-REPOSITORY/DELIVERY.md` (this file)

No commit, merge, push, or branch change was made. `main` was not touched.
`node_modules`, `dist/`, and other build output are gitignored and absent from
status.

## READY FOR REVIEW

Ready for Codex review. All TASK §6 commands were run on the final code and
exited 0; the focused suite, full suite, and every aggregate gate are recorded
above with their exact results. No acceptance criterion was weakened, no scope
was added, and no production behavior was invoked.

Only Codex can PASS this task.
