# TASK — T141-M2-GEO-ENTITY-MENTION-RECORDER-REPOSITORY

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Implement one small, credential-free persistence port and repository for an accepted `GeoEntityMention` fact. It must turn one validated fact into exactly one append-only `geo_entity_mentions` insert using the accepted schema. It must not implement entity matching, parsing, recommendation inference, or a workflow.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §§4 and 7; `07_GEO_MEASUREMENT_SPEC.md` §5; `21_TEST_ACCEPTANCE_PLAN.md` §3; Accepted `docs/adr/ADR-005-versioned-geo-parse.md`; accepted T103 Entity/Alias, T106/T107 GEO parse/entity-mention schema and migration tests; accepted T140 parse recorder; and directly relevant existing repository patterns.

## IN SCOPE

1. Add a narrow server-side `GeoEntityMentionRecorder` port and typed fact contract, plus an idiomatic repository adapter. The adapter maps exactly one supplied fact to exactly one `geo_entity_mentions` INSERT: `id`, `projectId`, `parseId`, `entityId`, `mentioned`, nullable `recommended`, nullable `mentionPosition`, nullable `sentiment`, and nullable `evidenceText`. Preserve the accepted `created_at` default. Do not add a migration, schema field, enum, snapshot, dependency, or business uniqueness rule.
2. Validate the storage-relevant runtime boundary before INSERT. Require nonempty id/project/parse/entity identifiers; require `mentioned` boolean; allow only boolean or explicit `null` for `recommended`; allow only an integer or explicit `null` for `mentionPosition`; allow only a string or explicit `null` for `sentiment` and `evidenceText`. Reject missing, invalid, or coercible stand-ins rather than normalizing, inferring, or substituting values. Do not invent recommendation, sentiment, rank, or evidence semantics.
3. Preserve append-only versioned-parse semantics: no update, upsert, dedupe, retry, delete, parser-current selection, or entity matching. Let the accepted same-Project composite FKs surface cross-Project/dangling parse and entity failures. Multiple supplied facts remain separate rows; do not add a uniqueness rule. The repository must not write or modify raw run, parse, citation, or entity/alias rows.
4. Add focused real-storage tests with minimal valid parent fixtures. Cover faithful valid mapping; true/false `mentioned`; nullable/present optional values; multiple facts remaining independent; cross-Project Parse rejection; cross-Project Entity rejection; dangling parent rejection; raw run and parse unchanged; invalid runtime values rejected before a row; and source boundary with only one insert and no other table mutation. Retain dual-dialect schema-parity evidence without a migration.
5. No deterministic or LLM entity matcher, alias lookup, raw-response inspection, entity/citation extraction runtime, recommendation/sentiment computation, parser/reparse/current-pointer workflow, provider call, cache access, batch orchestration, UI, CRUD/server function, credentials, publishing, paid action, or production behavior.
6. Run focused tests, `format:check`, `types:check`, `lint`, full `test`, `build`, and `ci:check`, recording exact exits. A worktree bootstrap may use `corepack pnpm install --frozen-lockfile` only if dependencies are absent; record it and do not change lockfiles. If an aggregate gate is sandbox-denied, record it once and stop without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only: `corepack pnpm install --frozen-lockfile`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, invoke a real provider, access credentials/accounts, access Prompt Explorer/R2/application-cache, or invoke publishing/paid behavior.

## ACCEPTANCE CRITERIA

- [ ] One typed port/fact and one repository adapter persist exactly one immutable entity-mention row per accepted fact, with every accepted column faithfully mapped and no synthesized value except the database `created_at` default.
- [ ] Invalid identifiers, booleans, optional values, and position values reject before INSERT; explicit nullable facts round-trip without inference or coercion.
- [ ] Same-Project parse/entity ownership is enforced by the accepted database constraints; failures surface. Multiple supplied facts remain separate rows without a new uniqueness rule; raw runs, parses, citations, entities, and aliases are unchanged.
- [ ] Focused real-storage tests demonstrate all listed invariants. Existing dual-dialect schema parity remains green; no migration is created.
- [ ] No matching/parser/runtime/provider/cache/workflow/UI/CRUD/credential/publishing/production behavior, dependency, schema, migration, snapshot, or Accepted ADR/scope change occurs.
- [ ] DELIVERY contains fact-to-storage mapping, validation behavior, append-only/error evidence, exact gate exits, focused/full test summaries, changed paths, security/scope declaration, and final git status.

## DELIVERY

Write `control/tasks/T141-M2-GEO-ENTITY-MENTION-RECORDER-REPOSITORY/DELIVERY.md` with the required evidence, then stop.
