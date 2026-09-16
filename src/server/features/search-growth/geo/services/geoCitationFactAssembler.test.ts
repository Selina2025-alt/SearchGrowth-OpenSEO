import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { GeoObservationParseFact } from "./geoObservationParseRecorder";
import {
  assembleCitationFacts,
  GeoCitationFactAssemblyError,
  type GeoCitationEvidenceCandidate,
  type GeoCitationFactAssemblyInput,
  type GeoCitationFactDraft,
} from "./geoCitationFactAssembler";

// Invariants under test (ADR-005, 05_DOMAIN_DATA_MODEL.md §7,
// 07_GEO_MEASUREMENT_SPEC.md §§5–6 and §8):
//   - one draft per candidate, in the caller's order, bound to the concrete
//     parse fact's `projectId` and `parseId`, with the caller's citation id at
//     the same index and every citation leaf verbatim from that candidate;
//   - SUCCESS and PARTIAL parses assemble; a FAILED parse rejects because it
//     carries no evidence to attach;
//   - a cross-Project extraction, an unusable/empty id, a mismatched id count,
//     a duplicated primary-key id, and an invalid ownership/position/URL leaf
//     all reject atomically, naming the field and index, and no partial batch
//     escapes;
//   - the caller's order and every colliding citation survive, each draft
//     holding its original candidate by identity as provenance;
//   - opaque URL/domain/ownership evidence is never normalized, classified,
//     matched, rewritten, or re-ordered, and nothing is mutated or serialized;
//   - the module reaches no database, repository, recorder, reader, extractor,
//     or provider, and reads no raw observation/response text.

const PROJECT_ID = "proj_1";
const PARSE_ID = "parse_1";

const ASSEMBLER_SOURCE =
  "src/server/features/search-growth/geo/services/geoCitationFactAssembler.ts";

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

function makeCandidate(
  overrides: Partial<GeoCitationEvidenceCandidate> = {},
): GeoCitationEvidenceCandidate {
  return {
    rawUrl: "https://example.com/post?utm_source=chatgpt#section",
    normalizedUrl: "https://example.com/post",
    domain: "example.com",
    title: null,
    position: null,
    sourceOwnership: "UNKNOWN",
    matchedPublicationReceiptId: null,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<GeoCitationFactAssemblyInput> = {},
): GeoCitationFactAssemblyInput {
  return {
    parse: makeParse(),
    projectId: PROJECT_ID,
    citationIds: ["cite_1"],
    candidates: [makeCandidate()],
    ...overrides,
  };
}

/** A caller that does not respect the TypeScript contract, as at runtime. */
function makeUntrustedInput(
  overrides: Record<string, unknown>,
): GeoCitationFactAssemblyInput {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted caller is exactly what this runtime boundary must reject
  return {
    ...makeInput(),
    ...overrides,
  } as unknown as GeoCitationFactAssemblyInput;
}

/** A caller-supplied candidate whose leaf values do not respect the contract. */
function makeUntrustedCandidate(
  overrides: Record<string, unknown>,
): GeoCitationEvidenceCandidate {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- untrusted evidence is exactly what this runtime boundary must reject
  return {
    ...makeCandidate(),
    ...overrides,
  } as unknown as GeoCitationEvidenceCandidate;
}

/** Run the assembler and return the rejection it must have raised. */
function captureAssemblyError(
  run: () => unknown,
): GeoCitationFactAssemblyError {
  try {
    run();
  } catch (error) {
    if (error instanceof GeoCitationFactAssemblyError) return error;
    throw error;
  }
  throw new Error("expected the assembler to reject the input");
}

/**
 * Assert the assembler rejects `input` with that field and index, and return
 * the error. A call that returns normally fails the test, which is the
 * atomicity evidence: a rejected batch yields no drafts to inspect.
 */
function rejectWith(
  input: GeoCitationFactAssemblyInput,
  field: string,
  citationIndex: number | null,
): GeoCitationFactAssemblyError {
  const error = captureAssemblyError(() => assembleCitationFacts(input));
  expect(error.field).toBe(field);
  expect(error.citationIndex).toBe(citationIndex);
  return error;
}

describe("assembleCitationFacts", () => {
  it("assembles one fact per candidate, in the caller's order, under the same Project as the parse", () => {
    const candidates = [
      makeCandidate(),
      makeCandidate({
        rawUrl: "https://news.example.org/a?id=2",
        normalizedUrl: "https://news.example.org/a",
        domain: "news.example.org",
        sourceOwnership: "EARNED_THIRD_PARTY",
      }),
    ];

    const drafts: GeoCitationFactDraft[] = assembleCitationFacts(
      makeInput({ citationIds: ["cite_1", "cite_2"], candidates }),
    );

    expect(drafts.map((draft) => draft.fact)).toEqual([
      {
        id: "cite_1",
        projectId: PROJECT_ID,
        parseId: PARSE_ID,
        rawUrl: "https://example.com/post?utm_source=chatgpt#section",
        normalizedUrl: "https://example.com/post",
        domain: "example.com",
        title: null,
        position: null,
        sourceOwnership: "UNKNOWN",
        matchedPublicationReceiptId: null,
      },
      {
        id: "cite_2",
        projectId: PROJECT_ID,
        parseId: PARSE_ID,
        rawUrl: "https://news.example.org/a?id=2",
        normalizedUrl: "https://news.example.org/a",
        domain: "news.example.org",
        title: null,
        position: null,
        sourceOwnership: "EARNED_THIRD_PARTY",
        matchedPublicationReceiptId: null,
      },
    ]);
    expect(drafts[0]?.candidate).toBe(candidates[0]);
    expect(drafts[1]?.candidate).toBe(candidates[1]);
  });

  it("carries a real title, position 0, and a matched receipt id verbatim", () => {
    const candidate = makeCandidate({
      title: "  How AI cites sources  ",
      position: 0,
      sourceOwnership: "OWNED_DOMAIN",
      matchedPublicationReceiptId: "receipt_9",
    });

    const drafts = assembleCitationFacts(
      makeInput({ candidates: [candidate] }),
    );

    expect(drafts[0]?.fact.title).toBe("  How AI cites sources  ");
    expect(drafts[0]?.fact.position).toBe(0);
    expect(drafts[0]?.fact.sourceOwnership).toBe("OWNED_DOMAIN");
    expect(drafts[0]?.fact.matchedPublicationReceiptId).toBe("receipt_9");
  });

  it("keeps the optional leaves explicit null when nothing was recorded", () => {
    const drafts = assembleCitationFacts(makeInput());

    expect(drafts[0]?.fact.title).toBeNull();
    expect(drafts[0]?.fact.position).toBeNull();
    expect(drafts[0]?.fact.matchedPublicationReceiptId).toBeNull();
  });

  it("returns no drafts when there is no citation evidence", () => {
    const drafts = assembleCitationFacts(
      makeInput({ citationIds: [], candidates: [] }),
    );

    expect(drafts).toEqual([]);
  });

  it("assembles a PARTIAL parse, whose parser result may still carry citations", () => {
    const parse = makeParse({
      parseStatus: "PARTIAL",
      accuracyStatus: "PARTIAL",
    });

    const drafts = assembleCitationFacts(makeInput({ parse }));

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.fact.projectId).toBe(PROJECT_ID);
    expect(drafts[0]?.fact.parseId).toBe(PARSE_ID);
    expect(drafts[0]?.fact.rawUrl).toBe(makeCandidate().rawUrl);
  });

  it("preserves the caller's order and every colliding citation", () => {
    // Two candidates citing the very same URL: neither is deduplicated, sorted,
    // nor given a winner, and the caller's positions are untouched.
    const candidates = [
      makeCandidate({
        rawUrl: "https://b.example.com/x",
        domain: "b.example.com",
      }),
      makeCandidate({ rawUrl: "https://a.example.com/x" }),
      makeCandidate({
        rawUrl: "https://a.example.com/x",
        title: "second citation of the same URL",
      }),
    ];

    const drafts = assembleCitationFacts(
      makeInput({
        citationIds: ["cite_1", "cite_2", "cite_3"],
        candidates,
      }),
    );

    expect(
      drafts.map((draft) => [
        draft.fact.id,
        draft.fact.domain,
        draft.fact.rawUrl,
      ]),
    ).toEqual([
      ["cite_1", "b.example.com", "https://b.example.com/x"],
      ["cite_2", "example.com", "https://a.example.com/x"],
      ["cite_3", "example.com", "https://a.example.com/x"],
    ]);
  });

  it("carries opaque URL evidence byte-for-byte without normalizing or rewriting it", () => {
    // Deliberately un-normalized: mixed case, default port, trailing slash,
    // query, fragment, IDN host, astral characters, surrounding whitespace.
    // The assembler is not the §8 normalizer, so every byte must survive.
    const rawUrl =
      "  HTTPS://Exämple.COM:443/Path/?utm_source=ChatGPT&q=😀#Frag  ";
    const normalizedUrl = "Not-A-URL-At-All";
    const domain = "Exämple.COM";

    const drafts = assembleCitationFacts(
      makeInput({
        candidates: [makeCandidate({ rawUrl, normalizedUrl, domain })],
      }),
    );

    expect(drafts[0]?.fact.rawUrl).toBe(rawUrl);
    expect(drafts[0]?.fact.normalizedUrl).toBe(normalizedUrl);
    expect(drafts[0]?.fact.domain).toBe(domain);
  });

  it("holds the caller's own candidate objects while mutating and serializing nothing", () => {
    const candidates = [makeCandidate(), makeCandidate()];
    const input = makeInput({
      citationIds: ["cite_1", "cite_2"],
      candidates,
    });
    const before = structuredClone(input);
    const stringify = vi.spyOn(JSON, "stringify");

    const drafts = assembleCitationFacts(input);

    expect(drafts[0]?.candidate).toBe(candidates[0]);
    expect(drafts[1]?.candidate).toBe(candidates[1]);
    expect(stringify).not.toHaveBeenCalled();
    expect(input).toEqual(before);
  });
});

describe("assembleCitationFacts rejections", () => {
  it("rejects citation evidence extracted for another Project", () => {
    const error = rejectWith(
      makeInput({ projectId: "proj_other" }),
      "projectId",
      null,
    );

    expect(error.message).toContain("proj_other");
    expect(error.message).toContain(PROJECT_ID);
  });

  it("rejects a parse fact without a usable id", () => {
    rejectWith(makeInput({ parse: makeParse({ id: "" }) }), "parse.id", null);
  });

  it("rejects an empty or non-string citation id at the offending index", () => {
    rejectWith(
      makeInput({
        citationIds: ["cite_1", ""],
        candidates: [makeCandidate(), makeCandidate()],
      }),
      "citationIds[1]",
      1,
    );
    rejectWith(makeUntrustedInput({ citationIds: [42] }), "citationIds[0]", 0);
  });

  it("rejects a citation-id list that does not align one-for-one with the candidates", () => {
    const tooFew = rejectWith(
      makeInput({
        citationIds: ["cite_1"],
        candidates: [makeCandidate(), makeCandidate()],
      }),
      "citationIds",
      null,
    );
    const tooMany = rejectWith(
      makeInput({
        citationIds: ["cite_1", "cite_2"],
        candidates: [makeCandidate()],
      }),
      "citationIds",
      null,
    );

    expect(tooFew.message).toContain("but there are 2 candidates");
    expect(tooMany.message).toContain("but there are 1 candidates");
  });

  it("rejects a citation id reused within the batch, naming the later index", () => {
    const error = rejectWith(
      makeInput({
        citationIds: ["cite_1", "cite_2", "cite_1"],
        candidates: [makeCandidate(), makeCandidate(), makeCandidate()],
      }),
      "citationIds[2]",
      2,
    );

    expect(error.message).toContain("cite_1");
  });

  it("rejects a FAILED parse, which has no evidence to attach", () => {
    const error = rejectWith(
      makeInput({ parse: makeParse({ parseStatus: "FAILED" }) }),
      "parse.parseStatus",
      null,
    );

    expect(error.message).toContain("FAILED");
  });

  it("rejects a candidate that breaks the recordable leaf contract, naming the field", () => {
    const cases: [GeoCitationEvidenceCandidate, string][] = [
      [makeUntrustedCandidate({ rawUrl: 42 }), "candidates[0].rawUrl"],
      [
        makeUntrustedCandidate({ normalizedUrl: "" }),
        "candidates[0].normalizedUrl",
      ],
      [makeUntrustedCandidate({ domain: "" }), "candidates[0].domain"],
      [makeUntrustedCandidate({ title: 7 }), "candidates[0].title"],
      [makeUntrustedCandidate({ title: undefined }), "candidates[0].title"],
      [
        makeUntrustedCandidate({ matchedPublicationReceiptId: "" }),
        "candidates[0].matchedPublicationReceiptId",
      ],
      [
        makeUntrustedCandidate({ matchedPublicationReceiptId: undefined }),
        "candidates[0].matchedPublicationReceiptId",
      ],
    ];

    for (const [candidate, field] of cases) {
      rejectWith(makeInput({ candidates: [candidate] }), field, 0);
    }
  });

  it("rejects an ownership value outside the accepted classification set", () => {
    for (const sourceOwnership of ["PARTNER", "owned_domain", "", null, 1]) {
      rejectWith(
        makeInput({
          candidates: [makeUntrustedCandidate({ sourceOwnership })],
        }),
        "candidates[0].sourceOwnership",
        0,
      );
    }
  });

  it("rejects a negative or fractional position instead of clamping or rounding it", () => {
    for (const position of [-1, 1.5]) {
      rejectWith(
        makeInput({ candidates: [makeCandidate({ position })] }),
        "candidates[0].position",
        0,
      );
    }
  });

  it("rejects the whole batch when a later candidate is invalid, returning no partial drafts", () => {
    // The call throws, so there is no drafts array at all: the first, valid
    // candidate is not handed back alongside a rejected second one.
    rejectWith(
      makeInput({
        citationIds: ["cite_1", "cite_2"],
        candidates: [makeCandidate(), makeUntrustedCandidate({ rawUrl: "" })],
      }),
      "candidates[1].rawUrl",
      1,
    );
  });

  it("rejects an untrusted caller whose candidate container is not usable", () => {
    rejectWith(
      makeUntrustedInput({ candidates: "https://x" }),
      "candidates",
      null,
    );
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted caller can hand the assembler anything
    rejectWith(null as unknown as GeoCitationFactAssemblyInput, "input", null);
  });
});

describe("citation fact assembler source boundary", () => {
  const source = readFileSync(ASSEMBLER_SOURCE, "utf8");
  // Comments are stripped for the call-shape assertions, so documentation that
  // names an API cannot be mistaken for an invocation of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const importLines = (
    source.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? []
  ).join("\n");

  it("depends only on the accepted citation/parse contracts and Zod", () => {
    expect(importLines).toContain('"./geoCitationRecorder"');
    expect(importLines).toContain('"./geoObservationParseRecorder"');
    expect(importLines).toContain('"@/types/schemas/geo-citation"');
    expect(importLines).toContain('"zod"');
    expect(importLines).not.toMatch(
      /@\/db|drizzle|Repository|node:fs|process\.env/,
    );
    expect(source).not.toMatch(
      /fetch\(|process\.env|node:fs|JSON\.stringify|console\./,
    );
  });

  it("reaches no repository, recorder, reader, extractor, provider, or raw observation", () => {
    expect(code).not.toMatch(
      /\.record\(|listCandidates\(|extractCitations\(|detectExactEntityMentions\(|matchExactEntityMentions\(|readFileSync\(|\.query\(|\.insert\(/,
    );
    expect(code).not.toMatch(
      /rawObservation|rawResponse|geoObservationRun|promptRun|providerResponse/i,
    );
  });

  it("normalizes no URL/domain, classifies no ownership, and matches no receipt", () => {
    expect(code).not.toMatch(
      /new URL\(|URL\.parse|\.normalize\(|toLowerCase|toUpperCase|\.trim\(|punycode|decodeURI|encodeURI/,
    );
    expect(code).not.toMatch(
      /OWNED_DOMAIN|CONTROLLED_PUBLICATION|EARNED_THIRD_PARTY|COMPETITOR|sourceOwnership\s*===|matchedPublicationReceiptId\s*===/,
    );
  });

  it("reorders, rewrites, and de-duplicates nothing, and swallows no failure", () => {
    expect(code).not.toMatch(
      /\.sort\(|\.toSorted\(|\.reverse\(|\.filter\(|\.reduce\(|new Set\(/,
    );
    expect(code).not.toMatch(/\btry\b|\bcatch\b/);
  });
});
