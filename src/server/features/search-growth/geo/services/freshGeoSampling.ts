import { z } from "zod";
import type {
  ObservationSurfaceType,
  SurfaceFidelity,
} from "@/types/schemas/geo-observation-run";

// ============================================================================
// Fresh GEO sampling core (ADR-003, 07_GEO_MEASUREMENT_SPEC.md §2–3,
// 21_TEST_ACCEPTANCE_PLAN.md §3)
// ============================================================================
//
// This is the credential-free, provider-agnostic core of a fresh GEO
// observation sample. It owns exactly one invariant: a sample of N repeats
// makes N independent provider-port calls, each of which bypasses the
// application cache, and each successful repeat yields its own recordable run
// fact with independent run and provider-request identities.
//
// Boundary declaration:
//   - The core knows nothing about any concrete provider. It talks only to the
//     injected `GeoFreshSampleProvider` port, so it can be exercised entirely
//     with in-process fakes and never performs a real request or paid action.
//   - The core is deliberately disjoint from Prompt Explorer. It does not
//     import, read, write, invalidate, or otherwise invoke the R2-backed
//     Prompt Explorer application cache; the `applicationCacheBypassed: true`
//     literal on every provider request is the contract that makes that bypass
//     explicit rather than incidental.
//   - The provider payload is opaque. This core neither extracts nor interprets
//     entities, citations, ranking, confidence, or metrics — those are the
//     versioned parser's job (ADR-005) and are out of scope here.
//   - Nothing is persisted. The `GeoObservationRunRecorder` port receives
//     recordable run facts; the persistence adapter and any batch-failure
//     workflow policy are separate tasks.

/** Default repeats for a fresh sample: 3 (07_GEO_MEASUREMENT_SPEC.md §3). */
export const GEO_FRESH_SAMPLE_DEFAULT_REPEATS = 3;
/** High-value Prompt repeat setting: 5, only ever an explicit request value. */
export const GEO_FRESH_SAMPLE_HIGH_VALUE_REPEATS = 5;

export type GeoFreshSampleRepeats =
  | typeof GEO_FRESH_SAMPLE_DEFAULT_REPEATS
  | typeof GEO_FRESH_SAMPLE_HIGH_VALUE_REPEATS;

/**
 * Everything that identifies the observation independently of any single
 * repeat. Provenance is carried in full so a run fact is self-describing
 * (GEO hard rule: provenance完整).
 */
export type GeoFreshSampleContext = {
  projectId: string;
  promptId: string;
  promptVersion: number;
  surfaceType: ObservationSurfaceType;
  surfaceName: string;
  fidelity: SurfaceFidelity;
  provider: string;
  model: string;
  modelVersion?: string | null;
  engine?: string | null;
  webSearch?: boolean | null;
  searchMode?: string | null;
  marketProfileId?: string | null;
};

export type GeoFreshSampleRequest = GeoFreshSampleContext & {
  /** Omitted → the default 3 repeats. `5` must be requested explicitly. */
  repeats?: GeoFreshSampleRepeats;
};

/**
 * A single provider-port call. `applicationCacheBypassed` is a `true` literal,
 * so a caller cannot construct a fresh-sample request that claims to have used
 * the cache and a cache-reading provider cannot be wired in silently.
 */
export type GeoFreshSampleProviderRequest = GeoFreshSampleContext & {
  repeatIndex: number;
  applicationCacheBypassed: true;
};

const providerResultSchema = z.object({
  // A blank/missing/whitespace request identity is rejected outright — there is
  // no generated fallback id, because inventing one would fabricate the
  // provider-request provenance the run fact is supposed to record.
  providerRequestId: z.string().trim().min(1),
  // Captured verbatim and never interpreted here.
  rawResponse: z.unknown(),
});

export type GeoFreshSampleProviderResult = z.infer<typeof providerResultSchema>;

export type GeoFreshSampleProvider = {
  observe(
    request: GeoFreshSampleProviderRequest,
  ): Promise<GeoFreshSampleProviderResult>;
};

/**
 * A recordable run fact. Structurally aligned with `GeoObservationRun` so the
 * later persistence adapter can write it without re-deriving anything, but
 * declared here without a DB dependency.
 */
export type GeoObservationRunFact = GeoFreshSampleProviderRequest & {
  /** Unique run identity of this repeat. */
  id: string;
  /** Groups the repeats of one sample. */
  batchId: string;
  providerRequestId: string;
  rawResponse: unknown;
  startedAt: string;
  finishedAt: string;
  status: "SUCCEEDED";
};

export type GeoObservationRunRecorder = {
  record(runFact: GeoObservationRunFact): Promise<void>;
};

export type GeoFreshSamplePorts = {
  provider: GeoFreshSampleProvider;
  recorder: GeoObservationRunRecorder;
};

export type GeoFreshSampleOutcome = {
  batchId: string;
  runs: GeoObservationRunFact[];
};

function resolveRepeats(repeats: number | undefined): GeoFreshSampleRepeats {
  if (repeats === undefined) return GEO_FRESH_SAMPLE_DEFAULT_REPEATS;
  if (repeats === GEO_FRESH_SAMPLE_DEFAULT_REPEATS) return repeats;
  if (repeats === GEO_FRESH_SAMPLE_HIGH_VALUE_REPEATS) return repeats;
  throw new Error(
    `GEO fresh sampling: unapproved repeat count ${repeats}; only ${GEO_FRESH_SAMPLE_DEFAULT_REPEATS} (default) and ${GEO_FRESH_SAMPLE_HIGH_VALUE_REPEATS} (explicit) are allowed.`,
  );
}

/**
 * Sample one fresh GEO observation: one provider call per repeat, bypassing the
 * application cache on every call, then record one independent run fact per
 * successful repeat.
 *
 * Provider calls run sequentially (one call per repeat) and all facts are
 * buffered until every repeat has produced a valid provider identity. A
 * malformed or duplicate provider request identity therefore rejects the sample
 * without any run fact being recorded.
 */
export async function sampleFreshGeoObservation(
  request: GeoFreshSampleRequest,
  ports: GeoFreshSamplePorts,
): Promise<GeoFreshSampleOutcome> {
  const { repeats: requestedRepeats, ...context } = request;
  const repeats = resolveRepeats(requestedRepeats);
  const batchId = crypto.randomUUID();
  const seenProviderRequestIds = new Set<string>();
  const runs: GeoObservationRunFact[] = [];

  for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
    const startedAt = new Date().toISOString();
    const rawResult = await ports.provider.observe({
      ...context,
      repeatIndex,
      applicationCacheBypassed: true,
    });
    const parsed = providerResultSchema.safeParse(rawResult);
    if (!parsed.success) {
      throw new Error(
        `GEO fresh sampling: repeat ${repeatIndex} returned a malformed provider result without a usable providerRequestId.`,
      );
    }
    const { providerRequestId } = parsed.data;
    if (seenProviderRequestIds.has(providerRequestId)) {
      throw new Error(
        `GEO fresh sampling: repeat ${repeatIndex} returned duplicate providerRequestId "${providerRequestId}"; repeats must have distinct provider-request identities.`,
      );
    }
    seenProviderRequestIds.add(providerRequestId);

    runs.push({
      ...context,
      id: crypto.randomUUID(),
      batchId,
      repeatIndex,
      applicationCacheBypassed: true,
      providerRequestId,
      rawResponse: parsed.data.rawResponse,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "SUCCEEDED",
    });
  }

  for (const run of runs) {
    await ports.recorder.record(run);
  }

  return { batchId, runs };
}
