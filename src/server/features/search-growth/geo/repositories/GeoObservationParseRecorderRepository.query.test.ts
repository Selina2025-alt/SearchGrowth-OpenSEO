import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
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
  geoEntityMentions,
  geoObservationParses,
  geoObservationRuns,
  searchPrompts,
  searchTopics,
} from "@/db/schema";
import type {
  GeoObservationAccuracyStatus,
  GeoObservationParseStatus,
} from "@/types/schemas/geo-observation-parse";
import type { GeoObservationParseFact } from "../services/geoObservationParseRecorder";
import type * as GeoObservationParseRecorderRepositoryModule from "./GeoObservationParseRecorderRepository";

// The parse recorder adapter is exercised against the real accepted storage
// contract: an in-memory SQLite database built from the actual forward
// migration DDL for geo_observation_parses through the Round 2 same-Project
// rebuild (0051 + 0052 mention table + 0053 project-key rebuild), plus its
// parents (market profile 0045, topic 0046, tracked entity 0048, prompt 0049,
// immutable raw run 0050), with foreign keys enabled. `@/db` is replaced with
// that handle so the production adapter code path (one INSERT, no
// update/upsert) runs unmodified.
//
// Invariants under test (T140, ADR-005, 05_DOMAIN_DATA_MODEL.md §7,
// 07_GEO_MEASUREMENT_SPEC.md §5, 21_TEST_ACCEPTANCE_PLAN.md §6):
//   - one fact persists exactly one row with every accepted column faithful and
//     only the database `created_at` default synthesized;
//   - every canonical parse_status and accuracy_status maps, including NULL;
//   - v1/v2 parses of one raw run coexist and no earlier row is updated;
//   - duplicate `(run_id, parser_version)` and same-Project/dangling run FK
//     failures propagate to the caller;
//   - the raw run (and every mention table) is unchanged by parse recording;
//   - invalid parse/accuracy statuses and a non-boolean is_current reject before
//     any row is written.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let recorder: typeof GeoObservationParseRecorderRepositoryModule.GeoObservationParseRecorderRepository;

const DDL_FILES = [
  "drizzle/0045_search_market_profiles.sql",
  "drizzle/0046_search_topics.sql",
  "drizzle/0048_ordinary_legion.sql",
  "drizzle/0049_gigantic_johnny_blaze.sql",
  "drizzle/0050_dusty_stardust.sql",
  "drizzle/0051_cuddly_matthew_murdock.sql",
  "drizzle/0052_cute_red_shift.sql",
  "drizzle/0053_shocking_rhodey.sql",
];

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
      ...DDL_FILES.flatMap((file) =>
        statementParts(readFileSync(file, "utf8")),
      ),
    ].join("\n"),
  );

  ({ GeoObservationParseRecorderRepository: recorder } =
    await import("./GeoObservationParseRecorderRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await testDb.delete(geoEntityMentions);
  await testDb.delete(geoObservationParses);
  await testDb.delete(geoObservationRuns);
  await testDb.delete(searchPrompts);
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
  await testDb.insert(geoObservationRuns).values(run);
}

const BETA_RUN = {
  id: "run_beta_1",
  projectId: "proj_beta",
  promptId: "prompt_beta",
};

function makeFact(
  overrides: Partial<GeoObservationParseFact> = {},
): GeoObservationParseFact {
  return {
    id: "parse_alpha_v1",
    projectId: ALPHA_RUN.projectId,
    runId: ALPHA_RUN.id,
    parserVersion: "1.0.0",
    parseStatus: "SUCCESS",
    accuracyStatus: "ACCURATE",
    parsedAt: "2026-09-08T04:00:05.000Z",
    isCurrent: false,
    ...overrides,
  };
}

/** A fact carrying a deliberately invalid runtime value for one field. */
function makeInvalidFact(
  overrides: Record<string, unknown>,
): GeoObservationParseFact {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the adapter must reject at runtime
  return { ...makeFact(), ...overrides } as unknown as GeoObservationParseFact;
}

async function selectParse(id: string) {
  const rows = await testDb
    .select()
    .from(geoObservationParses)
    .where(eq(geoObservationParses.id, id));
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
async function failedRecordReason(fact: GeoObservationParseFact) {
  try {
    await recorder.record(fact);
  } catch (error) {
    return failureMessages(error);
  }
  throw new Error("expected the recorder to reject, but it resolved");
}

/**
 * Records an invalid fact and asserts it was rejected before the INSERT wrote
 * anything — the invalid value must not have reached the storage layer.
 */
async function expectFactRejected(
  fact: GeoObservationParseFact,
  reason: RegExp,
) {
  await expect(recorder.record(fact)).rejects.toThrow(reason);
  expect(await testDb.select().from(geoObservationParses)).toHaveLength(0);
}

describe("GeoObservationParseRecorderRepository", () => {
  it("persists one fact as one row with every accepted column faithful", async () => {
    await seedRun();
    const fact = makeFact();

    await recorder.record(fact);

    const rows = await testDb.select().from(geoObservationParses);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "parse_alpha_v1",
      projectId: "proj_alpha",
      runId: "run_alpha_1",
      parserVersion: "1.0.0",
      parseStatus: "SUCCESS",
      accuracyStatus: "ACCURATE",
      parsedAt: "2026-09-08T04:00:05.000Z",
      isCurrent: false,
    });
    // The only value not derived from the fact is the existing DB default.
    expect(rows[0]?.createdAt).toEqual(expect.any(String));
  });

  it("maps every canonical parse status and accuracy status, including NULL accuracy", async () => {
    await seedRun();
    const parseStatuses = geoObservationParses.parseStatus
      .enumValues as GeoObservationParseStatus[];
    const accuracyStatuses = geoObservationParses.accuracyStatus
      .enumValues as GeoObservationAccuracyStatus[];
    for (const parseStatus of parseStatuses) {
      await recorder.record(
        makeFact({
          id: `parse_p_${parseStatus}`,
          parserVersion: `p-${parseStatus}`,
          parseStatus,
        }),
      );
    }
    for (const accuracyStatus of accuracyStatuses) {
      await recorder.record(
        makeFact({
          id: `parse_a_${accuracyStatus}`,
          parserVersion: `a-${accuracyStatus}`,
          accuracyStatus,
        }),
      );
    }
    // No accuracy assessment is a fact of its own (e.g. a FAILED parse): NULL is
    // stored as NULL and never replaced with a status.
    await recorder.record(
      makeFact({
        id: "parse_no_accuracy",
        parserVersion: "no-accuracy",
        accuracyStatus: null,
      }),
    );

    const rows = await testDb
      .select()
      .from(geoObservationParses)
      .where(eq(geoObservationParses.runId, ALPHA_RUN.id));
    expect(rows).toHaveLength(
      parseStatuses.length + accuracyStatuses.length + 1,
    );
    expect(rows.map((row) => row.parseStatus)).toEqual(
      expect.arrayContaining(["SUCCESS", "PARTIAL", "FAILED"]),
    );
    expect(rows.map((row) => row.accuracyStatus)).toEqual(
      expect.arrayContaining([
        "ACCURATE",
        "PARTIAL",
        "INACCURATE",
        "UNKNOWN",
        null,
      ]),
    );
  });

  it("lets v1/v2 parses of the same raw run coexist without touching the v1 row", async () => {
    await seedRun();
    await recorder.record(makeFact());
    const v1Before = await selectParse("parse_alpha_v1");

    // A parser upgrade is a new row, never an update/upsert of the old one.
    await recorder.record(
      makeFact({
        id: "parse_alpha_v2",
        parserVersion: "2.0.0",
        parseStatus: "PARTIAL",
        accuracyStatus: "UNKNOWN",
        isCurrent: true,
        parsedAt: "2026-09-09T04:00:05.000Z",
      }),
    );

    expect(await selectParse("parse_alpha_v1")).toEqual(v1Before);
    const rows = await testDb
      .select()
      .from(geoObservationParses)
      .where(eq(geoObservationParses.runId, ALPHA_RUN.id));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.parserVersion)).toEqual(
      expect.arrayContaining(["1.0.0", "2.0.0"]),
    );
  });

  it("propagates a duplicate (run_id, parser_version) and leaves the original row untouched", async () => {
    await seedRun();
    await recorder.record(makeFact());

    // Same raw run and parser version under a new parse id: the version rule
    // (not the primary key) is what must reject this.
    const reason = await failedRecordReason(
      makeFact({
        id: "parse_alpha_v1_again",
        parsedAt: "2026-09-08T05:00:05.000Z",
      }),
    );

    expect(reason).toMatch(/UNIQUE constraint failed/i);
    const rows = await testDb.select().from(geoObservationParses);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("parse_alpha_v1");
    expect(rows[0]?.parsedAt).toBe("2026-09-08T04:00:05.000Z");
  });

  it("propagates a same-Project run FK violation and writes no row", async () => {
    await seedRun();
    await seedRun(BETA_RUN);

    // run_beta_1 belongs to proj_beta while the fact claims proj_alpha, so the
    // composite FK (project_id, run_id) has no matching parent row.
    const reason = await failedRecordReason(
      makeFact({ runId: BETA_RUN.id, parserVersion: "9.9.9" }),
    );

    expect(reason).toMatch(/FOREIGN KEY constraint failed/i);
    expect(await testDb.select().from(geoObservationParses)).toHaveLength(0);
  });

  it("propagates a dangling run FK violation and writes no row", async () => {
    await seedRun();

    const reason = await failedRecordReason(
      makeFact({ runId: "run_missing", parserVersion: "9.9.9" }),
    );

    expect(reason).toMatch(/FOREIGN KEY constraint failed/i);
    expect(await testDb.select().from(geoObservationParses)).toHaveLength(0);
  });

  it("records v1/v2 parses without modifying the raw run or any mention row", async () => {
    await seedRun();
    const runsBefore = await testDb
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, ALPHA_RUN.id));

    await recorder.record(makeFact());
    await recorder.record(
      makeFact({ id: "parse_alpha_v2", parserVersion: "2.0.0" }),
    );

    // Raw is immutable (21_TEST_ACCEPTANCE_PLAN.md §6) and the adapter has no
    // mention/citation write path.
    expect(
      await testDb
        .select()
        .from(geoObservationRuns)
        .where(eq(geoObservationRuns.id, ALPHA_RUN.id)),
    ).toEqual(runsBefore);
    expect(await testDb.select().from(geoEntityMentions)).toHaveLength(0);
  });

  it.each([
    ["a lowercase value", "success"],
    ["a mixed-case value", "Success"],
    ["an unsupported value", "SKIPPED"],
    ["an empty string", ""],
    ["a whitespace-only value", "   "],
    ["a number", 7],
    ["a null value", null],
    ["an absent value", undefined],
  ])(
    "rejects %s as parse_status before writing any row",
    async (_label, value) => {
      await seedRun();
      await expectFactRejected(
        makeInvalidFact({ parseStatus: value }),
        /parseStatus/,
      );
    },
  );

  it.each([
    ["a lowercase value", "accurate"],
    ["an unsupported value", "GOOD"],
    ["an empty string", ""],
    ["a number", 1],
    ["an absent value", undefined],
  ])(
    "rejects %s as accuracy_status before writing any row",
    async (_label, value) => {
      await seedRun();
      await expectFactRejected(
        makeInvalidFact({ accuracyStatus: value }),
        /accuracyStatus/,
      );
    },
  );

  it.each([
    ["a string", "true"],
    ["a number", 1],
    ["zero", 0],
    ["null", null],
    ["an absent value", undefined],
  ])(
    "rejects %s as is_current before writing any row",
    async (_label, value) => {
      await seedRun();
      await expectFactRejected(
        makeInvalidFact({ isCurrent: value }),
        /isCurrent/,
      );
    },
  );

  it.each([
    ["id", ""],
    ["projectId", ""],
    ["runId", ""],
    ["parserVersion", ""],
    ["parsedAt", ""],
  ])("rejects an empty %s before writing any row", async (field, value) => {
    await seedRun();
    await expectFactRejected(
      makeInvalidFact({ [field]: value }),
      new RegExp(`\\(${field}\\)`),
    );
  });
});

describe("GeoObservationParseRecorderRepository write boundary", () => {
  it("has exactly one insert path and no update, upsert, delete, or mention/citation write", () => {
    const source = readFileSync(
      "src/server/features/search-growth/geo/repositories/GeoObservationParseRecorderRepository.ts",
      "utf8",
    );

    expect(source).toContain("db.insert(geoObservationParses)");
    expect(source).not.toMatch(/\.update\(|\.onConflict|\.delete\(|\.set\(/);
    // Mentions and citations are later tasks; the adapter imports no such table.
    expect(source).not.toMatch(/geoEntityMentions|geoCitations/);
  });
});
