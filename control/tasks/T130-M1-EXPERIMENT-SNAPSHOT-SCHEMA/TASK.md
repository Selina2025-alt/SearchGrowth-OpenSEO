# TASK — T130-M1-EXPERIMENT-SNAPSHOT-SCHEMA

## GOAL

Implement the credential-free, append-only, Project-scoped `ExperimentSnapshot` persistence and Zod/domain contract only. A snapshot records measurement context and payloads; this task must not activate experiments, calculate attribution, query GEO/GSC/GA4, schedule rechecks, publish, call providers, use credentials, spend, or perform production actions.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §14; `16_ATTRIBUTION_EXPERIMENT_SPEC.md` §§4–5; `20_DATABASE_SCHEMA_GUIDE.md` §§1, 3–6; `21_TEST_ACCEPTANCE_PLAN.md` §27; `29_SCOPE_LOCK.md`; legacy `experiment_snapshots` reference artifacts; accepted Experiment and append-only AuditEvent patterns; and direct schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `experiment_snapshots` storage and matching Zod/domain row contract. Reconcile source fields: stable id, explicit Project identity, Experiment relation, snapshot type, captured timestamp, optional window start/end, optional timezone, required SEO/GEO/GA4/publication/indexing metric documents, required data-quality document, and optional notes.
2. Use explicit Project identity and a Project-leading composite FK so each snapshot is database-proven to belong to its Experiment's Project. Add only the supporting parent composite index needed for that FK; do not add a business uniqueness rule. Choose documented, consistent delete behavior.
3. Preserve the V1.0 immutable/append-only snapshot contract at the database boundary using the established accepted pattern. Validate every required JSON document at the database boundary. Use enum/checks only for authoritative V1.0 value sets; do not invent snapshot taxonomy, measurement formulae, data-lag policy, or lifecycle behavior.
4. Use forward D1 `0075` and PostgreSQL `0053` migrations with matching journals/snapshots. Add migration-backed tests for same-Project persistence, Project mismatch rejection, required/optional fields, JSON validation, append-only behavior, and delete behavior; add focused domain contract tests.
5. Run clean `corepack pnpm run db:generate`, local migration, focused/full tests, format, types, lint, build, and `ci:check`, recording exact exits. If an aggregate gate is sandbox-denied, record it once without bypass and stop.

## OUT OF SCOPE

Experiment activation/state transitions, attribution or comparison calculations, baseline/recheck execution, provider calls, GEO/GSC/GA4 collection, CRUD/UI, publication, credentials/accounts, paid actions, production behavior, or Accepted ADR/product-scope changes.

## APPROVED COMMANDS

Use only: `corepack pnpm run db:generate`, `corepack pnpm run db:migrate:local`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, or invoke external/publishing/paid behavior.

## DELIVERY

Write `control/tasks/T130-M1-EXPERIMENT-SNAPSHOT-SCHEMA/DELIVERY.md` with field/JSON/immutability reconciliation, Project relation/delete decisions, migration IDs, exact gate exits, scope/security declaration, changed files, and final Git status; then stop.
