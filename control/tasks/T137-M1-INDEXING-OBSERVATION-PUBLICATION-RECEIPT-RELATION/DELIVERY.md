# DELIVERY — T137-M1-INDEXING-OBSERVATION-PUBLICATION-RECEIPT-RELATION

## STATUS

`READY_FOR_REVIEW` — implementation round 1 of 3. No `REVIEW.md` exists for this
task, so nothing was addressed. Every TASK item 6 gate ran to completion in this
executor session and exited 0: dual-dialect `db:generate` (generation + clean
re-run), local D1 migration, focused Vitest, task-file Prettier, `format:check`,
`types:check`, `lint`, full Vitest, `build` and `ci:check`; read-only Git
inspection is clean. No `PASS` verdict is written by the implementation round.

## TASK ID

`T137-M1-INDEXING-OBSERVATION-PUBLICATION-RECEIPT-RELATION` — implementation
round 1.

## IMPLEMENTATION SUMMARY

Adds ONLY the optional, normalized, same-Project
`IndexingObservation → PublicationReceipt` evidence relation and its matching
domain-contract evolution, in both dialects (D1/SQLite + PostgreSQL) and at the
Zod boundary. The slice is credential-free and referential only: it does not
collect indexing data, verify a publication, resolve/normalize URLs, match a
receipt to a citation, execute publishing, contact an external system, or create
credential/account/connector behavior (TASK GOAL, items 1–5).

What shipped:

- A nullable `publication_receipt_id` column on the existing accepted
  `indexing_observations` table, in both schema mirrors and in the new forward
  migrations. NULL means the observation is NOT associated with a controlled
  publication receipt; the legacy `schemas/migrations-reference.sql`
  `indexing_observations` column of the same name is now honestly representable
  (T128 deliberately withheld it until the receipt domain existed).
- Same-Project integrity enforced at the DATABASE boundary by the nullable
  Project-leading composite FK
  `(project_id, publication_receipt_id) -> publication_receipts(project_id, id)`,
  reusing the accepted T136 `publication_receipts_project_id_id_idx` unique
  target. No supporting index was added — the TASK explicitly requires reuse.
- Delete behavior `NO ACTION` on both dialects, chosen to preserve append-only
  indexing-observation evidence (see the reconciliation section below).
- Matching Zod/domain boundary `indexingObservationSchema` +
  `IndexingObservation` row type gain `publicationReceiptId: z.string().nullable()`.
- Migration-backed storage tests for same-Project persistence, the NULL relation,
  cross-Project and dangling-receipt rejection, the chosen delete behavior, a
  whole-Project teardown, the exact column/FK shape, and the unchanged
  no-business-unique-index rule. Focused domain tests updated for the new
  nullable field. Dual-dialect parity is enforced by the existing
  `schema-parity.test.ts` (columns, PK, unique targets, FKs incl. onDelete,
  check names).

No receipt verification, receipt-to-citation matching, URL identity or
normalization, indexing-collection runtime, GSC/provider call, polling, retry,
scoring, CRUD/UI, publishing, credential/account, paid action or production
behavior was added (TASK item 5).

## RELATION / DELETE RECONCILIATION

### Relation

`indexing_observations.publication_receipt_id` is a nullable text column and the
second column of the Project-leading composite FK
`(project_id, publication_receipt_id) -> publication_receipts(project_id, id)`.

- The parent `(project_id, id)` pair is already UNIQUE through the accepted T136
  forward migration `0082_mighty_steve_rogers.sql` (D1) /
  `0060_dear_red_wolf.sql` (PG). THIS TASK REUSED that target and added NO new
  index, exactly as TASK item 2 requires. Reusing it introduces no business
  uniqueness: `id` is the receipt PRIMARY KEY, so `(project_id, id)` accepts
  precisely the rows that already exist.
- A receipt on another Project — in either direction — has no matching parent
  row, so the DB rejects the cross-Project reference rather than relying on an
  application convention.
- A dangling receipt id has no parent row and is rejected.
- NULL means "no controlled publication receipt associated" and the FK is not
  enforced (partial/FK-with-NULL semantics), which is why the relation is
  optional rather than a separate join table.
- No business uniqueness was introduced on `indexing_observations`: the table
  still carries exactly the two non-unique indexes it shipped with
  (`indexing_observations_project_idx`,
  `indexing_observations_market_profile_idx`). URL identity/dedup remains later
  work (TASK item 2).

### Delete behavior — chosen: NO ACTION

Three candidates existed; the TASK-required outcome ("preserves append-only
indexing-observation evidence") selects exactly one:

- `NO ACTION` (**chosen**): deleting a `publication_receipts` row that an
  observation still references is BLOCKED. The append-only observation evidence
  and its recorded receipt linkage survive. This is the same choice the accepted
  T136 `geo_citations.matched_publication_receipt_id` relation makes, so the two
  receipt references behave identically.
- `SET NULL`: impossible. SQLite/PostgreSQL `SET NULL` on a composite FK nulls
  EVERY column of the FK, including the `NOT NULL` `project_id` lead column, so
  the delete would fail with a NOT NULL violation instead of nulling the
  pointer. (Nulling only `publication_receipt_id` is not expressible.)
- `CASCADE`: rejected. It would delete the indexing observation — the
  append-only evidence this task exists to preserve — as a side effect of
  removing a receipt.

The evidence the TASK asks to preserve is the observation itself. Blocking the
receipt delete keeps the linkage and the observation intact; an operator (or a
later, out-of-scope service) must detach observations before a referenced receipt
can be removed.

A whole-Project teardown still works: both `indexing_observations` and
`publication_receipts` are Project descendants deleted by their own
`projects(id) ON DELETE CASCADE` FKs, and `NO ACTION` is checked at
end-of-statement, so the teardown removes both rows together. This is asserted by
a migration-backed test (see TESTS ADDED).

## FIELD RECONCILIATION

Sources: the TASK item 1 field list (authoritative), the legacy read-only
`schemas/migrations-reference.sql` `indexing_observations` table (which already
declares `publication_receipt_id TEXT` as its third column), the accepted T128
IndexingObservation contract, the accepted T136 PublicationReceipt contract and
its `(project_id, id)` referential parent index, and the established
same-Project composite-FK pattern used across the accepted schema.

| Field | Source | Decision |
| --- | --- | --- |
| `indexing_observations.publication_receipt_id` | legacy reference column `publication_receipt_id TEXT`; TASK items 1–2 | Nullable text, placed after `project_id` to match the reference column order. Evidence relation only; NULL = no controlled publication receipt associated. Bound by the same-Project composite FK above; not unique, not indexed separately. Carried verbatim — never resolved, verified, matched or interpreted as publication success. |

No other field was added, renamed, retyped or removed. `observation_type`,
`status`, `url` and `details_json` keep their accepted T128 shapes and semantics;
`market_profile_id` keeps its accepted same-Project composite FK.

## PUBLIC-SUCCESS / SCOPE BOUNDARY

- `publication_receipt_id` is an OPAQUE recorded relation. Nothing in this slice
  reads, verifies, resolves or derives anything from it; a non-NULL value never
  asserts `PUBLIC_VERIFIED`, reachability or any publication result.
- No receipt verification, receipt-to-citation matching, URL identity or
  normalization, crawl/collection runtime, GSC/provider/DataForSEO call, polling,
  retry, scoring, CRUD/service/repository, UI, publishing, credential, account or
  connector behavior was added (TASK item 5).
- No new business uniqueness and no URL dedup rule (TASK item 2).

## FILES CHANGED

Modified (tracked, `git status --short`):

- `src/db/search-growth.schema.ts` — added the nullable `publicationReceiptId`
  column and the `(project_id, publication_receipt_id) ->
  publication_receipts(project_id, id)` composite FK (NO ACTION) to
  `indexingObservations`, plus the updated header/field/FK reconciliation
  comments (the previous "publication_receipt_id is NOT shipped" note is
  replaced by the shipped relation's rationale).
- `src/db/pg/search-growth.schema.ts` — the PostgreSQL mirror of both the column
  and the FK, plus the header comment.
- `src/types/schemas/indexing-observation.ts` — `publicationReceiptId:
  z.string().nullable()` on `indexingObservationSchema` and updated comments; the
  exported `IndexingObservation` row type picks the column up via
  `InferSelectModel`.
- `src/db/indexing-observation.test.ts` — migration-backed storage spec extended
  (see TESTS ADDED).
- `src/types/schemas/indexing-observation.test.ts` — focused domain spec updated
  for the nullable field.
- `drizzle/meta/_journal.json` — new entry idx 83, tag
  `0083_thankful_leader`.
- `drizzle-pg/meta/_journal.json` — new entry idx 61, tag
  `0061_right_agent_brand`.

Added (untracked):

- `drizzle/0083_thankful_leader.sql` — D1/SQLite forward migration.
- `drizzle/meta/0083_snapshot.json` — matching D1 snapshot.
- `drizzle-pg/0061_right_agent_brand.sql` — PostgreSQL forward migration.
- `drizzle-pg/meta/0061_snapshot.json` — matching PostgreSQL snapshot.

No accepted historical migration, Accepted ADR, `29_SCOPE_LOCK.md`, `REVIEW.md` or
`TASK.md` was edited; no dependency, `package.json` or lockfile change.

## DATABASE/MIGRATION CHANGES

- D1/SQLite forward migration **`0083`**
  (`drizzle/0083_thankful_leader.sql`): `ALTER TABLE indexing_observations ADD
  COLUMN publication_receipt_id text`, then the standard Drizzle SQLite table
  rebuild (`PRAGMA foreign_keys=OFF`, `__new_indexing_observations` carrying all
  three FKs — Project, same-Project MarketProfile, same-Project
  PublicationReceipt with `ON DELETE no action` — data copy, drop, rename,
  `PRAGMA foreign_keys=ON`, recreate both indexes). The rebuild preserves every
  existing row and index; existing rows get `publication_receipt_id = NULL`
  ("no controlled publication receipt associated").
- PostgreSQL forward migration **`0061`**
  (`drizzle-pg/0061_right_agent_brand.sql`): `ALTER TABLE indexing_observations
  ADD COLUMN publication_receipt_id text`, then `ALTER TABLE indexing_observations
  ADD CONSTRAINT
  indexing_observations_project_id_publication_receipt_id_publication_receipts_project_id_id_fk
  FOREIGN KEY (project_id, publication_receipt_id) REFERENCES
  public.publication_receipts(project_id, id) ON DELETE no action ON UPDATE no
  action`. No new index — it reuses the accepted T136
  `publication_receipts_project_id_id_idx` unique target.
- Both journals carry the matching entries (idx 83 / 61) and both
  `meta/*_snapshot.json` files carry the new column and the new FK with
  `"onDelete": "no action"`.
- Manual migration correction (documented, no drift introduced): drizzle-kit
  emitted the SQLite rebuild without a preceding `ADD COLUMN`, yet the rebuild's
  data copy reads `publication_receipt_id` from the pre-existing table — that
  fails on any database where `indexing_observations` already exists. The
  generated file was corrected by prepending `ALTER TABLE indexing_observations
  ADD COLUMN publication_receipt_id text;` so the forward rebuild is valid
  (TASK item 3 explicitly authorizes a correct forward rebuild for SQLite). The
  exception is proven by `db:migrate:local`, which applied `0083` to a database
  built from `0073`, and by the clean `db:generate` re-run reporting no drift. No
  accepted historical migration was touched.

## DEPENDENCIES CHANGED

None. `package.json` and `pnpm-lock.yaml` are unmodified.

## TESTS ADDED

- `src/db/indexing-observation.test.ts` (10 → 12 tests) — applies the shipped
  `0073` + `0083` DDL to an in-memory SQLite with `PRAGMA foreign_keys = ON`,
  over minimal stand-ins for `projects`, `search_market_profiles` and (new)
  `publication_receipts` carrying the same `(project_id, id)` unique target and
  Project cascade the shipped tables use. New/changed invariants:
  - the optional receipt relation is stored same-Project and carried verbatim,
    and defaults NULL;
  - a receipt on another Project is rejected in BOTH directions and a dangling
    receipt id is rejected (composite FK), alongside the existing Project and
    MarketProfile ownership rejections;
  - deleting a still-referenced receipt is BLOCKED (`NO ACTION`) and the
    observation survives; removing the observation then releases the receipt;
  - a whole-Project teardown removes the observation and its receipt together;
  - the exact shipped column set is now the 11 direct columns (including
    `publication_receipt_id`), and the table still has no business unique index;
  - the table now has exactly three FKs (Project, same-Project MarketProfile,
    same-Project PublicationReceipt).
- `src/types/schemas/indexing-observation.test.ts` (6 tests, 2 updated) — the
  full contract now carries `publicationReceiptId`; NULL is accepted for both
  optional relations while a MISSING one is rejected; the compile-time row-type
  guard now asserts `publicationReceiptId` is present and that no
  `updatedAt`/`normalizedUrl`/`credentialId`/`verifiedAt` field exists.
- Dual-dialect parity: `src/db/schema-parity.test.ts` (369 tests) is the
  existing guard — it compares column shape, PK, unique targets, FK sets
  INCLUDING `onDelete`, and check names across both dialects, and passes with
  the new FK (`(project_id, publication_receipt_id) -> publication_receipts` /
  `no action`).

## COMMANDS RUN

Each command ran literally and independently via `corepack pnpm ...` (no bare
`pnpm`, no `--dangerously-skip-permissions`, no commit/merge/push, no external/
publishing/paid behavior).

Environment prerequisite (recorded for transparency, not a TASK-approved gate):
this worktree had NO `node_modules`, so `corepack pnpm exec vitest …` failed with
`Command "vitest" not found`. `corepack pnpm install --frozen-lockfile` was run
once to materialize the lockfile's dependencies. It resolved entirely from the
populated local pnpm store (`reused 980, downloaded 0`) — no registry content was
fetched and no lockfile/dependency change resulted (`package.json` and
`pnpm-lock.yaml` unmodified).

1. `corepack pnpm install --frozen-lockfile` (environment prerequisite)
2. `corepack pnpm run db:generate`
3. `corepack pnpm run db:migrate:local`
4. `corepack pnpm exec vitest run src/db/indexing-observation.test.ts src/types/schemas/indexing-observation.test.ts src/db/schema-parity.test.ts`
5. `corepack pnpm exec prettier --write src/db/search-growth.schema.ts src/db/pg/search-growth.schema.ts src/db/indexing-observation.test.ts src/types/schemas/indexing-observation.ts src/types/schemas/indexing-observation.test.ts`
6. `corepack pnpm run db:generate` (clean re-run)
7. `corepack pnpm run db:migrate:local` (confirmation pass)
8. `corepack pnpm format:check`
9. `corepack pnpm types:check`
10. `corepack pnpm lint`
11. `corepack pnpm test`
12. `corepack pnpm build`
13. `corepack pnpm ci:check`
14. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`, `git rev-parse --abbrev-ref HEAD`, journal/snapshot
    reads)

## COMMAND RESULTS

**All required gates exit 0 on the final tree.**

1. `install --frozen-lockfile` → exit 0 — `Lockfile is up to date, resolution
   step is skipped`; 980 packages reused / 0 downloaded; 980 added in 1m 50s.
2. `db:generate` → exit 0 — wrote `drizzle\0083_thankful_leader.sql` and
   `drizzle-pg\0061_right_agent_brand.sql`; 72 tables each;
   `indexing_observations 11 columns 2 indexes 3 fks` on BOTH dialects.
3. `db:migrate:local` → exit 0 — fresh local D1 chain applied in order;
   `0073_indexing_observations.sql ✅` and the final
   `0083_thankful_leader.sql ✅` (the run applies the whole chain; wrangler's
   final status table ends at `0083_thankful_leader.sql │ ✅`).
4. Focused Vitest → exit 0 — `Test Files 3 passed (3)`, `Tests 387 passed (387)`
   (storage 12, domain 6, parity 369).
5. Task-file Prettier → exit 0 — all 5 files `(unchanged)`.
6. Clean re-run `db:generate` → exit 0 — both dialects print `No schema changes,
   nothing to migrate 😴`; `indexing_observations 11 columns 2 indexes 3 fks`.
7. Confirmation `db:migrate:local` → exit 0 — `✅ No migrations to apply!` (the
   local D1 chain is current, so `0083` really was applied).
8. `format:check` → exit 0 — `All matched files use Prettier code style!`.
9. `types:check` → exit 0 — `tsc --noEmit`, no output.
10. `lint` (`oxlint . --type-aware`) → exit 0 — `Found 0 warnings and 0 errors.
    Finished in 63.2s on 934 files`.
11. Full `test` → exit 0 — `Test Files 203 passed (203)`, `Tests 1924 passed
    (1924)` (was 1922 before this task: +2 new storage tests). No flaky/implicit
    failure occurred in this run.
12. `build` → exit 0 — client, SSR and `open_seo_audit` bundles built, followed
    by `tsc --noEmit` with no output.
13. `ci:check` → exit 0 — prettier clean, knip clean, both `tsc --noEmit` runs
    clean, oxlint 0 warnings / 0 errors on 934 files, plugin-skills sync clean
    (`plugin skill sync clean: plugins/openseo/skills`). No sandbox denial
    occurred; no aggregate gate was skipped.
14. Read-only Git → `git diff --check` clean (no output); branch
    `ai-task/T137-M1-INDEXING-OBSERVATION-PUBLICATION-RECEIPT-RELATION`.

## RUNTIME EVIDENCE

- `db:generate`: `indexing_observations 11 columns 2 indexes 3 fks` on BOTH
  dialects, and `No schema changes, nothing to migrate 😴` on the clean re-run —
  schema definitions, generated SQL, snapshots and journals agree with no drift.
- `drizzle/meta/0083_snapshot.json` and `drizzle-pg/meta/0061_snapshot.json` both
  contain the `publication_receipt_id` column and the FK
  `indexing_observations_project_id_publication_receipt_id_publication_receipts_project_id_id_fk`
  with `onDelete: "no action"` (verified by direct read). The D1 snapshot's
  `indexingObservations` FK map now holds exactly three FKs.
- `db:migrate:local`: the full local D1 chain applied with
  `0083_thankful_leader.sql ✅`, then `✅ No migrations to apply!` — so the
  forward rebuild executes against a database that already contains `0073`'s
  `indexing_observations`, which is the case the generated file would have
  failed.
- Storage suite (12 tests) executes the shipped `0073` + `0083` DDL directly and
  asserts real SQLite FK/CHECK/cascade behavior, including: a Project-A
  observation binding a Project-B receipt is rejected (both directions); a
  dangling receipt id is rejected; a same-Project receipt relation and NULL are
  accepted; deleting a still-matched receipt is blocked by `NO ACTION` and the
  observation survives; a whole-Project teardown removes the observation and its
  receipt; the exact 11-column shape and exactly three FKs.
- `schema-parity.test.ts` (369 tests) proves both dialects expose the identical
  column list, PK, unique targets, FK set including `onDelete`, and check names.
- Domain suite (6 tests) proves the nullable field is accepted when NULL,
  rejected when missing, and the row type exposes no verification/normalization/
  credential field.
- `build`: client/SSR/open_seo_audit bundles built; `tsc --noEmit` no
  diagnostics.
- `ci:check`: full chain completed with exit 0, final line
  `plugin skill sync clean: plugins/openseo/skills`.

## KNOWN LIMITATIONS

- None blocking. Every TASK item 6 gate ran and exited 0 in this session; no
  `BLOCKED_BY_TEST_ENVIRONMENT`, `BLOCKED_BY_DESIGN`,
  `BLOCKED_BY_EXTERNAL_DEPENDENCY` or `SPEC_IMPLEMENTATION_CONFLICT` status is
  claimed. The full `test` run was green in this session (1924/1924); earlier
  tasks recorded load-related flakiness in unrelated server/auth/MCP files, which
  did not recur here.
- Scope-shape notes (by design, not defects): the relation is referential
  integrity only. Nothing matches, verifies, resolves, normalizes, polls,
  retries or scores from it, and no CRUD/service/repository/UI reads it.
- `NO ACTION` means a referenced receipt cannot be deleted until its observations
  are detached. That is the deliberate choice required by "preserve append-only
  indexing-observation evidence"; long-term receipt retention/purge policy
  (`17_SECURITY_GOVERNANCE.md` "publication receipts：长期") remains an
  out-of-scope service concern, and no retention worker exists in this slice.
- URL identity/normalization and URL dedup remain later work; `url` stays opaque
  and no business unique index exists.
- The D1 SQLite rebuild is the standard Drizzle table recreation (SQLite cannot
  add an FK in place). It preserves all existing rows and both indexes and was
  applied successfully by `db:migrate:local`.
- The storage spec uses a minimal `publication_receipts` stand-in (as it already
  did for `search_market_profiles`) so the file stays focused on
  `indexing_observations`; the stand-in carries the same `(project_id, id)`
  unique target and Project cascade the shipped T136 table uses, and the accepted
  T136 `publication-receipt.test.ts` separately exercises the real table.

## DEVIATIONS FROM TASK

- No scope deviation.
- Migration file names are generator-chosen (`0083_thankful_leader`,
  `0061_right_agent_brand`) because the TASK-approved `db:generate` takes no
  `--name`; the forward IDs match the TASK's required `0083` / `0061`.
- The generated SQLite `0083` was manually corrected by prepending the
  `ALTER TABLE … ADD COLUMN publication_receipt_id text` statement that
  drizzle-kit omitted ahead of its table rebuild; without it the rebuild's data
  copy reads a column the pre-existing table does not have. No snapshot, journal
  or schema state was changed by this correction and the clean re-run
  `db:generate` reports no drift.
- `corepack pnpm install --frozen-lockfile` was run because the worktree had no
  `node_modules`; it is the only command outside the TASK's APPROVED COMMANDS
  list. It resolved entirely from the local store (0 downloads) and changed no
  dependency or lockfile. If the Controller considers this out of bounds, it is
  the single environment prerequisite that made the approved gates runnable
  rather than a scope change.
- No receipt-verification, matching, URL-identity, collection, connector,
  credential or UI work was added even where adjacent, per TASK items 4–5.

## SECURITY NOTES

- No credential, account, connector, publisher connection, certification,
  provider, browser or cookie model is added or referenced (TASK items 4–5;
  `29_SCOPE_LOCK.md`).
- No CAPTCHA/2FA bypass, stealth behavior, cookie upload, paid action,
  production publishing or external contact was implemented or invoked. No
  production migration was run; only the local D1 migration
  (`db:migrate:local`).
- The relation is enforced by a database composite FK, not application
  convention: a cross-Project or dangling receipt reference is rejected at the
  storage boundary, so no cross-Project data leakage is possible through this
  relation.
- The value is opaque and never interpreted as publication success: no
  `PUBLIC_VERIFIED`, reachability or verification claim is derived from
  `publication_receipt_id` (TASK items 2, 5).
- No `main`, commit, merge, push or `REVIEW.md` edit; no Accepted ADR or
  `29_SCOPE_LOCK.md` change.

## GIT STATUS/DIFF SUMMARY

`git status --short` (final):

```text
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/indexing-observation.test.ts
 M src/db/pg/search-growth.schema.ts
 M src/db/search-growth.schema.ts
 M src/types/schemas/indexing-observation.test.ts
 M src/types/schemas/indexing-observation.ts
?? control/tasks/T137-M1-INDEXING-OBSERVATION-PUBLICATION-RECEIPT-RELATION/DELIVERY.md
?? drizzle-pg/0061_right_agent_brand.sql
?? drizzle-pg/meta/0061_snapshot.json
?? drizzle/0083_thankful_leader.sql
?? drizzle/meta/0083_snapshot.json
```

`git diff --stat` (tracked): 7 files changed, 295 insertions(+), 65 deletions(-).
`git diff --check`: clean. Branch:
`ai-task/T137-M1-INDEXING-OBSERVATION-PUBLICATION-RECEIPT-RELATION`. No commit,
merge or push was made. `node_modules`, `.wrangler` and `dist` are gitignored and
do not appear.

## READY FOR REVIEW

`READY_FOR_REVIEW` — the optional same-Project
`IndexingObservation → PublicationReceipt` relation is implemented in both
dialects and at the Zod boundary, the `NO ACTION` delete behavior and its
evidence-preservation rationale are documented and migration-tested, and all
required gates are green. Only Codex may mark PASS.
