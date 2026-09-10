import { describe, expect, it } from "vitest";
import type { ReleaseBundle } from "./release-bundle";
import { releaseBundleSchema } from "./release-bundle";

// The ReleaseBundle domain boundary must carry the direct fields of the
// immutable Project-scoped approval unit verbatim, narrow the two
// source-defined unions (lifecycle status, release strategy) and reject a row
// that is missing any required direct field. `utmPolicyJson` is an opaque
// required JSON string: the boundary never parses it into a relational model
// (TASK item 1; 21_TEST_ACCEPTANCE_PLAN.md §12).
const UTM_POLICY_JSON = JSON.stringify({
  source: "search_growth",
  medium: "organic_social",
  campaign: "rfq_procurement",
});

const VALID_BUNDLE = {
  id: "bundle_alpha_1",
  projectId: "proj_alpha",
  contentPackageVersionId: "ver_alpha_1",
  releaseVersion: 1,
  status: "READY_FOR_APPROVAL",
  releaseStrategy: "WEBSITE_FIRST",
  utmPolicyJson: UTM_POLICY_JSON,
  bundleHash: "sha256-bundle-1",
  dryRunReportJson: null,
  approvedBy: null,
  approvedAt: null,
  createdAt: "2026-09-10T05:00:00.000Z",
} as const;

describe("ReleaseBundle domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = releaseBundleSchema.parse(VALID_BUNDLE);
    expect(parsed).toEqual(VALID_BUNDLE);
    // The opaque UTM policy document is carried as the exact JSON string and is
    // never decomposed at this boundary.
    expect(parsed.utmPolicyJson).toBe(UTM_POLICY_JSON);
  });

  it("accepts an approved bundle with the optional dry-run report and approval fields set", () => {
    const dryRunReportJson = JSON.stringify({ status: "PASSED", targets: 3 });
    const parsed = releaseBundleSchema.parse({
      ...VALID_BUNDLE,
      status: "APPROVED",
      dryRunReportJson,
      approvedBy: "user_1",
      approvedAt: "2026-09-10T06:00:00.000Z",
    });
    expect(parsed).toMatchObject({
      status: "APPROVED",
      dryRunReportJson,
      approvedBy: "user_1",
      approvedAt: "2026-09-10T06:00:00.000Z",
    });
  });

  it("accepts every source-defined lifecycle status and release strategy", () => {
    for (const status of [
      "DRAFT",
      "DRY_RUN_READY",
      "READY_FOR_APPROVAL",
      "APPROVED",
      "EXECUTING",
      "COMPLETED",
      "PARTIAL",
      "PAUSED",
      "CANCELLED",
    ]) {
      expect(
        releaseBundleSchema.safeParse({ ...VALID_BUNDLE, status }).success,
      ).toBe(true);
    }
    for (const releaseStrategy of [
      "WEBSITE_FIRST",
      "PARALLEL",
      "SOCIAL_ONLY",
    ]) {
      expect(
        releaseBundleSchema.safeParse({ ...VALID_BUNDLE, releaseStrategy })
          .success,
      ).toBe(true);
    }
  });

  it("rejects a status or release strategy outside the source-defined union", () => {
    // "PUBLISHED" must never be accepted as a release lifecycle value.
    expect(
      releaseBundleSchema.safeParse({ ...VALID_BUNDLE, status: "PUBLISHED" })
        .success,
    ).toBe(false);
    expect(
      releaseBundleSchema.safeParse({
        ...VALID_BUNDLE,
        releaseStrategy: "WEBSITE_ONLY",
      }).success,
    ).toBe(false);
  });

  it("rejects a row missing any required direct field", () => {
    for (const field of Object.keys(VALID_BUNDLE)) {
      const rest: Record<string, unknown> = { ...VALID_BUNDLE };
      delete rest[field];
      expect(releaseBundleSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("rejects a non-integer release version", () => {
    expect(
      releaseBundleSchema.safeParse({ ...VALID_BUNDLE, releaseVersion: 1.5 })
        .success,
    ).toBe(false);
  });

  it("exports a row type matching the direct storage shape only", () => {
    // Compile-time guard: the domain type later release orchestration/approval
    // tasks import carries the direct fields and the append-only createdAt, and
    // no updatedAt / target / execution / receipt / publishing field.
    const bundle: ReleaseBundle = { ...VALID_BUNDLE };
    expect(bundle.status).toBe("READY_FOR_APPROVAL");
    expect(bundle.projectId).toBe("proj_alpha");
    expect("updatedAt" in bundle).toBe(false);
    expect("targets" in bundle).toBe(false);
  });
});
