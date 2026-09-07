# TASK T100-M1-MARKET-PROFILE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## ROUND 2 RECOVERY CONTEXT

Round 1 ended at the 100-turn limit after producing a focused partial schema/migration/test diff but before any acceptance command or DELIVERY. Continue from that diff. The isolated worktree has no `node_modules`, so Round 2 is explicitly authorized to run one locked install. Do not redo broad discovery or retry commands denied in Round 1; use Read/Glob/Grep and the approved Git commands for inspection.

## ROUND 3 FINAL FIX CONTEXT

Round 2 delivered a nearly complete slice. Fix only the two REVIEW findings: require `location_code` and `country` everywhere and replace the Global/null test profile with a concrete market; then rerun the final matrix. The Controller has supplied the formatting-only `.ai-orchestrator/config.json` correction that previously blocked format/CI. Do not edit that control file. This is the final executor round.

## GOAL

Add the normalized, project-scoped `SearchMarketProfile` persistence foundation for both SQLite/D1 and Postgres. This task ends at the schema/domain boundary; API, UI, Topic, Entity, Prompt, GEO, and connector work are separate tasks.

## REQUIREMENT REFERENCES

Read only the directly relevant material plus root `CLAUDE.md`:

- `05_DOMAIN_DATA_MODEL.md` section 2 (`SearchMarketProfile`)
- `20_DATABASE_SCHEMA_GUIDE.md` sections 1, 2, and 6
- `21_TEST_ACCEPTANCE_PLAN.md` sections 1 and 2
- `29_SCOPE_LOCK.md`
- `30_TRACEABILITY_MATRIX.md` row `Market真实`
- existing SQLite/D1 and Postgres schema, migration, ID, timestamp, project-foreign-key, and schema-parity patterns needed to implement this slice

## ENGINEER LOOP

Own the complete loop: `inspect → modify → test → inspect failure → fix → retest → DELIVERY`. Diagnose and repair failures within this scope before returning. Do not stop after the first failing check if a task-local correction is possible.

## IN SCOPE

1. Add one normalized `search_market_profiles` table to the existing OpenSEO schema in both supported dialects.
2. Represent these required, non-null domain fields without JSON encoding: `id`, `project_id`, `name`, `search_engine`, `location_code`, `location_name`, `language_code`, `device`, `country`, `primary`, and `active`. Follow repository naming conventions; an `is_primary` storage column mapped to an idiomatic property is acceptable.
3. Constrain `search_engine` to `GOOGLE | BAIDU | BING | OTHER` and `device` to `DESKTOP | MOBILE` using the repository's established cross-dialect pattern. Validate untrusted/domain values with Zod at the domain boundary.
4. Bind every profile to the existing OpenSEO Project through an explicit foreign key and add only indexes/uniqueness rules justified by current repository conventions and the V1.0 documents. Do not invent a second Project model or encode relations in JSON.
5. Add forward migrations for both SQLite/D1 and Postgres using the next repository-supported migration identifiers and syntax.
6. Extend meaningful schema/parity tests and add a small market fixture test proving at least distinct Google and Baidu profiles retain engine, location, language, country, device, primary, active, and project identity without a `GLOBAL` fallback.
7. Update any schema exports/types required for later repository/service work. Keep this task free of CRUD server functions and UI.

## OUT OF SCOPE

- SearchGrowthTarget, SearchTopic, keyword references, Entity/Alias, Prompt, GEO observation, Opportunity, Content, Release, Distribution, Experiment, Audit, or RuntimeControl implementation.
- CRUD endpoints, server functions, service/repository methods, forms, or UI.
- M0.5 connector implementation or any Wechatsync/yxer/social/Postiz work.
- External requests, credentials, account access, production deployment, remote migration, paid action, or publication.
- Product-scope changes, Accepted ADR edits, dependency upgrades, lockfile changes, broad refactors, or replacement infrastructure.

## ARCHITECTURE AND DATA RULES

- Reuse the existing OpenSEO Project and database architecture.
- Keep searchable relational fields as typed columns; do not use JSON/text to avoid joins.
- SQLite/D1 and Postgres must expose the same logical fields, defaults, relationships, and constraints.
- Use idiomatic TypeScript and Zod. Search existing helpers and installed libraries before adding utilities.
- Preserve all existing data and migrations; migrations must be forward-only and safe on an existing database.
- Do not add an implicit `GLOBAL` market or infer missing market identity.

## ACCEPTANCE CRITERIA

- [ ] Both dialect schemas define one logically equivalent `search_market_profiles` table with every required field.
- [ ] Existing Project ownership is enforced through an explicit foreign key using established delete/update behavior.
- [ ] Engine and device reject unsupported values at a tested trust/domain boundary.
- [ ] SQLite/D1 and Postgres migrations are forward-only, syntactically valid, and use repository conventions.
- [ ] Schema parity coverage includes the new table and passes.
- [ ] Market fixture coverage proves Google and Baidu profiles remain explicit and distinct; no `GLOBAL` fallback exists.
- [ ] No API/UI/connector or unrelated domain implementation is included.
- [ ] No Accepted ADR, scope, dependency, lockfile, production resource, or credential change occurs.
- [ ] The final diff is focused and `DELIVERY.md` lists every path and exact test result.

## APPROVED COMMANDS

Run independently and save concise sanitized logs under `control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/evidence/round-1/`:

1. `node --version`
2. `corepack pnpm --version`
3. `corepack pnpm install --frozen-lockfile` (Round 2 only; lockfile and manifests must remain unchanged)
4. `corepack pnpm exec prettier --write <only task-touched source/test/migration files>`
5. `corepack pnpm run db:migrate:local`
6. `corepack pnpm run db:generate` (Round 3 final metadata-consistency check; it must report no additional schema change after the existing unmerged migration/snapshot is corrected)
7. `corepack pnpm exec vitest run <focused schema/parity/market tests>`
8. `corepack pnpm format:check`
9. `corepack pnpm types:check`
10. `corepack pnpm lint`
11. `corepack pnpm test`
12. `corepack pnpm build`
13. `corepack pnpm ci:check`
14. Read-only Git inspection: `git status`, `git diff`, `git log`, `git show`, `git ls-files`, `git rev-parse`.

Do not add/update packages or run commands not listed here. Do not use `--dangerously-skip-permissions`.

## DELIVERY

Write `control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/DELIVERY.md` using the repository template. Include schema/migration inventory, constraint rationale, test coverage, exact command exits/summaries, limitations, security notes, and final Git diff/status. Do not commit, merge, edit `REVIEW.md`, or start another task.
