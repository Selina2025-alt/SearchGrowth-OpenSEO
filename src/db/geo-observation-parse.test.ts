import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  geoObservationParses,
  geoObservationRuns,
  searchMarketProfiles,
  searchPrompts,
  searchTopics,
} from "./search-growth.schema";
import type {
  GeoObservationAccuracyStatus,
  GeoObservationParseStatus,
} from "@/types/schemas/geo-observation-parse";

// Real in-memory SQLite built from the actual forward migration DDL for the
// append-only parse table (0051), plus its parents (market profile 0045, topic
// 0046, prompt 0049, immutable raw-run 0050). Foreign keys are ON so the run FK
// cascade, the (run_id, parser_version) version-identity rule and the delete
// behavior are exercised against the shipped storage contract.
//
// Invariants: a valid §7 parse persists; every parse_status/accuracy_status
// enum value stores and NULL accuracy + the documented is_current default
// persist; v1/v2 parses of the same raw run coexist while a duplicate version
// is rejected and the same version on DIFFERENT runs is allowed (no global
// uniqueness); the raw run stays byte-identical while parses coexist
// (21_TEST_ACCEPTANCE_PLAN.md §6, ADR-005); deleting a run/project cascades
// parses away; and the schema is append-only with ONLY the direct §7 fields
// (no updated_at, parser_model, recommendation or parsed_json column).

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let db: ReturnType<typeof drizzle>;

type NewParse = typeof geoObservationParses.$inferInsert;

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
      ...statementParts(
        readFileSync("drizzle/0045_search_market_profiles.sql", "utf8"),
      ),
      ...statementParts(readFileSync("drizzle/0046_search_topics.sql", "utf8")),
      ...statementParts(
        readFileSync("drizzle/0049_gigantic_johnny_blaze.sql", "utf8"),
      ),
      ...statementParts(
        readFileSync("drizzle/0050_dusty_stardust.sql", "utf8"),
      ),
      ...statementParts(
        readFileSync("drizzle/0051_cuddly_matthew_murdock.sql", "utf8"),
      ),
    ].join("\n"),
  );
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await db.delete(geoObservationParses);
  await db.delete(geoObservationRuns);
  await db.delete(searchPrompts);
  await db.delete(searchMarketProfiles);
  await db.delete(searchTopics);
});

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

async function seedTopic(id: string, projectId: string) {
  await db.insert(searchTopics).values({
    id,
    projectId,
    canonicalName: `Topic ${id}`,
    locale: "en",
    status: "ACTIVE",
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

async function countParsesFor(runId: string) {
  const rows = await db
    .select({ id: geoObservationParses.id })
    .from(geoObservationParses)
    .where(eq(geoObservationParses.runId, runId));
  return rows.length;
}

describe("geo_observation_parses storage contract", () => {
  it("persists a valid parse with the full V1.0 field set", async () => {
    await seedRun();
    await insertParse("parse_alpha_v1", {
      parserVersion: "1.0.0",
      parseStatus: "SUCCESS",
      accuracyStatus: "ACCURATE",
      parsedAt: "2026-09-08T04:00:05.000Z",
      isCurrent: true,
    });

    const rows = await db
      .select()
      .from(geoObservationParses)
      .where(eq(geoObservationParses.id, "parse_alpha_v1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "parse_alpha_v1",
      runId: "run_alpha_1",
      parserVersion: "1.0.0",
      parseStatus: "SUCCESS",
      accuracyStatus: "ACCURATE",
      parsedAt: "2026-09-08T04:00:05.000Z",
      isCurrent: true,
    });
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("stores every approved parse_status and accuracy_status enum value", async () => {
    await seedRun();
    const parseStatuses = geoObservationParses.parseStatus
      .enumValues as GeoObservationParseStatus[];
    const accuracyStatuses = geoObservationParses.accuracyStatus
      .enumValues as GeoObservationAccuracyStatus[];
    for (const parseStatus of parseStatuses) {
      await insertParse(`parse_enum_p_${parseStatus}`, {
        parserVersion: `enum-p-${parseStatus}`,
        parseStatus,
      });
    }
    for (const accuracyStatus of accuracyStatuses) {
      await insertParse(`parse_enum_a_${accuracyStatus}`, {
        parserVersion: `enum-a-${accuracyStatus}`,
        accuracyStatus,
      });
    }

    const stored = await db
      .select()
      .from(geoObservationParses)
      .where(eq(geoObservationParses.runId, ALPHA_RUN.id));
    // 3 parse statuses + 4 accuracy statuses = 7 rows.
    expect(stored).toHaveLength(7);
    expect(stored.map((row) => row.parseStatus)).toEqual(
      expect.arrayContaining(["SUCCESS", "PARTIAL", "FAILED"]),
    );
    expect(stored.map((row) => row.accuracyStatus)).toEqual(
      expect.arrayContaining(["ACCURATE", "PARTIAL", "INACCURATE", "UNKNOWN"]),
    );
  });

  it("persists NULL accuracy_status and the documented is_current default false", async () => {
    await seedRun();
    // Raw insert omits is_current and accuracy_status so DB defaults apply:
    // accuracy_status NULL and is_current DEFAULT false.
    await client.execute(
      `INSERT INTO geo_observation_parses
         (id, run_id, parser_version, parse_status, parsed_at)
       VALUES
         ('parse_failed', 'run_alpha_1', '1.0.0', 'FAILED',
          '2026-09-08T04:00:06.000Z')`,
    );

    const rows = await db
      .select()
      .from(geoObservationParses)
      .where(eq(geoObservationParses.id, "parse_failed"));
    expect(rows).toHaveLength(1);
    expect(rows[0].accuracyStatus).toBeNull();
    expect(rows[0].isCurrent).toBe(false);
  });

  it("lets v1/v2 parses of the same raw run coexist", async () => {
    await seedRun();
    await insertParse("parse_alpha_v1", {
      parserVersion: "1.0.0",
      parseStatus: "SUCCESS",
      accuracyStatus: "ACCURATE",
    });
    // Parser v2 reparse of the same raw run (ADR-005) is a second row — the run
    // row itself is never rewritten.
    await insertParse("parse_alpha_v2", {
      parserVersion: "2.0.0",
      parseStatus: "PARTIAL",
      accuracyStatus: "UNKNOWN",
      isCurrent: true,
    });

    const rows = await db
      .select()
      .from(geoObservationParses)
      .where(eq(geoObservationParses.runId, ALPHA_RUN.id));
    expect(rows).toHaveLength(2);
    expect(
      sort(
        rows.map((row) => row.parserVersion),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(["1.0.0", "2.0.0"]);
  });

  it("rejects a duplicate parser version of the same raw run", async () => {
    await seedRun();
    await client.execute(
      `INSERT INTO geo_observation_parses
         (id, run_id, parser_version, parse_status, parsed_at)
       VALUES
         ('parse_v1', 'run_alpha_1', '1.0.0', 'SUCCESS',
          '2026-09-08T04:00:05.000Z')`,
    );

    // Same (run_id, parser_version) violates the sole version-identity rule
    // (migrations-reference.sql idx_geo_parse_version).
    await expect(
      client.execute(
        `INSERT INTO geo_observation_parses
           (id, run_id, parser_version, parse_status, parsed_at)
         VALUES
           ('parse_v1_dup', 'run_alpha_1', '1.0.0', 'SUCCESS',
            '2026-09-08T04:00:06.000Z')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
    expect(await countParsesFor(ALPHA_RUN.id)).toBe(1);
  });

  it("allows the same parser version on different raw runs (no global uniqueness)", async () => {
    await seedRun();
    await seedRun({
      id: "run_beta_1",
      projectId: "proj_beta",
      promptId: "prompt_proj_beta",
    });
    await insertParse("parse_alpha_v1", {
      parserVersion: "1.0.0",
      parseStatus: "SUCCESS",
    });
    await insertParse("parse_beta_v1", {
      runId: "run_beta_1",
      parserVersion: "1.0.0",
      parseStatus: "SUCCESS",
      isCurrent: true,
    });

    const rows = await db.select().from(geoObservationParses);
    expect(rows).toHaveLength(2);
  });

  it("leaves the raw run byte-identical while v1/v2 parses coexist", async () => {
    await seedRun();
    const runBefore = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, ALPHA_RUN.id));

    await insertParse("parse_alpha_v1", {
      parserVersion: "1.0.0",
      parseStatus: "SUCCESS",
      accuracyStatus: "ACCURATE",
    });
    await insertParse("parse_alpha_v2", {
      parserVersion: "2.0.0",
      parseStatus: "PARTIAL",
      accuracyStatus: "UNKNOWN",
      isCurrent: true,
    });

    const runAfter = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, ALPHA_RUN.id));
    // Raw is immutable (never UPDATE — 21_TEST_ACCEPTANCE_PLAN.md §6).
    expect(runAfter).toEqual(runBefore);
  });

  it("cascades parses away when their raw run is deleted", async () => {
    await seedRun();
    await insertParse("parse_alpha_v1", { parserVersion: "1.0.0" });
    await insertParse("parse_alpha_v2", { parserVersion: "2.0.0" });

    await client.execute(
      "DELETE FROM geo_observation_runs WHERE id = 'run_alpha_1'",
    );

    expect(await countParsesFor(ALPHA_RUN.id)).toBe(0);
  });

  it("cascades parses away when their project is deleted (through the run)", async () => {
    await seedRun({
      id: "run_delete",
      projectId: "proj_delete",
      promptId: "prompt_proj_delete",
    });
    await insertParse("parse_delete_v1", { runId: "run_delete" });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    expect(await countParsesFor("run_delete")).toBe(0);
  });

  it("is append-only by schema shape and ships ONLY the direct §7 fields", async () => {
    const tableInfo = await client.execute(
      "SELECT name FROM pragma_table_info('geo_observation_parses')",
    );
    const columns = sort(
      tableInfo.rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string"),
      (a, b) => a.localeCompare(b),
    );

    // The exact §7 field list + the append-only created_at system timestamp.
    // No updated_at, and NO parser_model / recommendation / parsed_json /
    // entity / citation column — those belong to later tasks.
    expect(columns).toEqual([
      "accuracy_status",
      "created_at",
      "id",
      "is_current",
      "parse_status",
      "parsed_at",
      "parser_version",
      "run_id",
    ]);
  });
});
