import { describe, expect, it } from "vitest";
import type { PublicationExecutionPlan } from "./publication-execution-plan";
import { publicationExecutionPlanSchema } from "./publication-execution-plan";

// The PublicationExecutionPlan domain boundary must carry the direct fields of
// the immutable fixed plan verbatim, narrow the source-defined enums (route,
// finalizer strategy, fallback route) and validate the shape of the three plan
// documents. There is deliberately no account/credential, execution, approval,
// job or receipt field, and `planHash` is an opaque required string the boundary
// never parses (TASK items 1, 3–4).
const VALID_PLAN = {
  id: "plan_alpha_1",
  projectId: "proj_alpha",
  releaseTargetId: "target_alpha_1",
  route: "WECHATSYNC_STAGED_FINALIZE",
  draftStagerId: "wechatsync",
  finalizerId: "zhihu-same-draft-v1",
  finalizerStrategy: "IN_PAGE_WEB_API",
  executorVersion: "wechatsync-v1",
  requiredFieldsJson: '["account_id","title"]',
  constraintsSnapshotJson: '{"maxTitleLength":100}',
  verificationPolicyJson: '{"requirePublicUrl":true}',
  fallbackRoute: "YXER_NATIVE",
  planHash: "sha256-plan-1",
  createdAt: "2026-09-11T05:00:00.000Z",
} as const;

const ALL_ROUTES = [
  "OWNED_SITE",
  "WECHATSYNC_STAGED_FINALIZE",
  "YXER_NATIVE",
  "SOCIAL_AUTO_UPLOAD_NATIVE",
  "POSTIZ_NATIVE",
  "PAID_MEDIA_SERVICE",
] as const;

describe("PublicationExecutionPlan domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = publicationExecutionPlanSchema.parse(VALID_PLAN);
    expect(parsed).toEqual(VALID_PLAN);
    // The opaque plan hash is carried as the exact string, never decomposed.
    expect(parsed.planHash).toBe("sha256-plan-1");
  });

  it("accepts a minimal plan whose optional stager, finalizer, strategy and fallback are NULL", () => {
    const parsed = publicationExecutionPlanSchema.parse({
      ...VALID_PLAN,
      route: "OWNED_SITE",
      draftStagerId: null,
      finalizerId: null,
      finalizerStrategy: null,
      fallbackRoute: null,
      requiredFieldsJson: "[]",
      constraintsSnapshotJson: "{}",
      verificationPolicyJson: "{}",
    });
    expect(parsed).toMatchObject({
      route: "OWNED_SITE",
      draftStagerId: null,
      finalizerId: null,
      finalizerStrategy: null,
      fallbackRoute: null,
    });
  });

  it("accepts every source-defined route and valid fallback route", () => {
    for (const route of ALL_ROUTES) {
      expect(
        publicationExecutionPlanSchema.safeParse({ ...VALID_PLAN, route })
          .success,
      ).toBe(true);
      expect(
        publicationExecutionPlanSchema.safeParse({
          ...VALID_PLAN,
          fallbackRoute: route,
        }).success,
      ).toBe(true);
    }
    for (const finalizerStrategy of [
      "OFFICIAL_API",
      "IN_PAGE_WEB_API",
      "SERVICE_CLI",
      "FIXED_DOM",
    ]) {
      expect(
        publicationExecutionPlanSchema.safeParse({
          ...VALID_PLAN,
          finalizerStrategy,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects a route, finalizer strategy or fallback route outside the source-defined unions", () => {
    // "AUTO_PUBLISH" is not a distribution route.
    expect(
      publicationExecutionPlanSchema.safeParse({
        ...VALID_PLAN,
        route: "AUTO_PUBLISH",
      }).success,
    ).toBe(false);
    expect(
      publicationExecutionPlanSchema.safeParse({
        ...VALID_PLAN,
        fallbackRoute: "AUTO_PUBLISH",
      }).success,
    ).toBe(false);
    expect(
      publicationExecutionPlanSchema.safeParse({
        ...VALID_PLAN,
        finalizerStrategy: "BROWSER_AUTOMATION",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed JSON in any plan document", () => {
    for (const field of [
      "requiredFieldsJson",
      "constraintsSnapshotJson",
      "verificationPolicyJson",
    ] as const) {
      expect(
        publicationExecutionPlanSchema.safeParse({
          ...VALID_PLAN,
          [field]: "{not json",
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a plan document with the wrong shape", () => {
    // requiredFieldsJson is a JSON array of field-name strings.
    expect(
      publicationExecutionPlanSchema.safeParse({
        ...VALID_PLAN,
        requiredFieldsJson: '{"account_id":true}',
      }).success,
    ).toBe(false);
    expect(
      publicationExecutionPlanSchema.safeParse({
        ...VALID_PLAN,
        requiredFieldsJson: '["title",7]',
      }).success,
    ).toBe(false);
    // constraintsSnapshotJson / verificationPolicyJson are JSON objects.
    expect(
      publicationExecutionPlanSchema.safeParse({
        ...VALID_PLAN,
        constraintsSnapshotJson: "[1,2]",
      }).success,
    ).toBe(false);
    expect(
      publicationExecutionPlanSchema.safeParse({
        ...VALID_PLAN,
        verificationPolicyJson: "null",
      }).success,
    ).toBe(false);
  });

  it("rejects a row missing any required direct field", () => {
    for (const field of Object.keys(VALID_PLAN)) {
      const rest: Record<string, unknown> = { ...VALID_PLAN };
      delete rest[field];
      expect(publicationExecutionPlanSchema.safeParse(rest).success).toBe(
        false,
      );
    }
  });

  it("exports a row type matching the direct storage shape only", () => {
    // Compile-time guard: the domain type later distribution-planning tasks
    // import carries the direct fields plus the append-only createdAt, and no
    // updatedAt / account / credential / execution / approval / job / receipt
    // field.
    const plan: PublicationExecutionPlan = { ...VALID_PLAN };
    expect(plan.route).toBe("WECHATSYNC_STAGED_FINALIZE");
    expect(plan.projectId).toBe("proj_alpha");
    expect("updatedAt" in plan).toBe(false);
    expect("accountId" in plan).toBe(false);
    expect("publisherConnectionId" in plan).toBe(false);
    expect("status" in plan).toBe(false);
  });
});
