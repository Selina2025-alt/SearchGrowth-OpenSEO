import type { GeoCitationFact } from "./geoCitationRecorder";
import type { GeoEntityMentionFact } from "./geoEntityMentionRecorder";
import type { GeoObservationParseFact } from "./geoObservationParseRecorder";

// ============================================================================
// GEO parse output bundle consistency boundary (ADR-005,
// 05_DOMAIN_DATA_MODEL.md §7, 07_GEO_MEASUREMENT_SPEC.md §§5–6)
// ============================================================================
//
// The narrow, storage-free contract between one concrete, versioned parse's
// output and the recorder orchestration that later consumes it: exactly one
// `GeoObservationParseFact` produced by that parse, plus that parse's
// zero-or-more entity-mention facts and zero-or-more citation facts.
//
// One invariant only: every child fact must belong to the same Project as the
// bundle's parse fact and must be bound to that exact parse (`child.parseId ===
// parse.id`). This is the boundary that stops facts from another Project, or
// from another parse version of the same run, from reaching a recorder under
// the wrong parent — a versioned-parser upgrade appends a new version's facts
// beside the prior version's, so a mixed bundle would silently publish the
// wrong version's measurements (ADR-005, Parse-version isolation).
//
// Boundary declaration:
//   - The contract reuses the accepted T140 `GeoObservationParseFact`, T141
//     `GeoEntityMentionFact`, and T142 `GeoCitationFact` types verbatim; it
//     declares no leaf shape of its own and validates no leaf value.
//   - The guard reads `projectId` and `parseId` and compares them for strict
//     equality. It never coerces, derives, replaces, infers, or repairs a
//     value, and it has no notion of which parse is "current".
//   - The guard is pure. It does not mutate, freeze, clone, serialize,
//     normalize, deduplicate, or inspect the bundle, its facts, or any raw
//     evidence; it opens no database, calls no recorder, and imposes no
//     business uniqueness rule. Leaf validation and every persistence concern
//     remain the accepted recorders' responsibility.
//   - Returning the caller's bundle by identity is the contract: the guard is
//     a gate, not a transformation, so nothing downstream can observe a
//     rebuilt or re-shaped bundle.

/** The child fact collections a bundle carries. */
type GeoParseOutputBundleChildCollection = "entityMentions" | "citations";

/**
 * A caller-supplied output bundle of one concrete versioned parse: the parse
 * fact itself plus that parse's child facts. The shape — one `parse`, two
 * arrays — is the "exactly one parse fact, zero-or-more children" contract.
 */
export type GeoParseOutputBundle = {
  /** The one concrete, versioned parse every child fact below came from. */
  parse: GeoObservationParseFact;
  entityMentions: GeoEntityMentionFact[];
  citations: GeoCitationFact[];
};

/**
 * Raised when a child fact does not belong to the bundle's parse fact. Names
 * the offending collection and index — and carries both as fields — so an
 * audit trail can attribute the rejection without re-parsing the message.
 */
export class GeoParseOutputBundleIdentityError extends Error {
  constructor(
    public readonly collection: GeoParseOutputBundleChildCollection,
    public readonly index: number,
    detail: string,
  ) {
    super(`GEO parse output bundle: ${collection}[${index}] ${detail}`);
    this.name = "GeoParseOutputBundleIdentityError";
  }
}

function assertChildIdentity(
  parse: GeoObservationParseFact,
  collection: GeoParseOutputBundleChildCollection,
  child: { projectId: string; parseId: string },
  index: number,
): void {
  if (child.projectId !== parse.projectId) {
    throw new GeoParseOutputBundleIdentityError(
      collection,
      index,
      `belongs to project "${child.projectId}", but the bundle's parse fact belongs to project "${parse.projectId}".`,
    );
  }
  if (child.parseId !== parse.id) {
    throw new GeoParseOutputBundleIdentityError(
      collection,
      index,
      `is bound to parse "${child.parseId}", but the bundle's parse fact is "${parse.id}".`,
    );
  }
}

/**
 * Verify that every child fact belongs to the bundle's parse fact, and return
 * the very same bundle object on success.
 *
 * Every entity mention and every citation is checked against the parse fact's
 * `projectId` and `id`; the first offending fact throws
 * `GeoParseOutputBundleIdentityError`. An empty child collection is valid, and
 * so is more than one child per collection — this guard enforces identity, not
 * uniqueness or cardinality.
 */
export function validateGeoParseOutputBundle(
  bundle: GeoParseOutputBundle,
): GeoParseOutputBundle {
  bundle.entityMentions.forEach((mention, index) =>
    assertChildIdentity(bundle.parse, "entityMentions", mention, index),
  );
  bundle.citations.forEach((citation, index) =>
    assertChildIdentity(bundle.parse, "citations", citation, index),
  );
  return bundle;
}
