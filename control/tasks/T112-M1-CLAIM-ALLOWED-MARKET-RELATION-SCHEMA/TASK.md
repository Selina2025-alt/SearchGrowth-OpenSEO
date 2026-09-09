# TASK T112-M1-CLAIM-ALLOWED-MARKET-RELATION-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized Claim `allowed_markets[]` relation using existing Project-scoped SearchMarketProfiles. This is a schema/contract slice only: it models the allowed-market policy relation and does not implement policy evaluation or Claim verification.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §2 SearchMarketProfile and §9 Claim, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, accepted T100 MarketProfile and T111 Claim/Source schemas, migrations, tests, and accepted dual-dialect relation patterns.

## IN SCOPE

1. Add equivalent D1/PostgreSQL normalized `claim_allowed_market_profiles` storage with stable id, explicit `project_id`, `claim_id`, `market_profile_id`, and an append-only relation timestamp following established mapping-table convention.
2. Database-enforce that each relation joins a Claim and SearchMarketProfile belonging to the same Project, using composite FKs and only any necessary *referential* composite parent keys. Do not encode `allowed_markets[]` as JSON or a text list.
3. Add only the relation-identity uniqueness needed to prevent duplicate Claim/MarketProfile edges. Do not add market-selection, primary-market, ranking, or policy-evaluation behavior.
4. Use forward D1 `0058` / PostgreSQL `0036` migrations plus snapshots/journals; never edit accepted migrations. Add migration-backed tests for same-Project persistence, cross-Project rejection in both directions, dangling parent rejection, Claim/MarketProfile/Project delete behavior, duplicate-edge rejection, normalized relation shape, and dialect parity.
5. Run local migration, clean final dual-dialect `db:generate`, focused tests, format, types, lint, full tests, build, and `ci:check`; every gate must exit 0.

## OUT OF SCOPE

`allowed_languages[]` (separate later relation task), Claim verification/reverification, policy evaluation/runtime, content packages, CRUD/UI, providers, credentials, publishing, paid/production action, dependency changes, ADR/scope change.

## APPROVED COMMANDS

Use the established safe schema-task command matrix only: node/corepack version checks, frozen install, task-file Prettier, local D1 migration, dual-dialect generation, focused Vitest, format check, types check, lint, full test, build, `ci:check`, and read-only Git inspection. Do not use unlisted commands, `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T112-M1-CLAIM-ALLOWED-MARKET-RELATION-SCHEMA/DELIVERY.md` with relation/FK/delete decisions, migration IDs, exact gate exits, `db:generate` result, scope/security declaration, changed files, and Git status; then stop.
