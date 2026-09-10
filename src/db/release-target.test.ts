/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole release_targets storage contract (valid same-Project persistence with the full field set/optional schedule + dependency + UTM and required default/four target intents/cross-Project rejection for bundle and variant in both directions/dangling parents/optional same-Project dependency + restrictive delete/three delete cascades/NOT NULL and exact column shape via the shipped 0070 DDL plus the added release_bundles supporting index); splitting would scatter the invariants asserted together */
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
  releaseBundles,
  releaseTargets,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped ReleaseTarget table and its parents: market profile 0045, topic
// 0046, prompt 0049 (composite-FK target the accepted opportunity table
// requires), opportunity 0055, source_ref 0056, claim 0057 (0064's
// content_package_version_claims FK requires the claims table), media asset 0060
// plus 0061 (which creates the `media_assets_project_id_id_idx` unique target
// that 0068's content_variant_media_assets FK requires), content package
// 0062, content package version 0063, content package version claim 0064 (creates
// the reused `content_package_versions_project_id_id_idx` composite-FK target the
// bundle FK requires), content variants 0067, content variant media assets 0068
// (creates the reused `content_variants_project_id_id_idx` composite-FK target the
// target FK requires), release bundles 0069, then 0070 (the release_targets table
// itself plus the new `release_bundles_project_id_id_idx` parent target). The
// spec creates the `projects` table directly and applies the DDL in order.
// Foreign keys are ON so the Project FK, the same-Project composite FKs to the
// bundle and variant, the dependency self-FK, the target-intent CHECK, the
// restrictive dependency delete and the delete cascades are exercised against the
// shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project ReleaseTarget persists with the full TASK field set
//     (stable id, project_id, release_bundle_id, content_variant_id, platform,
//     target_intent, required, optional scheduled_at/dependency_target_id/
//     utm_url, target_hash) plus the append-only created_at timestamp; `required`
//     defaults true and the optional fields default NULL.
//   - The source-defined target intent enum is accepted in full and rejected
//     outside the union.
//   - A target whose ReleaseBundle or ContentVariant belongs to another Project —
//     in EITHER direction — is rejected by the composite FK; a target whose
//     parent is missing is rejected.
//   - The optional dependency is a same-Project self-reference: a cross-Project
//     dependency is rejected, deleting a depended-on target is blocked (no
//     action), and a whole-project delete still cascades.
//   - Deleting its ReleaseBundle, its ContentVariant or its whole Project
//     cascades targets away, so a target can never dangle.
//   - The table ships ONLY the direct field set (no publisher_connection_id,
//     no updated_at, no account/execution/receipt/publishing column).

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
  "drizzle/0067_old_silhouette.sql",
  "drizzle/0068_steep_pandemic.sql",
  "drizzle/0069_clumsy_legion.sql",
  "drizzle/0070_youthful_bill_hollister.sql",
];

const VERSION_COLUMN_INSERT = `(id, project_id, content_package_id, version_no,
  canonical_markdown, canonical_metadata_json, content_hash, gate_status,
  classification)`;
const VARIANT_COLUMN_INSERT = `(id, project_id, content_package_version_id,
  platform, format, title, body, metadata_json, body_hash, renderer_version)`;
const BUNDLE_COLUMN_INSERT = `(id, project_id, content_package_version_id,
  release_version, status, release_strategy, utm_policy_json, bundle_hash)`;
const TARGET_COLUMN_INSERT = `(id, project_id, release_bundle_id,
  content_variant_id, platform, target_intent, required, target_hash)`;

const ALL_INTENTS = [
  "DRAFT",
  "PUBLIC",
  "SUBMIT_FOR_REVIEW",
  "PAID_SUBMIT",
] as const;

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
  // Child-first teardown: release_targets references release_bundles and
  // content_variants; both reference content_package_versions; that references
  // content_packages; that references search_topics.
  await db.delete(releaseTargets);
  await db.delete(releaseBundles);
  await db.delete(contentVariants);
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

async function seedVariant(id: string, projectId: string, versionId: string) {
  await client.execute(
    `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', '${versionId}', 'zhihu', 'article',
             'Title ${id}', '<p>${id}</p>', '{}', 'sha256-${id}', 'renderer-v1')`,
  );
}

async function seedBundle(id: string, projectId: string, versionId: string) {
  await client.execute(
    `INSERT INTO release_bundles ${BUNDLE_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', '${versionId}', 1, 'APPROVED',
             'WEBSITE_FIRST', '{}', 'hash-${id}')`,
  );
}

// A full content tree (topic -> package -> version -> variant + bundle) under a
// project, so the target's ReleaseBundle and ContentVariant parents exist.
async function seedTargetParents(prefix: string, projectId: string) {
  await seedTopic(`topic_${prefix}`, projectId);
  await seedPackage(`package_${prefix}`, projectId, `topic_${prefix}`);
  await seedVersion(`ver_${prefix}`, projectId, `package_${prefix}`, 1);
  await seedVariant(`variant_${prefix}`, projectId, `ver_${prefix}`);
  await seedBundle(`bundle_${prefix}`, projectId, `ver_${prefix}`);
}

type TargetSeed = {
  id: string;
  projectId: string;
  bundleId: string;
  variantId: string;
  targetIntent: string;
  required?: boolean;
  scheduledAt?: string | null;
  dependencyTargetId?: string | null;
  utmUrl?: string | null;
};

async function insertTarget({
  id,
  projectId,
  bundleId,
  variantId,
  targetIntent,
  required = true,
  scheduledAt = null,
  dependencyTargetId = null,
  utmUrl = null,
}: TargetSeed) {
  const columns = [
    "id",
    "project_id",
    "release_bundle_id",
    "content_variant_id",
    "platform",
    "target_intent",
    "required",
    "target_hash",
  ];
  const values = [
    `'${id}'`,
    `'${projectId}'`,
    `'${bundleId}'`,
    `'${variantId}'`,
    "'zhihu'",
    `'${targetIntent}'`,
    required ? "1" : "0",
    `'hash-${id}'`,
  ];
  if (scheduledAt !== null) {
    columns.push("scheduled_at");
    values.push(`'${scheduledAt}'`);
  }
  if (dependencyTargetId !== null) {
    columns.push("dependency_target_id");
    values.push(`'${dependencyTargetId}'`);
  }
  if (utmUrl !== null) {
    columns.push("utm_url");
    values.push(`'${utmUrl}'`);
  }
  await client.execute(
    `INSERT INTO release_targets (${columns.join(", ")})
     VALUES (${values.join(", ")})`,
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

describe("release_targets storage contract", () => {
  it("persists a valid same-Project target with the full field set, required defaulting true and NULL optional fields", async () => {
    await seedTargetParents("alpha", "proj_alpha");
    // The required TASK field set under the target's own project_id, plus the
    // append-only created_at.
    await insertTarget({
      id: "target_alpha_1",
      projectId: "proj_alpha",
      bundleId: "bundle_alpha",
      variantId: "variant_alpha",
      targetIntent: "PUBLIC",
    });

    const rows = await db
      .select()
      .from(releaseTargets)
      .where(eq(releaseTargets.id, "target_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "target_alpha_1",
      projectId: "proj_alpha",
      releaseBundleId: "bundle_alpha",
      contentVariantId: "variant_alpha",
      platform: "zhihu",
      targetIntent: "PUBLIC",
      required: true,
      targetHash: "hash-target_alpha_1",
    });
    // Optional schedule, dependency and UTM URL are NULL until set.
    expect(rows[0].scheduledAt).toBeNull();
    expect(rows[0].dependencyTargetId).toBeNull();
    expect(rows[0].utmUrl).toBeNull();
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("persists the optional schedule, dependency, UTM URL and a false required flag verbatim", async () => {
    await seedTargetParents("alpha", "proj_alpha");
    await insertTarget({
      id: "target_dependency",
      projectId: "proj_alpha",
      bundleId: "bundle_alpha",
      variantId: "variant_alpha",
      targetIntent: "PUBLIC",
    });
    await insertTarget({
      id: "target_secondary",
      projectId: "proj_alpha",
      bundleId: "bundle_alpha",
      variantId: "variant_alpha",
      targetIntent: "SUBMIT_FOR_REVIEW",
      required: false,
      scheduledAt: "2026-09-11T05:00:00.000Z",
      dependencyTargetId: "target_dependency",
      utmUrl: "https://example.com/post?utm_source=search_growth",
    });

    const rows = await db
      .select()
      .from(releaseTargets)
      .where(eq(releaseTargets.id, "target_secondary"));
    expect(rows[0]).toMatchObject({
      required: false,
      scheduledAt: "2026-09-11T05:00:00.000Z",
      dependencyTargetId: "target_dependency",
      utmUrl: "https://example.com/post?utm_source=search_growth",
    });
  });

  it("accepts every source-defined target intent", async () => {
    await seedTargetParents("alpha", "proj_alpha");
    for (const [index, targetIntent] of ALL_INTENTS.entries()) {
      await insertTarget({
        id: `target_intent_${index}`,
        projectId: "proj_alpha",
        bundleId: "bundle_alpha",
        variantId: "variant_alpha",
        targetIntent,
      });
    }
    const rows = await db
      .select()
      .from(releaseTargets)
      .where(eq(releaseTargets.projectId, "proj_alpha"));
    expect(
      sort(
        rows.map((row) => row.targetIntent),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(sort([...ALL_INTENTS], (a, b) => a.localeCompare(b)));
  });

  it("rejects a target intent outside the source-defined union", async () => {
    await seedTargetParents("alpha", "proj_alpha");
    await expect(
      insertTarget({
        id: "target_bad_intent",
        projectId: "proj_alpha",
        bundleId: "bundle_alpha",
        variantId: "variant_alpha",
        targetIntent: "PUBLISHED",
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("rejects a target whose ReleaseBundle belongs to another Project", async () => {
    // bundle_alpha lives under proj_alpha while the target names proj_beta as its
    // own project. The composite FK
    // (project_id, release_bundle_id) -> release_bundles(project_id, id) has no
    // matching parent row.
    await seedTargetParents("alpha", "proj_alpha");
    await seedTargetParents("beta", "proj_beta");
    await expect(
      insertTarget({
        id: "target_cross_bundle",
        projectId: "proj_beta",
        bundleId: "bundle_alpha",
        variantId: "variant_beta",
        targetIntent: "PUBLIC",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a target whose ContentVariant belongs to another Project in either direction", async () => {
    await seedTargetParents("alpha", "proj_alpha");
    await seedTargetParents("beta", "proj_beta");

    // Target on proj_alpha naming proj_beta's variant.
    await expect(
      insertTarget({
        id: "target_cross_variant_a",
        projectId: "proj_alpha",
        bundleId: "bundle_alpha",
        variantId: "variant_beta",
        targetIntent: "PUBLIC",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // Target on proj_beta naming proj_alpha's variant.
    await expect(
      insertTarget({
        id: "target_cross_variant_b",
        projectId: "proj_beta",
        bundleId: "bundle_beta",
        variantId: "variant_alpha",
        targetIntent: "PUBLIC",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a target whose ReleaseBundle, ContentVariant or Project does not exist", async () => {
    await seedTargetParents("alpha", "proj_alpha");

    await expect(
      insertTarget({
        id: "target_dangling_bundle",
        projectId: "proj_alpha",
        bundleId: "bundle_missing",
        variantId: "variant_alpha",
        targetIntent: "PUBLIC",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertTarget({
        id: "target_dangling_variant",
        projectId: "proj_alpha",
        bundleId: "bundle_alpha",
        variantId: "variant_missing",
        targetIntent: "PUBLIC",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertTarget({
        id: "target_dangling_project",
        projectId: "proj_missing",
        bundleId: "bundle_alpha",
        variantId: "variant_alpha",
        targetIntent: "PUBLIC",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a dependency on a target belonging to another Project", async () => {
    await seedTargetParents("alpha", "proj_alpha");
    await seedTargetParents("beta", "proj_beta");
    await insertTarget({
      id: "target_on_beta",
      projectId: "proj_beta",
      bundleId: "bundle_beta",
      variantId: "variant_beta",
      targetIntent: "PUBLIC",
    });

    // The composite self-FK (project_id, dependency_target_id) has no (proj_alpha,
    // target_on_beta) parent row.
    await expect(
      insertTarget({
        id: "target_cross_dependency",
        projectId: "proj_alpha",
        bundleId: "bundle_alpha",
        variantId: "variant_alpha",
        targetIntent: "PUBLIC",
        dependencyTargetId: "target_on_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("blocks deleting a target another same-Project target still depends on", async () => {
    await seedTargetParents("alpha", "proj_alpha");
    await insertTarget({
      id: "target_dependency",
      projectId: "proj_alpha",
      bundleId: "bundle_alpha",
      variantId: "variant_alpha",
      targetIntent: "PUBLIC",
    });
    await insertTarget({
      id: "target_dependent",
      projectId: "proj_alpha",
      bundleId: "bundle_alpha",
      variantId: "variant_alpha",
      targetIntent: "PUBLIC",
      dependencyTargetId: "target_dependency",
    });

    // Restrictive (no action) self-FK: the pointer is not silently nulled.
    await expect(
      client.execute(
        "DELETE FROM release_targets WHERE id = 'target_dependency'",
      ),
    ).rejects.toThrow(/FOREIGN KEY/i);

    const rows = await db
      .select()
      .from(releaseTargets)
      .where(eq(releaseTargets.id, "target_dependent"));
    expect(rows[0]?.dependencyTargetId).toBe("target_dependency");
  });

  it("still cascades a whole-project delete when targets depend on each other", async () => {
    // The Project FK is ON DELETE CASCADE and a dependency is always on the SAME
    // project, so deleting the project removes the dependency and the dependent
    // together — the restrictive self-FK must not block the cascade.
    await seedTargetParents("proj_delete", "proj_delete");
    await insertTarget({
      id: "delete_dependency",
      projectId: "proj_delete",
      bundleId: "bundle_proj_delete",
      variantId: "variant_proj_delete",
      targetIntent: "PUBLIC",
    });
    await insertTarget({
      id: "delete_dependent",
      projectId: "proj_delete",
      bundleId: "bundle_proj_delete",
      variantId: "variant_proj_delete",
      targetIntent: "PUBLIC",
      dependencyTargetId: "delete_dependency",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const targets = await db
      .select()
      .from(releaseTargets)
      .where(eq(releaseTargets.projectId, "proj_delete"));
    expect(targets).toHaveLength(0);
  });

  it("cascades targets away when their ReleaseBundle is deleted", async () => {
    await seedTargetParents("delete", "proj_alpha");
    await insertTarget({
      id: "target_delete_bundle",
      projectId: "proj_alpha",
      bundleId: "bundle_delete",
      variantId: "variant_delete",
      targetIntent: "PUBLIC",
    });

    await client.execute(
      "DELETE FROM release_bundles WHERE id = 'bundle_delete'",
    );

    const rows = await db
      .select()
      .from(releaseTargets)
      .where(eq(releaseTargets.id, "target_delete_bundle"));
    expect(rows).toHaveLength(0);
  });

  it("cascades targets away when their ContentVariant is deleted", async () => {
    await seedTargetParents("delete", "proj_alpha");
    await insertTarget({
      id: "target_delete_variant",
      projectId: "proj_alpha",
      bundleId: "bundle_delete",
      variantId: "variant_delete",
      targetIntent: "PUBLIC",
    });

    await client.execute(
      "DELETE FROM content_variants WHERE id = 'variant_delete'",
    );

    const rows = await db
      .select()
      .from(releaseTargets)
      .where(eq(releaseTargets.id, "target_delete_variant"));
    expect(rows).toHaveLength(0);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    await seedTargetParents("alpha", "proj_alpha");
    const insertWith = (values: string) =>
      client.execute(
        `INSERT INTO release_targets ${TARGET_COLUMN_INSERT}
         VALUES (${values})`,
      );

    // project_id has no default and is required.
    await expect(
      insertWith(
        `'target_no_project', NULL, 'bundle_alpha', 'variant_alpha', 'zhihu',
         'PUBLIC', 1, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // release_bundle_id has no default and is required.
    await expect(
      insertWith(
        `'target_no_bundle', 'proj_alpha', NULL, 'variant_alpha', 'zhihu',
         'PUBLIC', 1, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // content_variant_id has no default and is required.
    await expect(
      insertWith(
        `'target_no_variant', 'proj_alpha', 'bundle_alpha', NULL, 'zhihu',
         'PUBLIC', 1, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // platform has no default and is required.
    await expect(
      insertWith(
        `'target_no_platform', 'proj_alpha', 'bundle_alpha', 'variant_alpha',
         NULL, 'PUBLIC', 1, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // target_intent has no default and is required.
    await expect(
      insertWith(
        `'target_no_intent', 'proj_alpha', 'bundle_alpha', 'variant_alpha',
         'zhihu', NULL, 1, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // target_hash has no default and is required.
    await expect(
      insertWith(
        `'target_no_hash', 'proj_alpha', 'bundle_alpha', 'variant_alpha',
         'zhihu', 'PUBLIC', 1, NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("ships ONLY the direct field set with no publisher connection or account column", async () => {
    // The exact TASK field list (id, project_id, release_bundle_id,
    // content_variant_id, platform, target_intent, required, scheduled_at,
    // dependency_target_id, utm_url, target_hash) plus the append-only created_at.
    // The legacy publisher_connection_id is deliberately absent, as is updated_at
    // and any account/connector/execution/receipt/publishing column.
    expect(await columnNames("release_targets")).toEqual([
      "content_variant_id",
      "created_at",
      "dependency_target_id",
      "id",
      "platform",
      "project_id",
      "release_bundle_id",
      "required",
      "scheduled_at",
      "target_hash",
      "target_intent",
      "utm_url",
    ]);
  });
});
