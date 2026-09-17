# TASK — T158-M2-GEO-BATCH-REPEAT-FRACTION-CONTEXT-SERVICE

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one narrow server-side read service that composes accepted T157 batch cohort
context with accepted T153 exact repeat-fraction presentation. It reports how
many stored observations in one coherent Project/batch context have status
SUCCEEDED against the caller-supplied V1.0 repeat request (3 or 5), retaining
T157's ordered rows, members, and five-field context unchanged.

## READ ONLY

Read CLAUDE.md; 07_GEO_MEASUREMENT_SPEC.md sections 1–4 and 7; accepted
ADR-003 and ADR-005; accepted T138, T151–T157 contracts; and direct local
service/test patterns. Do not reread the complete baseline, unrelated ADRs,
M0.5 materials, UI code, or publishing code.

## IN SCOPE

1. Add one server-side service accepting projectId, batchId, and
   requestedRepeatCount. Call accepted T157 exactly once with projectId/batchId.
   Count only its returned rows whose stored status is exactly SUCCEEDED. Call
   accepted T153 exactly once with that completed count and the caller's
   requestedRepeatCount. Return only T157 rows, members, context, and T153's
   exact display object.
2. Do not interpret a non-SUCCEEDED row beyond excluding it from the completed
   count. Do not declare a batch complete/partial, retry anything, change a run
   status, filter or deduplicate returned rows, derive a rate/percentage/metric
   or confidence, select another batch, or add a database query. The caller's
   requested repeat value remains T153's 3-or-5 runtime contract.
3. Propagate T157 selector/storage/cohort errors and T153 request validation
   errors unchanged. No catch, fallback, default, mutation, coercion, or
   normalization. Preserve ordered immutable rows and raw evidence by identity.
4. Add focused tests using the real local storage path and minimum valid
   parents: Project/batch isolation; deterministic row order and untouched
   evidence; exact SUCCEEDED-only count for all-success, mixed, and no-success
   batches; requested 3 and 5; unsupported/invalid requested counts; empty
   batch and T157 failure propagation; and a static boundary test proving only
   T157/T153 dependency calls with no direct DB/write/provider/cache/parser/
   aggregation/metric behavior. Test that non-SUCCEEDED rows remain present in
   rows and members rather than disappearing.
5. No schema/migration/snapshot/dependency change; no write, provider,
   credential, cache, workflow, parser, UI, server function, publishing, paid
   action, or production behavior.
6. Run focused tests plus format:check, types:check, lint, full test, build,
   and ci:check with exact exits. If an aggregate gate is sandbox-denied, record
   it once and stop without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only: corepack pnpm install --frozen-lockfile, corepack pnpm exec vitest
run <files>, corepack pnpm exec prettier --write <task-files>, corepack pnpm
format:check, corepack pnpm types:check, corepack pnpm lint, corepack pnpm
test, corepack pnpm build, corepack pnpm ci:check, and read-only git status,
git diff, git log, git show, git rev-parse, git ls-files.

Do not use dangerously-skip-permissions, commit, merge, push, touch main,
access production, invoke a provider, access credentials/accounts, access
Prompt Explorer/R2/application-cache, or invoke publishing/paid behavior.

## ACCEPTANCE CRITERIA

- [ ] The service makes one Project+batch T157 read and one T153 presentation,
  returning the exact T157 assembly plus the exact T153 display.
- [ ] Only stored SUCCEEDED rows are counted; all rows remain intact and no
  completion/partial, retry, aggregation, metric, rate, percentage, or
  confidence meaning is introduced.
- [ ] T157 and T153 failures propagate without fallback, cross-Project access,
  duplicated validation, or evidence mutation.
- [ ] Focused tests cover real composition, isolation, exact successful-count
  behavior, request validation, deterministic propagation, evidence
  non-mutation, and source boundary.
- [ ] DELIVERY contains exact gate exits, focused/full-test summaries, changed
  paths, scope/security declaration, and final git status.

## DELIVERY

Write control/tasks/T158-M2-GEO-BATCH-REPEAT-FRACTION-CONTEXT-SERVICE/DELIVERY.md
with the required evidence, then stop.
