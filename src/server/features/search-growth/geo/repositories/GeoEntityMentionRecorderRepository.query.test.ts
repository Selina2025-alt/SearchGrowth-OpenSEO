/* eslint-disable max-lines -- one real-SQL spec covers the whole geo_entity_mentions recording contract (faithful mapping, optional NULLs, append-only independence, same-Project/dangling parent FKs, and the runtime rejection table) through the shipped DDL; splitting would scatter the invariants asserted against one adapter and one fixture graph */
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
  entityAliases,
  geoCitations,
  geoEntityMentions,
  geoObservationParses,
  geoObservationRuns,
  searchPrompts,
  searchTopics,
  trackedEntities,
} from "@/db/schema";
import type { GeoEntityMentionFact } from "../services/geoEntityMentionRecorder";
import type * as GeoEntityMentionRecorderRepositoryModule from "./GeoEntityMentionRecorderRepository";

// The entity-mention recorder adapter is exercised against the real accepted
// storage contract: an in-memory SQLite database built from the actual forward
// migration DDL for geo_entity_mentions through the Round 2 same-Project
// rebuild (0052 + 0053 project-key rebuild), plus its parents (market profile
// 0045, topic 0046, tracked entity 0048, prompt 0049, immutable raw run 0050,
// versioned parse 0051) and its accepted citation sibling (0054), with foreign
// keys enabled. `@/db` is replaced with
// that handle so the production adapter code path (one INSERT, no
// update/upsert/delete) runs unmodified.
//
// Invariants under test (T141, ADR-005, 05_DOMAIN_DATA_MODEL.md §7,
// 07_GEO_MEASUREMENT_SPEC.md §5, 21_TEST_ACCEPTANCE_PLAN.md §3):
//   - one fact persists exactly one row with every accepted column faithful and
//     only the database `created_at` default synthesized;
//   - `mentioned` maps both verdicts and the optional columns store their real
//     value or SQL NULL with no inference or coercion;
//   - two supplied facts stay two independent rows (no new uniqueness rule);
//   - cross-Project parse/entity ownership and dangling parents are rejected by
//     the accepted composite FKs, while no other table — raw run, parse,
//     citation, entity, or alias — is written or modified;
//   - invalid identifiers, a non-boolean `mentioned`, a non-boolean/non-null
//     `recommended`, a non-integer/non-null `mentionPosition`, and a
//     non-string/non-null `sentiment`/`evidenceText` reject before any row is
//     written, and an absent optional member is rejected rather than treated
//     as NULL.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

const REPOSITORY_SOURCE =
  "src/server/features/search-growth/geo/repositories/GeoEntityMentionRecorderRepository.ts";

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let recorder: typeof GeoEntityMentionRecorderRepositoryModule.GeoEntityMentionRecorderRepository;

const DDL_FILES = [
  "drizzle/0045_search_market_profiles.sql",
  "drizzle/0046_search_topics.sql",
  "drizzle/0048_ordinary_legion.sql",
  "drizzle/0049_gigantic_johnny_blaze.sql",
  "drizzle/0050_dusty_stardust.sql",
  "drizzle/0051_cuddly_matthew_murdock.sql",
  "drizzle/0052_cute_red_shift.sql",
  "drizzle/0053_shocking_rhodey.sql",
  // Accepted sibling parser output, present only so the test can prove the
  // mention adapter leaves it untouched.
  "drizzle/0054_optimal_magik.sql",
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

  ({ GeoEntityMentionRecorderRepository: recorder } =
    await import("./GeoEntityMentionRecorderRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  // Child-first teardown: mentions reference parses and entities, parses
  // reference runs, runs reference prompts, prompts reference topics.
  await testDb.delete(geoEntityMentions);
  await testDb.delete(geoObservationParses);
  await testDb.delete(geoObservationRuns);
  await testDb.delete(searchPrompts);
  await testDb.delete(searchTopics);
  await testDb.delete(trackedEntities);
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

const BETA_RUN = {
  id: "run_beta_1",
  projectId: "proj_beta",
  promptId: "prompt_beta",
};

async function seedRun(
  overrides: { id?: string; projectId?: string; promptId?: string } = {},
) {
  const run = { ...ALPHA_RUN, ...overrides };
  await seedTopic(`topic_${run.projectId}`, run.projectId);
  await seedPrompt(run.promptId, run.projectId, `topic_${run.projectId}`);
  await testDb.insert(geoObservationRuns).values(run);
}

async function seedEntity(id: string, projectId: string) {
  await testDb.insert(trackedEntities).values({
    id,
    projectId,
    entityType: "BRAND",
    canonicalName: `Entity ${id}`,
  });
}

async function seedParse(
  id: string,
  projectId: string = ALPHA_RUN.projectId,
  runId: string = ALPHA_RUN.id,
) {
  await testDb.insert(geoObservationParses).values({
    id,
    projectId,
    runId,
    parserVersion: "1.0.0",
    parseStatus: "SUCCESS",
    accuracyStatus: null,
    parsedAt: "2026-09-08T04:00:05.000Z",
    isCurrent: false,
  });
}

/** The shared valid parent graph: one alpha run, parse, and tracked entity. */
async function seedAlphaParents() {
  await seedRun();
  await seedParse("parse_alpha_v1");
  await seedEntity("ent_alpha", "proj_alpha");
}

function makeFact(
  overrides: Partial<GeoEntityMentionFact> = {},
): GeoEntityMentionFact {
  return {
    id: "mention_alpha_1",
    projectId: "proj_alpha",
    parseId: "parse_alpha_v1",
    entityId: "ent_alpha",
    mentioned: true,
    recommended: true,
    mentionPosition: 0,
    sentiment: "POSITIVE",
    evidenceText: "Alpha is a capable provider for this use case.",
    ...overrides,
  };
}

/** A fact carrying a deliberately invalid runtime value for one field. */
function makeInvalidFact(
  overrides: Record<string, unknown>,
): GeoEntityMentionFact {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the adapter must reject at runtime
  return { ...makeFact(), ...overrides } as unknown as GeoEntityMentionFact;
}

async function selectMention(id: string) {
  const rows = await testDb
    .select()
    .from(geoEntityMentions)
    .where(eq(geoEntityMentions.id, id));
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
async function failedRecordReason(fact: GeoEntityMentionFact) {
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
async function expectFactRejected(fact: GeoEntityMentionFact, reason: RegExp) {
  await expect(recorder.record(fact)).rejects.toThrow(reason);
  expect(await testDb.select().from(geoEntityMentions)).toHaveLength(0);
}

describe("GeoEntityMentionRecorderRepository", () => {
  it("persists one fact as one row with every accepted column faithful", async () => {
    await seedAlphaParents();
    const fact = makeFact();

    await recorder.record(fact);

    const rows = await testDb.select().from(geoEntityMentions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "mention_alpha_1",
      projectId: "proj_alpha",
      parseId: "parse_alpha_v1",
      entityId: "ent_alpha",
      mentioned: true,
      recommended: true,
      mentionPosition: 0,
      sentiment: "POSITIVE",
      evidenceText: "Alpha is a capable provider for this use case.",
    });
    // The only value not derived from the fact is the existing DB default.
    expect(rows[0]?.createdAt).toEqual(expect.any(String));
  });

  it("records both mention verdicts", async () => {
    await seedAlphaParents();

    await recorder.record(makeFact({ id: "mention_yes", mentioned: true }));
    await recorder.record(makeFact({ id: "mention_no", mentioned: false }));

    expect((await selectMention("mention_yes"))?.mentioned).toBe(true);
    // false is a recorded verdict, not an absent value: it must not collapse to
    // NULL and must not be replaced by true.
    expect((await selectMention("mention_no"))?.mentioned).toBe(false);
  });

  it("stores each optional column as its real value and as NULL when explicitly null", async () => {
    await seedAlphaParents();

    await recorder.record(
      makeFact({
        id: "mention_full",
        recommended: false,
        mentionPosition: 4,
        sentiment: "MIXED",
        evidenceText: "Alpha was mentioned second.",
      }),
    );
    // Every optional member is an explicit null: no value is inferred for an
    // entity the parse recorded no recommendation/position/sentiment/evidence
    // for, so the columns must hold SQL NULL.
    await recorder.record(
      makeFact({
        id: "mention_bare",
        mentioned: false,
        recommended: null,
        mentionPosition: null,
        sentiment: null,
        evidenceText: null,
      }),
    );

    const full = await selectMention("mention_full");
    expect(full).toMatchObject({
      mentioned: true,
      recommended: false,
      mentionPosition: 4,
      sentiment: "MIXED",
      evidenceText: "Alpha was mentioned second.",
    });
    const bare = await selectMention("mention_bare");
    expect(bare).toMatchObject({
      mentioned: false,
      recommended: null,
      mentionPosition: null,
      sentiment: null,
      evidenceText: null,
    });
  });

  it("keeps multiple supplied facts as independent rows with no uniqueness rule", async () => {
    await seedAlphaParents();

    // Same parse and same entity: the accepted table has no business-unique
    // constraint, so repeats of one verdict are separate append-only rows.
    await recorder.record(makeFact({ id: "mention_repeat_a" }));
    await recorder.record(
      makeFact({ id: "mention_repeat_b", mentionPosition: 7 }),
    );

    const rows = await testDb
      .select()
      .from(geoEntityMentions)
      .where(eq(geoEntityMentions.parseId, "parse_alpha_v1"));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(
      expect.arrayContaining(["mention_repeat_a", "mention_repeat_b"]),
    );
    expect(await selectMention("mention_repeat_a")).toMatchObject({
      mentionPosition: 0,
    });
  });

  it("propagates a same-Project parse FK violation and writes no row", async () => {
    await seedAlphaParents();
    await seedRun(BETA_RUN);
    await seedParse("parse_beta_v1", "proj_beta", BETA_RUN.id);

    // parse_beta_v1 sits beneath proj_beta while the fact claims proj_alpha, so
    // the composite FK (project_id, parse_id) has no matching parent row.
    const reason = await failedRecordReason(
      makeFact({ parseId: "parse_beta_v1" }),
    );

    expect(reason).toMatch(/FOREIGN KEY constraint failed/i);
    expect(await testDb.select().from(geoEntityMentions)).toHaveLength(0);
  });

  it("propagates a same-Project entity FK violation and writes no row", async () => {
    await seedAlphaParents();
    await seedEntity("ent_beta", "proj_beta");

    // ent_beta belongs to proj_beta while the fact claims proj_alpha, so the
    // composite FK (project_id, entity_id) has no matching parent row.
    const reason = await failedRecordReason(makeFact({ entityId: "ent_beta" }));

    expect(reason).toMatch(/FOREIGN KEY constraint failed/i);
    expect(await testDb.select().from(geoEntityMentions)).toHaveLength(0);
  });

  it("propagates dangling parse and entity parents and writes no row", async () => {
    await seedAlphaParents();

    expect(
      await failedRecordReason(
        makeFact({ id: "mention_orphan_parse", parseId: "parse_missing" }),
      ),
    ).toMatch(/FOREIGN KEY constraint failed/i);
    expect(
      await failedRecordReason(
        makeFact({ id: "mention_orphan_entity", entityId: "ent_missing" }),
      ),
    ).toMatch(/FOREIGN KEY constraint failed/i);

    expect(await testDb.select().from(geoEntityMentions)).toHaveLength(0);
  });

  it("records mentions without modifying the raw run, parse, entity, alias, or citation rows", async () => {
    await seedAlphaParents();
    const runBefore = await testDb
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, ALPHA_RUN.id));
    const parseBefore = await testDb
      .select()
      .from(geoObservationParses)
      .where(eq(geoObservationParses.id, "parse_alpha_v1"));
    const entityBefore = await testDb
      .select()
      .from(trackedEntities)
      .where(eq(trackedEntities.id, "ent_alpha"));

    await recorder.record(makeFact());
    await recorder.record(
      makeFact({ id: "mention_alpha_2", mentioned: false }),
    );

    // Raw is immutable (21_TEST_ACCEPTANCE_PLAN.md §3) and the adapter has no
    // run/parse/entity/alias/citation write path.
    expect(
      await testDb
        .select()
        .from(geoObservationRuns)
        .where(eq(geoObservationRuns.id, ALPHA_RUN.id)),
    ).toEqual(runBefore);
    expect(
      await testDb
        .select()
        .from(geoObservationParses)
        .where(eq(geoObservationParses.id, "parse_alpha_v1")),
    ).toEqual(parseBefore);
    expect(
      await testDb
        .select()
        .from(trackedEntities)
        .where(eq(trackedEntities.id, "ent_alpha")),
    ).toEqual(entityBefore);
    expect(await testDb.select().from(entityAliases)).toHaveLength(0);
    expect(await testDb.select().from(geoCitations)).toHaveLength(0);
    expect(await testDb.select().from(geoEntityMentions)).toHaveLength(2);
  });

  it.each([
    ["a string", "true"],
    ["a number", 1],
    ["zero", 0],
    ["null", null],
    ["an absent value", undefined],
  ])(
    "rejects %s as mentioned before writing any row",
    async (_label, value) => {
      await seedAlphaParents();
      await expectFactRejected(
        makeInvalidFact({ mentioned: value }),
        /\(mentioned\)/,
      );
    },
  );

  it.each([
    ["a string", "true"],
    ["a number", 1],
    ["zero", 0],
    ["an absent value", undefined],
  ])(
    "rejects %s as recommended before writing any row",
    async (_label, value) => {
      await seedAlphaParents();
      await expectFactRejected(
        makeInvalidFact({ recommended: value }),
        /\(recommended\)/,
      );
    },
  );

  it.each([
    ["a fractional number", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a numeric string", "3"],
    ["a string", "third"],
    ["an absent value", undefined],
  ])(
    "rejects %s as mentionPosition before writing any row",
    async (_label, value) => {
      await seedAlphaParents();
      await expectFactRejected(
        makeInvalidFact({ mentionPosition: value }),
        /\(mentionPosition\)/,
      );
    },
  );

  it.each([
    ["sentiment", 1],
    ["sentiment", true],
    ["sentiment", undefined],
    ["evidenceText", 1],
    ["evidenceText", false],
    ["evidenceText", undefined],
  ])("rejects %s value %s before writing any row", async (field, value) => {
    await seedAlphaParents();
    await expectFactRejected(
      makeInvalidFact({ [field]: value }),
      new RegExp(`\\(${field}\\)`),
    );
  });

  it.each([
    ["id", ""],
    ["id", 42],
    ["projectId", ""],
    ["projectId", null],
    ["parseId", ""],
    ["parseId", 7],
    ["entityId", ""],
    ["entityId", null],
  ])(
    "rejects an empty or non-string %s before writing any row",
    async (field, value) => {
      await seedAlphaParents();
      await expectFactRejected(
        makeInvalidFact({ [field]: value }),
        new RegExp(`\\(${field}\\)`),
      );
    },
  );
});

describe("GeoEntityMentionRecorderRepository write boundary", () => {
  it("has exactly one insert path into geo_entity_mentions and no other table write", () => {
    const source = readFileSync(REPOSITORY_SOURCE, "utf8");

    expect(source).toContain("db.insert(geoEntityMentions)");
    expect(source).not.toMatch(/\.update\(|\.onConflict|\.delete\(|\.set\(/);
    // Only the mention table is named as a Drizzle argument: no raw run, parse,
    // citation, entity, or alias table is imported or written.
    expect(source).not.toMatch(
      /geoObservationRuns|geoObservationParses|geoCitations|trackedEntities|entityAliases/,
    );
  });
});
