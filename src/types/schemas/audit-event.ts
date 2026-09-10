import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import type { searchGrowthAuditEvents } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// AuditEvent domain boundary
// ---------------------------------------------------------------------------
//
// ONE AuditEvent is the append-only, Project-scoped governance fact recording
// what happened to a Project-scoped object (05_DOMAIN_DATA_MODEL.md §13
// "AuditEvent — append only"; 24_RISK_REGISTER.md R42; 21_TEST_ACCEPTANCE_PLAN.md
// §14 "Pause 后 ... 必须写 audit"; 30_TRACEABILITY_MATRIX.md row
// "可审计 | AuditEvent | assertions"). This is the credential-free schema/
// contract core slice ONLY: it records no external action and implements no
// runtime-control mutation, release execution, publishing, spend,
// credential/account/connector model, CRUD, UI or production behavior (TASK
// items 1, 3, 4).
//
// The Drizzle columns already give compile-time narrowing; `auditEventSchema` is
// the matching runtime/domain representation of the direct fields (TASK item 1)
// for untrusted input before any later repository write. Every direct field is
// carried verbatim — there is no enum, taxonomy or business rule to narrow in
// this core slice:
//   - `actorId`, `action`, `objectType`, `objectId` and `correlationId` are
//     opaque required strings. Actor/object/correlation values are deliberately
//     NOT foreign keys and no action/object taxonomy is invented (TASK item 3).
//   - `beforeRef` / `afterRef` are nullable opaque strings; NULL means the event
//     carries no before/after reference.
//   - `metadataJson` is the required metadata document persisted as JSON text
//     (the accepted JSON-column convention). Its validity is enforced at the
//     database boundary by the named `search_growth_audit_events_metadata_valid`
//     CHECK on both dialects, so the migration-backed storage test — not this
//     boundary — proves metadata validation (TASK item 2). The boundary carries
//     the document verbatim and never decomposes it into relational ids.
//   - `createdAt` is the append-only creation timestamp; the row has no
//     `updatedAt` and no mutable execution/approval/runtime-control state.
//
// The exported `AuditEvent` row type is the domain shape later audit-writing
// tasks will consume. The legacy reference `AuditEvent` in
// schemas/domain-types.ts names the metadata field `metadata` (an object); this
// V1.0 shape stores it as validated `metadata_json` text, matching the accepted
// ContentVariant `metadataJson` precedent and the legacy reference table. The
// legacy type also omits `created_at`; the stable `id`, explicit `projectId` and
// append-only `createdAt` are the established Search Growth row convention.

export type AuditEvent = InferSelectModel<typeof searchGrowthAuditEvents>;

export const auditEventSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  actorId: z.string(),
  action: z.string(),
  objectType: z.string(),
  objectId: z.string(),
  beforeRef: z.string().nullable(),
  afterRef: z.string().nullable(),
  metadataJson: z.string(),
  correlationId: z.string(),
  createdAt: z.string(),
});
