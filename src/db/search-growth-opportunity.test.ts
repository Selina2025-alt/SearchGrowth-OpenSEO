/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole search_growth_opportunities storage contract (valid/same-Project/cross-Project/mismatched-project/optional-parent/delete/nullable/enum round-trip/enum rejection/snapshot persistence/schema shape) through the shipped 0055 DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  searchGrowthOpportunities,
  searchMarketProfiles,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// normalized opportunity table (0055) and its parents: market profile 0045,
// topic 0046, and prompt 0049 (which creates the
// `search_market_profiles_project_id_id_idx` composite-FK target the
// opportunity's same-Project MarketProfile FK references). Foreign keys are ON
// so the composite same-Project Topic/MarketProfile FKs, the enum CHECK
// constraints, the snapshot persistence and the cascade behavior are exercised
// against the shipped DDL.
//
// Invariants: a valid §8 opportunity persists with the full direct field set
// (topic, optional market profile, profile, page-fit action, optional target
// URL, score/data-quality/evidence snapshots, reason, recommended action,
// source snapshot time, system timestamps) and the optional fields store NULL
// when omitted; the required fields are enforced; an opportunity whose Topic or
// MarketProfile does not exist is rejected; an opportunity binds to same-Project
// Topic and optional MarketProfile — cross-Project parents and explicit Project
// mismatches are rejected by the composite FKs; every canonical profile and
// page-fit value round-trips and unsupported values are rejected by the named
// CHECK constraints; the JSON snapshot payloads persist byte-for-byte (never
// parsed/transformed by the DB); deleting a Topic, a MarketProfile, or a whole
// Project cascades the opportunity away; and the schema ships ONLY the direct/
// reconciled field set plus the system timestamps (no reference-only status/
// final_score column and no business-unique index).

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
];

let client: Client;
let db: ReturnType<typeof drizzle>;

type NewOpportunity = typeof searchGrowthOpportunities.$inferInsert;

// Canonical snapshot fixtures (produced by the later out-of-scope opportunity
// computation; this slice only persists them as opaque JSON text).
const SCORE_SNAPSHOT = JSON.stringify({
  businessFit: 80,
  buyingIntent: 65,
  seoSignal: 70,
  searchDemand: 60,
  rankGap: 45,
  geoGap: 75,
  citationSourceGap: 40,
  executionEase: 90,
  finalScore: 78.4,
});
const DATA_QUALITY_SNAPSHOT = JSON.stringify({
  status: "DEGRADED",
  warnings: ["NO_GA4", "LOW_SAMPLE"],
  successfulSamples: 3,
  attemptedSamples: 10,
});
const EVIDENCE_SNAPSHOT = JSON.stringify({
  claimRefs: ["claim_alpha_1"],
  sourceNotes: "manual review of the SERP snapshot",
});

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
  // Child-first teardown: opportunities reference topics/market profiles.
  await db.delete(searchGrowthOpportunities);
  await db.delete(searchMarketProfiles);
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

async function seedMarketProfile(id: string, projectId: string) {
  await db.insert(searchMarketProfiles).values({
    id,
    projectId,
    name: `Market ${id}`,
    searchEngine: "GOOGLE",
    locationCode: "2840",
    locationName: "United States",
    languageCode: "en",
    device: "DESKTOP",
    country: "US",
  });
}

async function insertOpportunity(
  id: string,
  overrides: Partial<NewOpportunity> = {},
) {
  await db.insert(searchGrowthOpportunities).values({
    id,
    projectId: "proj_alpha",
    topicId: "topic_alpha",
    profile: "NEW_TOPIC",
    pageFitAction: "NEW_PAGE",
    scoreJson: SCORE_SNAPSHOT,
    dataQualityJson: DATA_QUALITY_SNAPSHOT,
    evidenceSnapshotJson: EVIDENCE_SNAPSHOT,
    reason: "No existing page ranks for this topic.",
    recommendedAction: "Create a new page targeting the topic.",
    sourceSnapshotAt: "2026-09-08T04:00:05.000Z",
    ...overrides,
  });
}

async function opportunityIdsForTopic(topicId: string) {
  const rows = await db
    .select({ id: searchGrowthOpportunities.id })
    .from(searchGrowthOpportunities)
    .where(eq(searchGrowthOpportunities.topicId, topicId));
  return sort(
    rows.map((row) => row.id),
    (a, b) => a.localeCompare(b),
  );
}

const OPPORTUNITY_COLUMN_INSERT = `(id, project_id, topic_id, profile,
  page_fit_action, score_json, data_quality_json, evidence_snapshot_json,
  reason, recommended_action, source_snapshot_at)`;

describe("search_growth_opportunities storage contract", () => {
  it("persists a valid opportunity with the full direct V1.0 field set", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedMarketProfile("profile_alpha", "proj_alpha");
    // The full §8 field set: same-Project topic + optional market profile,
    // profile, page-fit action, target page URL, the three immutable snapshot
    // payloads, reason, recommended action and the source snapshot time.
    await insertOpportunity("opportunity_alpha_1", {
      topicId: "topic_alpha",
      marketProfileId: "profile_alpha",
      profile: "EXISTING_GOOGLE_PAGE",
      pageFitAction: "REFRESH_PAGE",
      targetPageUrl: "https://example.com/solutions/rfq",
      scoreJson: SCORE_SNAPSHOT,
      dataQualityJson: DATA_QUALITY_SNAPSHOT,
      evidenceSnapshotJson: EVIDENCE_SNAPSHOT,
      reason: "GSC shows impressions but low CTR for the target query.",
      recommendedAction: "Refresh /solutions/rfq with approved claims.",
      sourceSnapshotAt: "2026-09-08T04:00:05.000Z",
    });

    const rows = await db
      .select()
      .from(searchGrowthOpportunities)
      .where(eq(searchGrowthOpportunities.id, "opportunity_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "opportunity_alpha_1",
      projectId: "proj_alpha",
      topicId: "topic_alpha",
      marketProfileId: "profile_alpha",
      profile: "EXISTING_GOOGLE_PAGE",
      pageFitAction: "REFRESH_PAGE",
      targetPageUrl: "https://example.com/solutions/rfq",
      scoreJson: SCORE_SNAPSHOT,
      dataQualityJson: DATA_QUALITY_SNAPSHOT,
      evidenceSnapshotJson: EVIDENCE_SNAPSHOT,
      reason: "GSC shows impressions but low CTR for the target query.",
      recommendedAction: "Refresh /solutions/rfq with approved claims.",
      sourceSnapshotAt: "2026-09-08T04:00:05.000Z",
    });
    expect(rows[0].createdAt).toBeTruthy();
    expect(rows[0].updatedAt).toBeTruthy();
  });

  it("stores the optional fields as NULL when a row omits them", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    // Raw insert omits market_profile_id and target_page_url so the DB NULL
    // defaults apply for an opportunity not scoped to a market and not targeting
    // an existing page.
    await client.execute(
      `INSERT INTO search_growth_opportunities ${OPPORTUNITY_COLUMN_INSERT}
       VALUES ('opportunity_plain', 'proj_alpha', 'topic_alpha',
               'NEW_TOPIC', 'NEW_PAGE',
               '${SCORE_SNAPSHOT}',
               '${DATA_QUALITY_SNAPSHOT}',
               '${EVIDENCE_SNAPSHOT}',
               'No page exists.', 'Create a new page.', '2026-09-08T04:00:05.000Z')`,
    );

    const rows = await db
      .select()
      .from(searchGrowthOpportunities)
      .where(eq(searchGrowthOpportunities.id, "opportunity_plain"));
    expect(rows).toHaveLength(1);
    expect(rows[0].marketProfileId).toBeNull();
    expect(rows[0].targetPageUrl).toBeNull();
  });

  it("requires the direct identity/content columns (NOT NULL)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");

    // reason has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO search_growth_opportunities ${OPPORTUNITY_COLUMN_INSERT}
         VALUES ('opportunity_no_reason', 'proj_alpha', 'topic_alpha',
                 'NEW_TOPIC', 'NEW_PAGE',
                 '${SCORE_SNAPSHOT}',
                 '${DATA_QUALITY_SNAPSHOT}',
                 '${EVIDENCE_SNAPSHOT}',
                 NULL, 'Create a new page.', '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // score_json is a required immutable snapshot column.
    await expect(
      client.execute(
        `INSERT INTO search_growth_opportunities ${OPPORTUNITY_COLUMN_INSERT}
         VALUES ('opportunity_no_score', 'proj_alpha', 'topic_alpha',
                 'NEW_TOPIC', 'NEW_PAGE',
                 NULL,
                 '${DATA_QUALITY_SNAPSHOT}',
                 '${EVIDENCE_SNAPSHOT}',
                 'No page exists.', 'Create a new page.', '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("allows an opportunity whose Topic and MarketProfile share the same Project", async () => {
    await seedTopic("topic_beta", "proj_beta");
    await seedMarketProfile("profile_beta", "proj_beta");
    await insertOpportunity("opportunity_beta_1", {
      projectId: "proj_beta",
      topicId: "topic_beta",
      marketProfileId: "profile_beta",
      profile: "GEO_DISTRIBUTION",
      pageFitAction: "DISTRIBUTE_ONLY",
    });

    const rows = await db
      .select()
      .from(searchGrowthOpportunities)
      .where(eq(searchGrowthOpportunities.id, "opportunity_beta_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "opportunity_beta_1",
      projectId: "proj_beta",
      topicId: "topic_beta",
      marketProfileId: "profile_beta",
      profile: "GEO_DISTRIBUTION",
      pageFitAction: "DISTRIBUTE_ONLY",
    });
  });

  it("rejects an opportunity whose Topic does not exist (dangling topic)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO search_growth_opportunities ${OPPORTUNITY_COLUMN_INSERT}
         VALUES ('opportunity_orphan_topic', 'proj_alpha', 'topic_missing',
                 'NEW_TOPIC', 'NEW_PAGE',
                 '${SCORE_SNAPSHOT}',
                 '${DATA_QUALITY_SNAPSHOT}',
                 '${EVIDENCE_SNAPSHOT}',
                 'No page exists.', 'Create a new page.', '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects an opportunity whose MarketProfile does not exist (dangling profile)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO search_growth_opportunities
           (id, project_id, topic_id, market_profile_id, profile,
            page_fit_action, score_json, data_quality_json,
            evidence_snapshot_json, reason, recommended_action,
            source_snapshot_at)
         VALUES ('opportunity_orphan_profile', 'proj_alpha', 'topic_alpha',
                 'profile_missing', 'NEW_TOPIC', 'NEW_PAGE',
                 '${SCORE_SNAPSHOT}',
                 '${DATA_QUALITY_SNAPSHOT}',
                 '${EVIDENCE_SNAPSHOT}',
                 'No page exists.', 'Create a new page.', '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects an opportunity that binds a Project-B Topic into a Project-A row (cross-Project)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedTopic("topic_beta", "proj_beta");

    // topic_beta lives beneath proj_beta while the opportunity names proj_alpha
    // as its own project. The composite FK (project_id, topic_id) ->
    // search_topics(project_id, id) has no matching parent row, so the DB
    // rejects the cross-Project opportunity.
    await expect(
      client.execute(
        `INSERT INTO search_growth_opportunities ${OPPORTUNITY_COLUMN_INSERT}
         VALUES ('opportunity_cross_topic', 'proj_alpha', 'topic_beta',
                 'NEW_TOPIC', 'NEW_PAGE',
                 '${SCORE_SNAPSHOT}',
                 '${DATA_QUALITY_SNAPSHOT}',
                 '${EVIDENCE_SNAPSHOT}',
                 'No page exists.', 'Create a new page.', '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects an opportunity that binds a Project-B MarketProfile into a Project-A row (cross-Project)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedMarketProfile("profile_beta", "proj_beta");

    // profile_beta belongs to proj_beta while the opportunity names proj_alpha.
    // The composite FK (project_id, market_profile_id) has no matching parent
    // row under proj_alpha, so the DB rejects the cross-Project profile.
    await expect(
      client.execute(
        `INSERT INTO search_growth_opportunities
           (id, project_id, topic_id, market_profile_id, profile,
            page_fit_action, score_json, data_quality_json,
            evidence_snapshot_json, reason, recommended_action,
            source_snapshot_at)
         VALUES ('opportunity_cross_profile', 'proj_alpha', 'topic_alpha',
                 'profile_beta', 'NEW_TOPIC', 'NEW_PAGE',
                 '${SCORE_SNAPSHOT}',
                 '${DATA_QUALITY_SNAPSHOT}',
                 '${EVIDENCE_SNAPSHOT}',
                 'No page exists.', 'Create a new page.', '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects an explicit opportunity Project mismatch (row project differs from its Topic Project)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");

    // The topic row lives on proj_alpha, but the opportunity names proj_beta as
    // its own project. Neither the project FK nor the composite
    // (project_id, topic_id) FK has a matching parent row under proj_beta, so
    // the DB rejects the explicit mismatch.
    await expect(
      client.execute(
        `INSERT INTO search_growth_opportunities ${OPPORTUNITY_COLUMN_INSERT}
         VALUES ('opportunity_wrong_project', 'proj_beta', 'topic_alpha',
                 'NEW_TOPIC', 'NEW_PAGE',
                 '${SCORE_SNAPSHOT}',
                 '${DATA_QUALITY_SNAPSHOT}',
                 '${EVIDENCE_SNAPSHOT}',
                 'No page exists.', 'Create a new page.', '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("round-trips every canonical profile and page-fit action enum value", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    const profiles = [
      "EXISTING_GOOGLE_PAGE",
      "EXISTING_SEARCH_PAGE_PARTIAL",
      "NEW_TOPIC",
      "GEO_DISTRIBUTION",
      "EVIDENCE_ONLY",
      "TECHNICAL_BLOCKER",
    ] as const;
    const actions = [
      "NEW_PAGE",
      "REFRESH_PAGE",
      "MERGE",
      "DISTRIBUTE_ONLY",
      "EVIDENCE_ONLY",
      "TECHNICAL_FIX",
    ] as const;

    for (const [index, profile] of profiles.entries()) {
      await client.execute(
        `INSERT INTO search_growth_opportunities ${OPPORTUNITY_COLUMN_INSERT}
         VALUES ('opportunity_profile_${index}', 'proj_alpha', 'topic_alpha',
                 '${profile}', 'NEW_PAGE',
                 '${SCORE_SNAPSHOT}',
                 '${DATA_QUALITY_SNAPSHOT}',
                 '${EVIDENCE_SNAPSHOT}',
                 'Profile fixture ${index}.', 'Act on it.', '2026-09-08T04:00:05.000Z')`,
      );
    }
    for (const [index, pageFitAction] of actions.entries()) {
      await client.execute(
        `INSERT INTO search_growth_opportunities ${OPPORTUNITY_COLUMN_INSERT}
         VALUES ('opportunity_action_${index}', 'proj_alpha', 'topic_alpha',
                 'NEW_TOPIC', '${pageFitAction}',
                 '${SCORE_SNAPSHOT}',
                 '${DATA_QUALITY_SNAPSHOT}',
                 '${EVIDENCE_SNAPSHOT}',
                 'Action fixture ${index}.', 'Act on it.', '2026-09-08T04:00:05.000Z')`,
      );
    }

    const rows = await db
      .select()
      .from(searchGrowthOpportunities)
      .where(eq(searchGrowthOpportunities.topicId, "topic_alpha"));
    const storedProfiles = sort(
      rows
        .filter((row) => row.id.startsWith("opportunity_profile_"))
        .map((row) => row.profile),
      (a, b) => a.localeCompare(b),
    );
    const storedActions = sort(
      rows
        .filter((row) => row.id.startsWith("opportunity_action_"))
        .map((row) => row.pageFitAction),
      (a, b) => a.localeCompare(b),
    );
    expect(storedProfiles).toEqual(
      sort([...profiles] as string[], (a, b) => a.localeCompare(b)),
    );
    expect(storedActions).toEqual(
      sort([...actions] as string[], (a, b) => a.localeCompare(b)),
    );
  });

  it("rejects unsupported profile and page-fit values at the storage boundary (CHECK)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");

    // Not an approved OpportunityProfile value -> the named CHECK rejects it.
    await expect(
      client.execute(
        `INSERT INTO search_growth_opportunities ${OPPORTUNITY_COLUMN_INSERT}
         VALUES ('opportunity_bad_profile', 'proj_alpha', 'topic_alpha',
                 'RANKING_PAGE', 'NEW_PAGE',
                 '${SCORE_SNAPSHOT}',
                 '${DATA_QUALITY_SNAPSHOT}',
                 '${EVIDENCE_SNAPSHOT}',
                 'Bad profile.', 'Act on it.', '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/CHECK constraint failed/i);

    // Not an approved PageFitAction value -> the named CHECK rejects it.
    await expect(
      client.execute(
        `INSERT INTO search_growth_opportunities ${OPPORTUNITY_COLUMN_INSERT}
         VALUES ('opportunity_bad_action', 'proj_alpha', 'topic_alpha',
                 'NEW_TOPIC', 'NOOP',
                 '${SCORE_SNAPSHOT}',
                 '${DATA_QUALITY_SNAPSHOT}',
                 '${EVIDENCE_SNAPSHOT}',
                 'Bad action.', 'Act on it.', '2026-09-08T04:00:05.000Z')`,
      ),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("persists the immutable JSON snapshot payloads byte-for-byte", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await insertOpportunity("opportunity_snapshot_1", {
      scoreJson: SCORE_SNAPSHOT,
      dataQualityJson: DATA_QUALITY_SNAPSHOT,
      evidenceSnapshotJson: EVIDENCE_SNAPSHOT,
    });

    const rows = await db
      .select()
      .from(searchGrowthOpportunities)
      .where(eq(searchGrowthOpportunities.id, "opportunity_snapshot_1"));
    expect(rows).toHaveLength(1);
    // The DB stores the exact payload text — no parse/transform/reorder.
    expect(rows[0].scoreJson).toBe(SCORE_SNAPSHOT);
    expect(rows[0].dataQualityJson).toBe(DATA_QUALITY_SNAPSHOT);
    expect(rows[0].evidenceSnapshotJson).toBe(EVIDENCE_SNAPSHOT);
    // The payloads parse back to the canonical score/DataQuality/evidence
    // shapes the later out-of-scope computation will hand over.
    expect(JSON.parse(rows[0].scoreJson)).toEqual({
      businessFit: 80,
      buyingIntent: 65,
      seoSignal: 70,
      searchDemand: 60,
      rankGap: 45,
      geoGap: 75,
      citationSourceGap: 40,
      executionEase: 90,
      finalScore: 78.4,
    });
    expect(JSON.parse(rows[0].dataQualityJson)).toEqual({
      status: "DEGRADED",
      warnings: ["NO_GA4", "LOW_SAMPLE"],
      successfulSamples: 3,
      attemptedSamples: 10,
    });
  });

  it("cascades an opportunity away when its Topic is deleted", async () => {
    await seedTopic("topic_delete", "proj_alpha");
    await insertOpportunity("opportunity_delete_topic", {
      topicId: "topic_delete",
    });

    await client.execute("DELETE FROM search_topics WHERE id = 'topic_delete'");

    expect(await opportunityIdsForTopic("topic_delete")).toEqual([]);
  });

  it("cascades an opportunity away when its MarketProfile is deleted", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedMarketProfile("profile_delete", "proj_alpha");
    await insertOpportunity("opportunity_delete_profile", {
      marketProfileId: "profile_delete",
    });

    await client.execute(
      "DELETE FROM search_market_profiles WHERE id = 'profile_delete'",
    );

    const rows = await db
      .select()
      .from(searchGrowthOpportunities)
      .where(eq(searchGrowthOpportunities.id, "opportunity_delete_profile"));
    expect(rows).toHaveLength(0);
  });

  it("cascades an opportunity away when its whole Project is deleted", async () => {
    await seedTopic("topic_proj_delete", "proj_delete");
    await db.insert(searchGrowthOpportunities).values({
      id: "opportunity_delete_project",
      projectId: "proj_delete",
      topicId: "topic_proj_delete",
      profile: "NEW_TOPIC",
      pageFitAction: "NEW_PAGE",
      scoreJson: SCORE_SNAPSHOT,
      dataQualityJson: DATA_QUALITY_SNAPSHOT,
      evidenceSnapshotJson: EVIDENCE_SNAPSHOT,
      reason: "No page exists.",
      recommendedAction: "Create a new page.",
      sourceSnapshotAt: "2026-09-08T04:00:05.000Z",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const rows = await db
      .select()
      .from(searchGrowthOpportunities)
      .where(eq(searchGrowthOpportunities.id, "opportunity_delete_project"));
    expect(rows).toHaveLength(0);
    const topics = await db
      .select()
      .from(searchTopics)
      .where(eq(searchTopics.id, "topic_proj_delete"));
    expect(topics).toHaveLength(0);
  });

  it("ships ONLY the direct/reconciled field set plus the system timestamps", async () => {
    const tableInfo = await client.execute(
      "SELECT name FROM pragma_table_info('search_growth_opportunities')",
    );
    const columns = sort(
      tableInfo.rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string"),
      (a, b) => a.localeCompare(b),
    );

    // The exact TASK/§8 field list (id, project_id, topic_id, market_profile_id,
    // profile, page_fit_action, target_page_url, score_json, data_quality_json,
    // evidence_snapshot_json, reason, recommended_action, source_snapshot_at)
    // plus the created_at/updated_at system timestamps. No reference-only
    // `status` lifecycle column, no duplicated `final_score` column, no
    // current-pointer column and no JSON-encoded relationship column.
    expect(columns).toEqual([
      "created_at",
      "data_quality_json",
      "evidence_snapshot_json",
      "id",
      "market_profile_id",
      "page_fit_action",
      "profile",
      "project_id",
      "reason",
      "recommended_action",
      "score_json",
      "source_snapshot_at",
      "target_page_url",
      "topic_id",
      "updated_at",
    ]);
  });
});
