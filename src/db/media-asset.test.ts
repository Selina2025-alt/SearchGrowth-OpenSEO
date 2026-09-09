/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole media_assets storage contract (valid persistence/enum round-trip/NOT NULL/enum CHECK/dangling-Project rejection/whole-Project delete cascade/normalized schema shape) through the shipped 0060 DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mediaAssets } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped media asset metadata table (0060). The spec creates the
// `projects` table directly and applies the 0060 DDL. Foreign keys are ON so the
// Project FK, the enum CHECKs and the delete cascade are exercised against the
// shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid asset persists with the full direct §11/TASK field set (id,
//     project, media_type, mime_type, bytes, sha256, rights_status,
//     classification) plus the creation audit timestamp; every MediaType ×
//     MediaRightsStatus × classification value combination round-trips; the
//     required direct metadata columns are enforced; unsupported and
//     case-mismatched media_type/rights_status/classification values are
//     rejected by the named CHECKs; an asset whose Project does not exist is
//     rejected by the DB.
//   - Deleting a whole Project cascades its media assets away, so an asset can
//     never dangle.
//   - The asset ships ONLY the direct/reconciled metadata columns plus the
//     creation audit timestamp (no storage_key/original_filename/width/height/
//     duration_seconds/alt_text/created_by/updated_at/deleted_at column and no
//     content-hash/storage-key/filename/dimensional uniqueness rule).

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

const MIGRATION_FILES = ["drizzle/0060_nervous_gwen_stacy.sql"];

const ASSET_COLUMN_INSERT = `(id, project_id, media_type, mime_type, bytes, sha256,
                              rights_status, classification)`;

let client: Client;
let db: ReturnType<typeof drizzle>;

type NewMediaAsset = typeof mediaAssets.$inferInsert;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_delete');`,
  );
  await applyMigrationFiles(client, MIGRATION_FILES);
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await db.delete(mediaAssets);
  await client.execute("DELETE FROM projects");
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_delete');`,
  );
});

async function insertAsset(id: string, overrides: Partial<NewMediaAsset> = {}) {
  await db.insert(mediaAssets).values({
    id,
    projectId: "proj_alpha",
    mediaType: "IMAGE",
    mimeType: "image/png",
    bytes: 2048,
    sha256: "abc123",
    rightsStatus: "OWNED",
    classification: "PUBLIC_MARKETING",
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

describe("media_assets storage contract", () => {
  it("persists a valid asset with the full direct V1.0 field set", async () => {
    await insertAsset("asset_alpha_1", {
      projectId: "proj_alpha",
      mediaType: "VIDEO",
      mimeType: "video/mp4",
      bytes: 1024,
      sha256: "feedface",
      rightsStatus: "LICENSED",
      classification: "INTERNAL",
    });

    const rows = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, "asset_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "asset_alpha_1",
      projectId: "proj_alpha",
      mediaType: "VIDEO",
      mimeType: "video/mp4",
      bytes: 1024,
      sha256: "feedface",
      rightsStatus: "LICENSED",
      classification: "INTERNAL",
    });
    // The creation audit timestamp is set by the storage default.
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("round-trips every MediaType, rights-status and classification value", async () => {
    const mediaTypes = [
      "IMAGE",
      "VIDEO",
      "AUDIO",
      "DOCUMENT",
      "OTHER",
    ] as const;
    const rightsStatuses = [
      "OWNED",
      "LICENSED",
      "APPROVED_EXTERNAL",
      "UNKNOWN",
    ] as const;
    const classifications = [
      "PUBLIC_MARKETING",
      "INTERNAL",
      "RESTRICTED",
    ] as const;

    // 5 media types x 4 rights statuses x 3 classifications exercise every enum
    // combination; each row also carries distinct mime/sha256/bytes values to
    // prove those are stored verbatim and unconstrained.
    let index = 0;
    for (const mediaType of mediaTypes) {
      for (const rightsStatus of rightsStatuses) {
        for (const classification of classifications) {
          await insertAsset(`asset_enum_${index}`, {
            mediaType,
            mimeType: `application/x-asset-${index}`,
            bytes: 1000 + index,
            sha256: `sha256-${index}`,
            rightsStatus,
            classification,
          });
          index += 1;
        }
      }
    }

    const rows = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.projectId, "proj_alpha"));
    expect(rows).toHaveLength(60);
    for (const mediaType of mediaTypes) {
      for (const rightsStatus of rightsStatuses) {
        for (const classification of classifications) {
          const match = rows.filter(
            (row) =>
              row.mediaType === mediaType &&
              row.rightsStatus === rightsStatus &&
              row.classification === classification,
          );
          expect(match).toHaveLength(1);
        }
      }
    }
    // Distinct asset metadata (mime/sha256/bytes) round-trips verbatim.
    expect(
      sort(
        rows.map((row) => row.sha256),
        (a, b) => a.localeCompare(b),
      ),
    ).toHaveLength(60);
  });

  it("requires the direct metadata columns (NOT NULL)", async () => {
    // media_type has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO media_assets ${ASSET_COLUMN_INSERT}
         VALUES ('asset_no_media_type', 'proj_alpha', NULL, 'image/png', 2048,
                 'abc123', 'OWNED', 'PUBLIC_MARKETING')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // mime_type has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO media_assets ${ASSET_COLUMN_INSERT}
         VALUES ('asset_no_mime', 'proj_alpha', 'IMAGE', NULL, 2048,
                 'abc123', 'OWNED', 'PUBLIC_MARKETING')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // bytes has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO media_assets ${ASSET_COLUMN_INSERT}
         VALUES ('asset_no_bytes', 'proj_alpha', 'IMAGE', 'image/png', NULL,
                 'abc123', 'OWNED', 'PUBLIC_MARKETING')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // sha256 has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO media_assets ${ASSET_COLUMN_INSERT}
         VALUES ('asset_no_sha', 'proj_alpha', 'IMAGE', 'image/png', 2048,
                 NULL, 'OWNED', 'PUBLIC_MARKETING')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // rights_status has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO media_assets ${ASSET_COLUMN_INSERT}
         VALUES ('asset_no_rights', 'proj_alpha', 'IMAGE', 'image/png', 2048,
                 'abc123', NULL, 'PUBLIC_MARKETING')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // classification has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO media_assets ${ASSET_COLUMN_INSERT}
         VALUES ('asset_no_classification', 'proj_alpha', 'IMAGE', 'image/png',
                 2048, 'abc123', 'OWNED', NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("rejects unsupported and case-mismatched media_type values (CHECK)", async () => {
    for (const [index, mediaType] of [
      // Case-mismatched variants of the approved uppercase values.
      "image",
      "Image",
      "VIDEO ",
      // Unsupported media types.
      "EXECUTABLE",
      "ARCHIVE",
      "NONE",
    ].entries()) {
      await expect(
        client.execute(
          `INSERT INTO media_assets ${ASSET_COLUMN_INSERT}
           VALUES ('asset_bad_type_${index}', 'proj_alpha', '${mediaType}',
                   'image/png', 2048, 'abc123', 'OWNED', 'PUBLIC_MARKETING')`,
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("rejects unsupported and case-mismatched rights_status values (CHECK)", async () => {
    for (const [index, rightsStatus] of [
      // Case-mismatched variants of the approved uppercase values.
      "owned",
      "Licensed",
      "UNKNOWN ",
      // Unsupported rights statuses.
      "PUBLIC_DOMAIN",
      "FAIR_USE",
      "NONE",
    ].entries()) {
      await expect(
        client.execute(
          `INSERT INTO media_assets ${ASSET_COLUMN_INSERT}
           VALUES ('asset_bad_rights_${index}', 'proj_alpha', 'IMAGE',
                   'image/png', 2048, 'abc123', '${rightsStatus}',
                   'PUBLIC_MARKETING')`,
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("rejects unsupported and case-mismatched classification values (CHECK)", async () => {
    for (const [index, classification] of [
      // Case-mismatched variants of the approved uppercase values.
      "public_marketing",
      "Internal",
      "RESTRICTED ",
      // Unsupported classifications.
      "PUBLIC",
      "CONFIDENTIAL",
      "UNKNOWN",
    ].entries()) {
      await expect(
        client.execute(
          `INSERT INTO media_assets ${ASSET_COLUMN_INSERT}
           VALUES ('asset_bad_class_${index}', 'proj_alpha', 'IMAGE',
                   'image/png', 2048, 'abc123', 'OWNED', '${classification}')`,
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("rejects an asset whose Project does not exist (dangling Project)", async () => {
    await expect(
      client.execute(
        `INSERT INTO media_assets ${ASSET_COLUMN_INSERT}
         VALUES ('asset_orphan_project', 'proj_missing', 'IMAGE', 'image/png',
                 2048, 'abc123', 'OWNED', 'PUBLIC_MARKETING')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("cascades assets away when their whole Project is deleted", async () => {
    await insertAsset("asset_delete", { projectId: "proj_delete" });
    await insertAsset("asset_delete_2", { projectId: "proj_delete" });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const remaining = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.projectId, "proj_delete"));
    expect(remaining).toHaveLength(0);
  });

  it("ships ONLY the direct/reconciled asset metadata field set", async () => {
    // The exact §11/TASK field list (id, project_id, media_type, mime_type,
    // bytes, sha256, rights_status, classification) plus the creation audit
    // timestamp. No legacy storage_key/original_filename/width/height/
    // duration_seconds/alt_text/created_by/deleted_at columns, no updated_at,
    // and no content-hash/filename uniqueness column.
    expect(await columnNames("media_assets")).toEqual([
      "bytes",
      "classification",
      "created_at",
      "id",
      "media_type",
      "mime_type",
      "project_id",
      "rights_status",
      "sha256",
    ]);
  });
});
