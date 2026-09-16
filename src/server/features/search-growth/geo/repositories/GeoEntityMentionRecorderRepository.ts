import type { InferInsertModel } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { geoEntityMentions } from "@/db/schema";
import type {
  GeoEntityMentionFact,
  GeoEntityMentionRecorder,
} from "../services/geoEntityMentionRecorder";

// ---------------------------------------------------------------------------
// GeoEntityMentionRecorder persistence adapter (ADR-005,
// 05_DOMAIN_DATA_MODEL.md §7, 07_GEO_MEASUREMENT_SPEC.md §5,
// 21_TEST_ACCEPTANCE_PLAN.md §3)
// ---------------------------------------------------------------------------
//
// This module is the whole adapter: one supplied `GeoEntityMentionFact` becomes
// exactly one INSERT into the accepted `geo_entity_mentions` table, and every
// accepted column is taken from the fact. Nothing is derived, inferred,
// normalized, matched, or synthesized — not the Project, the parse, the entity,
// the verdict, or the optional values — and `created_at` keeps its existing
// database default.
//
// Boundaries:
//   - Append-only. There is no update, upsert, dedupe, retry, delete,
//     current-pointer selection, or entity matching. A duplicate id, a
//     same-Project mismatch, or a dangling parse/entity surfaces as the
//     database error it is instead of being swallowed, and no raw run, parse,
//     citation, or entity/alias row is ever written or modified.
//   - No invented business uniqueness. The accepted table has exactly the
//     primary key; two supplied facts stay two rows even when they name the
//     same parse and entity.
//   - Runtime validation at the trust boundary. The identifiers must be
//     nonempty, `mentioned` must be a boolean, `recommended` must be a boolean
//     or an explicit `null`, `mentionPosition` must be an integer or an
//     explicit `null`, and `sentiment`/`evidenceText` must be a string or an
//     explicit `null`. A missing optional member is rejected rather than
//     treated as `null`: absent is not the same fact as "the parser recorded
//     no value", so there is no fallback to substitute.
//   - Out of scope by construction: no deterministic or LLM entity matcher,
//     alias lookup, raw-response inspection, entity/citation extraction
//     runtime, recommendation/sentiment/position computation, parser/reparse/
//     current-pointer workflow, provider, cache, batch orchestration, UI,
//     CRUD/server function, or migration.

/**
 * The storage-relevant runtime shape of one mention fact. Identity strings must
 * be present and non-empty because an empty one has no fallback and would be
 * stored as an empty column; the optional members accept a real value or an
 * explicit `null` and nothing else.
 */
const geoEntityMentionFactSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  parseId: z.string().min(1),
  entityId: z.string().min(1),
  mentioned: z.boolean(),
  recommended: z.boolean().nullable(),
  // `Number.isInteger` rejects a fraction, NaN, and Infinity, so a rank-like or
  // non-finite stand-in never reaches the INTEGER column.
  mentionPosition: z.number().int().nullable(),
  sentiment: z.string().nullable(),
  evidenceText: z.string().nullable(),
});

/** Field paths of every failed rule, so a rejection names what is unusable. */
function invalidFactMessage(error: z.ZodError): string {
  const fields = [
    ...new Set(error.issues.map((issue) => issue.path.join("."))),
  ];
  return `GEO entity mention recorder: refusing to persist an invalid mention fact (${fields.join(", ")}); identifiers must be non-empty, mentioned must be a boolean, recommended must be a boolean or null, mentionPosition must be an integer or null, and sentiment/evidenceText must be a string or null.`;
}

async function record(mentionFact: GeoEntityMentionFact): Promise<void> {
  const parsed = geoEntityMentionFactSchema.safeParse(mentionFact);
  if (!parsed.success) {
    throw new Error(invalidFactMessage(parsed.error));
  }
  const fact = parsed.data;
  const values: InferInsertModel<typeof geoEntityMentions> = {
    id: fact.id,
    projectId: fact.projectId,
    parseId: fact.parseId,
    entityId: fact.entityId,
    mentioned: fact.mentioned,
    recommended: fact.recommended,
    mentionPosition: fact.mentionPosition,
    sentiment: fact.sentiment,
    evidenceText: fact.evidenceText,
  };
  await db.insert(geoEntityMentions).values(values);
}

/** The entity-mention recording port, backed by local storage. */
export const GeoEntityMentionRecorderRepository: GeoEntityMentionRecorder = {
  record,
};
