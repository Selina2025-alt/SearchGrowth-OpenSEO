# TASK — T139-M2-GEO-OBSERVATION-RUN-RECORDER-REPOSITORY

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Implement one small, credential-free persistence adapter for the accepted `GeoObservationRunRecorder` port. It must turn a validated fresh-sampling run fact into exactly one append-only `geo_observation_runs` insert using the existing accepted schema, without adding a provider adapter, workflow, cache access, or database migration.

## READ ONLY

Read `CLAUDE.md`; `07_GEO_MEASUREMENT_SPEC.md` §§1–3 and §5; `21_TEST_ACCEPTANCE_PLAN.md` §3; `05_DOMAIN_DATA_MODEL.md` §6; Accepted `docs/adr/ADR-003-fresh-geo-path.md` and `ADR-005-versioned-geo-parse.md`; the accepted T105 GeoObservationRun schema/migration tests; the accepted T138 `freshGeoSampling.ts` port and focused tests; and directly relevant existing repository patterns.

## IN SCOPE

1. Add an idiomatic server-side repository/recorder adapter that implements T138's `GeoObservationRunRecorder` port and persists each supplied `GeoObservationRunFact` as exactly one INSERT into the accepted `geo_observation_runs` table. Reuse the existing schema and established database access patterns; do not change migrations, schemas, snapshots, or domain enums.
2. Map every fact provenance field faithfully: id, batch, Project, prompt/version, surface type/name/fidelity, provider/model/version, engine, web-search/search mode, optional MarketProfile, repeat index, literal cache bypass, provider request ID, raw response, started/finished timestamps, and `SUCCEEDED` status. No field may be synthesized except the existing database defaults; do not parse raw content or derive any entity/citation/ranking/metric/confidence value.
3. Preserve opaque raw evidence deterministically: a nonempty string raw response is persisted verbatim; defined non-string raw values are serialized as JSON for the existing raw-text storage column. Reject an unrepresentable raw value before INSERT rather than silently storing an empty value, fabricated fallback, or lossy placeholder. Do not add a new raw store or alter T138's provider contract.
4. Preserve append-only semantics: no update, upsert, deduplication, retry, or lifecycle transition. Surface database failures (including duplicate IDs and same-Project FK violations) rather than swallowing them. The adapter must not write parse rows or modify existing run rows.
5. Add focused repository tests using the actual accepted local storage contract and minimal valid parent fixtures. Cover one valid insert, verbatim string raw response, structured raw response JSON persistence, repeat fact independence, same-Project FK rejection, duplicate-ID propagation, and rejection of an unrepresentable raw response with no row written. Demonstrate that raw runs stay unchanged after recorder use; retain/extend relevant dual-dialect schema-parity evidence without adding a migration.
6. Do not add real provider calls, credentials/accounts, Prompt Explorer/R2/application-cache access, Cloudflare Workflow, scheduling, batch failure/retry policy, parser/metrics/UI/CRUD/server functions, production actions, or paid behavior.
7. Run focused tests, `format:check`, `types:check`, `lint`, full `test`, `build`, and `ci:check`, recording exact exits. If an aggregate gate is sandbox-denied, record it once and stop without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only: `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, invoke a real provider, access credentials/accounts, access Prompt Explorer/R2/application-cache, or invoke publishing/paid behavior.

## DELIVERY

Write `control/tasks/T139-M2-GEO-OBSERVATION-RUN-RECORDER-REPOSITORY/DELIVERY.md` with fact-to-storage mapping, raw-evidence serialization/rejection behavior, append-only and FK evidence, exact gate exits, focused/full test results, changed files, and final Git status; then stop.