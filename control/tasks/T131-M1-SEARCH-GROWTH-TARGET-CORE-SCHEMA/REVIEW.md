# REVIEW — T131-M1-SEARCH-GROWTH-TARGET-CORE-SCHEMA

## VERDICT

PASS — Round 1 / 3

## VERIFIED

- D1 `0076` and PostgreSQL `0054`, journals, and snapshots agree on a `project_id` primary-key/FK configuration row. It reuses the existing OpenSEO Project and retains the reference one-row-per-Project identity with Project-delete cascade.
- The config boundary requires the accepted five string-array fields and validates serialized JSON in Zod and both dialects. `updated_by` and `updated_at` provide the approved mutable configuration provenance; no source defines a target status or lifecycle, so none was invented.
- No preferred-market IDs or relations were encoded in config JSON. Topic, Opportunity, Experiment, and Market remain unrelated to this core row; the normalized preferred-market relation is correctly deferred.
- Migration-backed tests cover identity, Project scope, JSON validity, required fields, mutability/provenance, and cascade. Focused tests passed 360 assertions; full tests passed 193 files / 1,796 tests. `db:generate`, local migration, format, types, lint, build, and `ci:check` exited 0. `git diff --check` is clean.

## FINDINGS

None.

## MERGE DECISION

Merge only `ai-task/T131-M1-SEARCH-GROWTH-TARGET-CORE-SCHEMA` into `integration/ai-v1`.
