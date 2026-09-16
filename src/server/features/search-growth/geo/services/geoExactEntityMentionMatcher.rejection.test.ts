import { describe, expect, it } from "vitest";
import {
  GeoExactEntityMentionInputError,
  matchExactEntityMentions,
  type GeoExactEntityMentionMatchInput,
} from "./geoExactEntityMentionMatcher";
import {
  captureInputError,
  invalidCandidateList,
  makeCandidate,
  makeInput,
  makeInvalidCandidate,
  makeInvalidInput,
} from "./geoExactEntityMentionMatcher-test-fixtures";

// The runtime-input contract of the exact entity-mention matcher
// (07_GEO_MEASUREMENT_SPEC.md §5): an unusable call is rejected before any
// result exists, naming the offending candidate index and field, rather than
// silently skipping, substituting, or repairing that candidate. The literal
// matching contract has its own spec (./geoExactEntityMentionMatcher.test.ts).

describe("matchExactEntityMentions rejections", () => {
  const rejectionCases: ReadonlyArray<{
    label: string;
    field: string;
    candidateIndex: number | null;
    build: () => GeoExactEntityMentionMatchInput;
  }> = [
    {
      label: "an absent text",
      field: "text",
      candidateIndex: null,
      build: () => makeInvalidInput({ text: undefined }),
    },
    {
      label: "a non-string text",
      field: "text",
      candidateIndex: null,
      build: () => makeInvalidInput({ text: 42 }),
    },
    {
      label: "an empty projectId",
      field: "projectId",
      candidateIndex: null,
      build: () => makeInvalidInput({ projectId: "" }),
    },
    {
      label: "a non-string projectId",
      field: "projectId",
      candidateIndex: null,
      build: () => makeInvalidInput({ projectId: 7 }),
    },
    {
      label: "an absent candidate list",
      field: "candidates",
      candidateIndex: null,
      build: () => makeInvalidInput({ candidates: undefined }),
    },
    {
      label: "a non-array candidate list",
      field: "candidates",
      candidateIndex: null,
      build: () => makeInvalidInput({ candidates: "Acme" }),
    },
    {
      label: "a non-object candidate",
      field: "candidates[0]",
      candidateIndex: 0,
      build: () => makeInvalidInput({ candidates: [null] }),
    },
    {
      label: "an empty candidate projectId",
      field: "candidates[0].projectId",
      candidateIndex: 0,
      build: () => invalidCandidateList({ projectId: "" }),
    },
    {
      label: "a non-string candidate projectId",
      field: "candidates[0].projectId",
      candidateIndex: 0,
      build: () => invalidCandidateList({ projectId: 7 }),
    },
    {
      label: "an empty entityId",
      field: "candidates[0].entityId",
      candidateIndex: 0,
      build: () => invalidCandidateList({ entityId: "" }),
    },
    {
      label: "a non-string entityId",
      field: "candidates[0].entityId",
      candidateIndex: 0,
      build: () => invalidCandidateList({ entityId: null }),
    },
    {
      label: "an empty surface",
      field: "candidates[0].surface",
      candidateIndex: 0,
      build: () => invalidCandidateList({ surface: "" }),
    },
    {
      label: "a non-string surface",
      field: "candidates[0].surface",
      candidateIndex: 0,
      build: () => invalidCandidateList({ surface: 42 }),
    },
    {
      label: "an absent source identity",
      field: "candidates[0].source",
      candidateIndex: 0,
      build: () => invalidCandidateList({ source: undefined }),
    },
    {
      label: "an unknown source kind",
      field: "candidates[0].source.kind",
      candidateIndex: 0,
      build: () => invalidCandidateList({ source: { kind: "FUZZY" } }),
    },
    {
      label: "an alias source without an aliasId",
      field: "candidates[0].source.aliasId",
      candidateIndex: 0,
      build: () => invalidCandidateList({ source: { kind: "ALIAS" } }),
    },
    {
      label: "an empty aliasId",
      field: "candidates[0].source.aliasId",
      candidateIndex: 0,
      build: () =>
        invalidCandidateList({ source: { kind: "ALIAS", aliasId: "" } }),
    },
    {
      label: "a non-string aliasId",
      field: "candidates[0].source.aliasId",
      candidateIndex: 0,
      build: () =>
        invalidCandidateList({ source: { kind: "ALIAS", aliasId: 7 } }),
    },
  ];

  it.each(rejectionCases)(
    "rejects $label, naming $field",
    ({ field, candidateIndex, build }) => {
      const error = captureInputError(() => matchExactEntityMentions(build()));

      expect(error).toBeInstanceOf(GeoExactEntityMentionInputError);
      expect(error.field).toBe(field);
      expect(error.candidateIndex).toBe(candidateIndex);
      expect(error.message).toContain(field);
    },
  );

  it("rejects the offending candidate by index instead of returning the valid ones", () => {
    const error = captureInputError(() =>
      matchExactEntityMentions(
        makeInput({
          text: "Acme",
          candidates: [makeCandidate(), makeInvalidCandidate({ surface: "" })],
        }),
      ),
    );

    expect(error.field).toBe("candidates[1].surface");
    expect(error.candidateIndex).toBe(1);
    expect(error.message).toBe(
      "GEO exact entity mention matcher: candidates[1].surface must be a non-empty string.",
    );
  });

  it("rejects a candidate that belongs to another project", () => {
    const error = captureInputError(() =>
      matchExactEntityMentions(
        makeInput({
          text: "Acme Beta",
          candidates: [makeCandidate(), makeCandidate({ projectId: "proj_2" })],
        }),
      ),
    );

    expect(error.field).toBe("candidates[1].projectId");
    expect(error.candidateIndex).toBe(1);
    expect(error.message).toBe(
      'GEO exact entity mention matcher: candidates[1].projectId belongs to project "proj_2", but the supplied projectId is "proj_1".',
    );
  });

  it("names the source kind it accepts", () => {
    const error = captureInputError(() =>
      matchExactEntityMentions(
        invalidCandidateList({ source: { kind: "FUZZY" } }),
      ),
    );

    expect(error.field).toBe("candidates[0].source.kind");
    expect(error.message).toBe(
      'GEO exact entity mention matcher: candidates[0].source.kind must be "CANONICAL_NAME" or "ALIAS".',
    );
  });
});
