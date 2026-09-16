import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import { geoObservationRuns } from "@/db/schema";
import type {
  GeoObservationRunFact,
  GeoObservationRunRecorder,
} from "../services/freshGeoSampling";

// ---------------------------------------------------------------------------
// GeoObservationRunRecorder persistence adapter (T139, ADR-003,
// 07_GEO_MEASUREMENT_SPEC.md §§2–3/§5, 05_DOMAIN_DATA_MODEL.md §6)
// ---------------------------------------------------------------------------
//
// The credential-free fresh-sampling core (T138) produces one recordable
// `GeoObservationRunFact` per repeat and hands it to the `GeoObservationRunRecorder`
// port. This module is the whole adapter: one fact becomes exactly one INSERT
// into the accepted `geo_observation_runs` table. No field is derived, parsed,
// or synthesized — only the columns the fact already carries are written,
// `raw_answer`/`usage_json` stay NULL, and `created_at` keeps its DB default.
//
// Boundaries:
//   - Append-only. There is no update, upsert, dedupe, retry, or lifecycle
//     transition. A duplicate id or a same-Project FK violation surfaces as the
//     database error it is instead of being swallowed, and no parse row or
//     existing run row is ever touched.
//   - Opaque evidence. The raw provider response is never interpreted
//     (ADR-005): a non-empty root string is stored verbatim, any other defined
//     JSON-safe value as its JSON text. A value the JSON text cannot carry back
//     unchanged — including accessors, which could yield a different value on
//     the serializer's second read — is rejected before the INSERT, so no
//     empty, rewritten, or placeholder evidence is ever written.
//   - No provider, credential, Prompt Explorer/R2 cache, workflow, scheduler,
//     parser, metric, or UI dependency lives here.

/** A raw-evidence value JSON text cannot carry back unchanged. */
function unsafeRawEvidence(path: string, reason: string): Error {
  return new Error(
    `GEO observation run recorder: raw response is not JSON-safe at ${path} (${reason}); refusing to persist lossy raw evidence.`,
  );
}

/**
 * Read an own property as opaque data, rejecting accessors. A getter would run
 * during validation and could return a different value — or have a side effect
 * — when serialization reads the same property again, so the persisted text
 * would not be proven to be the validated raw evidence.
 */
function readOwnDataValue(object: object, key: string, path: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw unsafeRawEvidence(path, "accessor property");
  }
  const value: unknown = descriptor.value;
  return value;
}

/**
 * Walk a raw response tree and throw on the first value whose JSON text would
 * differ from the value itself: `undefined`, a function, a symbol, a BigInt, a
 * non-finite number, `-0`, a non-plain/custom object, a symbol-keyed,
 * non-enumerable or accessor property, a sparse or extended array, or a cycle.
 *
 * Strings are opaque here, including `""`: JSON carries any string faithfully.
 * Only the *root* capture must be nonblank, which `serializeGeoRawResponse`
 * enforces before delegating.
 *
 * `path` locates the offending value in the error message. `ancestors` is only
 * the current recursion stack, so a value repeated in sibling branches — which
 * serializes faithfully as a copy — is still accepted. Everything accepted here
 * stays opaque: the tree is proven safe to serialize, never parsed or changed.
 */
function assertJsonSafeRawResponse(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): void {
  if (value === null) return;
  switch (typeof value) {
    case "string":
      return;
    case "boolean":
      return;
    case "number":
      if (!Number.isFinite(value)) {
        throw unsafeRawEvidence(path, `non-finite number ${String(value)}`);
      }
      if (Object.is(value, -0)) {
        throw unsafeRawEvidence(path, "-0 serializes as 0");
      }
      return;
    case "bigint":
      throw unsafeRawEvidence(path, "BigInt has no JSON representation");
    case "function":
      throw unsafeRawEvidence(path, "function has no JSON representation");
    case "symbol":
      throw unsafeRawEvidence(path, "symbol has no JSON representation");
    case "undefined":
      throw unsafeRawEvidence(path, "undefined is dropped by serialization");
  }

  const object = value as object;
  if (ancestors.has(object)) {
    throw unsafeRawEvidence(path, "circular reference");
  }
  ancestors.add(object);
  try {
    if (Array.isArray(object)) {
      assertJsonSafeArray(object, path, ancestors);
    } else {
      assertJsonSafeObject(object, path, ancestors);
    }
  } finally {
    ancestors.delete(object);
  }
}

function assertJsonSafeArray(
  array: unknown[],
  path: string,
  ancestors: Set<object>,
): void {
  if (Object.getPrototypeOf(array) !== Array.prototype) {
    throw unsafeRawEvidence(path, "array with a custom prototype");
  }
  // A symbol-keyed own property is invisible to JSON, exactly as it is on an
  // object.
  if (Object.getOwnPropertySymbols(array).length > 0) {
    throw unsafeRawEvidence(path, "symbol-keyed property");
  }
  // A hole serializes as `null` and an extra string-keyed property is dropped,
  // so only a dense array of exactly `length` elements survives serialization.
  if (Object.getOwnPropertyNames(array).length !== array.length + 1) {
    throw unsafeRawEvidence(
      path,
      "sparse array or array with extra properties",
    );
  }
  for (let index = 0; index < array.length; index++) {
    const child = readOwnDataValue(array, String(index), `${path}[${index}]`);
    assertJsonSafeRawResponse(child, `${path}[${index}]`, ancestors);
  }
}

function assertJsonSafeObject(
  object: object,
  path: string,
  ancestors: Set<object>,
): void {
  const prototype: unknown = Object.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== null) {
    const name = (object as { constructor?: { name?: string } }).constructor
      ?.name;
    throw unsafeRawEvidence(
      path,
      name === undefined ? "non-plain object" : `non-plain object (${name})`,
    );
  }
  if (Object.getOwnPropertySymbols(object).length > 0) {
    throw unsafeRawEvidence(path, "symbol-keyed property");
  }
  // Only own enumerable string-keyed properties survive serialization; a
  // non-enumerable own property would be dropped silently.
  const keys = Object.keys(object);
  if (Object.getOwnPropertyNames(object).length !== keys.length) {
    throw unsafeRawEvidence(path, "non-enumerable property");
  }
  for (const key of keys) {
    const child = readOwnDataValue(object, key, `${path}.${key}`);
    assertJsonSafeRawResponse(child, `${path}.${key}`, ancestors);
  }
}

/**
 * Render a raw provider response as the `raw_response` text column.
 *
 * A non-empty string is the evidence exactly as captured (never trimmed). Every
 * other defined value must be a JSON-safe tree, whose JSON text is a faithful
 * copy of it. An absent capture (`null`/`undefined`), a blank root string, and
 * anything in the tree that JSON text cannot carry back unchanged (non-finite
 * number, `-0`, `undefined`, function, symbol, BigInt, cycle, non-plain/custom
 * object, symbol-keyed/non-enumerable/accessor property, sparse array) are
 * rejected here — before the INSERT — rather than stored as an empty string, a
 * rewritten value, or a fabricated fallback. Nested strings, including `""`,
 * are valid JSON and stay opaque.
 */
function serializeGeoRawResponse(rawResponse: unknown): string {
  if (typeof rawResponse === "string") {
    if (rawResponse.trim().length === 0) {
      throw unsafeRawEvidence("$", "blank string");
    }
    return rawResponse;
  }
  if (rawResponse === undefined || rawResponse === null) {
    throw new Error(
      "GEO observation run recorder: raw response is missing; refusing to persist an absent raw evidence capture.",
    );
  }
  assertJsonSafeRawResponse(rawResponse, "$", new Set());
  return JSON.stringify(rawResponse);
}

async function record(runFact: GeoObservationRunFact): Promise<void> {
  const values: InferInsertModel<typeof geoObservationRuns> = {
    id: runFact.id,
    batchId: runFact.batchId,
    projectId: runFact.projectId,
    promptId: runFact.promptId,
    promptVersion: runFact.promptVersion,
    surfaceType: runFact.surfaceType,
    surfaceName: runFact.surfaceName,
    fidelity: runFact.fidelity,
    provider: runFact.provider,
    engine: runFact.engine ?? null,
    model: runFact.model,
    modelVersion: runFact.modelVersion ?? null,
    webSearch: runFact.webSearch ?? null,
    searchMode: runFact.searchMode ?? null,
    marketProfileId: runFact.marketProfileId ?? null,
    repeatIndex: runFact.repeatIndex,
    applicationCacheBypassed: runFact.applicationCacheBypassed,
    rawResponse: serializeGeoRawResponse(runFact.rawResponse),
    providerRequestId: runFact.providerRequestId,
    startedAt: runFact.startedAt,
    finishedAt: runFact.finishedAt,
    status: runFact.status,
  };
  await db.insert(geoObservationRuns).values(values);
}

/** The T138 `GeoObservationRunRecorder` port, backed by local storage. */
export const GeoObservationRunRecorderRepository: GeoObservationRunRecorder = {
  record,
};
