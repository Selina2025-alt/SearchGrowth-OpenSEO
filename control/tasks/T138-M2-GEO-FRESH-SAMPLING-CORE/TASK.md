# TASK — T138-M2-GEO-FRESH-SAMPLING-CORE

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Implement one credential-free, provider-agnostic fresh GEO sampling core. The core must establish the accepted Fresh Sampling invariant without calling any real provider: a default three-repeat sample makes exactly three independent provider-port calls, bypasses the application cache on every call, and supplies three independently recordable run facts with distinct run and provider-request identities.

## READ ONLY

Read `CLAUDE.md`; `07_GEO_MEASUREMENT_SPEC.md` §§1–3; `21_TEST_ACCEPTANCE_PLAN.md` §§3–4; `23_BACKLOG_MILESTONES.md` M2; `27_AI_CODING_MASTER_PROMPT.md` GEO Hard Rules; Accepted `docs/adr/ADR-003-fresh-geo-path.md`; existing GeoObservationRun schema/domain tests; and the directly relevant Prompt Explorer/cache implementation only to prove this core does not use it.

## IN SCOPE

1. Add a small, typed server-side fresh-sampling core in the repository’s established service layout. Define injected provider and run-recorder ports plus input/result contracts needed for a GEO observation sample. Keep the core provider-agnostic and testable with in-process fakes; do not add a real adapter.
2. The service must make one provider-port call per repeat. With its default request it must make exactly three calls; permit the documented high-value five-repeat setting only as an explicit request value. Every provider request must carry an unambiguous `applicationCacheBypassed: true` contract. Do not read, write, invalidate, or otherwise invoke Prompt Explorer or R2/application cache code.
3. Each successful repeat must produce an independently recordable run fact with a unique run identity, its own `repeatIndex`, a non-empty provider request identity, and `applicationCacheBypassed: true`. Preserve the raw provider response as opaque data; do not parse entities, citations, ranking, confidence, or metrics in this task. Reject malformed provider results rather than inventing fallback request IDs.
4. Add focused tests with a provider mock and recorder fake proving: default 3 repeats cause exactly 3 provider calls and 3 recordings; calls/records use repeat indices 0–2; all cache-bypass flags are true; all run/provider-request IDs are distinct; the explicit five-repeat request makes exactly 5 calls; the service does not use the Prompt Explorer application cache; and malformed/duplicate provider request identities are rejected without accepting invalid run facts.
5. Do not add database migrations, repositories, CRUD/server functions/UI, Cloudflare Workflows, scheduling, retries, provider credentials, real provider requests, paid actions, production behavior, parser/metric logic, cache mutations, or any publishing behavior. Persistence adapters and batch-failure workflow policy remain separate tasks.
6. Run focused tests, `format:check`, `types:check`, `lint`, full `test`, `build`, and `ci:check`, recording exact exits. If an aggregate gate is sandbox-denied, record it once and stop without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only: `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, invoke a real provider, access credentials/accounts, access the Prompt Explorer or R2/application cache, or invoke publishing/paid behavior.

## DELIVERY

Write `control/tasks/T138-M2-GEO-FRESH-SAMPLING-CORE/DELIVERY.md` with contract and repeat reconciliation, provider/cache boundary declaration, exact gate exits, focused/full test results, changed files, and final Git status; then stop.