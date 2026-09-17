import { GeoObservationBatchReaderRepository } from "../repositories/GeoObservationBatchReaderRepository";
import {
  assembleGeoObservationCohortContext,
  type GeoObservationCohortContextAssembly,
} from "./geoObservationCohortContextAssembler";

// ============================================================================
// GEO observation batch cohort context service
// (07_GEO_MEASUREMENT_SPEC.md §§1–4 and 7; 05_DOMAIN_DATA_MODEL.md §§2 and 6;
// ADR-003, ADR-005)
// ============================================================================
//
// The one read boundary that turns a Project-and-batch selector into that
// batch's immutable rows, the T151-validated cohort projected from them, and the
// T152 structured context that cohort carries. It owns no rule of its own: it
// reads once through the accepted T154 reader and hands the rows that come back
// to the accepted T156 assembler once, then returns what T156 produced.
//
// Boundary declaration:
//   - Two accepted calls, in this order, and nothing else. Exactly one
//     `readBatch` call carries the caller's selector to storage, and exactly one
//     `assembleGeoObservationCohortContext` call carries that read's rows
//     onward. The assembler's own result is returned as-is, so the three
//     returned fields are the accepted T156 fields: the reader's ordered rows,
//     one T151 member per row, and T152's five-field structured context. No
//     second read, no batch-only lookup, and no independent query exists here —
//     which is also why a Project/batch isolation decision is impossible to get
//     wrong at this boundary: it was already made by the Project-scoped SELECT
//     inside T154.
//   - The selector is opaque. `projectId` and `batchId` are forwarded verbatim,
//     in order, and never replaced, trimmed, normalized, defaulted, or sorted.
//     The accepted T154 reader owns selector validation, so re-checking either
//     field here would duplicate a rule that already has one owner and would
//     risk this boundary rejecting something that boundary would accept.
//   - Fail closed by propagation. There is no error handling, no fallback, and
//     no default: the reader's selector rejection and its storage failure, the
//     T156 projector's rejection of an unusable stored `marketProfileId` or
//     `modelVersion`, and every T151 rejection surfaced through T155 or T152
//     (an empty batch's empty list included) reach the caller unchanged. A
//     failed read is never reported as an empty assembly, and no partial rows,
//     partial members, or partial context is ever returned.
//   - It adds nothing. No observation is counted, no repeat fraction, rate,
//     ratio, metric, or confidence is calculated, no partial-or-complete batch
//     status is decided, and no prompt, language, window, or parser field is
//     attached. Nothing is filtered, de-duplicated, sampled, or selected from
//     another batch, and raw evidence is never re-read, rewritten, redacted, or
//     copied into a new shape. The returned rows and evidence are the stored
//     ones, read only.

/**
 * Read one batch's immutable observation rows through the accepted T154 reader
 * and return the accepted T156 cohort context assembly for them.
 *
 * The caller supplies the same two selectors T154 defines, and they are passed
 * straight through: the single Project-scoped batch read happens inside T154, so
 * another Project's rows are excluded even when they reuse the same batch id.
 * The rows it returns — in the reader's deterministic `repeatIndex` then `id`
 * order, raw evidence and provenance included — are handed to the T156 assembler
 * exactly once, and its `rows`, `members`, and `context` are returned unchanged.
 *
 * Every failure propagates by identity rather than becoming an empty result: an
 * unusable selector or a database failure from T154, a T155 projection rejection
 * for a stored `marketProfileId`/`modelVersion` that cannot supply a member
 * identity, and every T151 rejection reached through T155/T152 — including the
 * rejection of an empty batch, which is a cohort the guard refuses — all surface
 * to the caller with no assembly, no partial members, and no partial context.
 */
export async function readGeoObservationBatchCohortContext(
  projectId: string,
  batchId: string,
): Promise<GeoObservationCohortContextAssembly> {
  const rows = await GeoObservationBatchReaderRepository.readBatch(
    projectId,
    batchId,
  );

  return assembleGeoObservationCohortContext(rows);
}
