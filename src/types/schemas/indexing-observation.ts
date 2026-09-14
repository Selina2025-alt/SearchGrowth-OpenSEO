import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import type { indexingObservations } from "@/db/search-growth.schema";
import { searchEngineSchema } from "./search-market-profile";

// ---------------------------------------------------------------------------
// IndexingObservation domain boundary
// ---------------------------------------------------------------------------
//
// ONE IndexingObservation is a credential-free, Project-scoped fact about a
// URL's search indexing state (20_DATABASE_SCHEMA_GUIDE.md §1 Search/Experiment
// `indexing_observations`; the legacy read-only `schemas/migrations-reference.sql`
// table of the same name). This is the persistence/contract core slice ONLY: it
// does not crawl the URL, query a search engine, resolve URL identity, create
// publication receipts, publish, use credentials or run any production behavior
// (TASK GOAL / items 1–3).
//
// The Drizzle columns already give compile-time narrowing; `indexingObservationSchema`
// is the matching runtime/domain representation of the direct fields (TASK item
// 1) for untrusted input before any later repository write:
//   - `id` and `projectId` are the stable identity and the explicit Project
//     ownership keys. There is no implicit/global ownership.
//   - `url` is the observed URL carried verbatim (TASK item 2). It is opaque
//     here: no normalization, identity key or dedup rule is added in this slice.
//   - `searchEngine` is narrowed to the one authoritative engine union
//     (GOOGLE | BAIDU | BING | OTHER) via the shared `searchEngineSchema`
//     (05_DOMAIN_DATA_MODEL.md §2; schemas/domain-types.ts SearchEngine). The
//     storage column is additionally guarded by the named
//     `indexing_observations_search_engine_valid` CHECK on both dialects.
//   - `marketProfileId` is nullable (NULL = no profile attached); the storage
//     composite FK keeps a non-null value same-Project (TASK item 2). Optional,
//     so it is `.nullable()` rather than `.optional()` at this row boundary.
//   - `publicationReceiptId` is nullable (NULL = the observation is not
//     associated with a controlled publication receipt); the storage
//     Project-leading composite FK keeps a non-null value same-Project and
//     rejects a dangling receipt id (TASK items 1–2). It is an optional
//     EVIDENCE RELATION only: this boundary performs no receipt verification,
//     receipt-to-citation matching or URL identity/normalization, and no
//     indexing-collection/provider runtime reads it (TASK item 5).
//   - `observationType` and `status` are opaque required strings: no V1.0
//     document defines an authoritative enum/status union (TASK item 3), so no
//     enum, taxonomy or lifecycle transition is invented.
//   - `detailsJson` is the required observation-details JSON document persisted
//     as JSON text (the accepted JSON-column convention). Its validity is
//     enforced at the database boundary by the named
//     `indexing_observations_details_valid` CHECK on both dialects, so the
//     migration-backed storage test — not this boundary — proves JSON validity
//     (TASK item 1/3). The boundary carries the document verbatim and never
//     decomposes it into relational ids.
//   - `observedAt` is the required application-supplied observation moment;
//     `createdAt` is the append-only system insert timestamp. There is no
//     `updatedAt` and no lifecycle field (TASK items 1/3).
//
// The exported `IndexingObservation` row type is the domain shape later
// Search/Index tasks will consume.

export type IndexingObservation = InferSelectModel<typeof indexingObservations>;

export const indexingObservationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  publicationReceiptId: z.string().nullable(),
  url: z.string(),
  searchEngine: searchEngineSchema,
  marketProfileId: z.string().nullable(),
  observationType: z.string(),
  status: z.string(),
  detailsJson: z.string(),
  observedAt: z.string(),
  createdAt: z.string(),
});
