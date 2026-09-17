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
import type * as GeoObservationBatchReaderRepositoryModule from "./GeoObservationBatchReaderRepository";

// The batch reader is exercised against the real accepted storage contract: an
// in-memory SQLite database built from the actual forward migration DDL for
// geo_observation_runs (0050) plus the market profile (0045), topic (0046) and
// prompt (0049) parents its same-Project composite FKs reference, with foreign
// keys enabled. `@/db` is replaced with that handle so the production reader
// code path (one Project-and-batch-scoped SELECT, no write of any kind) runs
// unmodified.
//
// Invariants under test (T154, ADR-003, ADR-005, 07_GEO_MEASUREMENT_SPEC.md
// §§1–3/§7, 05_DOMAIN_DATA_MODEL.md §6):
//   - only the requested Project's rows of the requested batch are returned, in
//     repeatIndex then id order, in the same order on every call;
//   - another batch of the same Project and another Project reusing the same
//     batch id are both excluded — a batch-only lookup is not possible;
//   - an empty matching batch is an empty list, not a failure and not a
//     different batch's rows;
//   - raw evidence (raw_answer, raw_response, usage_json) and every provenance
//     field come back exactly as stored, with no field added or dropped, no
//     parsing, normalization, redaction, or status/completeness filtering;
//   - an unusable selector rejects before any query, and a database failure
//     propagates instead of being converted into an empty batch;
//   - a read mutates nothing.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let reader: typeof GeoObservationBatchReaderRepositoryModule.GeoObservationBatchReaderRepository;
let ReaderError: typeof GeoObservationBatchReaderRepositoryModule.GeoObservationBatchReaderError;

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
  testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));

  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(
    [
      `CREATE TABLE projects (id text PRIMARY KEY);`,
      `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta');`,
      ...statementParts(PROFILES_DDL),
      ...statementParts(TOPICS_DDL),
      ...statementParts(PROMPTS_DDL),
      ...statementParts(RUNS_DDL),
    ].join("\n"),
  );

  // The module is imported after `@/db` is replaced, so its module-level handle
  // is the in-memory database above; that captured handle is why this dynamic
  // import cannot be a static one.
  ({
    GeoObservationBatchReaderRepository: reader,
    GeoObservationBatchReaderError: ReaderError,
  } = await import("./GeoObservationBatchReaderRepository"));
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

/** Minimal valid parents for an alpha-Project observation. */
async function seedAlphaParents() {
  await seedTopic("topic_alpha", "proj_alpha");
  await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha");
  await seedProfile("prof_alpha_market", "proj_alpha");
}

/** Minimal valid parents for a beta-Project observation. */
async function seedBetaParents() {
  await seedTopic("topic_beta", "proj_beta");
  await seedPrompt("prompt_beta", "proj_beta", "topic_beta");
  await seedProfile("prof_beta_market", "proj_beta");
}

type RunInsert = InferInsertModel<typeof geoObservationRuns>;

/** A stored observation run. Every field the reader returns is set. */
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
    provider: "OpenAI",
    engine: "chat",
    model: "gpt-5",
    modelVersion: "2026-09-01",
    webSearch: true,
    searchMode: "default",
    marketProfileId: "prof_alpha_market",
    repeatIndex: 0,
    applicationCacheBypassed: true,
    rawAnswer: "OpenSEO is recommended.",
    rawResponse: '{"answer":"OpenSEO is recommended."}',
    providerRequestId: "req_alpha_1",
    usage: '{"promptTokens":12,"completionTokens":34,"cost":0.002}',
    startedAt: "2026-09-08T04:00:00.000Z",
    finishedAt: "2026-09-08T04:00:03.000Z",
    status: "SUCCEEDED",
    ...overrides,
  };
}

/** Store a run directly: the reader's input is accepted storage, not a fact. */
async function seedRun(overrides: Partial<RunInsert> = {}) {
  await testDb.insert(geoObservationRuns).values(makeRun(overrides));
}

async function selectRun(id: string) {
  const rows = await testDb
    .select()
    .from(geoObservationRuns)
    .where(eq(geoObservationRuns.id, id));
  return rows[0];
}

function selectAllRuns() {
  return testDb
    .select()
    .from(geoObservationRuns)
    .orderBy(asc(geoObservationRuns.id));
}

/** Run the reader and return the rejection it must have raised. */
async function captureReaderError(
  run: () => Promise<unknown>,
): Promise<InstanceType<typeof ReaderError>> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ReaderError) return error;
    throw error;
  }
  throw new Error("expected the reader to reject, but it resolved");
}

/** Move the accepted runs table aside so the next read fails in storage. */
async function renameRunsTable(from: string, to: string) {
  await client.execute(`ALTER TABLE ${from} RENAME TO ${to}`);
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

/**
 * Reads a batch that is expected to fail and returns the surfaced failure
 * reason. Drizzle wraps the driver error, so the storage reason is on the cause
 * chain rather than the top-level message.
 */
async function failedReadReason(projectId: string, batchId: string) {
  try {
    await reader.readBatch(projectId, batchId);
  } catch (error) {
    return failureMessages(error);
  }
  throw new Error("expected the reader to reject, but it resolved");
}

describe("GeoObservationBatchReaderRepository reads", () => {
  it("returns one Project's batch rows in repeatIndex then id order", async () => {
    await seedAlphaParents();
    // Stored so that neither insertion order nor id order alone explains the
    // result: repeatIndex has to lead, and id has to break its ties.
    await seedRun({ id: "run_zulu", repeatIndex: 0 });
    await seedRun({ id: "run_alpha", repeatIndex: 1 });
    await seedRun({ id: "run_mike", repeatIndex: 1 });
    await seedRun({ id: "run_bravo", repeatIndex: 2 });

    const runs = await reader.readBatch("proj_alpha", "batch_alpha");
    const order = ["run_zulu", "run_alpha", "run_mike", "run_bravo"];

    expect(runs.map((run) => run.id)).toEqual(order);
    expect(runs.map((run) => run.repeatIndex)).toEqual([0, 1, 1, 2]);
    // The same call returns the same order: the result is not incidental.
    expect(
      (await reader.readBatch("proj_alpha", "batch_alpha")).map(
        (run) => run.id,
      ),
    ).toEqual(order);
  });

  it("excludes the same Project's other batches", async () => {
    await seedAlphaParents();
    await seedRun({ id: "run_kept", batchId: "batch_alpha" });
    await seedRun({ id: "run_other", batchId: "batch_beta" });

    const runs = await reader.readBatch("proj_alpha", "batch_alpha");

    expect(runs.map((run) => run.id)).toEqual(["run_kept"]);
  });

  it("excludes another Project that reuses the same batch id", async () => {
    await seedAlphaParents();
    await seedBetaParents();
    await seedRun({ id: "run_alpha", batchId: "batch_shared" });
    await seedRun({
      id: "run_beta",
      batchId: "batch_shared",
      projectId: "proj_beta",
      promptId: "prompt_beta",
      marketProfileId: "prof_beta_market",
      providerRequestId: "req_beta_1",
    });

    // The batch id alone is shared; the Project is what separates the two
    // batches, so neither read can see the other Project's rows.
    expect(
      (await reader.readBatch("proj_alpha", "batch_shared")).map(
        (run) => run.id,
      ),
    ).toEqual(["run_alpha"]);
    expect(
      (await reader.readBatch("proj_beta", "batch_shared")).map(
        (run) => run.id,
      ),
    ).toEqual(["run_beta"]);
  });

  it("returns an empty list when the Project has no runs in that batch", async () => {
    await seedAlphaParents();
    await seedRun({ id: "run_alpha", batchId: "batch_alpha" });

    // A stored sibling batch proves the empty answer is about this batch, not
    // about an unreadable or empty table.
    expect(await reader.readBatch("proj_alpha", "batch_missing")).toEqual([]);
  });

  it("returns stored raw evidence and provenance exactly as stored", async () => {
    await seedAlphaParents();
    await seedRun({
      id: "run_evidence",
      rawAnswer: "  OpenSEO is recommended.\n",
      rawResponse:
        '{"answer":"OpenSEO is recommended.","citations":[{"url":"https://openseo.dev"}]}',
      usage: '{"promptTokens":12,"completionTokens":34,"cost":0.002}',
      providerRequestId: "req_evidence",
      modelVersion: "2026-09-01",
      webSearch: false,
      searchMode: "deep",
      status: "FAILED",
      finishedAt: null,
    });
    // A second repeat that never captured a payload: NULL evidence stays NULL
    // rather than becoming an empty or placeholder value.
    await seedRun({
      id: "run_no_payload",
      repeatIndex: 1,
      rawAnswer: null,
      rawResponse: null,
      usage: null,
      providerRequestId: null,
    });

    const runs = await reader.readBatch("proj_alpha", "batch_alpha");
    const stored = await selectRun("run_evidence");

    expect(runs).toHaveLength(2);
    expect(stored).toBeDefined();
    expect(runs[0]).toEqual(stored);
    // No field is added (no derived metric, fraction, or cohort label) and none
    // is dropped or redacted on the way out.
    expect(Object.keys(runs[0])).toEqual(Object.keys(stored));
    expect(runs[0]).toMatchObject({
      rawAnswer: "  OpenSEO is recommended.\n",
      rawResponse:
        '{"answer":"OpenSEO is recommended.","citations":[{"url":"https://openseo.dev"}]}',
      usage: '{"promptTokens":12,"completionTokens":34,"cost":0.002}',
      providerRequestId: "req_evidence",
      provider: "OpenAI",
      engine: "chat",
      model: "gpt-5",
      modelVersion: "2026-09-01",
      webSearch: false,
      searchMode: "deep",
      marketProfileId: "prof_alpha_market",
      applicationCacheBypassed: true,
      status: "FAILED",
    });
    // A failed repeat is still a stored run of the batch: the reader does not
    // judge completeness, quality, or metric eligibility.
    expect(runs.map((run) => run.id)).toEqual([
      "run_evidence",
      "run_no_payload",
    ]);
    expect(runs[1]?.rawResponse).toBeNull();
    expect(runs[1]?.usage).toBeNull();
    expect(runs[1]?.providerRequestId).toBeNull();
  });

  it("reads without modifying any stored run row", async () => {
    await seedAlphaParents();
    await seedRun({ id: "run_a" });
    await seedRun({ id: "run_b", repeatIndex: 1, batchId: "batch_beta" });
    const before = await selectAllRuns();

    await reader.readBatch("proj_alpha", "batch_alpha");
    await reader.readBatch("proj_alpha", "batch_missing");

    expect(await selectAllRuns()).toEqual(before);
  });

  it("propagates a database failure instead of returning an empty batch", async () => {
    await seedAlphaParents();
    await seedRun({ id: "run_alpha" });
    await renameRunsTable(
      "geo_observation_runs",
      "geo_observation_runs_hidden",
    );
    try {
      // The batch exists and was just readable; only storage is broken. An
      // empty list here would report a failed read as an empty batch, so the
      // driver's own "no such table" reason has to reach the caller.
      const reason = await failedReadReason("proj_alpha", "batch_alpha");

      expect(reason).toMatch(/no such table: geo_observation_runs/i);
    } finally {
      await renameRunsTable(
        "geo_observation_runs_hidden",
        "geo_observation_runs",
      );
    }
  });
});

describe("GeoObservationBatchReaderRepository selector validation", () => {
  it.each([
    ["a number", 42],
    ["null", null],
    ["an absent value", undefined],
    ["an object", {}],
  ])("rejects %s as projectId", async (_label, value) => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the reader must reject at runtime
    const untrustedProjectId = value as unknown as string;

    const error = await captureReaderError(() =>
      reader.readBatch(untrustedProjectId, "batch_alpha"),
    );

    expect(error.name).toBe("GeoObservationBatchReaderError");
    expect(error.field).toBe("projectId");
    expect(error.message).toMatch(/projectId/);
  });

  it.each([
    ["a number", 42],
    ["null", null],
    ["an absent value", undefined],
    ["an object", {}],
  ])("rejects %s as batchId", async (_label, value) => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the reader must reject at runtime
    const untrustedBatchId = value as unknown as string;

    const error = await captureReaderError(() =>
      reader.readBatch("proj_alpha", untrustedBatchId),
    );

    expect(error.name).toBe("GeoObservationBatchReaderError");
    expect(error.field).toBe("batchId");
    expect(error.message).toMatch(/batchId/);
  });

  it("rejects an empty projectId before reading any stored row", async () => {
    // A decoy under the empty-Project key: if the empty id reached the SELECT it
    // would return this row, so the rejection is the proof that no query ran.
    await client.execute("INSERT OR IGNORE INTO projects (id) VALUES ('')");
    await seedTopic("topic_empty", "");
    await seedPrompt("prompt_empty", "", "topic_empty");
    await seedRun({
      id: "run_empty_project",
      projectId: "",
      promptId: "prompt_empty",
      marketProfileId: null,
    });

    const error = await captureReaderError(() =>
      reader.readBatch("", "batch_alpha"),
    );

    expect(error.field).toBe("projectId");
    expect(error.message).toBe(
      "GEO observation batch reader: projectId must be a non-empty string.",
    );
  });

  it("rejects an empty batchId before reading any stored row", async () => {
    // The same decoy under the empty-batch key. The Project is valid here, so
    // only the batchId rule can explain the rejection.
    await seedAlphaParents();
    await seedRun({ id: "run_empty_batch", batchId: "" });

    const error = await captureReaderError(() =>
      reader.readBatch("proj_alpha", ""),
    );

    expect(error.field).toBe("batchId");
    expect(error.message).toBe(
      "GEO observation batch reader: batchId must be a non-empty string.",
    );
  });
});
