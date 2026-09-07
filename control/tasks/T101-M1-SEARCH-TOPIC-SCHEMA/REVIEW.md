# REVIEW T101-M1-SEARCH-TOPIC-SCHEMA — ROUND 1

VERDICT: BLOCKED
REVIEW DATE: 2026-09-07

## VERIFIED EVIDENCE

- The task adds only the SearchTopic record, validation, dual-dialect migrations/metadata, focused tests, and schema exports. It does not duplicate OpenSEO keyword/Project data or add CRUD/UI/connectors.
- Migration identifiers 0046/0024 follow T100. Local D1 migration and final dual-dialect `db:generate` consistency checks pass.
- Focused tests 201/201, full tests 1,193/1,193, types, lint, and build pass. Package manifest, lockfile, scope, and Accepted ADRs are unchanged.
- Status values `ACTIVE | ARCHIVED | MERGED` match the V1.0 reference and unsupported/lowercase/empty values are rejected by Zod.

## FINDINGS

### MAJOR — The merge pointer does not enforce its documented lifecycle and Project invariants

- Path/location: `src/db/search-growth.schema.ts` and `src/db/pg/search-growth.schema.ts`, `searchTopics.mergedIntoTopicId`; corresponding 0046/0024 migrations; `src/db/search-topic.test.ts`.
- Requirement violated: ADR-004 makes Topic ID the stable cross-domain identity. TASK requires a project-scoped topic, matching behavior for any self-reference, and states that another Project cannot be inferred. The implementation calls `merged_into_topic_id` a lifecycle invariant.
- Evidence: the single-column self-FK accepts a target topic owned by another Project. It also accepts `MERGED` with a null target, accepts `ACTIVE`/`ARCHIVED` with a target, accepts self-merge, and uses `ON DELETE SET NULL`, which converts a valid merged row into `status=MERGED` with no successor. The focused test exercises only a valid same-project merge and cannot detect these invalid states.
- Expected behavior: a merge target belongs to the same Project, only a `MERGED` topic has a non-null target, a `MERGED` topic must have one, self-merge is rejected, and deleting a referenced successor cannot silently invalidate the merged row.
- Reproduction: insert/update the current migration-backed table with (a) project A topic pointing to project B topic, (b) `MERGED` plus null pointer, (c) `ACTIVE` plus pointer, or (d) pointer equal to its own id; current DDL accepts each. Delete a referenced target; current FK sets the pointer null.
- Fix acceptance condition: enforce the same-Project relation in both dialects, preferably with a composite `(project_id, merged_into_topic_id) → (project_id, id)` FK and only the supporting unique target/index required by that FK; use restrictive delete behavior; add equivalent lifecycle/self-merge checks in both schemas, migrations, and snapshots; add fresh-migration tests for every invalid case and the valid stable-ID merge. Do not add canonical-name uniqueness or any other product rule.

### BLOCKER — Required format and aggregate CI gates are red

- Path/location: `control/tasks/T101-M1-SEARCH-TOPIC-SCHEMA/evidence/round-1/08-format-check.txt` and `13-ci-check.txt`; Controller-owned `control/ACCEPTANCE_LEDGER.md` at task base.
- Requirement violated: TASK requires `format:check` and complete `ci:check` exit 0.
- Evidence: both exit 1 on the pre-existing ledger table layout; the executor correctly left the Controller file untouched.
- Expected behavior: Controller supplies an exact formatting-only ledger correction, then the final task state passes both repository gates.
- Reproduction: the logs identify only `control/ACCEPTANCE_LEDGER.md`.
- Fix acceptance condition: Controller-supplied ledger content must be semantically identical and Prettier-clean. Claude must not edit the ledger; rerun both gates to completion and exit 0.

## ROUND 2 ACCEPTANCE

1. Implement only the merge-relation integrity described above, updating both schemas, both unmerged migrations, and both snapshots.
2. Preserve stable ID behavior and add negative migration-backed tests for cross-Project merge, status/pointer mismatch, self-merge, and referenced-target deletion.
3. Run final `db:generate` and confirm neither dialect produces another migration.
4. Rerun local migration, focused tests, format, types, lint, full tests, build, and full `ci:check`; every required gate must exit 0.
5. Update DELIVERY and finish normally. No keyword refs, CRUD, UI, connector, canonical-name uniqueness, or unrelated work.

## MERGE DECISION

DO NOT MERGE. Dispatch fix round 2 after the Controller formatting correction is present in the task worktree.
