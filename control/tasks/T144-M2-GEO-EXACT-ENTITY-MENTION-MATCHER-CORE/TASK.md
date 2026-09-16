# TASK — T144-M2-GEO-EXACT-ENTITY-MENTION-MATCHER-CORE

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Implement one small, storage-free deterministic matcher for literal `EXACT`
entity/alias surfaces in a supplied GEO parsed-text string. It is the first
bounded deterministic parser slice from `07_GEO_MEASUREMENT_SPEC.md` §5. It
must return auditable match spans without persisting mentions or interpreting
recommendation/sentiment/position.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §4 and §7;
`07_GEO_MEASUREMENT_SPEC.md` §§5–6; Accepted `docs/adr/ADR-005-versioned-geo-parse.md`;
accepted T103 entity/alias contract; accepted T141 entity-mention recorder;
accepted T143 bundle guard; and directly relevant pure-domain test patterns.
Do not reread the complete baseline or unrelated ADRs.

## IN SCOPE

1. Add one narrow, storage-free input/output contract and pure function that
   receives a supplied `projectId`, parsed text, and ordered candidate literal
   surfaces. Each candidate carries a stable `entityId`, project id, exact
   surface text, and caller-provided source identity (canonical name or alias
   id). Return independent literal occurrences with `entityId`, source identity,
   zero-based start/end offsets, and the exact evidence slice.
2. Support only literal, case-sensitive `EXACT` matching. Find every non-
   overlapping occurrence of every candidate surface using JavaScript string
   code-unit offsets. Preserve the exact source substring in evidence; do not
   normalize, trim, lowercase, tokenize, serialize, parse HTML/URLs, infer
   aliases, or alter the supplied text.
3. Reject before producing results when the parsed text is absent/non-string,
   project/candidate/entity/source identifiers are empty or non-string, a
   candidate belongs to another Project, or a candidate surface is empty. The
   error must identify the candidate index/field. Do not silently skip,
   substitute, or repair invalid candidates.
4. Results must be deterministic: primarily ascending `start` offset, then the
   caller's candidate order, then occurrence order. Keep occurrences from
   different candidates independent even if they share an exact surface or
   overlap; this matcher must not invent a cross-entity priority, dedupe rule,
   ownership classification, or persistence identity.
5. Add focused tests for repeated surfaces; stable ordering; overlapping
   candidate surfaces; separate candidates with the same literal surface;
   exact evidence/offset preservation including Unicode and whitespace; every
   rejection class; no mutation/serialization; and no database/recorder access.
6. No database/repository/recorder call, schema/migration/snapshot/dependency,
   case-insensitive/word-boundary/substring/domain matching, alias lookup,
   entity lookup, raw-response parser, citation extraction, LLM/provider/cache,
   parse/current selection, bundle orchestration, UI, CRUD/server function,
   credentials, publishing, paid action, or production behavior.
7. Run the focused test plus `format:check`, `types:check`, `lint`, full `test`,
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

- [ ] A pure exact-match contract returns traceable entity/source/span/evidence
  facts from caller-supplied text and candidates, with no storage dependency.
- [ ] Only case-sensitive literal matching occurs. Every occurrence preserves
  source evidence and code-unit offsets; result ordering is deterministic;
  same-surface and overlapping candidates remain separate, without a new
  priority or uniqueness rule.
- [ ] Invalid text/candidate shapes, cross-Project candidates, and empty
  identifiers/surfaces reject explicitly before a result is returned.
- [ ] Focused tests cover all listed invariants. No schema, migration, snapshot,
  dependency, provider/cache, parser workflow, or unrelated runtime change
  occurs.
- [ ] DELIVERY contains literal-match and rejection evidence, exact gate exits,
  focused/full-test summaries, changed paths, scope/security declaration, and
  final git status.

## DELIVERY

Write `control/tasks/T144-M2-GEO-EXACT-ENTITY-MENTION-MATCHER-CORE/DELIVERY.md`
with the required evidence, then stop.
