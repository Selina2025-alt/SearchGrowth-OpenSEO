# TASK — T146-M2-GEO-EXACT-ENTITY-MENTION-DETECTION-SERVICE

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one small application service that composes the accepted T145
Project-scoped candidate-reader port with the accepted T144 literal matcher.
Given caller-supplied parsed text and a Project id, it must return the exact,
traceable candidate spans without persistence or parser workflow.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §4 and §7;
`07_GEO_MEASUREMENT_SPEC.md` §5; accepted T141 mention recorder; accepted T143
bundle guard; accepted T144 matcher; accepted T145 reader; and directly relevant
dependency-injection/service test patterns. Do not reread the complete baseline
or unrelated ADRs.

## IN SCOPE

1. Add one narrow service contract and implementation that accepts a nonempty
   Project id and supplied parsed text, receives a
   `GeoExactEntityMentionCandidateReader` dependency, awaits exactly one
   `listCandidates(projectId)` call, then delegates exactly once to
   `matchExactEntityMentions({ projectId, text, candidates })`. Return the
   matcher's result unchanged.
2. Keep the service a transparent composition boundary: no candidate filtering,
   sorting, dedupe, collision winner selection, alias/entity lookup, matching
   logic, normalization, serialization, raw-evidence inspection, parse/current
   selection, or status/recommendation/sentiment/position calculation. Errors
   from either dependency must propagate unchanged; a reader failure must never
   be represented as an empty match list.
3. Preserve exact-match context. The service must never replace the supplied
   Project id or text and must not attach a parse/run/sample id. Binding results
   to a concrete versioned parse and recording them remain later work through
   the accepted T143/T141 boundaries.
4. Add focused tests with an in-process fake reader covering: one exact reader
   call with the identical Project id; exact delegation input; empty candidate
   list -> deterministic no-match; single and colliding candidates -> all
   deterministic matches preserved; reader error propagation by identity;
   matcher input error propagation; opaque text byte-for-byte preservation; and
   source boundary proving no DB/repository import, recorder call, or raw
   evidence mutation. Do not mock the matcher implementation.
5. No schema/migration/snapshot/dependency, concrete database import, direct
   repository use, entity/alias mutation, parser/extractor, bundle orchestration,
   mention persistence, provider/cache, UI, CRUD/server function, credentials,
   publishing, paid action, or production behavior.
6. Run the focused test plus `format:check`, `types:check`, `lint`, full `test`,
   `build`, and `ci:check`, recording exact exits. A worktree bootstrap may use
   `corepack pnpm install --frozen-lockfile` only if dependencies are absent;
   record it and do not change lockfiles. If an aggregate gate is sandbox-denied,
   record it once and stop without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only: `corepack pnpm install --frozen-lockfile`, `corepack pnpm exec vitest
run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm
format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm
test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git
status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`,
access production, invoke a provider, access credentials/accounts, access
Prompt Explorer/R2/application-cache, or invoke publishing/paid behavior.

## ACCEPTANCE CRITERIA

- [ ] The service invokes its reader exactly once with the original Project id,
  then delegates the original text and returned candidates once to T144's exact
  matcher, returning the match list unchanged.
- [ ] Empty/single/colliding candidate behaviour remains the accepted matcher
  behaviour; errors propagate unchanged and no reader failure becomes a
  no-match result.
- [ ] No data transform, direct storage/repository access, persistence,
  parse/run/sample binding, raw-evidence inspection, or domain-policy change is
  added.
- [ ] Focused tests cover all listed invariants. No schema, migration, snapshot,
  dependency, provider/cache, or unrelated runtime change occurs.
- [ ] DELIVERY contains composition/error/evidence-preservation evidence, exact
  gate exits, focused/full-test summaries, changed paths, scope/security
  declaration, and final git status.

## DELIVERY

Write `control/tasks/T146-M2-GEO-EXACT-ENTITY-MENTION-DETECTION-SERVICE/DELIVERY.md`
with the required evidence, then stop.
