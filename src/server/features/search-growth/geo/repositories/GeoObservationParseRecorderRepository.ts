import type { InferInsertModel } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { geoObservationParses } from "@/db/schema";
import {
  geoObservationAccuracyStatusSchema,
  geoObservationParseStatusSchema,
} from "@/types/schemas/geo-observation-parse";
import type {
  GeoObservationParseFact,
  GeoObservationParseRecorder,
} from "../services/geoObservationParseRecorder";

// ---------------------------------------------------------------------------
// GeoObservationParseRecorder persistence adapter (ADR-005,
// 05_DOMAIN_DATA_MODEL.md §7, 07_GEO_MEASUREMENT_SPEC.md §5,
// 21_TEST_ACCEPTANCE_PLAN.md §6)
// ---------------------------------------------------------------------------
//
// This module is the whole adapter: one supplied `GeoObservationParseFact`
// becomes exactly one INSERT into the accepted `geo_observation_parses` table,
// and every accepted column is taken from the fact. Nothing is derived,
// inferred, normalized, or synthesized — not the Project, the run, the parser
// version, the parse/accuracy status, the timestamp, or the current marker —
// and `created_at` keeps its existing database default.
//
// Boundaries:
//   - Versioned append-only. There is no update, upsert, dedupe, retry, delete,
//     or current-pointer selection. A duplicate `(run_id, parser_version)`, a
//     same-Project mismatch, or a dangling run surfaces as the database error
//     it is instead of being swallowed, and the raw run is never touched.
//   - Runtime validation at the trust boundary. The canonical Zod parse-status
//     and accuracy-status enums are reused, so an unsupported, case-mismatched,
//     or empty status is rejected before the INSERT (the database's TEXT column
//     would otherwise accept it). A missing/empty identity, a non-boolean
//     current marker, and an absent accuracy value are rejected too: there is
//     no fallback value to substitute.
//   - Out of scope by construction: no parser, raw-response inspection, entity/
//     citation extraction, recommendation/sentiment/accuracy computation,
//     mention/citation row, current-pointer workflow, provider, cache,
//     workflow, CRUD/server function, or migration.

/**
 * The storage-relevant runtime shape of one parse fact. The status members are
 * the accepted canonical enums, so validation cannot drift from the domain
 * contract; the identity/timestamp strings must be present and non-empty
 * because an empty one has no fallback and would be stored as an empty column.
 */
const geoObservationParseFactSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  runId: z.string().min(1),
  parserVersion: z.string().min(1),
  parseStatus: geoObservationParseStatusSchema,
  accuracyStatus: geoObservationAccuracyStatusSchema.nullable(),
  parsedAt: z.string().min(1),
  isCurrent: z.boolean(),
});

/** Field paths of every failed rule, so a rejection names what is unusable. */
function invalidFactMessage(error: z.ZodError): string {
  const fields = [
    ...new Set(error.issues.map((issue) => issue.path.join("."))),
  ];
  return `GEO observation parse recorder: refusing to persist an invalid parse fact (${fields.join(", ")}); parse and accuracy statuses must be the canonical values, identity/timestamp fields must be non-empty, and isCurrent must be a boolean.`;
}

async function record(parseFact: GeoObservationParseFact): Promise<void> {
  const parsed = geoObservationParseFactSchema.safeParse(parseFact);
  if (!parsed.success) {
    throw new Error(invalidFactMessage(parsed.error));
  }
  const fact = parsed.data;
  const values: InferInsertModel<typeof geoObservationParses> = {
    id: fact.id,
    projectId: fact.projectId,
    runId: fact.runId,
    parserVersion: fact.parserVersion,
    parseStatus: fact.parseStatus,
    accuracyStatus: fact.accuracyStatus,
    parsedAt: fact.parsedAt,
    isCurrent: fact.isCurrent,
  };
  await db.insert(geoObservationParses).values(values);
}

/** The parse recording port, backed by local storage. */
export const GeoObservationParseRecorderRepository: GeoObservationParseRecorder =
  {
    record,
  };
