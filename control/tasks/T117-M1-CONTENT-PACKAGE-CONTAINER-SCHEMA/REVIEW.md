# REVIEW — T117-M1-CONTENT-PACKAGE-CONTAINER-SCHEMA, Round 1

VERDICT: BLOCKED

## VERIFIED

- The uncommitted T117 diff is limited to the intended content-package schema mirrors, barrel export, D1/PG forward migrations and snapshots/journals, and migration-backed test.
- `content_packages` has explicit Project identity, required same-Project Topic, optional same-Project Opportunity, opaque required title/locale/status, and audit timestamps. The two composite FKs and their delete cascades are present in both dialects.
- D1 `0062_calm_nightcrawler.sql` and PostgreSQL `0040_panoramic_timeslip.sql` are forward migrations. PostgreSQL creates the supporting `search_growth_opportunities(project_id, id)` referential index before adding the composite FK.
- Delivery evidence reports clean final dual-dialect generation, local migration plus idempotent rerun, 304 focused tests, and 1,507 final clean full-suite tests. Targeted `git diff --check` is clean.
- The task adds no ContentVersion/Variant, canonical content, JSON relation payload, lifecycle/gate/publication semantics, renderer, CRUD, connector, credential, or external behavior.

## FINDINGS

### BLOCKER — required format gate exits 1 outside T117 scope

- **Path / location:** `control/ACCEPTANCE_LEDGER.md`.
- **Requirement violated:** TASK item 5 requires every aggregate quality gate to exit 0.
- **Evidence:** Controller verification `corepack pnpm format:check` exits 1 and identifies `control/ACCEPTANCE_LEDGER.md`. A direct `corepack pnpm exec prettier --check control/ACCEPTANCE_LEDGER.md` on current integration reproduces the failure.
- **Provenance:** T117 merge-base is `5554776`; `git diff 5554776 -- control/ACCEPTANCE_LEDGER.md` is empty in the T117 worktree. The formatting regression predates T117 and is not in its diff.
- **Scope assessment:** formatting this Controller ledger is outside the T117 ContentPackage implementation task. No T117 implementation file was changed.
- **Expected behavior / acceptance condition:** correct the pre-existing control-plane formatting issue through an authorized maintenance/control action, then re-evidence the remaining T117 aggregate gates on the unchanged implementation.

## MERGE DECISION

Do not merge T117 into `integration/ai-v1`; never merge to `main`. Keep Round 1 BLOCKED without modifying implementation or consuming another Claude round.
