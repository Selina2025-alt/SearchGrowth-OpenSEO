import { z } from "zod";
import { jsonCodec } from "@/shared/json";

// ---------------------------------------------------------------------------
// RuntimeControl domain boundary
// ---------------------------------------------------------------------------
//
// ONE RuntimeControl is the named, globally-scoped configuration value behind
// the runtime kill switch (05_DOMAIN_DATA_MODEL.md §13 RuntimeControl;
// 10_DISTRIBUTION_ARCHITECTURE.md §10 Global Controls;
// 17_SECURITY_GOVERNANCE.md §9 Runtime Kill Switch;
// 30_TRACEABILITY_MATRIX.md row "可暂停 | RuntimeControls | kill switch"). This
// is the credential-free schema/contract core slice ONLY: it records control
// values but implements no control evaluation, pause/resume behavior, job
// claiming, side-effect start/stop, publishing, spend, external contact, CRUD,
// UI or production behavior (TASK items 1 and 3).
//
// STORAGE vs DOMAIN VALUE. The matching storage table (`runtime_controls` in
// src/db/search-growth.schema.ts) keeps the source value union in a single
// validated JSON text column (`value_json`) so SQLite/D1 and PostgreSQL persist
// exactly boolean|number|string (TASK item 2). That serialized representation is
// therefore NOT the domain representation; the contract below is the typed
// domain boundary that accepts and returns the source `key` and typed `value`
// union defined by schemas/zod-contracts.reference.ts `runtimeControlSchema`
// (`key: z.string().min(1)`, `value: z.union([z.boolean(), z.number(),
// z.string()])`, `reason: z.string().max(1000).optional()`) and
// schemas/domain-types.ts `RuntimeControl` (`key`, `value`, `reason?`,
// `updatedBy`, `updatedAt`). `runtimeControlValueJsonSchema` is the explicit
// serialization boundary between the two: encode(typed value) -> the exact
// scalar JSON text the database CHECK accepts, parse(stored text) -> the typed
// value, rejecting malformed or unsupported JSON.
//
//   - `key` is the required, opaque stable control identity; the source
//     non-empty constraint is pinned by `.min(1)`. It is not an enum/taxonomy in
//     this slice (TASK item 3); key identity/uniqueness is enforced by the
//     database PRIMARY KEY. It maps to the storage `control_key` column.
//   - `value` is exactly the source boolean|number|string union, carried as the
//     typed value at this boundary and never as JSON text. Unsupported runtime
//     values (null/undefined/array/object) are rejected here; the storage CHECK
//     additionally rejects malformed or unsupported serialized JSON.
//   - `reason` is the optional operator reason, carrying the source 1000-char
//     bound; omitted means no reason recorded. It maps to the storage nullable
//     `reason` column (NULL), which is why it is optional rather than nullable
//     at the domain boundary (TASK item 2 nullability decision).
//   - `updatedBy` is the required updater identity, opaque text. Deliberately
//     NOT a foreign key and not modelled as an account/user (TASK item 3).
//   - `updatedAt` is the required mutable update timestamp; the storage column
//     is defaulted on insert. Unlike the append-only AuditEvent this row may be
//     updated and has no `createdAt`, append-only guard, CAS/version or
//     state-transition field (TASK item 3).

// The source value union, exactly as the reference contract defines it. Kept
// module-private; it is exposed to callers through `runtimeControlSchema.value`.
const runtimeControlValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
]);

// Serialization boundary between the stored `value_json` text and the typed
// source value union. `parse` decodes a persisted scalar and rejects malformed
// or unsupported JSON; `encode` produces the exact scalar JSON text the storage
// CHECK accepts, keeping D1 and PostgreSQL semantically identical (TASK item 2).
export const runtimeControlValueJsonSchema = jsonCodec(
  runtimeControlValueSchema,
);

export const runtimeControlSchema = z.object({
  key: z.string().min(1),
  value: runtimeControlValueSchema,
  reason: z.string().max(1000).optional(),
  updatedBy: z.string(),
  updatedAt: z.string(),
});

export type RuntimeControl = z.infer<typeof runtimeControlSchema>;
