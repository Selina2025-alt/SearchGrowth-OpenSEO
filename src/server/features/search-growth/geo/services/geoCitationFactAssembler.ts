import { z } from "zod";
import {
  citationSourceOwnershipSchema,
  type CitationSourceOwnership,
} from "@/types/schemas/geo-citation";
import type { GeoCitationFact } from "./geoCitationRecorder";
import type { GeoObservationParseFact } from "./geoObservationParseRecorder";

// ============================================================================
// GEO citation fact assembler (ADR-005, 05_DOMAIN_DATA_MODEL.md §7,
// 07_GEO_MEASUREMENT_SPEC.md §§5–6 and §8)
// ============================================================================
//
// The narrow, storage-free boundary between caller-extracted citation evidence
// and the append-only T142 `GeoCitationRecorder`: bind an ordered list of
// caller-supplied citation evidence candidates — extracted under one Project —
// to ONE concrete, versioned T140 parse fact and to the caller-owned citation
// ids the recorder will use as primary keys, and return the T142 facts those
// candidates imply.
//
// Boundary declaration:
//   - It is an assembler, not an extractor or a URL resolver. Every value it
//     emits already exists on an input it was handed: `projectId`/`parseId` come
//     from the concrete parse fact, `id` comes verbatim from the caller's
//     ordered citation-id list, and every citation leaf (`rawUrl`,
//     `normalizedUrl`, `domain`, `title`, `position`, `sourceOwnership`,
//     `matchedPublicationReceiptId`) comes verbatim from the aligned candidate.
//     It pulls no URL out of text, derives no domain from a URL, classifies no
//     source ownership, and matches no publication receipt: §8's
//     normalization → own-domain → `publication_receipts.published_url` →
//     `CONTROLLED_PUBLICATION` pipeline is later work, so an unclassified
//     candidate is carried exactly as supplied. ADR-005 makes the parse the unit
//     of meaning, so this module binds facts to the exact version it was given
//     and never picks a "current" parse.
//   - The caller's candidate objects are opaque and untouched. Each returned
//     draft holds the SAME candidate object it was built from (`toBe`, not a
//     copy), so a citation stays auditable against its original extraction
//     evidence. Nothing is mutated, cloned, serialized, normalized, trimmed,
//     lower-cased, de-duplicated, sorted, re-ordered, ranked, or rewritten, and
//     no semantic URL/domain equivalence is checked: only the recordable leaf
//     contract (is it a usable string/integer/enum?) is asserted.
//   - Order and collisions are the caller's, not this module's. One draft is
//     produced per candidate, positionally, in the caller's order: two
//     candidates citing the same URL, and several citations of the same domain,
//     all survive as separate drafts. The only uniqueness rule is the
//     recorder's own — a duplicated caller-supplied citation id would violate
//     the `geo_citations` primary key — and it rejects before a draft is
//     returned rather than de-duplicating a candidate.
//   - It is pure and storage-free. It opens no database, calls no repository,
//     recorder, reader, extractor, or provider, reads no raw observation/response
//     text, writes nothing, and has no error handling that could turn a
//     rejection into partial output. Composition, persistence, and every
//     retry/upsert concern remain with the caller and the accepted T142
//     recorder.
//
// Validation runs in a fixed order — runtime shape, cross-fact Project
// identity, id/candidate cardinality, each citation id, the parse's status,
// then each candidate's recordable leaf contract — and the first failure
// throws, so a rejected call never yields a partial or repairable batch.

/** Non-empty string: the runtime rule for every identifier below. */
const nonEmptyStringSchema = z
  .string({ error: "must be a string" })
  .min(1, { error: "must be a non-empty string" });

/**
 * The runtime context this module needs: the extraction's Project, the concrete
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
  citationIds: z.array(z.unknown()),
  candidates: z.array(z.unknown()),
});

/**
 * The recordable citation leaf contract the accepted T142 recorder persists,
 * minus the binding and identity the parse/id inputs supply: the cited URL
 * exactly as extracted, the already-produced normalized URL identity and
 * domain, the optional title and position, the accepted source-ownership
 * classification fact, and the optional matched publication-receipt reference.
 *
 * Every member is an explicit fact — a `null` option means nothing was
 * recorded, never a default to substitute — and every value is opaque caller
 * evidence: it is stored/emitted exactly as handed over and is never parsed,
 * normalized, derived, classified, or matched here.
 */
export type GeoCitationEvidenceCandidate = {
  /** The citation URL exactly as cited (opaque fact, never normalized). */
  rawUrl: string;
  /** The already-produced normalized URL identity (opaque fact, not derived). */
  normalizedUrl: string;
  /** The already-produced citation site domain (opaque fact, not derived). */
  domain: string;
  /** `null` means no title was recorded; it is never inferred. */
  title: string | null;
  /** `null` means no position was recorded; it is never inferred or ranked. */
  position: number | null;
  /** The accepted citation source-ownership classification fact. */
  sourceOwnership: CitationSourceOwnership;
  /** `null` means no publication receipt was matched; it is never inferred. */
  matchedPublicationReceiptId: string | null;
};

/**
 * The recordable leaf contract, validated at runtime because the TypeScript
 * type above does not exist at runtime and the caller may be untrusted. A
 * missing member is rejected rather than treated as `null`/empty, and no value
 * is coerced, trimmed, rounded, or lower-cased on the way through.
 */
const citationEvidenceCandidateSchema = z.object({
  rawUrl: nonEmptyStringSchema,
  normalizedUrl: nonEmptyStringSchema,
  domain: nonEmptyStringSchema,
  title: z.string({ error: "must be a string or null" }).nullable(),
  position: z
    .number({ error: "must be a number or null" })
    .int({ error: "must be a non-negative integer or null" })
    .nonnegative({ error: "must be a non-negative integer or null" })
    .nullable(),
  sourceOwnership: citationSourceOwnershipSchema,
  matchedPublicationReceiptId: nonEmptyStringSchema.nullable(),
});

/**
 * One emitted draft: the T142 fact to record plus the exact caller-supplied
 * candidate it came from, by identity, so an auditor can recover the extraction
 * evidence that justifies the fact.
 */
export type GeoCitationFactDraft = {
  /** The fact the T142 recorder persists, built only from validated inputs. */
  fact: GeoCitationFact;
  /** The original candidate object, unchanged and unreplaced. */
  candidate: GeoCitationEvidenceCandidate;
};

/**
 * One assembly call: the concrete parse the citation evidence was extracted
 * from, the Project id that extraction used, the caller's citation ids (one per
 * candidate, positionally, and unique because they become primary keys), and
 * the ordered citation evidence candidates.
 */
export type GeoCitationFactAssemblyInput = {
  /** The one concrete, versioned parse every emitted fact is bound to. */
  parse: GeoObservationParseFact;
  /** The Project the preceding citation extraction was run for. */
  projectId: string;
  /** Caller-owned citation ids, positionally aligned with `candidates`. */
  citationIds: string[];
  /** The caller's extracted evidence, in the caller's own order. */
  candidates: GeoCitationEvidenceCandidate[];
};

/**
 * Raised when an assembly call is not usable. Names the offending field — a
 * list element as `citationIds[<index>]` or `candidates[<index>].<field>` — and
 * carries the index into `citationIds`/`candidates` when the rejection belongs
 * to one, or `null` for a call-level field, so a caller can attribute it
 * without re-parsing the message.
 */
export class GeoCitationFactAssemblyError extends Error {
  constructor(
    public readonly field: string,
    detail: string,
    public readonly citationIndex: number | null,
  ) {
    super(`GEO citation fact assembler: ${field} ${detail}.`);
    this.name = "GeoCitationFactAssemblyError";
  }
}

/**
 * Turn the first schema issue into a call-level rejection. The issue path is
 * relative to the object that was validated; a candidate issue is prefixed with
 * that candidate's index so the field names the exact evidence at fault.
 */
function toAssemblyError(
  error: z.ZodError,
  citationIndex: number | null = null,
): GeoCitationFactAssemblyError {
  const issue = error.issues[0];
  const path = issue?.path.join(".") ?? "";
  const field =
    citationIndex === null
      ? path
      : `candidates[${citationIndex}]${path === "" ? "" : `.${path}`}`;
  return new GeoCitationFactAssemblyError(
    field === "" ? "input" : field,
    issue?.message ?? "is not valid",
    citationIndex,
  );
}

/** Assert one caller-supplied citation id is a non-empty string. */
function assertCitationId(citationId: unknown, index: number): void {
  const result = nonEmptyStringSchema.safeParse(citationId);
  if (!result.success) {
    throw new GeoCitationFactAssemblyError(
      `citationIds[${index}]`,
      result.error.issues[0]?.message ?? "is not valid",
      index,
    );
  }
}

/** Assert one candidate satisfies the recordable T142 leaf contract. */
function assertCandidate(candidate: unknown, index: number): void {
  const result = citationEvidenceCandidateSchema.safeParse(candidate);
  if (!result.success) {
    throw toAssemblyError(result.error, index);
  }
}

/**
 * Bind one Project's extracted citation evidence to one concrete parse, and
 * return one draft per candidate in the caller's order.
 *
 * Every check is made before any draft is built: the supplied extraction
 * Project must equal the parse fact's Project, the parse id and every citation
 * id must be non-empty strings, the citation ids must align one-for-one with
 * the candidates and be unique within the batch, a `FAILED` parse is rejected
 * because it has no evidence to attach (`SUCCESS` and `PARTIAL` parses are
 * valid), and every candidate must satisfy the recordable T142 leaf contract.
 * The first failure throws `GeoCitationFactAssemblyError`, so no partial batch
 * ever escapes.
 *
 * On success each draft is the caller's own candidate object plus a
 * `GeoCitationFact` carrying the parse's `projectId`/`parseId`, the caller's id
 * at the same index, and every citation leaf verbatim from that candidate — no
 * value is derived, normalized, classified, or matched.
 */
export function assembleCitationFacts(
  input: GeoCitationFactAssemblyInput,
): GeoCitationFactDraft[] {
  const contextResult = assemblyContextSchema.safeParse(input);
  if (!contextResult.success) {
    throw toAssemblyError(contextResult.error);
  }
  const { projectId, parse } = contextResult.data;

  // Cross-fact context first: evidence extracted for another Project cannot be
  // recorded under this parse, whatever the ids say (ADR-005, Project scope).
  if (projectId !== parse.projectId) {
    throw new GeoCitationFactAssemblyError(
      "projectId",
      `is "${projectId}", but the parse fact belongs to project "${parse.projectId}"`,
      null,
    );
  }

  const citationIds = input.citationIds;
  const candidates = input.candidates;

  if (citationIds.length !== candidates.length) {
    throw new GeoCitationFactAssemblyError(
      "citationIds",
      `has ${citationIds.length} ids, but there are ${candidates.length} candidates`,
      null,
    );
  }

  // Ids are the caller's primary keys: each must be usable, and no two may
  // collide, or the later append would fail after part of the batch was stored.
  citationIds.forEach((citationId, index) => {
    assertCitationId(citationId, index);
    if (citationIds.indexOf(citationId) !== index) {
      throw new GeoCitationFactAssemblyError(
        `citationIds[${index}]`,
        `duplicates citation id "${citationId}"`,
        index,
      );
    }
  });

  // Read the caller's own parse object: the validated context copy carries only
  // the identity fields used for the binding above.
  if (input.parse.parseStatus === "FAILED") {
    throw new GeoCitationFactAssemblyError(
      "parse.parseStatus",
      "is FAILED, and a failed parse carries no citation evidence to attach",
      null,
    );
  }

  // The recordable leaf contract of every candidate, still before any draft is
  // built: one malformed candidate rejects the whole batch.
  candidates.forEach((candidate, index) => assertCandidate(candidate, index));

  return candidates.map((candidate, index) => ({
    fact: {
      id: citationIds[index],
      projectId: parse.projectId,
      parseId: parse.id,
      rawUrl: candidate.rawUrl,
      normalizedUrl: candidate.normalizedUrl,
      domain: candidate.domain,
      title: candidate.title,
      position: candidate.position,
      sourceOwnership: candidate.sourceOwnership,
      matchedPublicationReceiptId: candidate.matchedPublicationReceiptId,
    },
    candidate,
  }));
}
