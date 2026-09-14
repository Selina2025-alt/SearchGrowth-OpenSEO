# DELIVERY — T135-M1-PUBLISHING-JOB-CORE-SCHEMA (round 1)

## STATUS

`READY_FOR_REVIEW` — implementation round 1 of 3. No `REVIEW.md` existed at round
start, so there were no review findings to address. Every required TASK item 6
gate ran to completion in this executor session and exited 0: dual-dialect
`db:generate` (initial generation + clean re-run), local D1 migration,
focused Vitest, task-file Prettier, `format:check`, `types:check`, `lint`, full
Vitest, `build` and `ci:check`; read-only Git inspection is clean. No `PASS`
verdict is written by the implementation round.

## TASK ID

`T135-M1-PUBLISHING-JOB-CORE-SCHEMA` — implementation round 1. No `REVIEW.md`
existed at round start.

## IMPLEMENTATION SUMMARY

Adds the credential-free, Project-scoped `PublishingJob` persistence contract
across both dialects (D1/SQLite + PostgreSQL), plus its matching Zod/domain
boundary and migration-backed/domain tests. ONE PublishingJob is the persisted
record that binds ONE accepted ReleaseTarget and its fixed
PublicationExecutionPlan to an opaque executor identity and the source-defined
publishing lifecycle status, plus the retry/idempotency and optional
lease/external/error bookkeeping a later orchestration workflow reads
(05_DOMAIN_DATA_MODEL.md §12 PublishingJob; 18_WORKFLOW_STATE_MACHINES.md §§2/5;
10_DISTRIBUTION_ARCHITECTURE.md §§2–7; 20_DATABASE_SCHEMA_GUIDE.md §4 "job
idempotency key"; `schemas/domain-types.ts` `PublishingJobStatus`;
`schemas/migrations-reference.sql` `publishing_jobs`). This slice is
schema/contract only: a row is a record, never a claim, lease grant, state
transition, retry schedule, cancellation, execution, publish, receipt or success
proof (TASK GOAL / items 3–5).

Storage contract shipped (`publishing_jobs`, both dialects, 20 columns / 1 unique
index / 3 fks / 2 checks):

- stable text `id` (PK), explicit NOT NULL `project_id` (FK → `projects(id)` ON
  DELETE CASCADE), required `release_target_id`, required `execution_plan_id`,
  required opaque `executor_id` / `executor_version`, required source-defined
  `status`, required `attempts` (default 0) / `max_attempts`, required
  `idempotency_key`, nullable `leased_by` / `lease_expires_at`, nullable opaque
  `external_draft_id` / `external_task_id` / `external_content_id`, nullable
  `public_url`, nullable `last_error_code` / `last_error_message_safe`, and
  `created_at` + `updated_at` timestamps.
- Project and same-Project ReleaseTarget integrity by the Project-leading
  composite FK
  `(project_id, release_target_id) -> release_targets(project_id, id)` ON DELETE
  CASCADE, reusing the accepted parent target `release_targets_project_id_id_idx`
  (T125, D1 0070 / PG 0048).
- Project AND same-ReleaseTarget plan integrity by the Project-leading,
  target-matched composite FK
  `(project_id, release_target_id, execution_plan_id) ->
  publication_execution_plans(project_id, release_target_id, id)` ON DELETE
  CASCADE. Its parent target
  `publication_execution_plans_project_id_release_target_id_id_idx`
  `(project_id, release_target_id, id)` is added to the accepted T133 table by
  this forward migration — the ONLY supporting unique referential parent target
  this task adds (TASK item 2).
- Source-defined job idempotency identity by the UNIQUE index
  `publishing_jobs_idempotency_key_idx` on `(idempotency_key)`.
- Source-defined status enum by the DB CHECK `publishing_jobs_status_valid` (23
  `PublishingJobStatus` values) and safe attempt bounds by
  `publishing_jobs_attempts_valid` (`attempts >= 0 AND max_attempts >= 1 AND
  attempts <= max_attempts`); matching Zod narrowing in
  `src/types/schemas/publishing-job.ts`.
- Matching Zod/domain boundary `src/types/schemas/publishing-job.ts`:
  `PublishingJob` (`InferSelectModel`), `PUBLISHING_JOB_STATUSES`, and
  `publishingJobSchema` (Zod object mirroring the 20 direct fields plus the
  cross-field attempt bound).

## FIELD RECONCILIATION

Sources: the TASK item 1 direct field list (authoritative),
`05_DOMAIN_DATA_MODEL.md` §12, `18_WORKFLOW_STATE_MACHINES.md` §§2/5,
`10_DISTRIBUTION_ARCHITECTURE.md` §§2–7, `20_DATABASE_SCHEMA_GUIDE.md` §4,
`21_TEST_ACCEPTANCE_PLAN.md` §13/§15/§20/§21/§22, `29_SCOPE_LOCK.md`,
`30_TRACEABILITY_MATRIX.md`, the accepted ReleaseTarget (T125) /
PublicationExecutionPlan (T133) / PlatformDraft (T134) patterns, and the legacy
reference artifacts `schemas/domain-types.ts` `PublishingJobStatus` /
`schemas/migrations-reference.sql` `publishing_jobs`. Reference artifacts are
read-only and were NOT edited.

| Job field | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). Legacy `id` PK. |
| `project_id` | TASK item 1 "explicit Project identity"; item 2 | NOT NULL FK → `projects(id)` ON DELETE CASCADE. The legacy reference table has no `project_id`; the TASK requires it, so it is ADDED relative to legacy. |
| `release_target_id` | ReleaseTarget reference | NOT NULL text; same-Project composite FK `(project_id, release_target_id) -> release_targets(project_id, id)` ON DELETE CASCADE (parent `release_targets_project_id_id_idx` from T125 reused). |
| `execution_plan_id` | PublicationExecutionPlan reference | NOT NULL text; same-Project AND same-ReleaseTarget composite FK `(project_id, release_target_id, execution_plan_id) -> publication_execution_plans(project_id, release_target_id, id)` ON DELETE CASCADE. The supporting parent unique index is added by this forward migration. Legacy column is `execution_plan_id`. |
| `executor_id` / `executor_version` | opaque executor id/version | NOT NULL opaque text, stored verbatim; deliberately NOT foreign keys (no executor registry/catalogue exists; TASK item 3). Legacy shapes. |
| `status` | source-defined status | NOT NULL text-enum column constrained to exactly the 23-value `PublishingJobStatus` union (`schemas/domain-types.ts`; `schemas/state-machines.json` `publicPublishingJob`; 18 §2), DB CHECK `publishing_jobs_status_valid` + Zod `z.enum`. Records the current value only — no transition/CAS. The `18 §5` Local Bridge `QUEUED/LEASED/RUNNING` lease machine is a separate runtime concept and is deliberately NOT merged into this authoritative row-status enum. Legacy reference stores unconstrained `TEXT`; the source-of-truth enum is the domain/state-machine union. |
| `attempts` / `max_attempts` | attempts/max-attempts | NOT NULL integers, `attempts` default 0; safe numeric boundaries DB-checked (`attempts >= 0`, `max_attempts >= 1`, `attempts <= max_attempts`) and Zod-refined. No retry scheduling/incrementing. Legacy shapes. |
| `idempotency_key` | idempotency key | NOT NULL text; UNIQUE index `publishing_jobs_idempotency_key_idx` preserves the source-defined identity (legacy `UNIQUE`; 20 §4). No retry/replay behavior is defined around it. |
| `leased_by` / `lease_expires_at` | optional lease holder/expiry | Nullable text; NULL = no lease recorded (18 §5). Storage only — no claim, lease renewal or expiry enforcement (TASK item 3). Legacy shapes. |
| `external_draft_id` / `external_task_id` / `external_content_id` | opaque external identifiers | Nullable opaque text, stored verbatim; NOT foreign keys, NOT receipts, NOT remote-action proofs (TASK item 4). |
| `public_url` | optional public URL | Nullable opaque text, stored verbatim. Presence does NOT assert `PUBLIC_VERIFIED` or any publication result (TASK item 4). |
| `last_error_code` / `last_error_message_safe` | optional safe error code/message | Nullable opaque text; NULL = no error recorded. No error taxonomy and no retry decision derived (TASK item 3). |
| `created_at` / `updated_at` | creation/update timestamp | NOT NULL text defaulted to insert time. A job is intentionally mutable bookkeeping, so it carries a real `updated_at`; no CAS/version column (TASK items 1/3). Unlike the immutable evidence tables. |

## PROJECT / TARGET-PLAN INTEGRITY AND DELETE DECISIONS

- Project ownership: `project_id` NOT NULL FK → `projects(id)` ON DELETE CASCADE
  (the established Project-scoping FK every Search Growth row carries).
- Same-Project target: `(project_id, release_target_id)` → `release_targets(project_id, id)`,
  CASCADE. A target on another Project has no matching parent row.
- Same-Project AND same-target plan: `(project_id, release_target_id, execution_plan_id)`
  → `publication_execution_plans(project_id, release_target_id, id)`, CASCADE.
  A plan from another Project, or from a different ReleaseTarget of the SAME
  Project, has no matching parent row. This is stronger than a same-Project-only
  plan FK, exactly as TASK item 2 requires.
- Delete behavior: CASCADE throughout. Deleting the ReleaseTarget, the chosen
  plan or the whole Project removes its jobs; a job can never dangle. No
  `no action`/SET NULL behavior is invented. Migration-backed tests assert all
  three cascades.
- Supporting parent target: one unique index
  `publication_execution_plans_project_id_release_target_id_id_idx` on the
  accepted T133 table, added by this forward migration. `id` is already the PK
  and `release_target_id` already unique, so it accepts exactly the existing rows
  and adds no business uniqueness. No accepted historical migration was edited
  and no other parent index was added.

## LEASE / EXTERNAL / PUBLIC-SUCCESS BOUNDARIES

- Lease columns (`leased_by`, `lease_expires_at`) are recorded storage only. No
  claim, lease grant/renewal, expiry enforcement, cancellation or kill-switch
  behavior exists (TASK items 3/OUT OF SCOPE).
- External identifiers (`external_draft_id`, `external_task_id`,
  `external_content_id`) are opaque stored strings. No publisher connection,
  credential, certification, bridge, provider, account row or external system is
  referenced or created; `taskSetId`/draft-id semantics are not asserted.
- `public_url` is an opaque recorded URL. The row has no receipt column, no
  `PUBLIC_VERIFIED`-implying constraint and no verification timestamp
  (10 §8; 21 §§16/22; TASK item 4). A stored URL is never a publication result.
- No route resolution/execution, staging/finalizing/publishing, retry/backoff,
  CAS/state transition, concurrency, cancellation, kill-switch enforcement or job
  execution behavior exists (TASK item 3).

## FILES CHANGED

Modified (`git status --short`):

- `drizzle/meta/_journal.json` — added journal entry idx 80
  (`0080_milky_ghost_rider`).
- `drizzle-pg/meta/_journal.json` — added journal entry idx 58
  (`0058_slippery_dagger`).
- `src/db/search-growth.schema.ts` — added `publishingJobs` SQLite table and the
  supporting `publication_execution_plans` unique index; header tally updated.
- `src/db/pg/search-growth.schema.ts` — added the `publishingJobs` Postgres
  mirror and the matching supporting unique index; header tally updated.
- `src/db/schema.ts` — exported `publishingJobs` from the canonical barrel.

Added (untracked):

- `drizzle/0080_milky_ghost_rider.sql` — forward D1 migration (table + idempotency
  index + supporting parent index).
- `drizzle/meta/0080_snapshot.json` — D1 snapshot.
- `drizzle-pg/0058_slippery_dagger.sql` — forward PostgreSQL migration.
- `drizzle-pg/meta/0058_snapshot.json` — PostgreSQL snapshot.
- `src/types/schemas/publishing-job.ts` — Zod/domain boundary.
- `src/types/schemas/publishing-job.test.ts` — focused domain contract tests.
- `src/db/publishing-job.test.ts` — migration-backed storage contract tests.

No accepted historical migration, Accepted ADR, `29_SCOPE_LOCK.md` or
`REVIEW.md` was edited; no dependency, `package.json` or lockfile change.

## DATABASE/MIGRATION CHANGES

- D1 forward migration `0080_milky_ghost_rider.sql`: `CREATE TABLE
  publishing_jobs` (20 columns, 3 FKs, 2 named CHECKs), `CREATE UNIQUE INDEX
  publishing_jobs_idempotency_key_idx`, and `CREATE UNIQUE INDEX
  publication_execution_plans_project_id_release_target_id_id_idx` on the
  accepted `publication_execution_plans` table.
- PostgreSQL forward migration `0058_slippery_dagger.sql`: mirrored table, FKs,
  named CHECKs and both unique indexes (`USING btree`).
- Journals updated to idx 80 / 58; both snapshots carry the table, both unique
  indexes and the 3 FKs. No historical migration modified.

## DEPENDENCIES CHANGED

None. `package.json` and `pnpm-lock.yaml` are unmodified.

## TESTS ADDED

- `src/db/publishing-job.test.ts` (15 tests): valid full same-Project
  persistence; optional lease/external/public/error defaults NULL and `attempts`
  0; duplicate idempotency-key rejection; different key + multiple jobs per
  target allowed; invalid status enum rejection; unsafe attempt-bound rejection
  (negative, zero max, attempts > max); cross-Project target rejection in both
  directions; cross-Project plan rejection; same-Project wrong-target plan
  rejection; dangling target/plan/project rejection; delete cascade on target,
  on plan and on whole project; NOT NULL required columns; exact 20-column
  storage shape (no receipt/PUBLIC_VERIFIED/route/credential column). Runs the
  shipped 0045→0070 + 0078 + 0080 DDL in in-memory SQLite with FKs ON.
- `src/types/schemas/publishing-job.test.ts` (7 tests): full contract verbatim;
  lease/external/public/error populated; every source-defined status accepted;
  statuses outside the union rejected; unsafe attempt bounds rejected; missing
  required field rejected; row type exposes only the storage contract.

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no commit/merge/push). One
environment bootstrap (`install --frozen-lockfile`) was required because this
fresh worktree had no `node_modules`; it used the existing lockfile and changed
no tracked file — the same necessity recorded by prior task deliveries.

1. `corepack pnpm install --frozen-lockfile` (environment bootstrap)
2. `corepack pnpm run db:generate` (initial generation)
3. `corepack pnpm run db:migrate:local`
4. `corepack pnpm exec vitest run src/types/schemas/publishing-job.test.ts src/db/publishing-job.test.ts`
5. `corepack pnpm exec vitest run src/types/schemas/publishing-job.test.ts src/db/publishing-job.test.ts src/db/schema-parity.test.ts`
6. `corepack pnpm run db:generate` (clean re-run)
7. `corepack pnpm exec prettier --write src/db/search-growth.schema.ts src/db/pg/search-growth.schema.ts src/db/schema.ts src/types/schemas/publishing-job.ts src/types/schemas/publishing-job.test.ts src/db/publishing-job.test.ts`
8. `corepack pnpm types:check`
9. `corepack pnpm format:check`
10. `corepack pnpm lint`
11. `corepack pnpm test`
12. `corepack pnpm build`
13. `corepack pnpm ci:check`
14. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`)

## COMMAND RESULTS

**All required gates exit 0 on the final tree.**

1. Frozen install → exit 0 — "reused 980, downloaded 0, added 980, done in
   1m 50.3s"; only pnpm's ignored-build-scripts warning.
2. Initial `db:generate` → exit 0 — wrote `drizzle/0080_milky_ghost_rider.sql`
   and `drizzle-pg/0058_slippery_dagger.sql`; 71 tables each;
   `publishing_jobs 20 columns 1 indexes 3 fks`;
   `publication_execution_plans 14 columns 2 indexes 2 fks`.
3. `db:migrate:local` → exit 0 — applied the full local D1 chain; final state
   `0080_milky_ghost_rider.sql ✅`.
4. Focused Vitest (first run) → exit 1 — one new storage test used the `DEFAULT`
   keyword inside `VALUES`, which SQLite rejects. Fixed by inserting `0`
   explicitly (test-only); production code unaffected.
5. Focused Vitest (final) → exit 0 — 3 files / 386 tests passed (new storage 15,
   new domain 7, parity 364).
6. Clean re-run `db:generate` → exit 0 — both dialects print `No schema changes,
   nothing to migrate 😴`.
7. Task-file Prettier → exit 0 — 4 files reformatted (both schema files and both
   new tests); `schema.ts` and `publishing-job.ts` unchanged.
8. `types:check` (first run) → exit 2 — the test `literal` helper's fallback
   parameter was typed `string` but nullable fields pass `null`. Fixed by widening
   the fallback to `string | null` (test-only).
9. `types:check` (final) → exit 0, no diagnostics.
10. `format:check` → exit 0 — "All matched files use Prettier code style!".
11. `lint` (`oxlint . --type-aware`) → exit 0 — "Found 0 warnings and 0 errors.
    Finished in 55.9s on 931 files".
12. Full `test` → exit 0 — 201 files / 1891 tests passed.
13. `build` → exit 0 — vite client, SSR and open_seo_audit bundles built,
    followed by `tsc --noEmit` with no output.
14. `ci:check` → exit 0 (completed in the background) — prettier clean, knip
    clean, both `tsc --noEmit` runs clean, oxlint 0 warnings/0 errors on 931
    files, plugin-skills sync clean
    (`plugin skill sync clean: plugins/openseo/skills`).
15. Read-only Git → `git diff --check` clean (no output).

## RUNTIME EVIDENCE

- `db:generate` (both dialects): 71 tables, `publishing_jobs 20 columns 1 indexes
  3 fks`, `publication_execution_plans 14 columns 2 indexes 2 fks`, and
  `No schema changes, nothing to migrate 😴` after the clean re-run — schema and
  snapshots agree with no drift.
- `db:migrate:local`: final applied migration is `0080_milky_ghost_rider.sql ✅`.
- Snapshot check: `drizzle/meta/0080_snapshot.json` and
  `drizzle-pg/meta/0058_snapshot.json` both contain `publishing_jobs`, the
  idempotency unique index, the three named FKs, both named CHECKs
  (`publishing_jobs_status_valid`, `publishing_jobs_attempts_valid`) and the
  supporting parent index
  `publication_execution_plans_project_id_release_target_id_id_idx`.
- Storage suite executes the shipped 0080 DDL directly and asserts real SQLite
  FK/UNIQUE/CHECK/cascade behavior (15 tests).
- Full suite: `Test Files 201 passed (201)`, `Tests 1891 passed (1891)`.
- `build`: client/SSR/open_seo_audit bundles built; `tsc --noEmit` no
  diagnostics.
- `ci:check`: full chain completed with exit 0, final line
  `plugin skill sync clean: plugins/openseo/skills`.
- Git: `git status --short` shows exactly the intended 12-entry file set;
  `git diff --check` clean.

## KNOWN LIMITATIONS

- None blocking. Every TASK item 6 gate ran and exited 0 in this session; no
  `BLOCKED_BY_TEST_ENVIRONMENT`, `BLOCKED_BY_DESIGN`,
  `BLOCKED_BY_EXTERNAL_DEPENDENCY` or `SPEC_IMPLEMENTATION_CONFLICT` status is
  claimed.
- Scope-shape notes (by design, not defects): schema/contract only — no
  claim/lease/renewal, state transition/CAS, retry/backoff scheduling,
  concurrency, cancellation, kill-switch enforcement, job execution, route
  resolution, staging/finalizing/publishing, external system, connector/
  credential/account, bridge, provider, browser, paid/production action or UI.
  `executor_id`/`executor_version`/`idempotency_key`/external ids/`public_url`/
  error fields are opaque/verbatim; `public_url` carries no `PUBLIC_VERIFIED`,
  receipt or remote-action semantics.
- The status enum is the authoritative `PublishingJobStatus` union (18 §2 /
  `state-machines.json`); the `18 §5` Local Bridge `QUEUED/LEASED/RUNNING` lease
  machine is intentionally not merged into the row-status enum because lease
  runtime is out of scope and the two are distinct source concepts.
- `attempts <= max_attempts` is enforced as the safe boundary; the source defines
  no other attempt constraint.

## DEVIATIONS FROM TASK

- None that change scope.
- `project_id`, `execution_plan_id` and the two same-Project composite FKs are
  ADDED relative to the legacy `publishing_jobs` reference table, because TASK
  items 1–2 explicitly require explicit Project identity and Project-leading
  database ownership constraints.
- The plan composite FK references the triple
  `(project_id, release_target_id, id)`, which required adding one supporting
  unique index to the accepted T133 `publication_execution_plans` table in this
  forward migration. TASK item 2 explicitly authorizes "only the supporting
  unique referential parent target(s) needed through this forward migration"; no
  historical migration was modified.
- Migration file names are generator-chosen (`0080_milky_ghost_rider`,
  `0058_slippery_dagger`) because the TASK-approved `db:generate` takes no
  `--name`; the forward IDs match the TASK exactly.
- The idempotency UNIQUE index is global on `(idempotency_key)`, preserving the
  source-defined identity (legacy `UNIQUE`), not Project-leading.
- The frozen install was an environment bootstrap (fresh worktree had no
  `node_modules`); it changed no tracked file and used the existing lockfile.

## SECURITY NOTES

- No credential, account, connector, bridge, publisher connection, provider,
  browser or cookie model is added or referenced; external ids are opaque text
  only (TASK item 4; `29_SCOPE_LOCK.md`).
- No CAPTCHA/2FA bypass, stealth behavior, cookie upload, paid action,
  production publishing or external contact was implemented or invoked.
- No `PUBLIC_VERIFIED`/receipt/verification claim is made from any stored field:
  a `public_url` or external id is an opaque record, not a production result
  (TASK item 4; 21 §§16/22).
- All untrusted row values are narrowed at the Zod boundary; structured status
  and attempt bounds are enforced at both the DB and Zod edges.

## GIT STATUS/DIFF SUMMARY

`git status --short` (final):

```text
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? drizzle-pg/0058_slippery_dagger.sql
?? drizzle-pg/meta/0058_snapshot.json
?? drizzle/0080_milky_ghost_rider.sql
?? drizzle/meta/0080_snapshot.json
?? src/db/publishing-job.test.ts
?? src/types/schemas/publishing-job.test.ts
?? src/types/schemas/publishing-job.ts
```

`git diff --stat` (tracked): 5 files changed, 376 insertions(+), 2 deletions(-).
`git diff --check`: clean. Branch:
`ai-task/T135-M1-PUBLISHING-JOB-CORE-SCHEMA`. No commit, merge or push was made.

## READY FOR REVIEW

`READY_FOR_REVIEW` — implementation complete and all required gates green. Only
Codex may mark PASS.
