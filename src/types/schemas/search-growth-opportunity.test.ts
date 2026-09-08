import { describe, expect, it } from "vitest";
import { searchGrowthOpportunities } from "@/db/search-growth.schema";
import {
  dataQualityStatusSchema,
  dataQualityWarningSchema,
  opportunityProfileSchema,
  pageFitActionSchema,
} from "./search-growth-opportunity";
import type {
  DataQualityStatus,
  DataQualityWarning,
  OpportunityProfile,
  PageFitAction,
  SearchGrowthOpportunity,
} from "./search-growth-opportunity";

// The DB text-enum columns and the Zod boundary must not drift: a value the
// Zod schema accepts has to be a value the column type admits, and vice versa.
// Drift here would let future repositories write a profile/page-fit action the
// domain boundary never validated. There is intentionally no
// implicit/lowercase/unknown fallback (05_DOMAIN_DATA_MODEL.md §8,
// schemas/domain-types.ts OpportunityProfile / PageFitAction /
// DataQuality). The DataQuality status/warning unions are boundary-only (the
// snapshot is opaque JSON text to the storage layer) and are pinned here to
// the canonical domain-types lists.
describe("SearchGrowthOpportunity domain boundary", () => {
  it("accepts every profile column value as a valid OpportunityProfile", () => {
    for (const profile of searchGrowthOpportunities.profile.enumValues) {
      expect(opportunityProfileSchema.safeParse(profile).success).toBe(true);
    }
  });

  it("accepts every page_fit_action column value as a valid PageFitAction", () => {
    for (const pageFitAction of searchGrowthOpportunities.pageFitAction
      .enumValues) {
      expect(pageFitActionSchema.safeParse(pageFitAction).success).toBe(true);
    }
  });

  it("rejects unsupported, case-mismatched and empty opportunity profiles", () => {
    for (const profile of [
      // Case-mismatched variants of the approved uppercase values.
      "existing_google_page",
      "Existing",
      "EXISTING_search_page_partial",
      "new_topic",
      "Geo_Distribution",
      "evidence_only",
      "technical_blocker",
      "EXISTING_GOOGLE_PAGE ",
      // Unsupported profile classifications.
      "TECHNICAL",
      "BLOCKER",
      "GOOGLE",
      "SEO",
      "RANKING",
      "CONTENT",
      "OPPORTUNITY",
      "NONE",
      "",
    ]) {
      expect(opportunityProfileSchema.safeParse(profile).success).toBe(false);
    }
  });

  it("rejects unsupported, case-mismatched and empty page-fit actions", () => {
    for (const pageFitAction of [
      // Case-mismatched variants of the approved uppercase values.
      "new_page",
      "Refresh",
      "refresh_page",
      "MERGE ",
      "distribute_only",
      "Evidence_Only",
      "technical_fix",
      "TECHNICAL_FIX ",
      // Unsupported page-fit actions.
      "REFRESH",
      "NEW",
      "UPDATE",
      "REWRITE",
      "DELETE",
      "NOOP",
      "",
    ]) {
      expect(pageFitActionSchema.safeParse(pageFitAction).success).toBe(false);
    }
  });

  it("accepts every canonical DataQuality status and rejects others", () => {
    for (const status of ["COMPLETE", "DEGRADED", "INSUFFICIENT"]) {
      expect(dataQualityStatusSchema.safeParse(status).success).toBe(true);
    }
    for (const status of [
      "complete",
      "Degraded",
      "PARTIAL",
      "UNKNOWN",
      "OK",
      "FAILED",
      "",
    ]) {
      expect(dataQualityStatusSchema.safeParse(status).success).toBe(false);
    }
  });

  it("accepts every canonical DataQuality warning and rejects others", () => {
    for (const warning of [
      "LOW_SAMPLE",
      "NO_GA4",
      "NO_GSC",
      "PROVIDER_PARTIAL_FAILURE",
      "MODEL_CHANGED",
      "SURFACE_CHANGED",
      "PARSER_CHANGED",
      "MARKET_CHANGED",
      "DATA_LAG",
    ]) {
      expect(dataQualityWarningSchema.safeParse(warning).success).toBe(true);
    }
    for (const warning of [
      "low_sample",
      "No_GA4",
      "NEW_SITE",
      "NO_DATA",
      "WARNING",
      "LOW_SAMPLE ",
      "",
    ]) {
      expect(dataQualityWarningSchema.safeParse(warning).success).toBe(false);
    }
  });

  it("exports row/enum types aligned with the storage columns", () => {
    // Compile-time guard: the domain type later opportunity tasks will import
    // must stay true to the storage enums and the select row shape — including
    // the nullable optional fields, the three immutable snapshot columns and
    // the system timestamps.
    const profile: OpportunityProfile = "NEW_TOPIC";
    const pageFitAction: PageFitAction = "NEW_PAGE";
    const dataQualityStatus: DataQualityStatus = "COMPLETE";
    const dataQualityWarning: DataQualityWarning = "NO_GA4";

    const opportunity: Pick<
      SearchGrowthOpportunity,
      | "id"
      | "projectId"
      | "topicId"
      | "marketProfileId"
      | "profile"
      | "pageFitAction"
      | "targetPageUrl"
      | "scoreJson"
      | "dataQualityJson"
      | "evidenceSnapshotJson"
      | "reason"
      | "recommendedAction"
      | "sourceSnapshotAt"
      | "createdAt"
      | "updatedAt"
    > = {
      id: "opportunity_alpha_1",
      projectId: "project_alpha",
      topicId: "topic_alpha",
      marketProfileId: null,
      profile,
      pageFitAction,
      targetPageUrl: null,
      scoreJson: JSON.stringify({
        businessFit: 80,
        buyingIntent: 65,
        executionEase: 90,
        finalScore: 78.4,
      }),
      dataQualityJson: JSON.stringify({
        status: dataQualityStatus,
        warnings: [dataQualityWarning],
      }),
      evidenceSnapshotJson: JSON.stringify({ claims: ["claim_1"] }),
      reason: "No existing page ranks for this topic.",
      recommendedAction: "Create a new page targeting the topic.",
      sourceSnapshotAt: "2026-09-08T04:00:05.000Z",
      createdAt: "2026-09-08T04:00:06.000Z",
      updatedAt: "2026-09-08T04:00:06.000Z",
    };
    expect(opportunity.profile).toBe("NEW_TOPIC");
    expect(opportunity.pageFitAction).toBe("NEW_PAGE");
    expect(opportunity.marketProfileId).toBeNull();
    expect(opportunity.targetPageUrl).toBeNull();
    expect(opportunity.recommendedAction).toContain("Create a new page");
    expect(dataQualityWarningSchema.safeParse("NO_GA4").success).toBe(true);
  });
});
