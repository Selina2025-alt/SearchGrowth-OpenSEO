# TASK — T159-M2-GEO-ENTITY-MENTION-BATCH-READER

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one narrow read-only repository that returns persisted GEO entity-mention
rows for one explicit Project, observation batch, tracked entity, and parser
version. It provides deterministic, version-explicit evidence input for a later
entity-mention measurement without calculating a rate, filtering mention
verdicts, selecting a parser version, or changing evidence.

## READ ONLY

Read CLAUDE.md; 05_DOMAIN_DATA_MODEL.md sections covering GEO run/parse/mention
identity; 07_GEO_MEASUREMENT_SPEC.md sections 1–5 and 7; accepted ADR-003 and
ADR-005; accepted T105–T107, T140–T143, T151, T154, and T157 contracts; and
direct local repository/query-test patterns. Do not reread the complete
baseline, unrelated ADRs, M0.5 materials, UI code, or publishing code.

## IN SCOPE

1. Add one repository read accepting projectId, batchId, entityId, and
   parserVersion. Validate all four runtime selectors as non-empty strings
   before querying. Issue one read joining the accepted GEO observation-run,
   versioned parse, and entity-mention storage relations. Constrain all four
   selectors: Project, run batch, Mention entity, and Parse parser version.
2. Return each matching persisted entity-mention row beside only the concrete
   parent run and parse identifiers necessary to trace it. Preserve storage
   fields and the stored mentioned verdict exactly. Use one explicit,
   dialect-stable deterministic order: run repeatIndex, run id, parse id,
   mention id. Do not select a latest parser version, collapse parser versions,
   infer an entity match, filter false mentions, deduplicate, count, aggregate,
   calculate a fraction/rate/metric/confidence, or access raw payload fields.
3. Fail loudly: invalid selectors and database errors must propagate explicitly;
   an honest empty result is allowed only after a successful scoped query. No
   catch/fallback/default/coercion. Do not read or mutate raw observation,
   parse, mention, entity, alias, or cohort data.
4. Add focused actual-storage tests for Project/batch/entity/parser-version
   isolation; multiple parser versions; true and false verdict preservation;
   deterministic total ordering; empty valid query; invalid selector before
   query; database failure propagation; no raw-evidence/record mutation; and a
   static source-boundary test proving one read and no writes/provider/cache/
   parser selection/metric behavior. Include cross-Project and cross-batch
   decoys that reuse ids where schema permits.
5. No schema/migration/snapshot/dependency change; no write, provider,
   credential, cache, workflow, parser runtime, UI, server function, publishing,
   paid action, or production behavior.
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

- [ ] One scoped read uses all four selectors and returns version-explicit,
  ordered, traceable persisted mention evidence without a parser-current
  fallback.
- [ ] Cross-Project, cross-batch, cross-entity, and cross-parser-version rows
  are excluded; true and false stored verdicts are preserved unchanged.
- [ ] Invalid selectors and read failures cannot become an empty result, and no
  write, raw-evidence access/mutation, parser selection, matching, counting, or
  metric behavior is added.
- [ ] Focused actual-storage tests cover isolation, ordering, empty valid reads,
  error propagation, provenance preservation, non-mutation, and source boundary.
- [ ] DELIVERY contains exact gate exits, focused/full-test summaries, changed
  paths, scope/security declaration, and final git status.

## DELIVERY

Write control/tasks/T159-M2-GEO-ENTITY-MENTION-BATCH-READER/DELIVERY.md with
the required evidence, then stop.
