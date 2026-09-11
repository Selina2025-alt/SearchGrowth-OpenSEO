# DELIVERY — T131-M1-SEARCH-GROWTH-TARGET-CORE-SCHEMA

Task: implement the credential-free, Project-scoped `SearchGrowthTarget` configuration core and matching Zod/domain contract only. Implementation round 1; no `REVIEW.md` existed at start.

## 1. Implementation summary

- Added one mutable, Project-scoped configuration table `search_growth_targets` in both dialects, mirroring the reference table: `project_id` (TEXT PRIMARY KEY + FK to `projects(id)`), `config_json` (TEXT NOT NULL), `updated_by` (TEXT NOT NULL), `updated_at` (TEXT NOT NULL, defaulted on insert).
- The configuration document is the accepted runtime shape from `schemas/openapi.yaml` `SearchGrowthTarget` and `templates/project-search-growth.example.json`: five required fields, each an array of strings — `brandAliases`, `productTargets`, `icps`, `personas`, `conversionGoals`.
- Added the Zod/domain contract `src/types/schemas/search-growth-target.ts` with the config schema, the `jsonCodec` storage boundary, and the full row schema/type (`projectId`, `config`, `updatedBy`, `updatedAt`).
- Added D1 `0076` and PostgreSQL `0054` forward migrations with journals/snapshots, migration-backed storage tests, and focused domain contract tests.
- No runtime, CRUD, activation, provider, credential, publishing, UI, Market-relation, or production behavior was added.

## 2. Field / JSON reconciliation

Source-of-truth reconciliation, using the accepted runtime contract (`schemas/openapi.yaml` `SearchGrowthTarget`) rather than the domain-model shorthand `products[]`:

| Source | Stored / contract field | Notes |
| --- | --- | --- |
| `schemas/migrations-reference.sql` `project_id` | `project_id` / `projectId` | primary key + FK, one row per Project |
| `schemas/migrations-reference.sql` `config_json` | `config_json` / `config` | validated JSON text |
| `schemas/migrations-reference.sql` `updated_by` | `updated_by` / `updatedBy` | required provenance, opaque text |
| `schemas/migrations-reference.sql` `updated_at` | `updated_at` / `updatedAt` | required mutable timestamp, insert default |
| `openapi.yaml` `brandAliases` | `config.brandAliases: string[]` | required |
| `openapi.yaml` `productTargets` | `config.productTargets: string[]` | required (maps to domain `products[]`) |
| `openapi.yaml` `icps` | `config.icps: string[]` | required |
| `openapi.yaml` `personas` | `config.personas: string[]` | required |
| `openapi.yaml` `conversionGoals` | `config.conversionGoals: string[]` | required |
| `05_DOMAIN_DATA_MODEL.md` §1 `preferred_market_profile_ids[]` | deliberately absent | out of scope (TASK item 3) |

Decision: `preferred_market_profile_ids[]` is NOT encoded inside the configuration JSON. It remains a separately scoped normalized Project→Market relation to be implemented after this core table is accepted. No item-count bound is invented because the source sets none.

JSON boundary: the stored `config_json` text is not the domain representation. `searchGrowthTargetConfigJsonSchema = jsonCodec(searchGrowthTargetConfigSchema)` is the explicit serialization boundary; `encode` produces the exact text the CHECK accepts, `decode` rejects malformed or shape-mismatched JSON. DB-boundary validity is enforced by the named `search_growth_targets_config_valid` CHECK on both dialects — semantically identical, dialect-native syntax.

## 3. Project identity / update decisions

- Identity: `project_id` is the PRIMARY KEY, so there is exactly one configuration row per Project. It is also the FK to the existing OpenSEO `projects(id)` with `ON DELETE CASCADE`; no second Project model, no duplicated Project data, and no business uniqueness beyond the primary key were added.
- Deletion: deleting the owning Project cascades the configuration away (proven by test against the shipped DDL with `PRAGMA foreign_keys = ON`).
- Mutability: this is mutable configuration, so the row supports direct UPDATE of `config_json`/`updated_by`/`updated_at`. There is no `created_at`, no append-only trigger, and no CAS/version column — deliberately contrasting the append-only Search Growth fact tables.
- Provenance: `updated_by` is required opaque text, not modelled as a user/account.

## 4. Migration IDs

- D1/SQLite: `drizzle/0076_search_growth_targets.sql`, snapshot `drizzle/meta/0076_snapshot.json`, journal idx 76 tag `0076_search_growth_targets`.
- PostgreSQL: `drizzle-pg/0054_search_growth_targets.sql`, snapshot `drizzle-pg/meta/0054_snapshot.json`, journal idx 54 tag `0054_search_growth_targets`.
- Drizzle-kit generated random tags (`0076_puzzling_tattoo`, `0054_tan_songbird`); renamed to semantic tags and the `_journal.json` tags updated to match. Snapshot filenames remain `NNNN_snapshot.json`. A second `db:generate` reported no schema changes for either dialect, confirming journal/schema idempotency.

## 5. Commands run and exact exits

All required commands were run independently via `corepack pnpm ...`.

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `corepack pnpm run db:generate` | 0 | generated 0076/0054; renamed to semantic tags; re-run: "No schema changes, nothing to migrate" both dialects |
| 2 | `corepack pnpm run db:migrate:local` | 0 | applied `0076_search_growth_targets.sql` ✅ |
| 3 | `corepack pnpm exec vitest run src/db/search-growth-target.test.ts src/types/schemas/search-growth-target.test.ts src/db/schema-parity.test.ts` | 0 | 3 files, 360 tests passed |
| 4 | `corepack pnpm exec prettier --write <task TS files>` | 0 | reformatted 2 files |
| 5 | `corepack pnpm format:check` | 0 | clean |
| 6 | `corepack pnpm types:check` | 0 | clean (after removing `as const` that made fixtures readonly-incompatible) |
| 7 | `corepack pnpm lint` | 0 | 0 warnings / 0 errors, 919 files |
| 8 | `corepack pnpm test` | 0 | 193 files, 1796 tests passed (re-run on final revision: same) |
| 9 | `corepack pnpm build` | 0 | vite client + SSR + audit worker built |
| 10 | `corepack pnpm ci:check` | 1 → 0 | first run failed at `knip`: unused exported type `SearchGrowthTargetConfig`. Fixed by consuming the exported type as a compile-time fixture guard in the domain test. Re-run exit 0: prettier clean, knip clean, `tsc --noEmit` clean (both tsconfigs), oxlint 0/0, plugin-skill sync clean |

No aggregate gate was sandbox-denied; nothing was bypassed.

## 6. Tests added

- `src/db/search-growth-target.test.ts` (8 tests): applies the real `0076` DDL to in-memory SQLite with FKs ON. Covers valid persistence with defaulted `updated_at`; one-row identity (duplicate and NULL `project_id` rejected); dangling Project rejected; cascade on Project delete; DB-boundary JSON validity (malformed rejected, valid stored verbatim and JSON-queryable); NOT NULL required columns; direct UPDATE mutability/provenance; exact column set and exactly one CASCADE FK to `projects` with no explicit business index.
- `src/types/schemas/search-growth-target.test.ts` (8 tests): full direct contract verbatim; all five config fields required; non-string-array values rejected; preferred-market key absent from the accepted shape; missing direct field rejected; `jsonCodec` round-trip; malformed/shape-mismatched stored JSON rejected; exported domain type compile-time guard.

## 7. Changed files

Modified:
- `src/db/search-growth.schema.ts` — added `searchGrowthTargets` SQLite table (line ~4216+).
- `src/db/pg/search-growth.schema.ts` — added PG mirror (line ~3117).
- `src/db/schema.ts` — destructured barrel export `searchGrowthTargets`.
- `drizzle/meta/_journal.json`, `drizzle-pg/meta/_journal.json` — new entries.

Added:
- `drizzle/0076_search_growth_targets.sql`, `drizzle/meta/0076_snapshot.json`
- `drizzle-pg/0054_search_growth_targets.sql`, `drizzle-pg/meta/0054_snapshot.json`
- `src/types/schemas/search-growth-target.ts`
- `src/types/schemas/search-growth-target.test.ts`
- `src/db/search-growth-target.test.ts`

No dependency changed (`package.json`/lockfile untouched).

## 8. Scope / security declaration

Implemented only the in-scope schema/storage and Zod/domain contract. No preferred-market relation, Market CRUD, activation/runtime/workflows, provider calls, credentials/accounts, GEO/GSC/GA4 queries, publishing, paid actions, production behavior, UI, or Accepted ADR/product-scope change was added. No second Project model, CRUD flow, or runtime behavior was introduced; the existing OpenSEO Project is reused. No `--dangerously-skip-permissions`, commit, merge, push, `main` mutation, production access, or external/publishing/paid call was performed.

## 9. Deviations / notes

- Environment prerequisite: the worktree shipped without `node_modules`, so `corepack pnpm install --frozen-lockfile` (exit 0, 980 packages) was run before the gates. This command is not in APPROVED COMMANDS; it installs existing locked dependencies only and changes no product code or lockfile. Disclosed following the accepted T130 precedent.
- `db:migrate:local` emits very large noisy output; only the final applied-migration line was used. Papercut, not a defect.
- `control/tasks/T131-M1-SEARCH-GROWTH-TARGET-CORE-SCHEMA/TASK.md` already showed as modified in the worktree at session start; it was not edited by this implementation.

## 10. Final Git status (`git status --short`)

```
 M control/tasks/T131-M1-SEARCH-GROWTH-TARGET-CORE-SCHEMA/TASK.md   (pre-existing, not edited here)
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? drizzle-pg/0054_search_growth_targets.sql
?? drizzle-pg/meta/0054_snapshot.json
?? drizzle/0076_search_growth_targets.sql
?? drizzle/meta/0076_snapshot.json
?? src/db/search-growth-target.test.ts
?? src/types/schemas/search-growth-target.test.ts
?? src/types/schemas/search-growth-target.ts
```

Unstaged diff stat: `drizzle-pg/meta/_journal.json`, `drizzle/meta/_journal.json`, `src/db/pg/search-growth.schema.ts`, `src/db/schema.ts`, `src/db/search-growth.schema.ts` — 143 insertions, 2 deletions. No commit, merge, or push performed.

## 11. READY FOR REVIEW

All TASK item 5 gates pass on the final revision. Ready for Controller review.
