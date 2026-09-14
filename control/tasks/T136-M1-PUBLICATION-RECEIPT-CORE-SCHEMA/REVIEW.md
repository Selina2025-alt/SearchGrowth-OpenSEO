# REVIEW — T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA

## VERDICT

**BLOCKED — Round 1 of 3.**

## VERIFIED

- `publication_receipts` itself has an explicit Project key, a same-Project ReleaseTarget FK, and a Project-leading, target-matched PublishingJob FK. The one-receipt-per-job identity, status and structured-document checks, dual-dialect migrations, snapshots, focused/full tests, build, and `ci:check` evidence are complete and clean.
- The implementation remains a credential-free receipt-evidence storage slice. It does not execute publishing, verification, connectors, credentials, external calls, or production behavior.

## FINDINGS

### BLOCKER — deferred GeoCitation receipt relation remains unconstrained

- **Location:** `src/db/search-growth.schema.ts`, `geoCitations.matchedPublicationReceiptId` and its table constraints; corresponding PostgreSQL mirror; new D1 `0081` / PostgreSQL `0059` migrations.
- **Requirement violated:** the accepted GeoCitation contract explicitly says the nullable `matched_publication_receipt_id` remains scalar only until `publication_receipts` is introduced, and that *the later task that creates it adds the same-Project composite FK alongside the table*. T136 is that later task. The repository rule also requires normalized data and explicit relationships.
- **Evidence:** T136 creates `publication_receipts` but leaves `geo_citations.matched_publication_receipt_id` without a foreign key in both dialects. A citation in Project A can therefore retain any arbitrary receipt id, including a receipt from Project B or no receipt at all.
- **Reproduction:** after applying the forward migrations, insert a Project A citation with `matched_publication_receipt_id` equal to a Project B receipt id. The present schema has no constraint that rejects it.
- **Fix acceptance:** in a new forward D1/SQLite and PostgreSQL migration, add the nullable Project-leading composite relationship `(geo_citations.project_id, geo_citations.matched_publication_receipt_id) -> publication_receipts(project_id, id)` with an equivalent, documented delete behavior that preserves citation history. Add the necessary receipt parent referential target only if required. Update schema mirrors, snapshots/journals, parity and migration-backed tests for same-Project allowance, cross-Project/dangling rejection, null allowance, and the chosen delete behavior. Do not add citation matching, URL normalization, attribution runtime, verification runtime, or any external behavior.

## MERGE DECISION

Do not merge. Dispatch the bounded Round 2 fix only.