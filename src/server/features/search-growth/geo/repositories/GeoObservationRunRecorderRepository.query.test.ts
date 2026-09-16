import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
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
import type { GeoObservationRunFact } from "../services/freshGeoSampling";
import type * as GeoObservationRunRecorderRepositoryModule from "./GeoObservationRunRecorderRepository";

// The recorder adapter is exercised against the real accepted storage contract:
// an in-memory SQLite database built from the actual forward migration DDL for
// geo_observation_runs (0050) plus the market profile (0045), topic (0046) and
// prompt (0049) parents its same-Project composite FKs reference, with foreign
// keys enabled. `@/db` is replaced with that handle so the production adapter
// code path (one INSERT, no update/upsert) runs unmodified.
//
// Invariants under test (T139, ADR-003, 07_GEO_MEASUREMENT_SPEC.md §§2–3/§5,
// 05_DOMAIN_DATA_MODEL.md §6):
//   - one fact persists exactly one row with every provenance field faithful;
//   - a string raw response is stored verbatim, a nested JSON-safe one as JSON
//     text that parses back strictly equal (nested "" included — only the root
//     capture must be nonblank);
//   - repeats are independent rows (no dedupe/update), and a pre-existing raw
//     run is never modified by a later record;
//   - duplicate ids and same-Project FK violations propagate to the caller;
//   - a raw response JSON text cannot carry back unchanged — at the root or
//     anywhere in the tree, including `-0`, accessors, and array-symbol
//     properties — is rejected before any row is written.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let recorder: typeof GeoObservationRunRecorderRepositoryModule.GeoObservationRunRecorderRepository;

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

  ({ GeoObservationRunRecorderRepository: recorder } =
    await import("./GeoObservationRunRecorderRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
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

async function seedPrompt(
  id: string,
  projectId: string,
  topicId: string,
  version = 2,
) {
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
    version,
    active: true,
  });
}

/** Minimal valid parents for an alpha-Project observation. */
async function seedAlphaParents() {
  await seedTopic("topic_alpha", "proj_alpha");
  await seedPrompt("prompt_alpha", "proj_alpha", "topic_alpha");
  await seedProfile("prof_alpha_market", "proj_alpha");
}

function makeFact(
  overrides: Partial<GeoObservationRunFact> = {},
): GeoObservationRunFact {
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
    providerRequestId: "req_alpha_1",
    rawResponse: "OpenAI recommends OpenSEO.",
    startedAt: "2026-09-08T04:00:00.000Z",
    finishedAt: "2026-09-08T04:00:03.000Z",
    status: "SUCCEEDED",
    ...overrides,
  };
}

async function selectRun(id: string) {
  const rows = await testDb
    .select()
    .from(geoObservationRuns)
    .where(eq(geoObservationRuns.id, id));
  return rows[0];
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
 * Records a fact that is expected to fail and returns the surfaced failure
 * reason. Drizzle wraps the driver error, so the constraint reason is on the
 * cause chain rather than the top-level message.
 */
async function failedRecordReason(fact: GeoObservationRunFact) {
  try {
    await recorder.record(fact);
  } catch (error) {
    return failureMessages(error);
  }
  throw new Error("expected the recorder to reject, but it resolved");
}

/**
 * Records raw evidence that must be rejected, and asserts the rejection wrote
 * no row at all — not an empty, rewritten, or placeholder one.
 */
async function expectRawRejected(rawResponse: unknown) {
  await expect(recorder.record(makeFact({ rawResponse }))).rejects.toThrow(
    /raw response/i,
  );
  expect(await testDb.select().from(geoObservationRuns)).toHaveLength(0);
}

/** A plain object/array whose own enumerable string-keyed property is a getter. */
function withAccessor<T extends object>(target: T, key: string): T {
  return Object.defineProperty(target, key, {
    get: () => "a",
    enumerable: true,
  });
}

describe("GeoObservationRunRecorderRepository", () => {
  it("persists one fact as one row with every provenance field faithful", async () => {
    await seedAlphaParents();
    const fact = makeFact();

    await recorder.record(fact);

    const row = await selectRun(fact.id);
    expect(row).toMatchObject({
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
      rawResponse: "OpenAI recommends OpenSEO.",
      providerRequestId: "req_alpha_1",
      startedAt: "2026-09-08T04:00:00.000Z",
      finishedAt: "2026-09-08T04:00:03.000Z",
      status: "SUCCEEDED",
    });
    // Fields the fact does not carry are not synthesized: raw_answer/usage_json
    // stay NULL and created_at keeps its database default.
    expect(row?.rawAnswer).toBeNull();
    expect(row?.usage).toBeNull();
    expect(row?.createdAt).toEqual(expect.any(String));
  });

  it("stores a string raw response verbatim without trimming or rewriting", async () => {
    await seedAlphaParents();
    const rawResponse = "  line one\n\ttabbed line  ";

    await recorder.record(makeFact({ rawResponse }));

    const row = await selectRun("run_alpha_1");
    expect(row?.rawResponse).toBe(rawResponse);
  });

  it("round-trips a nested JSON-safe raw response unchanged", async () => {
    await seedAlphaParents();
    // A value shared by two sibling branches serializes as two equal copies and
    // is not a cycle.
    const citation = {
      url: "https://openseo.dev",
      title: "OpenSEO",
      position: 1,
      verified: true,
      note: null,
    };
    const payload = {
      answer: "OpenAI recommends OpenSEO.",
      citations: [citation],
      duplicateCitation: citation,
      usage: { promptTokens: 12, completionTokens: 34, cost: 0.002 },
      flags: [true, false],
      emptyList: [],
      emptyObject: {},
    };

    await recorder.record(makeFact({ rawResponse: payload }));

    const stored = (await selectRun("run_alpha_1"))?.rawResponse ?? "";
    expect(stored).toBe(JSON.stringify(payload));
    expect(JSON.parse(stored)).toStrictEqual(payload);
  });

  it("records every repeat as an independent row without deduplication", async () => {
    await seedAlphaParents();

    for (const repeatIndex of [0, 1, 2]) {
      await recorder.record(
        makeFact({
          id: `run_alpha_${repeatIndex + 1}`,
          repeatIndex,
          providerRequestId: `req_alpha_${repeatIndex + 1}`,
        }),
      );
    }

    const rows = await testDb
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.batchId, "batch_alpha"))
      .orderBy(asc(geoObservationRuns.repeatIndex));
    expect(rows.map((row) => row.id)).toEqual([
      "run_alpha_1",
      "run_alpha_2",
      "run_alpha_3",
    ]);
    expect(rows.map((row) => row.repeatIndex)).toEqual([0, 1, 2]);
    expect(new Set(rows.map((row) => row.providerRequestId)).size).toBe(3);
  });

  it("leaves an existing raw run row unchanged when a later run is recorded", async () => {
    await seedAlphaParents();
    await recorder.record(makeFact());
    const before = await selectRun("run_alpha_1");

    await recorder.record(
      makeFact({
        id: "run_alpha_2",
        repeatIndex: 1,
        providerRequestId: "req_alpha_2",
      }),
    );

    expect(await selectRun("run_alpha_1")).toEqual(before);
    const rows = await testDb
      .select({ id: geoObservationRuns.id })
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.batchId, "batch_alpha"));
    expect(rows).toHaveLength(2);
  });

  it("propagates a same-Project FK violation and writes no row", async () => {
    await seedTopic("topic_beta", "proj_beta");
    await seedPrompt("prompt_beta", "proj_beta", "topic_beta");

    // prompt_beta belongs to proj_beta while the fact claims proj_alpha, so the
    // composite FK (project_id, prompt_id) has no matching parent row.
    const reason = await failedRecordReason(
      makeFact({ promptId: "prompt_beta", marketProfileId: null }),
    );

    expect(reason).toMatch(/FOREIGN KEY constraint failed/i);
    const rows = await testDb.select().from(geoObservationRuns);
    expect(rows).toHaveLength(0);
  });

  it("propagates a duplicate run id and leaves the original row untouched", async () => {
    await seedAlphaParents();
    await recorder.record(makeFact());

    const reason = await failedRecordReason(
      makeFact({ rawResponse: "a second response for the same id" }),
    );

    expect(reason).toMatch(/UNIQUE constraint failed/i);
    const rows = await testDb.select().from(geoObservationRuns);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rawResponse).toBe("OpenAI recommends OpenSEO.");
  });

  it("preserves a nested empty string, which is valid JSON evidence", async () => {
    await seedAlphaParents();
    // Only the root capture must be nonblank; a nested "" round-trips through
    // JSON unchanged, so rejecting it would invent a content policy.
    const payload = {
      optionalAnswer: "",
      answer: "OpenAI recommends OpenSEO.",
    };

    await recorder.record(makeFact({ rawResponse: payload }));

    const stored = (await selectRun("run_alpha_1"))?.rawResponse ?? "";
    expect(stored).toBe(JSON.stringify(payload));
    expect(JSON.parse(stored)).toStrictEqual(payload);
  });

  it.each([
    ["an undefined", undefined],
    ["a null", null],
    ["an empty-string", ""],
    ["a whitespace-only string", "   "],
    ["a function", () => "no JSON representation"],
    ["a symbol", Symbol("raw")],
    ["a BigInt", 1n],
    ["a NaN number", Number.NaN],
    ["an Infinity number", Number.POSITIVE_INFINITY],
    ["a negative-zero number", -0],
    ["a Date", new Date("2026-09-08T04:00:00.000Z")],
    ["a Map", new Map([["answer", "OpenAI recommends OpenSEO."]])],
  ])(
    "rejects %s raw response before writing any row",
    async (_label, rawResponse) => {
      await seedAlphaParents();
      await expectRawRejected(rawResponse);
    },
  );

  it.each([
    ["an undefined property", { answer: undefined }],
    ["a function property", { answer: () => "no JSON representation" }],
    ["a symbol property", { answer: Symbol("raw") }],
    ["a BigInt property", { answer: 1n }],
    ["a NaN property", { answer: Number.NaN }],
    ["an Infinity array element", { citations: [Number.POSITIVE_INFINITY] }],
    ["a negative-zero property", { usage: { cost: -0 } }],
    ["a non-finite number two levels deep", { usage: { cost: -Infinity } }],
    ["a Date property", { capturedAt: new Date("2026-09-08T04:00:00.000Z") }],
    [
      "a nested array of functions",
      { steps: [() => "no JSON representation"] },
    ],
    [
      "a non-enumerable property",
      Object.defineProperty({ answer: "a" }, "hidden", {
        value: "dropped by serialization",
      }),
    ],
    ["a symbol-keyed array property", Object.assign([1], { [Symbol("s")]: 1 })],
    ["an accessor property", withAccessor({ answer: "a" }, "computed")],
    ["an accessor array element", withAccessor(["a"], "0")],
  ])(
    "rejects a raw response containing %s before writing any row",
    async (_label, rawResponse) => {
      await seedAlphaParents();
      await expectRawRejected(rawResponse);
    },
  );

  it("rejects a sparse-array raw response before writing any row", async () => {
    await seedAlphaParents();
    // A hole would serialize as `null`, fabricating an element that the capture
    // never held.
    const sparse: unknown[] = ["a", "b", "c"];
    Reflect.deleteProperty(sparse, 1);

    await expectRawRejected(sparse);
  });

  it("rejects circular raw responses before writing any row", async () => {
    await seedAlphaParents();
    const root: Record<string, unknown> = {};
    root.self = root;
    const nestedParent: Record<string, unknown> = {};
    nestedParent.child = { parent: nestedParent };

    await expectRawRejected(root);
    await expectRawRejected(nestedParent);
  });
});
