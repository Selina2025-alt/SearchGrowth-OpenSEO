import { describe, expect, it } from "vitest";
import { trackedEntities } from "@/db/search-growth.schema";
import type { TrackedEntity, TrackedEntityType } from "./tracked-entity";
import { trackedEntityTypeSchema } from "./tracked-entity";

// The DB text-enum column and the Zod boundary must not drift: a value the Zod
// schema accepts has to be a value the column type admits, and vice versa.
// Drift here would let future repositories write an entity kind that the domain
// boundary never validated.
describe("TrackedEntity domain boundary", () => {
  it("lists every entity_type column value as a valid type", () => {
    for (const type of trackedEntities.entityType.enumValues) {
      expect(trackedEntityTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects unsupported/lowercase/empty entity types", () => {
    for (const type of [
      "brand",
      "product",
      "competitor",
      "competitor_product",
      "PRODUCTS",
      "CATEGORY",
      "GLOBAL",
      "",
    ]) {
      expect(trackedEntityTypeSchema.safeParse(type).success).toBe(false);
    }
  });

  it("exports entity-kind/row types aligned with the storage columns", () => {
    // Compile-time guard: the domain types later repository/service tasks will
    // import must stay true to the storage enum and the select row shape —
    // including the nullable same-Project owning_entity_id column.
    const type: TrackedEntityType = "COMPETITOR_PRODUCT";
    const entity: Pick<
      TrackedEntity,
      | "id"
      | "projectId"
      | "entityType"
      | "canonicalName"
      | "owningEntityId"
      | "active"
    > = {
      id: "ent_alpha",
      projectId: "proj_cn",
      entityType: type,
      canonicalName: "Acme",
      owningEntityId: "ent_owner",
      active: true,
    };
    expect(entity.entityType).toBe("COMPETITOR_PRODUCT");
    expect(entity.projectId).toBe("proj_cn");
    expect(entity.owningEntityId).toBe("ent_owner");
  });
});
