# DELIVERY — T125-M1-RELEASE-TARGET-CORE-SCHEMA (round 1)

## STATUS

`READY_FOR_REVIEW` — implementation round 1 of 3. No `REVIEW.md` existed at round
start, so there were no review findings to address. Every required TASK item 5
gate ran to completion in this executor session and exited 0: frozen install,
dual-dialect `db:generate` (generation + clean re-run), local D1 migration,
focused Vitest, `format:check`, `types:check`, `lint`, full Vitest, `build`, and
`ci:check`; read-only Git inspection is clean. No `PASS` verdict is written by
the implementation round.

## TASK ID

`T125-M1-RELEASE-TARGET-CORE-SCHEMA` — implementation round 1. No `REVIEW.md`
existed at round start.

## IMPLEMENTATION SUMMARY

Adds the credential-free, immutable, Project-scoped `ReleaseTarget` core
persistence contract across both dialects (D1/SQLite + PostgreSQL), plus its
matching Zod/domain boundary and migration-backed/domain tests. A ReleaseTarget
is the source-defined target intent frozen inside a ReleaseBundle before it is
resolved into a PublicationExecutionPlan
(05_DOMAIN_DATA_MODEL.md §12 ReleaseTarget; 10_DISTRIBUTION_ARCHITECTURE.md §2/§4;
16_ATTRIBUTION_EXPERIMENT_SPEC.md; 21_TEST_ACCEPTANCE_PLAN.md §14;
18_WORKFLOW_STATE_MACHINES.md §2). This slice is schema/contract only: it
implements no approve, execute, publish, spend, external-system contact, or
credential/account/connector behavior (TASK items 1, 3, 4). A row is never a
publish instruction, execution result, approval action or public-success proof.

Storage contract shipped (`release_targets`, both dialects, 12 columns / 1 index
/ 4 fks):

- stable text `id` (PK), explicit NOT NULL `project_id` (FK → `projects(id)` ON
  DELETE CASCADE), required `release_bundle_id` and `content_variant_id`,
  opaque free-form `platform`, required source-defined `target_intent` enum,
  `required` boolean flag (NOT NULL DEFAULT true), nullable `scheduled_at`,
  nullable `dependency_target_id`, nullable `utm_url`, required opaque
  `target_hash`, and the append-only `created_at` timestamp only.
- Same-Project ReleaseBundle ownership enforced by the Project-leading composite
  FK `(project_id, release_bundle_id) -> release_bundles(project_id, id)` ON
  DELETE CASCADE. Its parent target `release_bundles_project_id_id_idx` is the
  ONE new supporting parent index this slice adds to the accepted T124 table.
- Same-Project ContentVariant ownership enforced by the Project-leading composite
  FK `(project_id, content_variant_id) -> content_variants(project_id, id)` ON
  DELETE CASCADE, reusing the accepted `content_variants_project_id_id_idx`
  (T123, D1 0068 / PG 0046). No index is added to `content_variants`.
- Optional `dependency_target_id` enforced as a same-Project self-reference via
  the composite FK `(project_id, dependency_target_id) -> release_targets(project_id,
  id)` ON DELETE NO ACTION, with the supporting `release_targets_project_id_id_idx`.
- Enum enforcement: named DB CHECK `release_targets_target_intent_valid`
  (DRAFT / PUBLIC / SUBMIT_FOR_REVIEW / PAID_SUBMIT), plus the matching Zod enum
  at the runtime edge.
- No business uniqueness rule (none is source-defined) and no
  `publisher_connection_id` column (deliberately deferred — TASK item 3).
- Matching Zod/domain boundary `src/types/schemas/release-target.ts`:
  `ReleaseTarget` (`InferSelectModel`) and `releaseTargetSchema` (Zod object
  mirroring the 12 direct fields).

## FIELD RECONCILIATION

Sources: the TASK item 1 field list (authoritative), `05_DOMAIN_DATA_MODEL.md`
§12, `10_DISTRIBUTION_ARCHITECTURE.md` §§2/4, `16_ATTRIBUTION_EXPERIMENT_SPEC.md`,
`18_WORKFLOW_STATE_MACHINES.md` §2, `21_TEST_ACCEPTANCE_PLAN.md` §§12–14,
`20_DATABASE_SCHEMA_GUIDE.md`, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`,
the accepted ReleaseBundle (T124) / ContentVariant (T122) patterns, and the
legacy reference artifacts `schemas/domain-types.ts` `ReleaseTarget` /
`schemas/migrations-reference.sql` `release_targets`. Reference artifacts are
read-only and were NOT edited.

| ReleaseTarget aspect | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). |
| `project_id` | non-null Project ownership | NOT NULL FK → projects(id) ON DELETE CASCADE. |
| `release_bundle_id` | non-null ReleaseBundle ownership | NOT NULL text id; same-Project composite FK `(project_id, release_bundle_id) -> release_bundles(project_id, id)` ON DELETE CASCADE. New supporting parent target `release_bundles_project_id_id_idx` added to the accepted T124 table. |
| `content_variant_id` | non-null ContentVariant ownership | NOT NULL text id; same-Project composite FK `(project_id, content_variant_id) -> content_variants(project_id, id)` ON DELETE CASCADE (parent `content_variants_project_id_id_idx` from T123 0068/0046 reused, not recreated). |
| `platform` | platform | NOT NULL opaque free-form string. No platform enum is invented — the platform/connector catalogue is a later gated task (TASK item 3). Matches the accepted ContentVariant free-form platform. |
| `target_intent` | source-defined target intent | NOT NULL text enum + named CHECK, exactly DRAFT / PUBLIC / SUBMIT_FOR_REVIEW / PAID_SUBMIT (domain-types.ts `TargetIntent`; 10 §2 `targetIntent`). Legacy property name `intent` ships as `targetIntent`/`target_intent` to match the source column/plan key. |
| `required` | required flag | NOT NULL DB boolean DEFAULT true (legacy `required INTEGER NOT NULL DEFAULT 1`; 16 spec). |
| `scheduled_at` | optional schedule | Nullable text; NULL = not scheduled. No scheduler runs in this slice. |
| `dependency_target_id` | optional target dependency | Nullable text; same-Project composite self-FK with ON DELETE NO ACTION (details below). Never an unconstrained relational id. |
| `utm_url` | optional UTM URL | Nullable text stored verbatim; NULL = none. No UTM expansion/GA4 attribution behavior. |
| `target_hash` | target hash | NOT NULL opaque hash stored verbatim; plain non-unique column, no dedup rule. |
| `created_at` | creation timestamp | NOT NULL text timestamp with DB default; the ONLY audit column. |
| `publisher_connection_id` | legacy `migrations-reference.sql` NOT NULL column | **DELIBERATELY NOT persisted** (TASK item 3). A publisher connection / credential / account / connector / external integration model belongs to a later gated credential-bound task; an unconstrained relational id must not exist. There is no account/connector/credential column and no replacement FK. |
| `updated_at` | legacy `migrations-reference.sql` column | Reconciled OUT — the TASK field list names the creation timestamp only, and the target core is immutable: a target/UTM/variant change creates a new release version (21 §12), not a mutated row. Matches the accepted immutable ContentVariant/ReleaseBundle row shape. |
| Execution plan / route / draft / job / receipt / public-success state | separate tasks (TASK item 4) | Reconciled OUT — no route/execution/draft/job/receipt/publishing/public-success column exists on this row. Route resolution is `PublicationExecutionPlan` (10 §2), a later task. |

## RELATION / FK / IDENTITY / ENUM / DELETE / IMMUTABILITY DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project ReleaseBundle integrity: Project-leading composite FK
  `(project_id, release_bundle_id) -> release_bundles(project_id, id)` ON DELETE
  CASCADE. A target whose bundle belongs to a different Project has no matching
  parent row and is rejected by the DB; a dangling bundle is likewise rejected.
- Same-Project ContentVariant integrity: Project-leading composite FK
  `(project_id, content_variant_id) -> content_variants(project_id, id)` ON DELETE
  CASCADE. Cross-Project/dangling variants are rejected by the DB.
- Supporting parent targets: ONE new parent index —
  `release_bundles_project_id_id_idx` on the accepted T124 `release_bundles`
  table (required by the bundle composite FK). The ContentVariant target is the
  accepted `content_variants_project_id_id_idx` (T123) and is reused; no index is
  added to `content_variants` or `release_bundles` beyond this necessary one. On
  the new table, `release_targets_project_id_id_idx` is the only other index and
  exists solely to support the dependency self-FK.
- Optional dependency: composite self-FK `(project_id, dependency_target_id) ->
  release_targets(project_id, id)` ON DELETE NO ACTION. A NULL dependency is
  unconstrained (MATCH SIMPLE ignores a composite FK with a NULL column); a
  non-NULL dependency must name a target on the SAME project; deleting a target
  another target still depends on is blocked rather than silently SET NULL —
  SET NULL is impossible for a composite FK whose NOT NULL `project_id` cannot be
  nulled. This mirrors the accepted same-Project self-reference pattern
  (`search_topics.merged_into_topic_id`). A whole-project delete still cascades
  all same-Project targets together (migration-backed test).
- Identity: NO source-defined business uniqueness exists for ReleaseTarget (the
  legacy `release_targets` table has none), so none is invented (TASK item 4).
  The only unique indexes are the referential supporting targets the composite
  FKs require. There is no target-identity dedup rule.
- Enum: DB-level CHECK rejection of `target_intent` outside the four-value
  source union (migration-backed enum test), with the same list narrowed by the
  Zod boundary.
- Delete behavior: CASCADE on the Project FK and both ownership composite FKs;
  NO ACTION (restrictive) on the optional dependency self-FK. A target can never
  dangle and a whole-project delete is never blocked by a dependency.
- Immutability boundary: the row carries `created_at` only; no `updated_at`, no
  state-transition/CAS/approval-action/execution/route/publishing/paid behavior
  (TASK item 4). `target_hash` is opaque; there is no account/credential column.

## MIGRATION IDS

- D1/SQLite `0070_youthful_bill_hollister`: `drizzle/0070_youthful_bill_hollister.sql`,
  `drizzle/meta/0070_snapshot.json`, `drizzle/meta/_journal.json` (idx 70).
  Creates `release_targets` with the Project FK, the two same-Project ownership
  composite FKs, the dependency self-FK, the intent CHECK and the target
  self-reference supporting index, plus the new parent index
  `release_bundles_project_id_id_idx`.
- PostgreSQL `0048_adorable_revanche`: `drizzle-pg/0048_adorable_revanche.sql`,
  `drizzle-pg/meta/0048_snapshot.json`, `drizzle-pg/meta/_journal.json` (idx 48).
  Adds the table, the intent CHECK, the four FK constraints and both indexes;
  no manual edit was required because the reused
  `content_variants_project_id_id_idx` already exists from PG 0046.
- Accepted migrations (SQLite ≤ 0069, PG ≤ 0047) were NOT edited. A clean
  dual-dialect `db:generate` re-run reports `No schema changes, nothing to
  migrate 😴` on both dialects (61 tables each; `release_targets` = 12 columns /
  1 index / 4 fks; `release_bundles` = 12 columns / 2 indexes / 2 fks).

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — header `max-lines` eslint-disable updated;
  added the new `release_bundles_project_id_id_idx` parent target to the accepted
  `releaseBundles` table; appended the `releaseTargets` sqliteTable with the full
  reconciliation / ownership / dependency / enum / immutability comment block.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror and the
  same parent index.
- `src/db/schema.ts` — provider-aware barrel destructure adds `releaseTargets`.
- `drizzle/meta/_journal.json`, `drizzle-pg/meta/_journal.json` — generate entries.

Added (untracked):

- `drizzle/0070_youthful_bill_hollister.sql`, `drizzle/meta/0070_snapshot.json`.
- `drizzle-pg/0048_adorable_revanche.sql`, `drizzle-pg/meta/0048_snapshot.json`.
- `src/db/release-target.test.ts` — migration-backed storage spec (14 tests).
- `src/types/schemas/release-target.ts` — Zod/domain boundary.
- `src/types/schemas/release-target.test.ts` — focused domain tests (7 tests).

Task-channel file: `DELIVERY.md` (this document). No `REVIEW.md` existed and none
was created or edited.

## DATABASE/MIGRATION CHANGES

- New `release_targets` table on both dialects (12 columns / 1 secondary index /
  4 fks each): D1 0070 and PG 0048, with snapshots + journals.
- The accepted `release_bundles` table gains ONE supporting unique index
  `release_bundles_project_id_id_idx` (project_id, id) as the composite-FK parent
  target (now 12 columns / 2 indexes / 2 fks on each dialect). No column changed.
- `content_variants` is unchanged (11 columns / 1 index / 2 fks on each dialect);
  its accepted `content_variants_project_id_id_idx` composite-FK target is
  reused.
- 61 tables total on each dialect (up from 60).
- Local D1 migration applied all forward migrations through
  `0070_youthful_bill_hollister` successfully.

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install used
the existing lockfile).

## TESTS ADDED

- `src/db/release-target.test.ts` — 14 migration-backed storage tests that build a
  real in-memory SQLite client, enable `PRAGMA foreign_keys = ON`, hand-create
  `projects`, and apply the actual shipped forward-migration DDL in order
  (`0045` → `0046` → `0049` → `0055` → `0056` → `0057` → `0060` → `0061` → `0062`
  → `0063` → `0064` → `0067` → `0068` → `0069` → `0070`, split on
  `--> statement-breakpoint`). Covers: valid same-Project persistence with the
  full required field set + required defaulting true + NULL optional fields +
  append-only `created_at`; optional schedule/dependency/UTM and `required=false`
  persisted verbatim; all 4 target intents accepted; intent outside the union
  rejected; cross-Project bundle rejection; cross-Project variant rejection in
  EITHER direction; dangling bundle/variant/Project rejection; cross-Project
  dependency rejection; restrictive dependency delete (a depended-on target
  cannot be deleted and the pointer is not nulled); whole-project cascade with a
  dependency chain; bundle-delete cascade; variant-delete cascade; NOT NULL
  rejection of every required direct column; and the exact 12-column storage
  shape (no `publisher_connection_id`, no `updated_at`, no
  account/execution/receipt/publishing column).
- `src/types/schemas/release-target.test.ts` — 7 focused domain tests: full
  contract round-trips verbatim and `targetHash` is never decomposed; minimal
  target with NULL optional fields; every target intent accepted; out-of-union
  intent rejected; missing required field rejected; non-boolean `required`
  rejected; exported `ReleaseTarget` row type has no `updatedAt` /
  `publisherConnectionId` / `accountId`.
- Dialect parity: the new table and the new `release_bundles` index are
  auto-covered by the existing `src/db/schema-parity.test.ts` (now 314 tests,
  structurally comparing every SQLite and PG table).

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...` (no
bare `pnpm`, no `--dangerously-skip-permissions`, no commit/merge/push). All exits
are exact.

1. `corepack pnpm run db:generate` (initial generation)
2. `corepack pnpm run db:migrate:local` (first attempt)
3. `corepack pnpm install --frozen-lockfile`
4. `corepack pnpm run db:migrate:local` (retry)
5. `corepack pnpm exec vitest run src/db/release-target.test.ts src/types/schemas/release-target.test.ts src/db/schema-parity.test.ts` (intermediate)
6. `corepack pnpm exec vitest run src/db/release-target.test.ts` (intermediate)
7. `corepack pnpm run db:generate` (clean re-run)
8. `corepack pnpm exec prettier --write <task files>`
9. `corepack pnpm types:check`
10. `corepack pnpm format:check`
11. `corepack pnpm lint`
12. `corepack pnpm exec vitest run src/db/release-target.test.ts src/types/schemas/release-target.test.ts src/db/schema-parity.test.ts` (final)
13. `corepack pnpm test`
14. `corepack pnpm build`
15. `corepack pnpm ci:check`
16. Read-only Git inspection (`git status --short`, `git diff --check`, `git diff --stat`)

## COMMAND RESULTS

**All required gates exit 0 on the final tree.**

1. Initial `db:generate` → exit 0 — wrote `drizzle/0070_youthful_bill_hollister.sql`
   and `drizzle-pg/0048_adorable_revanche.sql`; 61 tables each;
   `release_targets 12 columns 1 indexes 4 fks`, `release_bundles 12 columns 2
   indexes 2 fks`.
2. First `db:migrate:local` → **exit 1** — `'wrangler' is not recognized` and
   pnpm's "node_modules missing, did you mean to install?" because this fresh
   worktree had no installed dependencies. Not a schema failure.
3. Frozen install → exit 0 — 980 packages, "Done in 1m 6s"; only pnpm's
   ignored-build-scripts warning.
4. `db:migrate:local` retry → exit 0 — applied the full local D1 chain including
   `0070_youthful_bill_hollister.sql ✅`.
5. Intermediate focused Vitest → exit 1 — 14 storage tests failed with
   `foreign key mismatch - "content_variant_media_assets" referencing
   "media_assets"` because the in-memory test chain omitted migration `0061`
   (which creates `media_assets_project_id_id_idx`). Fixed by adding `0061` to the
   test's applied-migration list (test-only).
6. Intermediate focused Vitest rerun → exit 1 — 4 storage tests failed with
   `near ",": syntax error` from the new `insertTarget` test helper's optional
   column/value string assembly. Fixed by rewriting the helper to build the
   column and value arrays together (test-only). Both intermediates were real
   test-infrastructure defects, fixed in-scope; no production/SQL change.
7. Clean re-run `db:generate` → exit 0 — both dialects print `No schema changes,
   nothing to migrate 😴`.
8. Task-file Prettier → exit 0 (`src/db/search-growth.schema.ts` reformatted;
   others unchanged).
9. `types:check` (`tsc --noEmit`) → exit 0, no diagnostics.
10. `format:check` → exit 0 — "All matched files use Prettier code style!".
11. `lint` (`oxlint . --type-aware`) → exit 0 — "Found 0 warnings and 0 errors.
    Finished in 69.2s on 901 files".
12. Final focused Vitest → exit 0 — 3 files / 335 tests passed (new storage 14,
    new domain 7, parity 314).
13. Full `test` → exit 0 — 181 files / 1664 tests passed.
14. `build` → exit 0 — vite client (`✓ built in 33.77s`), SSR (`✓ built in
    41.52s`) and open_seo_audit (`✓ built in 6.37s`) all succeeded; `tsc --noEmit`
    followed with no output.
15. `ci:check` → exit 0 — prettier clean, knip clean, both `tsc --noEmit` runs
    clean, oxlint clean, plugin-skills sync clean
    (`plugin skill sync clean: plugins/openseo/skills`).
16. Read-only Git → exit 0 — `git diff --check` clean (no output).

## RUNTIME EVIDENCE

- `db:generate` (both dialects): 61 tables, `release_targets 12 columns 1 indexes
  4 fks`, `release_bundles 12 columns 2 indexes 2 fks`, and `No schema changes,
  nothing to migrate 😴` after the clean re-run — schema and snapshots agree with
  no drift. `content_variants` is unchanged (11 columns / 1 index / 2 fks).
- `db:migrate:local`: `0070_youthful_bill_hollister.sql ✅` is the final applied
  migration, exit 0.
- Snapshot check: both `0070_snapshot.json` and `0048_snapshot.json` contain
  `release_targets_project_id_id_idx`, `release_bundles_project_id_id_idx` and
  the `release_targets_target_intent_valid` CHECK.
- Full suite: `Test Files 181 passed (181)`, `Tests 1664 passed (1664)`; the new
  storage (14), domain (7) and parity (314) suites all pass inside it.
- `build`: client/SSR/open_seo_audit bundles built, `tsc --noEmit` no diagnostics.
- `ci:check`: full chain completed, final line
  `plugin skill sync clean: plugins/openseo/skills`.
- Git: `git status --short` shows exactly the intended file set;
  `git diff --check` clean; `git diff --stat` (tracked) 5 files, +324/−2.

## KNOWN LIMITATIONS

- None blocking. Every TASK item 5 gate ran and exited 0 in this session; no
  `BLOCKED_BY_TEST_ENVIRONMENT` status is claimed.
- The only non-fatal output was pnpm's ignored-build-scripts warning during
  install and vite's chunk-size warnings during build; neither affects exit
  status or this task's scope.
- Scope-shape notes (by design, not defects): the table and boundary are
  schema/contract only — no approve/execute/publish/spend/external-system action,
  no route resolution, no scheduler, no state transition/CAS, no credential/
  account/connector behavior, no UI or production behavior; `target_hash` and
  `utm_url` are opaque/verbatim; there is no `updated_at`; the optional dependency
  is restrictive on delete; and there is no business uniqueness rule.

## DEVIATIONS FROM TASK

None. The only in-round corrections were test-infrastructure-only: adding
migration `0061` to the storage test's applied-migration chain (its
`media_assets_project_id_id_idx` is required by 0068's FK) and rewriting the
`insertTarget` test helper to assemble SQL columns/values correctly. Neither
touches production code, schema, or shipped DDL.

Reconciliation judgment calls (documented above, all source-grounded):
`publisher_connection_id` is deliberately deferred to a later gated
credential-bound task (TASK item 3); `updated_at` is reconciled out per the TASK
field list ("creation timestamp") and item 4 (immutable core); the legacy
`intent` property ships as `targetIntent`/`target_intent` to match the source
column/plan key; the optional dependency uses the accepted restrictive
same-Project self-reference pattern because a composite FK cannot SET NULL a
NOT NULL `project_id`; and the supporting parent index is added to the accepted
`release_bundles` table exactly as TASK item 2 permits ("add only necessary
supporting parent targets").

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state and in-memory SQLite built from the
  shipped forward-migration DDL.
- No network/provider/publishing/connector action occurred. No capture bypass, no
  stealth behavior, no cookies, no paid action. No commit, merge, or push was
  performed. No `main` branch was touched.
- TASK-approved command names only. No `--dangerously-skip-permissions`, no
  bypass, and no retry-after-denial (no sandbox denial occurred; the intermediate
  failures were real test-infrastructure defects, fixed in-scope).
- Scope declaration: this slice adds persistence/contract surface only — it does
  not approve, execute, publish, spend, contact an external system, or implement
  any credential/account/connector behavior. No publisher connection table,
  credential, account, or external integration model was created. A row is never
  a publish instruction, execution result, approval action or public-success
  proof.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T125-M1-RELEASE-TARGET-CORE-SCHEMA`; working tree is NOT
  committed (the round stops at delivery). Head: `b1bbf1e control: define T125
  release target core`.
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json`, `src/db/search-growth.schema.ts`,
  `src/db/pg/search-growth.schema.ts`, `src/db/schema.ts`.
- Added untracked files (7): `drizzle/0070_youthful_bill_hollister.sql`,
  `drizzle/meta/0070_snapshot.json`, `drizzle-pg/0048_adorable_revanche.sql`,
  `drizzle-pg/meta/0048_snapshot.json`, `src/db/release-target.test.ts`,
  `src/types/schemas/release-target.ts`,
  `src/types/schemas/release-target.test.ts`.
- Task-channel file: `DELIVERY.md` (this document).
- `git diff --stat` (tracked): 5 files, +324/−2. `git diff --check` clean. No
  other files are dirty or untracked (plugin-skill sync left no diff).

## READY FOR REVIEW

The credential-free, immutable, Project-scoped ReleaseTarget core persistence
contract ships on both dialects with forward migrations 0070/0048, snapshots,
journals, database-enforced same-Project ReleaseBundle and ContentVariant
ownership via Project-leading composite FKs (adding only the necessary
`release_bundles_project_id_id_idx` parent target and reusing the accepted
`content_variants_project_id_id_idx`), ON DELETE CASCADE, a same-Project
restrictive dependency self-FK, the source-defined target-intent CHECK enum, no
invented business uniqueness, an append-only `created_at` only, the deliberately
deferred `publisher_connection_id` (no credential/account/connector model), plus
the matching `ReleaseTarget`/`releaseTargetSchema` domain boundary and
migration-backed/domain tests. Every required gate exited 0 in this session. No
`PASS` verdict is written by the implementation round.
