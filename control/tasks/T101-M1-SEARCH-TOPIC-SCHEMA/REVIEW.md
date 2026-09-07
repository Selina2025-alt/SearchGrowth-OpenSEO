# REVIEW T101-M1-SEARCH-TOPIC-SCHEMA — ROUND 2

VERDICT: PASS
REVIEW DATE: 2026-09-07

## ACCEPTANCE RESULT

- Both SQLite/D1 and Postgres define the same normalized, Project-scoped `search_topics` record with explicit columns, lifecycle values, timestamps, and Project ownership.
- The merge relation is database-enforced as `(project_id, merged_into_topic_id) → (project_id, id)` in both dialects. The supporting `(project_id, id)` unique index exists only for that foreign key; no canonical-name or other product uniqueness was introduced.
- Three matching CHECK constraints enforce `MERGED` iff a target is present and reject self-merge. `ON DELETE NO ACTION` prevents a referenced successor from being silently removed while preserving whole-Project cascade behavior.
- D1 migration 0046 and Postgres migration 0024 are the next identifiers after accepted T100. Their SQL, journals, and snapshots contain the matching columns, indexes, foreign keys, delete actions, and CHECK names. Final dual-dialect `db:generate` reports no schema changes.
- Zod accepts only `ACTIVE | ARCHIVED | MERGED`. Stable-ID storage coverage proves rename, archive, and valid same-Project merge mutate one row without replacing its ID or Project.
- Scope remains limited to the topic record. No keyword refs, CRUD, UI, connector, downstream domain, duplicate OpenSEO storage, dependency, lockfile, ADR, scope, credential, external request, or production change is present.

## VERIFIED TEST AND BUILD EVIDENCE

- Fresh local D1 migration through 0046: exit 0; immediate rerun reports no migrations to apply.
- Focused executor suite: 207/207 passed, including seven migration-backed topic storage tests and 189 schema-parity tests.
- Controller independent rerun: `src/db/search-topic.test.ts` plus `src/types/schemas/search-topic.test.ts`, 10/10 passed.
- Repository format, types, lint, full 1,199-test suite, production build, and aggregate `ci:check`: all exit 0.
- `git diff --check`: clean. Package manifests, lockfile, control-plane policy files, Accepted ADRs, and scope lock are unchanged.

## ROUND 1 FINDINGS

- MAJOR merge-integrity finding: RESOLVED. Cross-Project targets, missing/invalid lifecycle pointers, self-merge, and referenced-target deletion are rejected by shipped migration DDL and covered by negative tests.
- BLOCKER format/CI finding: RESOLVED. The Controller-supplied formatting-only `control/ACCEPTANCE_LEDGER.md` correction is present; format and aggregate CI now pass.

## CONTROLLER DOCUMENTATION CORRECTION

The executor evidence line saying `main is the merge target` is inaccurate. Independent Git inspection shows the task branch has no configured upstream, its base is the accepted integration history, and the Controller merge target is `integration/ai-v1`. No commit or merge to `main` occurred.

## SECURITY AND MERGE DECISION

No external request, credential use, remote migration, publishing, paid action, or permission bypass occurred. Safe task-scoped orchestration remained in effect.

T101-M1-SEARCH-TOPIC-SCHEMA is accepted in round 2 of 3. The Controller may commit the task worktree and merge it only into `integration/ai-v1`. Never merge to `main`.
