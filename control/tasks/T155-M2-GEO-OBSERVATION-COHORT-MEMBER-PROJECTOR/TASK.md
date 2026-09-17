# TASK — T155-M2-GEO-OBSERVATION-COHORT-MEMBER-PROJECTOR

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one small pure projection boundary from accepted immutable GEO observation
run rows to the accepted T151 cohort-member identity contract. It must preserve
the input row order, make no measurement, and fail before a cohort is exposed
when a stored row lacks the explicit market/model-version identity a compatible
metric cohort requires.

## READ ONLY

Read CLAUDE.md; 07_GEO_MEASUREMENT_SPEC.md sections 1–4 and 7; accepted
ADR-003 and ADR-005; accepted T138 fresh-sampling contract; T151 identity
guard; T152 context stamp; T154 batch reader; and local service/test patterns.
Do not reread the complete baseline, unrelated ADRs, M0.5 materials, UI code,
or publishing code.

## IN SCOPE

1. Add one storage-free projection service accepting a caller-supplied readonly
   list of accepted GeoObservationRun rows. Return the original row list by
   identity alongside cohort members whose values are copied directly from id,
   projectId, marketProfileId, surfaceType, model, and modelVersion.
2. A cohort member requires a non-empty marketProfileId and modelVersion. If
   either stored nullable column is null, absent, blank, or otherwise unusable,
   reject with a typed error naming the row index and field before returning any
   projection. Never invent, default, derive, trim, normalize, or substitute
   those values.
3. Hand the projected members once to the accepted T151 guard and propagate its
   typed error unchanged. This proves every projected member has one compatible
   Project, market profile, supported surface, model, and model version. Do not
   filter, sort, dedupe, select a batch, query storage, count rows, decide
   completion, calculate fractions/metrics/confidence, or attach raw evidence.
4. Add focused tests for ordered direct projection, original row-array identity,
   all missing market/model-version cases, malformed/untrusted rows, T151
   surface and cross-context failures, unchanged error propagation, repeated
   deterministic calls/non-mutation, and source boundary proving no database,
   reader, provider, parser, raw evidence, aggregation, or metric behavior.
5. No schema/migration/snapshot/dependency change; no storage query/write,
   provider, credential, cache, workflow, parser, UI, server function,
   publishing, paid action, or production behavior.
6. Run focused tests plus format:check, types:check, lint, full test, build,
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

- [ ] Valid immutable rows project in the same order to members accepted once
  by T151, with the original row-list identity preserved.
- [ ] Missing or unusable market/model-version identity rejects explicitly;
  no default, partial, mutated, filtered, or cross-context projection escapes.
- [ ] No storage, reader, provider, cache, parser, raw-evidence, aggregation,
  fraction/metric/confidence, credential, publishing, or unrelated scope is
  added.
- [ ] Focused tests cover direct mapping, error propagation, identity/isolation,
  invalid fields, deterministic behavior, and source boundary.
- [ ] DELIVERY contains exact gate exits, focused/full-test summaries, changed
  paths, scope/security declaration, and final git status.

## DELIVERY

Write control/tasks/T155-M2-GEO-OBSERVATION-COHORT-MEMBER-PROJECTOR/DELIVERY.md
with the required evidence, then stop.
