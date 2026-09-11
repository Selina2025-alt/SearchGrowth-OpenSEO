# DELIVERY — T133-M1-PUBLICATION-EXECUTION-PLAN-CORE-SCHEMA (round 1)

## STATUS

`READY_FOR_REVIEW` — implementation round 1 of 3. No `REVIEW.md` existed at round
start, so there were no review findings to address. Every required TASK item 6
gate ran to completion in this executor session and exited 0: dual-dialect
`db:generate` (generation + clean re-run), local D1 migration, focused Vitest,
`format:check`, `types:check`, `lint`, full Vitest, `build`, and `ci:check`;
read-only Git inspection is clean. No `PASS` verdict is written by the
implementation round.

## TASK ID

`T133-M1-PUBLICATION-EXECUTION-PLAN-CORE-SCHEMA` — implementation round 1. No
`REVIEW.md` existed at round start.

## IMPLEMENTATION SUMMARY

Adds the credential-free, immutable, Project-scoped `PublicationExecutionPlan`
core persistence contract across both dialects (D1/SQLite + PostgreSQL), plus its
matching Zod/domain boundary and migration-backed/domain tests. ONE plan is the
fixed route/strategy/policy snapshot that resolves ONE accepted ReleaseTarget
before execution (05_DOMAIN_DATA_MODEL.md §12 PublicationExecutionPlan;
10_DISTRIBUTION_ARCHITECTURE.md §2 "each ReleaseTarget resolves into a fixed plan
before execution", §4 route exclusivity; `schemas/domain-types.ts`
PublicationExecutionPlan; `skills/08-distribution-plan.md`). This slice is
schema/contract only: it does not approve, execute, publish, spend, contact an
external system, resolve the plan at runtime, or implement any
credential/account/connector behavior (TASK items 1, 3, 4). A row is never a
publish instruction, execution result, approval action or public-success proof.

Storage contract shipped (`publication_execution_plans`, both dialects, 14
columns / 1 index / 2 fks / 6 checks):

- stable text `id` (PK), explicit NOT NULL `project_id` (FK → `projects(id)` ON
  DELETE CASCADE), required `release_target_id` (UNIQUE), required source-defined
  `route` enum, nullable opaque `draft_stager_id` / `finalizer_id`, nullable
  source-defined `finalizer_strategy` enum, required opaque `executor_version`,
  the required plan documents `required_fields_json` /
  `constraints_snapshot_json` / `verification_policy_json`, nullable
  source-defined `fallback_route` enum, required opaque `plan_hash`, and the
  append-only `created_at` timestamp only.
- Same-Project ReleaseTarget ownership enforced by the Project-leading composite
  FK `(project_id, release_target_id) -> release_targets(project_id, id)` ON
  DELETE CASCADE, reusing the accepted parent target
  `release_targets_project_id_id_idx` (T125, D1 0070 / PG 0048). No index is
  added to any parent.
- One-plan-per-target enforced by the UNIQUE index
  `publication_execution_plans_release_target_id_idx` (10 §2/§4).
- Enum enforcement: named DB CHECKs `..._route_valid`, `..._finalizer_strategy_valid`
  and `..._fallback_route_valid` (NULL admitted for the two optional enums), plus
  the matching Zod enums at the runtime edge.
- Document validity: named DB CHECKs `..._required_fields_valid`,
  `..._constraints_snapshot_valid` and `..._verification_policy_valid`
  (`json_valid` on SQLite, jsonb-cast on PostgreSQL), plus Zod shape validation.
- Matching Zod/domain boundary `src/types/schemas/publication-execution-plan.ts`:
  `PublicationExecutionPlan` (`InferSelectModel`) and
  `publicationExecutionPlanSchema` (Zod object mirroring the 14 direct fields).

## FIELD / ENUM / DOCUMENT RECONCILIATION

Sources: the TASK item 1 field list (authoritative),
`05_DOMAIN_DATA_MODEL.md` §12, `10_DISTRIBUTION_ARCHITECTURE.md` §§2–7,
`19_API_CONTRACTS.md` §5, `21_TEST_ACCEPTANCE_PLAN.md` §§12–13,
`skills/08-distribution-plan.md`, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`,
the accepted ReleaseBundle (T124) / ReleaseTarget (T125) patterns, and the legacy
reference artifacts `schemas/domain-types.ts` `PublicationExecutionPlan` /
`schemas/migrations-reference.sql` `publication_execution_plans`. Reference
artifacts are read-only and were NOT edited.

| Plan aspect | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). |
| `project_id` | TASK item 1 "explicit Project identity"; item 2 Project-leading constraints | NOT NULL FK → projects(id) ON DELETE CASCADE. **Added** relative to the legacy reference table, which has no `project_id`. |
| `release_target_id` | one ReleaseTarget reference | NOT NULL text id; UNIQUE index enforces at most one plan per target; same-Project composite FK `(project_id, release_target_id) -> release_targets(project_id, id)` ON DELETE CASCADE (parent `release_targets_project_id_id_idx` from T125 0070/0048 reused). |
| `route` | source-defined distribution route | NOT NULL text enum + named CHECK, exactly OWNED_SITE / WECHATSYNC_STAGED_FINALIZE / YXER_NATIVE / SOCIAL_AUTO_UPLOAD_NATIVE / POSTIZ_NATIVE / PAID_MEDIA_SERVICE (`domain-types.ts` `DistributionRoute`; 10 §§2–3). 10 §4 route exclusivity is enforced by the one-plan-per-target UNIQUE index. |
| `draft_stager_id`, `finalizer_id` | optional stager/finalizer | Nullable OPAQUE text (10 §2 `draftStager`/`finalizer`). The stager/finalizer/connector catalogue is a later gated task, so no enum/connector reference is invented (mirrors the accepted opaque ReleaseTarget `platform`). NULL = the route needs none. |
| `finalizer_strategy` | source-defined finalizer strategy | Nullable text enum + named CHECK (NULL admitted), exactly OFFICIAL_API / IN_PAGE_WEB_API / SERVICE_CLI / FIXED_DOM (`domain-types.ts` `FinalizerStrategy`; 10 §2 `finalizerStrategy`). |
| `executor_version` | executor version | NOT NULL opaque text stored verbatim (10 §2; skills/08). No executor resolution/catalogue runs in this slice. |
| `required_fields_json` | required fields document | NOT NULL JSON text; DB validity CHECK + Zod shape = JSON array of field-name strings (`domain-types.ts` `requiredFields: string[]`). |
| `constraints_snapshot_json` | constraints snapshot document | NOT NULL JSON text; DB validity CHECK + Zod shape = JSON object (`domain-types.ts` `constraintsSnapshot: Record<string, unknown>`). |
| `verification_policy_json` | verification policy document | NOT NULL JSON text; DB validity CHECK + Zod shape = JSON object (`domain-types.ts` `verificationPolicy: Record<string, unknown>`; 10 §2 `verificationProfile`). |
| `fallback_route` | optional source-defined fallback | Nullable text enum + named CHECK (NULL admitted), same six `DistributionRoute` values. NULL = no fallback. Fallback reconciliation is execution behavior and is out of scope. |
| `plan_hash` | plan hash | NOT NULL opaque hash stored verbatim; plain non-unique column, no dedup/enforcement rule (the executed-hash-equals-approved-hash CAS is execution behavior, out of scope). |
| `created_at` | creation timestamp | NOT NULL text timestamp with DB default; the ONLY audit column. |
| `accountId`, `platform`, `targetIntent` (legacy plan keys) | domain-types.ts / 10 §2 plan JSON | **DELIBERATELY NOT persisted.** Account/connector state belongs to a later gated credential-bound task; `targetIntent`/`platform` already live on the owning ReleaseTarget (TASK items 3–4). |
| `updated_at` / mutable plan editing | legacy `migrations-reference.sql`, TASK item 3 | Reconciled OUT — the TASK field list names the creation timestamp only and the resolved plan is immutable. A changed route/strategy/policy requires a new plan, not a mutated row. |
| Execution lifecycle / approval / retries / claimed jobs / runtime route selection / drafts / jobs / receipts / public success | TASK items 3–4 | Reconciled OUT — no such column or behavior exists in this slice. |

## ENUM / DOCUMENT VALIDATION BOUNDARY

- `route` (required), `finalizerStrategy` (nullable) and `fallbackRoute`
  (nullable) are narrowed by both the Zod enums and the named DB CHECKs.
- The three plan documents are validated twice: the DB CHECKs reject malformed
  JSON at the storage boundary (SQLite `json_valid`, PostgreSQL jsonb cast), and
  the Zod boundary validates document shape (array-of-strings vs object) while
  carrying the verbatim JSON string. No document is decomposed into relational
  columns or encoded to avoid a join.

## IMMUTABILITY / RELATION / DELETE / IDENTITY DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project ReleaseTarget integrity: Project-leading composite FK
  `(project_id, release_target_id) -> release_targets(project_id, id)` ON DELETE
  CASCADE. A plan whose target belongs to a different Project has no matching
  parent row and is rejected by the DB; a dangling target is likewise rejected.
- Delete behavior: CASCADE on both FKs, so deleting a ReleaseTarget or a whole
  Project removes its plan — a plan can never dangle. This is the chosen
  referential behavior and is covered by migration-backed tests.
- Identity: the ONE business uniqueness rule is one plan per ReleaseTarget
  (TASK item 2; 10 §2/§4), enforced by the UNIQUE index on `release_target_id`.
  No other uniqueness rule and no extra lookup index is invented.
- Supporting parent targets: NONE added. The composite FK's parent pair
  `(project_id, id)` is the accepted `release_targets_project_id_id_idx` (T125,
  D1 0070 / PG 0048) and is reused (TASK item 2 "add only necessary supporting
  parent targets").
- Immutability boundary: the row carries `created_at` only; no `updated_at`, no
  state-transition/CAS/approval action, no runtime resolution, no
  execution/job/receipt/publishing/paid behavior, no mutable plan editing.

## MIGRATION IDS

- D1/SQLite `0078_wooden_vengeance`: `drizzle/0078_wooden_vengeance.sql`,
  `drizzle/meta/0078_snapshot.json`, `drizzle/meta/_journal.json` (idx 78).
  Creates `publication_execution_plans` with both FKs, the release-target UNIQUE
  index, the three enum CHECKs and the three JSON-document validity CHECKs.
- PostgreSQL `0056_funny_saracen`: `drizzle-pg/0056_funny_saracen.sql`,
  `drizzle-pg/meta/0056_snapshot.json`, `drizzle-pg/meta/_journal.json` (idx 56).
  Adds the table, the three enum CHECKs, the three jsonb-cast document CHECKs,
  both FK constraints and the UNIQUE index.
- Migration file names are generator-chosen (the TASK-approved `db:generate`
  takes no `--name`), but the forward IDs are exactly D1 `0078` and PG `0056` as
  required.
- Accepted migrations (SQLite ≤ 0077, PG ≤ 0055) were NOT edited. A clean
  dual-dialect `db:generate` re-run reports `No schema changes, nothing to
  migrate 😴` on both dialects (69 tables each; `publication_execution_plans` =
  14 columns / 1 index / 2 fks).

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — header `max-lines` eslint-disable updated;
  appended the `publicationExecutionPlans` sqliteTable with the full
  field/ownership/uniqueness/enum/document/immutability comment block.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror and header
  update.
- `src/db/schema.ts` — provider-aware barrel destructure adds
  `publicationExecutionPlans`.
- `drizzle/meta/_journal.json`, `drizzle-pg/meta/_journal.json` — generate
  entries.

Added (untracked):

- `drizzle/0078_wooden_vengeance.sql`, `drizzle/meta/0078_snapshot.json`.
- `drizzle-pg/0056_funny_saracen.sql`, `drizzle-pg/meta/0056_snapshot.json`.
- `src/db/publication-execution-plan.test.ts` — migration-backed storage spec
  (14 tests).
- `src/types/schemas/publication-execution-plan.ts` — Zod/domain boundary.
- `src/types/schemas/publication-execution-plan.test.ts` — focused domain tests
  (8 tests).

Task-channel file: `DELIVERY.md` (this document). No `REVIEW.md` existed and none
was created or edited.

## DATABASE/MIGRATION CHANGES

- New `publication_execution_plans` table on both dialects (14 columns / 1 unique
  index / 2 fks / 6 checks each): D1 0078 and PG 0056, with snapshots + journals.
- No change to any accepted table (the composite-FK parent
  `release_targets_project_id_id_idx` is reused).
- 69 tables total on each dialect (up from 68). Local D1 migration applied the
  full forward chain through `0078_wooden_vengeance.sql` successfully.

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (the frozen
install used the existing lockfile).

## TESTS ADDED

- `src/db/publication-execution-plan.test.ts` — 14 migration-backed storage tests
  that build a real in-memory SQLite client, enable `PRAGMA foreign_keys = ON`,
  hand-create `projects`, and apply the actual shipped forward-migration DDL in
  order (`0045`→`0046`→`0049`→`0055`→`0056`→`0057`→`0060`→`0061`→`0062`→`0063`→
  `0064`→`0067`→`0068`→`0069`→`0070`→`0078`, split on
  `--> statement-breakpoint`). Covers: valid same-Project persistence with the
  full field set + NULL optional fields + append-only `created_at`; optional
  stager/finalizer/strategy/fallback persisted verbatim; all 6 routes accepted;
  route outside the union rejected; all 4 finalizer strategies accepted;
  finalizer strategy / fallback route outside the union rejected; malformed JSON
  in each of the three documents rejected; second plan for the same
  ReleaseTarget rejected (one-plan-per-target); cross-Project ReleaseTarget
  rejection in EITHER direction; dangling target/Project rejection; cascade of
  the plan when its ReleaseTarget is deleted; whole-project cascade; NOT NULL
  rejection of every required direct column; and the exact 14-column storage
  shape (no account, `updated_at`, job/receipt/publishing/public-success or
  mutable status column).
- `src/types/schemas/publication-execution-plan.test.ts` — 8 focused domain
  tests: full contract round-trips verbatim and `planHash` is never decomposed;
  minimal plan with NULL optional fields; every route/fallback/strategy accepted;
  route/strategy/fallback outside the union rejected; malformed JSON rejected in
  each document; wrong-shaped documents rejected; missing required field
  rejected; exported `PublicationExecutionPlan` row type has no `updatedAt` /
  `accountId` / `publisherConnectionId` / `status`.
- Dialect parity: the new table is auto-covered by the existing
  `src/db/schema-parity.test.ts` (now 354 tests, structurally comparing every
  SQLite and PG table including enum values, FKs and CHECK names).

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no commit/merge/push). One
environment bootstrap (`install --frozen-lockfile`) was required because this
fresh worktree had no `node_modules`; it used the existing lockfile and changed
no tracked file — the same necessity recorded by prior task deliveries.

1. `corepack pnpm install --frozen-lockfile` (bootstrap)
2. `corepack pnpm run db:generate` (initial generation)
3. `corepack pnpm run db:migrate:local`
4. `corepack pnpm exec vitest run src/db/publication-execution-plan.test.ts src/types/schemas/publication-execution-plan.test.ts src/db/schema-parity.test.ts` (first attempt)
5. `corepack pnpm exec vitest run src/db/publication-execution-plan.test.ts src/types/schemas/publication-execution-plan.test.ts src/db/schema-parity.test.ts` (rerun)
6. `corepack pnpm run db:generate` (clean re-run)
7. `corepack pnpm exec prettier --write <task files>`
8. `corepack pnpm exec prettier --write src/db/publication-execution-plan.test.ts` (post-fix)
9. `corepack pnpm types:check`
10. `corepack pnpm format:check`
11. `corepack pnpm lint`
12. `corepack pnpm test`
13. `corepack pnpm build`
14. `corepack pnpm ci:check`
15. Read-only Git inspection (`git status --short`, `git diff --check`, `git diff --stat`)

## COMMAND RESULTS

**All required gates exit 0 on the final tree.**

1. Frozen install → exit 0 — 980 packages, "Done in 1m 18.7s"; only pnpm's
   ignored-build-scripts warning.
2. Initial `db:generate` → exit 0 — wrote `drizzle/0078_wooden_vengeance.sql` and
   `drizzle-pg/0056_funny_saracen.sql`; 69 tables each;
   `publication_execution_plans 14 columns 1 indexes 2 fks`.
3. `db:migrate:local` → exit 0 — applied the full local D1 chain including
   `0078_wooden_vengeance.sql ✅` (wrangler redrew a large progress table; final
   state ✅).
4. Focused Vitest first attempt → **exit 1** — 1 of 14 storage tests failed with
   `SQLITE_ERROR: near "unclosed": syntax error` because the malformed-JSON test
   literal `"['unclosed'"` contained a single quote that terminated the SQL
   literal before the CHECK could run. Fixed the test-only literal to
   `'{"requirePublicUrl"'` (valid SQL literal, invalid JSON). No production/SQL
   change.
5. Focused Vitest rerun → exit 0 — 3 files / 376 tests passed (new storage 14,
   new domain 8, parity 354).
6. Clean re-run `db:generate` → exit 0 — both dialects print `No schema changes,
   nothing to migrate 😴`.
7. Task-file Prettier → exit 0 (2 files reformatted; schema files unchanged).
8. Post-fix Prettier → exit 0 (unchanged).
9. `types:check` (`tsc --noEmit`) → exit 0, no diagnostics.
10. `format:check` → exit 0 — "All matched files use Prettier code style!".
11. `lint` (`oxlint . --type-aware`) → exit 0 — "Found 0 warnings and 0 errors.
    Finished in 48.0s on 925 files".
12. Full `test` → exit 0 — 197 files / 1842 tests passed.
13. `build` → exit 0 — vite client (`✓ built in 22.79s`), SSR (`✓ built in
    28.46s`) and open_seo_audit (`✓ built in 3.92s`) all succeeded; `tsc --noEmit`
    followed with no output.
14. `ci:check` → exit 0 — prettier clean, knip clean, both `tsc --noEmit` runs
    clean, oxlint clean, plugin-skills sync clean
    (`plugin skill sync clean: plugins/openseo/skills`). (The command exceeded
    the 600s foreground timeout and completed in the background with exit 0.)
15. Read-only Git → exit 0 — `git diff --check` clean (no output).

## RUNTIME EVIDENCE

- `db:generate` (both dialects): 69 tables, `publication_execution_plans 14
  columns 1 indexes 2 fks`, and `No schema changes, nothing to migrate 😴` after
  the clean re-run — schema and snapshots agree with no drift.
- `db:migrate:local`: `0078_wooden_vengeance.sql ✅` is the final applied
  migration, exit 0.
- Snapshot check: both `0078_snapshot.json` and `0056_snapshot.json` contain the
  `publication_execution_plans` table, its UNIQUE index, both FKs and all six
  named CHECKs.
- Full suite: `Test Files 197 passed (197)`, `Tests 1842 passed (1842)`; the new
  storage (14), domain (8) and parity (354) suites all pass inside it.
- `build`: client/SSR/open_seo_audit bundles built, `tsc --noEmit` no
  diagnostics.
- `ci:check`: full chain completed, final line
  `plugin skill sync clean: plugins/openseo/skills`.
- Git: `git status --short` shows exactly the intended file set; `git diff
  --check` clean.

## KNOWN LIMITATIONS

- None blocking. Every TASK item 6 gate ran and exited 0 in this session; no
  `BLOCKED_BY_TEST_ENVIRONMENT` status is claimed.
- The only non-fatal output was pnpm's ignored-build-scripts warning during
  install and vite's chunk-size warnings during build; neither affects exit
  status or this task's scope.
- Scope-shape notes (by design, not defects): the table and boundary are
  schema/contract only — no plan resolution, approve/execute/publish/spend/
  external-system action, no scheduler, no state transition/CAS, no
  credential/account/connector behavior, no UI or production behavior;
  `draftStagerId`/`finalizerId`/`executorVersion`/`planHash` are opaque/verbatim;
  the three plan documents are stored as JSON text validated for validity (DB)
  and shape (Zod); there is no `updated_at`; and there is no mutable plan-editing
  behavior.

## DEVIATIONS FROM TASK

- None that change scope. The only in-round correction was test-infrastructure
  only: replacing a malformed-JSON test literal that contained a SQL-terminating
  single quote. It touches no production code, schema, or shipped DDL.
- `project_id` is added relative to the legacy `publication_execution_plans`
  reference table, because TASK items 1–2 explicitly require "explicit Project
  identity" and Project-leading same-Project database constraints.
- The three JSON-document validity CHECKs are added to satisfy TASK item 3
  ("Validate structured documents … at trust boundaries"); the legacy reference
  table has no such CHECK. They follow the accepted `indexing_observations`
  pattern.
- Migration file names are generator-chosen (`0078_wooden_vengeance`,
  `0056_funny_saracen`) because the TASK-approved `db:generate` takes no
  `--name`; the forward IDs match the TASK exactly.
- Reconciliation judgment calls (all source-grounded): legacy plan keys
  `accountId`/`platform`/`targetIntent` are deliberately not persisted (account
  state is a later gated credential-bound task; intent/platform already live on
  the ReleaseTarget); `updated_at` and all execution/approval/job/receipt state
  are reconciled out per TASK items 3–4; `requiredFieldsJson` is shaped as a JSON
  array of strings from `domain-types.ts` `requiredFields: string[]`.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state and in-memory SQLite built from
  the shipped forward-migration DDL.
- No network/provider/publishing/connector action occurred. No capture bypass, no
  stealth behavior, no cookies, no paid action. No commit, merge, or push was
  performed. No `main` branch was touched.
- TASK-approved command names only. No `--dangerously-skip-permissions`, no
  bypass, and no retry-after-denial (no sandbox denial occurred; the intermediate
  failure was a real test-infrastructure defect, fixed in-scope).
- Scope declaration: this slice adds persistence/contract surface only — it does
  not approve, execute, publish, spend, contact an external system, resolve the
  plan at runtime, or implement any credential/account/connector behavior. No
  publisher connection table, credential, account, or external integration model
  was created. A row is never a publish instruction, execution result, approval
  action or public-success proof.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T133-M1-PUBLICATION-EXECUTION-PLAN-CORE-SCHEMA`; working tree
  is NOT committed (the round stops at delivery). Head: `e207ec5 control: correct
  T133 checkpoint`.
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json`, `src/db/search-growth.schema.ts`,
  `src/db/pg/search-growth.schema.ts`, `src/db/schema.ts`.
- Added untracked files (7): `drizzle/0078_wooden_vengeance.sql`,
  `drizzle/meta/0078_snapshot.json`, `drizzle-pg/0056_funny_saracen.sql`,
  `drizzle-pg/meta/0056_snapshot.json`,
  `src/db/publication-execution-plan.test.ts`,
  `src/types/schemas/publication-execution-plan.ts`,
  `src/types/schemas/publication-execution-plan.test.ts`.
- Task-channel file: `DELIVERY.md` (this document).
- `git diff --stat` (tracked): 5 files, +352/−2. `git diff --check` clean. No
  other files are dirty or untracked (plugin-skill sync left no diff).

## READY FOR REVIEW

The credential-free, immutable, Project-scoped PublicationExecutionPlan core
persistence contract ships on both dialects with forward migrations 0078/0056,
snapshots, journals, database-enforced same-Project ReleaseTarget ownership via a
Project-leading composite FK that reuses the accepted
`release_targets_project_id_id_idx` parent, ON DELETE CASCADE, the
one-plan-per-target UNIQUE index, source-defined route/finalizer-strategy/
fallback-route CHECK enums, DB-level document-validity CHECKs plus Zod document
shape validation, an append-only `created_at` only, no account/credential/
execution/approval state, plus the matching `PublicationExecutionPlan`/
`publicationExecutionPlanSchema` domain boundary and migration-backed/domain
tests. Every required gate exited 0 in this session. No `PASS` verdict is written
by the implementation round.
