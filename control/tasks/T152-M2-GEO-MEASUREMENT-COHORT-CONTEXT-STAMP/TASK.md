# TASK — T152-M2-GEO-MEASUREMENT-COHORT-CONTEXT-STAMP

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add a small pure composition service that consumes the accepted T151 cohort
guard and returns an explicit, collision-free structured context stamp for the
validated cohort. Do not create a concatenated/hash identity or any metric.

## IN SCOPE

1. Receive T151 measurement members; call its guard once; return the original
   validated member list plus a structured context containing exactly projectId,
   marketProfileId, surfaceType, model, and modelVersion copied from the
   validated baseline. The context is structured fields, never a joined string,
   hash, JSON identity, normalization, or generated id.
2. Propagate T151 errors unchanged. Do not revalidate, filter, sort, dedupe,
   transform, mutate, query, aggregate, count, calculate confidence, create
   rate/metric, attach prompt/language/window/parser data, or access storage.
3. Add focused tests for context mapping, member/context identity preservation,
   all T151 invalid/mismatch propagation, deterministic repeated calls, source
   boundary, and no collision-prone serialized key. No schema/migration/dependency.
4. Run focused tests and format/types/lint/full test/build/ci:check, record exits,
   write DELIVERY, and stop. If an aggregate gate is sandbox-denied, record once.

## APPROVED COMMANDS

Use only task-scoped corepack pnpm install, vitest, prettier write/check,
format:check, types:check, lint, test, build, ci:check, and read-only git
status/diff/log/show/rev-parse/ls-files. Do not commit, merge, push, touch main,
use dangerous permission bypass, call providers, access credentials, or publish.

## ACCEPTANCE CRITERIA

- [ ] T151 is called exactly once and its validated cohort identity becomes an
  explicit structured context with no loss, collision, or transformation.
- [ ] Errors propagate and no metric, aggregation, persistence, provider/cache,
  parser, credential, publishing, or unrelated behavior is added.
- [ ] Tests and required gate evidence are recorded in DELIVERY.

## DELIVERY

Write `control/tasks/T152-M2-GEO-MEASUREMENT-COHORT-CONTEXT-STAMP/DELIVERY.md` and stop.
