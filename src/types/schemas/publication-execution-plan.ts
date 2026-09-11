import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import type { publicationExecutionPlans } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// PublicationExecutionPlan domain boundary
// ---------------------------------------------------------------------------
//
// ONE PublicationExecutionPlan is the fixed route/strategy/policy snapshot that
// resolves ONE accepted ReleaseTarget before execution
// (05_DOMAIN_DATA_MODEL.md §12 PublicationExecutionPlan; 10_DISTRIBUTION_ARCHITECTURE.md
// §2 "each ReleaseTarget resolves into a fixed plan before execution" and "the
// runtime agent never decides how to publish at execution time", §4 route
// exclusivity; schemas/domain-types.ts PublicationExecutionPlan;
// skills/08-distribution-plan.md outputs).
//
// The Drizzle columns already give compile-time narrowing;
// `publicationExecutionPlanSchema` is the matching runtime/domain representation
// of the direct fields (TASK item 1) for untrusted input before any repository
// write. The source-defined enums are narrowed at this boundary:
//   - `route` and `fallbackRoute` are the distribution route union (OWNED_SITE |
//     WECHATSYNC_STAGED_FINALIZE | YXER_NATIVE | SOCIAL_AUTO_UPLOAD_NATIVE |
//     POSTIZ_NATIVE | PAID_MEDIA_SERVICE — domain-types.ts DistributionRoute;
//     10 §§2–3), both DB-checked by the named CHECK constraints; `fallbackRoute`
//     is nullable (NULL = no fallback).
//   - `finalizerStrategy` is the nullable finalizer strategy union (OFFICIAL_API |
//     IN_PAGE_WEB_API | SERVICE_CLI | FIXED_DOM — domain-types.ts
//     FinalizerStrategy; 10 §2), DB-checked and narrowed here (NULL admitted).
// Every other direct field is carried verbatim:
//   - `draftStagerId` / `finalizerId` are optional OPAQUE stager/finalizer
//     identifiers (10 §2 draftStager/finalizer), nullable; the stager/finalizer
//     catalogue is a later gated task, so no enum/connector reference is
//     invented (they mirror the accepted ReleaseTarget opaque `platform`).
//   - `executorVersion` and `planHash` are required opaque strings stored
//     verbatim; no hashing/pinning enforcement runs in this slice.
//   - `requiredFieldsJson`, `constraintsSnapshotJson` and
//     `verificationPolicyJson` are the required plan DOCUMENTS (TASK items 1/3)
//     stored as JSON text. The TASK requires structured documents to be validated
//     at trust boundaries: the migration CHECKs reject malformed JSON at the
//     storage boundary, and this boundary validates the document SHAPE —
//     `requiredFieldsJson` is a JSON array of field-name strings
//     (domain-types.ts requiredFields: string[]) and the constraints/verification
//     documents are JSON objects (domain-types.ts Record<string, unknown>). The
//     value is still carried as the verbatim JSON string; it is never parsed into
//     a relational/id container, and no document is decomposed into columns.
//
// This is boundary validation only: no plan resolution, approval, state
// transition, execution, job/retry/concurrency, runtime route selection,
// credential/account/connector, publishing, paid action, or CRUD/UI exists in
// this slice (TASK items 3–4). The legacy reference PublicationExecutionPlan in
// schemas/domain-types.ts has no `projectId`/`createdAt`; this V1.0 shape is the
// Project-scoped immutable row contract (explicit Project identity, one
// ReleaseTarget, `createdAt` only). The legacy `accountId`/`targetIntent`/
// `platform` plan keys are DELIBERATELY NOT persisted: account/connector state
// belongs to a later gated credential-bound task, and target intent/platform
// already live on the owning ReleaseTarget.
//
// The exported `PublicationExecutionPlan` row type is the domain shape later
// distribution-planning/orchestration tasks will consume, and
// `publicationExecutionPlanSchema` is the runtime guard for the same direct
// fields. The immutable contract is preserved: `createdAt` is the only audit
// field, and there is no `updatedAt`, execution, approval, account, job, receipt
// or public-success field.

export type PublicationExecutionPlan = InferSelectModel<
  typeof publicationExecutionPlans
>;

const isJsonArrayOfStrings = (value: string) => {
  try {
    const parsed: unknown = JSON.parse(value);
    return (
      Array.isArray(parsed) &&
      parsed.every((entry) => typeof entry === "string")
    );
  } catch {
    return false;
  }
};

const isJsonObject = (value: string) => {
  try {
    const parsed: unknown = JSON.parse(value);
    return (
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
};

export const publicationExecutionPlanSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  releaseTargetId: z.string(),
  route: z.enum([
    "OWNED_SITE",
    "WECHATSYNC_STAGED_FINALIZE",
    "YXER_NATIVE",
    "SOCIAL_AUTO_UPLOAD_NATIVE",
    "POSTIZ_NATIVE",
    "PAID_MEDIA_SERVICE",
  ]),
  draftStagerId: z.string().nullable(),
  finalizerId: z.string().nullable(),
  finalizerStrategy: z
    .enum(["OFFICIAL_API", "IN_PAGE_WEB_API", "SERVICE_CLI", "FIXED_DOM"])
    .nullable(),
  executorVersion: z.string(),
  requiredFieldsJson: z
    .string()
    .refine(
      isJsonArrayOfStrings,
      "requiredFieldsJson must be a JSON array of strings",
    ),
  constraintsSnapshotJson: z
    .string()
    .refine(isJsonObject, "constraintsSnapshotJson must be a JSON object"),
  verificationPolicyJson: z
    .string()
    .refine(isJsonObject, "verificationPolicyJson must be a JSON object"),
  fallbackRoute: z
    .enum([
      "OWNED_SITE",
      "WECHATSYNC_STAGED_FINALIZE",
      "YXER_NATIVE",
      "SOCIAL_AUTO_UPLOAD_NATIVE",
      "POSTIZ_NATIVE",
      "PAID_MEDIA_SERVICE",
    ])
    .nullable(),
  planHash: z.string(),
  createdAt: z.string(),
});
