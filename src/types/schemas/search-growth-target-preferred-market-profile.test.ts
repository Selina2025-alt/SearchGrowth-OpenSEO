import { describe, expect, it } from "vitest";
import {
  searchGrowthTargetPreferredMarketProfileSchema,
  type SearchGrowthTargetPreferredMarketProfile,
} from "./search-growth-target-preferred-market-profile";

// The preferred-market relation domain boundary carries the normalized
// relation row only: the stable relation id, the Project identity (which names
// the target row), the referenced SearchMarketProfile id and the append-only
// createdAt. It deliberately carries NO ordering/priority/primary-market field
// and no duplicated market payload — the relation is storage/contract only.

const VALID_ROW = {
  id: "preferred_market_1",
  projectId: "proj_alpha",
  marketProfileId: "market_profile_alpha_1",
  createdAt: "2026-09-11T05:00:00.000Z",
};

// Compile-time guard: the fixture must satisfy the exported domain row type
// later market-relation consumers import.
const VALID_TYPED_ROW: SearchGrowthTargetPreferredMarketProfile = VALID_ROW;

describe("SearchGrowthTargetPreferredMarketProfile domain boundary", () => {
  it("accepts the full relation row and preserves every field verbatim", () => {
    const parsed =
      searchGrowthTargetPreferredMarketProfileSchema.parse(VALID_TYPED_ROW);
    expect(parsed).toEqual(VALID_ROW);
    expect(parsed.projectId).toBe("proj_alpha");
    expect(parsed.marketProfileId).toBe("market_profile_alpha_1");
  });

  it("rejects a relation row missing any direct field", () => {
    for (const field of Object.keys(VALID_ROW)) {
      const rest: Record<string, unknown> = { ...VALID_ROW };
      delete rest[field];
      expect(
        searchGrowthTargetPreferredMarketProfileSchema.safeParse(rest).success,
      ).toBe(false);
    }
  });

  it("rejects non-string identity values", () => {
    expect(
      searchGrowthTargetPreferredMarketProfileSchema.safeParse({
        ...VALID_ROW,
        marketProfileId: 42,
      }).success,
    ).toBe(false);
  });

  it("does not carry ordering, priority or primary-market semantics", () => {
    // An unexpected key is not part of the accepted relation shape, so no
    // ordering/priority/primary role can be encoded on the row.
    const parsed = searchGrowthTargetPreferredMarketProfileSchema.parse({
      ...VALID_ROW,
      priority: 1,
      isPrimary: true,
    });
    expect("priority" in parsed).toBe(false);
    expect("isPrimary" in parsed).toBe(false);
    expect("updatedAt" in parsed).toBe(false);
  });
});
