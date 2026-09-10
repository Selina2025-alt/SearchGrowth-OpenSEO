/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole content_package_version_claims storage contract (valid same-Project persistence/cross-Project rejection in both directions/dangling parent rejection/duplicate edge rejection/NOT NULL required-field rejection/content-package-version + claim + whole-Project delete cascades/normalized relation shape) through the shipped 0064 DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claims,
  contentPackageVersionClaims,
  contentPackageVersions,
  contentPackages,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped ContentPackageVersion <-> Claim relation table and its parents:
// market profile 0045, topic 0046, prompt 0049 (composite-FK target the accepted
// opportunity table requires), opportunity 0055, source_ref 0056, claim 0057
// (creates claims + the accepted `claims_project_id_id_idx` composite-FK target
// this relation reuses), content package 0062, content package version 0063,
// then 0064 (which creates content_package_version_claims and adds the
// `content_package_versions_project_id_id_idx` supporting unique target the
// same-Project composite FK requires). The spec creates the `projects` table
// directly and applies the DDL in order. Foreign keys are ON so the Project FK,
// the two same-Project composite FKs (version and claim), the duplicate-edge
// unique index and the delete cascades are exercised against the shipped DDL —
// not an application convention.
//
// Invariants under test:
//   - A valid same-Project ContentPackageVersion/Claim link persists with the
//     full TASK field set (id, project_id, content_package_version_id, claim_id)
//     plus the append-only created_at timestamp.
//   - A link whose Claim or ContentPackageVersion belongs to another Project — in
//     EITHER direction — is rejected by the composite FK; a link whose version,
//     claim, or Project is missing is rejected.
//   - A duplicate (content_package_version_id, claim_id) pair is rejected.
//   - Deleting a content package version, a claim, or a whole Project cascades
//     its links away, so an edge can never dangle.
//   - The relation ships ONLY the normalized link field set (no updated_at, no
//     mutable evidence/verification payload, no JSON id array column).

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
];

// Canonical opaque version metadata fixture (stored verbatim; the link stores no
// evidence payload — claim verification state lives on the claim row).
const CANONICAL_METADATA = JSON.stringify({
  intent: "commercial",
  briefTitle: "RFQ portals explained",
  targetAudience: "procurement",
});

const LINK_COLUMN_INSERT = `(id, project_id, content_package_version_id, claim_id)`;
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
  // Child-first teardown: content_package_version_claims references both
  // content_package_versions and claims; content_package_versions references
  // content_packages; content_packages references search_topics.
  await db.delete(contentPackageVersionClaims);
  await db.delete(claims);
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

async function seedClaim(id: string, projectId: string) {
  await client.execute(
    `INSERT INTO claims (id, project_id, claim_text, status, classification)
     VALUES ('${id}', '${projectId}', 'Claim ${id}', 'APPROVED', 'INTERNAL')`,
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

describe("content_package_version_claims storage contract", () => {
  it("persists a valid same-Project version/claim link with the full field set", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedClaim("claim_alpha_1", "proj_alpha");
    // The full TASK field set: required content_package_version_id + claim_id
    // under the link's own project_id, plus the append-only created_at.
    await client.execute(
      `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
       VALUES ('link_alpha_1', 'proj_alpha', 'ver_alpha_1', 'claim_alpha_1')`,
    );

    const rows = await db
      .select()
      .from(contentPackageVersionClaims)
      .where(eq(contentPackageVersionClaims.id, "link_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "link_alpha_1",
      projectId: "proj_alpha",
      contentPackageVersionId: "ver_alpha_1",
      claimId: "claim_alpha_1",
    });
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("rejects a link whose Claim belongs to another Project", async () => {
    // claim_beta lives beneath proj_beta while the link names proj_alpha as its
    // own project and links a proj_alpha version. The composite FK
    // (project_id, claim_id) -> claims(project_id, id) has no matching parent
    // row under proj_alpha.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedClaim("claim_alpha", "proj_alpha");
    await seedTopic("topic_beta", "proj_beta");
    await seedPackage("package_beta", "proj_beta", "topic_beta");
    await seedVersion("ver_beta_1", "proj_beta", "package_beta", 1);
    await seedClaim("claim_beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
         VALUES ('link_cross_claim', 'proj_alpha', 'ver_alpha_1', 'claim_beta')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose ContentPackageVersion belongs to another Project", async () => {
    // ver_alpha_1 lives beneath proj_alpha while the link names proj_beta as its
    // own project (matching claim_beta). The composite FK
    // (project_id, content_package_version_id) -> content_package_versions
    // (project_id, id) has no matching parent row in the reverse direction.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedTopic("topic_beta", "proj_beta");
    await seedPackage("package_beta", "proj_beta", "topic_beta");
    await seedVersion("ver_beta_1", "proj_beta", "package_beta", 1);
    await seedClaim("claim_beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
         VALUES ('link_cross_version', 'proj_beta', 'ver_alpha_1', 'claim_beta')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose ContentPackageVersion does not exist (dangling version)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedClaim("claim_alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_version', 'proj_alpha', 'ver_missing', 'claim_alpha')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose Claim does not exist (dangling claim)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedClaim("claim_alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_claim', 'proj_alpha', 'ver_alpha_1', 'claim_missing')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose Project does not exist (dangling Project)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedClaim("claim_alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_project', 'proj_missing', 'ver_alpha_1', 'claim_alpha')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a duplicate (content_package_version_id, claim_id) pair", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedClaim("claim_alpha", "proj_alpha");
    await client.execute(
      `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
       VALUES ('link_dup_1', 'proj_alpha', 'ver_alpha_1', 'claim_alpha')`,
    );

    // The link-identity unique index rejects a second edge between the same
    // version and claim.
    await expect(
      client.execute(
        `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
         VALUES ('link_dup_2', 'proj_alpha', 'ver_alpha_1', 'claim_alpha')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("requires the direct link columns (NOT NULL)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedVersion("ver_alpha_1", "proj_alpha", "package_alpha", 1);
    await seedClaim("claim_alpha", "proj_alpha");

    // id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
         VALUES (NULL, 'proj_alpha', 'ver_alpha_1', 'claim_alpha')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // project_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
         VALUES ('link_no_project', NULL, 'ver_alpha_1', 'claim_alpha')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // content_package_version_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
         VALUES ('link_no_version', 'proj_alpha', NULL, 'claim_alpha')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // claim_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
         VALUES ('link_no_claim', 'proj_alpha', 'ver_alpha_1', NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("cascades links away when their content package version is deleted", async () => {
    await seedTopic("topic_delete", "proj_alpha");
    await seedPackage("package_delete", "proj_alpha", "topic_delete");
    await seedVersion("ver_delete", "proj_alpha", "package_delete", 1);
    await seedClaim("claim_delete", "proj_alpha");
    await client.execute(
      `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
       VALUES ('link_delete_version', 'proj_alpha', 'ver_delete', 'claim_delete')`,
    );

    await client.execute(
      "DELETE FROM content_package_versions WHERE id = 'ver_delete'",
    );

    const rows = await db
      .select()
      .from(contentPackageVersionClaims)
      .where(eq(contentPackageVersionClaims.id, "link_delete_version"));
    expect(rows).toHaveLength(0);
  });

  it("cascades links away when their claim is deleted", async () => {
    await seedTopic("topic_delete", "proj_alpha");
    await seedPackage("package_delete", "proj_alpha", "topic_delete");
    await seedVersion("ver_delete", "proj_alpha", "package_delete", 1);
    await seedClaim("claim_delete", "proj_alpha");
    await client.execute(
      `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
       VALUES ('link_delete_claim', 'proj_alpha', 'ver_delete', 'claim_delete')`,
    );

    await client.execute("DELETE FROM claims WHERE id = 'claim_delete'");

    const rows = await db
      .select()
      .from(contentPackageVersionClaims)
      .where(eq(contentPackageVersionClaims.id, "link_delete_claim"));
    expect(rows).toHaveLength(0);
  });

  it("cascades links, versions, claims, packages and topics away when their whole Project is deleted", async () => {
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
    await seedClaim("claim_proj_delete", "proj_delete");
    await client.execute(
      `INSERT INTO content_package_version_claims ${LINK_COLUMN_INSERT}
       VALUES ('link_proj_delete', 'proj_delete', 'ver_proj_delete', 'claim_proj_delete')`,
    );

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const links = await db
      .select()
      .from(contentPackageVersionClaims)
      .where(eq(contentPackageVersionClaims.projectId, "proj_delete"));
    expect(links).toHaveLength(0);
    const versions = await db
      .select()
      .from(contentPackageVersions)
      .where(eq(contentPackageVersions.projectId, "proj_delete"));
    expect(versions).toHaveLength(0);
    const deletedClaims = await db
      .select()
      .from(claims)
      .where(eq(claims.projectId, "proj_delete"));
    expect(deletedClaims).toHaveLength(0);
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
    // claim_id) plus the append-only created_at. No updated_at, no mutable
    // evidence/verification/report payload, and no JSON id-array column: the
    // claim_ids[] conceptual array is this normalized relation (TASK item 3).
    expect(await columnNames("content_package_version_claims")).toEqual([
      "claim_id",
      "content_package_version_id",
      "created_at",
      "id",
      "project_id",
    ]);
  });
});
