import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GeoMeasurementCohortIdentityError,
  guardGeoMeasurementCohortIdentity,
  type GeoMeasurementCohortMember,
} from "./geoMeasurementCohortIdentityGuard";

// Invariants under test (07_GEO_MEASUREMENT_SPEC.md §§1, 4, 7;
// 05_DOMAIN_DATA_MODEL.md §§2, 6):
//   - a non-empty list of members that share one Project, market profile,
//     surface, model, and model version is returned by identity, in order;
//   - the first member is the cohort baseline and every later member must match
//     its five cohort-defining identifiers exactly, run identity aside;
//   - every cross-context or malformed member rejects with a typed error naming
//     the member index and field, so no partial cohort ever escapes;
//   - nothing is coerced, normalized, trimmed, sorted, de-duplicated, or
//     mutated, and the same list always yields the same outcome;
//   - the module reaches no database, repository, provider, cache, raw
//     evidence, or parser, and contains no aggregation, confidence, or
//     statistical logic.

/** The six-identifier contract, defaulted to one compatible cohort member. */
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
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted caller is exactly what this runtime boundary must reject
  return {
    ...makeMember(),
    ...overrides,
  } as unknown as GeoMeasurementCohortMember;
}

/** A list argument that may not be a list at all, as at runtime. */
function makeUntrustedList(
  value: unknown,
): readonly GeoMeasurementCohortMember[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the guard must reject
  return value as readonly GeoMeasurementCohortMember[];
}

/**
 * Assert the guard rejects `members` naming `field` at `memberIndex`, and
 * return the error. A call that returns normally fails the test, which is the
 * fail-closed evidence: a rejected list yields no cohort at all.
 */
function rejectWith(
  members: readonly GeoMeasurementCohortMember[],
  memberIndex: number | null,
  field: string,
): GeoMeasurementCohortIdentityError {
  let raised: unknown;
  try {
    guardGeoMeasurementCohortIdentity(members);
  } catch (error) {
    raised = error;
  }
  if (!(raised instanceof GeoMeasurementCohortIdentityError)) {
    throw new Error("expected the guard to reject the member list");
  }
  expect({ memberIndex: raised.memberIndex, field: raised.field }).toEqual({
    memberIndex,
    field,
  });
  return raised;
}

/** Every identifier a member must carry (05_DOMAIN_DATA_MODEL.md §6). */
const MEMBER_FIELDS = [
  "runId",
  "projectId",
  "marketProfileId",
  "surfaceType",
  "model",
  "modelVersion",
] as const;

/** The five identifiers a later member must share with the cohort baseline. */
const COHORT_FIELDS = [
  "projectId",
  "marketProfileId",
  "surfaceType",
  "model",
  "modelVersion",
] as const;

/** The Observation Surface kinds Spec §1 admits (07_GEO_MEASUREMENT_SPEC.md §1). */
const SUPPORTED_SURFACES = [
  "AGGREGATED_SEARCH_DATA",
  "MODEL_API_SEARCH",
  "CONSUMER_PRODUCT_OBSERVED",
  "MANUAL_CONSUMER_OBSERVATION",
] as const;

/** A distinct, still well-formed value for each cohort-defining identifier. */
const OTHER_COHORT_VALUE: Record<(typeof COHORT_FIELDS)[number], string> = {
  projectId: "proj_2",
  marketProfileId: "market_2",
  surfaceType: "CONSUMER_PRODUCT_OBSERVED",
  model: "gpt-5-mini",
  modelVersion: "2026-10-01",
};

describe("guardGeoMeasurementCohortIdentity", () => {
  it("returns the caller's ordered member list by identity for one compatible cohort", () => {
    const members = [
      makeMember({ runId: "run_1" }),
      makeMember({ runId: "run_2" }),
      makeMember({ runId: "run_3" }),
    ];

    const cohort = guardGeoMeasurementCohortIdentity(members);

    expect(cohort).toBe(members);
    expect(cohort).toHaveLength(3);
    expect(cohort[0]).toBe(members[0]);
    expect(cohort[2]).toBe(members[2]);
    expect(cohort.map((member) => member.runId)).toEqual([
      "run_1",
      "run_2",
      "run_3",
    ]);
  });

  it("accepts a single-member cohort, which has nothing to contradict it", () => {
    const members = [makeMember()];

    expect(guardGeoMeasurementCohortIdentity(members)).toBe(members);
  });

  it("accepts each of the four Spec §1 surfaces as its own cohort, unchanged", () => {
    for (const surfaceType of SUPPORTED_SURFACES) {
      const members = [makeMember({ surfaceType })];

      expect(guardGeoMeasurementCohortIdentity(members)).toBe(members);
      expect(members[0].surfaceType).toBe(surfaceType);
    }
  });

  it("preserves duplicate members instead of filtering or de-duplicating them", () => {
    const members = [makeMember(), makeMember(), makeMember()];

    expect(guardGeoMeasurementCohortIdentity(members)).toBe(members);
    expect(members.map((member) => member.runId)).toEqual([
      "run_1",
      "run_1",
      "run_1",
    ]);
  });

  it("rejects every cross-context member, naming its index and field", () => {
    for (const field of COHORT_FIELDS) {
      rejectWith(
        [
          makeMember({ runId: "run_1" }),
          makeMember({ runId: "run_2", [field]: OTHER_COHORT_VALUE[field] }),
        ],
        1,
        field,
      );
    }
  });

  it("rejects a member differing only by letter case, without normalizing", () => {
    rejectWith(
      [makeMember(), makeMember({ runId: "run_2", model: "GPT-5" })],
      1,
      "model",
    );
  });

  it("rejects a member whose identifier only differs by surrounding whitespace", () => {
    rejectWith(
      [makeMember(), makeMember({ runId: "run_2", model: " gpt-5 " })],
      1,
      "model",
    );
  });

  it("reports the earliest offending member rather than a later one", () => {
    rejectWith(
      [
        makeMember({ runId: "run_1" }),
        makeMember({ runId: "run_2", projectId: "proj_2" }),
        makeMember({ runId: "run_3", model: "gpt-5-mini" }),
      ],
      1,
      "projectId",
    );
  });

  it("rejects instead of returning the valid prefix when a later member breaks the cohort", () => {
    rejectWith(
      [
        makeMember({ runId: "run_1" }),
        makeMember({ runId: "run_2" }),
        makeMember({ runId: "run_3", marketProfileId: "market_2" }),
      ],
      2,
      "marketProfileId",
    );
  });

  it("is deterministic and never mutates the caller's members", () => {
    const members = [
      makeMember({ runId: "run_1" }),
      makeMember({ runId: "run_2" }),
    ];
    const before = structuredClone(members);

    const cohorts = [
      guardGeoMeasurementCohortIdentity(members),
      guardGeoMeasurementCohortIdentity(members),
      guardGeoMeasurementCohortIdentity(members),
    ];

    expect(cohorts).toEqual([members, members, members]);
    expect(members).toEqual(before);
  });
});

describe("guardGeoMeasurementCohortIdentity rejections", () => {
  it("rejects an empty collection, which has no baseline to verify", () => {
    rejectWith([], null, "members");
  });

  it("rejects a list argument that is not an array", () => {
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
      rejectWith(makeUntrustedList(value), null, "members");
    }
  });

  it("rejects a member that is not an object", () => {
    for (const value of [null, undefined, 42, "run_1", true, []]) {
      rejectWith(
        makeUntrustedList([makeMember({ runId: "run_1" }), value]),
        1,
        "member",
      );
    }
  });

  it("rejects a member missing any one of the six identifiers", () => {
    for (const field of MEMBER_FIELDS) {
      rejectWith(
        [
          makeMember({ runId: "run_1" }),
          makeUntrustedMember({ runId: "run_2", [field]: undefined }),
        ],
        1,
        field,
      );
    }
  });

  it("rejects an empty or blank identifier on any of the six fields", () => {
    for (const field of MEMBER_FIELDS) {
      for (const value of ["", "   ", "\t", "\n  "]) {
        rejectWith(
          [
            makeMember({ runId: "run_1" }),
            makeUntrustedMember({ runId: "run_2", [field]: value }),
          ],
          1,
          field,
        );
      }
    }
  });

  it("rejects a non-string identifier on any of the six fields", () => {
    for (const field of MEMBER_FIELDS) {
      for (const value of [42, 0, null, true, {}, [], Symbol("run")]) {
        rejectWith(
          [
            makeMember({ runId: "run_1" }),
            makeUntrustedMember({ runId: "run_2", [field]: value }),
          ],
          1,
          field,
        );
      }
    }
  });

  it("rejects a malformed first member, which would otherwise become the baseline", () => {
    rejectWith(
      [
        makeUntrustedMember({ marketProfileId: "" }),
        makeMember({ runId: "run_2" }),
      ],
      0,
      "marketProfileId",
    );
  });

  it("rejects an unsupported observation surface on the baseline member", () => {
    rejectWith(
      [
        makeMember({ surfaceType: "UNSUPPORTED_SURFACE" }),
        makeMember({ runId: "run_2" }),
      ],
      0,
      "surfaceType",
    );
  });

  it("rejects an unsupported, mis-cased, or padded surface on a later member", () => {
    for (const surfaceType of [
      "UNSUPPORTED_SURFACE",
      "model_api_search",
      "AGGREGATED_SEARCH_DATA ",
    ]) {
      rejectWith(
        [
          makeMember({ runId: "run_1" }),
          makeMember({ runId: "run_2", surfaceType }),
        ],
        1,
        "surfaceType",
      );
    }
  });
});

const GUARD_SOURCE =
  "src/server/features/search-growth/geo/services/geoMeasurementCohortIdentityGuard.ts";

describe("cohort identity guard source boundary", () => {
  const source = readFileSync(GUARD_SOURCE, "utf8");
  // Comments are stripped for the call-shape assertions, so documentation that
  // names an API cannot be mistaken for an invocation of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // String literals are stripped for the vocabulary assertions too: a Spec §1
  // surface value such as `AGGREGATED_SEARCH_DATA` is caller data and an error
  // message is prose, neither of which is aggregation or classification logic.
  const codeWithoutLiterals = code.replace(
    /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,
    '""',
  );
  const importLines = (
    source.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? []
  ).join("\n");

  it("depends only on Zod and reaches no database, network, or environment", () => {
    expect(importLines).toContain('"zod"');
    expect(importLines).not.toMatch(
      /@\/db|drizzle|Repository|node:fs|geoConfidenceClassifier/,
    );
    expect(source).not.toMatch(
      /fetch\(|process\.env|node:fs|JSON\.stringify|console\./,
    );
  });

  it("reaches no storage, repository, provider, cache, raw evidence, or parser", () => {
    expect(code).not.toMatch(
      /\.record\(|\.query\(|\.select\(|\.insert\(|\.update\(|\.delete\(|readFileSync\(|\.parse\(/,
    );
    expect(code).not.toMatch(
      /cache|provider|repository|drizzle|rawObservation|rawResponse|rawAnswer|providerResponse|parser|parseId|parseStatus|isCurrent|evidence/i,
    );
  });

  it("samples, aggregates, classifies, and calculates nothing", () => {
    expect(codeWithoutLiterals).not.toMatch(
      /\bfilter\b|\breduce\b|\bsort\b|toSorted|new Set\(|new Map\(|Math\./,
    );
    expect(codeWithoutLiterals).not.toMatch(
      /aggregat|sample|dedupe|distinct|numerator|denominator|percent|confidence|significan|pValue|marginOfError|\bratio\b|\brate\b/i,
    );
  });

  it("swallows no failure and coerces no value", () => {
    expect(code).not.toMatch(/\btry\b|\bcatch\b/);
    expect(code).not.toMatch(
      /toLowerCase|toUpperCase|\.trim\(|Math\.round|Math\.floor|Math\.ceil|parseInt|parseFloat|Number\(|Boolean\(|String\(/,
    );
  });
});
