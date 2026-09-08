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
