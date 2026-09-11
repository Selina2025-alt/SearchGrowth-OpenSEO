import { describe, expect, it } from "vitest";
import type { Experiment } from "./experiment";
import { experimentSchema } from "./experiment";

// The Experiment domain boundary carries the direct fields of the Project-scoped
// experiment: the required Topic relation, the optional same-Project Opportunity
// and ReleaseBundle relations, the opaque status label, the one authoritative
// activation policy enum and the opaque reference/policy JSON documents. The row
// exposes the application activationAt plus the append-only createdAt only — no
// updatedAt and no snapshot/activation/execution field (TASK GOAL / item 1).
const VALID_EXPERIMENT = {
  id: "exp_alpha_1",
  projectId: "proj_alpha",
  topicId: "topic_alpha",
  opportunityId: "opp_alpha",
  releaseBundleId: "bundle_alpha",
  title: "Canonical refresh lifts AI citations",
  hypothesis: "Refreshing the canonical page improves D14 AI-citation rate.",
  status: "PLANNED",
  activationPolicy: "FIRST_REQUIRED_PUBLIC",
  activationAt: "2026-09-10T05:00:00.000Z",
  targetKeywordRefsJson: '{"keywordIds":["kw_alpha"]}',
  targetPromptRefsJson: '{"promptIds":["prompt_alpha"]}',
  targetSurfaceRefsJson: '{"surfaces":["MODEL_API_SEARCH"]}',
  recheckPolicyJson: '{"windows":["D7","D14","D30"]}',
  createdAt: "2026-09-10T05:00:01.000Z",
} as const;

describe("Experiment domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = experimentSchema.parse(VALID_EXPERIMENT);
    expect(parsed).toEqual(VALID_EXPERIMENT);
    // The opaque status label and the reference/policy documents are carried
    // exactly, never normalized or decomposed by the boundary.
    expect(parsed.status).toBe("PLANNED");
    expect(parsed.recheckPolicyJson).toBe(VALID_EXPERIMENT.recheckPolicyJson);
  });

  it("accepts every source-defined activation policy and rejects others", () => {
    for (const policy of [
      "FIRST_REQUIRED_PUBLIC",
      "ALL_REQUIRED_TERMINAL",
    ] as const) {
      const parsed = experimentSchema.parse({
        ...VALID_EXPERIMENT,
        activationPolicy: policy,
      });
      expect(parsed.activationPolicy).toBe(policy);
    }
    for (const policy of ["WEBSITE_FIRST", "first_required_public", ""]) {
      expect(
        experimentSchema.safeParse({
          ...VALID_EXPERIMENT,
          activationPolicy: policy,
        }).success,
      ).toBe(false);
    }
  });

  it("accepts NULL for the optional relations and the activation timestamp", () => {
    const parsed = experimentSchema.parse({
      ...VALID_EXPERIMENT,
      opportunityId: null,
      releaseBundleId: null,
      activationAt: null,
    });
    expect(parsed.opportunityId).toBeNull();
    expect(parsed.releaseBundleId).toBeNull();
    expect(parsed.activationAt).toBeNull();
  });

  it("requires the topic relation and rejects a missing optional key", () => {
    const noTopic: Record<string, unknown> = { ...VALID_EXPERIMENT };
    delete noTopic.topicId;
    expect(experimentSchema.safeParse(noTopic).success).toBe(false);

    const noOpportunityKey: Record<string, unknown> = { ...VALID_EXPERIMENT };
    delete noOpportunityKey.opportunityId;
    expect(experimentSchema.safeParse(noOpportunityKey).success).toBe(false);
  });

  it("rejects a row missing any direct field", () => {
    for (const field of Object.keys(VALID_EXPERIMENT)) {
      const rest: Record<string, unknown> = { ...VALID_EXPERIMENT };
      delete rest[field];
      expect(experimentSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("rejects non-string opaque values and non-string JSON documents", () => {
    expect(
      experimentSchema.safeParse({ ...VALID_EXPERIMENT, status: 42 }).success,
    ).toBe(false);

    expect(
      experimentSchema.safeParse({ ...VALID_EXPERIMENT, title: null }).success,
    ).toBe(false);

    expect(
      experimentSchema.safeParse({
        ...VALID_EXPERIMENT,
        recheckPolicyJson: { windows: ["D7"] },
      }).success,
    ).toBe(false);
  });

  it("exports a row type matching the direct storage shape only", () => {
    // Compile-time guard: the domain type later Experiment tasks import carries
    // the direct fields plus the append-only createdAt, and no updatedAt /
    // snapshot / activation-runtime / credential field.
    const experiment: Experiment = { ...VALID_EXPERIMENT };
    expect(experiment.topicId).toBe("topic_alpha");
    expect(experiment.activationPolicy).toBe("FIRST_REQUIRED_PUBLIC");
    expect("updatedAt" in experiment).toBe(false);
    expect("snapshotId" in experiment).toBe(false);
    expect("activationJobId" in experiment).toBe(false);
    expect("credentialId" in experiment).toBe(false);
  });
});
