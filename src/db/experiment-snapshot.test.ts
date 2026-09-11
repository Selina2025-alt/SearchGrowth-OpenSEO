/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole experiment_snapshots storage contract (valid persistence with the full field set and NULL window/timezone/notes, same-Project Experiment ownership, source-defined snapshot-type enum, six required JSON documents, NOT NULL columns, direct UPDATE/DELETE rejection by the append-only triggers, parent-delete protection, exact column set, FK/index shape and the supporting parent unique index from the shipped 0075 DDL); splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { experimentSnapshots } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped, append-only ExperimentSnapshot table (D1 0075), which creates
// `experiment_snapshots` with its Project FK, the same-Project Experiment
// composite FK, the snapshot-type CHECK, the six JSON-document CHECKs, the
// append-only triggers and the supporting `experiments_project_id_id_idx`
// unique index on the parent `experiments` table. The spec creates the minimal
// parent tables (projects and an experiments stand-in with the columns the
// composite FK needs) and applies the DDL. Foreign keys are ON so same-Project
// ownership, delete behavior and trigger behavior are exercised against the
// shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project snapshot persists with the full TASK field set
//     (stable id, project_id, experiment_id, snapshot_type, captured_at,
//     nullable window_start/window_end/timezone, five metric documents,
//     data_quality_json, nullable notes) plus the append-only created_at.
//   - Optional window/timezone/notes are nullable and stored verbatim.
//   - A snapshot belongs to its Experiment's Project: an Experiment on another
//     Project is rejected by the composite FK; a dangling Experiment or Project
//     is rejected too.
//   - snapshot_type is the source-defined taxonomy: every legacy union value
//     persists, any other value is rejected by the named CHECK.
//   - Each of the six required JSON documents is validated at the DB boundary;
//     malformed JSON is rejected and a valid document is stored verbatim.
//   - Direct required columns are NOT NULL.
//   - A direct UPDATE or DELETE of a snapshot is rejected by the append-only
//     triggers and the stored row is unchanged.
//   - Deleting the owning Experiment or Project cannot silently drop immutable
//     measurement history.
//   - The table ships ONLY the direct field set (no updated_at, no computed
//     attribution/comparison/lifecycle column).
//   - The parent `experiments` table gains the ONE referential supporting unique
//     index the composite FK requires; the snapshot table adds no unique index.

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

const MIGRATION_FILE = "drizzle/0075_experiment_snapshots.sql";

const SNAPSHOT_COLUMNS = `(id, project_id, experiment_id, snapshot_type,
  captured_at, window_start, window_end, timezone, seo_metrics_json,
  geo_metrics_json, ga4_metrics_json, publication_metrics_json,
  indexing_metrics_json, data_quality_json, notes)`;

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
  // Minimal stand-in for the accepted experiments parent table: only the
  // columns the composite FK needs. The 0075 migration adds the
  // (project_id, id) unique index the FK requires, so the stand-in does not
  // declare it redundantly.
  await client.execute(
    `CREATE TABLE experiments (id text PRIMARY KEY, project_id text NOT NULL);`,
  );
  await client.execute(
    `INSERT INTO experiments (id, project_id)
     VALUES ('exp_alpha', 'proj_alpha'),
            ('exp_beta', 'proj_beta'),
            ('exp_delete', 'proj_delete');`,
  );
  await applyMigrationFile(client, MIGRATION_FILE);
});

afterAll(() => {
  client.close();
});

// No per-test teardown: snapshot rows are append-only and cannot be deleted, so
// tests use unique ids and (where the owning parent is exercised) dedicated
// Project/Experiment rows. Assertions always filter by id.

type SnapshotSeed = {
  id: string;
  projectId?: string;
  experimentId?: string;
  snapshotType?: string;
  capturedAt?: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  timezone?: string | null;
  seoMetricsJson?: string;
  geoMetricsJson?: string;
  ga4MetricsJson?: string;
  publicationMetricsJson?: string;
  indexingMetricsJson?: string;
  dataQualityJson?: string;
  notes?: string | null;
};

const nullable = (value: string | null | undefined) =>
  value === null || value === undefined ? "NULL" : `'${value}'`;

async function insertSnapshot({
  id,
  projectId = "proj_alpha",
  experimentId = "exp_alpha",
  snapshotType = "BASELINE",
  capturedAt = "2026-09-10T05:00:00.000Z",
  windowStart = null,
  windowEnd = null,
  timezone = null,
  seoMetricsJson = `{"clicks":${id.length}}`,
  geoMetricsJson = `{"mentions":${id.length}}`,
  ga4MetricsJson = `{"sessions":${id.length}}`,
  publicationMetricsJson = `{"published":${id.length}}`,
  indexingMetricsJson = `{"indexed":${id.length}}`,
  dataQualityJson = `{"status":"OK","warnings":[]}`,
  notes = null,
}: SnapshotSeed) {
  await client.execute(
    `INSERT INTO experiment_snapshots ${SNAPSHOT_COLUMNS}
     VALUES ('${id}', '${projectId}', '${experimentId}', '${snapshotType}',
             '${capturedAt}', ${nullable(windowStart)}, ${nullable(windowEnd)},
             ${nullable(timezone)}, '${seoMetricsJson}', '${geoMetricsJson}',
             '${ga4MetricsJson}', '${publicationMetricsJson}',
             '${indexingMetricsJson}', '${dataQualityJson}',
             ${nullable(notes)})`,
  );
}

async function rowsFor(id: string) {
  return db
    .select()
    .from(experimentSnapshots)
    .where(eq(experimentSnapshots.id, id));
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

describe("experiment_snapshots storage contract", () => {
  it("persists a valid same-Project snapshot with the full field set and NULL optional context", async () => {
    const id = "snap_alpha_1";
    await insertSnapshot({ id });

    const rows = await rowsFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      projectId: "proj_alpha",
      experimentId: "exp_alpha",
      snapshotType: "BASELINE",
      capturedAt: "2026-09-10T05:00:00.000Z",
      seoMetricsJson: `{"clicks":${id.length}}`,
      geoMetricsJson: `{"mentions":${id.length}}`,
      ga4MetricsJson: `{"sessions":${id.length}}`,
      publicationMetricsJson: `{"published":${id.length}}`,
      indexingMetricsJson: `{"indexed":${id.length}}`,
      dataQualityJson: '{"status":"OK","warnings":[]}',
    });
    // Optional window/timezone/notes are NULL until recorded.
    expect(rows[0]?.windowStart).toBeNull();
    expect(rows[0]?.windowEnd).toBeNull();
    expect(rows[0]?.timezone).toBeNull();
    expect(rows[0]?.notes).toBeNull();
    expect(rows[0]?.createdAt).toBeTruthy();
  });

  it("persists optional window, timezone and notes values verbatim", async () => {
    const id = "snap_window";
    await insertSnapshot({
      id,
      snapshotType: "D14",
      windowStart: "2026-08-27T00:00:00.000Z",
      windowEnd: "2026-09-10T00:00:00.000Z",
      timezone: "Asia/Shanghai",
      notes: "post14 vs pre14 comparison window",
    });

    const rows = await rowsFor(id);
    expect(rows[0]).toMatchObject({
      snapshotType: "D14",
      windowStart: "2026-08-27T00:00:00.000Z",
      windowEnd: "2026-09-10T00:00:00.000Z",
      timezone: "Asia/Shanghai",
      notes: "post14 vs pre14 comparison window",
    });
  });

  it("rejects a snapshot whose Experiment belongs to another Project or does not exist", async () => {
    // exp_beta lives on proj_beta, so proj_alpha cannot reference it.
    await expect(
      insertSnapshot({
        id: "snap_cross_experiment",
        experimentId: "exp_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // A dangling Experiment is rejected by the composite FK.
    await expect(
      insertSnapshot({
        id: "snap_dangling_experiment",
        experimentId: "exp_missing",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // A dangling Project is rejected by the Project FK.
    await expect(
      insertSnapshot({
        id: "snap_dangling_project",
        projectId: "proj_missing",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("persists every source-defined snapshot type and rejects others", async () => {
    const types = ["BASELINE", "D7", "D14", "D30", "MANUAL"] as const;
    for (const [index, snapshotType] of types.entries()) {
      const id = `snap_type_${index}`;
      await insertSnapshot({ id, snapshotType });
      expect((await rowsFor(id))[0]?.snapshotType).toBe(snapshotType);
    }

    for (const [index, snapshotType] of [
      "T0",
      "baseline",
      "D1",
      "",
    ].entries()) {
      await expect(
        insertSnapshot({
          id: `snap_bad_type_${index}`,
          snapshotType,
        }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("validates every required JSON document at the storage boundary", async () => {
    const badDocuments: Partial<SnapshotSeed>[] = [
      { seoMetricsJson: "{not json" },
      { geoMetricsJson: "{not json" },
      { ga4MetricsJson: "{not json" },
      { publicationMetricsJson: "{not json" },
      { indexingMetricsJson: "{not json" },
      { dataQualityJson: "{not json" },
    ];
    for (const [index, bad] of badDocuments.entries()) {
      await expect(
        insertSnapshot({ id: `snap_bad_json_${index}`, ...bad }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }

    const id = "snap_good_json";
    const documents = {
      seoMetricsJson: '{"clicks":120,"impressions":3400}',
      geoMetricsJson:
        '{"mentioned":true,"recommended":true,"screenPosition":2}',
      ga4MetricsJson: '{"sessions":88,"keyEvents":11}',
      publicationMetricsJson: '{"publicTargets":3,"verified":3}',
      indexingMetricsJson: '{"google":"INDEXED","baidu":"NOT_CONFIGURED"}',
      dataQualityJson: '{"status":"OK","warnings":[{"code":"DATA_LAG"}]}',
    };
    await insertSnapshot({ id, ...documents });
    expect((await rowsFor(id))[0]).toMatchObject(documents);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    const insertWith = (values: string) =>
      client.execute(
        `INSERT INTO experiment_snapshots ${SNAPSHOT_COLUMNS} VALUES (${values})`,
      );

    const base = [
      "'x'",
      "'proj_alpha'",
      "'exp_alpha'",
      "'BASELINE'",
      "'2026-09-10T05:00:00.000Z'",
      "NULL",
      "NULL",
      "NULL",
      "'{}'",
      "'{}'",
      "'{}'",
      "'{}'",
      "'{}'",
      "'{}'",
      "NULL",
    ];
    // Every required non-default column, plus the id primary key.
    const requiredIndexes = [0, 1, 2, 3, 4, 8, 9, 10, 11, 12, 13];
    for (const index of requiredIndexes) {
      const values = [...base];
      values[index] = "NULL";
      await expect(insertWith(values.join(", "))).rejects.toThrow(
        /NOT NULL constraint failed/i,
      );
    }
  });

  it("rejects a direct UPDATE of a snapshot and leaves the stored row unchanged", async () => {
    const id = "snap_no_update";
    await insertSnapshot({ id });

    await expect(
      client.execute(
        `UPDATE experiment_snapshots SET notes = 'TAMPERED' WHERE id = '${id}'`,
      ),
    ).rejects.toThrow(/append-only: UPDATE is not permitted/i);

    const rows = await rowsFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.notes).toBeNull();
  });

  it("rejects a direct DELETE of a snapshot and keeps the stored row", async () => {
    const id = "snap_no_delete";
    await insertSnapshot({ id });

    await expect(
      client.execute(`DELETE FROM experiment_snapshots WHERE id = '${id}'`),
    ).rejects.toThrow(/append-only: DELETE is not permitted/i);

    expect(await rowsFor(id)).toHaveLength(1);
  });

  it("blocks deleting the owning Experiment or Project while it still has snapshots", async () => {
    await insertSnapshot({
      id: "snap_experiment_delete",
      projectId: "proj_delete",
      experimentId: "exp_delete",
    });

    // The Experiment FK cascades, but the append-only DELETE trigger fires on
    // the cascade too, so immutable measurement history is never silently
    // dropped.
    await expect(
      client.execute("DELETE FROM experiments WHERE id = 'exp_delete'"),
    ).rejects.toThrow(/append-only: DELETE is not permitted/i);

    await expect(
      client.execute("DELETE FROM projects WHERE id = 'proj_delete'"),
    ).rejects.toThrow(/append-only: DELETE is not permitted/i);

    expect(await rowsFor("snap_experiment_delete")).toHaveLength(1);
  });

  it("ships ONLY the direct field set: no updated_at or computed attribution column", async () => {
    expect(await columnNames("experiment_snapshots")).toEqual([
      "captured_at",
      "created_at",
      "data_quality_json",
      "experiment_id",
      "ga4_metrics_json",
      "geo_metrics_json",
      "id",
      "indexing_metrics_json",
      "notes",
      "project_id",
      "publication_metrics_json",
      "seo_metrics_json",
      "snapshot_type",
      "timezone",
      "window_end",
      "window_start",
    ]);
  });

  it("has exactly two foreign keys (Project + same-Project Experiment)", async () => {
    const fks = await client.execute(
      "SELECT * FROM pragma_foreign_key_list('experiment_snapshots')",
    );
    // A composite FK yields one row per column; group by the FK id.
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
    expect(targets).toEqual(["experiments", "projects"]);

    const experimentFkColumns = fks.rows
      .filter((row) => row.table === "experiments")
      .map((row) => row.from)
      .filter((from): from is string => typeof from === "string");
    expect(sort(experimentFkColumns, (a, b) => a.localeCompare(b))).toEqual([
      "experiment_id",
      "project_id",
    ]);
    for (const row of fks.rows) {
      expect(row.on_delete).toBe("CASCADE");
    }
  });

  it("adds the ONE referential parent unique index and no business unique index", async () => {
    // The composite FK requires an explicit unique (project_id, id) target on
    // the parent experiments table; 0075 creates it.
    const parentIndexes = await client.execute(
      "SELECT name, \"unique\" FROM pragma_index_list('experiments') WHERE origin = 'c'",
    );
    expect(parentIndexes.rows).toHaveLength(1);
    expect(parentIndexes.rows[0]).toMatchObject({
      name: "experiments_project_id_id_idx",
      unique: 1,
    });

    // The snapshot table's only explicit index is the non-unique experiment
    // lookup/cascade index; there is no business uniqueness.
    const snapshotIndexes = await client.execute(
      "SELECT name, \"unique\" FROM pragma_index_list('experiment_snapshots') WHERE origin = 'c'",
    );
    expect(snapshotIndexes.rows).toHaveLength(1);
    expect(snapshotIndexes.rows[0]).toMatchObject({
      name: "experiment_snapshots_experiment_idx",
      unique: 0,
    });
  });
});
