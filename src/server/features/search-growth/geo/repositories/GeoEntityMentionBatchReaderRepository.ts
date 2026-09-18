import { and, eq } from "drizzle-orm";
import { sortBy } from "remeda";
import { z } from "zod";
import { db } from "@/db";
import {
  geoEntityMentions,
  geoObservationParses,
  geoObservationRuns,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// GEO entity-mention batch reader (ADR-003, ADR-004, ADR-005,
// 05_DOMAIN_DATA_MODEL.md §7, 07_GEO_MEASUREMENT_SPEC.md §5)
// ---------------------------------------------------------------------------
//
// One read: the persisted `geo_entity_mentions` rows that belong to exactly one
// Project, one observation batch, one tracked entity, and one parser version,
// each beside the concrete run and parse identities it was computed from. It is
// deterministic, version-explicit evidence input for a later measurement — never
// the measurement itself.
//
// Boundaries:
//   - Four required selectors, validated before any query. The Project, the
//     run's batch, the mention's entity, and the parse's parser version are all
//     non-empty strings; a partial selector is not a narrower read, it is a
//     read against the wrong or an unintended slice, so nothing is defaulted or
//     inferred.
//   - One read, three accepted relations. Exactly one SELECT joins the accepted
//     mention storage to its accepted versioned parse and immutable run through
//     the stored same-Project keys, and all four selectors are constrained. No
//     second query, no raw payload table, and no entity/alias/cohort table is
//     read.
//   - Version-explicit, never "current". `parserVersion` is matched by equality.
//     There is no latest-version selection, no `is_current` consultation, no
//     parser-version collapsing, and no reparse or current-pointer behavior: a
//     caller that wants v1 and a caller that wants v2 get exactly their rows.
//   - Rows are returned as stored. Every accepted mention column — including the
//     stored `mentioned` verdict and every nullable field — comes back
//     unchanged, with only the parent `runId` added so a mention can be traced
//     to the run its parse was computed from. Nothing is parsed, normalized,
//     inferred, filtered, deduplicated, counted, aggregated, or converted into a
//     fraction/rate/metric/confidence.
//   - Fail loudly. Unusable selectors reject before the SELECT, and a database
//     failure propagates as the failure it is. There is no catch, fallback,
//     default, or coercion, so an empty result means only "this explicit
//     four-part selector matched no stored mention".
//   - No write, provider, credential, cache, scheduler, parser, workflow, UI, or
//     server-function dependency lives here: no INSERT/UPDATE/DELETE, no upsert,
//     no raw observation, parse, entity, alias, or cohort mutation.
//
// Ordering: `repeatIndex`, run id, parse id, then mention id — all stored keys.
// The sort runs in one implementation instead of a SQL `ORDER BY`, because ids
// are text and dialect collations disagree about punctuation (SQLite's BINARY
// order and a locale-aware Postgres collation can order `run-a` and `runa`
// differently). Sorting here makes the order total and identical on every
// dialect. It is a stable presentation order only: no run, parse, version, or
// mention is preferred, dropped, or merged by it.

/** The literal error wording for one unusable selector field. */
const selectorFieldSchema = z.string({ error: "must be a string" }).min(1, {
  error: "must be a non-empty string",
});

/** The four selector fields an entity-mention batch read is defined by. */
export type GeoEntityMentionBatchSelectorField =
  | "projectId"
  | "batchId"
  | "entityId"
  | "parserVersion";

/**
 * The supplied selector is not a usable storage key. Checked before any query,
 * because these TypeScript types do not exist at runtime and an empty or
 * non-string id would otherwise become a query against the wrong Project,
 * batch, entity, or parser version (or against none) — a read whose wrong-empty
 * result is indistinguishable from an honest empty one.
 */
export class GeoEntityMentionBatchReaderError extends Error {
  constructor(
    public readonly field: GeoEntityMentionBatchSelectorField,
    detail: string,
  ) {
    super(`GEO entity mention batch reader: ${field} ${detail}.`);
    this.name = "GeoEntityMentionBatchReaderError";
  }
}

/** Reject one unusable selector field, naming which of the four it was. */
function assertSelectorField(
  field: GeoEntityMentionBatchSelectorField,
  value: string,
): void {
  const result = selectorFieldSchema.safeParse(value);
  if (!result.success) {
    throw new GeoEntityMentionBatchReaderError(
      field,
      result.error.issues[0]?.message ?? "is not valid",
    );
  }
}

/** The accepted `geo_entity_mentions` row type, exactly as stored. */
type GeoEntityMentionRow = typeof geoEntityMentions.$inferSelect;

/**
 * One stored mention beside the immutable run it was parsed from. `parseId` is
 * already the mention's own stored parent identity; `runId` is the one added
 * identifier, taken from the joined parse's stored run.
 */
type GeoEntityMentionBatchRow = GeoEntityMentionRow & {
  runId: string;
};

/**
 * Every stored mention of one Project's batch, tracked entity, and parser
 * version, each with the run it was parsed from.
 *
 * All four selectors are validated before the SELECT, so an unusable selector
 * can never reach storage. The join is the accepted chain — mention to its
 * same-Project versioned parse, parse to its same-Project immutable run — and
 * the predicates pin the mention's Project and entity, the run's batch, and the
 * parse's parser version, so rows of another Project, batch, entity, or parser
 * version are excluded even when the other keys collide. A database failure is
 * not caught, so it surfaces to the caller instead of becoming an empty result.
 */
async function readBatchMentions(
  projectId: string,
  batchId: string,
  entityId: string,
  parserVersion: string,
): Promise<GeoEntityMentionBatchRow[]> {
  assertSelectorField("projectId", projectId);
  assertSelectorField("batchId", batchId);
  assertSelectorField("entityId", entityId);
  assertSelectorField("parserVersion", parserVersion);

  const rows = await db
    .select({
      runId: geoObservationRuns.id,
      runRepeatIndex: geoObservationRuns.repeatIndex,
      mention: geoEntityMentions,
    })
    .from(geoEntityMentions)
    .innerJoin(
      geoObservationParses,
      and(
        eq(geoObservationParses.projectId, geoEntityMentions.projectId),
        eq(geoObservationParses.id, geoEntityMentions.parseId),
      ),
    )
    .innerJoin(
      geoObservationRuns,
      and(
        eq(geoObservationRuns.projectId, geoObservationParses.projectId),
        eq(geoObservationRuns.id, geoObservationParses.runId),
      ),
    )
    .where(
      and(
        eq(geoEntityMentions.projectId, projectId),
        eq(geoObservationRuns.batchId, batchId),
        eq(geoEntityMentions.entityId, entityId),
        eq(geoObservationParses.parserVersion, parserVersion),
      ),
    );

  return sortBy(
    rows,
    (row) => row.runRepeatIndex,
    (row) => row.runId,
    (row) => row.mention.parseId,
    (row) => row.mention.id,
  ).map((row) => ({ ...row.mention, runId: row.runId }));
}

/** The read-only entity-mention batch reader, backed by local storage. */
export const GeoEntityMentionBatchReaderRepository = {
  readBatchMentions,
};
