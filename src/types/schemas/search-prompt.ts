import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { searchPrompts } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// SearchPrompt domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum column gives compile-time narrowing; this Zod enum is
// the runtime trust boundary for untrusted input before any repository write
// (mirrors ../schemas/search-market-profile.ts, ../schemas/search-topic.ts,
// ../schemas/entity-alias.ts and rank-tracking's enum handling). There is
// intentionally no implicit/unknown prompt-kind fallback: callers must name one
// of the exact V1.0 PromptType values from 05_DOMAIN_DATA_MODEL.md §5 /
// schemas/domain-types.ts (PromptType). Because the approved values are
// lowercase, uppercase/mixed-case and empty strings are rejected — there is no
// case-insensitive parsing and no normalization here (normalization is a later
// out-of-scope task).
//
// business_fit and priority are the two 0..100 score fields the V1.0 domain
// contract defines (schemas/domain-types.ts SearchPrompt). `searchPromptScoreSchema`
// is the explicit runtime boundary for those ranges; the storage layer enforces
// the same range with named CHECK constraints. This is score-boundary validation
// only — no ranking or matching behavior exists.
//
// Full-row CRUD/input schemas belong to the later prompt CRUD task; this task
// pins the domain contract the storage layer is built on.
//
// The exported `SearchPrompt` row type is the domain shape repositories will
// consume. It carries every scalar storage field of the same-Project prompt,
// including the nullable `market_profile_id` and the versioned-identity inputs
// `normalized_prompt` and `version`.

export type SearchPrompt = InferSelectModel<typeof searchPrompts>;

export const promptTypeSchema = z.enum(searchPrompts.promptType.enumValues);
export type PromptType = z.infer<typeof promptTypeSchema>;

export const searchPromptScoreSchema = z.number().min(0).max(100);
