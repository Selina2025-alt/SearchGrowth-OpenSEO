import type { GeoObservationRun } from "@/types/schemas/geo-observation-run";
import {
  projectGeoObservationCohortMembers,
  type GeoObservationCohortMemberProjection,
} from "./geoObservationCohortMemberProjector";
import {
  stampGeoMeasurementCohortContext,
  type GeoMeasurementCohortContext,
  type GeoMeasurementCohortContextStamp,
} from "./geoMeasurementCohortContextStamp";

// ============================================================================
// GEO observation cohort context assembler
// (07_GEO_MEASUREMENT_SPEC.md §§1, 2, 4, 7; 05_DOMAIN_DATA_MODEL.md §§2, 6;
// ADR-003, ADR-005)
// ============================================================================
//
// The one composition boundary that turns a caller-supplied list of immutable
// observation-run rows into a T151-validated cohort beside the T152 structured
// context that cohort will carry. It owns no rule of its own: it hands the rows
// to the accepted T155 projector exactly once and the members that come back to
// the accepted T152 stamp exactly once, then returns what those two produced.
//
// Boundary declaration:
//   - Composition only. Exactly two accepted collaborators are called, once
//     each and in order: T155 projects the stored rows into T151 members and
//     verifies them as one cohort, then T152 verifies that same member list as a
//     cohort and stamps its context. This boundary adds no check, projection,
//     comparison, or measurement between or after them — it only chooses what to
//     return. It never calls the T151 guard itself; every cohort decision stays
//     inside the accepted boundaries, so nothing is revalidated or duplicated
//     here.
//   - It returns what the accepted boundaries already produced. `rows` is the
//     caller's own array as T155 returned it by identity; `members` is the
//     validated member list as T152 returned it by identity; `context` is T152's
//     structured five-field context, taken verbatim. Nothing is recomputed from
//     the rows, and no run id, sample count, completion decision, repeat
//     fraction, rate, metric, or confidence, and no prompt, language, window, or
//     parser field is attached.
//   - Fail closed by propagation. There is no error handling and no fallback: a
//     T155 projector rejection (an unusable stored `marketProfileId` or
//     `modelVersion`) and every T151 rejection reached through T155 or T152 (an
//     empty list, a malformed member field, an unsupported surface, or a
//     cross-context member) reaches the caller unchanged. No assembled result,
//     partial cohort, or partial context is ever returned.
//   - It is pure, deterministic, and storage-free. It opens no database,
//     repository, reader, provider, cache, parser, workflow, or environment; it
//     reads no raw evidence; it filters, sorts, de-duplicates, counts, samples,
//     and aggregates nothing; and the caller's array and rows are read only.
//     Same rows, same assembly.

/**
 * One assembled GEO measurement input: the caller's own ordered rows, the
 * T151-validated cohort projected from them, and the T152 structured context
 * that cohort carries. The three fields reuse the accepted boundaries' own
 * output types, so this view cannot drift from what T155 and T152 produce.
 */
export type GeoObservationCohortContextAssembly = {
  /** The caller's own ordered run list, returned by T155 by identity. */
  rows: GeoObservationCohortMemberProjection["rows"];
  /** One projected member per row, validated as one cohort by T151 via T152. */
  members: GeoMeasurementCohortContextStamp["members"];
  /** T152's five-field structured context for that cohort. */
  context: GeoMeasurementCohortContext;
};

/**
 * Compose the accepted T155 projection and T152 context stamp over
 * caller-supplied observation-run rows.
 *
 * The rows are handed to `projectGeoObservationCohortMembers` once, and the
 * member list it returns is handed to `stampGeoMeasurementCohortContext` once.
 * On success the caller gets the projector's own ordered row list, the stamp's
 * validated cohort, and the stamp's structured context, unchanged. The
 * projector's typed rejection for an unusable stored `marketProfileId` or
 * `modelVersion`, and every T151 rejection surfaced through either accepted
 * boundary, propagates untouched — so a rejected cohort yields no assembly, no
 * partial members, and no partial context. Nothing is caught, wrapped,
 * defaulted, mutated, filtered, sorted, de-duplicated, counted, or measured.
 */
export function assembleGeoObservationCohortContext(
  rows: readonly GeoObservationRun[],
): GeoObservationCohortContextAssembly {
  const projection = projectGeoObservationCohortMembers(rows);
  const stamp = stampGeoMeasurementCohortContext(projection.members);

  return {
    rows: projection.rows,
    members: stamp.members,
    context: stamp.context,
  };
}
