import { describe, expect, it } from "vitest";
import type { ReleaseTarget } from "./release-target";
import { releaseTargetSchema } from "./release-target";

// The ReleaseTarget domain boundary must carry the direct fields of the
// immutable Project-scoped target verbatim, narrow the one source-defined union
// (target intent) and reject a row missing any required direct field. The
// legacy `publisherConnectionId` is deliberately absent — the publisher
// connection relation belongs to a later gated credential-bound task (TASK item
// 3) — and `targetHash` is an opaque required string that the boundary never
// parses (TASK item 1).
const VALID_TARGET = {
  id: "target_alpha_1",
  projectId: "proj_alpha",
  releaseBundleId: "bundle_alpha_1",
  contentVariantId: "variant_alpha_1",
  platform: "zhihu",
  targetIntent: "PUBLIC",
  required: true,
  scheduledAt: "2026-09-11T05:00:00.000Z",
  dependencyTargetId: "target_website_1",
  utmUrl: "https://example.com/post?utm_source=search_growth",
  targetHash: "sha256-target-1",
  createdAt: "2026-09-10T05:00:00.000Z",
} as const;

describe("ReleaseTarget domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = releaseTargetSchema.parse(VALID_TARGET);
    expect(parsed).toEqual(VALID_TARGET);
    // The opaque target hash is carried as the exact string, never decomposed.
    expect(parsed.targetHash).toBe("sha256-target-1");
  });

  it("accepts a minimal target whose optional schedule, dependency and UTM URL are NULL", () => {
    const parsed = releaseTargetSchema.parse({
      ...VALID_TARGET,
      targetIntent: "DRAFT",
      required: false,
      scheduledAt: null,
      dependencyTargetId: null,
      utmUrl: null,
    });
    expect(parsed).toMatchObject({
      targetIntent: "DRAFT",
      required: false,
      scheduledAt: null,
      dependencyTargetId: null,
      utmUrl: null,
    });
  });

  it("accepts every source-defined target intent", () => {
    for (const targetIntent of [
      "DRAFT",
      "PUBLIC",
      "SUBMIT_FOR_REVIEW",
      "PAID_SUBMIT",
    ]) {
      expect(
        releaseTargetSchema.safeParse({ ...VALID_TARGET, targetIntent })
          .success,
      ).toBe(true);
    }
  });

  it("rejects a target intent outside the source-defined union", () => {
    // "PUBLISHED" is a publication outcome, never a target intent.
    expect(
      releaseTargetSchema.safeParse({
        ...VALID_TARGET,
        targetIntent: "PUBLISHED",
      }).success,
    ).toBe(false);
  });

  it("rejects a row missing any required direct field", () => {
    for (const field of Object.keys(VALID_TARGET)) {
      const rest: Record<string, unknown> = { ...VALID_TARGET };
      delete rest[field];
      expect(releaseTargetSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("rejects a non-boolean required flag", () => {
    expect(
      releaseTargetSchema.safeParse({ ...VALID_TARGET, required: 1 }).success,
    ).toBe(false);
  });

  it("exports a row type matching the direct storage shape only", () => {
    // Compile-time guard: the domain type later release orchestration tasks
    // import carries the direct fields plus the append-only createdAt, and no
    // updatedAt / publisher connection / account / execution / receipt field.
    const target: ReleaseTarget = { ...VALID_TARGET };
    expect(target.targetIntent).toBe("PUBLIC");
    expect(target.projectId).toBe("proj_alpha");
    expect("updatedAt" in target).toBe(false);
    expect("publisherConnectionId" in target).toBe(false);
    expect("accountId" in target).toBe(false);
  });
});
