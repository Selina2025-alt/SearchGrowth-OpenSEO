import { and, eq } from "drizzle-orm";
import { sortBy } from "remeda";
import { z } from "zod";
import { db } from "@/db";
import { entityAliases, trackedEntities } from "@/db/schema";
import type { GeoExactEntityMentionCandidate } from "../services/geoExactEntityMentionMatcher";
import {
  GeoExactEntityMentionCandidateReaderError,
  type GeoExactEntityMentionCandidateReader,
  type GeoExactEntityMentionCandidateRowRef,
} from "../services/geoExactEntityMentionCandidateReader";

// ---------------------------------------------------------------------------
// GeoExactEntityMentionCandidateReader persistence adapter (ADR-004, ADR-005,
// 05_DOMAIN_DATA_MODEL.md §§4 and 7, 07_GEO_MEASUREMENT_SPEC.md §5)
// ---------------------------------------------------------------------------
//
// This module is the whole adapter for the reader port: two SELECTs against the
// accepted `tracked_entities` / `entity_aliases` storage, mapped to the T144
// `GeoExactEntityMentionCandidate` shape. The matcher's candidate and source
// types are REUSED, never re-declared, so a candidate cannot drift from what
// the matcher consumes.
//
// What it returns:
//   - one `{ kind: "CANONICAL_NAME" }` candidate per active tracked entity of
//     the Project, carrying the entity's stored canonical_name verbatim;
//   - one `{ kind: "ALIAS", aliasId }` candidate per alias of the Project whose
//     owning entity is active, whose accepted `matchMode` is `EXACT`, and whose
//     persisted `caseSensitive` flag is `true`.
//
// Why exactly that alias filter: the accepted exact matcher is a literal,
// case-SENSITIVE search. Feeding it a `CASE_INSENSITIVE_EXACT`, `WORD_BOUNDARY`,
// `UNICODE_SUBSTRING`, or `DOMAIN` alias — or an `EXACT` alias persisted as
// case-insensitive — would silently approximate a different §4 match mode, so
// those surfaces stay out until a component that implements that mode reads
// them. Symmetrically, an inactive entity's surfaces are excluded because
// `active` is the accepted soft-disable flag (05_DOMAIN_DATA_MODEL.md §4).
//
// What it deliberately does not do:
//   - no winner selection, priority, dedupe, or collision collapsing. Two
//     entities sharing one literal, and an entity's canonical name colliding
//     with its own alias, all come back as separate candidates. `priority` is
//     an alias storage hint and is not even selected, so it cannot order
//     anything here.
//   - no ownership inference beyond the stored rows: an alias is attributed to
//     the `entity_id` it is stored with, joined to that same-Project entity to
//     read its `active` flag. Nothing is derived from a name, domain, or URL.
//   - no matching, no raw-response reading, no parse/run selection, no mention
//     or metric computation, no writes. `assertProjectId` runs before either
//     SELECT, and the whole module contains no INSERT/UPDATE/DELETE/upsert.
//
// Failure model: an unusable argument or an accepted row whose stored id or
// surface text is empty raises `GeoExactEntityMentionCandidateReaderError`
// naming the column and row. Such a row is never filtered out of the result —
// an empty surface cannot be matched literally, and silently dropping it would
// turn a storage defect into a quietly wrong candidate list.

/** Non-empty string: the runtime rule for the supplied Project identifier. */
const projectIdSchema = z.string({ error: "must be a string" }).min(1, {
  error: "must be a non-empty string",
});

/**
 * The supplied Project id is not a usable storage key. Checked before any
 * query, because these TypeScript types do not exist at runtime and an empty
 * or non-string id would otherwise become a query against the wrong Project (or
 * against none).
 */
function assertProjectId(projectId: string): void {
  const result = projectIdSchema.safeParse(projectId);
  if (!result.success) {
    throw new GeoExactEntityMentionCandidateReaderError(
      "projectId",
      result.error.issues[0]?.message ?? "is not valid",
      null,
    );
  }
}

/**
 * An accepted row's stored value is unusable for a literal surface. Failing
 * here (instead of skipping the row) keeps the result honest: the caller learns
 * which row is broken, rather than receiving a shorter list that looks
 * complete.
 */
function assertUsableStoredValue(
  ref: GeoExactEntityMentionCandidateRowRef,
  column: string,
  value: string,
): void {
  if (value.length === 0) {
    throw new GeoExactEntityMentionCandidateReaderError(
      `${ref.table}[${ref.rowId}].${column}`,
      `is empty for accepted entity "${ref.entityId}"; refusing to skip the row`,
      ref,
    );
  }
}

/**
 * One active tracked entity of the Project: the canonical-name surface, the
 * Project it belongs to, and the stable entity id (ADR-004).
 */
function listActiveEntities(projectId: string) {
  return db
    .select({
      id: trackedEntities.id,
      projectId: trackedEntities.projectId,
      canonicalName: trackedEntities.canonicalName,
    })
    .from(trackedEntities)
    .where(
      and(
        eq(trackedEntities.projectId, projectId),
        eq(trackedEntities.active, true),
      ),
    );
}

/**
 * The Project's literal-compatible alias rows. The join reads the owning
 * entity's `active` flag through the stored same-Project relation
 * ((project_id, entity_id) — the accepted composite FK), so an alias can only
 * be returned with the entity that owns it.
 */
function listExactAliases(projectId: string) {
  return db
    .select({
      id: entityAliases.id,
      projectId: entityAliases.projectId,
      entityId: entityAliases.entityId,
      aliasText: entityAliases.aliasText,
    })
    .from(entityAliases)
    .innerJoin(
      trackedEntities,
      and(
        eq(trackedEntities.projectId, entityAliases.projectId),
        eq(trackedEntities.id, entityAliases.entityId),
      ),
    )
    .where(
      and(
        eq(entityAliases.projectId, projectId),
        eq(entityAliases.matchMode, "EXACT"),
        eq(entityAliases.caseSensitive, true),
        eq(trackedEntities.active, true),
      ),
    );
}

type EntityRow = Awaited<ReturnType<typeof listActiveEntities>>[number];
type AliasRow = Awaited<ReturnType<typeof listExactAliases>>[number];

/** One active entity's canonical name as a matcher-ready candidate. */
function toCanonicalCandidate(row: EntityRow): GeoExactEntityMentionCandidate {
  const ref: GeoExactEntityMentionCandidateRowRef = {
    table: "tracked_entities",
    entityId: row.id,
    rowId: row.id,
  };
  assertUsableStoredValue(ref, "id", row.id);
  assertUsableStoredValue(ref, "canonical_name", row.canonicalName);
  return {
    projectId: row.projectId,
    entityId: row.id,
    surface: row.canonicalName,
    source: { kind: "CANONICAL_NAME" },
  };
}

/** One eligible alias as a matcher-ready candidate, identified by its row id. */
function toAliasCandidate(row: AliasRow): GeoExactEntityMentionCandidate {
  const ref: GeoExactEntityMentionCandidateRowRef = {
    table: "entity_aliases",
    entityId: row.entityId,
    rowId: row.id,
  };
  assertUsableStoredValue(ref, "id", row.id);
  assertUsableStoredValue(ref, "alias_text", row.aliasText);
  return {
    projectId: row.projectId,
    entityId: row.entityId,
    surface: row.aliasText,
    source: { kind: "ALIAS", aliasId: row.id },
  };
}

/**
 * Every eligible surface of one Project, as T144 candidates.
 *
 * The order is deterministic but carries no business meaning: canonical
 * candidates first, then aliases; within each group by stable entity id, then
 * by row id. Both keys come from accepted primary keys, so the order is total
 * and therefore stable across calls and across dialects.
 */
async function listCandidates(
  projectId: string,
): Promise<GeoExactEntityMentionCandidate[]> {
  assertProjectId(projectId);

  const [entityRows, aliasRows] = await Promise.all([
    listActiveEntities(projectId),
    listExactAliases(projectId),
  ]);

  return [
    ...sortBy(entityRows, (row) => row.id).map(toCanonicalCandidate),
    ...sortBy(
      aliasRows,
      (row) => row.entityId,
      (row) => row.id,
    ).map(toAliasCandidate),
  ];
}

/** The entity/alias candidate reader port, backed by local storage. */
export const GeoExactEntityMentionCandidateReaderRepository: GeoExactEntityMentionCandidateReader =
  {
    listCandidates,
  };
