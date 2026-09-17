import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GeoMeasurementCohortIdentityError,
  guardGeoMeasurementCohortIdentity,
  type GeoMeasurementCohortMember,
} from "./geoMeasurementCohortIdentityGuard";
import {
  stampGeoMeasurementCohortContext,
  type GeoMeasurementCohortContextStamp,
} from "./geoMeasurementCohortContextStamp";

// Invariants under test (07_GEO_MEASUREMENT_SPEC.md §§1, 4, 7;
// 05_DOMAIN_DATA_MODEL.md §§2, 6):
//   - the accepted T151 guard is called exactly once, and its validated cohort
//     becomes a structured context carrying exactly projectId, marketProfileId,
//     surfaceType, model, and modelVersion copied verbatim from the baseline;
//   - the caller's ordered member list still comes back by identity, so the
//     context and the members describe the same validated cohort;
//   - the context is structured fields, never a joined, hashed, serialized, or
//     generated key, and two cohorts a joined key would collide stay distinct;
//   - every T151 rejection — unusable list, malformed member, cross-context
//     member — propagates unchanged with no stamp, partial context, or repaired
//     list, and nothing is revalidated here;
//   - repeated calls are deterministic and the caller's members are not mutated;
//   - the shipped service calls nothing but the guard and reaches no storage,
//     repository, provider, cache, parser, or environment (source boundary).

/** The six-identifier T151 contract, defaulted to one compatible cohort member. */
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

/** A caller that does not respect the TypeScript contract, as at runtime. */
function makeUntrustedMember(
  overrides: Record<string, unknown>,
): GeoMeasurementCohortMember {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted caller is exactly what the T151 guard must reject
  return {
    ...makeMember(),
    ...overrides,
  } as unknown as GeoMeasurementCohortMember;
}

/** A list argument that may not be a list at all, as at runtime. */
function makeUntrustedList(
  value: unknown,
): readonly GeoMeasurementCohortMember[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the T151 guard must reject
  return value as readonly GeoMeasurementCohortMember[];
}

/** The rejection the accepted T151 guard produces for `members`. */
function guardRejection(
  members: readonly GeoMeasurementCohortMember[],
): GeoMeasurementCohortIdentityError {
  try {
    guardGeoMeasurementCohortIdentity(members);
  } catch (error) {
    if (error instanceof GeoMeasurementCohortIdentityError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the T151 guard to reject the member list");
}

/**
 * Assert the stamp service rejects `members` with exactly the accepted T151
 * rejection for the same input, and return it. A call that returns normally
 * fails the test, which is the fail-closed evidence: a rejected cohort yields no
 * stamp at all.
 */
function expectPropagatedRejection(
  members: readonly GeoMeasurementCohortMember[],
): GeoMeasurementCohortIdentityError {
  const expected = guardRejection(members);
  let raised: unknown;
  try {
    stampGeoMeasurementCohortContext(members);
  } catch (error) {
    raised = error;
  }
  if (!(raised instanceof GeoMeasurementCohortIdentityError)) {
    throw new Error("expected the stamp service to reject the member list");
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

/** Every identifier a T151 measurement member must carry. */
const MEMBER_FIELDS = [
  "runId",
  "projectId",
  "marketProfileId",
  "surfaceType",
  "model",
  "modelVersion",
] as const;

/** The five identifiers a stamped context must carry, and nothing else. */
const CONTEXT_FIELDS = [
  "projectId",
  "marketProfileId",
  "surfaceType",
  "model",
  "modelVersion",
] as const;

/** A distinct, still well-formed value for each cohort-defining identifier. */
const OTHER_COHORT_VALUE: Record<(typeof CONTEXT_FIELDS)[number], string> = {
  projectId: "proj_2",
  marketProfileId: "market_2",
  surfaceType: "CONSUMER_PRODUCT_OBSERVED",
  model: "gpt-5-mini",
  modelVersion: "2026-10-01",
};

/** The five context fields, with a second cohort's values, as a context object. */
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

describe("stampGeoMeasurementCohortContext", () => {
  it("returns the caller's ordered members by identity with the baseline's context", () => {
    const members = [
      makeMember({ runId: "run_1" }),
      makeMember({ runId: "run_2" }),
      makeMember({ runId: "run_3" }),
    ];

    const stamp = stampGeoMeasurementCohortContext(members);

    // The accepted T151 guard returns the very array it was given, so this
    // identity is also the evidence that the caller's members were the ones
    // validated — no copy, filter, sort, or dedupe happened on the way through.
    expect(stamp.members).toBe(members);
    expect(stamp.members[0]).toBe(members[0]);
    expect(stamp.members[2]).toBe(members[2]);
    expect(stamp.context).toEqual(expectedContext());
  });

  it("stamps a single-member cohort, which has nothing to contradict it", () => {
    const members = [makeMember()];

    const stamp = stampGeoMeasurementCohortContext(members);

    expect(stamp.members).toBe(members);
    expect(stamp.context).toEqual(expectedContext());
  });

  it("copies the context verbatim without trimming or normalizing it", () => {
    const members = [makeMember({ model: " gpt-5 ", modelVersion: "v1\n" })];

    const stamp = stampGeoMeasurementCohortContext(members);

    expect(stamp.context.model).toBe(" gpt-5 ");
    expect(stamp.context.modelVersion).toBe("v1\n");
  });

  it("carries exactly the five cohort fields and no run identity", () => {
    const members = [makeMember({ runId: "run_7" })];

    const stamp = stampGeoMeasurementCohortContext(members);

    expect(new Set(Object.keys(stamp.context))).toEqual(
      new Set(CONTEXT_FIELDS),
    );
    expect(Object.keys(stamp.context)).toHaveLength(CONTEXT_FIELDS.length);
    expect(stamp.context).not.toHaveProperty("runId");
    // A context is a structured value, never a serialized or generated key.
    expect(typeof stamp.context).toBe("object");
    expect(stamp.context).not.toBe(members[0]);
  });

  it("keeps two cohorts distinct even when a joined key would collide", () => {
    // `[marketProfileId, model].join("|")` is "a|b|c" for both cohorts: a
    // delimited or serialized key could not tell them apart, the fields can.
    const left = [makeMember({ marketProfileId: "a|b", model: "c" })];
    const right = [makeMember({ marketProfileId: "a", model: "b|c" })];

    const leftContext = stampGeoMeasurementCohortContext(left).context;
    const rightContext = stampGeoMeasurementCohortContext(right).context;

    expect(leftContext).toEqual(
      expectedContext({ marketProfileId: "a|b", model: "c" }),
    );
    expect(rightContext).toEqual(
      expectedContext({ marketProfileId: "a", model: "b|c" }),
    );
    expect(leftContext).not.toEqual(rightContext);
  });

  it("gives members differing only by run id the same cohort context", () => {
    const members = [
      makeMember({ runId: "run_1" }),
      makeMember({ runId: "run_2" }),
    ];

    expect(stampGeoMeasurementCohortContext(members).context).toEqual(
      expectedContext(),
    );
  });

  it("is deterministic across repeated calls and mutates nothing", () => {
    const members = [
      makeMember({ runId: "run_1" }),
      makeMember({ runId: "run_2" }),
    ];
    const before = structuredClone(members);

    const stamps: GeoMeasurementCohortContextStamp[] = [
      stampGeoMeasurementCohortContext(members),
      stampGeoMeasurementCohortContext(members),
      stampGeoMeasurementCohortContext(members),
    ];

    expect(stamps).toEqual([
      { members, context: expectedContext() },
      { members, context: expectedContext() },
      { members, context: expectedContext() },
    ]);
    expect(stamps.every((stamp) => stamp.members === members)).toBe(true);
    expect(members).toEqual(before);
    expect(Object.keys(members[0])).toEqual([...MEMBER_FIELDS]);
  });
});

describe("stampGeoMeasurementCohortContext rejections", () => {
  it("propagates an unusable member list unchanged, stamping nothing", () => {
    for (const value of [
      null,
      undefined,
      42,
      "members",
      true,
      makeMember(),
      {},
      new Set([makeMember()]),
    ]) {
      expectPropagatedRejection(makeUntrustedList(value));
    }

    expectPropagatedRejection([]);
  });

  it("propagates a malformed member unchanged, naming its index and field", () => {
    for (const field of MEMBER_FIELDS) {
      for (const value of [undefined, "", "   ", 42, null, true, {}, []]) {
        expectPropagatedRejection([
          makeMember({ runId: "run_1" }),
          makeUntrustedMember({ runId: "run_2", [field]: value }),
        ]);
      }
    }

    for (const value of [null, 42, "run_1", []]) {
      expectPropagatedRejection(
        makeUntrustedList([makeMember({ runId: "run_1" }), value]),
      );
    }

    expectPropagatedRejection([
      makeUntrustedMember({ marketProfileId: "" }),
      makeMember({ runId: "run_2" }),
    ]);
  });

  it("propagates every cross-context mismatch unchanged, naming index and field", () => {
    for (const field of CONTEXT_FIELDS) {
      const rejection = expectPropagatedRejection([
        makeMember({ runId: "run_1" }),
        makeMember({ runId: "run_2", [field]: OTHER_COHORT_VALUE[field] }),
      ]);
      expect({
        memberIndex: rejection.memberIndex,
        field: rejection.field,
      }).toEqual({ memberIndex: 1, field });
    }

    expectPropagatedRejection([
      makeMember({ surfaceType: "UNSUPPORTED_SURFACE" }),
      makeMember({ runId: "run_2" }),
    ]);
  });
});

const SERVICE_SOURCE =
  "src/server/features/search-growth/geo/services/geoMeasurementCohortContextStamp.ts";

describe("cohort context stamp source boundary", () => {
  const source = readFileSync(SERVICE_SOURCE, "utf8");
  // Comments are stripped for the call-shape assertions, so documentation that
  // names an API or a field cannot be mistaken for a use of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("depends only on the accepted T151 guard", () => {
    expect(
      [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]),
    ).toEqual(["./geoMeasurementCohortIdentityGuard"]);
    expect(source).not.toMatch(
      /@\/db|drizzle|Repository|node:fs|process\.env|fetch\(|JSON\.|console\./,
    );
  });

  it("calls the accepted guard exactly once and revalidates nothing itself", () => {
    expect(code.match(/guardGeoMeasurementCohortIdentity\(/g)).toHaveLength(1);
    expect(code).not.toMatch(
      /\.parse\(|\.safeParse\(|\.record\(|\.query\(|readFileSync\(/,
    );
  });

  it("builds a structured context and never a serialized or generated key", () => {
    expect(code).not.toMatch(
      /.join\(|JSON\.|stringify|hash|crypto|Buffer|base64|toHex|toLowerCase|toUpperCase|\.trim\(|\.normalize\(|\.replace\(/i,
    );
    expect(code).not.toMatch(/runId/);
  });

  it("filters, aggregates, classifies, and measures nothing", () => {
    expect(code).not.toMatch(
      /\.map\(|\.filter\(|\.reduce\(|\.sort\(|\.toSorted\(|new Set\(|new Map\(|Math\.|\.length/,
    );
    expect(code).not.toMatch(
      /aggregat|sample|count|dedupe|distinct|numerator|denominator|percent|confidence|significan|pValue|\brate\b|\bratio\b|cache|provider|parser|prompt|language|window|warning/i,
    );
  });

  it("swallows no failure and coerces no value", () => {
    expect(code).not.toMatch(/\btry\b|\bcatch\b|\bthrow\b/);
    expect(code).not.toMatch(
      /parseInt|parseFloat|Number\(|Boolean\(|String\(|Object\.fromEntries|Object\.assign/,
    );
  });
});
