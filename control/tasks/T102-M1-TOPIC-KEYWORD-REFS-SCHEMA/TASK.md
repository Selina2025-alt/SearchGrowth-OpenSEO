# TASK T102-M1-TOPIC-KEYWORD-REFS-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, same-Project mapping from an accepted `SearchTopic` to the existing canonical OpenSEO saved keyword record. This task closes the V1.0 `Topic稳定` mapping evidence without duplicating keyword storage or adding CRUD/UI.

## REQUIREMENT REFERENCES

Read root `CLAUDE.md` and only these directly relevant sources:

- `04_OPENSEO_REUSE_CODE_MAP.md` keyword reuse guidance
- `05_DOMAIN_DATA_MODEL.md` section 3
- `20_DATABASE_SCHEMA_GUIDE.md` sections 1, 2, and 6
- `21_TEST_ACCEPTANCE_PLAN.md` sections 1 and 2
- `29_SCOPE_LOCK.md`
- `30_TRACEABILITY_MATRIX.md` row `Topic稳定`
- `docs/adr/ADR-004-stable-topic-entity.md`
- `schemas/migrations-reference.sql` only the `search_topic_keyword_refs` reference
- accepted T100/T101 schema, migration, parity, and test patterns
- existing SQLite/Postgres `savedKeywords` definitions and existing keyword persistence tests needed to reuse the canonical OpenSEO record

## ENGINEER LOOP

Own `inspect → modify → test → inspect failure → fix → retest → DELIVERY`. Diagnose and repair task-local failures before returning.

## IN SCOPE

1. Add one normalized `search_topic_keyword_refs` table in both Search Growth dialect schemas with `id`, `project_id`, `topic_id`, `open_seo_keyword_ref`, and `created_at`, following accepted repository conventions.
2. Reference the accepted `search_topics` table and the existing OpenSEO `saved_keywords` table. Do not create or copy keyword text, market fields, ranks, tags, or another keyword entity.
3. Enforce that the topic, saved keyword, and mapping all belong to the same Project in both dialects. A supporting `(project_id, id)` unique index may be added to `saved_keywords` only if required by the composite foreign key; it must not change existing business uniqueness.
4. Enforce one mapping per `(topic_id, open_seo_keyword_ref)` as specified by the V1.0 reference. Define and test explicit cascade/restrict behavior so deleting a topic, saved keyword, or Project cannot leave a dangling mapping.
5. Add migration-backed tests proving a valid same-Project mapping, duplicate rejection, cross-Project rejection for both parent directions, deletion behavior, and that the mapping remains attached to the same stable topic ID across an allowed topic lifecycle mutation.
6. Add forward migrations and Drizzle metadata for both dialects using the next identifiers after accepted T101. Extend schema parity and finish with `db:generate` producing no additional migration.

## OUT OF SCOPE

- New keyword storage or changes to keyword text/location/language semantics.
- Topic or keyword CRUD, repositories, services, server functions, API contracts, forms, or UI.
- SearchGrowthTarget, Entity/Alias, Prompt, GEO, Opportunity, Claim, Content, Media, Release, Distribution, Experiment, Audit, or RuntimeControl work.
- M0.5 connectors, external accounts/requests, credentials, remote migrations, deployment, publishing, or paid action.
- Canonical topic uniqueness, multi-topic exclusivity for a keyword, ranking rules, primary-keyword concepts, weights, roles, ordering, confidence, or any other unapproved mapping field/rule.
- Accepted ADR/scope changes, dependencies, lockfile changes, broad refactors, or new infrastructure.

## ARCHITECTURE AND DATA RULES

- Reuse `saved_keywords` as the canonical OpenSEO keyword source. The mapping stores only its ID reference.
- Keep ownership and relations in explicit columns and foreign keys, never JSON/text payloads.
- SQLite/D1 and Postgres must expose equivalent fields, nullability, defaults, uniqueness, foreign keys, indexes, and delete behavior.
- Preserve T101 stable topic identity and merge invariants. Do not weaken or replace accepted constraints.
- Any supporting parent unique index exists only to make a same-Project composite foreign key valid; explain it in DELIVERY and do not add unrelated uniqueness.

## ACCEPTANCE CRITERIA

- [ ] Both dialects define one logically equivalent `search_topic_keyword_refs` table with exactly the approved fields.
- [ ] Valid mappings point to existing SearchTopic and existing OpenSEO saved keyword records in the same Project.
- [ ] Duplicate topic-keyword pairs and cross-Project parent combinations are rejected by database constraints, not application convention.
- [ ] Parent/Project deletion behavior cannot leave dangling refs and matches between dialects.
- [ ] Migration-backed tests prove valid reuse, negative integrity cases, deletion behavior, and stable topic mapping across lifecycle mutation.
- [ ] Forward migrations/snapshots use the next identifiers, local D1 migration succeeds, schema parity passes, and final dual-dialect `db:generate` produces no additional migration.
- [ ] No duplicate keyword storage, CRUD/UI/connector/later-domain work, dependency/lockfile change, Accepted ADR/scope change, credential use, external request, or production action occurs.
- [ ] DELIVERY accounts for every changed path, constraint decision, test, limitation, and command result.

## APPROVED COMMANDS

Save concise sanitized evidence under `control/tasks/T102-M1-TOPIC-KEYWORD-REFS-SCHEMA/evidence/round-1/`:

1. `node --version`
2. `corepack pnpm --version`
3. `corepack pnpm install --frozen-lockfile` once in the isolated worktree; manifests/lockfile must remain unchanged
4. `corepack pnpm exec prettier --write <only task-touched source/test files>`
5. `corepack pnpm run db:migrate:local`
6. `corepack pnpm run db:generate`
7. `corepack pnpm exec vitest run <focused schema/parity/mapping tests>`
8. `corepack pnpm format:check`
9. `corepack pnpm types:check`
10. `corepack pnpm lint`
11. `corepack pnpm test`
12. `corepack pnpm build`
13. `corepack pnpm ci:check`
14. Read-only Git inspection: `git status`, `git diff`, `git log`, `git show`, `git ls-files`, `git rev-parse`.

Do not add/update packages, use unlisted commands, use `--dangerously-skip-permissions`, commit, merge, or touch `main`.

## DELIVERY

Write `control/tasks/T102-M1-TOPIC-KEYWORD-REFS-SCHEMA/DELIVERY.md` using the repository template. Include table/constraint inventory, OpenSEO reuse proof, migration identifiers, exact command exits/summaries, limitations, security notes, and final Git diff/status. Do not edit `REVIEW.md` or begin another task.
