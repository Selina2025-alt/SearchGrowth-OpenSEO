# TASK — T145-M2-GEO-EXACT-ENTITY-MENTION-CANDIDATE-READER

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one small, read-only, Project-scoped candidate reader that supplies the
accepted T144 exact matcher with active tracked-entity canonical-name surfaces
and eligible active-entity alias surfaces. It must preserve source traceability
and never select a winner for colliding surfaces.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §4 and §7;
`07_GEO_MEASUREMENT_SPEC.md` §5; accepted T103 entity/alias contracts and
migration tests; accepted T141 entity-mention recorder; accepted T144 matcher;
and directly relevant repository query-test patterns. Do not reread the full
baseline or unrelated ADRs.

## IN SCOPE

1. Add one narrow server-side reader port and one repository adapter. Given a
   nonempty `projectId`, return `GeoExactEntityMentionCandidate` values from
   accepted `tracked_entities` / `entity_aliases` storage, reusing T144's
   candidate and source types rather than duplicating matcher contracts.
2. Return one canonical-name candidate for each active tracked entity in that
   Project. Return one alias candidate only when its owning entity is active,
   it belongs to that same Project, its accepted `matchMode` is `EXACT`, and
   its persisted `caseSensitive` flag is `true`; the exact literal matcher must
   not be fed CASE_INSENSITIVE_EXACT, WORD_BOUNDARY, UNICODE_SUBSTRING, DOMAIN,
   or case-insensitive aliases. Preserve entity id, Project id, literal text,
   and canonical-vs-alias source identity verbatim.
3. Make result order deterministic without giving it business precedence:
   canonical candidates first, then aliases; within each group order by stable
   entity id then source id. Do not use alias priority, deduplicate equal
   surfaces, collapse collisions, infer ownership, or pick a winning entity.
4. Reject an empty/non-string Project id before any query. For an accepted row
   with an unusable empty canonical/alias source text or id, fail explicitly and
   identify the row/source instead of silently filtering it. The reader performs
   no writes, no matching, no raw-evidence inspection, and no entity/alias
   mutation.
5. Add focused real-storage tests covering Project isolation; active/inactive
   entities; canonical and eligible-alias mapping; every excluded match mode and
   case-insensitive alias; deterministic order; same-surface collisions retained;
   invalid project argument; unusable stored values failing explicitly; and
   source/read-only boundary. Retain dual-dialect schema parity without a new
   migration.
6. No schema/migration/snapshot/dependency, alias creation/edit, matcher
   invocation, raw-response parser, mention persistence, parse/run selection,
   provider/cache, UI, CRUD/server function, credentials, publishing, paid
   action, or production behavior.
7. Run focused tests plus `format:check`, `types:check`, `lint`, full `test`,
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

- [ ] A Project-scoped, read-only candidate port and adapter reuse T144
  candidates and return eligible active canonical and exact case-sensitive alias
  surfaces with full source identity.
- [ ] Other alias modes, case-insensitive aliases, inactive entities, and other
  Projects are excluded. Collisions remain separate and result order is stable
  without alias priority, dedupe, or winner selection.
- [ ] Invalid arguments or unusable accepted rows fail explicitly before a
  misleading candidate list is returned. No source table is mutated and no
  matcher/recorder/provider/raw-evidence behavior occurs.
- [ ] Focused real-storage tests cover all listed invariants and existing
  dual-dialect parity remains green; no migration is created.
- [ ] DELIVERY contains mapping/error/read-only evidence, exact gate exits,
  focused/full-test summaries, changed paths, scope/security declaration, and
  final git status.

## DELIVERY

Write `control/tasks/T145-M2-GEO-EXACT-ENTITY-MENTION-CANDIDATE-READER/DELIVERY.md`
with the required evidence, then stop.
