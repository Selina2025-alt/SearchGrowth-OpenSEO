# DELIVERY — T138-M2-GEO-FRESH-SAMPLING-CORE

TASK ID: T138-M2-GEO-FRESH-SAMPLING-CORE
ROUND: 1 (no REVIEW.md present)
STATUS: implementation complete, ready for review

## IMPLEMENTATION SUMMARY

Added one credential-free, provider-agnostic fresh GEO sampling core with
injected provider and run-recorder ports, plus focused tests. The core
establishes the accepted Fresh Sampling invariant without any real provider:
a default request makes exactly three independent provider-port calls, every
call carries `applicationCacheBypassed: true`, and each successful repeat
yields its own recordable run fact with a unique run id, its own `repeatIndex`,
a non-empty provider request id, and the same cache-bypass flag. The raw
provider payload is passed through untouched; malformed or duplicate provider
request identities reject the sample before any run fact is recorded.

No database migration, repository, CRUD/server function, UI, workflow,
scheduling, retry, credential, real provider request, paid action, parser/
metric, cache mutation, or publishing behavior was added.

## CONTRACT AND REPEAT RECONCILIATION

Public surface of
`src/server/features/search-growth/geo/services/freshGeoSampling.ts`:

- `GEO_FRESH_SAMPLE_DEFAULT_REPEATS = 3`,
  `GEO_FRESH_SAMPLE_HIGH_VALUE_REPEATS = 5`
- `GeoFreshSampleRequest` = observation context (project/prompt/promptVersion/
  surfaceType/surfaceName/fidelity/provider/model/modelVersion/engine/webSearch/
  searchMode/marketProfileId) + optional `repeats`.
- `GeoFreshSampleProviderRequest` = context + `repeatIndex` +
  `applicationCacheBypassed: true` (literal).
- `GeoFreshSampleProvider` port: `observe(request) => Promise<result>`.
- `GeoFreshSampleProviderResult` = `{ providerRequestId, rawResponse }`
  (validated at runtime with Zod; `providerRequestId` is trimmed non-empty).
- `GeoObservationRunFact` = provider request + `id`, `batchId`,
  `providerRequestId`, `rawResponse`, `startedAt`, `finishedAt`, `status:
  "SUCCEEDED"`.
- `GeoObservationRunRecorder` port: `record(fact) => Promise<void>`.
- `GeoFreshSamplePorts` = `{ provider, recorder }`.
- `GeoFreshSampleOutcome` = `{ batchId, runs }`.
- `sampleFreshGeoObservation(request, ports)`.

Repeat reconciliation (requested value → observed behavior):

| `repeats` input        | provider calls | recorded facts | repeat indices | notes |
|------------------------|----------------|----------------|----------------|-------|
| omitted (default)      | 3              | 3              | 0–2            | `GEO_FRESH_SAMPLE_DEFAULT_REPEATS` |
| `3` (explicit)         | 3              | 3              | 0–2            | same as default |
| `5` (explicit, high value) | 5          | 5              | 0–4            | only accepted as an explicit request value |
| any other number       | 0              | 0              | —              | rejected before the first provider call |
| malformed result       | ≤ N            | 0              | —              | fails fast; no partial facts accepted |
| duplicate request id   | ≤ N            | 0              | —              | fails fast; no partial facts accepted |

Runtime repeat guard: `resolveRepeats` accepts only `undefined`, `3`, or `5`
and throws `unapproved repeat count ...` otherwise. Provider calls run
sequentially (one call per repeat) and all facts are buffered until every
repeat produced a valid identity, so a failed identity never leaves a recorded
run fact behind.

## PROVIDER AND CACHE BOUNDARY DECLARATION

- Provider/run-recorder are injected ports; there is no real adapter, no
  credential, and no network call in this task. Tests exercise the core with
  in-process fakes only.
- The core has no dependency on Prompt Explorer or the R2/application cache:
  it imports only `zod` and type-only `ObservationSurfaceType`/`SurfaceFidelity`.
  A source-boundary test asserts the module contains none of `r2-cache`,
  `promptExplorer`, `getCached`, `setCached`,
  `AI_SEARCH_PROMPT_CACHE_NAMESPACE`, or `ai-search`. No cache code is read,
  written, invalidated, or otherwise invoked.
- Every provider request and every run fact carries the literal
  `applicationCacheBypassed: true`; the provider-request type makes it a `true`
  literal so a non-bypassing call cannot be constructed through the contract.
- The provider payload stays opaque: `rawResponse` is typed `unknown` and
  forwarded verbatim (test asserts reference identity). No entities,
  citations, ranking, confidence, or metrics are parsed.
- Malformed results are rejected with a generic message that names only the
  repeat index; no provider payload or fallback request id is invented or
  echoed.
- Run identity and batch identity are generated with `crypto.randomUUID()`
  inside the core, giving each repeat an independent identity.

## FILES CHANGED

- Added `src/server/features/search-growth/geo/services/freshGeoSampling.ts`
  (196 lines) — sampling core, ports, contracts.
- Added `src/server/features/search-growth/geo/services/freshGeoSampling.test.ts`
  (226 lines) — 11 focused tests.
- Modified `.agents/PAPERCUTS.md` (+1 line) — logged the worktree-bootstrap gap
  below, per root `CLAUDE.md` "Log papercuts". No product code touched.
- Added `control/tasks/T138-M2-GEO-FRESH-SAMPLING-CORE/DELIVERY.md` (this file).

`src/server/features/search-growth/geo/services/` is a new path. No
`search-growth` feature directory existed; this follows the established feature
layout (`src/server/features/<feature>/services/<Name>.ts`) and the V1.0 reuse
map's suggested `src/server/features/search-growth/geo/` module boundary
(`04_OPENSEO_REUSE_CODE_MAP.md` §4). The pre-existing GEO schemas at
`src/types/schemas/geo-observation-run.ts` are re-used for the surface/fidelity
types (type-only import, no re-declaration).

## DATABASE/MIGRATION CHANGES

None. No migration, schema, repository, or query change. The run fact is
declared without a DB dependency; the persistence adapter remains a separate
task.

## DEPENDENCIES CHANGED

None. No dependency added or removed. `package.json` and `pnpm-lock.yaml` are
untouched. The core uses already-installed `zod` (existing dependency).

## TESTS ADDED

`src/server/features/search-growth/geo/services/freshGeoSampling.test.ts`
(11 tests, all passing):

1. default sample makes exactly three provider calls and three recordings;
2. repeats use indices 0–2 and `applicationCacheBypassed` is `true` on every
   provider call and every run fact;
3. every run fact has a distinct run id and a distinct non-empty provider
   request id (single shared `batchId`);
4. the raw provider response is preserved by reference (opaque, unparsed);
5. explicit five-repeat request makes exactly five calls and five recordings
   (indices 0–4);
6. an unapproved repeat count is rejected before any provider call;
7. (3 cases) missing / blank / non-object provider results are rejected without
   recording any run fact;
8. duplicate provider request identities are rejected without recording any run
   fact;
9. the core does not depend on the Prompt Explorer application cache (static
   source-boundary assertion).

Cases 1–6 and 8–9 are eight tests; case 7 contributes three parameterized
tests. Total = 11.

## COMMANDS RUN

All approved commands were invoked as `corepack pnpm ...`, each independently.
One prerequisite install (see DEVIATIONS) was required first.

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `corepack pnpm install --frozen-lockfile` | 0 | 980 packages installed from the frozen lockfile (prerequisite; not in the APPROVED COMMANDS list) |
| 2 | `corepack pnpm exec prettier --write <task files>` | 0 | formatted both new files |
| 3 | `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/freshGeoSampling.test.ts` | 0 | 1 file, 11/11 tests passed |
| 4 | `corepack pnpm format:check` | 0 | "All matched files use Prettier code style!" |
| 5 | `corepack pnpm types:check` | 2 | first run failed: `freshGeoSampling.test.ts(154,21)` TS2352 (narrowing cast to `GeoFreshSampleRequest`); fixed to `as unknown as ...` |
| 6 | `corepack pnpm types:check` (after fix) | 0 | clean `tsc --noEmit` |
| 7 | `corepack pnpm lint` | 0 | oxlint: 0 warnings, 0 errors on 936 files |
| 8 | `corepack pnpm test` | 0 | 204 files, 1935/1935 tests passed (148.86s) |
| 9 | `corepack pnpm build` | 0 | client + SSR + audit Worker builds succeeded |
| 10 | `corepack pnpm ci:check` | 1 | first run failed at `knip`: 2 unused exported types (`GeoFreshSamplePorts`, `GeoFreshSampleOutcome`) |
| 11 | `corepack pnpm exec prettier --write <test file>` | 0 | re-formatted after the cast fix (line-length change) |
| 12 | `corepack pnpm exec vitest run <focused file>` | 0 | 11/11 tests passed after refactor |
| 13 | `corepack pnpm ci:check` (after knip fix) | 0 | prettier + knip + tsc + badseo tsc + oxlint + plugin-skill sync all clean |
| 14 | `corepack pnpm format:check` (final revision) | 0 | clean |
| 15 | `corepack pnpm types:check` (final revision) | 0 | clean |
| 16 | `corepack pnpm lint` (final revision) | 0 | 0 warnings, 0 errors |
| 17 | `corepack pnpm test` (final revision) | 0 | 204 files, 1935/1935 tests passed |
| 18 | `corepack pnpm build` (final revision) | 0 | all three builds succeeded |
| 19 | `corepack pnpm format:check` (after PAPERCUTS edit) | 0 | clean |

Aggregate gate `ci:check` was **not** sandbox-denied; it completed and its only
failures were the two real findings above, each fixed and re-run to a clean
exit. No `--dangerously-skip-permissions`, commit, merge, push, production
access, provider call, credential access, cache access, or publishing command
was run.

## COMMAND RESULTS (exact focused/full output)

- Focused: `Test Files 1 passed (1) / Tests 11 passed (11)`.
- Full: `Test Files 204 passed (204) / Tests 1935 passed (1935)`.
- Lint: `Found 0 warnings and 0 errors. Finished in 24.1s on 936 files`.
- ci:check final line: `plugin skill sync clean: plugins/openseo/skills`.

## RUNTIME EVIDENCE

Runtime behavior is demonstrated only through the in-process fakes in the
focused test run (exit 0):
- `observeMock` called 3 times and `record` called 3 times for the default
  request; 5/5 for the explicit `repeats: 5` request.
- Provider-call arguments read `repeatIndex` 0,1,2 and
  `applicationCacheBypassed === true`; recorded facts match.
- `new Set(runIds).size === 3` and `new Set(providerRequestIds).size === 3`.
- `facts[n].rawResponse` is reference-equal (`toBe`) to the payload the fake
  provider returned.
- Malformed and duplicate results reject with 0 `record` calls.

No real provider, credential, paid action, cache, or production runtime was
exercised — by design, this task is credential-free and provider-agnostic.

## KNOWN LIMITATIONS

- No persistence adapter: run facts are handed to the injected recorder port;
  DB writes remain a separate task.
- No batch-failure/retry workflow policy: a provider error propagates and no
  further policy is applied. Facts are recorded only after all repeats pass
  validation, so a failing sample records nothing.
- No `rawAnswer`, `usage`, or any payload interpretation is produced; only the
  opaque `rawResponse` is preserved.
- Timestamps come from the system clock (not an injected clock), so tests do
  not assert exact values.
- Run/batch identity uses `crypto.randomUUID()`; uniqueness is per sample and
  is asserted by test rather than enforced by a store.
- The cache-boundary test is a static source assertion over the one core file;
  it is intentionally one-directional (it proves the core cannot import cache
  code) and does not police other modules.

## DEVIATIONS FROM TASK

1. **Prerequisite install outside the APPROVED COMMANDS list.** The fresh
   worktree had no `node_modules`; the first approved command
   (`corepack pnpm exec vitest run ...`) failed with `'prettier'/'vitest' not
   found`, so no approved gate could run. I ran
   `corepack pnpm install --frozen-lockfile` (exit 0, lockfile unchanged) before
   any gate. This is environment bootstrapping, not a product action; no other
   unapproved command was used. Logged in `.agents/PAPERCUTS.md`.
2. **Added `.agents/PAPERCUTS.md` entry** per root `CLAUDE.md` "Log papercuts"
   (the worktree-bootstrap gap above). `.agents/PAPERCUTS.md` is not among the
   files the overlay lists as control plane (`AGENTS.md`, `CLAUDE.md`,
   `.agents/skills/**`, `.github/**`, `.greptile/**`).
3. No other deviation. No scope, acceptance-criteria, or ADR change.

## SECURITY NOTES

- No credentials, accounts, cookies, or production systems accessed; no real
  provider request or paid action; no CAPTCHA/2FA bypass; no stealth behavior.
- No Prompt Explorer / R2 / application-cache read, write, or invalidation.
- Malformed-provider errors expose only the repeat index; duplicate errors
  include the duplicated (non-secret) provider request id. Raw provider
  payloads are never logged or echoed in errors.
- Provider payloads are treated as opaque untrusted data and validated at the
  boundary (Zod); no fallback identity is fabricated.

## GIT STATUS/DIFF SUMMARY

Branch: `ai-task/T138-M2-GEO-FRESH-SAMPLING-CORE`
Base HEAD: `edd1edaaf82a8815284696fe0193e93b27d38749`

```
 M .agents/PAPERCUTS.md
?? control/tasks/T138-M2-GEO-FRESH-SAMPLING-CORE/DELIVERY.md
?? src/server/features/search-growth/
```

- `git diff --stat`: `.agents/PAPERCUTS.md | 1 +` (1 file, 1 insertion).
- New untracked: `control/tasks/T138-M2-GEO-FRESH-SAMPLING-CORE/DELIVERY.md`,
  and `src/server/features/search-growth/geo/services/`
  (`freshGeoSampling.ts`, `freshGeoSampling.test.ts`).
- No change to `package.json`, `pnpm-lock.yaml`, schemas, migrations, or any
  existing source file. Build artifacts (`dist/`) and `node_modules/` are
  gitignored and do not appear.

## READY FOR REVIEW

Yes. Focused and full tests pass, all required gates exit 0 on the final
revision, the provider/cache/persistence boundaries are declared and enforced,
and no out-of-scope surface was added. Only Codex may accept this task.
