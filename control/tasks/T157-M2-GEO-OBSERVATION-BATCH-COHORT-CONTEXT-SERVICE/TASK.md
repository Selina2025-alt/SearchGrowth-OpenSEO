# TASK — T157-M2-GEO-OBSERVATION-BATCH-COHORT-CONTEXT-SERVICE

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one narrow server-side read service that composes the accepted T154
Project-scoped batch reader and T156 cohort-context assembler. It returns one
read batch's immutable rows, validated members, and structured context; it does
not aggregate, count, decide completeness, or calculate a measurement.

## READ ONLY

Read CLAUDE.md; 07_GEO_MEASUREMENT_SPEC.md sections 1–4 and 7; accepted
ADR-003 and ADR-005; accepted T151, T152, T154, T155, and T156 contracts; and
direct local repository/service/query-test patterns. Do not reread the complete
baseline, unrelated ADRs, M0.5 materials, UI code, or publishing code.

## IN SCOPE

1. Add one server-side service accepting projectId and batchId. Call the
   accepted T154 reader exactly once with those selectors, then call T156
   exactly once with the returned rows. Return only T156's rows, members, and
   context. Never issue an independent database query or a batch-only lookup.
2. Propagate selector, database, projector, T151, and T152 errors unchanged.
   Do not catch, wrap, default, mutate, sort, filter, deduplicate, select
   another batch, attach raw evidence, count observations, decide partial or
   complete status, calculate a repeat fraction, metric, rate, or confidence,
   or add prompt/language/window/parser fields.
3. Add focused tests using the actual local storage path and minimum valid
   parents: Project/batch isolation travels through the service; deterministic
   reader order reaches the assembled members; exact five-field context is
   returned; empty batch propagates T151 error; invalid selector and database
   failure propagate rather than becoming an empty result; malformed stored
   model/market/model-version propagates the owning accepted boundary; and
   reads do not mutate rows/evidence. Add a static source-boundary test proving
   exactly the two accepted dependencies and no direct DB/write/provider/cache/
   parser/metric behavior.
4. No schema/migration/snapshot/dependency change; no write, provider,
   credential, cache, workflow, parser, UI, server function, publishing, paid
   action, or production behavior.
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

- [ ] The service makes one Project+batch read through T154 and one assembly
  through T156, returning only their immutable ordered data and context.
- [ ] Selector/database/cohort errors propagate without fallback, partial
  result, cross-Project access, duplicated validation, or metric semantics.
- [ ] No direct query/write, provider, cache, parser, evidence transformation,
  aggregation, fraction/metric/confidence, credential, publishing, or unrelated
  scope is added.
- [ ] Focused tests cover real read composition, isolation, deterministic
  propagation, evidence non-mutation, and source boundary.
- [ ] DELIVERY contains exact gate exits, focused/full-test summaries, changed
  paths, scope/security declaration, and final git status.

## DELIVERY

Write control/tasks/T157-M2-GEO-OBSERVATION-BATCH-COHORT-CONTEXT-SERVICE/DELIVERY.md
with the required evidence, then stop.
