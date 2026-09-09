/* eslint-disable max-lines, max-lines-per-function -- one migration-backed spec covers the whole claim_allowed_languages storage contract (valid same-Project persistence/multiple-allowed-languages/cross-Project rejection in both directions/dangling Claim + dangling Project rejection/duplicate-edge rejection/literal language-value persistence/claim + whole-Project delete cascades/normalized relation shape) through the shipped DDL; splitting would scatter the invariants asserted together */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { claimAllowedLanguages, claims } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL for the
// normalized Claim allowed-language relation (0059) and the claim parent it
// links: 0057 creates the claims table (with the claims_project_id_id_idx
// referential target) alongside claim_source_refs, so the 0056 source_refs
// parent is applied first to make 0057's whole-file DDL valid. The spec creates
// the `projects` table directly and applies the DDL in order. Foreign keys are
// ON so the Project FK, the same-Project composite FK, the duplicate-edge guard
// and the delete cascades are exercised against the shipped DDL — not an
// application convention.
//
// Invariants under test:
//   - A valid same-Project link persists with the full normalized relation
//     field set (id, project_id, claim_id, language) plus the append-only
//     created_at; one claim can allow MULTIPLE distinct same-Project languages
//     (the §9 `allowed_languages[]` relation is a row per allowed language,
//     never a JSON/text list).
//   - The language value is stored verbatim as an opaque explicit tag: no
//     case-folding, locale inference or format normalization is applied by the
//     storage slice (TASK item 3).
//   - A link whose claim belongs to another Project — in EITHER direction
//     (claim on the other Project, or this link's own project_id set to the
//     other Project) — is rejected by the composite FK; a link whose
//     claim/project is missing is rejected; a duplicate (claim_id, language)
//     edge is rejected by the unique index.
//   - Deleting a claim, or a whole Project, cascades its links away, so a link
//     can never dangle.
//   - The relation ships ONLY the normalized identity columns plus the language
//     tag plus the append-only created_at (no policy/catalog/format payload and
//     no JSON/text array column).

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
  "drizzle/0059_elite_deathbird.sql",
];

const LINK_COLUMN_INSERT = `(id, project_id, claim_id, language)`;

let client: Client;
let db: ReturnType<typeof drizzle>;

type NewClaim = typeof claims.$inferInsert;
type NewAllowedLanguageLink = typeof claimAllowedLanguages.$inferInsert;

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
  await db.delete(claimAllowedLanguages);
  await db.delete(claims);
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

async function insertLink(
  id: string,
  overrides: Partial<NewAllowedLanguageLink> = {},
) {
  await db.insert(claimAllowedLanguages).values({
    id,
    projectId: "proj_alpha",
    claimId: "claim_alpha_1",
    language: "en",
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

describe("claim_allowed_languages same-project relation contract", () => {
  it("persists a valid same-Project link between a claim and an allowed language", async () => {
    await insertClaim("claim_alpha_1", {
      claimText: "Example.com is the fastest provider.",
      status: "APPROVED",
      classification: "PUBLIC_MARKETING",
    });
    await insertLink("allowed_language_link_1", { language: "en" });

    const links = await db
      .select()
      .from(claimAllowedLanguages)
      .where(eq(claimAllowedLanguages.id, "allowed_language_link_1"));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      id: "allowed_language_link_1",
      projectId: "proj_alpha",
      claimId: "claim_alpha_1",
      language: "en",
    });
    expect(links[0].createdAt).toBeTruthy();

    // The claim keeps its own full row; the link stores only identity plus the
    // language tag (normalized relation, no duplicated claim payload).
    const claimRows = await db
      .select()
      .from(claims)
      .where(eq(claims.id, "claim_alpha_1"));
    expect(claimRows).toHaveLength(1);
    expect(claimRows[0].claimText).toBe("Example.com is the fastest provider.");
  });

  it("stores the language value verbatim as an opaque explicit tag", async () => {
    // TASK item 3: the language is preserved as supplied — no locale inference,
    // normalization algorithm or format rule exists in this slice, so tags that
    // would change under case-folding or region parsing round-trip exactly.
    await insertClaim("claim_alpha_1");
    await insertLink("allowed_language_link_en", { language: "en" });
    await insertLink("allowed_language_link_cn", {
      id: "allowed_language_link_cn",
      language: "zh-CN",
    });
    await insertLink("allowed_language_link_hant", {
      id: "allowed_language_link_hant",
      language: "zh-Hant-TW",
    });
    await insertLink("allowed_language_link_es419", {
      id: "allowed_language_link_es419",
      language: "es-419",
    });

    const links = await db
      .select()
      .from(claimAllowedLanguages)
      .where(eq(claimAllowedLanguages.claimId, "claim_alpha_1"));
    expect(links).toHaveLength(4);
    expect(
      sort(
        links.map((link) => link.language),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(["en", "es-419", "zh-CN", "zh-Hant-TW"]);
  });

  it("lets one claim allow multiple distinct same-Project languages", async () => {
    // §9 `allowed_languages[]` is a list of allowed languages: the normalized
    // relation models it as one row per allowed language, so a claim
    // legitimately links to several language tags on the SAME project.
    await insertClaim("claim_alpha_1");
    await insertLink("allowed_language_link_1");
    await insertLink("allowed_language_link_2", {
      id: "allowed_language_link_2",
      language: "zh-CN",
    });
    await insertLink("allowed_language_link_3", {
      id: "allowed_language_link_3",
      language: "fr",
    });

    const links = await db
      .select()
      .from(claimAllowedLanguages)
      .where(eq(claimAllowedLanguages.claimId, "claim_alpha_1"));
    expect(links).toHaveLength(3);
    expect(
      sort(
        links.map((link) => link.language),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(["en", "fr", "zh-CN"]);
  });

  it("rejects a link whose claim belongs to another Project", async () => {
    // claim_beta lives on proj_beta; the link lives on proj_alpha, so the
    // composite FK (project_id, claim_id) -> claims(project_id, id) has no
    // matching parent row.
    await insertClaim("claim_beta", { projectId: "proj_beta" });

    await expect(
      client.execute(
        `INSERT INTO claim_allowed_languages ${LINK_COLUMN_INSERT}
         VALUES ('link_cross_claim', 'proj_alpha', 'claim_beta', 'en')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose own project does not match its claim's project", async () => {
    // claim_alpha lives on proj_alpha; the link's own project_id is proj_beta,
    // so the composite FK (project_id, claim_id) -> claims(project_id, id) has
    // no matching parent row in the reverse direction.
    await insertClaim("claim_alpha_1");

    await expect(
      client.execute(
        `INSERT INTO claim_allowed_languages ${LINK_COLUMN_INSERT}
         VALUES ('link_wrong_project', 'proj_beta', 'claim_alpha_1', 'en')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose claim does not exist (dangling Claim)", async () => {
    await insertClaim("claim_alpha_1");

    await expect(
      client.execute(
        `INSERT INTO claim_allowed_languages ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_claim', 'proj_alpha', 'claim_missing', 'en')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a link whose Project does not exist (dangling Project)", async () => {
    await insertClaim("claim_alpha_1");

    await expect(
      client.execute(
        `INSERT INTO claim_allowed_languages ${LINK_COLUMN_INSERT}
         VALUES ('link_dangling_project', 'proj_missing', 'claim_alpha_1', 'en')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a duplicate (claim_id, language) edge", async () => {
    await insertClaim("claim_alpha_1");
    await insertLink("link_alpha_1");

    // A second link for the same claim/language edge is rejected by the link
    // identity unique index, not by application code.
    await expect(
      client.execute(
        `INSERT INTO claim_allowed_languages ${LINK_COLUMN_INSERT}
         VALUES ('link_duplicate', 'proj_alpha', 'claim_alpha_1', 'en')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("cascades links away when their claim is deleted", async () => {
    await insertClaim("claim_alpha_1");
    await insertLink("link_alpha_1");

    await client.execute("DELETE FROM claims WHERE id = 'claim_alpha_1'");

    const remaining = await db
      .select()
      .from(claimAllowedLanguages)
      .where(eq(claimAllowedLanguages.id, "link_alpha_1"));
    expect(remaining).toHaveLength(0);
  });

  it("cascades claims and links away when their whole Project is deleted", async () => {
    await insertClaim("claim_delete", { projectId: "proj_delete" });
    await insertLink("link_delete", {
      projectId: "proj_delete",
      claimId: "claim_delete",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const links = await db
      .select()
      .from(claimAllowedLanguages)
      .where(eq(claimAllowedLanguages.projectId, "proj_delete"));
    expect(links).toHaveLength(0);
    const claimRows = await db
      .select()
      .from(claims)
      .where(eq(claims.projectId, "proj_delete"));
    expect(claimRows).toHaveLength(0);
  });

  it("ships ONLY the normalized relation identity columns plus the language tag", async () => {
    // The relation row is identity + language + the append-only created_at
    // only: no policy/catalog/format payload, no updated_at and no JSON/text
    // array column for allowed languages.
    expect(await columnNames("claim_allowed_languages")).toEqual([
      "claim_id",
      "created_at",
      "id",
      "language",
      "project_id",
    ]);
  });
});
