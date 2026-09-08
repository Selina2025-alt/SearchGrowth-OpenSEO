import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { sourceRefs } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// SourceRef domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum column gives compile-time narrowing; this Zod enum is
// the runtime trust boundary for untrusted input before any repository write
// (mirrors ../schemas/geo-citation.ts, ../schemas/search-growth-opportunity.ts
// and the other Search Growth schema-boundary modules). The enum union is the
// exact V1.0 SourceRef type set from 05_DOMAIN_DATA_MODEL.md §9:
// `type` is exactly URL | INTERNAL_DOC | PRODUCT_FACT | RESEARCH. Because the
// approved values are uppercase, lowercase/mixed-case and empty strings are
// rejected — there is no case-insensitive parsing and no implicit/unknown/OTHER
// fallback (the legacy domain-types `kind` union URL | INTERNAL_EVIDENCE | CLAIM
// | PUBLICATION | OTHER is reconciled OUT; §9 replaces it with the four-value
// union above).
//
// This is boundary validation only: no claim verification, crawling, URL
// fetching, reachability/URL validation, classification or source-content
// inference exists in this slice. `ref` is the opaque §9 reference value exactly
// as captured and `captured_at` is the application-supplied capture moment; both
// are stored verbatim by the storage layer.
//
// §9's SourceRef carries no classification (the classification in the §9 Claim
// block and on ContentPackageVersion belongs to those rows), so no
// classification union is defined or shipped here.
//
// Full-row CRUD/input schemas belong to the later source-ref capture/CRUD task;
// this task pins the domain contract the append-only storage layer is built on.
// The exported `SourceRef` row type is the domain shape later Claim/Content
// tasks will consume: every scalar storage field of the immutable, Project-
// scoped source reference — including the required type/ref/captured_at fields
// and the absence of any updated/current-pointer/classification field.
//
// NOTE: this `SourceRef` is the V1.0 §9 shape and intentionally differs from
// the legacy reference `SourceRef` interface in schemas/domain-types.ts (which
// carries `kind`/`title`/`url`/`evidenceRef`/`classification`). That reference
// artifact is a design-time legacy type this task explicitly reconciles; it is
// not re-exported here and no production code imports it.

export type SourceRef = InferSelectModel<typeof sourceRefs>;

export const sourceRefTypeSchema = z.enum(sourceRefs.type.enumValues);
export type SourceRefType = z.infer<typeof sourceRefTypeSchema>;
