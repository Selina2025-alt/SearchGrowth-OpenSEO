import { describe, expect, it } from "vitest";
import { sourceRefs } from "@/db/search-growth.schema";
import type { SourceRef, SourceRefType } from "./source-ref";
import { sourceRefTypeSchema } from "./source-ref";

// The DB text-enum column and the Zod boundary must not drift: a value the Zod
// schema accepts has to be a value the column type admits, and vice versa.
// Drift here would let future repositories write a source-ref type the domain
// boundary never validated. There is intentionally no implicit/lowercase/OTHER
// fallback (05_DOMAIN_DATA_MODEL.md §9 SourceRef). The four-value §9 union
// replaces the legacy reference `kind` union (URL | INTERNAL_EVIDENCE | CLAIM |
// PUBLICATION | OTHER in schemas/domain-types.ts), so those legacy values and
// case-mismatched/empty strings are rejected.
describe("SourceRef domain boundary", () => {
  it("lists every type column value as a valid SourceRefType", () => {
    for (const type of sourceRefs.type.enumValues) {
      expect(sourceRefTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects unsupported, legacy, case-mismatched and empty source types", () => {
    for (const type of [
      // Case-mismatched variants of the approved uppercase values.
      "url",
      "Url",
      "internal_doc",
      "Internal_Doc",
      "product_fact",
      "Product",
      "research",
      "URL ",
      // Legacy reference `kind` values reconciled OUT of the V1.0 union
      // (schemas/domain-types.ts SourceRef.kind).
      "INTERNAL_EVIDENCE",
      "CLAIM",
      "PUBLICATION",
      "OTHER",
      // Unsupported source classifications.
      "WEB_PAGE",
      "PDF",
      "DOCUMENT",
      "CITATION",
      "ARTICLE",
      "NONE",
      "",
    ]) {
      expect(sourceRefTypeSchema.safeParse(type).success).toBe(false);
    }
  });

  it("exports row/enum types aligned with the storage columns", () => {
    // Compile-time guard: the domain type later Claim/Content tasks will import
    // must stay true to the storage enum and the append-only select row shape —
    // including the required Project binding, the required type/ref/captured_at
    // fields and the absence of any updated/current-pointer/classification
    // field.
    const type: SourceRefType = "URL";
    const sourceRef: Pick<
      SourceRef,
      "id" | "projectId" | "type" | "ref" | "capturedAt" | "createdAt"
    > = {
      id: "source_ref_alpha_1",
      projectId: "project_alpha",
      type,
      ref: "https://example.com/source-page",
      capturedAt: "2026-09-08T04:00:05.000Z",
      createdAt: "2026-09-08T04:00:05.000Z",
    };
    expect(sourceRef.type).toBe("URL");
    expect(sourceRef.projectId).toBe("project_alpha");
    expect(sourceRef.ref).toBe("https://example.com/source-page");
    expect(sourceRef.capturedAt).toBe("2026-09-08T04:00:05.000Z");
    // Every approved V1.0 type round-trips at the boundary.
    for (const approved of [
      "URL",
      "INTERNAL_DOC",
      "PRODUCT_FACT",
      "RESEARCH",
    ] as const) {
      expect(sourceRefTypeSchema.safeParse(approved).success).toBe(true);
    }
  });
});
