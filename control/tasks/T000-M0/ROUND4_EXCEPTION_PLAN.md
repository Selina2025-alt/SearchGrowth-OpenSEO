# T000-M0 Proposed Exception Round 4

STATUS: EXECUTED — BLOCKED (CLAUDE MAX_TURNS) — 2026-09-07

## Result

- Cloudflare auth binding correction worked: round-4 E2E no longer emitted `AUTH_CONFIG_MISSING`.
- E2E exposed a second credential-less harness defect: the DataForSEO setup modal blocked page interaction and one path attempted a live DataForSEO call without a key.
- Claude reached 120 turns while the E2E child process was still running. It did not run `ci:check` or produce either required report.
- Codex terminated the orphaned Playwright/Vite/workerd/esbuild process tree. No fifth round was dispatched.

## Purpose

Close only the remaining T000-M0 acceptance blockers. This plan does not authorize execution by itself.

## Authorized implementation if approved

1. Preserve the current passing format, type, lint, unit-test, and build corrections.
2. In `playwright.config.ts`, add `CLOUDFLARE_INCLUDE_PROCESS_ENV: "true"` to `webServer.env` alongside `AUTH_MODE: "local_noauth"`. The task worktree has no `.dev.vars*` or `.env*` file, so this follows Cloudflare's documented process-environment path for local Worker bindings.
3. Run a bounded E2E smoke that proves `env.AUTH_MODE` resolves to `local_noauth`; then run the complete `corepack pnpm test:e2e` and confirm its process tree exits.
4. Run `corepack pnpm ci:check` to completion.
5. Produce repository-root `IMPLEMENTATION_BASELINE.md` and `control/tasks/T000-M0/DELIVERY.md` from their templates, using existing evidence instead of rerunning already-green commands unless a final change invalidates them.
6. Account for every changed path and prove all Accepted ADR/spec formatting changes preserve meaning.

## Control-plane disposition

`AGENTS.md` and `CLAUDE.md` have formatting-only diffs (Markdown blank lines and final newline). The Product Owner explicitly approved retaining these concrete diffs on 2026-09-07. No further control-plane edits are authorized.

## Hard limits

- One exceptional executor round only.
- No product scope, Accepted ADR meaning, application behavior, dependency, lockfile, migration, credential, external service, production, paid, or publishing change.
- No `main` merge. Claude does not commit or merge.
- Stop immediately after complete DELIVERY; Codex independently reviews before any integration merge.

## Acceptance

- E2E terminal PASS with no orphan processes.
- `ci:check` terminal PASS.
- Both required reports present and evidence-linked.
- Diff limited to approved T000-M0 paths.
- Controller REVIEW is PASS or PASS_WITH_NON_BLOCKERS before merge.
