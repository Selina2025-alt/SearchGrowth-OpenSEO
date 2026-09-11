# REVIEW — T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA

## VERDICT

PASS — Round 1 / 3

## VERIFIED

- D1 `0073` and PostgreSQL `0051`, their snapshots, and journals are dual-dialect aligned. The table has explicit non-null Project ownership, an optional Project-leading MarketProfile composite FK, equivalent named SearchEngine and JSON checks, and no business uniqueness rule.
- Migration-backed and domain tests cover required fields, source-defined engine acceptance/rejection, JSON validity, same-Project relation acceptance, cross-Project rejection, nullable MarketProfile, and cascades. Focused suites passed 16/16; `db:migrate:local` and clean dual-dialect `db:generate` passed.
- The contract retains opaque URL, observation type, status, and details JSON; it adds no receipt link, URL identity/dedupe, crawler, external call, credentials, publishing, UI, or production behavior. Point-in-time observation semantics use `created_at` without an update lifecycle.
- Delivery evidence shows `format:check`, `types:check`, `lint`, `build`, and `ci:check` exit 0. `git diff --check` is clean.
- The initial full-suite timeout gate was independently repaired in accepted maintenance task `T128-BASELINE-FULL-TEST-STABILITY`, then Controller reran `corepack pnpm test` in this preserved T128 worktree after syncing only that repair: exit 0, 187 files and 1,729 tests passed.

## FINDINGS

None.

## MERGE DECISION

Merge only `ai-task/T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA` into `integration/ai-v1`.
