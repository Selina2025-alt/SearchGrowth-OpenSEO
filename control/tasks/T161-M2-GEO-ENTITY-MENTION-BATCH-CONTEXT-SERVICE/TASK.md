# TASK — T161-M2-GEO-ENTITY-MENTION-BATCH-CONTEXT-SERVICE

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one narrow server-side read service that composes accepted T157 Project/batch
cohort context with accepted T159 version-explicit entity-mention evidence. It
returns one batch's immutable ordered run context plus the selected tracked
entity's persisted mentions, without counting, deduplicating, matching, or
calculating a mention rate.

## READ ONLY

Read CLAUDE.md; 07_GEO_MEASUREMENT_SPEC.md sections 1–5 and 7; accepted
ADR-003 and ADR-005; accepted T141, T144–T148, T151–T159 contracts; and direct
local service/repository test patterns. Do not reread the complete baseline,
unrelated ADRs, M0.5 materials, UI code, or publishing code.

## IN SCOPE

1. Add one service accepting projectId, batchId, entityId, and parserVersion.
   Call T157 exactly once with projectId/batchId, then call T159 exactly once
   with all four selectors. Return only T157 rows, members, context, and T159
   ordered mention evidence. Do not query storage directly.
2. Verify every T159 mention's runId is present in the T157 rows and its parseId
   is non-empty. If evidence is inconsistent, reject with a typed service error
   naming the mention index and reference field. This is an integrity boundary,
   not a filter: do not remove, sort, deduplicate, repair, or otherwise alter
   rows or mentions. T157/T159 errors propagate unchanged.
3. Do not infer entity matches, choose aliases/parser versions, decide batch
   completion, interpret true/false verdicts, count mention occurrences,
   calculate a rate/fraction/metric/confidence, or access raw payload fields.
   No write, provider/cache/parser runtime, workflow, UI, credential, publishing,
   paid, or production behavior.
4. Add focused tests using real local storage and the production T157/T159 path:
   Project/batch/entity/parser-version isolation; exact ordered context and
   mention propagation; true/false mention preservation; valid empty mentions;
   T157 empty/selector/storage failure propagation; T159 selector/storage
   failure propagation; service detection of impossible runId/parseId evidence
   through a narrow injected collaborator seam; raw evidence and inputs remain
   unmodified; and static source boundary proving only T157/T159 dependencies
   with no direct database/write/provider/cache/matching/metric behavior.
5. No schema/migration/snapshot/dependency change. Run focused tests plus
   format:check, types:check, lint, full test, build, and ci:check with exact
   exits. If an aggregate gate is sandbox-denied, record it once and stop without
   bypass. Write DELIVERY and stop.

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

- [ ] The service calls T157 once and T159 once with opaque selectors, returning
  their ordered immutable data without a direct query or added measurement rule.
- [ ] Mention run provenance is checked against the T157 batch rows; invalid
  parent evidence rejects rather than being omitted, repaired, or mixed.
- [ ] T157/T159 errors propagate unchanged; true/false verdicts, context,
  evidence, ordering, and valid empty mentions remain unaltered.
- [ ] Focused tests cover real composition, isolation, provenance integrity,
  valid empties, failure propagation, non-mutation, and source boundary.
- [ ] DELIVERY contains exact gate exits, focused/full-test summaries, changed
  paths, scope/security declaration, and final git status.

## DELIVERY

Write control/tasks/T161-M2-GEO-ENTITY-MENTION-BATCH-CONTEXT-SERVICE/DELIVERY.md
with the required evidence, then stop.
