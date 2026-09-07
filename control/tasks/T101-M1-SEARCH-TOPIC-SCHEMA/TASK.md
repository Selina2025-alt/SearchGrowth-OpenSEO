# TASK T101-M1-SEARCH-TOPIC-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, project-scoped `SearchTopic` persistence and validation foundation with a stable identity across topic lifecycle changes. This task implements only the topic record. Keyword refs, prompts, pages, opportunities, content, experiments, CRUD, and UI remain separate tasks.

## REQUIREMENT REFERENCES

Read root `CLAUDE.md` and only these directly relevant sources:

- `05_DOMAIN_DATA_MODEL.md` section 3 (`SearchTopic`)
- `20_DATABASE_SCHEMA_GUIDE.md` sections 1, 2, and 6
- `21_TEST_ACCEPTANCE_PLAN.md` sections 1 and 2
- `29_SCOPE_LOCK.md`
- `30_TRACEABILITY_MATRIX.md` row `Topic稳定`
- `docs/adr/ADR-004-stable-topic-entity.md`
- `schemas/domain-types.ts` only for the existing V1.0 SearchTopic status/lifecycle reference
- existing T100 SearchMarketProfile schema/migration/parity patterns and existing Project FK, ID, timestamp, validation, and migration conventions needed for this slice

## ENGINEER LOOP

Own `inspect → modify → test → inspect failure → fix → retest → DELIVERY`. Use the accepted T100 pattern as the local precedent. Diagnose and repair task-local failures before returning.

## IN SCOPE

1. Extend the existing Search Growth schema modules with one normalized `search_topics` table for SQLite/D1 and Postgres.
2. Represent `id`, existing `project_id`, `canonical_name`, `locale`, optional `description`, and lifecycle `status` as explicit typed columns. Follow accepted repository ID/timestamp conventions where system timestamps are needed.
3. Use the V1.0 reference lifecycle values `ACTIVE | ARCHIVED | MERGED` and validate them with Zod at the domain boundary. If the accepted reference's optional `merged_into_topic_id` is required to represent `MERGED` without losing stable identity, implement it as a nullable self-reference consistently in both dialects and explain the invariant; do not add any other field.
4. Preserve stable IDs when canonical name, description, or status changes. Add a focused persistence test that demonstrates lifecycle mutation does not replace the topic ID or project ownership.
5. Bind every topic to the existing OpenSEO Project through an explicit foreign key. Add only indexes or uniqueness rules directly justified by existing repository conventions or the referenced V1.0 artifacts; do not invent hidden normalization or merge behavior.
6. Add forward migrations and Drizzle metadata for both dialects using the next identifiers after accepted T100, then prove final schema/snapshot consistency with `db:generate` producing no additional migration.
7. Extend schema parity coverage and meaningful topic validation/storage tests. The traceability `mapping` gate is not complete in this task; it will be closed by a later `search_topic_keyword_refs` task using existing OpenSEO saved keywords.

## OUT OF SCOPE

- `search_topic_keyword_refs` or any duplication/modification of OpenSEO saved keyword, rank, GSC, GA4, Project, page, or competitor storage.
- SearchGrowthTarget, Entity/Alias, Prompt, GEO, Opportunity, Claim, Content, Media, Release, Distribution, Experiment, Audit, or RuntimeControl implementation.
- Repository/service/server-function CRUD, API contracts, forms, or UI.
- M0.5 connectors, external accounts/requests, credentials, remote migration, deployment, publication, or paid action.
- Accepted ADR/scope changes, dependency or lockfile changes, broad refactors, or new infrastructure.

## ARCHITECTURE AND DATA RULES

- Use the existing OpenSEO Project and accepted `src/db/search-growth.schema.ts` / Postgres mirror; do not create another Project or another Search Growth schema layer.
- SQLite/D1 and Postgres must expose equivalent logical fields, nullability, defaults, enums, relationships, and supported constraints.
- Keep relational/searchable data in columns. Do not encode topic relations or lifecycle state in JSON.
- A topic ID is the stable cross-domain reference from ADR-004. Rename/archive/merge semantics must never silently create a replacement identity.
- Keep this task compatible with later explicit keyword refs and prompt/page/opportunity/content/experiment relations without implementing them now.

## ACCEPTANCE CRITERIA

- [ ] Both dialect schemas define one logically equivalent, project-scoped `search_topics` table with the required fields.
- [ ] Topic lifecycle values are explicit and Zod-validated; unsupported/lowercase/empty status values are rejected.
- [ ] The Project foreign key and any justified self-reference have matching cross-dialect behavior.
- [ ] A focused storage test proves rename/archive or merge-related mutation retains the same topic ID and Project; another Project cannot be inferred.
- [ ] Forward migrations and snapshots use the next identifiers, local D1 migration succeeds, and final `db:generate` reports no additional schema change in either dialect.
- [ ] Schema parity includes `search_topics` and passes.
- [ ] No keyword-ref/CRUD/UI/connector/later-domain work or duplicate OpenSEO storage is included.
- [ ] No product scope, Accepted ADR, dependency, lockfile, credential, external service, or production change occurs.
- [ ] DELIVERY accounts for every path, constraint decision, test, limitation, and command result.

## APPROVED COMMANDS

Run independently and save concise sanitized evidence under `control/tasks/T101-M1-SEARCH-TOPIC-SCHEMA/evidence/round-1/`:

1. `node --version`
2. `corepack pnpm --version`
3. `corepack pnpm install --frozen-lockfile` once for the isolated worktree; manifests/lockfile must stay unchanged
4. `corepack pnpm exec prettier --write <only task-touched source/test files>`
5. `corepack pnpm run db:migrate:local`
6. `corepack pnpm run db:generate`
7. `corepack pnpm exec vitest run <focused schema/parity/topic tests>`
8. `corepack pnpm format:check`
9. `corepack pnpm types:check`
10. `corepack pnpm lint`
11. `corepack pnpm test`
12. `corepack pnpm build`
13. `corepack pnpm ci:check`
14. Read-only Git inspection: `git status`, `git diff`, `git log`, `git show`, `git ls-files`, `git rev-parse`.

Do not add/update packages, use unlisted commands, or use `--dangerously-skip-permissions`.

## DELIVERY

Write `control/tasks/T101-M1-SEARCH-TOPIC-SCHEMA/DELIVERY.md` using the repository template. Include schema/migration inventory, lifecycle and constraint rationale, stable-ID evidence, exact command exits/summaries, limitations, security notes, and final Git diff/status. Do not commit, merge, edit `REVIEW.md`, or begin another task.
