import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import type { experimentSnapshots } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// ExperimentSnapshot domain boundary
// ---------------------------------------------------------------------------
//
// ONE ExperimentSnapshot is the immutable, Project-scoped measurement record of
// ONE capture for an Experiment (05_DOMAIN_DATA_MODEL.md §14 ExperimentSnapshot;
// 16_ATTRIBUTION_EXPERIMENT_SPEC.md §6 Windows; 21_TEST_ACCEPTANCE_PLAN.md §27;
// legacy read-only `schemas/domain-types.ts` ExperimentSnapshot and
// `schemas/migrations-reference.sql` experiment_snapshots). This is the
// credential-free schema/contract slice ONLY: it records measurement context and
// payloads but does not activate an experiment, schedule a recheck, calculate
// attribution/comparison, query GEO/GSC/GA4/rank/index data, call a provider,
// publish, use credentials, spend or run any production behavior (TASK GOAL).
//
// The Drizzle columns already give compile-time narrowing; `experimentSnapshotSchema`
// is the matching runtime/domain representation of the direct fields (TASK item
// 1) for untrusted input before any later repository write:
//   - `id` and `projectId` are the stable identity and the explicit Project
//     identity keys (TASK item 2). There is no implicit/global ownership.
//   - `experimentId` is the REQUIRED Experiment relation; the storage composite
//     FK keeps it same-Project (TASK item 2). It is not optional, so it is a
//     plain required string (not `.nullable()`).
//   - `snapshotType` is narrowed to the source-defined taxonomy
//     (BASELINE | D7 | D14 | D30 | MANUAL — legacy `schemas/domain-types.ts`
//     ExperimentSnapshot.type) via the module-local enum. The storage column is
//     additionally guarded by the named
//     `experiment_snapshots_snapshot_type_valid` CHECK on both dialects. No
//     window/lifecycle taxonomy beyond this source-defined union is invented
//     (TASK item 3).
//   - `capturedAt` is the required application-supplied capture moment.
//   - `windowStart` / `windowEnd` / `timezone` and `notes` are nullable
//     (NULL = no window/timezone/note recorded); optional fields are
//     `.nullable()`, not `.optional()`, at this row boundary.
//   - `seoMetricsJson`, `geoMetricsJson`, `ga4MetricsJson`,
//     `publicationMetricsJson`, `indexingMetricsJson` and `dataQualityJson` are
//     the required metric/data-quality documents persisted as JSON text (the
//     accepted JSON-column convention). Their validity is enforced at the
//     database boundary by the named `experiment_snapshots_*_valid` CHECKs on
//     both dialects, so the migration-backed storage test — not this boundary —
//     proves JSON validity (TASK item 1/3). The boundary carries each document
//     verbatim and never decomposes it into relational ids or computed values.
//   - `createdAt` is the append-only system insert timestamp. There is no
//     `updatedAt` and no computed attribution/comparison/lifecycle field (TASK
//     item 3 / OUT OF SCOPE).
//
// The exported `ExperimentSnapshot` row type is the domain shape later
// measurement/attribution tasks will consume. The legacy domain type omits
// `notes` and `createdAt`; the reference table carries `notes` and the
// established Search Growth row convention adds the stable `id`, explicit
// `projectId` and append-only `createdAt`.

export type ExperimentSnapshot = InferSelectModel<typeof experimentSnapshots>;

const snapshotTypeSchema = z.enum(["BASELINE", "D7", "D14", "D30", "MANUAL"]);

export const experimentSnapshotSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  experimentId: z.string(),
  snapshotType: snapshotTypeSchema,
  capturedAt: z.string(),
  windowStart: z.string().nullable(),
  windowEnd: z.string().nullable(),
  timezone: z.string().nullable(),
  seoMetricsJson: z.string(),
  geoMetricsJson: z.string(),
  ga4MetricsJson: z.string(),
  publicationMetricsJson: z.string(),
  indexingMetricsJson: z.string(),
  dataQualityJson: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
