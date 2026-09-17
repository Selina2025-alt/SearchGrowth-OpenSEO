import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import type { InferInsertModel } from "drizzle-orm";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  geoObservationRuns,
  searchMarketProfiles,
  searchPrompts,
  searchTopics,
} from "@/db/schema";
import { GeoMeasurementCohortIdentityError } from "./geoMeasurementCohortIdentityGuard";
import { GeoRepeatFractionPresenterInputError } from "./geoRepeatFractionPresenter";
import type * as CohortServiceModule from "./geoObservationBatchCohortContextService";
import type * as ReaderModule from "../repositories/GeoObservationBatchReaderRepository";
import type * as ServiceModule from "./geoBatchRepeatFractionContextService";

// The batch repeat fraction context service is exercised through the real
// accepted storage path: an in-memory SQLite database built from the actual
// forward migration DDL for geo_observation_runs (0050) plus the market profile
// (0045), topic (0046) and prompt (0049) parents its same-Project composite FKs
// reference, with foreign keys enabled. `@/db` is replaced with that handle so
// the production path runs unmodified: one Project-and-batch-scoped SELECT
// through the accepted T157 composition, one SUCCEEDED-only count over its
// returned rows, and one accepted T153 presentation of that count.
//
// Invariants under test (T158, ADR-003, ADR-005, 07_GEO_MEASUREMENT_SPEC.md
// §§1–4 and 7, 05_DOMAIN_DATA_MODEL.md §§2 and 6):
//   - only rows whose stored status is exactly SUCCEEDED are counted, for
//     all-success, mixed, and no-success batches, under both requested settings;
//   - every non-SUCCEEDED row remains in `rows` and `members` untouched and in
//     the reader's deterministic order, with raw evidence unchanged;
//   - Project and sibling-batch isolation reach storage through the service;
//   - T153 request validation, the empty-batch cohort rejection, invalid
//     selectors, and database failures all propagate rather than becoming a
//     0-fraction or an empty result;
//   - a read mutates no stored row and no stored evidence.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let readGeoBatchRepeatFractionContext: typeof ServiceModule.readGeoBatchRepeatFractionContext;
let readGeoObservationBatchCohortContext: typeof CohortServiceModule.readGeoObservationBatchCohortContext;
let ReaderError: typeof ReaderModule.GeoObservationBatchReaderError;

const DDL = [
  readFileSync("drizzle/0045_search_market_profiles.sql", "utf8"),
  readFileSync("drizzle/0046_search_topics.sql", "utf8"),
  readFileSync("drizzle/0049_gigantic_johnny_blaze.sql", "utf8"),
  readFileSync("drizzle/0050_dusty_stardust.sql", "utf8"),
].flatMap((ddl) => ddl.split(DRIZZLE_STATEMENT_SEPARATOR));

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));

  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(
    [
      `CREATE TABLE projects (id text PRIMARY KEY);`,
      `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta');`,
      ...DDL,
    ].join("\n"),
  );

  // The service module graph captures the `@/db` handle at import time, so the
  // modules must be imported after that handle is replaced; that captured handle
  // is why these dynamic imports cannot be static ones.
  ({ readGeoBatchRepeatFractionContext } =
    await import("./geoBatchRepeatFractionContextService"));
  ({ readGeoObservationBatchCohortContext } =
    await import("./geoObservationBatchCohortContextService"));
  ({ GeoObservationBatchReaderError: ReaderError } =
    await import("../repositories/GeoObservationBatchReaderRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  // Child-first teardown: runs reference prompts, profiles and topics.
  await testDb.delete(geoObservationRuns);
  await testDb.delete(searchPrompts);
  await testDb.delete(searchMarketProfiles);
  await testDb.delete(searchTopics);
});

async function seedTopic(id: string, projectId: string) {
  await testDb.insert(searchTopics).values({
    id,
    projectId,
    canonicalName: `Topic ${id}`,
    locale: "en",
    status: "ACTIVE",
  });
}

async function seedProfile(id: string, projectId: string) {
  await testDb.insert(searchMarketProfiles).values({
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

async function seedPrompt(id: string, projectId: string, topicId: string) {
  await testDb.insert(searchPrompts).values({
    id,
    projectId,
    topicId,
    promptText: `Prompt ${id}`,
    normalizedPrompt: `prompt ${id}`,
    promptType: "definition",
    language: "en",
    businessFit: 50,
    priority: 50,
    version: 2,
    active: true,
  });
}

/** Minimal valid parents for one Project's observation rows. */
async function seedParents(projectId: string) {
  const suffix = projectId === "proj_alpha" ? "alpha" : "beta";
  await seedTopic(`topic_${suffix}`, projectId);
  await seedPrompt(`prompt_${suffix}`, projectId, `topic_${suffix}`);
  await seedProfile(`prof_${suffix}_market`, projectId);
}

type RunInsert = InferInsertModel<typeof geoObservationRuns>;

/** A stored observation run. Every required field is set. */
function makeRun(overrides: Partial<RunInsert> = {}): RunInsert {
  return {
    id: "run_alpha_1",
    batchId: "batch_alpha",
    projectId: "proj_alpha",
    promptId: "prompt_alpha",
    promptVersion: 2,
    surfaceType: "MODEL_API_SEARCH",
    surfaceName: "GPT-5 Search",
    fidelity: "API_SIMULATION",
    model: "gpt-5",
    modelVersion: "2026-09-01",
    marketProfileId: "prof_alpha_market",
    repeatIndex: 0,
    applicationCacheBypassed: true,
    startedAt: "2026-09-08T04:00:00.000Z",
    status: "SUCCEEDED",
    ...overrides,
  };
}

/** Store a run directly: the service's input is accepted storage, not a fact. */
function seedRun(overrides: Partial<RunInsert> = {}) {
  return testDb.insert(geoObservationRuns).values(makeRun(overrides));
}

function selectAllRuns() {
  return testDb
    .select()
    .from(geoObservationRuns)
    .orderBy(asc(geoObservationRuns.id));
}

function readFraction(
  batchId: string,
  requestedRepeatCount: number,
  projectId = "proj_alpha",
) {
  return readGeoBatchRepeatFractionContext(
    projectId,
    batchId,
    requestedRepeatCount,
  );
}

/** Run the service and return the rejection it must have raised. */
async function captureRejection(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the service to reject, but it resolved");
}

/** A caller value the TypeScript contract does not cover, as at runtime. */
function asUntrustedRepeatCount(value: unknown): number {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted caller repeat setting is exactly what T153 must reject
  return value as number;
}

/** Every message on an error's cause chain, driver reason included. */
function failureMessages(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(" | ");
}

/** Move the accepted runs table aside so the next read fails in storage. */
function renameRunsTable(from: string, to: string) {
  return client.execute(`ALTER TABLE ${from} RENAME TO ${to}`);
}

/** One projected member as the accepted T151 contract defines it. */
function madeMember(runId: string) {
  return {
    runId,
    projectId: "proj_alpha",
    marketProfileId: "prof_alpha_market",
    surfaceType: "MODEL_API_SEARCH",
    model: "gpt-5",
    modelVersion: "2026-09-01",
  };
}

describe("readGeoBatchRepeatFractionContext counts", () => {
  it("counts only SUCCEEDED rows and presents the exact default fraction", async () => {
    await seedParents("proj_alpha");
    // Stored so that neither insertion order nor id order alone explains the
    // result: repeatIndex has to lead, and id has to break its ties.
    await seedRun({ id: "run_zulu", repeatIndex: 0 });
    await seedRun({ id: "run_alpha", repeatIndex: 1 });
    await seedRun({ id: "run_mike", repeatIndex: 1 });
    const order = ["run_zulu", "run_alpha", "run_mike"];

    const result = await readFraction("batch_alpha", 3);

    expect(result.rows.map((row) => row.id)).toEqual(order);
    expect(result.members).toEqual(order.map(madeMember));
    expect(result.context).toEqual({
      projectId: "proj_alpha",
      marketProfileId: "prof_alpha_market",
      surfaceType: "MODEL_API_SEARCH",
      model: "gpt-5",
      modelVersion: "2026-09-01",
    });
    expect(result.display).toEqual({
      completedSampleCount: 3,
      requestedRepeatCount: 3,
      displayText: "3/3",
    });
    // The returned assembly is exactly the accepted T157 output for the same
    // stored rows, so the service adds no assembly rule of its own and drops or
    // rewrites nothing on the way through.
    const assembly = await readGeoObservationBatchCohortContext(
      "proj_alpha",
      "batch_alpha",
    );
    expect(result.rows).toEqual(assembly.rows);
    expect(result.members).toEqual(assembly.members);
    expect(result.context).toEqual(assembly.context);
  });

  it("counts only SUCCEEDED rows in a mixed batch and keeps every other row", async () => {
    await seedParents("proj_alpha");
    await seedRun({
      id: "run_ok",
      repeatIndex: 0,
      rawAnswer: "  OpenSEO is recommended.\n",
      rawResponse: '{"answer":"OpenSEO is recommended."}',
    });
    await seedRun({ id: "run_pending", repeatIndex: 1, status: "PENDING" });
    await seedRun({ id: "run_running", repeatIndex: 2, status: "RUNNING" });
    await seedRun({ id: "run_failed", repeatIndex: 3, status: "FAILED" });
    const order = ["run_ok", "run_pending", "run_running", "run_failed"];

    const result = await readFraction("batch_alpha", 3);

    // One of four stored rows completed, so the exact §3 fraction is 1/3 — not
    // 1/4, and not a percentage.
    expect(result.display).toEqual({
      completedSampleCount: 1,
      requestedRepeatCount: 3,
      displayText: "1/3",
    });
    // The non-SUCCEEDED rows are excluded from the count only: they remain in
    // both the returned rows and the projected members, in reader order.
    expect(result.rows.map((row) => row.id)).toEqual(order);
    expect(result.members.map((member) => member.runId)).toEqual(order);
    // Rows come back exactly as stored: no field added, dropped, or re-encoded.
    const stored = await testDb
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, "run_ok"));
    expect(result.rows[0]).toEqual(stored[0]);
    expect(result.rows[0]?.rawAnswer).toBe("  OpenSEO is recommended.\n");
    expect(result.rows[3]?.status).toBe("FAILED");
  });

  it("presents 0/3 when no stored row succeeded", async () => {
    await seedParents("proj_alpha");
    await seedRun({ id: "run_failed", status: "FAILED" });
    await seedRun({ id: "run_pending", repeatIndex: 1, status: "PENDING" });

    const result = await readFraction("batch_alpha", 3);

    expect(result.display).toEqual({
      completedSampleCount: 0,
      requestedRepeatCount: 3,
      displayText: "0/3",
    });
    expect(result.rows.map((row) => row.id)).toEqual([
      "run_failed",
      "run_pending",
    ]);
  });

  it("presents the high-value 5-repeat fraction for the same stored completions", async () => {
    await seedParents("proj_alpha");
    await seedRun({ id: "run_1", repeatIndex: 0 });
    await seedRun({ id: "run_2", repeatIndex: 1 });
    await seedRun({ id: "run_3", repeatIndex: 2, status: "FAILED" });
    await seedRun({ id: "run_4", repeatIndex: 3, status: "RUNNING" });
    await seedRun({ id: "run_5", repeatIndex: 4 });

    const result = await readFraction("batch_alpha", 5);

    // The caller's own requested setting is presented verbatim beside the
    // counted completions: three of five succeeded.
    expect(result.display).toEqual({
      completedSampleCount: 3,
      requestedRepeatCount: 5,
      displayText: "3/5",
    });
    expect(result.rows).toHaveLength(5);
    expect(result.members).toHaveLength(5);
  });

  it("counts one Project's batch only when another Project reuses the batch id", async () => {
    await seedParents("proj_alpha");
    await seedParents("proj_beta");
    await seedRun({ id: "run_alpha", batchId: "batch_shared" });
    await seedRun({ id: "run_alpha_sibling", batchId: "batch_other" });
    await seedRun({
      id: "run_beta_1",
      batchId: "batch_shared",
      projectId: "proj_beta",
      promptId: "prompt_beta",
      marketProfileId: "prof_beta_market",
    });
    await seedRun({
      id: "run_beta_2",
      batchId: "batch_shared",
      projectId: "proj_beta",
      promptId: "prompt_beta",
      marketProfileId: "prof_beta_market",
      repeatIndex: 1,
    });

    const alpha = await readFraction("batch_shared", 3);
    const beta = await readFraction("batch_shared", 3, "proj_beta");

    expect(alpha.rows.map((row) => row.id)).toEqual(["run_alpha"]);
    expect(alpha.display).toEqual({
      completedSampleCount: 1,
      requestedRepeatCount: 3,
      displayText: "1/3",
    });
    expect(beta.rows.map((row) => row.id)).toEqual([
      "run_beta_1",
      "run_beta_2",
    ]);
    expect(beta.display).toEqual({
      completedSampleCount: 2,
      requestedRepeatCount: 3,
      displayText: "2/3",
    });
  });
});

describe("readGeoBatchRepeatFractionContext rejections", () => {
  it.each([0, 1, 2, 4, 6, 10, -3, 1.5, NaN, Infinity, "3", null])(
    "propagates T153's rejection for the unsupported requested repeat %s",
    async (value) => {
      await seedParents("proj_alpha");
      await seedRun({ id: "run_alpha" });

      const raised = await captureRejection(() =>
        readFraction("batch_alpha", asUntrustedRepeatCount(value)),
      );

      expect(raised).toBeInstanceOf(GeoRepeatFractionPresenterInputError);
      expect(raised).toMatchObject({ field: "requestedRepeatCount" });
    },
  );

  it("propagates T153's rejection when stored completions exceed the request", async () => {
    await seedParents("proj_alpha");
    // Four stored successes under a 3-repeat request is exactly the impossible
    // fraction T153 owns, so the counted figure provably reaches it.
    for (let index = 0; index < 4; index += 1) {
      await seedRun({ id: `run_${index}`, repeatIndex: index });
    }

    const raised = await captureRejection(() => readFraction("batch_alpha", 3));

    expect(raised).toBeInstanceOf(GeoRepeatFractionPresenterInputError);
    expect(raised).toMatchObject({ field: "completedSampleCount" });
  });

  it("propagates the empty-cohort rejection instead of presenting 0/3", async () => {
    await seedParents("proj_alpha");
    // A stored sibling batch proves the rejection is about this empty batch, not
    // about an unreadable or empty table.
    await seedRun({ id: "run_other_batch", batchId: "batch_other" });

    const raised = await captureRejection(() =>
      readFraction("batch_missing", 3),
    );

    // T157 surfaces T151's own non-empty-cohort rejection; the service must not
    // turn it into an honest-looking zero completion.
    expect(raised).toBeInstanceOf(GeoMeasurementCohortIdentityError);
    expect(raised).toMatchObject({ memberIndex: null, field: "members" });
  });

  it("propagates T157's selector rejections instead of a zero fraction", async () => {
    await seedParents("proj_alpha");
    await seedRun({ id: "run_alpha" });

    const emptyProject = await captureRejection(() =>
      readGeoBatchRepeatFractionContext("", "batch_alpha", 3),
    );
    const emptyBatch = await captureRejection(() =>
      readGeoBatchRepeatFractionContext("proj_alpha", "", 3),
    );

    expect(emptyProject).toBeInstanceOf(ReaderError);
    expect(emptyProject).toMatchObject({ field: "projectId" });
    expect(emptyBatch).toBeInstanceOf(ReaderError);
    expect(emptyBatch).toMatchObject({ field: "batchId" });
  });

  it("propagates a database failure instead of a zero fraction", async () => {
    await seedParents("proj_alpha");
    await seedRun({ id: "run_alpha" });
    await renameRunsTable("geo_observation_runs", "geo_observation_runs_gone");
    try {
      // The batch exists and was just usable; only storage is broken. A 0/3
      // display here would report a failed read as zero completions, so the
      // driver's own "no such table" reason has to reach the caller.
      const raised = await captureRejection(() =>
        readFraction("batch_alpha", 3),
      );

      expect(raised).not.toBeInstanceOf(GeoMeasurementCohortIdentityError);
      expect(failureMessages(raised)).toMatch(
        /no such table: geo_observation_runs/i,
      );
    } finally {
      await renameRunsTable(
        "geo_observation_runs_gone",
        "geo_observation_runs",
      );
    }
  });
});

describe("readGeoBatchRepeatFractionContext storage", () => {
  it("reads without modifying any stored row or raw evidence", async () => {
    await seedParents("proj_alpha");
    await seedRun({
      id: "run_a",
      rawAnswer: "  OpenSEO is recommended.\n",
      rawResponse: '{"answer":"OpenSEO is recommended."}',
      status: "FAILED",
    });
    await seedRun({ id: "run_b", repeatIndex: 1 });
    const before = await selectAllRuns();

    await readFraction("batch_alpha", 3);
    // The failing read path is exercised too: a rejection must not write either.
    await captureRejection(() => readFraction("batch_missing", 3));

    expect(await selectAllRuns()).toEqual(before);
  });
});
