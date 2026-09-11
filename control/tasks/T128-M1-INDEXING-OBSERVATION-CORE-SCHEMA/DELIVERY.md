# DELIVERY — T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA

## TASK ID

T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA (M1 Core Domain) — implementation round 1
(round-1 continuation: partial worktree preserved, only missing validation/gates/DELIVERY completed).

## IMPLEMENTATION SUMMARY

Added the credential-free, Project-scoped `IndexingObservation` core persistence + domain
contract as a schema/validation slice ONLY. One `indexing_observations` table is mirrored
across D1/SQLite and PostgreSQL, plus a matching Zod/domain boundary. The slice does not
crawl, query a search engine, resolve URL identity, dedupe URLs, create publication receipts,
publish, spend, use credentials, or perform any production behavior.

Direct fields reconciled from TASK item 1: stable `id` (text PK), explicit `project_id`
(NOT NULL → `projects(id)` ON DELETE CASCADE), opaque `url`, `search_engine`,
optional `market_profile_id`, `observation_type`, `status`, `details_json`, `observed_at`,
plus the established append-only system `created_at`. There is deliberately NO `updated_at`
and NO `publication_receipt_id`.

Key decisions:

- **SearchEngine is the only authoritative enum.** The column is a DB text-enum
  (`GOOGLE | BAIDU | BING | OTHER`, from `SearchEngine` / `searchEngineSchema`) guarded by
  the named `indexing_observations_search_engine_valid` CHECK on both dialects. The domain
  boundary reuses the shared `searchEngineSchema` (derived from
  `search_market_profiles.search_engine.enumValues`), so the enum cannot drift.
- **`observation_type` / `status` are opaque required text.** No V1.0 artifact defines an
  observation-type or observation-status union (`schemas/domain-types.ts`,
  `schemas/zod-contracts.reference.ts`, `state-machines.json` declare none; the legacy
  reference table stores them as unconstrained TEXT). Per TASK item 3, no enum, CHECK,
  taxonomy or lifecycle transition was invented.
- **`details_json` is validated at the database boundary.** SQLite/D1 uses
  `CHECK(json_valid(details_json))`; PostgreSQL has no `json_valid()`, so the mirror uses the
  equivalent `CHECK(((details_json)::jsonb) IS NOT NULL)` cast, sharing the same CHECK name
  `indexing_observations_details_valid`. This validates the document without decomposing it
  into relational columns.
- **URL stays opaque.** No normalization/identity key, no URL dedup and no business
  uniqueness rule (TASK items 2–3); URL identity is separately scoped later work.
- **same-Project MarketProfile ownership is enforced by the database.** Optional
  `market_profile_id` with a Project-leading composite FK
  `(project_id, market_profile_id) → search_market_profiles(project_id, id)` ON DELETE
  CASCADE. A profile from another Project has no matching parent row and is rejected; NULL
  means no profile attached. The `(project_id, id)` target is unique via
  `search_market_profiles_project_id_id_idx`. Only two non-unique read/cascade indexes were
  added.

## FILES CHANGED

Modified:

- `src/db/search-growth.schema.ts` — added `indexingObservations` SQLite table + reconciliation
  comments; updated the max-lines disable note.
- `src/db/pg/search-growth.schema.ts` — added the PostgreSQL `indexingObservations` mirror;
  updated the max-lines disable note.
- `src/db/schema.ts` — exported `indexingObservations` from the schema barrel.
- `drizzle/meta/_journal.json` — journal entry `idx 73`, tag `0073_indexing_observations`.
- `drizzle-pg/meta/_journal.json` — journal entry `idx 51`, tag `0051_indexing_observations`.
- `control/tasks/T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA/TASK.md` — controller's round-1
  continuation section (pre-existing in the worktree, not authored by this engineer).

Added:

- `drizzle/0073_indexing_observations.sql` — D1/SQLite forward migration.
- `drizzle/meta/0073_snapshot.json` — matching D1 snapshot.
- `drizzle-pg/0051_indexing_observations.sql` — PostgreSQL forward migration.
- `drizzle-pg/meta/0051_snapshot.json` — matching PostgreSQL snapshot.
- `src/types/schemas/indexing-observation.ts` — `IndexingObservation` row type +
  `indexingObservationSchema` domain boundary.
- `src/db/indexing-observation.test.ts` — migration-backed SQLite storage contract spec.
- `src/types/schemas/indexing-observation.test.ts` — domain boundary spec.

## DATABASE/MIGRATION CHANGES

- D1/SQLite forward migration: **0073** (`drizzle/0073_indexing_observations.sql`).
- PostgreSQL forward migration: **0051** (`drizzle-pg/0051_indexing_observations.sql`).
- Both journals carry the matching entries and both `meta/*_snapshot.json` files match.
- `corepack pnpm run db:generate` reports **"No schema changes, nothing to migrate"** for
  both dialects, confirming schema ↔ snapshot ↔ journal parity.

Table shape (both dialects, 10 columns): `id`, `project_id`, `url`, `search_engine`,
`market_profile_id` (nullable), `observation_type`, `status`, `details_json`, `observed_at`,
`created_at`. 2 indexes, 2 FKs, 2 named CHECKs. No unique/business index.

Correction applied during this round (validation work, not a restart): the preserved
hand-written PostgreSQL `0051_snapshot.json` recorded the details CHECK as
`((...\::jsonb IS NOT NULL))` while the schema definition derives
`((...::jsonb) IS NOT NULL)`. `db:generate` therefore produced a spurious follow-up
`0052_powerful_captain_cross.sql` that merely re-created that CHECK. The `0051` snapshot and
`0051` migration were aligned to the drizzle-derived form (same name, same semantics, fixed
parenthesization) and the spurious `0052` files/journal entry were removed. `db:generate` is
now clean. No migration was renumbered and no in-flight worktree schema/test change was
discarded.

## DEPENDENCIES CHANGED

None. No new runtime or dev dependencies.

## TESTS ADDED

- `src/db/indexing-observation.test.ts` (10 tests) — applies the shipped `0073` DDL to an
  in-memory SQLite with `PRAGMA foreign_keys = ON`; covers full-field persistence + nullable
  profile, the four source engines accepted / others rejected by CHECK, same-Project profile
  accepted and opaque labels preserved, dangling Project and cross-Project profile rejected,
  NOT NULL columns, malformed JSON rejected + valid JSON stored verbatim, Project/profile
  cascade deletes, exact shipped column set (no `updated_at`/`publication_receipt_id`/
  normalized URL), exactly two FKs, and no business unique index.
- `src/types/schemas/indexing-observation.test.ts` (6 tests) — full direct contract round-trip,
  enum acceptance/rejection, nullable vs missing profile, missing-field rejection, non-string
  opaque/JSON rejection, and compile-time row-type guard against `updatedAt`/
  `publicationReceiptId`/`normalizedUrl`/`credentialId`.

Two lint findings in the preserved code were fixed: `import type` for the type-only
`indexingObservations` import, and replacing a mutating `Array#sort()` in the FK test with the
already-imported immutable remeda `sort`.

## COMMANDS RUN

Each command was run independently via `corepack pnpm`.

1. `corepack pnpm exec vitest run src/db/indexing-observation.test.ts src/types/schemas/indexing-observation.test.ts`
2. `corepack pnpm run db:generate`
3. `corepack pnpm run db:migrate:local`
4. `corepack pnpm format:check`
5. `corepack pnpm types:check`
6. `corepack pnpm lint`
7. `corepack pnpm test`
8. `corepack pnpm exec vitest run src/server/features/projects/services/projects.test.ts src/server/auth/workspace-merge.test.ts src/server/mcp/oauth-provider.test.ts src/server/mcp/oauth-refresh.e2e.test.ts` (isolation re-run of full-suite failures)
9. `corepack pnpm build`
10. `corepack pnpm ci:check`

## COMMAND RESULTS

| # | Command | Exit | Evidence |
|---|---------|------|----------|
| 1 | focused vitest | 0 | 2 files, 16 tests passed (re-run after lint fixes also 16 passed) |
| 2 | db:generate | 0 | "No schema changes, nothing to migrate" for D1 and PG; PG table listed as `indexing_observations 10 columns 2 indexes 2 fks` |
| 3 | db:migrate:local | 0 | `0073_indexing_observations.sql` reported applied (✅) |
| 4 | format:check | 0 | "All matched files use Prettier code style!" |
| 5 | types:check | 0 | `tsc --noEmit` no output |
| 6 | lint | 0 | "Found 0 warnings and 0 errors" (910 files) |
| 7 | test (full) | 1 | 1722 passed, 4 failed in unrelated server/auth/MCP files (timeouts/load) |
| 8 | failing files in isolation | 0 | 4 files, 38 tests passed |
| 9 | build | 0 | client/server/audit builds completed |
| 10 | ci:check | 0 | prettier + knip + tsc ×2 + oxlint + plugin-skill sync all clean |

Full-suite note: two consecutive `corepack pnpm test` runs failed different unrelated test
sets (run A: 5 files/2 tests; run B: 4 files/4 tests) — all in
`src/server/features/projects/services/projects.test.ts`,
`src/server/auth/workspace-merge.test.ts`, `src/server/mcp/oauth-provider.test.ts`,
`src/server/mcp/oauth-refresh.e2e.test.ts`, with `Test timed out` / `Hook timed out` errors
under the load of 187 collected files. Running exactly those four files alone passes 38/38,
confirming environmental parallel-load timeout flakiness, not a T128 regression. No T128
test failed in any full-suite run.

## RUNTIME EVIDENCE

- Migration-backed storage was exercised against the actual shipped D1 `0073` DDL with foreign
  keys enabled (Project FK, same-Project composite profile FK, SearchEngine CHECK, JSON CHECK,
  cascade deletes) — 10/10 storage tests passed.
- `db:migrate:local` applied `0073_indexing_observations.sql` to the local D1 database
  successfully.
- `db:generate` — the authoritative schema-diff oracle — reports no drift for either dialect,
  proving the generated SQL, snapshots, journals and Drizzle table definitions agree.
- The domain boundary spec passed 6/6.

## KNOWN LIMITATIONS

- `observation_type` and `status` are intentionally unconstrained strings because no V1.0
  source defines an authoritative enum; if a later accepted source defines one, a forward
  migration + Zod enum must tighten them.
- `url` is stored verbatim and is NOT unique/normalized; URL identity/dedup is later work.
- `publication_receipt_id` is intentionally absent until the credential-bound publication
  receipt domain exists; a later task adds that relation.
- No repository/service/CRUD, crawler, search-engine call, ranking/measurement runtime, UI or
  production behavior — per scope.
- The full `pnpm test` aggregate is flaky in this executor under parallel load (unrelated
  server/auth/MCP timeout tests); the affected files pass in isolation.

## DEVIATIONS FROM TASK

- No scope deviation. Beyond "complete missing validation/gates", the only corrective edit was
  aligning the preserved PostgreSQL `0051` migration/snapshot CHECK text to the drizzle-derived
  expression so `db:generate` is clean; the spurious generated `0052` follow-up was removed.
  This fixed a genuine artifact drift without changing the table contract, migration IDs, or
  any schema/test intent.
- `db:generate` was run on both dialects as the single approved command; D1 was already clean
  and PG drift was corrected.

## SECURITY NOTES

- No credentials, auth, cookies, CAPTCHA/2FA bypass, stealth, publishing, spend or external
  calls were added or exercised.
- No production migration or remote command was run; only the local D1 migration
  (`db:migrate:local`). No `main`, commit, merge, push, or REVIEW.md edit.
- The new table is Project-scoped with explicit NOT NULL ownership and cascade deletes, so no
  cross-Project data leakage through the optional profile relation is possible at the DB
  boundary.

## GIT STATUS/DIFF SUMMARY

```
 M control/tasks/T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA/TASK.md   (controller continuation note)
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? drizzle-pg/0051_indexing_observations.sql
?? drizzle-pg/meta/0051_snapshot.json
?? drizzle/0073_indexing_observations.sql
?? drizzle/meta/0073_snapshot.json
?? src/db/indexing-observation.test.ts
?? src/types/schemas/indexing-observation.test.ts
?? src/types/schemas/indexing-observation.ts
```

`git diff --stat`: 6 tracked files, 233 insertions(+), 2 deletions(-). Working tree contains
only T128 changes (no skill-sync or generated artifacts left behind). Not committed, as
instructed.

## READY FOR REVIEW

Ready for Codex review. All required commands were run and are reported with exact exits;
the dual-dialect schema/migration/snapshot parity is verified clean; only the pre-existing,
unrelated full-suite load flakiness is recorded. No PASS is claimed — acceptance rests with
the Controller.
