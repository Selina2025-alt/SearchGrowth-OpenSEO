# REVIEW — T138-M2-GEO-FRESH-SAMPLING-CORE

## VERDICT

**BLOCKED — Round 1 of 3.**

## VERIFIED

- The provider and recorder are injected ports. There is no real provider, Prompt Explorer, R2/application-cache, credential, publishing, or production integration.
- Default and explicit-high-value sampling use independent provider calls and distinct run/request IDs. Cache bypass is a `true` literal on every request and run fact. No metrics, parsing, confidence, or surface aggregation behavior is present.
- Provider and recorder errors are not caught or retried, so failures and timeouts propagate instead of being silently converted to success. Buffered facts prevent recorder writes after a provider-result validation failure.
- Delivery evidence records focused tests (11/11), full tests (204 files/1,935 tests), and all required quality gates at exit 0. Targeted source inspection and `git diff --check` are clean.

## FINDINGS

### BLOCKER — successful run facts can omit the raw provider response

- **Location:** `src/server/features/search-growth/geo/services/freshGeoSampling.ts`, `providerResultSchema` and `sampleFreshGeoObservation`.
- **Requirement:** TASK item 3 and the T138 fresh-observation acceptance require every successful repeat to preserve an independent opaque raw provider response. A `SUCCEEDED` raw observation cannot be accepted without a raw payload.
- **Evidence:** `rawResponse: z.unknown()` accepts `undefined`, including a missing `rawResponse` property. The validated result is then buffered as a `SUCCEEDED` `GeoObservationRunFact` and passed to the recorder. The focused malformed-result cases cover missing/blank `providerRequestId` and non-object results, but not an absent or `undefined` `rawResponse`.
- **Expected behavior:** a provider result with absent or `undefined` raw response must reject before any recorder write. `null`, strings, objects, arrays, and other defined opaque values may remain valid without interpretation.
- **Reproduction:** provider returns `{ providerRequestId: "req_0" }` (or `{ providerRequestId: "req_0", rawResponse: undefined }`) for a repeat; the current schema accepts it and records a `SUCCEEDED` fact with no raw response.
- **Fix acceptance:** require raw-response presence/non-`undefined` at the boundary, add focused rejection tests for both absent and `undefined` raw response with zero recorder writes, and add a provider rejection/timeout propagation test proving zero recorder writes. Do not alter repeat, cache, persistence, parser, metrics, provider, or runtime scope.

## MERGE DECISION

Do not merge. Dispatch one bounded Round 2 implementation fix.