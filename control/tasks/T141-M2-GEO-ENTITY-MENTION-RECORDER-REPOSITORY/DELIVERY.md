# DELIVERY — T141-M2-GEO-ENTITY-MENTION-RECORDER-REPOSITORY

ROUND: 1 of 3
STATUS: implementation complete, awaiting Codex review

## TASK ID

T141-M2-GEO-ENTITY-MENTION-RECORDER-REPOSITORY

## IMPLEMENTATION SUMMARY

Added one credential-free persistence port and one repository adapter that turn
exactly one accepted `GeoEntityMentionFact` into exactly one append-only
`geo_entity_mentions` INSERT using the accepted T107 Round 2 schema.

- **Port** — `geoEntityMentionRecorder.ts` defines the storage-free
  `GeoEntityMentionFact` contract (identity + `projectId` + concrete `parseId` +
  `entityId` + `mentioned` + the four optional members) and the
  `GeoEntityMentionRecorder` port with a single `record(fact): Promise<void>`.
  It names no table, driver, or schema, so a producer can be exercised against
  an in-process fake recorder (mirrors the T140
  `GeoObservationParseRecorder` port in the same `services/` directory).
- **Adapter** — `GeoEntityMentionRecorderRepository.ts` re-validates the runtime
  trust boundary with Zod, then performs one `db.insert(geoEntityMentions)`.
  Every accepted column is taken from the fact; `created_at` keeps its existing
  database default and is the only synthesized value.
- **No workflow.** There is no entity matcher, alias lookup, raw-response
  inspection, entity/citation extraction runtime, recommendation/sentiment/
  position computation, parser/reparse/current-pointer workflow, provider call,
  cache access, batch orchestration, UI, CRUD, server function, migration,
  schema field, enum, snapshot, or dependency change.

## FACT-TO-STORAGE MAPPING

| Fact member | Fact type (runtime rule) | `geo_entity_mentions` column | Stored value |
| --- | --- | --- | --- |
| `id` | nonempty string | `id` (PK) | verbatim |
| `projectId` | nonempty string | `project_id` | verbatim |
| `parseId` | nonempty string | `parse_id` | verbatim (composite FK `(project_id, parse_id)`) |
| `entityId` | nonempty string | `entity_id` | verbatim (composite FK `(project_id, entity_id)`) |
| `mentioned` | boolean | `mentioned` (NOT NULL) | verbatim; `false` stored as `false`, never collapsed to NULL |
| `recommended` | boolean or explicit `null` | `recommended` | verbatim; `null` → SQL NULL |
| `mentionPosition` | integer or explicit `null` | `mention_position` | verbatim; `null` → SQL NULL |
| `sentiment` | string or explicit `null` | `sentiment` | verbatim free text (§7 `sentiment?`; V1.0 defines no enum, none invented) |
| `evidenceText` | string or explicit `null` | `evidence_text` | verbatim; `null` → SQL NULL |
| *(absent)* | — | `created_at` | **database default `(current_timestamp)` only** |

No other column is written, and no written value is derived, inferred,
normalized, matched, or substituted.

## VALIDATION BEHAVIOR

Validation runs before the INSERT, in the adapter, because the TypeScript fact
type does not exist at runtime:

- `id`, `projectId`, `parseId`, `entityId` — `z.string().min(1)`. A missing,
  empty, or non-string identifier is rejected rather than defaulted.
- `mentioned` — `z.boolean()`. A string (`"true"`), a number, `0`, `null`, or an
  absent member is rejected; `0`/`1` are not accepted as booleans.
- `recommended` — `z.boolean().nullable()`. Only a boolean or an explicit `null`
  passes; `"true"`, `1`, `0`, and an absent member are rejected.
- `mentionPosition` — `z.number().int().nullable()`. Only an integer or an
  explicit `null` passes. A fraction (`1.5`), `NaN`, `Infinity`, a numeric
  string (`"3"`), a word, and an absent member are rejected; nothing is rounded,
  parsed, or coerced.
- `sentiment`, `evidenceText` — `z.string().nullable()`. Only a string or an
  explicit `null` passes; a number, a boolean, and an absent member are
  rejected.
- **Absent ≠ null.** A missing optional member is rejected, not treated as NULL:
  "the parser recorded no value" is a fact the caller must state explicitly, so
  there is no fallback to substitute.
- Rejections throw a `GEO entity mention recorder: refusing to persist an invalid
  mention fact (<failed field paths>)` error naming every failed field path.

## APPEND-ONLY AND ERROR EVIDENCE

- One supplied fact produces exactly one row; the adapter source contains exactly
  one `db.insert(geoEntityMentions)` and no `.update(`, `.set(`, `.delete(`, or
  `.onConflict` anywhere.
- **No new uniqueness rule.** Two facts naming the same parse and the same entity
  persist as two independent rows (asserted in real SQL).
- Cross-Project parse, cross-Project entity, and dangling parse/entity parents
  surface as the accepted composite-FK `FOREIGN KEY constraint failed` error and
  write no row. Nothing is retried, swallowed, or repaired.
- Raw run, parse, tracked entity, alias, and citation rows are byte-identical
  after recording (captured before/after in real SQL; aliases and citations are
  additionally asserted empty).
- Parse-version isolation is structural: the fact binds the concrete `parseId`,
  so a parser upgrade appends beside the prior version's mentions rather than
  rewriting them. No current-pointer selection exists.

## DATABASE/MIGRATION CHANGES

None. No migration, schema file, schema field, enum, or snapshot was added or
edited. The adapter writes only the accepted columns of the existing
`geo_entity_mentions` table (migrations 0052, 0053). `drizzle/` is untouched.

## DEPENDENCIES CHANGED

None. `package.json` and `pnpm-lock.yaml` are unmodified (verified with
`git status --porcelain` after install; no lockfile output). No new runtime or
dev dependency was added.

## TESTS ADDED

`src/server/features/search-growth/geo/repositories/GeoEntityMentionRecorderRepository.query.test.ts`
— 38 tests over real SQLite built from the shipped forward migration DDL
(0045, 0046, 0048, 0049, 0050, 0051, 0052, 0053, plus 0054 so the citation
sibling can be proven untouched) with `PRAGMA foreign_keys = ON`. `@/db` is
replaced with the real libsql handle, so the production adapter path runs
unmodified.

Coverage of the TASK §4 list:

| Required invariant | Tests |
| --- | --- |
| Faithful valid mapping (all columns, DB `created_at` default) | 1 |
| `mentioned` true and false | 1 |
| Nullable/present optional values (real value vs SQL NULL) | 1 |
| Multiple facts remain independent (no uniqueness rule) | 1 |
| Cross-Project Parse rejection | 1 |
| Cross-Project Entity rejection | 1 |
| Dangling parent (parse and entity) rejection | 1 |
| Raw run/parse/entity/alias/citation unchanged | 1 |
| Invalid runtime values rejected before a row | 27 (5 `mentioned`, 4 `recommended`, 6 `mentionPosition`, 6 `sentiment`/`evidenceText`, 8 identifiers) |
| Source boundary: one insert, no other table write | 1 |

Existing dual-dialect schema parity is retained and re-run unchanged
(`src/db/schema-parity.test.ts`, 369 tests) alongside the accepted mention
storage spec (`src/db/geo-entity-mention.test.ts`, 16 tests). No migration was
created, so no new parity artifact was needed.

## COMMANDS RUN

Run independently on this Windows Git Bash executor via `corepack pnpm`:

1. `corepack pnpm install --frozen-lockfile` (worktree bootstrap)
2. `corepack pnpm exec prettier --write <3 task files>`
3. `corepack pnpm exec vitest run src/server/features/search-growth/geo/repositories/GeoEntityMentionRecorderRepository.query.test.ts`
4. `corepack pnpm exec vitest run src/server/features/search-growth/geo/repositories/GeoEntityMentionRecorderRepository.query.test.ts src/db/geo-entity-mention.test.ts src/db/schema-parity.test.ts`
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
| 1 | `install --frozen-lockfile` | 0 | `Done in 32.4s using pnpm v10.30.1`; `node_modules` was absent in this isolated worktree before it. Lockfile unchanged; only the standard "Ignored build scripts" advisory was printed. |
| 2 | `prettier --write <task files>` | 0 | 2 files unchanged, 1 reformatted |
| 3 | focused mention recorder | 0 | **1 file / 38 tests passed** |
| 4 | focused + parity set | 0 | **3 files / 423 tests passed** (38 + 16 + 369) |
| 5 | `format:check` | 0 | `All matched files use Prettier code style!` |
| 6 | `types:check` | 0 | no output (clean) |
| 7 | `lint` | 0 | `Found 0 warnings and 0 errors` (944 files, 14.2s) |
| 8 | `test` | 0 | **207 files / 2048 tests passed** (102.85s) |
| 9 | `build` | 0 | client + SSR + `open_seo_audit` worker built; `tsc --noEmit` inside it clean |
| 10 | `ci:check` | 0 | prettier + knip + `tsc` (app and `badseo`) + oxlint + plugin-skill sync all clean |

Intermediate corrections during this round, before the final results above:
`types:check` first failed once (TS2345 in the new test — a `seedParse`
default-parameter narrowed to a literal by the `as const` fixture; fixed by
annotating the parameters `string`), and `lint` first failed twice
(`max-lines` 452 > 400 and `unicorn/no-array-sort`; fixed with the repository's
existing `/* eslint-disable max-lines -- ... */` test precedent and an
order-independent assertion). Every gate was re-run to exit 0 on the final code;
no gate was bypassed or skipped.

## RUNTIME EVIDENCE

The focused declaration is real-storage, not mocked: an in-memory libsql SQLite
database is created from the actual shipped `drizzle/*.sql` forward migrations
with foreign keys enabled, `@/db` is replaced by that handle, and the production
adapter is imported and invoked unmodified. The suite demonstrates, against real
SQL:

- one fact → exactly one row with every accepted column faithful and the DB
  `created_at` default applied;
- `mentioned: true` and `mentioned: false` both round-trip as their own verdicts;
- `recommended: false`, `mentionPosition: 4`, a real `sentiment`, and a real
  `evidenceText` persist; explicit `null`s persist as SQL NULL;
- two facts for the same parse and entity persist as two independent rows;
- cross-Project parse (`parse_beta_v1` under `proj_beta` claimed as
  `proj_alpha`), cross-Project entity (`ent_beta` under `proj_beta` claimed as
  `proj_alpha`), and dangling `parse_missing` / `ent_missing` parents all raise
  `FOREIGN KEY constraint failed` and leave the table empty;
- after recording two mentions the raw run, parse, and tracked-entity rows are
  identical to their pre-record snapshots, and the alias and citation tables stay
  empty;
- each invalid runtime value is rejected before any row exists (the assertion
  also proves zero rows were written).

The adapter source boundary is asserted separately: exactly one
`db.insert(geoEntityMentions)`, no update/set/delete/onConflict, and no raw run,
parse, citation, entity, or alias table named as a Drizzle argument.

No provider call, network access, credential use, cache access, or publishing
behavior was involved at any point.

## KNOWN LIMITATIONS

- The port and adapter are intentionally unwired: no server function, service,
  or producer consumes `GeoEntityMentionRecorder` yet. The consuming parse/
  extraction workflow is a later task, so the adapter is currently reachable
  only from its test.
- `sentiment` is stored as free text with no enum or scale, per §7 and the
  accepted schema. This slice adds none — a future sentiment task owns that
  contract.
- The `mentionPosition` column is stored as a plain integer fact; no ranking,
  ordinal, or gap semantics are defined or enforced beyond "integer or null".
- Tests run on the SQLite/D1 dialect (as the established repository query-test
  pattern does). Postgres parity is covered structurally by
  `src/db/schema-parity.test.ts` (369 tests, green), not by executing the
  adapter against a live Postgres instance.

## DEVIATIONS FROM TASK

None material.

- The focused test file declares
  `/* eslint-disable max-lines -- ... */`. This is the repository's existing
  precedent for a single migration-backed storage spec
  (`src/db/geo-entity-mention.test.ts` line 1) and is disclosed here. No lint
  rule was globally weakened and no other file is affected.
- The test's migration fixture list includes `drizzle/0054_optimal_magik.sql`
  beyond the 0053 head T140 used. That migration is an accepted, already-shipped
  sibling (`geo_citations`); it is loaded only so the "no other table mutation"
  invariant can assert the citation table is untouched at runtime. No migration
  was created or modified.
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
  same-Project ownership is enforced by the accepted database composite FKs
  rather than by application trust.
- Validation rejects unknown/coercible runtime values before they reach storage,
  so a malformed fact cannot persist a misleading verdict.

## GIT STATUS/DIFF SUMMARY

`git status --porcelain` (final):

```text
?? control/tasks/T141-M2-GEO-ENTITY-MENTION-RECORDER-REPOSITORY/
?? src/server/features/search-growth/geo/repositories/GeoEntityMentionRecorderRepository.query.test.ts
?? src/server/features/search-growth/geo/repositories/GeoEntityMentionRecorderRepository.ts
?? src/server/features/search-growth/geo/services/geoEntityMentionRecorder.ts
```

`git diff --stat` — empty (no tracked file modified).

Changed paths:

- `src/server/features/search-growth/geo/services/geoEntityMentionRecorder.ts` (new)
- `src/server/features/search-growth/geo/repositories/GeoEntityMentionRecorderRepository.ts` (new)
- `src/server/features/search-growth/geo/repositories/GeoEntityMentionRecorderRepository.query.test.ts` (new)
- `control/tasks/T141-M2-GEO-ENTITY-MENTION-RECORDER-REPOSITORY/DELIVERY.md` (this file)

No commit, merge, push, or branch change was made. `main` was not touched.
`node_modules`, `dist/`, and other build output are gitignored and absent from
status.

## READY FOR REVIEW

Ready for Codex review. All TASK §6 commands were run on the final code and
exited 0; the focused suite, full suite, and every aggregate gate are recorded
above with their exact results. No acceptance criterion was weakened, no scope
was added, and no production behavior was invoked.

Only Codex can PASS this task.
