import {
  matchExactEntityMentions,
  type GeoExactEntityMentionMatch,
  type GeoExactEntityMentionMatchInput,
} from "./geoExactEntityMentionMatcher";
import type { GeoExactEntityMentionCandidateReader } from "./geoExactEntityMentionCandidateReader";

// ============================================================================
// GEO exact entity-mention detection service (ADR-004, ADR-005,
// 05_DOMAIN_DATA_MODEL.md §§4 and 7, 07_GEO_MEASUREMENT_SPEC.md §5)
// ============================================================================
//
// The transparent composition boundary between the accepted T145 candidate
// reader and the accepted T144 exact matcher: for one Project and one
// caller-supplied parsed text, read that Project's eligible literal surfaces and
// report every exact occurrence as auditable spans.
//
// Boundary declaration:
//   - Composition only. This service holds no rule of its own. It awaits exactly
//     one `listCandidates(projectId)`, hands the returned candidates and the
//     caller's text to `matchExactEntityMentions` exactly once, and returns that
//     call's result unchanged. It never filters, sorts, dedupes, collapses a
//     collision, selects a winner, looks up an entity or alias, normalizes,
//     trims, or serializes text, inspects a raw provider or observation payload,
//     or computes a status, recommendation, sentiment, position, metric, or
//     parse-version.
//   - The caller's identity and text are opaque. The supplied Project id and
//     text are forwarded verbatim — never replaced, repaired, trimmed, or
//     case-folded — and no parse, run, or sample identity is attached. Parses
//     are versioned (ADR-005), so binding these spans to one concrete parse and
//     recording them belong to the later T143/T141 boundaries, not to this one.
//   - Fail closed by propagation. There is no error handling or fallback: a
//     reader failure reaches the caller by identity and is never converted into
//     an empty match list, and a matcher rejection surfaces unchanged.
//
// The service is storage-free by construction: its only data access is the
// injected reader port, so it can be exercised end to end with an in-process
// fake reader and no database.

/**
 * One detection call: the Project whose stored candidates are matched, and the
 * caller-supplied parsed text to search. Derived from the accepted T144 matcher
 * input so the two boundaries cannot drift apart; both members are forwarded to
 * that matcher unchanged.
 */
export type GeoExactEntityMentionDetectionInput = Pick<
  GeoExactEntityMentionMatchInput,
  "projectId" | "text"
>;

/**
 * Read the Project's eligible exact candidates through the injected reader, then
 * return every literal, case-sensitive occurrence of those surfaces in the
 * supplied text as auditable spans.
 *
 * Exactly one read and exactly one matcher call happen, in that order, with the
 * caller's Project id and text passed through verbatim; the matcher's result is
 * returned as-is. A failure from either boundary propagates unchanged.
 */
export async function detectExactEntityMentions(
  input: GeoExactEntityMentionDetectionInput,
  reader: GeoExactEntityMentionCandidateReader,
): Promise<GeoExactEntityMentionMatch[]> {
  const candidates = await reader.listCandidates(input.projectId);
  return matchExactEntityMentions({
    projectId: input.projectId,
    text: input.text,
    candidates,
  });
}
