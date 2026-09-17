import { readGeoObservationBatchCohortContext } from "./geoObservationBatchCohortContextService";
import {
  presentGeoRepeatFraction,
  type GeoRepeatFractionDisplay,
} from "./geoRepeatFractionPresenter";

// ============================================================================
// GEO batch repeat fraction context service
// (07_GEO_MEASUREMENT_SPEC.md §§1–4 and 7; 05_DOMAIN_DATA_MODEL.md §§2 and 6;
// ADR-003, ADR-005)
// ============================================================================
//
// The one read boundary that turns a Project-and-batch selector plus a requested
// repeat setting into that batch's immutable rows, the T151-validated cohort
// projected from them, the T152 context that cohort carries, and T153's exact
// repeat-fraction display for the stored completions. It owns no measurement of
// its own: it composes the accepted T157 batch cohort context with the accepted
// T153 presenter.
//
// Boundary declaration:
//   - Two accepted calls, in this order, and nothing else. Exactly one
//     `readGeoObservationBatchCohortContext` call reads the caller's
//     Project-and-batch selector through the accepted T157 boundary, and exactly
//     one `presentGeoRepeatFraction` call renders the T153 display for that
//     read. T157's own `rows`, `members`, and `context` are returned as-is, by
//     identity. No second read, no batch-only lookup, and no independent query
//     exists here — the Project scope and the cohort decision were already made
//     inside the accepted T157 boundary.
//   - One count, and no meaning beyond it. The only arithmetic at this boundary
//     is counting the returned rows whose stored status is exactly `SUCCEEDED`.
//     That count is the completed-sample figure §3 displays; a row with any other
//     stored status is excluded from the count and is otherwise left alone. No
//     row is judged, retried, re-run, or re-statused, no batch is declared
//     complete or partial, and no second batch is chosen. The counted figure is
//     handed straight to T153, which owns the §3 display contract, so no
//     percentage, rate, ratio, metric, confidence, or statistical claim is ever
//     computed here.
//   - The caller's repeat request is opaque. `requestedRepeatCount` is forwarded
//     verbatim to T153 and never defaulted, coerced, rounded, or repaired. T153
//     owns the approved 3-or-5 setting and the completion-not-above-request rule,
//     so re-checking either here would duplicate a rule that already has one
//     owner and risk this boundary accepting something that boundary rejects.
//   - Fail closed by propagation. There is no error handling, no fallback, and no
//     default: T157's selector rejection, its storage failure, and every cohort
//     rejection it surfaces from T151/T152/T155/T156, plus T153's input
//     rejection, reach the caller unchanged. A failed read is never reported as a
//     zero fraction, and no partial rows, members, context, or display is ever
//     returned.
//   - It adds nothing else. Nothing is filtered, sorted, de-duplicated, sampled,
//     or selected from another batch, and raw evidence is never re-read,
//     rewritten, redacted, or copied into a new shape. The returned rows,
//     members, and evidence are the stored ones, read only.

/**
 * One batch's repeat-fraction context: everything the accepted T157 boundary
 * returns — its ordered `rows`, validated `members`, and five-field `context` —
 * plus the accepted T153 display. Reusing T157's own return type means this view
 * cannot drift from what that boundary produces, and the intersection adds
 * exactly one field, so no fourth figure can ride along.
 */
type GeoBatchRepeatFractionContext = Awaited<
  ReturnType<typeof readGeoObservationBatchCohortContext>
> & {
  /** T153's exact repeat-fraction display for the stored completions. */
  display: GeoRepeatFractionDisplay;
};

/**
 * Read one Project's batch through the accepted T157 boundary and present the
 * accepted T153 repeat fraction for its stored `SUCCEEDED` runs.
 *
 * The caller supplies T157's two selectors plus the requested repeat setting.
 * The single Project-scoped read and cohort validation happen inside T157, so
 * another Project's rows are excluded even when they reuse the same batch id and
 * the returned cohort is the accepted one. Among those returned rows, only the
 * ones whose stored status is exactly `SUCCEEDED` are counted; every other row,
 * whatever its status, stays in `rows` and `members` untouched. That completed
 * count and the caller's requested repeat count are handed to T153 exactly once,
 * and its display object is returned unchanged.
 *
 * Every failure propagates by identity rather than becoming a zero fraction: an
 * unusable selector or a database failure from T157, any cohort rejection it
 * surfaces from T151/T152/T155/T156 — including the rejection of an empty batch
 * — and T153's own rejection of an unsupported repeat setting or a completion
 * above its request all surface to the caller with no rows, no members, no
 * context, and no display.
 */
export async function readGeoBatchRepeatFractionContext(
  projectId: string,
  batchId: string,
  requestedRepeatCount: number,
): Promise<GeoBatchRepeatFractionContext> {
  const assembly = await readGeoObservationBatchCohortContext(
    projectId,
    batchId,
  );

  let completedSampleCount = 0;
  for (const row of assembly.rows) {
    if (row.status === "SUCCEEDED") {
      completedSampleCount += 1;
    }
  }

  return {
    rows: assembly.rows,
    members: assembly.members,
    context: assembly.context,
    display: presentGeoRepeatFraction({
      completedSampleCount,
      requestedRepeatCount,
    }),
  };
}
