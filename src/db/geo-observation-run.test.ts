import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  geoObservationRuns,
  searchMarketProfiles,
  searchPrompts,
  searchTopics,
} from "./search-growth.schema";
import type {
  GeoObservationRunStatus,
  ObservationSurfaceType,
  SurfaceFidelity,
} from "@/types/schemas/geo-observation-run";

// Real in-memory SQLite built from the actual forward migration DDL for the
// append-only run table (0050), plus the market profile (0045), topic (0046)
// and prompt (0049) parents its same-Project composite FKs reference. Foreign
// keys are enabled so the same-Project FKs, the repeat-index CHECK constraint
// and the cascade delete behavior are exercised against the shipped storage
// contract — not an application convention.
//
// Invariants under test:
//   - A valid run persists with the full V1.0 field set (05_DOMAIN_DATA_MODEL.md
//     §6), including the explicit raw payload captures.
//   - Every canonical surface-type / fidelity / run-status enum value stores as
//     the DB text-enum column (boundary rejection of unsupported / case-
//     mismatched / empty values is proven at the Zod boundary in
//     src/types/schemas/geo-observation-run.test.ts).
//   - repeat_index is non-negative at the storage boundary (CHECK); the integer
//     part is validated at the Zod boundary.
//   - The prompt (and the optional market profile) must belong to the SAME
//     project (composite FKs with the run's project_id as leading column);
//     cross-Project references are rejected by the DB.
//   - The row is append-only by schema shape: no `updated_at` column exists,
//     and NO uniqueness rule prevents two independent repeat observations of
//     the same prompt/provider/model/surface (21_TEST_ACCEPTANCE_PLAN.md §3).
//   - Deleting a prompt, a market profile or a whole Project cascades the run
//     away, so a run can never dangle.

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
const RUNS_DDL = readFileSync("drizzle/0050_dusty_stardust.sql", "utf8");

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
      ...statementParts(RUNS_DDL),
    ].join("\n"),
  );
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await db.delete(geoObservationRuns);
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

async function seedPrompt(
  id: string,
  projectId: string,
  topicId: string,
  version = 1,
) {
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
    version,
    active: true,
  });
}

const ALPHA_RUN = {
  id: "run_alpha_1",
  batchId: "batch_alpha",
  projectId: "proj_alpha",
  promptId: "prompt_alpha",
  promptVersion: 2,
  surfaceType: "MODEL_API_SEARCH",
  surfaceName: "GPT-5 Search",
  fidelity: "API_SIMULATION",
  provider: "OpenAI",
  engine: "chat",
  model: "gpt-5",
  modelVersion: "2026-09-01",
  webSearch: true,
  searchMode: "default",
  marketProfileId: "prof_alpha_market",
  repeatIndex: 0,
  applicationCacheBypassed: true,
  rawAnswer: "OpenAI 会把 OpenSEO 列为推荐工具。",
  rawResponse: JSON.stringify({
    answer: "OpenAI 会把 OpenSEO 列为推荐工具。",
    citations: [{ url: "https://openseo.dev", title: "OpenSEO", position: 1 }],
  }),
  providerRequestId: "req_alpha_1",
  usage: JSON.stringify({ inputTokens: 128, outputTokens: 340, cost: 0.0021 }),
  startedAt: "2026-09-08T04:00:00.000Z",
  finishedAt: "2026-09-08T04:00:03.000Z",
  status: "SUCCEEDED",
} as const;

describe("geo_observation_runs storage contract", () => {
  it("persists a valid run with the full V1.0 field set and keeps projects isolated", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha", 2);
    await seedProfile("prof_alpha_market", "proj_alpha");
    await seedTopic("topic_beta", "proj_beta");
    await seedPrompt("prompt_beta", "proj_beta", "topic_beta");

    await db.insert(geoObservationRuns).values([ALPHA_RUN]);

    const alphaRows = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.projectId, "proj_alpha"));

    expect(alphaRows).toHaveLength(1);
    expect(alphaRows[0]).toMatchObject(ALPHA_RUN);
    // The exact uppercase enum values round-trip as the DB text-enum columns.
    expect(alphaRows[0].surfaceType).toBe("MODEL_API_SEARCH");
    expect(alphaRows[0].fidelity).toBe("API_SIMULATION");
    expect(alphaRows[0].status).toBe("SUCCEEDED");

    const betaCount = await db
      .select({ id: geoObservationRuns.id })
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.projectId, "proj_beta"));
    expect(betaCount).toHaveLength(0);
  });

  it("stores every approved surface-type, fidelity and run-status enum value", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha");

    const surfaceTypes = geoObservationRuns.surfaceType
      .enumValues as ObservationSurfaceType[];
    const fidelities = geoObservationRuns.fidelity
      .enumValues as SurfaceFidelity[];
    const statuses = geoObservationRuns.status
      .enumValues as GeoObservationRunStatus[];
    for (const [index, surfaceType] of surfaceTypes.entries()) {
      for (const [fidelityIndex, fidelity] of fidelities.entries()) {
        await db.insert(geoObservationRuns).values({
          id: `run_enum_${index}_${fidelityIndex}`,
          batchId: "batch_enum",
          projectId: "proj_alpha",
          promptId: "prompt_alpha",
          promptVersion: 1,
          surfaceType,
          surfaceName: `Surface ${surfaceType}`,
          fidelity,
          repeatIndex: 0,
          applicationCacheBypassed: true,
          startedAt: "2026-09-08T04:00:00.000Z",
          status: "PENDING",
        });
      }
    }
    for (const [index, status] of statuses.entries()) {
      await db.insert(geoObservationRuns).values({
        id: `run_status_${index}`,
        batchId: "batch_enum",
        projectId: "proj_alpha",
        promptId: "prompt_alpha",
        promptVersion: 1,
        surfaceType: "MANUAL_CONSUMER_OBSERVATION",
        surfaceName: "Manual consumer",
        fidelity: "MANUAL_OBSERVED",
        repeatIndex: 0,
        applicationCacheBypassed: false,
        startedAt: "2026-09-08T04:00:00.000Z",
        status,
      });
    }

    const stored = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.batchId, "batch_enum"));
    // 4 surface types × 4 fidelities + 4 run statuses = 20 rows.
    expect(stored).toHaveLength(20);
  });

  it("persists a run with no market profile and with NULL optional provenance", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha");

    await db.insert(geoObservationRuns).values({
      ...ALPHA_RUN,
      id: "run_no_market",
      marketProfileId: null,
      provider: null,
      engine: null,
      model: null,
      modelVersion: null,
      webSearch: null,
      searchMode: null,
      providerRequestId: null,
      usage: null,
      rawAnswer: null,
      rawResponse: null,
      finishedAt: null,
    });

    const rows = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, "run_no_market"));
    expect(rows).toHaveLength(1);
    expect(rows[0].marketProfileId).toBeNull();
    expect(rows[0].provider).toBeNull();
    expect(rows[0].webSearch).toBeNull();
    expect(rows[0].rawAnswer).toBeNull();
    expect(rows[0].usage).toBeNull();
    expect(rows[0].finishedAt).toBeNull();
  });

  it("persists raw answer/response/usage payloads verbatim (raw capture round-trip)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");

    await db.insert(geoObservationRuns).values(ALPHA_RUN);

    const rows = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, ALPHA_RUN.id));
    expect(rows).toHaveLength(1);
    // Raw payloads are stored exactly as captured — no parsing/rewrite here.
    expect(rows[0].rawAnswer).toBe(ALPHA_RUN.rawAnswer);
    expect(rows[0].rawResponse).toBe(ALPHA_RUN.rawResponse);
    expect(rows[0].usage).toBe(ALPHA_RUN.usage);
    expect(rows[0].providerRequestId).toBe(ALPHA_RUN.providerRequestId);
  });

  it("rejects a negative repeat index at the storage boundary", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha");

    await expect(
      client.execute(
        `INSERT INTO geo_observation_runs
           (id, batch_id, project_id, prompt_id, prompt_version, surface_type,
            surface_name, fidelity, repeat_index, application_cache_bypassed,
            started_at, status)
         VALUES
           ('run_neg_repeat', 'batch_alpha', 'proj_alpha', 'prompt_alpha', 1,
            'MODEL_API_SEARCH', 'GPT-5 Search', 'API_SIMULATION', -1,
            1, '2026-09-08T04:00:00.000Z', 'SUCCEEDED')`,
      ),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("accepts a repeat_index of 0 and positive repeats (independent repeat rows)", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");

    await db.insert(geoObservationRuns).values(ALPHA_RUN);
    await db.insert(geoObservationRuns).values({
      ...ALPHA_RUN,
      id: "run_alpha_2",
      providerRequestId: "req_alpha_2",
      repeatIndex: 1,
    });
    await db.insert(geoObservationRuns).values({
      ...ALPHA_RUN,
      id: "run_alpha_3",
      providerRequestId: "req_alpha_3",
      repeatIndex: 2,
    });

    const rows = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.promptId, ALPHA_RUN.promptId));
    expect(rows).toHaveLength(3);
  });

  it("rejects a run whose prompt belongs to another project", async () => {
    // prompt_beta lives on proj_beta; the run row claims proj_alpha, so the
    // composite FK (project_id, prompt_id) -> search_prompts(project_id, id)
    // has no matching parent row.
    await seedTopic("topic_beta", "proj_beta");
    await seedPrompt("prompt_beta", "proj_beta", "topic_beta");

    await expect(
      client.execute(
        `INSERT INTO geo_observation_runs
           (id, batch_id, project_id, prompt_id, prompt_version, surface_type,
            surface_name, fidelity, repeat_index, application_cache_bypassed,
            started_at, status)
         VALUES
           ('run_cross_prompt', 'batch_alpha', 'proj_alpha', 'prompt_beta', 1,
            'MODEL_API_SEARCH', 'GPT-5 Search', 'API_SIMULATION', 0,
            1, '2026-09-08T04:00:00.000Z', 'SUCCEEDED')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a run whose market profile belongs to another project", async () => {
    // prof_beta_market lives on proj_beta; the run row claims proj_alpha, so
    // the composite FK (project_id, market_profile_id) ->
    // search_market_profiles(project_id, id) has no matching parent row.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha");
    await seedProfile("prof_beta_market", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO geo_observation_runs
           (id, batch_id, project_id, prompt_id, prompt_version, surface_type,
            surface_name, fidelity, market_profile_id, repeat_index,
            application_cache_bypassed, started_at, status)
         VALUES
           ('run_cross_market', 'batch_alpha', 'proj_alpha', 'prompt_alpha', 1,
            'MODEL_API_SEARCH', 'GPT-5 Search', 'API_SIMULATION',
            'prof_beta_market', 0, 1, '2026-09-08T04:00:00.000Z', 'SUCCEEDED')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("is append-only by schema shape: no updated_at column and no mutation uniqueness", async () => {
    const tableInfo = await client.execute(
      "SELECT name FROM pragma_table_info('geo_observation_runs')",
    );
    const columns = tableInfo.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string");
    expect(columns).toContain("created_at");
    expect(columns).not.toContain("updated_at");

    // Two independent observations of the SAME prompt/provider/model/surface
    // (21_TEST_ACCEPTANCE_PLAN.md §3 repeats) both persist — no uniqueness rule
    // groups or dedupes them, even at the same repeat_index.
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");
    await db.insert(geoObservationRuns).values(ALPHA_RUN);
    await db.insert(geoObservationRuns).values({
      ...ALPHA_RUN,
      id: "run_alpha_duplicate_same_index",
      providerRequestId: "req_alpha_1b",
    });

    const rows = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.projectId, "proj_alpha"));
    expect(rows).toHaveLength(2);
  });

  it("cascades runs away when their prompt is deleted", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");
    await db.insert(geoObservationRuns).values(ALPHA_RUN);

    await client.execute(
      "DELETE FROM search_prompts WHERE id = 'prompt_alpha'",
    );

    const remaining = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, ALPHA_RUN.id));
    expect(remaining).toHaveLength(0);
  });

  it("cascades runs away when their market profile is deleted", async () => {
    await seedTopic("topic_alpha", "proj_alpha");
    await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha");
    await seedProfile("prof_alpha_market", "proj_alpha");
    await db.insert(geoObservationRuns).values(ALPHA_RUN);

    await client.execute(
      "DELETE FROM search_market_profiles WHERE id = 'prof_alpha_market'",
    );

    const remaining = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, ALPHA_RUN.id));
    expect(remaining).toHaveLength(0);
  });

  it("cascades runs away when their project is deleted", async () => {
    await seedTopic("topic_delete", "proj_delete");
    await seedPrompt("prompt_delete", "proj_delete", "topic_delete");
    await db.insert(geoObservationRuns).values({
      id: "run_delete",
      batchId: "batch_delete",
      projectId: "proj_delete",
      promptId: "prompt_delete",
      promptVersion: 1,
      surfaceType: "MANUAL_CONSUMER_OBSERVATION",
      surfaceName: "Manual consumer",
      fidelity: "MANUAL_OBSERVED",
      repeatIndex: 0,
      applicationCacheBypassed: false,
      startedAt: "2026-09-08T04:00:00.000Z",
      status: "SUCCEEDED",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const remaining = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.projectId, "proj_delete"));
    expect(remaining).toHaveLength(0);
  });
});
