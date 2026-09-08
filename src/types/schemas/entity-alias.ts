import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { entityAliases } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// EntityAlias domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum columns give compile-time narrowing; this Zod enum is
// the runtime trust boundary for untrusted input before any repository write
// (mirrors ../schemas/search-market-profile.ts, ../schemas/search-topic.ts and
// rank-tracking's enum handling). There is intentionally no
// implicit/lowercase/unknown match-mode fallback: callers must name one of the
// approved alias match modes from 05_DOMAIN_DATA_MODEL.md §4 EntityAlias /
// schemas/domain-types.ts (AliasMatchMode). The alias text/substring safety
// rules belong to later matching work; this task only pins the storage enum.
//
// The exported `EntityAlias` row type is the domain shape repositories will
// consume. It carries every scalar storage field of the same-Project alias,
// including the integer `priority` (storage-only precedence hint,
// 05_DOMAIN_DATA_MODEL.md §4 EntityAlias; no ranking/matching behavior here).

export type EntityAlias = InferSelectModel<typeof entityAliases>;

export const aliasMatchModeSchema = z.enum(entityAliases.matchMode.enumValues);
export type AliasMatchMode = z.infer<typeof aliasMatchModeSchema>;
