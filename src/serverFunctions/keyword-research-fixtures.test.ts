import { describe, expect, it } from "vitest";
import { getSerpAnalysisFixture } from "../../e2e/fixtures/keyword-research-fixtures";

describe("getSerpAnalysisFixture", () => {
  it("returns a deterministic snapshot for the E2E keywords", () => {
    const keyword = "keyword research";

    const first = getSerpAnalysisFixture({ keyword, depth: 20 });
    const second = getSerpAnalysisFixture({ keyword, depth: 20 });

    expect(second).toEqual(first);
    expect(first.requestedKeyword).toBe("keyword research");
    expect(first.depth).toBe(20);
  });

  it("matches the live getSerpAnalysis response contract", () => {
    const result = getSerpAnalysisFixture({ keyword: "Open SEO", depth: 100 });

    expect(result.requestedKeyword).toBe("open seo");
    expect(result.depth).toBe(100);
    expect(result.items).toHaveLength(10);
    expect(result.items.map((item) => item.rank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    for (const item of result.items) {
      expect(item.title).toBeTruthy();
      expect(item.url.startsWith("https://")).toBe(true);
      expect(item.domain.endsWith(".test")).toBe(true);
      expect(item.isNew).toBe(false);
      expect(item.rankChange).toBeNull();
    }
  });

  it("defaults to the 20-deep snapshot the SERP panel opens at", () => {
    const result = getSerpAnalysisFixture({ keyword: "backlinks" });

    expect(result.depth).toBe(20);
  });
});
