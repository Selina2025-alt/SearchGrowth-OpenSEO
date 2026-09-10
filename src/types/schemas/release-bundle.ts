import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import type { releaseBundles } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// ReleaseBundle domain boundary
// ---------------------------------------------------------------------------
//
// ONE ReleaseBundle is the immutable business approval unit that freezes a
// ContentVersion plus its content/asset/target/UTM/execution-plan hash
// (05_DOMAIN_DATA_MODEL.md §12 "ReleaseBundle — Immutable approval unit";
// docs/adr/ADR-008-releasebundle-approval.md; 21_TEST_ACCEPTANCE_PLAN.md §12).
//
// The Drizzle columns already give compile-time narrowing; `releaseBundleSchema`
// is the matching runtime/domain representation of the direct fields (TASK item
// 1) for untrusted input before any repository write. The two source-defined
// lifecycle unions are the only enum narrowing at this boundary:
//   - `status` is the release lifecycle union (DRAFT | DRY_RUN_READY |
//     READY_FOR_APPROVAL | APPROVED | EXECUTING | COMPLETED | PARTIAL | PAUSED |
//     CANCELLED — 18_WORKFLOW_STATE_MACHINES.md §1; domain-types.ts
//     ReleaseBundle.status), validated here and DB-enforced by the named CHECK.
//   - `releaseStrategy` is the source-defined strategy union (WEBSITE_FIRST |
//     PARALLEL | SOCIAL_ONLY — domain-types.ts ReleaseBundle.strategy).
// Every other direct field is carried verbatim:
//   - `utmPolicyJson` is the required opaque UTM policy document frozen with the
//     bundle (ADR-008; 21 §12): a JSON string, never parsed into a relational
//     model at this boundary.
//   - `bundleHash` is the required opaque frozen-bundle hash (21 §12), stored
//     verbatim; no hashing runs in this slice.
//   - `dryRunReportJson` (nullable) is the optional opaque dry-run report
//     document; NULL = not attached. `approvedBy`/`approvedAt` (nullable) are the
//     approval fields; NULL = not approved.
//
// This is boundary validation only: no state transition/CAS, approval action,
// dry-run execution, target/connector/account logic, publishing, paid action, or
// CRUD/UI exists in this slice (TASK item 4). The legacy reference ReleaseBundle
// in schemas/domain-types.ts names `strategy` (this V1.0 shape names the column
// `release_strategy`/`releaseStrategy` for storage clarity) and the legacy
// migrations-reference table carries an `updated_at`; that mutable column is
// reconciled OUT because the TASK field list names the creation timestamp only
// and no state transition/CAS is implemented — the row is written once, and a
// change to any frozen item creates a new release_version (ADR-008; 21 §12).
//
// The exported `ReleaseBundle` row type is the domain shape later release
// orchestration/approval tasks will consume, and `releaseBundleSchema` is the
// runtime guard for the same direct fields. The immutable contract is preserved:
// `createdAt` is the only audit field, and there is no `updatedAt`, execution,
// receipt, account, publishing or public-success field.

export type ReleaseBundle = InferSelectModel<typeof releaseBundles>;

export const releaseBundleSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  contentPackageVersionId: z.string(),
  releaseVersion: z.number().int(),
  status: z.enum([
    "DRAFT",
    "DRY_RUN_READY",
    "READY_FOR_APPROVAL",
    "APPROVED",
    "EXECUTING",
    "COMPLETED",
    "PARTIAL",
    "PAUSED",
    "CANCELLED",
  ]),
  releaseStrategy: z.enum(["WEBSITE_FIRST", "PARALLEL", "SOCIAL_ONLY"]),
  utmPolicyJson: z.string(),
  bundleHash: z.string(),
  dryRunReportJson: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
});
