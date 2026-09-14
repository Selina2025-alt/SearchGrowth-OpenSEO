import { describe, expect, it } from "vitest";
import { PUBLISHING_JOB_STATUSES } from "./publishing-job";
import type { PublicationReceipt } from "./publication-receipt";
import { publicationReceiptSchema } from "./publication-receipt";

// The PublicationReceipt domain boundary must carry the direct evidence fields
// verbatim, narrow the source-defined status union the legacy PublicationReceipt
// declares, validate the media-hash and verification documents, and preserve the
// evidence-only boundary. The opaque platform/executor/external-id/public-url
// fields are never parsed, and there is deliberately no transition/CAS, verifier,
// reachability, connector/credential or citation-attribution field (TASK items
// 1, 3–4).
const VALID_RECEIPT = {
  id: "receipt_job_alpha_1",
  projectId: "proj_alpha",
  publishingJobId: "job_alpha_1",
  releaseTargetId: "target_alpha_1",
  platform: "zhihu",
  executorId: "executor-opaque-1",
  executorVersion: "wechatsync-v1",
  externalDraftId: null,
  externalTaskId: null,
  externalContentId: null,
  publicUrl: null,
  contentHash: "sha256-content-1",
  mediaHashesJson: '["sha256-asset-1","sha256-asset-2"]',
  status: "PUBLISH_SUBMITTED",
  submittedAt: null,
  publishedAt: null,
  verifiedAt: null,
  verificationJson: "{}",
  createdAt: "2026-09-11T06:00:00.000Z",
} as const;

describe("PublicationReceipt domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = publicationReceiptSchema.parse(VALID_RECEIPT);
    expect(parsed).toEqual(VALID_RECEIPT);
    // Opaque executor/platform identities and the two documents are carried as
    // exact strings, never decomposed or resolved.
    expect(parsed.executorId).toBe("executor-opaque-1");
    expect(parsed.mediaHashesJson).toBe('["sha256-asset-1","sha256-asset-2"]');
    expect(parsed.verificationJson).toBe("{}");
  });

  it("accepts a receipt carrying external ids, a public URL, evidence timestamps and a verification document", () => {
    const parsed = publicationReceiptSchema.parse({
      ...VALID_RECEIPT,
      status: "PUBLIC_VERIFIED",
      externalDraftId: "remote-draft-1",
      externalTaskId: "remote-task-1",
      externalContentId: "remote-content-1",
      publicUrl: "https://example.com/article/1",
      submittedAt: "2026-09-11T06:01:00.000Z",
      publishedAt: "2026-09-11T06:02:00.000Z",
      verifiedAt: "2026-09-11T06:03:00.000Z",
      verificationJson: '{"profile":"zhihu-public-v1","loginRequired":false}',
    });
    // The external ids/public URL/timestamps are recorded opaque evidence;
    // nothing here is interpreted as reachability or public verification.
    expect(parsed.externalTaskId).toBe("remote-task-1");
    expect(parsed.publicUrl).toBe("https://example.com/article/1");
    expect(parsed.verifiedAt).toBe("2026-09-11T06:03:00.000Z");
  });

  it("accepts every source-defined status value", () => {
    for (const status of PUBLISHING_JOB_STATUSES) {
      expect(
        publicationReceiptSchema.safeParse({ ...VALID_RECEIPT, status })
          .success,
      ).toBe(true);
    }
  });

  it("rejects a status outside the source-defined union", () => {
    for (const status of ["QUEUED", "LEASED", "RUNNING", "PUBLISHED", ""]) {
      expect(
        publicationReceiptSchema.safeParse({ ...VALID_RECEIPT, status })
          .success,
      ).toBe(false);
    }
  });

  it("rejects a malformed media-hash document or one with the wrong shape", () => {
    // Must be a JSON array of strings — not malformed, not an object, not a
    // mixed array, not null, not a bare string.
    for (const mediaHashesJson of [
      "{not json",
      '{"asset":"sha256-1"}',
      '["sha256-1",7]',
      "null",
      '"sha256-1"',
    ]) {
      expect(
        publicationReceiptSchema.safeParse({
          ...VALID_RECEIPT,
          mediaHashesJson,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a malformed verification document or one with the wrong shape", () => {
    // Must be a JSON object — not malformed, not an array, not null, not a bare
    // scalar.
    for (const verificationJson of [
      "{not json",
      '["verified"]',
      "null",
      '"verified"',
      "7",
    ]) {
      expect(
        publicationReceiptSchema.safeParse({
          ...VALID_RECEIPT,
          verificationJson,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a row missing any required direct field", () => {
    for (const field of Object.keys(VALID_RECEIPT)) {
      const rest: Record<string, unknown> = { ...VALID_RECEIPT };
      delete rest[field];
      expect(publicationReceiptSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("exports a row type matching the evidence-storage shape only", () => {
    // Compile-time guard: the domain type later verification/attribution tasks
    // import carries the direct evidence fields plus the append-only createdAt,
    // and no transition/CAS, verifier, reachability, connector/credential or
    // citation-attribution field.
    const receipt: PublicationReceipt = { ...VALID_RECEIPT };
    expect(receipt.publishingJobId).toBe("job_alpha_1");
    expect(receipt.publicUrl).toBeNull();
    expect("updatedAt" in receipt).toBe(false);
    expect("publisherConnectionId" in receipt).toBe(false);
    expect("accountId" in receipt).toBe(false);
    expect("route" in receipt).toBe(false);
    expect("citationId" in receipt).toBe(false);
    expect("verifiedBy" in receipt).toBe(false);
  });
});
