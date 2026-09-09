import { describe, expect, it } from "vitest";
import { mediaAssets } from "@/db/search-growth.schema";
import type {
  MediaAsset,
  MediaClassification,
  MediaRightsStatus,
  MediaType,
} from "./media-asset";
import {
  mediaClassificationSchema,
  mediaRightsStatusSchema,
  mediaTypeSchema,
} from "./media-asset";

// The DB text-enum columns and the Zod boundary must not drift: a value the Zod
// schemas accept has to be a value the column types admit, and vice versa.
// Drift here would let future repositories write a media asset the domain
// boundary never validated. There is intentionally no implicit/lowercase/OTHER-
// content fallback (05_DOMAIN_DATA_MODEL.md §11 MediaAsset). The unions are the
// exact V1.0 unions, so legacy-union values that are not part of the shipped
// union and case-mismatched/empty strings are rejected.
describe("MediaAsset domain boundary", () => {
  it("lists every media-type column value as a valid MediaType", () => {
    for (const mediaType of mediaAssets.mediaType.enumValues) {
      expect(mediaTypeSchema.safeParse(mediaType).success).toBe(true);
    }
  });

  it("rejects unsupported, case-mismatched and empty media types", () => {
    for (const mediaType of [
      // Case-mismatched variants of the approved uppercase values.
      "image",
      "Image",
      "video",
      "audio",
      "document",
      "other",
      "IMAGE ",
      // Unsupported media types / legacy content kinds.
      "EXECUTABLE",
      "ARCHIVE",
      "IMAGE_URL",
      "NONE",
      "",
    ]) {
      expect(mediaTypeSchema.safeParse(mediaType).success).toBe(false);
    }
  });

  it("lists every rights-status column value as a valid MediaRightsStatus", () => {
    for (const rightsStatus of mediaAssets.rightsStatus.enumValues) {
      expect(mediaRightsStatusSchema.safeParse(rightsStatus).success).toBe(
        true,
      );
    }
  });

  it("rejects unsupported, case-mismatched and empty rights statuses", () => {
    for (const rightsStatus of [
      // Case-mismatched variants of the approved uppercase values.
      "owned",
      "Licensed",
      "approved_external",
      "unknown",
      "OWNED ",
      // Unsupported rights statuses.
      "PUBLIC_DOMAIN",
      "CC_LICENSED",
      "FAIR_USE",
      "NONE",
      "",
    ]) {
      expect(mediaRightsStatusSchema.safeParse(rightsStatus).success).toBe(
        false,
      );
    }
  });

  it("lists every classification column value as a valid MediaClassification", () => {
    for (const classification of mediaAssets.classification.enumValues) {
      expect(mediaClassificationSchema.safeParse(classification).success).toBe(
        true,
      );
    }
  });

  it("rejects unsupported, case-mismatched and empty classifications", () => {
    for (const classification of [
      // Case-mismatched variants of the approved uppercase values.
      "public_marketing",
      "Internal",
      "restricted",
      "PUBLIC_MARKETING ",
      // Unsupported classifications.
      "PUBLIC",
      "CONFIDENTIAL",
      "SECRET",
      "NONE",
      "",
    ]) {
      expect(mediaClassificationSchema.safeParse(classification).success).toBe(
        false,
      );
    }
  });

  it("exports row/enum types aligned with the storage columns", () => {
    // Compile-time guard: the domain type later Media/Content tasks will import
    // must stay true to the storage enums and the Project-scoped select row
    // shape — including the required direct metadata fields, the creation audit
    // timestamp and the absence of any storage-key/filename/dimensional/
    // updated_at/deleted_at field.
    const mediaType: MediaType = "IMAGE";
    const rightsStatus: MediaRightsStatus = "OWNED";
    const classification: MediaClassification = "PUBLIC_MARKETING";
    const mediaAsset: Pick<
      MediaAsset,
      | "id"
      | "projectId"
      | "mediaType"
      | "mimeType"
      | "bytes"
      | "sha256"
      | "rightsStatus"
      | "classification"
      | "createdAt"
    > = {
      id: "asset_alpha_1",
      projectId: "project_alpha",
      mediaType,
      mimeType: "image/png",
      bytes: 2048,
      sha256: "abc123",
      rightsStatus,
      classification,
      createdAt: "2026-09-08T04:00:05.000Z",
    };
    expect(mediaAsset.mediaType).toBe("IMAGE");
    expect(mediaAsset.rightsStatus).toBe("OWNED");
    expect(mediaAsset.classification).toBe("PUBLIC_MARKETING");
    expect(mediaAsset.projectId).toBe("project_alpha");
    expect(mediaAsset.mimeType).toBe("image/png");
    expect(mediaAsset.bytes).toBe(2048);
    expect(mediaAsset.sha256).toBe("abc123");
    // Every approved V1.0 value round-trips at the boundary.
    for (const approved of [
      "IMAGE",
      "VIDEO",
      "AUDIO",
      "DOCUMENT",
      "OTHER",
    ] as const) {
      expect(mediaTypeSchema.safeParse(approved).success).toBe(true);
    }
    for (const approved of [
      "OWNED",
      "LICENSED",
      "APPROVED_EXTERNAL",
      "UNKNOWN",
    ] as const) {
      expect(mediaRightsStatusSchema.safeParse(approved).success).toBe(true);
    }
    for (const approved of [
      "PUBLIC_MARKETING",
      "INTERNAL",
      "RESTRICTED",
    ] as const) {
      expect(mediaClassificationSchema.safeParse(approved).success).toBe(true);
    }
  });
});
