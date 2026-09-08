# TASK T111-M1-CLAIM-SOURCE-RELATION-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized, Project-scoped Claim foundation and its same-Project SourceRef relation. This is a persistence/contract slice only; it does not implement claim verification or any gate/runtime behavior.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §9 Claim / SourceRef, `21_TEST_ACCEPTANCE_PLAN.md` §10, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, `schemas/domain-types.ts` Claim-related types, T110 accepted SourceRef schema/migrations/tests, and accepted dual-dialect relation patterns.

## IN SCOPE

1. Add equivalent D1/PostgreSQL `claims` storage for the direct Claim core: stable id, explicit Project ownership, `claim_text`, status `APPROVED | UNVERIFIED | EXPIRED | REJECTED`, nullable `verified_by`, `last_verified_at`, `expires_at`, and direct Claim classification `PUBLIC_MARKETING | INTERNAL | RESTRICTED`.
2. Add a normalized `claim_source_refs` relation. Use database-level composite foreign keys and any necessary *referential* composite parent keys so a link may only join a Claim and SourceRef from the same Project. Do not use JSON/text arrays for `source_refs[]`.
3. Preserve source-evidence provenance: relation rows carry no mutable evidence payload, while later controlled Claim verification remains possible. Do not add a verification workflow, a content/publication gate, provider calls, or runtime status transitions. Do not introduce a business uniqueness rule beyond the link identity needed to prevent duplicate Claim/SourceRef edges.
4. Defer `allowed_markets[]` and `allowed_languages[]` to a later dedicated policy-relation task; do not store them as JSON or text lists in this task.
5. Use forward D1 `0057` / PostgreSQL `0035` migrations plus snapshots/journals; never edit accepted migrations. Add migration-backed tests for valid same-Project link, cross-Project rejection in both directions, dangling-parent rejection, Project delete behavior, enum/nullability constraints, duplicate-edge behavior, normalized relation shape, and dialect parity.
6. Run local migration, clean final dual-dialect `db:generate`, focused tests, format, types, lint, full tests, build, and `ci:check`; every gate must exit 0.

## OUT OF SCOPE

Claim verification/reverification or blocking logic, content packages, market/language policy relations, CRUD/UI, URL/content fetching, external providers, credentials, publishing, paid/production action, dependency changes, ADR/scope change.

## APPROVED COMMANDS

Use the established safe schema-task command matrix only: node/corepack version checks, frozen install, task-file Prettier, local D1 migration, dual-dialect generation, focused Vitest, format check, types check, lint, full test, build, `ci:check`, and read-only Git inspection. Do not use unlisted commands, `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T111-M1-CLAIM-SOURCE-RELATION-SCHEMA/DELIVERY.md` with Claim-field reconciliation, FK/identity/delete decisions, migration IDs, test and gate exits, `db:generate` result, scope/security declaration, changed files, and Git status; then stop.
