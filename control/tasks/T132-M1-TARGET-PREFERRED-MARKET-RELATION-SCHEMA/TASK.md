# TASK — T132-M1-TARGET-PREFERRED-MARKET-RELATION-SCHEMA

## GOAL

Implement the normalized, credential-free `SearchGrowthTarget → SearchMarketProfile` preferred-market relation only. This realizes `preferred_market_profile_ids[]` from `05_DOMAIN_DATA_MODEL.md` without encoding relational IDs in T131's configuration JSON.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §1; accepted T131 target core and T100 market-profile contracts; `20_DATABASE_SCHEMA_GUIDE.md` §§1, 4–6; `29_SCOPE_LOCK.md`; and direct related schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL normalized relation storage and matching Zod/domain row contract for one target Project's preferred SearchMarketProfile references.
2. Enforce database-level same-Project ownership using explicit Project identity plus a Project-leading composite FK to `search_market_profiles(project_id, id)` and the existing target Project primary-key relation. A target row and its market relation must belong to the same Project.
3. Use the natural pair identity to reject duplicate target/market references. Do not add ordering, priority, primary-market semantics, market CRUD, an additional business uniqueness rule, or runtime behavior.
4. Use forward D1 `0077` and PostgreSQL `0055` migrations with matching journals/snapshots. Add migration-backed tests for same-Project allowed, cross-Project rejected, duplicate rejected, target/market Project delete behavior, and normal persistence; add focused domain tests.
5. Run clean `corepack pnpm run db:generate`, local migration, focused/full tests, format, types, lint, build, and `ci:check`, recording exact exits. If an aggregate gate is sandbox-denied, record it once and stop without bypass.

## OUT OF SCOPE

Target configuration changes, Market CRUD, ranking/primary/ordering semantics, activation/runtime/workflows, provider calls, GEO/GSC/GA4, publishing, credentials/accounts, paid actions, production behavior, UI, and Accepted ADR/product-scope changes.

## APPROVED COMMANDS

Use only: `corepack pnpm run db:generate`, `corepack pnpm run db:migrate:local`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, or invoke external/publishing/paid behavior.

## DELIVERY

Write `control/tasks/T132-M1-TARGET-PREFERRED-MARKET-RELATION-SCHEMA/DELIVERY.md` with relation/identity/delete decisions, migration IDs, exact gate exits, scope/security declaration, changed files, and final Git status; then stop.
