# DELIVERY — T119-M1-CONTENT-VERSION-CLAIM-REF-SCHEMA (round 1)

## STATUS

`BLOCKED_BY_TEST_ENVIRONMENT` — the implementation is complete and in-scope; every
approved gate that the executor sandbox permits runs and exits 0 (frozen install,
dual-dialect `db:generate` first + clean final run, local D1 migration +
idempotency re-run, task-file Prettier `--write`, focused Vitest, full Vitest,
read-only Git). The five whole-repo gates required by TASK item 5
(`format:check`, `types:check`, `lint`, `build`, `ci:check`) are auto-denied by
this session's sandbox with no approval surface — `format:check` was attempted
exactly once as the representative aggregate command and denied ("This Bash
command contains multiple operations … requires approval"); per TASK item 5
("record its exact denial once and stop without retry or bypass") the remaining
same-class gates were not separately re-attempted, so no exit code exists for any
of the five. This is the same environment block recorded across T111–T115, T117
and T118 and is reported honestly as an environment limitation, not as passing
and not as a scope/code deviation.

## TASK ID

`T119-M1-CONTENT-VERSION-CLAIM-REF-SCHEMA` — implementation round 1. No
`REVIEW.md` existed at round start (verified before implementation); none was
created.

## IMPLEMENTATION SUMMARY

Added the normalized, Project-scoped `content_package_versions` → `claims`
reference contract across both dialects (D1/SQLite + PostgreSQL). This replaces
the V1.0 conceptual `claim_ids[]` array on a content version with explicit
relational rows (05_DOMAIN_DATA_MODEL.md §10 `claim_ids[]`;
09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §1 claim refs and §10 source traceability).
This slice is schema/contract ONLY: it does not evaluate Claim gates, verify/
reverify claims, or publish content (TASK GOAL and item 3).

Storage contract shipped:

- `content_package_version_claims` (both dialects): stable text `id` (PK),
  explicit NOT NULL `project_id` (FK → `projects(id)` ON DELETE CASCADE),
  required `content_package_version_id`, required `claim_id`, and the
  append-only `created_at` timestamp only (TASK item 1).
- Same-Project ContentVersion ownership is database-enforced by the
  Project-leading composite FK
  `(project_id, content_package_version_id) -> content_package_versions(project_id, id)`
  ON DELETE CASCADE. The parent `(project_id, id)` target did not previously
  exist on the accepted T118 `content_package_versions` table, so the new
  migrations add exactly one supporting unique index to it
  (`content_package_versions_project_id_id_idx`) — the only new referential
  parent index this slice requires (TASK item 2).
- Same-Project Claim ownership is database-enforced by the Project-leading
  composite FK `(project_id, claim_id) -> claims(project_id, id)` ON DELETE
  CASCADE, reusing the accepted Claim target `claims_project_id_id_idx` from the
  T111 migrations (D1 0057 / PG 0035). No index is added to `claims`.
- Edge identity `(content_package_version_id, claim_id)` is the ONLY business
  uniqueness (unique index
  `content_package_version_claims_unique_content_package_version_claim_idx`);
  the claim → versions read path is served by the reverse non-unique index
  `content_package_version_claims_claim_idx`. No other business uniqueness or
  lookup index exists on the table.
- Immutable reference shape preserved: no `updated_at`, no JSON id array, no
  mutable evidence payload, no claim verification/reverification state, no gate
  evaluation/override, no release/publishing behavior, and no CRUD/UI (TASK
  items 1 and 3). Claim verification state stays on the linked `claims` row;
  a later hard-claim Gate reads a version's claims through this link.

## FIELD RECONCILIATION

Sources: the TASK field list (authoritative), `05_DOMAIN_DATA_MODEL.md` §§9–10
(Claim and ContentVersion — the conceptual `claim_ids[]`),
`09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§2–4 and §10,
`21_TEST_ACCEPTANCE_PLAN.md` §10, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`,
the accepted T111/T112/T118 same-Project relation patterns, and the legacy
reference artifacts `schemas/domain-types.ts` ContentPackageVersion
(`claimIds: string[]`) and `schemas/migrations-reference.sql`
`content_package_versions` (`claim_ids_json TEXT NOT NULL`). Reference artifacts
are read-only and were NOT edited.

| ContentVersion→Claim aspect | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). |
| `project_id` | explicit non-null Project ownership | NOT NULL FK → projects(id) ON DELETE CASCADE. |
| `content_package_version_id` | required ContentVersion | NOT NULL text id; same-Project composite FK `(project_id, content_package_version_id) -> content_package_versions(project_id, id)` ON DELETE CASCADE (parent target made unique by the new `content_package_versions_project_id_id_idx` supporting index in 0064/0042). |
| `claim_id` | required Claim | NOT NULL text id; same-Project composite FK `(project_id, claim_id) -> claims(project_id, id)` ON DELETE CASCADE (parent target is the accepted `claims_project_id_id_idx`, reused from T111 — not recreated). |
| `created_at` | creation timestamp only | NOT NULL text timestamp with DB default; the ONLY audit column. |
| `claim_ids[]` / `claim_ids_json` | V1.0 conceptual array / legacy JSON column | Reconciled to this normalized relation (TASK GOAL + item 3) — no JSON/text array column exists on `content_package_versions` or on this relation. |
| mutable evidence payload / verification / reverification | 09 spec; legacy Claim fields | Reconciled OUT — verification/reverification state lives on the `claims` row, never on the link. |
| gate evaluation/override, release/publishing, CRUD/UI | TASK item 3 | Reconciled OUT — not shipped. |
| business uniqueness | TASK item 2 forbids beyond the edge identity | NOT shipped — the only unique index on the table is `(content_package_version_id, claim_id)`; `content_package_versions_project_id_id_idx` is a referential-support target (id is already the PK, so the composite accepts exactly the PK's rows). |

## RELATION / FK / IDENTITY / DELETE DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project integrity: the Project-leading composite FKs
  `(project_id, content_package_version_id) -> content_package_versions(project_id, id)`
  and `(project_id, claim_id) -> claims(project_id, id)`, both ON DELETE CASCADE
  (the accepted T111/T115/T117/T118 same-Project pattern). A link whose version
  or claim belongs to a different Project has no matching parent row in EITHER
  direction and is rejected by the DB; dangling version/claim/Project rows are
  likewise rejected.
- Necessary referential parent key only: the single added unique index
  `content_package_versions_project_id_id_idx` on the accepted T118
  `content_package_versions` table exists solely as the composite-FK target. It
  is NOT a business uniqueness rule on versions (the `id` PK remains the
  identity; the composite accepts exactly the rows the PK accepts). The Claim
  parent target is the accepted `claims_project_id_id_idx`, so `claims` gains no
  new index in this slice.
- Edge identity: unique index `(content_package_version_id, claim_id)` — one row
  per ContentVersion/Claim edge. Both columns are globally unique PKs, so once
  the same-Project FKs hold the pair is project-isolated without listing
  `project_id` (the accepted search_topic_keyword_refs / claim_source_refs
  mapping pattern). The reverse `claim_id` index serves claim → versions reads.
- Delete behavior: ON DELETE CASCADE on the Project FK and on BOTH composite
  parent FKs — deleting a content package version, a claim, or a whole Project
  cascades its links away, so an edge can never dangle.
- Immutability: the relation row carries `created_at` only; no `updated_at` and
  no mutable payload. The immutable reference shape replaces the conceptual
  `claim_ids[]` array (TASK GOAL).

## MIGRATION IDS

- D1/SQLite: `drizzle/0064_needy_lady_vermin.sql` (+
  `drizzle/meta/0064_snapshot.json`, `drizzle/meta/_journal.json` idx 64).
  Drizzle generated the SQLite file with the child table + its edge-identity
  unique index + the claim reverse index + the parent
  `content_package_versions_project_id_id_idx` unique index in an order that is
  valid for SQLite (FK parent-key uniqueness is enforced at DML time), so it was
  left as generated; the local D1 migration applied 0064 successfully.
- PostgreSQL: `drizzle-pg/0042_careless_rumiko_fujikawa.sql` (+
  `drizzle-pg/meta/0042_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 42).
  Drizzle generated this file with the `content_package_version_claims ->
  content_package_versions` FK ALTER BEFORE the supporting parent unique index,
  which Postgres rejects at FK-ADD time. I rewrote the file so
  `content_package_versions_project_id_id_idx` is created BEFORE the composite-FK
  ALTER (the accepted T111/T115/T117/T118 fix pattern recorded in
  `drizzle-pg/0035`, `0039`, `0040` and `0041`), keeping all other generated
  statements unchanged. The Claim parent FK needs no reordering because the
  accepted `claims_project_id_id_idx` already exists from PG 0035.

Accepted migrations (SQLite ≤ 0063, PG ≤ 0041) were NOT edited. Clean final
dual-dialect `db:generate` re-run reports `No schema changes, nothing to migrate
😴` on both dialects (55 tables each).

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — updated the header `max-lines` eslint-disable
  comment to include T119 content_package_version_claims; updated the
  contentPackageVersions ownership/no-other-index comment to record the new
  `content_package_versions_project_id_id_idx` supporting target (added for the
  T119 relation composite FK) and added that unique index to the content package
  version table callback; appended the `contentPackageVersionClaims` sqliteTable
  at end of file with a full field-reconciliation/same-Project/edge-identity
  comment block.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror (same
  supporting unique index + same `contentPackageVersionClaims` pgTable with
  `isoNow` default); header and content version comments updated the same way.
- `src/db/schema.ts` — destructured barrel export adds
  `contentPackageVersionClaims` after `contentPackageVersions`.
- `drizzle/meta/_journal.json` and `drizzle-pg/meta/_journal.json` —
  `db:generate` journal entries (idx 64 / idx 42).

Added (untracked):

- `drizzle/0064_needy_lady_vermin.sql` and `drizzle/meta/0064_snapshot.json`.
- `drizzle-pg/0042_careless_rumiko_fujikawa.sql` and
  `drizzle-pg/meta/0042_snapshot.json`.
- `src/db/content-package-version-claim.test.ts` — the migration-backed storage
  spec (12 tests).

Task-channel file for this round: `DELIVERY.md` (this document).

## DATABASE/MIGRATION CHANGES

- New `content_package_version_claims` table on both dialects (5 columns / 2
  indexes / 3 fks each): D1 0064 and PG 0042.
- One supporting unique index added to the accepted T118
  `content_package_versions` table on both dialects (referential target of the
  new same-Project composite ContentVersion FK):
  `content_package_versions_project_id_id_idx`. `content_package_versions` is now
  11 columns / 2 indexes / 2 fks on each dialect.
- Snapshots (`0064_snapshot.json` / `0042_snapshot.json`) and journals (idx 64 /
  idx 42) written by `db:generate`. 55 tables on each dialect.

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install
used the existing lockfile).

## TESTS ADDED

- `src/db/content-package-version-claim.test.ts` — 12 migration-backed storage
  tests that build a real in-memory SQLite client, enable
  `PRAGMA foreign_keys = ON`, hand-create the `projects` table, and apply the
  actual shipped forward-migration DDL in order (`0045` market profiles, `0046`
  topics, `0049` prompts, `0055` opportunities, `0056` source_refs, `0057`
  claims + the accepted `claims_project_id_id_idx`, `0062` content_packages,
  `0063` content_package_versions, then `0064` content_package_version_claims +
  the `content_package_versions_project_id_id_idx` supporting target, split on
  `--> statement-breakpoint`). The DDL is the source of truth, so the Project
  FK, the two same-Project composite FKs, the delete cascades, the edge identity
  and the NOT NULL rules are exercised — not an application convention. Tests
  cover: valid same-Project persistence with the full TASK field set +
  `created_at` default; cross-Project Claim rejection; cross-Project
  ContentPackageVersion rejection (both directions); dangling-version,
  dangling-claim and dangling-Project FK rejection; duplicate
  `(content_package_version_id, claim_id)` rejection; NOT NULL rejection of each
  direct column (`id`, `project_id`, `content_package_version_id`, `claim_id`);
  content-package-version-delete cascade; claim-delete cascade; whole-Project
  delete cascade (links + versions + claims + packages + topics); and the exact
  normalized relation column-shape assertion (the 5 link columns only — no
  `updated_at`, no mutable evidence/verification payload, no JSON id-array
  column).
- Dialect parity: the new table is auto-picked-up by the existing
  `src/db/schema-parity.test.ts` (now 284 tests: +5 per-table assertions for the
  new table — columns/PK/unique/FKs/indexes/checks), which structurally compares
  every SQLite and PG table. It also confirms both dialects now report the same
  structural change to `content_package_versions` (the added unique supporting
  index) and that no index was added to `claims`.

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no chained shell
operations).

1. `node --version` → v24.16.0.
2. `corepack pnpm --version` → 10.30.1.
3. `corepack pnpm install --frozen-lockfile` → exit 0 (lockfile up to date,
   resolution skipped; 980 packages linked; ignored-build-scripts warning only).
4. Task-file Prettier `--write` (the 3 changed schema/barrel files) → exit 0
   (`search-growth.schema.ts` and `schema.ts` rewritten/checked; the PG mirror
   already formatted).
5. `corepack pnpm run db:generate` (dual-dialect, first run) → exit 0 —
   produced `drizzle/0064_needy_lady_vermin.sql` and
   `drizzle-pg/0042_careless_rumiko_fujikawa.sql` with snapshots + journal
   entries (55 tables on both dialects; `content_package_version_claims` = 5
   columns / 2 indexes / 3 fks on both; `content_package_versions` now 11
   columns / 2 indexes / 2 fks on both).
6. `corepack pnpm run db:migrate:local` (apply local D1 state) → exit 0 —
   0000 → 0064 all ✅ (`0064_needy_lady_vermin.sql` ✅).
7. `corepack pnpm run db:migrate:local` (idempotency re-run) → exit 0 —
   `✅ No migrations to apply!`.
8. Task-file Prettier `--write` (the new storage test) → exit 0 (already
   formatted).
9. Focused Vitest (`corepack pnpm exec vitest run` with the 5 task-related
   files) → exit 0 — 5 files / 339 tests passed (12 content-package-version-claim
   + 14 content-package-version + 14 content-package + 15 claims + 284 parity).
10. `corepack pnpm run db:generate` (dual-dialect, clean final run) → exit 0 —
    both dialects: 55 tables, `No schema changes, nothing to migrate 😴`.
11. Full Vitest (`corepack pnpm exec vitest run`, default parallelism) → exit 0
    — **172 files / 1543 tests passed** (completed 98.46s).
12. `corepack pnpm run format:check` → **sandbox auto-denied; no exit code**
    (recorded exactly once; per TASK item 5 the remaining same-class whole-repo
    gates `types:check`, `lint`, `build`, `ci:check` were not separately
    re-attempted/bypassed — the denial message states any approval-requiring
    command is denied for the rest of the session).
13. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`) → exit 0 — `git diff --check` clean.

A second file-scoped `prettier --check` invocation (multiple file arguments) was
also auto-denied by the sandbox and abandoned without retry; the same files were
already `--write`-formatted with exit 0 earlier, so the tree is formatted.

## COMMAND RESULTS

Passing on the final tree: frozen install exit 0; dual-dialect `db:generate`
first run exit 0 (55 tables each) and clean final run exit 0 (`No schema
changes, nothing to migrate 😴` on both dialects); local D1 migration exit 0
(0000 → 0064 applied ✅, then idempotent `✅ No migrations to apply!`); task-file
Prettier `--write` exit 0; focused Vitest **5 files / 339 tests** exit 0; full
Vitest **172 files / 1543 tests** exit 0 at default parallelism on the final
clean run (completed 98.46s); read-only Git inspection clean (`git diff --check`
clean).

Environment limitation (reported, not hidden): the sandbox auto-approval grant
list for this executor session does not include `format:check`, `types:check`,
`lint`, `build`, `ci:check`. `format:check` was attempted as a standalone
invocation and auto-denied with no approval surface ("This Bash command contains
multiple operations … requires approval"); the denial message states that any
other approval-requiring command will be denied the same way for the rest of the
session, so **no exit code exists for any of the five gates in this session**. Per
TASK item 5 the exact denial was recorded once and no retry/bypass was attempted.
This is the same environment block recorded for T111–T115, T117 and T118.

## RUNTIME EVIDENCE

- Full-suite Vitest final clean run: `Test Files 172 passed (172)`, `Tests 1543
  passed (1543)`, exit 0 at default parallelism. The new storage spec's 12 tests
  and the extended parity suite (284) pass inside it. (1543 = prior accepted
  count 1526 + 12 content-package-version-claim storage tests + 5 parity
  assertions for the new table.)
- Focused Vitest: 5 files / 339 tests, exit 0 (12 content-package-version-claim
  + 14 content-package-version + 14 content-package + 15 claims + 284 parity).
- `db:migrate:local`: 0064 applied successfully (✅) on the local D1 state;
  re-run reports `✅ No migrations to apply!`, exit 0 (journal complete and
  idempotent).
- `db:generate` final: D1 then PG each print 55 tables and `No schema changes,
  nothing to migrate 😴`, exit 0 — confirms both dialects' schemas exactly match
  their snapshots with no drift; `content_package_version_claims` = 5 columns /
  2 indexes / 3 fks and `content_package_versions` = 11 columns / 2 indexes /
  2 fks on both.
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
  across T111–T115, T117 and T118 and is reported as `BLOCKED_BY_TEST_ENVIRONMENT`
  — a test-environment limitation, not a scope or code deviation. The runnable
  matrix (frozen install, dual-dialect `db:generate` first + clean final run,
  local migration + re-run, focused and full Vitest, task-file Prettier,
  read-only Git) all pass, including a clean full-suite exit 0. A grant-enabled
  session, the controller/QA under the Product Owner's bounded
  acceptance-verification exception, or a human gate must produce the five exit
  codes before final acceptance.
- Type/lint surface for the new module could not be checked by `tsc`/`oxlint`
  this round (sandbox-denied); it is the same idiom as the accepted
  claim_source_refs / claim_allowed_market_profiles / content-package-version
  same-Project modules, and the focused + full Vitest suites import and execute
  the new module and both schema mirrors at runtime (parity compares every
  column/index/FK/check between dialects).
- Scope-shape notes (by design, not defects): the relation is schema/contract
  only — no Claim gate evaluation/override, claim verification/reverification,
  mutable evidence payload, JSON id-array column, release/publishing behavior or
  CRUD/UI; the only business uniqueness is the edge identity
  `(content_package_version_id, claim_id)` plus the referential-support
  `content_package_versions_project_id_id_idx` target (see FIELD RECONCILIATION).

## DEVIATIONS FROM TASK

None in scope, field set, ownership rule, delete behavior, index set or
migration IDs. The relation ships D1 `0064` and PostgreSQL `0042` as required
with forward snapshots + journals; same-Project ownership is enforced by the two
Project-leading composite FKs `(project_id, content_package_version_id) ->
content_package_versions(project_id, id)` and `(project_id, claim_id) ->
claims(project_id, id)`; the single necessary new referential parent key
`content_package_versions_project_id_id_idx` is added to the accepted T118
content_package_versions table; the Claim parent target `claims_project_id_id_idx`
is reused from the accepted T111 migrations; the composite FKs, the Project FK,
and the whole-Project delete all cascade; and the only business uniqueness is the
edge identity `(content_package_version_id, claim_id)` with no JSON id array,
mutable evidence payload, verification/reverification, gate, release/publishing,
or CRUD/UI surface. The one generated-file adjustment is an implementation
detail required for PostgreSQL correctness: `drizzle-pg/0042` was reordered so
the parent unique index is created before the composite-FK ALTER (the accepted
T111/T115/T117/T118 fix pattern in `drizzle-pg/0035`, `0039`, `0040` and `0041`);
the SQLite 0064 ordering was left as generated (valid for SQLite, and the local
D1 migration applied it successfully). The only non-`0` outcome is
environmental: the five full-repo gates could not be granted by the sandbox in
this round (see KNOWN LIMITATIONS) — reported as an environment limitation, not
a scope deviation.

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
- No Claim gate evaluation/override, verification/reverification, evidence
  payload, release/approval or publishing behavior was added (out of scope); the
  slice adds persistence/contract surface only. The relation row is immutable
  (`created_at` only), the `claims` row keeps its verification state, and no
  content leaves the project in this slice.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T119-M1-CONTENT-VERSION-CLAIM-REF-SCHEMA`; working tree is NOT
  committed (rounds stop at delivery). Recent commit on the branch: `7704105
  control: dispatch T119 content version claim refs`.
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json` (db:generate journal entries);
  `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
  `src/db/schema.ts`.
- Added (untracked) files (5): `drizzle/0064_needy_lady_vermin.sql`,
  `drizzle/meta/0064_snapshot.json`, `drizzle-pg/0042_careless_rumiko_fujikawa.sql`,
  `drizzle-pg/meta/0042_snapshot.json`, `src/db/content-package-version-claim.test.ts`.
- Task-channel file: `control/tasks/T119-M1-CONTENT-VERSION-CLAIM-REF-SCHEMA/DELIVERY.md`
  (this document). `REVIEW.md` did not exist at round start and was not created.
- `git diff --stat` (tracked): 5 files, +230/−5. `git diff --check` clean.
- No other files are dirty or untracked.

## READY FOR REVIEW

Implementation round 1 is complete and in-scope: the normalized, Project-scoped
`content_package_version_claims` relation ships on both dialects with forward
migrations 0064/0042, snapshots, journals, database-enforced same-Project
ownership via the Project-leading composite FKs to `content_package_versions`
and `claims`, ON DELETE CASCADE on the Project/ContentVersion/Claim FKs, the
edge-identity unique index `(content_package_version_id, claim_id)`, the single
necessary referential unique target `content_package_versions_project_id_id_idx`
added to the accepted T118 content_package_versions table (the accepted Claim
target `claims_project_id_id_idx` is reused, so `claims` gains no index), an
append-only `created_at` only (immutable reference shape — no `updated_at`, no
JSON id array, no mutable evidence/verification payload, no gate/release/
publishing/CRUD surface), and no other business uniqueness or JSON mapping
surface. Runnable approved gates pass on the final tree: frozen install exit 0,
dual-dialect `db:generate` first + clean final run exit 0 (`No schema changes,
nothing to migrate` on both dialects), local D1 migration exit 0 (0000 → 0064
applied, idempotent on re-run), task-file Prettier `--write` exit 0, focused
Vitest 5 files / 339 tests exit 0, full Vitest 172 files / 1543 tests exit 0
(default parallelism, final clean run), and read-only Git clean. The five
full-repo gates (`format:check`, `types:check`, `lint`, `build`, `ci:check`)
could not be executed because the sandbox auto-denies them with no approval
surface (no exit codes), so status is reported as `BLOCKED_BY_TEST_ENVIRONMENT`.
No `PASS` verdict is written by the implementation round.
