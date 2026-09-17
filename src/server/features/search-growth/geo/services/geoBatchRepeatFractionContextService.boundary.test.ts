import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static source boundary for the batch repeat fraction context service (T158):
// the shipped module must depend on exactly the two accepted boundaries it
// composes, count only the stored SUCCEEDED status, and contain no database,
// write, provider, credential, cache, parser, workflow, aggregation, or metric
// behavior of its own. This file deliberately has no storage harness, so it
// proves the boundary from the shipped text alone.

const SERVICE_SOURCE =
  "src/server/features/search-growth/geo/services/geoBatchRepeatFractionContextService.ts";

describe("batch repeat fraction context service source boundary", () => {
  const source = readFileSync(SERVICE_SOURCE, "utf8");
  // Comments are stripped for the call-shape assertions, so documentation that
  // names an API, a status, or a field cannot be mistaken for a use of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const importLines = (
    source.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? []
  ).join("\n");

  it("depends on exactly the accepted T157 service and T153 presenter", () => {
    expect(
      [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]),
    ).toEqual([
      "./geoObservationBatchCohortContextService",
      "./geoRepeatFractionPresenter",
    ]);
    expect(importLines).not.toMatch(
      /@\/db|drizzle|node:fs|process\.env|cloudflare:|schema/,
    );
    // Exactly one exported symbol: the composed read itself.
    expect(source.match(/^export /gm)).toHaveLength(1);
  });

  it("reads once through T157 and presents once through T153, in order", () => {
    expect(code.match(/readGeoObservationBatchCohortContext\(/g)).toHaveLength(
      1,
    );
    expect(code.match(/presentGeoRepeatFraction\(/g)).toHaveLength(1);
    expect(code.indexOf("readGeoObservationBatchCohortContext(")).toBeLessThan(
      code.indexOf("presentGeoRepeatFraction("),
    );
    expect(code).not.toMatch(
      /\.select\(|\.from\(|\.where\(|\.insert\(|\.update\(|\.delete\(|\.set\(|\.values\(|\.returning\(|upsert|\.batch\(/,
    );
    expect(code).not.toMatch(/geoObservationRuns|drizzle|@\/db/);
  });

  it("counts only the stored SUCCEEDED status and interprets no other", () => {
    expect(code.match(/status === "SUCCEEDED"/g)).toHaveLength(1);
    expect(code).not.toMatch(/"(PENDING|RUNNING|FAILED)"/);
    // One increment site, inside one loop: the count is the only arithmetic.
    expect(code.match(/for \(/g)).toHaveLength(1);
    expect(code.match(/\+= 1/g)).toHaveLength(1);
  });

  it("reaches no provider, credential, cache, parser, workflow, or environment", () => {
    expect(code).not.toMatch(
      /fetch\(|process\.env|node:fs|cache|provider|credential|parser|prompt|language|window|workflow|console\./i,
    );
    expect(code).not.toMatch(
      /rawAnswer|rawResponse|usageJson|providerRequestId/,
    );
  });

  it("filters, reorders, aggregates, and measures nothing", () => {
    expect(code).not.toMatch(
      /\.filter\(|\.map\(|\.sort\(|\.toSorted\(|\.reduce\(|new Set\(|new Map\(|Math\.|readBatch\(/,
    );
    expect(code).not.toMatch(
      /aggregate|percent|numerator|denominator|confidence|significan|\brate\b|\bratio\b|\bmetric\b|dedupe|distinct|average/i,
    );
  });

  it("swallows no failure and defaults nothing", () => {
    expect(code).not.toMatch(/\btry\b|\bcatch\b|\?\?|\|\|/);
    expect(code).not.toMatch(
      /parseInt|parseFloat|Number\(|String\(|Boolean\(|Object\.assign|Object\.fromEntries|\.trim\(|toLowerCase|toUpperCase|\.normalize\(|\.replace\(/,
    );
  });
});
