import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import type { contentVariants } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// ContentVariant domain boundary
// ---------------------------------------------------------------------------
//
// ONE ContentVariant is a platform-native rendering of one immutable
// ContentVersion, NOT a mechanical copy and NOT a publishing instruction
// (05_DOMAIN_DATA_MODEL.md §10 ContentVariant "平台原生版，不是全文简单复制";
// 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §7 Platform Variants; ADR-006: canonical
// Markdown + metadata + asset refs are the source, the platform HTML/body is the
// variant).
//
// The Drizzle columns already give compile-time narrowing; `contentVariantSchema`
// is the matching runtime/domain representation of the direct fields (TASK item
// 3) for untrusted input before any repository write. Every direct field is
// carried verbatim; the row has no relational id container and no enum union to
// narrow, so no Zod enum is defined here:
//   - `platform` and `format` are deliberately OPAQUE required strings (TASK item
//     1). The platform/connector catalogue and format normalization are separate
//     tasks, so no enum/implicit-OTHER fallback is invented.
//   - `title`/`body` are the platform-native text payload (09 spec §7); `body`
//     is stored verbatim with no Markdown/HTML conversion.
//   - `metadataJson` is the opaque platform-native renderer metadata document
//     (the §7 presentation contract: format/tags/categories/external link
//     policy/cover-image constraints/CTA expression), a required JSON string
//     carried verbatim. It is renderer metadata, NOT a relational id container:
//     asset/reference ids are never encoded here (TASK item 1).
//   - `bodyHash` and `rendererVersion` are opaque required render-provenance
//     strings, stored verbatim; no hashing/rendering runs in this slice.
//
// This is boundary validation only: no platform-account/connector choice, target
// routing, asset mapping, tag/category normalization, renderer runtime, HTML
// conversion, release/approval/publishing behavior, or CRUD/UI exists in this
// slice (TASK OUT OF SCOPE). The legacy reference `ContentVariant` interface in
// schemas/domain-types.ts carries `assetRefs: string[]` (migrations-reference
// `asset_refs_json`); that JSON asset/reference id array is reconciled OUT — this
// slice ships no variant asset mapping (TASK item 3). The legacy shape also has
// no `project_id`/`created_at`, so this domain type is the V1.0 Project-scoped
// immutable shape, not the legacy design-time type; the reference artifact is not
// re-exported here and no production code imports it.
//
// The exported `ContentVariant` row type is the domain shape later variant-routing
// / renderer tasks will consume, and `contentVariantSchema` is the runtime guard
// for the same direct fields. The immutable contract is preserved: `createdAt` is
// the only audit field, and there is no `updatedAt`, execution, approval,
// account, publishing or public-success field.

export type ContentVariant = InferSelectModel<typeof contentVariants>;

export const contentVariantSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  contentPackageVersionId: z.string(),
  platform: z.string(),
  format: z.string(),
  title: z.string(),
  body: z.string(),
  metadataJson: z.string(),
  bodyHash: z.string(),
  rendererVersion: z.string(),
  createdAt: z.string(),
});
