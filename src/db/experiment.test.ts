/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole experiments storage contract (valid persistence with the full field set and NULL optional relations/Project ownership/same-Project Topic+Opportunity+ReleaseBundle enforcement/activation-policy enum rejection/required columns/four JSON documents/cascade deletes/exact column, index and FK shape from the shipped 0074 DDL); splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { experiments } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// Project-scoped Experiment table (D1 0074), which creates `experiments` with
// its Project FK, the same-Project Topic/Opportunity/ReleaseBundle composite
// FKs, the activation-policy CHECK and the four JSON-document CHECKs. The spec
// creates the minimal parent tables (each with the (project_id, id) unique
// target the composite FKs require) and applies the DDL in order. Foreign keys
// are ON so same-Project ownership is exercised against the shipped DDL — not an
// application convention.
//
// Invariants under test:
//   - A valid same-Project experiment persists with the full TASK field set
//     (stable id, project_id, required topic_id, optional opportunity_id/
//     release_bundle_id, title, hypothesis, opaque status, activation_policy,
//     nullable activation_at, four JSON documents, append-only created_at).
//   - Optional relations and activation_at are nullable, and a NULL optional
//     relation leaves its composite FK unenforced.
//   - Every relation is same-Project: a Topic/Opportunity/ReleaseBundle on
//     another Project is rejected by the composite FK.
//   - activation_policy is the one authoritative enum: both source-defined
//     values persist, any other value is rejected by the named CHECK.
//   - Each of the four JSON documents is validated at the DB boundary and a
//     valid document is stored verbatim; status stays opaque.
//   - Direct required columns are NOT NULL.
//   - Deleting the owning Project or a referenced Topic/Opportunity/
//     ReleaseBundle cascades the experiment away.
//   - The table ships ONLY the direct field set: no updated_at, no snapshot/
//     activation-runtime/credential column and no business unique index.

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

const statementParts = (ddl: string) =>
  ddl
    .split(DRIZZLE_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

async function applyMigrationFile(target: Client, file: string) {
  for (const statement of statementParts(readFileSync(file, "utf8"))) {
    await target.execute(statement);
  }
}

const MIGRATION_FILE = "drizzle/0074_experiments.sql";

const EXPERIMENT_COLUMNS = `(id, project_id, topic_id, opportunity_id,
  release_bundle_id, title, hypothesis, status, activation_policy, activation_at,
  target_keyword_refs_json, target_prompt_refs_json, target_surface_refs_json,
  recheck_policy_json)`;

let client: Client;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete');`,
  );
  // Minimal stand-ins for the accepted parent tables: only the columns the
  // composite FKs need, each with the (project_id, id) unique target they
  // require. This spec exercises `experiments`, not those tables.
  for (const parent of [
    "search_topics",
    "search_growth_opportunities",
    "release_bundles",
  ]) {
    await client.execute(
      `CREATE TABLE ${parent} (
         id text PRIMARY KEY,
         project_id text NOT NULL,
         UNIQUE (project_id, id)
       );`,
    );
    await client.execute(
      `INSERT INTO ${parent} (id, project_id)
       VALUES ('${parent}_alpha', 'proj_alpha'),
              ('${parent}_beta', 'proj_beta'),
              ('${parent}_delete', 'proj_delete');`,
    );
  }
  await applyMigrationFile(client, MIGRATION_FILE);
});

afterAll(() => {
  client.close();
});

// No per-test teardown: rows are keyed by unique experiment ids and cascade
// tests use their own Project/parent rows, so tests never depend on order.

type ExperimentSeed = {
  id: string;
  projectId?: string;
  topicId?: string;
  opportunityId?: string | null;
  releaseBundleId?: string | null;
  title?: string;
  hypothesis?: string;
  status?: string;
  activationPolicy?: string;
  activationAt?: string | null;
  targetKeywordRefsJson?: string;
  targetPromptRefsJson?: string;
  targetSurfaceRefsJson?: string;
  recheckPolicyJson?: string;
};

const nullable = (value: string | null | undefined) =>
  value === null || value === undefined ? "NULL" : `'${value}'`;

async function insertExperiment({
  id,
  projectId = "proj_alpha",
  topicId = "search_topics_alpha",
  opportunityId = null,
  releaseBundleId = null,
  title = "Canonical refresh experiment",
  hypothesis = "Refreshing the canonical page improves citations.",
  status = "PLANNED",
  activationPolicy = "FIRST_REQUIRED_PUBLIC",
  activationAt = null,
  targetKeywordRefsJson = `{"note":"kw_${id}"}`,
  targetPromptRefsJson = `{"note":"prompt_${id}"}`,
  targetSurfaceRefsJson = `{"note":"surface_${id}"}`,
  recheckPolicyJson = `{"note":"recheck_${id}"}`,
}: ExperimentSeed) {
  await client.execute(
    `INSERT INTO experiments ${EXPERIMENT_COLUMNS}
     VALUES ('${id}', '${projectId}', '${topicId}',
             ${nullable(opportunityId)}, ${nullable(releaseBundleId)},
             '${title}', '${hypothesis}', '${status}', '${activationPolicy}',
             ${nullable(activationAt)}, '${targetKeywordRefsJson}',
             '${targetPromptRefsJson}', '${targetSurfaceRefsJson}',
             '${recheckPolicyJson}')`,
  );
}

async function rowsFor(id: string) {
  return db.select().from(experiments).where(eq(experiments.id, id));
}

async function columnNames(tableName: string) {
  const tableInfo = await client.execute(
    `SELECT name FROM pragma_table_info('${tableName}')`,
  );
  return sort(
    tableInfo.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string"),
    (a, b) => a.localeCompare(b),
  );
}

describe("experiments storage contract", () => {
  it("persists a valid same-Project experiment with the full field set and NULL optional relations", async () => {
    await insertExperiment({ id: "exp_alpha_1" });

    const rows = await rowsFor("exp_alpha_1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "exp_alpha_1",
      projectId: "proj_alpha",
      topicId: "search_topics_alpha",
      title: "Canonical refresh experiment",
      hypothesis: "Refreshing the canonical page improves citations.",
      status: "PLANNED",
      activationPolicy: "FIRST_REQUIRED_PUBLIC",
      targetKeywordRefsJson: '{"note":"kw_exp_alpha_1"}',
      targetPromptRefsJson: '{"note":"prompt_exp_alpha_1"}',
      targetSurfaceRefsJson: '{"note":"surface_exp_alpha_1"}',
      recheckPolicyJson: '{"note":"recheck_exp_alpha_1"}',
    });
    expect(rows[0]?.opportunityId).toBeNull();
    expect(rows[0]?.releaseBundleId).toBeNull();
    expect(rows[0]?.activationAt).toBeNull();
    expect(rows[0]?.createdAt).toBeTruthy();
  });

  it("persists the optional same-Project Opportunity and ReleaseBundle relations", async () => {
    await insertExperiment({
      id: "exp_with_relations",
      opportunityId: "search_growth_opportunities_alpha",
      releaseBundleId: "release_bundles_alpha",
      activationAt: "2026-09-10T05:00:00.000Z",
    });

    const rows = await rowsFor("exp_with_relations");
    expect(rows[0]?.opportunityId).toBe("search_growth_opportunities_alpha");
    expect(rows[0]?.releaseBundleId).toBe("release_bundles_alpha");
    expect(rows[0]?.activationAt).toBe("2026-09-10T05:00:00.000Z");
  });

  it("rejects an experiment whose Topic, Opportunity or ReleaseBundle belongs to another Project", async () => {
    // Each beta parent lives on proj_beta, so proj_alpha cannot reference it.
    await expect(
      insertExperiment({
        id: "exp_cross_topic",
        topicId: "search_topics_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertExperiment({
        id: "exp_cross_opportunity",
        opportunityId: "search_growth_opportunities_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await expect(
      insertExperiment({
        id: "exp_cross_release",
        releaseBundleId: "release_bundles_beta",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // A dangling Project is rejected by the Project FK.
    await expect(
      insertExperiment({
        id: "exp_dangling_project",
        projectId: "proj_missing",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("persists every source-defined activation policy and rejects others", async () => {
    const policies = [
      "FIRST_REQUIRED_PUBLIC",
      "ALL_REQUIRED_TERMINAL",
    ] as const;
    for (const [index, policy] of policies.entries()) {
      const id = `exp_policy_${index}`;
      await insertExperiment({ id, activationPolicy: policy });
      expect((await rowsFor(id))[0]?.activationPolicy).toBe(policy);
    }

    for (const [index, policy] of [
      "WEBSITE_FIRST",
      "first_required_public",
      "",
    ].entries()) {
      await expect(
        insertExperiment({
          id: `exp_bad_policy_${index}`,
          activationPolicy: policy,
        }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("keeps status opaque while validating every JSON document", async () => {
    await insertExperiment({
      id: "exp_opaque_status",
      status: "WHATEVER_LABEL",
    });
    expect((await rowsFor("exp_opaque_status"))[0]?.status).toBe(
      "WHATEVER_LABEL",
    );

    const badDocuments: Partial<ExperimentSeed>[] = [
      { targetKeywordRefsJson: "{not json" },
      { targetPromptRefsJson: "{not json" },
      { targetSurfaceRefsJson: "{not json" },
      { recheckPolicyJson: "{not json" },
    ];
    for (const [index, bad] of badDocuments.entries()) {
      await expect(
        insertExperiment({ id: `exp_bad_json_${index}`, ...bad }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }

    const documents = {
      targetKeywordRefsJson: '{"keywordIds":["kw_alpha"]}',
      targetPromptRefsJson: '{"promptIds":["prompt_alpha"]}',
      targetSurfaceRefsJson: '{"surfaces":["MODEL_API_SEARCH"]}',
      recheckPolicyJson: '{"windows":["D7","D14","D30"]}',
    };
    await insertExperiment({ id: "exp_good_json", ...documents });
    expect((await rowsFor("exp_good_json"))[0]).toMatchObject(documents);
  });

  it("requires the direct columns (NOT NULL)", async () => {
    const insertWith = (values: string) =>
      client.execute(
        `INSERT INTO experiments (id, project_id, topic_id, opportunity_id,
           release_bundle_id, title, hypothesis, status, activation_policy,
           activation_at, target_keyword_refs_json, target_prompt_refs_json,
           target_surface_refs_json, recheck_policy_json)
         VALUES (${values})`,
      );

    const base = [
      "'x'",
      "'proj_alpha'",
      "'search_topics_alpha'",
      "NULL",
      "NULL",
      "'t'",
      "'h'",
      "'s'",
      "'FIRST_REQUIRED_PUBLIC'",
      "NULL",
      "'{}'",
      "'{}'",
      "'{}'",
      "'{}'",
    ];
    const requiredIndexes = [1, 2, 5, 6, 7, 8, 10, 11, 12, 13];
    for (const index of requiredIndexes) {
      const values = [...base];
      values[index] = "NULL";
      await expect(insertWith(values.join(", "))).rejects.toThrow(
        /NOT NULL constraint failed/i,
      );
    }
  });

  it("cascades experiments away when the owning Project or a referenced parent is deleted", async () => {
    await insertExperiment({
      id: "exp_project_delete",
      projectId: "proj_delete",
      topicId: "search_topics_delete",
    });
    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");
    expect(await rowsFor("exp_project_delete")).toHaveLength(0);

    await insertExperiment({ id: "exp_topic_delete" });
    await client.execute(
      "DELETE FROM search_topics WHERE id = 'search_topics_alpha'",
    );
    expect(await rowsFor("exp_topic_delete")).toHaveLength(0);

    await insertExperiment({
      id: "exp_opportunity_delete",
      topicId: "search_topics_beta",
      projectId: "proj_beta",
      opportunityId: "search_growth_opportunities_beta",
    });
    await client.execute(
      "DELETE FROM search_growth_opportunities WHERE id = 'search_growth_opportunities_beta'",
    );
    expect(await rowsFor("exp_opportunity_delete")).toHaveLength(0);

    await insertExperiment({
      id: "exp_release_delete",
      topicId: "search_topics_beta",
      projectId: "proj_beta",
      releaseBundleId: "release_bundles_beta",
    });
    await client.execute(
      "DELETE FROM release_bundles WHERE id = 'release_bundles_beta'",
    );
    expect(await rowsFor("exp_release_delete")).toHaveLength(0);
  });

  it("ships ONLY the direct field set: no updated_at / snapshot / activation-runtime column", async () => {
    expect(await columnNames("experiments")).toEqual([
      "activation_at",
      "activation_policy",
      "created_at",
      "hypothesis",
      "id",
      "opportunity_id",
      "project_id",
      "recheck_policy_json",
      "release_bundle_id",
      "status",
      "target_keyword_refs_json",
      "target_prompt_refs_json",
      "target_surface_refs_json",
      "title",
      "topic_id",
    ]);
  });

  it("has exactly four foreign keys (Project + Topic + Opportunity + ReleaseBundle)", async () => {
    const fks = await client.execute(
      "SELECT * FROM pragma_foreign_key_list('experiments')",
    );
    const targets = sort(
      [
        ...new Set(
          fks.rows
            .map((row) => row.table)
            .filter((table): table is string => typeof table === "string"),
        ),
      ],
      (a, b) => a.localeCompare(b),
    );
    expect(targets).toEqual([
      "projects",
      "release_bundles",
      "search_growth_opportunities",
      "search_topics",
    ]);
  });

  it("adds no business unique index", async () => {
    // origin 'c' = explicitly created; the text PRIMARY KEY's implicit
    // sqlite_autoindex (origin 'pk') is not a business rule.
    const indexes = await client.execute(
      "SELECT name, \"unique\" FROM pragma_index_list('experiments') WHERE origin = 'c'",
    );
    expect(indexes.rows).toHaveLength(4);
    for (const row of indexes.rows) {
      expect(Number(row.unique)).toBe(0);
    }
  });
});
