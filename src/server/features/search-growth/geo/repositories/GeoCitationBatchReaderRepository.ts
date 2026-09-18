import { and, eq } from "drizzle-orm";
import { sortBy } from "remeda";
import { z } from "zod";
import { db } from "@/db";
import {
  geoCitations,
  geoObservationParses,
  geoObservationRuns,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// GEO citation batch reader (ADR-003, ADR-005, 05_DOMAIN_DATA_MODEL.md §7,
// 07_GEO_MEASUREMENT_SPEC.md §§5, 7 and 8)
// ---------------------------------------------------------------------------
//
// One read: the persisted `geo_citations` rows that belong to exactly one
// Project, one observation batch, and one parser version, each beside the
// concrete run and parse identities it was extracted from. It is deterministic,
// version-explicit citation evidence input for a later citation measurement —
// never the measurement itself.
//
// Boundaries:
//   - Three required selectors, validated before any query. The Project, the
//     run's batch, and the parse's parser version are all non-empty strings; a
//     partial selector is not a narrower read, it is a read against the wrong or
//     an unintended slice, so nothing is defaulted or inferred.
//   - One read, three accepted relations. Exactly one SELECT joins the accepted
//     citation storage to its accepted versioned parse and immutable run through
//     the stored same-Project keys, and all three selectors are constrained. No
//     second query, no raw payload table, no receipt/publication relation, and
//     no entity, prompt, or cohort table is read.
//   - Version-explicit, never "current". `parserVersion` is matched by equality.
//     There is no latest-version selection, no `is_current` consultation, no
//     parser-version collapsing, and no reparse or current-pointer behavior: a
//     caller that wants v1 and a caller that wants v2 get exactly their rows.
//   - Rows are returned as stored. Every accepted citation column — the stored
//     raw and normalized URL, domain, optional title/position, the stored
//     ownership classification, and the optional matched-receipt reference —
//     comes back unchanged, with only the parent `runId` added so a citation can
//     be traced to the run its parse was computed from. `parseId` is already the
//     citation's own stored parent identity. Nothing is normalized, parsed,
//     classified, matched, inferred, filtered, deduplicated, counted,
//     aggregated, or converted into a fraction/rate/metric/confidence.
//   - Fail loudly. Unusable selectors reject before the SELECT, and a database
//     failure propagates as the failure it is. There is no catch, fallback,
//     default, or coercion, so an empty result means only "this explicit
//     three-part selector matched no stored citation".
//   - No write, provider, credential, cache, scheduler, parser, URL-normalizer,
//     publication-matcher, workflow, UI, or server-function dependency lives
//     here: no INSERT/UPDATE/DELETE, no upsert, no raw observation, parse,
//     citation, receipt, publication, or cohort mutation.
//
// Ordering: `repeatIndex`, run id, parse id, then citation id — all stored keys.
// The sort runs in one implementation instead of a SQL `ORDER BY`, because ids
// are text and dialect collations disagree about punctuation (SQLite's BINARY
// order and a locale-aware Postgres collation can order `run-a` and `runa`
// differently). Sorting here makes the order total and identical on every
// dialect. It is a stable presentation order only: no run, parse, version, or
// citation is preferred, dropped, or merged by it.

/** The literal error wording for one unusable selector field. */
const selectorFieldSchema = z.string({ error: "must be a string" }).min(1, {
  error: "must be a non-empty string",
});

/** The three selector fields a citation batch read is defined by. */
export type GeoCitationBatchSelectorField =
  | "projectId"
  | "batchId"
  | "parserVersion";

/**
 * The supplied selector is not a usable storage key. Checked before any query,
 * because these TypeScript types do not exist at runtime and an empty or
 * non-string id would otherwise become a query against the wrong Project,
 * batch, or parser version (or against none) — a read whose wrong-empty result
 * is indistinguishable from an honest empty one.
 */
export class GeoCitationBatchReaderError extends Error {
  constructor(
    public readonly field: GeoCitationBatchSelectorField,
    detail: string,
  ) {
    super(`GEO citation batch reader: ${field} ${detail}.`);
    this.name = "GeoCitationBatchReaderError";
  }
}

/** Reject one unusable selector field, naming which of the three it was. */
function assertSelectorField(
  field: GeoCitationBatchSelectorField,
  value: string,
): void {
  const result = selectorFieldSchema.safeParse(value);
  if (!result.success) {
    throw new GeoCitationBatchReaderError(
      field,
      result.error.issues[0]?.message ?? "is not valid",
    );
  }
}

/** The accepted `geo_citations` row type, exactly as stored. */
type GeoCitationRow = typeof geoCitations.$inferSelect;

/**
 * One stored citation beside the immutable run it was parsed from. `parseId` is
 * already the citation's own stored parent identity; `runId` is the one added
 * identifier, taken from the joined parse's stored run.
 */
type GeoCitationBatchRow = GeoCitationRow & {
  runId: string;
};

/**
 * Every stored citation of one Project's batch and parser version, each with the
 * run it was parsed from.
 *
 * All three selectors are validated before the SELECT, so an unusable selector
 * can never reach storage. The join is the accepted chain — citation to its
 * same-Project versioned parse, parse to its same-Project immutable run — and
 * the predicates pin the citation's Project, the run's batch, and the parse's
 * parser version, so rows of another Project, batch, or parser version are
 * excluded even when the other keys collide. A database failure is not caught,
 * so it surfaces to the caller instead of becoming an empty result.
 */
async function readBatchCitations(
  projectId: string,
  batchId: string,
  parserVersion: string,
): Promise<GeoCitationBatchRow[]> {
  assertSelectorField("projectId", projectId);
  assertSelectorField("batchId", batchId);
  assertSelectorField("parserVersion", parserVersion);

  const rows = await db
    .select({
      runId: geoObservationRuns.id,
      runRepeatIndex: geoObservationRuns.repeatIndex,
      citation: geoCitations,
    })
    .from(geoCitations)
    .innerJoin(
      geoObservationParses,
      and(
        eq(geoObservationParses.projectId, geoCitations.projectId),
        eq(geoObservationParses.id, geoCitations.parseId),
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
        eq(geoCitations.projectId, projectId),
        eq(geoObservationRuns.batchId, batchId),
        eq(geoObservationParses.parserVersion, parserVersion),
      ),
    );

  return sortBy(
    rows,
    (row) => row.runRepeatIndex,
    (row) => row.runId,
    (row) => row.citation.parseId,
    (row) => row.citation.id,
  ).map((row) => ({ ...row.citation, runId: row.runId }));
}

/** The read-only citation batch reader, backed by local storage. */
export const GeoCitationBatchReaderRepository = {
  readBatchCitations,
};
