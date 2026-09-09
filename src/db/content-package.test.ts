/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole content_packages storage contract (valid same-Project persistence/opaque verbatim + nullable Opportunity behavior/cross-Project Topic + Opportunity rejection in both directions/dangling parent rejection/NOT NULL required-field rejection/Topic + Opportunity + whole-Project delete cascades/normalized shape) through the shipped 0062 DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  contentPackages,
  searchGrowthOpportunities,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped content-package container table and its parents: market
// profile 0045, topic 0046, prompt 0049 (which creates the
// `search_market_profiles_project_id_id_idx` composite-FK target the accepted
// opportunity table requires), opportunity 0055, then 0062 (which creates
// content_packages and adds the `search_growth_opportunities_project_id_id_idx`
// supporting unique target the same-Project composite FK requires). The spec
// creates the `projects` table directly and applies the DDL in order. Foreign
// keys are ON so the Project FK, the same-Project composite Topic/Opportunity
// FKs, and the delete cascades are exercised against the shipped DDL — not an
// application convention.
//
// Invariants under test:
//   - A valid same-Project content package persists with the full TASK field set
//     (id, project_id, topic_id, optional opportunity_id, title, locale, status)
//     plus the created_at/updated_at audit timestamps; the required opaque
//     `title`/`locale`/`status` values are stored verbatim and `opportunity_id`
//     stores NULL when omitted (nullable-Opportunity behavior) and a value when
//     present.
//   - A package whose Topic or Opportunity belongs to another Project — in EITHER
//     direction — is rejected by the composite FKs; a package whose Topic,
//     Opportunity or Project is missing is rejected.
//   - Deleting a Topic, an Opportunity, or a whole Project cascades its packages
//     away, so a container can never dangle.
//   - The container ships ONLY the direct/reconciled field set (no ContentVersion/
//     variant/brief/metadata/claims/sources/assets/keyword/prompt/market/persona
//     JSON column, no lifecycle enum semantics, and no business-unique index).

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
];

// Canonical opportunity snapshot fixtures (produced by the later out-of-scope
// opportunity computation; this slice only needs the opportunity row as a
// same-Project parent for the container's optional ownership FK).
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

const PACKAGE_COLUMN_INSERT = `(id, project_id, topic_id, title, locale, status)`;
const PACKAGE_COLUMN_INSERT_WITH_OPPORTUNITY = `(id, project_id, topic_id,
  opportunity_id, title, locale, status)`;

let client: Client;
let db: ReturnType<typeof drizzle>;

type NewContentPackage = typeof contentPackages.$inferInsert;

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
  // Child-first teardown: content packages reference topics/opportunities and
  // opportunities reference topics.
  await db.delete(contentPackages);
  await db.delete(searchGrowthOpportunities);
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

async function seedOpportunity(id: string, projectId: string, topicId: string) {
  await db.insert(searchGrowthOpportunities).values({
    id,
    projectId,
    topicId,
    profile: "NEW_TOPIC",
    pageFitAction: "NEW_PAGE",
    scoreJson: SCORE_SNAPSHOT,
    dataQualityJson: DATA_QUALITY_SNAPSHOT,
    evidenceSnapshotJson: EVIDENCE_SNAPSHOT,
    reason: "No existing page ranks for this topic.",
    recommendedAction: "Create a new page targeting the topic.",
    sourceSnapshotAt: "2026-09-08T04:00:05.000Z",
  });
}

async function insertPackage(
  id: string,
  overrides: Partial<NewContentPackage> = {},
) {
  await db.insert(contentPackages).values({
    id,
    projectId: "proj_alpha",
    topicId: "topic_alpha",
    title: "How RFQ portals work in 2026",
    locale: "en",
    status: "planned",
    ...overrides,
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

describe("content_packages storage contract", () => {
  it("persists a valid same-Project container with the full field set", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedOpportunity("opportunity_alpha", "proj_alpha", "topic_alpha");
    // The full TASK field set: same-Project required topic + optional
    // opportunity, opaque title/locale/status and the system timestamps.
    await insertPackage("package_alpha_1", {
      topicId: "topic_alpha",
      opportunityId: "opportunity_alpha",
      title: "How RFQ portals work in 2026",
      locale: "en",
      status: "planned",
    });

    const rows = await db
      .select()
      .from(contentPackages)
      .where(eq(contentPackages.id, "package_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "package_alpha_1",
      projectId: "proj_alpha",
      topicId: "topic_alpha",
      opportunityId: "opportunity_alpha",
      title: "How RFQ portals work in 2026",
      locale: "en",
      status: "planned",
    });
    expect(rows[0].createdAt).toBeTruthy();
    expect(rows[0].updatedAt).toBeTruthy();
  });

  it("stores the opaque container fields verbatim and round-trips a NULL opportunity", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    // Raw insert omits opportunity_id so the DB NULL default applies (no
    // opportunity attached). title/locale/status are opaque and must round-trip
    // exactly as supplied — no normalization or enum interpretation.
    await client.execute(
      `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT}
       VALUES ('package_opaque', 'proj_alpha', 'topic_alpha',
               'RFQ 采购流程 2026 — {zh-CN}', 'zh-CN', 'OPEN_SOURCE_DRAFT')`,
    );

    const rows = await db
      .select()
      .from(contentPackages)
      .where(eq(contentPackages.id, "package_opaque"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId: "proj_alpha",
      topicId: "topic_alpha",
      opportunityId: null,
      title: "RFQ 采购流程 2026 — {zh-CN}",
      locale: "zh-CN",
      status: "OPEN_SOURCE_DRAFT",
    });
  });

  it("rejects a package whose Topic belongs to another Project", async () => {
    // topic_beta lives beneath proj_beta while the package names proj_alpha as
    // its own project. The composite FK (project_id, topic_id) ->
    // search_topics(project_id, id) has no matching parent row under proj_alpha.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedTopic("topic_beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT}
         VALUES ('package_cross_topic', 'proj_alpha', 'topic_beta',
                 'Cross-project topic', 'en', 'planned')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a package whose own Project does not match its Topic's Project", async () => {
    // topic_alpha lives on proj_alpha; the package's own project_id is proj_beta,
    // so the composite FK (project_id, topic_id) -> search_topics(project_id, id)
    // has no matching parent row in the reverse direction.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedTopic("topic_beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT}
         VALUES ('package_wrong_project', 'proj_beta', 'topic_alpha',
                 'Wrong-project topic', 'en', 'planned')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a package whose Opportunity belongs to another Project", async () => {
    // opportunity_beta lives beneath proj_beta (on topic_beta) while the package
    // names proj_alpha. The composite FK (project_id, opportunity_id) has no
    // matching parent row under proj_alpha.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedTopic("topic_beta", "proj_beta");
    await seedOpportunity("opportunity_beta", "proj_beta", "topic_beta");

    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT_WITH_OPPORTUNITY}
         VALUES ('package_cross_opportunity', 'proj_alpha', 'topic_alpha',
                 'opportunity_beta', 'Cross-project opportunity', 'en',
                 'planned')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a package whose own Project does not match its Opportunity's Project", async () => {
    // opportunity_alpha lives on proj_alpha; the package's own project_id is
    // proj_beta (topic_beta passes the topic FK), so the composite FK
    // (project_id, opportunity_id) has no matching parent row in the reverse
    // direction.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedTopic("topic_beta", "proj_beta");
    await seedOpportunity("opportunity_alpha", "proj_alpha", "topic_alpha");

    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT_WITH_OPPORTUNITY}
         VALUES ('package_opp_wrong_project', 'proj_beta', 'topic_beta',
                 'opportunity_alpha', 'Wrong-project opportunity', 'en',
                 'planned')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a package whose Topic does not exist (dangling topic)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT}
         VALUES ('package_dangling_topic', 'proj_alpha', 'topic_missing',
                 'Dangling topic', 'en', 'planned')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a package whose Opportunity does not exist (dangling opportunity)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT_WITH_OPPORTUNITY}
         VALUES ('package_dangling_opportunity', 'proj_alpha', 'topic_alpha',
                 'opportunity_missing', 'Dangling opportunity', 'en',
                 'planned')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a package whose Project does not exist (dangling Project)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT}
         VALUES ('package_dangling_project', 'proj_missing', 'topic_alpha',
                 'Dangling project', 'en', 'planned')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("requires the direct container columns (NOT NULL)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");

    // id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT}
         VALUES (NULL, 'proj_alpha', 'topic_alpha', 'No id', 'en', 'planned')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // project_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT}
         VALUES ('package_no_project', NULL, 'topic_alpha',
                 'No project', 'en', 'planned')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // topic_id has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT}
         VALUES ('package_no_topic', 'proj_alpha', NULL, 'No topic', 'en',
                 'planned')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // title has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT}
         VALUES ('package_no_title', 'proj_alpha', 'topic_alpha', NULL, 'en',
                 'planned')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // locale has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT}
         VALUES ('package_no_locale', 'proj_alpha', 'topic_alpha', 'No locale',
                 NULL, 'planned')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // status has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO content_packages ${PACKAGE_COLUMN_INSERT}
         VALUES ('package_no_status', 'proj_alpha', 'topic_alpha', 'No status',
                 'en', NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("cascades a package away when its Topic is deleted", async () => {
    await seedTopic("topic_delete", "proj_alpha");
    await insertPackage("package_delete_topic", {
      topicId: "topic_delete",
    });

    await client.execute("DELETE FROM search_topics WHERE id = 'topic_delete'");

    const rows = await db
      .select()
      .from(contentPackages)
      .where(eq(contentPackages.id, "package_delete_topic"));
    expect(rows).toHaveLength(0);
  });

  it("cascades a package away when its Opportunity is deleted", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedOpportunity("opportunity_delete", "proj_alpha", "topic_alpha");
    await insertPackage("package_delete_opportunity", {
      opportunityId: "opportunity_delete",
    });

    await client.execute(
      "DELETE FROM search_growth_opportunities WHERE id = 'opportunity_delete'",
    );

    const rows = await db
      .select()
      .from(contentPackages)
      .where(eq(contentPackages.id, "package_delete_opportunity"));
    expect(rows).toHaveLength(0);
  });

  it("cascades packages, opportunities and topics away when their whole Project is deleted", async () => {
    await seedTopic("topic_proj_delete", "proj_delete");
    await seedOpportunity(
      "opportunity_proj_delete",
      "proj_delete",
      "topic_proj_delete",
    );
    await db.insert(contentPackages).values({
      id: "package_delete_project",
      projectId: "proj_delete",
      topicId: "topic_proj_delete",
      opportunityId: "opportunity_proj_delete",
      title: "Project delete package",
      locale: "en",
      status: "planned",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const packages = await db
      .select()
      .from(contentPackages)
      .where(eq(contentPackages.projectId, "proj_delete"));
    expect(packages).toHaveLength(0);
    const opportunities = await db
      .select()
      .from(searchGrowthOpportunities)
      .where(eq(searchGrowthOpportunities.projectId, "proj_delete"));
    expect(opportunities).toHaveLength(0);
    const topics = await db
      .select()
      .from(searchTopics)
      .where(eq(searchTopics.id, "topic_proj_delete"));
    expect(topics).toHaveLength(0);
  });

  it("ships ONLY the normalized direct container field set", async () => {
    // The exact TASK field list (id, project_id, topic_id, opportunity_id,
    // title, locale, status) plus the created_at/updated_at system timestamps.
    // No ContentVersion/variant/brief/metadata/WebPageSpec/claims/sources/
    // assets/keywords/prompts/market/persona JSON column, no lifecycle enum
    // semantics and no business-unique column.
    expect(await columnNames("content_packages")).toEqual([
      "created_at",
      "id",
      "locale",
      "opportunity_id",
      "project_id",
      "status",
      "title",
      "topic_id",
      "updated_at",
    ]);
  });
});
