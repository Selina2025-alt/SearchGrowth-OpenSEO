import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import type { platformDrafts } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// PlatformDraft domain boundary
// ---------------------------------------------------------------------------
//
// ONE PlatformDraft is the credential-free evidence that ONE approved
// ReleaseTarget was staged as a DRAFT on a platform and (optionally) that the
// draft itself was verified (05_DOMAIN_DATA_MODEL.md §12 PlatformDraft;
// 11_WECHATSYNC_DRAFT_STAGER_SPEC.md §§5–10; 10_DISTRIBUTION_ARCHITECTURE.md §3
// route WECHATSYNC_STAGED_FINALIZE; schemas/domain-types.ts PlatformDraft;
// schemas/migrations-reference.sql platform_drafts).
//
// The Drizzle columns already give compile-time narrowing; `platformDraftSchema`
// is the matching runtime/domain representation of the direct fields (TASK item
// 1) for untrusted input before any repository write. Every direct field is
// carried verbatim:
//   - `platform`, `accountId`, `draftId`, `contentHash`, `stagerId` and
//     `stagerVersion` are required OPAQUE strings stored exactly as received.
//     The platform/account/connector and stager catalogues are later gated tasks,
//     so no enum/connector reference is invented and no value is parsed (TASK
//     item 4). `accountId`, `draftId`, `stagerId` and `stagerVersion` are
//     identities ONLY — no publisher connection, credential, certification or
//     account-management behavior exists here.
//   - `draftUrl` and `verifiedAt` are nullable (NULL = no URL returned / not yet
//     draft-verified).
//   - `assetHashesJson` is the staged asset-hash DOCUMENT stored as JSON text and
//     shape-validated here as a JSON array of hash strings (legacy
//     `assetHashes: string[]`), mirroring the DB `json_valid` CHECK. It is never
//     parsed into a relational/id container and no hash matching/dedup rule is
//     invented.
//
// The draft/public-success boundary is explicit: `verifiedAt` records DRAFT
// verification only. It never asserts `PUBLIC_VERIFIED`, a final publish, a
// public URL, a receipt or public success (TASK item 3; 11 §1 "草稿不是 Public
// Success", §8 Draft Verification; 21_TEST_ACCEPTANCE_PLAN.md §15
// "DRAFT_CREATED/DRAFT_VERIFIED 不算 Public 成功"). There is deliberately no
// status/lifecycle, route, execution, retry/job, receipt or credential field.
//
// The exported `PlatformDraft` row type is the domain shape later
// draft-staging/finalizing tasks will consume, and `platformDraftSchema` is the
// runtime guard for the same direct fields.

export type PlatformDraft = InferSelectModel<typeof platformDrafts>;

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

export const platformDraftSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  releaseTargetId: z.string(),
  platform: z.string(),
  accountId: z.string(),
  draftId: z.string(),
  draftUrl: z.string().nullable(),
  contentHash: z.string(),
  assetHashesJson: z
    .string()
    .refine(
      isJsonArrayOfStrings,
      "assetHashesJson must be a JSON array of strings",
    ),
  stagerId: z.string(),
  stagerVersion: z.string(),
  verifiedAt: z.string().nullable(),
  createdAt: z.string(),
});
