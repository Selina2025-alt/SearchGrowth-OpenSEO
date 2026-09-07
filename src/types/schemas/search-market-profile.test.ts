import { describe, expect, it } from "vitest";
import { searchMarketProfiles } from "@/db/search-growth.schema";
import type {
  SearchDevice,
  SearchEngine,
  SearchMarketProfile,
} from "./search-market-profile";
import {
  searchDeviceSchema,
  searchEngineSchema,
} from "./search-market-profile";

// The DB text-enum columns and the Zod boundary must not drift: a value the
// Zod schema accepts has to be a value the column type admits, and vice versa.
// Drift here would let future repositories write an engine/device that the
// domain boundary never validated.
describe("SearchMarketProfile domain boundary", () => {
  it("lists every search_engine column value as a valid engine", () => {
    for (const engine of searchMarketProfiles.searchEngine.enumValues) {
      expect(searchEngineSchema.safeParse(engine).success).toBe(true);
    }
  });

  it("rejects unsupported engines — no implicit GLOBAL fallback", () => {
    for (const engine of ["GLOBAL", "YAHOO", "YANDEX", "google", ""]) {
      expect(searchEngineSchema.safeParse(engine).success).toBe(false);
    }
  });

  it("lists every device column value as a valid device", () => {
    for (const device of searchMarketProfiles.device.enumValues) {
      expect(searchDeviceSchema.safeParse(device).success).toBe(true);
    }
  });

  it("rejects unsupported devices", () => {
    for (const device of ["TABLET", "desktop", "ALL", ""]) {
      expect(searchDeviceSchema.safeParse(device).success).toBe(false);
    }
  });

  it("exports engine/device/row types aligned with the storage columns", () => {
    // Compile-time guard: the domain types later repository/service tasks will
    // import must stay true to the storage enums and the select row shape.
    const engine: SearchEngine = "GOOGLE";
    const device: SearchDevice = "MOBILE";
    const profile: Pick<
      SearchMarketProfile,
      "projectId" | "searchEngine" | "device" | "isPrimary" | "active"
    > = {
      projectId: "proj_cn",
      searchEngine: engine,
      device,
      isPrimary: true,
      active: true,
    };
    expect(profile.searchEngine).toBe("GOOGLE");
    expect(profile.device).toBe("MOBILE");
    expect(profile.isPrimary).toBe(true);
  });
});
