/** Reference only; adapt to actual OpenSEO validation placement. */
import { z } from "zod";

export const observationSurfaceTypeSchema = z.enum([
  "AGGREGATED_SEARCH_DATA",
  "MODEL_API_SEARCH",
  "CONSUMER_PRODUCT_OBSERVED",
  "MANUAL_CONSUMER_OBSERVATION",
]);

export const measurementBatchSchema = z.object({
  promptIds: z.array(z.string().min(1)).min(1).max(200),
  repeats: z.number().int().min(1).max(5),
  surfaceIds: z.array(z.string().min(1)).min(1).max(10),
  estimatedCostAcknowledged: z.boolean().default(false),
});

export const releaseApprovalSchema = z.object({
  expectedBundleHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const bridgeHelloSchema = z.object({
  protocolVersion: z.number().int().positive(),
  bridgeVersion: z.string().min(1),
  executorVersions: z.record(z.string(), z.string()),
});

export const bridgeReceiptSchema = z.object({
  jobId: z.string().min(1),
  releaseTargetId: z.string().min(1),
  status: z.enum([
    "DRAFT_CREATED",
    "DRAFT_VERIFIED",
    "ACCEPTED_REMOTE_TASK",
    "PUBLISH_SUBMITTED",
    "PUBLIC_VERIFIED",
    "AUTH_REQUIRED",
    "REMOTE_STATE_UNKNOWN",
    "REJECTED",
    "EXECUTION_FAILED",
    "VERIFY_FAILED",
  ]),
  externalDraftId: z.string().optional(),
  externalTaskId: z.string().optional(),
  externalContentId: z.string().optional(),
  publicUrl: z.string().url().optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  mediaHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
  executorId: z.string().min(1),
  executorVersion: z.string().min(1),
  safeErrorCode: z.string().optional(),
});

export const runtimeControlSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.boolean(), z.number(), z.string()]),
  reason: z.string().max(1000).optional(),
});
