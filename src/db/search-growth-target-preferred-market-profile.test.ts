/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole search_growth_target_preferred_market_profiles storage contract (valid same-Project persistence/multiple preferred markets/cross-Project rejection/dangling target+market rejection/duplicate rejection/target-market-Project delete cascades/normalized relation shape and the target+market+Project FK set from the shipped 0077 DDL); splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  searchGrowthTargetPreferredMarketProfiles,
  searchGrowthTargets,
  searchMarketProfiles,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// normalized SearchGrowthTarget <-> SearchMarketProfile preferred-market
// relation (0077) and the parents it binds: the Project-scoped
// search_market_profiles (0045, with the search_market_profiles_project_id_id_idx
// referential target added by 0049) and the Project-scoped search_growth_targets
// configuration core (0076, whose primary key IS project_id). The 0046/0049
// migration files are applied whole because 0049 adds the market-profile
// referential target and creates search_prompts, which needs the 0046
// search_topics parent. The spec creates the `projects` table directly and
// applies the DDL in order. Foreign keys are ON so the Project FK, the target-PK
// FK, the same-Project composite FK, the duplicate guard and the delete cascades
// are exercised against the shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project reference persists with the full normalized relation
//     field set (id, project_id, market_profile_id) plus the append-only
//     created_at; one target can prefer MULTIPLE distinct same-Project market
//     profiles (a row per market, never a JSON/text list).
//   - A reference whose market profile belongs to another Project is rejected by
//     the composite FK; a reference whose target row or market profile is
//     missing is rejected; a duplicate (project_id, market_profile_id)
//     target/market reference is rejected by the unique index.
//   - Deleting the target row, a market profile, or a whole Project cascades its
//     references away, so a reference can never dangle.
//   - The relation ships ONLY the normalized relation identity columns (no
//     ordering/priority/primary-market payload and no JSON/text array column)
//     and exactly the three cascade FKs (projects, target PK, market composite).

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
  "drizzle/0076_search_growth_targets.sql",
  "drizzle/0077_search_growth_target_preferred_market_profiles.sql",
];

const LINK_COLUMN_INSERT = `(id, project_id, market_profile_id)`;

const VALID_CONFIG =
  '{"brandAliases":["JovaAI"],"productTargets":[],"icps":[],"personas":[],"conversionGoals":[]}';

// Dedicated Project per test: search_growth_targets is one row per Project, so
// tests never share a Project id and never depend on each other's order.
const PROJECTS = [
  "proj_persist",
  "proj_multi",
  "proj_cross",
  "proj_no_target",
  "proj_missing_market",
  "proj_duplicate",
  "proj_target_delete",
  "proj_market_delete",
  "proj_delete",
  "proj_beta",
];

let client: Client;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
  await client.execute(
    `INSERT INTO projects (id) VALUES ${PROJECTS.map((id) => `('${id}')`).join(", ")};`,
  );
  await applyMigrationFiles(client, MIGRATION_FILES);
});

afterAll(() => {
  client.close();
});

async function insertTarget(projectId: string) {
  await db.insert(searchGrowthTargets).values({
    projectId,
    configJson: VALID_CONFIG,
    updatedBy: "operator_1",
  });
}

async function insertMarketProfile(
  id: string,
  projectId: string,
  overrides: Partial<typeof searchMarketProfiles.$inferInsert> = {},
) {
  await db.insert(searchMarketProfiles).values({
    id,
    projectId,
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

async function insertReference(
  id: string,
  projectId: string,
  marketProfileId: string,
) {
  await db.insert(searchGrowthTargetPreferredMarketProfiles).values({
    id,
    projectId,
    marketProfileId,
  });
}

async function referencesFor(projectId: string) {
  return db
    .select()
    .from(searchGrowthTargetPreferredMarketProfiles)
    .where(eq(searchGrowthTargetPreferredMarketProfiles.projectId, projectId));
}

// `pragma_foreign_key_list` returns one row per FK column; narrow the cells this
// spec asserts on to strings (the PRAGMA reports these columns as text).
function foreignKeyRow(row: Record<string, unknown>) {
  const { table, from, to, on_delete: onDelete } = row;
  if (
    typeof table !== "string" ||
    typeof from !== "string" ||
    typeof to !== "string" ||
    typeof onDelete !== "string"
  ) {
    throw new Error("Unexpected pragma_foreign_key_list row shape");
  }
  return { table, from, to, onDelete: onDelete.toUpperCase() };
}

describe("search_growth_target_preferred_market_profiles relation contract", () => {
  it("persists a valid same-Project preferred-market reference with the full field set", async () => {
    await insertTarget("proj_persist");
    await insertMarketProfile("market_profile_persist", "proj_persist");
    await insertReference(
      "preferred_persist",
      "proj_persist",
      "market_profile_persist",
    );

    const rows = await referencesFor("proj_persist");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "preferred_persist",
      projectId: "proj_persist",
      marketProfileId: "market_profile_persist",
    });
    expect(rows[0].createdAt).toBeTruthy();

    // The referenced market profile keeps its own full row; the relation stores
    // only identity (no duplicated market payload).
    const profiles = await db
      .select()
      .from(searchMarketProfiles)
      .where(eq(searchMarketProfiles.id, "market_profile_persist"));
    expect(profiles[0]?.searchEngine).toBe("GOOGLE");
  });

  it("lets one target prefer multiple distinct same-Project market profiles", async () => {
    await insertTarget("proj_multi");
    await insertMarketProfile("market_profile_multi_1", "proj_multi", {
      searchEngine: "GOOGLE",
    });
    await insertMarketProfile("market_profile_multi_2", "proj_multi", {
      searchEngine: "BAIDU",
      locationCode: "baidu-cn",
      languageCode: "zh",
      device: "MOBILE",
    });
    await insertReference(
      "preferred_multi_1",
      "proj_multi",
      "market_profile_multi_1",
    );
    await insertReference(
      "preferred_multi_2",
      "proj_multi",
      "market_profile_multi_2",
    );

    const rows = await referencesFor("proj_multi");
    expect(
      sort(
        rows.map((row) => row.marketProfileId),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(["market_profile_multi_1", "market_profile_multi_2"]);
  });

  it("rejects a reference whose market profile belongs to another Project", async () => {
    // The reference and its target live on proj_cross; the market profile lives
    // on proj_beta, so the composite FK (project_id, market_profile_id) ->
    // search_market_profiles(project_id, id) has no matching parent row.
    await insertTarget("proj_cross");
    await insertMarketProfile("market_profile_cross_beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO search_growth_target_preferred_market_profiles ${LINK_COLUMN_INSERT}
         VALUES ('preferred_cross', 'proj_cross', 'market_profile_cross_beta')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a reference whose target row or market profile is missing", async () => {
    // proj_no_target has a market profile but NO search_growth_targets row, so
    // the target-PK FK rejects the reference.
    await insertMarketProfile("market_profile_no_target", "proj_no_target");
    await expect(
      client.execute(
        `INSERT INTO search_growth_target_preferred_market_profiles ${LINK_COLUMN_INSERT}
         VALUES ('preferred_no_target', 'proj_no_target', 'market_profile_no_target')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // A missing market profile is rejected by the composite FK.
    await insertTarget("proj_missing_market");
    await expect(
      client.execute(
        `INSERT INTO search_growth_target_preferred_market_profiles ${LINK_COLUMN_INSERT}
         VALUES ('preferred_missing_market', 'proj_missing_market', 'market_profile_missing')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a duplicate (project_id, market_profile_id) target/market reference", async () => {
    await insertTarget("proj_duplicate");
    await insertMarketProfile("market_profile_duplicate", "proj_duplicate");
    await insertReference(
      "preferred_duplicate_1",
      "proj_duplicate",
      "market_profile_duplicate",
    );

    // A second reference for the same target/market pair is rejected by the
    // natural-pair unique index, not by application code.
    await expect(
      client.execute(
        `INSERT INTO search_growth_target_preferred_market_profiles ${LINK_COLUMN_INSERT}
         VALUES ('preferred_duplicate_2', 'proj_duplicate', 'market_profile_duplicate')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("cascades references away when their target row is deleted", async () => {
    await insertTarget("proj_target_delete");
    await insertMarketProfile(
      "market_profile_target_delete",
      "proj_target_delete",
    );
    await insertReference(
      "preferred_target_delete",
      "proj_target_delete",
      "market_profile_target_delete",
    );

    await client.execute(
      "DELETE FROM search_growth_targets WHERE project_id = 'proj_target_delete'",
    );

    expect(await referencesFor("proj_target_delete")).toHaveLength(0);
    // The market profile is untouched by the target deletion.
    const profiles = await db
      .select()
      .from(searchMarketProfiles)
      .where(eq(searchMarketProfiles.id, "market_profile_target_delete"));
    expect(profiles).toHaveLength(1);
  });

  it("cascades references away when their market profile is deleted", async () => {
    await insertTarget("proj_market_delete");
    await insertMarketProfile("market_profile_delete", "proj_market_delete");
    await insertReference(
      "preferred_market_delete",
      "proj_market_delete",
      "market_profile_delete",
    );

    await client.execute(
      "DELETE FROM search_market_profiles WHERE id = 'market_profile_delete'",
    );

    expect(await referencesFor("proj_market_delete")).toHaveLength(0);
  });

  it("cascades target, market profile and references away when their whole Project is deleted", async () => {
    await insertTarget("proj_delete");
    await insertMarketProfile("market_profile_project_delete", "proj_delete");
    await insertReference(
      "preferred_project_delete",
      "proj_delete",
      "market_profile_project_delete",
    );

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    expect(await referencesFor("proj_delete")).toHaveLength(0);
    expect(
      await db
        .select()
        .from(searchGrowthTargets)
        .where(eq(searchGrowthTargets.projectId, "proj_delete")),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(searchMarketProfiles)
        .where(eq(searchMarketProfiles.projectId, "proj_delete")),
    ).toHaveLength(0);
  });

  it("ships ONLY the normalized relation identity columns", async () => {
    // Identity plus the append-only created_at only: no ordering/priority/
    // primary-market flag, no updated_at and no JSON/text array column.
    const tableInfo = await client.execute(
      "SELECT name FROM pragma_table_info('search_growth_target_preferred_market_profiles')",
    );
    expect(
      sort(
        tableInfo.rows
          .map((row) => row.name)
          .filter((name): name is string => typeof name === "string"),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(["created_at", "id", "market_profile_id", "project_id"]);
  });

  it("carries exactly the Project, target-PK and same-Project market cascade FKs", async () => {
    const fks = await client.execute(
      "SELECT * FROM pragma_foreign_key_list('search_growth_target_preferred_market_profiles')",
    );
    const sorted = sort(fks.rows.map(foreignKeyRow), (a, b) =>
      `${a.table}|${a.from}`.localeCompare(`${b.table}|${b.from}`),
    );
    expect(sorted).toEqual([
      {
        table: "projects",
        from: "project_id",
        to: "id",
        onDelete: "CASCADE",
      },
      {
        table: "search_growth_targets",
        from: "project_id",
        to: "project_id",
        onDelete: "CASCADE",
      },
      {
        table: "search_market_profiles",
        from: "market_profile_id",
        to: "id",
        onDelete: "CASCADE",
      },
      {
        table: "search_market_profiles",
        from: "project_id",
        to: "project_id",
        onDelete: "CASCADE",
      },
    ]);
  });
});
