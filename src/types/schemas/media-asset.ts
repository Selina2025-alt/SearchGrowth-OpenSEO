import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { mediaAssets } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// MediaAsset domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum columns give compile-time narrowing; these Zod enums are
// the runtime trust boundary for untrusted input before any repository write
// (mirrors ../schemas/claim.ts, ../schemas/source-ref.ts and the other Search
// Growth schema-boundary modules). The unions are the exact V1.0 MediaAsset
// unions from 05_DOMAIN_DATA_MODEL.md §11 MediaAsset and
// 15_MEDIA_ASSET_SPEC.md §2:
//   - `media_type` is exactly IMAGE | VIDEO | AUDIO | DOCUMENT | OTHER.
//   - `rights_status` is exactly OWNED | LICENSED | APPROVED_EXTERNAL | UNKNOWN.
//   - `classification` is exactly PUBLIC_MARKETING | INTERNAL | RESTRICTED.
// Because the approved values are uppercase, lowercase/mixed-case and empty
// strings are rejected — there is no case-insensitive parsing and no implicit/
// unknown/OTHER-content fallback. (The legacy reference unions in
// schemas/domain-types.ts MediaType / MediaRightsStatus / DataClassification are
// identical, so there is no legacy variant to reconcile OUT; the reconciliation
// in this slice is about the row's *shape*, see the storage-schema comment in
// src/db/search-growth.schema.ts.)
//
// This is boundary validation only: no upload/download, object storage, media
// processing or extraction, MIME allowlist/magic-bytes check, Rights Gate
// runtime enforcement, ContentVersion link, or publishing behavior exists in
// this slice. `mime_type`, `bytes` and `sha256` are opaque asset metadata stored
// verbatim; `rights_status` and `classification` are explicit policy values
// recorded at creation and not interpreted here.
//
// The exported `MediaAsset` row type is the domain shape later Media/Content
// tasks will consume: every scalar storage field of the Project-scoped asset —
// including the required media_type/mime_type/bytes/sha256/rights_status/
// classification fields and the creation audit timestamp — and the absence of
// any storage-key/filename/dimensional/alt-text/updated_at/deleted_at field.
//
// NOTE: this `MediaAsset` is the V1.0 §11 shape and intentionally differs from
// the legacy reference `MediaAsset` interface in schemas/domain-types.ts (which
// carries `storageKey`, `originalFilename`, `width`/`height`/`durationSeconds`/
// `altText`). That reference artifact is a design-time legacy type this task
// explicitly reconciles; it is not re-exported here and no production code
// imports it.

export type MediaAsset = InferSelectModel<typeof mediaAssets>;

export const mediaTypeSchema = z.enum(mediaAssets.mediaType.enumValues);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const mediaRightsStatusSchema = z.enum(
  mediaAssets.rightsStatus.enumValues,
);
export type MediaRightsStatus = z.infer<typeof mediaRightsStatusSchema>;

export const mediaClassificationSchema = z.enum(
  mediaAssets.classification.enumValues,
);
export type MediaClassification = z.infer<typeof mediaClassificationSchema>;
