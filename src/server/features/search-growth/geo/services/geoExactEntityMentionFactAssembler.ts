import { z } from "zod";
import type { GeoExactEntityMentionMatch } from "./geoExactEntityMentionMatcher";
import type { GeoEntityMentionFact } from "./geoEntityMentionRecorder";
import type { GeoObservationParseFact } from "./geoObservationParseRecorder";

// ============================================================================
// GEO exact entity-mention fact assembler (ADR-004, ADR-005,
// 05_DOMAIN_DATA_MODEL.md §§4 and 7, 07_GEO_MEASUREMENT_SPEC.md §§5–6)
// ============================================================================
//
// The narrow, storage-free boundary between a finished T146 exact detection and
// the append-only T141 `GeoEntityMentionRecorder`: bind that detection's T144
// match spans — found under one Project — to ONE concrete, versioned T140 parse
// fact and to the caller-owned mention ids the recorder will use as primary
// keys, and return the T141 facts those matches imply.
//
// Boundary declaration:
//   - It is an assembler, not a parser. Every value it emits already exists on
//     an input it was handed: `projectId`/`parseId` come from the concrete parse
//     fact, `entityId`/`evidenceText` come verbatim from the match, and `id`
//     comes verbatim from the caller's ordered mention-id list. It infers no
//     recommendation, rank, position, sentiment, entity ownership, alias
//     priority, metric, confidence, or parse-version selection: those stay
//     explicit `null` or are simply absent. ADR-005 makes the parse the unit of
//     meaning, so this module binds facts to the exact version it was given and
//     never picks a "current" parse.
//   - The caller's match objects are opaque and untouched. Each returned draft
//     holds the SAME `GeoExactEntityMentionMatch` object it was built from, so a
//     fact stays auditable against its original canonical-vs-alias source basis
//     (§4) and its `start`/`end`/`evidence` span. Nothing is mutated, cloned,
//     serialized, normalized, deduplicated, sorted, or re-ordered, and the
//     `evidence` string is copied by reference only — its contents are never
//     read, sliced, parsed, or inspected.
//   - Order and collisions are the caller's, not this module's. One draft is
//     produced per match, positionally, in the caller's order: identical or
//     overlapping matches for the same entity, and several candidates that
//     matched the same text, all survive as separate drafts. The only
//     uniqueness rule is the recorders' own — a duplicated caller-supplied
//     mention id would violate the `geo_entity_mentions` primary key — and it
//     rejects before a draft is returned rather than de-duplicating a match.
//   - It is pure and storage-free. It opens no database, calls no reader,
//     matcher, recorder, or provider, reads no raw observation/response text,
//     writes nothing, and has no error handling that could turn a rejection
//     into partial output. Composition, persistence, and every retry/upsert
//     concern remain with the caller and the accepted recorders.
//
// Validation runs in a fixed order — runtime shape, cross-fact Project
// identity, id/match cardinality, each mention id, then the parse's status —
// and the first failure throws, so a rejected call never yields a partial or
// repairable batch.

/** Non-empty string: the runtime rule for every identifier below. */
const nonEmptyStringSchema = z
  .string({ error: "must be a string" })
  .min(1, { error: "must be a non-empty string" });

/**
 * The runtime context this module needs: the detection's Project, the concrete
 * parse's identity (the two fields the emitted facts are bound to), and the two
 * caller-supplied lists. The kind of element in each list is checked separately
 * below so the rejection can name its index.
 */
const assemblyContextSchema = z.object({
  projectId: nonEmptyStringSchema,
  parse: z.object({
    id: nonEmptyStringSchema,
    projectId: nonEmptyStringSchema,
  }),
  mentionIds: z.array(z.unknown()),
  matches: z.array(z.unknown()),
});

/**
 * One emitted draft: the T141 fact to record plus the exact T144 match it came
 * from, by identity, so an auditor can recover the canonical-vs-alias source
 * basis and the offsets that justify the fact.
 */
export type GeoEntityMentionFactDraft = {
  /** The fact the T141 recorder persists, built only from validated inputs. */
  fact: GeoEntityMentionFact;
  /** The original match object, unchanged and unreplaced. */
  match: GeoExactEntityMentionMatch;
};

/**
 * One assembly call: the concrete parse the detection ran under, the Project id
 * that detection used, the caller's mention ids (one per match, positionally,
 * and unique because they become primary keys), and the T144 match spans.
 */
export type GeoExactEntityMentionFactAssemblyInput = {
  /** The one concrete, versioned parse every emitted fact is bound to. */
  parse: GeoObservationParseFact;
  /** The Project the preceding exact detection was run for. */
  projectId: string;
  /** Caller-owned mention ids, positionally aligned with `matches`. */
  mentionIds: string[];
  /** The accepted T144 spans, in the matcher's own order. */
  matches: GeoExactEntityMentionMatch[];
};

/**
 * Raised when an assembly call is not usable. Names the offending field — a
 * list element as `mentionIds[<index>]` — and carries the index into
 * `mentionIds`/`matches` when the rejection belongs to one, or `null` for a
 * call-level field, so a caller can attribute it without re-parsing the
 * message.
 */
export class GeoExactEntityMentionFactAssemblyError extends Error {
  constructor(
    public readonly field: string,
    detail: string,
    public readonly mentionIndex: number | null,
  ) {
    super(`GEO exact entity mention fact assembler: ${field} ${detail}.`);
    this.name = "GeoExactEntityMentionFactAssemblyError";
  }
}

/** Turn the first schema issue into the caller-facing rejection. */
function toAssemblyError(
  error: z.ZodError,
): GeoExactEntityMentionFactAssemblyError {
  const issue = error.issues[0];
  return new GeoExactEntityMentionFactAssemblyError(
    issue?.path.join(".") || "input",
    issue?.message ?? "is not valid",
    null,
  );
}

/** Assert one caller-supplied mention id is a non-empty string. */
function assertMentionId(mentionId: unknown, index: number): void {
  const result = nonEmptyStringSchema.safeParse(mentionId);
  if (!result.success) {
    throw new GeoExactEntityMentionFactAssemblyError(
      `mentionIds[${index}]`,
      result.error.issues[0]?.message ?? "is not valid",
      index,
    );
  }
}

/**
 * Bind one Project's exact detection matches to one concrete parse, and return
 * one draft per match in the caller's order.
 *
 * Every check is made before any draft is built: the supplied detection Project
 * must equal the parse fact's Project, the parse id and every mention id must
 * be non-empty strings, the mention ids must align one-for-one with the matches
 * and be unique within the batch, and a `FAILED` parse is rejected because it
 * has no evidence to attach (`SUCCESS` and `PARTIAL` parses are valid). The
 * first failure throws `GeoExactEntityMentionFactAssemblyError`, so no partial
 * batch ever escapes.
 *
 * On success each draft is the caller's own match object plus a
 * `GeoEntityMentionFact` carrying the parse's `projectId`/`parseId`, the
 * match's `entityId` and verbatim `evidence`, `mentioned: true`, and explicit
 * `null` for `recommended`, `mentionPosition`, and `sentiment` — no value is
 * inferred for a field the detection did not measure.
 */
export function assembleExactEntityMentionFacts(
  input: GeoExactEntityMentionFactAssemblyInput,
): GeoEntityMentionFactDraft[] {
  const contextResult = assemblyContextSchema.safeParse(input);
  if (!contextResult.success) {
    throw toAssemblyError(contextResult.error);
  }
  const { projectId, parse } = contextResult.data;

  // Cross-fact context first: a detection run for another Project cannot be
  // recorded under this parse, whatever the ids say (ADR-005, Project scope).
  if (projectId !== parse.projectId) {
    throw new GeoExactEntityMentionFactAssemblyError(
      "projectId",
      `is "${projectId}", but the parse fact belongs to project "${parse.projectId}"`,
      null,
    );
  }

  const mentionIds = input.mentionIds;
  const matches = input.matches;

  if (mentionIds.length !== matches.length) {
    throw new GeoExactEntityMentionFactAssemblyError(
      "mentionIds",
      `has ${mentionIds.length} ids, but there are ${matches.length} matches`,
      null,
    );
  }

  // Ids are the caller's primary keys: each must be usable, and no two may
  // collide, or the later append would fail after part of the batch was stored.
  mentionIds.forEach((mentionId, index) => {
    assertMentionId(mentionId, index);
    if (mentionIds.indexOf(mentionId) !== index) {
      throw new GeoExactEntityMentionFactAssemblyError(
        `mentionIds[${index}]`,
        `duplicates mention id "${mentionId}"`,
        index,
      );
    }
  });

  if (input.parse.parseStatus === "FAILED") {
    throw new GeoExactEntityMentionFactAssemblyError(
      "parse.parseStatus",
      "is FAILED, and a failed parse carries no evidence to attach",
      null,
    );
  }

  return matches.map((match, index) => ({
    fact: {
      id: mentionIds[index],
      projectId: parse.projectId,
      parseId: parse.id,
      entityId: match.entityId,
      mentioned: true,
      recommended: null,
      mentionPosition: null,
      sentiment: null,
      evidenceText: match.evidence,
    },
    match,
  }));
}
