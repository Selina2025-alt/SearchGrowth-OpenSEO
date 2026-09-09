/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole content_package_versions storage contract (valid same-Project persistence/nullable WebPageSpec/cross-Project rejection in both directions/dangling parent rejection/duplicate version rejection/NOT NULL required-field rejection/classification + gate_status enum rejection/content-package + whole-Project delete cascades/immutable normalized shape) through the shipped 0063 DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  contentPackageVersions,
  contentPackages,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped, immutable content-version table and its parents: market
// profile 0045, topic 0046, prompt 0049 (which creates the
// `search_market_profiles_project_id_id_idx` composite-FK target the accepted
// opportunity table requires), opportunity 0055, content package 0062, then
// 0063 (which creates content_package_versions and adds the
// `content_packages_project_id_id_idx` supporting unique target the same-Project
// composite FK requires). The spec creates the `projects` table directly and
// applies the DDL in order. Foreign keys are ON so the Project FK, the
// same-Project composite ContentPackage FK, the version identity, the delete
// cascades and the enum CHECKs are exercised against the shipped DDL — not an
// application convention.
//
// Invariants under test:
//   - A valid same-Project content version persists with the full TASK field set
//     (id, project_id, content_package_id, version_no, canonical_markdown,
//     canonical_metadata_json, optional web_page_spec_json, content_hash,
//     gate_status, classification) plus the append-only created_at timestamp.
//   - A version whose ContentPackage belongs to another Project — in EITHER
//     direction — is rejected by the composite FK; a version whose ContentPackage
//     or Project is missing is rejected.
//   - A duplicate (content_package_id, version_no) pair is rejected.
//   - Deleting a content package or a whole Project cascades its versions away,
//     so an immutable version can never dangle.
//   - The immutable row ships ONLY the direct/reconciled field set (no updated_at,
//     no mutable workflow/release/publishing column, no brief/claim/source/asset
//     mapping/gate-report JSON column) and the two direct enum unions
//     (gate_status, classification) are DB-rejected when invalid.

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
  "drizzle/0062_calm_nightcrawler.sql",
  "drizzle/0063_sudden_lyja.sql",
];

// Canonical-content fixtures. The metadata/WebPageSpec payloads are opaque
// structured document JSON in this slice: the tests assert verbatim storage and
// NULL handling, not the document semantics (no relational Claim/SourceRef/
// MediaAsset mapping is encoded in either payload).
const CANONICAL_METADATA = JSON.stringify({
  intent: "commercial",
  briefTitle: "RFQ portals explained",
  targetAudience: "procurement",
});
const WEB_PAGE_SPEC = JSON.stringify({
  slug: "/rfq-portals-2026",
  metaTitle: "RFQ Portals in 2026",
  metaDescription: "How procurement teams use RFQ portals.",
  h1: "RFQ portals in 2026",
  canonicalPolicy: "SELF",
  robots: "INDEX_FOLLOW",
  cta: {
    label: "Get the guide",
    url: "/rfq-guide",
    conversionGoal: "GUIDE_DOWNLOAD",
  },
});

const VERSION_COLUMN_INSERT = `(id, project_id, content_package_id, version_no,
  canonical_markdown, canonical_metadata_json, content_hash, gate_status,
  classification)`;
const VERSION_COLUMN_INSERT_WITH_WEB_PAGE_SPEC = `(id, project_id,
  content_package_id, version_no, canonical_markdown, canonical_metadata_json,
  web_page_spec_json, content_hash, gate_status, classification)`;

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
  // packages cascades their content-package versions away (0063 ON DELETE
  // CASCADE).
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

describe("content_package_versions storage contract", () => {
  it("persists a valid same-Project content version with the full field set", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    // The full TASK field set: required content_package_id + version_no,
    // canonical markdown/metadata documents, opaque content_hash, the direct
    // gate_status/classification unions and the append-only created_at (web
    // page spec omitted so the DB NULL default applies).
    await client.execute(
      `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
       VALUES ('ver_alpha_1', 'proj_alpha', 'package_alpha', 1,
               '# How RFQ portals work in 2026', '${CANONICAL_METADATA}',
               'sha256-abc-1', 'DRAFT', 'INTERNAL')`,
    );

    const rows = await db
      .select()
      .from(contentPackageVersions)
      .where(eq(contentPackageVersions.id, "ver_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "ver_alpha_1",
      projectId: "proj_alpha",
      contentPackageId: "package_alpha",
      versionNo: 1,
      canonicalMarkdown: "# How RFQ portals work in 2026",
      canonicalMetadataJson: CANONICAL_METADATA,
      webPageSpecJson: null,
      contentHash: "sha256-abc-1",
      gateStatus: "DRAFT",
      classification: "INTERNAL",
    });
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("round-trips a NULL web_page_spec_json when omitted (nullable WebPageSpec)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    // Raw insert omits web_page_spec_json so the DB NULL default applies: a
    // content version may legitimately not carry a page spec yet.
    await client.execute(
      `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
       VALUES ('ver_no_spec', 'proj_alpha', 'package_alpha', 1,
               '# No page spec yet', '${CANONICAL_METADATA}',
               'sha256-no-spec', 'DRAFT', 'INTERNAL')`,
    );

    const rows = await db
      .select()
      .from(contentPackageVersions)
      .where(eq(contentPackageVersions.id, "ver_no_spec"));
    expect(rows).toHaveLength(1);
    expect(rows[0].webPageSpecJson).toBeNull();
  });

  it("stores web_page_spec_json verbatim when present", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    // web_page_spec_json is an opaque structured document payload stored
    // verbatim — no interpretation or relational extraction happens here.
    await client.execute(
      `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT_WITH_WEB_PAGE_SPEC}
       VALUES ('ver_with_spec', 'proj_alpha', 'package_alpha', 1,
               '# RFQ portals in 2026', '${CANONICAL_METADATA}',
               '${WEB_PAGE_SPEC}', 'sha256-with-spec', 'DRAFT', 'INTERNAL')`,
    );

    const rows = await db
      .select()
      .from(contentPackageVersions)
      .where(eq(contentPackageVersions.id, "ver_with_spec"));
    expect(rows).toHaveLength(1);
    expect(rows[0].webPageSpecJson).toBe(WEB_PAGE_SPEC);
  });

  it("rejects a version whose ContentPackage belongs to another Project", async () => {
    // package_beta lives beneath proj_beta while the version names proj_alpha as
    // its own project. The composite FK (project_id, content_package_id) ->
    // content_packages(project_id, id) has no matching parent row under
    // proj_alpha.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedTopic("topic_beta", "proj_beta");
    await seedPackage("package_beta", "proj_beta", "topic_beta");

    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_cross_package', 'proj_alpha', 'package_beta', 1,
                 '# Cross-project package', '${CANONICAL_METADATA}',
                 'sha256-cross-1', 'DRAFT', 'INTERNAL')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a version whose own Project does not match its ContentPackage's Project", async () => {
    // package_alpha lives on proj_alpha; the version's own project_id is
    // proj_beta, so the composite FK (project_id, content_package_id) ->
    // content_packages(project_id, id) has no matching parent row in the reverse
    // direction.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await seedTopic("topic_beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_wrong_project', 'proj_beta', 'package_alpha', 1,
                 '# Wrong-project package', '${CANONICAL_METADATA}',
                 'sha256-cross-2', 'DRAFT', 'INTERNAL')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a version whose ContentPackage does not exist (dangling package)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_dangling_package', 'proj_alpha', 'package_missing', 1,
                 '# Dangling package', '${CANONICAL_METADATA}',
                 'sha256-dangling-pkg', 'DRAFT', 'INTERNAL')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a version whose Project does not exist (dangling Project)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_dangling_project', 'proj_missing', 'package_alpha', 1,
                 '# Dangling project', '${CANONICAL_METADATA}',
                 'sha256-dangling-proj', 'DRAFT', 'INTERNAL')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a duplicate (content_package_id, version_no) pair", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    await client.execute(
      `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
       VALUES ('ver_dup_1', 'proj_alpha', 'package_alpha', 1,
               '# Version one', '${CANONICAL_METADATA}',
               'sha256-dup-1', 'DRAFT', 'INTERNAL')`,
    );

    // The version identity unique index rejects a second version_no=1 under the
    // same content package.
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_dup_2', 'proj_alpha', 'package_alpha', 1,
                 '# Version one again', '${CANONICAL_METADATA}',
                 'sha256-dup-2', 'DRAFT', 'INTERNAL')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("requires the direct content-version columns (NOT NULL)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");

    // id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES (NULL, 'proj_alpha', 'package_alpha', 1,
                 '# No id', '${CANONICAL_METADATA}', 'sha256-no-id', 'DRAFT',
                 'INTERNAL')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // project_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_no_project', NULL, 'package_alpha', 1,
                 '# No project', '${CANONICAL_METADATA}', 'sha256-no-proj',
                 'DRAFT', 'INTERNAL')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // content_package_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_no_package', 'proj_alpha', NULL, 1,
                 '# No package', '${CANONICAL_METADATA}', 'sha256-no-pkg',
                 'DRAFT', 'INTERNAL')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // version_no has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_no_version', 'proj_alpha', 'package_alpha', NULL,
                 '# No version', '${CANONICAL_METADATA}', 'sha256-no-ver',
                 'DRAFT', 'INTERNAL')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // canonical_markdown has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_no_markdown', 'proj_alpha', 'package_alpha', 1, NULL,
                 '${CANONICAL_METADATA}', 'sha256-no-md', 'DRAFT', 'INTERNAL')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // canonical_metadata_json has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_no_metadata', 'proj_alpha', 'package_alpha', 1,
                 '# No metadata', NULL, 'sha256-no-metadata', 'DRAFT',
                 'INTERNAL')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // content_hash has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_no_hash', 'proj_alpha', 'package_alpha', 1,
                 '# No hash', '${CANONICAL_METADATA}', NULL, 'DRAFT',
                 'INTERNAL')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // gate_status has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_no_gate', 'proj_alpha', 'package_alpha', 1,
                 '# No gate', '${CANONICAL_METADATA}', 'sha256-no-gate', NULL,
                 'INTERNAL')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // classification has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
         VALUES ('ver_no_classification', 'proj_alpha', 'package_alpha', 1,
                 '# No classification', '${CANONICAL_METADATA}',
                 'sha256-no-class', 'DRAFT', NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("rejects unsupported and case-mismatched gate_status values (CHECK)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
    for (const [index, gateStatus] of [
      // Case-mismatched variants of the approved uppercase values.
      "draft",
      "Blocked",
      "PASSED ",
      // Unsupported gate statuses (not the core DRAFT | BLOCKED | PASSED union).
      "APPROVED",
      "PUBLISHED",
      "NONE",
    ].entries()) {
      await expect(
        client.execute(
          `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
           VALUES ('ver_bad_gate_${index}', 'proj_alpha', 'package_alpha', 1,
                   '# Bad gate', '${CANONICAL_METADATA}', 'sha256-bad-gate',
                   '${gateStatus}', 'INTERNAL')`,
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("rejects unsupported and case-mismatched classification values (CHECK)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPackage("package_alpha", "proj_alpha", "topic_alpha");
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
          `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
           VALUES ('ver_bad_class_${index}', 'proj_alpha', 'package_alpha', 1,
                   '# Bad classification', '${CANONICAL_METADATA}',
                   'sha256-bad-class', 'DRAFT', '${classification}')`,
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("cascades versions away when their content package is deleted", async () => {
    await seedTopic("topic_delete", "proj_alpha");
    await seedPackage("package_delete", "proj_alpha", "topic_delete");
    await client.execute(
      `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
       VALUES ('ver_delete_package', 'proj_alpha', 'package_delete', 1,
               '# Package delete', '${CANONICAL_METADATA}',
               'sha256-delete-pkg', 'DRAFT', 'INTERNAL')`,
    );

    await client.execute(
      "DELETE FROM content_packages WHERE id = 'package_delete'",
    );

    const rows = await db
      .select()
      .from(contentPackageVersions)
      .where(eq(contentPackageVersions.id, "ver_delete_package"));
    expect(rows).toHaveLength(0);
  });

  it("cascades versions, packages and topics away when their whole Project is deleted", async () => {
    await seedTopic("topic_proj_delete", "proj_delete");
    await seedPackage(
      "package_proj_delete",
      "proj_delete",
      "topic_proj_delete",
    );
    await client.execute(
      `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
       VALUES ('ver_delete_project', 'proj_delete', 'package_proj_delete', 1,
               '# Project delete', '${CANONICAL_METADATA}',
               'sha256-delete-proj', 'DRAFT', 'INTERNAL')`,
    );

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

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

  it("ships ONLY the normalized immutable content-version field set", async () => {
    // The exact TASK field list (id, project_id, content_package_id,
    // version_no, canonical_markdown, canonical_metadata_json,
    // web_page_spec_json, content_hash, gate_status, classification) plus the
    // append-only created_at. No updated_at, no mutable
    // workflow/release/approval/publishing column, and no
    // brief/claim_ids/source_ref_ids/asset_ids/gate_report/created_by JSON
    // column: Claim/SourceRef/MediaAsset mappings are separate tasks.
    expect(await columnNames("content_package_versions")).toEqual([
      "canonical_markdown",
      "canonical_metadata_json",
      "classification",
      "content_hash",
      "content_package_id",
      "created_at",
      "gate_status",
      "id",
      "project_id",
      "version_no",
      "web_page_spec_json",
    ]);
  });
});
