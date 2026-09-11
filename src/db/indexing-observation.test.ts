/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole indexing_observations storage contract (valid persistence with the full field set and NULL optional profile/Project ownership/same-Project MarketProfile enforcement/SearchEngine enum rejection/required columns/details JSON validation/cascade deletes/exact column, index and FK shape from the shipped 0073 DDL); splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { indexingObservations } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped IndexingObservation table (D1 0073), which creates
// `indexing_observations` with its Project FK, the optional same-Project
// MarketProfile composite FK, the SearchEngine CHECK and the details-JSON CHECK.
// The spec creates the minimal `projects` and `search_market_profiles` parent
// tables (with the (project_id, id) unique target the composite FK requires)
// and applies the DDL in order. Foreign keys are ON so Project ownership and the
// same-Project profile relation are exercised against the shipped DDL — not an
// application convention.
//
// Invariants under test:
//   - A valid same-Project observation persists with the full TASK field set
//     (stable id, project_id, opaque url, search_engine, optional
//     market_profile_id, observation_type, status, details_json, observed_at)
//     plus the append-only created_at; the optional profile defaults NULL.
//   - Every source-defined SearchEngine value persists; any other value is
//     rejected by the named CHECK.
//   - details_json is validated at the DB boundary: malformed JSON is rejected
//     and a valid document is stored verbatim. observation_type/status are
//     opaque (no invented enum), so arbitrary labels persist.
//   - Ownership: a dangling project_id is rejected by the FK, and a
//     market_profile_id belonging to another Project is rejected by the
//     composite FK.
//   - Deleting the owning Project or the scoped market profile cascades the
//     observation away (no dangling rows).
//   - The table ships ONLY the direct field set: no updated_at, no
//     publication_receipt_id, no normalized URL/dedup rule, and no business
//     unique index (URL dedup is later work).

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

const statementParts = (ddl: string) =>
  ddl
    .split(DRIZZLE_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

async function applyMigrationFile(target: Client, file: string) {
  for (const statement of statementParts(readFileSync(file, "utf8"))) {
    await target.execute(statement);
  }
}

const MIGRATION_FILE = "drizzle/0073_indexing_observations.sql";

const OBSERVATION_COLUMNS = `(id, project_id, url, search_engine,
  market_profile_id, observation_type, status, details_json, observed_at)`;

let client: Client;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete');`,
  );
  // Minimal stand-in for the accepted search_market_profiles table: only the
  // columns the composite FK needs, with the (project_id, id) unique target it
  // requires. This spec exercises indexing_observations, not that table.
  await client.execute(
    `CREATE TABLE search_market_profiles (
       id text PRIMARY KEY,
       project_id text NOT NULL,
       UNIQUE (project_id, id)
     );`,
  );
  await client.execute(
    `INSERT INTO search_market_profiles (id, project_id)
     VALUES ('profile_alpha', 'proj_alpha'), ('profile_beta', 'proj_beta'),
            ('profile_delete', 'proj_delete');`,
  );
  await applyMigrationFile(client, MIGRATION_FILE);
});

afterAll(() => {
  client.close();
});

// No per-test teardown: rows are keyed by unique observation ids and cascade
// tests use their own Project/profile, so tests never depend on order.

type ObservationSeed = {
  id: string;
  projectId?: string;
  url?: string;
  searchEngine?: string;
  marketProfileId?: string | null;
  observationType?: string;
  status?: string;
  detailsJson?: string;
  observedAt?: string;
};

async function insertObservation({
  id,
  projectId = "proj_alpha",
  url = "https://example.com/blog/post",
  searchEngine = "GOOGLE",
  marketProfileId = null,
  observationType = "URL_INSPECTION",
  status = "INDEXED",
  detailsJson = `{"note":"${id}"}`,
  observedAt = "2026-09-10T05:00:00.000Z",
}: ObservationSeed) {
  await client.execute(
    `INSERT INTO indexing_observations ${OBSERVATION_COLUMNS}
     VALUES ('${id}', '${projectId}', '${url}', '${searchEngine}',
             ${marketProfileId === null ? "NULL" : `'${marketProfileId}'`},
             '${observationType}', '${status}', '${detailsJson}',
             '${observedAt}')`,
  );
}

async function rowsFor(id: string) {
  return db
    .select()
    .from(indexingObservations)
    .where(eq(indexingObservations.id, id));
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

describe("indexing_observations storage contract", () => {
  it("persists a valid same-Project observation with the full field set and NULL optional profile", async () => {
    await insertObservation({ id: "obs_alpha_1" });

    const rows = await rowsFor("obs_alpha_1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "obs_alpha_1",
      projectId: "proj_alpha",
      url: "https://example.com/blog/post",
      searchEngine: "GOOGLE",
      observationType: "URL_INSPECTION",
      status: "INDEXED",
      detailsJson: '{"note":"obs_alpha_1"}',
      observedAt: "2026-09-10T05:00:00.000Z",
    });
    expect(rows[0]?.marketProfileId).toBeNull();
    expect(rows[0]?.createdAt).toBeTruthy();
  });

  it("persists every source-defined search engine and rejects others", async () => {
    const engines = ["GOOGLE", "BAIDU", "BING", "OTHER"] as const;
    for (const [index, engine] of engines.entries()) {
      const id = `obs_engine_${index}`;
      await insertObservation({ id, searchEngine: engine });
      expect((await rowsFor(id))[0]?.searchEngine).toBe(engine);
    }

    for (const [index, engine] of ["YANDEX", "google", ""].entries()) {
      await expect(
        insertObservation({
          id: `obs_bad_engine_${index}`,
          searchEngine: engine,
        }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("stores a same-Project market profile and keeps observation_type/status opaque", async () => {
    await insertObservation({
      id: "obs_with_profile",
      marketProfileId: "profile_alpha",
      observationType: "SITEMAP_ENTRY",
      status: "NOT_INDEXED",
    });

    const rows = await rowsFor("obs_with_profile");
    expect(rows[0]?.marketProfileId).toBe("profile_alpha");
    // No authoritative enum exists for these two fields, so arbitrary labels
    // persist unchanged (TASK item 3).
    expect(rows[0]?.observationType).toBe("SITEMAP_ENTRY");
    expect(rows[0]?.status).toBe("NOT_INDEXED");
  });

  it("rejects an observation whose Project or MarketProfile belongs to another Project", async () => {
    await expect(
      insertObservation({
        id: "obs_dangling_project",
        projectId: "proj_missing",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // profile_beta lives on proj_beta, so proj_alpha cannot scope to it.
    await expect(
      insertObservation({
        id: "obs_cross_project_profile",
        projectId: "proj_alpha",
        marketProfileId: "profile_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    const insertWith = (values: string) =>
      client.execute(
        `INSERT INTO indexing_observations (id, project_id, url, search_engine,
           market_profile_id, observation_type, status, details_json, observed_at)
         VALUES (${values})`,
      );

    await expect(
      insertWith(
        `'o1', 'proj_alpha', NULL, 'GOOGLE', NULL, 'T', 'S', '{}', 'now'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
    await expect(
      insertWith(
        `'o2', 'proj_alpha', 'https://e.com', NULL, NULL, 'T', 'S', '{}', 'now'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
    await expect(
      insertWith(
        `'o3', 'proj_alpha', 'https://e.com', 'GOOGLE', NULL, NULL, 'S', '{}', 'now'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
    await expect(
      insertWith(
        `'o4', 'proj_alpha', 'https://e.com', 'GOOGLE', NULL, 'T', NULL, '{}', 'now'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
    await expect(
      insertWith(
        `'o5', 'proj_alpha', 'https://e.com', 'GOOGLE', NULL, 'T', 'S', NULL, 'now'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
    await expect(
      insertWith(
        `'o6', 'proj_alpha', 'https://e.com', 'GOOGLE', NULL, 'T', 'S', '{}', NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("validates details JSON at the storage boundary and stores a valid document verbatim", async () => {
    await expect(
      insertObservation({ id: "obs_bad_details", detailsJson: "{not json" }),
    ).rejects.toThrow(/CHECK constraint failed/i);

    const details =
      '{"coverageState":"Submitted and indexed","sitemaps":["/sitemap.xml"]}';
    await insertObservation({ id: "obs_good_details", detailsJson: details });
    expect((await rowsFor("obs_good_details"))[0]?.detailsJson).toBe(details);
  });

  it("cascades observations away when the owning Project or scoped profile is deleted", async () => {
    await insertObservation({
      id: "obs_project_delete",
      projectId: "proj_delete",
    });
    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");
    expect(await rowsFor("obs_project_delete")).toHaveLength(0);

    await insertObservation({
      id: "obs_profile_delete",
      projectId: "proj_beta",
      marketProfileId: "profile_beta",
    });
    await client.execute(
      "DELETE FROM search_market_profiles WHERE id = 'profile_beta'",
    );
    expect(await rowsFor("obs_profile_delete")).toHaveLength(0);
  });

  it("ships ONLY the direct field set: no updated_at / publication receipt / normalized URL", async () => {
    expect(await columnNames("indexing_observations")).toEqual([
      "created_at",
      "details_json",
      "id",
      "market_profile_id",
      "observation_type",
      "observed_at",
      "project_id",
      "search_engine",
      "status",
      "url",
    ]);
  });

  it("has exactly two foreign keys (Project + optional same-Project MarketProfile)", async () => {
    const fks = await client.execute(
      "SELECT * FROM pragma_foreign_key_list('indexing_observations')",
    );
    const targets = sort(
      [
        ...new Set(
          fks.rows
            .map((row) => row.table)
            .filter((table): table is string => typeof table === "string"),
        ),
      ],
      (a, b) => a.localeCompare(b),
    );
    expect(targets).toEqual(["projects", "search_market_profiles"]);
  });

  it("adds no business unique index (no URL dedup rule)", async () => {
    // origin 'c' = explicitly created; the text PRIMARY KEY's implicit
    // sqlite_autoindex (origin 'pk') is not a business rule.
    const indexes = await client.execute(
      "SELECT name, \"unique\" FROM pragma_index_list('indexing_observations') WHERE origin = 'c'",
    );
    expect(indexes.rows).toHaveLength(2);
    for (const row of indexes.rows) {
      expect(Number(row.unique)).toBe(0);
    }
  });
});
