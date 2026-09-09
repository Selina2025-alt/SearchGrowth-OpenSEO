/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole claim_allowed_market_profiles storage contract (valid same-Project persistence/multiple-allowed-markets/cross-Project rejection in both directions/dangling-parent rejection/duplicate-edge rejection/claim-market-Project delete cascades/normalized relation shape) through the shipped DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimAllowedMarketProfiles,
  claims,
  searchMarketProfiles,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// normalized Claim <-> SearchMarketProfile allowed-market relation (0058) and
// the parents it links: the claim parent (0057, with the
// claims_project_id_id_idx referential target) and the Project-scoped
// search_market_profiles parent (0045, with the
// search_market_profiles_project_id_id_idx referential target added by 0049).
// The 0046/0049 migration files are applied whole because 0049 both adds the
// market-profile referential target and creates search_prompts, which needs the
// 0046 search_topics parent. The spec creates the `projects` table directly and
// applies the DDL in order. Foreign keys are ON so the Project FK, the
// same-Project composite FKs, the duplicate-edge guard and the delete cascades
// are exercised against the shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project link persists with the full normalized relation
//     field set (id, project_id, claim_id, market_profile_id) plus the
//     append-only created_at; one claim can name MULTIPLE distinct same-Project
//     market profiles (the §9 `allowed_markets[]` relation is a row per allowed
//     market, never a JSON/text list).
//   - A link whose claim or market profile belongs to another Project is
//     rejected in EITHER direction by the composite FKs; a link whose
//     claim/market profile is missing is rejected; a duplicate
//     (claim_id, market_profile_id) edge is rejected by the unique index.
//   - Deleting a claim, a market profile, or a whole Project cascades its links
//     away, so a link can never dangle.
//   - The relation ships ONLY the normalized identity columns plus the
//     append-only created_at (no market-selection/primary-market/ranking/
//     policy-evaluation payload and no JSON/text array column).

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

const statementParts = (ddl: string) =>
  ddl
    .split(DRIZZLE_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

async function applyMigrationFiles(target: Client, files: string[]) {
  for (const file of files) {
    for (const statement of statementParts(readFileSync(file, "utf8"))) {
      await target.execute(statement);
    }
  }
}

const MIGRATION_FILES = [
  "drizzle/0045_search_market_profiles.sql",
  "drizzle/0046_search_topics.sql",
  "drizzle/0049_gigantic_johnny_blaze.sql",
  "drizzle/0056_organic_blue_blade.sql",
  "drizzle/0057_cold_marrow.sql",
  "drizzle/0058_glossy_purple_man.sql",
];

const LINK_COLUMN_INSERT = `(id, project_id, claim_id, market_profile_id)`;

let client: Client;
let db: ReturnType<typeof drizzle>;

type NewClaim = typeof claims.$inferInsert;
type NewMarketProfile = typeof searchMarketProfiles.$inferInsert;
type NewAllowedMarketLink = typeof claimAllowedMarketProfiles.$inferInsert;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete');`,
  );
  await applyMigrationFiles(client, MIGRATION_FILES);
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await db.delete(claimAllowedMarketProfiles);
  await db.delete(claims);
  await db.delete(searchMarketProfiles);
  await client.execute("DELETE FROM projects");
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete');`,
  );
});

async function insertClaim(id: string, overrides: Partial<NewClaim> = {}) {
  await db.insert(claims).values({
    id,
    projectId: "proj_alpha",
    claimText: `Claim text ${id}`,
    status: "UNVERIFIED",
    classification: "PUBLIC_MARKETING",
    ...overrides,
  });
}

async function insertMarketProfile(
  id: string,
  overrides: Partial<NewMarketProfile> = {},
) {
  await db.insert(searchMarketProfiles).values({
    id,
    projectId: "proj_alpha",
    name: `Market profile ${id}`,
    searchEngine: "GOOGLE",
    locationCode: "2840",
    locationName: "China",
    languageCode: "zh-CN",
    device: "DESKTOP",
    country: "CN",
    ...overrides,
  });
}

async function insertLink(
  id: string,
  overrides: Partial<NewAllowedMarketLink> = {},
) {
  await db.insert(claimAllowedMarketProfiles).values({
    id,
    projectId: "proj_alpha",
    claimId: "claim_alpha_1",
    marketProfileId: "market_profile_alpha_1",
    ...overrides,
  });
}

async function columnNames(tableName: string) {
  const tableInfo = await client.execute(
    `SELECT name FROM pragma_table_info('${tableName}')`,
  );
  return sort(
    tableInfo.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string"),
    (a, b) => a.localeCompare(b),
  );
}

describe("claim_allowed_market_profiles same-project relation contract", () => {
  it("persists a valid same-Project link between a claim and a market profile", async () => {
    await insertClaim("claim_alpha_1", {
      claimText: "Example.com is the fastest provider.",
      status: "APPROVED",
      classification: "PUBLIC_MARKETING",
    });
    await insertMarketProfile("market_profile_alpha_1");
    await insertLink("allowed_market_link_1");

    const links = await db
      .select()
      .from(claimAllowedMarketProfiles)
      .where(eq(claimAllowedMarketProfiles.id, "allowed_market_link_1"));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      id: "allowed_market_link_1",
      projectId: "proj_alpha",
      claimId: "claim_alpha_1",
      marketProfileId: "market_profile_alpha_1",
    });
    expect(links[0].createdAt).toBeTruthy();

    // The claim and the market profile keep their own full rows; the link
    // stores only identity (normalized relation, no duplicated market payload).
    const claimRows = await db
      .select()
      .from(claims)
      .where(eq(claims.id, "claim_alpha_1"));
    expect(claimRows).toHaveLength(1);
    expect(claimRows[0].claimText).toBe("Example.com is the fastest provider.");
    const profileRows = await db
      .select()
      .from(searchMarketProfiles)
      .where(eq(searchMarketProfiles.id, "market_profile_alpha_1"));
    expect(profileRows).toHaveLength(1);
    expect(profileRows[0].searchEngine).toBe("GOOGLE");
  });

  it("lets one claim name multiple distinct same-Project allowed markets", async () => {
    // §9 `allowed_markets[]` is a list of allowed markets: the normalized
    // relation models it as one row per allowed market, so a claim legitimately
    // links to several market profiles on the SAME project.
    await insertClaim("claim_alpha_1");
    await insertMarketProfile("market_profile_alpha_1", {
      searchEngine: "GOOGLE",
      locationName: "China",
      country: "CN",
    });
    await insertMarketProfile("market_profile_alpha_2", {
      searchEngine: "BAIDU",
      locationCode: "baidu-cn",
      locationName: "China",
      languageCode: "zh",
      device: "MOBILE",
      country: "CN",
    });
    await insertMarketProfile("market_profile_beta_1", {
      searchEngine: "BING",
      locationCode: "us",
      locationName: "United States",
      languageCode: "en-US",
      device: "DESKTOP",
      country: "US",
    });
    await insertLink("allowed_market_link_1");
    await insertLink("allowed_market_link_2", {
      id: "allowed_market_link_2",
      marketProfileId: "market_profile_alpha_2",
    });
    await insertLink("allowed_market_link_3", {
      id: "allowed_market_link_3",
      marketProfileId: "market_profile_beta_1",
    });

    const links = await db
      .select()
      .from(claimAllowedMarketProfiles)
      .where(eq(claimAllowedMarketProfiles.claimId, "claim_alpha_1"));
    expect(links).toHaveLength(3);
    expect(
      sort(
        links.map((link) => link.marketProfileId),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual([
      "market_profile_alpha_1",
      "market_profile_alpha_2",
      "market_profile_beta_1",
    ]);
  });

  it("rejects a link whose market profile belongs to another Project", async () => {
    // claim_alpha and the link live on proj_alpha; market_profile_beta lives on
    // proj_beta, so the composite FK (project_id, market_profile_id) ->
    // search_market_profiles(project_id, id) has no matching parent row.
    await insertClaim("claim_alpha_1");
    await insertMarketProfile("market_profile_beta", {
      projectId: "proj_beta",
    });

    await expect(
      client.execute(
        `INSERT INTO claim_allowed_market_profiles ${LINK_COLUMN_INSERT}
         VALUES ('link_cross_market', 'proj_alpha', 'claim_alpha_1',
                 'market_profile_beta')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose claim belongs to another Project", async () => {
    // claim_beta lives on proj_beta; the link and market_profile_alpha live on
    // proj_alpha, so the composite FK (project_id, claim_id) ->
    // claims(project_id, id) has no matching parent row.
    await insertClaim("claim_beta", { projectId: "proj_beta" });
    await insertMarketProfile("market_profile_alpha_1");

    await expect(
      client.execute(
        `INSERT INTO claim_allowed_market_profiles ${LINK_COLUMN_INSERT}
         VALUES ('link_cross_claim', 'proj_alpha', 'claim_beta',
                 'market_profile_alpha_1')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose claim or market profile does not exist (dangling parent)", async () => {
    await insertClaim("claim_alpha_1");
    await insertMarketProfile("market_profile_alpha_1");

    // Missing market profile.
    await expect(
      client.execute(
        `INSERT INTO claim_allowed_market_profiles ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_market', 'proj_alpha', 'claim_alpha_1',
                 'market_profile_missing')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // Missing claim.
    await expect(
      client.execute(
        `INSERT INTO claim_allowed_market_profiles ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_claim', 'proj_alpha', 'claim_missing',
                 'market_profile_alpha_1')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a duplicate (claim_id, market_profile_id) edge", async () => {
    await insertClaim("claim_alpha_1");
    await insertMarketProfile("market_profile_alpha_1");
    await insertLink("link_alpha_1");

    // A second link for the same claim/market_profile edge is rejected by the
    // link identity unique index, not by application code.
    await expect(
      client.execute(
        `INSERT INTO claim_allowed_market_profiles ${LINK_COLUMN_INSERT}
         VALUES ('link_duplicate', 'proj_alpha', 'claim_alpha_1',
                 'market_profile_alpha_1')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("cascades links away when their claim is deleted", async () => {
    await insertClaim("claim_alpha_1");
    await insertMarketProfile("market_profile_alpha_1");
    await insertLink("link_alpha_1");

    await client.execute("DELETE FROM claims WHERE id = 'claim_alpha_1'");

    const remaining = await db
      .select()
      .from(claimAllowedMarketProfiles)
      .where(eq(claimAllowedMarketProfiles.id, "link_alpha_1"));
    expect(remaining).toHaveLength(0);
  });

  it("cascades links away when their market profile is deleted", async () => {
    await insertClaim("claim_alpha_1");
    await insertMarketProfile("market_profile_alpha_1");
    await insertLink("link_alpha_1");

    await client.execute(
      "DELETE FROM search_market_profiles WHERE id = 'market_profile_alpha_1'",
    );

    const remaining = await db
      .select()
      .from(claimAllowedMarketProfiles)
      .where(eq(claimAllowedMarketProfiles.id, "link_alpha_1"));
    expect(remaining).toHaveLength(0);
  });

  it("cascades claims, market profiles and links away when their whole Project is deleted", async () => {
    await insertClaim("claim_delete", { projectId: "proj_delete" });
    await insertMarketProfile("market_profile_delete", {
      projectId: "proj_delete",
    });
    await insertLink("link_delete", {
      projectId: "proj_delete",
      claimId: "claim_delete",
      marketProfileId: "market_profile_delete",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const links = await db
      .select()
      .from(claimAllowedMarketProfiles)
      .where(eq(claimAllowedMarketProfiles.projectId, "proj_delete"));
    expect(links).toHaveLength(0);
    const claimRows = await db
      .select()
      .from(claims)
      .where(eq(claims.projectId, "proj_delete"));
    expect(claimRows).toHaveLength(0);
    const profileRows = await db
      .select()
      .from(searchMarketProfiles)
      .where(eq(searchMarketProfiles.projectId, "proj_delete"));
    expect(profileRows).toHaveLength(0);
  });

  it("ships ONLY the normalized relation identity columns", async () => {
    // The relation row is identity plus the append-only created_at only: no
    // market-selection/primary-market/ranking/policy payload, no updated_at and
    // no JSON/text array column for allowed markets.
    expect(await columnNames("claim_allowed_market_profiles")).toEqual([
      "claim_id",
      "created_at",
      "id",
      "market_profile_id",
      "project_id",
    ]);
  });
});
