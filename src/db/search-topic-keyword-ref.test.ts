import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { savedKeywords } from "./app.schema";
import { searchTopicKeywordRefs, searchTopics } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// mapping (0047), the topic it references (0046), and a saved_keywords fixture
// that mirrors the canonical OpenSEO saved-keyword table the mapping FK points
// at. Foreign keys are enabled so the same-project composite FKs, the duplicate
// guard and the cascade delete behavior are exercised against the shipped
// storage contract — not an application convention.
//
// Invariants under test:
//   - A mapping stores only the canonical saved_keywords.id — no keyword text,
//     market, rank or tag data is duplicated (04_OPENSEO_REUSE_CODE_MAP.md §1).
//   - The topic, saved keyword and mapping all belong to the SAME project
//     (two composite FKs with the mapping's project_id as leading column).
//   - One mapping per (topic_id, open_seo_keyword_ref) is the V1.0 rule.
//   - Deleting a topic, a saved keyword or a whole project cascades to the
//     mapping, so a mapping can never dangle.
//   - Lifecycle mutations (rename/archive/merge) keep the mapping attached to
//     the same stable topic id (ADR-004).

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let db: ReturnType<typeof drizzle>;

const TOPICS_DDL = readFileSync("drizzle/0046_search_topics.sql", "utf8");
const REFS_DDL = readFileSync(
  "drizzle/0047_search_topic_keyword_refs.sql",
  "utf8",
);

const statementParts = (ddl: string) =>
  ddl
    .split(DRIZZLE_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(
    [
      `CREATE TABLE projects (id text PRIMARY KEY);`,
      `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete');`,
      // Minimal mirror of the canonical OpenSEO saved_keywords table (the
      // 0047 mapping FK references saved_keywords(project_id, id); the 0047
      // migration adds the supporting saved_keywords_project_id_id_idx).
      `CREATE TABLE saved_keywords (
        id text PRIMARY KEY NOT NULL,
        project_id text NOT NULL,
        keyword text NOT NULL,
        location_code integer DEFAULT 2840 NOT NULL,
        language_code text DEFAULT 'en' NOT NULL,
        created_at text DEFAULT (current_timestamp) NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id)
          ON UPDATE no action ON DELETE cascade
      );`,
      ...statementParts(TOPICS_DDL),
      ...statementParts(REFS_DDL),
    ].join("\n"),
  );
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await db.delete(searchTopicKeywordRefs);
  await db.delete(savedKeywords);
  await db.delete(searchTopics);
});

async function seedActiveTopic(id: string, projectId: string) {
  await db.insert(searchTopics).values({
    id,
    projectId,
    canonicalName: `Topic ${id}`,
    locale: "en",
    status: "ACTIVE",
  });
}

async function seedSavedKeyword(id: string, projectId: string) {
  await db.insert(savedKeywords).values({
    id,
    projectId,
    keyword: `keyword ${id}`,
    locationCode: 2840,
    languageCode: "en",
  });
}

describe("search_topic_keyword_refs same-project mapping integrity", () => {
  it("persists a valid same-project mapping and reuses one canonical saved keyword row", async () => {
    // Two topics on the same project map to ONE canonical saved keyword row —
    // proving the mapping references the existing saved_keywords record rather
    // than duplicating keyword text/storage.
    await db.insert(searchTopics).values([
      {
        id: "topic_alpha",
        projectId: "proj_alpha",
        canonicalName: "Alpha topic",
        locale: "en",
        status: "ACTIVE",
      },
      {
        id: "topic_alpha_2",
        projectId: "proj_alpha",
        canonicalName: "Alpha topic two",
        locale: "en",
        status: "ACTIVE",
      },
    ]);
    await seedSavedKeyword("kw_alpha", "proj_alpha");

    await db.insert(searchTopicKeywordRefs).values([
      {
        id: "ref_1",
        projectId: "proj_alpha",
        topicId: "topic_alpha",
        openSeoKeywordRef: "kw_alpha",
      },
      {
        id: "ref_2",
        projectId: "proj_alpha",
        topicId: "topic_alpha_2",
        openSeoKeywordRef: "kw_alpha",
      },
    ]);

    const mappingRows = await db
      .select()
      .from(searchTopicKeywordRefs)
      .where(eq(searchTopicKeywordRefs.projectId, "proj_alpha"))
      .orderBy(searchTopicKeywordRefs.id);

    expect(mappingRows).toHaveLength(2);
    expect(mappingRows[0]).toMatchObject({
      id: "ref_1",
      projectId: "proj_alpha",
      topicId: "topic_alpha",
      openSeoKeywordRef: "kw_alpha",
    });

    // The saved keyword itself was never duplicated: one row stores the
    // canonical record and both mappings reference its id.
    const [{ value: keywordCount }] = await db
      .select({ value: count() })
      .from(savedKeywords)
      .where(eq(savedKeywords.projectId, "proj_alpha"));
    expect(keywordCount).toBe(1);
  });

  it("rejects a duplicate (topic_id, open_seo_keyword_ref) pair", async () => {
    await seedActiveTopic("topic_alpha", "proj_alpha");
    await seedSavedKeyword("kw_alpha", "proj_alpha");

    await db.insert(searchTopicKeywordRefs).values({
      id: "ref_1",
      projectId: "proj_alpha",
      topicId: "topic_alpha",
      openSeoKeywordRef: "kw_alpha",
    });

    // Second mapping for the same topic-keyword pair is rejected by the
    // V1.0 unique index, not by application code.
    await expect(
      client.execute(
        `INSERT INTO search_topic_keyword_refs
           (id, project_id, topic_id, open_seo_keyword_ref)
         VALUES
           ('ref_duplicate', 'proj_alpha', 'topic_alpha', 'kw_alpha')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("rejects a mapping whose topic belongs to another project", async () => {
    // topic_beta lives on proj_beta; the mapping row claims proj_alpha, so the
    // composite FK (project_id, topic_id) -> search_topics(project_id, id)
    // has no matching parent row.
    await seedActiveTopic("topic_beta", "proj_beta");
    await seedSavedKeyword("kw_alpha", "proj_alpha");

    await expect(
      client.execute(
        `INSERT INTO search_topic_keyword_refs
           (id, project_id, topic_id, open_seo_keyword_ref)
         VALUES
           ('ref_cross_topic', 'proj_alpha', 'topic_beta', 'kw_alpha')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a mapping whose saved keyword belongs to another project", async () => {
    // kw_beta lives on proj_beta; the mapping row claims proj_alpha, so the
    // composite FK (project_id, open_seo_keyword_ref) -> saved_keywords
    // (project_id, id) has no matching parent row.
    await seedActiveTopic("topic_alpha", "proj_alpha");
    await seedSavedKeyword("kw_beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO search_topic_keyword_refs
           (id, project_id, topic_id, open_seo_keyword_ref)
         VALUES
           ('ref_cross_keyword', 'proj_alpha', 'topic_alpha', 'kw_beta')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("cascades the mapping away when its topic is deleted", async () => {
    await seedActiveTopic("topic_alpha", "proj_alpha");
    await seedSavedKeyword("kw_alpha", "proj_alpha");
    await db.insert(searchTopicKeywordRefs).values({
      id: "ref_1",
      projectId: "proj_alpha",
      topicId: "topic_alpha",
      openSeoKeywordRef: "kw_alpha",
    });

    await client.execute("DELETE FROM search_topics WHERE id = 'topic_alpha'");

    const remaining = await db
      .select()
      .from(searchTopicKeywordRefs)
      .where(eq(searchTopicKeywordRefs.id, "ref_1"));
    expect(remaining).toHaveLength(0);
  });

  it("cascades the mapping away when its saved keyword is deleted", async () => {
    await seedActiveTopic("topic_alpha", "proj_alpha");
    await seedSavedKeyword("kw_alpha", "proj_alpha");
    await db.insert(searchTopicKeywordRefs).values({
      id: "ref_1",
      projectId: "proj_alpha",
      topicId: "topic_alpha",
      openSeoKeywordRef: "kw_alpha",
    });

    await client.execute("DELETE FROM saved_keywords WHERE id = 'kw_alpha'");

    const remaining = await db
      .select()
      .from(searchTopicKeywordRefs)
      .where(eq(searchTopicKeywordRefs.id, "ref_1"));
    expect(remaining).toHaveLength(0);
  });

  it("cascades the mapping away when its project is deleted", async () => {
    await seedActiveTopic("topic_delete", "proj_delete");
    await seedSavedKeyword("kw_delete", "proj_delete");
    await db.insert(searchTopicKeywordRefs).values({
      id: "ref_delete",
      projectId: "proj_delete",
      topicId: "topic_delete",
      openSeoKeywordRef: "kw_delete",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const remaining = await db
      .select()
      .from(searchTopicKeywordRefs)
      .where(eq(searchTopicKeywordRefs.projectId, "proj_delete"));
    expect(remaining).toHaveLength(0);
  });

  it("keeps the mapping attached to the stable topic id across a lifecycle mutation", async () => {
    // A topic that is renamed, archived and then merged into a same-project
    // successor mutates its row in place (ADR-004); the mapping must keep
    // pointing at the same stable topic id and project.
    await seedActiveTopic("topic_alpha", "proj_alpha");
    await seedActiveTopic("topic_successor", "proj_alpha");
    await seedSavedKeyword("kw_alpha", "proj_alpha");
    await db.insert(searchTopicKeywordRefs).values({
      id: "ref_1",
      projectId: "proj_alpha",
      topicId: "topic_alpha",
      openSeoKeywordRef: "kw_alpha",
    });

    // Rename -> archive -> merge on the SAME topic row.
    await db
      .update(searchTopics)
      .set({ canonicalName: "Renamed topic" })
      .where(eq(searchTopics.id, "topic_alpha"));
    await db
      .update(searchTopics)
      .set({ status: "ARCHIVED" })
      .where(eq(searchTopics.id, "topic_alpha"));
    await db
      .update(searchTopics)
      .set({ status: "MERGED", mergedIntoTopicId: "topic_successor" })
      .where(eq(searchTopics.id, "topic_alpha"));

    const mappingRows = await db
      .select()
      .from(searchTopicKeywordRefs)
      .where(eq(searchTopicKeywordRefs.id, "ref_1"));

    expect(mappingRows).toHaveLength(1);
    expect(mappingRows[0]).toMatchObject({
      id: "ref_1",
      projectId: "proj_alpha",
      topicId: "topic_alpha",
      openSeoKeywordRef: "kw_alpha",
    });

    // Exactly one topic row survives the lifecycle — the mutation never created
    // a replacement identity, so the mapping target is unchanged.
    const topicRows = await db
      .select()
      .from(searchTopics)
      .where(eq(searchTopics.id, "topic_alpha"));
    expect(topicRows).toHaveLength(1);
    expect(topicRows[0]).toMatchObject({
      id: "topic_alpha",
      projectId: "proj_alpha",
      status: "MERGED",
      mergedIntoTopicId: "topic_successor",
    });
  });
});
