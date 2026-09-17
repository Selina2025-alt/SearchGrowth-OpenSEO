import { and, eq } from "drizzle-orm";
import { sortBy } from "remeda";
import { z } from "zod";
import { db } from "@/db";
import { geoObservationRuns } from "@/db/schema";
import type { GeoObservationRun } from "@/types/schemas/geo-observation-run";

// ---------------------------------------------------------------------------
// GEO observation batch reader (ADR-003, ADR-005,
// 07_GEO_MEASUREMENT_SPEC.md §§1–3/§7, 05_DOMAIN_DATA_MODEL.md §6)
// ---------------------------------------------------------------------------
//
// One read: the immutable observation runs of exactly one Project-scoped batch,
// as stored. It is the read half the later metric/cohort callers need, and it
// answers only "which runs are in this batch?" — never "what do they mean?".
//
// Boundaries:
//   - Both selector fields are required and validated before any query. A
//     batch-only lookup is impossible: `batch_id` is a free-form grouping id and
//     V1.0 defines no batch table, so nothing makes it unique across Projects.
//     The Project is what scopes the read, and the SELECT therefore always
//     constrains on `project_id` AND `batch_id`.
//   - Read-only and opaque. Rows come back exactly as stored — `raw_answer`,
//     `raw_response`, `usage_json`, and every provenance field included.
//     Nothing is parsed, normalized, serialized, reconstructed, redacted, or
//     copied into a new evidence format, and no row is ever written: this module
//     contains no INSERT, UPDATE, DELETE, upsert, or cache access. Raw evidence
//     stays the untouchable fact ADR-005 requires.
//   - No meaning is added. The reader does not count repeats, decide whether a
//     batch is complete, check that its rows form a compatible metric cohort
//     (§7 surface/market profile/model/sample count), classify confidence, or
//     derive any fraction, rate, or share. Those stay separate, explicit
//     decisions for the callers that own them.
//   - Fail loudly. A database failure propagates as the failure it is; there is
//     no catch and no fallback, because an empty result must mean "this Project
//     has no runs in this batch" and never "the read did not happen".
//   - No provider, credential, Prompt Explorer/R2 cache, scheduler, parser,
//     mention/citation extraction, workflow, or UI dependency lives here.
//
// Ordering: `repeatIndex` then `id`, both stored keys. The sort is applied to the
// read rows instead of being pushed into a SQL `ORDER BY`, because ids are text
// and dialect collations disagree about punctuation (SQLite's BINARY order and a
// locale-aware Postgres collation can order `run-a` and `runa` differently).
// Sorting in one implementation makes the order total and identical on every
// dialect. It is a stable presentation order only: no run is preferred or
// dropped, and the batch's meaning is unchanged by it.

/** The literal error wording for one unusable selector field. */
const selectorFieldSchema = z.string({ error: "must be a string" }).min(1, {
  error: "must be a non-empty string",
});

/** The two selector fields a batch read is defined by. */
export type GeoObservationBatchSelectorField = "projectId" | "batchId";

/**
 * The supplied selector is not a usable storage key. Checked before any query,
 * because these TypeScript types do not exist at runtime and an empty or
 * non-string id would otherwise become a query against the wrong Project or
 * batch (or against none) — a read whose wrong-empty result is indistinguishable
 * from an honest empty batch.
 */
export class GeoObservationBatchReaderError extends Error {
  constructor(
    public readonly field: GeoObservationBatchSelectorField,
    detail: string,
  ) {
    super(`GEO observation batch reader: ${field} ${detail}.`);
    this.name = "GeoObservationBatchReaderError";
  }
}

/** Reject one unusable selector field, naming which of the two it was. */
function assertSelectorField(
  field: GeoObservationBatchSelectorField,
  value: string,
): void {
  const result = selectorFieldSchema.safeParse(value);
  if (!result.success) {
    throw new GeoObservationBatchReaderError(
      field,
      result.error.issues[0]?.message ?? "is not valid",
    );
  }
}

/**
 * Every stored run of one Project's batch, exactly as stored.
 *
 * Both selector fields are validated before the SELECT, so an unusable selector
 * can never reach storage. The query is Project-scoped: rows of another Project
 * are excluded even when they carry the same `batchId`. A database failure is
 * not caught, so it surfaces to the caller instead of becoming an empty batch.
 */
async function readBatch(
  projectId: string,
  batchId: string,
): Promise<readonly GeoObservationRun[]> {
  assertSelectorField("projectId", projectId);
  assertSelectorField("batchId", batchId);

  const rows = await db
    .select()
    .from(geoObservationRuns)
    .where(
      and(
        eq(geoObservationRuns.projectId, projectId),
        eq(geoObservationRuns.batchId, batchId),
      ),
    );

  return sortBy(
    rows,
    (row) => row.repeatIndex,
    (row) => row.id,
  );
}

/** The read-only observation batch reader, backed by local storage. */
export const GeoObservationBatchReaderRepository = {
  readBatch,
};
