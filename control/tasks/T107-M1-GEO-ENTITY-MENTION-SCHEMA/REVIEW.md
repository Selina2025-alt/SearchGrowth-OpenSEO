# REVIEW — T107-M1-GEO-ENTITY-MENTION-SCHEMA, Round 1

VERDICT: BLOCKED

## VERIFIED

- DELIVERY and targeted inspection confirm equivalent D1/PostgreSQL mention columns, Parse/Entity FKs, cascade paths, `0052`/`0030` migrations and snapshots, 234 focused tests, and exit-0 format, type, lint, full-test, build, and `ci:check` evidence.
- The implementation is otherwise limited to schema, migrations, parity, and migration-backed tests; no parser, provider, network, credential, UI, or production action is present.

## FINDINGS

### BLOCKER — cross-Project entity references remain database-valid

- **Path / location:** `src/db/search-growth.schema.ts`, `geoEntityMentions`; mirrored in `src/db/pg/search-growth.schema.ts` and migrations `0052` / `0030`.
- **Requirement violated:** normalized product relationships must preserve explicit Project ownership; the T107 acceptance requires entity/mention relation integrity.
- **Evidence:** the table stores only `parse_id` and `entity_id`. Its two independent FKs validate that each parent exists, but cannot prove that the Parse's Run/Prompt Project equals the TrackedEntity Project. DELIVERY explicitly records this limitation. A parse beneath Project A can therefore reference an entity beneath Project B.
- **Expected behavior:** an entity mention must be Project-consistent with the concrete Parse it belongs to; a cross-Project insert must be rejected by D1 and PostgreSQL.
- **Reproduction:** create Project A with a parse and Project B with a tracked entity, then insert `geo_entity_mentions(parse_id=<A parse>, entity_id=<B entity>)`; the shipped FK definitions accept it.
- **Fix acceptance condition:** establish migration-backed same-Project integrity for Parse ↔ Mention ↔ Entity in both dialects, including a cross-Project rejection test, without encoding relationships in JSON or weakening raw/parse append-only behavior. This requires deciding the minimum forward schema expansion needed to express the Parse Project identity; accepted T106's direct field contract currently omits it.

## MERGE DECISION

Do not merge T107. The missing Project identity needed for database enforcement is a material conflict between the direct GeoObservationParse field list and the repository's explicit ownership invariant; it requires Product Owner direction before a bounded Round 2 can be defined.

---

# REVIEW — T107-M1-GEO-ENTITY-MENTION-SCHEMA, Round 2

VERDICT: BLOCKED

## VERIFIED

- The approved forward-only recovery adds explicit `project_id` to Parse and Mention, and replaces the relevant parent FKs with same-Project composite FKs in both dialects.
- D1 `0053` rebuilds and backfills Parse/Mention rows from their immutable parent chain; PostgreSQL `0031` backfills before `NOT NULL` and composite constraints. Accepted historical migrations are unmodified.
- The focused suite, local D1 migration, and final dual-dialect `db:generate` no-op are reported PASS. Targeted SQL inspection confirms the required composite FK chain and supporting non-business unique target indexes.
- No runtime/parser/provider/CRUD/UI/security-scope expansion is present.

## FINDINGS

### BLOCKER — required aggregate gates lack Round 2 PASS evidence

- **Requirement:** T107 requires `format:check`, `types:check`, `lint`, full `test`, `build`, and `ci:check` to exit 0 on the final ownership-recovery tree.
- **Evidence:** Round 2 DELIVERY explicitly states each gate was auto-denied by the executor harness and records no final PASS result after the schema/migration change. Round 1 results predate that change and cannot satisfy this acceptance condition.
- **Fix acceptance condition:** execute the six already-approved aggregate commands independently on the unchanged Round 2 tree; repair only a directly task-local failure; record all final exit-0 results in DELIVERY.

## MERGE DECISION

Do not merge. Dispatch the final permitted executor round as a gate-only recovery.

---

# REVIEW — T107-M1-GEO-ENTITY-MENTION-SCHEMA, Round 3 Final

VERDICT: PASS

## VERIFIED

- Round 3 is gate-only: its only implementation deltas are formatting and documented file-scoped `max-lines` lint suppressions; no DDL, migration, snapshot, ownership invariant, or business behavior changed.
- Round 2's explicit `project_id` chain and composite FKs remain present in both dialects: Parse → Run, Mention → concrete Parse, and Mention → TrackedEntity. The supporting `(project_id, id)` indexes are limited to composite-FK targets.
- D1 `0053` and PostgreSQL `0031` are forward-only, preserve pre-existing rows by deriving ownership from the parent chain, and leave accepted historical migrations untouched. Round 2 final dual-dialect generation was a no-op; the focused 251-test suite covers parity and same-Project/cross-Project/mismatch behavior.
- Raw/parse append-only shape and parse-version isolation remain intact. No provider, parser runtime, CRUD, UI, dependency, credential, publishing, paid, or production change appears.
- Round 3 records final exit 0 for format, types, lint, full test (156 files / 1,330 tests), build, and `ci:check`. `git diff --check` is clean.

## FINDINGS

None.

## MERGE DECISION

Approve merge of the reviewed T107 task branch into `integration/ai-v1` only. Do not merge to `main`.
