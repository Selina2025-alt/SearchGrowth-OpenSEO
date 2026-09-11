# REVIEW — T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA

## VERDICT

BLOCKED — Round 1 / 3

## VERIFIED

- The D1 `0073` and PostgreSQL `0051` forward migrations, journals, and snapshots describe the same ten-column `indexing_observations` relation. Both dialects have explicit non-null Project ownership, the optional Project-leading MarketProfile composite foreign key, the four-value `SearchEngine` check, JSON validation, and only non-unique read indexes.
- The targeted migration tests cover required fields, engine rejection, JSON validation, same-Project acceptance, cross-Project rejection, and cascade behavior; the focused suites passed 16/16. `db:migrate:local` and dual-dialect `db:generate` exited 0 with no generated drift.
- The Zod contract reuses the source-defined SearchEngine boundary and retains opaque URL, observation type, status, and JSON text. It adds no URL identity, deduplication, receipt link, runtime, external call, credential, publishing, or production behavior.
- `format:check`, `types:check`, `lint`, `build`, and `ci:check` each exited 0. `git diff --check` is clean.

## FINDINGS

### BLOCKER — final full-suite test gate has no passing evidence

- **Location:** `control/tasks/T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA/DELIVERY.md`, command result 7.
- **Requirement:** TASK item 5 requires focused **and full** tests; the acceptance review requires full-test evidence.
- **Evidence:** Two `corepack pnpm test` attempts exited 1. The recorded failures are parallel-load timeouts in server/auth/MCP suites, while the four affected files pass in isolation (38/38) and the T128-focused tests pass (16/16).
- **Expected behavior:** The final unchanged task worktree must have a recorded `corepack pnpm test` exit 0, or a separately accepted repository-level baseline decision must establish an alternative gate. Isolation reruns do not replace the full-suite gate.
- **Reproduction:** Run `corepack pnpm test` in `.ai-worktrees/T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA`.
- **Fix acceptance:** Obtain a final full-suite exit 0 without changing unrelated server/auth/MCP behavior. If a T128-caused defect is demonstrated, limit any code change to that causal defect and rerun the focused tests plus the full suite.

## MERGE DECISION

Do not merge. Dispatch bounded Round 2 only to complete the missing full-suite evidence; T128 schema scope remains frozen.
