import { z } from "zod";

// ============================================================================
// GEO measurement cohort identity guard core
// (07_GEO_MEASUREMENT_SPEC.md §§1, 4, 7; 05_DOMAIN_DATA_MODEL.md §§2, 6)
// ============================================================================
//
// The narrow, storage-free guard a future metric aggregation crosses before it
// reads caller-supplied GEO measurement members. It answers exactly one
// question: do these members belong to one explicit, compatible
// Project/market/surface/model cohort? On success it hands the caller's own
// ordered list straight back.
//
// Boundary declaration:
//   - It guards identity, and only identity. The caller supplies the members
//     (one per observation it already decided to measure); this module checks
//     that every member carries the six identifiers a measurement needs and
//     that the five cohort-defining ones agree, then returns the list. It does
//     not construct a summary, metric, numerator, denominator, rate, or label.
//   - §1 and §7 are the reason each identifier is explicit. Different surfaces
//     must never share a measurement cohort, and every metric must retain its
//     market profile and model/version identity, so a cohort is only accepted
//     when all of those agree across its members. A member from another
//     Project, market, surface, model, or model version is a caller bug, and it
//     is rejected rather than silently dropped or folded in.
//   - It judges nothing else. It does not decide whether a run succeeded, count
//     samples or prompts, calculate a rate or ratio, classify confidence (§4),
//     derive data-quality warnings, select a time window, or make any
//     statistical claim. It reads no raw observation or provider evidence, and
//     it opens no database, repository, provider, cache, or parser.
//   - It is fail-closed and total. Every runtime field is validated before
//     acceptance, so a missing, blank, or malformed identifier or a
//     cross-context member throws a typed error naming the member index and
//     field. Nothing is ever coerced, normalized, trimmed, mutated, filtered,
//     sorted, de-duplicated, or repaired; a duplicate member is a
//     legitimate repeat observation and is preserved, and no partial cohort can
//     escape.
//   - It is pure and deterministic: same members, same result, and the caller's
//     array and member objects are read only and returned by identity.

/** The six identifiers every measurement member must carry explicitly. */
export type GeoMeasurementCohortMember = {
  /** The immutable run this member came from (05_DOMAIN_DATA_MODEL.md §6). */
  runId: string;
  /** The owning Project. */
  projectId: string;
  /** The explicit market profile (§2): no `GLOBAL` guess is accepted. */
  marketProfileId: string;
  /** The observation surface (§1): surfaces never share a cohort. */
  surfaceType: string;
  /** The model that produced the observation (§6). */
  model: string;
  /** The model version, so a model change cannot pass as one cohort (§7). */
  modelVersion: string;
};

/** The names of those identifiers, for the guard's rejection vocabulary. */
type GeoMeasurementCohortMemberField = keyof GeoMeasurementCohortMember;

/**
 * The five identifiers that define one cohort (§§1, 2, 6, 7). `runId` is
 * deliberately absent: each repeat is its own run identity, so members are
 * expected to differ there while agreeing everywhere else.
 */
const COHORT_IDENTITY_FIELDS = [
  "projectId",
  "marketProfileId",
  "surfaceType",
  "model",
  "modelVersion",
] as const satisfies ReadonlyArray<GeoMeasurementCohortMemberField>;

const IDENTIFIER_ERROR = "must be a non-empty string";

/**
 * A present, non-blank identifier, returned verbatim. `\S` requires at least one
 * non-whitespace character, so `""`, `"   "`, and `"\n"` are rejected while a
 * value with surrounding whitespace is accepted exactly as supplied — nothing
 * is trimmed or normalized into an identity the caller did not provide.
 */
function isPresentIdentifier(value: string): boolean {
  return /\S/.test(value);
}

const identifierSchema = z
  .string({ error: IDENTIFIER_ERROR })
  .refine(isPresentIdentifier, { error: IDENTIFIER_ERROR });

/**
 * The Observation Surface kinds Spec §1 admits, verbatim (07_GEO_MEASUREMENT_SPEC.md
 * §1). A surface is an identity dimension, so an invented one has no cohort to
 * belong to: an unsupported surface is rejected at its member index before a
 * baseline is established or a cohort returned, rather than accepted because
 * every member happens to repeat the same string. The four kinds stay
 * distinguishable — nothing is normalized or folded into another — so §1's rule
 * that different surfaces never share a numerator/denominator cannot be
 * bypassed by relabeling.
 */
const OBSERVATION_SURFACE_TYPES = [
  "AGGREGATED_SEARCH_DATA",
  "MODEL_API_SEARCH",
  "CONSUMER_PRODUCT_OBSERVED",
  "MANUAL_CONSUMER_OBSERVATION",
] as const;

const SURFACE_TYPE_ERROR = "must be a supported observation surface";

const surfaceTypeSchema = z.enum(OBSERVATION_SURFACE_TYPES, {
  error: SURFACE_TYPE_ERROR,
});

const cohortMemberSchema = z.object({
  runId: identifierSchema,
  projectId: identifierSchema,
  marketProfileId: identifierSchema,
  surfaceType: surfaceTypeSchema,
  model: identifierSchema,
  modelVersion: identifierSchema,
});

/**
 * The list itself: ordered and non-empty. An empty collection has no baseline
 * member, so there is no cohort to verify and nothing to return.
 */
const cohortMembersSchema = z
  .array(cohortMemberSchema)
  .min(1, { error: "must be a non-empty list of measurement members" });

/**
 * Raised when a caller-supplied member list cannot be accepted as one cohort.
 * Names the offending member index (`null` when the list itself is unusable)
 * and field — a member's own identifier, `member` when a member is not an
 * object at all, or `members` when the argument is not a non-empty list — so a
 * caller can attribute the rejection without re-parsing the message.
 */
export class GeoMeasurementCohortIdentityError extends Error {
  constructor(
    public readonly memberIndex: number | null,
    public readonly field: string,
    detail: string,
  ) {
    super(
      memberIndex === null
        ? `GEO measurement cohort identity: members ${detail}.`
        : `GEO measurement cohort identity: member ${memberIndex} ${field} ${detail}.`,
    );
    this.name = "GeoMeasurementCohortIdentityError";
  }
}

/**
 * Turn the first schema issue into the caller-facing rejection. Zod reports
 * issues in document order, so the first one is the earliest offending member
 * and field; an empty path means the list itself was unusable, a one-element
 * path means that member was not an object.
 */
function toIdentityError(error: z.ZodError): GeoMeasurementCohortIdentityError {
  const issue = error.issues[0];
  const path = issue?.path ?? [];
  const detail = issue?.message ?? "is not valid";
  if (path.length === 0) {
    return new GeoMeasurementCohortIdentityError(null, "members", detail);
  }
  const memberIndex = typeof path[0] === "number" ? path[0] : null;
  const field = path.length > 1 ? path.slice(1).join(".") : "member";
  return new GeoMeasurementCohortIdentityError(memberIndex, field, detail);
}

/**
 * Verify that a caller-supplied, ordered member list is one explicit and
 * compatible Project/market/surface/model cohort, and return that same list by
 * identity.
 *
 * Requiring a non-empty list establishes the first member as the cohort
 * baseline. Each later member must then carry the same project id, market
 * profile id, surface type, model, and model version; its run id is validated
 * but not compared, because repeats are separate runs of one observation. The
 * first unsatisfied requirement throws
 * `GeoMeasurementCohortIdentityError` naming the member index and field, so no
 * partial cohort is ever returned.
 *
 * The members are validated first, because the TypeScript type does not exist
 * at runtime and the caller may be untrusted. The caller's array and member
 * objects are read only and are never mutated, and the same list always yields
 * the same outcome.
 */
export function guardGeoMeasurementCohortIdentity(
  members: readonly GeoMeasurementCohortMember[],
): readonly GeoMeasurementCohortMember[] {
  const result = cohortMembersSchema.safeParse(members);
  if (!result.success) {
    throw toIdentityError(result.error);
  }

  // Validated copies are read for comparison; the caller's own list is what
  // comes back, so the returned references are the ones that were passed in.
  const cohort = result.data;
  const baseline = cohort[0];

  for (let index = 1; index < cohort.length; index += 1) {
    const member = cohort[index];
    for (const field of COHORT_IDENTITY_FIELDS) {
      if (member[field] !== baseline[field]) {
        throw new GeoMeasurementCohortIdentityError(
          index,
          field,
          `must match the cohort baseline: expected "${baseline[field]}", received "${member[field]}"`,
        );
      }
    }
  }

  return members;
}
