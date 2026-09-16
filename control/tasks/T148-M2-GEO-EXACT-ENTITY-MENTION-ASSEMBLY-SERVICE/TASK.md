# TASK — T148-M2-GEO-EXACT-ENTITY-MENTION-ASSEMBLY-SERVICE

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one small application service that composes accepted T146 exact detection
with accepted T147 fact assembly for one caller-supplied concrete parse. It
must return unpersisted traceable drafts only; recording remains a later task.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §4 and §7;
`07_GEO_MEASUREMENT_SPEC.md` §§5–6; Accepted `docs/adr/ADR-005-versioned-geo-parse.md`;
accepted T140 parse contract; T141 recorder; T143 bundle guard; T146 detection;
T147 assembler; and relevant dependency-injection/service test patterns. Do not
reread the complete baseline or unrelated ADRs.

## IN SCOPE

1. Add one narrow service contract and implementation. It receives one accepted
   `GeoObservationParseFact`, the parsed text that belongs to that parse, an
   ordered caller-supplied mention-id list, and an injected
   `GeoExactEntityMentionCandidateReader`. It calls
   `detectExactEntityMentions({ projectId: parse.projectId, text }, reader)`
   exactly once, then calls `assembleExactEntityMentionFacts` exactly once with
   that same parse, project id, mention ids, and returned matches. Return the
   assembly output unchanged.
2. Keep the service transparent: no independent candidate read/match logic,
   filtering, sorting, dedupe, collision selection, id generation, text/raw
   evidence mutation, parse/current selection, status/recommendation/sentiment/
   position calculation, persistence, or error handling. Reader, detection, and
   assembly failures must propagate unchanged; a reader/detection failure must
   never be an empty draft list.
3. Preserve concrete parse context. The service must derive the detection
   Project exclusively from the given parse fact, forward the exact text and
   mention-id array unchanged, and attach no run/sample/market identity. T147
   remains the authoritative Project/FAILED/id-cardinality guard; T143 remains
   the later bundle consistency boundary.
4. Add focused tests using a fake reader and the real T146/T147 functions:
   one reader invocation; correct parse Project/text/ids delegation; no-match;
   single/colliding matches with canonical/alias provenance retained; PARTIAL
   parse assembly; reader failure and assembly failure propagation; opaque text
   and input-array non-mutation; and source boundary proving no DB/repository/
   recorder/provider/raw-evidence access. Do not mock detection or assembly.
5. No schema/migration/snapshot/dependency, direct database import, matcher
   implementation, candidate reader adapter use, parser execution, bundle
   orchestration, mention persistence, provider/cache, UI, CRUD/server function,
   credentials, publishing, paid action, or production behavior.
6. Run focused tests plus `format:check`, `types:check`, `lint`, full `test`,
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

- [ ] The service invokes accepted detection once under the concrete parse's
  Project and invokes accepted assembly once with unaltered parse/text/id/match
  values, returning drafts unchanged.
- [ ] No-match, single/colliding candidates, PARTIAL parse, and errors retain
  their accepted T146/T147 semantics without fallback or winner selection.
- [ ] No direct storage/provider access, persistence, data transformation,
  parse/run/sample/market policy, or duplicate business rule is added.
- [ ] Focused tests cover all listed invariants. No schema, migration, snapshot,
  dependency, provider/cache, or unrelated runtime change occurs.
- [ ] DELIVERY contains composition/error/evidence-preservation evidence, exact
  gate exits, focused/full-test summaries, changed paths, scope/security
  declaration, and final git status.

## DELIVERY

Write `control/tasks/T148-M2-GEO-EXACT-ENTITY-MENTION-ASSEMBLY-SERVICE/DELIVERY.md`
with the required evidence, then stop.
