# DELIVERY — T132-M1-TARGET-PREFERRED-MARKET-RELATION-SCHEMA

Task: implement the normalized, credential-free `SearchGrowthTarget → SearchMarketProfile` preferred-market relation only, in both dialects, with the matching Zod/domain row contract and migration-backed tests. Implementation round 1; no `REVIEW.md` existed at start.

## 1. Implementation summary

- Added one relation table `search_growth_target_preferred_market_profiles` in both dialects, storing only relation identity: `id` (TEXT PRIMARY KEY), `project_id` (TEXT NOT NULL), `market_profile_id` (TEXT NOT NULL) and the append-only `created_at` (TEXT NOT NULL, insert default).
- The relation is normalized, not a JSON/text list: one row per (target, market) preferred pair. It realizes `preferred_market_profile_ids[]` from `05_DOMAIN_DATA_MODEL.md` §1 without encoding relational IDs inside T131's `search_growth_targets.config_json`.
- Same-Project ownership is enforced at the database level by three explicit FKs: `project_id → projects(id)`, `project_id → search_growth_targets(project_id)` (the target's primary key IS `project_id`, so this FK is the target reference), and the Project-leading composite `(project_id, market_profile_id) → search_market_profiles(project_id, id)`.
- Natural pair identity `(project_id, market_profile_id)` is unique; duplicates are rejected by the unique index, not by application code.
- Added the Zod/domain row contract `src/types/schemas/search-growth-target-preferred-market-profile.ts`.
- Added D1 `0077` and PostgreSQL `0055` forward migrations with journals/snapshots, migration-backed storage tests, and focused domain contract tests.
- No ordering/priority/primary-market semantics, Market CRUD, additional business uniqueness, runtime behavior, provider, credential, publishing, UI, or production behavior was added.

## 2. Relation / identity / delete decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Storage shape | one row per (target, market) pair | normalized relation, not an encoded ID list in config JSON (TASK item 3) |
| Relation identity | `(project_id, market_profile_id)` unique index | natural pair identity; rejects duplicates at the DB boundary |
| Target ownership | FK `project_id → search_growth_targets(project_id)` | `search_growth_targets` PK is `project_id` (one row per Project), so the relation's `project_id` doubles as the target reference; no separate `target_id` column is needed or honest |
| Market ownership | composite FK `(project_id, market_profile_id) → search_market_profiles(project_id, id)` | Project-leading composite FK makes cross-Project references unrepresentable; same-Project is the only insertable shape |
| Project ownership | FK `project_id → projects(id)` | explicit Project identity on the row itself, independent of the target FK |
| Deletion | `ON DELETE CASCADE` on all three FKs | deleting the target, a market profile, or the whole Project removes its references, so a relation can never dangle |
| Mutability | no `updated_at`; append-only `created_at` only | the relation carries no mutable payload and no ordering/priority/primary role |
| Reverse lookup | non-unique index on `market_profile_id` | supports the reverse "which targets prefer this market" direction of the FKs; it is a plain index, NOT business uniqueness |

Deliberately absent: any `rank`/`position`/`priority`/`is_primary`/`primary` column, any JSON/text array column, any Market CRUD or runtime read/write, and any uniqueness beyond the natural pair.

## 3. Domain contract

`searchGrowthTargetPreferredMarketProfileSchema` is a strict-shape Zod v4 object with exactly `id`, `projectId`, `marketProfileId`, `createdAt` (all strings), and the inferred `SearchGrowthTargetPreferredMarketProfile` type. Unknown keys (e.g. `priority`, `isPrimary`, `updatedAt`) are stripped, so no ordering/priority/primary marker can be carried on the row.

## 4. Migration IDs

- D1/SQLite: `drizzle/0077_search_growth_target_preferred_market_profiles.sql`, snapshot `drizzle/meta/0077_snapshot.json`, journal idx 77 tag `0077_search_growth_target_preferred_market_profiles`.
- PostgreSQL: `drizzle-pg/0055_search_growth_target_preferred_market_profiles.sql`, snapshot `drizzle-pg/meta/0055_snapshot.json`, journal idx 55 tag `0055_search_growth_target_preferred_market_profiles`.
- Drizzle-kit generated random tags (`0077_noisy_captain_universe`, `0055_loud_zaladane`); renamed to semantic tags and the `_journal.json` tags updated to match, following the accepted T131 precedent. Snapshot filenames remain `NNNN_snapshot.json`. A second `db:generate` reported no schema changes for either dialect, confirming journal/schema idempotency. Postgres constraint/index names are ≤63 bytes.

## 5. Commands run and exact exits

All required commands were run independently via `corepack pnpm ...`, not chained.

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `corepack pnpm run db:generate` | 0 | generated `0077`/`0055`; renamed to semantic tags; re-run: "No schema changes" both dialects |
| 2 | `corepack pnpm run db:migrate:local` | 0 | applied `0077_search_growth_target_preferred_market_profiles.sql` ✅ |
| 3 | `corepack pnpm exec vitest run src/db/search-growth-target-preferred-market-profile.test.ts src/types/schemas/search-growth-target-preferred-market-profile.test.ts src/db/schema-parity.test.ts` | 0 | 3 files, 363 tests passed |
| 4 | `corepack pnpm exec prettier --write <task TS files>` | 0 | task files formatted |
| 5 | `corepack pnpm format:check` | 0 | clean |
| 6 | `corepack pnpm types:check` | 0 | clean |
| 7 | `corepack pnpm lint` | 1 → 0 | first run failed: 4 × `typescript-eslint(no-base-to-string)` on the FK PRAGMA-row assertions. Fixed with a `foreignKeyRow` type-narrowing helper. Re-run exit 0: 0 warnings / 0 errors |
| 8 | `corepack pnpm test` | 0 | 195 files, 1815 tests passed, including both new files and `schema-parity.test.ts` |
| 9 | `corepack pnpm build` | 0 | vite client + SSR + audit worker built |
| 10 | `corepack pnpm ci:check` | 0 | prettier clean, knip clean, `tsc --noEmit` clean (both tsconfigs), oxlint 0/0, plugin-skill sync clean |

No aggregate gate was sandbox-denied; nothing was bypassed.

## 6. Tests added

- `src/db/search-growth-target-preferred-market-profile.test.ts` (10 tests): applies the real `0045`/`0046`/`0049`/`0076`/`0077` DDL to in-memory SQLite with `PRAGMA foreign_keys = ON`, one dedicated Project per test. Covers valid same-Project persistence with the full field set; one target preferring multiple distinct markets; cross-Project market rejected; missing target / missing market rejected; duplicate natural pair rejected; cascade on target delete, on market delete, and on whole-Project delete; exact column set (`created_at`, `id`, `market_profile_id`, `project_id`); exact FK set (projects, target PK, and both market composite column-rows) all CASCADE.
- `src/types/schemas/search-growth-target-preferred-market-profile.test.ts` (4 tests): full row verbatim; every direct field required; non-string identity rejected; no ordering/priority/primary/`updatedAt` key can survive parsing; compile-time guard on the exported domain type.
- `src/db/schema-parity.test.ts` (existing, 349 tests) re-run green, confirming the SQLite and PG mirrors have not drifted.

## 7. Changed files

Modified:
- `src/db/search-growth.schema.ts` — added the `searchGrowthTargetPreferredMarketProfiles` SQLite table after `searchGrowthTargets`; appended the T132 relation to the max-lines eslint allowance comment.
- `src/db/pg/search-growth.schema.ts` — added the Postgres mirror.
- `src/db/schema.ts` — added `searchGrowthTargetPreferredMarketProfiles` to the barrel export.
- `drizzle/meta/_journal.json`, `drizzle-pg/meta/_journal.json` — new entries.

Added:
- `drizzle/0077_search_growth_target_preferred_market_profiles.sql`, `drizzle/meta/0077_snapshot.json`
- `drizzle-pg/0055_search_growth_target_preferred_market_profiles.sql`, `drizzle-pg/meta/0055_snapshot.json`
- `src/types/schemas/search-growth-target-preferred-market-profile.ts`
- `src/types/schemas/search-growth-target-preferred-market-profile.test.ts`
- `src/db/search-growth-target-preferred-market-profile.test.ts`

No dependency changed (`package.json` / lockfile untouched).

## 8. Scope / security declaration

Implemented only the in-scope normalized relation storage, migrations and Zod/domain row contract, plus its migration-backed and focused tests. No target-configuration change, Market CRUD, ordering/priority/primary semantics, additional business uniqueness, activation/runtime/workflows, provider calls, GEO/GSC/GA4 queries, publishing, credentials/accounts, paid actions, production behavior, UI, or Accepted ADR/product-scope change was added. No second Project model was introduced; the existing OpenSEO Project is reused. No `--dangerously-skip-permissions`, commit, merge, push, `main` mutation, production access, or external/publishing/paid call was performed.

## 9. Deviations / notes

- Environment prerequisite: the worktree shipped without `node_modules`, so `corepack pnpm install --frozen-lockfile` (exit 0, 980 packages) was run before the gates. This command is not in APPROVED COMMANDS; it installs existing locked dependencies only and changes no product code or lockfile. Disclosed following the accepted T130/T131 precedent.
- The reverse `market_profile_id` index (see §2) is a deliberate non-unique lookup index, not business uniqueness; flagged here for reviewer attention.
- `db:migrate:local` emits very large noisy output; only the final applied-migration line was used. Papercut, not a defect.
- `control/tasks/T132-M1-TARGET-PREFERRED-MARKET-RELATION-SCHEMA/TASK.md` already showed as modified in the worktree at session start; `git diff` shows it is a line-ending (CRLF/LF) only difference with no content change. It was not edited by this implementation.

## 10. Final Git status (`git status --porcelain`)

```
 M control/tasks/T132-M1-TARGET-PREFERRED-MARKET-RELATION-SCHEMA/TASK.md   (pre-existing, line-ending only)
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? control/tasks/T132-M1-TARGET-PREFERRED-MARKET-RELATION-SCHEMA/DELIVERY.md
?? drizzle-pg/0055_search_growth_target_preferred_market_profiles.sql
?? drizzle-pg/meta/0055_snapshot.json
?? drizzle/0077_search_growth_target_preferred_market_profiles.sql
?? drizzle/meta/0077_snapshot.json
?? src/db/search-growth-target-preferred-market-profile.test.ts
?? src/types/schemas/search-growth-target-preferred-market-profile.test.ts
?? src/types/schemas/search-growth-target-preferred-market-profile.ts
```

Unstaged tracked diff stat: `drizzle-pg/meta/_journal.json`, `drizzle/meta/_journal.json`, `src/db/pg/search-growth.schema.ts`, `src/db/schema.ts`, `src/db/search-growth.schema.ts` — 200 insertions, 2 deletions. No commit, merge, or push performed.

## 11. READY FOR REVIEW

All TASK item 5 gates exit 0 on the final revision. Ready for Controller review.
