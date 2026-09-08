import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { trackedEntities } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// TrackedEntity domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum columns give compile-time narrowing; these Zod enums
// are the runtime trust boundary for untrusted input before any repository
// write (mirrors ../schemas/search-market-profile.ts, ../schemas/search-topic.ts
// and rank-tracking's enum handling). There is intentionally no
// implicit/lowercase/unknown entity-kind fallback: callers must name one of the
// V1.0 tracked-entity kinds from 05_DOMAIN_DATA_MODEL.md §4 /
// schemas/domain-types.ts (TrackedEntityType). Full-row CRUD input schemas
// belong to the later entity CRUD task; this task only pins the enum contract
// the storage layer is built on.
//
// The exported `TrackedEntity` row type is the domain shape repositories will
// consume. It carries every scalar storage field of the same-Project tracked
// entity, including the nullable `owning_entity_id` (an entity owned by another
// tracked entity on the same Project, 05_DOMAIN_DATA_MODEL.md §4).

export type TrackedEntity = InferSelectModel<typeof trackedEntities>;

export const trackedEntityTypeSchema = z.enum(
  trackedEntities.entityType.enumValues,
);
export type TrackedEntityType = z.infer<typeof trackedEntityTypeSchema>;
