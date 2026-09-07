import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { searchTopics } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL, so the
// fixture proves the storage contract the migration ships (ADR-004 stable
// topic identity + the merge-pointer invariants). Foreign keys are enabled so
// the composite same-project self-reference and the restrictive delete
// behavior are exercised, not just the lifecycle CHECKs.
//
// Invariants under test:
//   - A topic id is stable across rename/archive/merge mutations and project
//     ownership is never replaced or inferred from another project.
//   - A merge target belongs to the SAME project (composite FK).
//   - status = MERGED <=> merged_into_topic_id IS NOT NULL (CHECKs).
//   - A topic cannot be merged into itself (CHECK).
//   - Deleting a merge target a MERGED topic still points at is rejected; only
//     deleting the whole owning project cascades the merged chain away.

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let db: ReturnType<typeof drizzle>;

const TOPICS_DDL = readFileSync("drizzle/0046_search_topics.sql", "utf8");

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(
    [
      `CREATE TABLE projects (id text PRIMARY KEY);`,
      `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta');`,
      ...TOPICS_DDL.split(DRIZZLE_STATEMENT_SEPARATOR)
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0),
    ].join("\n"),
  );
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
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

describe("search_topics stable identity and merge integrity", () => {
  it("keeps the same topic id and project across rename, archive and merge mutations", async () => {
    // topic_alpha is the topic that lives through the whole lifecycle; it is
    // merged into topic_merge_target on the SAME project. topic_beta lives on a
    // second project so ownership can never be inferred from surrounding rows.
    await db.insert(searchTopics).values([
      {
        id: "topic_alpha",
        projectId: "proj_alpha",
        canonicalName: "Original topic name",
        locale: "en",
        status: "ACTIVE",
      },
      {
        id: "topic_merge_target",
        projectId: "proj_alpha",
        canonicalName: "Surviving topic",
        locale: "en",
        status: "ACTIVE",
      },
      {
        id: "topic_beta",
        projectId: "proj_beta",
        canonicalName: "Other project topic",
        locale: "zh-CN",
        status: "ACTIVE",
      },
    ]);

    // Rename: canonical name + description change on the SAME row.
    await db
      .update(searchTopics)
      .set({
        canonicalName: "Renamed topic",
        description: "Canonical name and description may change.",
      })
      .where(eq(searchTopics.id, "topic_alpha"));

    // Archive: lifecycle status change on the SAME row.
    await db
      .update(searchTopics)
      .set({ status: "ARCHIVED" })
      .where(eq(searchTopics.id, "topic_alpha"));

    // Merge: status + same-project self-reference on the SAME row — still no
    // replacement identity.
    await db
      .update(searchTopics)
      .set({ status: "MERGED", mergedIntoTopicId: "topic_merge_target" })
      .where(eq(searchTopics.id, "topic_alpha"));

    const rows = await db
      .select()
      .from(searchTopics)
      .where(eq(searchTopics.id, "topic_alpha"));

    // Exactly one row survives the lifecycle — the update never created a
    // replacement row with a new id.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "topic_alpha",
      projectId: "proj_alpha",
      canonicalName: "Renamed topic",
      description: "Canonical name and description may change.",
      locale: "en",
      status: "MERGED",
      mergedIntoTopicId: "topic_merge_target",
    });

    // The row's project ownership is the original project — it was never
    // rewritten to, or inferred from, topic_beta's project.
    expect(rows[0].projectId).toBe("proj_alpha");

    const betaRows = await db
      .select()
      .from(searchTopics)
      .where(eq(searchTopics.id, "topic_beta"));
    expect(betaRows).toHaveLength(1);
    expect(betaRows[0]?.projectId).toBe("proj_beta");
  });

  it("rejects a merge target owned by another project", async () => {
    // topic_beta_target lives on proj_beta; a proj_alpha topic cannot merge
    // into it because the composite FK is (project_id, merged_into_topic_id)
    // -> (project_id, id).
    await seedActiveTopic("topic_beta_target", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO search_topics
           (id, project_id, canonical_name, locale, status, merged_into_topic_id)
         VALUES
           ('topic_cross_project', 'proj_alpha', 'Cross-project merge', 'en',
            'MERGED', 'topic_beta_target')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a MERGED topic without a merge target", async () => {
    await expect(
      client.execute(
        `INSERT INTO search_topics
           (id, project_id, canonical_name, locale, status)
         VALUES
           ('topic_dangling_merged', 'proj_alpha', 'Dangling merged topic',
            'en', 'MERGED')`,
      ),
    ).rejects.toThrow(/search_topics_merged_requires_target/);
  });

  it("rejects ACTIVE and ARCHIVED topics that carry a merge target", async () => {
    // Same-project ACTIVE target so the composite FK is satisfied; the
    // lifecycle CHECK (only MERGED has a successor) is what rejects.
    await seedActiveTopic("topic_same_project_target", "proj_alpha");

    for (const status of ["ACTIVE", "ARCHIVED"]) {
      await expect(
        client.execute(
          `INSERT INTO search_topics
             (id, project_id, canonical_name, locale, status, merged_into_topic_id)
           VALUES
             ('topic_${status.toLowerCase()}_with_target', 'proj_alpha',
              '${status} with target', 'en', '${status}',
              'topic_same_project_target')`,
        ),
      ).rejects.toThrow(/search_topics_only_merged_has_target/);
    }
  });

  it("rejects a topic merged into itself", async () => {
    await seedActiveTopic("topic_self", "proj_alpha");

    await expect(
      client.execute(
        `UPDATE search_topics
         SET status = 'MERGED', merged_into_topic_id = 'topic_self'
         WHERE id = 'topic_self'`,
      ),
    ).rejects.toThrow(/search_topics_merge_target_not_self/);
  });

  it("rejects deleting a merge target a MERGED topic still points at", async () => {
    await seedActiveTopic("topic_successor", "proj_alpha");
    await db.insert(searchTopics).values({
      id: "topic_merged_into_successor",
      projectId: "proj_alpha",
      canonicalName: "Merged into successor",
      locale: "en",
      status: "MERGED",
      mergedIntoTopicId: "topic_successor",
    });

    // Restrictive delete behavior: deleting the referenced successor must not
    // silently SET NULL the pointer on the MERGED row.
    await expect(
      client.execute("DELETE FROM search_topics WHERE id = 'topic_successor'"),
    ).rejects.toThrow(/FOREIGN KEY/i);

    const mergedRows = await db
      .select()
      .from(searchTopics)
      .where(eq(searchTopics.id, "topic_merged_into_successor"));
    expect(mergedRows[0]?.mergedIntoTopicId).toBe("topic_successor");
  });

  it("still cascades a whole-project delete when topics are merged within it", async () => {
    // The Project FK is ON DELETE CASCADE and a merge target is always on the
    // SAME project, so deleting the project removes the merged topic and its
    // successor together — the restrictive self-FK must not block the cascade.
    await client.execute("INSERT INTO projects (id) VALUES ('proj_delete')");
    await db.insert(searchTopics).values([
      {
        id: "delete_successor",
        projectId: "proj_delete",
        canonicalName: "Successor",
        locale: "en",
        status: "ACTIVE",
      },
      {
        id: "delete_merged",
        projectId: "proj_delete",
        canonicalName: "Merged",
        locale: "en",
        status: "MERGED",
        mergedIntoTopicId: "delete_successor",
      },
    ]);

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const remaining = await db
      .select({ id: searchTopics.id })
      .from(searchTopics)
      .where(eq(searchTopics.projectId, "proj_delete"));
    expect(remaining).toHaveLength(0);
  });
});
