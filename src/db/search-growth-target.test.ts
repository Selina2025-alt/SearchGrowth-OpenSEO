/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole search_growth_targets storage contract (valid persistence with defaulted updated_at, one-row-per-Project identity, Project ownership and deletion, malformed-JSON rejection, required columns, intentional mutability/provenance update, exact column set and FK/index shape from the shipped 0076 DDL); splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchGrowthTargets } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped SearchGrowthTarget configuration table (D1 0076), which creates
// `search_growth_targets` with `project_id` as the primary key and FK to
// projects(id), the config-JSON validity CHECK and the mutable updated_at
// default. The spec creates the minimal parent `projects` table and applies the
// DDL. Foreign keys are ON so Project ownership and delete behavior are
// exercised against the shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid row persists with the full TASK field set (project_id,
//     config_json, updated_by) plus the mutable updated_at defaulted on insert.
//   - One-row-per-Project identity: project_id is the PRIMARY KEY, so a second
//     row for the same Project and a NULL project_id are rejected.
//   - Project ownership: a dangling Project is rejected by the FK, and deleting
//     the owning Project cascades the configuration away.
//   - The configuration document is validated at the DB boundary: malformed
//     JSON is rejected and a valid document is stored verbatim.
//   - config_json and updated_by are required (NOT NULL); an explicit NULL
//     updated_at is rejected despite its default.
//   - The row is intentionally MUTABLE configuration: a direct UPDATE of
//     config_json/updated_by/updated_at succeeds and persists (no append-only
//     trigger).
//   - The table ships ONLY the direct field set (no created_at, no
//     preferred-market/CAS/version column) and has exactly one FK to projects
//     with CASCADE and no explicit (business) index beyond the primary key.

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

const statementParts = (ddl: string) =>
  ddl
    .split(DRIZZLE_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

const MIGRATION_FILE = "drizzle/0076_search_growth_targets.sql";

const TARGET_COLUMNS = `(project_id, config_json, updated_by)`;

const VALID_CONFIG =
  '{"brandAliases":["JovaAI"],"productTargets":["RFQ Agent"],"icps":["制造商"],"personas":["CIO"],"conversionGoals":["book_demo"]}';

let client: Client;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete'), ('proj_one_row'), ('proj_update');`,
  );
  for (const statement of statementParts(
    readFileSync(MIGRATION_FILE, "utf8"),
  )) {
    await client.execute(statement);
  }
});

afterAll(() => {
  client.close();
});

// No per-test teardown: rows are keyed by unique project_id and each test uses
// dedicated Project ids, so tests never depend on each other's order.

type TargetSeed = {
  projectId: string;
  configJson?: string;
  updatedBy?: string;
};

async function insertTarget({
  projectId,
  configJson = VALID_CONFIG,
  updatedBy = "operator_1",
}: TargetSeed) {
  await client.execute(
    `INSERT INTO search_growth_targets ${TARGET_COLUMNS}
     VALUES ('${projectId}', '${configJson}', '${updatedBy}')`,
  );
}

async function rowsFor(projectId: string) {
  return db
    .select()
    .from(searchGrowthTargets)
    .where(eq(searchGrowthTargets.projectId, projectId));
}

describe("search_growth_targets storage contract", () => {
  it("persists a valid target with the full field set and defaulted updated_at", async () => {
    await insertTarget({ projectId: "proj_alpha" });

    const rows = await rowsFor("proj_alpha");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId: "proj_alpha",
      configJson: VALID_CONFIG,
      updatedBy: "operator_1",
    });
    // Mutable update timestamp is defaulted on insert.
    expect(rows[0]?.updatedAt).toBeTruthy();
  });

  it("enforces one-row-per-Project identity: a duplicate or NULL project_id is rejected", async () => {
    await insertTarget({ projectId: "proj_one_row" });

    await expect(
      insertTarget({ projectId: "proj_one_row", configJson: "{}" }),
    ).rejects.toThrow(/UNIQUE constraint failed/i);

    await expect(
      client.execute(
        `INSERT INTO search_growth_targets ${TARGET_COLUMNS}
         VALUES (NULL, '${VALID_CONFIG}', 'operator_1')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("rejects a dangling Project and cascades the configuration when the Project is deleted", async () => {
    await expect(insertTarget({ projectId: "proj_missing" })).rejects.toThrow(
      /FOREIGN KEY constraint failed/i,
    );

    await insertTarget({ projectId: "proj_delete" });
    expect(await rowsFor("proj_delete")).toHaveLength(1);

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");
    expect(await rowsFor("proj_delete")).toHaveLength(0);
  });

  it("validates the configuration document at the storage boundary", async () => {
    await expect(
      insertTarget({ projectId: "proj_bad_json", configJson: "{not json" }),
    ).rejects.toThrow(/CHECK constraint failed/i);

    // A valid document is stored verbatim and stays queryable as JSON.
    await insertTarget({ projectId: "proj_beta", configJson: VALID_CONFIG });
    const stored = await client.execute(
      `SELECT json_extract(config_json, '$.conversionGoals[0]') AS goal
       FROM search_growth_targets WHERE project_id = 'proj_beta'`,
    );
    expect(stored.rows[0]?.goal).toBe("book_demo");
    expect((await rowsFor("proj_beta"))[0]?.configJson).toBe(VALID_CONFIG);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    const insertWith = (values: string) =>
      client.execute(
        `INSERT INTO search_growth_targets (project_id, config_json, updated_by, updated_at) VALUES (${values})`,
      );

    await expect(
      insertWith(`'proj_no_config', NULL, 'operator_1', NULL`),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    await expect(
      insertWith(`'proj_no_updater', '${VALID_CONFIG}', NULL, NULL`),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // updated_at has a default but an explicit NULL is rejected.
    await expect(
      insertWith(`'proj_no_timestamp', '${VALID_CONFIG}', 'operator_1', NULL`),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("allows a direct UPDATE and persists the new configuration and provenance", async () => {
    await insertTarget({ projectId: "proj_update", updatedBy: "operator_1" });

    const updatedConfig = `{"brandAliases":["JovaAI","艾氪智能"],"productTargets":[],"icps":[],"personas":[],"conversionGoals":["contact"]}`;
    await client.execute(
      `UPDATE search_growth_targets
       SET config_json = '${updatedConfig}', updated_by = 'operator_2',
           updated_at = '2026-09-11T06:00:00.000Z'
       WHERE project_id = 'proj_update'`,
    );

    const rows = await rowsFor("proj_update");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId: "proj_update",
      configJson: updatedConfig,
      updatedBy: "operator_2",
      updatedAt: "2026-09-11T06:00:00.000Z",
    });
  });

  it("ships ONLY the direct field set with no created_at or preferred-market column", async () => {
    const tableInfo = await client.execute(
      "SELECT name FROM pragma_table_info('search_growth_targets')",
    );
    const columns = sort(
      tableInfo.rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string"),
      (a, b) => a.localeCompare(b),
    );
    expect(columns).toEqual([
      "config_json",
      "project_id",
      "updated_at",
      "updated_by",
    ]);
  });

  it("has exactly one CASCADE foreign key to projects and no explicit index", async () => {
    const fks = await client.execute(
      "SELECT * FROM pragma_foreign_key_list('search_growth_targets')",
    );
    expect(fks.rows).toHaveLength(1);
    expect(fks.rows[0]).toMatchObject({
      table: "projects",
      from: "project_id",
      to: "id",
      on_delete: "CASCADE",
    });

    // The primary key alone is the identity rule; no business-unique or lookup
    // index is added (origin 'c' = explicitly created index).
    const indexes = await client.execute(
      "SELECT name FROM pragma_index_list('search_growth_targets') WHERE origin = 'c'",
    );
    expect(indexes.rows).toHaveLength(0);
  });
});
