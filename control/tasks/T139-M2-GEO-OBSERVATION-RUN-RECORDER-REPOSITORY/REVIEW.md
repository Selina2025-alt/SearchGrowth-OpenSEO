# REVIEW — T139-M2-GEO-OBSERVATION-RUN-RECORDER-REPOSITORY

## VERDICT

**BLOCKED — Round 2 of 3.**

## VERIFIED

- Round 1's top-level and nested `NaN`/infinity/`undefined`/function/symbol/BigInt/cycle loss cases are now covered by a pre-serialization traversal and focused real-SQL tests. The repository remains one INSERT per accepted fact with no update, upsert, dedupe, provider, cache, workflow, or schema change.
- Same-Project FK and duplicate-ID errors still surface; independent repeats persist separately; existing rows are not modified. Delivery records focused tests (431), full tests (205 files/1,974 tests), and all required quality gates at exit 0.

## FINDINGS

### BLOCKER — JSON-safe traversal rejects valid evidence and still permits several lossy shapes

- **Location:** `src/server/features/search-growth/geo/repositories/GeoObservationRunRecorderRepository.ts`, `assertJsonSafeRawResponse`, `assertJsonSafeArray`, and `assertJsonSafeObject`.
- **Requirement:** Valid JSON payloads must retain their raw-evidence semantics, while values JSON cannot faithfully carry must be rejected before INSERT.
- **Evidence:**
  1. The traversal rejects a blank string at every nested path. `{ optionalAnswer: "" }` is valid JSON and faithfully serializes/restores; only the *root* raw capture needs to be nonempty. Rejecting nested blank strings invents a content policy and prevents valid provider evidence from being stored.
  2. Arrays do not check `Object.getOwnPropertySymbols`, so an array with a symbol-keyed property passes validation while JSON silently drops that property.
  3. Enumerable accessor properties pass the object/array checks and are read with `Reflect.get`; getters can produce a different value or side effect between validation and `JSON.stringify`, so the persisted text is not proven to be the validated raw evidence.
  4. `-0` is finite but JSON serializes it as `0`, losing its value.
- **Expected behavior:** root string evidence must remain nonblank. Nested JSON strings, including `""`, are valid JSON values and must be preserved. Before serialization, reject symbol-keyed properties on arrays, accessor properties, and `-0`, in addition to the already covered invalid values. Read only data-descriptor values during validation; keep all accepted payloads opaque.
- **Reproduction:** `{ optionalAnswer: "" }` currently rejects despite round-tripping through JSON. Conversely, `Object.assign([1], { [Symbol("s")]: 1 })`, an enumerable getter property, and `-0` can pass the current validator while JSON drops or rewrites data.
- **Fix acceptance:** add only these boundary corrections and focused tests: nested empty string round-trips; root blank string still rejects; array symbol, object/array accessor, and root/nested `-0` reject with zero rows. Do not change INSERT mapping, schema/migrations, sampling/cache/provider behavior, workflow/retry policy, or other scope.

## MERGE DECISION

Do not merge. Dispatch the final bounded Round 3 fix.