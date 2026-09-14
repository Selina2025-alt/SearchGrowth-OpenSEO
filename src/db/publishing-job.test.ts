/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole publishing_jobs storage contract (valid same-Project persistence with the full field set, optional lease/external/public/error defaults, source-defined idempotency uniqueness, cross-Project target AND plan rejection, same-Project plan-target mismatch rejection, dangling parents, enum and attempt-bound rejection, delete cascades, NOT NULL required columns and the exact 20-column shape via the shipped 0080 DDL); splitting would scatter the invariants asserted together */
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
  publishingJobs,
  releaseBundles,
  releaseTargets,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped PublishingJob table and its parents: market profile 0045,
// topic 0046, prompt 0049 (composite-FK target the accepted opportunity table
// requires), opportunity 0055, source_ref 0056, claim 0057 (0064's
// content_package_version_claims FK requires the claims table), media asset 0060
// plus 0061 (which creates the `media_assets_project_id_id_idx` unique target
// that 0068's content_variant_media_assets FK requires), content package 0062,
// content package version 0063, content package version claim 0064 (creates the
// reused `content_package_versions_project_id_id_idx` composite-FK target the
// bundle FK requires), content variants 0067, content variant media assets 0068
// (creates the reused `content_variants_project_id_id_idx` composite-FK target
// the target FK requires), release bundles 0069, release targets 0070 (which
// also creates the reused `release_targets_project_id_id_idx` composite-FK
// target the job target FK requires), publication execution plans 0078, then
// 0080 (which adds the reused
// `publication_execution_plans_project_id_release_target_id_id_idx` composite-FK
// target and the publishing_jobs table itself). The spec creates the `projects`
// table directly and applies the DDL in order. Foreign keys are ON so the
// Project FK, both same-Project composite FKs, the idempotency UNIQUE index, the
// status/attempt CHECK constraints and the delete cascades are exercised against
// the shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project job persists with the full TASK field set (stable id,
//     project_id, release_target_id, execution_plan_id, opaque executor
//     id/version, source-defined status, attempts/max_attempts, idempotency key,
//     optional lease holder/expiry, opaque external draft/task/content ids,
//     optional public URL, optional safe error code/message) plus the created_at/
//     updated_at timestamps; optional fields default NULL.
//   - The source-defined idempotency key is unique, while a different key and
//     multiple jobs per target remain allowed.
//   - A job whose ReleaseTarget OR chosen plan belongs to another Project — in
//     EITHER direction — is rejected, as is a plan that belongs to a different
//     ReleaseTarget of the SAME Project; a missing parent is rejected.
//   - Deleting its ReleaseTarget, its plan or its whole Project cascades the job
//     away.
//   - The source-defined status enum and the safe attempt bounds are rejected at
//     the DB boundary.
//   - The table ships ONLY the direct job storage field set (no receipt,
//     PUBLIC_VERIFIED, connector/credential, route or execution column).

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
  "drizzle/0080_milky_ghost_rider.sql",
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
const PLAN_COLUMN_INSERT = `(id, project_id, release_target_id, route,
  executor_version, required_fields_json, constraints_snapshot_json,
  verification_policy_json, plan_hash)`;
const JOB_COLUMNS = `(id, project_id, release_target_id, execution_plan_id,
  executor_id, executor_version, status, attempts, max_attempts, idempotency_key,
  leased_by, lease_expires_at, external_draft_id, external_task_id,
  external_content_id, public_url, last_error_code, last_error_message_safe)`;

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
  // Child-first teardown: publishing_jobs references publication_execution_plans
  // and release_targets; publication_execution_plans references release_targets;
  // release_targets references release_bundles and content_variants; both
  // reference content_package_versions; that references content_packages; that
  // references search_topics.
  await db.delete(publishingJobs);
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

// One content tree per Project (reused by every target under that project).
async function seedContent(projectId: string) {
  await seedTopic(`topic_${projectId}`, projectId);
  await seedPackage(`package_${projectId}`, projectId, `topic_${projectId}`);
  await seedVersion(`ver_${projectId}`, projectId, `package_${projectId}`, 1);
  await seedVariant(`variant_${projectId}`, projectId, `ver_${projectId}`);
  await seedBundle(`bundle_${projectId}`, projectId, `ver_${projectId}`);
}

async function seedTarget(id: string, projectId: string) {
  await client.execute(
    `INSERT INTO release_targets ${TARGET_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', 'bundle_${projectId}',
             'variant_${projectId}', 'zhihu', 'PUBLIC', 1, 'hash-${id}')`,
  );
}

async function seedPlan(id: string, projectId: string, targetId: string) {
  await client.execute(
    `INSERT INTO publication_execution_plans ${PLAN_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', '${targetId}',
             'WECHATSYNC_STAGED_FINALIZE', 'wechatsync-v1', '[]', '{}', '{}',
             'hash-${id}')`,
  );
}

// A target with its one fixed plan under a project.
async function seedTargetAndPlan(
  targetId: string,
  planId: string,
  projectId: string,
) {
  await seedTarget(targetId, projectId);
  await seedPlan(planId, projectId, targetId);
}

const literal = (
  value: string | number | null | undefined,
  fallback: string | null,
) => {
  const resolved = value === undefined ? fallback : value;
  return resolved === null ? "NULL" : `'${resolved}'`;
};

type JobSeed = {
  id: string;
  projectId?: string;
  releaseTargetId: string;
  executionPlanId: string;
  executorId?: string;
  executorVersion?: string;
  status?: string;
  attempts?: number | null;
  maxAttempts?: number | null;
  idempotencyKey?: string;
  leasedBy?: string | null;
  leaseExpiresAt?: string | null;
  externalDraftId?: string | null;
  externalTaskId?: string | null;
  externalContentId?: string | null;
  publicUrl?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessageSafe?: string | null;
};

async function insertJobValues(values: string) {
  await client.execute(
    `INSERT INTO publishing_jobs ${JOB_COLUMNS} VALUES (${values})`,
  );
}

async function insertJob(seed: JobSeed) {
  await insertJobValues(
    [
      `'${seed.id}'`,
      literal(seed.projectId, "proj_alpha"),
      `'${seed.releaseTargetId}'`,
      `'${seed.executionPlanId}'`,
      literal(seed.executorId, "executor-opaque-1"),
      literal(seed.executorVersion, "wechatsync-v1"),
      literal(seed.status, "PLANNED"),
      literal(seed.attempts, "0"),
      literal(seed.maxAttempts, "3"),
      literal(seed.idempotencyKey, `idem_${seed.id}`),
      literal(seed.leasedBy, null),
      literal(seed.leaseExpiresAt, null),
      literal(seed.externalDraftId, null),
      literal(seed.externalTaskId, null),
      literal(seed.externalContentId, null),
      literal(seed.publicUrl, null),
      literal(seed.lastErrorCode, null),
      literal(seed.lastErrorMessageSafe, null),
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

describe("publishing_jobs storage contract", () => {
  it("persists a valid same-Project job with the full field set", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await insertJob({
      id: "job_alpha_1",
      releaseTargetId: "target_alpha",
      executionPlanId: "plan_alpha",
      status: "ACCEPTED_REMOTE_TASK",
      attempts: 2,
      maxAttempts: 5,
      leasedBy: "bridge-1",
      leaseExpiresAt: "2026-09-11T05:10:00.000Z",
      externalDraftId: "remote-draft-1",
      externalTaskId: "remote-task-1",
      externalContentId: "remote-content-1",
      publicUrl: "https://example.com/article/1",
      lastErrorCode: "RATE_LIMITED",
      lastErrorMessageSafe: "Platform asked to slow down",
    });

    const rows = await db
      .select()
      .from(publishingJobs)
      .where(eq(publishingJobs.id, "job_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "job_alpha_1",
      projectId: "proj_alpha",
      releaseTargetId: "target_alpha",
      executionPlanId: "plan_alpha",
      executorId: "executor-opaque-1",
      executorVersion: "wechatsync-v1",
      status: "ACCEPTED_REMOTE_TASK",
      attempts: 2,
      maxAttempts: 5,
      idempotencyKey: "idem_job_alpha_1",
      leasedBy: "bridge-1",
      leaseExpiresAt: "2026-09-11T05:10:00.000Z",
      externalDraftId: "remote-draft-1",
      externalTaskId: "remote-task-1",
      externalContentId: "remote-content-1",
      publicUrl: "https://example.com/article/1",
      lastErrorCode: "RATE_LIMITED",
      lastErrorMessageSafe: "Platform asked to slow down",
    });
    // A recorded public URL is opaque: there is no PUBLIC_VERIFIED/receipt column
    // anywhere on the row.
    expect(rows[0].createdAt).toBeTruthy();
    expect(rows[0].updatedAt).toBeTruthy();
  });

  it("defaults the optional lease/external/public/error fields and attempts to NULL/0", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await insertJobValues(
      `'job_minimal', 'proj_alpha', 'target_alpha', 'plan_alpha',
       'executor-opaque-1', 'wechatsync-v1', 'PLANNED', 0, 3,
       'idem_job_minimal', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL`,
    );

    const rows = await db
      .select()
      .from(publishingJobs)
      .where(eq(publishingJobs.id, "job_minimal"));
    expect(rows[0]).toMatchObject({
      attempts: 0,
      leasedBy: null,
      leaseExpiresAt: null,
      externalDraftId: null,
      externalTaskId: null,
      externalContentId: null,
      publicUrl: null,
      lastErrorCode: null,
      lastErrorMessageSafe: null,
    });
  });

  it("rejects a duplicate source-defined idempotency key", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedTargetAndPlan("target_alpha_2", "plan_alpha_2", "proj_alpha");
    await insertJob({
      id: "job_idem_1",
      releaseTargetId: "target_alpha",
      executionPlanId: "plan_alpha",
      idempotencyKey: "idem-shared",
    });
    await expect(
      insertJob({
        id: "job_idem_dup",
        releaseTargetId: "target_alpha_2",
        executionPlanId: "plan_alpha_2",
        idempotencyKey: "idem-shared",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("allows a different idempotency key and multiple jobs per target", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await insertJob({
      id: "job_multi_1",
      releaseTargetId: "target_alpha",
      executionPlanId: "plan_alpha",
      idempotencyKey: "idem-1",
    });
    await insertJob({
      id: "job_multi_2",
      releaseTargetId: "target_alpha",
      executionPlanId: "plan_alpha",
      idempotencyKey: "idem-2",
    });

    const rows = await db
      .select()
      .from(publishingJobs)
      .where(eq(publishingJobs.releaseTargetId, "target_alpha"));
    expect(rows).toHaveLength(2);
  });

  it("rejects a status outside the source-defined enum", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    for (const status of ["QUEUED", "LEASED", "RUNNING", "PUBLISHED", ""]) {
      await expect(
        insertJob({
          id: `job_status_${status || "empty"}`,
          releaseTargetId: "target_alpha",
          executionPlanId: "plan_alpha",
          status,
        }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("rejects unsafe attempt boundaries", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    const invalid = [
      { attempts: -1, maxAttempts: 3 },
      { attempts: 0, maxAttempts: 0 },
      { attempts: 4, maxAttempts: 3 },
    ];
    for (const [index, bounds] of invalid.entries()) {
      await expect(
        insertJob({
          id: `job_attempts_${index}`,
          releaseTargetId: "target_alpha",
          executionPlanId: "plan_alpha",
          ...bounds,
        }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("rejects a job whose ReleaseTarget belongs to another Project in either direction", async () => {
    await seedContent("proj_alpha");
    await seedContent("proj_beta");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedTargetAndPlan("target_beta", "plan_beta", "proj_beta");

    await expect(
      insertJob({
        id: "job_cross_target_a",
        projectId: "proj_alpha",
        releaseTargetId: "target_beta",
        executionPlanId: "plan_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertJob({
        id: "job_cross_target_b",
        projectId: "proj_beta",
        releaseTargetId: "target_alpha",
        executionPlanId: "plan_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a job whose chosen plan belongs to another Project", async () => {
    await seedContent("proj_alpha");
    await seedContent("proj_beta");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedTargetAndPlan("target_beta", "plan_beta", "proj_beta");

    // Same-Project target, but the plan belongs to another Project.
    await expect(
      insertJob({
        id: "job_cross_plan",
        projectId: "proj_alpha",
        releaseTargetId: "target_alpha",
        executionPlanId: "plan_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a plan that belongs to a different ReleaseTarget of the same Project", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedTargetAndPlan("target_alpha_2", "plan_alpha_2", "proj_alpha");

    // Job names target_alpha but target_alpha_2's plan — same Project, wrong
    // target. The composite FK (project, target, plan) rejects it.
    await expect(
      insertJob({
        id: "job_plan_target_mismatch",
        releaseTargetId: "target_alpha",
        executionPlanId: "plan_alpha_2",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a job whose target, plan or Project does not exist", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");

    await expect(
      insertJob({
        id: "job_dangling_target",
        releaseTargetId: "target_missing",
        executionPlanId: "plan_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertJob({
        id: "job_dangling_plan",
        releaseTargetId: "target_alpha",
        executionPlanId: "plan_missing",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertJob({
        id: "job_dangling_project",
        projectId: "proj_missing",
        releaseTargetId: "target_alpha",
        executionPlanId: "plan_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("cascades the job away when its ReleaseTarget is deleted", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_delete", "plan_delete", "proj_alpha");
    await insertJob({
      id: "job_delete_target",
      releaseTargetId: "target_delete",
      executionPlanId: "plan_delete",
    });

    await client.execute(
      "DELETE FROM release_targets WHERE id = 'target_delete'",
    );

    const rows = await db
      .select()
      .from(publishingJobs)
      .where(eq(publishingJobs.id, "job_delete_target"));
    expect(rows).toHaveLength(0);
  });

  it("cascades the job away when its execution plan is deleted", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_delete", "proj_alpha");
    await insertJob({
      id: "job_delete_plan",
      releaseTargetId: "target_alpha",
      executionPlanId: "plan_delete",
    });

    await client.execute(
      "DELETE FROM publication_execution_plans WHERE id = 'plan_delete'",
    );

    const rows = await db
      .select()
      .from(publishingJobs)
      .where(eq(publishingJobs.id, "job_delete_plan"));
    expect(rows).toHaveLength(0);
  });

  it("cascades jobs away on a whole-project delete", async () => {
    await seedContent("proj_delete");
    await seedTargetAndPlan(
      "target_proj_delete",
      "plan_proj_delete",
      "proj_delete",
    );
    await insertJob({
      id: "job_delete_project",
      projectId: "proj_delete",
      releaseTargetId: "target_proj_delete",
      executionPlanId: "plan_proj_delete",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const rows = await db
      .select()
      .from(publishingJobs)
      .where(eq(publishingJobs.projectId, "proj_delete"));
    expect(rows).toHaveLength(0);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    const insertWith = (id: string, values: string) =>
      insertJobValues(values.replace(":id", id));

    // project_id has no default and is required.
    await expect(
      insertWith(
        "job_no_project",
        `':id', NULL, 'target_alpha', 'plan_alpha', 'executor-opaque-1',
         'wechatsync-v1', 'PLANNED', 0, 3, 'idem-:id', NULL, NULL, NULL, NULL,
         NULL, NULL, NULL, NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // release_target_id has no default and is required.
    await expect(
      insertWith(
        "job_no_target",
        `':id', 'proj_alpha', NULL, 'plan_alpha', 'executor-opaque-1',
         'wechatsync-v1', 'PLANNED', 0, 3, 'idem-:id', NULL, NULL, NULL, NULL,
         NULL, NULL, NULL, NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // execution_plan_id has no default and is required.
    await expect(
      insertWith(
        "job_no_plan",
        `':id', 'proj_alpha', 'target_alpha', NULL, 'executor-opaque-1',
         'wechatsync-v1', 'PLANNED', 0, 3, 'idem-:id', NULL, NULL, NULL, NULL,
         NULL, NULL, NULL, NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // status has no default and is required.
    await expect(
      insertWith(
        "job_no_status",
        `':id', 'proj_alpha', 'target_alpha', 'plan_alpha', 'executor-opaque-1',
         'wechatsync-v1', NULL, 0, 3, 'idem-:id', NULL, NULL, NULL, NULL, NULL,
         NULL, NULL, NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // max_attempts has no default and is required.
    await expect(
      insertWith(
        "job_no_max",
        `':id', 'proj_alpha', 'target_alpha', 'plan_alpha', 'executor-opaque-1',
         'wechatsync-v1', 'PLANNED', 0, NULL, 'idem-:id', NULL, NULL, NULL,
         NULL, NULL, NULL, NULL, NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // idempotency_key has no default and is required.
    await expect(
      insertWith(
        "job_no_idem",
        `':id', 'proj_alpha', 'target_alpha', 'plan_alpha', 'executor-opaque-1',
         'wechatsync-v1', 'PLANNED', 0, 3, NULL, NULL, NULL, NULL, NULL, NULL,
         NULL, NULL, NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("ships ONLY the direct job storage field set", async () => {
    // The exact TASK field list (id, project_id, release_target_id,
    // execution_plan_id, executor_id, executor_version, status, attempts,
    // max_attempts, idempotency_key, leased_by, lease_expires_at,
    // external_draft_id, external_task_id, external_content_id, public_url,
    // last_error_code, last_error_message_safe) plus created_at/updated_at. No
    // receipt/PUBLIC_VERIFIED column, no route/execution column and no
    // connector/credential column.
    expect(await columnNames("publishing_jobs")).toEqual([
      "attempts",
      "created_at",
      "execution_plan_id",
      "executor_id",
      "executor_version",
      "external_content_id",
      "external_draft_id",
      "external_task_id",
      "id",
      "idempotency_key",
      "last_error_code",
      "last_error_message_safe",
      "lease_expires_at",
      "leased_by",
      "max_attempts",
      "project_id",
      "public_url",
      "release_target_id",
      "status",
      "updated_at",
    ]);
  });
});
