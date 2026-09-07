import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { isAnyE2eFixtureMode } from "@/shared/e2e-fixture-mode";

export const getSeoApiKeyStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(() => {
    // Explicit E2E fixture mode (both Playwright fixture flags) replaces every
    // exercised DataForSEO-backed data source with deterministic local
    // fixtures, so no real credential exists to configure. Treat the API key as
    // configured in that mode or the app shell would show the blocking setup
    // modal over the fixture UIs. Production behavior is unchanged when the
    // flags are absent.
    if (isAnyE2eFixtureMode()) {
      return { configured: true };
    }
    const configured = Boolean(env.DATAFORSEO_API_KEY?.trim());
    return { configured };
  });
