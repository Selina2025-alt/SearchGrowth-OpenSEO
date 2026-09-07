import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { searchMarketProfiles } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL, so the
// fixture proves the storage contract the migration ships — explicit GOOGLE,
// BAIDU and BING profiles each keep their full market identity, and nothing
// falls back to an implicit GLOBAL market.

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let db: ReturnType<typeof drizzle>;

const PROFILES_DDL = readFileSync(
  "drizzle/0045_search_market_profiles.sql",
  "utf8",
);

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.executeMultiple(
    [
      `CREATE TABLE projects (id text PRIMARY KEY);`,
      `INSERT INTO projects (id) VALUES ('proj_cn'), ('proj_us');`,
      ...PROFILES_DDL.split(DRIZZLE_STATEMENT_SEPARATOR)
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0),
    ].join("\n"),
  );
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await db.delete(searchMarketProfiles);
});

const GOOGLE_PROFILE = {
  id: "prof_google_cn",
  projectId: "proj_cn",
  name: "Google China",
  searchEngine: "GOOGLE",
  locationCode: "2840",
  locationName: "China",
  languageCode: "zh-CN",
  device: "DESKTOP",
  country: "CN",
  isPrimary: true,
  active: true,
} as const;

const BAIDU_PROFILE = {
  id: "prof_baidu_cn",
  projectId: "proj_cn",
  name: "Baidu China",
  searchEngine: "BAIDU",
  locationCode: "baidu-cn",
  locationName: "China",
  languageCode: "zh",
  device: "MOBILE",
  country: "CN",
  isPrimary: false,
  active: true,
} as const;

// A concrete second-project market: proves project scoping is tested with real
// market identity, never a GLOBAL/null placeholder.
const BING_US_PROFILE = {
  id: "prof_bing_us",
  projectId: "proj_us",
  name: "Bing United States",
  searchEngine: "BING",
  locationCode: "us",
  locationName: "United States",
  languageCode: "en-US",
  device: "DESKTOP",
  country: "US",
  isPrimary: true,
  active: true,
} as const;

describe("search_market_profiles fixture", () => {
  it("persists Google and Baidu profiles with full, distinct market identity", async () => {
    await db
      .insert(searchMarketProfiles)
      .values([GOOGLE_PROFILE, BAIDU_PROFILE]);

    const rows = await db
      .select()
      .from(searchMarketProfiles)
      .where(eq(searchMarketProfiles.projectId, "proj_cn"))
      .orderBy(searchMarketProfiles.searchEngine);

    expect(rows.map((row) => row.searchEngine)).toEqual(["BAIDU", "GOOGLE"]);
    expect(rows.map((row) => row.searchEngine)).not.toContain("GLOBAL");

    expect(rows[0]).toMatchObject(BAIDU_PROFILE);
    expect(rows[1]).toMatchObject(GOOGLE_PROFILE);
  });

  it("scopes profiles to their project — identity is never inferred globally", async () => {
    await db
      .insert(searchMarketProfiles)
      .values([GOOGLE_PROFILE, BAIDU_PROFILE, BING_US_PROFILE]);

    const projectRows = await db
      .select()
      .from(searchMarketProfiles)
      .where(eq(searchMarketProfiles.projectId, "proj_cn"));

    expect(projectRows).toHaveLength(2);
    expect(projectRows.every((row) => row.projectId === "proj_cn")).toBe(true);
    expect(
      projectRows.every(
        (row) => row.searchEngine === "GOOGLE" || row.searchEngine === "BAIDU",
      ),
    ).toBe(true);

    const otherProjectRows = await db
      .select()
      .from(searchMarketProfiles)
      .where(eq(searchMarketProfiles.projectId, "proj_us"));

    expect(otherProjectRows).toHaveLength(1);
    // The second project's profile keeps explicit engine, location, language,
    // country, device, primary and active identity — no null/global market.
    expect(otherProjectRows[0]).toMatchObject(BING_US_PROFILE);
  });

  it("rejects a profile without a concrete market identity", async () => {
    // Raw SQL insert: the corrected migration declares location_code and country
    // NOT NULL, so a profile missing the required market identity is refused at
    // the storage boundary (no implicit GLOBAL fallback).
    await expect(
      client.execute(
        `INSERT INTO search_market_profiles
           (id, project_id, name, search_engine, location_code, location_name,
            language_code, device, country)
         VALUES
           ('prof_google_no_market', 'proj_cn', 'Google No Market', 'GOOGLE',
            NULL, 'China', 'zh-CN', 'DESKTOP', NULL)`,
      ),
    ).rejects.toThrow();
  });
});
