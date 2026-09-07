// Shared detection of the explicit Playwright E2E fixture mode. Both fixture
// flags replace every exercised DataForSEO-backed data source with
// deterministic local fixtures, so the worker can run credential-less. Keeping
// the detection in one leaf lets the domain/keyword-research server functions
// and the API-key setup status agree on what "fixture mode" means and gives
// unit tests a boundary to assert against.

export function isKeywordE2eFixtureMode(): boolean {
  return import.meta.env.VITE_E2E_KEYWORD_FIXTURES === "1";
}

export function isDomainE2eFixtureMode(): boolean {
  return import.meta.env.VITE_E2E_DOMAIN_FIXTURES === "1";
}

export function isAnyE2eFixtureMode(): boolean {
  return isKeywordE2eFixtureMode() || isDomainE2eFixtureMode();
}
