# TASK T103-M1-ENTITY-ALIAS-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, Project-scoped `TrackedEntity` and `EntityAlias` persistence and domain validation foundation for the V1.0 brand/product/competitor model. This task is storage and contract only; parser, matching workflow, CRUD, and UI remain separate.

## REQUIREMENT REFERENCES

Read root `CLAUDE.md` and only these directly relevant sources:

- `05_DOMAIN_DATA_MODEL.md` sections 4 and EntityAlias
- `20_DATABASE_SCHEMA_GUIDE.md` sections 1, 2, and 6
- `21_TEST_ACCEPTANCE_PLAN.md` sections 1 and 2
- `29_SCOPE_LOCK.md`
- `30_TRACEABILITY_MATRIX.md` row `品牌/产品/竞品`
- `docs/adr/ADR-004-stable-topic-entity.md`
- `schemas/domain-types.ts` TrackedEntity, TrackedEntityType, AliasMatchMode references
- `schemas/migrations-reference.sql` tracked_entities/entity_aliases references
- accepted T100–T102 dual-dialect schema, migration, parity, and test patterns

## ENGINEER LOOP

Own `inspect → modify → test → inspect failure → fix → retest → DELIVERY`. Diagnose and repair task-local failures before returning.

## IN SCOPE

1. Add one normalized `tracked_entities` table in both SQLite/D1 and Postgres with the approved entity identity, Project ownership, type, canonical name, optional canonical domain/product URL, optional owning entity relation if required by the current domain model, active state, and system timestamps.
2. Add one normalized `entity_aliases` table in both dialects with entity ownership, alias text, optional locale, approved match mode, case sensitivity, priority where required by the current domain model, and creation timestamp.
3. Use explicit typed columns and matching Zod/domain contracts. Entity types are `BRAND | PRODUCT | COMPETITOR | COMPETITOR_PRODUCT`; alias match modes are `EXACT | CASE_INSENSITIVE_EXACT | WORD_BOUNDARY | UNICODE_SUBSTRING | DOMAIN`.
4. Enforce Project ownership and entity/alias relationships in the database. An alias must not point across Projects; deleting a Project or entity must not leave dangling aliases. Preserve stable entity IDs under later rename/archive/matching operations.
5. Add focused migration-backed tests for valid entity/alias records, enum boundary rejection, same-Project ownership, cross-Project rejection, duplicate behavior only where directly justified by the reference, and deletion behavior. Do not implement parser or matching logic.
6. Add forward migrations and metadata using the next identifiers after accepted T102, extend schema parity, and finish with `db:generate` producing no additional migration.

## OUT OF SCOPE

- Parser, alias matching, substring safety policy enforcement in a runtime matcher, entity CRUD/repositories/services/server functions, API/forms/UI.
- SearchGrowthTarget, Prompt, GEO, Opportunity, Claim, Content, Media, Release, Distribution, Experiment, Audit, RuntimeControl, connectors, credentials, remote migration, deployment, publication, or paid action.
- Hidden canonical-name/alias uniqueness, automatic normalization, fuzzy matching, generated aliases, ranking changes, or other unapproved business rules. The domain rule against overly short generic substring aliases belongs to later validation/matching work unless an existing accepted boundary already defines it.
- Accepted ADR/scope changes, dependency or lockfile changes, broad refactors, or new infrastructure.

## ARCHITECTURE AND DATA RULES

- Every entity belongs to the existing OpenSEO Project; no second Project or competitor system may be created.
- Every alias belongs to one tracked entity and inherits Project ownership through an explicit relationship. Use a same-Project composite relation if needed to make cross-Project aliases impossible at the database boundary.
- SQLite/D1 and Postgres must expose equivalent fields, nullability, defaults, enums, relationships, indexes, and delete behavior.
- Keep entity and alias data relational; never encode aliases, ownership, or match state in JSON/text blobs.
- Treat `schemas/domain-types.ts` and `05_DOMAIN_DATA_MODEL.md` as the V1.0 contract. If the design reference omits a field that the domain model requires, document the reconciliation in DELIVERY without inventing unrelated fields.

## ACCEPTANCE CRITERIA

- [ ] Both dialects define logically equivalent `tracked_entities` and `entity_aliases` tables with only approved fields.
- [ ] Entity and alias enums are explicit and Zod-validated; unsupported/lowercase/empty values are rejected.
- [ ] Project ownership and entity/alias relationships are database-enforced, including cross-Project rejection and no dangling aliases after parent deletion.
- [ ] Focused storage tests prove valid records, stable entity identity shape, ownership isolation, and deletion behavior.
- [ ] Forward migrations/snapshots use the next identifiers, local D1 migration succeeds, schema parity passes, and final dual-dialect `db:generate` produces no additional migration.
- [ ] No parser/matcher/CRUD/UI/connector/later-domain work, duplicate OpenSEO storage, dependency/lockfile change, Accepted ADR/scope change, credential use, external request, or production action occurs.
- [ ] DELIVERY maps every changed path, field decision, invariant, test, limitation, and command result.

## APPROVED COMMANDS

Save concise sanitized evidence under `control/tasks/T103-M1-ENTITY-ALIAS-SCHEMA/evidence/round-1/`:

1. `node --version`
2. `corepack pnpm --version`
3. `corepack pnpm install --frozen-lockfile` once in the isolated worktree; manifests/lockfile must remain unchanged
4. `corepack pnpm exec prettier --write <only task-touched source/test files>`
5. `corepack pnpm run db:migrate:local`
6. `corepack pnpm run db:generate`
7. `corepack pnpm exec vitest run <focused entity/alias/schema-parity tests>`
8. `corepack pnpm format:check`
9. `corepack pnpm types:check`
10. `corepack pnpm lint`
11. `corepack pnpm test`
12. `corepack pnpm build`
13. `corepack pnpm ci:check`
14. Read-only Git inspection: `git status`, `git diff`, `git log`, `git show`, `git ls-files`, `git rev-parse`.

Do not add/update packages, use unlisted commands, use `--dangerously-skip-permissions`, commit, merge, or touch `main`.

## DELIVERY

Write `control/tasks/T103-M1-ENTITY-ALIAS-SCHEMA/DELIVERY.md` using the repository template. Include field and ownership inventory, enum/validation decisions, migration identifiers, exact command exits/summaries, limitations, security notes, and final Git diff/status. Do not edit `REVIEW.md` or begin another task.
