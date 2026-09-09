# TASK T113-M1-CLAIM-ALLOWED-LANGUAGE-RELATION-SCHEMA

STATUS: AUTHORIZED
MILESTONE: M1 Core Domain
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add the normalized Claim `allowed_languages[]` relation. This is a schema/contract slice only: it persists each explicit allowed language without implementing policy evaluation, Claim verification, or a language-catalog subsystem.

## READ ONLY

Read `CLAUDE.md`, `05_DOMAIN_DATA_MODEL.md` §9 Claim and direct language-field conventions in §2/§4, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, accepted T111 Claim and T112 allowed-market schemas/migrations/tests, and existing language-tag schema patterns.

## IN SCOPE

1. Add equivalent D1/PostgreSQL normalized `claim_allowed_languages` storage with stable id, explicit `project_id`, `claim_id`, `language`, and an append-only relation timestamp following established mapping-table convention.
2. Database-enforce same-Project ownership between relation and Claim through the established composite FK pattern. Store `allowed_languages[]` as one normalized row per explicit language, never JSON or a text list.
3. Preserve the direct language value as an opaque explicit tag consistent with existing V1.0 language fields. Do not introduce a language catalog, locale inference, normalization algorithm, or an unsupported new enum/format rule.
4. Add only the relation-identity uniqueness needed to prevent duplicate Claim/language edges. Do not add policy evaluation, status transitions, ranking, or verification behavior.
5. Use forward D1 `0059` / PostgreSQL `0037` migrations plus snapshots/journals; never edit accepted migrations. Add migration-backed tests for valid persistence, cross-Project Claim rejection, dangling Claim/Project rejection, Claim/Project delete behavior, duplicate-edge rejection, literal language-value persistence, normalized relation shape, and dialect parity.
6. Run local migration, clean final dual-dialect `db:generate`, focused tests, format, types, lint, full tests, build, and `ci:check`; every gate must exit 0.

## OUT OF SCOPE

Language catalog or validation service, locale inference/normalization, Claim verification/reverification, policy evaluation/runtime, content packages, CRUD/UI, providers, credentials, publishing, paid/production action, dependency changes, ADR/scope change.

## APPROVED COMMANDS

Use the established safe schema-task command matrix only: node/corepack version checks, frozen install, task-file Prettier, local D1 migration, dual-dialect generation, focused Vitest, format check, types check, lint, full test, build, `ci:check`, and read-only Git inspection. Do not use unlisted commands, `--dangerously-skip-permissions`, commit, merge, push, or touch `main`.

## DELIVERY

Write `control/tasks/T113-M1-CLAIM-ALLOWED-LANGUAGE-RELATION-SCHEMA/DELIVERY.md` with relation/FK/delete decisions, language-value reconciliation, migration IDs, exact gate exits, `db:generate` result, scope/security declaration, changed files, and Git status; then stop.
