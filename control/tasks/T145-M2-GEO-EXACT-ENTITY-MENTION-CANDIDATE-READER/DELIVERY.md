# DELIVERY — T145-M2-GEO-EXACT-ENTITY-MENTION-CANDIDATE-READER

ROUND: 1 of 3
BASE COMMIT: 7dbbea0b138e31035f41fc804af4bed0e45a63f4
STATUS: READY FOR REVIEW (implementation complete; not self-accepted)

## IMPLEMENTATION SUMMARY

Added one small, read-only, Project-scoped candidate reader: the port the
accepted T144 exact matcher will be fed from, plus its storage adapter.

- **Port** (`geoExactEntityMentionCandidateReader.ts`): one method,
  `listCandidates(projectId): Promise<GeoExactEntityMentionCandidate[]>`, whose
  payload type IS the T144 matcher's `GeoExactEntityMentionCandidate` — imported,
  never re-declared, so a candidate cannot drift from what the matcher consumes.
  The same module owns the reader's typed failure,
  `GeoExactEntityMentionCandidateReaderError`, with a structured `field`
  (`projectId`, or `<table>[<rowId>].<column>`) and a structured `row`
  (`{ table, entityId, rowId }`) so an unusable accepted row is attributable
  without re-parsing a message.
- **Adapter** (`GeoExactEntityMentionCandidateReaderRepository.ts`): exactly two
  SELECTs against the accepted `tracked_entities` / `entity_aliases` tables —
  the same tables T103 ships and T141/T142 write — mapped to T144 candidates.
  The Drizzle columns selected are only `id`, `project_id`, entity
  `canonical_name`, alias `entity_id` and `alias_text`; `priority`,
  `match_mode`, `case_sensitive`, `locale` and `created_at` are never read into
  a candidate.
- **Canonical candidates**: one per ACTIVE tracked entity of the Project,
  carrying the stored `canonical_name` verbatim as `surface` and
  `{ kind: "CANONICAL_NAME" }` as source identity.
- **Alias candidates**: only for a row whose owning entity is active, whose own
  `project_id` is the requested Project, whose accepted `matchMode` is exactly
  `EXACT`, and whose persisted `caseSensitive` flag is `true`. The owning
  entity's `active` flag is read through the stored same-Project relation
  ((project_id, entity_id) via an inner join), not inferred from a name, domain,
  or URL. `CASE_INSENSITIVE_EXACT`, `WORD_BOUNDARY`, `UNICODE_SUBSTRING`,
  `DOMAIN`, and an `EXACT` alias persisted as case-insensitive are all excluded,
  because feeding any of them to a case-sensitive literal matcher would silently
  approximate a different §4 match mode. Source identity is the alias row's own
  id: `{ kind: "ALIAS", aliasId }`.
- **Ordering is stable and meaningless**: canonical candidates first, then
  aliases; within each group by stable entity id, then row id — all primary
  keys, so the order is total and dialect-independent (Remeda `sortBy`, whose
  comparator is code-unit comparison, not a locale collation). It is documented
  as presentation order only. No alias priority, dedupe, collision collapsing,
  ownership inference, or winner selection exists: `entity_aliases.priority` is
  not even selected, so it cannot order anything, and the spec proves a
  higher-priority alias still sorts last.
- **Fail closed**: `projectId` is validated (non-string or empty rejects) before
  either SELECT runs. An ELIGIBLE row whose stored id or surface text is empty
  raises the typed error naming the column and row instead of being filtered
  out; a healthy sibling row does not rescue a partial list. Ineligible rows are
  never read at all, so their unusable values are not a reader concern.
- **Read-only by construction**: two SELECTs, no INSERT/UPDATE/DELETE/upsert,
  no matcher invocation, no recorder, no raw-response reading, no parse/run
  selection, no metric/recommendation/sentiment/position computation, no
  provider, cache, credential, UI, server function, or migration.
- **No caller is wired up**: parse orchestration and mention persistence are
  later tasks, so the module is consumed only by its own specs.

## FILES CHANGED

All four source files are new and untracked; no tracked file changed, and the
only other new path is this DELIVERY itself.

| Path | Change |
| --- | --- |
| `src/server/features/search-growth/geo/services/geoExactEntityMentionCandidateReader.ts` | New: reader port type, row-ref type, typed error class |
| `src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.ts` | New: storage adapter (2 SELECTs + mapping + ordering) |
| `src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.query.test.ts` | New: 23 real-storage tests |
| `src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.boundary.test.ts` | New: 5 source/read-only boundary tests |

Public surface of the new contract module:

```ts
type GeoExactEntityMentionCandidateReader = {
  listCandidates(projectId: string): Promise<GeoExactEntityMentionCandidate[]>;
};

type GeoExactEntityMentionCandidateRowRef = {
  table: "tracked_entities" | "entity_aliases";
  entityId: string;
  rowId: string;
};

class GeoExactEntityMentionCandidateReaderError extends Error {
  readonly field: string;
  readonly row: GeoExactEntityMentionCandidateRowRef | null;
  // message = `GEO exact entity mention candidate reader: ${field} ${detail}.`
}
```

Adapter export:
`GeoExactEntityMentionCandidateReaderRepository: GeoExactEntityMentionCandidateReader`
with `{ listCandidates }` — mirroring the accepted
`GeoEntityMentionRecorderRepository` / `GeoEntityMentionRecorder` port-adapter
shape from T141.

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or generated-file change:
`git status --short` lists the four new source files and nothing else, and
`git diff --stat` is empty. The adapter reads the already-accepted
`tracked_entities` / `entity_aliases` tables (T103, `drizzle/0048`) through the
provider-aware `db` from `@/db` and tables from `@/db/schema` — no
dialect-specific client import (oxlint's `no-restricted-imports` guard would
reject one anyway). Dual-dialect parity is retained and re-verified, not
modified: `src/db/schema-parity.test.ts` (369 tests) stayed green in the focused
run and in the full suite.

## DEPENDENCIES CHANGED

None. No `package.json` or lockfile change (`git diff --stat -- package.json
pnpm-lock.yaml` is empty). Only already-installed libraries are used: `zod` for
the runtime `projectId` trust boundary, `drizzle-orm` for the two SELECTs,
`drizzle-orm`'s `and`/`eq` predicates, and `remeda`'s `sortBy` for the
ES2022-safe, lint-approved order (`unicorn/no-array-sort` bans mutating
`.sort()`, matching the T144 precedent). No provider, cache, or credential
dependency.

## TESTS ADDED

### `GeoExactEntityMentionCandidateReaderRepository.query.test.ts` — 23 tests

Real in-memory SQLite built from the actual forward migration DDL for both
tables (`drizzle/0048_ordinary_legion.sql`), foreign keys enabled, `@/db`
replaced with that handle so the production adapter path runs unmodified.

| # | Invariant |
| --- | --- |
| 1 | An active entity's canonical name maps verbatim: `projectId`, `entityId`, `surface`, `{ kind: "CANONICAL_NAME" }`, asserted as the exact returned array and typed `GeoExactEntityMentionCandidate[]` |
| 2 | An eligible alias maps with its own row id as source identity (`{ kind: "ALIAS", aliasId: "alias_1" }`) and its stored `alias_text` verbatim |
| 3 | A Project with no stored entities returns `[]` (its rows live in another Project) |
| 4 | Project isolation: another Project's entity and alias never appear |
| 5 | An inactive entity's canonical name AND its eligible alias are both excluded |
| 6–10 | `it.each`: `CASE_INSENSITIVE_EXACT`, `WORD_BOUNDARY`, `UNICODE_SUBSTRING`, `DOMAIN` (all with `caseSensitive: true`) and `EXACT` with `caseSensitive: false` are each excluded, leaving only the canonical candidate |
| 11 | Deterministic order: inserted out of order, canonicals ordered by entity id then aliases by (entity id, row id); the priority-100 alias sorts LAST, proving priority orders nothing; a second identical call returns the identical list |
| 12 | Same-surface collision retained: two entities with canonical name `"Acme"` plus one alias with text `"Acme"` yield 3 separate candidates, no dedupe, no winner |
| 13 | Read-only: every `tracked_entities` and `entity_aliases` row is byte-identical (`toEqual` of ordered selects) after a read, with ineligible rows present too |
| 14–17 | `it.each`: a number, `null`, an absent value, and an object as `projectId` each reject with `field: "projectId"`, `row: null` |
| 18 | An empty `projectId` rejects before any SELECT — proven storage-side with a decoy row under the empty-Project key whose canonical name is itself unusable: if the empty id reached the query, THAT row's error would surface instead; the exact message is asserted |
| 19 | An eligible entity with an empty `canonical_name` fails naming `tracked_entities[ent_broken].canonical_name` and the structured row, with a healthy sibling proving no shorter list is returned |
| 20 | An eligible alias with empty `alias_text` fails naming `entity_aliases[alias_broken].alias_text` and its owning entity |
| 21 | An entity stored with an empty id fails naming `tracked_entities[].id` |
| 22 | An alias stored with an empty id fails naming `entity_aliases[].id` |
| 23 | Ineligible rows (inactive entity, non-EXACT alias) holding unusable values are never read, so they do not fail the read — the boundary is storage eligibility, not post-read skipping |

### `GeoExactEntityMentionCandidateReaderRepository.boundary.test.ts` — 5 tests

| # | Invariant |
| --- | --- |
| 1 | The port module declares `listCandidates` over the T144 candidate type and contains no `@/db`, `drizzle`, query, matcher, `fetch(`, `process.env`, or `node:fs` reference |
| 2 | The adapter contains exactly two `.select(` calls and no `.insert(`, `.update(`, `.delete(`, `.set(`, `.onConflict`, or `.returning(` |
| 3 | The adapter imports `trackedEntities`/`entityAliases` from `@/db(schema)` through the provider-aware handle, with no dialect-specific `@/db/d1`/`@/db/pg` import and no GEO run/parse/citation/mention or prompt table named |
| 4 | The adapter imports `GeoExactEntityMentionCandidate` from the T144 matcher module and declares no local `GeoExactEntityMentionCandidate`/`GeoExactEntityMentionSource` type |
| 5 | The adapter contains no matcher invocation, recorder, `fetch(`, `process.env`, `node:fs`, `JSON.stringify`, `console.`, and no `entity_aliases.priority` reference |

## COMMANDS RUN

Bootstrap was required: `node_modules` was absent in this worktree. Each command
was invoked on its own line, not wrapped in a chained shell operation. Read-only
git usage: `git status --short`, `git diff --stat`, `git rev-parse HEAD`.

| # | Command | Exit |
| --- | --- | --- |
| 1 | `corepack pnpm install --frozen-lockfile` | 0 |
| 2 | `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoExactEntityMentionCandidateReader.ts src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.ts src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.query.test.ts src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.boundary.test.ts` | 0 |
| 3 | `corepack pnpm exec vitest run src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.query.test.ts src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.boundary.test.ts` | 0 |
| 4 | `corepack pnpm lint` (first run — see COMMAND RESULTS) | 1 |
| 5 | `corepack pnpm exec prettier --write src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.query.test.ts` | 0 |
| 6 | `corepack pnpm exec vitest run src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.query.test.ts src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.boundary.test.ts src/db/schema-parity.test.ts src/db/search-entity-alias.test.ts` | 0 |
| 7 | `corepack pnpm types:check` | 0 |
| 8 | `corepack pnpm format:check` | 0 |
| 9 | `corepack pnpm lint` (final) | 0 |
| 10 | `corepack pnpm test` | 0 |
| 11 | `corepack pnpm build` | 0 |
| 12 | `corepack pnpm ci:check` | 0 |
| 13 | `corepack pnpm format:check` (re-run on final code) | 0 |
| 14 | `corepack pnpm types:check` (re-run on final code) | 0 |

## COMMAND RESULTS

- **1 — install:** `Lockfile is up to date, resolution step is skipped`;
  `Done in 40.4s using pnpm v10.30.1`. No lockfile mutation. The usual
  ignored-build-script warnings for native packages were printed (pre-existing,
  unrelated).
- **2 — prettier --write:** two task files reformatted
  (`geoExactEntityMentionCandidateReader.ts`, the query spec), two already
  conformant; exit 0.
- **3 — focused test (first run):** `Test Files 2 passed (2)`,
  `Tests 28 passed (28)` — `GeoExactEntityMentionCandidateReaderRepository.query.test.ts`
  (23 tests) and `…boundary.test.ts` (5 tests).
- **4 — lint (first run):** exit 1 with exactly one finding,
  `typescript-eslint(no-unsafe-type-assertion)` at the query spec's
  deliberately-untyped `projectId` boundary value — the `oxlint-disable-next-line`
  comment sat above the `const` line instead of the assertion line after
  formatting. Fixed by hoisting the untrusted value to its own annotated line so
  the disable applies to the assertion.
- **5 — prettier --write (fix):** `(unchanged)` — the fix was already
  conformant.
- **6 — focused test (final):** `Test Files 4 passed (4)`, `Tests 403 passed
  (403)` in 7.83s: the two new specs (28 tests) plus the dual-dialect guards
  `src/db/schema-parity.test.ts` (369 tests) and
  `src/db/search-entity-alias.test.ts` (6 tests).
- **7 — types:check:** `tsc --noEmit` produced no output (clean).
- **8 — format:check:** `All matched files use Prettier code style!`
- **9 — lint (final):** `Found 0 warnings and 0 errors. Finished in 15.8s on
  957 files using 16 threads.`
- **10 — full test:** `Test Files 213 passed (213)`, `Tests 2158 passed (2158)`,
  duration 129.80s. Both new suites appear in the run
  (`GeoExactEntityMentionCandidateReaderRepository.query.test.ts (23 tests)`,
  `…boundary.test.ts (5 tests)`), alongside the accepted GEO suites
  (`GeoEntityMentionRecorderRepository.query.test.ts` 38,
  `GeoCitationRecorderRepository.query.test.ts` 41,
  `GeoObservationParseRecorderRepository.query.test.ts` 31,
  `geoExactEntityMentionMatcher.test.ts` 12,
  `geoExactEntityMentionMatcher.rejection.test.ts` 21,
  `geoParseOutputBundle.test.ts` 8). No failures and no skips; only
  pre-existing stderr/stdout diagnostics (OAuth, DataForSEO, scheduler, MCP
  instrumentation) were emitted. T144's recorded baseline was 211 files /
  2,130 tests, so the delta is exactly the 2 new files and 28 new tests.
- **11 — build:** client (`✓ 3682 modules transformed`, `✓ built in 24.83s`),
  SSR (`✓ 5086 modules transformed`, `✓ built in 34.98s`) and `open_seo_audit`
  (`✓ 431 modules transformed`, `✓ built in 4.13s`) all built, and the appended
  `tsc --noEmit` re-ran clean. Only the pre-existing >500 kB chunk-size advisory
  was printed.
- **12 — ci:check:** ran Prettier (`All matched files use Prettier code
  style!`), knip, `tsc --noEmit`, `tsc --noEmit -p badseo/tsconfig.json`,
  `oxlint . --type-aware` (`Found 0 warnings and 0 errors. Finished in 9.7s on
  957 files`), and the plugin-skill sync check; final line
  `plugin skill sync clean: plugins/openseo/skills`. Exit 0. No gate was
  sandbox-denied, so nothing was skipped and no bypass was needed.
- **13/14 — final re-runs** on the frozen code: format check clean, `tsc
  --noEmit` silent.

## RUNTIME EVIDENCE

No runtime, provider, network, or production invocation was performed. The
evidence is the focused specs running the shipped adapter against real accepted
DDL; no claim below is inferred from reading the code alone.

- **Mapping evidence:** test 1 returns exactly
  `[{ projectId: "proj_alpha", entityId: "ent_alpha", surface: "Acme Inc.",
  source: { kind: "CANONICAL_NAME" } }]`; test 2 returns the canonical candidate
  followed by
  `{ …, entityId: "ent_alpha", surface: "Acme Inc", source: { kind: "ALIAS",
  aliasId: "alias_1" } }`. Both are asserted with `toEqual` on the whole array
  and typed as the T144 `GeoExactEntityMentionCandidate[]`.
- **Exclusion evidence:** test 5 stores an inactive entity and its
  EXACT/case-sensitive alias and returns only the live entity's two candidates;
  tests 6–10 each store one excluded alias (`CASE_INSENSITIVE_EXACT`,
  `WORD_BOUNDARY`, `UNICODE_SUBSTRING`, `DOMAIN` with `caseSensitive: true`,
  and `EXACT` with `caseSensitive: false`) and return only the canonical
  candidate; test 4 seeds a full second Project and returns only Project A's
  two candidates.
- **Ordering / no-priority evidence:** test 11 inserts entities C, A, B and
  aliases z(ent_b, priority 100), m(ent_a, priority 50), a(ent_a, priority 0)
  and asserts the exact six-element order
  `[ent_a canonical, ent_b canonical, ent_c canonical, ent_a/alias_a,
  ent_a/alias_m, ent_b/alias_z]` — the highest-priority alias is last — then
  repeats the call and asserts equality.
- **Collision evidence:** test 12 asserts 3 candidates with surface `"Acme"`
  (two canonicals for different entities plus one alias), i.e. retained
  separately with no dedupe and no winner.
- **Rejection evidence:** test 18 stores an entity under the empty-Project key
  whose `canonical_name` is empty, then calls `listCandidates("")` and asserts
  the exact message
  `GEO exact entity mention candidate reader: projectId must be a non-empty string.`
  — had the empty id reached the SELECT, that row's `canonical_name` failure
  would have surfaced instead, so this is direct evidence the guard fires before
  any query. Tests 19–22 assert the error class, the structured `field`
  (`tracked_entities[ent_broken].canonical_name`,
  `entity_aliases[alias_broken].alias_text`, `tracked_entities[].id`,
  `entity_aliases[].id`) and the structured `row`; test 19 also seeds a healthy
  entity to prove no partial list is returned. Tests 14–17 assert non-string
  `projectId` values reject with `field: "projectId"`, `row: null`.
- **Read-only evidence:** test 13 captures every `tracked_entities` and
  `entity_aliases` row (ordered) before and after a read and asserts `toEqual`;
  boundary test 2 counts exactly two `.select(` calls and zero write verbs in the
  shipped source, and boundary test 5 proves no matcher/recorder/fetch/env/fs
  reference and no `priority` column access exists.
- **Parity evidence:** `src/db/schema-parity.test.ts` (369 tests) and
  `src/db/search-entity-alias.test.ts` (6 tests) passed in the focused run, so
  the T103 dual-dialect contract is unchanged and no migration was added.
- **Full-suite regression evidence:** command 10 — 213 files / 2,158 tests
  passed.

## KNOWN LIMITATIONS

- Only `EXACT` + case-sensitive aliases and active entities are served. The
  other §4 match modes (`CASE_INSENSITIVE_EXACT`, `WORD_BOUNDARY`,
  `UNICODE_SUBSTRING`, `DOMAIN`) are deliberately out of scope and are not
  approximated: a component that implements those modes must read those rows
  later.
- Colliding surfaces are returned separately by design. Resolving a collision
  requires a priority/ownership rule this task forbids inventing, so it is left
  to a later caller — consistent with T144, which also reports every matching
  candidate.
- Ordering is presentation-only and locale-independent by code-unit comparison.
  A caller that needs a business ranking must impose it downstream; the reader
  deliberately does not.
- The reader validates shape and Project scope, not referential truth beyond the
  accepted composite FK, and it performs no alias substring-safety check
  (05_DOMAIN_DATA_MODEL.md §4) — that rule belongs to later validation work.
- Nothing calls the reader yet, so it has no production call site and knip sees
  it only through its two specs; parse orchestration and mention persistence are
  later tasks.
- The empty-string `projectId` "before any query" proof is storage-side (a
  decoy row under the empty-Project key) rather than a query spy; non-string
  ids are proven by the typed rejection and by a sparse `row: null`, which no
  row-level failure produces.
- The install emitted ignored-build-script warnings for native packages;
  unrelated to this task and identical on a clean checkout.

## DEVIATIONS FROM TASK

None. All scope boundaries in the TASK were honored: no schema, migration,
snapshot, or dependency change; no alias creation/edit, matcher invocation,
raw-response parser, mention persistence, parse/run selection, provider, cache,
UI, CRUD, or server function; no publishing or paid action. No APPROVED command
was wrapped in a chained shell operation and no unapproved pnpm script was used;
the only extra commands were the read-only git ones the TASK permits. The
bootstrap install was required because `node_modules` was absent in this
worktree (explicitly allowed) and did not change the lockfile. Two
implementation choices are worth flagging for review:

1. The specs are split into a real-storage query spec and a separate
   source-boundary spec instead of one file. This keeps each spec under
   oxlint's `max-lines` without an eslint-disable and matches the T144
   precedent of keeping the boundary assertions distinct from the behaviour
   assertions; the DDL bootstrap exists only in the query spec.
2. The typed error class lives in the port module and is thrown by the adapter,
   so callers depending on the port do not have to import the repository to
   catch or narrow a failure — mirroring how T144 keeps its error class beside
   its contract.

## SECURITY NOTES

- No credential, account, provider, paid action, publishing, Prompt Explorer,
  R2/application-cache, CAPTCHA/2FA, stealth, or cookie access; no network call
  and no production or external database access. All storage in the specs is an
  in-memory SQLite database built from the shipped migration DDL.
- The reader is read-only: exactly two SELECTs, no INSERT/UPDATE/DELETE/upsert,
  no matcher invocation, no raw-evidence inspection, and no entity/alias
  mutation — proven both by row-level comparison and by source inspection.
- Fail-closed on both trust boundaries: an invalid `projectId` rejects before
  any query, and an unusable eligible row rejects with a typed error naming the
  row rather than silently narrowing the candidate list (which could otherwise
  make a missing surface look like a genuine "not mentioned" result).
- Candidate payloads are opaque stored text echoed verbatim; nothing is logged,
  serialized, normalized, case-folded, trimmed, or interpreted, and no name or
  domain is expanded to synthesize a surface.
- No scope change, no edit to `29_SCOPE_LOCK.md`, no Accepted-ADR edit, no
  acceptance-criteria weakening, no dependency addition, no
  `--dangerously-skip-permissions`, no commit, no merge, no push, and no
  production publishing. `main` and `integration/ai-v1` were not touched.
  `REVIEW.md` was neither created nor edited.

## GIT STATUS/DIFF SUMMARY

`git rev-parse HEAD` → `7dbbea0b138e31035f41fc804af4bed0e45a63f4`
(`chore(control): dispatch T145 round 1`).

`git diff --stat` → empty (no tracked file modified). `git diff --stat --
package.json pnpm-lock.yaml` → empty.

`git status --short` before this DELIVERY was written:

```text
?? src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.boundary.test.ts
?? src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.query.test.ts
?? src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.ts
?? src/server/features/search-growth/geo/services/geoExactEntityMentionCandidateReader.ts
```

with this DELIVERY added as the fifth untracked path at
`control/tasks/T145-M2-GEO-EXACT-ENTITY-MENTION-CANDIDATE-READER/DELIVERY.md`.
No build output, cache, or generated file appears in the status.

## READY FOR REVIEW

Implementation, focused tests (28), the dual-dialect guards, the five required
gates, and the aggregate `ci:check` are complete on this final code, and the
worktree contains only the four new task-scoped source files plus this DELIVERY.
Awaiting Codex review; no PASS is claimed here.
