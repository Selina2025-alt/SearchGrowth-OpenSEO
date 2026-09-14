# REVIEW — T138-M2-GEO-FRESH-SAMPLING-CORE

## VERDICT

**BLOCKED — Round 2 of 3.**

## VERIFIED

- Round 1's missing/`undefined` raw-response defect is fixed: the result boundary now rejects both forms before recorder writes. Focused tests cover both cases and provider rejection/timeout propagation with no recorder writes.
- Fresh-path invariants remain unchanged: injected provider only, no Prompt Explorer/R2/cache dependency, literal cache bypass, one provider call per repeat, distinct IDs, opaque unparsed payloads, and no metric/parser/provider/persistence/runtime expansion.
- Delivery records focused tests (15/15), full tests (204 files/1,939 tests), and `format:check`, `types:check`, `lint`, `build`, and `ci:check` at exit 0. Targeted diff and `git diff --check` are clean.

## FINDINGS

### BLOCKER — empty raw payloads still become successful observations

- **Location:** `src/server/features/search-growth/geo/services/freshGeoSampling.ts`, `providerResultSchema.rawResponse`.
- **Requirement:** A successful immutable raw observation requires preserved raw evidence. T138 acceptance explicitly includes missing, empty, and invalid raw-response failure propagation.
- **Evidence:** Round 2 rejects only `undefined`; it explicitly allows `null` and blank strings. Thus `{ providerRequestId: "req_1", rawResponse: "" }`, whitespace-only text, or `null` passes validation and is recorded as `SUCCEEDED`, while no actual raw response is available.
- **Expected behavior:** reject absent, `undefined`, `null`, empty-string, and whitespace-only raw responses before any recorder write. Keep nonempty strings and any defined structured payload opaque; do not parse entities, citations, metrics, or provider-specific response shapes.
- **Reproduction:** return `{ providerRequestId: "req_1", rawResponse: "" }` on repeat 1. The current implementation records it as a successful run fact.
- **Fix acceptance:** make this minimal boundary refinement; add parameterized empty/null raw-response cases asserting rejection and zero recorder writes; retain the existing provider rejection/timeout propagation tests. Do not modify repeats, cache behavior, run shape beyond validation, persistence, parser, provider adapters, retry policy, or other scope.

## MERGE DECISION

Do not merge. Dispatch the final bounded Round 3 fix.