import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source/read-only boundary for the T154 batch reader: one module, one
// Project-and-batch-scoped SELECT, and no way to write, parse, aggregate, fetch,
// or hide a storage failure. This is the static half of the read-only and
// no-added-meaning proof — the query spec proves the same thing dynamically by
// comparing every stored run row before and after a read.

const ADAPTER_SOURCE =
  "src/server/features/search-growth/geo/repositories/GeoObservationBatchReaderRepository.ts";

const source = readFileSync(ADAPTER_SOURCE, "utf8");
/** The source with runs of whitespace collapsed, so a check spans formatting. */
const code = source.replace(/\s+/g, " ");

describe("observation batch reader read-only boundary", () => {
  it("performs exactly one read and no write of any kind", () => {
    expect(source.match(/\.select\(/g)).toHaveLength(1);
    expect(source).not.toMatch(
      /\.insert\(|\.update\(|\.delete\(|\.set\(|\.onConflict|\.returning\(/,
    );
  });

  it("scopes the read to both selector columns", () => {
    // A batch-only lookup is forbidden: the Project predicate is not optional.
    expect(code).toContain("eq(geoObservationRuns.projectId, projectId)");
    expect(code).toContain("eq(geoObservationRuns.batchId, batchId)");
    // One table is read, and it is the accepted runs table.
    expect(code).toContain(".from(geoObservationRuns)");
    expect(source.match(/\.from\(/g)).toHaveLength(1);
  });

  it("orders by the two stored keys and no derived value", () => {
    expect(code).toContain("(row) => row.repeatIndex");
    expect(code).toContain("(row) => row.id");
  });

  it("returns the stored row type instead of re-declaring or reshaping it", () => {
    expect(source).toContain(
      'import type { GeoObservationRun } from "@/types/schemas/geo-observation-run"',
    );
    expect(source).not.toMatch(/type GeoObservationRun\s*=/);
  });

  it("reaches storage only through the provider-aware handle", () => {
    expect(source).toContain('from "@/db"');
    expect(source).toContain('from "@/db/schema"');
    // A dialect-specific client would bypass DATABASE_PROVIDER.
    expect(source).not.toMatch(/@\/db\/(d1|pg)|better-sqlite3|@libsql/);
  });

  it("does not parse, serialize, aggregate, or classify the stored evidence", () => {
    expect(source).not.toMatch(
      /JSON\.(parse|stringify)|reduce\(|Math\.|\.length/,
    );
    // No provider, credential, cache, scheduler, filesystem, or logging access.
    expect(source).not.toMatch(
      /fetch\(|process\.env|node:fs|console\.|crypto\.|randomUUID/,
    );
  });

  it("has no catch, so a database failure cannot become an empty batch", () => {
    expect(source).not.toMatch(/try\s*\{|catch\s*\(|\.catch\(|\?\?\s*\[\]/);
  });
});
