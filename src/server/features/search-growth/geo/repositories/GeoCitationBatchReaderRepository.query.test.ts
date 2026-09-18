/* eslint-disable max-lines -- one real-SQL spec covers the whole citation batch read contract (three-selector isolation, version explicitness, citation/provenance preservation, ordering, empty/error behaviour, and non-mutation) through the shipped DDL; splitting would scatter the invariants asserted against one adapter and one fixture graph */
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
  contentPackages,
  contentPackageVersions,
  contentVariants,
  geoCitations,
  geoObservationParses,
  geoObservationRuns,
  publicationExecutionPlans,
  publicationReceipts,
  publishingJobs,
  releaseBundles,
  releaseTargets,
  searchPrompts,
  searchTopics,
} from "@/db/schema";
import type * as GeoCitationBatchReaderRepositoryModule from "./GeoCitationBatchReaderRepository";

// The citation batch reader is exercised against the real accepted storage
// contract: an in-memory SQLite database built from the actual forward migration
// DDL for geo_citations (0054 for the direct citation fields, 0082 for the
// same-Project matched-receipt composite FK), its versioned parse (0051 + 0053)
// and immutable run (0050) parents, the market profile (0045), topic (0046),
// prompt (0049), and mention (0052) relations those composite FKs reference, and
// the publication-receipt parent chain the 0082 FK requires (0055–0057, 0060–
// 0064, 0067–0070, 0078, 0080, 0081). Foreign keys are enabled and `@/db` is
// replaced with that handle so the production reader code path (one
// three-selector-scoped SELECT over the accepted run/parse/citation join, no
// write of any kind) runs unmodified.
//
// Invariants under test (T160, ADR-003, ADR-005,
// 07_GEO_MEASUREMENT_SPEC.md §§5, 7 and 8, 05_DOMAIN_DATA_MODEL.md §7):
//   - only rows matching all three selectors come back, in repeatIndex, run id,
//     parse id, citation id order, the same order on every call;
//   - another Project reusing the batch id, parser version, URL, and domain,
//     another batch of the same Project, and another parser version of the same
//     run are all excluded, so no selector is optional;
//   - every stored citation field — the opaque raw/normalized URL, domain,
//     title, position, ownership, and receipt reference — comes back exactly as
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
const PARSER_V1 = "parser-v1";
const PARSER_V2 = "parser-v2";

const VERSION_COLUMNS = `(id, project_id, content_package_id, version_no,
  canonical_markdown, canonical_metadata_json, content_hash, gate_status,
  classification)`;
const VARIANT_COLUMNS = `(id, project_id, content_package_version_id,
  platform, format, title, body, metadata_json, body_hash, renderer_version)`;
const BUNDLE_COLUMNS = `(id, project_id, content_package_version_id,
  release_version, status, release_strategy, utm_policy_json, bundle_hash)`;
const TARGET_COLUMNS = `(id, project_id, release_bundle_id,
  content_variant_id, platform, target_intent, required, target_hash)`;
const PLAN_COLUMNS = `(id, project_id, release_target_id, route,
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

const statementParts = (ddl: string) =>
  ddl
    .split(DRIZZLE_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let reader: typeof GeoCitationBatchReaderRepositoryModule.GeoCitationBatchReaderRepository;
let ReaderError: typeof GeoCitationBatchReaderRepositoryModule.GeoCitationBatchReaderError;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));

  await client.execute("PRAGMA foreign_keys = ON");
  // `projects` is the one parent outside the geo/search-growth migrations this
  // adapter's chain references. Its rows are created on demand by
  // `ensureProject`, so the empty-selector decoy can live under an empty id.
  await client.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
  for (const file of DDL_FILES) {
    for (const statement of statementParts(readFileSync(file, "utf8"))) {
      await client.execute(statement);
    }
  }

  // The module is imported after `@/db` is replaced, so its module-level handle
  // is the in-memory database above; that captured handle is why this dynamic
  // import cannot be a static one.
  ({
    GeoCitationBatchReaderRepository: reader,
    GeoCitationBatchReaderError: ReaderError,
  } = await import("./GeoCitationBatchReaderRepository"));
});

afterAll(() => {
  client.close();
});

// Parents are created once per test graph and reused, so a test can put several
// citations on one run or parse without fighting the accepted unique indexes.
let createdTopics: Set<string>;
let createdPrompts: Set<string>;
let createdRuns: Set<string>;
let createdParses: Set<string>;
let createdReceipts: Set<string>;

beforeEach(async () => {
  // Child-first teardown: citations reference parses (cascade) and receipts
  // (NO ACTION, so they go first); parses reference runs; runs reference
  // prompts; receipts reference jobs and release targets; jobs reference plans
  // and release targets; plans reference release targets; targets reference
  // bundles and variants; both reference package versions; versions reference
  // packages; packages and prompts reference topics. Project rows are kept.
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
  createdTopics = new Set();
  createdPrompts = new Set();
  createdRuns = new Set();
  createdParses = new Set();
  createdReceipts = new Set();
});

/** `proj_alpha` -> `alpha`, so one fixture id set is derived per project. */
function shortName(projectId: string) {
  return projectId.replace("proj_", "");
}

/**
 * The owning Project row, so a fixture graph whose Project key is itself an
 * unusable selector value can still be stored and read back.
 */
async function ensureProject(projectId: string) {
  await client.execute({
    sql: "INSERT OR IGNORE INTO projects (id) VALUES (?)",
    args: [projectId],
  });
}

async function ensureTopic(projectId: string) {
  if (createdTopics.has(projectId)) return;
  createdTopics.add(projectId);
  await ensureProject(projectId);
  await testDb.insert(searchTopics).values({
    id: `topic_${shortName(projectId)}`,
    projectId,
    canonicalName: `Topic ${projectId}`,
    locale: "en",
    status: "ACTIVE",
  });
}

async function ensurePrompt(projectId: string) {
  await ensureTopic(projectId);
  if (createdPrompts.has(projectId)) return;
  createdPrompts.add(projectId);
  await testDb.insert(searchPrompts).values({
    id: `prompt_${shortName(projectId)}`,
    projectId,
    topicId: `topic_${shortName(projectId)}`,
    promptText: `Prompt ${projectId}`,
    normalizedPrompt: `prompt ${projectId}`,
    promptType: "definition",
    language: "en",
    businessFit: 50,
    priority: 50,
    version: 1,
    active: true,
  });
}

async function ensureRun(params: {
  runId: string;
  projectId: string;
  batchId: string;
  repeatIndex?: number;
}) {
  await ensurePrompt(params.projectId);
  if (createdRuns.has(params.runId)) return;
  createdRuns.add(params.runId);
  await testDb.insert(geoObservationRuns).values({
    id: params.runId,
    batchId: params.batchId,
    projectId: params.projectId,
    promptId: `prompt_${shortName(params.projectId)}`,
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

/**
 * One minimal valid release → receipt chain for a Project, so a citation can
 * carry a real stored `matched_publication_receipt_id` under the accepted
 * same-Project composite FK.
 */
async function ensureReceipt(projectId: string) {
  await ensureTopic(projectId);
  if (createdReceipts.has(projectId)) return;
  createdReceipts.add(projectId);
  const suffix = shortName(projectId);
  await testDb.insert(contentPackages).values({
    id: `package_${suffix}`,
    projectId,
    topicId: `topic_${suffix}`,
    title: `Package ${suffix}`,
    locale: "en",
    status: "planned",
  });
  await client.execute(
    `INSERT INTO content_package_versions ${VERSION_COLUMNS}
     VALUES ('ver_${suffix}', '${projectId}', 'package_${suffix}', 1,
             '# Version ${suffix}', '{}', 'sha256-ver_${suffix}', 'DRAFT',
             'INTERNAL')`,
  );
  await client.execute(
    `INSERT INTO content_variants ${VARIANT_COLUMNS}
     VALUES ('variant_${suffix}', '${projectId}', 'ver_${suffix}', 'zhihu',
             'article', 'Title ${suffix}', '<p>${suffix}</p>', '{}',
             'sha256-variant_${suffix}', 'renderer-v1')`,
  );
  await client.execute(
    `INSERT INTO release_bundles ${BUNDLE_COLUMNS}
     VALUES ('bundle_${suffix}', '${projectId}', 'ver_${suffix}', 1, 'APPROVED',
             'WEBSITE_FIRST', '{}', 'hash-bundle_${suffix}')`,
  );
  await client.execute(
    `INSERT INTO release_targets ${TARGET_COLUMNS}
     VALUES ('target_${suffix}', '${projectId}', 'bundle_${suffix}',
             'variant_${suffix}', 'zhihu', 'PUBLIC', 1,
             'hash-target_${suffix}')`,
  );
  await client.execute(
    `INSERT INTO publication_execution_plans ${PLAN_COLUMNS}
     VALUES ('plan_${suffix}', '${projectId}', 'target_${suffix}',
             'WECHATSYNC_STAGED_FINALIZE', 'wechatsync-v1', '[]', '{}', '{}',
             'hash-plan_${suffix}')`,
  );
  await client.execute(
    `INSERT INTO publishing_jobs ${JOB_COLUMNS}
     VALUES ('job_${suffix}', '${projectId}', 'target_${suffix}',
             'plan_${suffix}', 'executor-opaque-1', 'wechatsync-v1',
             'PUBLISH_SUBMITTED', 0, 3, 'idem_job_${suffix}', NULL, NULL, NULL,
             NULL, NULL, NULL, NULL, NULL)`,
  );
  await client.execute(
    `INSERT INTO publication_receipts ${RECEIPT_COLUMNS}
     VALUES ('receipt_${suffix}', '${projectId}', 'job_${suffix}',
             'target_${suffix}', 'zhihu', 'executor-opaque-1', 'wechatsync-v1',
             NULL, NULL, NULL, 'https://example.com/published/${suffix}',
             'sha256-receipt_${suffix}', '["sha256-asset-1"]',
             'PUBLISH_SUBMITTED', NULL, NULL, NULL, '{}')`,
  );
}

type CitationSeed = {
  citationId: string;
  projectId: string;
  batchId: string;
  parserVersion: string;
  runId: string;
  parseId: string;
  repeatIndex?: number;
  rawUrl?: string;
  normalizedUrl?: string;
  domain?: string;
  title?: string | null;
  position?: number | null;
  sourceOwnership?: typeof geoCitations.$inferInsert.sourceOwnership;
  matchedReceipt?: boolean;
};

/** The stored URL evidence a seeded citation carries unless a test overrides it. */
function defaultRawUrl(citationId: string) {
  return `https://Example.COM/Cited?ref=${citationId}`;
}

/** Seed one fully-linked stored citation: run, parse, and (optionally) receipt. */
async function seedCitation(params: CitationSeed) {
  await ensureRun(params);
  await ensureParse(params);
  if (params.matchedReceipt) await ensureReceipt(params.projectId);
  await testDb.insert(geoCitations).values({
    id: params.citationId,
    projectId: params.projectId,
    parseId: params.parseId,
    rawUrl: params.rawUrl ?? defaultRawUrl(params.citationId),
    normalizedUrl:
      params.normalizedUrl ??
      `https://example.com/cited?ref=${params.citationId}`,
    domain: params.domain ?? "Example.COM",
    // An explicit `null` is a stored fact, so only an absent value takes the
    // default here.
    title:
      params.title === undefined
        ? `Title of ${params.citationId}`
        : params.title,
    position: params.position === undefined ? 1 : params.position,
    sourceOwnership: params.sourceOwnership ?? "UNKNOWN",
    matchedPublicationReceiptId: params.matchedReceipt
      ? `receipt_${shortName(params.projectId)}`
      : null,
  });
}

/** The default alpha-Project slice: batch_alpha and parser-v1. */
async function seedAlphaCitation(
  citationId: string,
  overrides: Partial<CitationSeed> = {},
) {
  await seedCitation({
    citationId,
    projectId: PROJECT_ALPHA,
    batchId: BATCH_ALPHA,
    parserVersion: PARSER_V1,
    runId: `run_${citationId}`,
    parseId: `parse_${citationId}`,
    ...overrides,
  });
}

function selectAllCitations() {
  return testDb.select().from(geoCitations).orderBy(asc(geoCitations.id));
}

async function selectCitation(id: string) {
  const rows = await testDb
    .select()
    .from(geoCitations)
    .where(eq(geoCitations.id, id));
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

describe("GeoCitationBatchReaderRepository reads", () => {
  it("returns the three-selector slice ordered by repeatIndex, run, parse, then citation", async () => {
    // Stored so that insertion order and id order alone cannot explain the
    // result: repeatIndex leads, run id breaks its ties, and citation id breaks
    // the remaining ones.
    await seedAlphaCitation("cit_b2", {
      runId: "run_b",
      parseId: "parse_b",
      repeatIndex: 1,
    });
    await seedAlphaCitation("cit_a", { runId: "run_a", parseId: "parse_a" });
    await seedAlphaCitation("cit_z", { runId: "run_z", parseId: "parse_z" });
    await seedAlphaCitation("cit_b1", {
      runId: "run_b",
      parseId: "parse_b",
      repeatIndex: 1,
    });
    await seedAlphaCitation("cit_c", {
      runId: "run_c",
      parseId: "parse_c",
      repeatIndex: 2,
    });
    // Another parser version of run_a is stored and must not appear: it would
    // sort beside cit_a and could not be told apart by ordering alone.
    await seedAlphaCitation("cit_a_v2", {
      runId: "run_a",
      parseId: "parse_a_v2",
      parserVersion: PARSER_V2,
    });

    const rows = await reader.readBatchCitations(
      PROJECT_ALPHA,
      BATCH_ALPHA,
      PARSER_V1,
    );
    const order = ["cit_a", "cit_z", "cit_b1", "cit_b2", "cit_c"];

    expect(rows.map((row) => row.id)).toEqual(order);
    // The same call returns the same order: the result is not incidental.
    expect(
      (
        await reader.readBatchCitations(PROJECT_ALPHA, BATCH_ALPHA, PARSER_V1)
      ).map((row) => row.id),
    ).toEqual(order);
  });

  it("excludes another Project that reuses the batch id, parser version, URL, and domain", async () => {
    await seedAlphaCitation("cit_alpha");
    // The batch id, parser version, URL, domain, and title are shared verbatim;
    // the Project is what separates the two slices, so neither read can see the
    // other's rows.
    await seedCitation({
      citationId: "cit_beta",
      projectId: PROJECT_BETA,
      batchId: BATCH_ALPHA,
      parserVersion: PARSER_V1,
      runId: "run_beta",
      parseId: "parse_beta",
      rawUrl: "https://Example.COM/Cited?ref=cit_alpha",
      normalizedUrl: "https://example.com/cited?ref=cit_alpha",
      domain: "Example.COM",
      title: "Title of cit_alpha",
    });

    expect(
      (
        await reader.readBatchCitations(PROJECT_ALPHA, BATCH_ALPHA, PARSER_V1)
      ).map((row) => row.id),
    ).toEqual(["cit_alpha"]);
    expect(
      (
        await reader.readBatchCitations(PROJECT_BETA, BATCH_ALPHA, PARSER_V1)
      ).map((row) => row.id),
    ).toEqual(["cit_beta"]);
  });

  it("excludes the same Project's other batches", async () => {
    await seedAlphaCitation("cit_kept");
    await seedAlphaCitation("cit_other_batch", {
      batchId: "batch_other",
      runId: "run_other_batch",
      parseId: "parse_other_batch",
    });

    expect(
      (
        await reader.readBatchCitations(PROJECT_ALPHA, BATCH_ALPHA, PARSER_V1)
      ).map((row) => row.id),
    ).toEqual(["cit_kept"]);
  });

  it("returns exactly the requested parser version of a multiply-parsed run", async () => {
    // One immutable run with two versioned parses (ADR-005): both versions
    // coexist and each carries its own citation of the same URL.
    await seedAlphaCitation("cit_v1", {
      runId: "run_multi",
      parseId: "parse_v1",
      parserVersion: PARSER_V1,
    });
    await seedAlphaCitation("cit_v2", {
      runId: "run_multi",
      parseId: "parse_v2",
      parserVersion: PARSER_V2,
    });

    expect(
      (
        await reader.readBatchCitations(PROJECT_ALPHA, BATCH_ALPHA, PARSER_V1)
      ).map((row) => row.id),
    ).toEqual(["cit_v1"]);
    // v2 is neither collapsed into v1 nor treated as the current version.
    expect(
      (
        await reader.readBatchCitations(PROJECT_ALPHA, BATCH_ALPHA, PARSER_V2)
      ).map((row) => row.id),
    ).toEqual(["cit_v2"]);
  });

  it("preserves every stored citation field exactly, including opaque evidence and NULLs", async () => {
    await seedAlphaCitation("cit_full", {
      runId: "run_full",
      parseId: "parse_full",
      rawUrl: "https://Example.COM/Article?utm_source=chatgpt&page=2#Results",
      // Deliberately NOT a normalization of the raw URL: the reader must hand
      // back whatever was stored, never what a canonicalizer would compute.
      normalizedUrl: "https://example.com/Article?page=2",
      domain: "Example.COM",
      title: "  A cited title\nwith a newline  ",
      position: 7,
      sourceOwnership: "CONTROLLED_PUBLICATION",
      matchedReceipt: true,
      repeatIndex: 3,
    });
    // A citation with every optional column NULL and the explicit UNKNOWN
    // ownership: NULL and UNKNOWN are stored facts that must not become empty
    // strings, zeros, or a default.
    await seedAlphaCitation("cit_null", {
      runId: "run_null",
      parseId: "parse_null",
      title: null,
      position: null,
      sourceOwnership: "UNKNOWN",
      matchedReceipt: false,
    });

    const rows = await reader.readBatchCitations(
      PROJECT_ALPHA,
      BATCH_ALPHA,
      PARSER_V1,
    );
    const fullStored = await selectCitation("cit_full");
    const nullStored = await selectCitation("cit_null");
    if (!fullStored || !nullStored) {
      throw new Error("expected both stored citations to exist");
    }

    const fullRow = requireRow(
      rows.find((row) => row.id === "cit_full"),
      "cit_full",
    );
    const nullRow = requireRow(
      rows.find((row) => row.id === "cit_null"),
      "cit_null",
    );

    // Every stored column is returned verbatim and only the parent run id is
    // added: no derived metric, fraction, cohort label, URL rewrite, ownership
    // classification, or receipt match.
    expect(fullRow).toEqual({ ...fullStored, runId: "run_full" });
    expect(nullRow).toEqual({ ...nullStored, runId: "run_null" });
    expect(Object.keys(fullRow)).toEqual([...Object.keys(fullStored), "runId"]);
    expect(fullRow.rawUrl).toBe(
      "https://Example.COM/Article?utm_source=chatgpt&page=2#Results",
    );
    expect(fullRow.normalizedUrl).toBe("https://example.com/Article?page=2");
    expect(fullRow.domain).toBe("Example.COM");
    expect(fullRow.title).toBe("  A cited title\nwith a newline  ");
    expect(fullRow.position).toBe(7);
    expect(fullRow.sourceOwnership).toBe("CONTROLLED_PUBLICATION");
    expect(fullRow.matchedPublicationReceiptId).toBe("receipt_alpha");
    expect(fullRow.parseId).toBe("parse_full");
    expect(nullRow.title).toBeNull();
    expect(nullRow.position).toBeNull();
    expect(nullRow.matchedPublicationReceiptId).toBeNull();
    expect(nullRow.sourceOwnership).toBe("UNKNOWN");
    // No raw run payload field leaks into the citation evidence.
    expect(Object.keys(fullRow)).not.toContain("rawAnswer");
    expect(Object.keys(fullRow)).not.toContain("rawResponse");
  });

  it("returns an empty list when a valid three-part selector matches nothing", async () => {
    await seedAlphaCitation("cit_alpha");

    // A stored sibling slice proves each empty answer is about the selector, not
    // about an unreadable or empty table.
    expect(
      await reader.readBatchCitations(
        PROJECT_ALPHA,
        "batch_missing",
        PARSER_V1,
      ),
    ).toEqual([]);
    expect(
      await reader.readBatchCitations(
        PROJECT_ALPHA,
        BATCH_ALPHA,
        "parser-missing",
      ),
    ).toEqual([]);
    expect(
      await reader.readBatchCitations("proj_missing", BATCH_ALPHA, PARSER_V1),
    ).toEqual([]);
  });

  it("reads without modifying any stored citation, parse, run, or receipt row", async () => {
    await seedAlphaCitation("cit_alpha", {
      runId: "run_shared",
      parseId: "parse_shared",
      matchedReceipt: true,
    });
    await seedAlphaCitation("cit_alpha_v2", {
      runId: "run_shared",
      parseId: "parse_shared_v2",
      parserVersion: PARSER_V2,
    });
    await seedCitation({
      citationId: "cit_beta",
      projectId: PROJECT_BETA,
      batchId: "batch_beta",
      parserVersion: PARSER_V1,
      runId: "run_beta",
      parseId: "parse_beta",
      matchedReceipt: true,
    });
    const citationsBefore = await selectAllCitations();
    const parsesBefore = await testDb.select().from(geoObservationParses);
    const runsBefore = await testDb.select().from(geoObservationRuns);
    const receiptsBefore = await testDb.select().from(publicationReceipts);

    await reader.readBatchCitations(PROJECT_ALPHA, BATCH_ALPHA, PARSER_V1);
    await reader.readBatchCitations(PROJECT_ALPHA, BATCH_ALPHA, PARSER_V2);
    await reader.readBatchCitations(PROJECT_ALPHA, "batch_missing", PARSER_V1);

    // Raw observation rows are immutable and the reader has no citation, parse,
    // run, or receipt write path.
    expect(await selectAllCitations()).toEqual(citationsBefore);
    expect(await testDb.select().from(geoObservationParses)).toEqual(
      parsesBefore,
    );
    expect(await testDb.select().from(geoObservationRuns)).toEqual(runsBefore);
    expect(await testDb.select().from(publicationReceipts)).toEqual(
      receiptsBefore,
    );
  });

  it("propagates a database failure instead of returning an empty list", async () => {
    await seedAlphaCitation("cit_alpha");
    await renameTable("geo_citations", "geo_citations_hidden");
    try {
      // The slice exists and was just readable; only storage is broken. An empty
      // list here would report a failed read as "nothing matched", so the
      // driver's own "no such table" reason has to reach the caller.
      let reason = "";
      try {
        await reader.readBatchCitations(PROJECT_ALPHA, BATCH_ALPHA, PARSER_V1);
      } catch (error) {
        reason = failureMessages(error);
      }

      expect(reason).toMatch(/no such table: geo_citations/i);
    } finally {
      await renameTable("geo_citations_hidden", "geo_citations");
    }
  });
});

describe("GeoCitationBatchReaderRepository selector validation", () => {
  const SELECTOR_VALUES = {
    projectId: PROJECT_ALPHA,
    batchId: BATCH_ALPHA,
    parserVersion: PARSER_V1,
  };

  const SELECTOR_CALLS = [
    {
      field: "projectId",
      read: (value: string) =>
        reader.readBatchCitations(value, BATCH_ALPHA, PARSER_V1),
    },
    {
      field: "batchId",
      read: (value: string) =>
        reader.readBatchCitations(PROJECT_ALPHA, value, PARSER_V1),
    },
    {
      field: "parserVersion",
      read: (value: string) =>
        reader.readBatchCitations(PROJECT_ALPHA, BATCH_ALPHA, value),
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

    expect(error.name).toBe("GeoCitationBatchReaderError");
    expect(error.field).toBe(field);
    expect(error.message).toMatch(new RegExp(field));
  });

  /**
   * Seed a decoy that matches all three selectors and reject an empty `field`.
   * The decoy is deliberately readable: if the empty value reached the SELECT
   * it would be returned, so the rejection proves no query ran.
   */
  async function expectEmptySelectorRejected(
    field: keyof typeof SELECTOR_VALUES,
    values: typeof SELECTOR_VALUES,
  ) {
    await seedCitation({
      citationId: `cit_decoy_${field}`,
      runId: `run_decoy_${field}`,
      parseId: `parse_decoy_${field}`,
      ...values,
    });

    const error = await captureReaderError(() =>
      reader.readBatchCitations(
        values.projectId,
        values.batchId,
        values.parserVersion,
      ),
    );

    expect(error.field).toBe(field);
    expect(error.message).toBe(
      `GEO citation batch reader: ${field} must be a non-empty string.`,
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

  it("rejects an empty parserVersion before reading any stored row", async () => {
    await expectEmptySelectorRejected("parserVersion", {
      ...SELECTOR_VALUES,
      parserVersion: "",
    });
  });
});
