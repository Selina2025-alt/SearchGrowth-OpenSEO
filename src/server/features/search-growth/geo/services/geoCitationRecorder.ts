import type { CitationSourceOwnership } from "@/types/schemas/geo-citation";

// ============================================================================
// GeoCitation recording port (ADR-005, 05_DOMAIN_DATA_MODEL.md §7,
// 07_GEO_MEASUREMENT_SPEC.md §§5 and 8, 21_TEST_ACCEPTANCE_PLAN.md §3)
// ============================================================================
//
// The narrow, storage-free contract between whatever produces one citation fact
// and the append-only adapter that records it (mirrors the T141
// `GeoEntityMentionRecorder` port in ./geoEntityMentionRecorder.ts and the T140
// `GeoObservationParseRecorder` port in ./geoObservationParseRecorder.ts).
//
// A `GeoCitationFact` is one citation extracted from one concrete, immutable
// versioned parse: the URL exactly as cited (`rawUrl`), the already-produced
// normalized identity (`normalizedUrl`) and `domain`, the optional `title` and
// `position`, the source-ownership classification, and the optional matched
// publication-receipt reference. The fact binds the CONCRETE `parseId` — never
// a run and never a mutable "current" parse pointer — so a parser upgrade
// appends a new version's citations beside the prior version's rather than
// rewriting them (ADR-005, Parse-version isolation).
//
// Every URL/domain/ownership value is a caller-supplied opaque fact: this slice
// stores it exactly as handed over. There is no URL parsing or normalization,
// no ownership classification, no receipt matching, no evidence parsing,
// and no inference. Every optional member is an explicit `null` when nothing
// was recorded; there is no absent-means-default.
//
// The port is deliberately DB-free: it names no table, driver, or schema, so a
// producer can be exercised against an in-process fake recorder. The storage
// adapter re-validates the runtime boundary before INSERT, because these
// TypeScript types do not exist at runtime.

/**
 * One recordable citation fact. Structurally aligned with the accepted
 * `geo_citations` columns the adapter writes, so storage maps it without
 * deriving anything; `created_at` is the only value the database adds.
 */
export type GeoCitationFact = {
  /** Stable citation identity. Owned by the caller, never generated here. */
  id: string;
  /** The owning Project (never inferred from the parse or the receipt). */
  projectId: string;
  /** The concrete, immutable versioned parse this citation came from. */
  parseId: string;
  /** The citation URL exactly as cited in the source answer (opaque fact). */
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
 * One fact in, one append-only `geo_citations` row out. There is no update,
 * upsert, dedupe, retry, delete, parser-current selection, URL normalization,
 * ownership classification, or receipt matching: any storage failure
 * (same-Project or dangling parse/receipt FK, duplicate id) surfaces to the
 * caller.
 */
export type GeoCitationRecorder = {
  record(citationFact: GeoCitationFact): Promise<void>;
};
