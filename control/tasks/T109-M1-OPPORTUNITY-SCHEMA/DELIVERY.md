# DELIVERY — T109-M1-OPPORTUNITY-SCHEMA (round 1)

## TASK ID

`T109-M1-OPPORTUNITY-SCHEMA` — implementation round 1. No `REVIEW.md` existed
for this task at round start, so there were no review findings to address.

## IMPLEMENTATION SUMMARY

Added the normalized, Project-scoped `search_growth_opportunities` storage and
domain-validation foundation across both dialects (D1/SQLite +
PostgreSQL), with a migration-backed storage spec, a Zod domain-boundary module
and its boundary tests. This is schema/contract only — no opportunity
computation, scoring engine, profile/PageFit calculation, ranking, workflow,
CRUD, UI, or external action was implemented.

Storage contract shipped:

- Stable text `id`, explicit `project_id` (FK → `projects(id)` ON DELETE
  CASCADE), required same-Project `topic_id`, optional same-Project
  `market_profile_id`.
- `profile` = the exact canonical OpportunityProfile union; `page_fit_action` =
  the exact canonical PageFitAction union — both as DB text-enum columns AND
  named CHECK constraints, so unsupported values are rejected at the storage
  boundary on every dialect.
- Optional `target_page_url`.
- Immutable snapshot payloads `score_json`, `data_quality_json`,
  `evidence_snapshot_json` as opaque JSON text (never parsed/queried here, never
  relational identity).
- Required `reason`, `recommended_action`, `source_snapshot_at` (application
  snapshot time) plus `created_at`/`updated_at` system timestamps (mutable
  lifecycle row — a later re-computation refreshes it in place).
- Same-Project Topic/optional MarketProfile ownership is DB-enforced by the two
  composite FKs `(project_id, topic_id) → search_topics(project_id, id)` and
  `(project_id, market_profile_id) → search_market_profiles(project_id, id)`,
  both ON DELETE CASCADE. No additional business uniqueness was added — only the
  two read/cascade path indexes `search_growth_opportunities_topic_idx` and
  `search_growth_opportunities_market_profile_idx` (the composite-FK target
  unique indexes already exist from accepted migrations 0046/0049, so no new
  supporting target index was required).

## FIELD RECONCILIATION

Sources: `05_DOMAIN_DATA_MODEL.md` §8 (direct field contract), the TASK field
list, `schemas/domain-types.ts` `SearchGrowthOpportunity`/
`OpportunityProfile`/`PageFitAction`/`DataQuality`, and
`schemas/migrations-reference.sql` `growth_opportunities`.

| Stored column | §8 (authoritative) | domain-types / migrations-reference | Decision |
| --- | --- | --- | --- |
| `id` | (stable id, implied) | `id` | Shipped as PK (established convention). |
| `project_id` | (explicit Project) | `project_id` | Shipped: explicit ownership key enabling the same-Project composite FKs. |
| `topic_id` | `topic_id` | `topic_id` | Shipped NOT NULL; composite same-Project FK. |
| `market_profile_id` | optional MarketProfile | `market_profile_id?` | Shipped nullable; composite same-Project FK; NULL = not profile-scoped. |
| `profile` | `type` | `profile` | Shipped as `profile` (TASK "profile/type"; domain-types + reference name `profile`); canonical 6-value OpportunityProfile union. |
| `page_fit_action` | `page_fit_action` | `page_fit_action` | Shipped NOT NULL; canonical 6-value PageFitAction union. |
| `target_page_url` | `target_page_url?` | `target_page_url?` | Shipped nullable. |
| `score_json` | score snapshot | `scores` / `score_json` | Shipped as opaque JSON text snapshot (whole canonical `scores` incl. `finalScore`). |
| `data_quality_json` | data-quality snapshot | `data_quality` / `data_quality_json` | Shipped as opaque JSON text snapshot. |
| `evidence_snapshot_json` | evidence snapshot | `evidence_snapshot` / `evidence_snapshot_json` | Shipped as opaque JSON text snapshot. |
| `reason` | `reason` | `reason` | Shipped NOT NULL. |
| `recommended_action` | `recommended_action` | `recommended_action` | Shipped NOT NULL. |
| `source_snapshot_at` | source snapshot time | `source_snapshot_at` | Shipped NOT NULL (TASK "source snapshot time"). |
| `created_at` / `updated_at` | system timestamps | `created_at` / `updated_at` | Shipped (mutable lifecycle row; §8 + reference both carry `updated_at`). |

Reconciled OUT (documented, not shipped):

- Migration-reference-only `status` lifecycle column — no V1.0 document defines an
  opportunity lifecycle union and no workflow is authorized in this task.
- Migration-reference `final_score REAL` as a separate column — that value is
  `scores.finalScore` inside `score_json`; a second column would create two
  storage representations of one immutable value.
- No JSON-encoded relationships anywhere — relational identity stays in the
  typed FK columns.

## RELATIONSHIP / ENUM DECISIONS

- Same-Project Topic and optional MarketProfile ownership is DB-enforced by
  composite FKs whose leading column is the row's own `project_id` (the accepted
  T107/T108 pattern) — a cross-Project Topic/MarketProfile or an explicit row
  Project mismatch has no matching parent row and is rejected by the DB.
- Delete behavior: deleting a Topic, a MarketProfile, or a whole Project cascades
  the opportunity away (composite FKs + Project FK are ON DELETE CASCADE), so no
  opportunity can dangle.
- `profile` union = `EXISTING_GOOGLE_PAGE | EXISTING_SEARCH_PAGE_PARTIAL |
  NEW_TOPIC | GEO_DISTRIBUTION | EVIDENCE_ONLY | TECHNICAL_BLOCKER`.
- `page_fit_action` union = `NEW_PAGE | REFRESH_PAGE | MERGE |
  DISTRIBUTE_ONLY | EVIDENCE_ONLY | TECHNICAL_FIX`.
- DataQuality boundary (directly supported) = `status` `COMPLETE | DEGRADED |
  INSUFFICIENT` and `warnings[]` each `LOW_SAMPLE | NO_GA4 | NO_GSC |
  PROVIDER_PARTIAL_FAILURE | MODEL_CHANGED | SURFACE_CHANGED | PARSER_CHANGED |
  MARKET_CHANGED | DATA_LAG`. Chosen over `08_OPPORTUNITY_ENGINE_SPEC.md`'s
  illustrative list containing `NEW_SITE` because the canonical domain-types
  union wins (summary of `schemas/domain-types.ts`). These are validated at the
  Zod boundary only — the snapshot is opaque JSON text to storage.
- No business uniqueness index added (TASK forbids it).

## MIGRATION IDS

- D1/SQLite: `drizzle/0055_lowly_sumo.sql` (+ `drizzle/meta/0055_snapshot.json`,
  `drizzle/meta/_journal.json` idx 55).
- PostgreSQL: `drizzle-pg/0033_supreme_talon.sql` (+
  `drizzle-pg/meta/0033_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 33).

## FILES CHANGED

Modified:

- `src/db/search-growth.schema.ts` — appended the SQLite
  `searchGrowthOpportunities` table (15 columns, Project FK, two same-Project
  composite FKs, two named CHECKs, two indexes); extended the top-of-file
  max-lines header comment.
- `src/db/pg/search-growth.schema.ts` — appended the structurally identical
  Postgres `searchGrowthOpportunities` mirror (PG `isoNow` timestamp default);
  extended the top-of-file max-lines header comment.
- `src/db/schema.ts` — added `searchGrowthOpportunities` to the barrel exports.
- `drizzle/meta/_journal.json`, `drizzle-pg/meta/_journal.json` — generated by
  `db:generate`.
- `control/ACCEPTANCE_LEDGER.md` — WHITESPACE-ONLY prettier normalization of the
  pre-existing T108 row (see DEVIATIONS).

Added:

- `src/types/schemas/search-growth-opportunity.ts` — Zod boundary module
  (`opportunityProfileSchema`, `pageFitActionSchema`, `dataQualityStatusSchema`,
  `dataQualityWarningSchema` + exported row/enum types aligned with the storage
  columns).
- `src/types/schemas/search-growth-opportunity.test.ts` — boundary tests
  (accept every column/status/warning value; reject unsupported, case-mismatched
  and empty values; exported row/enum types stay aligned with storage).
- `src/db/search-growth-opportunity.test.ts` — migration-backed storage spec
  (16 tests) through the shipped 0055 DDL.
- `drizzle/0055_lowly_sumo.sql`, `drizzle/meta/0055_snapshot.json`,
  `drizzle-pg/0033_supreme_talon.sql`, `drizzle-pg/meta/0033_snapshot.json`.
- `control/tasks/T109-M1-OPPORTUNITY-SCHEMA/evidence/round-1/gates.md`.

## DEPENDENCIES CHANGED

None. `corepack pnpm install --frozen-lockfile` exit 0 on the clean worktree;
no package.json / lockfile change was made.

## TESTS ADDED

- `src/types/schemas/search-growth-opportunity.test.ts` — 7 tests: every
  `profile` column enum value is a valid OpportunityProfile; every
  `page_fit_action` column enum value is a valid PageFitAction; unsupported /
  case-mismatched / empty profiles and page-fit actions are rejected; every
  canonical DataQuality status (and every canonical warning, incl. rejecting
  `NEW_SITE`, case-mismatches and empty) is accepted/rejected correctly; exported
  row/enum types align with the storage columns (compile-time Pick + runtime
  assertions).
- `src/db/search-growth-opportunity.test.ts` — 16 migration-backed tests: valid
  full-field persistence; optional fields store NULL; NOT NULL enforcement
  (reason, score_json); same-Project Topic+MarketProfile allowed; dangling Topic
  and dangling MarketProfile rejected; cross-Project Topic and cross-Project
  MarketProfile rejected; explicit row-Project mismatch rejected; every profile
  and page-fit enum round-trips; unsupported profile/action rejected by the named
  CHECKs; immutable snapshot payloads persist byte-for-byte; cascade on Topic
  delete, MarketProfile delete, and whole-Project delete; schema-shape check
  (only the direct/reconciled field set + system timestamps, no reference-only
  status/final_score column). Uses `drizzle/0045_search_market_profiles.sql`,
  `0046_search_topics.sql`, `0049_gigantic_johnny_blaze.sql` then
  `0055_lowly_sumo.sql` with `PRAGMA foreign_keys = ON` — real in-memory SQLite
  from the shipped DDL.
- Parity coverage: the new table is automatically covered by
  `src/db/schema-parity.test.ts` (SQLite vs PG mirror).

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no chained shells), per
the T108-approved command matrix the TASK adopts.

1. `node --version` → v24.16.0.
2. `corepack pnpm --version` → `10.30.1`.
3. `corepack pnpm install --frozen-lockfile` → exit 0 (clean worktree, deps already present).
4. `corepack pnpm run db:generate` → exit 0 — generated D1 `0055_lowly_sumo` + PG `0033_supreme_talon`; re-run at the end reports `No schema changes, nothing to migrate` on BOTH dialects (clean final dual-dialect generation).
5. `corepack pnpm exec prettier --write <task-touched files>` → exit 0 — schema files/barrel unchanged; new test file reflowed once.
6. `corepack pnpm run db:migrate:local` → exit 0 — applied 0000→0055 locally; `0055_lowly_sumo.sql` `✅`.
7. `corepack pnpm exec vitest run src/db/search-growth-opportunity.test.ts src/types/schemas/search-growth-opportunity.test.ts src/db/schema-parity.test.ts` → exit 0 — 257 tests passed.
8. `corepack pnpm format:check` → exit 0 — `All matched files use Prettier code style!` (see DEVIATIONS for the one pre-existing ledger normalization that made this gate pass).
9. `corepack pnpm types:check` → exit 0 — `tsc --noEmit` clean.
10. `corepack pnpm lint` → exit 0 — `Found 0 warnings and 0 errors` (874 files).
11. `corepack pnpm test` → exit 0 — 160 files / 1378 tests passed.
12. `corepack pnpm build` → exit 0 — vite client + SSR + `open_seo_audit` builds and the trailing `tsc --noEmit` is clean.
13. `corepack pnpm ci:check` → exit 0 — prettier, knip, both `tsc --noEmit` runs, oxlint 0/0, plugin-skill sync clean.

## COMMAND RESULTS

All TASK-required gates pass on the final tree: focused tests 257/257,
`format:check` exit 0, `types:check` exit 0, `lint` exit 0 (0/0), full `test`
160 files/1378 tests, `build` exit 0, `ci:check` exit 0, and a clean final
dual-dialect `db:generate` re-run on both dialects. Exact exits are recorded in
`evidence/round-1/gates.md`.

## RUNTIME EVIDENCE

See `control/tasks/T109-M1-OPPORTUNITY-SCHEMA/evidence/round-1/gates.md` —
concise sanitized log of migration content, test counts, gate exits, and
tooling versions.

## KNOWN LIMITATIONS

- The `score_json` / `data_quality_json` / `evidence_snapshot_json` snapshots are
  stored as opaque JSON text. Parsing/validating the full internal shape of the
  score and evidence payloads belongs to the later opportunity computation task
  (this slice pins only the directly supported DataQuality boundary). No
  value inside any snapshot is used as a relationship key or duplicated column.
- The mutable lifecycle row has `updated_at` but no update/delete API, repository
  or service — CRUD/refresh behavior is a later task by design.
- The schema-barrel `max-lines` header comments (SQLite + PG) and the new
  storage-spec file's `max-lines, max-lines-per-function` disable are line-count
  exemptions only; schema-parity, types, and lint pass on the final tree.

## DEVIATIONS FROM TASK

- `control/ACCEPTANCE_LEDGER.md` was modified with a WHITESPACE-ONLY prettier
  normalization (one table row padded to its column width). At round start this
  controller-owned file already failed `prettier --check` on the committed T108
  row (introduced by the controller's T108 accept commit before this worktree was
  dispatched), which blocked the TASK-required `format:check`/`ci:check` gates
  before any T109 file change. Normalizing that row to the canonical Prettier
  table style is the minimal change required to run the mandated gates; no T108
  content, status, date, or commit hash was altered. Flagging for the controller.
- Everything else shipped as the TASK field list/§8/domain-types required; no
  `status` lifecycle column and no duplicated `final_score` column (see FIELD
  RECONCILIATION for the reasoned deviations from the migration-reference shape).

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state (`db:migrate:local`) and
  in-memory SQLite built from the shipped forward migration DDL.
- No network/provider/publishing action occurred. No `--dangerously-skip-
  permissions` was used. No commit, merge, or push was performed.
- Scope lock/ADRs were not edited. `REVIEW.md` (T109) does not exist and was not
  created/edited.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T109-M1-OPPORTUNITY-SCHEMA`; HEAD `df8d3ca`.
- Working tree is NOT committed (round 1 stops at delivery).
- Modified tracked files: `control/ACCEPTANCE_LEDGER.md` (whitespace-only, see
  DEVIATIONS); `drizzle/meta/_journal.json`, `drizzle-pg/meta/_journal.json`
  (db:generate); `src/db/pg/search-growth.schema.ts`,
  `src/db/search-growth.schema.ts`, `src/db/schema.ts`.
- Added files: `drizzle/0055_lowly_sumo.sql`, `drizzle/meta/0055_snapshot.json`,
  `drizzle-pg/0033_supreme_talon.sql`, `drizzle-pg/meta/0033_snapshot.json`,
  `src/db/search-growth-opportunity.test.ts`,
  `src/types/schemas/search-growth-opportunity.ts`,
  `src/types/schemas/search-growth-opportunity.test.ts`, and the
  `control/tasks/T109-M1-OPPORTUNITY-SCHEMA/evidence/round-1/` evidence channel.
- `git diff --stat` (tracked): 6 files, +383/−3. Full status is clean except the
  above listed task files and the two journal files.

## READY FOR REVIEW

Round 1 storage/contract slice is complete and verified: normalized
`search_growth_opportunities` on D1 (0055) and PG (0033) with same-Project
Topic/optional MarketProfile composite FKs, named CHECK enum rejection, opaque
snapshot persistence, no business uniqueness, the Zod OpportunityProfile /
PageFitAction / DataQuality boundary, and the migration-backed storage + parity
tests. Gates: focused 257/257, `format:check` 0, `types:check` 0, `lint` 0/0,
full `test` 1378/1378, `build` 0, `ci:check` 0, clean final `db:generate` on
both dialects. DELIVERY records the field reconciliation, relationship/enum
decisions, migration IDs, command exits, scope/security declaration, and final
Git status. No `PASS` verdict is written by the implementation round.
