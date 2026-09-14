import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import type { publicationReceipts } from "@/db/search-growth.schema";
import { PUBLISHING_JOB_STATUSES } from "./publishing-job";

// ---------------------------------------------------------------------------
// PublicationReceipt domain boundary
// ---------------------------------------------------------------------------
//
// ONE PublicationReceipt is the persisted, Project-scoped EVIDENCE RECORD a
// publishing job's attempt produced, as recorded by a later
// orchestration/verification workflow (05_DOMAIN_DATA_MODEL.md §12
// PublicationReceipt; 10_DISTRIBUTION_ARCHITECTURE.md §§1/8 "Public Success";
// 13_PUBLISH_FINALIZER_SPEC.md; 17_SECURITY_GOVERNANCE.md "publication receipts:
// 长期"; schemas/domain-types.ts PublicationReceipt;
// schemas/migrations-reference.sql publication_receipts).
//
// The Drizzle columns already give compile-time narrowing; the
// `publicationReceiptSchema` below is the matching runtime/domain representation
// of the direct fields (TASK item 1) for untrusted input before any repository
// write. Every direct field is carried verbatim:
//   - `projectId`, `publishingJobId` and `releaseTargetId` are relational ids;
//     the DB composite FKs prove the job belongs to the SAME Project AND the
//     SAME ReleaseTarget as the receipt (TASK item 2). The Zod boundary
//     validates the row shape; referential integrity is the DB's job.
//   - `platform`, `executorId`, `executorVersion`, the external ids, `publicUrl`
//     and `contentHash` are OPAQUE strings stored exactly as received. No
//     platform/executor/connector catalogue is referenced and no value is
//     parsed. The external ids and the public URL are recorded evidence only:
//     their presence never asserts `PUBLIC_VERIFIED`, reachability or a
//     publication result (TASK items 3–4; 10 §8).
//   - `status` reuses the exact source-defined union the legacy
//     `PublicationReceipt` declares (`PublishingJobStatus`; domain-types.ts; 18
//     §2). The row RECORDS the value only — no transition, derivation or
//     automatic success decision is implemented (TASK item 3). A recorded
//     `PUBLIC_VERIFIED` status is never derived from a draft URL, a submitted
//     state, a remote task id or a raw stored URL.
//   - `mediaHashesJson` is the media-hash DOCUMENT stored as JSON text and
//     shape-validated here as a JSON array of hash strings (legacy
//     `mediaHashes: string[]`), mirroring the DB `json_valid` CHECK. It is never
//     decomposed into a relational/id container and no hash matching/dedup rule
//     is invented.
//   - `verificationJson` is the verification DOCUMENT stored as JSON text and
//     shape-validated here as a JSON object (legacy `verification:
//     Record<string, unknown>`). No verifier logic reads or derives it.
//   - `submittedAt` / `publishedAt` / `verifiedAt` are optional recorded
//     timestamps (NULL = not recorded). They never perform or prove a public
//     verification (TASK items 3–4).
//
// This is an immutable evidence snapshot: there is deliberately no
// updated_at, no state-transition/CAS, no verifier, no reachability check, no
// executor/connector/credential field and no citation/attribution field (TASK
// items 3–4).
//
// The exported `PublicationReceipt` row type is the domain shape later
// verification/attribution tasks will consume, and `publicationReceiptSchema` is
// the runtime guard for the same direct fields.

export type PublicationReceipt = InferSelectModel<typeof publicationReceipts>;

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

export const publicationReceiptSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  publishingJobId: z.string(),
  releaseTargetId: z.string(),
  platform: z.string(),
  executorId: z.string(),
  executorVersion: z.string(),
  externalDraftId: z.string().nullable(),
  externalTaskId: z.string().nullable(),
  externalContentId: z.string().nullable(),
  publicUrl: z.string().nullable(),
  contentHash: z.string(),
  mediaHashesJson: z
    .string()
    .refine(
      isJsonArrayOfStrings,
      "mediaHashesJson must be a JSON array of strings",
    ),
  status: z.enum(PUBLISHING_JOB_STATUSES),
  submittedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  verificationJson: z
    .string()
    .refine(isJsonObject, "verificationJson must be a JSON object"),
  createdAt: z.string(),
});
