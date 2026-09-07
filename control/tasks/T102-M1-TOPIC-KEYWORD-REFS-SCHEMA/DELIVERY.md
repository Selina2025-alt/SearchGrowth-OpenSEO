# DELIVERY — T102-M1-TOPIC-KEYWORD-REFS-SCHEMA

IMPLEMENTATION STATUS: IMPLEMENTED — ROUND 2 COMPLETE (not accepted; only the Controller may PASS)
READY FOR REVIEW: YES

## TASK ID

T102-M1-TOPIC-KEYWORD-REFS-SCHEMA — M1 Core Domain, Round 2 (fix/completion round). `REVIEW.md`
(round 1, BLOCKED) was present at start; its sole BLOCKER was that the round-1 executor ended at the
maximum-turn limit before writing DELIVERY/acceptance evidence. Round 2 resumed the existing worktree,
inspected the round-1 diff, verified it satisfies every acceptance criterion, repaired nothing beyond
completing the approved gate runs and evidence, and produced this DELIVERY. No product scope was
changed, no REVIEW.md edit was made, and no other task was started.

## IMPLEMENTATION SUMMARY

The round-1 partial diff already contained the complete, task-shaped implementation; round 2 validated
it end-to-end. The change adds one normalized, project-scoped mapping table in both Search Growth
dialect schemas plus the supporting migration/test/evidence artifacts:

- **`search_topic_keyword_refs`** (SQLite: `src/db/search-growth.schema.ts`, Postgres mirror:
  `src/db/pg/search-growth.schema.ts`) with exactly the approved fields
  `id, project_id, topic_id, open_seo_keyword_ref, created_at`. The mapping stores **only** the
  canonical OpenSEO `saved_keywords.id` reference — no keyword text, market fields, ranks, tags, or any
  other keyword entity is copied (04_OPENSEO_REUSE_CODE_MAP.md §1 "Topic mapping，不复制关键词库";
  20_DATABASE_SCHEMA_GUIDE.md §2 lists keywords/rank as a table that must not be re-created).
- **Same-Project enforcement in DDL, not application convention**, via two composite foreign keys whose
  leading column is the mapping row's own `project_id`:
  - `(project_id, topic_id) → search_topics(project_id, id)` and
  - `(project_id, open_seo_keyword_ref) → saved_keywords(project_id, id)`.
  A mapping whose topic or keyword lives on another Project has no matching parent row and is rejected
  by the database.
- **One mapping per `(topic_id, open_seo_keyword_ref)`** via a unique index (the V1.0 rule in
  `schemas/migrations-reference.sql`).
- **No-dangling delete behavior**: deleting a topic, a saved keyword, or a whole Project cascades the
  mapping away (all three FKs `ON DELETE CASCADE`, matching the established OpenSEO cascade convention).
- **Supporting composite unique index `saved_keywords_project_id_id_idx (project_id, id)`** added to the
  existing `saved_keywords` definition in both `app.schema.ts` files — required solely because a
  composite FK may reference only a unique key. `id` is already the primary key, so the composite index
  accepts/rejects exactly the same rows the PK accepts and adds no business uniqueness.
- **Migration-backed storage tests** (`src/db/search-topic-keyword-ref.test.ts`, 8 tests) proving valid
  same-Project reuse of one canonical saved-keyword row, duplicate rejection, cross-Project rejection in
  both parent directions, topic/keyword/project cascade deletion, and stable topic-id attachment across
  an allowed lifecycle mutation.

## FILES CHANGED

### Source — modified (tracked)
- `src/db/search-growth.schema.ts` — added `searchTopicKeywordRefs` (SQLite table + two composite FKs,
  unique `(topic_id, open_seo_keyword_ref)` index, keyword-read index).
- `src/db/pg/search-growth.schema.ts` — Postgres mirror of the same table/structure.
- `src/db/app.schema.ts` — added supporting unique index `saved_keywords_project_id_id_idx` on
  `saved_keywords (project_id, id)` (FK target; no business uniqueness).
- `src/db/pg/app.schema.ts` — Postgres mirror of the same supporting index.
- `src/db/schema.ts` — exported `searchTopicKeywordRefs` from the provider-aware barrel.

### Migrations / metadata (untracked additions)
- `drizzle/0047_search_topic_keyword_refs.sql`, `drizzle/meta/0047_snapshot.json`
- `drizzle-pg/0025_search_topic_keyword_refs.sql`, `drizzle-pg/meta/0025_snapshot.json`
- `drizzle/meta/_journal.json` (idx 47, tag `0047_search_topic_keyword_refs`),
  `drizzle-pg/meta/_journal.json` (idx 25, tag `0025_search_topic_keyword_refs`) — tracked modifications.

### Tests — untracked addition
- `src/db/search-topic-keyword-ref.test.ts` (8 tests).

### Control channel (untracked, prettier-ignored, not repo baseline)
- `control/tasks/T102-M1-TOPIC-KEYWORD-REFS-SCHEMA/DELIVERY.md` (this file),
  `control/tasks/T102-M1-TOPIC-KEYWORD-REFS-SCHEMA/evidence/round-2/*`.
  `REVIEW.md` and the `TASK.md` round-2 text are Controller-owned and were **not** edited by the executor.

## DATABASE / MIGRATION CHANGES

### `search_topic_keyword_refs` constraint inventory (identical on both dialects)
| artifact | definition |
| --- | --- |
| PK | `id` (text) |
| Columns | `project_id`, `topic_id`, `open_seo_keyword_ref`, `created_at` (all text, all NOT NULL; `created_at` defaults to `current_timestamp` on SQLite / the repo `isoNow` `to_char(...)` on Postgres) |
| Project FK | `project_id → projects(id) ON DELETE CASCADE` (established repo behavior) |
| Topic FK | `(project_id, topic_id) → search_topics(project_id, id) ON DELETE CASCADE` — same-Project composite FK |
| Keyword FK | `(project_id, open_seo_keyword_ref) → saved_keywords(project_id, id) ON DELETE CASCADE` — same-Project composite FK |
| Unique index | `search_topic_keyword_refs_unique_topic_keyword_idx (topic_id, open_seo_keyword_ref)` — V1.0 one-mapping-per-pair rule |
| Read index | `search_topic_keyword_refs_keyword_idx (open_seo_keyword_ref)` — keyword → topic direction |

### Supporting index on the existing `saved_keywords` table (both dialects)
| artifact | definition |
| --- | --- |
| Unique index | `saved_keywords_project_id_id_idx (project_id, id)` — exists **only** so the composite keyword FK above has a unique target. `id` is the PK, so this never rejects a row the PK would accept; no business uniqueness is added. |

### Constraint / behavior rationale
- **Cross-Project parents are rejected by the DB**: each composite FK binds the mapping's `project_id` to
  the parent's `project_id`, so a `proj_alpha` mapping cannot reference a `proj_beta` topic or a
  `proj_beta` saved keyword.
- **Duplicate pair is rejected by the DB**: the unique index on `(topic_id, open_seo_keyword_ref)` is the
  V1.0 reference rule.
- **No dangling mappings**: deleting a topic, saved keyword, or Project cascades to mapping rows
  (topic-FK cascade, keyword-FK cascade, and project-FK cascade), matching the OpenSEO cascade
  convention used by `search_market_profiles`/`search_topics`/`saved_keywords`.
- **Stable topic identity is preserved** (ADR-004): topic lifecycle mutations (rename/archive/merge)
  update the `search_topics` row in place, so existing mappings keep pointing at the same `topic_id`;
  the merge lifecycle rules from T101 are untouched.
- **No other product rule was added**: no canonical-topic uniqueness, no multi-topic exclusivity, no
  ranking/weight/role/order/confidence fields, no keyword text/location/language semantics, no JSON
  payloads — ownership and relations live in explicit FK columns.

### Migration identifiers
- D1 **0047** (`0047_search_topic_keyword_refs`), journal idx 47, `drizzle/meta/0047_snapshot.json`.
- Postgres **0025** (`0025_search_topic_keyword_refs`), journal idx 25,
  `drizzle-pg/meta/0025_snapshot.json`.
Both are the next identifiers after the accepted T101 migrations (0046 / 0024). Both dialects are
forward-only. The Postgres migration creates the supporting `saved_keywords_project_id_id_idx` unique
index **before** the composite-FK `ALTER TABLE`s (Postgres requires the referenced unique target to exist
first). Final dual-dialect `db:generate` reports **no schema change** on either dialect.

## DEPENDENCIES CHANGED

None. `corepack pnpm install --frozen-lockfile` → exit 0, "Lockfile is up to date / Already up to
date"; `package.json`/`pnpm-lock.yaml` are unchanged (`git status` clean of package files).

## TESTS ADDED

- `src/db/search-topic-keyword-ref.test.ts` (8 tests). Runs against a real in-memory SQLite database
  built from the **actual shipped migration DDL** (`drizzle/0047_search_topic_keyword_refs.sql` and the
  `search_topics` table from `drizzle/0046_search_topics.sql`) with `PRAGMA foreign_keys = ON`, so the
  storage contract the migration ships is what is exercised. The `projects`/`saved_keywords` fixture
  tables are minimal mirrors carrying the FK-referenced columns (matching how T100/T101 tests mirror
  `projects`); the 0047 DDL itself creates the supporting `saved_keywords_project_id_id_idx` unique
  index on that mirror, exactly as it does on the real table.
  1. **Valid same-Project mapping + OpenSEO reuse** — two topics on one project map to a single canonical
     `saved_keywords` row; mapping rows store only the keyword `id` reference and the keyword count stays 1.
  2. **Duplicate `(topic_id, open_seo_keyword_ref)` rejected** → UNIQUE constraint violation.
  3. **Cross-Project topic rejected** — topic on `proj_beta`, mapping claims `proj_alpha` → FK violation.
  4. **Cross-Project keyword rejected** — keyword on `proj_beta`, mapping claims `proj_alpha` → FK violation.
  5. **Topic delete cascades** the mapping away.
  6. **Saved-keyword delete cascades** the mapping away.
  7. **Project delete cascades** the mapping away (project FK + both composite FKs).
  8. **Stable topic mapping across lifecycle mutation** — rename → archive → merge mutates the topic row
     in place; exactly one mapping row survives, still pointing at the same `topic_id` and `project_id`.
- `src/db/schema-parity.test.ts` (194 tests, passes) — structurally compares the new table on both
  dialect barrels (columns/PK/unique targets/FKs incl. `onDelete`/CHECK names) plus the new supporting
  index on `saved_keywords`.

## COMMANDS RUN

Run independently per the approved matrix. Concise sanitized logs under
`control/tasks/T102-M1-TOPIC-KEYWORD-REFS-SCHEMA/evidence/round-2/*`.

1. `node --version` → exit 0 → `v24.16.0`
2. `corepack pnpm --version` → exit 0 → `10.30.1`
3. `corepack pnpm install --frozen-lockfile` → exit 0 → lockfile up to date; `package.json`/lockfile unchanged
4. `corepack pnpm exec prettier --write <6 task-touched source/test files>` → exit 0, all 6 "(unchanged)"
5. `corepack pnpm run db:migrate:local` → exit 0 → `✅ No migrations to apply!` (local store already
   carries the full history; the round-1 clean full apply `0000 → 0047_search_topic_keyword_refs.sql`
   succeeded and 0047 is marked `✅` in the retained round-1 evidence log)
6. `corepack pnpm run db:generate` → exit 0 → **"No schema changes, nothing to migrate"** on both D1 and
   Postgres dialects
7. `corepack pnpm exec vitest run <4 focused schema/parity/mapping files>` → exit 0 → **212/212 passed**
8. `corepack pnpm format:check` → exit 0 → "All matched files use Prettier code style!"
9. `corepack pnpm types:check` → exit 0 → `tsc --noEmit` clean
10. `corepack pnpm lint` → exit 0 → oxlint `Found 0 warnings and 0 errors` (852 files)
11. `corepack pnpm test` → exit 0 → **145 files / 1212 tests passed** (79.19s)
12. `corepack pnpm build` → exit 0 → vite client/ssr/open_seo_audit built + `tsc --noEmit` clean
13. `corepack pnpm ci:check` → **exit 0** → prettier, knip, tsc (root + badseo), oxlint (0/0), plugin-skills
    sync all clean
14. Read-only Git inspection: `git status`, `git diff --stat`, `git log` — see GIT STATUS/DIFF SUMMARY

## COMMAND RESULTS (evidence)

- **REVIEW BLOCKER resolved.** Round 2 completed every approved gate; each exited 0 and produced the
  DELIVERY/acceptance evidence that round 1 lacked. Focused tests 212/212; full suite 145 files / 1212
  tests; `format:check`, `types:check`, `lint`, `build`, and the full `ci:check` all exit 0.
- **db:generate consistency** — the final dual-dialect run reports "No schema changes, nothing to
  migrate" on both dialects, so the 0047/0025 migrations and snapshots match the shipped schema exactly
  (including the supporting `saved_keywords_project_id_id_idx` unique index in both snapshots).
- **Local migration** — `db:migrate:local` exits 0 against the current local D1 store; the retained
  round-1 clean full-apply log confirms `0047_search_topic_keyword_refs.sql` applies successfully over
  the entire 0000→0047 history.
- **Previously-flaky pre-existing tests** (projects service, workspace-merge, oauth-provider,
  oauth-refresh e2e, AuthRepository/ProjectContextRepository query tests) all passed in the round-2 full
  run — the round-1 full-run failures were machine-load timeouts, not T102 regressions.

## RUNTIME EVIDENCE

- **Storage/mapping-integrity tests** — all 8 pass against the real 0047 DDL with foreign keys enabled:
  the DB itself rejects duplicate pairs and cross-Project parents in both directions, cascades mapping
  rows on topic/keyword/Project deletion, and keeps mappings attached to the stable topic id across a
  rename→archive→merge lifecycle.
- **OpenSEO reuse proof** — the mapping table has no keyword text/market/rank/tag columns; its keyword
  FK references `saved_keywords (project_id, id)` (the canonical OpenSEO saved list, untouched apart from
  the supporting unique index). The reuse test maps two topics to one saved-keyword row and asserts the
  saved-keyword count stays 1. Existing OpenSEO saved-keyword tests
  (`src/server/features/keywords/services/research/saved-keywords.test.ts`) remain green in the full suite.
- **Schema parity** — the new table and the supporting `saved_keywords` index are structurally identical
  on SQLite and Postgres; 194/194 parity tests pass.
- **Postgres migration artifact** — pg DDL/journal/snapshot are consistent (`db:generate:pg` clean); the
  pg DDL orders the supporting unique index before the composite-FK `ALTER TABLE`s as Postgres requires.
  A live `db:migrate:pg` still requires a real Postgres URL and is not in the approved command set.

## KNOWN LIMITATIONS

- `db:migrate:pg` was not executed (requires a live `POSTGRES_DATABASE_URL`; not in the approved command
  set). Postgres migration/snapshot consistency is proven via `db:generate:pg` (no diff), the parity
  tests, and review of the generated DDL ordering.
- `db:migrate:local` in round 2 reported "No migrations to apply" because the local D1 store already had
  all migrations applied; the clean full apply (0000→0047) was captured in the round-1 evidence log
  (0047 `✅`). The local D1 store is gitignored/ephemeral; no repo/production state is affected.
- Per scope: no keyword CRUD/repository/service/server-function/API/UI/connector/later-domain code was
  added; the mapping is a storage contract only.
- The `search_topic_keyword_refs` test mirrors the minimal `saved_keywords` parent shape rather than
  re-using the full `drizzle/0000` DDL (the real table is created inside the large 0000 preamble); the
  mirror carries the FK-referenced columns plus the keyword/location/language columns the test asserts,
  and the 0047 DDL creates the supporting unique index on it exactly as on the real table.

## DEVIATIONS FROM TASK

None in product scope. Design decisions recorded and explained above:
- The supporting `saved_keywords_project_id_id_idx (project_id, id)` unique index was added only because
  the composite keyword FK requires a unique target; it adds no business uniqueness (id is already the PK).
- Delete behavior is **CASCADE** for all three parents (topic, saved keyword, Project) so a mapping can
  never dangle; this matches the established OpenSEO cascade convention and is identical on both dialects
  (parity-asserted).
- Evidence for round 2 is saved under `evidence/round-2/` (a fresh, complete set) rather than mutating
  the aborted round-1 partial artifacts.

## SECURITY NOTES

- No external requests, credentials, account access, CAPTCHA/2FA bypass, stealth behavior, cookie upload,
  production publishing, remote migration, or paid action was performed.
- No dependency, lockfile, manifest, ADR, scope-lock, or production resource change.
- All work is local to the isolated worktree; `db:migrate:local` touches only the gitignored local
  Wrangler D1 state.
- Ownership and relations are explicit FK columns — no relational data is stored in JSON/text payloads;
  no new untrusted-input or auth path was added (storage-only change).

## GIT STATUS/DIFF SUMMARY

See `control/tasks/T102-M1-TOPIC-KEYWORD-REFS-SCHEMA/evidence/round-2/14-git.txt`. Tracked
modifications (`git diff --stat`, 8 files, +160/−2): the two Search Growth schema files, the two
`app.schema.ts` files, `src/db/schema.ts` (export), the two `_journal.json` files, and the
Controller-owned `TASK.md` (round-2 text, unedited by the executor). Untracked additions: regenerated
`0047`/`0025` migration + snapshot files, `src/db/search-topic-keyword-ref.test.ts`, `DELIVERY.md`,
`REVIEW.md` (Controller-owned), and `evidence/round-2/*`. No lockfile, package manifest, ADR, scope,
`.prettierignore`, or production change is part of the diff. Nothing committed; nothing merged.

## READY FOR REVIEW

Both dialects define one logically equivalent, project-scoped `search_topic_keyword_refs` table with
exactly the approved fields, referencing the accepted `search_topics` table and the existing OpenSEO
`saved_keywords` table without duplicating any keyword data. Same-Project parent integrity, the V1.0
per-pair uniqueness rule, and no-dangling cascade deletion are all enforced by database constraints
(composite same-Project FKs + a supporting unique index on `saved_keywords(project_id, id)` that adds no
business uniqueness), and are proven by 8 migration-backed storage tests plus the cross-dialect parity
suite. Forward migrations/snapshots use the next identifiers after accepted T101 (D1 0047, Postgres
0025); local D1 migration is applied, and a final dual-dialect `db:generate` reports no schema change.
Focused tests 212/212; full suite 145 files/1212 tests; `format:check`, `types:check`, `lint`, `build`,
and the full `ci:check` all exit 0. Not committed; not merged; REVIEW.md not edited; no other task
started.
