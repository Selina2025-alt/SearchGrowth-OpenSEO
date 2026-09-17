# TASK — T156-M2-GEO-OBSERVATION-COHORT-CONTEXT-ASSEMBLER

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one small pure composition service that turns caller-supplied immutable GEO
observation rows into a T151-validated cohort and its accepted T152 structured
context. It does not read storage, choose batches, count samples, or calculate
metrics.

## READ ONLY

Read CLAUDE.md; 07_GEO_MEASUREMENT_SPEC.md sections 1–4 and 7; accepted
ADR-003 and ADR-005; accepted T151 identity guard, T152 context stamp, T154
batch reader, T155 projector; and direct local service/test patterns. Do not
reread the complete baseline, unrelated ADRs, M0.5 materials, UI code, or
publishing code.

## IN SCOPE

1. Add one storage-free service accepting a caller-supplied readonly list of
   GeoObservationRun rows. Call T155 projector exactly once, then pass its
   members to T152 stamp exactly once. Return only the original rows, the
   validated members, and the structured five-field context provided by T152.
2. Preserve all accepted boundaries. Propagate T155 and T152/T151 errors
   unchanged; do not revalidate, catch, wrap, default, mutate, sort, filter,
   deduplicate, query, select a batch, attach raw evidence, count observations,
   decide completion, calculate a repeat fraction, metric, rate, or confidence,
   or add prompt/language/window/parser fields to context.
3. Add focused tests for direct ordered composition, row-list identity,
   exact five-field context, one-call dependency shape, deterministic repeated
   calls/non-mutation, and unchanged propagation of projector-owned missing
   fields and T151-owned malformed model, unsupported surface, and
   cross-context errors. Include source-boundary proof of no storage/reader/
   provider/parser/raw-evidence/metric scope.
4. No schema/migration/snapshot/dependency change; no storage query/write,
   provider, credential, cache, workflow, parser, UI, server function,
   publishing, paid action, or production behavior.
5. Run focused tests plus format:check, types:check, lint, full test, build,
   and ci:check with exact exits. A worktree bootstrap may use corepack pnpm
   install --frozen-lockfile only if dependencies are absent; record it without
   changing lockfiles. If an aggregate gate is sandbox-denied, record it once
   and stop without bypass. Write DELIVERY and stop.

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

- [ ] Valid immutable rows flow through T155 once and T152 once into the
  original ordered rows, members, and exact five-field structured context.
- [ ] T155/T151/T152 errors propagate without defaulting, partial output,
  mutation, cross-context acceptance, or duplicated validation.
- [ ] No storage, reader, provider, cache, parser, raw-evidence, aggregation,
  fraction/metric/confidence, credential, publishing, or unrelated scope is
  added.
- [ ] Focused tests cover composition, context identity, dependency call shape,
  propagation, determinism, and source boundary.
- [ ] DELIVERY contains exact gate exits, focused/full-test summaries, changed
  paths, scope/security declaration, and final git status.

## DELIVERY

Write control/tasks/T156-M2-GEO-OBSERVATION-COHORT-CONTEXT-ASSEMBLER/DELIVERY.md
with the required evidence, then stop.
