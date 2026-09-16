import {
  GeoExactEntityMentionInputError,
  type GeoExactEntityMentionCandidate,
  type GeoExactEntityMentionMatchInput,
} from "./geoExactEntityMentionMatcher";

// Shared fixtures for the exact entity-mention matcher specs (mirrors
// src/server/features/ga4/services/ga4-test-fixtures.ts): one valid
// candidate/input factory, plus the deliberately-invalid builders the
// rejection spec drives the runtime boundary with.
//
// `makeInvalidCandidate`/`makeInvalidInput` exist because the matcher's
// TypeScript types do not exist at runtime — an untrusted caller can hand it
// anything, which is exactly what the input validation must reject.

export function makeCandidate(
  overrides: Partial<GeoExactEntityMentionCandidate> = {},
): GeoExactEntityMentionCandidate {
  return {
    projectId: "proj_1",
    entityId: "ent_1",
    surface: "Acme",
    source: { kind: "CANONICAL_NAME" },
    ...overrides,
  };
}

export function makeInput(
  overrides: Partial<GeoExactEntityMentionMatchInput> = {},
): GeoExactEntityMentionMatchInput {
  return {
    projectId: "proj_1",
    text: "Acme",
    candidates: [makeCandidate()],
    ...overrides,
  };
}

/** A candidate carrying a deliberately invalid runtime value for one field. */
export function makeInvalidCandidate(
  overrides: Record<string, unknown>,
): GeoExactEntityMentionCandidate {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the matcher must reject at runtime
  return {
    ...makeCandidate(),
    ...overrides,
  } as unknown as GeoExactEntityMentionCandidate;
}

/** An input carrying a deliberately invalid runtime value for one field. */
export function makeInvalidInput(
  overrides: Record<string, unknown>,
): GeoExactEntityMentionMatchInput {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the matcher must reject at runtime
  return {
    ...makeInput(),
    ...overrides,
  } as unknown as GeoExactEntityMentionMatchInput;
}

/** An input whose single candidate carries one deliberately invalid field. */
export function invalidCandidateList(
  overrides: Record<string, unknown>,
): GeoExactEntityMentionMatchInput {
  return makeInvalidInput({
    candidates: [makeInvalidCandidate(overrides)],
  });
}

/** Run the matcher and return the rejection it must have raised. */
export function captureInputError(
  run: () => unknown,
): GeoExactEntityMentionInputError {
  try {
    run();
  } catch (error) {
    if (error instanceof GeoExactEntityMentionInputError) return error;
    throw error;
  }
  throw new Error("expected the matcher to reject the input");
}
