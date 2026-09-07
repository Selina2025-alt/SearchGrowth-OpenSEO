# TASK T000-M0

STATUS: AUTHORIZED_EXCEPTION_ROUND_4
MILESTONE: M0 Freeze & Baseline (T000–T003)
OWNER: Claude Code Implementation Engineer
CONTROLLER: Codex

## GOAL
Establish an evidence-backed OpenSEO baseline before any Search Growth business implementation. Cover the closely related M0 freeze, command baseline, source code map, and report as one task.

## CURRENT FIX ROUND CONTEXT
The Product Owner explicitly authorized one exceptional fourth executor round on 2026-09-07 and approved retaining the existing formatting-only `AGENTS.md` and `CLAUDE.md` diffs. This authorization does not relax any acceptance criterion.

Rounds 1-3 already produced passing evidence for locked install, local migrations, format, types, lint, all 1,165 unit tests, and build. Do not repeat those implementations or rerun install/migrations. The remaining work is exactly:

1. Fix E2E Worker environment injection. `playwright.config.ts` now uses `webServer.env`, but the Cloudflare Worker still receives no `AUTH_MODE` binding and falls back to `cloudflare_access`. Add `CLOUDFLARE_INCLUDE_PROCESS_ENV: "true"` to `webServer.env` alongside `AUTH_MODE: "local_noauth"`. The worktree has no `.dev.vars*` or `.env*`, satisfying Cloudflare's documented prerequisite. Do not create/read credential files or change production Wrangler configuration.
2. Run `corepack pnpm test:e2e` to a terminal summary and exit code. Confirm the process exits; do not leave Playwright, Vite, workerd, or esbuild children running. If this exact correction does not expose `AUTH_MODE=local_noauth` to the Worker, diagnose and apply only the repository-supported local Cloudflare/Vite mechanism, with evidence.
3. Run `corepack pnpm ci:check` to completion after the final diff. If the final config/report changes invalidate a narrower passing check, rerun only that affected check.
4. Write repository-root `IMPLEMENTATION_BASELINE.md` and `control/tasks/T000-M0/DELIVERY.md` from their templates. Reuse and cite existing sanitized evidence; do not spend the round rerunning already-green commands. Include exact ancestry/source-map findings, every command result, E2E/CI terminal evidence, limitations, and full diff inventory.
5. Prove mechanically formatted specs and every Accepted ADR preserve meaning. The Product Owner has already reviewed and approved retaining the formatting-only `AGENTS.md`/`CLAUDE.md` diffs.

This is the final authorized executor round. Prioritize terminal evidence and both reports. Stop immediately after DELIVERY; do not commit or merge.

## REQUIREMENT REFERENCES
Read root CLAUDE.md, 00_START_HERE.md, 04_OPENSEO_REUSE_CODE_MAP.md, 21_TEST_ACCEPTANCE_PLAN.md, 23_BACKLOG_MILESTONES.md, 27_AI_CODING_MASTER_PROMPT.md, 29_SCOPE_LOCK.md, 30_TRACEABILITY_MATRIX.md, 34_FIRST_CODEX_TASK.md, 35_AI_DUAL_AGENT_ORCHESTRATION.md, 38_HUMAN_GATES.md, all docs/adr/*.md, and relevant local development/test configuration before execution.

## IN SCOPE
- Verify frozen commit 3632f408528cd588fec98c3a174af8ea0ad205e8 against task HEAD; record exact ancestry and changed paths. Initial integration HEAD is c9d5892 (development baseline overlay).
- Install locked dependencies; run all baseline commands; diagnose failures without disguising them as success.
- Inspect every source capability required by 04_OPENSEO_REUSE_CODE_MAP.md, including auth/routes, scheduler, caches, GA4 campaign breakdown, workflows, R2/deployment, and SQLite/Postgres schema/migrations.
- Write IMPLEMENTATION_BASELINE.md using templates/IMPLEMENTATION_BASELINE_TEMPLATE.md, with actual functions/paths, reuse decisions, command exits, evidence links, and exact conflicts.
- Add a minimal `.gitattributes` rule (`* text=auto eol=lf`) so Windows checkouts preserve formatter-compatible line endings. In this isolated task worktree only, `git -c core.autocrlf=false checkout-index --all --force` is authorized once after writing `.gitattributes`; verify it does not create a mass tracked-file diff.
- Fix only the eight lint violations named in REVIEW.md within `reference-implementations/url-identity.ts`, `reference-implementations/yxer-process-executor.ts`, and `schemas/domain-types.ts`. Preserve behavior and reference-contract semantics. A narrow file-local lint exception for the intentionally comprehensive domain reference is acceptable only if splitting it would make the reference harder to use; explain the choice.
- Small local setup corrections may be proposed with evidence. Mechanical Prettier normalization is limited to the 99 files reported by the latest format log. Do not change application behavior, upgrade dependencies, alter lockfiles, or weaken application checks merely to obtain green results.

## OUT OF SCOPE
M0.5 connector execution, product UI, domain schema, business code, production operations, external publication, paid API calls, credential collection, scope/ADR changes. Do not edit the review control plane (`.greptile`, `.agents/skills`, `.github`) or make further changes to `AGENTS.md`/`CLAUDE.md`; the Product Owner approved retaining only their already-present formatting-only diffs.

## EXPECTED FILES / AREAS
.gitattributes; the three REVIEW-listed overlay TypeScript files; formatting-only changes to reported Search Growth baseline files; `playwright.config.ts`; the OAuth provider test only if isolated reproduction requires a minimal correction; IMPLEMENTATION_BASELINE.md; control/tasks/T000-M0/DELIVERY.md; control/tasks/T000-M0/evidence/*.

## ARCHITECTURE / DATA / SECURITY CONSTRAINTS
Reuse OpenSEO; no second Project/SEO/GSC/GA4. Only local isolated test DB migrations. No remote migrations, deployments, paid services, login changes, or secret values in logs. Do not read or copy user credential files. Test configuration must be checked for external side effects before execution. Stop any dependent operation at a Human Gate and record the exact prerequisite.

## REQUIRED COMMANDS
Record runtime/package-manager versions. Use pnpm 10.30.1 as declared by package.json (Windows .cmd variants are equivalent).
On this Windows Git Bash executor, bare `pnpm` is not on PATH. Use the declared pnpm 10.30.1 through Corepack exactly as follows:
1. corepack pnpm install --frozen-lockfile
2. corepack pnpm run db:migrate:local
3. corepack pnpm format:check
4. corepack pnpm types:check
5. corepack pnpm lint
6. corepack pnpm test
7. corepack pnpm build
8. corepack pnpm test:e2e (present)
9. corepack pnpm ci:check (present)
Capture each exit code and full sanitized output independently. One failure must not silently skip unrelated checks. If installation prevents execution, document the failure and exact resulting limitations. Do not claim a command passed unless it ran to completion. Native Windows shell incompatibility must be distinguished from application failures; existing Git Bash can be used when needed and recorded.

## ACCEPTANCE CRITERIA
- [ ] Frozen source ancestry and exact deviations are verified.
- [ ] All required baseline commands actually pass; otherwise clearly identify blockers and do not claim baseline readiness.
- [ ] Windows line endings are deterministic and format check passes without a mass source diff.
- [ ] All eight REVIEW-listed overlay lint violations are resolved without weakening application lint coverage.
- [ ] Every required source capability has a verified path/function and evidence-based reuse decision.
- [ ] Prompt Explorer cache is distinguished from future fresh GEO sampling.
- [ ] No scope, accepted ADR, application behavior, or acceptance criteria changes.
- [ ] IMPLEMENTATION_BASELINE.md and DELIVERY.md contain reproducible evidence, limitations, and conflict classifications.
- [ ] Working tree diff is limited to authorized task artifacts.

## RUNTIME EVIDENCE / DEFINITION OF DONE
Store logs under the task evidence directory, with commands, working directory, exit codes, and timings. DELIVERY.md must follow control/templates/DELIVERY_TEMPLATE.md. Do not write PASS; only Codex independently reviews and accepts. Stop after delivery; do not merge, start another task, edit REVIEW.md, or launch additional agents.

## KNOWN RISKS
Overlay reference TypeScript/Markdown may affect upstream broad checks; report exact evidence rather than hiding files from checks. Browser E2E may require missing local setup. External Greptile organization baseline is unverified and must not be changed.

## HUMAN GATE
RESOLVED for the exceptional fourth round and existing formatting-only `AGENTS.md`/`CLAUDE.md` diffs by Product Owner authorization on 2026-09-07. Existing approvals still prohibit external test publishing, production publishing, paid spend, destructive production actions, and scope changes.
