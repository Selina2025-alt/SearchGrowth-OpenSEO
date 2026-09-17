import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GeoObservationRun } from "@/types/schemas/geo-observation-run";
import {
  GeoMeasurementCohortIdentityError,
  guardGeoMeasurementCohortIdentity,
  type GeoMeasurementCohortMember,
} from "./geoMeasurementCohortIdentityGuard";
import {
  GeoObservationCohortMemberProjectionError,
  projectGeoObservationCohortMembers,
  type GeoObservationCohortMemberProjection,
} from "./geoObservationCohortMemberProjector";

// Invariants under test (07_GEO_MEASUREMENT_SPEC.md §§1, 2, 4, 7;
// 05_DOMAIN_DATA_MODEL.md §§2, 6; ADR-003, ADR-005):
//   - every stored run row projects to one member, in the caller's order, with
//     the six stored identity columns copied verbatim (`id` to `runId`);
//   - the caller's own row array comes back by identity, and duplicates,
//     ordering, and row objects are untouched — nothing is filtered, sorted,
//     de-duplicated, counted, or defaulted;
//   - an unusable stored `marketProfileId` or `modelVersion` rejects with the
//     projector's typed error naming the row index and column, so no partial or
//     repaired projection escapes;
//   - the accepted T151 guard is the cohort authority: an empty list, an
//     unsupported surface, a cross-context member, or a malformed `model` or
//     other column the projector does not own is rejected by the guard's own
//     typed error, propagated unchanged;
//   - repeated calls are deterministic and mutate nothing;
//   - the shipped service projects and delegates only — it reaches no storage,
//     reader, provider, parser, cache, raw evidence, aggregation, or metric
//     (source boundary).

/** The six stored columns the projector copies, as the row type exposes them. */
type SourceRow = Pick<
  GeoObservationRun,
  | "id"
  | "projectId"
  | "marketProfileId"
  | "surfaceType"
  | "model"
  | "modelVersion"
>;

/** The five member fields a T151 cohort must agree on. */
const COHORT_FIELDS = [
  "projectId",
  "marketProfileId",
  "surfaceType",
  "model",
  "modelVersion",
] as const;

/** The six member fields, in the order the projector writes them. */
const MEMBER_FIELDS = [
  "runId",
  "projectId",
  "marketProfileId",
  "surfaceType",
  "model",
  "modelVersion",
] as const;

/** A compatible stored row, defaulted to the same cohort as `makeMember`. */
function makeRow(overrides: Partial<SourceRow> = {}): GeoObservationRun {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the projector reads only these six stored columns, so a full stored row is not needed to exercise it
  return {
    id: "run_1",
    projectId: "proj_1",
    marketProfileId: "market_1",
    surfaceType: "MODEL_API_SEARCH",
    model: "gpt-5",
    modelVersion: "2026-09-01",
    ...overrides,
  } as unknown as GeoObservationRun;
}

/** A stored row built from arbitrary runtime overrides, as at a boundary. */
function makeOverriddenRow(
  overrides: Record<string, unknown>,
): GeoObservationRun {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted stored row is exactly what the projector must reject
  return { ...makeRow(), ...overrides } as unknown as GeoObservationRun;
}

/** A rows argument that may not be a list at all, as at runtime. */
function makeUntrustedRows(value: unknown): readonly GeoObservationRun[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the projector must reject
  return value as readonly GeoObservationRun[];
}

/** The six-identifier T151 contract, defaulted to one compatible member. */
function makeMember(
  overrides: Partial<GeoMeasurementCohortMember> = {},
): GeoMeasurementCohortMember {
  return {
    runId: "run_1",
    projectId: "proj_1",
    marketProfileId: "market_1",
    surfaceType: "MODEL_API_SEARCH",
    model: "gpt-5",
    modelVersion: "2026-09-01",
    ...overrides,
  };
}

/** A member that does not respect the TypeScript contract, as at runtime. */
function makeUntrustedMember(
  overrides: Record<string, unknown>,
): GeoMeasurementCohortMember {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted caller is exactly what the T151 guard must reject
  return {
    ...makeMember(),
    ...overrides,
  } as unknown as GeoMeasurementCohortMember;
}

/** A second, still well-formed value for each cohort-defining field. */
const OTHER_COHORT_VALUE: Pick<SourceRow, (typeof COHORT_FIELDS)[number]> = {
  projectId: "proj_2",
  marketProfileId: "market_2",
  surfaceType: "CONSUMER_PRODUCT_OBSERVED",
  model: "gpt-5-mini",
  modelVersion: "2026-10-01",
};

/** A second-cohort member differing from `makeMember` in exactly one field. */
function makeOtherCohortMember(
  field: (typeof COHORT_FIELDS)[number],
): GeoMeasurementCohortMember {
  const overrides: Record<string, unknown> = { runId: "run_2" };
  overrides[field] = OTHER_COHORT_VALUE[field];
  return makeUntrustedMember(overrides);
}

/** A second-cohort row differing from `makeRow` in exactly one column. */
function makeOtherCohortRow(
  field: (typeof COHORT_FIELDS)[number],
): GeoObservationRun {
  const overrides: Record<string, unknown> = { id: "run_2" };
  overrides[field] = OTHER_COHORT_VALUE[field];
  return makeOverriddenRow(overrides);
}

/** The rejection the accepted T151 guard produces for `members`. */
function guardRejection(
  members: readonly GeoMeasurementCohortMember[],
): GeoMeasurementCohortIdentityError {
  try {
    guardGeoMeasurementCohortIdentity(members);
  } catch (error) {
    if (error instanceof GeoMeasurementCohortIdentityError) return error;
    throw error;
  }
  throw new Error("expected the T151 guard to reject the member list");
}

/** The projector's rejection of `rows`, or a failure if it accepted them. */
function projectionRejection(
  rows: readonly GeoObservationRun[],
): GeoObservationCohortMemberProjectionError {
  try {
    projectGeoObservationCohortMembers(rows);
  } catch (error) {
    if (error instanceof GeoObservationCohortMemberProjectionError)
      return error;
    throw error;
  }
  throw new Error("expected the projector to reject the stored rows");
}

/**
 * Assert the projector rejects `rows` with exactly the accepted T151 rejection
 * for the equivalent member list, and return it. A call that returns normally
 * fails the test, which is the fail-closed evidence: a rejected cohort yields no
 * projection at all.
 */
function expectPropagatedRejection(
  rows: readonly GeoObservationRun[],
  members: readonly GeoMeasurementCohortMember[],
): GeoMeasurementCohortIdentityError {
  const expected = guardRejection(members);
  let raised: unknown;
  try {
    projectGeoObservationCohortMembers(rows);
  } catch (error) {
    raised = error;
  }
  if (!(raised instanceof GeoMeasurementCohortIdentityError)) {
    throw new Error("expected the projector to reject the stored rows");
  }
  expect(raised).toMatchObject({
    name: expected.name,
    message: expected.message,
    memberIndex: expected.memberIndex,
    field: expected.field,
  });
  return raised;
}

describe("projectGeoObservationCohortMembers", () => {
  it("projects every row in the caller's order, copying the six stored columns", () => {
    // A sorted or de-duplicated projection would reorder these ids.
    const rows = [
      makeRow({ id: "run_9" }),
      makeRow({ id: "run_1" }),
      makeRow({ id: "run_5" }),
    ];

    const projection = projectGeoObservationCohortMembers(rows);

    expect(projection.members).toEqual([
      makeMember({ runId: "run_9" }),
      makeMember({ runId: "run_1" }),
      makeMember({ runId: "run_5" }),
    ]);
    expect(projection.members.map((member) => member.runId)).toEqual([
      "run_9",
      "run_1",
      "run_5",
    ]);
  });

  it("copies each stored column verbatim, without trimming or normalizing", () => {
    const rows = [
      makeRow({
        id: " run_1 ",
        projectId: "proj_1\n",
        marketProfileId: " market_1 ",
        surfaceType: "MANUAL_CONSUMER_OBSERVATION",
        model: " gpt-5 ",
        modelVersion: "v1\n",
      }),
    ];

    const projection = projectGeoObservationCohortMembers(rows);

    expect(projection.members).toEqual([
      {
        runId: " run_1 ",
        projectId: "proj_1\n",
        marketProfileId: " market_1 ",
        surfaceType: "MANUAL_CONSUMER_OBSERVATION",
        model: " gpt-5 ",
        modelVersion: "v1\n",
      },
    ]);
  });

  it("carries exactly the six member fields and no stored evidence", () => {
    const projection = projectGeoObservationCohortMembers([makeRow()]);

    expect(Object.keys(projection.members[0])).toEqual([...MEMBER_FIELDS]);
    expect(projection.members[0]).not.toHaveProperty("batchId");
    expect(projection.members[0]).not.toHaveProperty("rawAnswer");
  });

  it("projects a single row, which has no cohort to contradict it", () => {
    const rows = [makeRow()];

    const projection = projectGeoObservationCohortMembers(rows);

    expect(projection.members).toEqual([makeMember()]);
    expect(projection.rows).toBe(rows);
  });

  it("returns the caller's row list by identity beside a new member list", () => {
    const rows = [makeRow({ id: "run_1" }), makeRow({ id: "run_2" })];

    const projection = projectGeoObservationCohortMembers(rows);

    // The caller's own array and rows are what come back, untouched.
    expect(projection.rows).toBe(rows);
    expect(projection.rows[0]).toBe(rows[0]);
    expect(projection.rows[1]).toBe(rows[1]);
    // Members are projections of those rows, never the rows themselves.
    expect(projection.members).not.toBe(rows);
    expect(projection.members[0]).not.toBe(rows[0]);
    expect(projection.members).toHaveLength(rows.length);
  });

  it("preserves duplicates instead of de-duplicating or filtering them", () => {
    const repeated = makeRow();
    const rows = [repeated, repeated, makeRow({ id: "run_2" })];

    const projection = projectGeoObservationCohortMembers(rows);

    expect(projection.members.map((member) => member.runId)).toEqual([
      "run_1",
      "run_1",
      "run_2",
    ]);
  });

  it("is deterministic across repeated calls and mutates nothing", () => {
    const rows = [makeRow({ id: "run_1" }), makeRow({ id: "run_2" })];
    const expected = [
      makeMember({ runId: "run_1" }),
      makeMember({ runId: "run_2" }),
    ];
    const before = structuredClone(rows);

    const projections: GeoObservationCohortMemberProjection[] = [
      projectGeoObservationCohortMembers(rows),
      projectGeoObservationCohortMembers(rows),
      projectGeoObservationCohortMembers(rows),
    ];

    expect(projections).toEqual([
      { rows, members: expected },
      { rows, members: expected },
      { rows, members: expected },
    ]);
    expect(projections.every((projection) => projection.rows === rows)).toBe(
      true,
    );
    expect(rows).toEqual(before);
    expect(Object.keys(rows[0])).toEqual([
      "id",
      "projectId",
      "marketProfileId",
      "surfaceType",
      "model",
      "modelVersion",
    ]);
  });
});

describe("projectGeoObservationCohortMembers rejections", () => {
  it("rejects an unusable stored identity column, naming the row and column", () => {
    for (const field of ["marketProfileId", "modelVersion"] as const) {
      for (const value of [
        undefined,
        null,
        "",
        "   ",
        "\n",
        42,
        true,
        {},
        [],
      ]) {
        const rejection = projectionRejection([
          makeRow({ id: "run_1" }),
          makeOverriddenRow({ id: "run_2", [field]: value }),
        ]);
        expect(rejection.rowIndex).toBe(1);
        expect(rejection.field).toBe(field);
        expect(rejection.message).toBe(
          `GEO observation cohort member projection: row 1 ${field} must be a non-empty string.`,
        );
      }
    }
  });

  it("propagates a malformed stored model to the T151 guard instead of rejecting it", () => {
    // `model` is nullable in storage, but the projector copies it as stored and
    // the guard, not the projector, owns rejecting it.
    for (const value of [undefined, null, "", "   ", "\n", 42, true, {}, []]) {
      const rejection = expectPropagatedRejection(
        [makeOverriddenRow({ id: "run_1", model: value })],
        [makeUntrustedMember({ runId: "run_1", model: value })],
      );
      expect([rejection.memberIndex, rejection.field]).toEqual([0, "model"]);
    }
  });

  it("names the first offending row, not a hard-coded index", () => {
    const rejection = projectionRejection([
      makeOverriddenRow({ id: "run_1", modelVersion: null }),
      makeOverriddenRow({ id: "run_2", modelVersion: null }),
    ]);

    expect(rejection.rowIndex).toBe(0);
    expect(rejection.field).toBe("modelVersion");
  });

  it("rejects a row that is not an object at all", () => {
    for (const value of [null, 42, "run_1", true, []]) {
      const rejection = projectionRejection(
        makeUntrustedRows([makeRow({ id: "run_1" }), value]),
      );
      expect(rejection.rowIndex).toBe(1);
      expect(rejection.field).toBe("row");
    }
  });

  it("rejects an argument that is not a list before projecting anything", () => {
    for (const value of [
      null,
      undefined,
      42,
      "rows",
      true,
      {},
      makeRow(),
      new Set([makeRow()]),
    ]) {
      const rejection = projectionRejection(makeUntrustedRows(value));
      expect(rejection.rowIndex).toBeNull();
      expect(rejection.field).toBe("rows");
    }
  });

  it("propagates an empty row list to the T151 guard unchanged", () => {
    // T151 owns the non-empty-cohort rule, so the projector does not pre-empt it.
    expectPropagatedRejection([], []);
  });

  it("propagates every cross-context row to the T151 guard unchanged", () => {
    for (const field of COHORT_FIELDS) {
      const rejection = expectPropagatedRejection(
        [makeRow({ id: "run_1" }), makeOtherCohortRow(field)],
        [makeMember({ runId: "run_1" }), makeOtherCohortMember(field)],
      );
      expect({
        memberIndex: rejection.memberIndex,
        field: rejection.field,
      }).toEqual({ memberIndex: 1, field });
    }
  });

  it("propagates an unsupported surface and malformed non-nullable columns unchanged", () => {
    expectPropagatedRejection(
      [makeOverriddenRow({ id: "run_1", surfaceType: "UNSUPPORTED_SURFACE" })],
      [
        makeUntrustedMember({
          runId: "run_1",
          surfaceType: "UNSUPPORTED_SURFACE",
        }),
      ],
    );
    expectPropagatedRejection(
      [makeOverriddenRow({ id: "run_1", surfaceType: undefined })],
      [makeUntrustedMember({ runId: "run_1", surfaceType: undefined })],
    );
    expectPropagatedRejection(
      [makeOverriddenRow({ id: undefined })],
      [makeUntrustedMember({ runId: undefined })],
    );
    expectPropagatedRejection(
      [makeOverriddenRow({ id: "run_1", projectId: 42 })],
      [makeUntrustedMember({ runId: "run_1", projectId: 42 })],
    );
  });
});

const SERVICE_SOURCE =
  "src/server/features/search-growth/geo/services/geoObservationCohortMemberProjector.ts";

describe("observation cohort member projector source boundary", () => {
  const source = readFileSync(SERVICE_SOURCE, "utf8");
  // Comments are stripped for the call-shape assertions, so documentation that
  // names an API or a field cannot be mistaken for a use of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("depends only on the accepted T151 guard, the row type, and zod", () => {
    expect(
      [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]),
    ).toEqual([
      "zod",
      "@/types/schemas/geo-observation-run",
      "./geoMeasurementCohortIdentityGuard",
    ]);
    expect(source).not.toMatch(
      /@\/db|drizzle|node:fs|process\.env|fetch\(|console\./,
    );
  });

  it("hands the projected members to the accepted guard exactly once", () => {
    expect(code.match(/guardGeoMeasurementCohortIdentity\(/g)).toHaveLength(1);
    expect(code).not.toMatch(/\.parse\(/);
  });

  it("reads only the six stored identity columns and no other stored field", () => {
    expect(code.match(/\.map\(/g)).toHaveLength(1);
    expect(code).not.toMatch(
      /rawAnswer|rawResponse|providerRequestId|batchId|promptId|promptVersion|fidelity|surfaceName|repeatIndex|startedAt|finishedAt|status|webSearch|searchMode|engine|provider|usage/,
    );
  });

  it("filters, sorts, de-duplicates, counts, aggregates, and measures nothing", () => {
    expect(code).not.toMatch(
      /\.filter\(|\.reduce\(|\.sort\(|\.toSorted\(|new Set\(|new Map\(|Math\.|\.length/,
    );
    expect(code).not.toMatch(
      /aggregat|sample|percent|numerator|denominator|confidence|significan|\brate\b|\bratio\b|dedupe|distinct|metric|cache/,
    );
  });

  it("swallows no failure, coerces nothing, and defaults nothing", () => {
    expect(code).not.toMatch(/\btry\b|\bcatch\b|\?\?/);
    expect(code).not.toMatch(
      /parseInt|parseFloat|Number\(|String\(|Boolean\(|Object\.assign|Object\.fromEntries|\.trim\(|\.toLowerCase\(|\.toUpperCase\(|\.normalize\(|\.replace\(/,
    );
  });
});
