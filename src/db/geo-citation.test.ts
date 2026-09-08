/* eslint-disable max-lines -- one migration-backed spec covers the whole geo_citations storage contract (valid/same-Project/cross-Project/mismatched-project/optional-parent/delete/enum/append-only/Parse-version isolation) through the shipped 0054 DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  geoCitations,
  geoObservationParses,
  geoObservationRuns,
  searchPrompts,
  searchTopics,
} from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// normalized citation table (0054) and its parents: market profile 0045, topic
// 0046, tracked entity 0048 (needed by the 0052/0053 mention rebuild chain),
// prompt 0049, raw run 0050, immutable versioned parse 0051, the mention table
// 0052, and the 0053 data-preserving rebuild that gives geo_observation_parses
// its Project key and the unique (project_id, id) target the citation composite
// FK references. Foreign keys are ON so the composite same-Project parse FK,
// its cascades and the citation storage contract are exercised against the
// shipped DDL.
//
// Invariants: a valid §7 citation persists with the full direct field set
// (raw/normalized URL, domain, title, position, source ownership and the
// optional publication-receipt reference) and the optional fields store NULL
// when omitted; the required identity/ownership columns are enforced; a
// citation whose parse does not exist is rejected by the DB; a citation binds
// to a same-Project concrete Parse — cross-Project parses and explicit Project
// mismatches are rejected by the composite FK; citations stay attached to their
// source Parse across v1/v2 (Parse-version isolation — never a current pointer)
// and are cascaded away only when their own parse/run/project is deleted; every
// V1.0 source-ownership enum value round-trips; and the schema is append-only
// with ONLY the direct citation fields plus the explicit Project ownership key.

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

const statementParts = (ddl: string) =>
  ddl
    .split(DRIZZLE_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

async function applyMigrationFiles(target: Client, files: string[]) {
  for (const file of files) {
    for (const statement of statementParts(readFileSync(file, "utf8"))) {
      await target.execute(statement);
    }
  }
}

const BASE_MIGRATION_FILES = [
  "drizzle/0045_search_market_profiles.sql",
  "drizzle/0046_search_topics.sql",
  "drizzle/0048_ordinary_legion.sql",
  "drizzle/0049_gigantic_johnny_blaze.sql",
  "drizzle/0050_dusty_stardust.sql",
  "drizzle/0051_cuddly_matthew_murdock.sql",
];

let client: Client;
let db: ReturnType<typeof drizzle>;

type NewParse = typeof geoObservationParses.$inferInsert;
type NewCitation = typeof geoCitations.$inferInsert;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete');`,
  );
  await applyMigrationFiles(client, [
    ...BASE_MIGRATION_FILES,
    "drizzle/0052_cute_red_shift.sql",
    "drizzle/0053_shocking_rhodey.sql",
    "drizzle/0054_optimal_magik.sql",
  ]);
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  // Child-first teardown: citations reference parses, parses reference runs,
  // runs reference prompts, prompts reference topics.
  await db.delete(geoCitations);
  await db.delete(geoObservationParses);
  await db.delete(geoObservationRuns);
  await db.delete(searchPrompts);
  await db.delete(searchTopics);
});

async function seedTopic(id: string, projectId: string) {
  await db.insert(searchTopics).values({
    id,
    projectId,
    canonicalName: `Topic ${id}`,
    locale: "en",
    status: "ACTIVE",
  });
}

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
    projectId: ALPHA_RUN.projectId,
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

async function insertCitation(
  id: string,
  projectId: string,
  parseId: string,
  overrides: Partial<NewCitation> = {},
) {
  await db.insert(geoCitations).values({
    id,
    projectId,
    parseId,
    rawUrl: `https://example.com/${id}?utm_source=search`,
    normalizedUrl: `https://example.com/${id}`,
    domain: "example.com",
    sourceOwnership: "UNKNOWN",
    ...overrides,
  });
}

async function citationIdsForParse(parseId: string) {
  const rows = await db
    .select({ id: geoCitations.id })
    .from(geoCitations)
    .where(eq(geoCitations.parseId, parseId));
  return sort(
    rows.map((row) => row.id),
    (a, b) => a.localeCompare(b),
  );
}

describe("geo_citations storage contract", () => {
  it("persists a valid citation with the full direct V1.0 field set", async () => {
    await seedRun();
    await insertParse("parse_alpha_v1");
    // The full §7 direct field set: raw URL exactly as cited, the reconciled
    // normalized URL/domain identity fields, optional title/position, an
    // OWNED_DOMAIN source-ownership fact and a matched publication receipt
    // reference. The URL/receipt fixtures are stored exactly as handed over —
    // no normalization/matching runs here.
    await insertCitation("citation_alpha_1", "proj_alpha", "parse_alpha_v1", {
      title: "Example resource title",
      position: 1,
      sourceOwnership: "OWNED_DOMAIN",
      matchedPublicationReceiptId: "receipt_alpha_1",
    });

    const rows = await db
      .select()
      .from(geoCitations)
      .where(eq(geoCitations.parseId, "parse_alpha_v1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "citation_alpha_1",
      projectId: "proj_alpha",
      parseId: "parse_alpha_v1",
      rawUrl: "https://example.com/citation_alpha_1?utm_source=search",
      normalizedUrl: "https://example.com/citation_alpha_1",
      domain: "example.com",
      title: "Example resource title",
      position: 1,
      sourceOwnership: "OWNED_DOMAIN",
      matchedPublicationReceiptId: "receipt_alpha_1",
    });
    expect(rows[0].createdAt).toBeTruthy();
  });

  it("stores the optional direct fields as NULL when a citation omits them", async () => {
    await seedRun();
    await insertParse("parse_alpha_v1");
    // Raw insert omits title / position / matched_publication_receipt_id so the
    // DB NULL defaults apply for a bare citation fact.
    await client.execute(
      `INSERT INTO geo_citations
         (id, project_id, parse_id, raw_url, normalized_url, domain,
          source_ownership)
       VALUES ('citation_plain', 'proj_alpha', 'parse_alpha_v1',
               'https://example.com/plain', 'https://example.com/plain',
               'example.com', 'UNKNOWN')`,
    );

    const rows = await db
      .select()
      .from(geoCitations)
      .where(eq(geoCitations.id, "citation_plain"));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBeNull();
    expect(rows[0].position).toBeNull();
    expect(rows[0].matchedPublicationReceiptId).toBeNull();
    expect(rows[0].sourceOwnership).toBe("UNKNOWN");
  });

  it("requires the identity/ownership columns (NOT NULL)", async () => {
    await seedRun();
    await insertParse("parse_alpha_v1");

    // source_ownership has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO geo_citations
           (id, project_id, parse_id, raw_url, normalized_url, domain)
         VALUES ('citation_no_ownership', 'proj_alpha', 'parse_alpha_v1',
                 'https://example.com/x', 'https://example.com/x',
                 'example.com')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // domain is a required identity field.
    await expect(
      client.execute(
        `INSERT INTO geo_citations
           (id, project_id, parse_id, raw_url, normalized_url, source_ownership)
         VALUES ('citation_no_domain', 'proj_alpha', 'parse_alpha_v1',
                 'https://example.com/y', 'https://example.com/y',
                 'UNKNOWN')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("allows a citation whose Parse shares the same Project", async () => {
    await seedRun({
      id: "run_beta_1",
      projectId: "proj_beta",
      promptId: "prompt_beta",
    });
    await insertParse("parse_beta_v1", {
      projectId: "proj_beta",
      runId: "run_beta_1",
    });
    await insertCitation("citation_beta_1", "proj_beta", "parse_beta_v1", {
      sourceOwnership: "CONTROLLED_PUBLICATION",
    });

    const rows = await db
      .select()
      .from(geoCitations)
      .where(eq(geoCitations.id, "citation_beta_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "citation_beta_1",
      projectId: "proj_beta",
      parseId: "parse_beta_v1",
    });
  });

  it("rejects a citation whose source parse does not exist", async () => {
    await seedRun();
    await insertParse("parse_alpha_v1");

    // parse_id is a hard composite FK to geo_observation_parses(project_id, id):
    // a dangling citation referencing no parse row is rejected by the DB. Raw SQL
    // is used (as in the other FK-rejection tests) so the assertion sees the
    // clean libsql error.
    await expect(
      client.execute(
        `INSERT INTO geo_citations
           (id, project_id, parse_id, raw_url, normalized_url, domain,
            source_ownership)
         VALUES ('citation_orphan_parse', 'proj_alpha', 'parse_missing',
                 'https://example.com/z', 'https://example.com/z',
                 'example.com', 'UNKNOWN')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a citation that binds a Project-B parse into a Project-A row (cross-Project)", async () => {
    await seedRun();
    await insertParse("parse_alpha_v1");
    await seedRun({
      id: "run_beta_1",
      projectId: "proj_beta",
      promptId: "prompt_beta",
    });
    await insertParse("parse_beta_v1", {
      projectId: "proj_beta",
      runId: "run_beta_1",
    });

    // parse_beta_v1 lives beneath proj_beta while the citation names proj_alpha
    // as its own project. The composite FK (project_id, parse_id) ->
    // geo_observation_parses(project_id, id) has no matching parent row, so the
    // DB rejects the cross-Project citation.
    await expect(
      client.execute(
        `INSERT INTO geo_citations
           (id, project_id, parse_id, raw_url, normalized_url, domain,
            source_ownership)
         VALUES ('citation_cross_project', 'proj_alpha', 'parse_beta_v1',
                 'https://example.com/c', 'https://example.com/c',
                 'example.com', 'UNKNOWN')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects an explicit citation Project mismatch (citation project_id differs from its parse Project)", async () => {
    await seedRun();
    await insertParse("parse_alpha_v1");

    // The parse row lives on proj_alpha, but the citation names proj_beta as its
    // own project. Neither the project FK nor the composite (project_id, parse_id)
    // FK has a matching parent row under proj_beta, so the DB rejects the
    // explicit mismatch.
    await expect(
      client.execute(
        `INSERT INTO geo_citations
           (id, project_id, parse_id, raw_url, normalized_url, domain,
            source_ownership)
         VALUES ('citation_wrong_project', 'proj_beta', 'parse_alpha_v1',
                 'https://example.com/w', 'https://example.com/w',
                 'example.com', 'UNKNOWN')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("round-trips every V1.0 source-ownership enum value", async () => {
    await seedRun();
    await insertParse("parse_alpha_v1");
    const ownershipValues = [
      "OWNED_DOMAIN",
      "CONTROLLED_PUBLICATION",
      "EARNED_THIRD_PARTY",
      "COMPETITOR",
      "UNKNOWN",
    ] as const;

    for (const [index, sourceOwnership] of ownershipValues.entries()) {
      await client.execute(
        `INSERT INTO geo_citations
           (id, project_id, parse_id, raw_url, normalized_url, domain,
            source_ownership)
         VALUES ('citation_enum_${index}', 'proj_alpha', 'parse_alpha_v1',
                 'https://example.com/e${index}', 'https://example.com/e${index}',
                 'example.com', '${sourceOwnership}')`,
      );
    }

    const rows = await db
      .select()
      .from(geoCitations)
      .where(eq(geoCitations.parseId, "parse_alpha_v1"));
    const stored = sort(
      rows.map((row) => row.sourceOwnership),
      (a, b) => a.localeCompare(b),
    );
    expect(stored).toEqual([
      "COMPETITOR",
      "CONTROLLED_PUBLICATION",
      "EARNED_THIRD_PARTY",
      "OWNED_DOMAIN",
      "UNKNOWN",
    ]);
  });

  it("keeps citations attached to their source Parse (v1/v2 isolated from any current pointer)", async () => {
    await seedRun();
    // v1 and v2 parses of the same raw run coexist (ADR-005); v2 is the
    // current marker. Citations must bind to the concrete Parse that extracted
    // them — never to a mutable current pointer.
    await insertParse("parse_alpha_v1", {
      parserVersion: "1.0.0",
      parseStatus: "SUCCESS",
    });
    await insertParse("parse_alpha_v2", {
      parserVersion: "2.0.0",
      parseStatus: "SUCCESS",
      isCurrent: true,
    });
    const runBefore = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, ALPHA_RUN.id));

    await insertCitation("citation_v1_a", "proj_alpha", "parse_alpha_v1", {
      position: 0,
    });
    await insertCitation("citation_v1_b", "proj_alpha", "parse_alpha_v1", {
      position: 1,
    });
    await insertCitation("citation_v2_a", "proj_alpha", "parse_alpha_v2", {
      title: "Second version citation",
    });

    // v1's citations stay on v1 and are never visible under v2, even though v2
    // is the current-marked parse of the same run.
    expect(await citationIdsForParse("parse_alpha_v1")).toEqual([
      "citation_v1_a",
      "citation_v1_b",
    ]);
    expect(await citationIdsForParse("parse_alpha_v2")).toEqual([
      "citation_v2_a",
    ]);

    // The raw run row is byte-identical while citation rows exist on its parses
    // (21_TEST_ACCEPTANCE_PLAN.md §6 — citation writes never touch the raw run).
    const runAfter = await db
      .select()
      .from(geoObservationRuns)
      .where(eq(geoObservationRuns.id, ALPHA_RUN.id));
    expect(runAfter).toEqual(runBefore);
  });

  it("cascades a parse's citations away only when that parse version is deleted", async () => {
    await seedRun();
    await insertParse("parse_alpha_v1", {
      parserVersion: "1.0.0",
      parseStatus: "SUCCESS",
    });
    await insertParse("parse_alpha_v2", {
      parserVersion: "2.0.0",
      parseStatus: "SUCCESS",
      isCurrent: true,
    });
    await insertCitation("citation_v1_a", "proj_alpha", "parse_alpha_v1");
    await insertCitation("citation_v2_a", "proj_alpha", "parse_alpha_v2");

    // Deleting the v1 parse (e.g. a parser-version cleanup) removes only v1's
    // citations; the sibling v2 parse and its citations remain untouched.
    await client.execute(
      "DELETE FROM geo_observation_parses WHERE id = 'parse_alpha_v1'",
    );

    expect(await citationIdsForParse("parse_alpha_v1")).toEqual([]);
    expect(await citationIdsForParse("parse_alpha_v2")).toEqual([
      "citation_v2_a",
    ]);
  });

  it("cascades citations away when their whole project is deleted", async () => {
    await seedRun({
      id: "run_delete",
      projectId: "proj_delete",
      promptId: "prompt_proj_delete",
    });
    await insertParse("parse_delete_v1", {
      runId: "run_delete",
      projectId: "proj_delete",
    });
    await insertCitation("citation_delete_1", "proj_delete", "parse_delete_v1");

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    expect(await citationIdsForParse("parse_delete_v1")).toEqual([]);
    const parses = await db
      .select()
      .from(geoObservationParses)
      .where(eq(geoObservationParses.runId, "run_delete"));
    expect(parses).toHaveLength(0);
  });

  it("is append-only by schema shape and ships ONLY the direct citation fields plus the Project key", async () => {
    const tableInfo = await client.execute(
      "SELECT name FROM pragma_table_info('geo_citations')",
    );
    const columns = sort(
      tableInfo.rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string"),
      (a, b) => a.localeCompare(b),
    );

    // The exact §7/TASK field list (stable id, project_id, parse_id, raw_url,
    // normalized_url, domain, title, position, source_ownership,
    // matched_publication_receipt_id) and the append-only created_at system
    // timestamp. No updated_at, no run_id/current-pointer column, no parser
    // runtime, no parser-output JSON/relationship payload and no source_type/
    // safe_url_status reference-only context columns.
    expect(columns).toEqual([
      "created_at",
      "domain",
      "id",
      "matched_publication_receipt_id",
      "normalized_url",
      "parse_id",
      "position",
      "project_id",
      "raw_url",
      "source_ownership",
      "title",
    ]);
  });
});
