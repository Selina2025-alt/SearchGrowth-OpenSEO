/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole indexing_observations storage contract (valid persistence with the full field set and NULL optional profile/receipt/Project ownership/same-Project MarketProfile AND PublicationReceipt enforcement/SearchEngine enum rejection/required columns/details JSON validation/cascade and NO ACTION delete behavior/exact column, index and FK shape from the shipped 0073 + 0083 DDL); splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { indexingObservations } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped IndexingObservation table (D1 0073, which creates
// `indexing_observations` with its Project FK, the optional same-Project
// MarketProfile composite FK, the SearchEngine CHECK and the details-JSON CHECK)
// followed by D1 0083, which adds the nullable same-Project
// `publication_receipt_id` relation and rebuilds the table with the
// (project_id, publication_receipt_id) -> publication_receipts(project_id, id)
// composite FK. The spec creates the minimal `projects`,
// `search_market_profiles` and `publication_receipts` parent tables (with the
// (project_id, id) unique targets the composite FKs require) and applies the
// DDL in order. The `publication_receipts` stand-in carries only the columns
// this relation needs, including its Project cascade. Foreign keys are ON so
// Project ownership, both same-Project relations and the delete behaviors are
// exercised against the shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project observation persists with the full TASK field set
//     (stable id, project_id, optional publication_receipt_id, opaque url,
//     search_engine, optional market_profile_id, observation_type, status,
//     details_json, observed_at) plus the append-only created_at; the optional
//     profile and receipt relation default NULL.
//   - Every source-defined SearchEngine value persists; any other value is
//     rejected by the named CHECK.
//   - details_json is validated at the DB boundary: malformed JSON is rejected
//     and a valid document is stored verbatim. observation_type/status are
//     opaque (no invented enum), so arbitrary labels persist.
//   - Ownership: a dangling project_id is rejected by the FK, a
//     market_profile_id belonging to another Project is rejected by the
//     composite FK, and a publication_receipt_id on another Project or one that
//     does not exist is rejected by the receipt composite FK.
//   - Deleting a still-referenced publication receipt is BLOCKED (NO ACTION) so
//     the append-only observation evidence is preserved; deleting a Project or
//     the scoped market profile cascades the observation away, and a
//     whole-Project teardown still removes both the observation and its receipt.
//   - The table ships the direct field set and no business unique index: no
//     updated_at, no normalized URL/dedup rule, no receipt verification /
//     citation matching / collection column (TASK items 2, 5).

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
  "drizzle/0073_indexing_observations.sql",
  "drizzle/0083_thankful_leader.sql",
];

const OBSERVATION_COLUMNS = `(id, project_id, publication_receipt_id, url,
  search_engine, market_profile_id, observation_type, status, details_json,
  observed_at)`;

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
  // Minimal stand-in for the accepted publication_receipts table (T136): only
  // the columns the composite FK needs, with the accepted
  // `publication_receipts_project_id_id_idx` (project_id, id) unique target and
  // the same Project cascade the shipped table carries. This spec exercises
  // indexing_observations, not that table.
  await client.execute(
    `CREATE TABLE publication_receipts (
       id text PRIMARY KEY,
       project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
       UNIQUE (project_id, id)
     );`,
  );
  await client.execute(
    `INSERT INTO publication_receipts (id, project_id)
     VALUES ('receipt_alpha', 'proj_alpha'), ('receipt_beta', 'proj_beta'),
            ('receipt_delete', 'proj_delete');`,
  );
  await applyMigrationFiles(client, MIGRATION_FILES);
});

afterAll(() => {
  client.close();
});

// No per-test teardown: rows are keyed by unique observation ids and cascade
// tests use their own Project/profile, so tests never depend on order.

type ObservationSeed = {
  id: string;
  projectId?: string;
  publicationReceiptId?: string | null;
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
  publicationReceiptId = null,
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
     VALUES ('${id}', '${projectId}',
             ${publicationReceiptId === null ? "NULL" : `'${publicationReceiptId}'`},
             '${url}', '${searchEngine}',
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
    // NULL means the observation is not associated with a controlled
    // publication receipt (the optional relation is not enforced when NULL).
    expect(rows[0]?.publicationReceiptId).toBeNull();
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

  it("stores a same-Project publication receipt relation and keeps observation_type/status opaque", async () => {
    await insertObservation({
      id: "obs_with_profile",
      publicationReceiptId: "receipt_alpha",
      marketProfileId: "profile_alpha",
      observationType: "SITEMAP_ENTRY",
      status: "NOT_INDEXED",
    });

    const rows = await rowsFor("obs_with_profile");
    // The receipt and the observation share proj_alpha, so the composite FK
    // (project_id, publication_receipt_id) has a matching parent row. The value
    // is carried verbatim: no verification, matching or resolution happens.
    expect(rows[0]?.publicationReceiptId).toBe("receipt_alpha");
    expect(rows[0]?.marketProfileId).toBe("profile_alpha");
    // No authoritative enum exists for these two fields, so arbitrary labels
    // persist unchanged (TASK item 3).
    expect(rows[0]?.observationType).toBe("SITEMAP_ENTRY");
    expect(rows[0]?.status).toBe("NOT_INDEXED");
  });

  it("rejects an observation whose Project, MarketProfile or receipt belongs to another Project", async () => {
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

    // receipt_beta lives on proj_beta, so proj_alpha cannot reference it. The
    // composite FK (project_id, publication_receipt_id) has no matching parent
    // row for either direction of a cross-Project reference.
    await expect(
      insertObservation({
        id: "obs_cross_project_receipt",
        projectId: "proj_alpha",
        publicationReceiptId: "receipt_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertObservation({
        id: "obs_cross_project_receipt_reverse",
        projectId: "proj_beta",
        publicationReceiptId: "receipt_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // A receipt id that does not exist has no parent row either.
    await expect(
      insertObservation({
        id: "obs_dangling_receipt",
        publicationReceiptId: "receipt_missing",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    const insertWith = (values: string) =>
      client.execute(
        `INSERT INTO indexing_observations (id, project_id,
           publication_receipt_id, url, search_engine, market_profile_id,
           observation_type, status, details_json, observed_at)
         VALUES (${values})`,
      );

    await expect(
      insertWith(
        `'o1', 'proj_alpha', NULL, NULL, 'GOOGLE', NULL, 'T', 'S', '{}', 'now'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
    await expect(
      insertWith(
        `'o2', 'proj_alpha', NULL, 'https://e.com', NULL, NULL, 'T', 'S', '{}', 'now'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
    await expect(
      insertWith(
        `'o3', 'proj_alpha', NULL, 'https://e.com', 'GOOGLE', NULL, NULL, 'S', '{}', 'now'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
    await expect(
      insertWith(
        `'o4', 'proj_alpha', NULL, 'https://e.com', 'GOOGLE', NULL, 'T', NULL, '{}', 'now'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
    await expect(
      insertWith(
        `'o5', 'proj_alpha', NULL, 'https://e.com', 'GOOGLE', NULL, 'T', 'S', NULL, 'now'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
    await expect(
      insertWith(
        `'o6', 'proj_alpha', NULL, 'https://e.com', 'GOOGLE', NULL, 'T', 'S', '{}', NULL`,
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

  it("blocks deleting a still-referenced receipt and preserves the observation evidence", async () => {
    await client.execute(
      `INSERT INTO publication_receipts (id, project_id)
       VALUES ('receipt_rel_del', 'proj_alpha')`,
    );
    await insertObservation({
      id: "obs_receipt_block",
      publicationReceiptId: "receipt_rel_del",
    });

    // NO ACTION: the referenced receipt cannot be deleted, so the append-only
    // observation evidence is preserved (SET NULL cannot work because the
    // composite FK's project_id lead column is NOT NULL; CASCADE would delete
    // the observation).
    await expect(
      client.execute(
        "DELETE FROM publication_receipts WHERE id = 'receipt_rel_del'",
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    expect(await rowsFor("obs_receipt_block")).toHaveLength(1);

    // Removing the observation releases the receipt for deletion.
    await client.execute(
      "DELETE FROM indexing_observations WHERE id = 'obs_receipt_block'",
    );
    await client.execute(
      "DELETE FROM publication_receipts WHERE id = 'receipt_rel_del'",
    );
    const receipts = await client.execute(
      "SELECT id FROM publication_receipts WHERE id = 'receipt_rel_del'",
    );
    expect(receipts.rows).toHaveLength(0);
  });

  it("removes the observation and its receipt on a whole-project teardown", async () => {
    // A fresh Project so the cascade tests above cannot interfere.
    await client.execute(
      "INSERT INTO projects (id) VALUES ('proj_obs_teardown')",
    );
    await client.execute(
      `INSERT INTO publication_receipts (id, project_id)
       VALUES ('receipt_obs_teardown', 'proj_obs_teardown')`,
    );
    await insertObservation({
      id: "obs_teardown",
      projectId: "proj_obs_teardown",
      publicationReceiptId: "receipt_obs_teardown",
    });

    // Both rows are Project descendants and the NO ACTION constraint is checked
    // at end-of-statement, so the teardown removes the observation and its
    // receipt together.
    await client.execute("DELETE FROM projects WHERE id = 'proj_obs_teardown'");

    expect(await rowsFor("obs_teardown")).toHaveLength(0);
    const receipts = await client.execute(
      "SELECT id FROM publication_receipts WHERE id = 'receipt_obs_teardown'",
    );
    expect(receipts.rows).toHaveLength(0);
  });

  it("ships the direct field set (no updated_at / normalized URL / verification column)", async () => {
    expect(await columnNames("indexing_observations")).toEqual([
      "created_at",
      "details_json",
      "id",
      "market_profile_id",
      "observation_type",
      "observed_at",
      "project_id",
      "publication_receipt_id",
      "search_engine",
      "status",
      "url",
    ]);
  });

  it("has exactly three foreign keys (Project + optional same-Project MarketProfile and PublicationReceipt)", async () => {
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
    expect(targets).toEqual([
      "projects",
      "publication_receipts",
      "search_market_profiles",
    ]);
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
