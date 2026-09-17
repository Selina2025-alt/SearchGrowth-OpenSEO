import {
  guardGeoMeasurementCohortIdentity,
  type GeoMeasurementCohortMember,
} from "./geoMeasurementCohortIdentityGuard";

// ============================================================================
// GEO measurement cohort context stamp
// (07_GEO_MEASUREMENT_SPEC.md §§1, 4, 7; 05_DOMAIN_DATA_MODEL.md §§2, 6)
// ============================================================================
//
// The small, pure composition boundary that turns an accepted T151 cohort into
// the explicit context a future GEO metric must carry. It owns no rule of its
// own: it hands the caller's members to the accepted guard exactly once, then
// copies the validated baseline's cohort identity into a structured context
// beside the caller's own list.
//
// Boundary declaration:
//   - Composition only, and identity only. The result pairs the validated member
//     list — the very array the caller passed, which the guard returns by
//     identity — with the five cohort-defining identifiers taken from the
//     validated baseline: project id, market profile id, surface type, model,
//     and model version. Spec §7 requires every metric to retain its surface,
//     market, and model/version identity, so those stay separate fields there
//     rather than being collapsed into one value here.
//   - The context is structured fields, never an identity string. It is not a
//     joined, concatenated, hashed, serialized, or normalized value, and it is
//     not a generated id or a storage key. A future metric carries the fields
//     themselves, so no delimiter, encoding, or truncation can collide two
//     cohorts that a field still tells apart.
//   - It decides and transforms nothing. The run id is deliberately absent: it
//     identifies the repeat run, not the cohort, and the guard already accepts
//     members that differ only there. Nothing is revalidated, filtered, sorted,
//     de-duplicated, counted, aggregated, sampled, classified, or measured, and
//     no sample count, confidence, warning, prompt, language, window, or
//     parser data is attached.
//   - Fail closed by propagation. There is no error handling and no fallback:
//     every T151 rejection reaches the caller unchanged, and no stamp, partial
//     context, or repaired member list is ever returned.
//   - It is pure, deterministic, and storage-free. Same members, same stamp
//     values; the caller's array and member objects are read only; and it
//     reaches no database, repository, provider, cache, parser, raw evidence,
//     or environment.

/**
 * The cohort identity a stamped context carries, taken verbatim from the
 * validated baseline member. Derived from the accepted T151 member contract so
 * the two cannot drift apart.
 */
export type GeoMeasurementCohortContext = Pick<
  GeoMeasurementCohortMember,
  "projectId" | "marketProfileId" | "surfaceType" | "model" | "modelVersion"
>;

/**
 * One validated cohort: the caller's own ordered member list, returned by the
 * accepted T151 guard, and the explicit context stamp for that cohort.
 */
export type GeoMeasurementCohortContextStamp = {
  members: readonly GeoMeasurementCohortMember[];
  context: GeoMeasurementCohortContext;
};

/**
 * Verify the caller's members as one GEO measurement cohort and stamp that
 * cohort's explicit context.
 *
 * The accepted T151 guard is called exactly once with the caller's array, so a
 * rejection — an empty or malformed list, a malformed member, or a member from
 * another Project, market profile, surface, model, or model version — throws
 * the guard's own typed error unchanged and no stamp escapes. On success the
 * validated list comes back by identity beside a context whose five fields are
 * copied verbatim from the validated baseline (there is always one, because the
 * guard accepts no empty list). Nothing is trimmed, normalized, or otherwise
 * rewritten on the way into the context.
 */
export function stampGeoMeasurementCohortContext(
  members: readonly GeoMeasurementCohortMember[],
): GeoMeasurementCohortContextStamp {
  const validatedMembers = guardGeoMeasurementCohortIdentity(members);
  const baseline = validatedMembers[0];

  return {
    members: validatedMembers,
    context: {
      projectId: baseline.projectId,
      marketProfileId: baseline.marketProfileId,
      surfaceType: baseline.surfaceType,
      model: baseline.model,
      modelVersion: baseline.modelVersion,
    },
  };
}
