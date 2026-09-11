import { z } from "zod";

// ---------------------------------------------------------------------------
// SearchGrowthTargetPreferredMarketProfile domain boundary
// ---------------------------------------------------------------------------
//
// ONE row of this boundary is ONE preferred-market reference of a Project's
// search growth target (05_DOMAIN_DATA_MODEL.md §1 SearchGrowthTarget
// `preferred_market_profile_ids[]`). The matching storage table
// (`search_growth_target_preferred_market_profiles` in
// src/db/search-growth.schema.ts) keeps the relation normalized: each reference
// is a row with an explicit typed FK column, never a JSON/text array on
// `search_growth_targets`.
//
// The row contract carries ONLY the normalized relation identity:
//   - `id` is the relation row's stable primary key.
//   - `projectId` is the Project identity: it names the target row (whose
//     primary key is the Project id) AND leads the same-Project market FK.
//   - `marketProfileId` is the referenced SearchMarketProfile id. The referenced
//     profile already owns the concrete engine/location/language/device
//     identity, so no market payload is duplicated here.
//   - `createdAt` is the append-only system insert timestamp. There is no
//     `updatedAt` and no ordering/priority/primary-market field: this slice is
//     storage/contract only (no activation, runtime or selection behavior).

export const searchGrowthTargetPreferredMarketProfileSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  marketProfileId: z.string(),
  createdAt: z.string(),
});

export type SearchGrowthTargetPreferredMarketProfile = z.infer<
  typeof searchGrowthTargetPreferredMarketProfileSchema
>;
