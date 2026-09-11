/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole platform_drafts storage contract (valid same-Project persistence with the full field set and NULL optional fields/optional-field fidelity/asset-hash document validity/source-defined draft identity uniqueness/cross-Project rejection in both directions/dangling parents/delete cascades/NOT NULL and exact 13-column shape via the shipped 0079 DDL); splitting would scatter the invariants asserted together */
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
  platformDrafts,
  releaseBundles,
  releaseTargets,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped PlatformDraft table and its parents: market profile 0045,
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
// target the draft FK requires), then 0079 (the platform_drafts table itself).
// The spec creates the `projects` table directly and applies the DDL in order.
// Foreign keys are ON so the Project FK, the same-Project composite FK to the
// ReleaseTarget, the source-defined (platform, account_id, draft_id) UNIQUE
// index, the asset-hash JSON validity CHECK and the delete cascades are
// exercised against the shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid same-Project draft persists with the full TASK field set (stable
//     id, project_id, release_target_id, platform, opaque account_id/draft_id,
//     optional draft_url, content_hash, asset_hashes_json, opaque stager_id/
//     stager_version, optional verified_at) plus the append-only created_at
//     timestamp; the optional fields default NULL.
//   - The source-defined (platform, account_id, draft_id) identity triple is
//     unique, while a different platform/account/draft id and multiple drafts
//     per ReleaseTarget remain allowed.
//   - A draft whose ReleaseTarget belongs to another Project — in EITHER
//     direction — is rejected by the composite FK; a draft whose parent is
//     missing is rejected.
//   - Deleting its ReleaseTarget or its whole Project cascades the draft away.
//   - The asset-hash document must be valid JSON (malformed JSON rejected).
//   - The table ships ONLY the direct draft-evidence field set (no public URL
//     verification, route, status/lifecycle, job, receipt or credential column).

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
  "drizzle/0079_same_mindworm.sql",
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
const DRAFT_COLUMNS = `(id, project_id, release_target_id, platform, account_id,
  draft_id, draft_url, content_hash, asset_hashes_json, stager_id, stager_version,
  verified_at)`;

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
  // Child-first teardown: platform_drafts references release_targets;
  // release_targets references release_bundles and content_variants; both
  // reference content_package_versions; that references content_packages; that
  // references search_topics.
  await db.delete(platformDrafts);
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
// ReleaseTarget under a project, so a draft's ReleaseTarget parent exists.
async function seedDraftParent(prefix: string, projectId: string) {
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

type DraftSeed = {
  id: string;
  projectId?: string;
  releaseTargetId: string;
  platform?: string;
  accountId?: string;
  draftId?: string;
  draftUrl?: string | null;
  contentHash?: string;
  assetHashesJson?: string;
  stagerId?: string;
  stagerVersion?: string;
  verifiedAt?: string | null;
};

async function insertDraftValues(values: string) {
  await client.execute(
    `INSERT INTO platform_drafts ${DRAFT_COLUMNS} VALUES (${values})`,
  );
}

async function insertDraft(seed: DraftSeed) {
  await insertDraftValues(
    [
      `'${seed.id}'`,
      literal(seed.projectId, "proj_alpha"),
      `'${seed.releaseTargetId}'`,
      literal(seed.platform, "zhihu"),
      literal(seed.accountId, "acct_1"),
      literal(seed.draftId, `draftid_${seed.id}`),
      literal(seed.draftUrl, null),
      literal(seed.contentHash, `sha256-${seed.id}`),
      literal(seed.assetHashesJson, '["sha256-asset-1"]'),
      literal(seed.stagerId, "wechatsync"),
      literal(seed.stagerVersion, "1.1.0"),
      literal(seed.verifiedAt, null),
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

describe("platform_drafts storage contract", () => {
  it("persists a valid same-Project draft with the full field set", async () => {
    await seedDraftParent("alpha", "proj_alpha");
    await insertDraft({
      id: "draft_alpha_1",
      releaseTargetId: "target_alpha",
      draftUrl: "https://zhuanlan.zhihu.com/p/draft/123",
      verifiedAt: "2026-09-11T05:30:00.000Z",
    });

    const rows = await db
      .select()
      .from(platformDrafts)
      .where(eq(platformDrafts.id, "draft_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "draft_alpha_1",
      projectId: "proj_alpha",
      releaseTargetId: "target_alpha",
      platform: "zhihu",
      accountId: "acct_1",
      draftId: "draftid_draft_alpha_1",
      draftUrl: "https://zhuanlan.zhihu.com/p/draft/123",
      contentHash: "sha256-draft_alpha_1",
      assetHashesJson: '["sha256-asset-1"]',
      stagerId: "wechatsync",
      stagerVersion: "1.1.0",
      verifiedAt: "2026-09-11T05:30:00.000Z",
    });
    // `verifiedAt` records DRAFT verification only — there is no public-success
    // column anywhere on the row.
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("defaults the optional draft URL and verification timestamp to NULL", async () => {
    await seedDraftParent("alpha", "proj_alpha");
    await insertDraft({ id: "draft_minimal", releaseTargetId: "target_alpha" });

    const rows = await db
      .select()
      .from(platformDrafts)
      .where(eq(platformDrafts.id, "draft_minimal"));
    expect(rows[0].draftUrl).toBeNull();
    expect(rows[0].verifiedAt).toBeNull();
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("rejects malformed JSON in the asset-hash document", async () => {
    await seedDraftParent("alpha", "proj_alpha");
    await expect(
      insertDraft({
        id: "draft_bad_hashes",
        releaseTargetId: "target_alpha",
        assetHashesJson: "{not json",
      }),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("rejects a duplicate source-defined (platform, account_id, draft_id) identity", async () => {
    await seedDraftParent("alpha", "proj_alpha");
    await seedTarget("target_alpha_b", "proj_alpha", "alpha");
    await insertDraft({
      id: "draft_identity_1",
      releaseTargetId: "target_alpha",
      platform: "zhihu",
      accountId: "acct_1",
      draftId: "remote-draft-1",
    });
    // Same external identity on another target is still the same remote draft.
    await expect(
      insertDraft({
        id: "draft_identity_dup",
        releaseTargetId: "target_alpha_b",
        platform: "zhihu",
        accountId: "acct_1",
        draftId: "remote-draft-1",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("allows a different platform, account or draft id, and multiple drafts per target", async () => {
    await seedDraftParent("alpha", "proj_alpha");
    // A second draft on the SAME ReleaseTarget (e.g. another platform) is
    // allowed: there is no one-draft-per-target rule.
    await insertDraft({
      id: "draft_same_target_1",
      releaseTargetId: "target_alpha",
      platform: "zhihu",
      accountId: "acct_1",
      draftId: "remote-draft-1",
    });
    await insertDraft({
      id: "draft_same_target_2",
      releaseTargetId: "target_alpha",
      platform: "juejin",
      accountId: "acct_1",
      draftId: "remote-draft-1",
    });
    await insertDraft({
      id: "draft_same_target_3",
      releaseTargetId: "target_alpha",
      platform: "zhihu",
      accountId: "acct_2",
      draftId: "remote-draft-1",
    });
    await insertDraft({
      id: "draft_same_target_4",
      releaseTargetId: "target_alpha",
      platform: "zhihu",
      accountId: "acct_1",
      draftId: "remote-draft-2",
    });

    const rows = await db
      .select()
      .from(platformDrafts)
      .where(eq(platformDrafts.releaseTargetId, "target_alpha"));
    expect(rows).toHaveLength(4);
  });

  it("rejects a draft whose ReleaseTarget belongs to another Project in either direction", async () => {
    await seedDraftParent("alpha", "proj_alpha");
    await seedDraftParent("beta", "proj_beta");

    // Draft on proj_alpha naming proj_beta's target.
    await expect(
      insertDraft({
        id: "draft_cross_a",
        projectId: "proj_alpha",
        releaseTargetId: "target_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // Draft on proj_beta naming proj_alpha's target.
    await expect(
      insertDraft({
        id: "draft_cross_b",
        projectId: "proj_beta",
        releaseTargetId: "target_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a draft whose ReleaseTarget or Project does not exist", async () => {
    await seedDraftParent("alpha", "proj_alpha");

    await expect(
      insertDraft({
        id: "draft_dangling_target",
        releaseTargetId: "target_missing",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertDraft({
        id: "draft_dangling_project",
        projectId: "proj_missing",
        releaseTargetId: "target_alpha",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("cascades the draft away when its ReleaseTarget is deleted", async () => {
    await seedDraftParent("delete", "proj_alpha");
    await insertDraft({
      id: "draft_delete_target",
      releaseTargetId: "target_delete",
    });

    await client.execute(
      "DELETE FROM release_targets WHERE id = 'target_delete'",
    );

    const rows = await db
      .select()
      .from(platformDrafts)
      .where(eq(platformDrafts.id, "draft_delete_target"));
    expect(rows).toHaveLength(0);
  });

  it("cascades drafts away on a whole-project delete", async () => {
    await seedDraftParent("proj_delete", "proj_delete");
    await insertDraft({
      id: "draft_delete_project",
      projectId: "proj_delete",
      releaseTargetId: "target_proj_delete",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const rows = await db
      .select()
      .from(platformDrafts)
      .where(eq(platformDrafts.projectId, "proj_delete"));
    expect(rows).toHaveLength(0);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    await seedDraftParent("alpha", "proj_alpha");
    const insertWith = (values: string) => insertDraftValues(values);

    // project_id has no default and is required.
    await expect(
      insertWith(
        `'draft_no_project', NULL, 'target_alpha', 'zhihu', 'acct_1',
         'remote-1', NULL, 'hash', '[]', 'wechatsync', '1.1.0', NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // release_target_id has no default and is required.
    await expect(
      insertWith(
        `'draft_no_target', 'proj_alpha', NULL, 'zhihu', 'acct_1',
         'remote-1', NULL, 'hash', '[]', 'wechatsync', '1.1.0', NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // platform has no default and is required.
    await expect(
      insertWith(
        `'draft_no_platform', 'proj_alpha', 'target_alpha', NULL, 'acct_1',
         'remote-1', NULL, 'hash', '[]', 'wechatsync', '1.1.0', NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // account_id has no default and is required.
    await expect(
      insertWith(
        `'draft_no_account', 'proj_alpha', 'target_alpha', 'zhihu', NULL,
         'remote-1', NULL, 'hash', '[]', 'wechatsync', '1.1.0', NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // draft_id has no default and is required.
    await expect(
      insertWith(
        `'draft_no_draftid', 'proj_alpha', 'target_alpha', 'zhihu', 'acct_1',
         NULL, NULL, 'hash', '[]', 'wechatsync', '1.1.0', NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // content_hash has no default and is required.
    await expect(
      insertWith(
        `'draft_no_content', 'proj_alpha', 'target_alpha', 'zhihu', 'acct_1',
         'remote-1', NULL, NULL, '[]', 'wechatsync', '1.1.0', NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // asset_hashes_json has no default and is required.
    await expect(
      insertWith(
        `'draft_no_hashes', 'proj_alpha', 'target_alpha', 'zhihu', 'acct_1',
         'remote-1', NULL, 'hash', NULL, 'wechatsync', '1.1.0', NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // stager_id has no default and is required.
    await expect(
      insertWith(
        `'draft_no_stager', 'proj_alpha', 'target_alpha', 'zhihu', 'acct_1',
         'remote-1', NULL, 'hash', '[]', NULL, '1.1.0', NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // stager_version has no default and is required.
    await expect(
      insertWith(
        `'draft_no_stager_version', 'proj_alpha', 'target_alpha', 'zhihu',
         'acct_1', 'remote-1', NULL, 'hash', '[]', 'wechatsync', NULL, NULL`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("ships ONLY the direct draft-evidence field set", async () => {
    // The exact TASK field list (id, project_id, release_target_id, platform,
    // account_id, draft_id, draft_url, content_hash, asset_hashes_json,
    // stager_id, stager_version, verified_at) plus the append-only created_at.
    // No public URL verification/`PUBLIC_VERIFIED` column, no route/
    // status/lifecycle/retry/job column, no receipt column and no publisher
    // connection/credential column.
    expect(await columnNames("platform_drafts")).toEqual([
      "account_id",
      "asset_hashes_json",
      "content_hash",
      "created_at",
      "draft_id",
      "draft_url",
      "id",
      "platform",
      "project_id",
      "release_target_id",
      "stager_id",
      "stager_version",
      "verified_at",
    ]);
  });
});
