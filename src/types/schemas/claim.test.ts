import { describe, expect, it } from "vitest";
import { claims } from "@/db/search-growth.schema";
import type {
  Claim,
  ClaimAllowedLanguage,
  ClaimAllowedMarketProfile,
  ClaimClassification,
  ClaimSourceRef,
  ClaimStatus,
} from "./claim";
import { claimClassificationSchema, claimStatusSchema } from "./claim";

// The DB text-enum columns and the Zod boundary must not drift: a value the Zod
// schema accepts has to be a value the column type admits, and vice versa.
// Drift here would let future repositories write a claim status/classification
// the domain boundary never validated. There is intentionally no implicit/
// lowercase/OTHER fallback (05_DOMAIN_DATA_MODEL.md §9 Claim). The legacy
// reference unions in schemas/domain-types.ts (ClaimStatus, DataClassification)
// are identical to the §9 unions, so there is no legacy variant to reject here —
// the rejection list covers case-mismatched, unsupported and empty values.
describe("Claim domain boundary", () => {
  it("lists every status and classification column value as a valid Claim value", () => {
    for (const status of claims.status.enumValues) {
      expect(claimStatusSchema.safeParse(status).success).toBe(true);
    }
    for (const classification of claims.classification.enumValues) {
      expect(claimClassificationSchema.safeParse(classification).success).toBe(
        true,
      );
    }
  });

  it("rejects case-mismatched, unsupported and empty statuses/classifications", () => {
    for (const status of [
      // Case-mismatched variants of the approved uppercase values.
      "approved",
      "Approved",
      "unverified",
      "Unverified",
      "expired",
      "Expired",
      "rejected",
      "Rejected",
      "APPROVED ",
      // Unsupported statuses.
      "VERIFIED",
      "PENDING",
      "DRAFT",
      "NONE",
      "",
    ]) {
      expect(claimStatusSchema.safeParse(status).success).toBe(false);
    }
    for (const classification of [
      // Case-mismatched variants of the approved uppercase values.
      "public_marketing",
      "Public_Marketing",
      "internal",
      "Internal",
      "restricted",
      "Restricted",
      "PUBLIC_MARKETING ",
      // Unsupported classifications.
      "PUBLIC",
      "MARKETING",
      "CONFIDENTIAL",
      "PRIVATE",
      "UNKNOWN",
      "",
    ]) {
      expect(claimClassificationSchema.safeParse(classification).success).toBe(
        false,
      );
    }
  });

  it("exports row/enum types aligned with the storage columns", () => {
    // Compile-time guard: the domain types later Claim/Content tasks will import
    // must stay true to the storage enums and the select row shapes — the claim
    // with its required Project binding/claim_text/status/classification, its
    // nullable verification fields and its system timestamps, and the two
    // normalized link rows with their identity columns plus the append-only
    // created_at only (no mutable evidence payload, no market-selection payload,
    // no JSON array column).
    const status: ClaimStatus = "UNVERIFIED";
    const classification: ClaimClassification = "PUBLIC_MARKETING";
    const claim: Pick<
      Claim,
      | "id"
      | "projectId"
      | "claimText"
      | "status"
      | "verifiedBy"
      | "lastVerifiedAt"
      | "expiresAt"
      | "classification"
      | "createdAt"
      | "updatedAt"
    > = {
      id: "claim_alpha_1",
      projectId: "project_alpha",
      claimText: "Example.com is the fastest provider.",
      status,
      verifiedBy: null,
      lastVerifiedAt: null,
      expiresAt: null,
      classification,
      createdAt: "2026-09-08T04:00:05.000Z",
      updatedAt: "2026-09-08T04:00:05.000Z",
    };
    expect(claim.claimText).toBe("Example.com is the fastest provider.");
    expect(claim.status).toBe("UNVERIFIED");
    expect(claim.classification).toBe("PUBLIC_MARKETING");
    // The source link row exposes only the normalized identity plus created_at.
    const link: Pick<
      ClaimSourceRef,
      "id" | "projectId" | "claimId" | "sourceRefId" | "createdAt"
    > = {
      id: "claim_source_link_1",
      projectId: "project_alpha",
      claimId: "claim_alpha_1",
      sourceRefId: "source_ref_alpha_1",
      createdAt: "2026-09-08T04:00:05.000Z",
    };
    expect(link.claimId).toBe("claim_alpha_1");
    expect(link.sourceRefId).toBe("source_ref_alpha_1");
    // The allowed-market link row exposes only the normalized identity plus
    // created_at (the §9 `allowed_markets[]` relation shape).
    const marketLink: Pick<
      ClaimAllowedMarketProfile,
      "id" | "projectId" | "claimId" | "marketProfileId" | "createdAt"
    > = {
      id: "claim_allowed_market_link_1",
      projectId: "project_alpha",
      claimId: "claim_alpha_1",
      marketProfileId: "market_profile_alpha_1",
      createdAt: "2026-09-08T04:00:05.000Z",
    };
    expect(marketLink.claimId).toBe("claim_alpha_1");
    expect(marketLink.marketProfileId).toBe("market_profile_alpha_1");
    // The allowed-language link row exposes only the normalized identity plus
    // the opaque language tag plus created_at (the §9 `allowed_languages[]`
    // relation shape).
    const languageLink: Pick<
      ClaimAllowedLanguage,
      "id" | "projectId" | "claimId" | "language" | "createdAt"
    > = {
      id: "claim_allowed_language_link_1",
      projectId: "project_alpha",
      claimId: "claim_alpha_1",
      language: "zh-CN",
      createdAt: "2026-09-08T04:00:05.000Z",
    };
    expect(languageLink.claimId).toBe("claim_alpha_1");
    expect(languageLink.language).toBe("zh-CN");
    // Every approved V1.0 value round-trips at the boundary.
    for (const approved of [
      "APPROVED",
      "UNVERIFIED",
      "EXPIRED",
      "REJECTED",
    ] as const) {
      expect(claimStatusSchema.safeParse(approved).success).toBe(true);
    }
    for (const approved of [
      "PUBLIC_MARKETING",
      "INTERNAL",
      "RESTRICTED",
    ] as const) {
      expect(claimClassificationSchema.safeParse(approved).success).toBe(true);
    }
  });
});
