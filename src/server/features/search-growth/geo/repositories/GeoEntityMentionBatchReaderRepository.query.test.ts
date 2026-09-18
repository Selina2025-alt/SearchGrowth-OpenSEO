/* eslint-disable max-lines -- one real-SQL spec covers the whole entity-mention batch read contract (four-selector isolation, version explicitness, verdict/field preservation, ordering, empty/error behaviour, and non-mutation) through the shipped DDL; splitting would scatter the invariants asserted against one adapter and one fixture graph */
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
  geoEntityMentions,
  geoObservationParses,
  geoObservationRuns,
  searchPrompts,
  searchTopics,
  trackedEntities,
} from "@/db/schema";
import type * as GeoEntityMentionBatchReaderRepositoryModule from "./GeoEntityMentionBatchReaderRepository";

// The entity-mention batch reader is exercised against the real accepted
// storage contract: an in-memory SQLite database built from the actual forward
// migration DDL for geo_entity_mentions (0052 + the 0053 same-Project rebuild),
// its versioned parse (0051 + 0053) and immutable run (0050) parents, and the
// market profile (0045), topic (0046), tracked entity (0048), and prompt (0049)
// relations those composite FKs reference, with foreign keys enabled. `@/db` is
// replaced with that handle so the production reader code path (one four-
// selector-scoped SELECT over the accepted run/parse/mention join, no write of
// any kind) runs unmodified.
//
// Invariants under test (T159, ADR-003, ADR-004, ADR-005,
// 07_GEO_MEASUREMENT_SPEC.md §5, 05_DOMAIN_DATA_MODEL.md §7):
//   - only rows matching all four selectors come back, in repeatIndex, run id,
//     parse id, mention id order, the same order on every call;
//   - another Project reusing the batch id, another batch of the same Project,
//     another tracked entity, and another parser version of the same run are all
//     excluded, so no selector is optional;
//   - both stored verdicts and every stored mention field come back exactly as
//     stored, with only the parent run id added;
//   - an empty match is an empty list, not a failure and not another slice's
//     rows;
//   - an unusable selector rejects before any query and a database failure
//     propagates instead of becoming an empty result;
//   - a read mutates nothing.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

const PROJECT_ALPHA = "proj_alpha";
const PROJECT_BETA = "proj_beta";
const BATCH_ALPHA = "batch_alpha";
const ENTITY_ALPHA = "ent_alpha";
const PARSER_V1 = "parser-v1";
const PARSER_V2 = "parser-v2";

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let reader: typeof GeoEntityMentionBatchReaderRepositoryModule.GeoEntityMentionBatchReaderRepository;
let ReaderError: typeof GeoEntityMentionBatchReaderRepositoryModule.GeoEntityMentionBatchReaderError;

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
      ...DDL_FILES.flatMap((file) =>
        statementParts(readFileSync(file, "utf8")),
      ),
    ].join("\n"),
  );

  // The module is imported after `@/db` is replaced, so its module-level handle
  // is the in-memory database above; that captured handle is why this dynamic
  // import cannot be a static one.
  ({
    GeoEntityMentionBatchReaderRepository: reader,
    GeoEntityMentionBatchReaderError: ReaderError,
  } = await import("./GeoEntityMentionBatchReaderRepository"));
});

afterAll(() => {
  client.close();
});

// Parents are created once per test graph and reused, so a test can put several
// mentions on one run/parse/entity without fighting the accepted unique indexes.
let createdTopics: Set<string>;
let createdPrompts: Set<string>;
let createdRuns: Set<string>;
let createdParses: Set<string>;
let createdEntities: Set<string>;

beforeEach(async () => {
  // Child-first teardown: mentions reference parses and entities, parses
  // reference runs, runs reference prompts, prompts reference topics. Project
  // rows are kept and upserted with INSERT OR IGNORE by `ensureProject`.
  await testDb.delete(geoEntityMentions);
  await testDb.delete(geoObservationParses);
  await testDb.delete(geoObservationRuns);
  await testDb.delete(searchPrompts);
  await testDb.delete(searchTopics);
  await testDb.delete(trackedEntities);
  createdTopics = new Set();
  createdPrompts = new Set();
  createdRuns = new Set();
  createdParses = new Set();
  createdEntities = new Set();
});

async function ensureProject(projectId: string) {
  await client.execute({
    sql: "INSERT OR IGNORE INTO projects (id) VALUES (?)",
    args: [projectId],
  });
}

async function ensureRun(params: {
  runId: string;
  projectId: string;
  batchId: string;
  repeatIndex?: number;
}) {
  await ensureProject(params.projectId);
  if (!createdTopics.has(params.projectId)) {
    createdTopics.add(params.projectId);
    await testDb.insert(searchTopics).values({
      id: `topic_${params.projectId}`,
      projectId: params.projectId,
      canonicalName: `Topic ${params.projectId}`,
      locale: "en",
      status: "ACTIVE",
    });
  }
  if (!createdPrompts.has(params.projectId)) {
    createdPrompts.add(params.projectId);
    await testDb.insert(searchPrompts).values({
      id: `prompt_${params.projectId}`,
      projectId: params.projectId,
      topicId: `topic_${params.projectId}`,
      promptText: `Prompt ${params.projectId}`,
      normalizedPrompt: `prompt ${params.projectId}`,
      promptType: "definition",
      language: "en",
      businessFit: 50,
      priority: 50,
      version: 1,
      active: true,
    });
  }
  if (createdRuns.has(params.runId)) return;
  createdRuns.add(params.runId);
  await testDb.insert(geoObservationRuns).values({
    id: params.runId,
    batchId: params.batchId,
    projectId: params.projectId,
    promptId: `prompt_${params.projectId}`,
    promptVersion: 1,
    surfaceType: "MODEL_API_SEARCH",
    surfaceName: "GPT-5 Search",
    fidelity: "API_SIMULATION",
    repeatIndex: params.repeatIndex ?? 0,
    applicationCacheBypassed: true,
    rawAnswer: `Raw answer for ${params.runId}.`,
    rawResponse: `{"answer":"Raw answer for ${params.runId}."}`,
    startedAt: "2026-09-08T04:00:00.000Z",
    status: "SUCCEEDED",
  });
}

async function ensureParse(params: {
  parseId: string;
  projectId: string;
  runId: string;
  parserVersion: string;
}) {
  if (createdParses.has(params.parseId)) return;
  createdParses.add(params.parseId);
  await testDb.insert(geoObservationParses).values({
    id: params.parseId,
    projectId: params.projectId,
    runId: params.runId,
    parserVersion: params.parserVersion,
    parseStatus: "SUCCESS",
    accuracyStatus: null,
    parsedAt: "2026-09-08T04:00:05.000Z",
    isCurrent: false,
  });
}

async function ensureEntity(entityId: string, projectId: string) {
  if (createdEntities.has(entityId)) return;
  createdEntities.add(entityId);
  await testDb.insert(trackedEntities).values({
    id: entityId,
    projectId,
    entityType: "BRAND",
    canonicalName: `Entity ${entityId}`,
  });
}

type MentionSeed = {
  mentionId: string;
  projectId: string;
  batchId: string;
  entityId: string;
  parserVersion: string;
  runId: string;
  parseId: string;
  repeatIndex?: number;
  mentioned?: boolean;
  recommended?: boolean | null;
  mentionPosition?: number | null;
  sentiment?: string | null;
  evidenceText?: string | null;
};

/** Seed one fully-linked stored mention: run, parse, entity, and mention row. */
async function seedMention(params: MentionSeed) {
  await ensureRun(params);
  await ensureParse(params);
  await ensureEntity(params.entityId, params.projectId);
  await testDb.insert(geoEntityMentions).values({
    id: params.mentionId,
    projectId: params.projectId,
    parseId: params.parseId,
    entityId: params.entityId,
    mentioned: params.mentioned ?? true,
    recommended: params.recommended ?? null,
    mentionPosition: params.mentionPosition ?? null,
    sentiment: params.sentiment ?? null,
    evidenceText: params.evidenceText ?? null,
  });
}

/** The default alpha-Project slice: batch_alpha, ent_alpha, parser-v1. */
async function seedAlphaMention(
  mentionId: string,
  overrides: Partial<MentionSeed> = {},
) {
  await seedMention({
    mentionId,
    projectId: PROJECT_ALPHA,
    batchId: BATCH_ALPHA,
    entityId: ENTITY_ALPHA,
    parserVersion: PARSER_V1,
    runId: `run_${mentionId}`,
    parseId: `parse_${mentionId}`,
    ...overrides,
  });
}

function selectAllMentions() {
  return testDb
    .select()
    .from(geoEntityMentions)
    .orderBy(asc(geoEntityMentions.id));
}

async function selectMention(id: string) {
  const rows = await testDb
    .select()
    .from(geoEntityMentions)
    .where(eq(geoEntityMentions.id, id));
  return rows[0];
}

/** A value the result must contain, or a named failure explaining it did not. */
function requireRow<T>(row: T | undefined, label: string): T {
  if (row === undefined) {
    throw new Error(`expected ${label} in the read result, but it was absent`);
  }
  return row;
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

/** Move a table aside so the next read fails inside storage. */
async function renameTable(from: string, to: string) {
  await client.execute(`ALTER TABLE ${from} RENAME TO ${to}`);
}

describe("GeoEntityMentionBatchReaderRepository reads", () => {
  it("returns the four-selector slice ordered by repeatIndex, run, parse, then mention", async () => {
    // Stored so that insertion order and id order alone cannot explain the
    // result: repeatIndex leads, run id breaks its ties, and mention id breaks
    // the remaining ones.
    await seedAlphaMention("men_z", {
      runId: "run_z",
      parseId: "parse_z",
      repeatIndex: 0,
    });
    await seedAlphaMention("men_a", {
      runId: "run_a",
      parseId: "parse_a",
      repeatIndex: 0,
    });
    await seedAlphaMention("men_b2", {
      runId: "run_b",
      parseId: "parse_b",
      repeatIndex: 1,
    });
    await seedAlphaMention("men_b1", {
      runId: "run_b",
      parseId: "parse_b",
      repeatIndex: 1,
    });

    const rows = await reader.readBatchMentions(
      PROJECT_ALPHA,
      BATCH_ALPHA,
      ENTITY_ALPHA,
      PARSER_V1,
    );
    const order = ["men_a", "men_z", "men_b1", "men_b2"];

    expect(rows.map((row) => row.id)).toEqual(order);
    // The same call returns the same order: the result is not incidental.
    expect(
      (
        await reader.readBatchMentions(
          PROJECT_ALPHA,
          BATCH_ALPHA,
          ENTITY_ALPHA,
          PARSER_V1,
        )
      ).map((row) => row.id),
    ).toEqual(order);
  });

  it("excludes another Project that reuses the batch id and parser version", async () => {
    await seedAlphaMention("men_alpha");
    await seedMention({
      mentionId: "men_beta",
      projectId: PROJECT_BETA,
      batchId: BATCH_ALPHA,
      entityId: "ent_beta",
      parserVersion: PARSER_V1,
      runId: "run_beta",
      parseId: "parse_beta",
    });

    // The batch id and parser version are shared verbatim; the Project is what
    // separates the two slices, so neither read can see the other's rows.
    expect(
      (
        await reader.readBatchMentions(
          PROJECT_ALPHA,
          BATCH_ALPHA,
          ENTITY_ALPHA,
          PARSER_V1,
        )
      ).map((row) => row.id),
    ).toEqual(["men_alpha"]);
    expect(
      (
        await reader.readBatchMentions(
          PROJECT_BETA,
          BATCH_ALPHA,
          "ent_beta",
          PARSER_V1,
        )
      ).map((row) => row.id),
    ).toEqual(["men_beta"]);
  });

  it("excludes the same Project's other batches", async () => {
    await seedAlphaMention("men_kept");
    await seedAlphaMention("men_other_batch", {
      batchId: "batch_other",
      runId: "run_other_batch",
      parseId: "parse_other_batch",
    });

    expect(
      (
        await reader.readBatchMentions(
          PROJECT_ALPHA,
          BATCH_ALPHA,
          ENTITY_ALPHA,
          PARSER_V1,
        )
      ).map((row) => row.id),
    ).toEqual(["men_kept"]);
  });

  it("excludes the same Project's other tracked entities", async () => {
    // Both mentions hang off the same run and parse: only the stored entity id
    // can separate them, so entity isolation cannot be an accident of storage.
    await seedAlphaMention("men_alpha_entity", {
      runId: "run_shared_entity",
      parseId: "parse_shared_entity",
    });
    await seedAlphaMention("men_other_entity", {
      entityId: "ent_other",
      runId: "run_shared_entity",
      parseId: "parse_shared_entity",
    });

    expect(
      (
        await reader.readBatchMentions(
          PROJECT_ALPHA,
          BATCH_ALPHA,
          ENTITY_ALPHA,
          PARSER_V1,
        )
      ).map((row) => row.id),
    ).toEqual(["men_alpha_entity"]);
  });

  it("returns exactly the requested parser version of a multiply-parsed run", async () => {
    // One immutable run with two versioned parses (ADR-005): both versions
    // coexist and each carries its own mention of the same entity.
    await seedAlphaMention("men_v1", {
      runId: "run_multi",
      parseId: "parse_v1",
      parserVersion: PARSER_V1,
    });
    await seedAlphaMention("men_v2", {
      runId: "run_multi",
      parseId: "parse_v2",
      parserVersion: PARSER_V2,
    });

    expect(
      (
        await reader.readBatchMentions(
          PROJECT_ALPHA,
          BATCH_ALPHA,
          ENTITY_ALPHA,
          PARSER_V1,
        )
      ).map((row) => row.id),
    ).toEqual(["men_v1"]);
    // v2 is neither collapsed into v1 nor treated as the current version.
    expect(
      (
        await reader.readBatchMentions(
          PROJECT_ALPHA,
          BATCH_ALPHA,
          ENTITY_ALPHA,
          PARSER_V2,
        )
      ).map((row) => row.id),
    ).toEqual(["men_v2"]);
  });

  it("preserves both stored verdicts and every stored mention field exactly", async () => {
    await seedAlphaMention("men_true", {
      runId: "run_true",
      parseId: "parse_true",
      mentioned: true,
      recommended: false,
      mentionPosition: 4,
      sentiment: "MIXED",
      evidenceText: "  Alpha was mentioned second.\n",
    });
    // A not-mentioned verdict with every optional column NULL: false and NULL
    // are stored facts that must not become true, empty, or a default.
    await seedAlphaMention("men_false", {
      runId: "run_false",
      parseId: "parse_false",
      mentioned: false,
      recommended: null,
      mentionPosition: null,
      sentiment: null,
      evidenceText: null,
    });

    const rows = await reader.readBatchMentions(
      PROJECT_ALPHA,
      BATCH_ALPHA,
      ENTITY_ALPHA,
      PARSER_V1,
    );
    const trueStored = await selectMention("men_true");
    const falseStored = await selectMention("men_false");
    if (!trueStored || !falseStored) {
      throw new Error("expected both stored mentions to exist");
    }

    const trueRow = requireRow(
      rows.find((row) => row.id === "men_true"),
      "men_true",
    );
    const falseRow = requireRow(
      rows.find((row) => row.id === "men_false"),
      "men_false",
    );

    // Every stored column is returned verbatim and only the parent run id is
    // added: no derived metric, fraction, cohort label, or verdict rewrite.
    expect(trueRow).toEqual({ ...trueStored, runId: "run_true" });
    expect(falseRow).toEqual({ ...falseStored, runId: "run_false" });
    expect(Object.keys(trueRow)).toEqual([...Object.keys(trueStored), "runId"]);
    expect(trueRow.mentioned).toBe(true);
    expect(falseRow.mentioned).toBe(false);
    expect(falseRow.recommended).toBeNull();
    expect(falseRow.mentionPosition).toBeNull();
    expect(falseRow.sentiment).toBeNull();
    expect(falseRow.evidenceText).toBeNull();
    expect(falseRow.parseId).toBe("parse_false");
  });

  it("returns an empty list when a valid four-part selector matches nothing", async () => {
    await seedAlphaMention("men_alpha");

    // A stored sibling slice proves each empty answer is about the selector, not
    // about an unreadable or empty table.
    expect(
      await reader.readBatchMentions(
        PROJECT_ALPHA,
        "batch_missing",
        ENTITY_ALPHA,
        PARSER_V1,
      ),
    ).toEqual([]);
    expect(
      await reader.readBatchMentions(
        PROJECT_ALPHA,
        BATCH_ALPHA,
        "ent_missing",
        PARSER_V1,
      ),
    ).toEqual([]);
    expect(
      await reader.readBatchMentions(
        PROJECT_ALPHA,
        BATCH_ALPHA,
        ENTITY_ALPHA,
        "parser-missing",
      ),
    ).toEqual([]);
  });

  it("reads without modifying any stored run, parse, mention, or entity row", async () => {
    await seedAlphaMention("men_alpha", {
      runId: "run_shared",
      parseId: "parse_shared",
      repeatIndex: 0,
    });
    await seedAlphaMention("men_alpha_v2", {
      runId: "run_shared",
      parseId: "parse_shared_v2",
      parserVersion: PARSER_V2,
    });
    await seedAlphaMention("men_beta", {
      projectId: PROJECT_BETA,
      entityId: "ent_beta",
      batchId: "batch_beta",
      runId: "run_beta",
      parseId: "parse_beta",
    });
    const runsBefore = await testDb.select().from(geoObservationRuns);
    const parsesBefore = await testDb.select().from(geoObservationParses);
    const mentionsBefore = await selectAllMentions();
    const entitiesBefore = await testDb.select().from(trackedEntities);

    await reader.readBatchMentions(
      PROJECT_ALPHA,
      BATCH_ALPHA,
      ENTITY_ALPHA,
      PARSER_V1,
    );
    await reader.readBatchMentions(
      PROJECT_ALPHA,
      BATCH_ALPHA,
      ENTITY_ALPHA,
      PARSER_V2,
    );
    await reader.readBatchMentions(
      PROJECT_ALPHA,
      "batch_missing",
      ENTITY_ALPHA,
      PARSER_V1,
    );

    // Raw observation rows are immutable and the reader has no mention, parse,
    // or entity write path.
    expect(await testDb.select().from(geoObservationRuns)).toEqual(runsBefore);
    expect(await testDb.select().from(geoObservationParses)).toEqual(
      parsesBefore,
    );
    expect(await selectAllMentions()).toEqual(mentionsBefore);
    expect(await testDb.select().from(trackedEntities)).toEqual(entitiesBefore);
  });

  it("propagates a database failure instead of returning an empty list", async () => {
    await seedAlphaMention("men_alpha");
    await renameTable("geo_entity_mentions", "geo_entity_mentions_hidden");
    try {
      // The slice exists and was just readable; only storage is broken. An empty
      // list here would report a failed read as "nothing matched", so the
      // driver's own "no such table" reason has to reach the caller.
      let reason = "";
      try {
        await reader.readBatchMentions(
          PROJECT_ALPHA,
          BATCH_ALPHA,
          ENTITY_ALPHA,
          PARSER_V1,
        );
      } catch (error) {
        reason = failureMessages(error);
      }

      expect(reason).toMatch(/no such table: geo_entity_mentions/i);
    } finally {
      await renameTable("geo_entity_mentions_hidden", "geo_entity_mentions");
    }
  });
});

describe("GeoEntityMentionBatchReaderRepository selector validation", () => {
  const SELECTOR_VALUES = {
    projectId: PROJECT_ALPHA,
    batchId: BATCH_ALPHA,
    entityId: ENTITY_ALPHA,
    parserVersion: PARSER_V1,
  };

  const SELECTOR_CALLS = [
    {
      field: "projectId",
      read: (value: string) =>
        reader.readBatchMentions(value, BATCH_ALPHA, ENTITY_ALPHA, PARSER_V1),
    },
    {
      field: "batchId",
      read: (value: string) =>
        reader.readBatchMentions(PROJECT_ALPHA, value, ENTITY_ALPHA, PARSER_V1),
    },
    {
      field: "entityId",
      read: (value: string) =>
        reader.readBatchMentions(PROJECT_ALPHA, BATCH_ALPHA, value, PARSER_V1),
    },
    {
      field: "parserVersion",
      read: (value: string) =>
        reader.readBatchMentions(
          PROJECT_ALPHA,
          BATCH_ALPHA,
          ENTITY_ALPHA,
          value,
        ),
    },
  ];

  const INVALID_SELECTOR_VALUES: Array<[string, unknown]> = [
    ["a number", 42],
    ["null", null],
    ["an absent value", undefined],
    ["an object", {}],
  ];

  it.each(
    SELECTOR_CALLS.flatMap(({ field, read }) =>
      INVALID_SELECTOR_VALUES.map(([label, value]) => ({
        field,
        read,
        label,
        value,
      })),
    ),
  )("rejects $label as $field", async ({ field, read, value }) => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the reader must reject at runtime
    const untrusted = value as string;

    const error = await captureReaderError(() => read(untrusted));

    expect(error.name).toBe("GeoEntityMentionBatchReaderError");
    expect(error.field).toBe(field);
    expect(error.message).toMatch(new RegExp(field));
  });

  /**
   * Seed a decoy that matches all four selectors and reject an empty `field`.
   * The decoy is deliberately readable: if the empty value reached the SELECT
   * it would be returned, so the rejection proves no query ran.
   */
  async function expectEmptySelectorRejected(
    field: keyof typeof SELECTOR_VALUES,
    values: typeof SELECTOR_VALUES,
  ) {
    await seedMention({
      mentionId: `men_decoy_${field}`,
      runId: `run_decoy_${field}`,
      parseId: `parse_decoy_${field}`,
      ...values,
    });

    const error = await captureReaderError(() =>
      reader.readBatchMentions(
        values.projectId,
        values.batchId,
        values.entityId,
        values.parserVersion,
      ),
    );

    expect(error.field).toBe(field);
    expect(error.message).toBe(
      `GEO entity mention batch reader: ${field} must be a non-empty string.`,
    );
  }

  it("rejects an empty projectId before reading any stored row", async () => {
    await expectEmptySelectorRejected("projectId", {
      ...SELECTOR_VALUES,
      projectId: "",
    });
  });

  it("rejects an empty batchId before reading any stored row", async () => {
    await expectEmptySelectorRejected("batchId", {
      ...SELECTOR_VALUES,
      batchId: "",
    });
  });

  it("rejects an empty entityId before reading any stored row", async () => {
    await expectEmptySelectorRejected("entityId", {
      ...SELECTOR_VALUES,
      entityId: "",
    });
  });

  it("rejects an empty parserVersion before reading any stored row", async () => {
    await expectEmptySelectorRejected("parserVersion", {
      ...SELECTOR_VALUES,
      parserVersion: "",
    });
  });
});
