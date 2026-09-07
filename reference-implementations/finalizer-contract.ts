export interface SameDraftFinalizerInput {
  jobId: string;
  releaseTargetId: string;
  platform: string;
  accountId: string;
  draftId: string;
  draftUrl?: string;
  expectedContentHash: string;
  expectedTitle: string;
  requiredPublishFields: Record<string, unknown>;
  idempotencyKey: string;
}

export interface DraftInspection {
  exists: boolean;
  accountMatches: boolean;
  titleMatches: boolean;
  contentFingerprintMatches?: boolean;
  alreadyPublic: boolean;
  publicUrl?: string;
  externalContentId?: string;
}

export type FinalizeOutcome =
  | {
      kind: "PUBLISH_SUBMITTED";
      externalContentId?: string;
      publicUrl?: string;
    }
  | { kind: "PUBLIC_VERIFIED"; externalContentId?: string; publicUrl: string }
  | { kind: "AUTH_REQUIRED"; message: string }
  | { kind: "REMOTE_STATE_UNKNOWN"; message: string }
  | { kind: "REJECTED"; message: string }
  | { kind: "FAILED"; code: string; message: string };

export interface SameDraftFinalizer {
  readonly id: string;
  readonly version: string;
  readonly platform: string;
  readonly strategy: "IN_PAGE_WEB_API" | "FIXED_DOM";

  health(): Promise<{ ok: boolean; reason?: string }>;
  inspectDraft(input: SameDraftFinalizerInput): Promise<DraftInspection>;
  validatePublishFields(
    input: SameDraftFinalizerInput,
  ): Promise<{ ok: boolean; errors: string[] }>;

  /**
   * MUST mutate the exact draft supplied.
   * MUST NOT create a second remote article as a fallback.
   */
  finalize(input: SameDraftFinalizerInput): Promise<FinalizeOutcome>;

  /**
   * Called after timeout/crash/unknown.
   * MUST inspect remote state before any retry decision.
   */
  reconcile(input: SameDraftFinalizerInput): Promise<FinalizeOutcome>;
}
