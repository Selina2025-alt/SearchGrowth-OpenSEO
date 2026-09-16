import { z } from "zod";

// ============================================================================
// GEO confidence classifier core (07_GEO_MEASUREMENT_SPEC.md §§1, 3, 4, 7;
// 05_DOMAIN_DATA_MODEL.md §§2, 5, 6; ADR-005)
// ============================================================================
//
// The narrow, storage-free classifier for §4's topic-aggregate confidence
// label. Given a caller-supplied cohort summary, it returns exactly one of
// `LOW`, `MEDIUM`, or `HIGH`.
//
// Boundary declaration:
//   - The caller supplies the cohort. §4 is a rule about an aggregate the
//     caller has already decided is compatible, so the caller hands over the
//     three facts the rule reads — `successfulObservationCount`,
//     `distinctPromptCount`, and `hasMajorSurfaceOrModelChangeWarning` — and
//     this module decides nothing else about them. It does not sample, count,
//     aggregate, or de-duplicate observations or prompts, does not select or
//     widen a cohort, does not mix surfaces/models (§1: different surfaces do
//     not share a numerator/denominator), and does not read a market profile
//     (§2/§5) or a run's surface/model facts (§6). A cohort that does not
//     belong together is a caller bug this module cannot see.
//   - Only the frozen §4 rule runs. Below the MEDIUM observation floor the
//     label is LOW; otherwise at or above the MEDIUM floors it is MEDIUM; and
//     at or above the HIGH floors with no major surface/model change warning
//     it is HIGH. A warning only withholds HIGH — it never downgrades a cohort
//     that already qualifies for MEDIUM. Every otherwise-insufficient
//     combination is LOW, so there is no fourth label and no "UNKNOWN".
//   - It makes no statistical claim. The output is a threshold label, not a
//     measurement: no numerator/denominator, percentage, ratio, rate (§7),
//     confidence interval, margin, p-value, or significance statement is
//     produced or implied, and repeats (§3) are not modeled — the caller's
//     `successfulObservationCount` is taken as given, never reconciled against
//     a repeat count.
//   - Input is validated before classifying, because the TypeScript type does
//     not exist at runtime and the caller may be untrusted. Both counts must be
//     finite, safe, non-negative integers and the warning flag must be a
//     boolean; anything else is rejected with a typed error naming the field.
//     A value is never coerced, rounded, clamped, truncated, floored, inferred
//     from its truthiness, or repaired, and the caller's object is never
//     mutated.
//   - It is pure and deterministic: same input, same label. It opens no
//     database, calls no repository, cache, provider, parser, or current-parse
//     selector (ADR-005), reads no raw observation/response text, and writes
//     nothing.

/** The three §4 labels. There is no other outcome. */
export type GeoConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

/** §4: LOW is below this many successful observations. */
const MEDIUM_MIN_SUCCESSFUL_OBSERVATIONS = 10;
/** §4: MEDIUM additionally requires this many distinct prompts. */
const MEDIUM_MIN_DISTINCT_PROMPTS = 3;
/** §4: HIGH starts at this many successful observations. */
const HIGH_MIN_SUCCESSFUL_OBSERVATIONS = 30;
/** §4: HIGH additionally requires this many distinct prompts. */
const HIGH_MIN_DISTINCT_PROMPTS = 5;

const COUNT_ERROR = "must be a finite, safe, non-negative integer";

/**
 * One count, held to the exact integer contract §4's thresholds assume. Each
 * check carries the same message so the rejection reads identically whatever
 * shape the invalid value takes: a fractional, unsafe, negative, `NaN`,
 * `Infinity`, string, or missing count is never rounded or coerced into range.
 */
const countSchema = z
  .number({ error: COUNT_ERROR })
  .int({ error: COUNT_ERROR })
  .nonnegative({ error: COUNT_ERROR })
  .refine(Number.isSafeInteger, { error: COUNT_ERROR });

/**
 * The caller's cohort summary: everything §4 reads and nothing more. The two
 * counts are the caller's own already-combined figures for one compatible
 * cohort — this module neither verifies nor recomputes them.
 */
export type GeoConfidenceCohortSummary = {
  /** Successful observations in the cohort, as counted by the caller. */
  successfulObservationCount: number;
  /** Distinct prompts the cohort covers, as counted by the caller. */
  distinctPromptCount: number;
  /**
   * Whether the caller recorded a major surface/model change over the
   * cohort's window (§§1, 6). Only HIGH is withheld by a warning.
   */
  hasMajorSurfaceOrModelChangeWarning: boolean;
};

const cohortSummarySchema = z.object({
  successfulObservationCount: countSchema,
  distinctPromptCount: countSchema,
  // Strictly a boolean: `0`, `1`, `"false"`, and `null` are rejected rather
  // than read for truthiness, so a warning can never be silently dropped.
  hasMajorSurfaceOrModelChangeWarning: z.boolean({
    error: "must be a boolean",
  }),
});

/**
 * Raised when a cohort summary is not usable. Names the offending field — a
 * missing or malformed member as its own name, or `input` when the call
 * argument is not an object at all — so a caller can attribute the rejection
 * without re-parsing the message.
 */
export class GeoConfidenceClassifierInputError extends Error {
  constructor(
    public readonly field: string,
    detail: string,
  ) {
    super(`GEO confidence classifier: ${field} ${detail}.`);
    this.name = "GeoConfidenceClassifierInputError";
  }
}

/**
 * Turn the first schema issue into the caller-facing rejection. The issue path
 * is relative to the summary object, so its joined path is already the field
 * name; an empty path means the argument itself was not a usable object.
 */
function toInputError(error: z.ZodError): GeoConfidenceClassifierInputError {
  const issue = error.issues[0];
  const field = issue?.path.join(".") ?? "";
  return new GeoConfidenceClassifierInputError(
    field === "" ? "input" : field,
    issue?.message ?? "is not valid",
  );
}

/**
 * Label one caller-supplied, already-compatible cohort with the frozen §4
 * confidence rule.
 *
 * LOW when there are fewer than 10 successful observations. Otherwise HIGH
 * when there are at least 30 successful observations, at least 5 distinct
 * prompts, and no major surface/model change warning. Otherwise MEDIUM when
 * there are at least 3 distinct prompts. Every other combination is LOW — a
 * warning withholds HIGH but leaves a qualifying MEDIUM intact.
 *
 * The summary is validated first, so an unusable count or warning throws
 * `GeoConfidenceClassifierInputError` naming its field instead of being
 * coerced into a label. The caller's object is read only and never mutated,
 * and the same summary always yields the same label.
 */
export function classifyGeoConfidence(
  input: GeoConfidenceCohortSummary,
): GeoConfidenceLevel {
  const result = cohortSummarySchema.safeParse(input);
  if (!result.success) {
    throw toInputError(result.error);
  }
  const {
    successfulObservationCount,
    distinctPromptCount,
    hasMajorSurfaceOrModelChangeWarning,
  } = result.data;

  if (successfulObservationCount < MEDIUM_MIN_SUCCESSFUL_OBSERVATIONS) {
    return "LOW";
  }
  if (
    successfulObservationCount >= HIGH_MIN_SUCCESSFUL_OBSERVATIONS &&
    distinctPromptCount >= HIGH_MIN_DISTINCT_PROMPTS &&
    !hasMajorSurfaceOrModelChangeWarning
  ) {
    return "HIGH";
  }
  if (distinctPromptCount >= MEDIUM_MIN_DISTINCT_PROMPTS) {
    return "MEDIUM";
  }
  return "LOW";
}
