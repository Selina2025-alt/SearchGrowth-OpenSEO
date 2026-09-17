# TASK — T154-M2-GEO-OBSERVATION-BATCH-READER

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one narrowly scoped, credential-free read repository for the accepted
fresh-sampling batch. It must read only one Project-scoped batch of immutable
GEO observation runs in a deterministic order; it must not aggregate, count,
classify, parse, mutate, or initiate sampling.

## READ ONLY

Read CLAUDE.md; 07_GEO_MEASUREMENT_SPEC.md sections 1–3 and 7; accepted
ADR-003 and ADR-005; accepted T105 schema/migration evidence; accepted T138
fresh sampling contract; accepted T139 recorder repository; and direct local
repository/query-test patterns. Do not reread the complete baseline, unrelated
ADRs, M0.5 materials, UI code, or publishing code.

## IN SCOPE

1. Add one server-side read repository/module that accepts exactly a non-empty
   projectId and batchId, validates the untrusted request boundary, and selects
   only geo_observation_runs whose Project and batch both match. A batch-only
   lookup is forbidden. Propagate database failures; never turn a failed query
   into an empty result.
2. Return immutable run rows as read data in deterministic repeatIndex then id
   order. Preserve the stored raw response and all provenance fields as
   database values; do not parse, normalize, serialize, reconstruct, redact,
   copy into a new evidence format, or update any row.
3. Keep the reader strictly read-only. No insert, update, delete, upsert,
   cache, provider, scheduler, parser, mention/citation extraction, cohort
   selection, repeat counting, fraction/metric/confidence calculation, UI, or
   server function. It does not decide whether a batch is complete or whether
   its rows form a compatible metric cohort.
4. Add focused query tests using actual local storage and minimum parents:
   same-Project batch rows returned in repeatIndex/id order; another batch
   excluded; another Project excluded even when it uses the same batch id;
   empty matching batch returns an empty list; invalid selector rejects before
   query; raw response/provenance remain exactly stored; read does not mutate
   rows; and database failure propagation is not converted to empty output.
5. No schema/migration/snapshot/dependency change and no real provider,
   credentials, Prompt Explorer/R2/cache access, production action, publishing,
   paid behavior, metric aggregation, or workflow.
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
access production, invoke a real provider, access credentials/accounts, access
Prompt Explorer/R2/application-cache, or invoke publishing/paid behavior.

## ACCEPTANCE CRITERIA

- [ ] The reader validates both selector fields and returns only rows matching
  both Project and batch in deterministic order.
- [ ] Reading preserves stored raw evidence/provenance and cannot mutate it,
  add metric/cohort meaning, or hide a database failure.
- [ ] Focused tests cover Project/batch isolation, order, invalid selector,
  empty result, evidence preservation, and failure propagation.
- [ ] No schema, migration, dependency, provider, cache, parser, metric,
  credential, publishing, or unrelated runtime scope is added.
- [ ] DELIVERY contains exact gate exits, focused/full-test summaries, changed
  paths, scope/security declaration, and final git status.

## DELIVERY

Write control/tasks/T154-M2-GEO-OBSERVATION-BATCH-READER/DELIVERY.md with the
required evidence, then stop.
