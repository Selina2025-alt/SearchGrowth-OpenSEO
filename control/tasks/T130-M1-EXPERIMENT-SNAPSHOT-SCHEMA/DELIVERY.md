# DELIVERY — T130-M1-EXPERIMENT-SNAPSHOT-SCHEMA

## TASK ID

T130-M1-EXPERIMENT-SNAPSHOT-SCHEMA (implementation round 1; no REVIEW.md present).

## IMPLEMENTATION SUMMARY

Added the credential-free, Project-scoped, append-only `ExperimentSnapshot`
persistence and matching Zod/domain row contract only, as a storage-contract
slice.

- New `experiment_snapshots` table in both dialects: SQLite
  (`src/db/search-growth.schema.ts`) and Postgres
  (`src/db/pg/search-growth.schema.ts`), structurally identical (schema-parity
  suite passes).
- Added the ONE supporting parent composite index the new FK requires,
  `experiments_project_id_id_idx` (unique on `experiments(project_id, id)`), to
  the accepted `experiments` table in both dialect schemas and in migration 0075
  (the T129 delivery explicitly deferred this index to this task).
- Forward migrations D1 `0075_experiment_snapshots` and PostgreSQL
  `0053_experiment_snapshots`, with matching snapshots and journal entries.
- Append-only DB guards (BEFORE UPDATE / BEFORE DELETE triggers) added to both
  migrations, using the accepted AuditEvent pattern (D1 0071 / PG 0049).
- Matching runtime Zod contract `src/types/schemas/experiment-snapshot.ts`
  (`ExperimentSnapshot` row type + `experimentSnapshotSchema`).
- Migration-backed storage tests (`src/db/experiment-snapshot.test.ts`) and
  focused domain contract tests
  (`src/types/schemas/experiment-snapshot.test.ts`).

No experiment activation, recheck scheduling, attribution/comparison
calculation, GEO/GSC/GA4/rank/index query, provider call, credential, publish,
spend or production behavior was implemented.

## FIELD / JSON / IMMUTABILITY RECONCILIATION

Fields shipped (stable `id`, explicit `project_id`, required `experiment_id`,
`snapshot_type`, `captured_at`, nullable `window_start`, `window_end`,
`timezone`, required `seo_metrics_json`, `geo_metrics_json`,
`ga4_metrics_json`, `publication_metrics_json`, `indexing_metrics_json`,
`data_quality_json`, nullable `notes`, append-only `created_at`). This matches
the TASK field list and the legacy read-only
`schemas/migrations-reference.sql` `experiment_snapshots` column shapes.

- `snapshot_type`: DB text-enum + named CHECK
  `experiment_snapshots_snapshot_type_valid` with the source-defined taxonomy
  `BASELINE | D7 | D14 | D30 | MANUAL` from the legacy read-only
  `schemas/domain-types.ts` `ExperimentSnapshot.type` union; the Zod boundary
  validates the same list. This follows the repository convention that a
  `schemas/domain-types.ts` union is the authoritative value set (as for
  `PageFitAction`, `OpportunityProfile`, `CitationOwnership`,
  `ReleaseBundle.status`). No further snapshot/window/lifecycle taxonomy,
  measurement formula, data-lag policy or attribution value is invented
  (TASK item 3 / OUT OF SCOPE).
- `captured_at` is the required application-supplied capture moment; distinct
  from the append-only system `created_at`.
- `window_start` / `window_end` / `timezone` / `notes`: nullable and carried
  verbatim; NULL = no window/timezone/note recorded. No window/data-lag
  computation exists here.
- Six REQUIRED JSON documents (`seo_metrics_json`, `geo_metrics_json`,
  `ga4_metrics_json`, `publication_metrics_json`, `indexing_metrics_json`,
  `data_quality_json`): each validated at the database boundary by its own named
  CHECK — `json_valid(...)` on SQLite, equivalent `(...)::jsonb IS NOT NULL` on
  Postgres (same check names; schema-parity compares names). Stored verbatim;
  never decomposed into relational columns or computed values.
- Immutability/append-only at the DB boundary (TASK item 3): the migration adds
  a BEFORE UPDATE trigger and a BEFORE DELETE trigger that ABORT every direct
  update/delete (`RAISE(ABORT, ...)` on SQLite; `RAISE EXCEPTION` via a trigger
  function on PostgreSQL). Because FK cascade actions fire these row triggers on
  both dialects (verified in the SQLite test), deleting an Experiment or Project
  that still owns snapshots is blocked too, so immutable measurement history is
  never silently dropped.
- Deliberately NOT shipped: `updated_at`, any computed
  attribution/comparison/uplift/recheck/credential/publication-state column.

## PROJECT RELATION AND DELETE DECISIONS

- `project_id` NOT NULL FK → `projects(id)` ON DELETE CASCADE (the established
  Project-scoping FK every Search Growth row carries).
- Experiment relation: Project-leading composite FK
  `(project_id, experiment_id) → experiments(project_id, id)` ON DELETE CASCADE,
  so a snapshot is database-proven to belong to its Experiment's Project (TASK
  item 2). A snapshot whose Experiment lives on another Project has no matching
  parent row and is rejected by the DB.
- Supporting parent index: `experiments_project_id_id_idx` unique on
  `experiments(project_id, id)` is the ONE referential target the composite FK
  requires. `id` is already the PK, so it accepts exactly the PK's rows and adds
  NO business uniqueness. This is the single referential index the T129 delivery
  explicitly reserved for this task.
- Delete behavior rationale: parent-reference FKs cascade (consistent with every
  accepted parent reference), and the append-only DELETE trigger fires on the
  cascade so the cascade can never actually drop history. A composite FK whose
  leading `project_id` is NOT NULL cannot use `ON DELETE SET NULL`, so cascade +
  trigger guard is the consistent, non-dangling, immutable choice.
- No business uniqueness on `experiment_snapshots`: no V1.0 artifact defines a
  snapshot identity rule (repeated captures of the same
  Experiment/type/window are legal). Its only explicit index is the non-unique
  `experiment_snapshots_experiment_idx` for the Experiment → snapshots read path
  and cascade path.

## FILES CHANGED

- `src/db/search-growth.schema.ts` — added the `experimentSnapshots` SQLite table
  and the `experiments_project_id_id_idx` supporting unique index on
  `experiments` (+ header/comment updates).
- `src/db/pg/search-growth.schema.ts` — matching Postgres mirror.
- `src/db/schema.ts` — export `experimentSnapshots` from the provider-aware
  barrel.
- `src/types/schemas/experiment-snapshot.ts` — new Zod/domain contract.
- `src/db/experiment-snapshot.test.ts` — new migration-backed storage test.
- `src/types/schemas/experiment-snapshot.test.ts` — new focused domain contract
  test.
- `drizzle/0075_experiment_snapshots.sql` — generated DDL + hand-added
  append-only triggers (renamed from drizzle-kit's random tag).
- `drizzle/meta/0075_snapshot.json` — generated snapshot.
- `drizzle/meta/_journal.json` — added entry idx 75, tag
  `0075_experiment_snapshots`.
- `drizzle-pg/0053_experiment_snapshots.sql` — generated DDL + hand-added
  append-only trigger function (renamed).
- `drizzle-pg/meta/0053_snapshot.json` — generated snapshot.
- `drizzle-pg/meta/_journal.json` — added entry idx 53, tag
  `0053_experiment_snapshots`.

No `package.json` / lockfile change.

## DATABASE / MIGRATION CHANGES

- D1/SQLite forward migration **0075**
  (`drizzle/0075_experiment_snapshots.sql`), snapshot
  `drizzle/meta/0075_snapshot.json`, journal tag `0075_experiment_snapshots`.
- PostgreSQL forward migration **0053**
  (`drizzle-pg/0053_experiment_snapshots.sql`), snapshot
  `drizzle-pg/meta/0053_snapshot.json`, journal tag
  `0053_experiment_snapshots`.
- Both generated by `drizzle-kit` via `db:generate`; renamed to the repo's
  descriptive names with journal tags updated (T128/T129 precedent). Re-running
  `db:generate` reports `No schema changes, nothing to migrate`, confirming
  snapshot/journal consistency.
- Hand edits to the generated DDL (as for the accepted AuditEvent 0071/0049):
  append-only triggers appended to both files; in the Postgres file the
  `CREATE UNIQUE INDEX experiments_project_id_id_idx` statement was moved BEFORE
  the composite-FK `ALTER TABLE` because PostgreSQL validates the referenced
  unique target at `ALTER TABLE` time (the index would otherwise not exist yet).
  Column/CHECK/FK DDL content is otherwise unmodified.
- Local migration apply confirmed the new migration:
  `0075_experiment_snapshots.sql ✅`.

## DEPENDENCIES CHANGED

None. No package.json / lockfile change.

## TESTS ADDED

- `src/db/experiment-snapshot.test.ts` (12 tests): real in-memory SQLite built
  from the shipped 0075 DDL — full-field same-Project persistence with NULL
  optional context; optional window/timezone/notes stored verbatim; cross-Project
  Experiment rejection plus dangling Experiment/Project; snapshot-type enum
  accept/reject; all six required JSON documents (malformed rejected per column,
  valid stored verbatim); required-column NOT NULL; direct UPDATE and DELETE
  rejected by the append-only triggers with the row unchanged; deleting the
  owning Experiment/Project blocked by the trigger; exact column set (no
  updated_at / computed column); exactly two FKs (Project + same-Project
  Experiment, all CASCADE); the parent `experiments` unique supporting index is
  present and the snapshot table has no business unique index.
- `src/types/schemas/experiment-snapshot.test.ts` (7 tests): Zod boundary — full
  contract verbatim, source-defined snapshot-type enum, nullable optionals,
  required Experiment relation, missing fields, wrong primitive/JSON-document
  types, and a compile-time row-type shape guard.

## COMMANDS RUN

All via `corepack pnpm <script>` on Windows Git Bash. Each run independently
(no chaining inside the command under test).

1. `corepack pnpm install --frozen-lockfile` (environment prerequisite; see
   DEVIATIONS) — exit 0, 1m39s.
2. `corepack pnpm run db:generate` — exit 0; generated
   `drizzle/0075_*.sql` + `drizzle-pg/0053_*.sql` (renamed to
   `..._experiment_snapshots`).
3. `corepack pnpm run db:generate` (idempotency re-run) — exit 0,
   `No schema changes, nothing to migrate`.
4. `corepack pnpm run db:migrate:local` — exit 0;
   `0075_experiment_snapshots.sql ✅`.
5. `corepack pnpm exec vitest run src/db/experiment-snapshot.test.ts src/types/schemas/experiment-snapshot.test.ts src/db/schema-parity.test.ts`
   — exit 0 (358 tests passed, 3 files).
6. `corepack pnpm exec prettier --write <task TS/SQL/JSON files>` — exit 0
   (2 TS files reformatted).
7. `corepack pnpm format:check` — exit 0 ("All matched files use Prettier code
   style!").
8. `corepack pnpm types:check` — exit 0.
9. `corepack pnpm lint` — first run exit 1 (oxlint
   `no-unsafe-type-assertion` in the new storage test's FK-column assertion);
   fixed by replacing the cast with a `typeof` type guard; re-run exit 0
   ("Found 0 warnings and 0 errors", 916 files).
10. `corepack pnpm exec vitest run src/db/experiment-snapshot.test.ts src/types/schemas/experiment-snapshot.test.ts src/db/experiment.test.ts src/db/schema-parity.test.ts`
    — exit 0 (368 tests passed, 4 files; includes the accepted T129 experiment
    spec, which is unaffected because it applies only the 0074 DDL).
11. `corepack pnpm test` — exit 0 (191 files, 1775 tests passed).
12. `corepack pnpm build` — exit 0 (vite build + `tsc --noEmit`).
13. `corepack pnpm ci:check` — exit 0 (prettier + knip + tsc + badseo tsc +
    oxlint + sync-plugin-skills + sync check all clean).

## COMMAND RESULTS

- db:generate: exit 0; idempotency re-run reports no schema changes.
- db:migrate:local: exit 0; migration `0075_experiment_snapshots.sql` applied.
- Focused tests: exit 0 (358 then 368 passed incl. schema-parity 339).
- format:check / types:check: exit 0.
- lint: exit 0 after the single type-guard fix.
- Full test: exit 0, 1775 passed / 0 failed.
- build: exit 0.
- ci:check: exit 0.

No aggregate gate was sandbox-denied or bypassed.

## RUNTIME EVIDENCE

- `db:migrate:local` applied the new D1 `0075_experiment_snapshots.sql` to the
  local D1 database (✅ in the migration output table), including the supporting
  parent unique index and the append-only triggers.
- Migration-backed tests execute the shipped DDL in a real in-memory SQLite
  (foreign keys ON), proving same-Project ownership, snapshot-type/JSON CHECKs,
  required columns, direct UPDATE/DELETE rejection, parent-delete protection and
  the exact column/index/FK shape against the migration — not just the
  TypeScript schema.
- Full repo test suite and build both pass with the new table wired into the
  provider-aware barrel.

## KNOWN LIMITATIONS

- PostgreSQL migration is generated and parity-checked structurally, but not
  executed against a live Postgres: the approved command list contains no
  `db:migrate:pg` and no `POSTGRES_DATABASE_URL` is provisioned in this
  environment. The Postgres FK/index statement order was hand-corrected so the
  unique target exists before the composite FK is added.
- Out of scope by TASK: experiment activation/state transitions,
  recheck/baseline execution, attribution/comparison calculation, GEO/GSC/GA4
  collection, provider calls, publishing, credentials, CRUD/UI, paid/production
  behavior. No such code exists.
- `snapshot_type` is the legacy `schemas/domain-types.ts` union
  (`BASELINE | D7 | D14 | D30 | MANUAL`); no V1.0 spec defines an additional
  window taxonomy, so none is added.

## DEVIATIONS FROM TASK

- The worktree shipped with **no `node_modules`**, so no approved gate could run.
  Before any gate I ran `corepack pnpm install --frozen-lockfile`. This is the
  documented baseline prerequisite (`21_TEST_ACCEPTANCE_PLAN.md` §2 and root
  `CLAUDE.md` Testing) but is **not** in TASK's APPROVED COMMANDS list; disclosed
  here explicitly. No package.json/lockfile change resulted.
- Generated migration filenames were renamed from drizzle-kit's random names to
  `0075_experiment_snapshots` / `0053_experiment_snapshots` with matching journal
  tags, following the accepted T128/T129 precedent. DDL content and snapshot ids
  are unchanged apart from the documented hand edits (triggers appended; PG
  unique-index statement reordered before the FK).
- No other deviations.

## SECURITY NOTES

- Credential-free: no provider calls, no accounts, no secrets, no network use.
- No activation, scheduling, publishing, spend, external contact or production
  behavior.
- JSON documents are opaque and validated for well-formedness only; no
  relationship is encoded in JSON to avoid joins and no measurement/attribution
  value is computed.
- Same-Project ownership is enforced by the database (composite FK), not by
  application convention; append-only history is DB-enforced by triggers.
- No CAPTCHA/2FA bypass, no stealth behavior, no cookie upload, no production
  publishing, no scope or Accepted-ADR changes.

## GIT STATUS / DIFF SUMMARY

Working tree (branch `ai-task/T130-M1-EXPERIMENT-SNAPSHOT-SCHEMA`, no commits
made):

```
 M control/tasks/T130-M1-EXPERIMENT-SNAPSHOT-SCHEMA/TASK.md   (pre-existing, not touched)
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? control/tasks/T130-M1-EXPERIMENT-SNAPSHOT-SCHEMA/DELIVERY.md
?? drizzle-pg/0053_experiment_snapshots.sql
?? drizzle-pg/meta/0053_snapshot.json
?? drizzle/0075_experiment_snapshots.sql
?? drizzle/meta/0075_snapshot.json
?? src/db/experiment-snapshot.test.ts
?? src/types/schemas/experiment-snapshot.test.ts
?? src/types/schemas/experiment-snapshot.ts
```

`control/tasks/T130-M1-EXPERIMENT-SNAPSHOT-SCHEMA/TASK.md` shows as modified
before this work began (CRLF/LF line-ending only; `git diff` shows no content
change and it was not touched by this task).

Diff stat: `src/db/search-growth.schema.ts +213/-2`,
`src/db/pg/search-growth.schema.ts +106/-1`, `src/db/schema.ts +1`, each journal
`+7`; plus the new files listed above.

## READY FOR REVIEW

Yes. Implementation complete, all TASK gates run and green, no merge/publish
performed.
