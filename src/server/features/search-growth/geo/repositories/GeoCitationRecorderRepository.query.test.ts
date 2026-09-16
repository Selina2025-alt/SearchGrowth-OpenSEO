/* eslint-disable max-lines -- one real-SQL spec covers the whole geo_citations recording contract (faithful mapping, every ownership value, optional NULLs, append-only independence, same-Project/dangling Parse and Receipt FKs, parent/runtime immutability, and the runtime rejection table) through the shipped DDL; splitting would scatter the invariants asserted against one adapter and one fixture graph */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
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
  contentPackages,
  contentPackageVersions,
  contentVariants,
  entityAliases,
  geoCitations,
  geoEntityMentions,
  geoObservationParses,
  geoObservationRuns,
  publicationExecutionPlans,
  publicationReceipts,
  publishingJobs,
  releaseBundles,
  releaseTargets,
  searchPrompts,
  searchTopics,
  trackedEntities,
} from "@/db/schema";
import type { GeoCitationFact } from "../services/geoCitationRecorder";
import type * as GeoCitationRecorderRepositoryModule from "./GeoCitationRecorderRepository";

// The citation recorder adapter is exercised against the real accepted storage
// contract: an in-memory SQLite database built from the actual forward
// migration DDL for geo_citations (0054 for the direct citation fields, 0082 for
// the same-Project matched-receipt composite FK) plus its parents — market
// profile 0045, topic 0046, tracked entity 0048, prompt 0049, immutable raw run
// 0050, versioned parse 0051/0053, mention table 0052 — and the full
// publication-receipt parent chain the matched-receipt FK requires: opportunity
// 0055, source ref 0056, claim 0057, media assets 0060/0061, content package
// 0062, version 0063, version claim 0064, variants 0067, variant media assets
// 0068, release bundles 0069, release targets 0070, execution plans 0078,
// publishing jobs 0080 and receipts 0081. Foreign keys are enabled and `@/db`
// is replaced with that handle so the production adapter code path (one INSERT,
// no update/upsert/delete) runs unmodified.
//
// Invariants under test (T142, ADR-005, 05_DOMAIN_DATA_MODEL.md §7,
// 07_GEO_MEASUREMENT_SPEC.md §§5 and 8, 21_TEST_ACCEPTANCE_PLAN.md §3):
//   - one fact persists exactly one row with every accepted column faithful and
//     only the database `created_at` default synthesized;
//   - every canonical source-ownership value round-trips and the optional
//     columns store their real value or SQL NULL with no normalization,
//     classification, matching, inference, or coercion;
//   - two supplied facts stay two independent rows (no new uniqueness rule);
//   - cross-Project parse/receipt ownership and dangling parse/receipt parents
//     are rejected by the accepted composite FKs, while no other table — raw
//     run, parse, mention, receipt, release target, or alias — is written or
//     modified;
//   - invalid identifiers, URL/domain values, ownership values, and
//     title/position/receipt values reject before any row is written, and an
//     absent optional member is rejected rather than treated as NULL.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

const REPOSITORY_SOURCE =
  "src/server/features/search-growth/geo/repositories/GeoCitationRecorderRepository.ts";

const DDL_FILES = [
  "drizzle/0045_search_market_profiles.sql",
  "drizzle/0046_search_topics.sql",
  "drizzle/0048_ordinary_legion.sql",
  "drizzle/0049_gigantic_johnny_blaze.sql",
  "drizzle/0050_dusty_stardust.sql",
  "drizzle/0051_cuddly_matthew_murdock.sql",
  "drizzle/0052_cute_red_shift.sql",
  "drizzle/0053_shocking_rhodey.sql",
  "drizzle/0054_optimal_magik.sql",
  "drizzle/0055_lowly_sumo.sql",
  "drizzle/0056_organic_blue_blade.sql",
  "drizzle/0057_cold_marrow.sql",
  "drizzle/0060_nervous_gwen_stacy.sql",
  "drizzle/0061_windy_sally_floyd.sql",
  "drizzle/0062_calm_nightcrawler.sql",
  "drizzle/0063_sudden_lyja.sql",
  "drizzle/0064_needy_lady_vermin.sql",
  "drizzle/0067_old_silhouette.sql",
  "drizzle/0068_steep_pandemic.sql",
  "drizzle/0069_clumsy_legion.sql",
  "drizzle/0070_youthful_bill_hollister.sql",
  "drizzle/0078_wooden_vengeance.sql",
  "drizzle/0080_milky_ghost_rider.sql",
  "drizzle/0081_bouncy_red_skull.sql",
  "drizzle/0082_mighty_steve_rogers.sql",
];

const VERSION_COLUMN_INSERT = `(id, project_id, content_package_id, version_no,
  canonical_markdown, canonical_metadata_json, content_hash, gate_status,
  classification)`;
const VARIANT_COLUMN_INSERT = `(id, project_id, content_package_version_id,
  platform, format, title, body, metadata_json, body_hash, renderer_version)`;
const BUNDLE_COLUMN_INSERT = `(id, project_id, content_package_version_id,
  release_version, status, release_strategy, utm_policy_json, bundle_hash)`;
const TARGET_COLUMN_INSERT = `(id, project_id, release_bundle_id,
  content_variant_id, platform, target_intent, required, target_hash)`;
const PLAN_COLUMN_INSERT = `(id, project_id, release_target_id, route,
  executor_version, required_fields_json, constraints_snapshot_json,
  verification_policy_json, plan_hash)`;
const JOB_COLUMNS = `(id, project_id, release_target_id, execution_plan_id,
  executor_id, executor_version, status, attempts, max_attempts, idempotency_key,
  leased_by, lease_expires_at, external_draft_id, external_task_id,
  external_content_id, public_url, last_error_code, last_error_message_safe)`;
const RECEIPT_COLUMNS = `(id, project_id, publishing_job_id, release_target_id,
  platform, executor_id, executor_version, external_draft_id, external_task_id,
  external_content_id, public_url, content_hash, media_hashes_json, status,
  submitted_at, published_at, verified_at, verification_json)`;

const statementParts = (ddl: string) =>
  ddl
    .split(DRIZZLE_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let recorder: typeof GeoCitationRecorderRepositoryModule.GeoCitationRecorderRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));

  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta');`,
  );
  for (const file of DDL_FILES) {
    for (const statement of statementParts(readFileSync(file, "utf8"))) {
      await client.execute(statement);
    }
  }

  ({ GeoCitationRecorderRepository: recorder } =
    await import("./GeoCitationRecorderRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  // Child-first teardown: citations reference parses (cascade) and receipts
  // (NO ACTION, so they go first); parses reference runs; runs and prompts
  // reference topics. Receipts reference jobs and release targets; jobs
  // reference plans and release targets; plans reference release targets;
  // targets reference bundles and variants; both reference package versions;
  // versions reference packages; packages reference topics.
  await testDb.delete(geoCitations);
  await testDb.delete(geoObservationParses);
  await testDb.delete(geoObservationRuns);
  await testDb.delete(searchPrompts);
  await testDb.delete(publicationReceipts);
  await testDb.delete(publishingJobs);
  await testDb.delete(publicationExecutionPlans);
  await testDb.delete(releaseTargets);
  await testDb.delete(releaseBundles);
  await testDb.delete(contentVariants);
  await testDb.delete(contentPackageVersions);
  await testDb.delete(contentPackages);
  await testDb.delete(searchTopics);
});

/** `proj_alpha` -> `alpha`, so one fixture id set is derived per project. */
function shortName(projectId: string) {
  return projectId.replace("proj_", "");
}

async function seedTopic(id: string, projectId: string) {
  await testDb.insert(searchTopics).values({
    id,
    projectId,
    canonicalName: `Topic ${id}`,
    locale: "en",
    status: "ACTIVE",
  });
}

async function seedPackage(id: string, projectId: string, topicId: string) {
  await testDb.insert(contentPackages).values({
    id,
    projectId,
    topicId,
    title: `Package ${id}`,
    locale: "en",
    status: "planned",
  });
}

async function seedVersion(
  id: string,
  projectId: string,
  packageId: string,
  versionNo: number,
) {
  await client.execute(
    `INSERT INTO content_package_versions ${VERSION_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', '${packageId}', ${versionNo},
             '# Version ${id}', '{}', 'sha256-${id}', 'DRAFT', 'INTERNAL')`,
  );
}

async function seedVariant(id: string, projectId: string, versionId: string) {
  await client.execute(
    `INSERT INTO content_variants ${VARIANT_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', '${versionId}', 'zhihu', 'article',
             'Title ${id}', '<p>${id}</p>', '{}', 'sha256-${id}', 'renderer-v1')`,
  );
}

async function seedBundle(id: string, projectId: string, versionId: string) {
  await client.execute(
    `INSERT INTO release_bundles ${BUNDLE_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', '${versionId}', 1, 'APPROVED',
             'WEBSITE_FIRST', '{}', 'hash-${id}')`,
  );
}

async function seedTarget(id: string, projectId: string) {
  await client.execute(
    `INSERT INTO release_targets ${TARGET_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', 'bundle_${shortName(projectId)}',
             'variant_${shortName(projectId)}', 'zhihu', 'PUBLIC', 1,
             'hash-${id}')`,
  );
}

async function seedPlan(id: string, projectId: string, targetId: string) {
  await client.execute(
    `INSERT INTO publication_execution_plans ${PLAN_COLUMN_INSERT}
     VALUES ('${id}', '${projectId}', '${targetId}',
             'WECHATSYNC_STAGED_FINALIZE', 'wechatsync-v1', '[]', '{}', '{}',
             'hash-${id}')`,
  );
}

async function seedJob(id: string, projectId: string, targetId: string) {
  await client.execute(
    `INSERT INTO publishing_jobs ${JOB_COLUMNS}
     VALUES ('${id}', '${projectId}', '${targetId}', 'plan_${shortName(projectId)}',
             'executor-opaque-1', 'wechatsync-v1', 'PUBLISH_SUBMITTED', 0, 3,
             'idem_${id}', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
  );
}

async function seedReceipt(id: string, projectId: string) {
  const suffix = shortName(projectId);
  await client.execute(
    `INSERT INTO publication_receipts ${RECEIPT_COLUMNS}
     VALUES ('${id}', '${projectId}', 'job_${suffix}', 'target_${suffix}',
             'zhihu', 'executor-opaque-1', 'wechatsync-v1', NULL, NULL, NULL,
             'https://example.com/published/${id}', 'sha256-${id}',
             '["sha256-asset-1"]', 'PUBLISH_SUBMITTED', NULL, NULL, NULL, '{}')`,
  );
}

async function seedPrompt(id: string, projectId: string) {
  await testDb.insert(searchPrompts).values({
    id,
    projectId,
    topicId: `topic_${shortName(projectId)}`,
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

async function seedRun(id: string, projectId: string) {
  await testDb.insert(geoObservationRuns).values({
    id,
    batchId: `batch_${shortName(projectId)}`,
    projectId,
    promptId: `prompt_${shortName(projectId)}`,
    promptVersion: 1,
    surfaceType: "MODEL_API_SEARCH",
    surfaceName: "GPT-5 Search",
    fidelity: "API_SIMULATION",
    repeatIndex: 0,
    applicationCacheBypassed: true,
    startedAt: "2026-09-08T04:00:00.000Z",
    status: "SUCCEEDED",
  });
}

async function seedParse(id: string, projectId: string) {
  await testDb.insert(geoObservationParses).values({
    id,
    projectId,
    runId: `run_${shortName(projectId)}`,
    parserVersion: "1.0.0",
    parseStatus: "SUCCESS",
    accuracyStatus: null,
    parsedAt: "2026-09-08T04:00:05.000Z",
    isCurrent: false,
  });
}

/**
 * One complete minimal valid parent graph for a project: the parse chain a
 * citation attaches to plus the release/receipt chain its optional matched
 * receipt references.
 */
async function seedProject(projectId: string) {
  const suffix = shortName(projectId);
  await seedTopic(`topic_${suffix}`, projectId);
  await seedPackage(`package_${suffix}`, projectId, `topic_${suffix}`);
  await seedVersion(`ver_${suffix}`, projectId, `package_${suffix}`, 1);
  await seedVariant(`variant_${suffix}`, projectId, `ver_${suffix}`);
  await seedBundle(`bundle_${suffix}`, projectId, `ver_${suffix}`);
  await seedTarget(`target_${suffix}`, projectId);
  await seedPlan(`plan_${suffix}`, projectId, `target_${suffix}`);
  await seedJob(`job_${suffix}`, projectId, `target_${suffix}`);
  await seedReceipt(`receipt_${suffix}`, projectId);
  await seedPrompt(`prompt_${suffix}`, projectId);
  await seedRun(`run_${suffix}`, projectId);
  await seedParse(`parse_${suffix}`, projectId);
}

function makeFact(overrides: Partial<GeoCitationFact> = {}): GeoCitationFact {
  return {
    id: "citation_alpha_1",
    projectId: "proj_alpha",
    parseId: "parse_alpha",
    rawUrl: "https://example.com/article?utm_source=chatgpt",
    normalizedUrl: "https://example.com/article",
    domain: "example.com",
    title: "Example article",
    position: 1,
    sourceOwnership: "OWNED_DOMAIN",
    matchedPublicationReceiptId: "receipt_alpha",
    ...overrides,
  };
}

/** A fact carrying a deliberately invalid runtime value for one field. */
function makeInvalidFact(overrides: Record<string, unknown>): GeoCitationFact {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the adapter must reject at runtime
  return { ...makeFact(), ...overrides } as unknown as GeoCitationFact;
}

async function selectCitation(id: string) {
  const rows = await testDb
    .select()
    .from(geoCitations)
    .where(eq(geoCitations.id, id));
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
async function failedRecordReason(fact: GeoCitationFact) {
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
async function expectFactRejected(fact: GeoCitationFact, reason: RegExp) {
  await expect(recorder.record(fact)).rejects.toThrow(reason);
  expect(await testDb.select().from(geoCitations)).toHaveLength(0);
}

describe("GeoCitationRecorderRepository", () => {
  it("persists one fact as one row with every accepted column faithful", async () => {
    await seedProject("proj_alpha");
    const fact = makeFact();

    await recorder.record(fact);

    const rows = await testDb.select().from(geoCitations);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "citation_alpha_1",
      projectId: "proj_alpha",
      parseId: "parse_alpha",
      // Both URLs and the domain are stored exactly as handed over: no
      // normalization, canonicalization, or derivation runs in this slice.
      rawUrl: "https://example.com/article?utm_source=chatgpt",
      normalizedUrl: "https://example.com/article",
      domain: "example.com",
      title: "Example article",
      position: 1,
      sourceOwnership: "OWNED_DOMAIN",
      matchedPublicationReceiptId: "receipt_alpha",
    });
    // The only value not derived from the fact is the existing DB default.
    expect(rows[0]?.createdAt).toEqual(expect.any(String));
  });

  it("round-trips every canonical source-ownership value", async () => {
    await seedProject("proj_alpha");
    const ownershipValues = [
      "OWNED_DOMAIN",
      "CONTROLLED_PUBLICATION",
      "EARNED_THIRD_PARTY",
      "COMPETITOR",
      "UNKNOWN",
    ] as const;

    for (const sourceOwnership of ownershipValues) {
      await recorder.record(
        makeFact({
          id: `citation_${sourceOwnership}`,
          sourceOwnership,
          matchedPublicationReceiptId: null,
        }),
      );
    }

    const rows = await testDb.select().from(geoCitations);
    expect(
      sort(
        rows.map((row) => row.sourceOwnership),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual([
      "COMPETITOR",
      "CONTROLLED_PUBLICATION",
      "EARNED_THIRD_PARTY",
      "OWNED_DOMAIN",
      "UNKNOWN",
    ]);
  });

  it("stores each optional column as its real value and as NULL when explicitly null", async () => {
    await seedProject("proj_alpha");

    await recorder.record(
      makeFact({
        id: "citation_full",
        title: "Cited title",
        position: 3,
        matchedPublicationReceiptId: "receipt_alpha",
      }),
    );
    // Every optional member is an explicit null: no value is inferred for a
    // citation the parse recorded no title/position/receipt for, so the columns
    // must hold SQL NULL. position 0 is a real recorded ordinal, not an absent
    // value, so the third row pins that falsy 0 is preserved.
    await recorder.record(
      makeFact({
        id: "citation_bare",
        title: null,
        position: null,
        matchedPublicationReceiptId: null,
      }),
    );
    await recorder.record(
      makeFact({
        id: "citation_zero",
        title: null,
        position: 0,
        matchedPublicationReceiptId: null,
      }),
    );

    expect(await selectCitation("citation_full")).toMatchObject({
      title: "Cited title",
      position: 3,
      matchedPublicationReceiptId: "receipt_alpha",
    });
    expect(await selectCitation("citation_bare")).toMatchObject({
      title: null,
      position: null,
      matchedPublicationReceiptId: null,
    });
    expect((await selectCitation("citation_zero"))?.position).toBe(0);
  });

  it("keeps multiple supplied facts as independent rows with no uniqueness rule", async () => {
    await seedProject("proj_alpha");

    // Same parse, same raw and normalized URL: the accepted table has no
    // business-unique constraint (the migration reference's
    // (run_id, normalized_url) index is deliberately not shipped), so repeats
    // of one URL at different positions are separate append-only rows.
    await recorder.record(makeFact({ id: "citation_repeat_a", position: 1 }));
    await recorder.record(makeFact({ id: "citation_repeat_b", position: 4 }));

    const rows = await testDb
      .select()
      .from(geoCitations)
      .where(eq(geoCitations.parseId, "parse_alpha"));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(
      expect.arrayContaining(["citation_repeat_a", "citation_repeat_b"]),
    );
    expect(await selectCitation("citation_repeat_a")).toMatchObject({
      position: 1,
    });
  });

  it("propagates a same-Project parse FK violation and writes no row", async () => {
    await seedProject("proj_alpha");
    await seedProject("proj_beta");

    // parse_beta sits beneath proj_beta while the fact claims proj_alpha, so
    // the composite FK (project_id, parse_id) has no matching parent row.
    const reason = await failedRecordReason(
      makeFact({ parseId: "parse_beta" }),
    );

    expect(reason).toMatch(/FOREIGN KEY constraint failed/i);
    expect(await testDb.select().from(geoCitations)).toHaveLength(0);
  });

  it("propagates a dangling parse parent and writes no row", async () => {
    await seedProject("proj_alpha");

    const reason = await failedRecordReason(
      makeFact({ parseId: "parse_missing" }),
    );

    expect(reason).toMatch(/FOREIGN KEY constraint failed/i);
    expect(await testDb.select().from(geoCitations)).toHaveLength(0);
  });

  it("propagates a same-Project receipt FK violation and writes no row", async () => {
    await seedProject("proj_alpha");
    await seedProject("proj_beta");

    // receipt_beta sits beneath proj_beta while the fact claims proj_alpha, so
    // the composite FK (project_id, matched_publication_receipt_id) has no
    // matching parent row.
    const reason = await failedRecordReason(
      makeFact({ matchedPublicationReceiptId: "receipt_beta" }),
    );

    expect(reason).toMatch(/FOREIGN KEY constraint failed/i);
    expect(await testDb.select().from(geoCitations)).toHaveLength(0);
  });

  it("propagates a dangling receipt reference and writes no row", async () => {
    await seedProject("proj_alpha");

    // No matching is performed here: an unmatched-but-supplied receipt id is a
    // dangling reference the accepted composite FK rejects, not a value the
    // adapter silently nulls.
    const reason = await failedRecordReason(
      makeFact({ matchedPublicationReceiptId: "receipt_missing" }),
    );

    expect(reason).toMatch(/FOREIGN KEY constraint failed/i);
    expect(await testDb.select().from(geoCitations)).toHaveLength(0);
  });

  it("records citations without modifying the raw run, parse, mention, receipt, or release rows", async () => {
    await seedProject("proj_alpha");
    const runBefore = await testDb
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, "run_alpha"));
    const parseBefore = await testDb
      .select()
      .from(geoObservationParses)
      .where(eq(geoObservationParses.id, "parse_alpha"));
    const receiptBefore = await testDb
      .select()
      .from(publicationReceipts)
      .where(eq(publicationReceipts.id, "receipt_alpha"));
    const targetBefore = await testDb
      .select()
      .from(releaseTargets)
      .where(eq(releaseTargets.id, "target_alpha"));

    await recorder.record(makeFact());
    await recorder.record(makeFact({ id: "citation_alpha_2", position: 2 }));

    // Raw is immutable (21_TEST_ACCEPTANCE_PLAN.md §3) and the adapter has no
    // run/parse/mention/receipt/release write path.
    expect(
      await testDb
        .select()
        .from(geoObservationRuns)
        .where(eq(geoObservationRuns.id, "run_alpha")),
    ).toEqual(runBefore);
    expect(
      await testDb
        .select()
        .from(geoObservationParses)
        .where(eq(geoObservationParses.id, "parse_alpha")),
    ).toEqual(parseBefore);
    expect(
      await testDb
        .select()
        .from(publicationReceipts)
        .where(eq(publicationReceipts.id, "receipt_alpha")),
    ).toEqual(receiptBefore);
    expect(
      await testDb
        .select()
        .from(releaseTargets)
        .where(eq(releaseTargets.id, "target_alpha")),
    ).toEqual(targetBefore);
    expect(await testDb.select().from(geoEntityMentions)).toHaveLength(0);
    expect(await testDb.select().from(trackedEntities)).toHaveLength(0);
    expect(await testDb.select().from(entityAliases)).toHaveLength(0);
    expect(await testDb.select().from(geoCitations)).toHaveLength(2);
  });

  it.each([
    ["id", ""],
    ["id", 42],
    ["projectId", ""],
    ["projectId", null],
    ["parseId", ""],
    ["parseId", 7],
    ["rawUrl", ""],
    ["rawUrl", null],
    ["normalizedUrl", ""],
    ["normalizedUrl", 1],
    ["domain", ""],
    ["domain", 9],
  ])(
    "rejects an empty or non-string %s before writing any row",
    async (field, value) => {
      await seedProject("proj_alpha");
      await expectFactRejected(
        makeInvalidFact({ [field]: value }),
        new RegExp(`\\(${field}\\)`),
      );
    },
  );

  it.each([
    ["a lowercase value", "owned_domain"],
    ["a mixed-case value", "Owned_Domain"],
    ["an unsupported value", "PARTNER"],
    ["an empty value", ""],
    ["a number", 1],
    ["null", null],
    ["an absent value", undefined],
  ])(
    "rejects %s as sourceOwnership before writing any row",
    async (_label, value) => {
      await seedProject("proj_alpha");
      await expectFactRejected(
        makeInvalidFact({ sourceOwnership: value }),
        /\(sourceOwnership\)/,
      );
    },
  );

  it.each([
    ["a number", 1],
    ["a boolean", true],
    ["an absent value", undefined],
  ])("rejects %s as title before writing any row", async (_label, value) => {
    await seedProject("proj_alpha");
    await expectFactRejected(makeInvalidFact({ title: value }), /\(title\)/);
  });

  it.each([
    ["a fractional number", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a numeric string", "3"],
    ["a string", "first"],
    ["an absent value", undefined],
  ])("rejects %s as position before writing any row", async (_label, value) => {
    await seedProject("proj_alpha");
    await expectFactRejected(
      makeInvalidFact({ position: value }),
      /\(position\)/,
    );
  });

  it.each([
    ["a number", 1],
    ["a boolean", false],
    ["an absent value", undefined],
  ])(
    "rejects %s as matchedPublicationReceiptId before writing any row",
    async (_label, value) => {
      await seedProject("proj_alpha");
      await expectFactRejected(
        makeInvalidFact({ matchedPublicationReceiptId: value }),
        /\(matchedPublicationReceiptId\)/,
      );
    },
  );
});

describe("GeoCitationRecorderRepository write boundary", () => {
  it("has exactly one insert path into geo_citations and no other table write", () => {
    const source = readFileSync(REPOSITORY_SOURCE, "utf8");

    expect(source).toContain("db.insert(geoCitations)");
    expect(source).not.toMatch(/\.update\(|\.onConflict|\.delete\(|\.set\(/);
    // Only the citation table is named as a Drizzle argument: no raw run, parse,
    // entity mention, publication receipt, or release table is imported or
    // written.
    expect(source).not.toMatch(
      /geoObservationRuns|geoObservationParses|geoEntityMentions|publicationReceipts|releaseTargets/,
    );
  });
});
