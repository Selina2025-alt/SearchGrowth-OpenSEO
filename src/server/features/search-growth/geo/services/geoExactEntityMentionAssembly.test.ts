import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { GeoExactEntityMentionCandidate } from "./geoExactEntityMentionMatcher";
import { makeCandidate } from "./geoExactEntityMentionMatcher-test-fixtures";
import type { GeoObservationParseFact } from "./geoObservationParseRecorder";
import {
  GeoExactEntityMentionCandidateReaderError,
  type GeoExactEntityMentionCandidateReader,
} from "./geoExactEntityMentionCandidateReader";
import { GeoExactEntityMentionFactAssemblyError } from "./geoExactEntityMentionFactAssembler";
import {
  assembleExactEntityMentionFactsForParse,
  type GeoExactEntityMentionAssemblyInput,
} from "./geoExactEntityMentionAssembly";

// Invariants under test (ADR-004, ADR-005, 05_DOMAIN_DATA_MODEL.md §§4 and 7,
// 07_GEO_MEASUREMENT_SPEC.md §§5–6):
//   - the injected reader is consulted exactly once under the given parse
//     fact's own Project, and the accepted T146 detection plus the accepted T147
//     assembler are each invoked exactly once, in that order, with the parse,
//     Project, text, and ids forwarded verbatim and the drafts returned unchanged;
//   - empty, single, and colliding detections keep the accepted T146/T147
//     semantics: no-match, canonical/alias provenance, and SUCCESS/PARTIAL parses
//     all assemble without filtering, sorting, dedupe, or winner selection;
//   - a reader failure, an id/match cardinality mismatch, and a FAILED parse all
//     propagate by identity — never as an empty or repaired draft list;
//   - opaque text is preserved byte-for-byte and no caller input is mutated;
//   - the shipped service has no storage, repository, recorder, provider, or
//     transform dependency (source boundary).
//
// The fake reader is in-process and the detection/assembly functions are the
// real accepted implementations, never mocks.

const PARSE_ID = "parse_1";
const PARSE_PROJECT_ID = "proj_parse_7";

const SERVICE_SOURCE =
  "src/server/features/search-growth/geo/services/geoExactEntityMentionAssembly.ts";

function makeParse(
  overrides: Partial<GeoObservationParseFact> = {},
): GeoObservationParseFact {
  return {
    id: PARSE_ID,
    projectId: PARSE_PROJECT_ID,
    runId: "run_1",
    parserVersion: "parser-v1",
    parseStatus: "SUCCESS",
    accuracyStatus: null,
    parsedAt: "2026-09-16T00:00:00.000Z",
    isCurrent: true,
    ...overrides,
  };
}

/** A candidate belonging to the parse fact's Project, as the reader would return. */
function makeProjectCandidate(
  overrides: Partial<GeoExactEntityMentionCandidate> = {},
): GeoExactEntityMentionCandidate {
  return makeCandidate({ projectId: PARSE_PROJECT_ID, ...overrides });
}

/** An in-process fake reader that answers with a fixed candidate list. */
function makeReader(candidates: GeoExactEntityMentionCandidate[]) {
  const listCandidates = vi.fn(async () => candidates);
  const reader: GeoExactEntityMentionCandidateReader = { listCandidates };
  return { reader, listCandidates };
}

describe("exact entity-mention assembly service", () => {
  it("detects under the parse's own Project and returns the assembler's drafts unchanged", async () => {
    const parse = makeParse();
    const text = "Acme and Globex";
    const mentionIds = ["mention_1", "mention_2"];
    const candidates = [
      makeProjectCandidate(),
      makeProjectCandidate({
        entityId: "ent_2",
        surface: "Globex",
        source: { kind: "ALIAS", aliasId: "alias_1" },
      }),
    ];
    const { reader, listCandidates } = makeReader(candidates);

    const drafts = await assembleExactEntityMentionFactsForParse(
      { parse, text, mentionIds },
      reader,
    );

    expect(listCandidates).toHaveBeenCalledTimes(1);
    expect(listCandidates).toHaveBeenCalledWith(PARSE_PROJECT_ID);
    // Exactly the accepted T147 drafts for the accepted T146 spans of this
    // text: one per match, in match order, with nothing added or rewritten.
    expect(drafts).toEqual([
      {
        fact: {
          id: "mention_1",
          projectId: PARSE_PROJECT_ID,
          parseId: PARSE_ID,
          entityId: "ent_1",
          mentioned: true,
          recommended: null,
          mentionPosition: null,
          sentiment: null,
          evidenceText: "Acme",
        },
        match: {
          entityId: "ent_1",
          source: { kind: "CANONICAL_NAME" },
          start: 0,
          end: 4,
          evidence: "Acme",
        },
      },
      {
        fact: {
          id: "mention_2",
          projectId: PARSE_PROJECT_ID,
          parseId: PARSE_ID,
          entityId: "ent_2",
          mentioned: true,
          recommended: null,
          mentionPosition: null,
          sentiment: null,
          evidenceText: "Globex",
        },
        match: {
          entityId: "ent_2",
          source: { kind: "ALIAS", aliasId: "alias_1" },
          start: 9,
          end: 15,
          evidence: "Globex",
        },
      },
    ]);
  });

  it("returns no drafts when the Project's candidates match nothing", async () => {
    const { reader, listCandidates } = makeReader([]);

    const drafts = await assembleExactEntityMentionFactsForParse(
      { parse: makeParse(), text: "Acme mentions Acme.", mentionIds: [] },
      reader,
    );

    expect(drafts).toEqual([]);
    expect(listCandidates).toHaveBeenCalledTimes(1);
  });

  it("keeps every colliding candidate as its own draft with its canonical/alias provenance", async () => {
    const candidates = [
      makeProjectCandidate({ entityId: "ent_1" }),
      makeProjectCandidate({ entityId: "ent_2" }),
      makeProjectCandidate({
        entityId: "ent_2",
        source: { kind: "ALIAS", aliasId: "alias_1" },
      }),
    ];
    const { reader } = makeReader(candidates);

    const drafts = await assembleExactEntityMentionFactsForParse(
      {
        parse: makeParse(),
        text: "Acme",
        mentionIds: ["mention_1", "mention_2", "mention_3"],
      },
      reader,
    );

    // Three candidates matched the very same span: no winner is selected, no
    // collision is dropped, and the alias draft keeps the alias row it came from.
    expect(
      drafts.map((draft) => [
        draft.fact.id,
        draft.fact.entityId,
        draft.match.source.kind,
        draft.match.start,
        draft.match.end,
        draft.fact.evidenceText,
      ]),
    ).toEqual([
      ["mention_1", "ent_1", "CANONICAL_NAME", 0, 4, "Acme"],
      ["mention_2", "ent_2", "CANONICAL_NAME", 0, 4, "Acme"],
      ["mention_3", "ent_2", "ALIAS", 0, 4, "Acme"],
    ]);
    expect(drafts[2]?.match.source).toEqual({
      kind: "ALIAS",
      aliasId: "alias_1",
    });
  });

  it("assembles a PARTIAL parse without repair or fallback", async () => {
    const parse = makeParse({
      parseStatus: "PARTIAL",
      accuracyStatus: "PARTIAL",
    });
    const { reader } = makeReader([makeProjectCandidate()]);

    const drafts = await assembleExactEntityMentionFactsForParse(
      { parse, text: "Acme", mentionIds: ["mention_1"] },
      reader,
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.fact.parseId).toBe(PARSE_ID);
    expect(drafts[0]?.fact.projectId).toBe(PARSE_PROJECT_ID);
    expect(drafts[0]?.fact.entityId).toBe("ent_1");
    expect(drafts[0]?.fact.evidenceText).toBe("Acme");
  });

  it("preserves opaque text byte-for-byte without mutating the parse or the id array", async () => {
    const parse = makeParse();
    const text = "  Ａcme\nAcme😀Acme  ";
    const mentionIds = ["mention_1", "mention_2"];
    const input: GeoExactEntityMentionAssemblyInput = {
      parse,
      text,
      mentionIds,
    };
    const before = structuredClone(input);
    const { reader } = makeReader([makeProjectCandidate()]);

    const drafts = await assembleExactEntityMentionFactsForParse(input, reader);

    // The fullwidth "Ａcme" is not matched (no width/case folding), the emoji
    // occupies two code units, and the surrounding whitespace shifts offsets
    // rather than being trimmed.
    expect(
      drafts.map((draft) => [
        draft.match.start,
        draft.match.end,
        draft.fact.evidenceText,
      ]),
    ).toEqual([
      [7, 11, "Acme"],
      [13, 17, "Acme"],
    ]);
    expect(
      drafts.every(
        (draft) =>
          draft.match.evidence ===
          text.slice(draft.match.start, draft.match.end),
      ),
    ).toBe(true);
    expect(input).toEqual(before);
    expect(input.parse).toBe(parse);
    expect(input.mentionIds).toBe(mentionIds);
    expect(mentionIds).toEqual(["mention_1", "mention_2"]);
  });

  it("propagates a reader failure by identity instead of returning no drafts", async () => {
    const failure = new GeoExactEntityMentionCandidateReaderError(
      "tracked_entities[ent_1].canonical_name",
      "must be a non-empty string",
      { table: "tracked_entities", entityId: "ent_1", rowId: "ent_1" },
    );
    const listCandidates = vi.fn(async () => {
      throw failure;
    });
    const reader: GeoExactEntityMentionCandidateReader = { listCandidates };

    const run = assembleExactEntityMentionFactsForParse(
      { parse: makeParse(), text: "Acme", mentionIds: ["mention_1"] },
      reader,
    );

    await expect(run).rejects.toBe(failure);
    expect(listCandidates).toHaveBeenCalledTimes(1);
  });

  it("propagates the assembler's id/match cardinality rejection without repairing the ids", async () => {
    const { reader } = makeReader([makeProjectCandidate()]);

    const run = assembleExactEntityMentionFactsForParse(
      { parse: makeParse(), text: "Acme", mentionIds: [] },
      reader,
    );

    await expect(run).rejects.toBeInstanceOf(
      GeoExactEntityMentionFactAssemblyError,
    );
    await expect(run).rejects.toMatchObject({
      field: "mentionIds",
      mentionIndex: null,
    });
  });

  it("propagates the assembler's FAILED-parse rejection after the contract's detection call", async () => {
    const { reader, listCandidates } = makeReader([makeProjectCandidate()]);

    const run = assembleExactEntityMentionFactsForParse(
      {
        parse: makeParse({ parseStatus: "FAILED" }),
        text: "Acme",
        mentionIds: ["mention_1"],
      },
      reader,
    );

    await expect(run).rejects.toBeInstanceOf(
      GeoExactEntityMentionFactAssemblyError,
    );
    await expect(run).rejects.toMatchObject({ field: "parse.parseStatus" });
    // Detection precedes the accepted T147 guard by contract, so the reader was
    // consulted once before that guard rejected the batch.
    expect(listCandidates).toHaveBeenCalledTimes(1);
  });
});

describe("exact entity-mention assembly service source boundary", () => {
  const source = readFileSync(SERVICE_SOURCE, "utf8");
  // Comments are stripped for the call-shape assertions, so documentation that
  // names an API cannot be mistaken for an invocation of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const importLines = (
    source.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? []
  ).join("\n");

  it("depends only on the accepted detection, assembly, and reader contracts", () => {
    // The concrete parse fact's type reaches this service through the accepted
    // T147 assembly input, so no parse module is imported directly.
    expect(
      [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]),
    ).toEqual([
      "./geoExactEntityMentionCandidateReader",
      "./geoExactEntityMentionDetection",
      "./geoExactEntityMentionFactAssembler",
    ]);
    expect(importLines).not.toMatch(
      /@\/db|drizzle|Repository|node:fs|process\.env/,
    );
    expect(source).not.toMatch(
      /fetch\(|process\.env|node:fs|JSON\.stringify|console\./,
    );
  });

  it("detects once and assembles once, and reads no candidate or raw payload itself", () => {
    expect(code.match(/detectExactEntityMentions\(/g)).toHaveLength(1);
    expect(code.match(/assembleExactEntityMentionFacts\(/g)).toHaveLength(1);
    expect(code).not.toMatch(
      /listCandidates\(|matchExactEntityMentions\(|\.record\(/,
    );
    expect(code).not.toMatch(
      /evidence|rawResponse|rawPayload|parseStatus|runId|sampleId|marketId|batchId/,
    );
  });

  it("decides and reorders nothing on its own", () => {
    expect(code).not.toMatch(
      /\.filter\(|\.map\(|\.sort\(|\.toSorted\(|\.reverse\(|\.reduce\(|new Set\(|toLowerCase|toUpperCase|\.trim\(|\.normalize\(|\.replace\(/,
    );
    expect(code).not.toMatch(/===|!==|FAILED/);
  });

  it("swallows no failure", () => {
    expect(code).not.toMatch(/\btry\b|\bcatch\b|\bthrow\b/);
  });
});
