/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole content_variants storage contract (valid same-Project persistence/multiple variants per version/cross-Project rejection in both directions/dangling parent rejection/NOT NULL required-field rejection/version + whole-Project delete cascades/immutable timestamp-only shape) through the shipped 0067 DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  contentPackages,
  contentPackageVersions,
  contentVariants,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped, immutable content-variant table and its parents: market
// profile 0045, topic 0046, prompt 0049 (which creates the
// `search_market_profiles_project_id_id_idx` composite-FK target the accepted
// opportunity table requires), opportunity 0055, source refs 0056 and claims
// 0057 (required because 0064's `content_package_version_claims` FK needs the
// claims table), content package 0062, content version 0063, then 0064 (which
// adds the `content_package_versions_project_id_id_idx` composite-FK target the
// variant same-Project FK reuses) and finally 0067 (which creates
// `content_variants`). The spec creates the `projects` table directly and
// applies the DDL in order. Foreign keys are ON so the Project FK, the
// same-Project composite ContentVersion FK, the delete cascades and the NOT NULL
// rules are exercised against the shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project variant persists with the full TASK field set (id,
//     project_id, content_package_version_id, platform, format, title, body,
//     metadata_json, body_hash, renderer_version) plus the append-only created_at.
//   - `id` is the only identity: several variants may share one
//     content_package_version_id/platform (no business uniqueness rule).
//   - A variant whose ContentVersion belongs to another Project — in EITHER
//     direction — is rejected by the composite FK; a variant whose ContentVersion
//     or Project is missing is rejected.
//   - Deleting a content version or a whole Project cascades its variants away,
//     so an immutable variant can never dangle.
//   - The immutable row ships ONLY the direct field set (no updated_at, no
//     execution/approval/account/public-success column, no JSON asset/reference
//     id container, no variant asset mapping).

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
  "drizzle/0062_calm_nightcrawler.sql",
  "drizzle/0063_sudden_lyja.sql",
  "drizzle/0064_needy_lady_vermin.sql",
  "drizzle/0067_old_silhouette.sql",
];

// Platform-native renderer metadata (09 spec §7) is an opaque document payload
// in this slice: the tests assert verbatim storage, not the document semantics
// (no asset/reference id array is encoded here — TASK item 1).
const METADATA_JSON = JSON.stringify({
  format: "long_post",
  tags: ["rfq", "procurement"],
  externalLinkPolicy: "NOFOLLOW",
  coverImageConstraint: { minWidth: 1200, aspect: "16:9" },
  cta: { label: "Get the guide", url: "/rfq-guide" },
});

const VARIANT_COLUMN_INSERT = `(id, project_id, content_package_version_id,
  platform, format, title, body, metadata_json, body_hash, renderer_version)`;

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
  // Child-first teardown: content packages reference topics; deleting content
  // packages cascades their versions and (0067 ON DELETE CASCADE) the versions'
  // variants away.
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
    `INSERT INTO content_package_versions (id, project_id, content_package_id,
       version_no, canonical_markdown, canonical_metadata_json, content_hash,
       gate_status, classification)
     VALUES ('${id}', '${projectId}', '${packageId}', ${versionNo},
             '# Canonical body', '{}', 'sha256-content', 'DRAFT', 'INTERNAL')`,
  );
}

async function seedVersionTree(prefix: string, projectId: string) {
  await seedTopic(`topic_${prefix}`, projectId);
  await seedPackage(`package_${prefix}`, projectId, `topic_${prefix}`);
  await seedVersion(`ver_${prefix}`, projectId, `package_${prefix}`, 1);
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

describe("content_variants storage contract", () => {
  it("persists a valid same-Project variant with the full field set", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    // The full TASK field set: required content_package_version_id, opaque
    // platform/format, platform-native title/body, opaque renderer metadata,
    // opaque body_hash and renderer_version, plus the append-only created_at.
    await client.execute(
      `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
       VALUES ('variant_alpha_1', 'proj_alpha', 'ver_alpha', 'wechatsync',
               'long_post', 'RFQ 门户如何改变采购协同', '<p>平台原生正文</p>',
               '${METADATA_JSON}', 'sha256-body-1', 'renderer@1.0.0')`,
    );

    const rows = await db
      .select()
      .from(contentVariants)
      .where(eq(contentVariants.id, "variant_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "variant_alpha_1",
      projectId: "proj_alpha",
      contentPackageVersionId: "ver_alpha",
      platform: "wechatsync",
      format: "long_post",
      title: "RFQ 门户如何改变采购协同",
      body: "<p>平台原生正文</p>",
      metadataJson: METADATA_JSON,
      bodyHash: "sha256-body-1",
      rendererVersion: "renderer@1.0.0",
    });
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("allows several variants per ContentVersion (id is the only identity)", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    // No business uniqueness rule exists in this slice (TASK item 2): two
    // variants may render the same version for the same platform/format with
    // distinct ids, so the DB must not reject the second insert.
    await client.execute(
      `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
       VALUES ('variant_alpha_1', 'proj_alpha', 'ver_alpha', 'wechatsync',
               'long_post', 'First', '<p>one</p>', '{}', 'sha256-a', 'r@1')`,
    );
    await client.execute(
      `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
       VALUES ('variant_alpha_2', 'proj_alpha', 'ver_alpha', 'wechatsync',
               'long_post', 'Second', '<p>two</p>', '{}', 'sha256-b', 'r@1')`,
    );

    const rows = await db
      .select()
      .from(contentVariants)
      .where(eq(contentVariants.contentPackageVersionId, "ver_alpha"));
    expect(rows).toHaveLength(2);
  });

  it("rejects a variant whose ContentVersion belongs to another Project", async () => {
    // ver_beta lives beneath proj_beta while the variant names proj_alpha as its
    // own project. The composite FK (project_id, content_package_version_id) ->
    // content_package_versions(project_id, id) has no matching parent row under
    // proj_alpha.
    await seedVersionTree("alpha", "proj_alpha");
    await seedVersionTree("beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_cross', 'proj_alpha', 'ver_beta', 'wechatsync',
                 'long_post', 'Cross', '<p>cross</p>', '{}', 'sha256-cross',
                 'r@1')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a variant whose own Project does not match its ContentVersion's Project", async () => {
    // ver_alpha lives on proj_alpha; the variant's own project_id is proj_beta,
    // so the composite FK has no matching parent row in the reverse direction.
    await seedVersionTree("alpha", "proj_alpha");
    await seedVersionTree("beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_wrong_project', 'proj_beta', 'ver_alpha',
                 'wechatsync', 'long_post', 'Wrong project', '<p>wrong</p>',
                 '{}', 'sha256-wrong', 'r@1')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a variant whose ContentVersion does not exist (dangling version)", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_dangling_version', 'proj_alpha', 'ver_missing',
                 'wechatsync', 'long_post', 'Dangling version',
                 '<p>dangling</p>', '{}', 'sha256-dangling-ver', 'r@1')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a variant whose Project does not exist (dangling Project)", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_dangling_project', 'proj_missing', 'ver_alpha',
                 'wechatsync', 'long_post', 'Dangling project',
                 '<p>dangling</p>', '{}', 'sha256-dangling-proj', 'r@1')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("requires the direct variant columns (NOT NULL)", async () => {
    await seedVersionTree("alpha", "proj_alpha");

    // id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES (NULL, 'proj_alpha', 'ver_alpha', 'wechatsync', 'long_post',
                 'No id', '<p>x</p>', '{}', 'sha256-no-id', 'r@1')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // project_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_no_project', NULL, 'ver_alpha', 'wechatsync',
                 'long_post', 'No project', '<p>x</p>', '{}', 'sha256-no-proj',
                 'r@1')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // content_package_version_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_no_version', 'proj_alpha', NULL, 'wechatsync',
                 'long_post', 'No version', '<p>x</p>', '{}', 'sha256-no-ver',
                 'r@1')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // platform has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_no_platform', 'proj_alpha', 'ver_alpha', NULL,
                 'long_post', 'No platform', '<p>x</p>', '{}',
                 'sha256-no-platform', 'r@1')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // format has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_no_format', 'proj_alpha', 'ver_alpha', 'wechatsync',
                 NULL, 'No format', '<p>x</p>', '{}', 'sha256-no-format',
                 'r@1')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // title has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_no_title', 'proj_alpha', 'ver_alpha', 'wechatsync',
                 'long_post', NULL, '<p>x</p>', '{}', 'sha256-no-title',
                 'r@1')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // body has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_no_body', 'proj_alpha', 'ver_alpha', 'wechatsync',
                 'long_post', 'No body', NULL, '{}', 'sha256-no-body', 'r@1')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // metadata_json has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_no_metadata', 'proj_alpha', 'ver_alpha', 'wechatsync',
                 'long_post', 'No metadata', '<p>x</p>', NULL,
                 'sha256-no-metadata', 'r@1')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // body_hash has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_no_hash', 'proj_alpha', 'ver_alpha', 'wechatsync',
                 'long_post', 'No hash', '<p>x</p>', '{}', NULL, 'r@1')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // renderer_version has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
         VALUES ('variant_no_renderer', 'proj_alpha', 'ver_alpha', 'wechatsync',
                 'long_post', 'No renderer', '<p>x</p>', '{}', 'sha256-no-rend',
                 NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("cascades variants away when their ContentVersion is deleted", async () => {
    await seedVersionTree("delete", "proj_alpha");
    await client.execute(
      `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
       VALUES ('variant_delete_version', 'proj_alpha', 'ver_delete',
               'wechatsync', 'long_post', 'Delete via version', '<p>x</p>',
               '{}', 'sha256-delete-ver', 'r@1')`,
    );

    await client.execute(
      "DELETE FROM content_package_versions WHERE id = 'ver_delete'",
    );

    const rows = await db
      .select()
      .from(contentVariants)
      .where(eq(contentVariants.id, "variant_delete_version"));
    expect(rows).toHaveLength(0);
  });

  it("cascades variants, versions, packages and topics away when their whole Project is deleted", async () => {
    await seedVersionTree("proj_delete", "proj_delete");
    await client.execute(
      `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
       VALUES ('variant_delete_project', 'proj_delete', 'ver_proj_delete',
               'wechatsync', 'long_post', 'Delete via project', '<p>x</p>',
               '{}', 'sha256-delete-proj', 'r@1')`,
    );

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const variants = await db
      .select()
      .from(contentVariants)
      .where(eq(contentVariants.projectId, "proj_delete"));
    expect(variants).toHaveLength(0);
    const versions = await db
      .select()
      .from(contentPackageVersions)
      .where(eq(contentPackageVersions.projectId, "proj_delete"));
    expect(versions).toHaveLength(0);
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

  it("ships ONLY the normalized immutable content-variant field set", async () => {
    // The exact TASK field list (id, project_id, content_package_version_id,
    // platform, format, title, body, metadata_json, body_hash, renderer_version)
    // plus the append-only created_at. No updated_at, no mutable
    // version-overwrite/execution/approval/account/publishing/public-success
    // column, and no asset_refs_json/asset/reference id container.
    expect(await columnNames("content_variants")).toEqual([
      "body",
      "body_hash",
      "content_package_version_id",
      "created_at",
      "format",
      "id",
      "metadata_json",
      "platform",
      "project_id",
      "renderer_version",
      "title",
    ]);
  });
});
