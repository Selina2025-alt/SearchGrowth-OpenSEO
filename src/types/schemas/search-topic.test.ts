import { describe, expect, it } from "vitest";
import { searchTopics } from "@/db/search-growth.schema";
import type { SearchTopic, SearchTopicStatus } from "./search-topic";
import { searchTopicStatusSchema } from "./search-topic";

// The DB text-enum column and the Zod boundary must not drift: a value the Zod
// schema accepts has to be a value the column type admits, and vice versa.
// Drift here would let future repositories write a lifecycle status the domain
// boundary never validated. There is intentionally no implicit/lowercase/
// unknown fallback (05_DOMAIN_DATA_MODEL.md §3).
describe("SearchTopic domain boundary", () => {
  it("lists every status column value as a valid lifecycle status", () => {
    for (const status of searchTopics.status.enumValues) {
      expect(searchTopicStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects unsupported, lowercase and empty lifecycle statuses", () => {
    for (const status of [
      "DRAFT",
      "PUBLISHED",
      "active",
      "archived",
      "merged",
      "ACTIVE ",
      "",
    ]) {
      expect(searchTopicStatusSchema.safeParse(status).success).toBe(false);
    }
  });

  it("exports row/status types aligned with the storage columns", () => {
    // Compile-time guard: the domain types later topic tasks will import must
    // stay true to the storage enum and the select row shape.
    const status: SearchTopicStatus = "MERGED";
    const topic: Pick<
      SearchTopic,
      | "id"
      | "projectId"
      | "canonicalName"
      | "locale"
      | "status"
      | "mergedIntoTopicId"
    > = {
      id: "topic_alpha",
      projectId: "proj_alpha",
      canonicalName: "Surviving topic",
      locale: "en",
      status,
      mergedIntoTopicId: "topic_merge_target",
    };
    expect(topic.status).toBe("MERGED");
    expect(topic.projectId).toBe("proj_alpha");
    expect(topic.mergedIntoTopicId).toBe("topic_merge_target");
  });
});
