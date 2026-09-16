import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { makeCandidate } from "./geoExactEntityMentionMatcher-test-fixtures";
import {
  GeoExactEntityMentionInputError,
  matchExactEntityMentions,
  type GeoExactEntityMentionCandidate,
} from "./geoExactEntityMentionMatcher";
import {
  GeoExactEntityMentionCandidateReaderError,
  type GeoExactEntityMentionCandidateReader,
} from "./geoExactEntityMentionCandidateReader";
import {
  detectExactEntityMentions,
  type GeoExactEntityMentionDetectionInput,
} from "./geoExactEntityMentionDetection";

// Invariants under test (07_GEO_MEASUREMENT_SPEC.md §5, ADR-004, ADR-005):
//   - the reader is called exactly once with the identical Project id, and the
//     supplied text plus the returned candidates are delegated exactly once to
//     the accepted T144 matcher, whose result is returned unchanged;
//   - empty, single, and colliding candidate lists keep the matcher's
//     deterministic behaviour (no filtering, dedupe, sorting, or winner);
//   - a reader failure and a matcher input rejection propagate by identity, and
//     a reader failure never becomes an empty match list;
//   - opaque text is preserved byte-for-byte at UTF-16 code-unit offsets;
//   - the shipped service has no storage, repository, recorder, network, or
//     transform dependency (source boundary).
//
// The matcher is the real T144 implementation, never a mock: the delegation is
// asserted by comparing against a direct matcher call with the same inputs.

const PROJECT_ID = "proj_1";

const SERVICE_SOURCE =
  "src/server/features/search-growth/geo/services/geoExactEntityMentionDetection.ts";

/** An in-process fake reader that answers with a fixed candidate list. */
function makeReader(candidates: GeoExactEntityMentionCandidate[]) {
  const listCandidates = vi.fn(async () => candidates);
  const reader: GeoExactEntityMentionCandidateReader = { listCandidates };
  return { reader, listCandidates };
}

describe("exact entity-mention detection service", () => {
  it("reads the Project once with the identical id and returns the matcher's result for the supplied text", async () => {
    const candidates = [
      makeCandidate(),
      makeCandidate({
        entityId: "ent_2",
        surface: "Acme Inc.",
        source: { kind: "ALIAS", aliasId: "alias_1" },
      }),
    ];
    const { reader, listCandidates } = makeReader(candidates);
    const text = "Acme Inc. is not Acme.";

    const matches = await detectExactEntityMentions(
      { projectId: PROJECT_ID, text },
      reader,
    );

    expect(listCandidates).toHaveBeenCalledTimes(1);
    expect(listCandidates).toHaveBeenCalledWith(PROJECT_ID);
    // Same result as delegating the identical text and candidates to T144.
    expect(matches).toEqual(
      matchExactEntityMentions({ projectId: PROJECT_ID, text, candidates }),
    );
  });

  it("reports the exact code-unit offsets and span text of every occurrence", async () => {
    const { reader } = makeReader([makeCandidate({ surface: "Acme" })]);
    const text = "Acme first, then Acme";

    const matches = await detectExactEntityMentions(
      { projectId: PROJECT_ID, text },
      reader,
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
        start: 17,
        end: 21,
        evidence: "Acme",
      },
    ]);
  });

  it("returns a deterministic no-match for an empty candidate list", async () => {
    const { reader, listCandidates } = makeReader([]);
    const text = "Acme mentions Acme.";

    const first = await detectExactEntityMentions(
      { projectId: PROJECT_ID, text },
      reader,
    );
    const second = await detectExactEntityMentions(
      { projectId: PROJECT_ID, text },
      reader,
    );

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(listCandidates).toHaveBeenCalledTimes(2);
  });

  it("preserves every colliding candidate's matches without dedupe or winner selection", async () => {
    const candidates = [
      makeCandidate({ entityId: "ent_1" }),
      makeCandidate({ entityId: "ent_2" }),
      makeCandidate({
        entityId: "ent_2",
        source: { kind: "ALIAS", aliasId: "alias_1" },
      }),
    ];
    const { reader } = makeReader(candidates);
    const text = "Acme";

    const matches = await detectExactEntityMentions(
      { projectId: PROJECT_ID, text },
      reader,
    );

    expect(matches).toEqual(
      matchExactEntityMentions({ projectId: PROJECT_ID, text, candidates }),
    );
    expect(matches.map((match) => [match.entityId, match.source.kind])).toEqual(
      [
        ["ent_1", "CANONICAL_NAME"],
        ["ent_2", "CANONICAL_NAME"],
        ["ent_2", "ALIAS"],
      ],
    );
  });

  it("propagates a reader failure by identity instead of returning no matches", async () => {
    const failure = new GeoExactEntityMentionCandidateReaderError(
      "tracked_entities[ent_1].canonical_name",
      "must be a non-empty string",
      { table: "tracked_entities", entityId: "ent_1", rowId: "ent_1" },
    );
    const listCandidates = vi.fn(async () => {
      throw failure;
    });
    const reader: GeoExactEntityMentionCandidateReader = { listCandidates };

    await expect(
      detectExactEntityMentions(
        { projectId: PROJECT_ID, text: "Acme" },
        reader,
      ),
    ).rejects.toBe(failure);
  });

  it("propagates the matcher's rejection of a candidate from another Project", async () => {
    const wrongProjectCandidate = makeCandidate({ projectId: "proj_other" });
    const { reader } = makeReader([wrongProjectCandidate]);

    const run = detectExactEntityMentions(
      { projectId: PROJECT_ID, text: "Acme" },
      reader,
    );

    await expect(run).rejects.toBeInstanceOf(GeoExactEntityMentionInputError);
    await expect(run).rejects.toThrow(/candidates\[0\]\.projectId/);
  });

  it("forwards the supplied text unchanged, so a non-string text is rejected by the matcher", async () => {
    const { reader } = makeReader([]);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted caller is exactly what the matcher must reject at runtime
    const input = {
      projectId: PROJECT_ID,
      text: 42,
    } as unknown as GeoExactEntityMentionDetectionInput;

    await expect(
      detectExactEntityMentions(input, reader),
    ).rejects.toBeInstanceOf(GeoExactEntityMentionInputError);
  });

  it("preserves opaque text byte-for-byte, including untrimmed whitespace and astral characters", async () => {
    const text = "  Ａcme\nAcme😀Acme  ";
    const { reader } = makeReader([makeCandidate({ surface: "Acme" })]);

    const matches = await detectExactEntityMentions(
      { projectId: PROJECT_ID, text },
      reader,
    );

    // The fullwidth "Ａcme" is not matched (no width/case folding), the emoji
    // occupies two code units, and the leading/trailing spaces shift offsets
    // rather than being discarded.
    expect(
      matches.map((match) => [match.start, match.end, match.evidence]),
    ).toEqual([
      [7, 11, "Acme"],
      [13, 17, "Acme"],
    ]);
    expect(
      matches.every(
        (match) => match.evidence === text.slice(match.start, match.end),
      ),
    ).toBe(true);
  });
});

describe("exact entity-mention detection service source boundary", () => {
  const source = readFileSync(SERVICE_SOURCE, "utf8");
  // Comments are stripped for the call-count assertions, so documentation that
  // names an API cannot be mistaken for an invocation of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const importLines = (
    source.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? []
  ).join("\n");

  it("depends only on the accepted reader and matcher contracts, with no storage, repository, or network access", () => {
    expect(importLines).toContain('"./geoExactEntityMentionCandidateReader"');
    expect(importLines).toContain('"./geoExactEntityMentionMatcher"');
    expect(importLines).not.toMatch(
      /@\/db|drizzle|Repository|Recorder|node:fs|process\.env/,
    );
    expect(source).not.toMatch(
      /fetch\(|process\.env|node:fs|JSON\.stringify|console\./,
    );
  });

  it("reads once and matches once, with no transform of the candidates or text", () => {
    expect(code.match(/listCandidates\(/g)).toHaveLength(1);
    expect(code.match(/matchExactEntityMentions\(/g)).toHaveLength(1);
    expect(code).not.toMatch(
      /\.filter\(|\.map\(|\.sort\(|\.toSorted\(|\.reduce\(|new Set\(|toLowerCase|toUpperCase|\.trim\(|\.normalize\(|\.replace\(/,
    );
  });

  it("has no error handling and touches no raw payload or parse/run identity", () => {
    expect(source).not.toMatch(/\btry\b|\bcatch\b|\bthrow\b/);
    expect(source).not.toMatch(
      /evidence|rawResponse|parseId|runId|sampleId|batchId|\.record\(/,
    );
  });
});
