import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import type { releaseTargets } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// ReleaseTarget domain boundary
// ---------------------------------------------------------------------------
//
// ONE ReleaseTarget is the source-defined target intent frozen inside a
// ReleaseBundle before it is resolved into a PublicationExecutionPlan
// (05_DOMAIN_DATA_MODEL.md §12 ReleaseTarget; 10_DISTRIBUTION_ARCHITECTURE.md §2
// "each ReleaseTarget resolves into a fixed plan before execution", §4 route
// exclusivity; 16_ATTRIBUTION_EXPERIMENT_SPEC.md "ReleaseTarget has
// required=true/false"; 21_TEST_ACCEPTANCE_PLAN.md §14 max targets/release).
//
// The Drizzle columns already give compile-time narrowing; `releaseTargetSchema`
// is the matching runtime/domain representation of the direct fields (TASK item
// 1) for untrusted input before any repository write. The ONE source-defined
// enum narrowed at this boundary is `targetIntent` (DRAFT | PUBLIC |
// SUBMIT_FOR_REVIEW | PAID_SUBMIT — domain-types.ts TargetIntent; 10 §2
// targetIntent), validated here and DB-enforced by the named CHECK. Every other
// direct field is carried verbatim:
//   - `platform` is an opaque free-form platform slug (the platform/connector
//     catalogue is a later gated task), never an enum.
//   - `required` is the source-defined boolean flag (legacy DEFAULT 1).
//   - `scheduledAt`, `dependencyTargetId` and `utmUrl` are nullable optional
//     fields; NULL means "not set".
//   - `targetHash` is the required opaque target hash, stored verbatim; no
//     hashing runs in this slice.
//
// This is boundary validation only: no approve/execute/publish/spend/external
// system/credential/account/connector behavior and no CRUD/UI exists in this
// slice (TASK items 3–4). The legacy reference ReleaseTarget in
// schemas/domain-types.ts names `intent` (this V1.0 shape names the column
// `target_intent`/`targetIntent` to match the source column/plan key) and
// carries a required `publisherConnectionId`. That relation is DELIBERATELY NOT
// persisted or exposed here (TASK item 3): publisher connections/credentials/
// accounts belong to a later gated credential-bound task, so an unconstrained
// relational id must not exist. The exported `ReleaseTarget` row type is the
// domain shape later release orchestration tasks will consume, and the immutable
// contract is preserved: `createdAt` is the only audit field and there is no
// `updatedAt`, account, execution, receipt or public-success field.

export type ReleaseTarget = InferSelectModel<typeof releaseTargets>;

export const releaseTargetSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  releaseBundleId: z.string(),
  contentVariantId: z.string(),
  platform: z.string(),
  targetIntent: z.enum(["DRAFT", "PUBLIC", "SUBMIT_FOR_REVIEW", "PAID_SUBMIT"]),
  required: z.boolean(),
  scheduledAt: z.string().nullable(),
  dependencyTargetId: z.string().nullable(),
  utmUrl: z.string().nullable(),
  targetHash: z.string(),
  createdAt: z.string(),
});
