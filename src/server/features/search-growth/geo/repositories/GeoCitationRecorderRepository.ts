import type { InferInsertModel } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { geoCitations } from "@/db/schema";
import { citationSourceOwnershipSchema } from "@/types/schemas/geo-citation";
import type {
  GeoCitationFact,
  GeoCitationRecorder,
} from "../services/geoCitationRecorder";

// ---------------------------------------------------------------------------
// GeoCitationRecorder persistence adapter (ADR-005,
// 05_DOMAIN_DATA_MODEL.md §7, 07_GEO_MEASUREMENT_SPEC.md §§5 and 8,
// 21_TEST_ACCEPTANCE_PLAN.md §3)
// ---------------------------------------------------------------------------
//
// This module is the whole adapter: one supplied `GeoCitationFact` becomes
// exactly one INSERT into the accepted `geo_citations` table, and every
// accepted column is taken from the fact. Nothing is derived, inferred,
// normalized, classified, matched, or synthesized — not the Project, the parse,
// the raw/normalized URL, the domain, the optional title/position, the
// ownership value, or the matched receipt reference — and `created_at` keeps
// its existing database default.
//
// Boundaries:
//   - Append-only. There is no update, upsert, dedupe, retry, delete,
//     parser-current selection, URL normalization, ownership classification, or
//     receipt matching. A duplicate id, a same-Project mismatch, or a dangling
//     parse/receipt surfaces as the database error it is instead of being
//     swallowed, and no raw run, parse, entity mention, receipt, or release row
//     is ever written or modified.
//   - No invented business uniqueness. The accepted table has exactly the
//     primary key; two supplied facts stay two rows even when they name the
//     same parse and URL.
//   - Runtime validation at the trust boundary. The identifiers must be
//     non-empty, `sourceOwnership` must be one of the accepted canonical enum
//     values, `title`/`matchedPublicationReceiptId` must be a string or an
//     explicit `null`, and `position` must be an integer or an explicit `null`.
//     A missing optional member is rejected rather than treated as `null`:
//     absent is not the same fact as "nothing was recorded", so there is no
//     fallback to substitute.
//   - Out of scope by construction: no URL parser/canonicalizer, citation
//     extraction runtime, entity/attribution/receipt matching, evidence
//     parsing, provider, cache, batch orchestration, UI, CRUD/server function,
//     publishing, or migration.

/**
 * The storage-relevant runtime shape of one citation fact. Identity strings must
 * be present and non-empty because an empty one has no fallback and would be
 * stored as an empty column; the accepted ownership enum is reused so
 * validation cannot drift from the domain contract; the optional members accept
 * a real value or an explicit `null` and nothing else.
 */
const geoCitationFactSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  parseId: z.string().min(1),
  rawUrl: z.string().min(1),
  normalizedUrl: z.string().min(1),
  domain: z.string().min(1),
  title: z.string().nullable(),
  // `Number.isInteger` rejects a fraction, NaN, and Infinity, so a rank-like or
  // non-finite stand-in never reaches the INTEGER column.
  position: z.number().int().nullable(),
  sourceOwnership: citationSourceOwnershipSchema,
  matchedPublicationReceiptId: z.string().nullable(),
});

/** Field paths of every failed rule, so a rejection names what is unusable. */
function invalidFactMessage(error: z.ZodError): string {
  const fields = [
    ...new Set(error.issues.map((issue) => issue.path.join("."))),
  ];
  return `GEO citation recorder: refusing to persist an invalid citation fact (${fields.join(", ")}); identifiers must be non-empty, sourceOwnership must be the canonical value, title/matchedPublicationReceiptId must be a string or null, and position must be an integer or null.`;
}

async function record(citationFact: GeoCitationFact): Promise<void> {
  const parsed = geoCitationFactSchema.safeParse(citationFact);
  if (!parsed.success) {
    throw new Error(invalidFactMessage(parsed.error));
  }
  const fact = parsed.data;
  const values: InferInsertModel<typeof geoCitations> = {
    id: fact.id,
    projectId: fact.projectId,
    parseId: fact.parseId,
    rawUrl: fact.rawUrl,
    normalizedUrl: fact.normalizedUrl,
    domain: fact.domain,
    title: fact.title,
    position: fact.position,
    sourceOwnership: fact.sourceOwnership,
    matchedPublicationReceiptId: fact.matchedPublicationReceiptId,
  };
  await db.insert(geoCitations).values(values);
}

/** The citation recording port, backed by local storage. */
export const GeoCitationRecorderRepository: GeoCitationRecorder = {
  record,
};
