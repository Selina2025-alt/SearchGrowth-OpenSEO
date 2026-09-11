/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole publication_execution_plans storage contract (valid same-Project persistence with the full field set and NULL optional fields/all routes/finalizer strategies/fallback routes plus document validity/cross-Project rejection in both directions/one-plan-per-target/dangling parents/delete cascades/NOT NULL and exact column shape via the shipped 0078 DDL); splitting would scatter the invariants asserted together */
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
  publicationExecutionPlans,
  releaseBundles,
  releaseTargets,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped PublicationExecutionPlan table and its parents: market profile
// 0045, topic 0046, prompt 0049 (composite-FK target the accepted opportunity
// table requires), opportunity 0055, source_ref 0056, claim 0057 (0064's
// content_package_version_claims FK requires the claims table), media asset 0060
// plus 0061 (which creates the `media_assets_project_id_id_idx` unique target
// that 0068's content_variant_media_assets FK requires), content package 0062,
// content package version 0063, content package version claim 0064 (creates the
// reused `content_package_versions_project_id_id_idx` composite-FK target the
// bundle FK requires), content variants 0067, content variant media assets 0068
// (creates the reused `content_variants_project_id_id_idx` composite-FK target
// the target FK requires), release bundles 0069, release targets 0070 (which
// also creates the reused `release_targets_project_id_id_idx` composite-FK
// target the plan FK requires), then 0078 (the publication_execution_plans table
// itself). The spec creates the `projects` table directly and applies the DDL in
// order. Foreign keys are ON so the Project FK, the same-Project composite FK to
// the ReleaseTarget, the one-plan-per-target UNIQUE index, the route/strategy/
// fallback CHECKs, the JSON-document validity CHECKs and the delete cascades are
// exercised against the shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project plan persists with the full TASK field set (stable
//     id, project_id, release_target_id, route, optional draft_stager_id/
//     finalizer_id/finalizer_strategy, executor_version, the three required plan
//     documents, optional fallback_route, plan_hash) plus the append-only
//     created_at timestamp; the optional fields default NULL.
//   - The source-defined route / finalizer-strategy / fallback-route unions are
//     accepted in full and rejected outside the union (NULL admitted for the two
//     optional enums).
//   - The three plan documents must be valid JSON (malformed JSON rejected).
//   - A second plan for the same ReleaseTarget is rejected (one plan per target).
//   - A plan whose ReleaseTarget belongs to another Project — in EITHER
//     direction — is rejected by the composite FK; a plan whose parent is
//     missing is rejected.
//   - Deleting its ReleaseTarget or its whole Project cascades the plan away, so
//     a plan can never dangle.
//   - The table ships ONLY the direct field set (no account, updated_at, job/
//     receipt/publishing/public-success column).

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
  "drizzle/0078_wooden_vengeance.sql",
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
const PLAN_COLUMNS = `(id, project_id, release_target_id, route, draft_stager_id,
  finalizer_id, finalizer_strategy, executor_version, required_fields_json,
  constraints_snapshot_json, verification_policy_json, fallback_route, plan_hash)`;

const ALL_ROUTES = [
  "OWNED_SITE",
  "WECHATSYNC_STAGED_FINALIZE",
  "YXER_NATIVE",
  "SOCIAL_AUTO_UPLOAD_NATIVE",
  "POSTIZ_NATIVE",
  "PAID_MEDIA_SERVICE",
] as const;

const ALL_FINALIZER_STRATEGIES = [
  "OFFICIAL_API",
  "IN_PAGE_WEB_API",
  "SERVICE_CLI",
  "FIXED_DOM",
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
  // Child-first teardown: publication_execution_plans references release_targets;
  // release_targets references release_bundles and content_variants; both
  // reference content_package_versions; that references content_packages; that
  // references search_topics.
  await db.delete(publicationExecutionPlans);
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

async function seedTarget(id: string, projectId: string, prefix: string) {
  await client.execute(
    `INSERT INTO release_targets ${TARGET_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', 'bundle_${prefix}', 'variant_${prefix}',
             'zhihu', 'PUBLIC', 1, 'hash-${id}')`,
  );
}

// A full content tree (topic -> package -> version -> variant + bundle) plus one
// ReleaseTarget under a project, so a plan's ReleaseTarget parent exists.
async function seedPlanParent(prefix: string, projectId: string) {
  await seedTopic(`topic_${prefix}`, projectId);
  await seedPackage(`package_${prefix}`, projectId, `topic_${prefix}`);
  await seedVersion(`ver_${prefix}`, projectId, `package_${prefix}`, 1);
  await seedVariant(`variant_${prefix}`, projectId, `ver_${prefix}`);
  await seedBundle(`bundle_${prefix}`, projectId, `ver_${prefix}`);
  await seedTarget(`target_${prefix}`, projectId, prefix);
}

const literal = (value: string | null | undefined, fallback: string | null) => {
  const resolved = value === undefined ? fallback : value;
  return resolved === null ? "NULL" : `'${resolved}'`;
};

type PlanSeed = {
  id: string;
  projectId?: string;
  releaseTargetId: string;
  route?: string;
  draftStagerId?: string | null;
  finalizerId?: string | null;
  finalizerStrategy?: string | null;
  executorVersion?: string;
  requiredFieldsJson?: string;
  constraintsSnapshotJson?: string;
  verificationPolicyJson?: string;
  fallbackRoute?: string | null;
  planHash?: string;
};

async function insertPlanValues(values: string) {
  await client.execute(
    `INSERT INTO publication_execution_plans ${PLAN_COLUMNS} VALUES (${values})`,
  );
}

async function insertPlan(seed: PlanSeed) {
  await insertPlanValues(
    [
      `'${seed.id}'`,
      literal(seed.projectId, "proj_alpha"),
      `'${seed.releaseTargetId}'`,
      literal(seed.route, "WECHATSYNC_STAGED_FINALIZE"),
      literal(seed.draftStagerId, null),
      literal(seed.finalizerId, null),
      literal(seed.finalizerStrategy, null),
      literal(seed.executorVersion, "wechatsync-v1"),
      literal(seed.requiredFieldsJson, '["account_id","title"]'),
      literal(seed.constraintsSnapshotJson, '{"maxTitleLength":100}'),
      literal(seed.verificationPolicyJson, '{"requirePublicUrl":true}'),
      literal(seed.fallbackRoute, null),
      literal(seed.planHash, `hash-${seed.id}`),
    ].join(", "),
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

describe("publication_execution_plans storage contract", () => {
  it("persists a valid same-Project plan with the full field set and NULL optional fields", async () => {
    await seedPlanParent("alpha", "proj_alpha");
    await insertPlan({
      id: "plan_alpha_1",
      releaseTargetId: "target_alpha",
      route: "WECHATSYNC_STAGED_FINALIZE",
    });

    const rows = await db
      .select()
      .from(publicationExecutionPlans)
      .where(eq(publicationExecutionPlans.id, "plan_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "plan_alpha_1",
      projectId: "proj_alpha",
      releaseTargetId: "target_alpha",
      route: "WECHATSYNC_STAGED_FINALIZE",
      executorVersion: "wechatsync-v1",
      requiredFieldsJson: '["account_id","title"]',
      constraintsSnapshotJson: '{"maxTitleLength":100}',
      verificationPolicyJson: '{"requirePublicUrl":true}',
      planHash: "hash-plan_alpha_1",
    });
    // Optional stager/finalizer/strategy/fallback are NULL until set.
    expect(rows[0].draftStagerId).toBeNull();
    expect(rows[0].finalizerId).toBeNull();
    expect(rows[0].finalizerStrategy).toBeNull();
    expect(rows[0].fallbackRoute).toBeNull();
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("persists the optional stager, finalizer, strategy and fallback route verbatim", async () => {
    await seedPlanParent("alpha", "proj_alpha");
    await insertPlan({
      id: "plan_optional",
      releaseTargetId: "target_alpha",
      route: "WECHATSYNC_STAGED_FINALIZE",
      draftStagerId: "wechatsync",
      finalizerId: "zhihu-same-draft-v1",
      finalizerStrategy: "IN_PAGE_WEB_API",
      fallbackRoute: "YXER_NATIVE",
    });

    const rows = await db
      .select()
      .from(publicationExecutionPlans)
      .where(eq(publicationExecutionPlans.id, "plan_optional"));
    expect(rows[0]).toMatchObject({
      draftStagerId: "wechatsync",
      finalizerId: "zhihu-same-draft-v1",
      finalizerStrategy: "IN_PAGE_WEB_API",
      fallbackRoute: "YXER_NATIVE",
    });
  });

  it("accepts every source-defined route", async () => {
    await seedPlanParent("alpha", "proj_alpha");
    for (const [index, route] of ALL_ROUTES.entries()) {
      // One plan per target, so each route gets its own ReleaseTarget (all
      // sharing the accepted bundle/variant parents).
      await seedTarget(`target_route_${index}`, "proj_alpha", "alpha");
      await insertPlan({
        id: `plan_route_${index}`,
        releaseTargetId: `target_route_${index}`,
        route,
      });
    }
    const rows = await db
      .select()
      .from(publicationExecutionPlans)
      .where(eq(publicationExecutionPlans.projectId, "proj_alpha"));
    expect(
      sort(
        rows.map((row) => row.route),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(sort([...ALL_ROUTES], (a, b) => a.localeCompare(b)));
  });

  it("rejects a route outside the source-defined union", async () => {
    await seedPlanParent("alpha", "proj_alpha");
    await expect(
      insertPlan({
        id: "plan_bad_route",
        releaseTargetId: "target_alpha",
        route: "AUTO_PUBLISH",
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("accepts every source-defined finalizer strategy and NULL", async () => {
    await seedPlanParent("alpha", "proj_alpha");
    for (const [
      index,
      finalizerStrategy,
    ] of ALL_FINALIZER_STRATEGIES.entries()) {
      await seedTarget(`target_strategy_${index}`, "proj_alpha", "alpha");
      await insertPlan({
        id: `plan_strategy_${index}`,
        releaseTargetId: `target_strategy_${index}`,
        finalizerStrategy,
      });
    }
    const rows = await db
      .select()
      .from(publicationExecutionPlans)
      .where(eq(publicationExecutionPlans.projectId, "proj_alpha"));
    expect(
      sort(
        rows.map((row) => row.finalizerStrategy ?? "NULL"),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(
      sort([...ALL_FINALIZER_STRATEGIES], (a, b) => a.localeCompare(b)),
    );
  });

  it("rejects a finalizer strategy or fallback route outside the source-defined unions", async () => {
    await seedPlanParent("alpha", "proj_alpha");
    await expect(
      insertPlan({
        id: "plan_bad_strategy",
        releaseTargetId: "target_alpha",
        finalizerStrategy: "BROWSER_AUTOMATION",
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);

    await expect(
      insertPlan({
        id: "plan_bad_fallback",
        releaseTargetId: "target_alpha",
        fallbackRoute: "AUTO_PUBLISH",
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("rejects malformed JSON in any required plan document", async () => {
    await seedPlanParent("alpha", "proj_alpha");
    await expect(
      insertPlan({
        id: "plan_bad_required_fields",
        releaseTargetId: "target_alpha",
        requiredFieldsJson: "{not json",
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);

    await expect(
      insertPlan({
        id: "plan_bad_constraints",
        releaseTargetId: "target_alpha",
        constraintsSnapshotJson: "not-json",
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);

    await expect(
      insertPlan({
        id: "plan_bad_policy",
        releaseTargetId: "target_alpha",
        verificationPolicyJson: '{"requirePublicUrl"',
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("rejects a second plan for the same ReleaseTarget", async () => {
    await seedPlanParent("alpha", "proj_alpha");
    await insertPlan({
      id: "plan_first",
      releaseTargetId: "target_alpha",
      route: "OWNED_SITE",
    });
    await expect(
      insertPlan({
        id: "plan_second",
        releaseTargetId: "target_alpha",
        route: "YXER_NATIVE",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("rejects a plan whose ReleaseTarget belongs to another Project in either direction", async () => {
    await seedPlanParent("alpha", "proj_alpha");
    await seedPlanParent("beta", "proj_beta");

    // Plan on proj_alpha naming proj_beta's target.
    await expect(
      insertPlan({
        id: "plan_cross_a",
        projectId: "proj_alpha",
        releaseTargetId: "target_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // Plan on proj_beta naming proj_alpha's target.
    await expect(
      insertPlan({
        id: "plan_cross_b",
        projectId: "proj_beta",
        releaseTargetId: "target_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a plan whose ReleaseTarget or Project does not exist", async () => {
    await seedPlanParent("alpha", "proj_alpha");

    await expect(
      insertPlan({
        id: "plan_dangling_target",
        releaseTargetId: "target_missing",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertPlan({
        id: "plan_dangling_project",
        projectId: "proj_missing",
        releaseTargetId: "target_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("cascades the plan away when its ReleaseTarget is deleted", async () => {
    await seedPlanParent("delete", "proj_alpha");
    await insertPlan({
      id: "plan_delete_target",
      releaseTargetId: "target_delete",
    });

    await client.execute(
      "DELETE FROM release_targets WHERE id = 'target_delete'",
    );

    const rows = await db
      .select()
      .from(publicationExecutionPlans)
      .where(eq(publicationExecutionPlans.id, "plan_delete_target"));
    expect(rows).toHaveLength(0);
  });

  it("cascades plans away on a whole-project delete", async () => {
    await seedPlanParent("proj_delete", "proj_delete");
    await insertPlan({
      id: "plan_delete_project",
      projectId: "proj_delete",
      releaseTargetId: "target_proj_delete",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const rows = await db
      .select()
      .from(publicationExecutionPlans)
      .where(eq(publicationExecutionPlans.projectId, "proj_delete"));
    expect(rows).toHaveLength(0);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    await seedPlanParent("alpha", "proj_alpha");
    // Every required column is NULL except the identity columns.
    const insertWith = (values: string) => insertPlanValues(values);

    // project_id has no default and is required.
    await expect(
      insertWith(
        `'plan_no_project', NULL, 'target_alpha', 'OWNED_SITE', NULL, NULL,
         NULL, 'v1', '[]', '{}', '{}', NULL, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // release_target_id has no default and is required.
    await expect(
      insertWith(
        `'plan_no_target', 'proj_alpha', NULL, 'OWNED_SITE', NULL, NULL,
         NULL, 'v1', '[]', '{}', '{}', NULL, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // route has no default and is required.
    await expect(
      insertWith(
        `'plan_no_route', 'proj_alpha', 'target_alpha', NULL, NULL, NULL,
         NULL, 'v1', '[]', '{}', '{}', NULL, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // executor_version has no default and is required.
    await expect(
      insertWith(
        `'plan_no_executor', 'proj_alpha', 'target_alpha', 'OWNED_SITE', NULL,
         NULL, NULL, NULL, '[]', '{}', '{}', NULL, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // required_fields_json has no default and is required.
    await expect(
      insertWith(
        `'plan_no_required', 'proj_alpha', 'target_alpha', 'OWNED_SITE', NULL,
         NULL, NULL, 'v1', NULL, '{}', '{}', NULL, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // constraints_snapshot_json has no default and is required.
    await expect(
      insertWith(
        `'plan_no_constraints', 'proj_alpha', 'target_alpha', 'OWNED_SITE',
         NULL, NULL, NULL, 'v1', '[]', NULL, '{}', NULL, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // verification_policy_json has no default and is required.
    await expect(
      insertWith(
        `'plan_no_policy', 'proj_alpha', 'target_alpha', 'OWNED_SITE', NULL,
         NULL, NULL, 'v1', '[]', '{}', NULL, NULL, 'hash'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // plan_hash has no default and is required.
    await expect(
      insertWith(
        `'plan_no_hash', 'proj_alpha', 'target_alpha', 'OWNED_SITE', NULL,
         NULL, NULL, 'v1', '[]', '{}', '{}', NULL, NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("ships ONLY the direct field set with no account or execution column", async () => {
    // The exact TASK field list (id, project_id, release_target_id, route,
    // draft_stager_id, finalizer_id, finalizer_strategy, executor_version,
    // required_fields_json, constraints_snapshot_json, verification_policy_json,
    // fallback_route, plan_hash) plus the append-only created_at. No account_id
    // (later credential-bound task), no updated_at, no job/receipt/publishing/
    // public-success column, and no mutable status/lifecycle column.
    expect(await columnNames("publication_execution_plans")).toEqual([
      "constraints_snapshot_json",
      "created_at",
      "draft_stager_id",
      "executor_version",
      "fallback_route",
      "finalizer_id",
      "finalizer_strategy",
      "id",
      "plan_hash",
      "project_id",
      "release_target_id",
      "required_fields_json",
      "route",
      "verification_policy_json",
    ]);
  });
});
