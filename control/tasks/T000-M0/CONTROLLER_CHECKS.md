# T000-M0 independent controller checks

Date: 2026-09-05

## Initial source inspection
- Root branch: integration/ai-v1; initial worktree clean.
- Initial HEAD: c9d5892, directly following frozen OpenSEO 3632f408528cd588fec98c3a174af8ea0ad205e8.
- `git diff --quiet 3632f408528cd588fec98c3a174af8ea0ad205e8 HEAD -- src package.json pnpm-lock.yaml wrangler.jsonc` exited 0. Application source, declared dependencies, lockfile, and main worker config match the frozen source.
- Prompt Explorer: `src/server/features/ai-search/services/promptExplorer.ts`, `runModel`, reads R2 cache before `fetchModelResponse`, with 7-day TTL. Cannot serve as fresh repeated sampling path (ADR-003).
- Brand Lookup: `src/server/features/ai-search/services/brandLookup.ts` uses a separate 24-hour cache.
- GA4 campaign reuse: `src/server/features/ga4/services/Ga4ReportDefinitions.ts`, `reportDimensions`, maps traffic acquisition campaign to `sessionCampaignName`.
- Existing page opportunity input: `src/server/features/ga4/services/SearchOpportunityService.ts`, `getOpportunities`, joins GSC page data with GA4 after checking both connections.
- DB architecture: `src/db/schema.ts` selects provider-specific runtime schemas behind SQLite type identity; `src/db/schema-parity.test.ts` guards structural equivalence. Extend both schema dialects and reuse repositories rather than duplicate them.
- Scheduler: `src/server.ts`, `scheduled`, distinguishes daily OAuth cleanup from audit reconciliation and rank scheduling; main Wrangler config binds RankCheckWorkflow and R2.
- Test configuration: Vitest includes `src/**/*.test.ts`; TypeScript includes all TS/TSX except web/badseo. Overlay reference TS may consequently enter type checking.
- Playwright starts localhost:3101 with local_noauth and explicit fixture flags; its command uses POSIX environment assignments, requiring attention on Windows.

## Controls
- Environment re-probe reports DIRECT_CLAUDE_CLI_READY = YES with EXECUTOR_OK and observed deepseek-v4-Pro[1m]. Version probes have a separately logged non-blocking argument issue.
- H2 external test publishing is false, allowed platforms empty, approved external API budget zero. No external publishing or paid services authorized by this task.
- Greptile organization baseline remains unverified; no organization settings have been changed.
- No review verdict yet. Source inspection is not evidence that runtime checks pass.
