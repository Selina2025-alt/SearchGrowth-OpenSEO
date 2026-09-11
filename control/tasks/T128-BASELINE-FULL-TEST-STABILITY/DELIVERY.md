# DELIVERY — T128-BASELINE-FULL-TEST-STABILITY

## TASK ID

T128-BASELINE-FULL-TEST-STABILITY

## IMPLEMENTATION SUMMARY

Restored a reliable `corepack pnpm test` exit 0 by correcting Vitest's per-test and
per-hook deadlines, which were shorter than the cold module-transform cost that
otherwise-passing tests pay on this Windows checkout.

Diagnosis (evidence-based):

- Failure is timeout-only and full-suite-only; focused runs pass. This was reproduced:
  the pre-change full suite happened to exit 0 once in this worktree, confirming the
  failure is intermittent and load-dependent rather than an assertion failure.
- The dominant cost is charged to a test or hook when a test file dynamically imports a
  heavy module graph. Vitest charges that import to the enclosing test/hook, not to the
  untimed collection phase:
  - `src/server/mcp/oauth-provider.test.ts` first test: **4,464 ms** in an isolated
    6-file run, **14,454 ms** in the full suite.
  - `src/server/mcp/oauth-refresh.e2e.test.ts` first test: **4,464 ms** isolated,
    **14,527 ms** in the full suite.
  - `src/server/auth/workspace-merge.test.ts` (3 tests, real libsql + dynamic import in
    `beforeAll`): **4,986 ms** file time in the full suite.
  - `src/server/features/rank-tracking/repositories/RankTrackingRepository.query.test.ts`:
    **4,924 ms** file time pre-change.
  - `src/db/schema-parity.test.ts` `no direct db.batch` walks all of `src` and
    synchronously reads every non-test `.ts` file.
- Vitest defaults are `testTimeout: 5000` and `hookTimeout: 10000`. Which worker loses
  the race for CPU/disk during the suite's transform/collect phases varies run to run,
  which is exactly why the reported failing set varied.
- A prior baseline attempt had hand-patched only two hotspots with local `30_000`
  overrides (`oauth-provider.test.ts` tests 1–2, `oauth-refresh.e2e.test.ts` beforeEach).
  Those local caps are *lower* than a suite-wide default, so they are removed here and
  the deadline is centralized.

Change: a single suite-wide `testTimeout: 60_000` / `hookTimeout: 60_000` in
`vitest.config.ts`, with the now-redundant local `30_000` overrides removed so the
central deadline applies uniformly. 60 s is chosen because the measured worst first-test
cost under full-suite load is ~14.5 s on this machine, and TASK evidence comes from a
~1.6× slower controller run (197 s vs 121 s for the same suite) → ~23 s extrapolated,
leaving comfortable margin under 60 s while still surfacing genuinely hung tests.

No assertions, test inputs, production code, schema, migration, contract, or runtime
behavior changed.

## FILES CHANGED

- `vitest.config.ts` — added `testTimeout: 60_000` and `hookTimeout: 60_000` with a
  comment recording the diagnosis.
- `src/server/mcp/oauth-provider.test.ts` — removed the two local `, 30_000)` test
  deadlines and their now-stale comments; test bodies and assertions unchanged.
- `src/server/mcp/oauth-refresh.e2e.test.ts` — removed the local `, 30_000)` `beforeEach`
  deadline and its now-stale comment; hook body and assertions unchanged.

No other files changed (`git status --short` shows only these three).

## DATABASE/MIGRATION CHANGES

None. No schema file, migration, drizzle config, or `IndexingObservation` artifact touched.

## DEPENDENCIES CHANGED

None. `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` are unchanged.

Environment bootstrap (not a repository change): the worktree is a fresh git worktree
with no `node_modules`. `corepack pnpm install --frozen-lockfile` was run once to install
the locked dependency set before any test command. This command is explicitly allowed by
`.ai-orchestrator/config.json` `allowedTools`; it is not in TASK.md's APPROVED COMMANDS
list (see DEVIATIONS).

## TESTS ADDED

None. This is a test-runner configuration correction; no test was added, removed, or
rewritten. All 353 assertions in the six TASK-listed files are retained and pass.

## COMMANDS RUN

Run individually, no chained operations, in
`D:\company project\SearchGrowth-OpenSEO\.ai-worktrees\T128-BASELINE-FULL-TEST-STABILITY`:

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm test` (pre-change baseline)
3. `corepack pnpm exec vitest run src/server/auth/workspace-merge.test.ts src/server/features/rank-tracking/repositories/RankTrackingRepository.query.test.ts src/db/schema-parity.test.ts src/server/mcp/oauth-provider.test.ts src/server/mcp/oauth-refresh.e2e.test.ts src/server/features/keywords/services/research/saved-keywords.test.ts --reporter=verbose` (pre-change measurement)
4. `corepack pnpm exec vitest run <same six files>` (post-change, focused)
5. `corepack pnpm test` (post-change, acceptance)
6. `corepack pnpm format:check`
7. `corepack pnpm types:check`
8. `corepack pnpm lint`
9. `corepack pnpm ci:check`
10. Read-only `git status --short`, `git diff`, `git diff --stat`, `git log`, `git rev-parse`.

## COMMAND RESULTS

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `corepack pnpm install --frozen-lockfile` | 0 | 980 packages, lockfile up to date, 48.9 s |
| 2 | `corepack pnpm test` (pre-change) | 0 | 185 files, 1708 tests passed, 121.61 s |
| 3 | focused six files `--reporter=verbose` (pre-change) | 0 | 6 files, 353 tests; oauth first tests 4,464 ms each |
| 4 | focused six files (post-change) | 0 | **6 files, 353 tests passed, 6.13 s** |
| 5 | `corepack pnpm test` (post-change) | 0 | **185 files, 1708 tests passed, 89.70 s** |
| 6 | `corepack pnpm format:check` | 0 | All matched files use Prettier code style |
| 7 | `corepack pnpm types:check` | 0 | `tsc --noEmit` clean |
| 8 | `corepack pnpm lint` | 0 | 0 warnings, 0 errors on 907 files |
| 9 | `corepack pnpm ci:check` | 0 | prettier + knip + tsc + badseo tsc + oxlint + plugin skill sync all clean |

## RUNTIME EVIDENCE

Post-change acceptance run summary (command 5, verbatim tail):

```
 Test Files  185 passed (185)
      Tests  1708 passed (1708)
   Duration  89.70s (transform 47.02s, setup 0ms, collect 589.33s, tests 66.22s, environment 105ms, prepare 126.19s)
```

Slowest tests in that passing run, showing the deadlines that the change now covers:

```
 ✓ src/server/mcp/oauth-provider.test.ts (7 tests) 14504ms
   ✓ ... > binds tokens and protected-resource metadata to the canonical MCP URL  14454ms
 ✓ src/server/mcp/oauth-refresh.e2e.test.ts (8 tests) 14925ms
   ✓ ... > registers a secretless client as public and completes the code exchange  14527ms
 ✓ src/server/auth/repositories/AuthRepository.query.test.ts (2 tests) 5128ms
 ✓ src/server/features/project-context/repositories/ProjectContextRepository.query.test.ts (2 tests) 5018ms
 ✓ src/server/auth/workspace-merge.test.ts (3 tests) 4986ms
```

Every file named in TASK.md's EVIDENCE section is included and passes:

```
 ✓ src/server/auth/workspace-merge.test.ts (3 tests)
 ✓ src/server/features/rank-tracking/repositories/RankTrackingRepository.query.test.ts (5 tests)
 ✓ src/db/schema-parity.test.ts (324 tests)
 ✓ src/server/mcp/oauth-provider.test.ts (7 tests)
 ✓ src/server/mcp/oauth-refresh.e2e.test.ts (8 tests)
 ✓ src/server/features/keywords/services/research/saved-keywords.test.ts (6 tests)
```

Pre-change baseline (command 2) also exited 0; the flakiness is latent and load-dependent,
so this run is not by itself proof of a fix. The causal evidence is the per-test cost
measurement: the post-change run contains tests that exceeded Vitest's old 5 s default
(repositories/merge files at 4.99–5.13 s file time; oauth tests at 14.45–14.53 s) and
would have raced the old deadlines on a slower/contended run.

## KNOWN LIMITATIONS

- The failure is a timing race, so no finite deadline can be proven to never time out.
  60 s is a measured-margin deadline (≈2.5× the worst observed full-suite test cost,
  ≈2.6× the extrapolated controller-machine cost), not a deterministic guarantee.
- The underlying cause — repeated cold Vite transforms of heavy module graphs per
  isolated test file worker on Windows — is not removed, only made non-fatal. Reducing
  it (shared cache / static imports / fewer workers) would be a larger change and was
  out of scope.
- Only a test-runner deadline changed; a genuinely hung test now fails at 60 s instead
  of 5 s.

## DEVIATIONS FROM TASK

1. `corepack pnpm install --frozen-lockfile` was required to bootstrap the fresh worktree
   (`node_modules` is untracked and absent). It is not in TASK.md's APPROVED COMMANDS but
   is explicitly permitted by `.ai-orchestrator/config.json` `allowedTools`. No dependency
   or lockfile change resulted (`git status` clean of both).
2. TASK.md's approved list includes `corepack pnpm exec vitest run <files>`; the
   pre-change measurement run added `--reporter=verbose` to record per-test timings. Same
   runner and file set, no behavioral difference.
3. Local `30_000` overrides in two test files were removed rather than raised. Necessary:
   a per-test timeout overrides the suite default, so leaving them would have kept a 30 s
   cap on the two files most likely to exceed it, defeating the centralized deadline.
   Assertions are untouched.

## SECURITY NOTES

- No production publishing, deploy, external account, paid API, credential, or network
  call was used.
- No CAPTCHA/2FA bypass, stealth behavior, cookie upload, or scope change.
- No secret values were read or written. Test output contains only existing test fixtures.
- Diff is confined to test files and test-runner configuration.

## GIT STATUS/DIFF SUMMARY

`git status --short`:

```
 M src/server/mcp/oauth-provider.test.ts
 M src/server/mcp/oauth-refresh.e2e.test.ts
 M vitest.config.ts
```

`git diff --stat`:

```
 src/server/mcp/oauth-provider.test.ts    | 8 +++-----
 src/server/mcp/oauth-refresh.e2e.test.ts | 4 +---
 vitest.config.ts                         | 9 +++++++++
 3 files changed, 13 insertions(+), 8 deletions(-)
```

No T128 product file, schema, migration, domain contract, server business logic, or
runtime file is modified. No commit, merge, or push was performed.

## READY FOR REVIEW

Ready for Controller review. Acceptance evidence: `corepack pnpm test` exits 0 in this
task worktree (185 files, 1708 tests), focused affected tests exit 0, and
`format:check` / `types:check` / `lint` / `ci:check` all exit 0.
