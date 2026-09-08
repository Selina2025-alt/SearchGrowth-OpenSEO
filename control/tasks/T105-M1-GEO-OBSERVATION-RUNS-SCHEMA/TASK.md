# TASK T105-M1-GEO-OBSERVATION-RUNS-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, append-only `GeoObservationRun` persistence and domain-contract foundation for V1.0. This is a schema-and-contract slice only. It establishes an immutable record of an observation event; it must not implement observation execution, parsing, metrics, sampling, CRUD, or an external provider.

## REQUIREMENT REFERENCES

Read root `CLAUDE.md` and only these directly relevant sources:

- `05_DOMAIN_DATA_MODEL.md` section 6 GeoObservationRun — Immutable
- `20_DATABASE_SCHEMA_GUIDE.md` sections 1, 2, and 6
- `21_TEST_ACCEPTANCE_PLAN.md` sections 3 and 6
- `29_SCOPE_LOCK.md`
- `30_TRACEABILITY_MATRIX.md` rows for Raw immutable and GEO input
- `docs/adr/ADR-003-fresh-geo-path.md`
- `docs/adr/ADR-005-versioned-geo-parse.md`
- `schemas/domain-types.ts` ObservationSurface / GeoObservationRun references
- `schemas/migrations-reference.sql` `geo_observation_runs` reference
- accepted T100–T104 dual-dialect schema, migration, parity, and test patterns

## ENGINEER LOOP

Own `inspect → modify → test → inspect failure → fix → retest → DELIVERY`. Do not run environment, shell/path, version, package, or repository-wide discovery diagnostics. Work directly from the cited files and existing schema patterns. Diagnose and repair task-local failures before returning.

## IN SCOPE

1. Add a normalized `geo_observation_runs` table in both SQLite/D1 and PostgreSQL. Persist the direct V1.0 observation-fact fields: `id`, `batch_id`, `project_id`, `prompt_id`, `prompt_version`, `surface_type`, `surface_name`, `fidelity`, optional provider/engine/model/model version, optional web-search/search-mode, optional `market_profile_id`, `repeat_index`, `application_cache_bypassed`, raw answer/response capture, provider request id, usage/cost capture, started/finished timestamps, and status. Include directly supported contextual fields from the existing `GeoObservationRun` domain contract/reference only when reconciled explicitly in DELIVERY.
2. Keep the row append-only: it represents what occurred, has a creation/observation timestamp, and has no `updated_at`, update API, repository, workflow, or mutation behavior. Do not claim a DB trigger provides stronger immutability unless one is actually generated and migration-tested; parser-version behavior belongs to the later Parse task.
3. Use explicit typed columns and a Zod/domain boundary. The existing `ObservationSurfaceType`, `SurfaceFidelity`, and run-status unions are the canonical enum sets; validate unsupported, case-mismatched, and empty enum values at the runtime boundary. Validate `repeat_index` as a non-negative integer. Preserve raw capture as raw payload data only; do not encode project, prompt, market, or other relationships in JSON/text.
4. Database-enforce ownership: each run belongs to an existing Project and same-Project SearchPrompt; if `topic_id` and/or `market_profile_id` are shipped, their Project ownership must likewise be database-enforced. Reuse existing OpenSEO Project and accepted Search Growth stores. Select and document matching delete behavior that cannot leave dangling run references; do not add a business uniqueness rule merely to make a composite FK possible.
5. Reconcile the three source views explicitly: `05_DOMAIN_DATA_MODEL.md` is the direct field contract; `schemas/domain-types.ts` and `schemas/migrations-reference.sql` supply context/reference fields. In particular, reconcile `fidelity` versus `surface_fidelity`, raw response/usage representations, and contextual `topic_id`, country/language, and observed/created timestamps. Do not invent enums, a normalizer, provider behavior, a parser contract, or metrics behavior.
6. Add focused migration-backed tests for a valid run, canonical enum boundary rejection, non-negative repeat index, explicit raw field persistence, same-Project parent relations, cross-Project rejection, chosen delete behavior, append-only schema shape (no `updated_at`/no mutation surface), and dual-dialect parity. Tests may use fixtures only; they must make no provider call.
7. Add forward migrations and metadata using next identifiers after accepted T104 (D1 `0050`, PostgreSQL `0028`), extend schema parity/barrel exports as necessary, rerun local D1 migration, and finish with dual-dialect `db:generate` producing no additional migration.

## OUT OF SCOPE

- Geo observation providers/adapters, provider mocks, network calls, credentials, account access, external API requests, fresh-sampling loop, cache bypass implementation, scheduler/workflow/state transitions, retries, polling, metrics, confidence, parse tables/parsers/entity or citation extraction, reparse, UI, CRUD/repository/service/server functions, APIs/forms.
- Prompt generation/normalization, SearchGrowthTarget, entity matching, opportunities, claims, content, media, release/distribution, experiments, audit/runtime controls, connectors, remote migration, deployment, publishing, or paid action.
- Any dependency/lockfile change, broad refactor, infrastructure, Accepted ADR/scope change, or production action.

## ARCHITECTURE AND DATA RULES

- `05_DOMAIN_DATA_MODEL.md` is the direct V1.0 contract. State every reconciliation with `schemas/domain-types.ts` and the migration reference in DELIVERY; omit a reference-only field when no direct contract supports retaining it.
- A row records one occurrence. V1.0 requires later Fresh GEO sampling to create independent rows for repeats; this task only stores the facts and must not implement that sampling behavior or a uniqueness constraint that would prevent it.
- Every stored relationship is an explicit typed FK column. Raw response, raw citations, and usage/cost may be raw payload capture only; they must not become a substitute for relational identity or a parsed data model.
- SQLite/D1 and Postgres expose equivalent fields, nullability, defaults, numeric representation, enums, relationships, indexes, and delete behavior.
- Composite-FK support indexes are permitted only where the database requires a unique referenced target. They add no business uniqueness and must be documented.
- The direct fresh-path invariant `application_cache_bypassed=true` is enforced by the later sampling/execution path. This storage slice must persist the typed flag without implementing cache behavior or making an unsupported global DB claim.

## ACCEPTANCE CRITERIA

- [ ] Both dialects define logically equivalent `geo_observation_runs` storage with only reconciled V1.0 observation-fact fields.
- [ ] The record is append-only by schema/contract shape: no `updated_at` and no mutation/workflow/API implementation. Raw observation and later versioned parse remain separate.
- [ ] Surface, fidelity, and status enums plus repeat-index validation are explicit at the Zod/domain boundary; unsupported/case-mismatched/empty enums and negative/non-integer repeats are rejected.
- [ ] Same-Project parent relations are database-enforced; cross-Project references and dangling-parent deletion are proven impossible by focused migration-backed tests.
- [ ] No uniqueness rule prevents independently stored repeat observations; raw relationship data is not encoded in JSON/text.
- [ ] Forward migrations/snapshots use `0050`/`0028`, local D1 migration succeeds, schema parity passes, and final dual-dialect `db:generate` produces no additional migration.
- [ ] No provider/network/cache/sampling/parser/metrics/CRUD/UI/connector/later-domain work, duplicate OpenSEO store, dependency/lockfile change, Accepted ADR/scope change, credential use, external request, or production action occurs.
- [ ] DELIVERY maps every changed path, source reconciliation, invariant, test, command result, limitation, security note, and final Git diff/status.

## APPROVED COMMANDS

Save concise sanitized evidence under `control/tasks/T105-M1-GEO-OBSERVATION-RUNS-SCHEMA/evidence/round-1/`:

1. `node --version`
2. `corepack pnpm --version`
3. `corepack pnpm install --frozen-lockfile` once in the isolated worktree; manifests/lockfile must remain unchanged
4. `corepack pnpm exec prettier --write <only task-touched source/test files>`
5. `corepack pnpm run db:migrate:local`
6. `corepack pnpm run db:generate`
7. `corepack pnpm exec vitest run <focused geo-observation/schema-parity files>`
8. `corepack pnpm format:check`
9. `corepack pnpm types:check`
10. `corepack pnpm lint`
11. `corepack pnpm test`
12. `corepack pnpm build`
13. `corepack pnpm ci:check`
14. Read-only Git inspection: `git status`, `git rev-parse`, `git diff`, `git log`, `git show`, `git ls-files`.

Do not add/update packages, use unlisted commands, use `--dangerously-skip-permissions`, commit, merge, or touch `main`.

## DELIVERY

Write `control/tasks/T105-M1-GEO-OBSERVATION-RUNS-SCHEMA/DELIVERY.md` using the repository template. Include field/relationship inventory, source reconciliation, append-only boundary, enum/validation decisions, migration identifiers, exact command exits/summaries, limitations, security notes, and final Git diff/status. Do not edit `REVIEW.md` or begin another task.
