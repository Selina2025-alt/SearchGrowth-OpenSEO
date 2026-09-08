/* eslint-disable max-lines -- one migration-backed spec covers the whole geo_entity_mentions storage contract (Round 1 integrity + Round 2 same-Project ownership + the 0053 pre-existing-row replay) through the shipped DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  geoEntityMentions,
  geoObservationParses,
  geoObservationRuns,
  searchPrompts,
  searchTopics,
  trackedEntities,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// normalized mention table and its Round 2 same-Project ownership expansion
// (0052 + 0053), plus its parents: market profile 0045, topic 0046, tracked
// entity 0048, prompt 0049, raw run 0050 and immutable versioned parse 0051.
// Foreign keys are ON so the composite parse/entity same-Project FKs, their
// cascades and the mention storage contract are exercised against the shipped
// DDL.
//
// Invariants (Round 1, retained): a valid §7 mention persists with the full
// direct field set and the optional fields store NULL when omitted; the
// required `mentioned` boolean is enforced; a mention whose parse or entity
// does not exist is rejected by the DB; mentions stay attached to their source
// Parse across v1/v2 (Parse-version isolation — never a current pointer) and
// are cascaded away only when their own parse/entity/project is deleted; and
// the schema is append-only with ONLY the direct mention fields plus the Round
// 2 `project_id` ownership key.
//
// Invariants (Round 2, added): the mention row carries its own project_id and
// two SAME-PROJECT composite FKs, so a Project-A parse + Project-B entity
// mention is rejected and an explicit mention Project mismatch is rejected,
// while a same-Project Parse/Entity mention persists. 0053's data-preserving
// rebuild is replayed against pre-0053 rows to prove prior Parse/Mention rows
// derive their Project from their existing Parse → Run relationship.

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

const BASE_MIGRATION_FILES = [
  "drizzle/0045_search_market_profiles.sql",
  "drizzle/0046_search_topics.sql",
  "drizzle/0048_ordinary_legion.sql",
  "drizzle/0049_gigantic_johnny_blaze.sql",
  "drizzle/0050_dusty_stardust.sql",
  "drizzle/0051_cuddly_matthew_murdock.sql",
];

let client: Client;
let db: ReturnType<typeof drizzle>;

type NewParse = typeof geoObservationParses.$inferInsert;
type NewMention = typeof geoEntityMentions.$inferInsert;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete');`,
  );
  await applyMigrationFiles(client, [
    ...BASE_MIGRATION_FILES,
    "drizzle/0052_cute_red_shift.sql",
    "drizzle/0053_shocking_rhodey.sql",
  ]);
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  // Child-first teardown: mentions reference parses/entities, parses reference
  // runs, runs reference prompts, prompts reference topics.
  await db.delete(geoEntityMentions);
  await db.delete(geoObservationParses);
  await db.delete(geoObservationRuns);
  await db.delete(searchPrompts);
  await db.delete(searchTopics);
  await db.delete(trackedEntities);
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

async function seedPrompt(id: string, projectId: string, topicId: string) {
  await db.insert(searchPrompts).values({
    id,
    projectId,
    topicId,
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

const ALPHA_RUN = {
  id: "run_alpha_1",
  batchId: "batch_alpha",
  projectId: "proj_alpha",
  promptId: "prompt_alpha",
  promptVersion: 1,
  surfaceType: "MODEL_API_SEARCH",
  surfaceName: "GPT-5 Search",
  fidelity: "API_SIMULATION",
  repeatIndex: 0,
  applicationCacheBypassed: true,
  startedAt: "2026-09-08T04:00:00.000Z",
  status: "SUCCEEDED",
} as const;

async function seedRun(
  overrides: { id?: string; projectId?: string; promptId?: string } = {},
) {
  const run = { ...ALPHA_RUN, ...overrides };
  await seedTopic(`topic_${run.projectId}`, run.projectId);
  await seedPrompt(run.promptId, run.projectId, `topic_${run.projectId}`);
  await db.insert(geoObservationRuns).values(run);
}

function parseValues(id: string, overrides: Partial<NewParse> = {}): NewParse {
  return {
    id,
    projectId: ALPHA_RUN.projectId,
    runId: ALPHA_RUN.id,
    parserVersion: "1.0.0",
    parseStatus: "SUCCESS",
    accuracyStatus: null,
    parsedAt: "2026-09-08T04:00:05.000Z",
    isCurrent: false,
    ...overrides,
  };
}

async function insertParse(id: string, overrides: Partial<NewParse> = {}) {
  await db.insert(geoObservationParses).values(parseValues(id, overrides));
}

async function seedEntity(
  id: string,
  projectId: string,
  entityType:
    | "BRAND"
    | "PRODUCT"
    | "COMPETITOR"
    | "COMPETITOR_PRODUCT" = "BRAND",
) {
  await db.insert(trackedEntities).values({
    id,
    projectId,
    entityType,
    canonicalName: `Entity ${id}`,
  });
}

async function insertMention(
  id: string,
  projectId: string,
  parseId: string,
  entityId: string,
  overrides: Partial<NewMention> = {},
) {
  await db.insert(geoEntityMentions).values({
    id,
    projectId,
    parseId,
    entityId,
    mentioned: true,
    ...overrides,
  });
}

async function mentionIdsForParse(parseId: string) {
  const rows = await db
    .select({ id: geoEntityMentions.id })
    .from(geoEntityMentions)
    .where(eq(geoEntityMentions.parseId, parseId));
  return sort(
    rows.map((row) => row.id),
    (a, b) => a.localeCompare(b),
  );
}

describe("geo_entity_mentions storage contract", () => {
  it("persists valid mentions with the full direct V1.0 field set", async () => {
    await seedRun();
    await seedEntity("ent_brand", "proj_alpha");
    await insertParse("parse_alpha_v1");
    await insertMention(
      "mention_alpha_1",
      "proj_alpha",
      "parse_alpha_v1",
      "ent_brand",
      {
        mentioned: true,
        recommended: true,
        mentionPosition: 0,
        sentiment: "POSITIVE",
        evidenceText: "Alpha is a capable provider for this use case.",
      },
    );
    // An explicitly recorded not-mentioned verdict also persists (mentioned=false).
    await insertMention(
      "mention_alpha_2",
      "proj_alpha",
      "parse_alpha_v1",
      "ent_brand",
      { mentioned: false },
    );

    const rows = await db
      .select()
      .from(geoEntityMentions)
      .where(eq(geoEntityMentions.parseId, "parse_alpha_v1"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "mention_alpha_1",
      projectId: "proj_alpha",
      parseId: "parse_alpha_v1",
      entityId: "ent_brand",
      mentioned: true,
      recommended: true,
      mentionPosition: 0,
      sentiment: "POSITIVE",
      evidenceText: "Alpha is a capable provider for this use case.",
    });
    expect(rows[0].createdAt).toBeTruthy();
    const notMentioned = rows.find((row) => row.id === "mention_alpha_2");
    expect(notMentioned?.mentioned).toBe(false);
  });

  it("stores the optional direct fields as NULL when a mention omits them", async () => {
    await seedRun();
    await seedEntity("ent_brand", "proj_alpha");
    await insertParse("parse_alpha_v1");
    // Raw insert omits recommended / mention_position / sentiment / evidence_text
    // so the DB NULL defaults apply for a plain mention verdict.
    await client.execute(
      `INSERT INTO geo_entity_mentions (id, project_id, parse_id, entity_id, mentioned)
       VALUES ('mention_plain', 'proj_alpha', 'parse_alpha_v1', 'ent_brand', 1)`,
    );

    const rows = await db
      .select()
      .from(geoEntityMentions)
      .where(eq(geoEntityMentions.id, "mention_plain"));
    expect(rows).toHaveLength(1);
    expect(rows[0].recommended).toBeNull();
    expect(rows[0].mentionPosition).toBeNull();
    expect(rows[0].sentiment).toBeNull();
    expect(rows[0].evidenceText).toBeNull();
    expect(rows[0].mentioned).toBe(true);
  });

  it("requires the mentioned boolean (NOT NULL)", async () => {
    await seedRun();
    await seedEntity("ent_brand", "proj_alpha");
    await insertParse("parse_alpha_v1");

    await expect(
      client.execute(
        `INSERT INTO geo_entity_mentions (id, project_id, parse_id, entity_id)
         VALUES ('mention_no_verdict', 'proj_alpha', 'parse_alpha_v1', 'ent_brand')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("rejects a mention whose source parse does not exist", async () => {
    await seedRun();
    await seedEntity("ent_brand", "proj_alpha");
    await insertParse("parse_alpha_v1");

    // parse_id is a hard composite FK to geo_observation_parses(project_id, id):
    // a dangling mention referencing no parse row is rejected by the DB. Raw SQL
    // is used (as in the other FK-rejection tests) so the assertion sees the
    // clean libsql error.
    await expect(
      client.execute(
        `INSERT INTO geo_entity_mentions
           (id, project_id, parse_id, entity_id, mentioned)
         VALUES
           ('mention_orphan_parse', 'proj_alpha', 'parse_missing', 'ent_brand', 1)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a mention whose tracked entity does not exist", async () => {
    await seedRun();
    await seedEntity("ent_brand", "proj_alpha");
    await insertParse("parse_alpha_v1");

    await expect(
      client.execute(
        `INSERT INTO geo_entity_mentions
           (id, project_id, parse_id, entity_id, mentioned)
         VALUES
           ('mention_orphan_entity', 'proj_alpha', 'parse_alpha_v1', 'ent_missing', 1)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("allows a mention whose Parse and TrackedEntity share the same Project", async () => {
    await seedRun();
    await seedEntity("ent_alpha", "proj_alpha");
    await insertParse("parse_alpha_v1");
    await insertMention(
      "mention_same_project",
      "proj_alpha",
      "parse_alpha_v1",
      "ent_alpha",
    );

    const rows = await db
      .select()
      .from(geoEntityMentions)
      .where(eq(geoEntityMentions.id, "mention_same_project"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "mention_same_project",
      projectId: "proj_alpha",
      parseId: "parse_alpha_v1",
      entityId: "ent_alpha",
    });
  });

  it("rejects a mention that binds a Project-A parse to a Project-B entity (cross-Project)", async () => {
    await seedRun();
    await seedEntity("ent_alpha", "proj_alpha");
    await seedEntity("ent_beta", "proj_beta");
    await insertParse("parse_alpha_v1");

    // parse_alpha_v1 sits beneath proj_alpha while ent_beta belongs to proj_beta.
    // The composite FK (project_id, entity_id) -> tracked_entities(project_id, id)
    // has no matching parent row, so the DB rejects the cross-Project mention.
    await expect(
      client.execute(
        `INSERT INTO geo_entity_mentions
           (id, project_id, parse_id, entity_id, mentioned)
         VALUES
           ('mention_cross_project', 'proj_alpha', 'parse_alpha_v1', 'ent_beta', 1)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects an explicit mention Project mismatch (mention project_id differs from its parse/entity Project)", async () => {
    await seedRun();
    await seedEntity("ent_alpha", "proj_alpha");
    await insertParse("parse_alpha_v1");

    // Both parent rows live on proj_alpha, but the mention names proj_beta as its
    // own project. Neither composite FK ((project_id, parse_id) nor
    // (project_id, entity_id)) has a matching parent row under proj_beta, so the
    // DB rejects the explicit mismatch.
    await expect(
      client.execute(
        `INSERT INTO geo_entity_mentions
           (id, project_id, parse_id, entity_id, mentioned)
         VALUES
           ('mention_wrong_project', 'proj_beta', 'parse_alpha_v1', 'ent_alpha', 1)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("keeps mentions attached to their source Parse (v1/v2 isolated from any current pointer)", async () => {
    await seedRun();
    await seedEntity("ent_brand", "proj_alpha");
    // v1 and v2 parses of the same raw run coexist (ADR-005); v2 is the
    // current marker. Mentions must bind to the concrete Parse they were
    // computed from — never to a mutable current pointer.
    await insertParse("parse_alpha_v1", {
      parserVersion: "1.0.0",
      parseStatus: "SUCCESS",
    });
    await insertParse("parse_alpha_v2", {
      parserVersion: "2.0.0",
      parseStatus: "SUCCESS",
      isCurrent: true,
    });
    const runBefore = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, ALPHA_RUN.id));

    await insertMention(
      "mention_v1_a",
      "proj_alpha",
      "parse_alpha_v1",
      "ent_brand",
    );
    await insertMention(
      "mention_v1_b",
      "proj_alpha",
      "parse_alpha_v1",
      "ent_brand",
      { mentionPosition: 3 },
    );
    await insertMention(
      "mention_v2_a",
      "proj_alpha",
      "parse_alpha_v2",
      "ent_brand",
      { recommended: true },
    );

    // v1's mentions stay on v1 and are never visible under v2, even though v2
    // is the current-marked parse of the same run.
    expect(await mentionIdsForParse("parse_alpha_v1")).toEqual([
      "mention_v1_a",
      "mention_v1_b",
    ]);
    expect(await mentionIdsForParse("parse_alpha_v2")).toEqual([
      "mention_v2_a",
    ]);

    // The raw run row is byte-identical while mention rows exist on its parses
    // (21_TEST_ACCEPTANCE_PLAN.md §6 — mention writes never touch the raw run).
    const runAfter = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, ALPHA_RUN.id));
    expect(runAfter).toEqual(runBefore);
  });

  it("cascades a parse's mentions away only when that parse version is deleted", async () => {
    await seedRun();
    await seedEntity("ent_brand", "proj_alpha");
    await insertParse("parse_alpha_v1", {
      parserVersion: "1.0.0",
      parseStatus: "SUCCESS",
    });
    await insertParse("parse_alpha_v2", {
      parserVersion: "2.0.0",
      parseStatus: "SUCCESS",
      isCurrent: true,
    });
    await insertMention(
      "mention_v1_a",
      "proj_alpha",
      "parse_alpha_v1",
      "ent_brand",
    );
    await insertMention(
      "mention_v2_a",
      "proj_alpha",
      "parse_alpha_v2",
      "ent_brand",
    );

    // Deleting the v1 parse (e.g. a parser-version cleanup) removes only v1's
    // mentions; the sibling v2 parse and its mentions remain untouched.
    await client.execute(
      "DELETE FROM geo_observation_parses WHERE id = 'parse_alpha_v1'",
    );

    expect(await mentionIdsForParse("parse_alpha_v1")).toEqual([]);
    expect(await mentionIdsForParse("parse_alpha_v2")).toEqual([
      "mention_v2_a",
    ]);
  });

  it("cascades mentions away when their tracked entity is deleted", async () => {
    await seedRun();
    await seedEntity("ent_brand", "proj_alpha");
    await insertParse("parse_alpha_v1");
    await insertMention(
      "mention_alpha_1",
      "proj_alpha",
      "parse_alpha_v1",
      "ent_brand",
    );

    await client.execute("DELETE FROM tracked_entities WHERE id = 'ent_brand'");

    expect(await mentionIdsForParse("parse_alpha_v1")).toEqual([]);
  });

  it("cascades mentions away when their whole project is deleted", async () => {
    await seedRun({
      id: "run_delete",
      projectId: "proj_delete",
      promptId: "prompt_proj_delete",
    });
    await seedEntity("ent_delete", "proj_delete");
    await insertParse("parse_delete_v1", {
      runId: "run_delete",
      projectId: "proj_delete",
    });
    await insertMention(
      "mention_delete_1",
      "proj_delete",
      "parse_delete_v1",
      "ent_delete",
    );

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    expect(await mentionIdsForParse("parse_delete_v1")).toEqual([]);
    const parses = await db
      .select()
      .from(geoObservationParses)
      .where(eq(geoObservationParses.runId, "run_delete"));
    expect(parses).toHaveLength(0);
  });

  it("is append-only by schema shape and ships ONLY the direct mention fields plus the Round 2 project key", async () => {
    const tableInfo = await client.execute(
      "SELECT name FROM pragma_table_info('geo_entity_mentions')",
    );
    const columns = sort(
      tableInfo.rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string"),
      (a, b) => a.localeCompare(b),
    );

    // The exact §7/direct TASK field list (stable id, parse_id, entity_id,
    // mentioned, recommended, mention_position, sentiment, evidence_text), the
    // Round 2 PO-approved project_id ownership key, and the append-only
    // created_at system timestamp. No updated_at, no run_id/current-pointer
    // column and no parser-output JSON blob, ranking or score column.
    expect(columns).toEqual([
      "created_at",
      "entity_id",
      "evidence_text",
      "id",
      "mention_position",
      "mentioned",
      "parse_id",
      "project_id",
      "recommended",
      "sentiment",
    ]);
  });
});

describe("0053 migration preserves pre-existing Parse/Mention rows", () => {
  let replayClient: Client;
  let replayDb: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    replayClient = createClient({ url: "file::memory:" });
    replayDb = drizzle(replayClient);
    await replayClient.execute("PRAGMA foreign_keys = ON");
    await replayClient.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
    await replayClient.execute(
      `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta');`,
    );
    // Build the Round 1 head (0052) — before the Round 2 project keys existed.
    await applyMigrationFiles(replayClient, [
      ...BASE_MIGRATION_FILES,
      "drizzle/0052_cute_red_shift.sql",
    ]);

    // Seed pre-0053 rows exactly as Round 1 allowed: a run under proj_alpha, a
    // parse on that run, and a mention of a proj_alpha entity — with NO
    // project_id column on the parse/mention rows yet.
    await replayClient.execute(
      `INSERT INTO search_topics (id, project_id, canonical_name, locale, status)
       VALUES ('topic_proj_alpha', 'proj_alpha', 'Topic A', 'en', 'ACTIVE')`,
    );
    await replayClient.execute(
      `INSERT INTO search_prompts
         (id, project_id, topic_id, prompt_text, normalized_prompt, prompt_type,
          language, business_fit, priority, version)
       VALUES ('prompt_alpha', 'proj_alpha', 'topic_proj_alpha', 'Prompt?',
               'prompt?', 'definition', 'en', 50, 50, 1)`,
    );
    await replayClient.execute(
      `INSERT INTO geo_observation_runs
         (id, batch_id, project_id, prompt_id, prompt_version, surface_type,
          surface_name, fidelity, repeat_index, application_cache_bypassed,
          started_at, status)
       VALUES ('run_alpha_1', 'batch_alpha', 'proj_alpha', 'prompt_alpha', 1,
               'MODEL_API_SEARCH', 'GPT-5 Search', 'API_SIMULATION', 0, 1,
               '2026-09-08T04:00:00.000Z', 'SUCCEEDED')`,
    );
    await replayClient.execute(
      `INSERT INTO geo_observation_parses
         (id, run_id, parser_version, parse_status, parsed_at)
       VALUES ('parse_alpha_v1', 'run_alpha_1', '1.0.0', 'SUCCESS',
               '2026-09-08T04:00:05.000Z')`,
    );
    await replayClient.execute(
      `INSERT INTO tracked_entities (id, project_id, entity_type, canonical_name)
       VALUES ('ent_alpha', 'proj_alpha', 'BRAND', 'Alpha')`,
    );
    await replayClient.execute(
      `INSERT INTO geo_entity_mentions (id, parse_id, entity_id, mentioned)
       VALUES ('mention_legacy', 'parse_alpha_v1', 'ent_alpha', 1)`,
    );

    // Apply 0053: the data-preserving rebuild that derives project_id from the
    // existing Parse -> Run relationship.
    await applyMigrationFiles(replayClient, [
      "drizzle/0053_shocking_rhodey.sql",
    ]);
  });

  afterAll(() => {
    replayClient.close();
  });

  it("backfills geo_observation_parses.project_id from the row's run project", async () => {
    const rows = await replayDb
      .select()
      .from(geoObservationParses)
      .where(eq(geoObservationParses.id, "parse_alpha_v1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].projectId).toBe("proj_alpha");
  });

  it("backfills geo_entity_mentions.project_id from the row's parse project", async () => {
    const rows = await replayDb
      .select()
      .from(geoEntityMentions)
      .where(eq(geoEntityMentions.id, "mention_legacy"));
    expect(rows).toHaveLength(1);
    expect(rows[0].projectId).toBe("proj_alpha");
    expect(rows[0].parseId).toBe("parse_alpha_v1");
    expect(rows[0].entityId).toBe("ent_alpha");
  });

  it("enforces same-Project integrity on rows written after 0053", async () => {
    // A post-0053 cross-Project mention (proj_alpha parse + proj_beta entity)
    // must be rejected by the composite FK.
    await replayClient.execute(
      `INSERT INTO tracked_entities (id, project_id, entity_type, canonical_name)
       VALUES ('ent_beta', 'proj_beta', 'BRAND', 'Beta')`,
    );
    await expect(
      replayClient.execute(
        `INSERT INTO geo_entity_mentions
           (id, project_id, parse_id, entity_id, mentioned)
         VALUES
           ('mention_cross_after', 'proj_alpha', 'parse_alpha_v1', 'ent_beta', 1)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });
});
