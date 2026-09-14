# DELIVERY — T138-M2-GEO-FRESH-SAMPLING-CORE

TASK ID: T138-M2-GEO-FRESH-SAMPLING-CORE
ROUND: 3 (REVIEW.md Round 2 present — one BLOCKER addressed)
STATUS: implementation complete, ready for re-review

## IMPLEMENTATION SUMMARY

Round 1 delivered the credential-free, provider-agnostic fresh GEO sampling
core and its focused tests. Round 2 tightened the `rawResponse` boundary to
reject a missing/`undefined` payload. Round 3 addresses the single Round 2
BLOCKER:

> empty raw payloads still become successful observations —
> `providerResultSchema.rawResponse` rejects only `undefined`, so `null`,
> the empty string, and whitespace-only strings pass validation and are recorded
> as `SUCCEEDED` even though no usable raw evidence exists.

Changes in Round 3 are confined to the provider-result boundary and its tests:

1. `providerResultSchema.rawResponse` now uses a small named predicate
   `isUsableRawResponse(value)`: it rejects `undefined` and `null`, and rejects
   strings whose `.trim()` is empty. Every other defined value (non-empty
   string, number, boolean, object, array) remains valid, opaque data that is
   never interpreted. The `providerRequestId` rule is unchanged.
2. The malformed-result error message text is unchanged from Round 2
   (`...without a usable providerRequestId or raw response.`); it still exposes
   only the repeat index and never echoes the payload.
3. Focused tests extend the parameterized malformed table with `null`, the empty
   string, and a whitespace-only string (all asserting rejection and zero
   recorder writes), and add one positive case proving a non-empty string
   payload is still accepted as opaque evidence.

No repeat, cache, persistence, parser, metric, provider, or runtime scope was
altered. The core remains credential-free and provider-agnostic: no adapter, no
network call, no real provider request, no paid action.

## RESPONSE TO REVIEW FINDINGS

### BLOCKER — empty raw payloads still become successful observations (FIXED)

- **Location fixed:**
  `src/server/features/search-growth/geo/services/freshGeoSampling.ts` —
  `providerResultSchema.rawResponse` (via new `isUsableRawResponse` predicate).
- **Fix:** the boundary now requires usable raw evidence. `{ providerRequestId:
  "req_1", rawResponse: "" }`, `rawResponse: "   "`, and `rawResponse: null`
  now fail `safeParse`, so the repeat throws `malformed provider result` and
  nothing is recorded. `absent`/`undefined` remain rejected (Round 2 behavior
  retained). Non-empty strings, objects, arrays, numbers and booleans remain
  valid and unparsed.
- **Tests added/updated** (`freshGeoSampling.test.ts`, focused cases):
  - `it.each` malformed table now also has `"a null raw response"`
    (`{ providerRequestId: "req_1", rawResponse: null }`), `"an empty-string raw
    response"` (`rawResponse: ""`), and `"a whitespace-only raw response"`
    (`rawResponse: "   "`); each asserts `rejects.toThrow(/malformed provider
    result/)` and `record` not called. The Round 2 absent/undefined cases are
    retained in the same table.
  - New positive test: a provider returning a non-empty string payload yields 3
    recorded facts with the strings preserved, proving the tightening did not
    over-reject legitimate string evidence.
  - The Round 2 provider rejection/timeout propagation tests are retained.
- **Fix acceptance mapping:**
  - reject absent, `undefined`, `null`, empty-string, and whitespace-only raw
    responses before any recorder write — done via `isUsableRawResponse`.
  - parameterized empty/null raw-response cases asserting rejection and zero
    recorder writes — done (three new parameterized cases).
  - keep non-empty strings and any defined structured payload opaque; do not
    parse — done (positive string test; no shape inspection).
  - retain existing provider rejection/timeout propagation tests — done.
  - no alteration to repeats, cache behavior, run shape beyond validation,
    persistence, parser, providers, retry policy, or other scope — confirmed;
    the production diff is confined to the boundary predicate/comment.

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
  (validated at runtime with Zod; `providerRequestId` is trimmed non-empty;
  `rawResponse` must be present and non-blank, otherwise accepted as-is).
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
| absent/undefined raw response | ≤ N       | 0              | —              | Round 2 boundary presence check |
| null/blank raw response | ≤ N           | 0              | —              | Round 3 non-blank check |
| duplicate request id   | ≤ N            | 0              | —              | fails fast; no partial facts accepted |
| provider rejects/times out | ≤ N        | 0              | —              | Round 2: propagates, no facts recorded |

Runtime repeat guard: `resolveRepeats` accepts only `undefined`, `3`, or `5`
and throws `unapproved repeat count ...` otherwise. Provider calls run
sequentially (one call per repeat) and all facts are buffered until every
repeat produced a valid identity and usable payload, so a failure never leaves a
recorded run fact behind.

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
  citations, ranking, confidence, or metrics are parsed. Rounds 2–3 only assert
  the payload is present and non-blank; its shape is never inspected.
- Malformed results are rejected with a generic message that names only the
  repeat index; no provider payload or fallback request id is invented or
  echoed.
- Run identity and batch identity are generated with `crypto.randomUUID()`
  inside the core, giving each repeat an independent identity.

## FILES CHANGED

Round 3 (working tree vs. Round 1 commit `bd65a22`; Round 2 was still
uncommitted, so this cumulative diff contains Rounds 2 and 3):

- Modified
  `src/server/features/search-growth/geo/services/freshGeoSampling.ts`: the
  `rawResponse` boundary refinement (Round 2) plus the Round 3
  `isUsableRawResponse` predicate and comment; malformed-result error text
  unchanged in Round 3.
- Modified
  `src/server/features/search-growth/geo/services/freshGeoSampling.test.ts`:
  Round 2 absent/undefined cases and rejection/timeout propagation test, plus
  Round 3 null/empty/whitespace malformed cases and the non-empty-string
  acceptance test.
- `control/tasks/.../DELIVERY.md` (this file, rewritten).

No new files. No change to `package.json`, `pnpm-lock.yaml`, schemas,
migrations, or any source file outside the two task files.

`git status --short`:

```
 M control/tasks/T138-M2-GEO-FRESH-SAMPLING-CORE/DELIVERY.md
 M src/server/features/search-growth/geo/services/freshGeoSampling.test.ts
 M src/server/features/search-growth/geo/services/freshGeoSampling.ts
?? control/tasks/T138-M2-GEO-FRESH-SAMPLING-CORE/REVIEW.md
```

`REVIEW.md` is the controller's Round 2 review; it was read and not edited.

## DATABASE/MIGRATION CHANGES

None. No migration, schema, repository, or query change. The run fact is
declared without a DB dependency; the persistence adapter remains a separate
task.

## DEPENDENCIES CHANGED

None. No dependency added or removed. `package.json` and `pnpm-lock.yaml` are
untouched. The core uses already-installed `zod` (existing dependency).

## TESTS ADDED

`src/server/features/search-growth/geo/services/freshGeoSampling.test.ts`
now has **19 tests, all passing** (Round 1 was 11; Round 2 was 15):

1. default sample makes exactly three provider calls and three recordings;
2. repeats use indices 0–2 and `applicationCacheBypassed` is `true` on every
   provider call and every run fact;
3. every run fact has a distinct run id and a distinct non-empty provider
   request id (single shared `batchId`);
4. the raw provider response is preserved by reference (opaque, unparsed);
5. **a non-empty string raw response is accepted as opaque evidence (Round 3)**;
6. explicit five-repeat request makes exactly five calls and five recordings
   (indices 0–4);
7. an unapproved repeat count is rejected before any provider call;
8. (8 parameterized cases) missing / blank provider request id, non-object
   result, absent / undefined / **null / empty-string / whitespace-only** raw
   response — each rejected without recording any run fact;
9. duplicate provider request identities are rejected without recording any run
   fact;
10. (2 parameterized cases) provider rejection and provider timeout propagate
    and record zero run facts;
11. the core does not depend on the Prompt Explorer application cache (static
    source-boundary assertion).

Cases 1–7, 9, 11 are ten tests; case 8 contributes eight parameterized tests;
case 10 contributes two. Total = 19.

## COMMANDS RUN

All approved commands were invoked as `corepack pnpm ...`, each independently,
in the order below. Every command below is required by TASK item 6.

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `corepack pnpm exec prettier --write <both task files>` | 0 | both unchanged (already formatted) |
| 2 | `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/freshGeoSampling.test.ts` | 0 | focused: `Test Files 1 passed (1) / Tests 19 passed (19)` |
| 3 | `corepack pnpm format:check` | 0 | "All matched files use Prettier code style!" |
| 4 | `corepack pnpm types:check` | 0 | clean `tsc --noEmit` |
| 5 | `corepack pnpm lint` | 0 | `Found 0 warnings and 0 errors. Finished in 20.4s on 936 files` |
| 6 | `corepack pnpm test` | 0 | full: `Test Files 204 passed (204) / Tests 1943 passed (1943)` |
| 7 | `corepack pnpm build` | 0 | client + SSR + audit Worker builds succeeded |
| 8 | `corepack pnpm ci:check` | 0 | prettier + knip + tsc + badseo tsc + oxlint + plugin-skill sync all clean; final line `plugin skill sync clean: plugins/openseo/skills` |

`ci:check` was **not** sandbox-denied; it completed at exit 0. No
`--dangerously-skip-permissions`, commit, merge, push, `main` touch, production
access, provider call, credential access, cache access, or publishing command
was run. `node_modules` was already present from Round 1, so no install was
needed.

## COMMAND RESULTS (exact focused/full output)

- Focused: `Test Files 1 passed (1) / Tests 19 passed (19)`
  (`Duration 7.35s`, file `freshGeoSampling.test.ts`).
- Full: `Test Files 204 passed (204) / Tests 1943 passed (1943)`
  (`Duration 163.84s`; +4 tests vs. Round 2's 1939, +8 vs. Round 1's 1935).
- Format: `All matched files use Prettier code style!`.
- Types: `tsc --noEmit` (no output, exit 0).
- Lint: `Found 0 warnings and 0 errors. Finished in 20.4s on 936 files`.
- Build: three Vite builds succeeded (`built in 20.75s`, `51.09s`, `11.58s`).
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
- **Round 3:** a provider result with `rawResponse: null`, `""`, or `"   "`
  rejects with `malformed provider result` and 0 `record` calls — same as the
  round 2 absent/undefined cases.
- **Round 3:** a provider returning `"raw answer N"` produces 3 recorded facts
  whose `rawResponse` values are exactly those strings (non-empty string
  evidence accepted, not parsed).
- **Round 2:** a provider that rejects or times out on repeat 1 propagates the
  original error (`rejects.toBe(providerError)`), the provider is called twice,
  and 0 `record` calls are made.
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
- The boundary treats `null`, `""`, and whitespace-only strings as absent
  evidence. A legitimate provider that returned a blank answer string is
  therefore rejected rather than recorded; that is the intended acceptance
  behavior for this task.
- Timestamps come from the system clock (not an injected clock), so tests do
  not assert exact values.
- Run/batch identity uses `crypto.randomUUID()`; uniqueness is per sample and
  is asserted by test rather than enforced by a store.
- The cache-boundary test is a static source assertion over the one core file;
  it is intentionally one-directional (it proves the core cannot import cache
  code) and does not police other modules.

## DEVIATIONS FROM TASK

1. Round 1 used a one-time `corepack pnpm install --frozen-lockfile` to
   bootstrap the empty worktree; it is not in the APPROVED COMMANDS list and is
   recorded in `.agents/PAPERCUTS.md`. Rounds 2–3 needed no install.
2. `.agents/PAPERCUTS.md` carries that Round 1 entry, per root `CLAUDE.md`
   "Log papercuts". It is not part of the control plane the overlay protects.
   Round 3 did not modify it.
3. No other deviation. No scope, acceptance-criteria, or ADR change. The Round
   3 fix stays strictly inside the Round 2 BLOCKER's stated fix-acceptance
   boundary.

## SECURITY NOTES

- No credentials, accounts, cookies, or production systems accessed; no real
  provider request or paid action; no CAPTCHA/2FA bypass; no stealth behavior.
- No Prompt Explorer / R2 / application-cache read, write, or invalidation.
- Malformed-provider errors expose only the repeat index; duplicate errors
  include the duplicated (non-secret) provider request id. Raw provider
  payloads are never logged or echoed in errors.
- Provider payloads are treated as opaque untrusted data and validated at the
  boundary (Zod); no fallback identity is fabricated. Round 3 tightens the
  boundary by rejecting blank payloads, without interpreting any payload.

## GIT STATUS/DIFF SUMMARY

Branch: `ai-task/T138-M2-GEO-FRESH-SAMPLING-CORE`
HEAD: `bd65a224a420be94e27c7b639a58ec391acc1e9a` (Round 1 commit; Rounds 2–3
changes are uncommitted in the working tree)

```
 M control/tasks/T138-M2-GEO-FRESH-SAMPLING-CORE/DELIVERY.md
 M src/server/features/search-growth/geo/services/freshGeoSampling.test.ts
 M src/server/features/search-growth/geo/services/freshGeoSampling.ts
?? control/tasks/T138-M2-GEO-FRESH-SAMPLING-CORE/REVIEW.md
```

- `git diff --numstat` (source only, cumulative Rounds 2–3 vs. HEAD): 2 files
  changed, 75 insertions(+), 3 deletions(-) — test `+54/−0`, core `+21/−3`.
- No change to `package.json`, `pnpm-lock.yaml`, schemas, migrations, or any
  existing source file outside the two task files. Build artifacts (`dist/`)
  and `node_modules/` are gitignored and do not appear.
- `REVIEW.md` is untracked and was not edited.

## READY FOR REVIEW

Yes. The Round 2 BLOCKER (blank/null raw payloads recorded as successful
observations) is fixed at the provider-result boundary: `undefined`, `null`,
empty-string, and whitespace-only raw responses are rejected before any recorder
write, while non-empty strings and other defined structured payloads remain
accepted opaque data. The fix's acceptance tests are present, focused and full
tests pass, and every required gate (`format:check`, `types:check`, `lint`,
`test`, `build`, `ci:check`) exits 0. Only Codex may accept this task.
