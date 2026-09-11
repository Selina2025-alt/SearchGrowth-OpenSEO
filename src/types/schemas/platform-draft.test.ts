import { describe, expect, it } from "vitest";
import type { PlatformDraft } from "./platform-draft";
import { platformDraftSchema } from "./platform-draft";

// The PlatformDraft domain boundary must carry the direct staged-draft fields
// verbatim, validate the asset-hash document shape, and preserve the
// draft/public-success boundary. `accountId`/`draftId`/`stagerId`/`stagerVersion`
// are opaque identities the boundary never parses, and `verifiedAt` records DRAFT
// verification only — there is deliberately no public-success, receipt, job,
// lifecycle, route or credential field (TASK items 1, 3–4).
const VALID_DRAFT = {
  id: "draft_alpha_1",
  projectId: "proj_alpha",
  releaseTargetId: "target_alpha_1",
  platform: "zhihu",
  accountId: "acct_opaque_1",
  draftId: "platform-draft-opaque-1",
  draftUrl: "https://zhuanlan.zhihu.com/p/draft/123",
  contentHash: "sha256-content-1",
  assetHashesJson: '["sha256-asset-1","sha256-asset-2"]',
  stagerId: "wechatsync",
  stagerVersion: "1.1.0",
  verifiedAt: "2026-09-11T05:30:00.000Z",
  createdAt: "2026-09-11T05:00:00.000Z",
} as const;

describe("PlatformDraft domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = platformDraftSchema.parse(VALID_DRAFT);
    expect(parsed).toEqual(VALID_DRAFT);
    // Opaque external/stager identities and the asset-hash document are carried
    // as exact strings, never decomposed or parsed into a relational model.
    expect(parsed.draftId).toBe("platform-draft-opaque-1");
    expect(parsed.accountId).toBe("acct_opaque_1");
    expect(parsed.assetHashesJson).toBe('["sha256-asset-1","sha256-asset-2"]');
  });

  it("accepts a minimal draft whose optional URL and verification are NULL", () => {
    const parsed = platformDraftSchema.parse({
      ...VALID_DRAFT,
      draftUrl: null,
      verifiedAt: null,
      assetHashesJson: "[]",
    });
    expect(parsed).toMatchObject({
      draftUrl: null,
      verifiedAt: null,
      assetHashesJson: "[]",
    });
  });

  it("rejects a malformed asset-hash document", () => {
    expect(
      platformDraftSchema.safeParse({
        ...VALID_DRAFT,
        assetHashesJson: "{not json",
      }).success,
    ).toBe(false);
  });

  it("rejects an asset-hash document with the wrong shape", () => {
    // Must be a JSON array of strings — not an object, not a mixed array, not
    // null.
    for (const assetHashesJson of [
      '{"asset":"sha256-1"}',
      '["sha256-1",7]',
      "null",
      '"sha256-1"',
    ]) {
      expect(
        platformDraftSchema.safeParse({ ...VALID_DRAFT, assetHashesJson })
          .success,
      ).toBe(false);
    }
  });

  it("rejects a row missing any required direct field", () => {
    for (const field of Object.keys(VALID_DRAFT)) {
      const rest: Record<string, unknown> = { ...VALID_DRAFT };
      delete rest[field];
      expect(platformDraftSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("exports a row type matching the draft-evidence shape only", () => {
    // Compile-time guard: the domain type later draft-staging tasks import
    // carries the direct staged-draft fields plus the append-only createdAt, and
    // no public-success / receipt / job / lifecycle / route / credential field.
    const draft: PlatformDraft = { ...VALID_DRAFT };
    expect(draft.draftId).toBe("platform-draft-opaque-1");
    expect(draft.verifiedAt).toBe("2026-09-11T05:30:00.000Z");
    expect("publicUrl" in draft).toBe(false);
    expect("publicVerifiedAt" in draft).toBe(false);
    expect("status" in draft).toBe(false);
    expect("route" in draft).toBe(false);
    expect("publisherConnectionId" in draft).toBe(false);
    expect("updatedAt" in draft).toBe(false);
  });
});
