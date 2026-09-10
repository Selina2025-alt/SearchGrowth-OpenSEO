# DELIVERY — T120-M1-CONTENT-VERSION-SOURCE-REF-SCHEMA (round 1)

## STATUS

`BLOCKED_BY_TEST_ENVIRONMENT` — the implementation is complete and in-scope;
every approved gate the executor sandbox permits runs and exits 0 (frozen
install, dual-dialect `db:generate` first + clean final run, local D1 migration +
idempotency re-run, task-file Prettier `--write`, focused Vitest, full Vitest,
read-only Git). The whole-repo aggregate gate `format:check` is auto-denied by
this session's sandbox with no approval surface — it was attempted exactly once
and denied ("This command requires approval"); its denial message states any
further approval-requiring command is denied the same way for the rest of the
session, so per TASK item 5 ("record its exact denial once and stop without retry
or bypass") the same-class gates `types:check`, `lint`, `build` and `ci:check`
were NOT separately re-attempted, and no exit code exists for any of the five.
This is the same environment block recorded across T111–T115, T117, T118 and
T119 and is reported honestly as an environment limitation, not as passing and
not as a scope/code deviation.

## TASK ID

`T120-M1-CONTENT-VERSION-SOURCE-REF-SCHEMA` — implementation round 1. No
`REVIEW.md` existed at round start (verified before implementation); none was
created.

## IMPLEMENTATION SUMMARY

Added the normalized, Project-scoped `content_package_versions` → `source_refs`
reference contract across both dialects (D1/SQLite + PostgreSQL). This replaces
the V1.0 conceptual `source_refs[]` array on a content version with explicit
relational rows (05_DOMAIN_DATA_MODEL.md §10 ContentVersion `source_refs[]`;
09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §§2–4 source refs and §10 source
traceability). This slice is schema/contract ONLY: it does not assess, verify,
revalidate or act on a source, and adds no gate/release/publishing behavior
(TASK GOAL and item 3).

Storage contract shipped:

- `content_package_version_source_refs` (both dialects): stable text `id` (PK),
  explicit NOT NULL `project_id` (FK → `projects(id)` ON DELETE CASCADE),
  required `content_package_version_id`, required `source_ref_id`, and the
  append-only `created_at` timestamp only (TASK item 1).
- Same-Project ContentVersion ownership is database-enforced by the
  Project-leading composite FK
  `(project_id, content_package_version_id) -> content_package_versions(project_id, id)`
  ON DELETE CASCADE.
- Same-Project SourceRef ownership is database-enforced by the Project-leading
  composite FK `(project_id, source_ref_id) -> source_refs(project_id, id)`
  ON DELETE CASCADE.
- Both composite-FK target unique indexes already exist on the accepted parents
  and are REUSED: `content_package_versions_project_id_id_idx` (added by the
  accepted T119 migrations, D1 0064 / PG 0042) and
  `source_refs_project_id_id_idx` (added by the accepted T110/T111 migrations,
  D1 0057 / PG 0035). Per TASK item 2 this slice therefore adds NO index to
  either parent.
- Edge identity `(content_package_version_id, source_ref_id)` is the ONLY
  business uniqueness (unique index
  `content_package_version_source_refs_unique_content_package_version_source_ref_idx`);
  the source-ref → versions read path is served by the reverse non-unique index
  `content_package_version_source_refs_source_ref_idx`. No other business
  uniqueness or lookup index exists on the table (TASK item 2).
- Immutable reference shape preserved: no `updated_at`, no JSON id array, no
  mutable evidence payload, no source validation/revalidation state, no Claim
  gate behavior, no release/publishing behavior, and no CRUD/UI (TASK items 1
  and 3). Source capture/verification state stays on the linked `source_refs`
  row; an evidence read follows this link without copying verification state.

## FIELD RECONCILIATION

Sources: the TASK field list (authoritative), `05_DOMAIN_DATA_MODEL.md` §§9–10
(SourceRef and ContentVersion — the conceptual `source_refs[]`),
`09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§2–4 and §10,
`21_TEST_ACCEPTANCE_PLAN.md` §10, `29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md`,
the accepted T110/T111/T117/T118/T119 same-Project relation patterns, and the
legacy reference artifacts `schemas/domain-types.ts` ContentPackageVersion
(`sourceRefIds: string[]`) and `schemas/migrations-reference.sql`
`content_package_versions` (`source_ref_ids_json`). Reference artifacts are
read-only and were NOT edited.

| ContentVersion→SourceRef aspect | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). |
| `project_id` | explicit non-null Project ownership | NOT NULL FK → projects(id) ON DELETE CASCADE. |
| `content_package_version_id` | required ContentVersion | NOT NULL text id; same-Project composite FK `(project_id, content_package_version_id) -> content_package_versions(project_id, id)` ON DELETE CASCADE (parent target is the accepted `content_package_versions_project_id_id_idx` from T118/T119 — reused, not recreated). |
| `source_ref_id` | required SourceRef | NOT NULL text id; same-Project composite FK `(project_id, source_ref_id) -> source_refs(project_id, id)` ON DELETE CASCADE (parent target is the accepted `source_refs_project_id_id_idx` from T110/T111 — reused, not recreated). |
| `created_at` | creation timestamp only | NOT NULL text timestamp with DB default; the ONLY audit column. |
| `source_refs[]` / `source_ref_ids_json` | V1.0 conceptual array / legacy JSON column | Reconciled to this normalized relation (TASK GOAL + item 3) — no JSON/text array column exists on `content_package_versions` or on this relation. |
| mutable evidence payload / source validation/revalidation | 09 spec; legacy SourceRef fields | Reconciled OUT — capture/verification state lives on the `source_refs` row, never on the link. |
| Claim gate behavior, release/publishing, CRUD/UI | TASK item 3 | Reconciled OUT — not shipped. |
| business uniqueness | TASK item 2 forbids beyond the edge identity | NOT shipped — the only unique index on the table is `(content_package_version_id, source_ref_id)`; both parent targets already existed and were reused, so no parent index is added. |

## RELATION / FK / IDENTITY / DELETE DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project integrity: the Project-leading composite FKs
  `(project_id, content_package_version_id) -> content_package_versions(project_id, id)`
  and `(project_id, source_ref_id) -> source_refs(project_id, id)`, both
  ON DELETE CASCADE (the accepted T110/T111/T119 same-Project pattern). A link
  whose version or source reference belongs to a different Project has no
  matching parent row in EITHER direction and is rejected by the DB; dangling
  version/source-ref/Project rows are likewise rejected.
- Reused parent targets only: no index is added to `content_package_versions`
  (its accepted `content_package_versions_project_id_id_idx` from T119 is reused)
  or to `source_refs` (its accepted `source_refs_project_id_id_idx` from T110/
  T111 is reused). This is the difference from T119, which had to add the
  ContentVersion target because it did not yet exist; TASK item 2 requires reuse
  here and that is what shipped.
- Edge identity: unique index `(content_package_version_id, source_ref_id)` —
  one row per ContentVersion/SourceRef edge. Both columns are globally unique
  PKs, so once the same-Project FKs hold the pair is project-isolated without
  listing `project_id` (the accepted search_topic_keyword_refs /
  claim_source_refs / content_package_version_claims mapping pattern). The
  reverse `source_ref_id` index serves source-ref → versions reads.
- Delete behavior: ON DELETE CASCADE on the Project FK and on BOTH composite
  parent FKs — deleting a content package version, a source reference, or a whole
  Project cascades its links away, so an edge can never dangle.
- Immutability: the relation row carries `created_at` only; no `updated_at` and
  no mutable payload. The immutable reference shape replaces the conceptual
  `source_refs[]` array (TASK GOAL).

## MIGRATION IDS

- D1/SQLite: `drizzle/0065_sloppy_iron_man.sql` (+
  `drizzle/meta/0065_snapshot.json`, `drizzle/meta/_journal.json` idx 65).
  Drizzle generated the child table + its edge-identity unique index + the
  source-ref reverse index; no parent index statement is present because both
  composite targets already exist from 0057 and 0064. The order is valid for
  SQLite (FK parent-key uniqueness is enforced at DML time) and the local D1
  migration applied 0065 successfully, so the SQLite file was left as generated.
- PostgreSQL: `drizzle-pg/0043_special_speedball.sql` (+
  `drizzle-pg/meta/0043_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 43).
  The generated file adds the child table, the three FK constraints, and the two
  indexes. No FK-before-parent-index reorder was required: both referenced unique
  indexes (`content_package_versions_project_id_id_idx` from PG 0042 and
  `source_refs_project_id_id_idx` from PG 0035) already exist in earlier
  accepted migrations, so the file is exactly as generated (no manual edit).

Accepted migrations (SQLite ≤ 0064, PG ≤ 0042) were NOT edited. Clean final
dual-dialect `db:generate` re-run reports `No schema changes, nothing to
migrate 😴` on both dialects (56 tables each).

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — updated the header `max-lines` eslint-disable
  comment to include T120 content_package_version_source_refs; appended the
  `contentPackageVersionSourceRefs` sqliteTable at end of file with a full
  field-reconciliation/same-Project/edge-identity comment block.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror (same
  columns/constraints/indexes with the `isoNow` `created_at` default); header
  comment updated the same way.
- `src/db/schema.ts` — destructured barrel export adds
  `contentPackageVersionSourceRefs` after `contentPackageVersionClaims`.
- `drizzle/meta/_journal.json` and `drizzle-pg/meta/_journal.json` —
  `db:generate` journal entries (idx 65 / idx 43).

Added (untracked):

- `drizzle/0065_sloppy_iron_man.sql` and `drizzle/meta/0065_snapshot.json`.
- `drizzle-pg/0043_special_speedball.sql` and `drizzle-pg/meta/0043_snapshot.json`.
- `src/db/content-package-version-source-ref.test.ts` — the migration-backed
  storage spec (12 tests).

Task-channel file for this round: `DELIVERY.md` (this document).

## DATABASE/MIGRATION CHANGES

- New `content_package_version_source_refs` table on both dialects (5 columns /
  2 indexes / 3 fks each): D1 0065 and PG 0043.
- NO index is added to `content_package_versions` or `source_refs` — both
  same-Project composite-FK targets already exist and are reused (TASK item 2).
  `content_package_versions` stays 11 columns / 2 indexes / 2 fks and
  `source_refs` stays 6 columns / 2 indexes / 1 fk on each dialect.
- Snapshots (`0065_snapshot.json` / `0043_snapshot.json`) and journals (idx 65 /
  idx 43) written by `db:generate`. 56 tables on each dialect (55 accepted + 1).

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install
used the existing lockfile).

## TESTS ADDED

- `src/db/content-package-version-source-ref.test.ts` — 12 migration-backed
  storage tests that build a real in-memory SQLite client, enable
  `PRAGMA foreign_keys = ON`, hand-create the `projects` table, and apply the
  actual shipped forward-migration DDL in order (`0045` market profiles, `0046`
  topics, `0049` prompts, `0055` opportunities, `0056` source_refs, `0057`
  source_refs composite target + claims, `0062` content_packages, `0063`
  content_package_versions, `0064` content_package_versions composite target +
  content_package_version_claims, then `0065` the new
  content_package_version_source_refs, split on `--> statement-breakpoint`). The
  DDL is the source of truth, so the Project FK, the two same-Project composite
  FKs, the delete cascades, the edge identity and the NOT NULL rules are
  exercised — not an application convention. Tests cover: valid same-Project
  persistence with the full TASK field set + `created_at` default; cross-Project
  SourceRef rejection; cross-Project ContentPackageVersion rejection (both
  directions); dangling-version, dangling-source-ref and dangling-Project FK
  rejection; duplicate `(content_package_version_id, source_ref_id)` rejection;
  NOT NULL rejection of each direct column (`id`, `project_id`,
  `content_package_version_id`, `source_ref_id`); content-package-version-delete
  cascade; source-ref-delete cascade; whole-Project delete cascade (links +
  versions + source refs + packages + topics); and the exact normalized relation
  column-shape assertion (the 5 link columns only — no `updated_at`, no mutable
  evidence/verification payload, no JSON id-array column).
- Dialect parity: the new table is auto-picked-up by the existing
  `src/db/schema-parity.test.ts` (now 289 tests: +5 per-table assertions for the
  new table — columns/PK/unique/FKs/checks), which structurally compares every
  SQLite and PG table. It also confirms both dialects report the same structural
  change and that no index was added to either parent.

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no commit/merge/push).

1. `node --version` → v24.16.0.
2. `corepack pnpm --version` → 10.30.1.
3. `corepack pnpm install --frozen-lockfile` → exit 0 (lockfile up to date,
   resolution skipped; 980 packages linked; ignored-build-scripts warning only).
4. `corepack pnpm run db:generate` (dual-dialect, first run) → exit 0 — produced
   `drizzle/0065_sloppy_iron_man.sql` and `drizzle-pg/0043_special_speedball.sql`
   with snapshots + journal entries (56 tables on both dialects;
   `content_package_version_source_refs` = 5 columns / 2 indexes / 3 fks on both;
   no parent index added).
5. `corepack pnpm run db:migrate:local` (apply local D1 state) → exit 0 —
   0000 → 0065 all ✅ (`0065_sloppy_iron_man.sql` ✅).
6. Task-file Prettier `--write` (each of the 4 changed/new files, one at a time)
   → exit 0 (`unchanged` on all four; already formatted).
7. Focused Vitest (`corepack pnpm exec vitest run` with the 5 task-related
   files) → exit 0 — 5 files / 334 tests passed (12
   content-package-version-source-ref + 12 content-package-version-claim + 14
   content-package-version + 7 source-ref + 289 parity).
8. `corepack pnpm run db:migrate:local` (idempotency re-run) → exit 0 —
   `✅ No migrations to apply!`.
9. `corepack pnpm run db:generate` (dual-dialect, clean final run) → exit 0 —
   both dialects: 56 tables, `No schema changes, nothing to migrate 😴`.
10. Full Vitest (`corepack pnpm exec vitest run`, default parallelism) → exit 0
    — **173 files / 1560 tests passed** (completed 134.48s).
11. `corepack pnpm run format:check` → **sandbox auto-denied; no exit code.**
    Exact denial: "Permission for this tool use was denied. It requires approval,
    and this session has no approval surface — nobody can answer a permission
    prompt here — so it was denied automatically. … What required approval: This
    command requires approval." Recorded once; per TASK item 5 the same-class
    whole-repo gates `types:check`, `lint`, `build`, `ci:check` were not
    separately re-attempted/bypassed — the denial states any approval-requiring
    command is denied the same way for the rest of the session.
12. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`) → exit 0 — `git diff --check` clean.

## COMMAND RESULTS

Passing on the final tree: frozen install exit 0; dual-dialect `db:generate`
first run exit 0 (56 tables each) and clean final run exit 0 (`No schema
changes, nothing to migrate 😴` on both dialects); local D1 migration exit 0
(0000 → 0065 applied ✅, then idempotent `✅ No migrations to apply!`); task-file
Prettier `--write` exit 0; focused Vitest **5 files / 334 tests** exit 0; full
Vitest **173 files / 1560 tests** exit 0 at default parallelism on the final
clean run (completed 134.48s); read-only Git inspection clean (`git diff --check`
clean).

Environment limitation (reported, not hidden): the sandbox auto-approval grant
list for this executor session does not include `format:check` (nor, by the
denial's own statement, any other approval-requiring command). `format:check`
was attempted as a standalone bare invocation and auto-denied; per TASK item 5
the exact denial was recorded once and no retry/bypass was attempted, and the
same-class whole-repo gates `types:check`, `lint`, `build`, `ci:check` were not
separately re-attempted. **No exit code exists for any of the five gates in this
session.** This is the same environment block recorded for T111–T115, T117, T118
and T119.

## RUNTIME EVIDENCE

- Full-suite Vitest final clean run: `Test Files 173 passed (173)`, `Tests 1560
  passed (1560)`, exit 0 at default parallelism. The new storage spec's 12 tests
  and the extended parity suite (289) pass inside it. (1560 = prior accepted
  count 1543 + 12 content-package-version-source-ref storage tests + 5 parity
  assertions for the new table.)
- Focused Vitest: 5 files / 334 tests, exit 0 (12
  content-package-version-source-ref + 12 content-package-version-claim + 14
  content-package-version + 7 source-ref + 289 parity).
- `db:migrate:local`: 0065 applied successfully (✅) on the local D1 state;
  re-run reports `✅ No migrations to apply!`, exit 0 (journal complete and
  idempotent).
- `db:generate` final: D1 then PG each print 56 tables and `No schema changes,
  nothing to migrate 😴`, exit 0 — confirms both dialects' schemas exactly match
  their snapshots with no drift; `content_package_version_source_refs` = 5
  columns / 2 indexes / 3 fks on both, and the two reused parent tables are
  unchanged.
- Read-only Git inspection: `git diff --check` clean; file set below is exactly
  the intended change set.
- Five full-repo gates: no exit codes (sandbox auto-denied) — see COMMAND
  RESULTS / KNOWN LIMITATIONS.

## KNOWN LIMITATIONS

- The `format:check` / `types:check` / `lint` / `build` / `ci:check` gates remain
  non-executable in this executor session: the sandbox auto-denies the aggregate
  whole-repo command class with no approval surface, so no exit code exists for
  any of the five (TASK item 5's "every gate must exit 0" therefore cannot be
  fully evidenced here). This is the same environment block recorded across
  T111–T115, T117, T118 and T119 and is reported as `BLOCKED_BY_TEST_ENVIRONMENT`
  — a test-environment limitation, not a scope or code deviation. The runnable
  matrix (frozen install, dual-dialect `db:generate` first + clean final run,
  local migration + re-run, focused and full Vitest, task-file Prettier,
  read-only Git) all pass, including a clean full-suite exit 0. A grant-enabled
  session, the controller/QA under the Product Owner's bounded
  acceptance-verification exception, or a human gate must produce the five exit
  codes before final acceptance.
- Type/lint surface for the new module could not be checked by `tsc`/`oxlint`
  this round (sandbox-denied); it is the same idiom as the accepted
  claim_source_refs / content_package_version_claims same-Project modules, and
  the focused + full Vitest suites import and execute the new module and both
  schema mirrors at runtime (parity compares every column/index/FK/check between
  dialects).
- Scope-shape notes (by design, not defects): the relation is schema/contract
  only — no source assessment/verification/revalidation, mutable evidence
  payload, Claim gate behavior, JSON id-array column, release/publishing
  behavior or CRUD/UI; the only business uniqueness is the edge identity
  `(content_package_version_id, source_ref_id)` and no parent index is added
  (both composite targets are reused per TASK item 2).

## DEVIATIONS FROM TASK

None in scope, field set, ownership rule, delete behavior, index set or
migration IDs. The relation ships D1 `0065` and PostgreSQL `0043` as required
with forward snapshots + journals; same-Project ownership is enforced by the two
Project-leading composite FKs `(project_id, content_package_version_id) ->
content_package_versions(project_id, id)` and `(project_id, source_ref_id) ->
source_refs(project_id, id)`; both parent composite target indexes are the
accepted ones (`content_package_versions_project_id_id_idx` from T118/T119,
`source_refs_project_id_id_idx` from T110/T111) and are reused with NO new parent
index (TASK item 2); the composite FKs, the Project FK, and the whole-Project
delete all cascade; and the only business uniqueness is the edge identity
`(content_package_version_id, source_ref_id)` with no JSON id array, mutable
evidence payload, source validation/revalidation, Claim gate, release/
publishing, or CRUD/UI surface. No generated-file adjustment was needed this
round: PostgreSQL 0043 is exactly as generated because both composite parent
unique indexes already exist from earlier accepted migrations. The only
non-`0` outcome is environmental: the five full-repo gates could not be granted
by the sandbox in this round (see KNOWN LIMITATIONS) — reported as an environment
limitation, not a scope deviation.

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
- No source assessment/verification/revalidation, evidence payload, Claim gate,
  release/approval or publishing behavior was added (out of scope); the slice
  adds persistence/contract surface only. The relation row is immutable
  (`created_at` only), the `source_refs` row keeps its capture/verification
  state, and no content leaves the project in this slice.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T120-M1-CONTENT-VERSION-SOURCE-REF-SCHEMA`; working tree is
  NOT committed (rounds stop at delivery). Recent commit on the branch: `bcabb1a
  control: dispatch T120 content version source refs`.
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json` (db:generate journal entries);
  `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
  `src/db/schema.ts`.
- Added (untracked) files (5): `drizzle/0065_sloppy_iron_man.sql`,
  `drizzle/meta/0065_snapshot.json`,
  `drizzle-pg/0043_special_speedball.sql`,
  `drizzle-pg/meta/0043_snapshot.json`,
  `src/db/content-package-version-source-ref.test.ts`.
- Task-channel file: `control/tasks/T120-M1-CONTENT-VERSION-SOURCE-REF-SCHEMA/DELIVERY.md`
  (this document). `REVIEW.md` did not exist at round start and was not created.
- `git diff --stat` (tracked): 5 files, +207/−2. `git diff --check` clean.
- No other files are dirty or untracked.

## READY FOR REVIEW

Implementation round 1 is complete and in-scope: the normalized, Project-scoped
`content_package_version_source_refs` relation ships on both dialects with
forward migrations 0065/0043, snapshots, journals, database-enforced same-Project
ownership via the Project-leading composite FKs to `content_package_versions`
and `source_refs`, ON DELETE CASCADE on the Project/ContentVersion/SourceRef FKs,
the edge-identity unique index `(content_package_version_id, source_ref_id)`, an
append-only `created_at` only (immutable reference shape — no `updated_at`, no
JSON id array, no mutable evidence/verification payload, no gate/release/
publishing/CRUD surface), and no other business uniqueness. Both composite-FK
target indexes are the accepted parent indexes and are reused, so neither parent
table gains an index (TASK item 2). Runnable approved gates pass on the final
tree: frozen install exit 0, dual-dialect `db:generate` first + clean final run
exit 0 (`No schema changes, nothing to migrate` on both dialects), local D1
migration exit 0 (0000 → 0065 applied, idempotent on re-run), task-file Prettier
`--write` exit 0, focused Vitest 5 files / 334 tests exit 0, full Vitest 173
files / 1560 tests exit 0 (default parallelism, final clean run), and read-only
Git clean. The five full-repo gates (`format:check`, `types:check`, `lint`,
`build`, `ci:check`) could not be executed because the sandbox auto-denies them
with no approval surface (no exit codes), so status is reported as
`BLOCKED_BY_TEST_ENVIRONMENT`. No `PASS` verdict is written by the
implementation round.
