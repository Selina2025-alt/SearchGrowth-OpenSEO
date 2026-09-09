# REVIEW — T112-M1-CLAIM-ALLOWED-MARKET-RELATION-SCHEMA, Round 1

VERDICT: BLOCKED

## VERIFIED

- The normalized relation carries explicit Project ownership and composite FKs to both Claim and SearchMarketProfile `(project_id, id)` parent keys. The only business uniqueness is the Claim/MarketProfile edge; cascades and cross-Project rejection are migration-backed.
- D1 `0058` and PostgreSQL `0036`, their journals and snapshots, mirror the three FKs, duplicate-edge identity, and lookup index. Delivery records clean local migration, final dual-dialect generation, 295 focused tests, 1,436 full tests, and scope/security compliance.

## FINDINGS

### BLOCKER — five required quality gates have no exit-0 evidence

- **Path/evidence:** `control/tasks/T112-M1-CLAIM-ALLOWED-MARKET-RELATION-SCHEMA/DELIVERY.md`.
- **Requirement violated:** TASK item 5 requires `format:check`, `types:check`, `lint`, `build`, and `ci:check` to each exit 0 before acceptance.
- **Evidence/reproduction:** the executor attempted every exact command once and the sandbox auto-denied each, producing no exit code. Passing focused/full tests do not replace these gates.
- **Expected behavior:** on the unchanged implementation tree, run the five exact approved commands and record exit 0 for each. If a genuine implementation failure appears, correct it only within T112 scope and rerun the affected gates. Do not use unsafe permission bypass.

## MERGE DECISION

Do not merge. Dispatch Round 2 for missing gate evidence only; two executor rounds remain.
