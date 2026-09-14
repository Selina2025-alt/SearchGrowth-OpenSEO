# TASK — T137-M1-INDEXING-OBSERVATION-PUBLICATION-RECEIPT-RELATION

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add only the optional, normalized same-Project `IndexingObservation → PublicationReceipt` relation and matching domain-contract evolution. This is a credential-free schema slice; it must not collect indexing data, verify publication, resolve URLs, execute publishing, contact an external system, or create credential/account/connector behavior.

## READ ONLY

Read `CLAUDE.md`; relevant IndexingObservation and PublicationReceipt portions of `05_DOMAIN_DATA_MODEL.md`, `21_TEST_ACCEPTANCE_PLAN.md` §25, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`; accepted T128 IndexingObservation and T136 PublicationReceipt/GeoCitation patterns; legacy `indexing_observations` reference artifacts; and direct schema/migration/test files.

## IN SCOPE

1. Add the nullable `publication_receipt_id` field to the existing D1/SQLite and PostgreSQL `indexing_observations` schema and matching Zod/domain contract. It is an optional evidence relation only; NULL means the observation is not associated with a controlled publication receipt.
2. Enforce same-Project integrity at the database boundary with the nullable Project-leading composite FK `(project_id, publication_receipt_id) -> publication_receipts(project_id, id)`. Reuse the existing T136 receipt `(project_id, id)` referential parent index. Choose, document, and test an equivalent delete behavior that preserves append-only indexing-observation evidence; do not introduce business uniqueness.
3. Use new forward D1 `0083` and PostgreSQL `0061` migrations with matching journals/snapshots. Do not modify accepted historical migrations. For SQLite, use a correct forward rebuild if it is required to add the FK.
4. Add migration-backed tests for same-Project persistence, NULL relation, cross-Project and dangling receipt rejection, chosen receipt-delete behavior, whole-Project teardown, exact column shape, and dual-dialect parity. Update focused domain tests for the nullable field.
5. Do not add receipt verification, receipt-to-citation matching, URL identity/normalization, indexing collection runtime, GSC/provider calls, polling, retry, scoring, CRUD/UI, publishing, credentials/accounts, paid actions, or production behavior.
6. Run clean dual-dialect `corepack pnpm run db:generate`, local migration, focused/full tests, format, types, lint, build, and `ci:check`, recording exact exits. If an aggregate gate is sandbox-denied, record it once and stop without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only: `corepack pnpm run db:generate`, `corepack pnpm run db:migrate:local`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, or invoke external/publishing/paid behavior.

## DELIVERY

Write `control/tasks/T137-M1-INDEXING-OBSERVATION-PUBLICATION-RECEIPT-RELATION/DELIVERY.md` with relation/delete reconciliation, migration IDs, exact gate exits, scope/security declaration, changed files, and final Git status; then stop.