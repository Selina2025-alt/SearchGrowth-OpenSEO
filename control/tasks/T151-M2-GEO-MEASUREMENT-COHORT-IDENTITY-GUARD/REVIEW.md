# T151-M2-GEO-MEASUREMENT-COHORT-IDENTITY-GUARD — REVIEW

## ROUND

1 / 3

## VERDICT

BLOCKED

## VERIFIED

- The implementation is pure, preserves the original ordered member list by identity, validates six present identifiers, and rejects exact cross-Project, market, surface, model, and model-version differences without normalization or partial return.
- The focused tests and the executor's full test, build, and CI evidence are coherent. No storage, provider, cache, parser, aggregation, schema, or production behavior was added.

## FINDINGS

### BLOCKER — unsupported observation surfaces are accepted as a valid cohort

- **Location:** src/server/features/search-growth/geo/services/geoMeasurementCohortIdentityGuard.ts, cohortMemberSchema, surfaceType: identifierSchema.
- **Requirement:** GEO Measurement Spec §1 defines the permitted observation surfaces. The task and review acceptance require missing or unsupported identity dimensions to fail explicitly; an identity guard cannot accept an invented surface simply because every member repeats the same string.
- **Evidence:** identifierSchema only requires a nonblank string. A list whose members all use surfaceType: UNSUPPORTED_SURFACE passes the guard, even though it has no accepted measurement surface.
- **Expected behavior:** reject an unsupported surface at its member index with field: surfaceType before establishing or returning a cohort. The four Spec surfaces remain distinguishable and are not normalized or folded.
- **Fix acceptance:** add a storage-free runtime enum validation for exactly AGGREGATED_SEARCH_DATA, MODEL_API_SEARCH, CONSUMER_PRODUCT_OBSERVED, and MANUAL_CONSUMER_OBSERVATION; add first- and later-member unsupported-surface negative tests. Preserve the existing exact comparison, member identity return, and all task boundaries. Do not add prompt/language/window/parser/aggregation behavior.

## MERGE DECISION

Do not merge. Dispatch Round 2 for the narrowly scoped blocker only.
