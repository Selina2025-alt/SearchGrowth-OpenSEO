import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GeoRepeatFractionPresenterInputError,
  presentGeoRepeatFraction,
  type GeoRepeatFractionDisplay,
  type GeoRepeatFractionInput,
} from "./geoRepeatFractionPresenter";

// Invariants under test (07_GEO_MEASUREMENT_SPEC.md §§2, 3, 4, 7;
// 21_TEST_ACCEPTANCE_PLAN.md §§3, 4):
//   - §3's display is the exact completed/requested fraction (`2/3`), never a
//     rounded percentage (`66.7%`);
//   - the caller's two counts come back exactly, unrounded and unrepaired,
//     beside that text and nothing else;
//   - only the approved repeat settings 3 and 5 can be presented, and a
//     completion never exceeds its request;
//   - the untrusted runtime boundary rejects a malformed, unsupported, or
//     impossible fraction with a typed error naming the field, coercing and
//     mutating nothing and never returning a partial display;
//   - the module reaches no storage, provider, cache, parser, cohort, or raw
//     evidence, and contains no sampling, aggregation, or metric logic.

/** The two-field contract, defaulted to §3's own `2/3` example. */
function makeFraction(
  overrides: Partial<GeoRepeatFractionInput> = {},
): GeoRepeatFractionInput {
  return {
    completedSampleCount: 2,
    requestedRepeatCount: 3,
    ...overrides,
  };
}

/** A caller that does not respect the TypeScript contract, as at runtime. */
function makeUntrustedFraction(
  overrides: Record<string, unknown>,
): GeoRepeatFractionInput {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted caller is exactly what this runtime boundary must reject
  return {
    ...makeFraction(),
    ...overrides,
  } as unknown as GeoRepeatFractionInput;
}

/** A call argument that may not be an object at all, as at runtime. */
function makeUntrustedInput(value: unknown): GeoRepeatFractionInput {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the presenter must reject
  return value as GeoRepeatFractionInput;
}

/**
 * Assert the presenter rejects `input` naming `field`, and return the error.
 * A call that returns normally fails the test, which is the fail-closed
 * evidence: a rejected fraction yields no display at all, not a partial one.
 */
function rejectWith(
  input: GeoRepeatFractionInput,
  field: string,
): GeoRepeatFractionPresenterInputError {
  try {
    presentGeoRepeatFraction(input);
  } catch (error) {
    if (error instanceof GeoRepeatFractionPresenterInputError) {
      expect(error.field).toBe(field);
      return error;
    }
    throw error;
  }
  throw new Error("expected the presenter to reject the repeat fraction");
}

/** `completed/requested -> display`, for readable boundary diffs. */
function describeCase(
  completed: number,
  requested: number,
  display: GeoRepeatFractionDisplay,
): string {
  return `${completed}/${requested} -> ${display.displayText}`;
}

// Every presentable §3 shape: both approved settings, empty through full.
const PRESENTABLE_CASES: ReadonlyArray<
  [completed: number, requested: number, displayText: string]
> = [
  [0, 3, "0/3"],
  [1, 3, "1/3"],
  [2, 3, "2/3"],
  [3, 3, "3/3"],
  [0, 5, "0/5"],
  [1, 5, "1/5"],
  [4, 5, "4/5"],
  [5, 5, "5/5"],
];

describe("presentGeoRepeatFraction", () => {
  it("renders §3's exact fraction for every approved repeat setting", () => {
    const actual = PRESENTABLE_CASES.map(([completed, requested]) =>
      describeCase(
        completed,
        requested,
        presentGeoRepeatFraction(
          makeFraction({
            completedSampleCount: completed,
            requestedRepeatCount: requested,
          }),
        ),
      ),
    );

    expect(actual).toEqual(
      PRESENTABLE_CASES.map(([completed, requested, displayText]) =>
        describeCase(completed, requested, {
          completedSampleCount: completed,
          requestedRepeatCount: requested,
          displayText,
        }),
      ),
    );
  });

  it("preserves the caller's exact counts beside the display text and nothing else", () => {
    const result = presentGeoRepeatFraction(
      makeFraction({ completedSampleCount: 2, requestedRepeatCount: 3 }),
    );

    expect(result).toEqual({
      completedSampleCount: 2,
      requestedRepeatCount: 3,
      displayText: "2/3",
    });
    expect(new Set(Object.keys(result))).toEqual(
      new Set(["completedSampleCount", "requestedRepeatCount", "displayText"]),
    );
  });

  it("renders no percentage, rate, or rounded value", () => {
    for (const [completed, requested] of PRESENTABLE_CASES) {
      const result = presentGeoRepeatFraction(
        makeFraction({
          completedSampleCount: completed,
          requestedRepeatCount: requested,
        }),
      );

      expect(result.displayText).toMatch(/^\d+\/\d+$/);
      expect(result.displayText).toBe(`${completed}/${requested}`);
      // The §3 warning in executable form: a lone rounded rate would
      // manufacture precision, so neither the text nor the result carries one.
      expect(result.displayText).not.toContain("%");
      expect(result.displayText).not.toContain(".");
      expect(JSON.stringify(result)).not.toContain("%");
      expect(Object.keys(result).join(",")).not.toMatch(
        /percent|rate|ratio|metric/i,
      );
    }
  });

  it("is deterministic and never mutates the caller's input", () => {
    const input = makeFraction({
      completedSampleCount: 2,
      requestedRepeatCount: 3,
    });
    const before = structuredClone(input);

    const results = [
      presentGeoRepeatFraction(input),
      presentGeoRepeatFraction(input),
      presentGeoRepeatFraction(input),
    ];

    expect(results).toEqual([
      { completedSampleCount: 2, requestedRepeatCount: 3, displayText: "2/3" },
      { completedSampleCount: 2, requestedRepeatCount: 3, displayText: "2/3" },
      { completedSampleCount: 2, requestedRepeatCount: 3, displayText: "2/3" },
    ]);
    expect(input).toEqual(before);
  });
});

describe("presentGeoRepeatFraction rejections", () => {
  it("rejects a call argument that is not an object", () => {
    for (const value of [null, undefined, 42, "2/3", true, []]) {
      rejectWith(makeUntrustedInput(value), "input");
    }
  });

  it("rejects a fraction missing either count", () => {
    rejectWith(
      makeUntrustedFraction({ completedSampleCount: undefined }),
      "completedSampleCount",
    );
    rejectWith(
      makeUntrustedFraction({ requestedRepeatCount: undefined }),
      "requestedRepeatCount",
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
      "2",
      null,
      true,
      2n,
      {},
      [],
    ];

    for (const value of invalid) {
      rejectWith(
        makeUntrustedFraction({ completedSampleCount: value }),
        "completedSampleCount",
      );
      rejectWith(
        makeUntrustedFraction({ requestedRepeatCount: value }),
        "requestedRepeatCount",
      );
    }
  });

  it("rejects a repeat setting §3 does not approve", () => {
    for (const requestedRepeatCount of [0, 1, 2, 4, 6, 10, 30, 100]) {
      rejectWith(
        makeUntrustedFraction({ requestedRepeatCount }),
        "requestedRepeatCount",
      );
    }
  });

  it("rejects a completion beyond its request instead of clamping it", () => {
    for (const [completedSampleCount, requestedRepeatCount] of [
      [4, 3],
      [5, 3],
      [6, 5],
      [100, 5],
    ]) {
      const error = rejectWith(
        makeUntrustedFraction({ completedSampleCount, requestedRepeatCount }),
        "completedSampleCount",
      );
      expect(error.message).toContain("requestedRepeatCount");
    }
  });
});

const PRESENTER_SOURCE =
  "src/server/features/search-growth/geo/services/geoRepeatFractionPresenter.ts";

describe("repeat fraction presenter source boundary", () => {
  const source = readFileSync(PRESENTER_SOURCE, "utf8");
  // Comments are stripped for the call-shape assertions, so documentation that
  // names an API cannot be mistaken for an invocation of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const importLines = (
    source.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? []
  ).join("\n");

  it("depends only on Zod and reaches no database, network, or environment", () => {
    expect(importLines).toContain('"zod"');
    expect(importLines).not.toMatch(
      /@\/db|drizzle|Repository|node:fs|Sampling|Observation/i,
    );
    expect(source).not.toMatch(/fetch\(|process\.env|console\.|JSON\./);
  });

  it("reaches no storage, provider, cache, parser, cohort, or raw evidence", () => {
    expect(code).not.toMatch(
      /\.record\(|\.query\(|\.select\(|\.insert\(|\.update\(|\.delete\(|readFileSync\(|\.parse\(/,
    );
    expect(code).not.toMatch(
      /cache|provider|repository|rawObservation|rawResponse|parserVersion|parseId|isCurrent|marketProfile|modelVersion|promptId|promptText|surfaceType/i,
    );
  });

  it("samples, aggregates, de-duplicates, and counts nothing", () => {
    expect(code).not.toMatch(
      /\.filter\(|\.reduce\(|\.sort\(|\.toSorted\(|new Set\(|new Map\(|\.length|Math\./,
    );
    expect(code).not.toMatch(
      /\bfor\s*\(|\bwhile\s*\(|\.map\(|\.forEach\(|\.includes\(/,
    );
    expect(code).not.toMatch(
      /aggregate|dedupe|deduplicate|distinct|\bsum\b|average|\bsample\b|sampling|observation|cohort/i,
    );
  });

  it("computes no percentage, rate, metric, or confidence", () => {
    expect(code).not.toMatch(/%|\btoFixed\b/i);
    expect(code).not.toMatch(
      /percentage|percent|\brate\b|ratio|metric|confidence|significan|numerator|denominator/i,
    );
  });

  it("swallows no failure and coerces no value", () => {
    expect(code).not.toMatch(/\btry\b|\bcatch\b|\bthrow new Error\b/);
    // Case-sensitive, so Zod's own `.number(`/`.string(` builders are not
    // mistaken for the coercion constructors this assertion is about.
    expect(code).not.toMatch(
      /toLowerCase|toUpperCase|\.trim\(|Math\.round|Math\.floor|Math\.ceil|parseInt|parseFloat|Number\(|Boolean\(|String\(/,
    );
  });
});
