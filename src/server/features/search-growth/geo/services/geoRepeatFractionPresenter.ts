import { z } from "zod";

// ============================================================================
// GEO repeat fraction presenter (07_GEO_MEASUREMENT_SPEC.md §§2, 3, 4, 7;
// 21_TEST_ACCEPTANCE_PLAN.md §§3, 4)
// ============================================================================
//
// The narrow, storage-free presenter for §3's repeat fraction. §3 shows a
// single Prompt as `2/3` rather than only `66.7%`, because a lone percentage
// manufactures a precision the sample does not have; the exact completed and
// requested counts are the honest display. So this module renders the caller's
// own two counts and computes nothing.
//
// Boundary declaration:
//   - It presents, it does not measure. The caller supplies an already-counted
//     `completedSampleCount` and the `requestedRepeatCount` it sampled under.
//     The result carries those two values unchanged beside the exact text
//     `<completed>/<requested>`. No numerator/denominator, percentage, ratio,
//     rate, metric, confidence label, interval, or significance statement is
//     computed or implied (§§4, 7), and the display text never contains a
//     rounded, truncated, or decimal value.
//   - It counts nothing and samples nothing. No observation is observed,
//     sampled, parsed, read, stored, queried, de-duplicated, summed, or
//     aggregated; no cohort is selected or widened; no provider, model,
//     surface, market, cache, repository, parser, or raw evidence is reached
//     (§§1, 2, 5, 6); and the repeat setting is never re-derived. Both counts
//     are taken exactly as the caller supplied them.
//   - The §3 repeat policy is enforced as the display contract, at the
//     boundary. Only the two approved settings — 3 (default) and 5 (high-value)
//     — can be presented, and a completion can never exceed its request. A
//     count outside that shape is a caller bug rather than a display to repair,
//     so it is rejected instead of being clamped, rounded, trimmed, defaulted,
//     inferred, or partially rendered.
//   - Input is validated before rendering, because the TypeScript type does not
//     exist at runtime and the caller may be untrusted. Both counts must be
//     finite, safe, non-negative integers, and the request must be an approved
//     setting; anything else — a missing or non-number value, a fractional,
//     unsafe, negative, `NaN`, or infinite number, an unsupported repeat count,
//     or a completion beyond its request — is rejected with a typed error
//     naming the field. No value is coerced, rounded, clamped, or repaired, and
//     the caller's object is never mutated.
//   - It is pure and deterministic: same input, same display. It opens no
//     database, calls no service, and writes nothing.

/** §3: the default repeat setting for a fresh sample. */
const DEFAULT_REPEAT_COUNT = 3;
/** §3: the high-value Prompt repeat setting. */
const HIGH_VALUE_REPEAT_COUNT = 5;

const COUNT_ERROR = "must be a finite, safe, non-negative integer";
const REPEAT_COUNT_ERROR = `must be exactly ${DEFAULT_REPEAT_COUNT} or ${HIGH_VALUE_REPEAT_COUNT}`;

/**
 * One count, held to the exact integer contract §3's fraction assumes. Each
 * check carries the same message so the rejection reads identically whatever
 * shape the invalid value takes: a fractional, unsafe, negative, `NaN`,
 * `Infinity`, string, or missing count is never rounded or coerced into range.
 */
const countSchema = z
  .number({ error: COUNT_ERROR })
  .int({ error: COUNT_ERROR })
  .nonnegative({ error: COUNT_ERROR })
  .refine(Number.isSafeInteger, { error: COUNT_ERROR });

/** §3: only the default and high-value settings may be presented. */
const repeatCountSchema = countSchema.refine(
  (value) =>
    value === DEFAULT_REPEAT_COUNT || value === HIGH_VALUE_REPEAT_COUNT,
  { error: REPEAT_COUNT_ERROR },
);

/**
 * The caller's repeat fraction: the two counts §3's display is made of and
 * nothing more. Both are the caller's own already-counted figures for one
 * Prompt — this module neither verifies nor recomputes them.
 */
export type GeoRepeatFractionInput = {
  /** Samples the caller completed for this Prompt, as counted by the caller. */
  completedSampleCount: number;
  /** The repeat setting the caller sampled under: exactly 3 or 5 (§3). */
  requestedRepeatCount: number;
};

const inputSchema = z.object({
  completedSampleCount: countSchema,
  requestedRepeatCount: repeatCountSchema,
});

/**
 * The presented fraction: the caller's two counts, preserved exactly, beside
 * the exact `<completed>/<requested>` display text. There is no other field,
 * so no percentage, rate, or metric can ride along.
 */
export type GeoRepeatFractionDisplay = {
  completedSampleCount: number;
  requestedRepeatCount: number;
  /** Exact `<completed>/<requested>` text; never a percentage or a decimal. */
  displayText: string;
};

/**
 * Raised when a repeat fraction cannot be presented. Names the offending field
 * — a missing or malformed count as its own name, or `input` when the call
 * argument is not an object at all — so a caller can attribute the rejection
 * without re-parsing the message.
 */
export class GeoRepeatFractionPresenterInputError extends Error {
  constructor(
    public readonly field: string,
    detail: string,
  ) {
    super(`GEO repeat fraction presenter: ${field} ${detail}.`);
    this.name = "GeoRepeatFractionPresenterInputError";
  }
}

/**
 * Turn the first schema issue into the caller-facing rejection. The issue path
 * is relative to the input object, so its joined path is already the field
 * name; an empty path means the argument itself was not a usable object.
 */
function toInputError(error: z.ZodError): GeoRepeatFractionPresenterInputError {
  const issue = error.issues[0];
  const field = issue?.path.join(".") ?? "";
  return new GeoRepeatFractionPresenterInputError(
    field === "" ? "input" : field,
    issue?.message ?? "is not valid",
  );
}

/**
 * Present one caller-supplied repeat fraction exactly as §3 displays it.
 *
 * The counts are validated first, so an unusable, unsupported, or impossible
 * fraction throws `GeoRepeatFractionPresenterInputError` naming its field
 * instead of being coerced into a display. A completion above its request is
 * named on `completedSampleCount`, the value that breaks the contract, because
 * §3 presents how many of the requested repeats completed and never a
 * completion that could not have happened.
 *
 * On success the result carries both counts unchanged — no rounding, clamping,
 * normalization, or repair — beside `displayText`. The caller's object is read
 * only and never mutated, and the same input always yields the same display.
 */
export function presentGeoRepeatFraction(
  input: GeoRepeatFractionInput,
): GeoRepeatFractionDisplay {
  const result = inputSchema.safeParse(input);
  if (!result.success) {
    throw toInputError(result.error);
  }
  const { completedSampleCount, requestedRepeatCount } = result.data;

  if (completedSampleCount > requestedRepeatCount) {
    throw new GeoRepeatFractionPresenterInputError(
      "completedSampleCount",
      `must not exceed requestedRepeatCount (${requestedRepeatCount})`,
    );
  }

  return {
    completedSampleCount,
    requestedRepeatCount,
    displayText: `${completedSampleCount}/${requestedRepeatCount}`,
  };
}
