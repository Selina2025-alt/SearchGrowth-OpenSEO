# REVIEW — T115-M1-PUBLISHED-MEDIA-REF-SCHEMA, Round 1

VERDICT: BLOCKED

## VERIFIED

- The task worktree is the unmerged `ai-task/T115-M1-PUBLISHED-MEDIA-REF-SCHEMA` implementation based on the current integration checkpoint; its uncommitted schema, forward-migration, snapshot, test, and DELIVERY changes match the task scope.
- The implementation adds only the internal `published_media_refs` contract. Its explicit `project_id` and composite `(project_id, media_asset_id) → media_assets(project_id, id)` foreign key enforce same-Project MediaAsset ownership; both the direct Project and composite MediaAsset relationships use delete cascades.
- D1 `0061_windy_sally_floyd.sql` and PostgreSQL `0039_fair_doctor_octopus.sql` are forward migrations with matching journals and snapshots. PostgreSQL creates the parent composite unique referential target before adding the composite FK.
- Delivery evidence records clean final dual-dialect `db:generate`, successful local migration and idempotent re-run, focused migration-backed tests (3 files / 288 tests), and full Vitest (169 files / 1,488 tests).
- The migration-backed test covers same-Project persistence, both cross-Project directions, dangling Project/asset rejection, nullable opaque fields, required columns, exact normalized shape, and both cascades.
- Targeted diff and `git diff --check` are clean. No connector, credential, upload, remote request, URL verification, status/`PUBLIC_VERIFIED`, CRUD/UI, or business uniqueness was added.
- Under the Product Owner-authorized Controller acceptance-verification exception on the unchanged task worktree: `corepack pnpm format:check` and `corepack pnpm types:check` exited 0.

## FINDINGS

### BLOCKER — required lint gate exits 1 outside T115 scope

- **Path / location:** `src/types/schemas/claim.ts:3` and `src/db/claims.test.ts:60`.
- **Requirement violated:** TASK item 5 requires every aggregate quality gate to exit 0.
- **Evidence:** `corepack pnpm lint` exited 1. Oxlint reports `consistent-type-imports` for `claimAllowedLanguages`, `claimAllowedMarketProfiles`, and `claimSourceRefs` in `src/types/schemas/claim.ts`; it also reports unused `SOURCE_REF_COLUMN_INSERT` in `src/db/claims.test.ts`.
- **Scope assessment:** neither file is part of the T115 diff. Repairing either would exceed this PublishedMediaRef schema task and is not authorized as a Controller implementation change.
- **Expected behavior / acceptance condition:** a separately authorized, narrow quality-baseline repair must make `corepack pnpm lint` exit 0 without changing T115's schema contract. Then the remaining required gates must be re-evidenced against the unchanged accepted T115 implementation.

`build` and `ci:check` had not produced confirmed exit results when this real lint failure ended the verification. They are not claimed as passing.

## MERGE DECISION

Do not merge T115 into `integration/ai-v1`; never merge to `main`. Keep Round 1 BLOCKED without modifying implementation or consuming another Claude round.
