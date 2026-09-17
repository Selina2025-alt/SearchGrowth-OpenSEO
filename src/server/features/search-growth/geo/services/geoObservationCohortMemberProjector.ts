import { z } from "zod";
import type { GeoObservationRun } from "@/types/schemas/geo-observation-run";
import {
  guardGeoMeasurementCohortIdentity,
  type GeoMeasurementCohortMember,
} from "./geoMeasurementCohortIdentityGuard";

// ============================================================================
// GEO observation cohort member projector
// (07_GEO_MEASUREMENT_SPEC.md §§1, 2, 4, 7; 05_DOMAIN_DATA_MODEL.md §§2, 6;
// ADR-003, ADR-005)
// ============================================================================
//
// The one projection boundary between accepted immutable observation-run rows
// (the accepted T154 batch reader's output) and the accepted T151 cohort-member
// contract. For each caller-supplied stored row it copies the six identity
// columns into one member, preserving the caller's order, and then hands the
// projected list to the accepted guard exactly once. It makes no measurement.
//
// Boundary declaration:
//   - Projection only. Six stored columns are copied into a member: the row's
//     `id` becomes `runId`, and `projectId`, `marketProfileId`, `surfaceType`,
//     `model`, and `modelVersion` keep their names and values. Nothing is
//     derived, joined, hashed, serialized, defaulted, trimmed, normalized, or
//     substituted, so the identity a member carries is the identity the row
//     stored and never one this boundary invented.
//   - The caller's list is preserved. Members come back in row order, one per
//     row, duplicates included, and the caller's own array is returned untouched
//     under `rows` by identity. Nothing is filtered, sorted, de-duplicated,
//     re-batched, or sampled, and no row is preferred or dropped.
//   - The two stored provenance columns `marketProfileId` and `modelVersion` are
//     nullable in storage while the T151 member contract requires them as
//     non-empty strings, so they are the one thing this boundary checks and the
//     reason it exists: a row that cannot supply them is rejected with a typed
//     error naming the row index and column before any projection is returned.
//     §7 requires every metric to retain its market profile and model/version
//     identity, so a null, absent, blank, or otherwise unusable value is
//     rejected rather than defaulted, derived, trimmed, or substituted. The third
//     nullable provenance column, `model`, is deliberately not checked here: it
//     is copied straight from the row and the T151 member contract owns its
//     validation, so a malformed model is the guard's rejection, not this
//     boundary's. No other stored column is read.
//   - The accepted T151 guard is the cohort authority. The projected members are
//     handed to `guardGeoMeasurementCohortIdentity` once, so an empty list, a
//     malformed `model` or other member field, an unsupported surface, or a
//     member from another Project, market profile, surface, model, or model
//     version is rejected by the guard's own typed error, propagated unchanged.
//     Nothing is re-validated, caught, wrapped, or repaired here, and no partial
//     projection escapes.
//   - It is storage-free, pure, and deterministic. It opens no database,
//     repository, reader, provider, cache, parser, workflow, or environment; it
//     reads no raw evidence; it counts nothing and computes no sample size,
//     fraction, rate, ratio, metric, or confidence label. Same rows, same
//     projection.

const SOURCE_IDENTITY_ERROR = "must be a non-empty string";

/**
 * A present, non-blank stored value. `\S` requires at least one non-whitespace
 * character, so `""`, `"   "`, and `"\n"` are unusable while a value with
 * surrounding whitespace is accepted exactly as stored — nothing is trimmed or
 * normalized into an identity the row did not carry.
 */
function isPresentIdentity(value: string): boolean {
  return /\S/.test(value);
}

/** The two stored identity columns this boundary owns as non-empty strings. */
const sourceIdentitySchema = z
  .string({ error: SOURCE_IDENTITY_ERROR })
  .refine(isPresentIdentity, { error: SOURCE_IDENTITY_ERROR });

/**
 * One stored run row, narrowed to exactly the two nullable provenance columns
 * this boundary owns. The row type does not exist at runtime and the caller may
 * be untrusted, so these two are validated before any member is built. The third
 * nullable provenance column, `model`, is deliberately absent: it is copied
 * straight into the member and the T151 member contract — not this boundary —
 * owns its validation. Every other column is likewise left to the guard, which
 * owns the member contract, the supported surface set, and cohort compatibility.
 */
const sourceRowSchema = z.object({
  marketProfileId: sourceIdentitySchema,
  modelVersion: sourceIdentitySchema,
});

/**
 * The list itself. An empty list is deliberately accepted here and passed on:
 * T151 owns the non-empty-cohort rule and rejects it with its own error.
 */
const sourceRowsSchema = z.array(sourceRowSchema);

/**
 * The projection result: the caller's own ordered row list, returned by
 * identity, beside one projected member per row in that same order.
 */
export type GeoObservationCohortMemberProjection = {
  /** The very array the caller passed; never copied, filtered, or re-ordered. */
  rows: readonly GeoObservationRun[];
  /** One member per row, in row order, accepted once by the T151 guard. */
  members: readonly GeoMeasurementCohortMember[];
};

/**
 * Raised when a stored run row cannot be projected into a cohort member. Names
 * the offending row index (`null` when the argument itself is not a list) and
 * field — a source column, `row` when a row is not an object at all, or `rows`
 * when the argument is not a list — so a caller can attribute the rejection
 * without re-parsing the message.
 */
export class GeoObservationCohortMemberProjectionError extends Error {
  constructor(
    public readonly rowIndex: number | null,
    public readonly field: string,
    detail: string,
  ) {
    super(
      rowIndex === null
        ? `GEO observation cohort member projection: rows ${detail}.`
        : `GEO observation cohort member projection: row ${rowIndex} ${field} ${detail}.`,
    );
    this.name = "GeoObservationCohortMemberProjectionError";
  }
}

/**
 * Turn the first schema issue into the caller-facing rejection. Zod reports
 * issues in document order, so the first one is the earliest offending row and
 * column; a path with no first element means the argument was not a list, and a
 * path with no second element means that row was not an object.
 */
function toProjectionError(
  error: z.ZodError,
): GeoObservationCohortMemberProjectionError {
  const issue = error.issues[0];
  if (issue === undefined) {
    return new GeoObservationCohortMemberProjectionError(
      null,
      "rows",
      "is not valid",
    );
  }
  const path: ReadonlyArray<unknown> = issue.path;
  if (path[0] === undefined) {
    return new GeoObservationCohortMemberProjectionError(
      null,
      "rows",
      issue.message,
    );
  }
  const rowIndex = typeof path[0] === "number" ? path[0] : null;
  const field = path[1] === undefined ? "row" : path.slice(1).join(".");
  return new GeoObservationCohortMemberProjectionError(
    rowIndex,
    field,
    issue.message,
  );
}

/**
 * Project caller-supplied immutable observation-run rows into T151 cohort
 * members, preserving the caller's order, and verify them once as a cohort.
 *
 * Each row's six stored identity columns are copied into one member — `id` to
 * `runId`, the rest by name — after `marketProfileId` and `modelVersion` are
 * confirmed usable. The first unusable row throws
 * `GeoObservationCohortMemberProjectionError` naming its index and column, so no
 * partial or repaired projection is ever returned and no identity is defaulted.
 * `model` is copied exactly as the row stores it, with no check of this
 * boundary's own: the T151 member contract owns that validation.
 *
 * The projected members are then handed to the accepted T151 guard exactly once;
 * its typed error propagates unchanged, which is what proves the cohort carries
 * one Project, market profile, supported surface, model, and model version. A
 * malformed `model` is therefore rejected by the guard, naming the member index
 * that already equals the row index, rather than pre-empted here. The caller's
 * array and row objects are read only, and the same rows always yield the same
 * projection.
 */
export function projectGeoObservationCohortMembers(
  rows: readonly GeoObservationRun[],
): GeoObservationCohortMemberProjection {
  const result = sourceRowsSchema.safeParse(rows);
  if (!result.success) {
    throw toProjectionError(result.error);
  }

  const members: GeoMeasurementCohortMember[] = rows.map((row, index) => {
    const identity = result.data[index];
    return {
      runId: row.id,
      projectId: row.projectId,
      marketProfileId: identity.marketProfileId,
      surfaceType: row.surfaceType,
      // Compile-time narrowing only. The stored `model` column is nullable while
      // the T151 member contract requires a string, but this boundary does not
      // own that check: the value is copied exactly as stored, with no default,
      // trim, or substitution, and the guard rejects a malformed one at runtime.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- unchecked by design; T151 owns the model contract
      model: row.model as string,
      modelVersion: identity.modelVersion,
    };
  });

  return {
    rows,
    members: guardGeoMeasurementCohortIdentity(members),
  };
}
