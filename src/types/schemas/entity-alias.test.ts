import { describe, expect, it } from "vitest";
import { entityAliases } from "@/db/search-growth.schema";
import type { AliasMatchMode, EntityAlias } from "./entity-alias";
import { aliasMatchModeSchema } from "./entity-alias";

// The DB text-enum column and the Zod boundary must not drift: a value the Zod
// schema accepts has to be a value the column type admits, and vice versa.
// Drift here would let future repositories write a match mode that the domain
// boundary never validated.
describe("EntityAlias domain boundary", () => {
  it("lists every match_mode column value as a valid mode", () => {
    for (const mode of entityAliases.matchMode.enumValues) {
      expect(aliasMatchModeSchema.safeParse(mode).success).toBe(true);
    }
  });

  it("rejects unsupported/lowercase/empty match modes", () => {
    for (const mode of [
      "exact",
      "word_boundary",
      "UNICODE",
      "SUBSTRING",
      "REGEX",
      "FUZZY",
      "",
    ]) {
      expect(aliasMatchModeSchema.safeParse(mode).success).toBe(false);
    }
  });

  it("exports match-mode/row types aligned with the storage columns", () => {
    // Compile-time guard: the domain types later repository/service tasks will
    // import must stay true to the storage enum and the select row shape —
    // including the integer priority column.
    const mode: AliasMatchMode = "CASE_INSENSITIVE_EXACT";
    const alias: Pick<
      EntityAlias,
      | "id"
      | "projectId"
      | "entityId"
      | "aliasText"
      | "matchMode"
      | "caseSensitive"
      | "priority"
    > = {
      id: "alias_alpha",
      projectId: "proj_cn",
      entityId: "ent_alpha",
      aliasText: "acme",
      matchMode: mode,
      caseSensitive: false,
      priority: 0,
    };
    expect(alias.matchMode).toBe("CASE_INSENSITIVE_EXACT");
    expect(alias.caseSensitive).toBe(false);
    expect(alias.priority).toBe(0);
  });
});
