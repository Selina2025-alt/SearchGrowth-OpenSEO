import { z } from "zod";
import { jsonCodec } from "@/shared/json";

// ---------------------------------------------------------------------------
// SearchGrowthTarget domain boundary
// ---------------------------------------------------------------------------
//
// ONE SearchGrowthTarget is the credential-free, Project-scoped targeting
// configuration for an existing OpenSEO Project (05_DOMAIN_DATA_MODEL.md §1
// SearchGrowthTarget; `schemas/openapi.yaml` SearchGrowthTarget; legacy
// read-only `schemas/migrations-reference.sql` search_growth_targets;
// templates/project-search-growth.example.json). This is the schema/contract
// slice ONLY: it records configuration and its provenance and implements no
// Market relation, activation, runtime, workflow, provider call, GEO/GSC/GA4
// query, credential, publishing, spend, UI or production behavior (TASK GOAL /
// OUT OF SCOPE). It reuses the existing OpenSEO Project and does not duplicate
// Project data (TASK item 2).
//
// STORAGE vs DOMAIN VALUE. The matching storage table (`search_growth_targets`
// in src/db/search-growth.schema.ts) keeps the configuration as a single
// validated JSON text column (`config_json`). That serialized representation is
// NOT the domain representation; the contract below is the typed domain
// boundary. `searchGrowthTargetConfigJsonSchema` is the explicit serialization
// boundary between the two: encode(typed config) -> the exact JSON text the
// database CHECK accepts, decode(stored text) -> the typed config, rejecting
// malformed or shape-mismatched JSON.
//
//   - `projectId` is the Project identity: both the storage primary key and the
//     FK to the existing projects(id). It is the row's stable identity, so it is
//     a required string, not a generated id.
//   - `config` is the accepted runtime configuration shape from the source
//     contract (`schemas/openapi.yaml` SearchGrowthTarget): the five REQUIRED
//     fields `brandAliases`, `productTargets`, `icps`, `personas` and
//     `conversionGoals`, each an array of strings. The source sets no item-count
//     bound on these arrays, so none is invented (TASK item 3).
//     `preferred_market_profile_ids[]` (05_DOMAIN_DATA_MODEL.md §1) is
//     deliberately NOT part of this document: it remains a separately scoped
//     normalized Project->Market relation after this core table is accepted
//     (TASK item 3).
//   - `updatedBy` is the required configuration provenance, opaque text.
//     Deliberately NOT modelled as a user/account (TASK item 3).
//   - `updatedAt` is the required mutable update timestamp; the storage column
//     is defaulted on insert. Unlike the append-only Search Growth fact tables
//     this row may be updated in place and has no `createdAt`, append-only
//     guard, CAS/version or state-transition field (TASK item 3).

// The accepted runtime configuration-document shape (openapi SearchGrowthTarget).
export const searchGrowthTargetConfigSchema = z.object({
  brandAliases: z.array(z.string()),
  productTargets: z.array(z.string()),
  icps: z.array(z.string()),
  personas: z.array(z.string()),
  conversionGoals: z.array(z.string()),
});

export type SearchGrowthTargetConfig = z.infer<
  typeof searchGrowthTargetConfigSchema
>;

// Serialization boundary between the stored `config_json` text and the typed
// configuration. `decode` rejects malformed or shape-mismatched JSON; `encode`
// produces the exact JSON text the storage CHECK validates, keeping D1 and
// PostgreSQL semantically identical (TASK items 1–2).
export const searchGrowthTargetConfigJsonSchema = jsonCodec(
  searchGrowthTargetConfigSchema,
);

// The full domain row: typed configuration plus provenance and update timestamp.
export const searchGrowthTargetSchema = z.object({
  projectId: z.string(),
  config: searchGrowthTargetConfigSchema,
  updatedBy: z.string(),
  updatedAt: z.string(),
});

export type SearchGrowthTarget = z.infer<typeof searchGrowthTargetSchema>;
