import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  matchExactEntityMentions,
  type GeoExactEntityMentionMatch,
  type GeoExactEntityMentionSource,
} from "./geoExactEntityMentionMatcher";
import {
  makeCandidate,
  makeInput,
} from "./geoExactEntityMentionMatcher-test-fixtures";

// Invariants under test (ADR-004, ADR-005, 05_DOMAIN_DATA_MODEL.md §§4 and 7,
// 07_GEO_MEASUREMENT_SPEC.md §5):
//   - only literal, case-sensitive `EXACT` occurrences are returned, at
//     JavaScript code-unit offsets, with the exact supplied substring as
//     evidence — the text and the surfaces are never normalized;
//   - ordering is deterministic (ascending `start`, then the caller's candidate
//     order), and candidates sharing or overlapping a surface stay independent;
//   - the matcher is pure: it mutates and serializes nothing and touches no
//     storage, provider, or persisted state.
//
// The rejection contract has its own spec
// (./geoExactEntityMentionMatcher.rejection.test.ts).

const MATCHER_SOURCE =
  "src/server/features/search-growth/geo/services/geoExactEntityMentionMatcher.ts";

/** Precomposed "é" (U+00E9): one code unit. */
const PRECOMPOSED_E_ACUTE = String.fromCharCode(0x00e9);
/** Decomposed "e" + U+0301 (combining acute): two code units. */
const DECOMPOSED_E_ACUTE = `e${String.fromCharCode(0x0301)}`;

describe("matchExactEntityMentions literal matching", () => {
  it("returns every non-overlapping occurrence of a repeated surface, case-sensitively", () => {
    const matches: GeoExactEntityMentionMatch[] = matchExactEntityMentions(
      makeInput({
        text: "Acme and Acme again. ACME.",
        candidates: [makeCandidate({ surface: "Acme" })],
      }),
    );

    expect(matches).toEqual([
      {
        entityId: "ent_1",
        source: { kind: "CANONICAL_NAME" },
        start: 0,
        end: 4,
        evidence: "Acme",
      },
      {
        entityId: "ent_1",
        source: { kind: "CANONICAL_NAME" },
        start: 9,
        end: 13,
        evidence: "Acme",
      },
    ]);
  });

  it("never matches overlapping occurrences of one candidate", () => {
    const matches = matchExactEntityMentions(
      makeInput({
        text: "aaaa",
        candidates: [makeCandidate({ surface: "aa" })],
      }),
    );

    expect(matches.map((match) => [match.start, match.end])).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });

  it("keeps overlapping surfaces of different candidates independent", () => {
    const matches = matchExactEntityMentions(
      makeInput({
        text: "Acme Corporation",
        candidates: [
          makeCandidate({ entityId: "ent_full", surface: "Acme Corporation" }),
          makeCandidate({ entityId: "ent_short", surface: "Acme" }),
        ],
      }),
    );

    expect(
      matches.map((match) => [match.entityId, match.start, match.end]),
    ).toEqual([
      ["ent_full", 0, 16],
      ["ent_short", 0, 4],
    ]);
  });

  it("orders by ascending start, then the caller's candidate order, deterministically", () => {
    const buildInput = () =>
      makeInput({
        text: "Beta Acme Acme",
        candidates: [
          makeCandidate({ entityId: "ent_a", surface: "Acme" }),
          makeCandidate({ entityId: "ent_b", surface: "Beta" }),
        ],
      });

    const matches = matchExactEntityMentions(buildInput());

    expect(
      matches.map((match) => [match.start, match.entityId, match.evidence]),
    ).toEqual([
      [0, "ent_b", "Beta"],
      [5, "ent_a", "Acme"],
      [10, "ent_a", "Acme"],
    ]);
    expect(matchExactEntityMentions(buildInput())).toEqual(matches);
  });

  it("keeps two candidates with the same literal surface separate", () => {
    const matches = matchExactEntityMentions(
      makeInput({
        text: "Acme Acme",
        candidates: [
          makeCandidate({ entityId: "ent_1" }),
          makeCandidate({
            entityId: "ent_2",
            source: { kind: "ALIAS", aliasId: "alias_9" },
          }),
        ],
      }),
    );

    expect(
      matches.map((match) => [
        match.entityId,
        match.source.kind === "ALIAS" ? match.source.aliasId : null,
        match.start,
        match.evidence,
      ]),
    ).toEqual([
      ["ent_1", null, 0, "Acme"],
      ["ent_2", "alias_9", 0, "Acme"],
      ["ent_1", null, 5, "Acme"],
      ["ent_2", "alias_9", 5, "Acme"],
    ]);
  });

  it("uses code-unit offsets and slices evidence across astral characters", () => {
    const matches = matchExactEntityMentions(
      makeInput({ text: "\u{1F680} Acme \u{1F680}" }),
    );

    expect(matches).toEqual([
      {
        entityId: "ent_1",
        source: { kind: "CANONICAL_NAME" },
        start: 3,
        end: 7,
        evidence: "Acme",
      },
    ]);
  });

  it("matches a non-ASCII surface verbatim and never normalizes text or surface", () => {
    const composedText = `Caf${PRECOMPOSED_E_ACUTE} Noir`;
    const composed = matchExactEntityMentions(
      makeInput({
        text: composedText,
        candidates: [makeCandidate({ surface: `Caf${PRECOMPOSED_E_ACUTE}` })],
      }),
    );
    // The decomposed spelling is a different code-unit sequence, so it is a
    // different literal: no Unicode normalization runs on text or surface.
    const decomposed = matchExactEntityMentions(
      makeInput({
        text: composedText,
        candidates: [makeCandidate({ surface: `Caf${DECOMPOSED_E_ACUTE}` })],
      }),
    );

    expect(composed).toEqual([
      {
        entityId: "ent_1",
        source: { kind: "CANONICAL_NAME" },
        start: 0,
        end: 4,
        evidence: composedText.slice(0, 4),
      },
    ]);
    expect(decomposed).toEqual([]);
  });

  it("matches surfaces and text without trimming either", () => {
    const leadingSpace = matchExactEntityMentions(
      makeInput({
        text: "  Acme",
        candidates: [makeCandidate({ surface: " Acme" })],
      }),
    );
    const trimmed = matchExactEntityMentions(
      makeInput({
        text: "  Acme",
        candidates: [makeCandidate({ surface: "Acme" })],
      }),
    );

    expect(leadingSpace.map((match) => [match.start, match.evidence])).toEqual([
      [1, " Acme"],
    ]);
    expect(trimmed.map((match) => match.start)).toEqual([2]);
  });

  it("treats a whitespace-only surface as the literal string it is", () => {
    const matches = matchExactEntityMentions(
      makeInput({
        text: "Acme  Inc",
        candidates: [makeCandidate({ surface: "  " })],
      }),
    );

    expect(
      matches.map((match) => [match.start, match.end, match.evidence]),
    ).toEqual([[4, 6, "  "]]);
  });

  it("returns no matches for an empty parsed text or an empty candidate list", () => {
    expect(matchExactEntityMentions(makeInput({ text: "" }))).toEqual([]);
    expect(matchExactEntityMentions(makeInput({ candidates: [] }))).toEqual([]);
  });

  it("returns the caller's source objects by identity, mutating and serializing nothing", () => {
    const canonicalSource: GeoExactEntityMentionSource = {
      kind: "CANONICAL_NAME",
    };
    const aliasSource: GeoExactEntityMentionSource = {
      kind: "ALIAS",
      aliasId: "alias_9",
    };
    const input = makeInput({
      text: "Acme Acme",
      candidates: [
        makeCandidate({ source: canonicalSource }),
        makeCandidate({ entityId: "ent_2", source: aliasSource }),
      ],
    });
    const before = structuredClone(input);
    const stringify = vi.spyOn(JSON, "stringify");

    const matches = matchExactEntityMentions(input);

    expect(stringify).not.toHaveBeenCalled();
    expect(input).toEqual(before);
    expect(matches.map((match) => match.start)).toEqual([0, 0, 5, 5]);
    expect(matches[0]?.source).toBe(canonicalSource);
    expect(matches[3]?.source).toBe(aliasSource);
  });
});

describe("matchExactEntityMentions boundary", () => {
  it("depends on no database, provider, or persisted state", () => {
    const source = readFileSync(MATCHER_SOURCE, "utf8");

    expect(source).not.toMatch(
      /@\/db|drizzle|insert\(|\.query\(|recorder|fetch\(|process\.env|node:fs/i,
    );
  });
});
