import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  searchMarketProfiles,
  searchPrompts,
  searchTopics,
} from "./search-growth.schema";
import type { PromptType } from "@/types/schemas/search-prompt";

// Real in-memory SQLite built from the actual forward migration DDL for the
// prompt table (0049), plus the market profile (0045) and topic (0046) parents
// the prompt's composite FKs reference. Foreign keys are enabled so the
// same-project composite FKs, the versioned-identity unique index, the
// score-range CHECK constraints and the cascade delete behavior are exercised
// against the shipped storage contract — not an application convention.
//
// Invariants under test:
//   - A valid prompt persists with the full V1.0 field set, including an
//     optional same-Project market profile and an optional NULL profile.
//   - The topic and the optional market profile must belong to the SAME project
//     (two composite FKs with the prompt's project_id as leading column);
//     cross-Project references are rejected by the DB.
//   - business_fit and priority are 0..100 REAL score columns enforced by CHECK
//     constraints at the storage boundary.
//   - The sole versioned-identity rule is
//     (project_id, normalized_prompt, market_profile_id, version): a duplicate
//     (same normalized prompt + profile + version) is rejected, while bumping
//     the version appends a new row (history is never overwritten) and a
//     different profile is a distinct identity.
//   - Deleting a topic, a market profile or a whole Project cascades the prompt
//     away, so a prompt can never dangle.
// PromptType boundary rejection (unsupported/case-mismatched/empty values) is
// proven at the Zod domain boundary in src/types/schemas/search-prompt.test.ts;
// the DB stores the enum as an explicit text column validated there.

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let db: ReturnType<typeof drizzle>;

const PROFILES_DDL = readFileSync(
  "drizzle/0045_search_market_profiles.sql",
  "utf8",
);
const TOPICS_DDL = readFileSync("drizzle/0046_search_topics.sql", "utf8");
const PROMPTS_DDL = readFileSync(
  "drizzle/0049_gigantic_johnny_blaze.sql",
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
      ...statementParts(PROFILES_DDL),
      ...statementParts(TOPICS_DDL),
      ...statementParts(PROMPTS_DDL),
    ].join("\n"),
  );
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await db.delete(searchPrompts);
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

async function seedProfile(id: string, projectId: string) {
  await db.insert(searchMarketProfiles).values({
    id,
    projectId,
    name: `Profile ${id}`,
    searchEngine: "GOOGLE",
    locationCode: "2840",
    locationName: "China",
    languageCode: "zh-CN",
    device: "DESKTOP",
    country: "CN",
    isPrimary: false,
  });
}

const ALPHA_PROMPT = {
  id: "prompt_alpha_v1",
  projectId: "proj_alpha",
  topicId: "topic_alpha",
  promptText: "Compare {brand} against {competitor} on {topic}",
  normalizedPrompt: "compare {brand} against {competitor} on {topic}",
  promptType: "comparison" as const satisfies PromptType,
  persona: "technical buyer",
  buyingStage: "evaluation",
  marketProfileId: "prof_alpha_market",
  language: "en",
  businessFit: 85,
  priority: 70,
  version: 1,
  active: true,
};

describe("search_prompts storage contract", () => {
  it("persists a valid prompt with the full V1.0 field set and keeps projects isolated", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");
    await seedTopic("topic_beta", "proj_beta");

    await db.insert(searchPrompts).values([ALPHA_PROMPT]);

    const alphaRows = await db
      .select()
      .from(searchPrompts)
      .where(eq(searchPrompts.projectId, "proj_alpha"));

    expect(alphaRows).toHaveLength(1);
    expect(alphaRows[0]).toMatchObject(ALPHA_PROMPT);
    // The exact lowercase PromptType value round-trips.
    expect(alphaRows[0].promptType).toBe("comparison");

    const betaCount = await db
      .select({ id: searchPrompts.id })
      .from(searchPrompts)
      .where(eq(searchPrompts.projectId, "proj_beta"));
    expect(betaCount).toHaveLength(0);
  });

  it("stores every approved PromptType value as the DB text-enum column", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    const types = searchPrompts.promptType.enumValues as PromptType[];
    await db.insert(searchPrompts).values(
      types.map((type, index) => ({
        id: `prompt_type_${index}`,
        projectId: "proj_alpha",
        topicId: "topic_alpha",
        promptText: `Prompt ${type}`,
        normalizedPrompt: `prompt ${type}`,
        promptType: type,
        language: "en",
        businessFit: 50,
        priority: 50,
        version: 1,
        active: true,
      })),
    );

    const rows = await db
      .select({ promptType: searchPrompts.promptType })
      .from(searchPrompts)
      .where(eq(searchPrompts.projectId, "proj_alpha"));
    expect(
      sort(
        rows.map((row) => row.promptType),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(sort(types, (a, b) => a.localeCompare(b)));
  });

  it("persists a prompt with a NULL market profile (no profile attached)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");

    await db.insert(searchPrompts).values({
      ...ALPHA_PROMPT,
      id: "prompt_no_market",
      marketProfileId: null,
    });

    const rows = await db
      .select()
      .from(searchPrompts)
      .where(eq(searchPrompts.id, "prompt_no_market"));
    expect(rows).toHaveLength(1);
    expect(rows[0].marketProfileId).toBeNull();
  });

  it("rejects a prompt whose topic belongs to another project", async () => {
    // topic_beta lives on proj_beta; the prompt row claims proj_alpha, so the
    // composite FK (project_id, topic_id) -> search_topics(project_id, id) has
    // no matching parent row.
    await seedTopic("topic_beta", "proj_beta");
    await seedProfile("prof_alpha_market", "proj_alpha");

    await expect(
      client.execute(
        `INSERT INTO search_prompts
           (id, project_id, topic_id, prompt_text, normalized_prompt,
            prompt_type, market_profile_id, language, business_fit, priority,
            version)
         VALUES
           ('prompt_cross_topic', 'proj_alpha', 'topic_beta',
            'Cross-topic prompt', 'cross-topic prompt', 'comparison',
            'prof_alpha_market', 'en', 80, 60, 1)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a prompt whose market profile belongs to another project", async () => {
    // prof_beta_market lives on proj_beta; the prompt row claims proj_alpha, so
    // the composite FK (project_id, market_profile_id) ->
    // search_market_profiles(project_id, id) has no matching parent row.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedProfile("prof_beta_market", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO search_prompts
           (id, project_id, topic_id, prompt_text, normalized_prompt,
            prompt_type, market_profile_id, language, business_fit, priority,
            version)
         VALUES
           ('prompt_cross_market', 'proj_alpha', 'topic_alpha',
            'Cross-market prompt', 'cross-market prompt', 'comparison',
            'prof_beta_market', 'en', 80, 60, 1)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects an out-of-range business_fit score at the storage boundary", async () => {
    await seedTopic("topic_alpha", "proj_alpha");

    for (const businessFit of [150, -1, 100.5, -0.01]) {
      await expect(
        client.execute(
          `INSERT INTO search_prompts
             (id, project_id, topic_id, prompt_text, normalized_prompt,
              prompt_type, language, business_fit, priority, version)
           VALUES
             ('prompt_bad_fit_${String(businessFit).replace(".", "_")}',
              'proj_alpha', 'topic_alpha', 'Bad fit prompt',
              'bad fit prompt', 'comparison', 'en', ${businessFit}, 50, 1)`,
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("rejects an out-of-range priority score at the storage boundary", async () => {
    await seedTopic("topic_alpha", "proj_alpha");

    for (const priority of [150, -1, 100.5, -0.01]) {
      await expect(
        client.execute(
          `INSERT INTO search_prompts
             (id, project_id, topic_id, prompt_text, normalized_prompt,
              prompt_type, language, business_fit, priority, version)
           VALUES
             ('prompt_bad_priority_${String(priority).replace(".", "_")}',
              'proj_alpha', 'topic_alpha', 'Bad priority prompt',
              'bad priority prompt', 'comparison', 'en', 50, ${priority}, 1)`,
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("rejects a duplicate versioned identity (same project, prompt, market, version)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");

    await db.insert(searchPrompts).values(ALPHA_PROMPT);

    // A second row with the same (project_id, normalized_prompt,
    // market_profile_id, version) is rejected by the V1.0 versioned-identity
    // unique index.
    await expect(
      client.execute(
        `INSERT INTO search_prompts
           (id, project_id, topic_id, prompt_text, normalized_prompt,
            prompt_type, market_profile_id, language, business_fit, priority,
            version)
         VALUES
           ('prompt_alpha_v1_duplicate', 'proj_alpha', 'topic_alpha',
            'Compare {brand} against {competitor} on {topic}',
            'compare {brand} against {competitor} on {topic}', 'comparison',
            'prof_alpha_market', 'en', 85, 70, 1)`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("versions a prompt by appending a new row — history is never overwritten", async () => {
    // "Prompt version 不覆盖历史" (05_DOMAIN_DATA_MODEL.md §5): the next version
    // is a NEW row with the same normalized prompt and market but version 2; the
    // version-1 row stays intact.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");

    await db.insert(searchPrompts).values(ALPHA_PROMPT);
    await db.insert(searchPrompts).values({
      ...ALPHA_PROMPT,
      id: "prompt_alpha_v2",
      promptText: "Compare {brand} against {competitor} on {topic} — v2",
      version: 2,
    });

    const rows = await db
      .select()
      .from(searchPrompts)
      .where(eq(searchPrompts.projectId, "proj_alpha"))
      .orderBy(searchPrompts.version);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.version)).toEqual([1, 2]);
    expect(rows[0].promptText).toBe(ALPHA_PROMPT.promptText);
  });

  it("treats a different market profile as a distinct versioned identity", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");
    await seedProfile("prof_alpha_market_2", "proj_alpha");

    // Same normalized prompt + same version but a different (same-Project)
    // market profile is a distinct identity, so both rows persist.
    await db.insert(searchPrompts).values(ALPHA_PROMPT);
    await db.insert(searchPrompts).values({
      ...ALPHA_PROMPT,
      id: "prompt_alpha_market2",
      marketProfileId: "prof_alpha_market_2",
    });

    const rows = await db
      .select()
      .from(searchPrompts)
      .where(eq(searchPrompts.normalizedPrompt, ALPHA_PROMPT.normalizedPrompt));
    expect(rows).toHaveLength(2);
  });

  it("does not invent uniqueness for NULL-profile prompts (reference NULL semantics)", async () => {
    // The unique index treats NULL market_profile_id as distinct (SQL NULL
    // semantics on both dialects), so two same-version prompts with no profile
    // attached are allowed. This documents that the versioned-identity rule is
    // the SOLE uniqueness rule — no null-profile duplicate rule is added.
    await seedTopic("topic_alpha", "proj_alpha");

    await db.insert(searchPrompts).values({
      ...ALPHA_PROMPT,
      id: "prompt_null_market_1",
      marketProfileId: null,
    });
    await db.insert(searchPrompts).values({
      ...ALPHA_PROMPT,
      id: "prompt_null_market_2",
      marketProfileId: null,
    });

    const rows = await db
      .select()
      .from(searchPrompts)
      .where(eq(searchPrompts.normalizedPrompt, ALPHA_PROMPT.normalizedPrompt));
    expect(rows).toHaveLength(2);
  });

  it("cascades prompts away when their topic is deleted", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");
    await db.insert(searchPrompts).values(ALPHA_PROMPT);

    await client.execute("DELETE FROM search_topics WHERE id = 'topic_alpha'");

    const remaining = await db
      .select()
      .from(searchPrompts)
      .where(eq(searchPrompts.id, ALPHA_PROMPT.id));
    expect(remaining).toHaveLength(0);
  });

  it("cascades prompts away when their market profile is deleted", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");
    await db.insert(searchPrompts).values(ALPHA_PROMPT);

    await client.execute(
      "DELETE FROM search_market_profiles WHERE id = 'prof_alpha_market'",
    );

    const remaining = await db
      .select()
      .from(searchPrompts)
      .where(eq(searchPrompts.id, ALPHA_PROMPT.id));
    expect(remaining).toHaveLength(0);
  });

  it("cascades prompts away when their project is deleted", async () => {
    await seedTopic("topic_delete", "proj_delete");
    await db.insert(searchPrompts).values({
      id: "prompt_delete",
      projectId: "proj_delete",
      topicId: "topic_delete",
      promptText: "Doomed prompt",
      normalizedPrompt: "doomed prompt",
      promptType: "definition",
      language: "en",
      businessFit: 10,
      priority: 10,
      version: 1,
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const remaining = await db
      .select()
      .from(searchPrompts)
      .where(eq(searchPrompts.projectId, "proj_delete"));
    expect(remaining).toHaveLength(0);
  });
});
