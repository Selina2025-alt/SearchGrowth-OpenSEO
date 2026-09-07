# IMPLEMENTATION_BASELINE

Status: COMPLETE for M0 Freeze & Baseline (credential-less E2E fixture contract recovered).
Evidence: `control/tasks/T000-M0-E2E-RECOVERY/evidence/round-2/` (primary, round-2 reruns) and `evidence/round-1/` (install/migrate and round-1 PASS logs).
Task delivery: `control/tasks/T000-M0-E2E-RECOVERY/DELIVERY.md`.

## Frozen source

Two distinct commits must not be conflated. Git read-only evidence below was captured on this worktree (branch `ai-task/T000-M0-E2E-RECOVERY`, HEAD = the overlay commit).

- **Upstream frozen OpenSEO source (the freeze point):** commit `3632f408528cd588fec98c3a174af8ea0ad205e8` ("Blog: What Broke the $99 Ceiling (#277)"). This is the last upstream OpenSEO commit the Search Growth overlay is based on; it is the merge-base of the overlay.
- **Search Growth overlay (integration baseline):** commit `c9d58921115fea846d6fd94cb90a09e66865cec4` ("chore: establish Search Growth V1.0 AI development baseline"). The overlay is exactly **one** commit ahead of the frozen source.
- **Ancestry (verified):** `git merge-base 3632f408528cd588fec98c3a174af8ea0ad205e8 c9d58921115fea846d6fd94cb90a09e66865cec4` → `3632f408528cd588fec98c3a174af8ea0ad205e8`, i.e. the frozen source is a direct ancestor (parent) of the overlay. `git rev-list --count 3632f408...c9d5892...` → `1`.
- **Frozen → overlay changed paths (verified):** `git diff --name-status 3632f408528cd588fec98c3a174af8ea0ad205e8 c9d58921115fea846d6fd94cb90a09e66865cec4` → **133 added (A)** Search Growth V1.0 planning/control-plane artifacts and **3 modified (M)** paths: `.gitignore`, `AGENTS.md`, `CLAUDE.md`. The added set is the V1.0 doc/spec corpus (`00_*.md`–`47_*.md`), `docs/adr/ADR-001…019`, `control/**`, `checklists/**`, `templates/**`, `skills/**`, `reference-implementations/**`, `schemas/**`, `fixtures/**`, `scripts/**`, and `.ai-orchestrator/**`. No OpenSEO product source was removed or forked; the overlay only layers V1.0 planning artifacts on top of the frozen source.
- **Current recovery branch:** `ai-task/T000-M0-E2E-RECOVERY` (this worktree), HEAD = `c9d5892…` (overlay). The obsolete `ai-task/T000-M0` branch is **not** checked out. The working tree additionally carries the uncommitted T000-M0 + recovery diff, which is not part of either commit above.
- package version: 0.1.7
- Node: v24.16.0 (`evidence/round-2/02-node-version.log`, reused from `evidence/round-1/01-node-version.log`)
- pnpm: 10.30.1 via corepack (`evidence/round-2/01-pnpm-version.log`)

## Commands

All commands run independently on the Windows Git Bash executor via corepack pnpm. Install and local migrations were **not** rerun in round 1 or round 2; they are reused from prior T000 evidence (both PASS).

- install: PASS — prior evidence `control/tasks/T000-M0/evidence/logs/01-install.log` and `control/tasks/T000-M0/evidence/round-2/01-install.log` (not rerun).
- migrate: PASS — prior evidence `control/tasks/T000-M0/evidence/logs/02-db-migrate-local.log` (wrangler D1 local, migrations 0001–0044 applied; not rerun).
- format: PASS — `evidence/round-2/03-format-check.log` (Prettier, all files; round-1 log `evidence/round-1/03-format-check.log`).
- types: PASS — `evidence/round-2/04-types-check.log` (`tsc --noEmit`, exit 0).
- lint: PASS — `evidence/round-2/05-lint.log` (oxlint `--type-aware`, 0 warnings / 0 errors).
- test: PASS — `evidence/round-2/07-unit-test.log` (140 files, 1,171 tests).
  - Focused round-1 new tests: `evidence/round-1/06-test-focused.log` (2 files, 6 tests). Not rerun in round 2 (not invalidated; round-2 changed no src/ test surface).
- build: PASS — `evidence/round-2/08-build.log` (`vite build && tsc --noEmit`).
- e2e: PASS — `evidence/round-2/09-test-e2e.log` (11 Playwright tests, terminal `11 passed (2.1m)`; **CPU throttle default restored to 6×** with budgets unchanged; empty `DATAFORSEO_API_KEY`; no `AUTH_CONFIG_MISSING`, no `server.function error`, no provider error in log).
- ci:check: PASS — `evidence/round-2/10-ci-check.log` (Prettier, knip, tsc app + badseo, oxlint, `sync-plugin-skills`, then `node scripts/check-plugin-skills-sync.mjs` which also detects untracked skill drift; terminal `plugin skill sync clean`).

## OpenSEO Code Map

Verified against this worktree's source (M0 scope). V1.0 does **not** duplicate any of these capabilities.

| Expected capability      | Actual path/service                                                                                                                                                                                                    | Reuse decision | Notes                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| Project Context          | `src/db/project-context.schema.ts`, `src/serverFunctions/projectContext.ts`                                                                                                                                            | existing       | Narrative positioning / writing preferences reused as-is.                                           |
| Competitors/Key Pages    | `src/serverFunctions/domain.ts` → `src/server/features/domain/services/DomainService.ts` (`getOverview`, `getPagesPage`, `getKeywordsPage`); e2e fixture gate `e2e/fixtures/domain-overview-fixtures.ts`               | existing       | Domain Overview is the Competitors/Key Pages surface; add Entity mapping only.                      |
| Keyword/Rank             | `src/serverFunctions/keywords.ts` → `src/server/features/keywords/services/research/*`; `KeywordResearchService.ts`; rank tracking `src/server/features/rank-tracking/**`, `src/server/workflows/RankCheckWorkflow.ts` | existing       | Topic/entity mapping on top; no second keyword library.                                             |
| AI Search                | `src/serverFunctions/ai-search.ts`; `src/server/features/ai-search/services/{brandLookup,promptExplorer,shareOfVoice,citedSources}.ts`                                                                                 | existing       | Brand Lookup = `AGGREGATED_SEARCH_DATA` surface.                                                    |
| Prompt Explorer Cache    | `src/server/features/ai-search/services/promptExplorer.ts` + `src/server/lib/r2-cache.ts` (`getCached`/`setCached`)                                                                                                    | existing       | Interaction-only. A 7-day cache hit on the same prompt/model is **not** three GEO samples.          |
| GSC                      | `src/serverFunctions/gsc.ts`; `src/client/features/gsc/**`                                                                                                                                                             | existing       | SEO/Index/PageFit inputs.                                                                           |
| GA4                      | `src/serverFunctions/ga4.ts`; `src/server/features/ga4/**`                                                                                                                                                             | existing       | Traffic/key-event/UTM inputs.                                                                       |
| SearchOpportunityService | `src/server/features/ga4/services/SearchOpportunityService.ts` (+ `.test.ts`), surfaced via MCP `src/server/mcp/tools/google-analytics-tools.ts`                                                                       | existing       | Existing-page near-line optimization; use as `seoExistingPageSignal`, not global Topic Opportunity. |
| Workflow                 | `src/server/workflows/{SiteAuditWorkflow,RankCheckWorkflow}.ts`; Cloudflare Workflows + `src/middleware/errorHandling.ts` `waitUntil` pattern                                                                          | existing       | V1.0 long tasks reuse the pattern.                                                                  |
| R2/deploy                | `src/server/lib/r2.ts`, `src/server/lib/r2-cache.ts`; `wrangler.jsonc`/`wrangler.audit.jsonc` bindings                                                                                                                 | existing       | Cache and scratch state on R2.                                                                      |
| D1/PG parity             | `src/db/**` (`src/db/d1/client.ts`, `src/db/pg/**`, shared `src/db/schema.ts`), `drizzle.config.ts` + `drizzle-pg.config.ts`                                                                                           | existing       | New tables implement both dialects.                                                                 |
| Auth/Middleware          | `src/lib/auth.ts`, `src/middleware/ensure-user/**`, `src/serverFunctions/middleware.ts` (`requireAuthenticatedContext`, `requireProjectContext`)                                                                       | existing       | AUTH_MODE `local_noauth` used for credential-less E2E.                                              |

## Conflicts

- **Prompt Explorer cache vs fresh GEO sampling.** The existing Prompt Explorer is interactive research; it caches by prompt/model with a 7-day window (`promptExplorer.ts` + `r2-cache.ts`). M0 confirms it must **not** be replayed 3 times as 3 GEO samples. V1.0 needs a fresh `MeasurementSamplingService` path for GEO measurement; no architecture change is made in M0.
- **SearchOpportunityService is not a global opportunity engine.** It optimizes existing pages near-line; V1.0 topic opportunity work must not treat it as a global Topic Opportunity.
- **No real credential in E2E.** Fixture mode (`VITE_E2E_DOMAIN_FIXTURES` / `VITE_E2E_KEYWORD_FIXTURES`) gates every exercised DataForSEO-backed path; `DATAFORSEO_API_KEY` is forced empty, so the provider transport (`src/server/lib/dataforseo/core.ts` `createAuthenticatedFetch`) throws before `fetch` if any path escapes fixtures.
