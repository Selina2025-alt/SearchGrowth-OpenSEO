# TASK T106-M1-GEO-OBSERVATION-PARSE-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, append-only `GeoObservationParse` persistence and domain-contract foundation for V1.0. This task creates immutable, versioned parse records that reference an already stored raw `GeoObservationRun`. It must not implement a parser, reparse workflow, current-pointer behavior, metrics, entity/citation extraction, or any provider action.

## REQUIREMENT REFERENCES

Read root `CLAUDE.md` and only these directly relevant sources:

- `05_DOMAIN_DATA_MODEL.md` section 7 GeoObservationParse
- `20_DATABASE_SCHEMA_GUIDE.md` sections 1, 2, 3, and 4
- `21_TEST_ACCEPTANCE_PLAN.md` section 6 Raw/Parse Immutability
- `29_SCOPE_LOCK.md`
- `30_TRACEABILITY_MATRIX.md` row for Parser upgrade
- `docs/adr/ADR-005-versioned-geo-parse.md`
- `schemas/domain-types.ts` GeoObservationParse references
- `schemas/migrations-reference.sql` `geo_observation_parses` references
- accepted T104–T105 dual-dialect schema, migration, parity, and test patterns

## ENGINEER LOOP

Own `inspect → modify → test → inspect failure → fix → retest → DELIVERY`. Do not run environment, shell/path, version, package, or repository-wide discovery diagnostics. Work directly from the cited files and existing schema patterns. Diagnose and repair task-local failures before returning.

## IN SCOPE

1. Add a normalized `geo_observation_parses` table in both SQLite/D1 and PostgreSQL for the direct V1.0 fields: `id`, `run_id`, `parser_version`, `parse_status`, `accuracy_status`, `parsed_at`, and `is_current`, plus an append-only `created_at` system timestamp.
2. Keep parse records append-only: no `updated_at`, update API, repository, service, workflow, or mutation behavior. A parser upgrade creates another row; versioned records may coexist for one run. Do not implement a current-pointer mutation or claim a DB trigger provides stronger immutability unless it is generated and migration-tested.
3. Use explicit typed columns and a Zod/domain boundary. The existing `GeoObservationParse` unions are canonical: `parse_status` exactly `SUCCESS | PARTIAL | FAILED`; `accuracy_status` exactly `ACCURATE | PARTIAL | INACCURATE | UNKNOWN` when present. Reject unsupported, case-mismatched, and empty values at the runtime boundary. `is_current` is a required typed boolean with a documented storage default; pointer selection is later behavior.
4. Database-enforce the FK `run_id → geo_observation_runs(id)` and select/document delete behavior that cannot leave a dangling parse. Add the reference-defined version identity rule `(run_id, parser_version)` only. It must permit v1/v2 coexistence and reject a duplicate version of the same raw run. Do not add a global or current-pointer uniqueness rule.
5. Reconcile source views explicitly. `05_DOMAIN_DATA_MODEL.md` section 7 is the direct field contract. The migration reference/domain type include `parser_model`, recommendation fields, and `parsed_json`; do not ship any of them unless a direct cited V1.0 contract requires it. In particular do not encode parsed entities, citations, or relationship data in JSON/text: later normalized GeoEntityMention/GeoCitation tasks own that data.
6. Add focused migration-backed tests for valid parse persistence; Zod enum rejection; same raw run v1/v2 coexistence; duplicate `(run_id, parser_version)` rejection; raw run unchanged while multiple parses exist; parse deletion behavior; append-only schema shape; and dual-dialect parity. Tests may use fixtures only and must make no provider call.
7. Add forward migrations and metadata using next identifiers after accepted T105 (D1 `0051`, PostgreSQL `0029`), extend schema parity/barrel exports as necessary, rerun local D1 migration, and finish with dual-dialect `db:generate` producing no additional migration.

## OUT OF SCOPE

- Parser implementation, model calls, reparse/current-pointer workflow, update/delete operations, entity mentions, citations, recommendation logic, parsed JSON, metrics, confidence, sampling, provider adapters/network calls, credentials, cache, scheduler, polling, UI, CRUD/repository/service/server functions, APIs/forms.
- Prompt generation, SearchGrowthTarget, opportunity, claims, content, media, release/distribution, experiments, audit/runtime controls, connectors, remote migration, deployment, publishing, or paid action.
- Dependency/lockfile change, broad refactor, infrastructure, Accepted ADR/scope change, or production action.

## ARCHITECTURE AND DATA RULES

- `05_DOMAIN_DATA_MODEL.md` section 7 is the direct V1.0 field contract. Explain every retention/omission from `schemas/domain-types.ts` and the migration reference in DELIVERY.
- The parse is distinct from raw observation: `run_id` references the immutable run; it never stores or updates raw payload fields. Two parser versions for the same run are two records, satisfying ADR-005 and acceptance-plan v1/v2 coexistence.
- `is_current` persists a current-marker fact/default only. Selecting or switching the pointer requires later workflow logic; do not introduce a partial unique index or update behavior in this schema slice.
- SQLite/D1 and Postgres expose equivalent fields, nullability, defaults, enums, relationships, indexes, version uniqueness, and delete behavior.
- Parsed entities, citations, and relationships must not be represented in JSON/text. No field from an unapproved data model is invented.

## ACCEPTANCE CRITERIA

- [ ] Both dialects define logically equivalent `geo_observation_parses` storage with only the direct/reconciled V1.0 fields.
- [ ] The record is append-only by schema/contract shape; raw runs remain separate and unmodified while parse versions coexist.
- [ ] Parse-status and optional accuracy-status values are explicit at the Zod/domain boundary; unsupported/case-mismatched/empty values are rejected; `is_current` is a required boolean with a documented default.
- [ ] The run FK and `(run_id, parser_version)` uniqueness are migration-backed and tested: duplicate version rejected, v1/v2 coexist, and delete behavior cannot leave dangling parses.
- [ ] No parser-model/recommendation/parsed-JSON field, parser/current-pointer behavior, entity/citation data, provider/network work, or relationship-in-JSON encoding is introduced.
- [ ] Forward migrations/snapshots use `0051`/`0029`, local D1 migration succeeds, schema parity passes, and final dual-dialect `db:generate` produces no additional migration.
- [ ] No dependency/lockfile, Accepted ADR/scope, credential, external request, or production change occurs.
- [ ] DELIVERY maps every changed path, field reconciliation, invariant, test, command result, limitation, security note, and final Git diff/status.

## APPROVED COMMANDS

Save concise sanitized evidence under `control/tasks/T106-M1-GEO-OBSERVATION-PARSE-SCHEMA/evidence/round-1/`:

1. `node --version`
2. `corepack pnpm --version`
3. `corepack pnpm install --frozen-lockfile` once in the isolated worktree; manifests/lockfile must remain unchanged
4. `corepack pnpm exec prettier --write <only task-touched source/test files>`
5. `corepack pnpm run db:migrate:local`
6. `corepack pnpm run db:generate`
7. `corepack pnpm exec vitest run <focused geo-parse/schema-parity files>`
8. `corepack pnpm format:check`
9. `corepack pnpm types:check`
10. `corepack pnpm lint`
11. `corepack pnpm test`
12. `corepack pnpm build`
13. `corepack pnpm ci:check`
14. Read-only Git inspection: `git status`, `git rev-parse`, `git diff`, `git log`, `git show`, `git ls-files`.

Do not add/update packages, use unlisted commands, use `--dangerously-skip-permissions`, commit, merge, or touch `main`.

## DELIVERY

Write `control/tasks/T106-M1-GEO-OBSERVATION-PARSE-SCHEMA/DELIVERY.md` using the repository template. Include field/relationship inventory, source reconciliation, append-only/version boundary, enum/default decisions, migration identifiers, exact command exits/summaries, limitations, security notes, and final Git diff/status. Do not edit `REVIEW.md` or begin another task.
