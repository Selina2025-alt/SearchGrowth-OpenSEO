import { describe, expect, it } from "vitest";
import type { PublishingJob } from "./publishing-job";
import { PUBLISHING_JOB_STATUSES, publishingJobSchema } from "./publishing-job";

// The PublishingJob domain boundary must carry the direct storage fields
// verbatim, narrow the source-defined status union and the safe attempt bounds,
// and preserve the storage-only / public-success boundary. The opaque executor,
// external-id, public-url and error fields are never parsed, and there is
// deliberately no receipt, verification, connector/credential, route or
// execution field (TASK items 1, 3–4).
const VALID_JOB = {
  id: "job_alpha_1",
  projectId: "proj_alpha",
  releaseTargetId: "target_alpha_1",
  executionPlanId: "plan_alpha_1",
  executorId: "executor-opaque-1",
  executorVersion: "wechatsync-v1",
  status: "PLANNED",
  attempts: 0,
  maxAttempts: 3,
  idempotencyKey: "idem-opaque-1",
  leasedBy: null,
  leaseExpiresAt: null,
  externalDraftId: null,
  externalTaskId: null,
  externalContentId: null,
  publicUrl: null,
  lastErrorCode: null,
  lastErrorMessageSafe: null,
  createdAt: "2026-09-11T05:00:00.000Z",
  updatedAt: "2026-09-11T05:00:00.000Z",
} as const;

describe("PublishingJob domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = publishingJobSchema.parse(VALID_JOB);
    expect(parsed).toEqual(VALID_JOB);
    // Opaque executor/idempotency identities are carried as exact strings and
    // never decomposed or resolved.
    expect(parsed.executorId).toBe("executor-opaque-1");
    expect(parsed.idempotencyKey).toBe("idem-opaque-1");
  });

  it("accepts a job carrying lease, external ids, a public URL and a safe error", () => {
    const parsed = publishingJobSchema.parse({
      ...VALID_JOB,
      status: "ACCEPTED_REMOTE_TASK",
      attempts: 2,
      leasedBy: "bridge-1",
      leaseExpiresAt: "2026-09-11T05:10:00.000Z",
      externalDraftId: "remote-draft-1",
      externalTaskId: "remote-task-1",
      externalContentId: "remote-content-1",
      publicUrl: "https://example.com/article/1",
      lastErrorCode: "RATE_LIMITED",
      lastErrorMessageSafe: "Platform asked to slow down",
    });
    // The external ids/public URL are recorded opaque values; nothing here is
    // interpreted as public verification.
    expect(parsed.externalTaskId).toBe("remote-task-1");
    expect(parsed.publicUrl).toBe("https://example.com/article/1");
  });

  it("accepts every source-defined PublishingJobStatus value", () => {
    for (const status of PUBLISHING_JOB_STATUSES) {
      expect(
        publishingJobSchema.safeParse({ ...VALID_JOB, status }).success,
      ).toBe(true);
    }
  });

  it("rejects a status outside the source-defined union", () => {
    for (const status of ["QUEUED", "LEASED", "RUNNING", "PUBLISHED", ""]) {
      expect(
        publishingJobSchema.safeParse({ ...VALID_JOB, status }).success,
      ).toBe(false);
    }
  });

  it("rejects unsafe attempt boundaries", () => {
    const invalid = [
      { attempts: -1, maxAttempts: 3 },
      { attempts: 0, maxAttempts: 0 },
      { attempts: 4, maxAttempts: 3 },
      { attempts: 1.5, maxAttempts: 3 },
    ];
    for (const bounds of invalid) {
      expect(
        publishingJobSchema.safeParse({ ...VALID_JOB, ...bounds }).success,
      ).toBe(false);
    }
  });

  it("rejects a row missing any required direct field", () => {
    for (const field of Object.keys(VALID_JOB)) {
      const rest: Record<string, unknown> = { ...VALID_JOB };
      delete rest[field];
      expect(publishingJobSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("exports a row type matching the storage contract only", () => {
    // Compile-time guard: the domain type later orchestration tasks import
    // carries the direct storage fields and no receipt / public-verification /
    // connector/credential / route / content-fingerprint field.
    const job: PublishingJob = { ...VALID_JOB };
    expect(job.idempotencyKey).toBe("idem-opaque-1");
    expect(job.publicUrl).toBeNull();
    expect("publicVerifiedAt" in job).toBe(false);
    expect("receiptId" in job).toBe(false);
    expect("publisherConnectionId" in job).toBe(false);
    expect("accountId" in job).toBe(false);
    expect("route" in job).toBe(false);
    expect("contentHash" in job).toBe(false);
  });
});
