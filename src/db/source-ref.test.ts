/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole source_refs storage contract (valid persistence/type round-trip/NOT NULL/enum rejection/dangling-Project rejection/project-cascade/append-only schema shape) through the shipped 0056 DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sourceRefs } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// normalized source-reference table (0056). source_refs has no parent beyond
// the Project (the claims/content tables arrive in later tasks and reference
// source refs by id), so the spec creates the `projects` table directly and
// applies only the 0056 DDL. Foreign keys are ON so the Project FK, the enum
// CHECK and the project cascade are exercised against the shipped DDL.
//
// Invariants: a valid §9 source reference persists with the full direct field
// set (id, project, type, ref, captured_at) plus the append-only created_at;
// the required type/ref/captured_at columns are enforced; every V1.0 type value
// round-trips and unsupported/case-mismatched/legacy values are rejected by the
// named CHECK; a source reference whose Project does not exist is rejected by
// the DB; deleting a whole Project cascades its source references away; and the
// schema ships ONLY the direct/reconciled field set plus the created_at system
// timestamp (no updated_at, no legacy title/classification/url/evidence_ref
// columns and no business-unique index).

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

const MIGRATION_FILES = ["drizzle/0056_organic_blue_blade.sql"];

let client: Client;
let db: ReturnType<typeof drizzle>;

type NewSourceRef = typeof sourceRefs.$inferInsert;

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
  await db.delete(sourceRefs);
});

async function insertSourceRef(
  id: string,
  overrides: Partial<NewSourceRef> = {},
) {
  await db.insert(sourceRefs).values({
    id,
    projectId: "proj_alpha",
    type: "URL",
    ref: "https://example.com/source-page",
    capturedAt: "2026-09-08T04:00:05.000Z",
    ...overrides,
  });
}

async function sourceRefIdsForProject(projectId: string) {
  const rows = await db
    .select({ id: sourceRefs.id })
    .from(sourceRefs)
    .where(eq(sourceRefs.projectId, projectId));
  return sort(
    rows.map((row) => row.id),
    (a, b) => a.localeCompare(b),
  );
}

const SOURCE_REF_COLUMN_INSERT = `(id, project_id, type, ref, captured_at)`;

describe("source_refs storage contract", () => {
  it("persists a valid source reference with the full direct V1.0 field set", async () => {
    // The full §9 SourceRef field set: stable id, explicit Project ownership,
    // the V1.0 type union value URL, the ref exactly as captured and the
    // application-supplied captured_at moment.
    await insertSourceRef("source_ref_alpha_1", {
      projectId: "proj_alpha",
      type: "URL",
      ref: "https://example.com/source-page",
      capturedAt: "2026-09-08T04:00:05.000Z",
    });

    const rows = await db
      .select()
      .from(sourceRefs)
      .where(eq(sourceRefs.id, "source_ref_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "source_ref_alpha_1",
      projectId: "proj_alpha",
      type: "URL",
      ref: "https://example.com/source-page",
      capturedAt: "2026-09-08T04:00:05.000Z",
    });
    // Append-only system insert timestamp is set by the storage default.
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("round-trips every V1.0 SourceRef type value", async () => {
    const typeValues = [
      "URL",
      "INTERNAL_DOC",
      "PRODUCT_FACT",
      "RESEARCH",
    ] as const;
    const refsByType: Record<(typeof typeValues)[number], string> = {
      URL: "https://example.com/source-page",
      INTERNAL_DOC: "docs/internal/spec-v1.md",
      PRODUCT_FACT: "fact/sku-1001-stock",
      RESEARCH: "research/geo-survey-2026-09",
    };

    for (const [index, type] of typeValues.entries()) {
      await client.execute(
        `INSERT INTO source_refs ${SOURCE_REF_COLUMN_INSERT}
         VALUES ('source_ref_enum_${index}', 'proj_alpha', '${type}',
                 '${refsByType[type]}', '2026-09-08T04:00:05.000Z')`,
      );
    }

    const rows = await db
      .select()
      .from(sourceRefs)
      .where(eq(sourceRefs.projectId, "proj_alpha"));
    const stored = sort(
      rows.map((row) => ({ id: row.id, type: row.type })),
      (a, b) => a.id.localeCompare(b.id),
    );
    expect(stored).toEqual([
      { id: "source_ref_enum_0", type: "URL" },
      { id: "source_ref_enum_1", type: "INTERNAL_DOC" },
      { id: "source_ref_enum_2", type: "PRODUCT_FACT" },
      { id: "source_ref_enum_3", type: "RESEARCH" },
    ]);
  });

  it("requires the direct identity/content columns (NOT NULL)", async () => {
    // type has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO source_refs ${SOURCE_REF_COLUMN_INSERT}
         VALUES ('source_ref_no_type', 'proj_alpha', NULL,
                 'https://example.com/source-page', '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // ref is the captured reference value and is required.
    await expect(
      client.execute(
        `INSERT INTO source_refs ${SOURCE_REF_COLUMN_INSERT}
         VALUES ('source_ref_no_ref', 'proj_alpha', 'URL',
                 NULL, '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // captured_at is the application-supplied capture moment and is required.
    await expect(
      client.execute(
        `INSERT INTO source_refs ${SOURCE_REF_COLUMN_INSERT}
         VALUES ('source_ref_no_captured_at', 'proj_alpha', 'URL',
                 'https://example.com/source-page', NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("rejects unsupported, legacy and case-mismatched types at the storage boundary (CHECK)", async () => {
    // Not an approved V1.0 SourceRef type -> the named CHECK rejects it. The
    // legacy reference `kind` values (INTERNAL_EVIDENCE, CLAIM, PUBLICATION,
    // OTHER) and case-mismatched variants are all outside the §9 union.
    for (const [index, type] of [
      "INTERNAL_EVIDENCE",
      "CLAIM",
      "PUBLICATION",
      "OTHER",
      "url",
      "WEB_PAGE",
    ].entries()) {
      await expect(
        client.execute(
          `INSERT INTO source_refs ${SOURCE_REF_COLUMN_INSERT}
           VALUES ('source_ref_bad_${index}', 'proj_alpha', '${type}',
                   'https://example.com/bad', '2026-09-08T04:00:05.000Z')`,
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("rejects a source reference whose Project does not exist (dangling Project)", async () => {
    // project_id is a hard FK to projects(id): a source reference naming a
    // missing Project is rejected by the DB.
    await expect(
      client.execute(
        `INSERT INTO source_refs ${SOURCE_REF_COLUMN_INSERT}
         VALUES ('source_ref_orphan_project', 'proj_missing', 'URL',
                 'https://example.com/orphan', '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("cascades a source reference away when its whole Project is deleted", async () => {
    await insertSourceRef("source_ref_delete_1", {
      projectId: "proj_delete",
    });
    await insertSourceRef("source_ref_delete_2", {
      projectId: "proj_delete",
      type: "RESEARCH",
      ref: "research/delete-me",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    expect(await sourceRefIdsForProject("proj_delete")).toEqual([]);
  });

  it("is append-only by schema shape and ships ONLY the direct/reconciled field set", async () => {
    const tableInfo = await client.execute(
      "SELECT name FROM pragma_table_info('source_refs')",
    );
    const columns = sort(
      tableInfo.rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string"),
      (a, b) => a.localeCompare(b),
    );

    // The exact §9/TASK field list (stable id, project_id, type, ref,
    // captured_at) and the append-only created_at system timestamp. No
    // updated_at, no legacy reference-only title/classification/url/
    // evidence_ref columns and no JSON-encoded relationship column.
    expect(columns).toEqual([
      "captured_at",
      "created_at",
      "id",
      "project_id",
      "ref",
      "type",
    ]);
  });
});
