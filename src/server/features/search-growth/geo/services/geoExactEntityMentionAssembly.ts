import type { GeoExactEntityMentionCandidateReader } from "./geoExactEntityMentionCandidateReader";
import { detectExactEntityMentions } from "./geoExactEntityMentionDetection";
import {
  assembleExactEntityMentionFacts,
  type GeoEntityMentionFactDraft,
  type GeoExactEntityMentionFactAssemblyInput,
} from "./geoExactEntityMentionFactAssembler";

// ============================================================================
// GEO exact entity-mention assembly service (ADR-004, ADR-005,
// 05_DOMAIN_DATA_MODEL.md §§4 and 7, 07_GEO_MEASUREMENT_SPEC.md §§5–6)
// ============================================================================
//
// The transparent composition boundary between the accepted T146 detection and
// the accepted T147 fact assembler: for ONE caller-supplied concrete parse and
// the parsed text that belongs to it, read the Project's eligible surfaces,
// locate the exact spans, and bind them to that parse as unpersisted drafts.
//
// Boundary declaration:
//   - Composition only. This service owns no rule. It awaits exactly one
//     `detectExactEntityMentions` call under the given parse fact's Project, then
//     makes exactly one `assembleExactEntityMentionFacts` call with that same
//     parse object, the same Project id, the caller's mention-id array, and the
//     returned matches, and returns that call's result unchanged. It never reads
//     a candidate itself, matches text, filters, sorts, dedupes, picks a
//     collision winner, generates an id, or selects a "current" parse.
//   - The caller's values are opaque. The concrete parse fact, its parsed text,
//     and the ordered mention-id array are forwarded verbatim — never replaced,
//     trimmed, normalized, or re-ordered — and no run, sample, market, or batch
//     identity is attached here. ADR-005 makes the parse the unit of meaning, so
//     binding these drafts to storage stays with the caller and the accepted
//     T141/T143 boundaries.
//   - Fail closed by propagation. There is no error handling and no fallback: a
//     reader or detection failure reaches the caller by identity and is never
//     turned into an empty draft list, and an assembler rejection (cross-Project
//     detection, unusable or duplicated mention id, id/match cardinality, or a
//     FAILED parse) surfaces unchanged. The accepted T147 assembler remains the
//     authoritative Project/FAILED/id-cardinality guard; re-deciding any of
//     those rules here would duplicate business logic the domain model already
//     owns.
//
// The service is storage-free by construction: its only data access is the
// injected reader port, so it can be exercised end to end with an in-process
// fake reader and no database.

/**
 * One assembly call: the concrete, versioned parse the drafts are bound to, the
 * parsed text that parse produced, and the caller's ordered mention ids. The
 * shared members are derived from the accepted T147 assembly input so the two
 * boundaries cannot drift apart; the detection Project and the matches are NOT
 * caller inputs — the Project comes from the parse fact and the matches come
 * from the accepted detection.
 */
export type GeoExactEntityMentionAssemblyInput = Pick<
  GeoExactEntityMentionFactAssemblyInput,
  "parse" | "mentionIds"
> & {
  /** The parsed text belonging to that concrete parse, forwarded verbatim. */
  text: string;
};

/**
 * Detect the parse's exact spans, then bind them to that same parse, and return
 * the assembler's drafts unchanged.
 *
 * Exactly one detection call and exactly one assembly call happen, in that
 * order: detection runs under the given parse fact's own Project with the
 * caller's text and the injected reader, and its matches are handed to the
 * assembler together with the same parse, that identical Project id, and the
 * caller's mention-id array. A failure from the reader, the detection, or the
 * assembler propagates unchanged; a reader failure is never an empty draft list.
 */
export async function assembleExactEntityMentionFactsForParse(
  input: GeoExactEntityMentionAssemblyInput,
  reader: GeoExactEntityMentionCandidateReader,
): Promise<GeoEntityMentionFactDraft[]> {
  const matches = await detectExactEntityMentions(
    { projectId: input.parse.projectId, text: input.text },
    reader,
  );

  return assembleExactEntityMentionFacts({
    parse: input.parse,
    projectId: input.parse.projectId,
    mentionIds: input.mentionIds,
    matches,
  });
}
