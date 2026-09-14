# DELIVERY — T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA (round 2)

## STATUS

`READY_FOR_REVIEW` — implementation round 2 of 3. Round 2 addresses the single
Round 1 `REVIEW.md` blocker (the unconstrained `geo_citations.matched_publication_receipt_id`
relation). Every TASK item 6 gate ran to completion in this executor session and
exited 0: dual-dialect `db:generate` (generation + clean re-run), local D1
migration, focused Vitest, task-file Prettier, `format:check`, `types:check`,
`lint`, full Vitest, `build` and `ci:check`; read-only Git inspection is clean.
No `PASS` verdict is written by the implementation round.

## TASK ID

`T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA` — implementation round 2.

## REVIEW FINDINGS ADDRESSED

### BLOCKER — deferred GeoCitation receipt relation remains unconstrained → FIXED

Round 1 left `geo_citations.matched_publication_receipt_id` a bare scalar in both
dialects. The accepted GeoCitation contract says the later task that creates
`publication_receipts` adds the same-Project composite FK alongside the table;
T136 is that task. Round 2 now:

- adds the nullable, Project-leading composite FK
  `(project_id, matched_publication_receipt_id) -> publication_receipts(project_id, id)`
  to `geo_citations` in BOTH dialects, in a NEW forward migration (D1
  `0082_mighty_steve_rogers.sql` / PostgreSQL `0060_dear_red_wolf.sql`), leaving
  accepted historical migrations untouched;
- adds the ONE required referential parent target
  `publication_receipts_project_id_id_idx` UNIQUE `(project_id, id)` on the
  accepted T136 table (id is already the PK, so it adds no business uniqueness);
- chooses and documents the delete behavior: `NO ACTION` (restrictive on both
  dialects), which preserves citation history. `SET NULL` is impossible — it
  would null the composite FK's `NOT NULL` `project_id` lead column — and
  `CASCADE` would delete citation evidence when a receipt is removed. This
  matches the accepted `search_topics` merge-target / `tracked_entities`
  owning-entity no-action reference pattern;
- updates both schema mirrors, the header/field comments, both snapshots and
  both journals;
- adds migration-backed tests for same-Project allowance, NULL allowance,
  cross-Project rejection, dangling rejection, chosen delete behavior and
  whole-Project teardown.

No citation matching, URL normalization, attribution runtime, verification
runtime, external behavior, connector/credential behavior or UI was added — the
migration is a referential-integrity constraint only.

## IMPLEMENTATION SUMMARY

Adds the credential-free, Project-scoped `PublicationReceipt` evidence
persistence contract across both dialects (D1/SQLite + PostgreSQL), plus its
matching Zod/domain boundary, migration-backed/domain tests, and (round 2) the
same-Project `geo_citations` matched-receipt relation the accepted GeoCitation
contract defers to this task. ONE PublicationReceipt is the persisted,
Project-scoped EVIDENCE RECORD a publishing job's attempt produced, as recorded
by a later orchestration/verification workflow (05_DOMAIN_DATA_MODEL.md §12
PublicationReceipt; 10_DISTRIBUTION_ARCHITECTURE.md §§1/8 "Public Success";
13_PUBLISH_FINALIZER_SPEC.md; 17_SECURITY_GOVERNANCE.md "publication receipts:
长期"; 21_TEST_ACCEPTANCE_PLAN.md public-success/receipt portions;
`schemas/domain-types.ts` PublicationReceipt;
`schemas/migrations-reference.sql` `publication_receipts`). This slice is
schema/contract only: a row is an evidence snapshot, never a
submit/finalize/publish action, a state transition/CAS, a route execution, a
public-URL reachability check, verifier logic, an automatic success decision or a
receipt-to-citation attribution (TASK GOAL / items 3–4).

Storage contract shipped (`publication_receipts`, both dialects, 19 columns / 2
unique indexes / 3 fks / 3 checks), plus the `geo_citations` third FK added by
round 2:

- stable text `id` (PK), explicit NOT NULL `project_id` (FK → `projects(id)` ON
  DELETE CASCADE), required `publishing_job_id`, required `release_target_id`,
  required opaque `platform` / `executor_id` / `executor_version`, nullable
  opaque `external_draft_id` / `external_task_id` / `external_content_id`,
  nullable `public_url`, required `content_hash`, required `media_hashes_json`
  document, required source-defined `status`, nullable `submitted_at` /
  `published_at` / `verified_at` evidence timestamps, required
  `verification_json` document, and an append-only `created_at` (no
  `updated_at`).
- Explicit Project ownership by `project_id` NOT NULL FK → `projects(id)` ON
  DELETE CASCADE.
- Same-Project ReleaseTarget integrity by the Project-leading composite FK
  `(project_id, release_target_id) -> release_targets(project_id, id)` ON DELETE
  CASCADE, reusing the accepted parent target `release_targets_project_id_id_idx`
  (T125, D1 0070 / PG 0048).
- Same-Project AND same-ReleaseTarget job integrity by the Project-leading,
  target-matched composite FK
  `(project_id, release_target_id, publishing_job_id) ->
  publishing_jobs(project_id, release_target_id, id)` ON DELETE CASCADE. Its
  parent target `publishing_jobs_project_id_release_target_id_id_idx` was added
  by the round-1 forward migration (D1 0081 / PG 0059).
- Source-defined one-receipt-per-job identity by the UNIQUE index
  `publication_receipts_publishing_job_id_idx` on `(publishing_job_id)`.
- Round 2: the referential parent target
  `publication_receipts_project_id_id_idx` UNIQUE `(project_id, id)` (for the
  citation FK) and the `geo_citations` composite FK
  `(project_id, matched_publication_receipt_id) ->
  publication_receipts(project_id, id)` ON DELETE NO ACTION.
- Source-defined status enum by the DB CHECK `publication_receipts_status_valid`
  (the 23 `PublishingJobStatus` values the legacy `PublicationReceipt` declares)
  and both structured documents by `publication_receipts_media_hashes_valid` /
  `publication_receipts_verification_valid`; matching Zod narrowing in
  `src/types/schemas/publication-receipt.ts`.
- Matching Zod/domain boundary `src/types/schemas/publication-receipt.ts`:
  `PublicationReceipt` (`InferSelectModel`), `publicationReceiptSchema` (Zod
  object mirroring the 19 direct fields, reusing `PUBLISHING_JOB_STATUSES` for
  `status`, refining `mediaHashesJson` to a JSON array of strings and
  `verificationJson` to a JSON object).

## FIELD RECONCILIATION

Sources: the TASK item 1 direct field list (authoritative),
`05_DOMAIN_DATA_MODEL.md` §12, `10_DISTRIBUTION_ARCHITECTURE.md` §§1/8,
`13_PUBLISH_FINALIZER_SPEC.md`, `18_WORKFLOW_STATE_MACHINES.md` §2,
`21_TEST_ACCEPTANCE_PLAN.md` public-success/receipt portions,
`17_SECURITY_GOVERNANCE.md` "publication receipts：长期", `29_SCOPE_LOCK.md`,
`30_TRACEABILITY_MATRIX.md`, the accepted ReleaseTarget (T125) /
PublicationExecutionPlan (T133) / PlatformDraft (T134) / PublishingJob (T135) /
IndexingObservation (T128) patterns, and the legacy read-only reference artifacts
`schemas/domain-types.ts` `PublicationReceipt` /
`schemas/migrations-reference.sql` `publication_receipts`. Reference artifacts
are read-only and were NOT edited.

| Receipt field | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). Legacy `id` PK. |
| `project_id` | TASK item 1 "explicit Project identity"; item 2 | NOT NULL FK → `projects(id)` ON DELETE CASCADE. The legacy reference table has no `project_id`; the TASK requires it, so it is ADDED relative to legacy. |
| `publishing_job_id` | PublishingJob reference; one-receipt-per-job identity | NOT NULL text; same-Project AND same-ReleaseTarget composite FK `(project_id, release_target_id, publishing_job_id) -> publishing_jobs(project_id, release_target_id, id)` ON DELETE CASCADE; UNIQUE index preserves the legacy `UNIQUE` (one receipt per job). The legacy column is `publishing_job_id`; the domain `PublicationReceipt` calls it `jobId`. |
| `release_target_id` | ReleaseTarget reference | NOT NULL text; same-Project composite FK `(project_id, release_target_id) -> release_targets(project_id, id)` ON DELETE CASCADE (parent `release_targets_project_id_id_idx` from T125 reused). |
| `platform` / `executor_id` / `executor_version` | opaque platform and executor id/version | NOT NULL opaque text, stored verbatim; deliberately NOT foreign keys (no platform/executor registry/catalogue exists; TASK item 4). Legacy shapes. |
| `external_draft_id` / `external_task_id` / `external_content_id` | optional opaque external draft/task/content identifiers | Nullable opaque text, stored verbatim; NOT foreign keys, NOT receipts, NOT remote-action proofs (TASK item 4). Legacy shapes. |
| `public_url` | optional public URL | Nullable opaque text, stored verbatim. Presence does NOT assert `PUBLIC_VERIFIED`, reachability or any publication result (TASK items 3–4; 10 §8). |
| `content_hash` | content hash | NOT NULL opaque text; plain non-unique column, no hash matching/dedup rule is invented. Legacy shape. |
| `media_hashes_json` | media-hashes document | NOT NULL JSON text, `json_valid` CHECK `publication_receipts_media_hashes_valid`; Zod-refined to a JSON array of hash strings (legacy `mediaHashes: string[]`). Never decomposed into a relational/id container. |
| `status` | source-defined status | NOT NULL text-enum column constrained to exactly the 23-value `PublishingJobStatus` union the legacy `PublicationReceipt` declares (`schemas/domain-types.ts`; `schemas/state-machines.json` `publicPublishingJob`; 18 §2), DB CHECK `publication_receipts_status_valid` + Zod `z.enum(PUBLISHING_JOB_STATUSES)`. Records the value only — no transition/CAS, derivation or automatic success decision. The legacy reference stores unconstrained `TEXT`; the source-of-truth union is the domain/state-machine enum. |
| `submitted_at` / `published_at` / `verified_at` | optional submission/publish/verification timestamps | Nullable text; NULL = not recorded. Recorded evidence only — a populated `verified_at`/`published_at` never performs or proves a public verification (TASK items 3–4). Legacy shapes. |
| `verification_json` | verification document | NOT NULL JSON text, `json_valid` CHECK `publication_receipts_verification_valid`; Zod-refined to a JSON object (legacy `verification: Record<string, unknown>`). No verifier logic reads or derives it. |
| `created_at` | creation timestamp | NOT NULL text defaulted to insert time. A receipt is an immutable evidence snapshot: no `updated_at`, no CAS/version column (TASK items 1/3). |
| `geo_citations.matched_publication_receipt_id` | accepted T108 GeoCitation `matched_publication_receipt_id?` | Nullable text; round 2 binds it with the same-Project composite FK to `publication_receipts(project_id, id)` (NO ACTION). Recorded opaque relation only — no matching/attribution/verification logic. |

## PROJECT / JOB-TARGET INTEGRITY AND DELETE DECISIONS

- Project ownership: `project_id` NOT NULL FK → `projects(id)` ON DELETE CASCADE
  (the established Project-scoping FK every Search Growth row carries).
- Same-Project target: `(project_id, release_target_id)` →
  `release_targets(project_id, id)`, CASCADE.
- Same-Project AND same-ReleaseTarget job: `(project_id, release_target_id,
  publishing_job_id)` → `publishing_jobs(project_id, release_target_id, id)`,
  CASCADE. A job from another Project — in EITHER direction — or a job from a
  different ReleaseTarget of the SAME Project has no matching parent row. This
  is what makes "the receipt's job belongs to the same ReleaseTarget as its
  receipt" a database constraint, not an application convention (TASK item 2).
- One-receipt-per-job: UNIQUE index
  `publication_receipts_publishing_job_id_idx`, preserving the legacy `UNIQUE`.
- Round 2 — citation ↔ receipt: `(project_id, matched_publication_receipt_id)`
  → `publication_receipts(project_id, id)`, NO ACTION. A citation on Project A
  can no longer retain a Project B (or dangling) receipt id; NULL means no
  receipt matched and the FK is not enforced. Deleting a receipt that a citation
  still matches is blocked, preserving the citation's evidence (SET NULL cannot
  work because `project_id` is NOT NULL; CASCADE would delete citation history).
  A whole-Project teardown still removes both rows (NO ACTION is checked at
  end-of-statement), asserted by a migration-backed test.
- Delete behavior for the receipt itself: CASCADE throughout (Project,
  ReleaseTarget and the receipt's own job), consistent with the accepted
  T133/T134/T135 siblings. A Project-scoped evidence row can never dangle or
  outlive its Project hierarchy. Long-term retention (17 §"publication
  receipts：长期") is a service/policy concern, not an FK behavior; no
  purge/retention worker exists in this slice. Migration-backed tests assert all
  three cascades.
- Supporting parent targets: `publishing_jobs_project_id_release_target_id_id_idx`
  (round 1, D1 0081 / PG 0059) and `publication_receipts_project_id_id_idx`
  (round 2, D1 0082 / PG 0060). Both are `(…, id)` composites whose `id` is
  already the PK, so they accept exactly the existing rows and add no business
  uniqueness. No accepted historical migration was edited.

## PUBLIC-SUCCESS EVIDENCE BOUNDARY

- Every external identifier (`external_draft_id`, `external_task_id`,
  `external_content_id`), `public_url`, `content_hash`, `media_hashes_json`,
  `verification_json`, the three evidence timestamps and the
  `matched_publication_receipt_id` relation is an OPAQUE recorded value or
  document. None is parsed, resolved, fetched, matched or interpreted as public
  success (TASK items 3–4; 10 §8; 21 §§16/22).
- The row implements no state transition/CAS, no status derivation, no
  `PUBLIC_VERIFIED` decision, no public-URL reachability check, no verifier
  logic, no citation matching/attribution and no
  draft/submitted/remote-task-id-to-`PUBLIC_VERIFIED` promotion (TASK item 3).
  Storing `status = 'PUBLIC_VERIFIED'` records the value the evidence carries;
  it does not perform or prove verification.
- There is deliberately no updated_at, no lease/retry/scheduling column, no
  route/execution column, no connector/credential/account/certification field,
  no bridge/provider/browser field and no citation-attribution runtime (TASK item
  4 and OUT OF SCOPE).

## FILES CHANGED

Modified (tracked, `git status --short`):

- `drizzle/meta/_journal.json` — round 1 entry idx 81 plus round 2 entry idx 82
  (`0082_mighty_steve_rogers`).
- `drizzle-pg/meta/_journal.json` — round 1 entry idx 59 plus round 2 entry idx
  60 (`0060_dear_red_wolf`).
- `src/db/search-growth.schema.ts` — `publicationReceipts` table, the
  `publication_receipts_project_id_id_idx` parent target, the `geo_citations`
  matched-receipt composite FK and updated header/field comments.
- `src/db/pg/search-growth.schema.ts` — the Postgres mirror of all of the above.
- `src/db/schema.ts` — exports `publicationReceipts` from the canonical barrel.

Added (untracked):

- `drizzle/0081_bouncy_red_skull.sql`, `drizzle/meta/0081_snapshot.json` —
  round 1 receipt table/index migration.
- `drizzle/0082_mighty_steve_rogers.sql`, `drizzle/meta/0082_snapshot.json` —
  round 2 citation ↔ receipt relation migration.
- `drizzle-pg/0059_sticky_microbe.sql`, `drizzle-pg/meta/0059_snapshot.json` —
  round 1 receipt table/index migration.
- `drizzle-pg/0060_dear_red_wolf.sql`, `drizzle-pg/meta/0060_snapshot.json` —
  round 2 citation ↔ receipt relation migration.
- `src/types/schemas/publication-receipt.ts` — Zod/domain boundary.
- `src/types/schemas/publication-receipt.test.ts` — focused domain contract
  tests.
- `src/db/publication-receipt.test.ts` — migration-backed storage contract
  tests (extended in round 2 with the citation chain and relation tests).

No accepted historical migration, Accepted ADR, `29_SCOPE_LOCK.md` or
`REVIEW.md` was edited; no dependency, `package.json` or lockfile change.

## DATABASE/MIGRATION CHANGES

- D1 forward migration `0081_bouncy_red_skull.sql` (round 1): `CREATE TABLE
  publication_receipts` (19 columns, 3 FKs, 3 named CHECKs), `CREATE UNIQUE INDEX
  publication_receipts_publishing_job_id_idx`, and `CREATE UNIQUE INDEX
  publishing_jobs_project_id_release_target_id_id_idx` on the accepted
  `publishing_jobs` table.
- PostgreSQL forward migration `0059_sticky_microbe.sql` (round 1): mirrored
  table, FKs, named CHECKs and both unique indexes (`USING btree`).
- D1 forward migration `0082_mighty_steve_rogers.sql` (round 2):
  `CREATE UNIQUE INDEX publication_receipts_project_id_id_idx` on
  `publication_receipts (project_id, id)`, then the standard Drizzle SQLite
  table rebuild of `geo_citations` (`PRAGMA foreign_keys=OFF`, `__new_geo_citations`
  with the new `(project_id, matched_publication_receipt_id) ->
  publication_receipts(project_id, id)` FK, data copy, drop, rename,
  `PRAGMA foreign_keys=ON`, recreate `geo_citations_parse_idx`).
- PostgreSQL forward migration `0060_dear_red_wolf.sql` (round 2):
  `CREATE UNIQUE INDEX publication_receipts_project_id_id_idx`, then
  `ALTER TABLE geo_citations ADD CONSTRAINT
  geo_citations_project_id_matched_publication_receipt_id_publication_receipts_project_id_id_fk
  FOREIGN KEY (project_id, matched_publication_receipt_id) REFERENCES
  publication_receipts(project_id, id) ON DELETE no action ON UPDATE no action`.
- Journals updated to idx 82 / 60. Both round-2 snapshots carry the new unique
  index and the FK constraint (verified by name). No historical migration
  modified.
- Manual ordering note: the generator emitted the PostgreSQL `ALTER TABLE … ADD
  CONSTRAINT` before the `CREATE UNIQUE INDEX`; those two statements were
  reordered in `0060_dear_red_wolf.sql` so the referenced `(project_id, id)`
  unique target exists before the FK is added (PostgreSQL requires it). The D1
  migration already emitted the index first. Snapshot/journal state is
  unchanged and the clean `db:generate` re-run reports no drift.

## DEPENDENCIES CHANGED

None. `package.json` and `pnpm-lock.yaml` are unmodified.

## TESTS ADDED

- `src/db/publication-receipt.test.ts` (18 tests; +5 in round 2): round 1 covers
  valid full same-Project persistence, optional NULL defaults, one-receipt-per-job
  duplicate rejection, cross-Project job rejection in both directions,
  same-Project wrong-target job rejection, dangling job/target/Project rejection,
  invalid status enum rejection, malformed both-document rejection, delete
  cascades on job/ReleaseTarget/whole Project, NOT NULL required columns and the
  exact 19-column storage shape. Round 2 adds, through the shipped
  `0045→0081` + `0048/0050–0054` + `0082` DDL in in-memory SQLite with FKs ON:
  same-Project matched-receipt and NULL-match allowance; cross-Project receipt
  rejection; dangling receipt rejection; NO ACTION delete block that preserves
  the citation until it is removed; and whole-Project teardown removing both the
  matched citation and its receipt.
- `src/types/schemas/publication-receipt.test.ts` (8 tests): full contract
  verbatim; external ids/public URL/timestamps/verification document populated;
  every source-defined status accepted; statuses outside the union rejected;
  malformed/wrong-shape media-hash document rejected; malformed/wrong-shape
  verification document rejected; missing required field rejected; row type
  exposes only the evidence-storage shape.

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no commit/merge/push, no
external/publishing/paid behavior). `node_modules` was already present from
round 1, so no install was needed in round 2.

1. `corepack pnpm run db:generate` (round-2 generation)
2. `corepack pnpm run db:migrate:local`
3. `corepack pnpm exec vitest run src/db/publication-receipt.test.ts src/db/geo-citation.test.ts src/db/schema-parity.test.ts src/types/schemas/publication-receipt.test.ts`
4. `corepack pnpm exec prettier --write src/db/search-growth.schema.ts src/db/pg/search-growth.schema.ts src/db/schema.ts src/db/publication-receipt.test.ts src/types/schemas/publication-receipt.ts src/types/schemas/publication-receipt.test.ts`
5. `corepack pnpm run db:generate` (clean re-run)
6. `corepack pnpm types:check`
7. `corepack pnpm format:check`
8. `corepack pnpm lint`
9. `corepack pnpm test`
10. `corepack pnpm build`
11. `corepack pnpm ci:check`
12. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`, `git rev-parse --abbrev-ref HEAD`, journal/snapshot
    greps)

## COMMAND RESULTS

**All required gates exit 0 on the final tree.**

1. Round-2 `db:generate` → exit 0 — wrote `drizzle/0082_mighty_steve_rogers.sql`
   and `drizzle-pg/0060_dear_red_wolf.sql`; 72 tables each; `geo_citations 11
   columns 1 indexes 3 fks`; `publication_receipts 19 columns 2 indexes 3 fks`.
2. `db:migrate:local` → exit 0 — applied `0082_mighty_steve_rogers.sql ✅`
   ("9 commands executed successfully"); the full local D1 chain is current.
3. Focused Vitest → exit 0 — 4 files / 407 tests passed (storage 18, geo-citation
   12, parity 369, domain 8).
4. Task-file Prettier → exit 0 — 1 file reformatted
   (`src/db/publication-receipt.test.ts`); the two schema files, `schema.ts` and
   the domain module were already clean.
5. Clean re-run `db:generate` → exit 0 — both dialects print `No schema changes,
   nothing to migrate 😴`.
6. `types:check` → exit 0, no diagnostics.
7. `format:check` → exit 0 — "All matched files use Prettier code style!".
8. `lint` (`oxlint . --type-aware`) → exit 0 — "Found 0 warnings and 0 errors.
   Finished in 58.9s on 934 files".
9. Full `test` → exit 0 — 203 files / 1922 tests passed.
10. `build` → exit 0 — vite client, SSR and open_seo_audit bundles built,
    followed by `tsc --noEmit` with no output.
11. `ci:check` → exit 0 — prettier clean, knip clean, both `tsc --noEmit` runs
    clean, oxlint 0 warnings/0 errors on 934 files, plugin-skills sync clean
    (`plugin skill sync clean: plugins/openseo/skills`). No sandbox denial
    occurred; no aggregate gate was skipped.
12. Read-only Git → `git diff --check` clean (no output); branch
    `ai-task/T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA`.

## RUNTIME EVIDENCE

- `db:generate`: 72 tables; `geo_citations 11 columns 1 indexes 3 fks`;
  `publication_receipts 19 columns 2 indexes 3 fks`; and `No schema changes,
  nothing to migrate 😴` after the clean re-run — schema and snapshots agree
  with no drift.
- `db:migrate:local`: final applied migration is `0082_mighty_steve_rogers.sql ✅`.
- Snapshot check: `drizzle/meta/0082_snapshot.json` and
  `drizzle-pg/meta/0060_snapshot.json` both contain
  `publication_receipts_project_id_id_idx`, the `matched_publication_receipt_id`
  column and the FK constraint
  `geo_citations_project_id_matched_publication_receipt_id_publication_receipts_project_id_id_fk`
  with `onDelete = "no action"`. `schema-parity.test.ts` (369 tests) proves both
  dialects expose the identical FK set (including onDelete) and unique-constraint
  targets.
- Storage suite executes the shipped 0081/0082 DDL directly and asserts real
  SQLite FK/UNIQUE/CHECK/cascade behavior (18 tests), including: a Project-A
  citation binding a Project-B receipt is rejected; a dangling receipt id is
  rejected; a NULL match and a same-Project match are accepted; deleting a
  still-matched receipt is blocked; and a whole-Project teardown removes the
  matched citation and its receipt.
- Full suite: `Test Files 203 passed (203)`, `Tests 1922 passed (1922)`.
- `build`: client/SSR/open_seo_audit bundles built; `tsc --noEmit` no
  diagnostics.
- `ci:check`: full chain completed with exit 0, final line
  `plugin skill sync clean: plugins/openseo/skills`.
- Git: `git status --short` shows exactly the intended tracked modifications and
  the round-1 + round-2 untracked artifacts; `git diff --stat` 5 tracked files,
  487 insertions(+), 30 deletions(-); `git diff --check` clean.

## KNOWN LIMITATIONS

- None blocking. Every TASK item 6 gate ran and exited 0 in this session; no
  `BLOCKED_BY_TEST_ENVIRONMENT`, `BLOCKED_BY_DESIGN`,
  `BLOCKED_BY_EXTERNAL_DEPENDENCY` or `SPEC_IMPLEMENTATION_CONFLICT` status is
  claimed.
- Scope-shape notes (by design, not defects): schema/contract only — no
  submit/finalize/publish action, no public verification or URL reachability
  check, no status transition/CAS, no verifier logic, no route execution, no job
  scheduling/retry/lease, no connector/credential/account behavior, no bridge/
  provider/browser, no paid/production action, no citation matching/attribution
  runtime and no UI.
- `platform`/`executor_id`/`executor_version`/external ids/`public_url`/
  `content_hash` are opaque/verbatim; `public_url` and the status/document fields
  carry no `PUBLIC_VERIFIED`, reachability or remote-action semantics.
- The `geo_citations` matched-receipt FK is referential integrity only: it does
  not match, decide, normalize or attribute anything; deciding which receipt a
  citation matches remains a later, out-of-scope service task.
- The status enum is the authoritative `PublishingJobStatus` union the legacy
  `PublicationReceipt` declares (18 §2 / `state-machines.json`). The row records
  the value; no transition machine is implemented.
- The D1 SQLite rebuild of `geo_citations` is the standard Drizzle table
  recreation (SQLite cannot add an FK in place). It preserves all existing rows
  and the `geo_citations_parse_idx` index; it was applied successfully by
  `db:migrate:local`.

## DEVIATIONS FROM TASK

- None that change scope.
- Round 2 adds the `geo_citations` relation in a NEW forward migration
  (`0082`/`0060`) rather than editing the round-1 migrations, per the
  `REVIEW.md` fix acceptance ("in a new forward D1/SQLite and PostgreSQL
  migration"). Round-1/TASK migration IDs `0081`/`0059` are unchanged.
- `project_id` is ADDED relative to the legacy `publication_receipts` reference
  table because TASK items 1–2 explicitly require explicit Project identity and
  Project-leading ownership constraints.
- The job composite FK references the triple
  `(project_id, release_target_id, id)`, which required adding one supporting
  unique index to the accepted T135 `publishing_jobs` table; the citation FK
  required one supporting unique index on the T136 `publication_receipts` table.
  TASK item 2 authorizes "only the supporting unique referential parent
  target(s) needed through this forward migration"; no historical migration was
  modified.
- Migration file names are generator-chosen (`0081_bouncy_red_skull`,
  `0059_sticky_microbe`, `0082_mighty_steve_rogers`, `0060_dear_red_wolf`)
  because the TASK-approved `db:generate` takes no `--name`; the forward IDs
  match the TASK's `0081`/`0059` plus the round-2 forward increments.
- PostgreSQL migration `0060` statements were manually reordered (unique index
  before the FK) so the referenced unique target exists first; documented above.
- The one-receipt-per-job UNIQUE index is global on `(publishing_job_id)`,
  preserving the source-defined identity (legacy `UNIQUE`), not Project-leading.

## SECURITY NOTES

- No credential, account, connector, bridge, publisher connection,
  certification, provider, browser or cookie model is added or referenced;
  external ids and executor identities are opaque text only (TASK item 4;
  `29_SCOPE_LOCK.md`).
- No CAPTCHA/2FA bypass, stealth behavior, cookie upload, paid action,
  production publishing or external contact was implemented or invoked.
- No `PUBLIC_VERIFIED`/reachability/verification claim is made from any stored
  field: a `public_url`, status value, external id or matched receipt id is an
  opaque record, not a production result (TASK items 3–4; 21 §§16/22).
- All untrusted row values are narrowed at the Zod boundary; the status union and
  both structured documents are enforced at the DB and Zod trust boundaries; the
  citation relation is enforced by a database composite FK, not application
  convention.

## GIT STATUS/DIFF SUMMARY

`git status --short` (final):

```text
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? control/tasks/T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA/DELIVERY.md
?? control/tasks/T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA/REVIEW.md
?? drizzle-pg/0059_sticky_microbe.sql
?? drizzle-pg/0060_dear_red_wolf.sql
?? drizzle-pg/meta/0059_snapshot.json
?? drizzle-pg/meta/0060_snapshot.json
?? drizzle/0081_bouncy_red_skull.sql
?? drizzle/0082_mighty_steve_rogers.sql
?? drizzle/meta/0081_snapshot.json
?? drizzle/meta/0082_snapshot.json
?? src/db/publication-receipt.test.ts
?? src/types/schemas/publication-receipt.test.ts
?? src/types/schemas/publication-receipt.ts
```

`git diff --stat` (tracked): 5 files changed, 487 insertions(+), 30 deletions(-).
`git diff --check`: clean. Branch:
`ai-task/T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA`. No commit, merge or push was
made.

## READY FOR REVIEW

`READY_FOR_REVIEW` — the Round 1 blocker is fixed with the same-Project
citation ↔ receipt composite FK in a new forward dual-dialect migration, and all
required gates are green. Only Codex may mark PASS.
