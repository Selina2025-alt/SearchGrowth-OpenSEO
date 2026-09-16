# TASK — T142-M2-GEO-CITATION-RECORDER-REPOSITORY

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Implement one small, credential-free persistence port and repository for an accepted `GeoCitation` fact. It must turn one validated fact into exactly one append-only `geo_citations` insert using the accepted schema. It must not normalize URLs, classify ownership, match receipts, parse raw evidence, or implement a workflow.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §7; `07_GEO_MEASUREMENT_SPEC.md` §§5 and 8; `21_TEST_ACCEPTANCE_PLAN.md` §3; Accepted `docs/adr/ADR-005-versioned-geo-parse.md`; accepted T106–T108 citation/parse schema and migration tests; accepted T136 receipt relation contract; accepted T140 parse recorder and T141 mention recorder; and directly relevant existing repository patterns.

## IN SCOPE

1. Add a narrow server-side `GeoCitationRecorder` port and typed fact contract, plus an idiomatic repository adapter. The adapter maps exactly one supplied fact to exactly one `geo_citations` INSERT: `id`, `projectId`, `parseId`, `rawUrl`, `normalizedUrl`, `domain`, nullable `title`, nullable `position`, `sourceOwnership`, and nullable `matchedPublicationReceiptId`. Preserve the accepted `created_at` default. Do not add a migration, schema field, enum, snapshot, dependency, or business uniqueness rule.
2. Validate the storage-relevant runtime boundary before INSERT. Require nonempty id/project/parse/raw URL/normalized URL/domain identifiers; reuse the accepted citation-source-ownership Zod enum; allow only string or explicit `null` for title and receipt id; allow only integer or explicit `null` for position. Reject missing, invalid, or coercible stand-ins rather than trimming, normalizing, classifying, matching, or substituting values. URL values are caller-supplied opaque facts.
3. Preserve append-only versioned-parse semantics: no update, upsert, dedupe, retry, delete, parser-current selection, URL normalization, ownership classification, receipt matching, or lifecycle transition. Let accepted same-Project composite FKs surface cross-Project/dangling Parse and Receipt failures. Multiple supplied citation facts remain independent rows; do not add a uniqueness rule. The repository must not write or modify raw run, parse, entity mention, receipt, or release data.
4. Add focused real-storage tests with minimal valid parent fixtures. Cover faithful valid mapping; every canonical ownership value; nullable/present title/position/receipt mapping; multiple citation facts remaining independent; cross-Project/dangling Parse rejection; cross-Project/dangling Receipt rejection; raw run/parse/receipt unchanged; invalid runtime values rejected before a row; and source boundary with only one insert and no other table mutation. Retain dual-dialect schema-parity evidence without a migration.
5. No URL parser/canonicalizer, citation extraction runtime, entity matching, attribution, receipt matching, provider call, cache access, batch orchestration, UI, CRUD/server function, credentials, publishing, paid action, or production behavior.
6. Run focused tests, `format:check`, `types:check`, `lint`, full `test`, `build`, and `ci:check`, recording exact exits. A worktree bootstrap may use `corepack pnpm install --frozen-lockfile` only if dependencies are absent; record it and do not change lockfiles. If an aggregate gate is sandbox-denied, record it once and stop without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only: `corepack pnpm install --frozen-lockfile`, `corepack pnpm exec vitest run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`, access production, invoke a real provider, access credentials/accounts, access Prompt Explorer/R2/application-cache, or invoke publishing/paid behavior.

## ACCEPTANCE CRITERIA

- [ ] One typed port/fact and one repository adapter persist exactly one immutable citation row per accepted fact, with every accepted column faithfully mapped and no synthesized value except the database `created_at` default.
- [ ] Invalid identifiers, URL/optional/position values, and source-ownership enum values reject before INSERT; explicit nullable facts round-trip without URL normalization, ownership classification, receipt matching, inference, or coercion.
- [ ] Same-Project Parse and optional Receipt ownership is enforced by accepted database constraints; failures surface. Multiple supplied facts remain separate rows without a new uniqueness rule; raw runs, parses, mentions, receipts, and release data are unchanged.
- [ ] Focused real-storage tests demonstrate all listed invariants. Existing dual-dialect schema parity remains green; no migration is created.
- [ ] No parser/URL normalization/attribution/provider/cache/workflow/UI/CRUD/credential/publishing/production behavior, dependency, schema, migration, snapshot, or Accepted ADR/scope change occurs.
- [ ] DELIVERY contains fact-to-storage mapping, validation behavior, append-only/error evidence, exact gate exits, focused/full test summaries, changed paths, security/scope declaration, and final git status.

## DELIVERY

Write `control/tasks/T142-M2-GEO-CITATION-RECORDER-REPOSITORY/DELIVERY.md` with the required evidence, then stop.
