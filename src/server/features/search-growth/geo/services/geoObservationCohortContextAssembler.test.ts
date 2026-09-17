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
} from "./geoObservationCohortMemberProjector";
import { stampGeoMeasurementCohortContext } from "./geoMeasurementCohortContextStamp";
import {
  assembleGeoObservationCohortContext,
  type GeoObservationCohortContextAssembly,
} from "./geoObservationCohortContextAssembler";

// Invariants under test (07_GEO_MEASUREMENT_SPEC.md §§1, 2, 4, 7;
// 05_DOMAIN_DATA_MODEL.md §§2, 6; ADR-003, ADR-005):
//   - caller rows flow through the accepted T155 projector and T152 stamp, once
//     each, into the caller's own ordered rows, one member per row, and T152's
//     exact five-field structured context;
//   - the caller's row array comes back by identity and nothing is filtered,
//     sorted, de-duplicated, counted, or defaulted;
//   - the projector's own rejection for an unusable stored `marketProfileId` or
//     `modelVersion`, and every T151 rejection surfaced through either accepted
//     boundary (malformed `model`, unsupported surface, cross-context member,
//     empty list), propagates unchanged with no assembly, partial members, or
//     partial context;
//   - repeated calls are deterministic and mutate nothing;
//   - the shipped service composes and delegates only — it reaches no storage,
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

/** The five identifiers a stamped context must carry, and nothing else. */
const CONTEXT_FIELDS = [...COHORT_FIELDS];

/** Values that cannot be a present identifier, as at runtime. */
const UNUSABLE_VALUES = [undefined, null, "", "   ", "\n", 42, true, {}, []];

/** A compatible stored row, defaulted to the same cohort as `makeMember`. */
function makeRow(overrides: Partial<SourceRow> = {}): GeoObservationRun {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the assembler reads only these six stored columns, so a full stored row is not needed to exercise it
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
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted stored row is exactly what the accepted boundaries must reject
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

/** The five context fields, as a context object. */
function expectedContext(
  overrides: Partial<Record<(typeof CONTEXT_FIELDS)[number], string>> = {},
): Record<(typeof CONTEXT_FIELDS)[number], string> {
  const baseline = makeMember();
  return {
    projectId: baseline.projectId,
    marketProfileId: baseline.marketProfileId,
    surfaceType: baseline.surfaceType,
    model: baseline.model,
    modelVersion: baseline.modelVersion,
    ...overrides,
  };
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

/** The rejection the accepted T155 projector produces for `rows`. */
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

/** Run the assembler, returning whatever it threw, or `null` on success. */
function assemblyError(rows: readonly GeoObservationRun[]): unknown {
  try {
    assembleGeoObservationCohortContext(rows);
  } catch (error) {
    return error;
  }
  return null;
}

/**
 * Assert the assembler raised the accepted projector's own rejection for `rows`
 * at `rowIndex`, unchanged: no wrapping, no partial members, no assembly.
 */
function expectProjectorRejection(
  rows: readonly GeoObservationRun[],
  rowIndex: number | null,
): void {
  const expected = projectionRejection(rows);
  const raised = assemblyError(rows);
  expect(raised).toBeInstanceOf(GeoObservationCohortMemberProjectionError);
  expect(raised).toMatchObject({
    name: expected.name,
    message: expected.message,
    rowIndex: expected.rowIndex,
    field: expected.field,
  });
  expect(raised).toHaveProperty("rowIndex", rowIndex);
}

/**
 * Assert the assembler rejects `rows` with exactly the accepted T151 rejection
 * for the equivalent member list, and return it. A call that returns normally
 * fails the test, which is the fail-closed evidence: a rejected cohort yields no
 * assembly, no partial members, and no partial context.
 */
function expectPropagatedGuardRejection(
  rows: readonly GeoObservationRun[],
  members: readonly GeoMeasurementCohortMember[],
): GeoMeasurementCohortIdentityError {
  const expected = guardRejection(members);
  const raised = assemblyError(rows);
  if (!(raised instanceof GeoMeasurementCohortIdentityError)) {
    throw new Error("expected the assembler to reject the stored rows");
  }
  expect({
    name: raised.name,
    message: raised.message,
    memberIndex: raised.memberIndex,
    field: raised.field,
  }).toEqual({
    name: expected.name,
    message: expected.message,
    memberIndex: expected.memberIndex,
    field: expected.field,
  });
  return raised;
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

describe("assembleGeoObservationCohortContext", () => {
  it("composes every row in the caller's order into members and one baseline context", () => {
    // A sorted or de-duplicated composition would reorder these ids.
    const rows = [
      makeRow({ id: "run_9" }),
      makeRow({ id: "run_1" }),
      makeRow({ id: "run_5" }),
    ];

    const assembly = assembleGeoObservationCohortContext(rows);

    expect(assembly.members).toEqual([
      makeMember({ runId: "run_9" }),
      makeMember({ runId: "run_1" }),
      makeMember({ runId: "run_5" }),
    ]);
    expect(assembly.members.map((member) => member.runId)).toEqual([
      "run_9",
      "run_1",
      "run_5",
    ]);
    expect(assembly.context).toEqual(expectedContext());
  });

  it("returns the caller's row list by identity beside new validated members", () => {
    const rows = [makeRow({ id: "run_1" }), makeRow({ id: "run_2" })];

    const assembly = assembleGeoObservationCohortContext(rows);

    // The caller's own array and rows are what come back, untouched.
    expect(assembly.rows).toBe(rows);
    expect(assembly.rows[0]).toBe(rows[0]);
    expect(assembly.rows[1]).toBe(rows[1]);
    // Members are projections of those rows, never the rows themselves.
    expect(assembly.members).not.toBe(rows);
    expect(assembly.members[0]).not.toBe(rows[0]);
    expect(assembly.members).toHaveLength(rows.length);
  });

  it("preserves duplicates instead of de-duplicating or filtering them", () => {
    const repeated = makeRow();
    const rows = [repeated, repeated, makeRow({ id: "run_2" })];

    const assembly = assembleGeoObservationCohortContext(rows);

    expect(assembly.members.map((member) => member.runId)).toEqual([
      "run_1",
      "run_1",
      "run_2",
    ]);
  });

  it("carries exactly the five-field structured context and no run identity", () => {
    const assembly = assembleGeoObservationCohortContext([
      makeRow({ id: "run_7" }),
    ]);

    expect(new Set(Object.keys(assembly.context))).toEqual(
      new Set(CONTEXT_FIELDS),
    );
    expect(Object.keys(assembly.context)).toHaveLength(CONTEXT_FIELDS.length);
    expect(assembly.context).not.toHaveProperty("runId");
    expect(typeof assembly.context).toBe("object");
  });

  it("copies the context verbatim without trimming or normalizing it", () => {
    const rows = [
      makeRow({
        marketProfileId: " market_1 ",
        model: " gpt-5 ",
        modelVersion: "v1\n",
      }),
    ];

    const assembly = assembleGeoObservationCohortContext(rows);

    expect(assembly.context).toEqual(
      expectedContext({
        marketProfileId: " market_1 ",
        model: " gpt-5 ",
        modelVersion: "v1\n",
      }),
    );
  });

  it("returns exactly what the accepted T155 and T152 boundaries produce", () => {
    // The composition is checked against the two accepted collaborators run
    // independently, so this boundary cannot drift into a rule of its own.
    const rows = [makeRow({ id: "run_1" }), makeRow({ id: "run_2" })];
    const projection = projectGeoObservationCohortMembers(rows);
    const stamp = stampGeoMeasurementCohortContext(projection.members);

    const assembly = assembleGeoObservationCohortContext(rows);

    expect(assembly.rows).toBe(projection.rows);
    expect(assembly.members).toEqual(stamp.members);
    expect(assembly.context).toEqual(stamp.context);
  });

  it("is deterministic across repeated calls and mutates nothing", () => {
    const rows = [makeRow({ id: "run_1" }), makeRow({ id: "run_2" })];
    const expectedMembers = [
      makeMember({ runId: "run_1" }),
      makeMember({ runId: "run_2" }),
    ];
    const before = structuredClone(rows);

    const assemblies: GeoObservationCohortContextAssembly[] = [
      assembleGeoObservationCohortContext(rows),
      assembleGeoObservationCohortContext(rows),
      assembleGeoObservationCohortContext(rows),
    ];

    expect(assemblies).toEqual([
      { rows, members: expectedMembers, context: expectedContext() },
      { rows, members: expectedMembers, context: expectedContext() },
      { rows, members: expectedMembers, context: expectedContext() },
    ]);
    expect(assemblies.every((assembly) => assembly.rows === rows)).toBe(true);
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

describe("assembleGeoObservationCohortContext rejections", () => {
  it("propagates the projector's rejection of an unusable stored identity column unchanged", () => {
    for (const field of ["marketProfileId", "modelVersion"] as const) {
      for (const value of UNUSABLE_VALUES) {
        expectProjectorRejection(
          [
            makeRow({ id: "run_1" }),
            makeOverriddenRow({ id: "run_2", [field]: value }),
          ],
          1,
        );
      }
    }
  });

  it("propagates the projector's rejection of an argument that is not a list", () => {
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
      expectProjectorRejection(makeUntrustedRows(value), null);
    }
  });

  it("propagates a malformed stored model to the T151 guard unchanged", () => {
    // `model` is copied by the projector as stored; the guard, not the
    // assembler or projector, owns rejecting it.
    for (const value of [undefined, null, "", "   ", "\n", 42, true, {}, []]) {
      const rejection = expectPropagatedGuardRejection(
        [makeOverriddenRow({ id: "run_1", model: value })],
        [makeUntrustedMember({ runId: "run_1", model: value })],
      );
      expect([rejection.memberIndex, rejection.field]).toEqual([0, "model"]);
    }
  });

  it("propagates an unsupported surface to the T151 guard unchanged", () => {
    const rejection = expectPropagatedGuardRejection(
      [makeOverriddenRow({ id: "run_1", surfaceType: "UNSUPPORTED_SURFACE" })],
      [
        makeUntrustedMember({
          runId: "run_1",
          surfaceType: "UNSUPPORTED_SURFACE",
        }),
      ],
    );
    expect([rejection.memberIndex, rejection.field]).toEqual([
      0,
      "surfaceType",
    ]);
  });

  it("propagates every cross-context row to the T151 guard unchanged", () => {
    for (const field of COHORT_FIELDS) {
      const rejection = expectPropagatedGuardRejection(
        [makeRow({ id: "run_1" }), makeOtherCohortRow(field)],
        [makeMember({ runId: "run_1" }), makeOtherCohortMember(field)],
      );
      expect({
        memberIndex: rejection.memberIndex,
        field: rejection.field,
      }).toEqual({ memberIndex: 1, field });
    }
  });

  it("propagates an empty row list to the T151 guard unchanged", () => {
    // T151 owns the non-empty-cohort rule, so the assembler does not pre-empt it.
    expectPropagatedGuardRejection([], []);
  });
});

const SERVICE_SOURCE =
  "src/server/features/search-growth/geo/services/geoObservationCohortContextAssembler.ts";

describe("observation cohort context assembler source boundary", () => {
  const source = readFileSync(SERVICE_SOURCE, "utf8");
  // Comments are stripped for the call-shape assertions, so documentation that
  // names an API or a field cannot be mistaken for a use of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("depends only on the accepted T155 projector, T152 stamp, and the row type", () => {
    expect(
      [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]),
    ).toEqual([
      "@/types/schemas/geo-observation-run",
      "./geoObservationCohortMemberProjector",
      "./geoMeasurementCohortContextStamp",
    ]);
    expect(source).not.toMatch(
      /@\/db|drizzle|Repository|node:fs|process\.env|fetch\(|JSON\.|console\./,
    );
  });

  it("calls each accepted boundary exactly once, in order, and the guard never", () => {
    expect(code.match(/projectGeoObservationCohortMembers\(/g)).toHaveLength(1);
    expect(code.match(/stampGeoMeasurementCohortContext\(/g)).toHaveLength(1);
    expect(code).not.toMatch(
      /guardGeoMeasurementCohortIdentity\(|\.parse\(|\.safeParse\(/,
    );
    expect(code.indexOf("projectGeoObservationCohortMembers(")).toBeLessThan(
      code.indexOf("stampGeoMeasurementCohortContext("),
    );
  });

  it("reads no stored evidence and attaches no context field of its own", () => {
    expect(code).not.toMatch(
      /rawAnswer|rawResponse|providerRequestId|batchId|usageJson|repeatIndex|fidelity|status|parser|prompt|language|window|warning/,
    );
    expect(code).not.toMatch(/runId|sampleCount|confidence/);
  });

  it("filters, sorts, de-duplicates, counts, aggregates, and measures nothing", () => {
    expect(code).not.toMatch(
      /\.filter\(|\.reduce\(|\.sort\(|\.toSorted\(|new Set\(|new Map\(|Math\.|\.length/,
    );
    expect(code).not.toMatch(
      /aggregat|sample|percent|numerator|denominator|significan|\brate\b|\bratio\b|dedupe|distinct|metric|cache|provider/i,
    );
  });

  it("swallows no failure, defaults nothing, and coerces nothing", () => {
    expect(code).not.toMatch(/\btry\b|\bcatch\b|\?\?/);
    expect(code).not.toMatch(
      /parseInt|parseFloat|Number\(|String\(|Boolean\(|Object\.assign|Object\.fromEntries|\.trim\(|\.toLowerCase\(|\.toUpperCase\(|\.normalize\(|\.replace\(/,
    );
  });
});
