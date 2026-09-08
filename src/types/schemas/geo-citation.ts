import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { geoCitations } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// GeoCitation domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum column gives compile-time narrowing; this Zod enum is
// the runtime trust boundary for untrusted input before any repository write
// (mirrors ../schemas/geo-observation-parse.ts, ../schemas/geo-observation-run.ts
// and the other Search Growth schema-boundary modules). The enum union is the
// canonical V1.0 set from schemas/domain-types.ts CitationOwnership:
// `source_ownership` is exactly OWNED_DOMAIN | CONTROLLED_PUBLICATION |
// EARNED_THIRD_PARTY | COMPETITOR | UNKNOWN (05_DOMAIN_DATA_MODEL.md §7
// GeoCitation). Because the approved values are uppercase, lowercase/mixed-case
// and empty strings are rejected — there is no case-insensitive parsing and no
// implicit/unknown fallback beyond the explicit UNKNOWN value.
//
// This is boundary validation only: no classification, URL normalization,
// receipt matching or attribution logic exists in this slice. A citation whose
// ownership has not yet been classified would carry UNKNOWN; the raw and
// normalized URL values are produced by a later out-of-scope task and are
// stored here exactly as that task hands them over.
//
// Full-row CRUD/input schemas belong to the later geo-citation CRUD task; this
// task pins the domain contract the append-only storage layer is built on. The
// exported `GeoCitation` row type is the domain shape later tasks will consume:
// every scalar storage field of the immutable, Project-scoped citation —
// including the required parse binding, the nullable `title`/`position`/
// `matched_publication_receipt_id` optional fields and the absence of any
// updated/current-pointer field.

export type GeoCitation = InferSelectModel<typeof geoCitations>;

export const citationSourceOwnershipSchema = z.enum(
  geoCitations.sourceOwnership.enumValues,
);
export type CitationSourceOwnership = z.infer<
  typeof citationSourceOwnershipSchema
>;
