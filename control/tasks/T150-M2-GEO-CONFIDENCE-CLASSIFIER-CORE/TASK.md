# TASK — T150-M2-GEO-CONFIDENCE-CLASSIFIER-CORE

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one small pure domain classifier for the V1.0 GEO confidence thresholds.
It labels a caller-supplied, already-compatible measurement cohort as LOW,
MEDIUM, or HIGH. It does not sample, aggregate observations, select cohorts,
or claim statistical significance.

## READ ONLY

Read `CLAUDE.md`; `07_GEO_MEASUREMENT_SPEC.md` §§1, 3, 4, and 7;
`05_DOMAIN_DATA_MODEL.md` §§2, 5, and 6; Accepted
`docs/adr/ADR-005-versioned-geo-parse.md`; accepted T105/T138 contracts; and
existing domain service/test patterns. Do not reread the complete baseline,
unrelated ADRs, M0.5 materials, or UI code.

## IN SCOPE

1. Add one storage-free classifier contract and implementation with explicit
   caller-supplied cohort summary: `successfulObservationCount`,
   `distinctPromptCount`, and `hasMajorSurfaceOrModelChangeWarning`. It returns
   exactly `LOW`, `MEDIUM`, or `HIGH`.
2. Implement only the frozen Measurement Spec §4 rule:
   - LOW when fewer than 10 successful observations;
   - MEDIUM when at least 10 successful observations and at least 3 distinct
     prompts, unless the HIGH rule applies;
   - HIGH when at least 30 successful observations, at least 5 distinct prompts,
     and no major surface/model change warning;
   - every otherwise-insufficient cohort is LOW. A warning only prevents HIGH;
     it must not erase a valid MEDIUM classification.
3. Validate the untrusted runtime boundary before classifying: input object;
   both counts finite, safe, non-negative integers; warning is boolean. Reject
   invalid inputs with a typed error that identifies the field. Never coerce,
   round, clamp, infer, mutate, or repair caller values.
4. Keep the boundary narrow and deterministic. It must not read a database,
   repository, cache, provider, raw response, parser, current parse, market,
   model, or prompt; it must not count samples, deduplicate prompts, mix
   surfaces/models, produce a numerator/denominator, calculate a percentage or
   confidence interval, or make any significance claim. Cohort selection and
   compatibility remain the caller's responsibility.
5. Add focused tests for all threshold boundaries (9/10/29/30; 2/3/4/5 prompts;
   warning/no-warning); valid MEDIUM under warning; valid HIGH; insufficient
   combinations; deterministic repeated calls; input non-mutation; malformed,
   fractional, unsafe, negative, NaN, Infinity, and non-boolean inputs; typed
   errors; and a source-boundary test proving no storage/provider/cache/raw
   evidence/aggregation/statistical logic.
6. No schema/migration/snapshot/dependency changes; no runtime sampling,
   aggregation, database access, parser, UI, CRUD/server function, credentials,
   publishing, paid action, or production behavior.
7. Run focused tests plus `format:check`, `types:check`, `lint`, full `test`,
   `build`, and `ci:check`, recording exact exits. A worktree bootstrap may use
   `corepack pnpm install --frozen-lockfile` only if dependencies are absent;
   record it and do not change lockfiles. If an aggregate gate is sandbox-denied,
   record it once and stop without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only: `corepack pnpm install --frozen-lockfile`, `corepack pnpm exec vitest
run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack
pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`,
`corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and
read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`,
`git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch
`main`, access production, invoke a provider, access credentials/accounts,
access Prompt Explorer/R2/application-cache, or invoke publishing/paid behavior.

## ACCEPTANCE CRITERIA

- [ ] The exact frozen threshold and warning rules return deterministic LOW,
  MEDIUM, and HIGH labels for every boundary combination.
- [ ] Invalid runtime input rejects explicitly without coercion or mutation.
- [ ] No sampling, aggregation, cohort selection, persistence, provider/cache,
  parser, statistical claim, or unrelated behavior is introduced.
- [ ] Focused tests cover every listed threshold and negative invariant. No
  schema, migration, snapshot, dependency, or unrelated runtime change occurs.
- [ ] DELIVERY contains exact gate exits, focused/full-test summaries, changed
  paths, threshold evidence, scope/security declaration, and final git status.

## DELIVERY

Write `control/tasks/T150-M2-GEO-CONFIDENCE-CLASSIFIER-CORE/DELIVERY.md` with
the required evidence, then stop.
