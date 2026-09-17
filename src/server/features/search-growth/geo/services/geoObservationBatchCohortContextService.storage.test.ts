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
import type { GeoObservationRun } from "@/types/schemas/geo-observation-run";
import { GeoMeasurementCohortIdentityError } from "./geoMeasurementCohortIdentityGuard";
import { GeoObservationCohortMemberProjectionError } from "./geoObservationCohortMemberProjector";
import { assembleGeoObservationCohortContext } from "./geoObservationCohortContextAssembler";
import type * as ServiceModule from "./geoObservationBatchCohortContextService";
import type * as ReaderModule from "../repositories/GeoObservationBatchReaderRepository";

// The batch cohort context service is exercised through the real accepted
// storage path: an in-memory SQLite database built from the actual forward
// migration DDL for geo_observation_runs (0050) plus the market profile (0045),
// topic (0046) and prompt (0049) parents its same-Project composite FKs
// reference, with foreign keys enabled. `@/db` is replaced with that handle so
// the production path — one Project-and-batch-scoped SELECT through the accepted
// T154 reader, then one accepted T156 assembly — runs unmodified, and the T155
// projector and T152/T151 boundaries are the real accepted implementations,
// never re-declared or mocked.
//
// Invariants under test (T157, ADR-003, ADR-005, 07_GEO_MEASUREMENT_SPEC.md
// §§1–4 and 7, 05_DOMAIN_DATA_MODEL.md §§2 and 6):
//   - one Project's batch is read through T154 and assembled through T156,
//     returning only their immutable ordered rows, validated members, and
//     five-field context;
//   - Project and sibling-batch isolation reach storage through the service, and
//     the reader's deterministic repeatIndex-then-id order reaches the members;
//   - an empty batch propagates T151's empty-cohort rejection rather than an
//     empty assembly, and an invalid selector or database failure propagates
//     rather than becoming an empty result;
//   - a malformed stored model/market/model-version propagates the typed error
//     of the accepted boundary that owns that field;
//   - a read mutates no stored row and no stored evidence.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let readGeoObservationBatchCohortContext: typeof ServiceModule.readGeoObservationBatchCohortContext;
let ReaderError: typeof ReaderModule.GeoObservationBatchReaderError;
let reader: typeof ReaderModule.GeoObservationBatchReaderRepository;

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

  // The service module graph captures the `@/db` handle at import time, so it
  // must be imported after that handle is replaced; that captured handle is why
  // these dynamic imports cannot be static ones.
  ({ readGeoObservationBatchCohortContext } =
    await import("./geoObservationBatchCohortContextService"));
  ({
    GeoObservationBatchReaderError: ReaderError,
    GeoObservationBatchReaderRepository: reader,
  } = await import("../repositories/GeoObservationBatchReaderRepository"));
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

async function selectRun(id: string) {
  const rows = await testDb
    .select()
    .from(geoObservationRuns)
    .where(eq(geoObservationRuns.id, id));
  return rows[0];
}

function readBatch(batchId: string, projectId = "proj_alpha") {
  return readGeoObservationBatchCohortContext(projectId, batchId);
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

/** The accepted T156 rejection for `rows`, computed without the service. */
function assemblyRejection(rows: readonly GeoObservationRun[]): Error {
  try {
    assembleGeoObservationCohortContext(rows);
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error("expected the accepted T156 assembly to reject these rows");
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

/**
 * The nullable stored provenance columns the service must not repair, in the
 * null and blank forms the owning accepted boundary rejects. A blank market
 * profile id needs its own stored parent: storage accepts the row because the
 * value is not NULL, and the accepted projector is what rejects it.
 */
const MALFORMED_PROVENANCE_VALUES: ReadonlyArray<{
  field: "marketProfileId" | "modelVersion" | "model";
  form: "null" | "blank";
  run: Partial<RunInsert>;
  profileId?: string;
}> = [
  { field: "marketProfileId", form: "null", run: { marketProfileId: null } },
  {
    field: "marketProfileId",
    form: "blank",
    run: { marketProfileId: "   " },
    profileId: "   ",
  },
  { field: "modelVersion", form: "null", run: { modelVersion: null } },
  { field: "modelVersion", form: "blank", run: { modelVersion: "" } },
  { field: "model", form: "null", run: { model: null } },
  { field: "model", form: "blank", run: { model: "" } },
];

describe("readGeoObservationBatchCohortContext reads", () => {
  it("returns the accepted assembly for one Project's batch, in reader order", async () => {
    await seedParents("proj_alpha");
    // Stored so that neither insertion order nor id order alone explains the
    // result: repeatIndex has to lead, and id has to break its ties.
    await seedRun({ id: "run_zulu", repeatIndex: 0 });
    await seedRun({ id: "run_alpha", repeatIndex: 1 });
    await seedRun({ id: "run_mike", repeatIndex: 1 });
    await seedRun({ id: "run_bravo", repeatIndex: 2 });
    const order = ["run_zulu", "run_alpha", "run_mike", "run_bravo"];

    const assembly = await readBatch("batch_alpha");

    expect(assembly.rows.map((row) => row.id)).toEqual(order);
    expect(assembly.rows.map((row) => row.repeatIndex)).toEqual([0, 1, 1, 2]);
    expect(assembly.members).toEqual(order.map(madeMember));
    // Exactly T152's five-field structured context, from the baseline member: a
    // toEqual on the whole object is what proves there is no sixth field — no run
    // identity, no count, no metric, no confidence.
    expect(assembly.context).toEqual({
      projectId: "proj_alpha",
      marketProfileId: "prof_alpha_market",
      surfaceType: "MODEL_API_SEARCH",
      model: "gpt-5",
      modelVersion: "2026-09-01",
    });
    // The service returns exactly what the two accepted boundaries produce from
    // the same stored rows, so it adds no rule of its own.
    expect(assembly).toEqual(
      assembleGeoObservationCohortContext(
        await reader.readBatch("proj_alpha", "batch_alpha"),
      ),
    );
  });

  it("isolates another Project and a sibling batch that reuse a batch id", async () => {
    await seedParents("proj_alpha");
    await seedParents("proj_beta");
    await seedRun({ id: "run_alpha_kept", batchId: "batch_shared" });
    await seedRun({ id: "run_alpha_sibling", batchId: "batch_other" });
    await seedRun({
      id: "run_beta",
      batchId: "batch_shared",
      projectId: "proj_beta",
      promptId: "prompt_beta",
      marketProfileId: "prof_beta_market",
      providerRequestId: "req_beta_1",
    });

    // The batch id alone is shared; the Project-scoped read is what separates the
    // two batches, so neither assembly can see the other Project's rows.
    expect((await readBatch("batch_shared")).rows.map((row) => row.id)).toEqual(
      ["run_alpha_kept"],
    );
    expect(
      (await readBatch("batch_shared", "proj_beta")).rows.map((row) => row.id),
    ).toEqual(["run_beta"]);
    // The sibling batch is never a fallback for an empty one: the missing batch
    // rejects as an empty cohort rather than returning the sibling's rows.
    await expect(readBatch("batch_missing")).rejects.toBeInstanceOf(
      GeoMeasurementCohortIdentityError,
    );
  });

  it("returns stored rows and raw evidence verbatim, never attached to a member", async () => {
    await seedParents("proj_alpha");
    await seedRun({
      id: "run_evidence",
      rawAnswer: "  OpenSEO is recommended.\n",
      rawResponse:
        '{"answer":"OpenSEO is recommended.","citations":[{"url":"https://openseo.dev"}]}',
      status: "FAILED",
      finishedAt: null,
    });
    // A second repeat that never captured a payload: NULL evidence stays NULL
    // rather than becoming an empty or placeholder value.
    await seedRun({ id: "run_no_payload", repeatIndex: 1 });

    const assembly = await readBatch("batch_alpha");
    const stored = await selectRun("run_evidence");

    expect(assembly.rows).toHaveLength(2);
    // Rows come back exactly as stored: no field added (no metric, sample count,
    // fraction, or cohort label) and none dropped, redacted, or re-encoded.
    expect(assembly.rows[0]).toEqual(stored);
    expect(Object.keys(assembly.rows[0])).toEqual(Object.keys(stored ?? {}));
    expect(assembly.rows[0]?.rawAnswer).toBe("  OpenSEO is recommended.\n");
    expect(assembly.rows[1]?.rawResponse).toBeNull();
    // Members carry the six cohort identifiers only: raw evidence is never
    // attached to a measurement member.
    expect(Object.keys(assembly.members[0] ?? {})).toEqual([
      "runId",
      "projectId",
      "marketProfileId",
      "surfaceType",
      "model",
      "modelVersion",
    ]);
  });

  it("reads without modifying any stored row or raw evidence", async () => {
    await seedParents("proj_alpha");
    await seedRun({ id: "run_a" });
    await seedRun({ id: "run_b", repeatIndex: 1, batchId: "batch_other" });
    const before = await selectAllRuns();
    const evidenceBefore = await selectRun("run_a");

    await readBatch("batch_alpha");
    // The failing read path is exercised too: a rejection must not write either.
    await captureRejection(() => readBatch("batch_missing"));

    expect(await selectAllRuns()).toEqual(before);
    expect(await selectRun("run_a")).toEqual(evidenceBefore);
  });
});

describe("readGeoObservationBatchCohortContext rejections", () => {
  it("propagates T151's empty-cohort rejection instead of an empty assembly", async () => {
    await seedParents("proj_alpha");
    // A stored sibling batch proves the rejection is about this empty batch, not
    // about an unreadable or empty table.
    await seedRun({ id: "run_other_batch", batchId: "batch_other" });
    // The accepted T156 assembly of the same empty list is the expected error:
    // T151 owns the non-empty-cohort rule, so an empty batch is a rejection and
    // never an empty assembly.
    const expected = assemblyRejection([]);

    const raised = await captureRejection(() => readBatch("batch_missing"));

    expect(raised).toBeInstanceOf(GeoMeasurementCohortIdentityError);
    expect(raised).toMatchObject({
      name: expected.name,
      message: expected.message,
      memberIndex: null,
      field: "members",
    });
  });

  it("propagates selector rejections instead of an empty assembly", async () => {
    // Decoys under the empty-Project and empty-batch keys: if either empty id
    // reached the SELECT it would return a row, so a rejection — not an empty
    // assembly — is the proof that no query ran.
    await client.execute("INSERT OR IGNORE INTO projects (id) VALUES ('')");
    await seedTopic("topic_empty", "");
    await seedPrompt("prompt_empty", "", "topic_empty");
    await seedRun({
      id: "run_empty_project",
      projectId: "",
      promptId: "prompt_empty",
      marketProfileId: null,
    });
    await seedParents("proj_alpha");
    await seedRun({ id: "run_empty_batch", batchId: "" });

    const emptyProject = await captureRejection(() =>
      readGeoObservationBatchCohortContext("", "batch_alpha"),
    );
    const emptyBatch = await captureRejection(() => readBatch(""));

    expect(emptyProject).toBeInstanceOf(ReaderError);
    expect(emptyProject).toMatchObject({ field: "projectId" });
    expect(emptyBatch).toBeInstanceOf(ReaderError);
    expect(emptyBatch).toMatchObject({ field: "batchId" });
  });

  it("propagates a database failure instead of an empty assembly", async () => {
    await seedParents("proj_alpha");
    await seedRun({ id: "run_alpha" });
    await renameRunsTable("geo_observation_runs", "geo_observation_runs_gone");
    try {
      // The batch exists and was just usable; only storage is broken. An empty
      // assembly here would report a failed read as an empty batch, so the
      // driver's own "no such table" reason has to reach the caller.
      const raised = await captureRejection(() => readBatch("batch_alpha"));

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

  it.each(MALFORMED_PROVENANCE_VALUES)(
    "propagates the owning boundary's rejection for a $form $field in stored rows",
    async ({ field, run, profileId }) => {
      await seedParents("proj_alpha");
      if (profileId !== undefined) await seedProfile(profileId, "proj_alpha");
      await seedRun({ id: "run_bad", ...run });
      const expected = assemblyRejection(
        await reader.readBatch("proj_alpha", "batch_alpha"),
      );

      const raised = await captureRejection(() => readBatch("batch_alpha"));

      // The accepted boundary that owns the column rejects it unchanged: the
      // T155 projector owns the two nullable provenance columns it must supply
      // as member identity, and the T151 guard owns `model`, which the projector
      // copies straight through.
      expect(raised).toBeInstanceOf(expected.constructor);
      expect(raised).toMatchObject({
        name: expected.name,
        message: expected.message,
      });
      if (raised instanceof GeoObservationCohortMemberProjectionError) {
        expect([raised.rowIndex, raised.field]).toEqual([0, field]);
      } else if (raised instanceof GeoMeasurementCohortIdentityError) {
        expect([raised.memberIndex, raised.field]).toEqual([0, field]);
      } else {
        throw new Error("expected an accepted boundary rejection");
      }
    },
  );

  it("propagates the projection rejection at the offending row's own index", async () => {
    await seedParents("proj_alpha");
    await seedRun({ id: "run_ok" });
    await seedRun({ id: "run_bad", repeatIndex: 1, marketProfileId: null });
    const expected = assemblyRejection(
      await reader.readBatch("proj_alpha", "batch_alpha"),
    );

    const raised = await captureRejection(() => readBatch("batch_alpha"));

    expect(expected).toBeInstanceOf(GeoObservationCohortMemberProjectionError);
    expect(raised).toBeInstanceOf(GeoObservationCohortMemberProjectionError);
    expect(raised).toMatchObject({
      name: expected.name,
      message: expected.message,
      rowIndex: 1,
      field: "marketProfileId",
    });
  });
});
