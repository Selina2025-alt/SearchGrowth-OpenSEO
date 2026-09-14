import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import type { publishingJobs } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// PublishingJob domain boundary
// ---------------------------------------------------------------------------
//
// ONE PublishingJob is the persisted, Project-scoped record of ONE accepted
// ReleaseTarget bound to its fixed PublicationExecutionPlan, an opaque executor
// identity and the source-defined publishing lifecycle status, plus the
// retry/idempotency and optional lease/external/error bookkeeping a later
// orchestration workflow reads (05_DOMAIN_DATA_MODEL.md §12 PublishingJob;
// 18_WORKFLOW_STATE_MACHINES.md §2 and §5; 10_DISTRIBUTION_ARCHITECTURE.md
// §§2–7; schemas/domain-types.ts PublishingJobStatus;
// schemas/migrations-reference.sql publishing_jobs).
//
// The Drizzle columns already give compile-time narrowing; `publishingJobSchema`
// is the matching runtime/domain representation of the direct fields (TASK item
// 1) for untrusted input before any repository write:
//   - `status` is narrowed to exactly the source-defined PublishingJobStatus
//     union (23 values — domain-types.ts / state-machines.json
//     publicPublishingJob; 18 §2), mirroring the DB text-enum CHECK. This slice
//     records the current value only — no transition/CAS is implied (TASK item
//     3).
//   - `attempts` / `maxAttempts` are integers with safe numeric boundaries
//     enforced here as well as in the DB (TASK item 3): `attempts >= 0`,
//     `maxAttempts >= 1` and `attempts <= maxAttempts`.
//   - `releaseTargetId` / `executionPlanId` / `projectId` are relational ids; the
//     DB composite FKs prove the plan belongs to the SAME Project AND the SAME
//     ReleaseTarget as the job (TASK item 2). The Zod boundary validates the row
//     shape; referential integrity is the DB's job.
//   - `executorId` / `executorVersion` and `idempotencyKey` are required OPAQUE
//     strings stored verbatim; no executor catalogue or replay/retry behavior is
//     defined here.
//   - `leasedBy` / `leaseExpiresAt`, the external draft/task/content ids,
//     `publicUrl` and the safe error code/message are nullable recorded fields
//     (NULL = absent). Storage only: no claim/lease/renewal, external action,
//     receipt or public verification is performed or asserted (TASK items 3–4).
//
// The public-success boundary is explicit: the external ids and `publicUrl` are
// OPAQUE recorded values. Their presence never asserts `PUBLIC_VERIFIED`, a
// publication receipt, a real remote action or a production result (TASK item
// 4). There is deliberately no receipt/verification column, no connector/
// credential field and no execution behavior.
//
// The exported `PublishingJob` row type is the domain shape later orchestration
// tasks will consume, and `publishingJobSchema` is the runtime guard for the
// same direct fields.

export type PublishingJob = InferSelectModel<typeof publishingJobs>;

export const PUBLISHING_JOB_STATUSES = [
  "PLANNED",
  "PREFLIGHT",
  "EXECUTION_READY",
  "STAGING_DRAFT",
  "DRAFT_CREATED",
  "DRAFT_VERIFIED",
  "FINALIZE_READY",
  "FINALIZING",
  "VALIDATING",
  "DRY_RUN_PASSED",
  "SUBMITTING",
  "ACCEPTED_REMOTE_TASK",
  "PUBLISH_SUBMITTED",
  "PUBLIC_VERIFYING",
  "PUBLIC_VERIFIED",
  "AUTH_REQUIRED",
  "PUBLISH_FIELDS_REQUIRED",
  "RATE_LIMITED",
  "REMOTE_STATE_UNKNOWN",
  "REJECTED",
  "EXECUTION_FAILED",
  "VERIFY_FAILED",
  "CANCELLED",
] as const;

export const publishingJobSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    releaseTargetId: z.string(),
    executionPlanId: z.string(),
    executorId: z.string(),
    executorVersion: z.string(),
    status: z.enum(PUBLISHING_JOB_STATUSES),
    attempts: z.number().int().min(0),
    maxAttempts: z.number().int().min(1),
    idempotencyKey: z.string(),
    leasedBy: z.string().nullable(),
    leaseExpiresAt: z.string().nullable(),
    externalDraftId: z.string().nullable(),
    externalTaskId: z.string().nullable(),
    externalContentId: z.string().nullable(),
    publicUrl: z.string().nullable(),
    lastErrorCode: z.string().nullable(),
    lastErrorMessageSafe: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .refine((job) => job.attempts <= job.maxAttempts, {
    message: "attempts must not exceed maxAttempts",
    path: ["attempts"],
  });
