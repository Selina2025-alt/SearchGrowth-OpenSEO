# REVIEW — T129-M1-EXPERIMENT-CORE-SCHEMA

## VERDICT

PASS — Round 1 / 3

## VERIFIED

- D1 `0074` and PostgreSQL `0052`, their journals and snapshots, provide the same Project-scoped `experiments` relation. Required Topic and optional Opportunity/ReleaseBundle use Project-leading composite FKs; cross-Project references are rejected and declared cascades are migration-tested.
- The persisted contract exactly covers the approved core fields. `activation_policy` is the only source-defined enum and has matching Zod/DB checks; `status` remains opaque. Four required policy/reference documents have named JSON-validity checks in both dialects. No business uniqueness is added.
- Window, baseline/comparison, timezone, data-lag, GEO/GSC/GA4 measurement, and snapshots remain outside this task's storage contract. The implementation adds no activation runtime, provider integration, credential, publishing, spend, CRUD, or production behavior.
- Focused tests passed 17/17 (and schema parity 334 assertions); full tests passed 189 files / 1,751 tests. `db:generate`, local migration, format, types, lint, build, and `ci:check` all exited 0. `git diff --check` is clean.

## FINDINGS

None.

## MERGE DECISION

Merge only `ai-task/T129-M1-EXPERIMENT-CORE-SCHEMA` into `integration/ai-v1`.
