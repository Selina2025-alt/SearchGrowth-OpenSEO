import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { searchGrowthOpportunities } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// SearchGrowthOpportunity domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum columns give compile-time narrowing; the profile and
// page-fit Zod enums below are the runtime trust boundary for untrusted input
// before any repository write (mirrors ../schemas/geo-citation.ts,
// ../schemas/search-prompt.ts and the other Search Growth schema-boundary
// modules). The enum unions are the canonical V1.0 sets from
// schemas/domain-types.ts SearchGrowthOpportunity:
//   - `profile` is exactly the OpportunityProfile union
//     (EXISTING_GOOGLE_PAGE | EXISTING_SEARCH_PAGE_PARTIAL | NEW_TOPIC |
//     GEO_DISTRIBUTION | EVIDENCE_ONLY | TECHNICAL_BLOCKER —
//     05_DOMAIN_DATA_MODEL.md §8 `type`, 21_TEST_ACCEPTANCE_PLAN.md §7);
//   - `page_fit_action` is exactly the PageFitAction union
//     (NEW_PAGE | REFRESH_PAGE | MERGE | DISTRIBUTE_ONLY | EVIDENCE_ONLY |
//     TECHNICAL_FIX — 21_TEST_ACCEPTANCE_PLAN.md §8).
// Because the approved values are uppercase, lowercase/mixed-case and empty
// strings are rejected — there is no case-insensitive parsing and no
// implicit/unknown fallback. The storage layer enforces the same two lists
// with the named CHECK constraints on the `search_growth_opportunities` table.
//
// The score/data-quality/evidence payloads are immutable JSON snapshot
// columns; their writable content is produced by the later (out-of-scope)
// opportunity computation. The "directly supported" DataQuality boundary is
// validated here so the canonical status/warning unions from
// schemas/domain-types.ts DataQuality are pinned before a snapshot is stored:
//   - `data_quality_status` is exactly COMPLETE | DEGRADED | INSUFFICIENT;
//   - each `warnings[]` entry is exactly LOW_SAMPLE | NO_GA4 | NO_GSC |
//     PROVIDER_PARTIAL_FAILURE | MODEL_CHANGED | SURFACE_CHANGED |
//     PARSER_CHANGED | MARKET_CHANGED | DATA_LAG.
// These two are boundary-only (the snapshot itself is opaque JSON text to the
// storage layer, exactly as the migration reference declares `data_quality_json`);
// no score/profile/action calculation or mutation happens in this slice.
//
// Full-row CRUD/input schemas belong to the later opportunity CRUD/computation
// task; this task pins the domain contract the storage layer is built on. The
// exported `SearchGrowthOpportunity` row type is the domain shape later tasks
// will consume: every scalar storage field of the mutable, Project-scoped
// opportunity row — including the nullable `market_profile_id`/`target_page_url`,
// the required profile/page-fit enums, the three immutable snapshot columns and
// the system timestamps.

export type SearchGrowthOpportunity = InferSelectModel<
  typeof searchGrowthOpportunities
>;

export const opportunityProfileSchema = z.enum(
  searchGrowthOpportunities.profile.enumValues,
);
export type OpportunityProfile = z.infer<typeof opportunityProfileSchema>;

export const pageFitActionSchema = z.enum(
  searchGrowthOpportunities.pageFitAction.enumValues,
);
export type PageFitAction = z.infer<typeof pageFitActionSchema>;

export const dataQualityStatusSchema = z.enum([
  "COMPLETE",
  "DEGRADED",
  "INSUFFICIENT",
]);
export type DataQualityStatus = z.infer<typeof dataQualityStatusSchema>;

export const dataQualityWarningSchema = z.enum([
  "LOW_SAMPLE",
  "NO_GA4",
  "NO_GSC",
  "PROVIDER_PARTIAL_FAILURE",
  "MODEL_CHANGED",
  "SURFACE_CHANGED",
  "PARSER_CHANGED",
  "MARKET_CHANGED",
  "DATA_LAG",
]);
export type DataQualityWarning = z.infer<typeof dataQualityWarningSchema>;
