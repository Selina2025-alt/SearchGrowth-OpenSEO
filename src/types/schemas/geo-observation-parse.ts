import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { geoObservationParses } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// GeoObservationParse domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum columns give compile-time narrowing; these Zod enums
// are the runtime trust boundary for untrusted input before any repository
// write (mirrors ../schemas/geo-observation-run.ts, ../schemas/search-prompt.ts
// and the other Search Growth schema-boundary modules). The enum unions are the
// canonical V1.0 sets from schemas/domain-types.ts GeoObservationParse:
// `parse_status` is exactly SUCCESS | PARTIAL | FAILED and the optional
// `accuracy_status` is exactly ACCURATE | PARTIAL | INACCURATE | UNKNOWN when
// present. Because the approved values are uppercase, lowercase/mixed-case and
// empty strings are rejected — there is no case-insensitive parsing and no
// implicit/unknown fallback for a parse outcome or an accuracy assessment.
//
// Full-row CRUD/input schemas belong to the later parser/CRUD task; this task
// pins the domain contract the append-only storage layer is built on. The
// exported `GeoObservationParse` row type is the domain shape later tasks will
// consume: every scalar storage field of the immutable, versioned parse —
// including the nullable `accuracy_status`, the required `is_current` marker
// and the absence of any updated field. Parser-model/recommendation/parsed-JSON
// fields are intentionally not part of this slice (05_DOMAIN_DATA_MODEL.md §7
// ships only the direct field list; parsed entities/citations are normalized by
// later GeoEntityMention/GeoCitation tasks).

export type GeoObservationParse = InferSelectModel<typeof geoObservationParses>;

export const geoObservationParseStatusSchema = z.enum(
  geoObservationParses.parseStatus.enumValues,
);
export type GeoObservationParseStatus = z.infer<
  typeof geoObservationParseStatusSchema
>;

export const geoObservationAccuracyStatusSchema = z.enum(
  geoObservationParses.accuracyStatus.enumValues,
);
export type GeoObservationAccuracyStatus = z.infer<
  typeof geoObservationAccuracyStatusSchema
>;
