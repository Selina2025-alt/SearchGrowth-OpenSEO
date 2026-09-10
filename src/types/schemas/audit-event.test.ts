import { describe, expect, it } from "vitest";
import type { AuditEvent } from "./audit-event";
import { auditEventSchema } from "./audit-event";

// The AuditEvent domain boundary must carry the direct fields of the
// append-only Project-scoped audit row verbatim: actor, action, object type/id,
// correlation id and the optional before/after references are opaque audit data
// (never foreign keys or enums), and the metadata document is carried as its
// validated JSON text. The row exposes the append-only `createdAt` only — no
// `updatedAt` and no runtime-control/execution/publishing state.
const VALID_EVENT = {
  id: "event_alpha_1",
  projectId: "proj_alpha",
  actorId: "actor_1",
  action: "RELEASE_APPROVED",
  objectType: "ReleaseBundle",
  objectId: "bundle_1",
  beforeRef: "bundle_hash_before",
  afterRef: "bundle_hash_after",
  metadataJson: '{"channel":"website","releaseVersion":1}',
  correlationId: "corr_1",
  createdAt: "2026-09-10T05:00:00.000Z",
} as const;

describe("AuditEvent domain boundary", () => {
  it("accepts the full direct contract and preserves every field verbatim", () => {
    const parsed = auditEventSchema.parse(VALID_EVENT);
    expect(parsed).toEqual(VALID_EVENT);
    // The opaque metadata document is carried as the exact string, never parsed
    // or decomposed into relational ids by the boundary.
    expect(parsed.metadataJson).toBe(
      '{"channel":"website","releaseVersion":1}',
    );
    expect(parsed.objectId).toBe("bundle_1");
  });

  it("accepts a minimal event whose optional before/after references are NULL", () => {
    const parsed = auditEventSchema.parse({
      ...VALID_EVENT,
      beforeRef: null,
      afterRef: null,
    });
    expect(parsed.beforeRef).toBeNull();
    expect(parsed.afterRef).toBeNull();
  });

  it("rejects a row missing any direct field", () => {
    for (const field of Object.keys(VALID_EVENT)) {
      const rest: Record<string, unknown> = { ...VALID_EVENT };
      delete rest[field];
      expect(auditEventSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("rejects a non-string metadata document and non-string opaque values", () => {
    expect(
      auditEventSchema.safeParse({ ...VALID_EVENT, metadataJson: { a: 1 } })
        .success,
    ).toBe(false);
    expect(
      auditEventSchema.safeParse({ ...VALID_EVENT, actorId: 42 }).success,
    ).toBe(false);
    expect(
      auditEventSchema.safeParse({ ...VALID_EVENT, beforeRef: 7 }).success,
    ).toBe(false);
  });

  it("exports a row type matching the direct storage shape only", () => {
    // Compile-time guard: the domain type later audit-writing tasks import
    // carries the direct fields plus the append-only createdAt, and no
    // updatedAt / runtime-control / execution / publishing field.
    const event: AuditEvent = { ...VALID_EVENT };
    expect(event.action).toBe("RELEASE_APPROVED");
    expect(event.projectId).toBe("proj_alpha");
    expect("updatedAt" in event).toBe(false);
    expect("runtimeControlKey" in event).toBe(false);
    expect("executionId" in event).toBe(false);
  });
});
