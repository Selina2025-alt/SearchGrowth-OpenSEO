import { sortBy } from "remeda";
import { z } from "zod";

// ============================================================================
// GEO exact entity-mention matcher core (ADR-004, ADR-005,
// 05_DOMAIN_DATA_MODEL.md §§4 and 7, 07_GEO_MEASUREMENT_SPEC.md §5)
// ============================================================================
//
// The narrow, storage-free deterministic slice of §5's "deterministic first"
// parsing: find every literal, case-sensitive `EXACT` occurrence of
// caller-supplied entity/alias surfaces in one caller-supplied parsed-text
// string, and return those spans as auditable facts.
//
// Boundary declaration:
//   - Everything is supplied by the caller: the Project, the parsed text, and
//     an ordered list of candidate literal surfaces. Each candidate names the
//     tracked entity the surface belongs to (ADR-004) and the caller's source
//     identity for it — the entity's canonical name, or one `entity_aliases`
//     row's id (05_DOMAIN_DATA_MODEL.md §4) — so a span stays traceable to the
//     exact stored surface it came from. No entity or alias row is looked up,
//     and no alias is inferred from the text.
//   - Only `EXACT` matching happens. A surface is located with strict,
//     case-sensitive literal search at JavaScript UTF-16 code-unit offsets, and
//     `evidence` is the exact `text.slice(start, end)` from the supplied text.
//     Neither the text nor a surface is normalized, trimmed, lower-cased,
//     tokenized, serialized, HTML/URL-parsed, or otherwise altered, so a
//     match is byte-for-byte the caller's own substring. The other §4 match
//     modes — case-insensitive, word-boundary, unicode-substring and domain
//     matching — are out of scope and are not approximated here.
//   - Occurrences of different candidates stay independent. Two candidates with
//     the same surface each report their own spans, and spans that overlap
//     across candidates are both reported: this matcher invents no cross-entity
//     priority, dedupe, ownership, or uniqueness rule. Only one occurrence of a
//     single candidate can never overlap another (each scan resumes at the end
//     of the previous hit).
//   - Nothing is interpreted or stored. This module opens no database, calls no
//     persistence port, reads no stored entity/alias row, reads no raw provider
//     response, and computes no recommendation, sentiment, position, metric,
//     confidence, or parse-version selection (ADR-005: parses are versioned, so
//     what a span means is the caller's decision).
//   - Input is validated before any matching, because these TypeScript types do
//     not exist at runtime: a malformed, cross-Project, or empty-identifier
//     candidate is rejected outright rather than skipped, repaired, or
//     substituted.

/** Non-empty string: the runtime rule for every identifier below. */
const nonEmptyStringSchema = z.string({ error: "must be a string" }).min(1, {
  error: "must be a non-empty string",
});

/**
 * The caller's source identity for one candidate's literal surface
 * (05_DOMAIN_DATA_MODEL.md §4): the tracked entity's own canonical name, or one
 * alias row identified by its id. It is carried verbatim onto every match, so
 * an audited span can be attributed to the exact stored surface that produced
 * it without a second lookup.
 */
export type GeoExactEntityMentionSource =
  | { kind: "CANONICAL_NAME" }
  | { kind: "ALIAS"; aliasId: string };

const sourceSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("CANONICAL_NAME") }),
    z.object({ kind: z.literal("ALIAS"), aliasId: nonEmptyStringSchema }),
  ],
  { error: 'must be "CANONICAL_NAME" or "ALIAS"' },
);

/**
 * One literal surface to look for, with the caller's traceability identity.
 * The same literal may appear in many candidates — for several entities, or for
 * one entity's canonical name and an alias — and every one of them is matched
 * independently.
 */
export type GeoExactEntityMentionCandidate = {
  /** The owning Project; must equal the matcher's supplied `projectId`. */
  projectId: string;
  /** The tracked entity this surface mentions (ADR-004). */
  entityId: string;
  /** The exact literal to find, compared verbatim and case-sensitively. */
  surface: string;
  /** Where the surface came from: the canonical name, or one alias row. */
  source: GeoExactEntityMentionSource;
};

const candidateSchema = z.object({
  projectId: nonEmptyStringSchema,
  entityId: nonEmptyStringSchema,
  surface: nonEmptyStringSchema,
  source: sourceSchema,
});

/**
 * One matcher call: the Project being measured, the parsed text to search, and
 * the caller's ordered candidate surfaces. The order is the caller's ranking of
 * its own candidates and is preserved as a result-ordering tie-breaker; it
 * carries no meaning beyond that.
 */
export type GeoExactEntityMentionMatchInput = {
  projectId: string;
  text: string;
  candidates: GeoExactEntityMentionCandidate[];
};

const matchInputSchema = z.object({
  projectId: nonEmptyStringSchema,
  // The parsed text only has to BE a string: an empty (or whitespace-only)
  // parsed text is a valid input that simply yields no matches. It is never
  // trimmed, so leading/trailing whitespace shifts offsets rather than being
  // discarded.
  text: z.string({ error: "must be a string" }),
});

/**
 * One auditable literal occurrence of one candidate's surface. `start`/`end`
 * are zero-based JavaScript UTF-16 code-unit offsets into the supplied text
 * (`end` exclusive), and `evidence` is exactly `text.slice(start, end)`.
 */
export type GeoExactEntityMentionMatch = {
  /** The candidate's entity, echoed verbatim. */
  entityId: string;
  /** The candidate's source identity, the caller's object itself. */
  source: GeoExactEntityMentionSource;
  /** Zero-based inclusive offset of the first code unit of the occurrence. */
  start: number;
  /** Zero-based exclusive offset just past the occurrence. */
  end: number;
  /** The exact supplied substring at `[start, end)`. */
  evidence: string;
};

/**
 * Raised when a matcher input is not usable. Names the offending field — a
 * candidate field as `candidates[<index>].<field>` — and carries the candidate
 * index (or `null` for a call-level field) so a caller can attribute the
 * rejection without re-parsing the message.
 */
export class GeoExactEntityMentionInputError extends Error {
  constructor(
    public readonly field: string,
    detail: string,
    public readonly candidateIndex: number | null,
  ) {
    super(`GEO exact entity mention matcher: ${field} ${detail}.`);
    this.name = "GeoExactEntityMentionInputError";
  }
}

/**
 * Turn the first schema issue into the caller-facing rejection. The issue path
 * is relative to the object that was validated, so a candidate issue is
 * prefixed with that candidate's index.
 */
function toInputError(
  error: z.ZodError,
  candidateIndex: number | null,
): GeoExactEntityMentionInputError {
  const issue = error.issues[0];
  const prefix = candidateIndex === null ? "" : `candidates[${candidateIndex}]`;
  const field = [prefix, issue?.path.join(".") ?? ""]
    .filter((part) => part !== "")
    .join(".");
  return new GeoExactEntityMentionInputError(
    field === "" ? "input" : field,
    issue?.message ?? "is not valid",
    candidateIndex,
  );
}

function assertCandidate(
  suppliedProjectId: string,
  candidate: GeoExactEntityMentionCandidate,
  index: number,
): void {
  const result = candidateSchema.safeParse(candidate);
  if (!result.success) {
    throw toInputError(result.error, index);
  }
  if (result.data.projectId !== suppliedProjectId) {
    throw new GeoExactEntityMentionInputError(
      `candidates[${index}].projectId`,
      `belongs to project "${result.data.projectId}", but the supplied projectId is "${suppliedProjectId}"`,
      index,
    );
  }
}

type PendingMatch = {
  candidateIndex: number;
  occurrenceIndex: number;
  match: GeoExactEntityMentionMatch;
};

/**
 * Locate every non-overlapping occurrence of every candidate surface. Each
 * candidate is scanned independently, resuming past its own previous hit, and
 * the collected spans are ordered by ascending `start`, then the caller's
 * candidate order, then occurrence order — a total order, so the result is
 * deterministic for a given input.
 */
function collectExactMatches(
  text: string,
  candidates: readonly GeoExactEntityMentionCandidate[],
): GeoExactEntityMentionMatch[] {
  const pending: PendingMatch[] = [];

  candidates.forEach((candidate, candidateIndex) => {
    const { surface } = candidate;
    let occurrenceIndex = 0;
    let start = text.indexOf(surface);
    while (start !== -1) {
      const end = start + surface.length;
      pending.push({
        candidateIndex,
        occurrenceIndex,
        match: {
          entityId: candidate.entityId,
          source: candidate.source,
          start,
          end,
          evidence: text.slice(start, end),
        },
      });
      occurrenceIndex += 1;
      // Resume past this hit: a single candidate never matches itself
      // overlapping. A non-empty surface guarantees progress.
      start = text.indexOf(surface, end);
    }
  });

  return sortBy(
    pending,
    (item) => item.match.start,
    (item) => item.candidateIndex,
    (item) => item.occurrenceIndex,
  ).map((item) => item.match);
}

/**
 * Return every literal, case-sensitive occurrence of every candidate surface in
 * the supplied parsed text, as auditable spans.
 *
 * The whole input is validated first — the Project identifier, the text, and
 * every candidate's identifiers, Project, surface, and source identity — so an
 * unusable candidate throws `GeoExactEntityMentionInputError` (naming its index
 * and field) instead of being silently skipped and instead of a partial result
 * being returned. Nothing is mutated, normalized, serialized, or persisted.
 */
export function matchExactEntityMentions(
  input: GeoExactEntityMentionMatchInput,
): GeoExactEntityMentionMatch[] {
  const rootResult = matchInputSchema.safeParse(input);
  if (!rootResult.success) {
    throw toInputError(rootResult.error, null);
  }
  const { projectId, text } = rootResult.data;

  const candidates = input.candidates;
  if (!Array.isArray(candidates)) {
    throw new GeoExactEntityMentionInputError(
      "candidates",
      "must be an array of candidates",
      null,
    );
  }
  candidates.forEach((candidate, index) =>
    assertCandidate(projectId, candidate, index),
  );

  return collectExactMatches(text, candidates);
}
