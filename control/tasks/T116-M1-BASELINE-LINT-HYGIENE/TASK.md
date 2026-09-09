# TASK T116-M1-BASELINE-LINT-HYGIENE

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain — integration quality maintenance
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Repair the two proven pre-existing integration-baseline lint findings that block final acceptance of frozen T115. This is maintenance only; it changes no Search Growth domain contract or product behavior.

## READ ONLY

Read `CLAUDE.md`, this TASK, the T115 REVIEW finding, and only these direct files:

- `src/types/schemas/claim.ts`
- `src/db/claims.test.ts`

Do not explore unrelated source, reread the full PRD/ADR corpus, or inspect the frozen T115 implementation.

## IN SCOPE

1. In `src/types/schemas/claim.ts`, make only the imports that are used solely as TypeScript types type-only, preserving every runtime import and exported contract.
2. In `src/db/claims.test.ts`, remove only the unused `SOURCE_REF_COLUMN_INSERT` declaration.
3. Preserve semantics, runtime output, domain validation, schema, migration, test cases, and test assertions exactly.
4. Run task-file formatting, focused validation for the two files, `corepack pnpm lint`, and read-only Git inspection. `corepack pnpm lint` must exit 0.
5. Write `control/tasks/T116-M1-BASELINE-LINT-HYGIENE/DELIVERY.md` with changed files, exact commands and exits, proof that no other implementation files changed, and scope/security declaration.

## OUT OF SCOPE

Any schema, migration, test-behavior, domain-contract, dependency, connector, publishing, credential, external API, UI, production, paid, ADR, or scope change. Do not touch T115 files or alter its implementation.

## APPROVED COMMANDS

Use only: task-file Prettier, focused `corepack pnpm exec oxlint` for the two named files, `corepack pnpm lint`, optionally focused `corepack pnpm exec vitest run src/db/claims.test.ts`, and read-only `git status`, `git diff`, `git diff --check`, `git show`, and `git log`. Do not use `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Run the bounded cycle: inspect the two files → make only the two mechanical fixes → format → focused validation → lint → inspect → DELIVERY. If the executor sandbox denies the aggregate lint command, report that exact denial once and stop; do not retry or bypass it.
