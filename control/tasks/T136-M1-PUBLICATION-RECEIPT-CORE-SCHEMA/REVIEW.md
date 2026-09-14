# REVIEW — T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA

## VERDICT

**PASS — Round 2 of 3.**

## VERIFIED

- `publication_receipts` is an immutable, Project-scoped evidence record with the approved receipt fields, same-Project ReleaseTarget and target-matched PublishingJob integrity, one receipt per job, status and JSON-document validation, and no publishing/runtime behavior.
- Round 1's blocker is fixed. `geo_citations(project_id, matched_publication_receipt_id)` now has a nullable Project-leading composite FK to `publication_receipts(project_id, id)` in both schema mirrors and in new forward migrations D1 `0082` / PostgreSQL `0060`.
- The receipt parent `(project_id, id)` unique index is referential only. Same-Project citation/receipt matches and NULL are allowed; cross-Project and dangling receipt references are rejected. `NO ACTION` protects citation evidence from receipt deletion without attempting to null the required Project key or cascade-delete citations.
- D1 and PostgreSQL journals, snapshots, tables, FK actions, and supporting indexes are equivalent. Existing migrations remain unmodified; a clean generation rerun found no drift.
- Migration-backed tests cover the new relation's positive, null, cross-Project, dangling, restrictive-delete, and Project-teardown cases. DELIVERY records focused tests (395), full tests (204 files / 1931 tests), local migration, format, types, lint, build, and `ci:check` all exiting 0. Independent `git diff --check` is clean.
- Receipt status, URLs, timestamps, external ids, and verification JSON remain stored evidence only. No verifier, status transition, public-success decision, external action, credentials, connector, production, or attribution runtime was added.
- `IndexingObservation` does not yet contain a receipt reference by its accepted T128 field contract. Adding that new field/relation is a separately scoped follow-up, not an expansion of this Receipt storage task.

## FINDINGS

None.

## MERGE DECISION

Merge `ai-task/T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA` into `integration/ai-v1` only.