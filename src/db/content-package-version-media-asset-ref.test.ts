/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole content_package_version_media_assets storage contract (valid same-Project persistence/cross-Project rejection in both directions/dangling parent rejection/duplicate edge rejection/NOT NULL required-field rejection/content-package-version + media-asset + whole-Project delete cascades/normalized relation shape) through the shipped 0066 DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  contentPackageVersionMediaAssets,
  contentPackageVersions,
  contentPackages,
  mediaAssets,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped ContentPackageVersion <-> MediaAsset relation table and its
// parents: market profile 0045, topic 0046, prompt 0049 (composite-FK target the
// accepted opportunity table requires), opportunity 0055, source_ref 0056, claim
// 0057 (0064's content_package_version_claims FK requires the claims table),
// media_assets 0060 (T114) with its published_media_refs supporting composite
// target index `media_assets_project_id_id_idx` added by 0061 (T115), content
// package 0062, content package version 0063, content package version claim 0064
// (creates the reused `content_package_versions_project_id_id_idx` composite-FK
// target this relation's ContentVersion FK requires), then 0066 (which creates
// content_package_version_media_assets). The spec creates the `projects` table
// directly and applies the DDL in order. Foreign keys are ON so the Project FK,
// the two same-Project composite FKs (version and media asset), the
// duplicate-edge unique index and the delete cascades are exercised against the
// shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project ContentPackageVersion/MediaAsset link persists with
//     the full TASK field set (id, project_id, content_package_version_id,
//     media_asset_id) plus the append-only created_at timestamp.
//   - A link whose MediaAsset or ContentPackageVersion belongs to another Project
//     — in EITHER direction — is rejected by the composite FK; a link whose
//     version, media asset, or Project is missing is rejected.
//   - A duplicate (content_package_version_id, media_asset_id) pair is rejected.
//   - Deleting a content package version, a media asset, or a whole Project
//     cascades its links away, so an edge can never dangle.
//   - The relation ships ONLY the normalized link field set (no updated_at, no
//     asset rights/classification/transformation payload, no JSON id array
//     column).

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
  "drizzle/0055_lowly_sumo.sql",
  "drizzle/0056_organic_blue_blade.sql",
  "drizzle/0057_cold_marrow.sql",
  "drizzle/0060_nervous_gwen_stacy.sql",
  "drizzle/0061_windy_sally_floyd.sql",
  "drizzle/0062_calm_nightcrawler.sql",
  "drizzle/0063_sudden_lyja.sql",
  "drizzle/0064_needy_lady_vermin.sql",
  "drizzle/0066_glossy_microbe.sql",
];

// Canonical opaque version metadata fixture (stored verbatim; the link stores no
// asset payload — asset metadata/rights/classification state lives on the
// media_assets row).
const CANONICAL_METADATA = JSON.stringify({
  intent: "commercial",
  briefTitle: "RFQ portals explained",
  targetAudience: "procurement",
});

const LINK_COLUMN_INSERT = `(id, project_id, content_package_version_id, media_asset_id)`;
const VERSION_COLUMN_INSERT = `(id, project_id, content_package_id, version_no,
  canonical_markdown, canonical_metadata_json, content_hash, gate_status,
  classification)`;

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

beforeEach(async () => {
  // Child-first teardown: content_package_version_media_assets references both
  // content_package_versions and media_assets; content_package_versions
  // references content_packages; content_packages references search_topics.
  await db.delete(contentPackageVersionMediaAssets);
  await db.delete(mediaAssets);
  await db.delete(contentPackageVersions);
  await db.delete(contentPackages);
  await db.delete(searchTopics);
});

async function seedTopic(id: string, projectId: string) {
  await db.insert(searchTopics).values({
    id,
    projectId,
    canonicalName: `Topic ${id}`,
    locale: "en",
    status: "ACTIVE",
  });
}

async function seedPackage(id: string, projectId: string, topicId: string) {
  await db.insert(contentPackages).values({
    id,
    projectId,
    topicId,
    title: `Package ${id}`,
    locale: "en",
    status: "planned",
  });
}

async function seedVersion(
  id: string,
  projectId: string,
  packageId: string,
  versionNo: number,
) {
  await client.execute(
    `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', '${packageId}', ${versionNo},
             '# Version ${id}', '${CANONICAL_METADATA}', 'sha256-${id}',
             'DRAFT', 'INTERNAL')`,
  );
}

async function seedMediaAsset(id: string, projectId: string) {
  await client.execute(
    `INSERT INTO media_assets (id, project_id, media_type, mime_type, bytes,
       sha256, rights_status, classification)
     VALUES ('${id}', '${projectId}', 'IMAGE', 'image/png', 1024,
             'hash-${id}', 'OWNED', 'INTERNAL')`,
  );
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

describe("content_package_version_media_assets storage contract", () => {
  it("persists a valid same-Project version/media-asset link with the full field set", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedMediaAsset("asset_alpha_1", "proj_alpha");
    // The full TASK field set: required content_package_version_id +
    // media_asset_id under the link's own project_id, plus the append-only
    // created_at.
    await client.execute(
      `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
       VALUES ('link_alpha_1', 'proj_alpha', 'ver_alpha_1', 'asset_alpha_1')`,
    );

    const rows = await db
      .select()
      .from(contentPackageVersionMediaAssets)
      .where(eq(contentPackageVersionMediaAssets.id, "link_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "link_alpha_1",
      projectId: "proj_alpha",
      contentPackageVersionId: "ver_alpha_1",
      mediaAssetId: "asset_alpha_1",
    });
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("rejects a link whose MediaAsset belongs to another Project", async () => {
    // asset_beta lives beneath proj_beta while the link names proj_alpha as its
    // own project and links a proj_alpha version. The composite FK
    // (project_id, media_asset_id) -> media_assets(project_id, id) has no
    // matching parent row under proj_alpha.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedMediaAsset("asset_alpha", "proj_alpha");
    await seedTopic("topic_beta", "proj_beta");
    await seedPackage("package_beta", "proj_beta", "topic_beta");
    await seedVersion("ver_beta_1", "proj_beta", "package_beta", 1);
    await seedMediaAsset("asset_beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
         VALUES ('link_cross_asset', 'proj_alpha', 'ver_alpha_1', 'asset_beta')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose ContentPackageVersion belongs to another Project", async () => {
    // ver_alpha_1 lives beneath proj_alpha while the link names proj_beta as its
    // own project (matching asset_beta). The composite FK
    // (project_id, content_package_version_id) -> content_package_versions
    // (project_id, id) has no matching parent row in the reverse direction.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedTopic("topic_beta", "proj_beta");
    await seedPackage("package_beta", "proj_beta", "topic_beta");
    await seedVersion("ver_beta_1", "proj_beta", "package_beta", 1);
    await seedMediaAsset("asset_beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
         VALUES ('link_cross_version', 'proj_beta', 'ver_alpha_1', 'asset_beta')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose ContentPackageVersion does not exist (dangling version)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedMediaAsset("asset_alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_version', 'proj_alpha', 'ver_missing', 'asset_alpha')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose MediaAsset does not exist (dangling media asset)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedMediaAsset("asset_alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_asset', 'proj_alpha', 'ver_alpha_1', 'asset_missing')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose Project does not exist (dangling Project)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedMediaAsset("asset_alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_project', 'proj_missing', 'ver_alpha_1', 'asset_alpha')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a duplicate (content_package_version_id, media_asset_id) pair", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedMediaAsset("asset_alpha", "proj_alpha");
    await client.execute(
      `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
       VALUES ('link_dup_1', 'proj_alpha', 'ver_alpha_1', 'asset_alpha')`,
    );

    // The link-identity unique index rejects a second edge between the same
    // version and media asset.
    await expect(
      client.execute(
        `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
         VALUES ('link_dup_2', 'proj_alpha', 'ver_alpha_1', 'asset_alpha')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("requires the direct link columns (NOT NULL)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedMediaAsset("asset_alpha", "proj_alpha");

    // id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
         VALUES (NULL, 'proj_alpha', 'ver_alpha_1', 'asset_alpha')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // project_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
         VALUES ('link_no_project', NULL, 'ver_alpha_1', 'asset_alpha')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // content_package_version_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
         VALUES ('link_no_version', 'proj_alpha', NULL, 'asset_alpha')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // media_asset_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
         VALUES ('link_no_asset', 'proj_alpha', 'ver_alpha_1', NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("cascades links away when their content package version is deleted", async () => {
    await seedTopic("topic_delete", "proj_alpha");
    await seedPackage("package_delete", "proj_alpha", "topic_delete");
    await seedVersion("ver_delete", "proj_alpha", "package_delete", 1);
    await seedMediaAsset("asset_delete", "proj_alpha");
    await client.execute(
      `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
       VALUES ('link_delete_version', 'proj_alpha', 'ver_delete', 'asset_delete')`,
    );

    await client.execute(
      "DELETE FROM content_package_versions WHERE id = 'ver_delete'",
    );

    const rows = await db
      .select()
      .from(contentPackageVersionMediaAssets)
      .where(eq(contentPackageVersionMediaAssets.id, "link_delete_version"));
    expect(rows).toHaveLength(0);
  });

  it("cascades links away when their media asset is deleted", async () => {
    await seedTopic("topic_delete", "proj_alpha");
    await seedPackage("package_delete", "proj_alpha", "topic_delete");
    await seedVersion("ver_delete", "proj_alpha", "package_delete", 1);
    await seedMediaAsset("asset_delete", "proj_alpha");
    await client.execute(
      `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
       VALUES ('link_delete_asset', 'proj_alpha', 'ver_delete', 'asset_delete')`,
    );

    await client.execute("DELETE FROM media_assets WHERE id = 'asset_delete'");

    const rows = await db
      .select()
      .from(contentPackageVersionMediaAssets)
      .where(eq(contentPackageVersionMediaAssets.id, "link_delete_asset"));
    expect(rows).toHaveLength(0);
  });

  it("cascades links, versions, media assets, packages and topics away when their whole Project is deleted", async () => {
    await seedTopic("topic_proj_delete", "proj_delete");
    await seedPackage(
      "package_proj_delete",
      "proj_delete",
      "topic_proj_delete",
    );
    await seedVersion(
      "ver_proj_delete",
      "proj_delete",
      "package_proj_delete",
      1,
    );
    await seedMediaAsset("asset_proj_delete", "proj_delete");
    await client.execute(
      `INSERT INTO content_package_version_media_assets ${LINK_COLUMN_INSERT}
       VALUES ('link_proj_delete', 'proj_delete', 'ver_proj_delete', 'asset_proj_delete')`,
    );

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const links = await db
      .select()
      .from(contentPackageVersionMediaAssets)
      .where(eq(contentPackageVersionMediaAssets.projectId, "proj_delete"));
    expect(links).toHaveLength(0);
    const versions = await db
      .select()
      .from(contentPackageVersions)
      .where(eq(contentPackageVersions.projectId, "proj_delete"));
    expect(versions).toHaveLength(0);
    const deletedAssets = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.projectId, "proj_delete"));
    expect(deletedAssets).toHaveLength(0);
    const packages = await db
      .select()
      .from(contentPackages)
      .where(eq(contentPackages.projectId, "proj_delete"));
    expect(packages).toHaveLength(0);
    const topics = await db
      .select()
      .from(searchTopics)
      .where(eq(searchTopics.id, "topic_proj_delete"));
    expect(topics).toHaveLength(0);
  });

  it("ships ONLY the normalized relation field set", async () => {
    // The exact TASK field list (id, project_id, content_package_version_id,
    // media_asset_id) plus the append-only created_at. No updated_at, no asset
    // rights/classification/transformation/publishing payload, and no JSON
    // id-array column: the asset_ids[] conceptual array is this normalized
    // relation (TASK item 3).
    expect(await columnNames("content_package_version_media_assets")).toEqual([
      "content_package_version_id",
      "created_at",
      "id",
      "media_asset_id",
      "project_id",
    ]);
  });
});
