import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAnyE2eFixtureMode,
  isDomainE2eFixtureMode,
  isKeywordE2eFixtureMode,
} from "./e2e-fixture-mode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("E2E fixture mode detection", () => {
  it("is off when no fixture flag is set to exactly 1", () => {
    vi.stubEnv("VITE_E2E_KEYWORD_FIXTURES", "");
    vi.stubEnv("VITE_E2E_DOMAIN_FIXTURES", "");

    expect(isKeywordE2eFixtureMode()).toBe(false);
    expect(isDomainE2eFixtureMode()).toBe(false);
    expect(isAnyE2eFixtureMode()).toBe(false);
  });

  it("is on when either the keyword or the domain fixture flag is 1", () => {
    vi.stubEnv("VITE_E2E_KEYWORD_FIXTURES", "1");
    vi.stubEnv("VITE_E2E_DOMAIN_FIXTURES", "");
    expect(isKeywordE2eFixtureMode()).toBe(true);
    expect(isAnyE2eFixtureMode()).toBe(true);

    vi.stubEnv("VITE_E2E_KEYWORD_FIXTURES", "");
    vi.stubEnv("VITE_E2E_DOMAIN_FIXTURES", "1");
    expect(isDomainE2eFixtureMode()).toBe(true);
    expect(isAnyE2eFixtureMode()).toBe(true);
  });

  it("treats any value other than 1 as fixture mode off", () => {
    vi.stubEnv("VITE_E2E_KEYWORD_FIXTURES", "0");
    vi.stubEnv("VITE_E2E_DOMAIN_FIXTURES", "true");

    expect(isKeywordE2eFixtureMode()).toBe(false);
    expect(isDomainE2eFixtureMode()).toBe(false);
    expect(isAnyE2eFixtureMode()).toBe(false);
  });
});
