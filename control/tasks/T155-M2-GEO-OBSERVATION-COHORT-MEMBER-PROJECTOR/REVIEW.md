# T155-M2-GEO-OBSERVATION-COHORT-MEMBER-PROJECTOR — REVIEW

ROUND: 1 / 3
VERDICT: BLOCKED

## VERIFIED

- The implementation is storage-free and returns the original row list by identity.
- It maps identity fields in input order and calls T151 once on the projected members.
- Focused controller tests passed: 74 related tests. Formatting also passed. DELIVERY records passing full test, build, and ci:check evidence.

## FINDINGS

### BLOCKER — projector revalidates model instead of propagating T151

- Path: src/server/features/search-growth/geo/services/geoObservationCohortMemberProjector.ts
- Location: sourceIdentitySchema and sourceRowSchema; projection path in projectGeoObservationCohortMembers.
- Requirement violated: TASK item 2 limits the projector-owned nullable checks to marketProfileId and modelVersion. TASK item 3 requires the projected members to be handed to T151 once and its typed rejection propagated unchanged, with no duplicate revalidation.
- Evidence: sourceRowSchema includes model: sourceIdentitySchema. A blank, null, or malformed model therefore raises GeoObservationCohortMemberProjectionError before T151 sees the member.
- Expected behavior: validate only marketProfileId and modelVersion in the projector. Copy model directly into the member and let T151 reject malformed model values with its unchanged GeoMeasurementCohortIdentityError.
- Fix acceptance: remove the projector-owned model check and revise focused tests so malformed model input demonstrates unchanged T151 error propagation; retain explicit projector errors for marketProfileId and modelVersion. No schema, storage, ordering, aggregation, or unrelated changes.

## MERGE DECISION

Do not merge. Dispatch the scoped Round 2 repair.
