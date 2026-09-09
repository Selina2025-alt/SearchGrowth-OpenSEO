/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole published_media_refs storage contract (valid same-Project persistence/opaque verbatim + NULL round-trip/cross-Project rejection in both directions/dangling asset + dangling Project rejection/NOT NULL required-field rejection/media-asset + whole-Project delete cascades/normalized shape) through the shipped DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mediaAssets, publishedMediaRefs } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped published-media-reference table: 0060 creates the media_assets
// parent, then 0061 creates published_media_refs and adds the
// media_assets_project_id_id_idx supporting unique target the same-Project
// composite FK requires. The spec creates the `projects` table directly and
// applies the DDL in order. Foreign keys are ON so the Project FK, the
// same-Project composite FK, and the delete cascades are exercised against the
// shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project reference persists with the full §11/TASK field set
//     (id, project_id, media_asset_id, platform, account_id, external_media_id,
//     public_url, sha256) plus the creation audit timestamp; the nullable opaque
//     remote fields (account_id, external_media_id, public_url, sha256) are
//     stored verbatim and round-trip NULL exactly.
//   - A reference whose media asset belongs to another Project — in EITHER
//     direction (asset on the other Project, or this reference's own project_id
//     set to the other Project) — is rejected by the composite FK; a reference
//     whose asset or Project is missing is rejected.
//   - Deleting a media asset, or a whole Project, cascades its references away,
//     so a reference can never dangle.
//   - The reference ships ONLY the direct remote-reference field set (no
//     status/success/verification/credential/adapter-version column and no
//     business-unique index).

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
  "drizzle/0060_nervous_gwen_stacy.sql",
  "drizzle/0061_windy_sally_floyd.sql",
];

const REF_COLUMN_INSERT = `(id, project_id, media_asset_id, platform, account_id,
                            external_media_id, public_url, sha256)`;

let client: Client;
let db: ReturnType<typeof drizzle>;

type NewMediaAsset = typeof mediaAssets.$inferInsert;
type NewPublishedMediaRef = typeof publishedMediaRefs.$inferInsert;

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
  await db.delete(publishedMediaRefs);
  await db.delete(mediaAssets);
  await client.execute("DELETE FROM projects");
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete');`,
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

async function insertRef(
  id: string,
  overrides: Partial<NewPublishedMediaRef> = {},
) {
  await db.insert(publishedMediaRefs).values({
    id,
    projectId: "proj_alpha",
    mediaAssetId: "asset_alpha_1",
    platform: "WeChat-OA",
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

describe("published_media_refs storage contract", () => {
  it("persists a valid same-Project reference with the full opaque field set", async () => {
    await insertAsset("asset_alpha_1");
    await insertRef("ref_alpha_1", {
      mediaAssetId: "asset_alpha_1",
      platform: "WeChat-OA",
      accountId: "gh_openseo_2026",
      externalMediaId: "mid=2651965827001",
      publicUrl: "https://mp.weixin.qq.com/s/openseo-example",
      sha256: "feedface",
    });

    const rows = await db
      .select()
      .from(publishedMediaRefs)
      .where(eq(publishedMediaRefs.id, "ref_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "ref_alpha_1",
      projectId: "proj_alpha",
      mediaAssetId: "asset_alpha_1",
      platform: "WeChat-OA",
      accountId: "gh_openseo_2026",
      externalMediaId: "mid=2651965827001",
      publicUrl: "https://mp.weixin.qq.com/s/openseo-example",
      sha256: "feedface",
    });
    // The creation audit timestamp is set by the storage default.
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("stores the nullable opaque remote fields verbatim and round-trips NULL", async () => {
    // account_id / external_media_id / public_url / sha256 are the TASK/§11
    // nullable opaque remote fields: they persist verbatim when present and NULL
    // when absent — no normalization, URL validation or hash interpretation is
    // applied by the storage slice.
    await insertAsset("asset_alpha_1");
    await insertRef("ref_null_remote", {
      // All four nullable fields omitted -> stored as NULL.
    });
    await insertRef("ref_opaque_remote", {
      id: "ref_opaque_remote",
      // Opaque, non-normalized remote values round-trip exactly as supplied.
      platform: "YouTube",
      accountId: "UC_openseo_channel",
      externalMediaId: "dQw4w9WgXcQ",
      publicUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      sha256:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });

    const nullRow = await db
      .select()
      .from(publishedMediaRefs)
      .where(eq(publishedMediaRefs.id, "ref_null_remote"));
    expect(nullRow).toHaveLength(1);
    expect(nullRow[0]).toMatchObject({
      platform: "WeChat-OA",
      accountId: null,
      externalMediaId: null,
      publicUrl: null,
      sha256: null,
    });

    const opaqueRow = await db
      .select()
      .from(publishedMediaRefs)
      .where(eq(publishedMediaRefs.id, "ref_opaque_remote"));
    expect(opaqueRow).toHaveLength(1);
    expect(opaqueRow[0]).toMatchObject({
      platform: "YouTube",
      accountId: "UC_openseo_channel",
      externalMediaId: "dQw4w9WgXcQ",
      publicUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      sha256:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
  });

  it("rejects a reference whose media asset belongs to another Project", async () => {
    // asset_beta lives on proj_beta; the reference lives on proj_alpha, so the
    // composite FK (project_id, media_asset_id) -> media_assets(project_id, id)
    // has no matching parent row.
    await insertAsset("asset_beta", { projectId: "proj_beta" });

    await expect(
      client.execute(
        `INSERT INTO published_media_refs ${REF_COLUMN_INSERT}
         VALUES ('ref_cross_asset', 'proj_alpha', 'asset_beta', 'WeChat-OA',
                 NULL, NULL, NULL, NULL)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a reference whose own project does not match its asset's project", async () => {
    // asset_alpha lives on proj_alpha; the reference's own project_id is
    // proj_beta, so the composite FK (project_id, media_asset_id) ->
    // media_assets(project_id, id) has no matching parent row in the reverse
    // direction.
    await insertAsset("asset_alpha_1");

    await expect(
      client.execute(
        `INSERT INTO published_media_refs ${REF_COLUMN_INSERT}
         VALUES ('ref_wrong_project', 'proj_beta', 'asset_alpha_1', 'WeChat-OA',
                 NULL, NULL, NULL, NULL)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a reference whose media asset does not exist (dangling asset)", async () => {
    await insertAsset("asset_alpha_1");

    await expect(
      client.execute(
        `INSERT INTO published_media_refs ${REF_COLUMN_INSERT}
         VALUES ('ref_dangling_asset', 'proj_alpha', 'asset_missing',
                 'WeChat-OA', NULL, NULL, NULL, NULL)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a reference whose Project does not exist (dangling Project)", async () => {
    await insertAsset("asset_alpha_1");

    await expect(
      client.execute(
        `INSERT INTO published_media_refs ${REF_COLUMN_INSERT}
         VALUES ('ref_dangling_project', 'proj_missing', 'asset_alpha_1',
                 'WeChat-OA', NULL, NULL, NULL, NULL)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("requires the direct reference columns (NOT NULL)", async () => {
    // platform has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO published_media_refs ${REF_COLUMN_INSERT}
         VALUES ('ref_no_platform', 'proj_alpha', 'asset_alpha_1', NULL,
                 NULL, NULL, NULL, NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // media_asset_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO published_media_refs ${REF_COLUMN_INSERT}
         VALUES ('ref_no_asset', 'proj_alpha', NULL, 'WeChat-OA',
                 NULL, NULL, NULL, NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // project_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO published_media_refs ${REF_COLUMN_INSERT}
         VALUES ('ref_no_project', NULL, 'asset_alpha_1', 'WeChat-OA',
                 NULL, NULL, NULL, NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO published_media_refs ${REF_COLUMN_INSERT}
         VALUES (NULL, 'proj_alpha', 'asset_alpha_1', 'WeChat-OA',
                 NULL, NULL, NULL, NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("cascades references away when their media asset is deleted", async () => {
    await insertAsset("asset_alpha_1");
    await insertRef("ref_asset_delete_1");
    await insertRef("ref_asset_delete_2");

    await client.execute("DELETE FROM media_assets WHERE id = 'asset_alpha_1'");

    const remaining = await db
      .select()
      .from(publishedMediaRefs)
      .where(eq(publishedMediaRefs.projectId, "proj_alpha"));
    expect(remaining).toHaveLength(0);
  });

  it("cascades references and assets away when their whole Project is deleted", async () => {
    await insertAsset("asset_delete", { projectId: "proj_delete" });
    await insertRef("ref_delete", {
      projectId: "proj_delete",
      mediaAssetId: "asset_delete",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const references = await db
      .select()
      .from(publishedMediaRefs)
      .where(eq(publishedMediaRefs.projectId, "proj_delete"));
    expect(references).toHaveLength(0);
    const assets = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.projectId, "proj_delete"));
    expect(assets).toHaveLength(0);
  });

  it("ships ONLY the normalized direct remote-reference field set", async () => {
    // The exact §11/TASK field list (id, project_id, media_asset_id, platform,
    // account_id, external_media_id, public_url, sha256) plus the creation audit
    // timestamp. No adapter_version, status/success/verification/credential
    // column, no updated_at, and no business-unique column.
    expect(await columnNames("published_media_refs")).toEqual([
      "account_id",
      "created_at",
      "external_media_id",
      "id",
      "media_asset_id",
      "platform",
      "project_id",
      "public_url",
      "sha256",
    ]);
  });
});
