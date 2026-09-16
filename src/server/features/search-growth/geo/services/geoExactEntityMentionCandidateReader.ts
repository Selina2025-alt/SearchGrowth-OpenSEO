import type { GeoExactEntityMentionCandidate } from "./geoExactEntityMentionMatcher";

// ---------------------------------------------------------------------------
// GEO exact entity-mention candidate reader port (ADR-004, ADR-005,
// 05_DOMAIN_DATA_MODEL.md §§4 and 7, 07_GEO_MEASUREMENT_SPEC.md §5)
// ---------------------------------------------------------------------------
//
// The storage-facing half of §5's "deterministic first" parsing: it hands the
// accepted exact matcher the literal surfaces to look for in a Project's parsed
// text. It knows nothing about that text — which run, parse, response, or
// parser version produced it is the caller's concern (ADR-005), and matching
// stays in the pure T144 core.
//
// Boundary declaration:
//   - Read-only and Project-scoped. The port answers exactly one question: for
//     this Project, which stored surfaces are eligible for exact literal
//     matching? It writes nothing, mutates no entity or alias, opens no raw
//     observation response, and computes no metric, position, sentiment,
//     recommendation, confidence, or parse-version selection.
//   - Eligibility is storage truth, not inference. A candidate exists because
//     an accepted `tracked_entities` / `entity_aliases` row says so; the port
//     never invents a surface, expands a name, derives a domain, folds case,
//     or guesses ownership.
//   - No winner selection. Colliding surfaces (the same literal from several
//     entities, or an entity's canonical name and its own alias) stay separate
//     candidates in a deterministic order that carries no business precedence.
//     Resolving a collision is a later, explicit decision, not a reader rule.
//   - Fail closed. An unusable argument or an unusable accepted row is reported
//     as an error identifying what was wrong; it is never silently skipped, and
//     no partial or misleading candidate list is returned.
//
// The adapter that satisfies this port lives in
// ../repositories/GeoExactEntityMentionCandidateReaderRepository; callers that
// only need the behaviour depend on this contract instead of on the database.

/**
 * The one read a caller may ask of stored entity/alias surfaces. Given a
 * non-empty Project id, it resolves that Project's eligible
 * `GeoExactEntityMentionCandidate` values: one per active tracked entity's
 * canonical name, then one per eligible alias.
 *
 * Result order is deterministic — canonical candidates first, then aliases, and
 * within each group by stable entity id then source id — but it is a stable
 * presentation order only: it gives no entity, alias, or source kind any
 * precedence the domain model does not define.
 */
export type GeoExactEntityMentionCandidateReader = {
  listCandidates(projectId: string): Promise<GeoExactEntityMentionCandidate[]>;
};

/**
 * The accepted row an unusable stored value was read from, so a rejection is
 * attributable to one row and one column instead of to an anonymous storage
 * problem. `rowId` is empty exactly when the row's own id is the unusable
 * value; `entityId` is the owning tracked entity (the entity id itself for a
 * canonical-name row).
 */
export type GeoExactEntityMentionCandidateRowRef = {
  /** The accepted table that holds the unusable value. */
  table: "tracked_entities" | "entity_aliases";
  /** The owning tracked entity (ADR-004 stable id). */
  entityId: string;
  /** The row's own id: the entity id, or the `entity_aliases.id`. */
  rowId: string;
};

/**
 * Raised when the reader cannot answer honestly: a non-string/empty
 * `projectId` argument, or an accepted row whose stored id or surface text is
 * unusable. The message names the offending column — for a row it is
 * `<table>[<rowId>].<column>` — and `row` carries the structured identity so a
 * caller can attribute the failure without re-parsing the message. An unusable
 * row is never dropped, so a returned candidate list is always the whole
 * eligible truth for the Project.
 */
export class GeoExactEntityMentionCandidateReaderError extends Error {
  constructor(
    public readonly field: string,
    detail: string,
    public readonly row: GeoExactEntityMentionCandidateRowRef | null,
  ) {
    super(`GEO exact entity mention candidate reader: ${field} ${detail}.`);
    this.name = "GeoExactEntityMentionCandidateReaderError";
  }
}
