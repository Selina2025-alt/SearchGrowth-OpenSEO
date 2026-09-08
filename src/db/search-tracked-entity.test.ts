import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { trackedEntities } from "./search-growth.schema";

// Real in-memory SQLite built from the actual forward migration DDL, so the
// fixture proves the storage contract the migration ships (ADR-004 stable
// entity identity + the project ownership/active columns + the same-Project
// owning_entity_id relation). Foreign keys are enabled so the cascade delete and
// the owning-entity self-reference are exercised against the shipped DDL.
//
// Invariants under test:
//   - An entity id is stable across rename / canonical-domain / product-URL /
//     owning-entity / active mutations and project ownership is never replaced
//     or inferred from another project.
//   - Project ownership is explicit: entities on different projects stay
//     isolated.
//   - owning_entity_id (05_DOMAIN_DATA_MODEL.md §4) is a same-Project
//     self-reference: a child can name an owner on the same Project, but an
//     owner on another Project has no matching composite parent row and is
//     rejected by the DB.
//   - Deleting an owning entity that still has owned entities is BLOCKED (FK
//     no action), so an ownership reference can never dangle.
//   - Deleting a Project cascades its entities away (no dangling rows).
// Enum boundary rejection (unsupported/lowercase/empty entity kinds) is proven
// at the Zod domain boundary in src/types/schemas/tracked-entity.test.ts; the
// DB stores the enum as an explicit text column validated there.

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let db: ReturnType<typeof drizzle>;

const ENTITY_DDL = readFileSync("drizzle/0048_ordinary_legion.sql", "utf8");

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
      ...statementParts(ENTITY_DDL),
    ].join("\n"),
  );
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  // Clear owning_entity_id references first: the self-FK is NO ACTION, so a
  // bulk delete could otherwise hit an owning parent before its owned child and
  // trip the foreign key.
  await db
    .update(trackedEntities)
    .set({ owningEntityId: null })
    .where(isNotNull(trackedEntities.owningEntityId));
  await db.delete(trackedEntities);
});

describe("tracked_entities stable identity and project ownership", () => {
  it("persists valid entity records and keeps the same id + project across field mutations", async () => {
    await db.insert(trackedEntities).values([
      {
        id: "ent_alpha",
        projectId: "proj_alpha",
        entityType: "BRAND",
        canonicalName: "Original brand name",
        canonicalDomain: "alpha.example",
        active: true,
      },
      {
        id: "ent_beta",
        projectId: "proj_beta",
        entityType: "COMPETITOR",
        canonicalName: "Other project competitor",
        active: true,
      },
    ]);

    // Rename + move the product URL + soft-disable on the SAME row.
    await db
      .update(trackedEntities)
      .set({
        canonicalName: "Renamed brand",
        canonicalDomain: "brand.example",
        productUrl: "https://brand.example/product",
        active: false,
      })
      .where(eq(trackedEntities.id, "ent_alpha"));

    const rows = await db
      .select()
      .from(trackedEntities)
      .where(eq(trackedEntities.id, "ent_alpha"));

    // Exactly one row survives the mutation — the update never created a
    // replacement row with a new id (ADR-004 stable entity identity).
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "ent_alpha",
      projectId: "proj_alpha",
      entityType: "BRAND",
      canonicalName: "Renamed brand",
      canonicalDomain: "brand.example",
      productUrl: "https://brand.example/product",
      active: false,
    });

    // The other-project entity is untouched.
    const betaRows = await db
      .select()
      .from(trackedEntities)
      .where(eq(trackedEntities.id, "ent_beta"));
    expect(betaRows).toHaveLength(1);
    expect(betaRows[0]).toMatchObject({
      id: "ent_beta",
      projectId: "proj_beta",
      canonicalName: "Other project competitor",
      active: true,
    });
  });

  it("persists every approved entity kind and keeps projects isolated", async () => {
    await db.insert(trackedEntities).values([
      {
        id: "ent_brand",
        projectId: "proj_alpha",
        entityType: "BRAND",
        canonicalName: "Brand",
      },
      {
        id: "ent_product",
        projectId: "proj_alpha",
        entityType: "PRODUCT",
        canonicalName: "Product",
      },
      {
        id: "ent_competitor",
        projectId: "proj_beta",
        entityType: "COMPETITOR",
        canonicalName: "Competitor",
      },
      {
        id: "ent_competitor_product",
        projectId: "proj_beta",
        entityType: "COMPETITOR_PRODUCT",
        canonicalName: "Competitor product",
      },
    ]);

    const alphaRows = await db
      .select()
      .from(trackedEntities)
      .where(eq(trackedEntities.projectId, "proj_alpha"))
      .orderBy(trackedEntities.id);
    expect(alphaRows.map((row) => row.entityType)).toEqual([
      "BRAND",
      "PRODUCT",
    ]);

    const betaRows = await db
      .select()
      .from(trackedEntities)
      .where(eq(trackedEntities.projectId, "proj_beta"))
      .orderBy(trackedEntities.id);
    expect(betaRows.map((row) => row.entityType)).toEqual([
      "COMPETITOR",
      "COMPETITOR_PRODUCT",
    ]);
  });

  it("cascades entities away when their project is deleted", async () => {
    await db.insert(trackedEntities).values({
      id: "ent_delete",
      projectId: "proj_delete",
      entityType: "PRODUCT",
      canonicalName: "Doomed product",
    });

    await client.execute("DELETE FROM projects WHERE id = 'proj_delete'");

    const remaining = await db
      .select({ id: trackedEntities.id })
      .from(trackedEntities)
      .where(eq(trackedEntities.projectId, "proj_delete"));
    expect(remaining).toHaveLength(0);
  });

  it("persists an owning_entity_id that points at an entity in the same project", async () => {
    // owning_entity_id is a same-Project self-reference (05_DOMAIN_DATA_MODEL.md
    // §4): a PRODUCT owned by a BRAND on the same Project persists.
    await db.insert(trackedEntities).values({
      id: "ent_brand",
      projectId: "proj_alpha",
      entityType: "BRAND",
      canonicalName: "Brand",
    });
    await db.insert(trackedEntities).values({
      id: "ent_product",
      projectId: "proj_alpha",
      entityType: "PRODUCT",
      canonicalName: "Product",
      owningEntityId: "ent_brand",
    });

    const child = await db
      .select()
      .from(trackedEntities)
      .where(eq(trackedEntities.id, "ent_product"));
    expect(child).toHaveLength(1);
    expect(child[0]).toMatchObject({
      id: "ent_product",
      projectId: "proj_alpha",
      owningEntityId: "ent_brand",
    });
  });

  it("rejects an owning_entity_id that points at an entity on another project", async () => {
    // The owner lives on proj_beta; the child row claims proj_alpha, so the
    // composite FK (project_id, owning_entity_id) -> tracked_entities(project_id,
    // id) has no matching parent row and the DB rejects the insert. Raw SQL is
    // used (as in the other FK-rejection tests) so the assertion sees the clean
    // libsql "FOREIGN KEY constraint failed" error rather than the drizzle
    // insert wrapper's "Failed query: ..." message.
    await db.insert(trackedEntities).values({
      id: "ent_parent_beta",
      projectId: "proj_beta",
      entityType: "COMPETITOR",
      canonicalName: "Other project competitor",
    });

    await expect(
      client.execute(
        `INSERT INTO tracked_entities
           (id, project_id, entity_type, canonical_name, owning_entity_id)
         VALUES
           ('ent_child_alpha', 'proj_alpha', 'COMPETITOR_PRODUCT',
            'Cross-project product', 'ent_parent_beta')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("blocks deleting an owning entity that still has owned entities", async () => {
    // ON DELETE NO ACTION on the owning-entity self-FK: deleting a parent that
    // an owned entity still references is rejected, so the ownership reference
    // can never dangle. Raw SQL is used (as in the other FK-rejection tests) so
    // the assertion sees the clean libsql "FOREIGN KEY constraint failed" error
    // rather than the drizzle delete wrapper's "Failed query: ..." message.
    await db.insert(trackedEntities).values({
      id: "ent_parent",
      projectId: "proj_alpha",
      entityType: "BRAND",
      canonicalName: "Parent",
    });
    await db.insert(trackedEntities).values({
      id: "ent_child",
      projectId: "proj_alpha",
      entityType: "PRODUCT",
      canonicalName: "Child",
      owningEntityId: "ent_parent",
    });

    await expect(
      client.execute("DELETE FROM tracked_entities WHERE id = 'ent_parent'"),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

    // Neither row was removed.
    const rows = await db
      .select()
      .from(trackedEntities)
      .where(eq(trackedEntities.projectId, "proj_alpha"));
    expect(rows).toHaveLength(2);
  });
});
