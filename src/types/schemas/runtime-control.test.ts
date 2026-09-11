import { describe, expect, it } from "vitest";
import type { RuntimeControl } from "./runtime-control";
import {
  runtimeControlSchema,
  runtimeControlValueJsonSchema,
} from "./runtime-control";

// The RuntimeControl domain boundary carries the direct source fields: the
// non-empty opaque `key`, the typed boolean|number|string `value`, the optional
// 1000-char `reason`, the opaque `updatedBy` and the mutable `updatedAt`. The
// stored `value_json` serialization is a separate concern exercised through the
// value codec; the row has no Project ownership, append-only guard, CAS/version
// or control-evaluation field (TASK items 1–3).
const VALID_CONTROL = {
  key: "global_publishing_pause",
  value: true,
  reason: "incident 2026-09-10",
  updatedBy: "operator_1",
  updatedAt: "2026-09-10T05:00:00.000Z",
};

describe("RuntimeControl domain boundary", () => {
  it("accepts and returns the source typed value union", () => {
    for (const value of [true, false, 42, 1.5, "platform_pause"] as const) {
      expect(
        runtimeControlSchema.parse({ ...VALID_CONTROL, value }).value,
      ).toBe(value);
    }
  });

  it("rejects values outside the source union", () => {
    for (const value of [null, [], {}, { on: true }]) {
      expect(
        runtimeControlSchema.safeParse({ ...VALID_CONTROL, value }).success,
      ).toBe(false);
    }
  });

  it("requires a non-empty, string stable key", () => {
    expect(
      runtimeControlSchema.safeParse({ ...VALID_CONTROL, key: "" }).success,
    ).toBe(false);
    expect(
      runtimeControlSchema.safeParse({ ...VALID_CONTROL, key: 7 }).success,
    ).toBe(false);
  });

  it("keeps the source optional reason with its 1000-char bound", () => {
    expect(
      runtimeControlSchema.parse({ ...VALID_CONTROL, reason: undefined })
        .reason,
    ).toBeUndefined();
    expect(
      runtimeControlSchema.safeParse({
        ...VALID_CONTROL,
        reason: "x".repeat(1000),
      }).success,
    ).toBe(true);
    expect(
      runtimeControlSchema.safeParse({
        ...VALID_CONTROL,
        reason: "x".repeat(1001),
      }).success,
    ).toBe(false);
    expect(
      runtimeControlSchema.safeParse({ ...VALID_CONTROL, reason: null })
        .success,
    ).toBe(false);
  });

  it("requires the opaque updater identity and update timestamp", () => {
    for (const field of ["updatedBy", "updatedAt"] as const) {
      const rest: Record<string, unknown> = { ...VALID_CONTROL };
      delete rest[field];
      expect(runtimeControlSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("exposes the mutable source domain shape with no storage/append-only field", () => {
    const control: RuntimeControl = { ...VALID_CONTROL };
    expect(control.key).toBe("global_publishing_pause");
    expect(control.value).toBe(true);
    expect("controlKey" in control).toBe(false);
    expect("valueJson" in control).toBe(false);
    expect("createdAt" in control).toBe(false);
    expect("projectId" in control).toBe(false);
    expect("version" in control).toBe(false);
    expect("paused" in control).toBe(false);
  });
});

describe("RuntimeControl serialization boundary", () => {
  it("encodes every typed value to the exact stored JSON scalar", () => {
    expect(runtimeControlValueJsonSchema.encode(true)).toBe("true");
    expect(runtimeControlValueJsonSchema.encode(false)).toBe("false");
    expect(runtimeControlValueJsonSchema.encode(42)).toBe("42");
    expect(runtimeControlValueJsonSchema.encode(1.5)).toBe("1.5");
    expect(runtimeControlValueJsonSchema.encode("platform_pause")).toBe(
      '"platform_pause"',
    );
  });

  it("decodes every stored JSON scalar back to its typed value", () => {
    expect(runtimeControlValueJsonSchema.parse("true")).toBe(true);
    expect(runtimeControlValueJsonSchema.parse("false")).toBe(false);
    expect(runtimeControlValueJsonSchema.parse("42")).toBe(42);
    expect(runtimeControlValueJsonSchema.parse("1.5")).toBe(1.5);
    expect(runtimeControlValueJsonSchema.parse('"platform_pause"')).toBe(
      "platform_pause",
    );
  });

  it("rejects malformed JSON and unsupported stored JSON kinds", () => {
    expect(runtimeControlValueJsonSchema.safeParse("{not json").success).toBe(
      false,
    );
    for (const stored of ["null", "[]", "{}", '["paused"]', '{"on":true}']) {
      expect(runtimeControlValueJsonSchema.safeParse(stored).success).toBe(
        false,
      );
    }
  });
});
