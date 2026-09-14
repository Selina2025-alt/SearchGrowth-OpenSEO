/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole publication_receipts storage contract (valid same-Project persistence with the full field set, optional external/public/timestamp defaults, one-receipt-per-job uniqueness, cross-Project and job-target mismatch rejection, dangling parents, enum/document rejection, delete cascades, NOT NULL required columns and the exact 19-column shape via the shipped 0081 DDL); splitting would scatter the invariants asserted together */
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
  geoCitations,
  geoObservationParses,
  geoObservationRuns,
  publicationExecutionPlans,
  publicationReceipts,
  publishingJobs,
  releaseBundles,
  releaseTargets,
  searchPrompts,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped PublicationReceipt evidence table and its parents: market
// profile 0045, topic 0046, prompt 0049 (composite-FK target the accepted
// opportunity table requires), opportunity 0055, source_ref 0056, claim 0057
// (0064's content_package_version_claims FK requires the claims table), media
// asset 0060 plus 0061 (which creates the `media_assets_project_id_id_idx`
// unique target that 0068's content_variant_media_assets FK requires), content
// package 0062, content package version 0063, content package version claim 0064
// (creates the reused `content_package_versions_project_id_id_idx` composite-FK
// target the bundle FK requires), content variants 0067, content variant media
// assets 0068 (creates the reused `content_variants_project_id_id_idx`
// composite-FK target the target FK requires), release bundles 0069, release
// targets 0070 (which also creates the reused `release_targets_project_id_id_idx`
// composite-FK target both receipt target FKs require), publication execution
// plans 0078, publishing jobs 0080 (which creates the reused
// `publication_execution_plans_project_id_release_target_id_id_idx` target the
// job plan FK requires), then 0081 (which adds the reusable
// `publishing_jobs_project_id_release_target_id_id_idx` parent target and the
// publication_receipts table itself), and finally the geo_citations evidence
// chain (tracked entities 0048, prompts 0049, raw runs 0050, versioned parses
// 0051/0053, mentions 0052, citations 0054) plus 0082 (which adds the reusable
// `publication_receipts_project_id_id_idx` parent target and the same-Project
// matched-receipt composite FK on geo_citations). The spec creates the `projects`
// table directly and applies the DDL in order. Foreign keys are ON so the Project
// FK, both receipt composite FKs (including the same-Project AND
// same-ReleaseTarget job FK), the citation -> receipt same-Project composite FK,
// the one-receipt-per-job UNIQUE index, the status/document CHECK constraints and
// the delete cascades are exercised against the shipped DDL — not an application
// convention.
//
// Invariants under test:
//   - A valid same-Project receipt persists with the full TASK field set
//     (stable id, explicit project_id, publishing_job_id, release_target_id,
//     opaque platform/executor id/version, optional opaque external
//     draft/task/content ids, optional public URL, content hash, media-hashes
//     document, source-defined status, optional submitted/published/verified
//     timestamps, verification document) plus created_at; optional fields
//     default NULL.
//   - The source-defined one-receipt-per-job identity rejects a second receipt
//     for the same job, while receipts for different jobs remain allowed.
//   - A receipt whose job belongs to another Project — in EITHER direction — or
//     to a different ReleaseTarget of the SAME Project is rejected, as is a
//     missing job/target/Project parent.
//   - Deleting its job, its ReleaseTarget or its whole Project cascades the
//     receipt away.
//   - The source-defined status enum and both structured documents are rejected
//     at the DB boundary when invalid.
//   - A geo_citation's optional matched receipt binds same-Project only: a
//     same-Project receipt id (or NULL) is accepted; a receipt on another
//     Project or a dangling receipt id is rejected by the composite FK. Deleting
//     a still-matched receipt is blocked (NO ACTION) so the citation's evidence
//     is preserved, while a whole-Project teardown still removes both rows.
//   - The table ships ONLY the direct receipt evidence field set (no
//     updated_at, PUBLIC_VERIFIED-implying verifier, connector/credential,
//     route, execution or citation-attribution column).

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
  "drizzle/0048_ordinary_legion.sql",
  "drizzle/0049_gigantic_johnny_blaze.sql",
  "drizzle/0050_dusty_stardust.sql",
  "drizzle/0051_cuddly_matthew_murdock.sql",
  "drizzle/0052_cute_red_shift.sql",
  "drizzle/0053_shocking_rhodey.sql",
  "drizzle/0054_optimal_magik.sql",
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
  "drizzle/0081_bouncy_red_skull.sql",
  "drizzle/0082_mighty_steve_rogers.sql",
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
const RECEIPT_COLUMNS = `(id, project_id, publishing_job_id, release_target_id,
  platform, executor_id, executor_version, external_draft_id, external_task_id,
  external_content_id, public_url, content_hash, media_hashes_json, status,
  submitted_at, published_at, verified_at, verification_json)`;

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
  // Child-first teardown: geo_citations references geo_observation_parses and (NO
  // ACTION) publication_receipts, so citations go first; parses reference runs;
  // runs and prompts reference search_topics. publication_receipts references
  // publishing_jobs and release_targets; publishing_jobs references
  // publication_execution_plans and release_targets;
  // publication_execution_plans references release_targets; release_targets
  // references release_bundles and content_variants; both reference
  // content_package_versions; that references content_packages; that references
  // search_topics.
  await db.delete(geoCitations);
  await db.delete(geoObservationParses);
  await db.delete(geoObservationRuns);
  await db.delete(searchPrompts);
  await db.delete(publicationReceipts);
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

async function seedJob(
  id: string,
  projectId: string,
  targetId: string,
  planId: string,
) {
  await client.execute(
    `INSERT INTO publishing_jobs ${JOB_COLUMNS}
     VALUES ('${id}', '${projectId}', '${targetId}', '${planId}',
             'executor-opaque-1', 'wechatsync-v1', 'PUBLISH_SUBMITTED', 0, 3,
             'idem_${id}', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
  );
}

const literal = (
  value: string | number | null | undefined,
  fallback: string | null,
) => {
  const resolved = value === undefined ? fallback : value;
  return resolved === null ? "NULL" : `'${resolved}'`;
};

type ReceiptSeed = {
  id: string;
  projectId?: string;
  publishingJobId: string;
  releaseTargetId: string;
  platform?: string;
  executorId?: string;
  executorVersion?: string;
  externalDraftId?: string | null;
  externalTaskId?: string | null;
  externalContentId?: string | null;
  publicUrl?: string | null;
  contentHash?: string;
  mediaHashesJson?: string;
  status?: string;
  submittedAt?: string | null;
  publishedAt?: string | null;
  verifiedAt?: string | null;
  verificationJson?: string;
};

async function insertReceiptValues(values: string) {
  await client.execute(
    `INSERT INTO publication_receipts ${RECEIPT_COLUMNS} VALUES (${values})`,
  );
}

async function insertReceipt(seed: ReceiptSeed) {
  await insertReceiptValues(
    [
      `'${seed.id}'`,
      literal(seed.projectId, "proj_alpha"),
      `'${seed.publishingJobId}'`,
      `'${seed.releaseTargetId}'`,
      literal(seed.platform, "zhihu"),
      literal(seed.executorId, "executor-opaque-1"),
      literal(seed.executorVersion, "wechatsync-v1"),
      literal(seed.externalDraftId, null),
      literal(seed.externalTaskId, null),
      literal(seed.externalContentId, null),
      literal(seed.publicUrl, null),
      literal(seed.contentHash, `sha256-${seed.id}`),
      literal(seed.mediaHashesJson, '["sha256-asset-1"]'),
      literal(seed.status, "PUBLISH_SUBMITTED"),
      literal(seed.submittedAt, null),
      literal(seed.publishedAt, null),
      literal(seed.verifiedAt, null),
      literal(seed.verificationJson, "{}"),
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

// --- T108 geo_citations chain (for the matched-receipt relation) -----------

async function seedPrompt(id: string, projectId: string) {
  await db.insert(searchPrompts).values({
    id,
    projectId,
    topicId: `topic_${projectId}`,
    promptText: `Prompt ${id}`,
    normalizedPrompt: `prompt ${id}`,
    promptType: "definition",
    language: "en",
    businessFit: 50,
    priority: 50,
    version: 1,
    active: true,
  });
}

// One prompt/run/parse fact under an already-seeded project content tree
// (seedContent provides the topic the prompt binds to). Returns the parse id a
// citation attaches to.
async function seedParseForProject(projectId: string) {
  const promptId = `prompt_${projectId}`;
  const runId = `run_${projectId}`;
  const parseId = `parse_${projectId}`;
  await seedPrompt(promptId, projectId);
  await db.insert(geoObservationRuns).values({
    id: runId,
    batchId: `batch_${projectId}`,
    projectId,
    promptId,
    promptVersion: 1,
    surfaceType: "MODEL_API_SEARCH",
    surfaceName: "GPT-5 Search",
    fidelity: "API_SIMULATION",
    repeatIndex: 0,
    applicationCacheBypassed: true,
    startedAt: "2026-09-08T04:00:00.000Z",
    status: "SUCCEEDED",
  });
  await db.insert(geoObservationParses).values({
    id: parseId,
    projectId,
    runId,
    parserVersion: "1.0.0",
    parseStatus: "SUCCESS",
    accuracyStatus: null,
    parsedAt: "2026-09-08T04:00:05.000Z",
    isCurrent: false,
  });
  return parseId;
}

async function insertCitation(
  id: string,
  projectId: string,
  parseId: string,
  matchedPublicationReceiptId: string | null,
) {
  // Raw SQL (as in the other FK-rejection tests) so an expected constraint
  // failure surfaces as the clean libsql error rather than a Drizzle wrapper.
  await client.execute(
    `INSERT INTO geo_citations
       (id, project_id, parse_id, raw_url, normalized_url, domain,
        source_ownership, matched_publication_receipt_id)
     VALUES ('${id}', '${projectId}', '${parseId}', 'https://example.com/${id}',
             'https://example.com/${id}', 'example.com',
             'CONTROLLED_PUBLICATION',
             ${matchedPublicationReceiptId === null ? "NULL" : `'${matchedPublicationReceiptId}'`})`,
  );
}

describe("publication_receipts storage contract", () => {
  it("persists a valid same-Project receipt with the full field set", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedJob("job_alpha", "proj_alpha", "target_alpha", "plan_alpha");
    await insertReceipt({
      id: "receipt_alpha",
      publishingJobId: "job_alpha",
      releaseTargetId: "target_alpha",
      platform: "zhihu",
      executorId: "executor-opaque-1",
      executorVersion: "wechatsync-v1",
      externalDraftId: "remote-draft-1",
      externalTaskId: "remote-task-1",
      externalContentId: "remote-content-1",
      publicUrl: "https://example.com/article/1",
      contentHash: "sha256-content-1",
      mediaHashesJson: '["sha256-asset-1","sha256-asset-2"]',
      status: "PUBLIC_VERIFIED",
      submittedAt: "2026-09-11T06:01:00.000Z",
      publishedAt: "2026-09-11T06:02:00.000Z",
      verifiedAt: "2026-09-11T06:03:00.000Z",
      verificationJson: '{"profile":"zhihu-public-v1","loginRequired":false}',
    });

    const rows = await db
      .select()
      .from(publicationReceipts)
      .where(eq(publicationReceipts.id, "receipt_alpha"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "receipt_alpha",
      projectId: "proj_alpha",
      publishingJobId: "job_alpha",
      releaseTargetId: "target_alpha",
      platform: "zhihu",
      executorId: "executor-opaque-1",
      executorVersion: "wechatsync-v1",
      externalDraftId: "remote-draft-1",
      externalTaskId: "remote-task-1",
      externalContentId: "remote-content-1",
      publicUrl: "https://example.com/article/1",
      contentHash: "sha256-content-1",
      mediaHashesJson: '["sha256-asset-1","sha256-asset-2"]',
      status: "PUBLIC_VERIFIED",
      submittedAt: "2026-09-11T06:01:00.000Z",
      publishedAt: "2026-09-11T06:02:00.000Z",
      verifiedAt: "2026-09-11T06:03:00.000Z",
      verificationJson: '{"profile":"zhihu-public-v1","loginRequired":false}',
    });
    // A recorded public URL/status is opaque evidence: there is no reachability
    // check, verifier or `PUBLIC_VERIFIED` derivation anywhere on the row.
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("defaults the optional external ids, public URL and evidence timestamps to NULL", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedJob("job_alpha", "proj_alpha", "target_alpha", "plan_alpha");
    await insertReceiptValues(
      `'receipt_minimal', 'proj_alpha', 'job_alpha', 'target_alpha', 'zhihu',
       'executor-opaque-1', 'wechatsync-v1', NULL, NULL, NULL, NULL,
       'sha256-content-1', '[]', 'DRAFT_CREATED', NULL, NULL, NULL, '{}'`,
    );

    const rows = await db
      .select()
      .from(publicationReceipts)
      .where(eq(publicationReceipts.id, "receipt_minimal"));
    expect(rows[0]).toMatchObject({
      externalDraftId: null,
      externalTaskId: null,
      externalContentId: null,
      publicUrl: null,
      submittedAt: null,
      publishedAt: null,
      verifiedAt: null,
    });
  });

  it("rejects a second receipt for the same job and allows receipts for different jobs", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedJob("job_alpha", "proj_alpha", "target_alpha", "plan_alpha");
    await seedJob("job_alpha_2", "proj_alpha", "target_alpha", "plan_alpha");
    await insertReceipt({
      id: "receipt_1",
      publishingJobId: "job_alpha",
      releaseTargetId: "target_alpha",
    });

    // A different job under the same target is allowed.
    await insertReceipt({
      id: "receipt_2",
      publishingJobId: "job_alpha_2",
      releaseTargetId: "target_alpha",
    });

    await expect(
      insertReceipt({
        id: "receipt_duplicate",
        publishingJobId: "job_alpha",
        releaseTargetId: "target_alpha",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/i);

    const rows = await db.select().from(publicationReceipts);
    expect(rows).toHaveLength(2);
  });

  it("rejects a receipt whose job belongs to another Project in either direction", async () => {
    await seedContent("proj_alpha");
    await seedContent("proj_beta");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedTargetAndPlan("target_beta", "plan_beta", "proj_beta");
    await seedJob("job_alpha", "proj_alpha", "target_alpha", "plan_alpha");
    await seedJob("job_beta", "proj_beta", "target_beta", "plan_beta");

    await expect(
      insertReceipt({
        id: "receipt_cross_a",
        projectId: "proj_alpha",
        publishingJobId: "job_beta",
        releaseTargetId: "target_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertReceipt({
        id: "receipt_cross_b",
        projectId: "proj_beta",
        publishingJobId: "job_alpha",
        releaseTargetId: "target_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a receipt whose job belongs to a different ReleaseTarget of the same Project", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedTargetAndPlan("target_alpha_2", "plan_alpha_2", "proj_alpha");
    await seedJob(
      "job_alpha_2",
      "proj_alpha",
      "target_alpha_2",
      "plan_alpha_2",
    );

    // Same Project, same target on the receipt, but the job's own ReleaseTarget
    // is target_alpha_2. The composite FK (project, target, job) rejects it.
    await expect(
      insertReceipt({
        id: "receipt_job_target_mismatch",
        publishingJobId: "job_alpha_2",
        releaseTargetId: "target_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a receipt whose job, target or Project does not exist", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedJob("job_alpha", "proj_alpha", "target_alpha", "plan_alpha");

    await expect(
      insertReceipt({
        id: "receipt_dangling_job",
        publishingJobId: "job_missing",
        releaseTargetId: "target_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertReceipt({
        id: "receipt_dangling_target",
        publishingJobId: "job_alpha",
        releaseTargetId: "target_missing",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertReceipt({
        id: "receipt_dangling_project",
        projectId: "proj_missing",
        publishingJobId: "job_alpha",
        releaseTargetId: "target_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a status outside the source-defined enum", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedJob("job_alpha", "proj_alpha", "target_alpha", "plan_alpha");

    for (const status of ["QUEUED", "LEASED", "RUNNING", "PUBLISHED", ""]) {
      await expect(
        insertReceipt({
          id: `receipt_status_${status || "empty"}`,
          publishingJobId: "job_alpha",
          releaseTargetId: "target_alpha",
          status,
        }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("rejects malformed structured documents", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedJob("job_alpha", "proj_alpha", "target_alpha", "plan_alpha");

    await expect(
      insertReceipt({
        id: "receipt_bad_media",
        publishingJobId: "job_alpha",
        releaseTargetId: "target_alpha",
        mediaHashesJson: "{not json",
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);

    await expect(
      insertReceipt({
        id: "receipt_bad_verification",
        publishingJobId: "job_alpha",
        releaseTargetId: "target_alpha",
        verificationJson: "not-json",
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("cascades the receipt away when its job is deleted", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedJob("job_delete", "proj_alpha", "target_alpha", "plan_alpha");
    await insertReceipt({
      id: "receipt_delete_job",
      publishingJobId: "job_delete",
      releaseTargetId: "target_alpha",
    });

    await client.execute("DELETE FROM publishing_jobs WHERE id = 'job_delete'");

    const rows = await db
      .select()
      .from(publicationReceipts)
      .where(eq(publicationReceipts.id, "receipt_delete_job"));
    expect(rows).toHaveLength(0);
  });

  it("cascades the receipt away when its ReleaseTarget is deleted", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_delete", "plan_delete", "proj_alpha");
    await seedJob("job_delete", "proj_alpha", "target_delete", "plan_delete");
    await insertReceipt({
      id: "receipt_delete_target",
      publishingJobId: "job_delete",
      releaseTargetId: "target_delete",
    });

    await client.execute(
      "DELETE FROM release_targets WHERE id = 'target_delete'",
    );

    const rows = await db
      .select()
      .from(publicationReceipts)
      .where(eq(publicationReceipts.id, "receipt_delete_target"));
    expect(rows).toHaveLength(0);
  });

  it("cascades receipts away on a whole-project delete", async () => {
    await seedContent("proj_delete");
    await seedTargetAndPlan(
      "target_proj_delete",
      "plan_proj_delete",
      "proj_delete",
    );
    await seedJob(
      "job_proj_delete",
      "proj_delete",
      "target_proj_delete",
      "plan_proj_delete",
    );
    await insertReceipt({
      id: "receipt_delete_project",
      projectId: "proj_delete",
      publishingJobId: "job_proj_delete",
      releaseTargetId: "target_proj_delete",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const rows = await db
      .select()
      .from(publicationReceipts)
      .where(eq(publicationReceipts.projectId, "proj_delete"));
    expect(rows).toHaveLength(0);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedJob("job_alpha", "proj_alpha", "target_alpha", "plan_alpha");
    const insertWith = (values: string) => insertReceiptValues(values);

    // project_id has no default and is required.
    await expect(
      insertWith(
        `'receipt_no_project', NULL, 'job_alpha', 'target_alpha', 'zhihu',
         'executor-opaque-1', 'wechatsync-v1', NULL, NULL, NULL, NULL,
         'sha256-content-1', '[]', 'DRAFT_CREATED', NULL, NULL, NULL, '{}'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // publishing_job_id has no default and is required.
    await expect(
      insertWith(
        `'receipt_no_job', 'proj_alpha', NULL, 'target_alpha', 'zhihu',
         'executor-opaque-1', 'wechatsync-v1', NULL, NULL, NULL, NULL,
         'sha256-content-1', '[]', 'DRAFT_CREATED', NULL, NULL, NULL, '{}'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // release_target_id has no default and is required.
    await expect(
      insertWith(
        `'receipt_no_target', 'proj_alpha', 'job_alpha', NULL, 'zhihu',
         'executor-opaque-1', 'wechatsync-v1', NULL, NULL, NULL, NULL,
         'sha256-content-1', '[]', 'DRAFT_CREATED', NULL, NULL, NULL, '{}'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // platform has no default and is required.
    await expect(
      insertWith(
        `'receipt_no_platform', 'proj_alpha', 'job_alpha', 'target_alpha', NULL,
         'executor-opaque-1', 'wechatsync-v1', NULL, NULL, NULL, NULL,
         'sha256-content-1', '[]', 'DRAFT_CREATED', NULL, NULL, NULL, '{}'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // executor_id / executor_version have no default and are required.
    await expect(
      insertWith(
        `'receipt_no_executor', 'proj_alpha', 'job_alpha', 'target_alpha',
         'zhihu', NULL, 'wechatsync-v1', NULL, NULL, NULL, NULL,
         'sha256-content-1', '[]', 'DRAFT_CREATED', NULL, NULL, NULL, '{}'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // content_hash has no default and is required.
    await expect(
      insertWith(
        `'receipt_no_hash', 'proj_alpha', 'job_alpha', 'target_alpha', 'zhihu',
         'executor-opaque-1', 'wechatsync-v1', NULL, NULL, NULL, NULL, NULL,
         '[]', 'DRAFT_CREATED', NULL, NULL, NULL, '{}'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // media_hashes_json has no default and is required.
    await expect(
      insertWith(
        `'receipt_no_media', 'proj_alpha', 'job_alpha', 'target_alpha', 'zhihu',
         'executor-opaque-1', 'wechatsync-v1', NULL, NULL, NULL, NULL,
         'sha256-content-1', NULL, 'DRAFT_CREATED', NULL, NULL, NULL, '{}'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // status has no default and is required.
    await expect(
      insertWith(
        `'receipt_no_status', 'proj_alpha', 'job_alpha', 'target_alpha', 'zhihu',
         'executor-opaque-1', 'wechatsync-v1', NULL, NULL, NULL, NULL,
         'sha256-content-1', '[]', NULL, NULL, NULL, NULL, '{}'`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // verification_json has no default and is required.
    await expect(
      insertWith(
        `'receipt_no_verification', 'proj_alpha', 'job_alpha', 'target_alpha',
         'zhihu', 'executor-opaque-1', 'wechatsync-v1', NULL, NULL, NULL, NULL,
         'sha256-content-1', '[]', 'DRAFT_CREATED', NULL, NULL, NULL, NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("ships ONLY the direct receipt evidence field set", async () => {
    // The exact TASK field list (id, project_id, publishing_job_id,
    // release_target_id, platform, executor_id, executor_version,
    // external_draft_id, external_task_id, external_content_id, public_url,
    // content_hash, media_hashes_json, status, submitted_at, published_at,
    // verified_at, verification_json) plus created_at. No updated_at, no
    // connector/credential column, no route/execution column and no
    // citation-attribution column.
    expect(await columnNames("publication_receipts")).toEqual([
      "content_hash",
      "created_at",
      "executor_id",
      "executor_version",
      "external_content_id",
      "external_draft_id",
      "external_task_id",
      "id",
      "media_hashes_json",
      "platform",
      "project_id",
      "public_url",
      "published_at",
      "publishing_job_id",
      "release_target_id",
      "status",
      "submitted_at",
      "verification_json",
      "verified_at",
    ]);
  });
});

describe("geo_citations -> publication_receipts matched-receipt relation", () => {
  it("allows a same-Project receipt match and a NULL match", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedJob("job_alpha", "proj_alpha", "target_alpha", "plan_alpha");
    await insertReceipt({
      id: "receipt_alpha",
      publishingJobId: "job_alpha",
      releaseTargetId: "target_alpha",
    });
    const parseId = await seedParseForProject("proj_alpha");

    // The receipt and the citation share proj_alpha, so the composite FK
    // (project_id, matched_publication_receipt_id) has a matching parent row;
    // NULL means no receipt matched and the FK is not enforced.
    await insertCitation(
      "citation_matched",
      "proj_alpha",
      parseId,
      "receipt_alpha",
    );
    await insertCitation("citation_unmatched", "proj_alpha", parseId, null);

    const rows = await db.select().from(geoCitations);
    const stored = sort(
      rows.map(
        (row) => `${row.id}:${row.matchedPublicationReceiptId ?? "NULL"}`,
      ),
      (a, b) => a.localeCompare(b),
    );
    expect(stored).toEqual([
      "citation_matched:receipt_alpha",
      "citation_unmatched:NULL",
    ]);
  });

  it("rejects a citation matched to a receipt on another Project", async () => {
    await seedContent("proj_alpha");
    await seedContent("proj_beta");
    await seedTargetAndPlan("target_beta", "plan_beta", "proj_beta");
    await seedJob("job_beta", "proj_beta", "target_beta", "plan_beta");
    await insertReceipt({
      id: "receipt_beta",
      projectId: "proj_beta",
      publishingJobId: "job_beta",
      releaseTargetId: "target_beta",
    });
    const parseId = await seedParseForProject("proj_alpha");

    // The receipt lives under proj_beta while the citation names proj_alpha as
    // its own project. The composite FK has no matching parent row, so the DB
    // rejects the cross-Project reference.
    await expect(
      insertCitation("citation_cross", "proj_alpha", parseId, "receipt_beta"),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a citation matched to a dangling receipt", async () => {
    await seedContent("proj_alpha");
    const parseId = await seedParseForProject("proj_alpha");

    await expect(
      insertCitation(
        "citation_dangling",
        "proj_alpha",
        parseId,
        "receipt_missing",
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("blocks deleting a still-matched receipt and preserves citation history", async () => {
    await seedContent("proj_alpha");
    await seedTargetAndPlan("target_alpha", "plan_alpha", "proj_alpha");
    await seedJob("job_alpha", "proj_alpha", "target_alpha", "plan_alpha");
    await insertReceipt({
      id: "receipt_alpha",
      publishingJobId: "job_alpha",
      releaseTargetId: "target_alpha",
    });
    const parseId = await seedParseForProject("proj_alpha");
    await insertCitation(
      "citation_matched",
      "proj_alpha",
      parseId,
      "receipt_alpha",
    );

    // NO ACTION: a referenced receipt cannot be deleted, so the citation's
    // matched evidence is preserved (SET NULL is impossible here because
    // project_id is NOT NULL; CASCADE would delete the citation).
    await expect(
      client.execute(
        "DELETE FROM publication_receipts WHERE id = 'receipt_alpha'",
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    const surviving = await db
      .select()
      .from(geoCitations)
      .where(eq(geoCitations.id, "citation_matched"));
    expect(surviving).toHaveLength(1);

    // Removing the citation releases the receipt for deletion.
    await client.execute(
      "DELETE FROM geo_citations WHERE id = 'citation_matched'",
    );
    await client.execute(
      "DELETE FROM publication_receipts WHERE id = 'receipt_alpha'",
    );
    const receipts = await db
      .select()
      .from(publicationReceipts)
      .where(eq(publicationReceipts.id, "receipt_alpha"));
    expect(receipts).toHaveLength(0);
  });

  it("removes a matched citation and its receipt on a whole-project teardown", async () => {
    // A fresh Project because an earlier test in this file permanently deletes
    // the seeded proj_delete.
    await client.execute("INSERT INTO projects (id) VALUES ('proj_teardown')");
    await seedContent("proj_teardown");
    await seedTargetAndPlan(
      "target_teardown",
      "plan_teardown",
      "proj_teardown",
    );
    await seedJob(
      "job_teardown",
      "proj_teardown",
      "target_teardown",
      "plan_teardown",
    );
    await insertReceipt({
      id: "receipt_teardown",
      projectId: "proj_teardown",
      publishingJobId: "job_teardown",
      releaseTargetId: "target_teardown",
    });
    const parseId = await seedParseForProject("proj_teardown");
    await insertCitation(
      "citation_teardown",
      "proj_teardown",
      parseId,
      "receipt_teardown",
    );

    // Both rows are Project descendants: the NO ACTION constraint is checked at
    // end-of-statement, so the teardown removes the citation and its receipt.
    await client.execute("DELETE FROM projects WHERE id = 'proj_teardown'");

    expect(await db.select().from(geoCitations)).toHaveLength(0);
    expect(await db.select().from(publicationReceipts)).toHaveLength(0);
  });
});
