import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { searchTopics } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// SearchTopic domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum column gives compile-time narrowing; these Zod enums
// are the runtime trust boundary for untrusted input before any repository
// write (mirrors ../schemas/search-market-profile.ts and rank-tracking's enum
// handling). There is intentionally no implicit/lowercase/unknown lifecycle
// fallback: callers must name one of the V1.0 lifecycle states from
// 05_DOMAIN_DATA_MODEL.md §3 / schemas/domain-types.ts. Full-row CRUD input
// schemas belong to the later topic CRUD task; this task only pins the
// lifecycle contract the storage layer is built on.

export type SearchTopic = InferSelectModel<typeof searchTopics>;

export const searchTopicStatusSchema = z.enum(searchTopics.status.enumValues);
export type SearchTopicStatus = z.infer<typeof searchTopicStatusSchema>;
