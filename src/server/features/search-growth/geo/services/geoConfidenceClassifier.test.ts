import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyGeoConfidence,
  GeoConfidenceClassifierInputError,
  type GeoConfidenceCohortSummary,
  type GeoConfidenceLevel,
} from "./geoConfidenceClassifier";

// Invariants under test (07_GEO_MEASUREMENT_SPEC.md §§1, 3, 4, 7):
//   - the frozen §4 rule returns LOW below 10 successful observations, MEDIUM
//     from 10 with at least 3 distinct prompts, and HIGH from 30 with at least
//     5 distinct prompts and no major surface/model change warning;
//   - a warning only withholds HIGH: a cohort that already qualifies for
//     MEDIUM keeps it;
//   - every otherwise-insufficient cohort is LOW, so no fourth label exists;
//   - the untrusted runtime boundary rejects a malformed count or non-boolean
//     warning with a typed error naming the field, coercing and mutating
//     nothing;
//   - the same summary always yields the same label, and the caller's object
//     is never modified;
//   - the module reaches no storage, provider, cache, parser, current parse,
//     market, model, or prompt, and contains no sampling, aggregation,
//     de-duplication, ratio, or statistical logic.

/** The three-field contract, defaulted to a just-qualifying MEDIUM cohort. */
function makeCohort(
  overrides: Partial<GeoConfidenceCohortSummary> = {},
): GeoConfidenceCohortSummary {
  return {
    successfulObservationCount: 10,
    distinctPromptCount: 3,
    hasMajorSurfaceOrModelChangeWarning: false,
    ...overrides,
  };
}

/** A caller that does not respect the TypeScript contract, as at runtime. */
function makeUntrustedCohort(
  overrides: Record<string, unknown>,
): GeoConfidenceCohortSummary {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted caller is exactly what this runtime boundary must reject
  return {
    ...makeCohort(),
    ...overrides,
  } as unknown as GeoConfidenceCohortSummary;
}

/** A call argument that may not be an object at all, as at runtime. */
function makeUntrustedInput(value: unknown): GeoConfidenceCohortSummary {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the classifier must reject
  return value as GeoConfidenceCohortSummary;
}

/**
 * Assert the classifier rejects `input` naming `field`, and return the error.
 * A call that returns normally fails the test, which is the fail-closed
 * evidence: a rejected summary yields no label at all.
 */
function rejectWith(
  input: GeoConfidenceCohortSummary,
  field: string,
): GeoConfidenceClassifierInputError {
  try {
    classifyGeoConfidence(input);
  } catch (error) {
    if (error instanceof GeoConfidenceClassifierInputError) {
      expect(error.field).toBe(field);
      return error;
    }
    throw error;
  }
  throw new Error("expected the classifier to reject the summary");
}

/** `observations/prompts/warning -> label`, for readable boundary diffs. */
function describeCase(
  observations: number,
  prompts: number,
  warning: boolean,
  label: GeoConfidenceLevel,
): string {
  return `${observations}/${prompts}/${warning ? "warn" : "none"} -> ${label}`;
}

// Every §4 boundary: 9/10/29/30 observations, 2/3/4/5 prompts, warning on/off.
const THRESHOLD_CASES: ReadonlyArray<
  [
    observations: number,
    prompts: number,
    warning: boolean,
    label: GeoConfidenceLevel,
  ]
> = [
  [9, 2, false, "LOW"],
  [9, 3, false, "LOW"],
  [9, 5, false, "LOW"],
  [9, 99, false, "LOW"],
  [9, 99, true, "LOW"],
  [10, 2, false, "LOW"],
  [10, 3, false, "MEDIUM"],
  [10, 3, true, "MEDIUM"],
  [10, 4, false, "MEDIUM"],
  [10, 5, false, "MEDIUM"],
  [29, 2, false, "LOW"],
  [29, 3, false, "MEDIUM"],
  [29, 4, false, "MEDIUM"],
  [29, 5, false, "MEDIUM"],
  [29, 5, true, "MEDIUM"],
  [30, 2, false, "LOW"],
  [30, 3, false, "MEDIUM"],
  [30, 4, false, "MEDIUM"],
  [30, 5, false, "HIGH"],
  [30, 5, true, "MEDIUM"],
  [30, 6, false, "HIGH"],
  [31, 5, false, "HIGH"],
  [100, 100, false, "HIGH"],
  [100, 100, true, "MEDIUM"],
];

describe("classifyGeoConfidence", () => {
  it("labels every frozen §4 threshold boundary", () => {
    const actual = THRESHOLD_CASES.map(([observations, prompts, warning]) =>
      describeCase(
        observations,
        prompts,
        warning,
        classifyGeoConfidence(
          makeCohort({
            successfulObservationCount: observations,
            distinctPromptCount: prompts,
            hasMajorSurfaceOrModelChangeWarning: warning,
          }),
        ),
      ),
    );

    expect(actual).toEqual(
      THRESHOLD_CASES.map(([observations, prompts, warning, label]) =>
        describeCase(observations, prompts, warning, label),
      ),
    );
  });

  it("withholds HIGH under a warning without erasing a qualifying MEDIUM", () => {
    const underWarning = makeCohort({
      successfulObservationCount: 30,
      distinctPromptCount: 5,
      hasMajorSurfaceOrModelChangeWarning: true,
    });

    expect(classifyGeoConfidence(underWarning)).toBe("MEDIUM");
    expect(
      classifyGeoConfidence({
        ...underWarning,
        successfulObservationCount: 10,
      }),
    ).toBe("MEDIUM");
    expect(
      classifyGeoConfidence({
        ...underWarning,
        hasMajorSurfaceOrModelChangeWarning: false,
      }),
    ).toBe("HIGH");
  });

  it("returns LOW for every insufficient cohort, including a huge one with too few prompts", () => {
    for (const [observations, prompts] of [
      [0, 0],
      [9, 3],
      [9, 99],
      [10, 2],
      [30, 2],
      [100, 2],
    ]) {
      expect(
        classifyGeoConfidence(
          makeCohort({
            successfulObservationCount: observations,
            distinctPromptCount: prompts,
          }),
        ),
      ).toBe("LOW");
    }
  });

  it("returns only LOW, MEDIUM, or HIGH across the whole threshold grid", () => {
    const labels = new Set<GeoConfidenceLevel>();

    for (let observations = 0; observations <= 40; observations += 1) {
      for (let prompts = 0; prompts <= 7; prompts += 1) {
        for (const warning of [false, true]) {
          labels.add(
            classifyGeoConfidence(
              makeCohort({
                successfulObservationCount: observations,
                distinctPromptCount: prompts,
                hasMajorSurfaceOrModelChangeWarning: warning,
              }),
            ),
          );
        }
      }
    }

    expect(labels).toEqual(new Set(["HIGH", "LOW", "MEDIUM"]));
  });

  it("is deterministic and never mutates the caller's summary", () => {
    const summary = makeCohort({
      successfulObservationCount: 30,
      distinctPromptCount: 5,
    });
    const before = structuredClone(summary);

    const labels = [
      classifyGeoConfidence(summary),
      classifyGeoConfidence(summary),
      classifyGeoConfidence(summary),
    ];

    expect(labels).toEqual(["HIGH", "HIGH", "HIGH"]);
    expect(summary).toEqual(before);
  });
});

describe("classifyGeoConfidence rejections", () => {
  it("rejects a call argument that is not an object", () => {
    for (const value of [null, undefined, 42, "10", true, []]) {
      rejectWith(makeUntrustedInput(value), "input");
    }
  });

  it("rejects a summary missing either count or the warning", () => {
    rejectWith(
      makeUntrustedCohort({ successfulObservationCount: undefined }),
      "successfulObservationCount",
    );
    rejectWith(
      makeUntrustedCohort({ distinctPromptCount: undefined }),
      "distinctPromptCount",
    );
    rejectWith(
      makeUntrustedCohort({ hasMajorSurfaceOrModelChangeWarning: undefined }),
      "hasMajorSurfaceOrModelChangeWarning",
    );
  });

  it("rejects fractional, negative, non-finite, unsafe, and non-number counts", () => {
    const invalid = [
      1.5,
      -1,
      -0.5,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      2 ** 53,
      "10",
      null,
      true,
      10n,
    ];

    for (const value of invalid) {
      rejectWith(
        makeUntrustedCohort({ successfulObservationCount: value }),
        "successfulObservationCount",
      );
      rejectWith(
        makeUntrustedCohort({ distinctPromptCount: value }),
        "distinctPromptCount",
      );
    }
  });

  it("rejects a warning that is not strictly a boolean", () => {
    for (const value of ["false", "true", 0, 1, null, undefined, {}]) {
      rejectWith(
        makeUntrustedCohort({ hasMajorSurfaceOrModelChangeWarning: value }),
        "hasMajorSurfaceOrModelChangeWarning",
      );
    }
  });
});

const CLASSIFIER_SOURCE =
  "src/server/features/search-growth/geo/services/geoConfidenceClassifier.ts";

describe("confidence classifier source boundary", () => {
  const source = readFileSync(CLASSIFIER_SOURCE, "utf8");
  // Comments are stripped for the call-shape assertions, so documentation that
  // names an API cannot be mistaken for an invocation of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const importLines = (
    source.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? []
  ).join("\n");

  it("depends only on Zod and reaches no database, network, or environment", () => {
    expect(importLines).toContain('"zod"');
    expect(importLines).not.toMatch(/@\/db|drizzle|Repository|node:fs/);
    expect(source).not.toMatch(
      /fetch\(|process\.env|node:fs|JSON\.stringify|console\./,
    );
  });

  it("reaches no storage, provider, cache, parser, or raw observation", () => {
    expect(code).not.toMatch(
      /\.record\(|\.query\(|\.select\(|\.insert\(|\.update\(|\.delete\(|readFileSync\(|\.parse\(/,
    );
    expect(code).not.toMatch(
      /cache|provider|rawObservation|rawResponse|rawAnswer|providerResponse|geoObservationRun|parserVersion|parseId|isCurrent|marketProfile|modelVersion|promptId|promptText|surfaceType/i,
    );
  });

  it("counts, samples, aggregates, de-duplicates, and compares nothing", () => {
    expect(code).not.toMatch(
      /\.filter\(|\.reduce\(|\.sort\(|\.toSorted\(|new Set\(|new Map\(|Math\.|length/,
    );
    expect(code).not.toMatch(
      /aggregate|sample|dedupe|distinct\(|numerator|denominator|percentage|percent|confidenceInterval|significance|pValue|marginOfError|ratio/i,
    );
  });

  it("swallows no failure and coerces no value", () => {
    expect(code).not.toMatch(/\btry\b|\bcatch\b/);
    expect(code).not.toMatch(
      /toLowerCase|toUpperCase|\.trim\(|Math\.round|Math\.floor|Math\.ceil|parseInt|parseFloat|Number\(|Boolean\(|String\(/,
    );
  });
});
