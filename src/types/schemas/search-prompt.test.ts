import { describe, expect, it } from "vitest";
import { searchPrompts } from "@/db/search-growth.schema";
import type { PromptType, SearchPrompt } from "./search-prompt";
import { promptTypeSchema, searchPromptScoreSchema } from "./search-prompt";

// The DB text-enum column and the Zod boundary must not drift: a value the Zod
// schema accepts has to be a value the column type admits, and vice versa.
// Drift here would let future repositories write a prompt kind the domain
// boundary never validated.
describe("SearchPrompt domain boundary", () => {
  it("lists every prompt_type column value as a valid PromptType", () => {
    for (const type of searchPrompts.promptType.enumValues) {
      expect(promptTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects unsupported, case-mismatched and empty PromptType values", () => {
    for (const type of [
      // Case-mismatched variants of the approved lowercase values.
      "DEFINITION",
      "Definition",
      "Problem",
      "Brand_Validation",
      "brand-validation",
      // Unsupported prompt kinds.
      "PROBLEM",
      "COMPARISON",
      "question",
      "keyword",
      "narrative",
      "template",
      "GEO",
      "",
    ]) {
      expect(promptTypeSchema.safeParse(type).success).toBe(false);
    }
  });

  it("accepts only the 0..100 score range the domain contract defines", () => {
    for (const score of [0, 1, 50, 87.5, 99.9, 100]) {
      expect(searchPromptScoreSchema.safeParse(score).success).toBe(true);
    }
    for (const score of [
      -1,
      -0.01,
      100.01,
      101,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(searchPromptScoreSchema.safeParse(score).success).toBe(false);
    }
  });

  it("exports PromptType/row types aligned with the storage columns", () => {
    // Compile-time guard: the domain types later prompt tasks will import must
    // stay true to the storage enum and the select row shape — including the
    // nullable market_profile_id, the normalized-prompt/version identity inputs
    // and the 0..100 score columns.
    const type: PromptType = "brand_validation";
    const prompt: Pick<
      SearchPrompt,
      | "id"
      | "projectId"
      | "topicId"
      | "promptText"
      | "normalizedPrompt"
      | "promptType"
      | "marketProfileId"
      | "language"
      | "businessFit"
      | "priority"
      | "version"
      | "active"
    > = {
      id: "prompt_alpha_v1",
      projectId: "proj_alpha",
      topicId: "topic_alpha",
      promptText: "Explain how {brand} compares on {topic}",
      normalizedPrompt: "explain how {brand} compares on {topic}",
      promptType: type,
      marketProfileId: null,
      language: "en",
      businessFit: 80,
      priority: 60,
      version: 1,
      active: true,
    };
    expect(prompt.promptType).toBe("brand_validation");
    expect(prompt.normalizedPrompt).toBe(
      "explain how {brand} compares on {topic}",
    );
    expect(prompt.marketProfileId).toBeNull();
    expect(prompt.businessFit).toBe(80);
    expect(prompt.version).toBe(1);
  });
});
