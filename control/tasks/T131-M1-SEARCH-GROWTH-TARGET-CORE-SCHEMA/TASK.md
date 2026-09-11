# TASK — T131-M1-SEARCH-GROWTH-TARGET-CORE-SCHEMA

## GOAL

Implement the credential-free, Project-scoped `SearchGrowthTarget` configuration core and matching Zod/domain contract only. Reuse OpenSEO `projects`; do not create a second Project model, CRUD flow, or runtime behavior.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §1; `schemas/openapi.yaml` `SearchGrowthTarget`; legacy `search_growth_targets` reference artifacts; `20_DATABASE_SCHEMA_GUIDE.md` §§1–6; `29_SCOPE_LOCK.md`; accepted Project/Market patterns; and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `search_growth_targets` storage plus matching Zod/domain contract, reconciling the source-defined Project-scoped configuration: brand aliases, product targets, ICPs, personas, conversion goals, configuration provenance (`updated_by`), and update timestamp.
2. Preserve the reference table's one-row-per-Project identity (`project_id` is the primary key and FK to the existing OpenSEO Project). Validate the configuration document at the database boundary and match its accepted runtime shape with Zod. Do not duplicate Project data or add business uniqueness.
3. The `preferred_market_profile_ids[]` relation in `05_DOMAIN_DATA_MODEL.md` is deliberately NOT encoded inside the configuration JSON in this task. It remains a separately scoped normalized Project→Market relation after this core table is accepted.
4. Use forward D1 `0076` and PostgreSQL `0054` migrations with matching journals/snapshots. Add migration-backed tests for Project ownership, one-row identity, JSON validity, required fields, update/provenance behavior, and Project deletion behavior; add focused domain contract tests.
5. Run clean `corepack pnpm run db:generate`, local migration, focused/full tests, format, types, lint, build, and `ci:check`, recording exact exits. If an aggregate gate is sandbox-denied, record it once and stop without bypass.

## OUT OF SCOPE

Preferred-market relation, Market CRUD, activation/runtime/workflows, provider calls, GEO/GSC/GA4, publishing, credentials/accounts, paid actions, production behavior, UI, and Accepted ADR/product-scope changes.

## APPROVED COMMANDS

Use only: `corepack pnpm run db:generate`, `corepack pnpm run db:migrate:local`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, or invoke external/publishing/paid behavior.

## DELIVERY

Write `control/tasks/T131-M1-SEARCH-GROWTH-TARGET-CORE-SCHEMA/DELIVERY.md` with field/JSON reconciliation, Project identity/update decisions, migration IDs, exact gate exits, scope/security declaration, changed files, and final Git status; then stop.
