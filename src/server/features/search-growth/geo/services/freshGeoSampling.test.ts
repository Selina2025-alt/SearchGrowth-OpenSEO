import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  GEO_FRESH_SAMPLE_DEFAULT_REPEATS,
  GEO_FRESH_SAMPLE_HIGH_VALUE_REPEATS,
  sampleFreshGeoObservation,
  type GeoFreshSampleOutcome,
  type GeoFreshSamplePorts,
  type GeoFreshSampleProvider,
  type GeoFreshSampleProviderRequest,
  type GeoFreshSampleProviderResult,
  type GeoFreshSampleRequest,
  type GeoObservationRunFact,
  type GeoObservationRunRecorder,
} from "./freshGeoSampling";

// Invariants under test (07_GEO_MEASUREMENT_SPEC.md §2–3,
// 21_TEST_ACCEPTANCE_PLAN.md §3, ADR-003):
//   - the default sample makes exactly 3 provider-port calls and 3 recordings;
//   - repeats use indices 0–2 and every provider request / run fact declares
//     applicationCacheBypassed: true;
//   - run and provider-request identities are distinct and non-empty;
//   - the raw provider payload is preserved verbatim (never parsed);
//   - the explicit high-value request makes exactly 5 calls;
//   - only the two documented repeat counts are accepted;
//   - malformed and duplicate provider request identities reject the sample
//     without recording any run fact;
//   - the core has no dependency on the Prompt Explorer application cache.

const REQUEST: GeoFreshSampleRequest = {
  projectId: "proj_1",
  promptId: "prompt_1",
  promptVersion: 3,
  surfaceType: "MODEL_API_SEARCH",
  surfaceName: "GPT-5 Search",
  fidelity: "API_SIMULATION",
  provider: "OpenAI",
  model: "gpt-5",
  modelVersion: "2026-09-01",
  webSearch: true,
};

const SOURCE_PATH =
  "src/server/features/search-growth/geo/services/freshGeoSampling.ts";

function makeProvider(
  observe: (
    request: GeoFreshSampleProviderRequest,
  ) => Promise<GeoFreshSampleProviderResult>,
) {
  const observeMock = vi.fn(observe);
  const provider: GeoFreshSampleProvider = { observe: observeMock };
  return { provider, observeMock };
}

const completingProvider = () =>
  makeProvider(async (request) => ({
    providerRequestId: `req_${request.repeatIndex}`,
    rawResponse: { repeat: request.repeatIndex },
  }));

function makeRecorder() {
  const facts: GeoObservationRunFact[] = [];
  const record = vi.fn(async (fact: GeoObservationRunFact) => {
    facts.push(fact);
  });
  const recorder: GeoObservationRunRecorder = { record };
  return { recorder, record, facts };
}

function makePorts(
  provider: GeoFreshSampleProvider,
  recorder: GeoObservationRunRecorder,
): GeoFreshSamplePorts {
  return { provider, recorder };
}

describe("sampleFreshGeoObservation", () => {
  it("makes exactly three provider calls and three recordings by default", async () => {
    const { provider, observeMock } = completingProvider();
    const { recorder, record } = makeRecorder();

    const outcome: GeoFreshSampleOutcome = await sampleFreshGeoObservation(
      REQUEST,
      makePorts(provider, recorder),
    );

    expect(GEO_FRESH_SAMPLE_DEFAULT_REPEATS).toBe(3);
    expect(observeMock).toHaveBeenCalledTimes(3);
    expect(record).toHaveBeenCalledTimes(3);
    expect(outcome.runs).toHaveLength(3);
  });

  it("uses repeat indices 0–2 and sets applicationCacheBypassed on every call and fact", async () => {
    const { provider, observeMock } = completingProvider();
    const { recorder, facts } = makeRecorder();

    await sampleFreshGeoObservation(REQUEST, makePorts(provider, recorder));

    const requests = observeMock.mock.calls.map(([request]) => request);
    expect(requests.map((request) => request.repeatIndex)).toEqual([0, 1, 2]);
    expect(requests.every((request) => request.applicationCacheBypassed)).toBe(
      true,
    );
    expect(facts.map((fact) => fact.repeatIndex)).toEqual([0, 1, 2]);
    expect(facts.every((fact) => fact.applicationCacheBypassed)).toBe(true);
  });

  it("gives every run fact a distinct run identity and provider-request identity", async () => {
    const { provider } = completingProvider();
    const { recorder, facts } = makeRecorder();

    await sampleFreshGeoObservation(REQUEST, makePorts(provider, recorder));

    const runIds = facts.map((fact) => fact.id);
    const providerRequestIds = facts.map((fact) => fact.providerRequestId);
    expect(new Set(runIds).size).toBe(3);
    expect(new Set(providerRequestIds).size).toBe(3);
    expect(providerRequestIds.every((id) => id.length > 0)).toBe(true);
    // One sample groups its repeats under a single batch.
    expect(new Set(facts.map((fact) => fact.batchId)).size).toBe(1);
  });

  it("preserves the raw provider response verbatim as opaque data", async () => {
    const payloads = [0, 1, 2].map((repeat) => ({
      answer: `answer ${repeat}`,
      citations: [{ url: `https://example.com/${repeat}` }],
    }));
    const { provider } = makeProvider(async (request) => ({
      providerRequestId: `req_${request.repeatIndex}`,
      rawResponse: payloads[request.repeatIndex],
    }));
    const { recorder, facts } = makeRecorder();

    await sampleFreshGeoObservation(REQUEST, makePorts(provider, recorder));

    // Identity, not just deep equality: the core passes the payload through
    // without re-shaping or parsing it.
    expect(facts[0]?.rawResponse).toBe(payloads[0]);
    expect(facts[1]?.rawResponse).toBe(payloads[1]);
    expect(facts[2]?.rawResponse).toBe(payloads[2]);
  });

  it("makes exactly five calls and recordings for the explicit high-value request", async () => {
    const { provider, observeMock } = completingProvider();
    const { recorder, record, facts } = makeRecorder();

    await sampleFreshGeoObservation(
      { ...REQUEST, repeats: GEO_FRESH_SAMPLE_HIGH_VALUE_REPEATS },
      makePorts(provider, recorder),
    );

    expect(GEO_FRESH_SAMPLE_HIGH_VALUE_REPEATS).toBe(5);
    expect(observeMock).toHaveBeenCalledTimes(5);
    expect(record).toHaveBeenCalledTimes(5);
    expect(facts.map((fact) => fact.repeatIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it("rejects an unapproved repeat count before calling the provider", async () => {
    const { provider, observeMock } = completingProvider();
    const { recorder, record } = makeRecorder();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- intentionally bypasses the compile-time repeat union
    const request = {
      ...REQUEST,
      repeats: 4,
    } as unknown as GeoFreshSampleRequest;

    await expect(
      sampleFreshGeoObservation(request, makePorts(provider, recorder)),
    ).rejects.toThrow(/unapproved repeat count/);
    expect(observeMock).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing provider request id", { rawResponse: {} }],
    [
      "a blank provider request id",
      { providerRequestId: "   ", rawResponse: {} },
    ],
    ["a non-object provider result", "not-a-result"],
  ])("rejects %s without recording any run fact", async (_label, malformed) => {
    const observeMock = vi.fn(async (request: GeoFreshSampleProviderRequest) =>
      request.repeatIndex === 1
        ? malformed
        : { providerRequestId: `req_${request.repeatIndex}`, rawResponse: {} },
    );
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fake provider returns malformed payloads on purpose
    const provider = {
      observe: observeMock,
    } as unknown as GeoFreshSampleProvider;
    const { recorder, record } = makeRecorder();

    await expect(
      sampleFreshGeoObservation(REQUEST, makePorts(provider, recorder)),
    ).rejects.toThrow(/malformed provider result/);
    expect(record).not.toHaveBeenCalled();
  });

  it("rejects duplicate provider request identities without recording any run fact", async () => {
    const { provider } = makeProvider(async () => ({
      providerRequestId: "req_duplicate",
      rawResponse: {},
    }));
    const { recorder, record } = makeRecorder();

    await expect(
      sampleFreshGeoObservation(REQUEST, makePorts(provider, recorder)),
    ).rejects.toThrow(/duplicate providerRequestId/);
    expect(record).not.toHaveBeenCalled();
  });
});

describe("fresh GEO sampling cache boundary", () => {
  it("does not depend on the Prompt Explorer application cache", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");

    expect(source).not.toContain("r2-cache");
    expect(source).not.toContain("promptExplorer");
    expect(source).not.toContain("getCached");
    expect(source).not.toContain("setCached");
    expect(source).not.toContain("AI_SEARCH_PROMPT_CACHE_NAMESPACE");
    expect(source).not.toContain("ai-search");
  });
});
