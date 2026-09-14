# REVIEW — T135-M1-PUBLISHING-JOB-CORE-SCHEMA

## VERDICT

**PASS — Round 1 of 3.**

## VERIFIED

- `publishing_jobs` stores the source-defined job record only: Project, ReleaseTarget, execution plan, opaque executor metadata, constrained status and attempts, idempotency identity, optional lease/external/error metadata, and timestamps.
- The Project key and target composite FK enforce Project ownership. The three-column composite FK to `publication_execution_plans(project_id, release_target_id, id)` additionally rejects a plan from another target in the same Project. The single supporting referential parent index is forward-migrated and does not add a business uniqueness rule.
- The idempotency key is unique; the source status union and `0 <= attempts <= maxAttempts` are enforced in both database dialects and the Zod boundary. Lease, retry, state-transition, scheduling, and execution behavior remain unimplemented.
- PlatformDraft remains a separate draft-evidence object. External identifiers and `public_url` are opaque fields; no credential, connector, receipt, verification action, remote call, or production publishing behavior is introduced. Persisting a source-defined status is not a runtime proof of public success.
- D1 `0080` and PostgreSQL `0058`, journals, snapshots, tables, FKs, supporting parent index, unique idempotency index, and checks are equivalent. A clean generation rerun found no schema drift.
- DELIVERY records focused tests (386), full tests (201 files / 1891 tests), local migration, format, types, lint, build, and `ci:check` all exiting 0. Independent `git diff --check` is clean.
- The diff is confined to the approved schema/domain/migration/test slice and contains no external, credential, paid, production, or execution implementation.

## FINDINGS

None.

## MERGE DECISION

Merge `ai-task/T135-M1-PUBLISHING-JOB-CORE-SCHEMA` into `integration/ai-v1` only.