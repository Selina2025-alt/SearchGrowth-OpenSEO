import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source/read-only boundary for the T145 candidate reader: the port is a
// contract with no storage or matching behaviour, and the adapter is exactly
// two SELECTs over the accepted entity/alias tables. This is the static half of
// the read-only proof — the query spec proves the same thing dynamically by
// comparing every entity and alias row before and after a read.

const PORT_SOURCE =
  "src/server/features/search-growth/geo/services/geoExactEntityMentionCandidateReader.ts";
const ADAPTER_SOURCE =
  "src/server/features/search-growth/geo/repositories/GeoExactEntityMentionCandidateReaderRepository.ts";

const readSource = (path: string) => readFileSync(path, "utf8");

describe("candidate reader port boundary", () => {
  it("declares the contract without touching storage or the matcher", () => {
    const source = readSource(PORT_SOURCE);

    // A port: one method, and the T144 candidate type as its only payload.
    expect(source).toContain("listCandidates(");
    expect(source).toContain("GeoExactEntityMentionCandidate");
    // No dialect/schema/query access and no matching: the port cannot bypass
    // the adapter to read or interpret anything itself.
    expect(source).not.toMatch(
      /@\/db|drizzle|select\(|insert\(|matchExactEntityMentions|fetch\(|process\.env|node:fs/,
    );
  });
});

describe("candidate reader adapter read-only boundary", () => {
  it("performs exactly two reads and no write of any kind", () => {
    const source = readSource(ADAPTER_SOURCE);

    expect(source.match(/\.select\(/g)).toHaveLength(2);
    expect(source).not.toMatch(
      /\.insert\(|\.update\(|\.delete\(|\.set\(|\.onConflict|\.returning\(/,
    );
  });

  it("reaches only the accepted entity/alias tables through the provider-aware handle", () => {
    const source = readSource(ADAPTER_SOURCE);

    expect(source).toContain('from "@/db"');
    expect(source).toContain('from "@/db/schema"');
    expect(source).toContain("trackedEntities");
    expect(source).toContain("entityAliases");
    // No dialect-specific client (that would bypass DATABASE_PROVIDER) and no
    // GEO run/parse/citation/mention or prompt table is named at all.
    expect(source).not.toMatch(
      /@\/db\/d1|@\/db\/pg|geoObservation|geoEntityMentions|geoCitations|searchPrompts|searchTopics/,
    );
  });

  it("reuses the accepted T144 candidate contract instead of re-declaring it", () => {
    const source = readSource(ADAPTER_SOURCE);

    expect(source).toContain(
      'import type { GeoExactEntityMentionCandidate } from "../services/geoExactEntityMentionMatcher"',
    );
    expect(source).not.toMatch(/type GeoExactEntityMentionCandidate\s*=/);
    expect(source).not.toMatch(/type GeoExactEntityMentionSource\s*=/);
  });

  it("does not match, record, fetch, or read any credential", () => {
    const source = readSource(ADAPTER_SOURCE);

    expect(source).not.toMatch(
      /matchExactEntityMentions|Recorder|fetch\(|process\.env|node:fs|JSON\.stringify|console\./,
    );
    // `priority` is an alias precedence hint the reader must not consult: it is
    // never selected, so it cannot influence eligibility or order.
    expect(source).not.toMatch(/\.priority/);
  });
});
