# DELIVERY — T103-M1-ENTITY-ALIAS-SCHEMA

IMPLEMENTATION STATUS: IMPLEMENTED — RECOVERY ROUND R1/1 (post-human-gate; not accepted; only the Controller may PASS)
READY FOR REVIEW: YES

## TASK ID

T103-M1-ENTITY-ALIAS-SCHEMA — M1 Core Domain. This is the authorized post-human-gate
recovery round (`AUTHORIZED RECOVERY ROUND R1 / 1`). It addresses every finding in the
current `REVIEW.md` (Round 1 BLOCKED, Round 2 BLOCKED, Round 3 BLOCKED — all caused by
two omitted V1.0 domain fields) and completes the bounded correction on the existing
unmerged worktree. `REVIEW.md` was read, not edited.

## REVIEW FINDINGS ADDRESSED

- **Round 1 finding (MAJOR)** — optional `tracked_entities.owning_entity_id` and
  `entity_aliases.priority` were omitted. **Now both fields are shipped** in both dialect
  schemas, the 0048/0026 migrations, snapshots, journals, the Zod/domain boundary modules
  (`src/types/schemas/*`), and the migration-backed storage/boundary tests.
- **Round 2 acceptance items 1–5** — each is implemented and evidenced below:
  1. Nullable `owning_entity_id`, same-Project composite self-reference, delete action that
     cannot leave a dangling ownership reference (ON DELETE NO ACTION — the delete is
     blocked while owned rows reference it), migration-tested for same-Project acceptance,
     cross-Project rejection, and delete behavior.
  2. `entity_aliases.priority`, storage-only, explicit type/nullability/default with
     matching D1/Postgres parity and Zod/domain representation (row type + boundary test);
     no ranking/matching behavior added.
  3. The unmerged **D1 0048 / Postgres 0026** migrations, snapshots, and journals carry the
     two fields; the final dual-dialect `db:generate` produces **no additional migration**
     on either dialect.
  4. Migration-backed tests added: same-Project ownership, cross-Project ownership
     rejection, ownership delete behavior, alias priority persistence/default, and all prior
     alias invariants preserved.
  5. Approved local migration and gates rerun to exit 0 (see COMMANDS RUN).
- **Round 3 acceptance items 1–3** — the correction is implemented exactly within the
  approved boundary with no environment-probe commands, the DELIVERY is written with exact
  command exits and field/invariant mapping, and no scope was expanded.

## IMPLEMENTATION SUMMARY

Two normalized, Project-scoped storage tables are shipped in both dialect schemas plus the
forward migrations, snapshots, journals, domain-boundary Zod modules, and migration-backed
storage tests. No parser, matcher, CRUD/repository/service, API, form, or UI code was
added. Both fields the domain model requires and the reviews blocked on are now present and
tested.

- **`tracked_entities`** (SQLite: `src/db/search-growth.schema.ts`, Postgres mirror:
  `src/db/pg/search-growth.schema.ts`) with the approved fields
  `id, project_id, entity_type, canonical_name, canonical_domain?, product_url?,
  owning_entity_id?, active, created_at, updated_at`. `entity_type` is a DB text-enum column
  (`BRAND | PRODUCT | COMPETITOR | COMPETITOR_PRODUCT`); `owning_entity_id` is nullable and
  is a **same-Project self-reference** (a `PRODUCT` can name its owning `BRAND`, a
  `COMPETITOR_PRODUCT` its owning `COMPETITOR`, and so on).
- **`entity_aliases`** with the approved fields
  `id, project_id, entity_id, alias_text, locale?, match_mode, case_sensitive, priority,
  created_at`. `match_mode` is a DB text-enum column
  (`EXACT | CASE_INSENSITIVE_EXACT | WORD_BOUNDARY | UNICODE_SUBSTRING | DOMAIN`);
  `priority` is integer storage metadata defaulting to 0. No ranking or matching behavior is
  implemented.
- **Project ownership and entity/alias/ownership relations are database-enforced.** Every
  alias row carries an explicit `project_id` and a same-project composite FK
  `(project_id, entity_id) → tracked_entities(project_id, id)` `ON DELETE CASCADE`, so an
  alias whose entity lives on another Project is rejected by the DB and deleting a Project
  or a tracked entity cascades aliases away. `owning_entity_id` is bound by a same-Project
  composite self-FK `(project_id, owning_entity_id) → tracked_entities(project_id, id)`
  `ON DELETE NO ACTION`, so an entity on project A can never be owned by an entity on
  project B, and deleting an owner that still has owned entities is **blocked** — an
  ownership reference can never dangle. The supporting composite unique index
  `tracked_entities_project_id_id_idx(project_id, id)` exists **only** as the required unique
  target of these composite FKs (`id` is already the PK, so it adds no business uniqueness).
- **Stable entity identity** (ADR-004 / 30_TRACEABILITY_MATRIX.md row 品牌/产品/竞品): a
  tracked-entity `id` and `project_id` are preserved across rename / canonical-domain /
  product-URL / owning-entity / active-state mutations; tests assert exactly one row survives
  with the same `id` and Project.
- **Enum contracts are explicit and Zod-validated** at the domain boundary
  (`src/types/schemas/tracked-entity.ts`, `src/types/schemas/entity-alias.ts`);
  unsupported/lowercase/empty enum values are rejected by the Zod schemas (DB text-enum
  columns, matching the accepted `search_market_profiles`/`search_topics` pattern).
- **Forward migrations/snapshots** use the next identifiers after accepted T102: D1 **0048**
  and Postgres **0026**, regenerated in place to carry the two new fields. The local D1
  migration history 0000→0048 applies cleanly; a final dual-dialect `db:generate` reports
  **no schema change** on either dialect.

### Field / ownership decisions (shipped vs. design-reference)

- **`owning_entity_id?`** is **shipped** as nullable `owning_entity_id` because
  `05_DOMAIN_DATA_MODEL.md` §4 lists it for `TrackedEntity`. `schemas/migrations-reference.sql`
  (`tracked_entities` DDL) and `schemas/domain-types.ts` (`TrackedEntity`) omit it; per the
  TASK contract rule the domain model wins and the reference omission is reconciled here
  rather than inventing unrelated fields. Delete action chosen: **ON DELETE NO ACTION**
  (restrictive on both dialects). Rationale recorded in the schema:
  - SET NULL is not expressible on this composite FK — it would have to NULL the leading
    `project_id` column, which is NOT NULL.
  - CASCADE would silently destroy owned stable-identity rows when an owner is deleted.
  - NO ACTION blocks deleting an owner while owned rows still reference it, so an ownership
    reference can never dangle and owned rows keep their stable id/project; it matches the
    accepted `search_topics.merged_into_topic_id` composite self-FK pattern.
- **`priority`** is **shipped** on `entity_aliases` as **`integer NOT NULL DEFAULT 0`**
  because `05_DOMAIN_DATA_MODEL.md` §4 EntityAlias lists it. `schemas/migrations-reference.sql`
  (`entity_aliases` DDL) and `schemas/domain-types.ts` (`EntityAlias`) omit it (the reference
  only carries `priority` on `search_prompts`); the domain model wins and the omission is
  reconciled here. Type is integer to keep it an explicit ordinal storage hint; default 0 is
  the neutral value; nullability is NOT NULL so an alias always carries a defined precedence
  for later matching work. No ranking or matching behavior is implemented (out of scope).
- **`project_id` on `entity_aliases`** remains shipped as in accepted Round 1: the TASK data
  rules require DB-enforced cross-Project rejection, which needs an explicit row `project_id`
  + same-project composite FK.
- **Column naming** continues the accepted T100–T102 reconciliation: storage columns follow
  `schemas/migrations-reference.sql` snake_case; exported Drizzle row types use camelCase
  (`owningEntityId`, `priority`); future repository/service tasks import row/enum types from
  `src/types/schemas/*`.

## FILES CHANGED

### Source — modified (tracked)
- `src/db/search-growth.schema.ts` — `trackedEntities` gains nullable `owning_entity_id`
  + same-Project composite self-FK (`ON DELETE NO ACTION`); `entityAliases` gains
  `priority integer NOT NULL DEFAULT 0`.
- `src/db/pg/search-growth.schema.ts` — identical Postgres mirror of both changes.
- `src/db/schema.ts` — provider-aware barrel: exports `trackedEntities` and `entityAliases`.

### Migrations / metadata (untracked additions; 0048/0026 regenerated in place)
- `drizzle/0048_ordinary_legion.sql` (D1: `tracked_entities` with `owning_entity_id`, then
  `entity_aliases` with `priority`), `drizzle/meta/0048_snapshot.json`
- `drizzle-pg/0026_normal_talkback.sql` (Postgres; supporting unique index ordered before the
  composite-FK `ALTER TABLE` as Postgres requires), `drizzle-pg/meta/0026_snapshot.json`
- `drizzle/meta/_journal.json` (idx 48, tag `0048_ordinary_legion`),
  `drizzle-pg/meta/_journal.json` (idx 26, tag `0026_normal_talkback`) — tracked modifications.

### Tests — untracked additions
- `src/db/search-tracked-entity.test.ts` (6 tests), `src/db/search-entity-alias.test.ts`
  (6 tests)
- `src/types/schemas/tracked-entity.test.ts` (3 tests), `src/types/schemas/entity-alias.test.ts`
  (3 tests)

### Domain-boundary modules — untracked additions
- `src/types/schemas/tracked-entity.ts`, `src/types/schemas/entity-alias.ts` (row types now
  include `owningEntityId` / `priority`; enum Zod boundaries unchanged)

### Control channel (untracked, prettier-ignored, not repo baseline)
- `control/tasks/T103-M1-ENTITY-ALIAS-SCHEMA/DELIVERY.md` (this file),
  `control/tasks/T103-M1-ENTITY-ALIAS-SCHEMA/evidence/round-1/*` (this round’s command
  evidence; also `evidence/round-3/*` left from the interrupted Round-3 executor).

## DATABASE / MIGRATION CHANGES

### `tracked_entities` inventory (identical on both dialects)
| property | column | type (sqlite / pg) | null | default |
| --- | --- | --- | --- | --- |
| `id` | `id` | text / text | no | PK |
| `projectId` | `project_id` | text / text | no | FK → projects(id) cascade |
| `entityType` | `entity_type` | text enum BRAND\|PRODUCT\|COMPETITOR\|COMPETITOR_PRODUCT | no | — |
| `canonicalName` | `canonical_name` | text / text | no | — |
| `canonicalDomain` | `canonical_domain` | text / text | yes | — |
| `productUrl` | `product_url` | text / text | yes | — |
| `owningEntityId` | `owning_entity_id` | text / text | yes | — (same-Project self-FK) |
| `active` | `active` | integer(bool) / boolean | no | true |
| `createdAt` | `created_at` | text / text | no | dialect timestamp default |
| `updatedAt` | `updated_at` | text / text | no | dialect timestamp default |

| artifact | definition |
| --- | --- |
| Project FK | `project_id → projects(id) ON DELETE CASCADE` |
| Read index | `tracked_entities_project_idx(project_id)` (non-unique) |
| Supporting unique index | `tracked_entities_project_id_id_idx(project_id, id)` — exists **only** to satisfy the composite FKs; `id` is the PK so it adds no business uniqueness |
| Owning-entity FK | `(project_id, owning_entity_id) → tracked_entities(project_id, id) ON DELETE NO ACTION` — same-Project self-reference; delete of an in-use owner is blocked |

### `entity_aliases` inventory (identical on both dialects)
| property | column | type (sqlite / pg) | null | default |
| --- | --- | --- | --- | --- |
| `id` | `id` | text / text | no | PK |
| `projectId` | `project_id` | text / text | no | FK → projects(id) cascade |
| `entityId` | `entity_id` | text / text | no | composite FK target |
| `aliasText` | `alias_text` | text / text | no | — |
| `locale` | `locale` | text / text | yes | — |
| `matchMode` | `match_mode` | text enum EXACT\|CASE_INSENSITIVE_EXACT\|WORD_BOUNDARY\|UNICODE_SUBSTRING\|DOMAIN | no | — |
| `caseSensitive` | `case_sensitive` | integer(bool) / boolean | no | false |
| `priority` | `priority` | integer / integer | no | 0 (storage-only) |
| `createdAt` | `created_at` | text / text | no | dialect timestamp default |

| artifact | definition |
| --- | --- |
| Project FK | `project_id → projects(id) ON DELETE CASCADE` |
| Alias FK | `(project_id, entity_id) → tracked_entities(project_id, id) ON DELETE CASCADE` — same-Project composite FK |
| Read index | `entity_aliases_project_idx(project_id)` (non-unique) |
| Read index | `entity_aliases_entity_idx(entity_id)` (non-unique) |

### Constraint / behavior rationale
- **Cross-Project aliases are rejected by the DB**: the composite FK binds the alias's
  `project_id` to the entity's `project_id`, so a `proj_alpha` alias cannot reference a
  `proj_beta` entity (negative migration-backed test).
- **Cross-Project ownership is rejected by the DB**: `(project_id, owning_entity_id)` must
  match an existing `(project_id, id)` on the same row’s project (negative migration-backed
  test).
- **No dangling ownership references**: deleting an owner that still has owned entities is
  blocked (ON DELETE NO ACTION); deleting a whole Project cascades all of that Project’s
  entities away regardless of ownership links.
- **No dangling aliases**: deleting a tracked entity or a whole Project cascades the alias
  away (alias FK cascade + both Project FKs cascade). Tested for both parents.
- **Alias `priority`** is `integer NOT NULL DEFAULT 0` on both dialects; explicit values
  round-trip and an omitted value receives the 0 default (migration-backed test). It is pure
  storage metadata — no ranking or matching behavior exists.
- **No invented business uniqueness**: no alias-text/entity duplicate rule, no canonical-name
  uniqueness, no hidden priority/ranking rule.
- **Enum values live in explicit text columns** and are validated by Zod at the domain
  boundary.
- **Relational data is never JSON-encoded** — ownership, alias, and priority fields are
  explicit typed columns.

### Migration identifiers
- D1 **0048** (`0048_ordinary_legion`), journal idx 48, `drizzle/meta/0048_snapshot.json`.
- Postgres **0026** (`0026_normal_talkback`), journal idx 26, `drizzle-pg/meta/0026_snapshot.json`.
Both are the next identifiers after the accepted T102 migrations (0047 / 0025) and were
regenerated **in place** (same slots/tags) to carry `owning_entity_id` and `priority`.
Final dual-dialect `db:generate` reports **no schema change** on either dialect, so the
schemas, 0048/0026 SQL, and their snapshots agree exactly. The Postgres migration orders the
supporting unique index before the composite-FK `ALTER TABLE`s (Postgres FK requirement);
the SQLite migration creates `tracked_entities` before `entity_aliases`.

## DEPENDENCIES CHANGED

None. `corepack pnpm install --frozen-lockfile` → exit 0, lockfile up to date, resolution
skipped; `package.json`/`pnpm-lock.yaml` are unchanged (`git status` clean of package files).

## TESTS ADDED

- `src/db/search-tracked-entity.test.ts` (6 tests) — real in-memory SQLite built from the
  shipped `drizzle/0048_ordinary_legion.sql` DDL with `PRAGMA foreign_keys = ON`:
  1. Valid entity records persist; rename + canonical-domain + product-URL + active-state
     mutations keep exactly one row with the same `id` and `project_id`, and a second-Project
     entity is untouched (stable entity identity, ADR-004).
  2. Every approved entity kind persists and projects stay isolated.
  3. Deleting a Project cascades its entities away.
  4. **NEW** An `owning_entity_id` pointing at an entity in the **same Project** persists.
  5. **NEW** An `owning_entity_id` pointing at an entity on **another Project** is rejected
     (composite-FK violation).
  6. **NEW** Deleting an owning entity that still has owned entities is **blocked**
     (ON DELETE NO ACTION) — the ownership reference can never dangle; neither row is removed.
- `src/db/search-entity-alias.test.ts` (6 tests) — real in-memory SQLite from the same 0048
  DDL with foreign keys enabled:
  1. A valid same-project alias persists with the approved columns (nullable `locale`, both
     `case_sensitive` values).
  2. An alias whose entity belongs to another Project is rejected (composite FK violation).
  3. Deleting a tracked entity cascades its aliases away.
  4. Deleting a Project cascades its aliases away.
  5. Renaming an entity keeps aliases attached to the same stable `entity_id` and `project_id`.
  6. **NEW** Alias `priority` persists as given and an omitted value receives the column
     default `0`.
- `src/types/schemas/tracked-entity.test.ts` (3 tests) — every `entity_type` column value
  passes the Zod boundary; unsupported/lowercase/empty kinds are rejected; the exported
  row/enum types align with the storage columns **including nullable `owningEntityId`**
  (compile-time Pick guard).
- `src/types/schemas/entity-alias.test.ts` (3 tests) — every `match_mode` column value passes
  the Zod boundary; unsupported/lowercase/empty modes are rejected; the exported row/enum
  types align with the storage columns **including integer `priority`** (compile-time Pick
  guard).
- `src/db/schema-parity.test.ts` (204 tests, passes) — auto-compares the two new tables on
  both dialect barrels (columns/nullability/dataType/defaults/enums, PK, unique targets incl.
  the supporting index, FKs incl. `onDelete`, and CHECK names). No manual parity-test edit
  was needed for the two new columns/FKs; both dialect mirrors carry them identically.

## COMMANDS RUN

Run independently per the approved matrix; concise sanitized logs under
`control/tasks/T103-M1-ENTITY-ALIAS-SCHEMA/evidence/round-1/*`.

1. `node --version` → exit 0 → `v24.16.0`
2. `corepack pnpm --version` → exit 0 → `10.30.1`
3. `corepack pnpm install --frozen-lockfile` → exit 0 → lockfile up to date; manifests/lockfile unchanged
4. `corepack pnpm exec prettier --write <9 task-touched source/test files>` → exit 0 (all 9 unchanged — already formatted)
5. `corepack pnpm run db:migrate:local` → exit 0 → `✅ No migrations to apply!` (local D1 store already fully applied through 0048)
6. `corepack pnpm run db:generate` → exit 0 (run twice) → both dialects report **"No schema changes, nothing to migrate 😴"**; no 0049/0027 produced
7. `corepack pnpm exec vitest run <10 focused schema/parity/entity/alias files>` → exit 0 → **10 files / 248 tests passed**
8. `corepack pnpm format:check` → exit 0 → "All matched files use Prettier code style!"
9. `corepack pnpm types:check` → exit 0 → `tsc --noEmit` clean
10. `corepack pnpm lint` → exit 0 → oxlint "Found 0 warnings and 0 errors" (858 files)
11. `corepack pnpm test` → exit 0 → **149 files / 1240 tests passed**
12. `corepack pnpm build` → exit 0 → vite client/ssr/open_seo_audit built + `tsc --noEmit` clean
13. `corepack pnpm ci:check` → **exit 0** → prettier, knip, tsc (root + badseo), oxlint (0/0), plugin-skills sync all clean
14. Read-only Git inspection: `git status`, `git diff --stat`, `git log`, `git diff --check`, `git diff` — see GIT STATUS/DIFF SUMMARY

## COMMAND RESULTS (evidence)

- **db:generate consistency** — the dual-dialect run reports "No schema changes, nothing to
  migrate" on **both** dialects, so the 0048/0026 migrations and snapshots match the shipped
  schemas exactly (including `owning_entity_id`, `priority`, and the supporting
  `tracked_entities_project_id_id_idx` unique index in both snapshots).
- **Local migration** — `db:migrate:local` exits 0 with no pending migrations; the local D1
  store is fully applied through `0048_ordinary_legion.sql`. A fresh full-history
  0000→0048 apply of the same DDL (including both new fields) is additionally recorded under
  `evidence/round-3/05-db-migrate-local.txt`.
- **Focused suite** — 248/248 pass: entity/alias storage (6+6), domain boundary (3+3), full
  Search Growth schema parity (204), plus the T100–T102 storage/boundary suites.
- **Full suite** — 149 files / 1240 tests pass in a single run (the +4 over the Round-1 1236
  are exactly the new owning-entity and priority tests).
- **Aggregate gates** — `format:check`, `types:check`, `lint`, `test`, `build`, and the full
  `ci:check` chain all exit 0; `git diff --check` is clean.

## RUNTIME EVIDENCE

- **D1/SQLite migration** — `0048_ordinary_legion.sql` (with `owning_entity_id` and
  `priority`) is the applied head of the local D1 history; `db:migrate:local` exits 0.
- **Storage/ownership tests** — all 12 migration-backed entity/alias tests pass against the
  real 0048 DDL with foreign keys enabled: the DB itself rejects cross-Project aliases and
  cross-Project ownership, blocks deleting an in-use owning entity (no dangling ownership),
  cascades aliases on entity/Project deletion, persists alias priority with the 0 default,
  preserves stable entity identity across field mutations, and keeps aliases attached to the
  stable entity id across a rename.
- **Schema parity** — `tracked_entities` and `entity_aliases` are structurally identical on
  SQLite and Postgres (columns, PK, unique targets incl. the supporting index, FKs incl.
  `onDelete`, CHECK names); 204/204 parity tests pass.
- **Postgres migration artifact** — pg migration SQL/journal/snapshot are consistent
  (`db:generate:pg` reports no diff); the pg DDL orders the supporting unique index before
  the composite-FK `ALTER TABLE`s as Postgres requires. A live `db:migrate:pg` still requires
  a real Postgres URL and is not in the approved command set.

## KNOWN LIMITATIONS

- `db:migrate:pg` was not executed (requires a live `POSTGRES_DATABASE_URL`; not in the
  approved command set). Postgres migration/snapshot consistency is proven via
  `db:generate:pg` (no diff), the parity tests, and review of the generated DDL ordering.
- The current round’s `db:migrate:local` reported no pending migrations because the local D1
  store was already fully applied by the interrupted Round-3 executor; that executor’s
  fresh full-history 0000→0048 apply (same 0048 DDL, exit 0) is preserved at
  `evidence/round-3/05-db-migrate-local.txt`. Migration files are unchanged since that apply.
- Migration file names are drizzle-kit’s auto-generated tags (`0048_ordinary_legion`,
  `0026_normal_talkback`) rather than semantic names, because `db:generate` cannot be passed
  a custom name under the approved-command set and no unlisted rename/delete command is
  allowed. Identifiers are the required next values (D1 0048, Postgres 0026); the
  journal/snapshot/file tags agree.
- Per scope: no parser, matcher, CRUD/repository/service/server-function/API/form/UI,
  connector, or later-domain code was added; the alias substring-safety rule against overly
  short generic substrings is out of scope; `schemas/domain-types.ts` and
  `schemas/migrations-reference.sql` are treated as design references and were **not** edited
  (the domain-model fields they omit are reconciled in this DELIVERY).
- `owning_entity_id` delete semantics are NO ACTION (block delete of an in-use owner): a
  later CRUD task must reparent or delete owned rows first. This is a documented storage
  decision, not a CRUD behavior.

## DEVIATIONS FROM TASK

None in product scope. Design decisions recorded and explained above:
- `entity_aliases` carries an explicit `project_id` + same-project composite FK to make
  cross-Project aliases impossible at the database boundary (accepted Round 1; unchanged).
- `tracked_entities.owning_entity_id` and `entity_aliases.priority` are shipped from
  `05_DOMAIN_DATA_MODEL.md` §4 even though `schemas/migrations-reference.sql` and
  `schemas/domain-types.ts` omit them (task contract rule: the domain model wins; reconciled
  above, no unrelated fields invented).
- Owning-entity delete action is ON DELETE NO ACTION (blocked delete) — see field decisions.
- The 0048/0026 migration + snapshot files were updated in place (same drizzle-kit tags) so
  the final dual-dialect `db:generate` stays clean; no additional migration index was
  consumed.

## SECURITY NOTES

- No external requests, credentials, account access, CAPTCHA/2FA bypass, stealth behavior,
  cookie upload, production publishing, remote migration, or paid action was performed.
- No dependency, lockfile, manifest, ADR, scope-lock, or production resource change.
- All work is local to the isolated worktree; `db:migrate:local` touches only the gitignored
  local Wrangler D1 state.
- Ownership and relations are explicit FK columns — no relational data is stored in JSON/text
  payloads; no new untrusted-input or auth path was added (storage + Zod-boundary-only
  change).

## GIT STATUS/DIFF SUMMARY

See `evidence/round-1/14-git.txt` (status), `14-git-diffstat.txt` (diff --stat),
`14-git-log.txt` (log), `14-git-diff-check.txt` (diff --check, clean), and `14-git-diff.txt`
(full tracked diff). Tracked modifications (`git diff --stat`, 6 files, +374): the two
`search-growth.schema.ts` files, `src/db/schema.ts` (barrel export), the two `_journal.json`
files, and the recovery `TASK.md` packet. Untracked additions: regenerated `0048`/`0026`
migration + snapshot files, four test files, two `src/types/schemas` boundary modules,
`DELIVERY.md`, `evidence/round-1/*` and `evidence/round-3/*`. No lockfile, package manifest,
ADR, scope, `.greptile`, `.github`, `.agents`, or production change is part of the diff.
Nothing committed; nothing merged. A pre-existing untracked `git` file (a shell wrapper
harness artifact, contents `echo WRAPPER_GIT_OK`) sits in the worktree; it is not part of
this task and was not modified.

## READY FOR REVIEW

Both V1.0 domain fields the reviews blocked on are now shipped and evidenced: nullable
same-Project `tracked_entities.owning_entity_id` with an ON DELETE NO ACTION ownership
self-reference (no dangling ownership; cross-Project ownership rejected by the DB) and
storage-only `entity_aliases.priority integer NOT NULL DEFAULT 0` with D1/Postgres parity and
Zod/domain row-type representation. Both dialects define logically equivalent
`tracked_entities` and `entity_aliases` tables with only approved fields; entity/alias enums
are explicit DB text-enum columns with matching Zod contracts that reject
unsupported/lowercase/empty values; aliases stay same-Project and cascade away on entity or
Project deletion; stable entity ids are preserved under field mutations (ADR-004). Forward
migrations/snapshots/journals use the next identifiers after accepted T102 (D1 0048,
Postgres 0026) and carry both fields; local D1 migration state is fully applied through
0048; schema parity passes (204); a final dual-dialect `db:generate` reports no schema
change on either dialect. Focused tests 248/248; full suite 149 files/1240 tests;
`format:check`, `types:check`, `lint`, `build`, and the full `ci:check` all exit 0;
`git diff --check` clean. Not committed; not merged; no other task started.
