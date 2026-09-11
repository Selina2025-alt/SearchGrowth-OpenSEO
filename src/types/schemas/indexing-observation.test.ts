import { describe, expect, it } from "vitest";
import type { IndexingObservation } from "./indexing-observation";
import { indexingObservationSchema } from "./indexing-observation";

// The IndexingObservation domain boundary carries the direct fields of the
// Project-scoped index observation: the opaque URL, the one authoritative
// SearchEngine enum, the optional same-Project market profile, the opaque
// observation type/status labels and the validated JSON details text. The row
// exposes the application `observedAt` plus the append-only `createdAt` only —
// no `updatedAt` and, above all, no `publicationReceiptId` before the
// credential-bound receipt domain exists (TASK items 1–3).
const VALID_OBSERVATION = {
  id: "obs_alpha_1",
  projectId: "proj_alpha",
  url: "https://example.com/blog/post",
  searchEngine: "GOOGLE",
  marketProfileId: "profile_google_us_desktop",
  observationType: "URL_INSPECTION",
  status: "INDEXED",
  detailsJson: '{"coverageState":"Submitted and indexed"}',
  observedAt: "2026-09-10T05:00:00.000Z",
  createdAt: "2026-09-10T05:00:01.000Z",
} as const;

describe("IndexingObservation domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = indexingObservationSchema.parse(VALID_OBSERVATION);
    expect(parsed).toEqual(VALID_OBSERVATION);
    // The opaque URL and details document are carried exactly, never
    // normalized or decomposed by the boundary.
    expect(parsed.url).toBe("https://example.com/blog/post");
    expect(parsed.detailsJson).toBe(VALID_OBSERVATION.detailsJson);
  });

  it("accepts every source-defined search engine and rejects others", () => {
    for (const engine of ["GOOGLE", "BAIDU", "BING", "OTHER"] as const) {
      const parsed = indexingObservationSchema.parse({
        ...VALID_OBSERVATION,
        searchEngine: engine,
      });
      expect(parsed.searchEngine).toBe(engine);
    }
    for (const engine of ["YANDEX", "google", ""]) {
      const parsed = indexingObservationSchema.safeParse({
        ...VALID_OBSERVATION,
        searchEngine: engine,
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("accepts NULL for the optional market profile and rejects a missing one", () => {
    const parsed = indexingObservationSchema.parse({
      ...VALID_OBSERVATION,
      marketProfileId: null,
    });
    expect(parsed.marketProfileId).toBeNull();

    const without: Record<string, unknown> = { ...VALID_OBSERVATION };
    delete without.marketProfileId;
    expect(indexingObservationSchema.safeParse(without).success).toBe(false);
  });

  it("rejects a row missing any direct field", () => {
    for (const field of Object.keys(VALID_OBSERVATION)) {
      const rest: Record<string, unknown> = { ...VALID_OBSERVATION };
      delete rest[field];
      expect(indexingObservationSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("rejects non-string opaque values and non-string JSON details", () => {
    const badLabels = indexingObservationSchema.safeParse({
      ...VALID_OBSERVATION,
      observationType: 42,
    });
    expect(badLabels.success).toBe(false);

    const nullStatus = indexingObservationSchema.safeParse({
      ...VALID_OBSERVATION,
      status: null,
    });
    expect(nullStatus.success).toBe(false);

    const objectDetails = indexingObservationSchema.safeParse({
      ...VALID_OBSERVATION,
      detailsJson: { coverageState: "indexed" },
    });
    expect(objectDetails.success).toBe(false);
  });

  it("exports a row type matching the direct storage shape only", () => {
    // Compile-time guard: the domain type later Search/Index tasks import
    // carries the direct fields plus the append-only createdAt, and no
    // updatedAt / publication-receipt / crawl-execution / credential field.
    const observation: IndexingObservation = { ...VALID_OBSERVATION };
    expect(observation.url).toBe("https://example.com/blog/post");
    expect(observation.searchEngine).toBe("GOOGLE");
    expect("updatedAt" in observation).toBe(false);
    expect("publicationReceiptId" in observation).toBe(false);
    expect("normalizedUrl" in observation).toBe(false);
    expect("credentialId" in observation).toBe(false);
  });
});
