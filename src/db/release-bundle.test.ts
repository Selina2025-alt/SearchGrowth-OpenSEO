/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole release_bundles storage contract (valid same-Project persistence with the full field set/optional approval + dry-run fields/all lifecycle and strategy enum values/cross-Project rejection in both directions/dangling version + Project rejection/invalid enum rejection/duplicate release-identity rejection via the shipped 0069 DDL); splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  contentPackages,
  contentPackageVersions,
  releaseBundles,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped ReleaseBundle table and its parents: market profile 0045, topic
// 0046, prompt 0049 (composite-FK target the accepted opportunity table
// requires), opportunity 0055, source_ref 0056, claim 0057 (0064's
// content_package_version_claims FK requires the claims table), content package
// 0062, content package version 0063, content package version claim 0064 (creates
// the reused `content_package_versions_project_id_id_idx` composite-FK target the
// bundle FK requires), then 0069 (the release_bundles table itself). The spec
// creates the `projects` table directly and applies the DDL in order. Foreign keys
// are ON so the Project FK, the same-Project composite FK to ContentVersion, the
// two enum CHECKs, the release-identity unique index and the delete cascades are
// exercised against the shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project ReleaseBundle persists with the full TASK field set
//     (stable id, project_id, content_package_version_id, release_version, status,
//     release_strategy, opaque utm_policy_json, bundle_hash) plus the append-only
//     created_at timestamp; the nullable dry-run report and approval fields are
//     NULL by default and persist verbatim when set.
//   - Both source-defined enums are accepted in full and rejected outside the
//     union (status 9 values; release strategy 3 values).
//   - A bundle whose ContentVersion belongs to another Project — in EITHER
//     direction — is rejected by the composite FK; a bundle whose ContentVersion
//     or Project is missing is rejected.
//   - A duplicate (content_package_version_id, release_version) release identity
//     is rejected, while R1/R2 ... for the same ContentVersion are legal.
//   - Deleting a ContentVersion or a whole Project cascades its bundles away, so a
//     bundle can never dangle.
//   - The table ships ONLY the direct field set (no updated_at, no target/
//     execution/job/receipt/account/publishing column).

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
  "drizzle/0069_clumsy_legion.sql",
];

// Canonical opaque UTM policy document (frozen with the bundle, stored verbatim;
// no relational model exists for it in this slice).
const UTM_POLICY_JSON = JSON.stringify({
  source: "search_growth",
  medium: "organic_social",
  campaign: "rfq_procurement",
});

const BUNDLE_COLUMN_INSERT = `(id, project_id, content_package_version_id,
  release_version, status, release_strategy, utm_policy_json, bundle_hash)`;
const VERSION_COLUMN_INSERT = `(id, project_id, content_package_id, version_no,
  canonical_markdown, canonical_metadata_json, content_hash, gate_status,
  classification)`;

const ALL_STATUSES = [
  "DRAFT",
  "DRY_RUN_READY",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "EXECUTING",
  "COMPLETED",
  "PARTIAL",
  "PAUSED",
  "CANCELLED",
] as const;
const ALL_STRATEGIES = ["WEBSITE_FIRST", "PARALLEL", "SOCIAL_ONLY"] as const;

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
  // Child-first teardown: release_bundles references content_package_versions;
  // content_package_versions references content_packages; content_packages
  // references search_topics.
  await db.delete(releaseBundles);
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
             '# Version ${id}', '{}', 'sha256-${id}', 'DRAFT', 'INTERNAL')`,
  );
}

// A full content tree (topic -> package -> version) under a project, so the
// bundle's ContentVersion parent exists.
async function seedVersionTree(prefix: string, projectId: string) {
  await seedTopic(`topic_${prefix}`, projectId);
  await seedPackage(`package_${prefix}`, projectId, `topic_${prefix}`);
  await seedVersion(`ver_${prefix}`, projectId, `package_${prefix}`, 1);
}

type BundleSeed = {
  id: string;
  projectId: string;
  versionId: string;
  releaseVersion: number;
  status: string;
  strategy: string;
};

async function insertBundle({
  id,
  projectId,
  versionId,
  releaseVersion,
  status,
  strategy,
}: BundleSeed) {
  await client.execute(
    `INSERT INTO release_bundles ${BUNDLE_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', '${versionId}', ${releaseVersion},
             '${status}', '${strategy}', '${UTM_POLICY_JSON}', 'hash-${id}')`,
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

describe("release_bundles storage contract", () => {
  it("persists a valid same-Project bundle with the full field set and NULL optional fields by default", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    // The full TASK required field set: release identity + lifecycle status +
    // strategy + opaque UTM policy + bundle hash under the bundle's own
    // project_id, plus the append-only created_at.
    await insertBundle({
      id: "bundle_alpha_1",
      projectId: "proj_alpha",
      versionId: "ver_alpha",
      releaseVersion: 1,
      status: "DRAFT",
      strategy: "WEBSITE_FIRST",
    });

    const rows = await db
      .select()
      .from(releaseBundles)
      .where(eq(releaseBundles.id, "bundle_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "bundle_alpha_1",
      projectId: "proj_alpha",
      contentPackageVersionId: "ver_alpha",
      releaseVersion: 1,
      status: "DRAFT",
      releaseStrategy: "WEBSITE_FIRST",
      utmPolicyJson: UTM_POLICY_JSON,
      bundleHash: "hash-bundle_alpha_1",
    });
    // The opaque UTM policy document is stored verbatim, never parsed.
    expect(JSON.parse(rows[0].utmPolicyJson)).toMatchObject({
      campaign: "rfq_procurement",
    });
    // Optional dry-run report + approval fields are NULL until set.
    expect(rows[0].dryRunReportJson).toBeNull();
    expect(rows[0].approvedBy).toBeNull();
    expect(rows[0].approvedAt).toBeNull();
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("persists the optional dry-run report and approval fields verbatim", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    const dryRunReportJson = JSON.stringify({ status: "PASSED", targets: 3 });
    await client.execute(
      `INSERT INTO release_bundles (id, project_id, content_package_version_id,
         release_version, status, release_strategy, utm_policy_json, bundle_hash,
         dry_run_report_json, approved_by, approved_at)
       VALUES ('bundle_approved', 'proj_alpha', 'ver_alpha', 1,
               'APPROVED', 'PARALLEL', '${UTM_POLICY_JSON}', 'hash-approved',
               '${dryRunReportJson}', 'user_1',
               '2026-09-10T05:00:00.000Z')`,
    );

    const rows = await db
      .select()
      .from(releaseBundles)
      .where(eq(releaseBundles.id, "bundle_approved"));
    expect(rows[0]).toMatchObject({
      status: "APPROVED",
      releaseStrategy: "PARALLEL",
      dryRunReportJson,
      approvedBy: "user_1",
      approvedAt: "2026-09-10T05:00:00.000Z",
    });
  });

  it("accepts every source-defined lifecycle status", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    for (const [index, status] of ALL_STATUSES.entries()) {
      await insertBundle({
        id: `bundle_status_${index}`,
        projectId: "proj_alpha",
        versionId: "ver_alpha",
        releaseVersion: index + 1,
        status,
        strategy: "WEBSITE_FIRST",
      });
    }
    const rows = await db
      .select()
      .from(releaseBundles)
      .where(eq(releaseBundles.contentPackageVersionId, "ver_alpha"));
    expect(
      sort(
        rows.map((row) => row.status),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(sort([...ALL_STATUSES], (a, b) => a.localeCompare(b)));
  });

  it("accepts every source-defined release strategy", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    for (const [index, strategy] of ALL_STRATEGIES.entries()) {
      await insertBundle({
        id: `bundle_strategy_${index}`,
        projectId: "proj_alpha",
        versionId: "ver_alpha",
        releaseVersion: index + 1,
        status: "DRAFT",
        strategy,
      });
    }
    const rows = await db
      .select()
      .from(releaseBundles)
      .where(eq(releaseBundles.contentPackageVersionId, "ver_alpha"));
    expect(
      sort(
        rows.map((row) => row.releaseStrategy),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(sort([...ALL_STRATEGIES], (a, b) => a.localeCompare(b)));
  });

  it("rejects a status outside the lifecycle union", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    await expect(
      insertBundle({
        id: "bundle_bad_status",
        projectId: "proj_alpha",
        versionId: "ver_alpha",
        releaseVersion: 1,
        status: "PUBLISHED",
        strategy: "WEBSITE_FIRST",
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("rejects a release strategy outside the source-defined union", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    await expect(
      insertBundle({
        id: "bundle_bad_strategy",
        projectId: "proj_alpha",
        versionId: "ver_alpha",
        releaseVersion: 1,
        status: "DRAFT",
        strategy: "WEBSITE_ONLY",
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("rejects a bundle whose ContentVersion belongs to another Project", async () => {
    // ver_alpha lives beneath proj_alpha while the bundle names proj_beta as its
    // own project. The composite FK
    // (project_id, content_package_version_id) ->
    // content_package_versions(project_id, id) has no matching parent row.
    await seedVersionTree("alpha", "proj_alpha");
    await expect(
      insertBundle({
        id: "bundle_cross_version",
        projectId: "proj_beta",
        versionId: "ver_alpha",
        releaseVersion: 1,
        status: "DRAFT",
        strategy: "WEBSITE_FIRST",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a bundle whose ContentVersion does not exist (dangling version)", async () => {
    await expect(
      insertBundle({
        id: "bundle_dangling_version",
        projectId: "proj_alpha",
        versionId: "ver_missing",
        releaseVersion: 1,
        status: "DRAFT",
        strategy: "WEBSITE_FIRST",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a bundle whose Project does not exist (dangling Project)", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    await expect(
      insertBundle({
        id: "bundle_dangling_project",
        projectId: "proj_missing",
        versionId: "ver_alpha",
        releaseVersion: 1,
        status: "DRAFT",
        strategy: "WEBSITE_FIRST",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("allows multiple release versions for one ContentVersion but rejects a duplicate release identity", async () => {
    await seedVersionTree("alpha", "proj_alpha");
    // R1 and R2 for the same ContentVersion are legal (a change to any frozen
    // item creates a new release version).
    await insertBundle({
      id: "bundle_r1",
      projectId: "proj_alpha",
      versionId: "ver_alpha",
      releaseVersion: 1,
      status: "DRAFT",
      strategy: "WEBSITE_FIRST",
    });
    await insertBundle({
      id: "bundle_r2",
      projectId: "proj_alpha",
      versionId: "ver_alpha",
      releaseVersion: 2,
      status: "DRAFT",
      strategy: "WEBSITE_FIRST",
    });

    // A second row claiming the same (content_package_version_id,
    // release_version) is rejected by the release-identity unique index.
    await expect(
      insertBundle({
        id: "bundle_dup",
        projectId: "proj_alpha",
        versionId: "ver_alpha",
        releaseVersion: 1,
        status: "DRAFT",
        strategy: "WEBSITE_FIRST",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    await seedVersionTree("alpha", "proj_alpha");

    // id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO release_bundles ${BUNDLE_COLUMN_INSERT}
         VALUES (NULL, 'proj_alpha', 'ver_alpha', 1, 'DRAFT', 'WEBSITE_FIRST',
                 '${UTM_POLICY_JSON}', 'hash')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // project_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO release_bundles ${BUNDLE_COLUMN_INSERT}
         VALUES ('bundle_no_project', NULL, 'ver_alpha', 1, 'DRAFT',
                 'WEBSITE_FIRST', '${UTM_POLICY_JSON}', 'hash')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // content_package_version_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO release_bundles ${BUNDLE_COLUMN_INSERT}
         VALUES ('bundle_no_version', 'proj_alpha', NULL, 1, 'DRAFT',
                 'WEBSITE_FIRST', '${UTM_POLICY_JSON}', 'hash')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // release_version has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO release_bundles ${BUNDLE_COLUMN_INSERT}
         VALUES ('bundle_no_release', 'proj_alpha', 'ver_alpha', NULL, 'DRAFT',
                 'WEBSITE_FIRST', '${UTM_POLICY_JSON}', 'hash')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // status has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO release_bundles ${BUNDLE_COLUMN_INSERT}
         VALUES ('bundle_no_status', 'proj_alpha', 'ver_alpha', 1, NULL,
                 'WEBSITE_FIRST', '${UTM_POLICY_JSON}', 'hash')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // release_strategy has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO release_bundles ${BUNDLE_COLUMN_INSERT}
         VALUES ('bundle_no_strategy', 'proj_alpha', 'ver_alpha', 1, 'DRAFT',
                 NULL, '${UTM_POLICY_JSON}', 'hash')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // utm_policy_json has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO release_bundles ${BUNDLE_COLUMN_INSERT}
         VALUES ('bundle_no_utm', 'proj_alpha', 'ver_alpha', 1, 'DRAFT',
                 'WEBSITE_FIRST', NULL, 'hash')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // bundle_hash has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO release_bundles ${BUNDLE_COLUMN_INSERT}
         VALUES ('bundle_no_hash', 'proj_alpha', 'ver_alpha', 1, 'DRAFT',
                 'WEBSITE_FIRST', '${UTM_POLICY_JSON}', NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("cascades bundles away when their ContentVersion is deleted", async () => {
    await seedVersionTree("delete", "proj_alpha");
    await insertBundle({
      id: "bundle_delete_version",
      projectId: "proj_alpha",
      versionId: "ver_delete",
      releaseVersion: 1,
      status: "DRAFT",
      strategy: "WEBSITE_FIRST",
    });

    await client.execute(
      "DELETE FROM content_package_versions WHERE id = 'ver_delete'",
    );

    const rows = await db
      .select()
      .from(releaseBundles)
      .where(eq(releaseBundles.id, "bundle_delete_version"));
    expect(rows).toHaveLength(0);
  });

  it("cascades bundles, versions, packages and topics away when their whole Project is deleted", async () => {
    await seedVersionTree("proj_delete", "proj_delete");
    await insertBundle({
      id: "bundle_proj_delete",
      projectId: "proj_delete",
      versionId: "ver_proj_delete",
      releaseVersion: 1,
      status: "APPROVED",
      strategy: "SOCIAL_ONLY",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const bundles = await db
      .select()
      .from(releaseBundles)
      .where(eq(releaseBundles.projectId, "proj_delete"));
    expect(bundles).toHaveLength(0);
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

  it("ships ONLY the direct field set", async () => {
    // The exact TASK field list (id, project_id, content_package_version_id,
    // release_version, status, release_strategy, utm_policy_json, bundle_hash,
    // optional dry_run_report_json, approval fields) plus the append-only
    // created_at. No updated_at, and no target/execution-plan/job/receipt/
    // connector/account/publishing column.
    expect(await columnNames("release_bundles")).toEqual([
      "approved_at",
      "approved_by",
      "bundle_hash",
      "content_package_version_id",
      "created_at",
      "dry_run_report_json",
      "id",
      "project_id",
      "release_strategy",
      "release_version",
      "status",
      "utm_policy_json",
    ]);
  });
});
