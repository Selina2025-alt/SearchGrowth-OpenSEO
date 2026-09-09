import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { claimSourceRefs, claims } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// Claim / ClaimSourceRef domain boundary
// ---------------------------------------------------------------------------
//
// The Drizzle text-enum columns give compile-time narrowing; these Zod enums are
// the runtime trust boundary for untrusted input before any repository write
// (mirrors ../schemas/source-ref.ts and the other Search Growth schema-boundary
// modules). The unions are the exact V1.0 Claim unions from
// 05_DOMAIN_DATA_MODEL.md §9 Claim:
//   - `status` is exactly APPROVED | UNVERIFIED | EXPIRED | REJECTED.
//   - `classification` is exactly PUBLIC_MARKETING | INTERNAL | RESTRICTED.
// Because the approved values are uppercase, lowercase/mixed-case and empty
// strings are rejected — there is no case-insensitive parsing and no implicit/
// unknown/OTHER fallback. (The legacy reference unions in schemas/domain-types.ts
// ClaimStatus and DataClassification are identical, so there is no legacy
// variant to reconcile OUT; the reconciliation in this slice is about the row's
// *shape*, see the storage-schema comment in src/db/search-growth.schema.ts.)
//
// This is boundary validation only: no claim verification/reverification,
// blocking logic, content/publication gate, provider call or runtime status
// transition exists in this slice. `verified_by`, `last_verified_at` and
// `expires_at` are nullable verification fields the later verification workflow
// owns; they are not interpreted here. `allowed_markets[]` /
// `allowed_languages[]` are deferred to a later policy-relation task and are NOT
// part of the Claim row.
//
// The exported `Claim` row type is the domain shape later Claim/Content tasks
// will consume: every scalar storage field of the mutable, Project-scoped claim
// — including the required claim_text/status/classification fields, the nullable
// verification fields and the system timestamps. The exported `ClaimSourceRef`
// row type is the normalized same-Project link shape (identity columns plus the
// append-only created_at only — no mutable evidence payload, no JSON array).
//
// NOTE: these types are the V1.0 §9 shapes and intentionally differ from the
// legacy reference `Claim` interface in schemas/domain-types.ts (which carries
// `allowedMarkets`/`allowedLanguages`/`evidenceType`/`evidenceRef`/`sourceUrl`).
// That reference artifact is a design-time legacy type this task explicitly
// reconciles; it is not re-exported here and no production code imports it.

export type Claim = InferSelectModel<typeof claims>;
export type ClaimSourceRef = InferSelectModel<typeof claimSourceRefs>;

export const claimStatusSchema = z.enum(claims.status.enumValues);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

export const claimClassificationSchema = z.enum(
  claims.classification.enumValues,
);
export type ClaimClassification = z.infer<typeof claimClassificationSchema>;
