import { describe, expect, it } from "vitest";
import type { ExperimentSnapshot } from "./experiment-snapshot";
import { experimentSnapshotSchema } from "./experiment-snapshot";

// The ExperimentSnapshot domain boundary carries the direct fields of the
// immutable, Project-scoped measurement snapshot: the required Experiment
// relation, the source-defined snapshot taxonomy, the capture timestamp, the
// optional window/timezone/note context and the six required JSON documents.
// The row exposes the append-only createdAt only — no updatedAt and no computed
// attribution/comparison/lifecycle field (TASK GOAL / item 1).
const VALID_SNAPSHOT = {
  id: "snap_alpha_1",
  projectId: "proj_alpha",
  experimentId: "exp_alpha",
  snapshotType: "D14",
  capturedAt: "2026-09-10T05:00:00.000Z",
  windowStart: "2026-08-27T00:00:00.000Z",
  windowEnd: "2026-09-10T00:00:00.000Z",
  timezone: "Asia/Shanghai",
  seoMetricsJson: '{"clicks":120,"impressions":3400}',
  geoMetricsJson: '{"mentioned":true,"recommended":true}',
  ga4MetricsJson: '{"sessions":88,"keyEvents":11}',
  publicationMetricsJson: '{"publicTargets":3,"verified":3}',
  indexingMetricsJson: '{"google":"INDEXED","baidu":"NOT_CONFIGURED"}',
  dataQualityJson: '{"status":"OK","warnings":[]}',
  notes: "post14 vs pre14 comparison window",
  createdAt: "2026-09-10T05:00:01.000Z",
} as const;

describe("ExperimentSnapshot domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = experimentSnapshotSchema.parse(VALID_SNAPSHOT);
    expect(parsed).toEqual(VALID_SNAPSHOT);
    // The window context and JSON documents are carried exactly, never
    // normalized, decomposed or computed by the boundary.
    expect(parsed.timezone).toBe("Asia/Shanghai");
    expect(parsed.dataQualityJson).toBe(VALID_SNAPSHOT.dataQualityJson);
  });

  it("accepts every source-defined snapshot type and rejects others", () => {
    for (const snapshotType of [
      "BASELINE",
      "D7",
      "D14",
      "D30",
      "MANUAL",
    ] as const) {
      const parsed = experimentSnapshotSchema.parse({
        ...VALID_SNAPSHOT,
        snapshotType,
      });
      expect(parsed.snapshotType).toBe(snapshotType);
    }
    for (const snapshotType of ["T0", "baseline", "D1", ""]) {
      expect(
        experimentSnapshotSchema.safeParse({
          ...VALID_SNAPSHOT,
          snapshotType,
        }).success,
      ).toBe(false);
    }
  });

  it("accepts NULL for the optional window, timezone and notes", () => {
    const parsed = experimentSnapshotSchema.parse({
      ...VALID_SNAPSHOT,
      windowStart: null,
      windowEnd: null,
      timezone: null,
      notes: null,
    });
    expect(parsed.windowStart).toBeNull();
    expect(parsed.windowEnd).toBeNull();
    expect(parsed.timezone).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("requires the experiment relation and rejects a missing optional key", () => {
    const noExperiment: Record<string, unknown> = { ...VALID_SNAPSHOT };
    delete noExperiment.experimentId;
    expect(experimentSnapshotSchema.safeParse(noExperiment).success).toBe(
      false,
    );

    const noWindowKey: Record<string, unknown> = { ...VALID_SNAPSHOT };
    delete noWindowKey.windowStart;
    expect(experimentSnapshotSchema.safeParse(noWindowKey).success).toBe(false);
  });

  it("rejects a row missing any direct field", () => {
    for (const field of Object.keys(VALID_SNAPSHOT)) {
      const rest: Record<string, unknown> = { ...VALID_SNAPSHOT };
      delete rest[field];
      expect(experimentSnapshotSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("rejects non-string opaque values and non-string JSON documents", () => {
    expect(
      experimentSnapshotSchema.safeParse({
        ...VALID_SNAPSHOT,
        notes: 42,
      }).success,
    ).toBe(false);

    expect(
      experimentSnapshotSchema.safeParse({
        ...VALID_SNAPSHOT,
        capturedAt: null,
      }).success,
    ).toBe(false);

    expect(
      experimentSnapshotSchema.safeParse({
        ...VALID_SNAPSHOT,
        seoMetricsJson: { clicks: 120 },
      }).success,
    ).toBe(false);
  });

  it("exports a row type matching the direct storage shape only", () => {
    // Compile-time guard: the domain type later Experiment measurement tasks
    // import carries the direct fields plus the append-only createdAt, and no
    // updatedAt / computed attribution / comparison / lifecycle field.
    const snapshot: ExperimentSnapshot = { ...VALID_SNAPSHOT };
    expect(snapshot.experimentId).toBe("exp_alpha");
    expect(snapshot.snapshotType).toBe("D14");
    expect("updatedAt" in snapshot).toBe(false);
    expect("attributionJson" in snapshot).toBe(false);
    expect("uplift" in snapshot).toBe(false);
    expect("recheckJobId" in snapshot).toBe(false);
    expect("credentialId" in snapshot).toBe(false);
  });
});
