import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source/read-only boundary for the T159 entity-mention batch reader: one
// module, one four-selector-scoped SELECT over the accepted run/parse/mention
// relations, and no way to write, parse, fetch, aggregate, select a current
// parser version, or hide a storage failure. This is the static half of the
// read-only and no-added-meaning proof — the query spec proves the same thing
// dynamically by comparing every stored run, parse, mention, and entity row
// before and after a read.

const ADAPTER_SOURCE =
  "src/server/features/search-growth/geo/repositories/GeoEntityMentionBatchReaderRepository.ts";

const source = readFileSync(ADAPTER_SOURCE, "utf8");
/** The source with runs of whitespace collapsed, so a check spans formatting. */
const code = source.replace(/\s+/g, " ");

describe("entity mention batch reader read-only boundary", () => {
  it("performs exactly one read and no write of any kind", () => {
    expect(source.match(/\.select\(/g)).toHaveLength(1);
    expect(source.match(/\.from\(/g)).toHaveLength(1);
    expect(source).not.toMatch(
      /\.insert\(|\.update\(|\.delete\(|\.set\(|\.onConflict|\.returning\(/,
    );
  });

  it("scopes the read to all four selector columns", () => {
    // No selector is optional: Project, run batch, mention entity, and parse
    // parser version are each constrained in the same WHERE.
    expect(code).toContain("eq(geoEntityMentions.projectId, projectId)");
    expect(code).toContain("eq(geoObservationRuns.batchId, batchId)");
    expect(code).toContain("eq(geoEntityMentions.entityId, entityId)");
    expect(code).toContain(
      "eq(geoObservationParses.parserVersion, parserVersion)",
    );
    expect(code).toContain(".from(geoEntityMentions)");
  });

  it("joins only the accepted run and parse relations through their stored same-Project keys", () => {
    expect(source.match(/\.innerJoin\(/g)).toHaveLength(2);
    // The accepted chain: mention -> same-Project versioned parse -> same-Project
    // immutable run. Nothing is joined on an inferred or raw field.
    expect(code).toContain(
      "eq(geoObservationParses.projectId, geoEntityMentions.projectId)",
    );
    expect(code).toContain(
      "eq(geoObservationParses.id, geoEntityMentions.parseId)",
    );
    expect(code).toContain(
      "eq(geoObservationRuns.projectId, geoObservationParses.projectId)",
    );
    expect(code).toContain(
      "eq(geoObservationRuns.id, geoObservationParses.runId)",
    );
    expect(source).not.toMatch(/\.leftJoin\(|\.rightJoin\(|\.fullJoin\(/);
    // No entity, alias, citation, cohort, prompt, or topic storage is touched.
    expect(source).not.toMatch(
      /trackedEntities|entityAliases|geoCitations|searchPrompts|searchTopics/,
    );
  });

  it("orders by the four stored keys and selects no current parser version", () => {
    expect(code).toContain("(row) => row.runRepeatIndex");
    expect(code).toContain("(row) => row.runId");
    expect(code).toContain("(row) => row.mention.parseId");
    expect(code).toContain("(row) => row.mention.id");
    // Version explicitness: parserVersion is only ever matched by equality, so
    // no latest/current version can be preferred and no version is collapsed.
    expect(source).not.toMatch(/isCurrent|orderBy\(|desc\(|limit\(/);
  });

  it("returns the stored mention row type instead of re-declaring or reshaping it", () => {
    expect(source).toContain("typeof geoEntityMentions.$inferSelect");
    expect(source).not.toMatch(/type GeoEntityMentionRow\s*=\s*\{/);
  });

  it("reaches storage only through the provider-aware handle", () => {
    expect(source).toContain('from "@/db"');
    expect(source).toContain('from "@/db/schema"');
    // A dialect-specific client would bypass DATABASE_PROVIDER.
    expect(source).not.toMatch(/@\/db\/(d1|pg)|better-sqlite3|@libsql/);
  });

  it("does not read raw payload fields, match, count, or aggregate", () => {
    expect(source).not.toMatch(
      /rawAnswer|rawResponse|providerRequestId|applicationCacheBypassed/,
    );
    expect(source).not.toMatch(/\.reduce\(|\.filter\(|Math\.|JSON\.|count\(/);
  });

  it("does not fetch, log, or read any credential or cache", () => {
    expect(source).not.toMatch(
      /fetch\(|process\.env|node:fs|console\.|crypto\.|randomUUID/,
    );
  });

  it("has no catch, so a database failure cannot become an empty result", () => {
    expect(source).not.toMatch(/try\s*\{|catch\s*\(|\.catch\(|\?\?\s*\[\]/);
  });
});
