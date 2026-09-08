# TASK T107-M1-GEO-ENTITY-MENTION-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized `GeoEntityMention` persistence and domain-contract foundation for V1.0. This is a schema-and-contract slice only. It must not implement parsing, matching, recommendation scoring, extraction, reparse workflow, CRUD, UI, or provider action.

## REQUIREMENT REFERENCES

Read root `CLAUDE.md` and only:

- `05_DOMAIN_DATA_MODEL.md` section 7 GeoEntityMention
- `20_DATABASE_SCHEMA_GUIDE.md` sections 1–4
- `21_TEST_ACCEPTANCE_PLAN.md` sections 5–6
- `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`
- `docs/adr/ADR-004-stable-topic-entity.md`, `docs/adr/ADR-005-versioned-geo-parse.md`
- `schemas/domain-types.ts` GeoEntityMention
- `schemas/migrations-reference.sql` `geo_entity_mentions`
- accepted T103/T105/T106 schema, migration, parity, and test patterns

## IN SCOPE

1. Add equivalent D1/SQLite and PostgreSQL `geo_entity_mentions` tables. Use explicit relational FKs to existing `geo_observation_parses` and `tracked_entities`, plus only the direct V1.0 mention fields: stable id where required by established schema convention, parse id, entity id, mentioned, recommended, mention position, optional sentiment, and optional evidence-span reference.
2. Use Zod/domain validation for any direct enum/status field only. `mentioned` is required boolean; `recommended`, sentiment, evidence reference, and position follow direct contract/nullability. Do not invent sentiment enums, matching rules, ranking, or a parser output JSON blob.
3. Define and migration-test relationship/delete behavior that cannot leave dangling mentions. Preserve Parse-version isolation: mentions remain attached to their source Parse, never to a mutable "current" parse pointer. Add the reference-defined identity/uniqueness only if directly supported; otherwise do not add business uniqueness.
4. Reconcile any missing Project-scoping relationship transparently in DELIVERY. Never encode a Project/Parse/Entity relation as JSON/text or duplicate OpenSEO/TrackedEntity storage. Do not widen accepted T105/T106 contracts without a directly necessary migration-backed integrity requirement.
5. Add focused migration-backed tests for valid persistence, parent FK rejection, delete behavior, nullable fields, Parse-version isolation, dual-dialect parity, and any approved validation/uniqueness invariant.
6. Use next migrations D1 `0052` and PostgreSQL `0030`; run local D1 migration, final dual-dialect `db:generate` no-op, focused tests, format, types, lint, full tests, build, and `ci:check`.

## OUT OF SCOPE

Parser/model/provider/network calls; entity extraction/matching/recommendation/sentiment scoring; current-pointer/reparse workflow; GeoCitation; metrics; CRUD/repositories/services/server functions/UI; dependencies/lockfile; credentials, publishing, paid or production actions; ADR/scope changes.

## ACCEPTANCE CRITERIA

- [ ] Both dialects have equivalent normalized mention storage and explicit Parse/Entity FKs.
- [ ] Parse-version isolation, parent integrity, delete behavior, and direct field nullability are migration-backed and tested.
- [ ] No unapproved parser/matching/score/current-pointer/JSON-relationship behavior or added business uniqueness exists.
- [ ] `0052`/`0030` migrations and snapshots agree with schemas; D1 migration, db generation, parity, all specified test/build/CI gates exit 0.
- [ ] DELIVERY records every source reconciliation, field/invariant, command exit, limitation, scope, security, and final Git status.

## APPROVED COMMANDS

Save concise sanitized evidence under `control/tasks/T107-M1-GEO-ENTITY-MENTION-SCHEMA/evidence/round-1/`.

1. `node --version`
2. `corepack pnpm --version`
3. `corepack pnpm install --frozen-lockfile`
4. `corepack pnpm exec prettier --write <only task-touched source/test files>`
5. `corepack pnpm run db:migrate:local`
6. `corepack pnpm run db:generate`
7. `corepack pnpm exec vitest run <focused geo-entity-mention/schema-parity files>`
8. `corepack pnpm format:check`
9. `corepack pnpm types:check`
10. `corepack pnpm lint`
11. `corepack pnpm test`
12. `corepack pnpm build`
13. `corepack pnpm ci:check`
14. Read-only Git inspection: `git status`, `git rev-parse`, `git diff`, `git log`, `git show`, `git ls-files`.

Do not use unlisted commands, `--dangerously-skip-permissions`, commit, merge, or touch `main`.

## DELIVERY

Write `control/tasks/T107-M1-GEO-ENTITY-MENTION-SCHEMA/DELIVERY.md` using the repository template, then stop. Do not edit `REVIEW.md` or begin another task.
