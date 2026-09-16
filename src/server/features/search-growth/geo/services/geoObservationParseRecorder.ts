import type {
  GeoObservationAccuracyStatus,
  GeoObservationParseStatus,
} from "@/types/schemas/geo-observation-parse";

// ============================================================================
// GeoObservationParse recording port (ADR-005, 05_DOMAIN_DATA_MODEL.md §7,
// 07_GEO_MEASUREMENT_SPEC.md §5, 21_TEST_ACCEPTANCE_PLAN.md §6)
// ============================================================================
//
// The narrow, storage-free contract between whatever produces a versioned parse
// and the append-only adapter that records it (mirrors the T138
// `GeoObservationRunRecorder` port in ../services/freshGeoSampling.ts).
//
// A `GeoObservationParseFact` is one versioned parse of one immutable raw run:
// the canonical `parse_status` outcome, the optional `accuracy_status`
// assessment (`null` when no assessment was made, e.g. a FAILED parse), the
// application-supplied `parsedAt`, and the `isCurrent` marker as a fact. A
// parser upgrade is a NEW fact with a new `parserVersion` — the prior version's
// row is never rewritten or replaced (ADR-005).
//
// Parser v1/v2 identity is `(runId, parserVersion)`; the fact carries both so
// the adapter derives nothing. Entity mentions, citations, recommendations,
// sentiment, and accuracy COMPUTATION are later tasks — a fact never carries
// them.
//
// The port is deliberately DB-free: it names no table, driver, or schema, so a
// parser can be exercised against an in-process fake recorder. The storage
// adapter re-validates the runtime boundary before INSERT, because these
// TypeScript types do not exist at runtime.

/**
 * One recordable, versioned parse fact. Structurally aligned with the accepted
 * `geo_observation_parses` columns the adapter writes, so storage maps it
 * without deriving anything; `created_at` is the only value the database adds.
 */
export type GeoObservationParseFact = {
  /** Stable parse identity. Owned by the caller, never generated here. */
  id: string;
  /** The owning Project (never inferred from the run). */
  projectId: string;
  /** The immutable raw run this versioned parse was computed from. */
  runId: string;
  /** Parser package/version identifier — the version half of the identity. */
  parserVersion: string;
  parseStatus: GeoObservationParseStatus;
  /** `null` means no accuracy assessment was made; it is never inferred. */
  accuracyStatus: GeoObservationAccuracyStatus | null;
  /** When this parse was produced (distinct from the system `created_at`). */
  parsedAt: string;
  /** Current-marker fact. Selecting/switching the pointer is later workflow. */
  isCurrent: boolean;
};

/**
 * One fact in, one append-only `geo_observation_parses` row out. There is no
 * update, upsert, dedupe, retry, delete, or current-pointer operation: any
 * storage failure (duplicate `(run_id, parser_version)`, same-Project or
 * dangling run FK) surfaces to the caller.
 */
export type GeoObservationParseRecorder = {
  record(parseFact: GeoObservationParseFact): Promise<void>;
};
