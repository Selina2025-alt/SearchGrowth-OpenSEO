# TASK — T140-M2-GEO-OBSERVATION-PARSE-RECORDER-REPOSITORY

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Implement one small, credential-free persistence port and repository for an accepted versioned `GeoObservationParse` fact. It must turn one validated parse fact into exactly one append-only `geo_observation_parses` insert using the accepted schema. It must not parse provider evidence or implement a reparse workflow.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §7; `07_GEO_MEASUREMENT_SPEC.md` §5; `21_TEST_ACCEPTANCE_PLAN.md` §3; Accepted `docs/adr/ADR-005-versioned-geo-parse.md`; accepted T106/T107 schema, migration, parity, and tests; accepted T138 fresh-sampling port only for port-shape conventions; accepted T139 recorder/repository only for repository/testing conventions; and directly relevant existing repository patterns.

## IN SCOPE

1. Add a narrow server-side `GeoObservationParseRecorder` port and typed fact contract, plus an idiomatic repository adapter. The adapter must map exactly one supplied fact to exactly one insert in the accepted `geo_observation_parses` table: `id`, `projectId`, `runId`, `parserVersion`, `parseStatus`, nullable `accuracyStatus`, `parsedAt`, and `isCurrent`. Preserve the existing `created_at` default. Do not add a migration, schema field, enum, snapshot, or dependency.
2. Validate the storage-relevant runtime boundary before insert. Reuse the accepted Zod parse-status and accuracy-status contracts; reject unsupported, case-mismatched, empty, or otherwise invalid status values. Require `isCurrent` to be a boolean. Do not normalize, infer, or silently substitute a status, accuracy value, timestamp, Project, run, parser version, or current marker.
3. Preserve versioned append-only semantics: no update, upsert, dedupe, retry, delete, current-pointer selection, or lifecycle transition. Let storage surface duplicate `(run_id, parser_version)` and same-Project/dangling run FK failures. A v1 and v2 fact for the same raw run must persist as independent parse rows. The adapter must not modify the raw run or write mention/citation rows.
4. Add focused repository tests against the accepted local storage contract with minimal valid parent fixtures. Cover faithful valid persistence; `SUCCESS`/`PARTIAL`/`FAILED` plus nullable/present accuracy mapping; v1/v2 coexistence; duplicate-version propagation; same-Project/dangling run rejection; raw-run unchanged after parse recording; invalid parse/accuracy enum rejection before any row; invalid `isCurrent` rejection before any row; and no update/upsert path. Retain dual-dialect parity evidence without a migration.
5. No parser implementation, raw-response inspection, entity/citation extraction, recommendation/sentiment/accuracy computation, current-pointer workflow, provider call, cache access, batch orchestration, workflow, UI, CRUD/server function, credentials, publishing, paid action, or production behavior.
6. Run focused tests, `format:check`, `types:check`, `lint`, full `test`, `build`, and `ci:check`, recording exact exits. If an aggregate gate is sandbox-denied, record it once and stop without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only: `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, invoke a real provider, access credentials/accounts, access Prompt Explorer/R2/application-cache, or invoke publishing/paid behavior.

## ACCEPTANCE CRITERIA

- [ ] One typed port/fact and one repository adapter persist exactly one immutable versioned parse row per accepted fact, with every accepted column faithfully mapped and no synthesized value except the database `created_at` default.
- [ ] Parse and accuracy status runtime validation reuses the accepted canonical Zod enums; invalid enum values and non-boolean `isCurrent` reject before INSERT.
- [ ] v1/v2 coexist; duplicate `(run_id, parser_version)` and same-Project/dangling parent failures surface; no raw run, parse, mention, or citation is modified or otherwise written.
- [ ] Focused real-storage tests demonstrate the mapping and all listed invariants. Existing dual-dialect schema parity remains green; no migration is created.
- [ ] No parser/runtime/provider/cache/workflow/UI/CRUD/credential/publishing/production behavior, dependency, schema, migration, snapshot, or Accepted ADR/scope change occurs.
- [ ] DELIVERY contains fact-to-storage mapping, validation behavior, append-only/error evidence, exact gate exits, focused/full test summaries, changed paths, security/scope declaration, and final git status.

## DELIVERY

Write `control/tasks/T140-M2-GEO-OBSERVATION-PARSE-RECORDER-REPOSITORY/DELIVERY.md` with the required evidence, then stop.
