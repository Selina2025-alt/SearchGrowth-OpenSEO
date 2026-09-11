import { describe, expect, it } from "vitest";
import {
  searchGrowthTargetConfigJsonSchema,
  searchGrowthTargetConfigSchema,
  type SearchGrowthTarget,
  type SearchGrowthTargetConfig,
  searchGrowthTargetSchema,
} from "./search-growth-target";

// The SearchGrowthTarget domain boundary carries the openapi SearchGrowthTarget
// configuration document (the five required string-array fields), the Project
// identity, the provenance and the mutable update timestamp. It does NOT carry
// a preferred-market relation — that stays a separately scoped normalized
// Project->Market relation (TASK item 3).
// Compile-time guard: the fixture must satisfy the exported domain config type
// later configuration/market tasks consume.
const VALID_CONFIG: SearchGrowthTargetConfig = {
  brandAliases: ["JovaAI", "艾氪智能"],
  productTargets: ["询报价智能体"],
  icps: ["制造企业"],
  personas: ["CIO", "采购负责人"],
  conversionGoals: ["book_demo", "contact"],
};

const VALID_TARGET = {
  projectId: "proj_alpha",
  config: VALID_CONFIG,
  updatedBy: "operator_1",
  updatedAt: "2026-09-11T05:00:00.000Z",
};

describe("SearchGrowthTarget domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = searchGrowthTargetSchema.parse(VALID_TARGET);
    expect(parsed).toEqual(VALID_TARGET);
    expect(parsed.projectId).toBe("proj_alpha");
    expect(parsed.config).toEqual(VALID_CONFIG);
    expect(parsed.updatedBy).toBe("operator_1");
  });

  it("requires all five source-defined configuration fields", () => {
    for (const field of Object.keys(VALID_CONFIG)) {
      const config: Record<string, unknown> = { ...VALID_CONFIG };
      delete config[field];
      expect(searchGrowthTargetConfigSchema.safeParse(config).success).toBe(
        false,
      );
    }
  });

  it("rejects non-string-array configuration values", () => {
    expect(
      searchGrowthTargetConfigSchema.safeParse({
        ...VALID_CONFIG,
        brandAliases: "JovaAI",
      }).success,
    ).toBe(false);

    expect(
      searchGrowthTargetConfigSchema.safeParse({
        ...VALID_CONFIG,
        icps: [42],
      }).success,
    ).toBe(false);
  });

  it("does not encode the preferred-market relation inside the document", () => {
    // The relation is deliberately out of scope; an unexpected key is not part
    // of the accepted shape (TASK item 3).
    const parsed = searchGrowthTargetConfigSchema.parse({
      ...VALID_CONFIG,
      preferredMarketProfileIds: ["cn-baidu-desktop"],
    });
    expect("preferredMarketProfileIds" in parsed).toBe(false);
  });

  it("rejects a target row missing any direct field", () => {
    for (const field of Object.keys(VALID_TARGET)) {
      const rest: Record<string, unknown> = { ...VALID_TARGET };
      delete rest[field];
      expect(searchGrowthTargetSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("round-trips the configuration through the storage JSON boundary", () => {
    const encoded = searchGrowthTargetConfigJsonSchema.encode(VALID_CONFIG);
    expect(encoded).toBe(JSON.stringify(VALID_CONFIG));
    expect(searchGrowthTargetConfigJsonSchema.decode(encoded)).toEqual(
      VALID_CONFIG,
    );
  });

  it("rejects malformed or shape-mismatched stored configuration JSON", () => {
    expect(
      searchGrowthTargetConfigJsonSchema.safeDecode("{not json").success,
    ).toBe(false);

    // Valid JSON but not the accepted configuration shape.
    expect(
      searchGrowthTargetConfigJsonSchema.safeDecode('{"icps":["x"]}').success,
    ).toBe(false);
  });

  it("exports a domain type carrying the configuration, provenance and update timestamp", () => {
    // Compile-time guard: the domain type later configuration/market tasks
    // import carries the typed config plus provenance and updatedAt, and no
    // preferred-market or runtime/credential field.
    const target: SearchGrowthTarget = { ...VALID_TARGET };
    expect(target.config.conversionGoals).toEqual(["book_demo", "contact"]);
    expect("preferredMarketProfileIds" in target.config).toBe(false);
    expect("credentialId" in target).toBe(false);
    expect("marketProfileIds" in target).toBe(false);
  });
});
