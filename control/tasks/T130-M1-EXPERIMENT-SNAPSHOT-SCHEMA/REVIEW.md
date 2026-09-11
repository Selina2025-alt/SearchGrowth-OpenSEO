# REVIEW — T130-M1-EXPERIMENT-SNAPSHOT-SCHEMA

## VERDICT

PASS — Round 1 / 3

## VERIFIED

- D1 `0075` and PostgreSQL `0053`, snapshots, and journals are aligned. The child adds explicit Project identity and a Project-leading composite FK to `experiments(project_id, id)`; its sole new parent unique index is referential only.
- The source-defined `BASELINE | D7 | D14 | D30 | MANUAL` taxonomy has matching Zod/DB validation. `captured_at` is distinct from system `created_at`; window, timezone, notes, metrics, and data-quality fields have the approved nullable/required contract. Six required JSON documents have matching named dialect checks.
- Shipped migration guards reject direct snapshot UPDATE/DELETE. The migration-backed tests verify same-Project persistence, cross-Project rejection, JSON validity, append-only behavior, parent deletion behavior, and no business uniqueness.
- GEO/GSC/GA4/publication/indexing data are persisted as validated opaque snapshot documents only. No collection, baseline/comparison calculation, recheck, activation, provider, credential, publishing, or production runtime was added.
- `db:generate`, local migration, focused tests (368 including parity), full tests (191 files / 1,775), format, types, lint, build, and `ci:check` all exit 0. `git diff --check` is clean.

## FINDINGS

None.

## MERGE DECISION

Merge only `ai-task/T130-M1-EXPERIMENT-SNAPSHOT-SCHEMA` into `integration/ai-v1`.
