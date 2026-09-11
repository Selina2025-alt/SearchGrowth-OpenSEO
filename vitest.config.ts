import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true,
    // Tests that dynamically import a heavy module graph (OAuth provider,
    // libsql-backed repositories) pay a cold transform cost that is charged to
    // the test or hook. On Windows that cost is ~4.5s for one file in
    // isolation but >16s when the full suite saturates the machine, so vitest's
    // 5s test / 10s hook defaults intermittently time out otherwise-passing
    // tests (the failing set varies run to run). A single suite-wide deadline
    // keeps the assertions and production behavior unchanged.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    server: {
      deps: {
        // Processed by vitest (instead of loaded natively by node) so the
        // oauth-refresh e2e test's cloudflare:workers mock reaches the real
        // provider module.
        inline: ["@cloudflare/workers-oauth-provider"],
      },
    },
  },
});
