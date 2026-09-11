/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole runtime_controls storage contract (valid persistence for every allowed value type with nullable reason/default updated_at/key identity/required columns/malformed and unsupported JSON rejection/intentional mutability/exact column shape and absence of FK plus append-only triggers via the shipped 0072 DDL); splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runtimeControls } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// mutable, globally-scoped RuntimeControl table (D1 0072). The table has no
// Project ownership and no triggers, so the spec needs no parent table: it
// applies the shipped DDL and exercises the named value CHECK directly.
//
// Invariants under test:
//   - A valid control persists with the full TASK field set (stable
//     control_key, value_json, optional reason, updated_by) plus the mutable
//     updated_at defaulted to insert time.
//   - Every allowed source value type persists as its exact JSON scalar text:
//     boolean (`true`/`false`), number (integer/real) and string.
//   - `reason` is optional (NULL) and is otherwise stored verbatim.
//   - Key identity: control_key is the PRIMARY KEY, so a duplicate or NULL key
//     is rejected.
//   - `value_json`, `updated_by` and `updated_at` are required (NOT NULL).
//   - The value is validated at the DB boundary: malformed JSON and every
//     unsupported JSON kind (null/array/object) are rejected.
//   - The row is intentionally MUTABLE configuration: a direct UPDATE succeeds
//     and persists (no append-only trigger).
//   - The table ships ONLY the direct field set (no project_id / version / CAS /
//     evaluation column), has NO foreign keys (updated_by stays opaque) and NO
//     triggers (no append-only semantics).

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

const statementParts = (ddl: string) =>
  ddl
    .split(DRIZZLE_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

const MIGRATION_FILE = "drizzle/0072_previous_bishop.sql";

const CONTROL_COLUMNS = `(control_key, value_json, reason, updated_by)`;

let client: Client;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  for (const statement of statementParts(
    readFileSync(MIGRATION_FILE, "utf8"),
  )) {
    await client.execute(statement);
  }
});

afterAll(() => {
  client.close();
});

// No per-test teardown: controls are keyed by unique control_key and each test
// uses its own key, so tests never depend on each other's order.

type ControlSeed = {
  controlKey: string;
  valueJson: string;
  reason?: string | null;
  updatedBy?: string;
};

async function insertControl({
  controlKey,
  valueJson,
  reason = null,
  updatedBy = "operator_1",
}: ControlSeed) {
  await client.execute(
    `INSERT INTO runtime_controls ${CONTROL_COLUMNS}
     VALUES ('${controlKey}', '${valueJson}',
             ${reason === null ? "NULL" : `'${reason}'`}, '${updatedBy}')`,
  );
}

async function rowsFor(controlKey: string) {
  return db
    .select()
    .from(runtimeControls)
    .where(eq(runtimeControls.controlKey, controlKey));
}

async function jsonTypeOf(controlKey: string) {
  const result = await client.execute(
    `SELECT json_type(value_json) AS value_type FROM runtime_controls WHERE control_key = '${controlKey}'`,
  );
  return result.rows[0]?.value_type;
}

describe("runtime_controls storage contract", () => {
  it("persists a valid control with the full field set, NULL reason and defaulted updated_at", async () => {
    await insertControl({
      controlKey: "global_publishing_pause",
      valueJson: "true",
    });

    const rows = await rowsFor("global_publishing_pause");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      controlKey: "global_publishing_pause",
      valueJson: "true",
      reason: null,
      updatedBy: "operator_1",
    });
    // Mutable update timestamp is defaulted on insert.
    expect(rows[0]?.updatedAt).toBeTruthy();
  });

  it("persists every allowed source value type as its exact JSON scalar", async () => {
    const cases = [
      { controlKey: "pause_boolean_true", valueJson: "true", type: "true" },
      { controlKey: "pause_boolean_false", valueJson: "false", type: "false" },
      { controlKey: "max_releases_integer", valueJson: "42", type: "integer" },
      { controlKey: "min_interval_real", valueJson: "1.5", type: "real" },
      {
        controlKey: "platform_pause_name",
        valueJson: '"platform_pause"',
        type: "text",
      },
    ];

    for (const { controlKey, valueJson, type } of cases) {
      await insertControl({ controlKey, valueJson });
      const rows = await rowsFor(controlKey);
      expect(rows[0]?.valueJson).toBe(valueJson);
      // The stored JSON keeps the source scalar kind on both dialects.
      expect(await jsonTypeOf(controlKey)).toBe(type);
    }
  });

  it("stores an optional reason verbatim and leaves it NULL when omitted", async () => {
    await insertControl({
      controlKey: "with_reason",
      valueJson: "false",
      reason: "maintenance window",
    });
    await insertControl({
      controlKey: "without_reason",
      valueJson: "false",
      reason: null,
    });

    expect((await rowsFor("with_reason"))[0]?.reason).toBe(
      "maintenance window",
    );
    expect((await rowsFor("without_reason"))[0]?.reason).toBeNull();
  });

  it("enforces key identity: a duplicate or NULL control_key is rejected", async () => {
    await insertControl({ controlKey: "unique_key", valueJson: "true" });

    await expect(
      insertControl({ controlKey: "unique_key", valueJson: "false" }),
    ).rejects.toThrow(/UNIQUE constraint failed/i);

    await expect(
      client.execute(
        `INSERT INTO runtime_controls ${CONTROL_COLUMNS} VALUES (NULL, 'true', NULL, 'operator_1')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    const insertWith = (values: string) =>
      client.execute(
        `INSERT INTO runtime_controls (control_key, value_json, reason, updated_by, updated_at) VALUES (${values})`,
      );

    // value_json has no default and is required.
    await expect(
      insertWith(`'no_value', NULL, NULL, 'operator_1', NULL`),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // updated_by has no default and is required.
    await expect(
      insertWith(`'no_updater', 'true', NULL, NULL, NULL`),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // updated_at has a default but an explicit NULL is rejected.
    await expect(
      insertWith(`'no_timestamp', 'true', NULL, 'operator_1', NULL`),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("rejects malformed JSON at the storage boundary", async () => {
    await expect(
      insertControl({ controlKey: "bad_json", valueJson: "{not json" }),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("rejects unsupported JSON kinds (null, array, object)", async () => {
    const unsupported = ["null", "[]", "{}", '["paused"]', '{"on":true}'];
    for (const [index, valueJson] of unsupported.entries()) {
      await expect(
        insertControl({ controlKey: `bad_kind_${index}`, valueJson }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("allows a direct UPDATE (intentionally mutable configuration, not append-only)", async () => {
    await insertControl({
      controlKey: "platform_pause_zhihu",
      valueJson: "false",
      reason: null,
      updatedBy: "operator_1",
    });

    await client.execute(
      `UPDATE runtime_controls
       SET value_json = 'true', reason = 'halt distribution',
           updated_by = 'operator_2', updated_at = '2026-09-10T06:00:00.000Z'
       WHERE control_key = 'platform_pause_zhihu'`,
    );

    const rows = await rowsFor("platform_pause_zhihu");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      controlKey: "platform_pause_zhihu",
      valueJson: "true",
      reason: "halt distribution",
      updatedBy: "operator_2",
      updatedAt: "2026-09-10T06:00:00.000Z",
    });
  });

  it("ships ONLY the direct field set with no Project/version/evaluation column", async () => {
    const tableInfo = await client.execute(
      "SELECT name FROM pragma_table_info('runtime_controls')",
    );
    const columns = sort(
      tableInfo.rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string"),
      (a, b) => a.localeCompare(b),
    );
    expect(columns).toEqual([
      "control_key",
      "reason",
      "updated_at",
      "updated_by",
      "value_json",
    ]);
  });

  it("has NO foreign keys (updated_by stays opaque) and NO append-only trigger", async () => {
    const fks = await client.execute(
      "SELECT * FROM pragma_foreign_key_list('runtime_controls')",
    );
    expect(fks.rows).toHaveLength(0);

    const triggers = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'runtime_controls'",
    );
    expect(triggers.rows).toHaveLength(0);
  });
});
