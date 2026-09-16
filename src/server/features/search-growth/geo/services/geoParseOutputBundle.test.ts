import { describe, expect, it, vi } from "vitest";
import type { GeoCitationFact } from "./geoCitationRecorder";
import type { GeoEntityMentionFact } from "./geoEntityMentionRecorder";
import type { GeoObservationParseFact } from "./geoObservationParseRecorder";
import {
  GeoParseOutputBundleIdentityError,
  validateGeoParseOutputBundle,
  type GeoParseOutputBundle,
} from "./geoParseOutputBundle";

// Invariants under test (ADR-005, 05_DOMAIN_DATA_MODEL.md §7,
// 07_GEO_MEASUREMENT_SPEC.md §§5–6):
//   - a bundle with no child facts is valid;
//   - many mentions and citations of the same Project and the same parse are
//     valid, whatever the parse fact's `isCurrent` marker says;
//   - a child belonging to another Project, or bound to another parse, is
//     rejected with the exact collection and index named;
//   - the guard looks at cross-fact identity only — it neither validates leaves
//     nor inspects evidence — and returns the caller's bundle by identity,
//     unmutated and unserialized.

function makeParse(
  overrides: Partial<GeoObservationParseFact> = {},
): GeoObservationParseFact {
  return {
    id: "parse_1",
    projectId: "proj_1",
    runId: "run_1",
    parserVersion: "parser-v1",
    parseStatus: "SUCCESS",
    accuracyStatus: null,
    parsedAt: "2026-09-16T00:00:00.000Z",
    isCurrent: true,
    ...overrides,
  };
}

function makeMention(
  overrides: Partial<GeoEntityMentionFact> = {},
): GeoEntityMentionFact {
  return {
    id: "mention_1",
    projectId: "proj_1",
    parseId: "parse_1",
    entityId: "entity_1",
    mentioned: true,
    recommended: null,
    mentionPosition: null,
    sentiment: null,
    evidenceText: null,
    ...overrides,
  };
}

function makeCitation(
  overrides: Partial<GeoCitationFact> = {},
): GeoCitationFact {
  return {
    id: "citation_1",
    projectId: "proj_1",
    parseId: "parse_1",
    rawUrl: "https://example.com/cited",
    normalizedUrl: "https://example.com/cited",
    domain: "example.com",
    title: null,
    position: null,
    sourceOwnership: "EARNED_THIRD_PARTY",
    matchedPublicationReceiptId: null,
    ...overrides,
  };
}

function makeBundle(
  overrides: Partial<GeoParseOutputBundle> = {},
): GeoParseOutputBundle {
  return {
    parse: makeParse(),
    entityMentions: [makeMention()],
    citations: [makeCitation()],
    ...overrides,
  };
}

function captureIdentityError(
  run: () => unknown,
): GeoParseOutputBundleIdentityError {
  try {
    run();
  } catch (error) {
    if (error instanceof GeoParseOutputBundleIdentityError) return error;
    throw error;
  }
  throw new Error("expected the guard to reject the bundle");
}

describe("validateGeoParseOutputBundle", () => {
  it("accepts a bundle whose parse has no child facts", () => {
    const bundle = makeBundle({ entityMentions: [], citations: [] });

    expect(validateGeoParseOutputBundle(bundle)).toBe(bundle);
  });

  it("accepts many mentions and citations of the same project and parse", () => {
    const bundle = makeBundle({
      parse: makeParse({ isCurrent: false, parserVersion: "parser-v2" }),
      entityMentions: [
        makeMention({ id: "mention_1", entityId: "entity_1" }),
        makeMention({
          id: "mention_2",
          entityId: "entity_2",
          mentioned: false,
        }),
        makeMention({ id: "mention_3", entityId: "entity_3" }),
      ],
      citations: [
        makeCitation({ id: "citation_1" }),
        makeCitation({ id: "citation_2", sourceOwnership: "OWNED_DOMAIN" }),
      ],
    });

    expect(validateGeoParseOutputBundle(bundle)).toBe(bundle);
  });

  it("rejects an entity mention from another project, naming collection and index", () => {
    const bundle = makeBundle({
      entityMentions: [
        makeMention({ id: "mention_1" }),
        makeMention({ id: "mention_2", projectId: "proj_2" }),
      ],
    });

    const error = captureIdentityError(() =>
      validateGeoParseOutputBundle(bundle),
    );

    expect(error.collection).toBe("entityMentions");
    expect(error.index).toBe(1);
    expect(error.message).toContain("entityMentions[1]");
    expect(error.message).toContain("proj_2");
    expect(error.message).toContain("proj_1");
  });

  it("rejects a citation from another project, naming collection and index", () => {
    const bundle = makeBundle({
      citations: [makeCitation({ id: "citation_1", projectId: "proj_2" })],
    });

    const error = captureIdentityError(() =>
      validateGeoParseOutputBundle(bundle),
    );

    expect(error).toBeInstanceOf(GeoParseOutputBundleIdentityError);
    expect(error.collection).toBe("citations");
    expect(error.index).toBe(0);
    expect(error.message).toContain("citations[0]");
    expect(error.message).toContain("proj_2");
  });

  it("rejects an entity mention bound to another parse, naming collection and index", () => {
    const bundle = makeBundle({
      entityMentions: [
        makeMention({ id: "mention_1", parseId: "parse_other" }),
      ],
    });

    const error = captureIdentityError(() =>
      validateGeoParseOutputBundle(bundle),
    );

    expect(error.collection).toBe("entityMentions");
    expect(error.index).toBe(0);
    expect(error.message).toContain("entityMentions[0]");
    expect(error.message).toContain("parse_other");
  });

  it("rejects a citation bound to another parse at the exact index", () => {
    const bundle = makeBundle({
      citations: [
        makeCitation({ id: "citation_1" }),
        makeCitation({ id: "citation_2" }),
        makeCitation({ id: "citation_3", parseId: "parse_other" }),
      ],
    });

    const error = captureIdentityError(() =>
      validateGeoParseOutputBundle(bundle),
    );

    expect(error.collection).toBe("citations");
    expect(error.index).toBe(2);
    expect(error.message).toContain("citations[2]");
    expect(error.message).toContain("parse_other");
    expect(error.message).toContain("parse_1");
  });

  it("returns the bundle and every fact by identity, unmutated and unserialized", () => {
    const bundle = makeBundle({
      entityMentions: [
        makeMention({ id: "mention_1" }),
        makeMention({ id: "mention_2", entityId: "entity_2" }),
      ],
      citations: [makeCitation({ id: "citation_1" })],
    });
    const before = structuredClone(bundle);
    const stringify = vi.spyOn(JSON, "stringify");

    const result = validateGeoParseOutputBundle(bundle);

    expect(result).toBe(bundle);
    expect(result.parse).toBe(bundle.parse);
    expect(result.entityMentions).toBe(bundle.entityMentions);
    expect(result.citations).toBe(bundle.citations);
    expect(result.entityMentions[0]).toBe(bundle.entityMentions[0]);
    expect(result.entityMentions[1]).toBe(bundle.entityMentions[1]);
    expect(result.citations[0]).toBe(bundle.citations[0]);
    expect(stringify).not.toHaveBeenCalled();
    expect(bundle).toEqual(before);
  });

  it("leaves an opaque evidence string byte-for-byte unchanged", () => {
    const evidence =
      '{"answer":"ACME <b>is</b> #1\\n\\t\\u0000","note":"  spacing  "}  ';
    const bundle = makeBundle({
      entityMentions: [makeMention({ evidenceText: evidence })],
    });

    const result = validateGeoParseOutputBundle(bundle);

    expect(result.entityMentions[0]?.evidenceText).toBe(evidence);
    expect(result.entityMentions[0]?.evidenceText).toHaveLength(
      evidence.length,
    );
  });
});
