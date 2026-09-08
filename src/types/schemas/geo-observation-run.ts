import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { geoObservationRuns } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// GeoObservationRun domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum columns give compile-time narrowing; these Zod enums
// are the runtime trust boundary for untrusted input before any repository
// write (mirrors ../schemas/search-market-profile.ts, ../schemas/search-topic.ts,
// ../schemas/search-prompt.ts and rank-tracking's enum handling). The enum
// unions are the canonical V1.0 sets from schemas/domain-types.ts
// (ObservationSurfaceType, SurfaceFidelity and the run-status union on
// GeoObservationRun). Because the approved values are uppercase, lowercase/
// mixed-case and empty strings are rejected — there is no case-insensitive
// parsing and no implicit/unknown fallback for a surface kind, fidelity, or run
// status.
//
// `geoObservationRepeatIndexSchema` is the runtime boundary for the V1.0 rule
// that a repeat index is a non-negative integer (schemas/domain-types.ts
// GeoObservationRun.repeatIndex); the storage layer enforces the same rule with
// the named `geo_observation_runs_repeat_index_nonnegative` CHECK constraint.
//
// Full-row CRUD/input schemas belong to the later observation-execution/CRUD
// task; this task pins the domain contract the append-only storage layer is
// built on. The exported `GeoObservationRun` row type is the domain shape later
// tasks will consume: every scalar storage field of the immutable run,
// including the raw payload captures and the nullable optional context fields.

export type GeoObservationRun = InferSelectModel<typeof geoObservationRuns>;

export const observationSurfaceTypeSchema = z.enum(
  geoObservationRuns.surfaceType.enumValues,
);
export type ObservationSurfaceType = z.infer<
  typeof observationSurfaceTypeSchema
>;

export const surfaceFidelitySchema = z.enum(
  geoObservationRuns.fidelity.enumValues,
);
export type SurfaceFidelity = z.infer<typeof surfaceFidelitySchema>;

export const geoObservationRunStatusSchema = z.enum(
  geoObservationRuns.status.enumValues,
);
export type GeoObservationRunStatus = z.infer<
  typeof geoObservationRunStatusSchema
>;

export const geoObservationRepeatIndexSchema = z.number().int().min(0);
