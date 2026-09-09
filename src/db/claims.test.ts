/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole claims + claim_source_refs storage contract (valid persistence/enum round-trip/NOT NULL/enum CHECK/dangling-Project rejection/same-Project relation in both directions/duplicate edges/delete cascade/normalized schema shape) through the shipped 0056 + 0057 DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { claimSourceRefs, claims, sourceRefs } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// normalized claim table, its same-Project Claim<->SourceRef relation (0057)
// and the source_refs parent it links to (0056). The spec creates the
// `projects` table directly and applies the 0056 + 0057 DDL. Foreign keys are
// ON so the Project FK, the same-Project composite FKs, the enum CHECKs, the
// duplicate-edge guard and the delete cascades are exercised against the
// shipped DDL — not an application convention.
//
// Invariants under test:
//   - A valid claim persists with the full direct §9/TASK field set (id,
//     project, claim_text, status, nullable verified_by/last_verified_at/
//     expires_at, classification) plus the system timestamps; every ClaimStatus
//     and Claim classification value round-trips; the required
//     claim_text/status/classification columns are enforced; unsupported and
//     case-mismatched status/classification values are rejected by the named
//     CHECKs; a claim whose Project does not exist is rejected by the DB.
//   - A valid same-Project link persists; a link whose claim or source
//     reference belongs to another Project is rejected in EITHER direction by
//     the composite FKs; a link whose claim/source reference is missing is
//     rejected; a duplicate (claim_id, source_ref_id) edge is rejected by the
//     unique index; deleting a claim, a source reference, or a whole Project
//     cascades its links away.
//   - The relation ships ONLY the normalized identity columns plus the
//     append-only created_at (no mutable evidence payload, no JSON array); the
//     claim ships ONLY the direct/reconciled field set plus system timestamps
//     (no allowed_markets/allowed_languages/evidence_type/evidence_ref/
//     source_url/normalized_claim columns).

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

const MIGRATION_FILES = [
  "drizzle/0056_organic_blue_blade.sql",
  "drizzle/0057_cold_marrow.sql",
];

const CLAIM_COLUMN_INSERT = `(id, project_id, claim_text, status, classification)`;
const LINK_COLUMN_INSERT = `(id, project_id, claim_id, source_ref_id)`;

let client: Client;
let db: ReturnType<typeof drizzle>;

type NewClaim = typeof claims.$inferInsert;
type NewSourceRef = typeof sourceRefs.$inferInsert;
type NewClaimSourceRef = typeof claimSourceRefs.$inferInsert;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`CREATE TABLE projects (id text PRIMARY KEY);`);
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete');`,
  );
  await applyMigrationFiles(client, MIGRATION_FILES);
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await db.delete(claimSourceRefs);
  await db.delete(claims);
  await db.delete(sourceRefs);
  await client.execute("DELETE FROM projects");
  await client.execute(
    `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete');`,
  );
});

async function insertClaim(id: string, overrides: Partial<NewClaim> = {}) {
  await db.insert(claims).values({
    id,
    projectId: "proj_alpha",
    claimText: `Claim text ${id}`,
    status: "UNVERIFIED",
    classification: "PUBLIC_MARKETING",
    ...overrides,
  });
}

async function insertSourceRef(
  id: string,
  overrides: Partial<NewSourceRef> = {},
) {
  await db.insert(sourceRefs).values({
    id,
    projectId: "proj_alpha",
    type: "URL",
    ref: "https://example.com/source-page",
    capturedAt: "2026-09-08T04:00:05.000Z",
    ...overrides,
  });
}

async function insertLink(
  id: string,
  overrides: Partial<NewClaimSourceRef> = {},
) {
  await db.insert(claimSourceRefs).values({
    id,
    projectId: "proj_alpha",
    claimId: "claim_alpha_1",
    sourceRefId: "source_ref_alpha_1",
    ...overrides,
  });
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

describe("claims storage contract", () => {
  it("persists a valid claim with the full direct V1.0 field set", async () => {
    await insertClaim("claim_alpha_1", {
      projectId: "proj_alpha",
      claimText: "Example.com is the fastest provider.",
      status: "UNVERIFIED",
      verifiedBy: null,
      lastVerifiedAt: null,
      expiresAt: null,
      classification: "PUBLIC_MARKETING",
    });

    const rows = await db
      .select()
      .from(claims)
      .where(eq(claims.id, "claim_alpha_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "claim_alpha_1",
      projectId: "proj_alpha",
      claimText: "Example.com is the fastest provider.",
      status: "UNVERIFIED",
      verifiedBy: null,
      lastVerifiedAt: null,
      expiresAt: null,
      classification: "PUBLIC_MARKETING",
    });
    // System insert timestamp is set by the storage default.
    expect(rows[0].createdAt).toBeTruthy();
    expect(rows[0].updatedAt).toBeTruthy();
  });

  it("round-trips every ClaimStatus and Claim classification value and the nullable verification fields", async () => {
    const statuses = ["APPROVED", "UNVERIFIED", "EXPIRED", "REJECTED"] as const;
    const classifications = [
      "PUBLIC_MARKETING",
      "INTERNAL",
      "RESTRICTED",
    ] as const;

    // 4 statuses x 3 classifications exercise every enum combination.
    let index = 0;
    for (const status of statuses) {
      for (const classification of classifications) {
        await insertClaim(`claim_enum_${index++}`, {
          status,
          classification,
          verifiedBy: "user_verifier",
          lastVerifiedAt: "2026-09-08T05:00:00.000Z",
          expiresAt: "2026-12-08T05:00:00.000Z",
        });
      }
    }

    const rows = await db
      .select()
      .from(claims)
      .where(eq(claims.projectId, "proj_alpha"));
    expect(rows).toHaveLength(12);
    for (const status of statuses) {
      for (const classification of classifications) {
        const match = rows.filter(
          (row) =>
            row.status === status && row.classification === classification,
        );
        expect(match).toHaveLength(1);
        expect(match[0]).toMatchObject({
          verifiedBy: "user_verifier",
          lastVerifiedAt: "2026-09-08T05:00:00.000Z",
          expiresAt: "2026-12-08T05:00:00.000Z",
        });
      }
    }
  });

  it("requires the direct content columns (NOT NULL)", async () => {
    // claim_text has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO claims ${CLAIM_COLUMN_INSERT}
         VALUES ('claim_no_text', 'proj_alpha', NULL, 'UNVERIFIED',
                 'PUBLIC_MARKETING')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // status has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO claims ${CLAIM_COLUMN_INSERT}
         VALUES ('claim_no_status', 'proj_alpha', 'text', NULL,
                 'PUBLIC_MARKETING')`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);

    // classification has no default and is required.
    await expect(
      client.execute(
        `INSERT INTO claims ${CLAIM_COLUMN_INSERT}
         VALUES ('claim_no_classification', 'proj_alpha', 'text',
                 'UNVERIFIED', NULL)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it("rejects unsupported and case-mismatched status/classification values (CHECK)", async () => {
    for (const [index, status] of [
      // Case-mismatched variants of the approved uppercase values.
      "approved",
      "Unverified",
      "EXPIRED ",
      // Unsupported statuses.
      "VERIFIED",
      "PENDING",
      "NONE",
    ].entries()) {
      await expect(
        client.execute(
          `INSERT INTO claims ${CLAIM_COLUMN_INSERT}
           VALUES ('claim_bad_status_${index}', 'proj_alpha', 'text',
                   '${status}', 'PUBLIC_MARKETING')`,
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }

    for (const [index, classification] of [
      // Case-mismatched variants of the approved uppercase values.
      "public_marketing",
      "Internal",
      "RESTRICTED ",
      // Unsupported classifications.
      "PUBLIC",
      "CONFIDENTIAL",
      "UNKNOWN",
    ].entries()) {
      await expect(
        client.execute(
          `INSERT INTO claims ${CLAIM_COLUMN_INSERT}
           VALUES ('claim_bad_class_${index}', 'proj_alpha', 'text',
                   'UNVERIFIED', '${classification}')`,
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it("rejects a claim whose Project does not exist (dangling Project)", async () => {
    await expect(
      client.execute(
        `INSERT INTO claims ${CLAIM_COLUMN_INSERT}
         VALUES ('claim_orphan_project', 'proj_missing', 'text',
                 'UNVERIFIED', 'PUBLIC_MARKETING')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("ships ONLY the direct/reconciled claim field set", async () => {
    // The exact §9/TASK field list (id, project_id, claim_text, status,
    // verified_by, last_verified_at, expires_at, classification) plus the
    // created_at/updated_at system timestamps. No legacy
    // allowed_markets/allowed_languages/evidence_type/evidence_ref/source_url
    // columns and no JSON-encoded relationship column.
    expect(await columnNames("claims")).toEqual([
      "claim_text",
      "classification",
      "created_at",
      "expires_at",
      "id",
      "last_verified_at",
      "project_id",
      "status",
      "updated_at",
      "verified_by",
    ]);
  });
});

describe("claim_source_refs same-project relation contract", () => {
  it("persists a valid same-Project link between a claim and a source reference", async () => {
    await insertClaim("claim_alpha_1", {
      claimText: "Example.com is the fastest provider.",
      status: "APPROVED",
      classification: "PUBLIC_MARKETING",
    });
    await insertSourceRef("source_ref_alpha_1", {
      type: "URL",
      ref: "https://example.com/source-page",
    });
    await insertLink("link_alpha_1");

    const links = await db
      .select()
      .from(claimSourceRefs)
      .where(eq(claimSourceRefs.id, "link_alpha_1"));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      id: "link_alpha_1",
      projectId: "proj_alpha",
      claimId: "claim_alpha_1",
      sourceRefId: "source_ref_alpha_1",
    });
    expect(links[0].createdAt).toBeTruthy();

    // The claim and source reference keep their own full rows; the link stores
    // only identity (normalized relation, no duplicated evidence payload).
    const claimRows = await db
      .select()
      .from(claims)
      .where(eq(claims.id, "claim_alpha_1"));
    expect(claimRows).toHaveLength(1);
    expect(claimRows[0].claimText).toBe("Example.com is the fastest provider.");
    const sourceRows = await db
      .select()
      .from(sourceRefs)
      .where(eq(sourceRefs.id, "source_ref_alpha_1"));
    expect(sourceRows).toHaveLength(1);
    expect(sourceRows[0].ref).toBe("https://example.com/source-page");
  });

  it("rejects a link whose source reference belongs to another Project", async () => {
    // claim_alpha and the link live on proj_alpha; source_ref_beta lives on
    // proj_beta, so the composite FK (project_id, source_ref_id) ->
    // source_refs(project_id, id) has no matching parent row.
    await insertClaim("claim_alpha_1");
    await insertSourceRef("source_ref_beta", { projectId: "proj_beta" });

    await expect(
      client.execute(
        `INSERT INTO claim_source_refs ${LINK_COLUMN_INSERT}
         VALUES ('link_cross_source', 'proj_alpha', 'claim_alpha_1',
                 'source_ref_beta')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose claim belongs to another Project", async () => {
    // claim_beta lives on proj_beta; the link and source_ref_alpha live on
    // proj_alpha, so the composite FK (project_id, claim_id) ->
    // claims(project_id, id) has no matching parent row.
    await insertClaim("claim_beta", { projectId: "proj_beta" });
    await insertSourceRef("source_ref_alpha_1");

    await expect(
      client.execute(
        `INSERT INTO claim_source_refs ${LINK_COLUMN_INSERT}
         VALUES ('link_cross_claim', 'proj_alpha', 'claim_beta',
                 'source_ref_alpha_1')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose claim or source reference does not exist (dangling parent)", async () => {
    await insertClaim("claim_alpha_1");
    await insertSourceRef("source_ref_alpha_1");

    // Missing source reference.
    await expect(
      client.execute(
        `INSERT INTO claim_source_refs ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_source', 'proj_alpha', 'claim_alpha_1',
                 'source_ref_missing')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // Missing claim.
    await expect(
      client.execute(
        `INSERT INTO claim_source_refs ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_claim', 'proj_alpha', 'claim_missing',
                 'source_ref_alpha_1')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a duplicate (claim_id, source_ref_id) edge", async () => {
    await insertClaim("claim_alpha_1");
    await insertSourceRef("source_ref_alpha_1");
    await insertLink("link_alpha_1");

    // A second link for the same claim/source_ref edge is rejected by the link
    // identity unique index, not by application code.
    await expect(
      client.execute(
        `INSERT INTO claim_source_refs ${LINK_COLUMN_INSERT}
         VALUES ('link_duplicate', 'proj_alpha', 'claim_alpha_1',
                 'source_ref_alpha_1')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("cascades links away when their claim is deleted", async () => {
    await insertClaim("claim_alpha_1");
    await insertSourceRef("source_ref_alpha_1");
    await insertLink("link_alpha_1");

    await client.execute("DELETE FROM claims WHERE id = 'claim_alpha_1'");

    const remaining = await db
      .select()
      .from(claimSourceRefs)
      .where(eq(claimSourceRefs.id, "link_alpha_1"));
    expect(remaining).toHaveLength(0);
  });

  it("cascades links away when their source reference is deleted", async () => {
    await insertClaim("claim_alpha_1");
    await insertSourceRef("source_ref_alpha_1");
    await insertLink("link_alpha_1");

    await client.execute(
      "DELETE FROM source_refs WHERE id = 'source_ref_alpha_1'",
    );

    const remaining = await db
      .select()
      .from(claimSourceRefs)
      .where(eq(claimSourceRefs.id, "link_alpha_1"));
    expect(remaining).toHaveLength(0);
  });

  it("cascades claims, source references and links away when their whole Project is deleted", async () => {
    await insertClaim("claim_delete", { projectId: "proj_delete" });
    await insertSourceRef("source_ref_delete", { projectId: "proj_delete" });
    await insertLink("link_delete", {
      projectId: "proj_delete",
      claimId: "claim_delete",
      sourceRefId: "source_ref_delete",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const links = await db
      .select()
      .from(claimSourceRefs)
      .where(eq(claimSourceRefs.projectId, "proj_delete"));
    expect(links).toHaveLength(0);
    const claimRows = await db
      .select()
      .from(claims)
      .where(eq(claims.projectId, "proj_delete"));
    expect(claimRows).toHaveLength(0);
    const sourceRows = await db
      .select()
      .from(sourceRefs)
      .where(eq(sourceRefs.projectId, "proj_delete"));
    expect(sourceRows).toHaveLength(0);
  });

  it("ships ONLY the normalized relation identity columns", async () => {
    // The relation row is identity plus the append-only created_at only: no
    // mutable evidence payload, no evidence snapshot, no updated_at and no
    // JSON/text array column for source refs.
    expect(await columnNames("claim_source_refs")).toEqual([
      "claim_id",
      "created_at",
      "id",
      "project_id",
      "source_ref_id",
    ]);
  });
});
