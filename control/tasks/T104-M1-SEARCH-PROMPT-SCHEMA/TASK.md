# TASK T104-M1-SEARCH-PROMPT-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, versioned, Project-scoped `SearchPrompt` persistence and domain-validation foundation for V1.0. This task is schema and contract only. It must not implement prompt generation, GEO observation, execution, CRUD, repository/service/server functions, UI, or any external provider action.

## REQUIREMENT REFERENCES

Read root `CLAUDE.md` and only these directly relevant sources:

- `05_DOMAIN_DATA_MODEL.md` section 5 SearchPrompt
- `20_DATABASE_SCHEMA_GUIDE.md` sections 1, 2, and 6
- `21_TEST_ACCEPTANCE_PLAN.md` sections 1 and 2
- `29_SCOPE_LOCK.md`
- `30_TRACEABILITY_MATRIX.md` row(s) for Keyword/Prompt and GEO input
- `docs/adr/ADR-004-stable-topic-entity.md`
- `docs/adr/ADR-005-versioned-geo-parse.md`
- `schemas/domain-types.ts` PromptType/SearchPrompt references
- `schemas/migrations-reference.sql` `search_prompts` references
- accepted T100–T103 dual-dialect schema, migration, parity, and test patterns

## ENGINEER LOOP

Own `inspect → modify → test → inspect failure → fix → retest → DELIVERY`. Do not run environment, shell/path, version, package, or repository-wide discovery diagnostics. Work directly from the cited files and the existing schema patterns. Diagnose and repair task-local failures before returning.

## IN SCOPE

1. Add a normalized `search_prompts` table in both SQLite/D1 and PostgreSQL. Implement the V1.0 fields from `05_DOMAIN_DATA_MODEL.md`: id, Project, Topic, prompt text, normalized prompt, prompt type, optional persona and buying stage, optional MarketProfile, language, business fit, priority, version, active state, and system timestamps.
2. Reconcile the migration-reference `source` column with the direct domain model: retain it only as explicit storage provenance if the cited reference requires it, use no invented enum/ranking behavior, and represent it consistently in the DB/domain boundary. Record the reconciliation in DELIVERY.
3. Use explicit typed columns and Zod/domain contracts. `PromptType` is exactly `definition | problem | recommendation | comparison | alternative | risk | security | pricing | implementation | brand_validation | scenario`; reject unsupported, case-mismatched, and empty values at the runtime boundary. Validate prompt score boundaries directly required by the domain contract without creating ranking behavior.
4. Database-enforce Project ownership: prompt Topic and optional MarketProfile must belong to the same existing Project. Select and document matching delete behavior that cannot leave dangling prompt references. Reuse existing OpenSEO Project, SearchTopic, and SearchMarketProfile; do not create duplicate stores.
5. Implement the reference-defined versioned prompt identity rule `(project_id, normalized_prompt, market_profile_id, version)` only. Do not add any other business uniqueness, normalization algorithm, generated prompt, ranking, or matching rule.
6. Add focused migration-backed tests for a valid prompt, PromptType boundary rejection, same-Project Topic/MarketProfile relations, cross-Project rejection, delete behavior, versioned uniqueness, and version identity behavior. Add only directly necessary domain-contract tests.
7. Add forward migrations and metadata using the next identifiers after accepted T103, extend schema parity, and finish with dual-dialect `db:generate` producing no additional migration.

## OUT OF SCOPE

- Prompt generation, normalization implementation, templates, execution, provider calls, GEO observation run/parse, scheduler/workflow, CRUD/repository/service/server functions, APIs/forms/UI.
- SearchGrowthTarget, entity matching, opportunities, claims, content, media, release/distribution, experiments, audit/runtime controls, connectors, credentials, remote migration, deployment, publishing, or paid action.
- Any field not directly supported by the cited V1.0 contracts, dependency/lockfile change, broad refactor, infrastructure, Accepted ADR/scope change, credential use, external request, or production action.

## ARCHITECTURE AND DATA RULES

- Every prompt belongs to the existing OpenSEO Project and an existing same-Project SearchTopic.
- Optional MarketProfile ownership is database-enforced, not inferred in application code; null MarketProfile is allowed only when no profile is attached.
- SQLite/D1 and Postgres expose equivalent fields, nullability, defaults, numeric representation, enums, relationships, indexes, uniqueness, and delete behavior.
- Keep prompt data relational; never encode Project, Topic, MarketProfile, version, or score fields in JSON/text blobs.
- Treat `05_DOMAIN_DATA_MODEL.md` as the direct V1.0 field contract and `schemas/migrations-reference.sql` as a design reference. Reconcile a mismatch explicitly in DELIVERY without inventing unrelated behavior.

## ACCEPTANCE CRITERIA

- [ ] Both dialects define logically equivalent `search_prompts` storage with only approved V1.0 fields.
- [ ] PromptType and required score/runtime boundaries are explicit and Zod-validated; unsupported/case-mismatched/empty enum values are rejected.
- [ ] Same-Project Topic and optional MarketProfile relations are database-enforced; cross-Project references and dangling-parent deletion are proven impossible by focused tests.
- [ ] The sole versioned identity rule is migration-backed and tested; no additional business uniqueness or prompt behavior exists.
- [ ] Forward migrations/snapshots use next identifiers, local D1 migration succeeds, schema parity passes, and final dual-dialect `db:generate` produces no additional migration.
- [ ] No prompt execution/GEO/CRUD/UI/connector/later-domain work, duplicate OpenSEO storage, dependency/lockfile change, Accepted ADR/scope change, credential use, external request, or production action occurs.
- [ ] DELIVERY maps every changed path, reconciliation, invariant, test, limitation, command result, and final Git diff/status.

## APPROVED COMMANDS

Save concise sanitized evidence under `control/tasks/T104-M1-SEARCH-PROMPT-SCHEMA/evidence/round-1/`:

1. `node --version`
2. `corepack pnpm --version`
3. `corepack pnpm install --frozen-lockfile` once in the isolated worktree; manifests/lockfile must remain unchanged
4. `corepack pnpm exec prettier --write <only task-touched source/test files>`
5. `corepack pnpm run db:migrate:local`
6. `corepack pnpm run db:generate`
7. `corepack pnpm exec vitest run <focused prompt/schema-parity files>`
8. `corepack pnpm format:check`
9. `corepack pnpm types:check`
10. `corepack pnpm lint`
11. `corepack pnpm test`
12. `corepack pnpm build`
13. `corepack pnpm ci:check`
14. Read-only Git inspection: `git status`, `git rev-parse`, `git diff`, `git log`, `git show`, `git ls-files`.

Do not add/update packages, use unlisted commands, use `--dangerously-skip-permissions`, commit, merge, or touch `main`.

## DELIVERY

Write `control/tasks/T104-M1-SEARCH-PROMPT-SCHEMA/DELIVERY.md` using the repository template. Include a field/relationship inventory, source reconciliation, enum/validation decisions, migration identifiers, exact command exits/summaries, limitations, security notes, and final Git diff/status. Do not edit `REVIEW.md` or begin another task.
