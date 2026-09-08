import { describe, expect, it } from "vitest";
import { geoCitations } from "@/db/search-growth.schema";
import type { CitationSourceOwnership, GeoCitation } from "./geo-citation";
import { citationSourceOwnershipSchema } from "./geo-citation";

// The DB text-enum column and the Zod boundary must not drift: a value the Zod
// schema accepts has to be a value the column type admits, and vice versa.
// Drift here would let future repositories write a citation source ownership
// the domain boundary never validated. There is intentionally no
// implicit/lowercase/unknown fallback beyond the explicit UNKNOWN value
// (05_DOMAIN_DATA_MODEL.md §7 GeoCitation, schemas/domain-types.ts
// CitationOwnership).
describe("GeoCitation domain boundary", () => {
  it("lists every source_ownership column value as a valid CitationSourceOwnership", () => {
    for (const sourceOwnership of geoCitations.sourceOwnership.enumValues) {
      expect(
        citationSourceOwnershipSchema.safeParse(sourceOwnership).success,
      ).toBe(true);
    }
  });

  it("rejects unsupported, case-mismatched and empty source ownerships", () => {
    for (const sourceOwnership of [
      // Case-mismatched variants of the approved uppercase values.
      "owned_domain",
      "Owned",
      "CONTROLLED_publication",
      "earned_third_party",
      "Competitor",
      "unknown",
      "OWNED_DOMAIN ",
      // Unsupported ownership classifications.
      "PUBLISHER",
      "PAID",
      "REFERRAL",
      "CITATION",
      "DOMAIN",
      "NONE",
      "",
    ]) {
      expect(
        citationSourceOwnershipSchema.safeParse(sourceOwnership).success,
      ).toBe(false);
    }
  });

  it("exports row/enum types aligned with the storage columns", () => {
    // Compile-time guard: the domain type later GEO tasks will import must stay
    // true to the storage enum and the append-only select row shape — including
    // the required Project/parse bindings, the nullable optional fields and the
    // absence of any updated/current-pointer field.
    const sourceOwnership: CitationSourceOwnership = "OWNED_DOMAIN";
    const citation: Pick<
      GeoCitation,
      | "id"
      | "projectId"
      | "parseId"
      | "rawUrl"
      | "normalizedUrl"
      | "domain"
      | "title"
      | "position"
      | "sourceOwnership"
      | "matchedPublicationReceiptId"
      | "createdAt"
    > = {
      id: "citation_alpha_1",
      projectId: "project_alpha",
      parseId: "parse_alpha_v1",
      rawUrl: "https://example.com/resource?utm_source=search",
      normalizedUrl: "https://example.com/resource",
      domain: "example.com",
      title: "Example resource title",
      position: 1,
      sourceOwnership,
      matchedPublicationReceiptId: null,
      createdAt: "2026-09-08T04:00:05.000Z",
    };
    expect(citation.sourceOwnership).toBe("OWNED_DOMAIN");
    expect(citation.projectId).toBe("project_alpha");
    expect(citation.parseId).toBe("parse_alpha_v1");
    expect(citation.domain).toBe("example.com");
    expect(citation.title).toBe("Example resource title");
    expect(citation.position).toBe(1);
    expect(citation.matchedPublicationReceiptId).toBeNull();
    // UNKNOWN is the explicit value a not-yet-classified citation would carry.
    expect(citationSourceOwnershipSchema.safeParse("UNKNOWN").success).toBe(
      true,
    );
    // The optional fields are nullable at the boundary: an answer that gives no
    // title, no position and no matched receipt stores NULL for each.
    const citationWithoutOptionalFields: Pick<
      GeoCitation,
      | "id"
      | "projectId"
      | "parseId"
      | "rawUrl"
      | "normalizedUrl"
      | "domain"
      | "title"
      | "position"
      | "sourceOwnership"
      | "matchedPublicationReceiptId"
    > = {
      id: "citation_beta_1",
      projectId: "project_beta",
      parseId: "parse_beta_v1",
      rawUrl: "https://other.example.org/post",
      normalizedUrl: "https://other.example.org/post",
      domain: "other.example.org",
      title: null,
      position: null,
      sourceOwnership: "UNKNOWN",
      matchedPublicationReceiptId: null,
    };
    expect(citationWithoutOptionalFields.title).toBeNull();
    expect(citationWithoutOptionalFields.position).toBeNull();
    expect(
      citationWithoutOptionalFields.matchedPublicationReceiptId,
    ).toBeNull();
  });
});
