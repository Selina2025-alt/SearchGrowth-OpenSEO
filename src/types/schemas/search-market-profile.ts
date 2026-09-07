import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { searchMarketProfiles } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// SearchMarketProfile domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum columns give compile-time narrowing; these Zod enums
// are the runtime trust boundary for untrusted input before any repository
// write (mirrors rank-tracking's enum handling in ../schemas/rank-tracking.ts).
// There is intentionally no `GLOBAL`/`TABLET`/unknown engine fallback: callers
// must name a concrete engine + device from the V1.0 domain model.

export type SearchMarketProfile = InferSelectModel<typeof searchMarketProfiles>;

export const searchEngineSchema = z.enum(
  searchMarketProfiles.searchEngine.enumValues,
);
export type SearchEngine = z.infer<typeof searchEngineSchema>;

export const searchDeviceSchema = z.enum(
  searchMarketProfiles.device.enumValues,
);
export type SearchDevice = z.infer<typeof searchDeviceSchema>;
