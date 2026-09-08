import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { entityAliases, trackedEntities } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL, so the
// fixture proves the storage contract the migration ships (05_DOMAIN_DATA_MODEL
// .md §4 EntityAlias). Foreign keys are enabled so the same-project composite FK
// and the cascade delete behavior are exercised against the shipped storage
// contract — not an application convention.
//
// Invariants under test:
//   - An alias belongs to one tracked entity and carries an explicit project_id;
//     the composite FK (project_id, entity_id) -> tracked_entities(project_id,
//     id) makes an alias pointing at another Project's entity impossible at the
//     database boundary.
//   - Deleting a tracked entity or a whole Project cascades the alias away, so
//     an alias can never dangle.
//   - Renaming an entity (stable ADR-004 identity) keeps the alias attached to
//     the same entity_id and project.
//   - `priority` (05_DOMAIN_DATA_MODEL.md §4 EntityAlias) persists as given and
//     defaults to 0 when omitted — storage metadata only.
// Enum boundary rejection (unsupported/lowercase/empty match modes) is proven
// at the Zod domain boundary in src/types/schemas/entity-alias.test.ts; the DB
// stores the enum as an explicit text column validated there. The reference
// defines no duplicate-alias uniqueness rule, so no duplicate guard is added.

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let db: ReturnType<typeof drizzle>;

const ENTITY_ALIAS_DDL = readFileSync(
  "drizzle/0048_ordinary_legion.sql",
  "utf8",
);

const statementParts = (ddl: string) =>
  ddl
    .split(DRIZZLE_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(
    [
      `CREATE TABLE projects (id text PRIMARY KEY);`,
      `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta'), ('proj_delete');`,
      ...statementParts(ENTITY_ALIAS_DDL),
    ].join("\n"),
  );
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await db.delete(entityAliases);
  await db.delete(trackedEntities);
});

async function seedEntity(id: string, projectId: string) {
  await db.insert(trackedEntities).values({
    id,
    projectId,
    entityType: "BRAND",
    canonicalName: `Entity ${id}`,
  });
}

describe("entity_aliases same-project ownership and delete behavior", () => {
  it("persists a valid same-project alias with the approved columns", async () => {
    await seedEntity("ent_alpha", "proj_alpha");
    await seedEntity("ent_alpha_2", "proj_alpha");

    await db.insert(entityAliases).values([
      {
        id: "alias_1",
        projectId: "proj_alpha",
        entityId: "ent_alpha",
        aliasText: "acme",
        locale: "en",
        matchMode: "CASE_INSENSITIVE_EXACT",
        caseSensitive: false,
      },
      {
        id: "alias_2",
        projectId: "proj_alpha",
        entityId: "ent_alpha_2",
        aliasText: "https://acme.example",
        matchMode: "DOMAIN",
        caseSensitive: true,
      },
    ]);

    const rows = await db
      .select()
      .from(entityAliases)
      .where(eq(entityAliases.projectId, "proj_alpha"))
      .orderBy(entityAliases.id);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "alias_1",
      projectId: "proj_alpha",
      entityId: "ent_alpha",
      aliasText: "acme",
      locale: "en",
      matchMode: "CASE_INSENSITIVE_EXACT",
      caseSensitive: false,
    });
    expect(rows[1]).toMatchObject({
      id: "alias_2",
      projectId: "proj_alpha",
      entityId: "ent_alpha_2",
      aliasText: "https://acme.example",
      locale: null,
      matchMode: "DOMAIN",
      caseSensitive: true,
    });
  });

  it("rejects an alias whose entity belongs to another project", async () => {
    // ent_beta lives on proj_beta; the alias row claims proj_alpha, so the
    // composite FK (project_id, entity_id) -> tracked_entities(project_id, id)
    // has no matching parent row.
    await seedEntity("ent_beta", "proj_beta");

    await expect(
      client.execute(
        `INSERT INTO entity_aliases
           (id, project_id, entity_id, alias_text, match_mode, case_sensitive)
         VALUES
           ('alias_cross', 'proj_alpha', 'ent_beta', 'acme', 'EXACT', 0)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("cascades aliases away when their tracked entity is deleted", async () => {
    await seedEntity("ent_alpha", "proj_alpha");
    await db.insert(entityAliases).values({
      id: "alias_1",
      projectId: "proj_alpha",
      entityId: "ent_alpha",
      aliasText: "acme",
      matchMode: "EXACT",
      caseSensitive: true,
    });

    await client.execute("DELETE FROM tracked_entities WHERE id = 'ent_alpha'");

    const remaining = await db
      .select()
      .from(entityAliases)
      .where(eq(entityAliases.id, "alias_1"));
    expect(remaining).toHaveLength(0);
  });

  it("cascades aliases away when their project is deleted", async () => {
    await seedEntity("ent_delete", "proj_delete");
    await db.insert(entityAliases).values({
      id: "alias_delete",
      projectId: "proj_delete",
      entityId: "ent_delete",
      aliasText: "acme",
      matchMode: "UNICODE_SUBSTRING",
      caseSensitive: false,
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const remaining = await db
      .select()
      .from(entityAliases)
      .where(eq(entityAliases.projectId, "proj_delete"));
    expect(remaining).toHaveLength(0);
  });

  it("keeps aliases attached to the stable entity id across an entity rename", async () => {
    // A renamed tracked entity mutates its row in place (ADR-004); the alias
    // must keep pointing at the same stable entity_id and project.
    await seedEntity("ent_alpha", "proj_alpha");
    await db.insert(entityAliases).values({
      id: "alias_1",
      projectId: "proj_alpha",
      entityId: "ent_alpha",
      aliasText: "acme",
      matchMode: "WORD_BOUNDARY",
      caseSensitive: false,
    });

    await db
      .update(trackedEntities)
      .set({ canonicalName: "Renamed entity" })
      .where(eq(trackedEntities.id, "ent_alpha"));

    const aliasRows = await db
      .select()
      .from(entityAliases)
      .where(eq(entityAliases.id, "alias_1"));

    expect(aliasRows).toHaveLength(1);
    expect(aliasRows[0]).toMatchObject({
      id: "alias_1",
      projectId: "proj_alpha",
      entityId: "ent_alpha",
      aliasText: "acme",
    });

    // Exactly one entity row survives the rename — the mutation never created a
    // replacement identity, so the alias target is unchanged.
    const entityRows = await db
      .select()
      .from(trackedEntities)
      .where(eq(trackedEntities.id, "ent_alpha"));
    expect(entityRows).toHaveLength(1);
    expect(entityRows[0]).toMatchObject({
      id: "ent_alpha",
      projectId: "proj_alpha",
      canonicalName: "Renamed entity",
    });
  });

  it("persists alias priority and applies the 0 default when omitted", async () => {
    // priority is integer storage metadata (05_DOMAIN_DATA_MODEL.md §4
    // EntityAlias): an explicit value round-trips and an omitted value gets the
    // column default 0.
    await seedEntity("ent_alpha", "proj_alpha");
    await seedEntity("ent_alpha_2", "proj_alpha");

    await db.insert(entityAliases).values([
      {
        id: "alias_hi",
        projectId: "proj_alpha",
        entityId: "ent_alpha",
        aliasText: "acme",
        matchMode: "EXACT",
        caseSensitive: true,
        priority: 10,
      },
      {
        id: "alias_default",
        projectId: "proj_alpha",
        entityId: "ent_alpha_2",
        aliasText: "acme-inc",
        matchMode: "WORD_BOUNDARY",
        caseSensitive: false,
      },
    ]);

    const rows = await db
      .select()
      .from(entityAliases)
      .where(eq(entityAliases.projectId, "proj_alpha"))
      .orderBy(entityAliases.id);

    expect(rows).toHaveLength(2);
    // orderBy(id) asc sorts "alias_default" before "alias_hi".
    expect(rows[0]).toMatchObject({ id: "alias_default", priority: 0 });
    expect(rows[1]).toMatchObject({ id: "alias_hi", priority: 10 });
  });
});
