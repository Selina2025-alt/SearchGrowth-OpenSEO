# TASK — T129-M1-EXPERIMENT-CORE-SCHEMA

## GOAL

Implement the credential-free, Project-scoped `Experiment` core persistence and Zod/domain contract only. This is a storage-contract slice; it must not activate an experiment, schedule a workflow, create snapshots, publish, call providers, use credentials, spend, or perform production actions.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §§3 and 14; `16_ATTRIBUTION_EXPERIMENT_SPEC.md` §§4–5; `20_DATABASE_SCHEMA_GUIDE.md` §§1, 3–6; `21_TEST_ACCEPTANCE_PLAN.md` §27; `29_SCOPE_LOCK.md`; legacy `experiments` reference artifacts; accepted Topic, Opportunity, and ReleaseBundle schemas; and direct related schema/migration/test files.

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `experiments` storage plus matching Zod/domain row contract, reconciling the source-defined fields: stable id, explicit Project ownership, required Topic, optional Opportunity, optional ReleaseBundle, title, hypothesis, status, activation policy, optional activation timestamp, target keyword/prompt/surface reference documents, recheck-policy document, and created timestamp.
2. Use Project-leading composite FKs to enforce same-Project ownership for Topic and, where present, Opportunity and ReleaseBundle. Choose documented, consistent delete behavior. Do not add business uniqueness.
3. Validate each required JSON document at the database boundary. Use an enum/check only where an accepted V1.0 source defines an authoritative value set; otherwise retain required opaque text and do not invent lifecycle semantics.
4. Use forward D1 `0074` and PostgreSQL `0052` migrations with matching journals/snapshots. Add migration-backed storage tests for same-Project relations, cross-Project rejection, nullable optional relations, JSON validation, required fields, and delete behavior; add focused domain contract tests.
5. Run `corepack pnpm run db:generate`, `corepack pnpm run db:migrate:local`, focused tests, `corepack pnpm test`, format, types, lint, build, and `ci:check`, recording exact exits. If the executor sandbox denies an aggregate gate, record it once and stop; do not bypass.

## OUT OF SCOPE

Experiment snapshots, activation runtime, state transitions, attribution/measurement calculations, SEO/GEO/GA4 provider calls, CRUD/UI, publication, credentials/accounts, paid actions, production behavior, and Accepted ADR or product-scope changes.

## APPROVED COMMANDS

Use only task-scoped safe commands: `corepack pnpm run db:generate`, `corepack pnpm run db:migrate:local`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, or invoke external/publishing/paid behavior.

## DELIVERY

Write `control/tasks/T129-M1-EXPERIMENT-CORE-SCHEMA/DELIVERY.md` with field/enum/JSON reconciliation, Project relation and delete decisions, migration IDs, exact gate exits, scope/security declaration, changed files, and final Git status; then stop.
