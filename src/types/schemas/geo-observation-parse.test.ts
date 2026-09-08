import { describe, expect, it } from "vitest";
import { geoObservationParses } from "@/db/search-growth.schema";
import type {
  GeoObservationAccuracyStatus,
  GeoObservationParse,
  GeoObservationParseStatus,
} from "./geo-observation-parse";
import {
  geoObservationAccuracyStatusSchema,
  geoObservationParseStatusSchema,
} from "./geo-observation-parse";

// The DB text-enum columns and the Zod boundaries must not drift: a value the
// Zod schema accepts has to be a value the column type admits, and vice versa.
// Drift here would let future repositories write a parse outcome / accuracy
// assessment the domain boundary never validated. There is intentionally no
// implicit/lowercase/unknown fallback (05_DOMAIN_DATA_MODEL.md §7,
// schemas/domain-types.ts GeoObservationParse).
describe("GeoObservationParse domain boundary", () => {
  it("lists every parse_status column value as a valid GeoObservationParseStatus", () => {
    for (const parseStatus of geoObservationParses.parseStatus.enumValues) {
      expect(
        geoObservationParseStatusSchema.safeParse(parseStatus).success,
      ).toBe(true);
    }
  });

  it("rejects unsupported, case-mismatched and empty parse statuses", () => {
    for (const parseStatus of [
      // Case-mismatched variants of the approved uppercase values.
      "success",
      "Partial",
      "Failed",
      "SUCCESS ",
      // Unsupported parse outcomes.
      "SUCCEEDED",
      "ERROR",
      "PENDING",
      "RUNNING",
      "UNKNOWN",
      "COMPLETED",
      "",
    ]) {
      expect(
        geoObservationParseStatusSchema.safeParse(parseStatus).success,
      ).toBe(false);
    }
  });

  it("lists every accuracy_status column value as a valid GeoObservationAccuracyStatus", () => {
    for (const accuracyStatus of geoObservationParses.accuracyStatus
      .enumValues) {
      expect(
        geoObservationAccuracyStatusSchema.safeParse(accuracyStatus).success,
      ).toBe(true);
    }
  });

  it("rejects unsupported, case-mismatched and empty accuracy statuses", () => {
    for (const accuracyStatus of [
      // Case-mismatched variants of the approved uppercase values.
      "accurate",
      "Partial",
      "Inaccurate",
      "unknown",
      "ACCURATE ",
      // Unsupported accuracy assessments.
      "TRUE",
      "FALSE",
      "YES",
      "NONE",
      "CORRECT",
      "INCORRECT",
      "",
    ]) {
      expect(
        geoObservationAccuracyStatusSchema.safeParse(accuracyStatus).success,
      ).toBe(false);
    }
  });

  it("exports row/enum types aligned with the storage columns", () => {
    // Compile-time guard: the domain types later GEO tasks will import must
    // stay true to the storage enums and the append-only select row shape —
    // including the required is_current marker, the nullable accuracy_status
    // and the absence of any updated/parser-model/parsed-JSON field.
    const parseStatus: GeoObservationParseStatus = "SUCCESS";
    const accuracyStatus: GeoObservationAccuracyStatus = "ACCURATE";
    const parse: Pick<
      GeoObservationParse,
      | "id"
      | "runId"
      | "parserVersion"
      | "parseStatus"
      | "accuracyStatus"
      | "parsedAt"
      | "isCurrent"
    > = {
      id: "parse_alpha_v1",
      runId: "run_alpha_1",
      parserVersion: "1.0.0",
      parseStatus,
      accuracyStatus,
      parsedAt: "2026-09-08T04:00:05.000Z",
      isCurrent: true,
    };
    expect(parse.parseStatus).toBe("SUCCESS");
    expect(parse.accuracyStatus).toBe("ACCURATE");
    expect(parse.parserVersion).toBe("1.0.0");
    expect(parse.isCurrent).toBe(true);
    // accuracy_status is optional at the boundary: a parse with no accuracy
    // assessment (e.g. a FAILED parse) stores NULL.
    expect(geoObservationAccuracyStatusSchema.safeParse(null).success).toBe(
      false,
    );
    const parseWithoutAccuracy: Pick<
      GeoObservationParse,
      | "id"
      | "runId"
      | "parserVersion"
      | "parseStatus"
      | "accuracyStatus"
      | "isCurrent"
    > = {
      id: "parse_failed",
      runId: "run_alpha_1",
      parserVersion: "1.0.0",
      parseStatus: "FAILED",
      accuracyStatus: null,
      isCurrent: false,
    };
    expect(parseWithoutAccuracy.accuracyStatus).toBeNull();
  });
});
