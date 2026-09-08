import { describe, expect, it } from "vitest";
import { geoObservationRuns } from "@/db/search-growth.schema";
import type {
  GeoObservationRun,
  GeoObservationRunStatus,
  ObservationSurfaceType,
  SurfaceFidelity,
} from "./geo-observation-run";
import {
  geoObservationRepeatIndexSchema,
  geoObservationRunStatusSchema,
  observationSurfaceTypeSchema,
  surfaceFidelitySchema,
} from "./geo-observation-run";

// The DB text-enum columns and the Zod boundaries must not drift: a value the
// Zod schema accepts has to be a value the column type admits, and vice versa.
// Drift here would let future repositories write a surface kind / fidelity /
// run status the domain boundary never validated. There is intentionally no
// implicit/lowercase/unknown fallback (05_DOMAIN_DATA_MODEL.md §6,
// schemas/domain-types.ts).
describe("GeoObservationRun domain boundary", () => {
  it("lists every surface_type column value as a valid ObservationSurfaceType", () => {
    for (const surfaceType of geoObservationRuns.surfaceType.enumValues) {
      expect(observationSurfaceTypeSchema.safeParse(surfaceType).success).toBe(
        true,
      );
    }
  });

  it("rejects unsupported, case-mismatched and empty surface types", () => {
    for (const surfaceType of [
      // Case-mismatched variants of the approved uppercase values.
      "aggregated_search_data",
      "Model_API_Search",
      "ConsumerProductObserved",
      // Unsupported surface kinds.
      "SEARCH_API",
      "LLM_SEARCH",
      "BROWSER_AGENT",
      "SERP",
      "GEO",
      "",
    ]) {
      expect(observationSurfaceTypeSchema.safeParse(surfaceType).success).toBe(
        false,
      );
    }
  });

  it("lists every fidelity column value as a valid SurfaceFidelity", () => {
    for (const fidelity of geoObservationRuns.fidelity.enumValues) {
      expect(surfaceFidelitySchema.safeParse(fidelity).success).toBe(true);
    }
  });

  it("rejects unsupported, case-mismatched and empty fidelity values", () => {
    for (const fidelity of [
      "aggregated",
      "api_simulation",
      "ConsumerObserved",
      "MANUAL",
      "LIVE",
      "REAL",
      "",
    ]) {
      expect(surfaceFidelitySchema.safeParse(fidelity).success).toBe(false);
    }
  });

  it("lists every status column value as a valid run status", () => {
    for (const status of geoObservationRuns.status.enumValues) {
      expect(geoObservationRunStatusSchema.safeParse(status).success).toBe(
        true,
      );
    }
  });

  it("rejects unsupported, case-mismatched and empty run statuses", () => {
    for (const status of [
      "pending",
      "running",
      "Succeeded",
      "FAILED ",
      "COMPLETED",
      "ERROR",
      "CANCELLED",
      "",
    ]) {
      expect(geoObservationRunStatusSchema.safeParse(status).success).toBe(
        false,
      );
    }
  });

  it("accepts only non-negative integer repeat indices", () => {
    for (const repeatIndex of [0, 1, 5, 1000000]) {
      expect(
        geoObservationRepeatIndexSchema.safeParse(repeatIndex).success,
      ).toBe(true);
    }
    for (const repeatIndex of [
      -1,
      -100,
      1.5,
      0.001,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(
        geoObservationRepeatIndexSchema.safeParse(repeatIndex).success,
      ).toBe(false);
    }
  });

  it("exports row/enum types aligned with the storage columns", () => {
    // Compile-time guard: the domain types later GEO tasks will import must
    // stay true to the storage enums and the append-only select row shape —
    // including the raw payload captures and the absence of any updated field.
    const surfaceType: ObservationSurfaceType = "MODEL_API_SEARCH";
    const fidelity: SurfaceFidelity = "API_SIMULATION";
    const status: GeoObservationRunStatus = "SUCCEEDED";
    const run: Pick<
      GeoObservationRun,
      | "id"
      | "batchId"
      | "projectId"
      | "promptId"
      | "promptVersion"
      | "surfaceType"
      | "surfaceName"
      | "fidelity"
      | "marketProfileId"
      | "repeatIndex"
      | "applicationCacheBypassed"
      | "rawAnswer"
      | "rawResponse"
      | "usage"
      | "startedAt"
      | "finishedAt"
      | "status"
    > = {
      id: "run_alpha_1",
      batchId: "batch_alpha",
      projectId: "proj_alpha",
      promptId: "prompt_alpha",
      promptVersion: 2,
      surfaceType,
      surfaceName: "GPT-5 Search",
      fidelity,
      marketProfileId: null,
      repeatIndex: 0,
      applicationCacheBypassed: true,
      rawAnswer: "Raw observed answer text",
      rawResponse: '{"citations":[]}',
      usage: '{"inputTokens":128}',
      startedAt: "2026-09-08T04:00:00.000Z",
      finishedAt: "2026-09-08T04:00:03.000Z",
      status,
    };
    expect(run.surfaceType).toBe("MODEL_API_SEARCH");
    expect(run.fidelity).toBe("API_SIMULATION");
    expect(run.status).toBe("SUCCEEDED");
    expect(run.marketProfileId).toBeNull();
    expect(run.repeatIndex).toBe(0);
    expect(run.applicationCacheBypassed).toBe(true);
    expect(run.rawResponse).toBe('{"citations":[]}');
  });
});
