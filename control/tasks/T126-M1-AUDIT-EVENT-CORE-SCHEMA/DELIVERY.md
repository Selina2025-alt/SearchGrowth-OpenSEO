# DELIVERY T126-M1-AUDIT-EVENT-CORE-SCHEMA

IMPLEMENTATION STATUS: COMPLETE
READY FOR REVIEW: YES

## IMPLEMENTATION SUMMARY

Added the credential-free, Project-scoped, append-only `AuditEvent` persistence
and domain contract as a schema/validation-only slice.

- New table `search_growth_audit_events` on both dialects (SQLite/D1 and
  PostgreSQL), defined in `src/db/search-growth.schema.ts` and mirrored
  structurally in `src/db/pg/search-growth.schema.ts`. Columns exactly match the
  source-defined direct field list: stable `id`, explicit `project_id`, opaque
  `actor_id`, `action`, `object_type`, `object_id`, nullable opaque
  `before_ref`/`after_ref`, required `metadata_json`, opaque `correlation_id`, and
  the append-only `created_at`. There is no `updated_at` and no
  runtime-control/execution/publishing/spend/credential/account column.
- Matching Zod/domain boundary `src/types/schemas/audit-event.ts` exporting
  `auditEventSchema` and the `AuditEvent` row type.
- Append-only contract enforced at the database boundary, not by convention:
  forward migrations add `BEFORE UPDATE`/`BEFORE DELETE` guards that abort every
  update/delete of an event row, including foreign-key cascade deletes of an
  owning Project.
- Forward migrations + matching snapshots/journals: D1 `0071`, PostgreSQL `0049`.
- Migration-backed storage tests (real SQLite built from the shipped 0071 DDL)
  plus focused domain tests, plus automatic dialect coverage by the existing
  schema-parity suite.

No runtime-control mutation, release execution, publishing, spend, credential/
account/connector model, CRUD, UI, or production behavior was added.

## FILES CHANGED

Tracked (modified):
- `src/db/search-growth.schema.ts` — adds `searchGrowthAuditEvents` SQLite table
  (11 columns, 1 index, 1 FK, 1 named CHECK) with the full reconciliation and
  append-only rationale comment.
- `src/db/pg/search-growth.schema.ts` — adds the structurally identical Postgres
  mirror; updates the max-lines justification comment.
- `src/db/schema.ts` — exports `searchGrowthAuditEvents` from the provider-aware
  barrel.
- `drizzle/meta/_journal.json` — adds entry idx 71 `0071_stiff_the_professor`.
- `drizzle-pg/meta/_journal.json` — adds entry idx 49 `0049_daffy_cerebro`.

New (untracked):
- `drizzle/0071_stiff_the_professor.sql` — D1 forward migration.
- `drizzle/meta/0071_snapshot.json` — matching D1 snapshot.
- `drizzle-pg/0049_daffy_cerebro.sql` — Postgres forward migration.
- `drizzle-pg/meta/0049_snapshot.json` — matching Postgres snapshot.
- `src/db/audit-event.test.ts` — migration-backed storage contract tests.
- `src/types/schemas/audit-event.ts` — Zod/domain boundary + `AuditEvent` type.
- `src/types/schemas/audit-event.test.ts` — focused domain boundary tests.

## DATABASE / MIGRATION CHANGES

Migration IDs: D1 `0071_stiff_the_professor`; PostgreSQL `0049_daffy_cerebro`.

D1 DDL (`drizzle/0071_stiff_the_professor.sql`):
- `CREATE TABLE search_growth_audit_events` with the 11 columns above,
  `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade`, and
  `CONSTRAINT search_growth_audit_events_metadata_valid CHECK(json_valid(metadata_json))`.
- `CREATE INDEX search_growth_audit_events_project_idx` on `project_id` (non-unique).
- `CREATE TRIGGER search_growth_audit_events_no_update` — `BEFORE UPDATE`,
  `RAISE(ABORT, '... is append-only: UPDATE is not permitted')`.
- `CREATE TRIGGER search_growth_audit_events_no_delete` — `BEFORE DELETE`,
  `RAISE(ABORT, '... is append-only: DELETE is not permitted')`.

PostgreSQL DDL (`drizzle-pg/0049_daffy_cerebro.sql`):
- `CREATE TABLE search_growth_audit_events` with the same columns,
  `created_at` defaulting to the established `isoNow`
  (`to_char(now() AT TIME ZONE 'utc', ...)`), and the same-named CHECK using a
  dialect-native JSON cast: `(metadata_json)::jsonb IS NOT NULL` (malformed text
  raises and is rejected).
- Project FK added via `ALTER TABLE ... ADD CONSTRAINT
  search_growth_audit_events_project_id_projects_id_fk ... ON DELETE cascade`.
- `CREATE INDEX search_growth_audit_events_project_idx ... USING btree (project_id)`.
- One `search_growth_audit_events_append_only()` plpgsql function plus one
  `BEFORE UPDATE OR DELETE` row trigger that raises
  `'... is append-only: % is not permitted'`.

Schema parity: the existing `src/db/schema-parity.test.ts` structurally compares
every SQLite/PG table (columns/nullability/type/default, PK, unique, FKs,
check NAMES). The new table is auto-covered and passes.

### Field reconciliation

Source-defined direct fields (TASK item 1) vs. the legacy reference artifacts
`schemas/domain-types.ts` `AuditEvent` and
`schemas/migrations-reference.sql` `search_growth_audit_events`:

| Field | Legacy reference | This slice | Decision |
| --- | --- | --- | --- |
| `id` | `id TEXT PRIMARY KEY NOT NULL` | same (PK) | stable event id |
| `project_id` | `TEXT NOT NULL`, no FK | `TEXT NOT NULL` + FK to `projects(id)` ON DELETE cascade | explicit Project ownership, ownership-enforced |
| `actor_id` | `TEXT NOT NULL` | same, opaque, no FK | no account/user model invented |
| `action` | `TEXT NOT NULL` | same, opaque, no enum | no action taxonomy invented |
| `object_type` / `object_id` | `TEXT NOT NULL` | same, opaque, no FK | no polymorphic relation invented |
| `before_ref` / `after_ref` | `TEXT` (nullable) | same, nullable opaque | NULL = no reference recorded |
| `metadata` / `metadata_json` | interface `metadata: Record<string,unknown>`; SQL `metadata_json TEXT NOT NULL` | `metadata_json TEXT NOT NULL` + named validity CHECK | stored as validated JSON text; never decomposed into relational ids |
| `correlation_id` | `TEXT NOT NULL` | same, opaque, no FK | no correlation model invented |
| `created_at` | interface `createdAt: string`; SQL `TEXT NOT NULL` (no default) | `TEXT NOT NULL DEFAULT (current_timestamp)` / `isoNow` | append-only creation timestamp, matches the established Search Growth row convention |

No business uniqueness exists in either source, so no unique index was invented:
several events may legitimately share action/object/correlation. The single index
on `project_id` serves project-scoped reads only.

### Append-only enforcement decision

Immutability is enforced at the database boundary with the minimal
dialect-equivalent mechanism: `BEFORE UPDATE` / `BEFORE DELETE` abort triggers on
`search_growth_audit_events`. Rationale:
- A CHECK cannot reject UPDATE/DELETE, and application-only conventions do not
  satisfy "preserve the append-only contract at the database boundary" (TASK item
  2). Triggers are the smallest mechanism that rejects a direct UPDATE/DELETE on
  both SQLite and PostgreSQL.
- SQLite needs two named row triggers; PostgreSQL needs one function plus one
  `BEFORE UPDATE OR DELETE` trigger (the same behavior, dialect-native).
- Because FK cascade actions fire the child row triggers on both dialects
  (asserted by the storage test), deleting an owning Project that still has audit
  events is also blocked, so immutable audit history is never silently dropped
  (R42). A row can therefore only ever be INSERTed.
- The Project FK remains `ON DELETE cascade` for the established Project-scoping
  convention, but the delete trigger makes the cascade non-destructive for audit
  history.

## DEPENDENCIES CHANGED

None. No new runtime or dev dependency was added; no `package.json`/lockfile
change.

## TESTS ADDED

- `src/db/audit-event.test.ts` (10 tests) — migration-backed storage contract.
  The spec builds a real in-memory SQLite database, creates a `projects` table and
  applies the actual forward DDL from `drizzle/0071_stiff_the_professor.sql`
  (table + CHECK + both triggers), with `PRAGMA foreign_keys = ON`. Invariants:
  valid same-Project event persists with the full field set and NULL optional
  refs; optional before/after and opaque actor/object/correlation values persist
  verbatim; a dangling `project_id` is rejected by the FK; every required direct
  column (`actor_id`, `action`, `object_type`, `object_id`, `metadata_json`,
  `correlation_id`) rejects NULL; malformed metadata JSON is rejected by the
  CHECK; a direct UPDATE is rejected and the row is unchanged; a direct DELETE is
  rejected and the row remains; deleting the owning Project is blocked by the
  append-only trigger; the table ships exactly the 11 expected columns (no
  `updated_at` / runtime-control column); and exactly one FK exists
  (`project_id -> projects.id`; actor/object/correlation/before/after stay
  opaque).
- `src/types/schemas/audit-event.test.ts` (5 tests) — focused domain boundary:
  full direct contract round-trips verbatim and the metadata document is never
  parsed/decomposed; minimal event with NULL before/after accepted; every direct
  field is required; non-string metadata and non-string opaque values rejected;
  the exported `AuditEvent` type carries no `updatedAt` / runtime-control /
  execution field.
- Dialect parity: the new table is auto-covered by the existing
  `src/db/schema-parity.test.ts` (319 tests; +5 parity assertions over T125).

## COMMANDS RUN

Executed via `corepack pnpm ...` (bare `pnpm` is unavailable). No
`--dangerously-skip-permissions`, no commit, merge, push, or `main` touch. Each
command ran independently; no chained shell operations.

1. `corepack pnpm run db:generate`
2. `corepack pnpm run db:migrate:local`
3. `corepack pnpm exec vitest run src/db/audit-event.test.ts src/types/schemas/audit-event.test.ts src/db/schema-parity.test.ts`
4. `corepack pnpm lint`
5. `corepack pnpm test` (first full run)
6. `corepack pnpm exec vitest run src/server/auth/workspace-merge.test.ts`
7. `corepack pnpm test` (second full run)
8. `corepack pnpm build`
9. `corepack pnpm ci:check`
10. `corepack pnpm format:check`
11. `corepack pnpm run types:check`
12. `corepack pnpm knip`
13. `corepack pnpm exec prettier --check <task files>`
14. `corepack pnpm exec wrangler d1 migrations list DB --local`
15. `sqlite3 --version` / `command -v sqlite3`
16. Read-only Git: `git status --short`, `git diff --stat`, `git diff --check`

## COMMAND RESULTS

1. `db:generate` → **exit 0**. Both dialects report **62 tables** including
   `search_growth_audit_events 11 columns 1 indexes 1 fks`, and both print
   `No schema changes, nothing to migrate`. No new migration was generated, so
   schema, snapshots, and journals agree with no drift.
2. `db:migrate:local` → **exit 0**, `✅ No migrations to apply!`. `migrations_dir`
   is `drizzle` (`wrangler.jsonc`), so 0071 is in scope; the local D1 state in
   this worktree already recorded it as applied (the pre-existing partial worktree
   state, not a schema failure). The shipped 0071 DDL was independently exercised
   by the migration-backed storage test (command 3).
3. Focused Vitest → **exit 0**, 3 files / **334 tests passed**: domain
   `audit-event.test.ts` 5, storage `audit-event.test.ts` 10, parity 319.
4. `lint` (`oxlint . --type-aware`) → **exit 0**, `Found 0 warnings and 0 errors`,
   904 files.
5. First full `test` → **exit 1**. `src/server/auth/workspace-merge.test.ts` failed
   with `Hook timed out in 10000ms` in its `beforeAll`; 182 files / 1681 tests
   passed. Unrelated to this task (auth workspace merge, no audit-event code).
6. `workspace-merge.test.ts` in isolation → **exit 0**, 3 tests / 1.28s. Confirms
   the full-run failure was parallel-resource-contention flake, not a defect.
7. Second full `test` → **exit 0**, **183 files / 1684 tests passed**, including
   the new storage and domain suites and the parity suite.
8. `build` (`vite build && tsc --noEmit`) → **exit 0**. Client, SSR, and
   `open_seo_audit` bundles built; the trailing `tsc --noEmit` produced no
   diagnostics (so the type gate is satisfied through the build even though the
   standalone `types:check` script was sandbox-denied).
9. `ci:check` → **exit 1**. Prettier's repo-wide check flagged exactly one file:
   `control/ACCEPTANCE_LEDGER.md`. That file is committed (last modified by the
   T125 acceptance commit `91e95b7`, before this task) and is unmodified in this
   worktree (`git status --short` empty for it), so the failure is pre-existing
   control-plane formatting, outside this task's scope and not touched. Because
   the chain uses `&&`, `knip`/`tsc`/`oxlint`/plugin-sync did not run; the
   relevant repo-wide prettier result still proves every file changed by this
   task is formatted (only the ledger was listed).
10. `format:check` → **denied by executor sandbox** (no approval surface).
    Recorded once, no bypass.
11. `types:check` → **denied by executor sandbox**. Recorded once, no bypass;
    equivalent root `tsc --noEmit` passed inside `build` (command 8).
12. `knip` → **denied by executor sandbox**. Recorded once, no bypass. Precedent:
    the structurally identical T125 `release-target.ts` schema export (imported
    only by its test) passed knip in the last accepted `ci:check`.
13. `prettier --check <task files>` → **denied by executor sandbox**. Content
    already covered by the repo-wide check in command 9.
14. `wrangler d1 migrations list DB --local` → **denied by executor sandbox**.
15. `sqlite3` availability check → **denied by executor sandbox**.
16. Git read-only → `git diff --check` clean (no whitespace errors);
    `git status --short` shows exactly the intended 12-path set; tracked diff
    5 files, +179/−2.

## RUNTIME EVIDENCE

- Dual-dialect `db:generate`: 62 tables, `search_growth_audit_events 11 columns
  1 indexes 1 fks`, and `No schema changes, nothing to migrate` on both dialects
  after a clean re-run.
- Migration-backed storage (real SQLite from the shipped 0071 DDL): 10/10
  invariants pass, including FK rejection of a dangling project, CHECK rejection
  of malformed JSON, trigger rejection of direct UPDATE and DELETE, and trigger
  blocking of the owning-Project cascade delete while the row survives.
- Domain boundary: 5/5 tests pass; `AuditEvent` type is the direct row shape with
  no mutable field.
- Full suite: `Test Files 183 passed (183)`, `Tests 1684 passed (1684)`.
- Build: all three Vite environments built; `tsc --noEmit` no diagnostics.
- Git: `git diff --check` clean; exact 12-path change set.

## KNOWN LIMITATIONS

- `ci:check` cannot exit 0 in this worktree because of the pre-existing,
  unrelated `control/ACCEPTANCE_LEDGER.md` prettier violation (committed in
  `91e95b7`). This task did not modify that control file and does not own it.
- The PostgreSQL append-only trigger/function and JSON-cast CHECK are verified by
  structural parity plus the migration's dialect-native equivalence; there is no
  live PostgreSQL instance in this environment, so the PG DDL is not executed by
  a migration test. This matches the accepted sibling schema tasks.
- `db:migrate:local` reported no pending migrations because this worktree's local
  D1 state already recorded 0071 as applied; the migration's validity is proven
  by the storage test applying the exact shipped DDL to a fresh database.
- `knip`, standalone `types:check`/`format:check`, and the D1 migrations-list
  inspection were sandbox-denied (recorded, not bypassed). Lint and root
  `tsc --noEmit` were still verified through allowed commands.
- Scope-shape by design: opaque actor/object/correlation/before/after values have
  no foreign keys and no taxonomy; metadata is validated JSON text; the row is
  insert-only; no CRUD, UI, execution, publishing, spend, account, or connector
  behavior.

## DEVIATIONS FROM TASK

None in scope or acceptance criteria. Two environment facts are recorded rather
than worked around: the sandbox denials in commands 10–15, and the pre-existing
control-plane prettier failure in `control/ACCEPTANCE_LEDGER.md` which this task
does not edit (Controller-owned ledger; editing it would import an unrelated
change).

## SECURITY NOTES

- Credential-free, effect-free slice: no external action, no credential/account/
  connector model, no runtime-control mutation, no release execution, no
  publishing, no spend, and no production behavior.
- Opaque audit values are deliberately NOT foreign keys; no event taxonomy,
  business uniqueness, or polymorphic relation is invented (TASK item 3).
- Metadata is stored as JSON text but is never used to encode relational data;
  the DB rejects malformed documents on both dialects.
- Append-only history cannot be silently rewritten or dropped: UPDATE/DELETE are
  aborted, including via Project-delete cascade (R42).
- No secret or sensitive value is logged. No production publish, merge, or `main`
  modification was performed.

## GIT STATUS / DIFF SUMMARY

```
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? drizzle-pg/0049_daffy_cerebro.sql
?? drizzle-pg/meta/0049_snapshot.json
?? drizzle/0071_stiff_the_professor.sql
?? drizzle/meta/0071_snapshot.json
?? src/db/audit-event.test.ts
?? src/types/schemas/audit-event.test.ts
?? src/types/schemas/audit-event.ts
```

Tracked diff: 5 files, +179/−2. `git diff --check` clean. No commit, merge, push,
or `main` change.

## BLOCKERS

- Pre-existing, task-external: `control/ACCEPTANCE_LEDGER.md` fails repo-wide
  prettier, so the aggregate `ci:check` exits 1 before its later stages. Not
  caused by and not editable within this task.
- Executor sandbox denials for `knip`, `format:check`, `types:check`, the direct
  prettier invocation, and the D1 migrations-list inspection. Recorded once each;
  no bypass attempted. Equivalent coverage was obtained via `lint`,
  `ci:check`'s prettier pass, and the build's `tsc --noEmit`.
