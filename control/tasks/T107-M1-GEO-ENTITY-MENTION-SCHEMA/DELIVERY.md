# DELIVERY — T107-M1-GEO-ENTITY-MENTION-SCHEMA

IMPLEMENTATION STATUS: IMPLEMENTED — ROUND 3 (gate-only recovery; only the Controller may PASS)
READY FOR REVIEW: YES

## TASK ID

T107-M1-GEO-ENTITY-MENTION-SCHEMA — M1 Core Domain, schema-and-contract slice establishing the
normalized `GeoEntityMention` persistence for V1.0. This is implementation **round 3**, a
**gate-only fix round**: the Round 2 ownership recovery was approved in design and its focused
migration, D1-migration, and dual-dialect generation evidence was accepted, but `REVIEW.md`
(Round 2, BLOCKED) could not accept the task because the six aggregate gates — `format:check`,
`types:check`, `lint`, full `test`, `build`, and `ci:check` — had been auto-denied by the executor
harness in Round 2 and lacked Round-2 PASS evidence. Per the Round-3 brief, this round **does not
redesign, expand, or reimplement the schema**: it re-runs those already-approved aggregate gates
literally and independently on the unchanged Round 2 schema tree, repairs the two task-local gate
failures that surfaced, and records the exact final exit results. All work is on the isolated
worktree branch `ai-task/T107-M1-GEO-ENTITY-MENTION-SCHEMA` at HEAD
`c5dfb01615589bf66f6b203106c2fc97679968c2` (dispatch commit). Nothing was committed, merged, or
published; no other task started; `REVIEW.md` was **not** edited.

## ROUND 3 — ADDRESSING THE ROUND-2 REVIEW BLOCKER (THIS ROUND)

`REVIEW.md` (Round 2, BLOCKED) required: "execute the six already-approved aggregate commands
independently on the unchanged Round 2 tree; repair only a directly task-local failure; record all
final exit-0 results in DELIVERY." Round 3 executed exactly that:

- **`corepack pnpm format:check`** — first run **exit 1** (task-local): the task-touched
  `src/db/geo-entity-mention.test.ts` was not Prettier-clean on the Round 3 tree. Repaired with the
  TASK-approved `corepack pnpm exec prettier --write` on the four task-touched source/test files
  (only the mention test needed a reflow; the three schema/parse files were unchanged). Final re-run
  **exit 0**.
- **`corepack pnpm types:check`** — **exit 0** (clean, no diagnostics).
- **`corepack pnpm lint`** — first run **exit 1** (task-local): two `eslint/max-lines` errors on
  task-touched files — `src/db/search-growth.schema.ts` at 408 counted lines and
  `src/db/geo-entity-mention.test.ts` at 550 counted lines vs the 400 cap. Both overages are caused
  by this task's own accepted additions (the T106 parse + T107 mention/ownership schema rows in the
  SQLite barrel, and the single migration-backed mention spec). Repaired with the repo's established
  top-of-file `/* eslint-disable max-lines -- <reason> */` convention (used by `schemas/domain-types.ts`,
  `src/server/mcp/tools/*`, and several `*.test.ts`); no code, schema, or test behavior changed.
  Final re-run **exit 0** (0 warnings / 0 errors).
- **`corepack pnpm test`** (full suite) — **exit 0**: **156 files / 1330 tests passed**, including
  the T107 focused suites on the final tree (`geo-entity-mention` 16, `geo-observation-parse` 11,
  `schema-parity` 224).
- **`corepack pnpm build`** — **exit 0**: vite client + SSR + `open_seo_audit` production builds and
  the trailing `tsc --noEmit` all clean.
- **`corepack pnpm ci:check`** — **exit 0**: prettier clean, knip clean, both `tsc --noEmit` runs
  clean, oxlint 0/0, plugin-skill sync + sync check clean.

The Round 2 schema, migrations, snapshots, and tests are **unchanged**; Round 3's only source delta
is a Prettier reflow of one test file plus two header-comment lines (the `max-lines` disables).
None of the six gates reports a failure on the final tree.

## IMPLEMENTATION SUMMARY

The full implementation remains the Round 1 + Round 2 schema-and-contract slice, retained verbatim
in this working tree:

- **`geo_entity_mentions`** (both dialects) holds the normalized, project-scoped mention rows:
  `id (PK), project_id (NOT NULL FK → projects cascade), parse_id (NOT NULL, same-Project composite
  FK-bound), entity_id (NOT NULL, same-Project composite FK-bound), mentioned (required boolean, no
  default), recommended?, mention_position?, sentiment? (nullable free text — no V1.0 enum invented),
  evidence_text? (the §7 evidence-span literal), created_at`. No parser-output JSON blob, no business
  uniqueness, no current-pointer column, no `updated_at`/mutation surface.
- **`geo_observation_parses`** (both dialects) carries the Round-2 `project_id` ownership key:
  `id (PK), project_id (NOT NULL FK → projects cascade), run_id (NOT NULL, same-Project composite
  FK-bound), parser_version, parse_status, accuracy_status?, parsed_at, is_current (default false),
  created_at`. The sole parse version-identity rule remains the `(run_id, parser_version)` unique
  index.
- **Same-Project ownership is database-enforced by composite FKs** leading with each row's own
  `project_id`: a Parse's Project must equal its Run's Project; a Mention's `project_id` binds both
  `(project_id, parse_id)` → `geo_observation_parses(project_id, id)` and
  `(project_id, entity_id)` → `tracked_entities(project_id, id)`. All FKs `ON DELETE CASCADE`, so no
  dangling parse or mention can remain. Only the supporting unique target indexes required by those
  composite FKs were added; they are not business uniqueness rules.
- **Forward migrations** D1 `0053_shocking_rhodey` (SQLite data-preserving rebuild) and Postgres
  `0031_unusual_namor` (nullable-column backfill before `SET NOT NULL`) preserve prior Parse/Mention
  rows by deriving `project_id` from the existing Parse → Run relationship — no default, no NULL
  escape hatch, no cross-Project-allowing shortcut. Accepted historical migrations `0051`/`0029` and
  everything before them are unmodified.
- **Parse-version isolation is structural**: mentions bind the concrete immutable source Parse row,
  never a mutable "current" parse pointer. Raw run/parse records stay append-only.
- **Scope boundary unchanged**: no parser/runtime/provider/CRUD/repository/service/UI/ranking/
  scoring/current-pointer/GeoCitation code, no JSON-encoded relationship, no business-uniqueness
  rule, and no dependency/lockfile change.

## FILES CHANGED

### Round 3 delta (only these two task-local files changed this round)
- `src/db/geo-entity-mention.test.ts` — Prettier reflow (format:check first-run repair) and a new
  top-of-file `/* eslint-disable max-lines -- … */` header comment (lint repair). No test content or
  behavior change; the file still runs its full 16-test suite.
- `src/db/search-growth.schema.ts` — a new top-of-file
  `/* eslint-disable max-lines -- the SQLite Search Growth schema barrel holds every V1.0 table … */`
  header comment (lint repair). No schema/DDL content change.

### Retained from Round 1 + Round 2 (unchanged in Round 3)
- Source (modified, tracked): `src/db/search-growth.schema.ts` (Round-1 mention table + Round-2
  `project_id`/composite-FK expansion), `src/db/pg/search-growth.schema.ts` (identical Postgres
  mirror), `src/db/schema.ts` (+1 barrel export `geoEntityMentions`), `src/db/geo-observation-parse.test.ts`
  (Round-2 parse contract update incl. project-mismatch rejection).
- Migrations/metadata: `drizzle/0053_shocking_rhodey.sql` + `drizzle/meta/0053_snapshot.json`,
  `drizzle-pg/0031_unusual_namor.sql` + `drizzle-pg/meta/0031_snapshot.json` (Round-2 forward
  migrations/snapshots), retained Round-1 `drizzle/0052_cute_red_shift.sql` +
  `drizzle-pg/0030_tiresome_scarecrow.sql` + their snapshots, and the two tracked
  `_journal.json` edits (idx 52/53 on D1, idx 30/31 on Postgres).
- Tests (untracked addition): `src/db/geo-entity-mention.test.ts` (16 tests, migration-backed).
- Control channel (untracked, not repo baseline): `TASK.md` (dispatch-provided briefs),
  `DELIVERY.md` (this file), `evidence/round-1|2|3/*`. `REVIEW.md` exists (Round-1 and Round-2
  BLOCKED verdicts) and was **not** edited.

## DATABASE / MIGRATION CHANGES

**No database or migration change was made in Round 3.** The Round 1 + Round 2 schema is retained
exactly: D1 `0052` + `0053` and Postgres `0030` + `0031` migrations/snapshots agree with both
dialect schemas (final Round-2 dual-dialect `db:generate` reported "No schema changes, nothing to
migrate" on both dialects), and the full Round-3 `test` run re-validates dual-dialect parity
(224/224). Column/constraint inventories, the composite same-Project FK chain, the supporting unique
target indexes, cascade behavior, data-preservation approach, and migration identifiers are exactly
as recorded in the Round-2 DELIVERY sections (retained above in IMPLEMENTATION SUMMARY). Round 3's
two source edits are comments/formatting only and cannot affect generated DDL or snapshots.

## DEPENDENCIES CHANGED

None. No package was added or updated in any round; `package.json`/`pnpm-lock.yaml` are unchanged.
`corepack pnpm install --frozen-lockfile` was not re-run in Round 3 because the toolchain and
dependency set are unchanged since the Round-1 install evidence and Round 3 added no dependency.

## TESTS ADDED

Round 3 added no tests (gate-only round). The full test suite on the final tree is green:
**156 files / 1330 tests passed**, including the T107 migration-backed storage/parity suites
(`src/db/geo-entity-mention.test.ts` 16, `src/db/geo-observation-parse.test.ts` 11,
`src/db/schema-parity.test.ts` 224) that cover the Round-2 same-Project/cross-Project/mismatch
rejections, Parse-version isolation, delete cascades, nullability, the `0053` pre-existing-row
replay, and dual-dialect parity.

## COMMANDS RUN

Round 3 executed each gate literally and independently (`corepack pnpm ...`, exact TASK-approved
literals, no chained shell wrapping of multiple approved commands). Concise sanitized evidence under
`control/tasks/T107-M1-GEO-ENTITY-MENTION-SCHEMA/evidence/round-3/`.

1. `corepack pnpm format:check` → **exit 1** first run (Prettier flagged task-touched
   `src/db/geo-entity-mention.test.ts`) → repaired → final re-run **exit 0** (`02-`, `03-`,
   `04-format-check*.log`).
2. `corepack pnpm types:check` → **exit 0** (`05-types-check.log`).
3. `corepack pnpm lint` → **exit 1** first run (2 task-local `eslint/max-lines`: schema barrel 408,
   mention test 550, cap 400) → repaired with file-scoped disables → final re-run **exit 0**
   (`06-lint-initial.log`, `07-lint.log`).
4. `corepack pnpm test` → **exit 0** — 156 files / 1330 tests (`08-test.log`).
5. `corepack pnpm build` → **exit 0** (`09-build.log`).
6. `corepack pnpm ci:check` → **exit 0** (`10-ci-check.log`).
7. Read-only Git inspection: `git status --short`, `git rev-parse HEAD`, `git diff --stat`
   (`11-git-evidence.log`).

Not run in Round 3 (with reason): `db:migrate:local` and `db:generate` — Round 2 already records
exit-0 evidence for both on the schema tree (Round-2 evidence `01-`/`02-`), and Round 3 is a
gate-only round whose only source delta is a Prettier reflow plus two header-comment lines, which
cannot affect DDL or schema introspection. A final-tree re-confirmation attempt of
`corepack pnpm db:migrate:local` was auto-denied by the harness permission guard (no approval
surface) and was not retried; the approved `db:` commands were not part of the Round-3 gate-only
grant. `corepack pnpm install --frozen-lockfile` was not re-run (no dependency change; see
DEPENDENCIES CHANGED).

## COMMAND RESULTS (evidence)

- **`format:check`** — final **exit 0**: "All matched files use Prettier code style!" The only
  first-run failure was `src/db/geo-entity-mention.test.ts`, repaired by `prettier --write`; the
  other three task-touched files were already clean (no content change).
- **`types:check`** — **exit 0**: `tsc --noEmit` emitted no diagnostics on the final tree.
- **`lint`** — final **exit 0**: oxlint "Found 0 warnings and 0 errors" over 868 files. The
  first-run 2 errors were both task-local `eslint/max-lines` overages; both files now carry the
  repo-conventional file-scoped disable with an explanatory reason, and no other lint issue exists.
- **`test`** — **exit 0**: 156 files / 1330 tests passed (duration 108.10s). This includes the
  T107 focused suites and the 224 dual-dialect schema-parity tests on the final tree, so the
  comment/format repairs did not alter any asserted schema, FK, migration, or storage behavior.
- **`build`** — **exit 0**: vite client (26.55s), SSR (1m), and `open_seo_audit` (13.49s) production
  builds succeeded and the trailing `tsc --noEmit` was clean. Only the pre-existing >500 kB
  chunk-size advisory warning was emitted (not an error).
- **`ci:check`** — **exit 0**: prettier clean, knip clean, `tsc --noEmit` and
  `tsc --noEmit -p badseo/tsconfig.json` clean, oxlint 0/0, `pnpm sync-plugin-skills` synced 9
  skills, and `node scripts/check-plugin-skills-sync.mjs` reported "plugin skill sync clean".

## RUNTIME EVIDENCE

- **All six aggregate gates exit 0 on the final Round-3 tree.** This is the missing Round-2/3
  acceptance evidence `REVIEW.md` required; the gate failures found and repaired were strictly
  task-local (one unformatted task test file; two task-grown files over the repo `max-lines` cap)
  and were resolved without any schema, migration, snapshot, or test-behavior change.
- **Full suite green on the final tree** — 156 files / 1330 tests, including the migration-backed
  mention storage contract (16), parse contract (11), and dual-dialect schema parity (224).
- **No schema drift introduced by Round-3 edits** — the two changed source files differ only in
  formatting/comments; schema-parity (224) passes in the full run and Round-2 `db:generate` no-op
  evidence remains valid for the identical DDL.
- **Local D1 / Postgres migration artifacts** — unchanged from Round 2 (local D1 applied through
  `0053_shocking_rhodey.sql`, "No migrations to apply!" on final re-run; Postgres `0031` snapshot
  consistent). A live `db:migrate:pg` still requires a real Postgres URL and is not in the approved
  command set.

## KNOWN LIMITATIONS

- `db:migrate:pg` was not executed (requires a live `POSTGRES_DATABASE_URL`; not in the approved
  command set). Postgres migration/snapshot consistency is proven via the Round-2 `db:generate` no-op
  (both dialects), the parity tests, and the Round-2 DDL-ordering review.
- `db:migrate:local` / `db:generate` were not re-run in Round 3 (gate-only round; Round-2 exit-0
  evidence covers the identical DDL, and Round-3 source changes are comment/format only). A
  final-tree re-confirmation attempt of `corepack pnpm db:migrate:local` was auto-denied by the
  harness permission guard and was not retried, per the no-approval-surface constraint.
- The two lint repairs use the repo's existing file-scoped `eslint-disable max-lines` convention
  with explanatory reasons (precedents: `schemas/domain-types.ts`, `src/server/mcp/tools/local-seo-tools.ts`,
  `src/server/mcp/tools/tool-text-output.test.ts`, etc.). This is a formatting/line-count exemption
  for two files this task legitimately grew; it is not a product-scope change and does not weaken any
  behavior or acceptance invariant (schema-parity and all storage/integrity tests still pass).
- Migration file names are drizzle-kit's auto-generated tags (`0052_cute_red_shift`,
  `0053_shocking_rhodey`, `0030_tiresome_scarecrow`, `0031_unusual_namor`); identifiers are the
  required next values and journal/snapshot/file tags agree (see Round-2 DELIVERY).
- Per scope, unchanged: `sentiment` is nullable free TEXT (V1.0 defines no sentiment enum);
  `evidence_text` realises §7's `evidence_span_ref` as literal span text (GeoCitation is a later
  task); no parser/extraction/matching/recommendation/sentiment-scoring/reparse/current-pointer/
  CRUD/repository/service/UI/provider/network code was added; `schemas/domain-types.ts`,
  `schemas/migrations-reference.sql`, `05_DOMAIN_DATA_MODEL.md`, and the accepted T106 migrations
  `0051`/`0029` were **not** edited.

## DEVIATIONS FROM TASK

No product-scope deviations; the Round 3 brief explicitly authorized gate-only repair. Design
decisions retained from Round 1/Round 2 are unchanged (see IMPLEMENTATION SUMMARY and the Round-2
DELIVERY record): the minimal `project_id` ownership keys on Parse and Mention; same-Project
composite FKs replacing single-column parent FKs; data-preserving forward migrations (SQLite rebuild
D1 `0053`, Postgres backfill `0031`); nullable free-text `sentiment`; `evidence_text` as the
evidence-span literal; no Zod module for the enum-less mention table; no business-unique index; and
command evidence saved under `evidence/round-3/` (matching the round-numbered layout used since
Round 1). Round-3-specific repair decisions: `prettier --write` on the unformatted task test file,
and the two file-scoped `eslint-disable max-lines` header comments described in FILES CHANGED — both
are repo-conventional, task-local gate repairs that alter no schema or behavior.

## SECURITY NOTES

- No external requests, credentials, account access, CAPTCHA/2FA bypass, stealth behavior, cookie
  upload, production publishing, remote migration, or paid action was performed in any round.
- No dependency, lockfile, manifest, ADR, scope-lock, or production resource change.
- All work is local to the isolated worktree; Round-3 edits touch only two task source/test files
  (formatting + lint-exemption comments).
- The Project ownership relationship remains enforced with explicit typed FK columns and composite DB
  constraints — no relational data in JSON/text, no parser-output blob, and no new untrusted-input,
  auth, credential, or execution path was added (storage/constraint-only change).

## GIT STATUS/DIFF SUMMARY

Branch `ai-task/T107-M1-GEO-ENTITY-MENTION-SCHEMA`, HEAD `c5dfb01615589bf66f6b203106c2fc97679968c2`
(dispatch commit; nothing committed in Round 1, 2, or 3). `git status --short`:

```
 M control/tasks/T107-M1-GEO-ENTITY-MENTION-SCHEMA/TASK.md
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/geo-observation-parse.test.ts
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? control/tasks/T107-M1-GEO-ENTITY-MENTION-SCHEMA/DELIVERY.md
?? control/tasks/T107-M1-GEO-ENTITY-MENTION-SCHEMA/REVIEW.md
?? control/tasks/T107-M1-GEO-ENTITY-MENTION-SCHEMA/evidence/
?? drizzle-pg/0030_tiresome_scarecrow.sql
?? drizzle-pg/0031_unusual_namor.sql
?? drizzle-pg/meta/0030_snapshot.json
?? drizzle-pg/meta/0031_snapshot.json
?? drizzle/0052_cute_red_shift.sql
?? drizzle/0053_shocking_rhodey.sql
?? drizzle/meta/0052_snapshot.json
?? drizzle/meta/0053_snapshot.json
?? src/db/geo-entity-mention.test.ts
```

`git diff --stat` (tracked, vs dispatch HEAD; Round 1 + Round 2 + Round 3 working-tree deltas, 7
files, +493/−65): the schema barrels, the two `_journal.json` files, `src/db/geo-observation-parse.test.ts`,
`src/db/schema.ts`, and `TASK.md` — as detailed in the Round-2 DELIVERY. **Round 3's own delta is
exactly two files**: `src/db/geo-entity-mention.test.ts` (Prettier reflow + top-of-file `max-lines`
disable comment) and `src/db/search-growth.schema.ts` (top-of-file `max-lines` disable comment).
No schema, migration, snapshot, journal, manifest, lockfile, ADR, scope, `.greptile`, `.github`,
`.agents`, or production change was made in Round 3. `dist/` and `.wrangler/` outputs are
gitignored. Nothing committed; nothing merged; no other task started; `REVIEW.md` untouched.

## READY FOR REVIEW

Round 3 was a gate-only recovery and is complete: the six required aggregate gates —
`format:check`, `types:check`, `lint`, full `test`, `build`, and `ci:check` — were each run
literally and independently on the unchanged Round-2 schema tree and now all **exit 0**
(`format:check` and `lint` each required one task-local repair, recorded above; `test` 156 files /
1330 tests; `build` and `ci:check` clean). No schema, migration, snapshot, dependency, product
scope, or acceptance invariant was changed in this round; the only Round-3 source deltas are a
Prettier reflow of one task test file and two repo-conventional `max-lines` header comments. The
Round-1 + Round-2 implementation (normalized project-scoped `geo_entity_mentions`, same-Project
Parse/Entity composite FKs in both dialects, data-preserving D1 `0053` / Postgres `0031` forward
migrations, Parse-version isolation, cascade deletes, migration-backed negative tests, and dual-
dialect parity) is retained intact and green across the full suite. DELIVERY maps the Round-3 gate
runs and exact exits, the task-local repairs, every retained file/invariant, command result,
limitation, security note, and final Git diff/status above. Not committed; not merged; no other
task started; `REVIEW.md` not edited.
