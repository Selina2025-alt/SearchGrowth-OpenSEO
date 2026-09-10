import { describe, expect, it } from "vitest";
import type { ContentVariant } from "./content-variant";
import { contentVariantSchema } from "./content-variant";

// The ContentVariant domain boundary must carry the direct fields of the
// immutable Project-scoped storage row verbatim and must reject a row that is
// missing any required direct field. `platform`/`format`/`metadataJson` are
// opaque required strings (no enum, no relational id container), so the
// boundary accepts arbitrary opaque values and never parses the metadata
// document (TASK items 1 and 3; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §7).
const METADATA_JSON = JSON.stringify({
  format: "long_post",
  tags: ["rfq", "procurement"],
  externalLinkPolicy: "NOFOLLOW",
  coverImageConstraint: { minWidth: 1200, aspect: "16:9" },
  cta: { label: "Get the guide", url: "/rfq-guide" },
});

const VALID_VARIANT = {
  id: "variant_alpha_1",
  projectId: "proj_alpha",
  contentPackageVersionId: "ver_alpha_1",
  platform: "wechatsync",
  format: "long_post",
  title: "RFQ 门户如何改变采购协同",
  body: "<p>平台原生正文</p>",
  metadataJson: METADATA_JSON,
  bodyHash: "sha256-body-1",
  rendererVersion: "renderer@1.0.0",
  createdAt: "2026-09-10T04:00:05.000Z",
};

describe("ContentVariant domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = contentVariantSchema.parse(VALID_VARIANT);
    expect(parsed).toEqual(VALID_VARIANT);
    // The opaque metadata document is never parsed or decomposed at this
    // boundary — it is carried as the exact platform-native renderer metadata
    // string (no asset/reference id array is extracted).
    expect(parsed.metadataJson).toBe(METADATA_JSON);
    expect(JSON.parse(parsed.metadataJson)).not.toHaveProperty("assetRefs");
  });

  it("rejects a row missing any required direct field", () => {
    for (const field of Object.keys(VALID_VARIANT)) {
      const rest: Record<string, unknown> = { ...VALID_VARIANT };
      delete rest[field];
      expect(contentVariantSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("exports a row type matching the direct storage shape only", () => {
    // Compile-time guard: the domain type later renderer/routing tasks import
    // carries the direct fields and the append-only createdAt, and no
    // updatedAt / assetRefs / execution/approval/publishing field.
    const variant: ContentVariant = { ...VALID_VARIANT };
    expect(variant.platform).toBe("wechatsync");
    expect(variant.projectId).toBe("proj_alpha");
    expect("updatedAt" in variant).toBe(false);
    expect("assetRefs" in variant).toBe(false);
  });
});
