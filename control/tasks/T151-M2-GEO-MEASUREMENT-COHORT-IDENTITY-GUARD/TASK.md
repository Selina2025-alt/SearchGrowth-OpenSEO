# TASK — T151-M2-GEO-MEASUREMENT-COHORT-IDENTITY-GUARD

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one small pure guard that verifies caller-supplied GEO measurement members
belong to one explicit, compatible Project/market/surface/model cohort before a
future metric aggregation reads them. It neither queries nor aggregates data.

## READ ONLY

Read `CLAUDE.md`; `07_GEO_MEASUREMENT_SPEC.md` §§1, 4, and 7;
`05_DOMAIN_DATA_MODEL.md` §§2 and 6; accepted T105/T138 run contracts; T150
confidence classifier; and relevant service/test patterns. Do not reread the
complete baseline, unrelated ADRs, M0.5 materials, or UI code.

## IN SCOPE

1. Add one storage-free contract and guard for an ordered non-empty list of
   caller-supplied measurement-member identities. Each member must explicitly
   carry a non-empty run id, project id, market profile id, surface type, model,
   and model version. The guard returns the original member list by identity on
   success; it does not construct a summary or metric.
2. Validate every runtime field before acceptance. Require all six identifiers
   to be non-empty strings. Establish the first member as the cohort baseline;
   each later member must strictly match its project id, market profile id,
   surface type, model, and model version. On the first error throw a typed
   error naming the member index and field; never coerce, normalize, trim,
   mutate, filter, sort, dedupe, repair, or return a partial cohort.
3. Preserve the Spec §1/§7 boundary: different surfaces must never share a
   measurement cohort, and every future metric must retain its explicit market
   and model/version identity. Do not decide whether runs succeeded, count
   samples/prompts, calculate rates/numerators/denominators, classify confidence,
   derive warnings, select a time window, or make a statistical claim.
4. Add focused tests for valid same-cohort identity return and stable order;
   every cross-field mismatch; empty/malformed/blank/non-string member fields;
   empty collection; duplicate members preserved; input non-mutation; no partial
   result; deterministic repeated calls; and source boundary proving no DB,
   repository, provider, cache, raw evidence, parser, aggregation, classifier,
   or statistical logic.
5. No schema/migration/snapshot/dependency changes; no database reads, sampling,
   parser, UI, CRUD/server function, credentials, publishing, paid action, or
   production behavior.
6. Run focused tests plus `format:check`, `types:check`, `lint`, full `test`,
   `build`, and `ci:check`, recording exact exits. If an aggregate gate is
   sandbox-denied, record it once and stop without bypass. Write DELIVERY and
   stop.

## APPROVED COMMANDS

Use only: `corepack pnpm install --frozen-lockfile`, `corepack pnpm exec vitest
run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack
pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`,
`corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and
read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`,
`git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`,
access production, invoke a provider, access credentials/accounts, access
Prompt Explorer/R2/application-cache, or invoke publishing/paid behavior.

## ACCEPTANCE CRITERIA

- [ ] The guard returns only a non-empty identity-consistent cohort and retains
  the original ordered member references.
- [ ] Missing, malformed, empty, or cross-context members reject explicitly
  before any result escapes.
- [ ] No querying, sampling, aggregation, confidence/rate calculation,
  persistence, provider/cache/parser behavior, or unrelated scope is added.
- [ ] Focused tests cover all listed positive, boundary, and negative cases; no
  schema, migration, snapshot, dependency, or unrelated runtime change occurs.
- [ ] DELIVERY records exact gate exits, focused/full-test summaries, changed
  paths, scope/security declaration, and final git status.

## DELIVERY

Write `control/tasks/T151-M2-GEO-MEASUREMENT-COHORT-IDENTITY-GUARD/DELIVERY.md`
with the required evidence, then stop.
