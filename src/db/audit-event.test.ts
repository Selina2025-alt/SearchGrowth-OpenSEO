/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole search_growth_audit_events storage contract (valid persistence with the full field set and nullable refs/metadata validity/Project ownership/NOT NULL columns/direct UPDATE and DELETE rejection/project-delete protection/exact column and FK shape via the shipped 0071 DDL plus its append-only triggers); splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchGrowthAuditEvents } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// append-only, Project-scoped AuditEvent table (D1 0071), which creates
// `search_growth_audit_events` with its Project FK, metadata CHECK and the two
// append-only triggers. The spec creates the `projects` table directly and
// applies the DDL in order. Foreign keys are ON so Project ownership and the
// trigger behavior are exercised against the shipped DDL — not an application
// convention.
//
// Invariants under test:
//   - A valid same-Project event persists with the full TASK field set (stable
//     id, project_id, actor_id, action, object_type, object_id, optional
//     before_ref/after_ref, metadata_json, correlation_id) plus the append-only
//     created_at; the optional references default NULL.
//   - The event's Project is ownership-enforced: a dangling project_id is
//     rejected by the FK.
//   - `actor_id`, `action`, `object_type`, `object_id`, `metadata_json` and
//     `correlation_id` are required (NOT NULL).
//   - Metadata is validated at the DB boundary: malformed JSON is rejected and
//     a valid document is stored verbatim.
//   - A direct UPDATE or DELETE of an event row is rejected by the append-only
//     triggers, and the stored row is unchanged.
//   - Deleting the owning Project cannot silently drop immutable audit history.
//   - The table ships ONLY the direct field set (no updated_at, no
//     runtime-control/execution/publishing column) and exactly one foreign key
//     (Project ownership — actor/object/correlation/before/after stay opaque).

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

const MIGRATION_FILES = ["drizzle/0071_stiff_the_professor.sql"];

const EVENT_COLUMNS = `(id, project_id, actor_id, action, object_type, object_id,
  before_ref, after_ref, metadata_json, correlation_id)`;

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
  await applyMigrationFiles(client, MIGRATION_FILES);
});

afterAll(() => {
  client.close();
});

// No per-test teardown: audit rows are append-only and cannot be deleted, so
// tests use unique event ids and (where the owning Project itself is exercised)
// a dedicated project. Assertions always filter by id.

type EventSeed = {
  id: string;
  projectId?: string;
  actorId?: string;
  action?: string;
  objectType?: string;
  objectId?: string;
  beforeRef?: string | null;
  afterRef?: string | null;
  metadataJson?: string;
  correlationId?: string;
};

async function insertEvent({
  id,
  projectId = "proj_alpha",
  actorId = "actor_1",
  action = "RELEASE_APPROVED",
  objectType = "ReleaseBundle",
  objectId = "bundle_1",
  beforeRef = null,
  afterRef = null,
  metadataJson = `{"note":"${id}"}`,
  correlationId = "corr_1",
}: EventSeed) {
  await client.execute(
    `INSERT INTO search_growth_audit_events ${EVENT_COLUMNS}
     VALUES ('${id}', '${projectId}', '${actorId}', '${action}',
             '${objectType}', '${objectId}',
             ${beforeRef === null ? "NULL" : `'${beforeRef}'`},
             ${afterRef === null ? "NULL" : `'${afterRef}'`},
             '${metadataJson}', '${correlationId}')`,
  );
}

async function rowsFor(id: string) {
  return db
    .select()
    .from(searchGrowthAuditEvents)
    .where(eq(searchGrowthAuditEvents.id, id));
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

describe("search_growth_audit_events storage contract", () => {
  it("persists a valid same-Project event with the full field set and NULL optional references", async () => {
    // The required TASK field set under the event's own project_id, plus the
    // append-only created_at.
    await insertEvent({ id: "event_alpha_1" });

    const rows = await rowsFor("event_alpha_1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "event_alpha_1",
      projectId: "proj_alpha",
      actorId: "actor_1",
      action: "RELEASE_APPROVED",
      objectType: "ReleaseBundle",
      objectId: "bundle_1",
      metadataJson: '{"note":"event_alpha_1"}',
      correlationId: "corr_1",
    });
    // Optional before/after references are NULL until recorded.
    expect(rows[0].beforeRef).toBeNull();
    expect(rows[0].afterRef).toBeNull();
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("persists optional before/after references and opaque actor/object/correlation values verbatim", async () => {
    await insertEvent({
      id: "event_refs",
      actorId: "bridge-node-7",
      action: "RUNTIME_CONTROL_PAUSED",
      objectType: "search_market_profiles",
      objectId: "profile_42",
      beforeRef: "bundle_before_hash",
      afterRef: "bundle_after_hash",
      metadataJson: '{"reason":"maintenance","scope":["global"]}',
      correlationId: "corr-bridge-9",
    });

    const rows = await rowsFor("event_refs");
    expect(rows[0]).toMatchObject({
      actorId: "bridge-node-7",
      action: "RUNTIME_CONTROL_PAUSED",
      objectType: "search_market_profiles",
      objectId: "profile_42",
      beforeRef: "bundle_before_hash",
      afterRef: "bundle_after_hash",
      metadataJson: '{"reason":"maintenance","scope":["global"]}',
      correlationId: "corr-bridge-9",
    });
  });

  it("rejects an event whose Project does not exist", async () => {
    await expect(
      insertEvent({ id: "event_dangling_project", projectId: "proj_missing" }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    const insertWith = (values: string) =>
      client.execute(
        `INSERT INTO search_growth_audit_events ${EVENT_COLUMNS} VALUES (${values})`,
      );

    // actor_id has no default and is required.
    await expect(
      insertWith(
        `'event_no_actor', 'proj_alpha', NULL, 'ACTION', 'T', 'o', NULL, NULL, '{}', 'c'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // action has no default and is required.
    await expect(
      insertWith(
        `'event_no_action', 'proj_alpha', 'actor_1', NULL, 'T', 'o', NULL, NULL, '{}', 'c'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // object_type has no default and is required.
    await expect(
      insertWith(
        `'event_no_type', 'proj_alpha', 'actor_1', 'ACTION', NULL, 'o', NULL, NULL, '{}', 'c'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // object_id has no default and is required.
    await expect(
      insertWith(
        `'event_no_object', 'proj_alpha', 'actor_1', 'ACTION', 'T', NULL, NULL, NULL, '{}', 'c'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // metadata_json has no default and is required.
    await expect(
      insertWith(
        `'event_no_meta', 'proj_alpha', 'actor_1', 'ACTION', 'T', 'o', NULL, NULL, NULL, 'c'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // correlation_id has no default and is required.
    await expect(
      insertWith(
        `'event_no_corr', 'proj_alpha', 'actor_1', 'ACTION', 'T', 'o', NULL, NULL, '{}', NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("rejects malformed metadata JSON at the storage boundary", async () => {
    await expect(
      insertEvent({ id: "event_bad_metadata", metadataJson: "{not json" }),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("rejects a direct UPDATE of an event and leaves the stored row unchanged", async () => {
    await insertEvent({ id: "event_no_update" });

    await expect(
      client.execute(
        "UPDATE search_growth_audit_events SET action = 'TAMPERED' WHERE id = 'event_no_update'",
      ),
    ).rejects.toThrow(/append-only: UPDATE is not permitted/i);

    const rows = await rowsFor("event_no_update");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("RELEASE_APPROVED");
  });

  it("rejects a direct DELETE of an event and keeps the stored row", async () => {
    await insertEvent({ id: "event_no_delete" });

    await expect(
      client.execute(
        "DELETE FROM search_growth_audit_events WHERE id = 'event_no_delete'",
      ),
    ).rejects.toThrow(/append-only: DELETE is not permitted/i);

    const rows = await rowsFor("event_no_delete");
    expect(rows).toHaveLength(1);
  });

  it("blocks deleting the owning Project while it still has audit events", async () => {
    await insertEvent({
      id: "event_project_delete",
      projectId: "proj_delete",
    });

    // The Project FK cascades, but the append-only DELETE trigger fires on the
    // cascade too, so immutable audit history is never silently dropped.
    await expect(
      client.execute("DELETE FROM projects WHERE id = 'proj_delete'"),
    ).rejects.toThrow(/append-only: DELETE is not permitted/i);

    const rows = await rowsFor("event_project_delete");
    expect(rows).toHaveLength(1);
  });

  it("ships ONLY the direct field set with no updated_at or runtime-control column", async () => {
    // The exact TASK field list (id, project_id, actor_id, action, object_type,
    // object_id, before_ref, after_ref, metadata_json, correlation_id) plus the
    // append-only created_at.
    expect(await columnNames("search_growth_audit_events")).toEqual([
      "action",
      "actor_id",
      "after_ref",
      "before_ref",
      "correlation_id",
      "created_at",
      "id",
      "metadata_json",
      "object_id",
      "object_type",
      "project_id",
    ]);
  });

  it("has exactly ONE foreign key (Project ownership) and no actor/object/correlation FK", async () => {
    const fks = await client.execute(
      "SELECT * FROM pragma_foreign_key_list('search_growth_audit_events')",
    );
    expect(fks.rows).toHaveLength(1);
    expect(fks.rows[0]).toMatchObject({
      table: "projects",
      from: "project_id",
      to: "id",
    });
  });
});
