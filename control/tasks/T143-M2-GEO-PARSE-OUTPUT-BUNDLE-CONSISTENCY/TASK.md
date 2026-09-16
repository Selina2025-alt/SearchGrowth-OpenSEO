# TASK — T143-M2-GEO-PARSE-OUTPUT-BUNDLE-CONSISTENCY

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one small, storage-free consistency boundary for a caller-supplied output
bundle from one concrete, versioned GEO parse. The guard must prevent facts for
another Project or another parse from entering a later recording workflow. It
must not parse raw evidence, find entities/citations, or write storage.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §7; `07_GEO_MEASUREMENT_SPEC.md`
§§5–6; Accepted `docs/adr/ADR-005-versioned-geo-parse.md`; accepted T140,
T141, and T142 ports and repository tests; and directly relevant pure-domain
test patterns. Do not reread the full baseline or unrelated ADRs.

## IN SCOPE

1. Add one narrow, storage-free TypeScript contract and pure validator for a
   caller-supplied bundle containing exactly one `GeoObservationParseFact`, zero
   or more `GeoEntityMentionFact`s, and zero or more `GeoCitationFact`s. Reuse
   the accepted T140/T141/T142 fact types; do not duplicate their leaf schemas.
2. Before later recorder orchestration, validate only cross-fact identity:
   every child fact must have the same `projectId` as the bundle's concrete parse
   fact and the exact same `parseId` as that parse fact's `id`. Return the
   original bundle unchanged on success; throw an auditable error that identifies
   the child collection and index on mismatch. Do not coerce, derive, replace,
   or infer values.
3. Keep the helper pure and side-effect free. It must not mutate, freeze, clone,
   serialize, normalize, inspect, or parse raw response/evidence values; access
   a database; call any recorder; select a current parse; deduplicate; update;
   or impose a business uniqueness rule. Leaf validation and all persistence
   remain the accepted recorder responsibilities.
4. Add focused unit tests covering: an empty child set; multiple valid mentions
   and citations for the same Project/parse; Project mismatch for each child
   kind; parse mismatch for each child kind; an error that names the exact
   collection/index; and proof that valid facts/arrays are returned by identity
   with no mutation or JSON serialization. Include a regression case with an
   opaque evidence string that must stay byte-for-byte unchanged.
5. No migration, schema, snapshot, dependency, provider, cache, parser/extractor,
   matcher, classifier, URL normalizer, repository/recorder invocation,
   workflow/orchestration, UI, CRUD/server function, credentials, publishing,
   paid action, or production behavior.
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

- [ ] A narrow bundle contract reuses the accepted parse, mention, and citation
  fact types, with exactly one concrete parse fact and zero-or-more child facts.
- [ ] The pure guard rejects a child whose `projectId` differs from the parse
  fact's project or whose `parseId` differs from the parse fact id, names the
  collection/index, and makes no coercion, mutation, or persistence attempt.
- [ ] Valid output is returned by identity without mutation, cloning,
  serialization, raw-evidence inspection, parse-current selection, or a new
  uniqueness rule; leaf validation and persistence are not duplicated.
- [ ] Focused tests cover all listed invariants. No schema, migration, snapshot,
  dependency, or unrelated runtime change occurs.
- [ ] DELIVERY contains contract/error evidence, exact gate exits,
  focused/full-test summaries, changed paths, scope/security declaration, and
  final git status.

## DELIVERY

Write `control/tasks/T143-M2-GEO-PARSE-OUTPUT-BUNDLE-CONSISTENCY/DELIVERY.md`
with the required evidence, then stop.
