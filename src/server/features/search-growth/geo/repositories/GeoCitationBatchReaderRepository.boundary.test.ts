import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source/read-only boundary for the T160 citation batch reader: one module, one
// three-selector-scoped SELECT over the accepted run/parse/citation relations,
// and no way to write, normalize a URL, classify ownership, match a publication
// receipt, select a current parser version, aggregate, or hide a storage
// failure. This is the static half of the read-only and no-added-meaning proof —
// the query spec proves the same thing dynamically by comparing every stored
// run, parse, citation, and receipt row before and after a read.
//
// Every check reads the source with its comments removed, so prose about the
// boundaries can neither satisfy a positive check nor trip a negative one; only
// executable code is inspected.

const ADAPTER_SOURCE =
  "src/server/features/search-growth/geo/repositories/GeoCitationBatchReaderRepository.ts";

/**
 * The adapter's executable code: block and line comments removed and runs of
 * whitespace collapsed, so a check spans formatting without matching the
 * documentation above the code.
 */
const code = readFileSync(ADAPTER_SOURCE, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ")
  .replace(/\s+/g, " ");

describe("citation batch reader read-only boundary", () => {
  it("performs exactly one read and no write of any kind", () => {
    expect(code.match(/\.select\(/g)).toHaveLength(1);
    expect(code.match(/\.from\(/g)).toHaveLength(1);
    expect(code).not.toMatch(
      /\.insert\(|\.update\(|\.delete\(|\.set\(|\.onConflict|\.returning\(/,
    );
  });

  it("scopes the read to all three selector columns", () => {
    // No selector is optional: Project, run batch, and parse parser version are
    // each constrained in the same WHERE.
    expect(code).toContain("eq(geoCitations.projectId, projectId)");
    expect(code).toContain("eq(geoObservationRuns.batchId, batchId)");
    expect(code).toContain(
      "eq(geoObservationParses.parserVersion, parserVersion)",
    );
    expect(code).toContain(".from(geoCitations)");
  });

  it("joins only the accepted run and parse relations through their stored same-Project keys", () => {
    expect(code.match(/\.innerJoin\(/g)).toHaveLength(2);
    // The accepted chain: citation -> same-Project versioned parse -> same-Project
    // immutable run. Nothing is joined on an inferred or raw field.
    expect(code).toContain(
      "eq(geoObservationParses.projectId, geoCitations.projectId)",
    );
    expect(code).toContain("eq(geoObservationParses.id, geoCitations.parseId)");
    expect(code).toContain(
      "eq(geoObservationRuns.projectId, geoObservationParses.projectId)",
    );
    expect(code).toContain(
      "eq(geoObservationRuns.id, geoObservationParses.runId)",
    );
    expect(code).not.toMatch(/\.leftJoin\(|\.rightJoin\(|\.fullJoin\(/);
    // No receipt, publication, entity, mention, prompt, or topic storage is
    // touched, so nothing can be matched, classified, or counted.
    expect(code).not.toMatch(
      /publicationReceipts|publishingJobs|releaseTargets|releaseBundles|contentPackages|trackedEntities|geoEntityMentions|searchPrompts|searchTopics/,
    );
  });

  it("orders by the four stored keys and selects no current parser version", () => {
    expect(code).toContain("(row) => row.runRepeatIndex");
    expect(code).toContain("(row) => row.runId");
    expect(code).toContain("(row) => row.citation.parseId");
    expect(code).toContain("(row) => row.citation.id");
    // Version explicitness: parserVersion is only ever matched by equality, so
    // no latest/current version can be preferred and no version is collapsed.
    expect(code).not.toMatch(/isCurrent|orderBy\(|desc\(|limit\(/);
  });

  it("returns the stored citation row type instead of re-declaring or reshaping it", () => {
    expect(code).toContain("typeof geoCitations.$inferSelect");
    expect(code).not.toMatch(/type GeoCitationRow\s*=\s*\{/);
  });

  it("reaches storage only through the provider-aware handle", () => {
    expect(code).toContain('from "@/db"');
    expect(code).toContain('from "@/db/schema"');
    // A dialect-specific client would bypass DATABASE_PROVIDER.
    expect(code).not.toMatch(/@\/db\/(d1|pg)|better-sqlite3|@libsql/);
  });

  it("does not read raw payload fields, normalize, match, count, or aggregate", () => {
    expect(code).not.toMatch(
      /rawAnswer|rawResponse|providerRequestId|applicationCacheBypassed/,
    );
    // No URL canonicalizer, ownership classifier, or receipt matcher.
    expect(code).not.toMatch(
      /new URL|\.normalize\(|toLowerCase|toUpperCase|\.replace\(|\.trim\(|\.split\(|citationSourceOwnershipSchema|matchedPublicationReceiptId|OWNED_DOMAIN|classif/i,
    );
    expect(code).not.toMatch(
      /\.reduce\(|\.filter\(|\.length|Math\.|JSON\.|count\(|fraction|metric/i,
    );
  });

  it("does not fetch, log, or read any credential or cache", () => {
    expect(code).not.toMatch(
      /fetch\(|process\.env|node:fs|console\.|crypto\.|randomUUID/,
    );
  });

  it("has no catch, so a database failure cannot become an empty result", () => {
    expect(code).not.toMatch(/try \{|catch \(|\.catch\(|\?\? \[\]/);
  });
});
