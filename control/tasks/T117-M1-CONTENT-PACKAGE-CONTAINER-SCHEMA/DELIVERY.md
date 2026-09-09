# DELIVERY — T117-M1-CONTENT-PACKAGE-CONTAINER-SCHEMA (round 1)

## STATUS

`BLOCKED_BY_TEST_ENVIRONMENT` — the implementation itself is complete and
in-scope; every approved gate that the executor sandbox permits runs and exits 0
(local D1 migration + idempotency re-run, dual-dialect `db:generate` first +
clean final run, task-file Prettier, focused Vitest, full Vitest, read-only Git).
The five whole-repo gates required by TASK item 5 (`format:check`, `types:check`,
`lint`, `build`, `ci:check`) are auto-denied by this session's sandbox with no
approval surface — `format:check` was attempted exactly once as the representative
aggregate command and denied ("This command requires approval"); the denial
message states that any other approval-requiring command will be denied the same
way for the rest of the session, so per TASK item 5 ("record the exact denial
once and stop without retry or bypass") no exit code exists for any of the five.
This is the same environment block recorded across T111–T115 and is reported
honestly as an environment limitation, not as passing and not as a scope/code
deviation.

## TASK ID

`T117-M1-CONTENT-PACKAGE-CONTAINER-SCHEMA` — implementation round 1. No
`REVIEW.md` existed at round start (verified before implementation); none was
created.

## IMPLEMENTATION SUMMARY

Added the normalized, Project-scoped `content_packages` container persistence
contract across both dialects (D1/SQLite + PostgreSQL). This slice is
schema/contract ONLY: it establishes only the package's core identity and its
required Topic / optional Opportunity ownership. It adds no ContentVersion,
ContentVariant, brief/canonical content, metadata/WebPageSpec JSON,
claims/sources/assets mappings, keywords/prompts, market/persona modeling,
search intent/PageFit behavior, immutable/version/gate runtime, renderers,
CRUD/UI, connector/publishing or production action.

Storage contract shipped:

- `content_packages` (both dialects): stable text `id` (PK), explicit NOT NULL
  `project_id` (FK → `projects(id)` ON DELETE CASCADE), required `topic_id`
  (NOT NULL), nullable `opportunity_id`, required opaque `title` / `locale` /
  `status` (NOT NULL text, stored verbatim), plus the established
  `created_at`/`updated_at` audit timestamps (DEFAULT `(current_timestamp)` /
  PG `to_char(now() AT TIME ZONE 'utc', ...)`).
- Same-Project ownership is database-enforced by two Project-leading composite
  FKs:
  - `(project_id, topic_id) -> search_topics(project_id, id)` ON DELETE CASCADE
    (Topic target unique via the accepted T101 `search_topics_project_id_id_idx`);
  - `(project_id, opportunity_id) -> search_growth_opportunities(project_id, id)`
    ON DELETE CASCADE, enforced only when `opportunity_id` is present.
  The Opportunity target `(project_id, id)` was not previously unique, so the new
  migrations add exactly one supporting unique index to the accepted T109
  `search_growth_opportunities` table
  (`search_growth_opportunities_project_id_id_idx`) — the only new referential
  parent index this slice requires (added in the new forward migrations, never by
  editing the accepted T109 migrations 0055/0033 or any other accepted
  migration).
- Three non-unique lookup/cascade indexes on the container row:
  `content_packages_project_idx`, `content_packages_topic_idx`,
  `content_packages_opportunity_idx`.
- No invented semantics: `status` is an opaque NOT NULL text column with no enum
  column, no CHECK and no lifecycle/gate/release/publication-success meaning
  (TASK item 3); no Market/Persona/keyword/prompt relation is inferred from JSON
  (TASK item 2) — the row carries no JSON column at all; and no business
  uniqueness exists (TASK item 2).

## FIELD RECONCILIATION

Sources: the TASK field list (authoritative), `05_DOMAIN_DATA_MODEL.md` §10
ContentPackage ("主题容器"), `09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§1–2 and §8,
`29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`, accepted T101 Topic and T109
Opportunity relation patterns, and the legacy reference artifacts
`schemas/domain-types.ts` ContentPackageVersion and
`schemas/migrations-reference.sql` content_packages. Reference artifacts are
read-only and were NOT edited.

| ContentPackage aspect | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). |
| `project_id` | explicit non-null Project ownership | NOT NULL FK → projects(id) ON DELETE CASCADE. |
| `topic_id` | required Topic ownership | NOT NULL text id; same-Project composite FK `(project_id, topic_id) -> search_topics(project_id, id)` ON DELETE CASCADE (Topic target unique via the accepted `search_topics_project_id_id_idx`; no new parent index needed). |
| `opportunity_id` | nullable Opportunity ownership | Nullable text id; when present the same-Project composite FK `(project_id, opportunity_id) -> search_growth_opportunities(project_id, id)` ON DELETE CASCADE applies; NULL means no opportunity attached (FK not enforced). Requires the new `search_growth_opportunities_project_id_id_idx` supporting target. |
| `title` | required opaque | NOT NULL opaque text, stored verbatim; no normalization/format rules. |
| `locale` | required opaque | NOT NULL opaque text, stored verbatim; a container is never locale-less/global. |
| `status` | required opaque | NOT NULL opaque text, stored verbatim; deliberately NOT an enum column and no lifecycle/gate/release/publication-success semantics (TASK item 3). A row is a topic container, never a ContentVersion/approved release/public-publish proof. |
| `created_at` / `updated_at` | established audit timestamps | NOT NULL text timestamps with DB defaults (mutable container row a later CRUD/lifecycle task refreshes in place). |
| ContentVersion / ContentVariant / brief / canonical Markdown / metadata / WebPageSpec / claims / sources / assets / keywords / prompts / market / persona | §10/§2 future slices + migrations-reference `content_package_versions` etc. | Reconciled OUT — none shipped on this container row; no JSON column exists and every relationship is a typed FK column (TASK item 2). |
| business uniqueness | TASK item 2 forbids | NOT shipped — the only unique indexes are the PK and the two referential parent targets (`search_topics_project_id_id_idx` accepted, `search_growth_opportunities_project_id_id_idx` added). |

## RELATION / FK / IDENTITY / DELETE DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project integrity: two Project-leading composite FKs to the required Topic
  and the optional Opportunity (the accepted T109/T115 same-Project pattern).
  They make it impossible to record a package whose Topic or Opportunity belongs
  to a different Project in EITHER direction (child project mismatch, or parent on
  the other Project) and impossible to attach a package to a dangling Topic or
  Opportunity.
- Necessary referential parent key only: the single added unique index
  `search_growth_opportunities_project_id_id_idx` on the accepted T109
  opportunities table exists solely as the composite-FK target. It is NOT a
  business-uniqueness rule on opportunities (the opportunities `id` PK remains the
  identity; the composite accepts exactly the rows the PK accepts). The Topic
  composite FK needed no new parent index (`search_topics_project_id_id_idx`
  already exists from T101/0046).
- Delete behavior: ON DELETE CASCADE on the Project FK and on BOTH composite
  parent FKs — deleting a Topic, an Opportunity, or a whole Project cascades its
  content packages away, so a container can never dangle.
- Indexes: only the three Project/Topic/Opportunity non-unique lookup/cascade
  indexes on `content_packages` plus the single required referential parent index
  on the parent. No business/unique index on the container row.
- Container row is mutable: `created_at`/`updated_at` both shipped (consistent
  with the accepted T109 opportunity pattern and the `migrations-reference.sql`
  `content_packages` shape).

## MIGRATION IDS

- D1/SQLite: `drizzle/0062_calm_nightcrawler.sql` (+
  `drizzle/meta/0062_snapshot.json`, `drizzle/meta/_journal.json` idx 62). Drizzle
  generated the SQLite file with the table + its indexes + the parent unique index
  in an order that is valid for SQLite (FK parent-key uniqueness is enforced at
  DML time), so it was left as generated.
- PostgreSQL: `drizzle-pg/0040_panoramic_timeslip.sql` (+
  `drizzle-pg/meta/0040_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 40).
  Drizzle generated this file with the content_packages -> search_growth_
  opportunities FK ALTER BEFORE the supporting parent unique index, which
  Postgres rejects at FK-ADD time. I rewrote the file so
  `search_growth_opportunities_project_id_id_idx` is created BEFORE the three FK
  ALTERs (the accepted T111/T115 fix pattern recorded in `drizzle-pg/0035` and
  `0039`), keeping all other generated statements unchanged.

Accepted migrations (SQLite ≤ 0061, PG ≤ 0039) were NOT edited. Clean final
dual-dialect `db:generate` re-run reports `No schema changes, nothing to migrate
😴` on both dialects (53 tables each).

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — updated the header `max-lines` eslint-disable
  comment to include T117 content_packages; updated the `searchGrowthOpportunities`
  ownership comment to note the new `search_growth_opportunities_project_id_id_idx`
  supporting target (added for the T117 container FK); added that unique index to
  the opportunities table callback; appended the `contentPackages` sqliteTable at
  end of file with a full field-reconciliation/ownership/no-business-uniqueness
  comment block.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror (same
  supporting unique index + same `contentPackages` pgTable with `isoNow`
  defaults); header and opportunity comments updated the same way.
- `src/db/schema.ts` — destructured barrel export adds `contentPackages` after
  `publishedMediaRefs`.
- `drizzle/meta/_journal.json` and `drizzle-pg/meta/_journal.json` —
  `db:generate` journal entries (idx 62 / idx 40).

Added (untracked):

- `drizzle/0062_calm_nightcrawler.sql` and `drizzle/meta/0062_snapshot.json`.
- `drizzle-pg/0040_panoramic_timeslip.sql` and
  `drizzle-pg/meta/0040_snapshot.json`.
- `src/db/content-package.test.ts` — the migration-backed storage spec (14
  tests).

Task-channel file for this round: `DELIVERY.md` (this document).

## DATABASE/MIGRATION CHANGES

- New `content_packages` table on both dialects (9 columns / 3 indexes / 3 fks
  each): D1 0062 and PG 0040.
- One supporting unique index added to the accepted `search_growth_opportunities`
  table on both dialects (referential target of the new same-Project composite
  Opportunity FK).
- Snapshots (`0062_snapshot.json` / `0040_snapshot.json`) and journals (idx 62 /
  idx 40) written by `db:generate`. 53 tables on each dialect.

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install
used the existing lockfile).

## TESTS ADDED

- `src/db/content-package.test.ts` — 14 migration-backed storage tests that build
  a real in-memory SQLite client, enable `PRAGMA foreign_keys = ON`, hand-create
  the `projects` table, and apply the actual shipped forward-migration DDL in
  order (`0045` market profiles, `0046` topics, `0049` prompts, `0055`
  opportunities, then `0062` content_packages, split on
  `--> statement-breakpoint`). The DDL is the source of truth, so the Project FK,
  the same-Project composite Topic/Opportunity FKs, and the delete cascades are
  exercised — not an application convention. Tests cover: valid same-Project
  persistence with the full TASK field set + `created_at`/`updated_at` defaults;
  verbatim round-trip of the opaque `title`/`locale`/`status` values and the
  nullable-Opportunity behavior (exact NULL round-trip when omitted, stored value
  when present); cross-Project Topic rejection in BOTH directions; cross-Project
  Opportunity rejection in BOTH directions; dangling-Topic, dangling-Opportunity
  and dangling-Project FK rejection; NOT NULL rejection of each required direct
  column (`id`, `project_id`, `topic_id`, `title`, `locale`, `status`); Topic
  delete cascade; Opportunity delete cascade; whole-Project delete cascade; exact
  column-shape assertion (`created_at, id, locale, opportunity_id, project_id,
  status, title, topic_id, updated_at` — no ContentVersion/brief/metadata/claims/
  sources/assets/keyword/prompt/market/persona JSON column and no business-unique
  column).
- Dialect parity: the new table is auto-picked-up by the existing
  `src/db/schema-parity.test.ts` (now 274 tests: +5 per-table assertions for the
  new table — columns/PK/unique/FKs/indexes), which structurally compares every
  SQLite and PG table. It also confirms both dialects now report the same
  structural change to `search_growth_opportunities` (the added unique index).

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no chained shell
operations).

1. `node --version` → v24.16.0.
2. `corepack pnpm --version` → 10.30.1.
3. `corepack pnpm install --frozen-lockfile` → exit 0 (lockfile up to date,
   resolution skipped; 980 packages linked; ignored-build-scripts warning only).
4. `corepack pnpm run db:generate` (dual-dialect, first run) → exit 0 —
   produced `drizzle/0062_calm_nightcrawler.sql` and
   `drizzle-pg/0040_panoramic_timeslip.sql` with snapshots + journal entries
   (53 tables on both dialects; `content_packages` = 9 columns / 3 indexes / 3
   fks on both; `search_growth_opportunities` now 15 columns / 3 indexes / 3 fks
   on both).
5. `corepack pnpm run db:migrate:local` (apply local D1 state) → exit 0 —
   0000 → 0062 all ✅ (`0062_calm_nightcrawler.sql` ✅).
6. Task-file Prettier: `corepack pnpm exec prettier --write <4 changed/new task
   source files>` → exit 0 (both schema files, `schema.ts` and the new storage
   test — already formatted, unchanged), then re-run on the edited test file →
   exit 0 (unchanged).
7. Focused Vitest (`corepack pnpm exec vitest run` with the 3 task-related
   files) → exit 0 — 3 files / 304 tests passed (14 content-package + 16
   opportunity + 274 parity).
8. `corepack pnpm run db:generate` (dual-dialect, clean final run) → exit 0 —
   both dialects: 53 tables, `No schema changes, nothing to migrate 😴`.
9. `corepack pnpm run db:migrate:local` (idempotency re-run) → exit 0 —
   `✅ No migrations to apply!`.
10. Full Vitest (`corepack pnpm exec vitest run`, default parallelism) — three
    runs: run 1 exit 1 (1 load-flake: `oauth-refresh.e2e.test.ts` beforeEach
    hook timed out in 30000ms under parallel load; 1506 passed / 1 failed);
    run 2 exit 1 (1 load-flake: `workspace-merge.test.ts` beforeAll hook timed
    out in 10000ms under parallel load; 1504 passed + 3 skipped / 1 failed
    suite); run 3 exit 0 — **170 files / 1507 tests passed**. Both flaked files
    pass in isolation and pass in the final clean full run.
11. `corepack pnpm run format:check` → **sandbox auto-denied; no exit code**
    (recorded exactly once; per TASK item 5 the remaining same-class whole-repo
    gates were not separately retried/bypassed — the denial message states any
    approval-requiring command is denied for the rest of the session).
12. `corepack pnpm run types:check` → **sandbox-denied class; no exit code**
    (same aggregate whole-repo gate class; not retried after the recorded
    denial).
13. `corepack pnpm run lint` → **sandbox-denied class; no exit code**.
14. `corepack pnpm run build` → **sandbox-denied class; no exit code**.
15. `corepack pnpm run ci:check` → **sandbox-denied class; no exit code**.
16. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`) → exit 0 — `git diff --check` clean.

## COMMAND RESULTS

Passing on the final tree: frozen install exit 0; local D1 migration exit 0
(0000 → 0062 applied ✅, then idempotent `✅ No migrations to apply!`); clean
final dual-dialect `db:generate` exit 0 (`No schema changes, nothing to migrate
😴` on both dialects, 53 tables each); task-file Prettier exit 0 (files already
formatted); focused Vitest **3 files / 304 tests** exit 0; full Vitest **170
files / 1507 tests** exit 0 at default parallelism on the final clean run
(completed 185.85s); read-only Git inspection clean (`git diff --check` clean).

Environment limitation (reported, not hidden): the sandbox auto-approval grant
list for this executor session does not include `format:check`, `types:check`,
`lint`, `build`, `ci:check`. `format:check` was attempted as a standalone
invocation and auto-denied with no approval surface ("This command requires
approval"); the denial message states that any other approval-requiring command
will be denied the same way for the rest of the session, so **no exit code exists
for any of the five gates in this session**. Per TASK item 5 the exact denial was
recorded once and no retry/bypass was attempted. This is the same environment
block recorded for T111–T115.

## RUNTIME EVIDENCE

- Full-suite Vitest final clean run: `Test Files 170 passed (170)`, `Tests 1507
  passed (1507)`, exit 0 at default parallelism. The new storage spec's 14 tests
  and the extended parity suite (274) pass inside it. (1507 = prior accepted
  count 1488 + 14 content-package storage tests + 5 parity assertions for the
  new table.) Two earlier full runs each hit one unrelated, load-sensitive
  cold-import hook timeout (`oauth-refresh.e2e.test.ts` 30s beforeEach;
  `workspace-merge.test.ts` 10s beforeAll) under heavy parallel CPU contention;
  both files pass in isolation and both pass in the final clean full run.
- Focused Vitest: 3 files / 304 tests, exit 0 (14 content-package + 16
  opportunity + 274 parity).
- `db:migrate:local`: 0062 applied successfully (✅) on the local D1 state;
  re-run reports `✅ No migrations to apply!`, exit 0 (journal complete and
  idempotent).
- `db:generate` final: D1 then PG each print 53 tables and `No schema changes,
  nothing to migrate 😴`, exit 0 — confirms both dialects' schemas exactly match
  their snapshots with no drift; `content_packages` = 9 columns / 3 indexes / 3
  fks and `search_growth_opportunities` = 15 columns / 3 indexes / 3 fks on both.
- Read-only Git inspection: `git diff --check` clean; file set below is exactly
  the intended change set.
- Five full-repo gates: no exit codes (sandbox auto-denied) — see COMMAND
  RESULTS / KNOWN LIMITATIONS.

## KNOWN LIMITATIONS

- The `format:check` / `types:check` / `lint` / `build` / `ci:check` gates
  remain non-executable in this executor session: the sandbox auto-denies the
  aggregate whole-repo command class with no approval surface, so no exit code
  exists for any of the five (TASK item 5's "every gate must exit 0" therefore
  cannot be fully evidenced here). This is the same environment block recorded
  across T111–T115 and is reported as `BLOCKED_BY_TEST_ENVIRONMENT` — a
  test-environment limitation, not a scope or code deviation. The runnable matrix
  (frozen install, local migration + re-run, dual-dialect `db:generate` first +
  clean final run, focused and full Vitest, task-file Prettier, read-only Git)
  all pass, including a clean full-suite exit 0. A grant-enabled session, the
  controller/QA under the Product Owner's bounded acceptance-verification
  exception, or a human gate must produce the five exit codes before final
  acceptance.
- Two of the three full-suite runs in this session hit one unrelated,
  load-sensitive cold-import hook timeout each under heavy parallel CPU
  contention (`oauth-refresh.e2e.test.ts` and `workspace-merge.test.ts`); both
  pass in isolation and in the final clean full run. This is an environment load
  artifact of the shared executor, not a defect in this change set.
- Type/lint surface for the new module could not be checked by `tsc`/`oxlint`
  this round (sandbox-denied); it is the same idiom as the accepted
  topic/opportunity/media-asset/published-media-ref same-Project modules, and
  the focused + full Vitest suites import and execute the new module and both
  schema mirrors at runtime (parity compares every column/index/FK between
  dialects).
- Scope-shape notes (by design, not defects): the table is schema/contract only —
  no ContentVersion/ContentVariant/brief/canonical content/metadata/WebPageSpec/
  claims/sources/assets/keyword/prompt/market/persona column or behavior, no
  lifecycle/gate/release/publication-success semantics, no CRUD/UI and no
  business uniqueness; `title`/`locale`/`status` are opaque verbatim text;
  `created_at`/`updated_at` are DB-defaulted text (the established convention);
  and `opportunity_id` is a nullable same-Project FK (see FIELD RECONCILIATION).

## DEVIATIONS FROM TASK

None in scope, field set, ownership rule, delete behavior, index set or
migration IDs. The table ships D1 `0062` and PostgreSQL `0040` as required with
forward snapshots + journals; same-Project ownership is enforced by the
Project-leading composite FKs `(project_id, topic_id) -> search_topics(project_id,
id)` and `(project_id, opportunity_id) -> search_growth_opportunities(project_id,
id)`; the single necessary new referential parent key
`search_growth_opportunities_project_id_id_idx` is added to the accepted T109
opportunities table; both composite FKs and the Project FK cascade on delete;
`status` is opaque (no enum/CHECK); and no JSON/business-unique column exists.
The one generated-file adjustment is an implementation detail required for
PostgreSQL correctness: `drizzle-pg/0040` was reordered so the parent unique index
is created before the composite-FK ALTER (the accepted T111/T115 fix pattern in
`drizzle-pg/0035` and `0039`); the SQLite 0062 ordering was left as generated
(valid for SQLite). The only non-`0` outcomes are environmental: the five
full-repo gates could not be granted by the sandbox in this round, and two of
three full-suite runs each hit one unrelated load-sensitive hook timeout before
the final clean exit-0 run (see KNOWN LIMITATIONS) — both reported as environment
limitations, not scope deviations.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state (`db:migrate:local`) and
  in-memory SQLite built from the shipped forward-migration DDL.
- No network/provider/publishing action occurred. No commit, merge, or push was
  performed. No `main` branch was touched.
- TASK-approved command names only; the one denied invocation (`format:check`)
  was abandoned without retry or bypass after the sandbox denial, and the
  same-class whole-repo gates were not separately re-attempted per the denial
  guidance.
- No content versioning, brief/canonical content, claims/sources/assets,
  keyword/prompt/market/persona modeling, renderer, CRUD/UI, connector or
  publishing behavior was added (out of scope); the slice adds persistence/
  contract surface only. `status` is opaque and carries no release/publication
  success semantics.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T117-M1-CONTENT-PACKAGE-CONTAINER-SCHEMA`; working tree is
  NOT committed (rounds stop at delivery). Recent commit on the branch: `5554776
  control: accept T115 and dispatch T117`.
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json` (db:generate journal entries);
  `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
  `src/db/schema.ts`.
- Added (untracked) files (5): `drizzle/0062_calm_nightcrawler.sql`,
  `drizzle/meta/0062_snapshot.json`, `drizzle-pg/0040_panoramic_timeslip.sql`,
  `drizzle-pg/meta/0040_snapshot.json`, `src/db/content-package.test.ts`.
- Task-channel file: `control/tasks/T117-M1-CONTENT-PACKAGE-CONTAINER-SCHEMA/DELIVERY.md`
  (this document). `REVIEW.md` did not exist at round start and was not created.
- `git diff --stat` (tracked): 5 files, +286/−4. `git diff --check` clean.
- No other files are dirty or untracked.

## READY FOR REVIEW

Implementation round 1 is complete and in-scope: the normalized, Project-scoped
`content_packages` container table ships on both dialects with forward migrations
0062/0040, snapshots, journals, database-enforced same-Project ownership via the
Project-leading composite FKs to the required Topic and optional Opportunity
(plus the single necessary referential unique target
`search_growth_opportunities_project_id_id_idx` added to the accepted T109
opportunities table), ON DELETE CASCADE on the Project/Topic/Opportunity FKs,
verbatim opaque `title`/`locale`/`status` (no lifecycle/gate/publication
semantics), created/updated audit timestamps, and no JSON or business-uniqueness
surface. Runnable approved gates pass on the final tree: frozen install exit 0,
local D1 migration exit 0 (0000 → 0062 applied, idempotent on re-run), clean
final dual-dialect `db:generate` exit 0 (`No schema changes, nothing to migrate`
on both dialects), task-file Prettier exit 0, focused Vitest 3 files / 304 tests
exit 0, full Vitest 170 files / 1507 tests exit 0 (default parallelism, final
clean run), and read-only Git clean. The five full-repo gates (`format:check`,
`types:check`, `lint`, `build`, `ci:check`) could not be executed because the
sandbox auto-denies them with no approval surface (no exit codes), so status is
reported as `BLOCKED_BY_TEST_ENVIRONMENT`. No `PASS` verdict is written by the
implementation round.
