# TASK T109-M1-OPPORTUNITY-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, Project-scoped `SearchGrowthOpportunity` storage and domain-validation foundation. This is schema/contract only: no opportunity computation, scoring engine, ranking, workflow, CRUD, UI, or external action.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §8, `21_TEST_ACCEPTANCE_PLAN.md` §§7–8, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, `schemas/domain-types.ts` OpportunityProfile/PageFitAction/SearchGrowthOpportunity, `schemas/migrations-reference.sql`, and accepted T100–T108 patterns.

## IN SCOPE

1. Add equivalent D1/PostgreSQL `search_growth_opportunities` storage for direct/reconciled V1 fields: id, Project, Topic, optional MarketProfile, profile/type, page-fit action, optional target URL, score snapshot, data-quality snapshot, warnings/evidence snapshot where directly supported, reason, recommended action, source snapshot time, and system timestamps.
2. Database-enforce same-Project Topic and optional MarketProfile ownership with composite FKs and explicit Project identity. Add only required supporting target indexes; no additional business uniqueness.
3. Zod-validate exactly the canonical OpportunityProfile and PageFitAction unions plus directly supported DataQuality boundary. Do not calculate or mutate score/profile/action. Score/evidence data may be immutable snapshot payloads only, never relational identity encoded in JSON.
4. Add migration-backed valid, enum rejection, same/cross-Project, delete, nullable, snapshot persistence, and parity tests. Use D1 `0055` / PostgreSQL `0033`, local migration, clean final dual-dialect generation, focused tests, format, types, lint, full tests, build, and `ci:check`.

## OUT OF SCOPE

Opportunity scoring/profiles/demand/GEO gap/PageFit calculation, recommendation runtime, parser/provider/network, CRUD/UI, dependencies, credentials, publishing, paid/production action, ADR/scope change.

## APPROVED COMMANDS

Use the existing T108 approved command matrix exactly and save concise evidence in `control/tasks/T109-M1-OPPORTUNITY-SCHEMA/evidence/round-1/`. Do not use unlisted commands, `--dangerously-skip-permissions`, commit, merge, or touch `main`.

## DELIVERY

Write `control/tasks/T109-M1-OPPORTUNITY-SCHEMA/DELIVERY.md` with field reconciliation, relationship/enum decisions, migration IDs, command exits, scope/security declaration, and final Git status; then stop.
