# REVIEW — T139-M2-GEO-OBSERVATION-RUN-RECORDER-REPOSITORY

## VERDICT

**BLOCKED — Round 1 of 3.**

## VERIFIED

- The repository implements the accepted recorder port using one plain INSERT per run fact. It has no update, upsert, dedupe, retry, provider, cache, workflow, credential, or production behavior.
- Provenance mapping covers the accepted successful-fact fields, records every repeat as a separate row, preserves immutable existing rows, and lets duplicate-ID and same-Project FK failures propagate. Focused tests exercise real local migration DDL and the production adapter path.
- Strings are preserved verbatim; valid structured JSON is serialized; rejected root values write no row. Delivery records 414 focused assertions, 1,957 full tests, and all aggregate quality gates at exit 0. `git diff --check` is clean.
- Failure/run-status workflow policy remains outside this task: the T138 core propagates provider errors without a successful fact, and this repository persists only supplied `SUCCEEDED` facts. It does not silently convert failed samples to success.

## FINDINGS

### BLOCKER — JSON serialization can silently alter nested or non-finite raw evidence

- **Location:** `src/server/features/search-growth/geo/repositories/GeoObservationRunRecorderRepository.ts`, `serializeGeoRawResponse`.
- **Requirement:** TASK item 3 requires opaque raw evidence to be persisted faithfully or rejected before INSERT. It forbids a lossy placeholder.
- **Evidence:** `JSON.stringify(NaN)` and `JSON.stringify(Infinity)` return `"null"`, so valid-looking root values are persisted as a different raw value. `JSON.stringify({ nested: undefined })` drops the property; nested functions, symbols, BigInts, non-finite numbers, and circular structures likewise can be dropped, rewritten, or throw. The DELIVERY records the non-finite conversion as a known limitation.
- **Expected behavior:** accept a JSON-safe raw tree only: nonempty strings, booleans, finite numbers, arrays, and plain-object properties recursively composed of JSON-safe values (with nested `null` allowed). Reject non-finite numbers, `undefined`, functions, symbols, BigInts, cycles, and non-plain/custom objects anywhere in the tree before INSERT. Keep accepted payloads opaque and do not normalize or parse business content.
- **Reproduction:** recording a fact with `rawResponse: NaN` stores `raw_response = "null"`; recording `{ nested: undefined }` stores `{}`. Both lose original provider evidence.
- **Fix acceptance:** implement the smallest pre-serialization JSON-safety validation; add focused tests for root and nested lossy values with zero rows written, plus a nested valid JSON payload that round-trips unchanged. Do not change database schema/migrations, provider/sampling/cache behavior, workflow/retry policy, or any other runtime scope.

## MERGE DECISION

Do not merge. Dispatch a bounded Round 2 implementation fix.