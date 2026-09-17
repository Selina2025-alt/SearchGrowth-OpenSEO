# TASK — T153-M2-GEO-REPEAT-FRACTION-PRESENTER

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one small, pure presenter for the V1.0 GEO repeat-fraction display
contract. It preserves exact numerator and denominator values and renders a
human-readable fraction such as 2/3; it does not compute or claim a rounded
percentage, rate, metric, confidence, or statistical significance.

## READ ONLY

Read CLAUDE.md; 07_GEO_MEASUREMENT_SPEC.md sections 2–4 and 7;
21_TEST_ACCEPTANCE_PLAN.md sections 3–4; accepted T138 fresh-sampling contract;
T150 confidence classifier; and relevant local service/test patterns. Do not
reread the complete baseline, unrelated ADRs, M0.5 materials, UI code, or
repository implementations.

## IN SCOPE

1. Add one storage-free runtime-validated input contract and pure function for
   a caller-provided repeat fraction. The input has exact completedSampleCount
   and requestedRepeatCount; output preserves both values and returns only exact
   display text formed as completedSampleCount, slash, requestedRepeatCount.
2. Enforce the V1.0 repeat policy at the trust boundary: both values must be
   finite safe non-negative integers; requested repeats must be exactly 3 or 5;
   completed samples must not exceed requested repeats. Reject wrong objects,
   missing/non-number/fractional/unsafe/negative/NaN/infinite values,
   unsupported repeat counts, and completed-greater-than-requested inputs with
   a typed error naming the field. Never coerce, round, clamp, repair, infer,
   mutate, or default caller data.
3. Keep the boundary narrow: do not call a provider, inspect raw evidence,
   parse, query storage, count observations, select cohorts, aggregate,
   calculate a percentage/rate/numerator/denominator, classify confidence,
   make a statistical claim, or add UI/server-function/persistence behavior.
   This task presents caller-supplied exact values only.
4. Add focused tests for 0/3, 2/3, 3/3, 0/5, 5/5; deterministic repeated
   calls and input non-mutation; every invalid boundary described above; typed
   errors; no percentage/rate output; and a source-boundary test proving no
   storage/provider/parser/aggregation/confidence behavior.
5. No schema/migration/snapshot/dependency changes; no sampling loop,
   database access, parser, UI, CRUD/server function, credentials, publishing,
   paid action, or production behavior.
6. Run focused tests plus format:check, types:check, lint, full test, build,
   and ci:check, recording exact exits. A worktree bootstrap may use corepack
   pnpm install --frozen-lockfile only if dependencies are absent; record it and
   do not change lockfiles. If an aggregate gate is sandbox-denied, record it
   once and stop without bypass. Write DELIVERY and stop.

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

- [ ] Valid caller-provided values retain exact completed/requested counts and
  render only the deterministic V1.0 fraction display.
- [ ] All malformed, unsafe, unsupported, or impossible runtime inputs reject
  explicitly without coercion, mutation, or a partial display.
- [ ] No sampling, aggregation, metric/rate/percentage/confidence calculation,
  persistence, provider/cache/parser behavior, or unrelated scope is added.
- [ ] Focused tests cover listed positive, boundary, and negative cases; no
  schema, migration, snapshot, dependency, or unrelated runtime change occurs.
- [ ] DELIVERY records exact gate exits, focused/full-test summaries, changed
  paths, scope/security declaration, and final git status.

## DELIVERY

Write control/tasks/T153-M2-GEO-REPEAT-FRACTION-PRESENTER/DELIVERY.md with the
required evidence, then stop.
