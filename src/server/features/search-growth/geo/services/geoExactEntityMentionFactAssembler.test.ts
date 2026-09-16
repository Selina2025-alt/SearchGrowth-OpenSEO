import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { GeoExactEntityMentionMatch } from "./geoExactEntityMentionMatcher";
import type { GeoObservationParseFact } from "./geoObservationParseRecorder";
import {
  GeoExactEntityMentionFactAssemblyError,
  assembleExactEntityMentionFacts,
  type GeoEntityMentionFactDraft,
  type GeoExactEntityMentionFactAssemblyInput,
} from "./geoExactEntityMentionFactAssembler";

// Invariants under test (ADR-005, 05_DOMAIN_DATA_MODEL.md §§4 and 7,
// 07_GEO_MEASUREMENT_SPEC.md §§5–6):
//   - one draft per match, bound to the concrete parse fact's `projectId` and
//     `parseId`, with the match's own `entityId` and verbatim `evidence`;
//   - `mentioned` is true and the semantic fields the detection did not measure
//     (`recommended`, `mentionPosition`, `sentiment`) stay explicit `null`;
//   - SUCCESS and PARTIAL parses assemble; a FAILED parse rejects because it
//     carries no evidence to attach;
//   - a cross-Project detection, an unusable/empty id, a mismatched id count,
//     and a duplicated primary-key id all reject atomically, naming the field
//     and index, and no partial batch escapes;
//   - the caller's order and every colliding match survive, each draft holding
//     its original match by identity for canonical-vs-alias traceability;
//   - nothing is mutated, cloned, serialized, normalized, or re-ordered, and
//     the module reaches no database, reader, matcher, recorder, or provider.

const PROJECT_ID = "proj_1";
const PARSE_ID = "parse_1";

const ASSEMBLER_SOURCE =
  "src/server/features/search-growth/geo/services/geoExactEntityMentionFactAssembler.ts";

function makeParse(
  overrides: Partial<GeoObservationParseFact> = {},
): GeoObservationParseFact {
  return {
    id: PARSE_ID,
    projectId: PROJECT_ID,
    runId: "run_1",
    parserVersion: "parser-v1",
    parseStatus: "SUCCESS",
    accuracyStatus: null,
    parsedAt: "2026-09-16T00:00:00.000Z",
    isCurrent: true,
    ...overrides,
  };
}

function makeMatch(
  overrides: Partial<GeoExactEntityMentionMatch> = {},
): GeoExactEntityMentionMatch {
  return {
    entityId: "ent_1",
    source: { kind: "CANONICAL_NAME" },
    start: 0,
    end: 4,
    evidence: "Acme",
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<GeoExactEntityMentionFactAssemblyInput> = {},
): GeoExactEntityMentionFactAssemblyInput {
  return {
    parse: makeParse(),
    projectId: PROJECT_ID,
    mentionIds: ["mention_1"],
    matches: [makeMatch()],
    ...overrides,
  };
}

/** A caller that does not respect the TypeScript contract, as at runtime. */
function makeUntrustedInput(
  overrides: Record<string, unknown>,
): GeoExactEntityMentionFactAssemblyInput {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted caller is exactly what this runtime boundary must reject
  return {
    ...makeInput(),
    ...overrides,
  } as unknown as GeoExactEntityMentionFactAssemblyInput;
}

/** Run the assembler and return the rejection it must have raised. */
function captureAssemblyError(
  run: () => unknown,
): GeoExactEntityMentionFactAssemblyError {
  try {
    run();
  } catch (error) {
    if (error instanceof GeoExactEntityMentionFactAssemblyError) return error;
    throw error;
  }
  throw new Error("expected the assembler to reject the input");
}

describe("assembleExactEntityMentionFacts", () => {
  it("assembles one fact per match, bound to the concrete parse and with explicit null semantics", () => {
    const matches = [
      makeMatch(),
      makeMatch({
        entityId: "ent_2",
        source: { kind: "ALIAS", aliasId: "alias_7" },
        start: 10,
        end: 16,
        evidence: "Globex",
      }),
    ];

    const drafts: GeoEntityMentionFactDraft[] = assembleExactEntityMentionFacts(
      makeInput({ mentionIds: ["mention_1", "mention_2"], matches }),
    );

    expect(drafts.map((draft) => draft.fact)).toEqual([
      {
        id: "mention_1",
        projectId: PROJECT_ID,
        parseId: PARSE_ID,
        entityId: "ent_1",
        mentioned: true,
        recommended: null,
        mentionPosition: null,
        sentiment: null,
        evidenceText: "Acme",
      },
      {
        id: "mention_2",
        projectId: PROJECT_ID,
        parseId: PARSE_ID,
        entityId: "ent_2",
        mentioned: true,
        recommended: null,
        mentionPosition: null,
        sentiment: null,
        evidenceText: "Globex",
      },
    ]);
  });

  it("assembles a PARTIAL parse, whose parser result may still carry evidence", () => {
    const parse = makeParse({
      parseStatus: "PARTIAL",
      accuracyStatus: "PARTIAL",
    });

    const drafts = assembleExactEntityMentionFacts(makeInput({ parse }));

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.fact.parseId).toBe(PARSE_ID);
    expect(drafts[0]?.fact.projectId).toBe(PROJECT_ID);
    expect(drafts[0]?.fact.mentioned).toBe(true);
    expect(drafts[0]?.fact.evidenceText).toBe("Acme");
  });

  it("returns no drafts when the detection matched nothing", () => {
    const drafts = assembleExactEntityMentionFacts(
      makeInput({ mentionIds: [], matches: [] }),
    );

    expect(drafts).toEqual([]);
  });

  it("preserves the caller's order and every colliding match", () => {
    // Out of text order, with two different candidates having matched the very
    // same span: neither is sorted, deduplicated, nor given a winner.
    const matches = [
      makeMatch({ entityId: "ent_1", start: 12, end: 16 }),
      makeMatch({ entityId: "ent_2", start: 0, end: 4 }),
      makeMatch({
        entityId: "ent_2",
        source: { kind: "ALIAS", aliasId: "alias_1" },
        start: 0,
        end: 4,
      }),
    ];

    const drafts = assembleExactEntityMentionFacts(
      makeInput({
        mentionIds: ["mention_1", "mention_2", "mention_3"],
        matches,
      }),
    );

    expect(
      drafts.map((draft) => [
        draft.fact.id,
        draft.fact.entityId,
        draft.match.start,
        draft.match.source.kind,
      ]),
    ).toEqual([
      ["mention_1", "ent_1", 12, "CANONICAL_NAME"],
      ["mention_2", "ent_2", 0, "CANONICAL_NAME"],
      ["mention_3", "ent_2", 0, "ALIAS"],
    ]);
  });

  it("keeps each draft traceable to its original match, source basis, and span", () => {
    const matches = [
      makeMatch({
        entityId: "ent_2",
        source: { kind: "ALIAS", aliasId: "alias_7" },
        start: 5,
        end: 11,
        evidence: "Globex",
      }),
    ];

    const drafts = assembleExactEntityMentionFacts(makeInput({ matches }));

    expect(drafts[0]?.match).toBe(matches[0]);
    expect(drafts[0]?.match.source).toBe(matches[0]?.source);
    expect([drafts[0]?.match.start, drafts[0]?.match.end]).toEqual([5, 11]);
    expect(drafts[0]?.fact.entityId).toBe("ent_2");
    expect(drafts[0]?.fact.evidenceText).toBe(matches[0]?.evidence);
  });

  it("carries opaque evidence by identity, byte-for-byte", () => {
    const evidence = '{"answer":"Ａcme <b>#1</b>\\n\\t","note":"  😀  "}  ';

    const drafts = assembleExactEntityMentionFacts(
      makeInput({ matches: [makeMatch({ evidence })] }),
    );

    expect(drafts[0]?.fact.evidenceText).toBe(evidence);
    expect(drafts[0]?.fact.evidenceText).toHaveLength(evidence.length);
  });

  it("holds the caller's own match objects while mutating and serializing nothing", () => {
    const matches = [makeMatch(), makeMatch({ entityId: "ent_2", start: 8 })];
    const input = makeInput({
      mentionIds: ["mention_1", "mention_2"],
      matches,
    });
    const before = structuredClone(input);
    const stringify = vi.spyOn(JSON, "stringify");

    const drafts = assembleExactEntityMentionFacts(input);

    expect(drafts[0]?.match).toBe(matches[0]);
    expect(drafts[1]?.match).toBe(matches[1]);
    expect(stringify).not.toHaveBeenCalled();
    expect(input).toEqual(before);
  });
});

describe("assembleExactEntityMentionFacts rejections", () => {
  it("rejects a detection run for another Project", () => {
    const error = captureAssemblyError(() =>
      assembleExactEntityMentionFacts(makeInput({ projectId: "proj_other" })),
    );

    expect(error.field).toBe("projectId");
    expect(error.mentionIndex).toBeNull();
    expect(error.message).toContain("proj_other");
    expect(error.message).toContain(PROJECT_ID);
  });

  it("rejects a parse fact without a usable id", () => {
    const error = captureAssemblyError(() =>
      assembleExactEntityMentionFacts(
        makeInput({ parse: makeParse({ id: "" }) }),
      ),
    );

    expect(error.field).toBe("parse.id");
  });

  it("rejects an empty mention id at the offending index", () => {
    const error = captureAssemblyError(() =>
      assembleExactEntityMentionFacts(
        makeInput({
          mentionIds: ["mention_1", ""],
          matches: [makeMatch(), makeMatch({ entityId: "ent_2" })],
        }),
      ),
    );

    expect(error.field).toBe("mentionIds[1]");
    expect(error.mentionIndex).toBe(1);
  });

  it("rejects a non-string mention id from an untrusted caller", () => {
    const error = captureAssemblyError(() =>
      assembleExactEntityMentionFacts(makeUntrustedInput({ mentionIds: [42] })),
    );

    expect(error.field).toBe("mentionIds[0]");
    expect(error.mentionIndex).toBe(0);
  });

  it("rejects a mention-id list that does not align one-for-one with the matches", () => {
    const tooFew = captureAssemblyError(() =>
      assembleExactEntityMentionFacts(
        makeInput({
          mentionIds: ["mention_1"],
          matches: [makeMatch(), makeMatch({ entityId: "ent_2" })],
        }),
      ),
    );
    const tooMany = captureAssemblyError(() =>
      assembleExactEntityMentionFacts(
        makeInput({
          mentionIds: ["mention_1", "mention_2"],
          matches: [makeMatch()],
        }),
      ),
    );

    expect(tooFew.field).toBe("mentionIds");
    expect(tooFew.message).toContain("but there are 2 matches");
    expect(tooMany.field).toBe("mentionIds");
    expect(tooMany.message).toContain("but there are 1 matches");
  });

  it("rejects a mention id reused within the batch, naming the later index", () => {
    const error = captureAssemblyError(() =>
      assembleExactEntityMentionFacts(
        makeInput({
          mentionIds: ["mention_1", "mention_2", "mention_1"],
          matches: [
            makeMatch(),
            makeMatch({ entityId: "ent_2" }),
            makeMatch({ entityId: "ent_3" }),
          ],
        }),
      ),
    );

    expect(error.field).toBe("mentionIds[2]");
    expect(error.mentionIndex).toBe(2);
    expect(error.message).toContain("mention_1");
  });

  it("rejects a FAILED parse, which has no evidence to attach", () => {
    const error = captureAssemblyError(() =>
      assembleExactEntityMentionFacts(
        makeInput({ parse: makeParse({ parseStatus: "FAILED" }) }),
      ),
    );

    expect(error.field).toBe("parse.parseStatus");
    expect(error.mentionIndex).toBeNull();
    expect(error.message).toContain("FAILED");
  });

  it("rejects an untrusted caller whose match list is not a list", () => {
    const error = captureAssemblyError(() =>
      assembleExactEntityMentionFacts(makeUntrustedInput({ matches: "Acme" })),
    );

    expect(error.field).toBe("matches");
  });

  it("rejects a non-input at the call boundary", () => {
    const error = captureAssemblyError(() =>
      assembleExactEntityMentionFacts(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted caller can hand the assembler anything
        null as unknown as GeoExactEntityMentionFactAssemblyInput,
      ),
    );

    expect(error.field).toBe("input");
  });
});

describe("exact entity-mention fact assembler source boundary", () => {
  const source = readFileSync(ASSEMBLER_SOURCE, "utf8");
  // Comments are stripped for the call-shape assertions, so documentation that
  // names an API cannot be mistaken for an invocation of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const importLines = (
    source.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? []
  ).join("\n");

  it("depends only on the accepted parse/mention contracts and Zod", () => {
    expect(importLines).toContain('"./geoObservationParseRecorder"');
    expect(importLines).toContain('"./geoEntityMentionRecorder"');
    expect(importLines).toContain('"./geoExactEntityMentionMatcher"');
    expect(importLines).toContain('"zod"');
    expect(importLines).not.toMatch(
      /@\/db|drizzle|Repository|node:fs|process\.env/,
    );
    expect(source).not.toMatch(
      /fetch\(|process\.env|node:fs|JSON\.stringify|console\./,
    );
  });

  it("calls no reader, matcher, recorder, or provider", () => {
    expect(code).not.toMatch(
      /listCandidates\(|matchExactEntityMentions\(|detectExactEntityMentions\(|\.record\(/,
    );
  });

  it("reorders, rewrites, and de-duplicates nothing on its own", () => {
    expect(code).not.toMatch(
      /\.sort\(|\.toSorted\(|\.reverse\(|\.filter\(|\.reduce\(|new Set\(|toLowerCase|toUpperCase|\.trim\(|\.normalize\(/,
    );
  });

  it("swallows no failure", () => {
    expect(code).not.toMatch(/\btry\b|\bcatch\b/);
  });
});
