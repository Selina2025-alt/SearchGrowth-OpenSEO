# REVIEW T103-M1-ENTITY-ALIAS-SCHEMA — ROUND 1

VERDICT: BLOCKED
REVIEW DATE: 2026-09-08

## VERIFIED

- The implementation is otherwise bounded to entity/alias schema, Zod contracts, dual-dialect migrations/snapshots, and focused storage tests. It reuses the existing Project and database-enforces same-Project aliases with a composite FK.
- D1 0048 and Postgres 0026 snapshots match their schemas; focused 244/244, full 1,236 tests, format, types, lint, build, and `ci:check` all have exit 0 evidence.
- No dependency, lockfile, ADR, scope-lock, credential, external, publishing, or production change appears in the diff.

## FINDINGS

- MAJOR — two direct V1.0 domain fields are omitted. `05_DOMAIN_DATA_MODEL.md` §4 lists optional `owning_entity_id?` for `TrackedEntity` and `priority` for `EntityAlias`; both are absent from the SQLite/Postgres schemas, 0048/0026 migrations, snapshots, Zod/domain modules, and storage tests. The DELIVERY's decision to defer them because `schemas/migrations-reference.sql` and `schemas/domain-types.ts` omit them conflicts with the task's requirement to treat `05_DOMAIN_DATA_MODEL.md` as a V1.0 contract and reconcile reference omissions without inventing unrelated fields.

## ROUND 2 ACCEPTANCE

1. Add nullable `owning_entity_id` as an explicit, same-Project tracked-entity relationship in both dialects. Select a matching delete action that cannot leave a dangling ownership reference; record and migration-test it.
2. Add explicit `priority` to `entity_aliases` with matching type, nullability, default, and Zod/domain representation in both dialects. It is storage metadata only; do not implement ranking or matching behavior.
3. Regenerate the unmerged 0048/0026 migrations, snapshots, and journals in place; final dual-dialect `db:generate` must produce no additional migration.
4. Add migration-backed tests for same-Project ownership, cross-Project ownership rejection, ownership delete behavior, alias priority persistence/default, and preserve existing alias invariants.
5. Rerun the approved local migration and gates to exit 0; update DELIVERY. Do not expand scope.

## MERGE DECISION

DO NOT MERGE. Dispatch executor fix round 2. This is a bounded schema-contract correction; no model escalation or Human Gate is required.

---

# REVIEW T103-M1-ENTITY-ALIAS-SCHEMA — ROUND 2

VERDICT: BLOCKED
REVIEW DATE: 2026-09-08

## VERIFIED

- The Round 2 executor created no new DELIVERY and did not alter the existing Round 1 implementation evidence.
- Its terminal result records `subtype: error_max_turns` after 121 turns. The recorded denials are shell-environment probes outside the TASK allowlist, rather than a task implementation or gate failure.

## FINDINGS

- BLOCKER — executor did not complete the bounded correction. Evidence: `control/tasks/T103-M1-ENTITY-ALIAS-SCHEMA/runs/claude-round-2-20260908-090046.stdout.json` ends with `Reached maximum number of turns (120)` and no Round 2 DELIVERY exists. The Round 1 contract omissions of `tracked_entities.owning_entity_id` and `entity_aliases.priority` therefore remain unresolved. Expected behavior: implement and validate both fields within the approved task boundary. Reproduction: dispatch Round 2 under the then-current task packet; executor spends turns on disallowed environment probes and exits before delivery.

## ROUND 3 ACCEPTANCE

1. Implement every Round 2 acceptance item exactly as written, with no environment-probe commands.
2. Write a new DELIVERY with the required command exits and field/invariant mapping.
3. This is the final executor round. A missing DELIVERY, failed required gate, or unresolved contract field requires a Human Gate.

## MERGE DECISION

DO NOT MERGE. Dispatch the final bounded executor Round 3.
