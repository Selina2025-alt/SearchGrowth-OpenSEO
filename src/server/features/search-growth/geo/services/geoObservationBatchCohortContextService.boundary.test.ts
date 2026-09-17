import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static source boundary for the batch cohort context service (T157): the
// shipped module must depend on exactly the two accepted boundaries it composes
// and contain no database, write, provider, credential, cache, parser, workflow,
// aggregation, or metric behavior of its own. This file deliberately has no
// storage harness, so it proves the boundary from the shipped text alone.

const SERVICE_SOURCE =
  "src/server/features/search-growth/geo/services/geoObservationBatchCohortContextService.ts";

describe("batch cohort context service source boundary", () => {
  const source = readFileSync(SERVICE_SOURCE, "utf8");
  // Comments are stripped for the call-shape assertions, so documentation that
  // names an API or a field cannot be mistaken for a use of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const importLines = (
    source.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? []
  ).join("\n");

  it("depends on exactly the accepted T154 reader and T156 assembler", () => {
    expect(
      [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]),
    ).toEqual([
      "../repositories/GeoObservationBatchReaderRepository",
      "./geoObservationCohortContextAssembler",
    ]);
    expect(importLines).not.toMatch(
      /@\/db|drizzle|node:fs|process\.env|cloudflare:|schema/,
    );
  });

  it("reads once and assembles once, in order, and queries nothing itself", () => {
    expect(code.match(/readBatch\(/g)).toHaveLength(1);
    expect(code.match(/assembleGeoObservationCohortContext\(/g)).toHaveLength(
      1,
    );
    expect(code.indexOf("readBatch(")).toBeLessThan(
      code.indexOf("assembleGeoObservationCohortContext("),
    );
    expect(code).not.toMatch(
      /\.select\(|\.from\(|\.where\(|\.insert\(|\.update\(|\.delete\(|\.set\(|\.values\(|\.returning\(|upsert|\.batch\(/,
    );
    expect(code).not.toMatch(/geoObservationRuns|drizzle|@\/db/);
  });

  it("reaches no provider, credential, cache, parser, workflow, or environment", () => {
    expect(code).not.toMatch(
      /fetch\(|process\.env|node:fs|cache|provider|credential|parser|prompt|language|window|workflow|console\./i,
    );
    expect(code).not.toMatch(
      /rawAnswer|rawResponse|usageJson|providerRequestId/,
    );
  });

  it("counts, measures, and decides nothing", () => {
    expect(code).not.toMatch(
      /\.filter\(|\.map\(|\.sort\(|\.toSorted\(|\.reduce\(|new Set\(|new Map\(|Math\.|\.length/,
    );
    expect(code).not.toMatch(
      /count|aggregat|sample|fraction|percent|numerator|denominator|confidence|\brate\b|\bratio\b|metric|complete|partial|dedupe|distinct/i,
    );
  });

  it("swallows no failure and defaults nothing", () => {
    expect(code).not.toMatch(/\btry\b|\bcatch\b|\bthrow\b|\?\?|\|\|/);
    expect(code).not.toMatch(
      /parseInt|parseFloat|Number\(|String\(|Boolean\(|Object\.assign|Object\.fromEntries|\.trim\(|\.toLowerCase\(|\.toUpperCase\(|\.normalize\(|\.replace\(/,
    );
  });
});
