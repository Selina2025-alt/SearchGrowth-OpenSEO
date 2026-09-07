import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3101",
    actionTimeout: 5_000,
    navigationTimeout: 30_000,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    // POSIX inline env assignments are not valid in cmd.exe; pass the dev-server
    // environment through webServer.env so the command stays cross-platform.
    command: "corepack pnpm exec vite dev --host 127.0.0.1 --strictPort",
    url: "http://localhost:3101",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_OPTIONS: "",
      AUTH_MODE: "local_noauth",
      // With no .dev.vars/.env files present, tell the Cloudflare Vite plugin to
      // forward the process environment (AUTH_MODE above) into the local worker
      // bindings. Without this the worker falls back to cloudflare_access and the
      // E2E dev server emits AUTH_CONFIG_MISSING.
      CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      VITE_E2E_DOMAIN_FIXTURES: "1",
      VITE_E2E_KEYWORD_FIXTURES: "1",
      // Force an empty credential for credential-less E2E runs. Every exercised
      // DataForSEO-backed server function is fixture-gated, and
      // createAuthenticatedFetch refuses to call fetch without a non-empty key,
      // so a terminal E2E PASS is evidence no provider request escaped. The
      // empty string also guarantees an inherited operator credential on this
      // machine cannot be forwarded into the dev worker.
      DATAFORSEO_API_KEY: "",
      PORT: "3101",
    },
  },
});
