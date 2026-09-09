# DELIVERY — T114-M1-MEDIA-ASSET-SCHEMA (round 1)

## STATUS

`BLOCKED_BY_TEST_ENVIRONMENT` — the implementation itself is complete and
in-scope; every approved gate that the executor sandbox permits runs and exits 0
(local D1 migration, dual-dialect `db:generate`, focused Vitest, full Vitest,
task-file Prettier, read-only Git). The five whole-repo gates required by TASK
item 5 (`format:check`, `types:check`, `lint`, `build`, `ci:check`) are
auto-denied by this session's sandbox with no approval surface — no exit code
exists for any of them (each exact command and each underlying binary was
attempted exactly once and abandoned). This is the same environment block
recorded across T111 rounds 1–3, T112 rounds 1–2 and T113 round 1, and is
reported honestly as an environment limitation, not as passing and not as a
scope/code deviation.

## TASK ID

`T114-M1-MEDIA-ASSET-SCHEMA` — implementation round 1.

## IMPLEMENTATION SUMMARY

Added the normalized, Project-scoped `media_assets` metadata table across both
dialects (D1/SQLite + PostgreSQL). This is schema/contract only: it records V1.0
asset identity, rights, and classification without implementing upload, object
storage, media processing, CRUD/UI, ContentVersion links, the Rights Gate
runtime, or publishing.

Storage contract shipped:

- `media_assets` (both dialects): stable text `id` (PK), explicit `project_id`
  (NOT NULL FK → `projects(id)` ON DELETE CASCADE), direct asset metadata
  `media_type`, `mime_type`, `bytes`, `sha256`, `rights_status`,
  `classification`, plus the creation audit timestamp `created_at`
  (DEFAULT `(current_timestamp)` / PG `to_char(now() AT TIME ZONE 'utc', ...)`).
- The three exact V1.0 domain enum unions are enforced at BOTH storage and Zod
  boundaries: media type `IMAGE | VIDEO | AUDIO | DOCUMENT | OTHER`; rights
  status `OWNED | LICENSED | APPROVED_EXTERNAL | UNKNOWN`; classification
  `PUBLIC_MARKETING | INTERNAL | RESTRICTED`. Each union is a DB text-enum
  column plus a named CHECK constraint in the shipped DDL
  (`media_assets_media_type_valid`, `media_assets_rights_status_valid`,
  `media_assets_classification_valid`) on both dialects, and a Zod enum in
  `src/types/schemas/media-asset.ts`.
- Project FK/delete behavior and the single Project-lookup index
  `media_assets_project_idx` (project_id) on both dialects. No content-hash /
  storage-key / filename / dimensional / duplicate / business-uniqueness rule is
  invented (TASK item 3) — `sha256` is a plain non-unique column.
- Creation audit only: the row carries `created_at` and no `updated_at` / no
  `created_by` / no `deleted_at` (see FIELD RECONCILIATION).

## FIELD RECONCILIATION

Sources: `05_DOMAIN_DATA_MODEL.md` §11 MediaAsset (sha256/mime/size/
rights_status/classification), `15_MEDIA_ASSET_SPEC.md` §2 (project/MIME/bytes/
SHA256/dimensions/duration/storage key/rights/data classification/source/created
by+time), `09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §9 Rights Gate,
`29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md` (素材安全 → MediaAsset →
MIME/hash/rights), the TASK field list (authoritative), and the legacy reference
artifacts `schemas/domain-types.ts` MediaAsset / MediaRightsStatus /
DataClassification and `schemas/migrations-reference.sql` media_assets.
Reference artifacts are read-only and were NOT edited.

| MediaAsset aspect | §11/15 / TASK (authoritative) | Decision |
| --- | --- | --- |
| `id` | stable asset id | Stable text PK (established convention). |
| `project` | explicit Project ownership | NOT NULL FK → projects(id) ON DELETE CASCADE. |
| `media_type` | TASK union IMAGE \| VIDEO \| AUDIO \| DOCUMENT \| OTHER | NOT NULL DB text-enum + named CHECK + Zod union. |
| `mime` / `mime_type` | §11 `mime` | NOT NULL opaque MIME string, stored verbatim (`image/png`, `video/mp4`). No allowlist/magic-bytes check (upload security, out of scope). |
| `size` / `bytes` | §11 `size`; §15 `bytes` | NOT NULL `integer` bytes column. No size limit (out of scope). |
| `sha256` | §11 / §15 SHA256 | NOT NULL plain non-unique column; no content-hash dedup rule (TASK item 3). |
| `rights_status` | §11 union OWNED \| LICENSED \| APPROVED_EXTERNAL \| UNKNOWN | NOT NULL DB text-enum + named CHECK + Zod union. §9 Rights Gate policy (UNKNOWN blocks unattended release) NOT implemented — later runtime slice. |
| `classification` | DataClassification PUBLIC_MARKETING \| INTERNAL \| RESTRICTED (legacy reference + accepted claim/opportunity rows) | NOT NULL DB text-enum + named CHECK + Zod union. |
| `created by/time` | §15 field list | Reduced to the established convention's creation audit metadata: append-only `created_at` text timestamp (current_timestamp default). No `created_by` column exists anywhere in the Search Growth convention. |
| `storage_key`, `original_filename` | legacy reference | Reconciled OUT — object storage / filename sanitization out of scope. |
| `width`, `height`, `duration_seconds`, `alt_text` | legacy reference | Reconciled OUT — dimensions/duration/extraction out of scope. |
| `source` (attribution) | §15 field list | Reconciled OUT — no source contract authorized by the TASK field list. |
| `updated_at` | (not in §11/§15/legacy `media_assets`) | NOT shipped — the asset row is content-addressed/append-only in this slice and no accepted artifact carries `updated_at`; a later rights workflow that mutates in place can add it via its own forward migration. |
| `deleted_at` (soft delete) | legacy reference | Reconciled OUT — no delete behavior beyond the Project-delete cascade is authorized. |

## RELATION / FK / IDENTITY / DELETE DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project integrity: n/a for this table itself (it has no parent-child
  relation to a same-Project row beyond the Project). No composite parent keys
  are added; future children (e.g. `published_media_refs`) will add their own
  links later and can rely on the media_assets `id` PK.
- No business uniqueness: `sha256` is deliberately NOT unique and no other
  unique index exists (TASK item 3 forbids content-hash/dedup/business
  uniqueness without a V1.0 contract).
- Indexes: only `media_assets_project_idx` (project_id), required for
  Project-scoped lookup and the Project-delete cascade path (TASK item 3).
- Delete behavior: ON DELETE CASCADE on the Project FK — deleting a whole
  Project cascades its media assets away, so an asset can never dangle.
- Creation audit only: `created_at` with a DB default; no `updated_at`.

## MIGRATION IDS

- D1/SQLite: `drizzle/0060_nervous_gwen_stacy.sql` (+
  `drizzle/meta/0060_snapshot.json`, `drizzle/meta/_journal.json` idx 60).
- PostgreSQL: `drizzle-pg/0038_goofy_scalphunter.sql` (+
  `drizzle-pg/meta/0038_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 38).

Both forward migrations carry only the intended DDL (CREATE TABLE with the three
named enum CHECKs, the Project FK, and the single Project-lookup index). Accepted
migrations (SQLite ≤ 0059, PG ≤ 0037) were NOT edited. Clean final dual-dialect
`db:generate` re-run reports `No schema changes, nothing to migrate 😴` on both
dialects.

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — added `mediaAssets` sqliteTable after
  `claimAllowedLanguages` (end of file); header `max-lines` eslint-disable
  comment updated to include T114.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror with
  `isoNow` default; header comment updated the same way.
- `src/db/schema.ts` — destructured barrel export adds `mediaAssets`.
- `drizzle/meta/_journal.json` and `drizzle-pg/meta/_journal.json` —
  `db:generate` journal entries (idx 60 / idx 38).

Added (untracked):

- `drizzle/0060_nervous_gwen_stacy.sql` and `drizzle/meta/0060_snapshot.json`.
- `drizzle-pg/0038_goofy_scalphunter.sql` and
  `drizzle-pg/meta/0038_snapshot.json`.
- `src/types/schemas/media-asset.ts` — the MediaAsset domain boundary module
  (`MediaAsset` select row type + `mediaTypeSchema`, `mediaRightsStatusSchema`,
  `mediaClassificationSchema` + inferred types).
- `src/types/schemas/media-asset.test.ts` — the domain-boundary spec.
- `src/db/media-asset.test.ts` — the migration-backed storage spec.

Task-channel file for this round: `DELIVERY.md` (this document). No `REVIEW.md`
existed at round start (verified before implementation); none was created.

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install
used the existing lockfile).

## TESTS ADDED

- `src/db/media-asset.test.ts` — 9 migration-backed storage tests that build a
  real in-memory SQLite client, enable `PRAGMA foreign_keys = ON`, hand-create
  the `projects` table, and apply the actual shipped forward-migration DDL
  (`drizzle/0060_nervous_gwen_stacy.sql`, split on `--> statement-breakpoint`).
  The DDL is the source of truth, so the Project FK, the three enum CHECKs and
  the cascade are exercised — not an application convention. Tests cover: valid
  asset persistence with the full normalized direct field set + `created_at`
  default; enum round-trip of every MediaType × MediaRightsStatus ×
  classification combination (60 rows) plus verbatim unconstrained
  mime/sha256/bytes persistence; NOT NULL rejection of each of the six required
  direct columns; CHECK rejection of unsupported and case-mismatched
  media_type / rights_status / classification values; dangling-Project FK
  rejection; whole-Project delete cascade; exact column-shape assertion
  (`bytes, classification, created_at, id, media_type, mime_type, project_id,
  rights_status, sha256` — no storage/filename/dimensional/alt/source/updated/
  deleted column).
- `src/types/schemas/media-asset.test.ts` — 7 domain-boundary tests asserting
  the DB text-enum columns and the Zod enums cannot drift: every column enum
  value is a valid Zod value; unsupported, legacy-union, case-mismatched and
  empty values are rejected for all three unions; and the exported
  `MediaAsset` row/enum types stay true to the storage columns (compile-time
  `Pick` conformance with no storage-key/filename/dimensional/updated/deleted
  field).
- Dialect parity: the new table is auto-picked-up by the existing
  `src/db/schema-parity.test.ts` (now 264 tests: +5 per-table assertions for the
  new table — columns/PK/unique/FKs/checks), which structurally compares every
  SQLite and PG table.

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no chained shell
operations).

1. `node --version` → v24.16.0.
2. `corepack pnpm --version` → 10.30.1.
3. `corepack pnpm install --frozen-lockfile` → exit 0 (lockfile up to date,
   resolution skipped; 980 packages linked; ignored-build-scripts warning only).
4. `corepack pnpm run db:generate` (dual-dialect, first run) → exit 0 —
   produced `drizzle/0060_nervous_gwen_stacy.sql` and
   `drizzle-pg/0038_goofy_scalphunter.sql` with snapshots + journal entries
   (51 tables on both dialects; `media_assets` = 9 columns / 1 index / 1 fk on
   both).
5. `corepack pnpm run db:migrate:local` (apply local D1 state) → exit 0 —
   0000 → 0060 all ✅ (`0060_nervous_gwen_stacy.sql` ✅).
6. Task-file Prettier: `corepack pnpm exec prettier --write <6 changed/new
   source files>` → exit 0 (the two schema files, schema.ts, media-asset.ts
   unchanged; the two test files reformatted).
7. Focused Vitest (`corepack pnpm exec vitest run` with the 3 task-related
   files) → exit 0 — 3 files / 280 tests passed (9 storage + 7 boundary + 264
   parity).
8. `corepack pnpm run db:generate` (dual-dialect, clean final run) → exit 0 —
   both dialects: 51 tables, `No schema changes, nothing to migrate 😴`.
9. `corepack pnpm run db:migrate:local` (idempotency re-run) → exit 0 —
   `✅ No migrations to apply!`.
10. Full Vitest (`corepack pnpm exec vitest run`, default parallelism) → exit 0
    — **168 files / 1473 tests passed**.
11. `corepack pnpm run format:check` → **sandbox auto-denied; no exit code**.
12. `corepack pnpm run types:check` → **sandbox auto-denied; no exit code**.
13. `corepack pnpm run lint` → **sandbox auto-denied; no exit code**.
14. `corepack pnpm run build` → **sandbox auto-denied; no exit code**.
15. `corepack pnpm run ci:check` → **sandbox auto-denied; no exit code**.
16. Underlying whole-repo binaries (`corepack pnpm exec prettier --check .`,
    `corepack pnpm exec tsc --noEmit`, `corepack pnpm exec oxlint .
    --type-aware`) → each **sandbox auto-denied; no exit code**.
17. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`) → exit 0 — `git diff --check` clean.

## COMMAND RESULTS

Passing on the final tree: frozen install exit 0; local D1 migration exit 0
(0000 → 0060 applied ✅, then idempotent `✅ No migrations to apply!`); clean
final dual-dialect `db:generate` exit 0 (`No schema changes, nothing to migrate
😴` on both dialects, 51 tables each); focused Vitest **3 files / 280 tests**
exit 0; full Vitest **168 files / 1473 tests** exit 0 at default parallelism;
read-only Git inspection clean (`git diff --check` clean).

Environment limitation (reported, not hidden): the sandbox auto-approval grant
list for this executor session does not include `format:check`, `types:check`,
`lint`, `build`, `ci:check` nor their whole-repo underlying binaries. Each exact
approved command (and each underlying binary) was attempted as a standalone
invocation and auto-denied with no approval surface to escalate to, so **no exit
code exists for any of the five gates in this session**. The denial message
instructs not to claim success and not to retry; each was attempted exactly once
and abandoned. This is the same environment block recorded for T111 rounds 1–3,
T112 rounds 1–2 and T113 round 1.

## RUNTIME EVIDENCE

- Full-suite Vitest: `Test Files 168 passed (168)`, `Tests 1473 passed (1473)`,
  exit 0 at default parallelism. The new storage spec's 9 tests, the boundary
  spec's 7 tests and the extended parity suite (264) pass inside it. (1473 =
  prior accepted count 1452 + 9 media-asset storage tests + 7 media-asset
  boundary tests + 5 parity assertions for the new table.)
- `db:migrate:local`: 0060 applied successfully (✅) on the local D1 state;
  re-run reports `✅ No migrations to apply!`, exit 0 (journal complete and
  idempotent).
- `db:generate` final: D1 then PG each print 51 tables and `No schema changes,
  nothing to migrate 😴`, exit 0 — confirms both dialects' schemas exactly match
  their snapshots with no drift; `media_assets` = 9 columns / 1 index / 1 fk on
  both.
- Read-only Git inspection: `git diff --check` clean; file set below is exactly
  the intended change set.
- Five full-repo gates: no exit codes (sandbox auto-denied) — see COMMAND
  RESULTS / KNOWN LIMITATIONS.

## KNOWN LIMITATIONS

- The `format:check` / `types:check` / `lint` / `build` / `ci:check` gates
  remain non-executable in this executor session: the sandbox auto-denies each
  exact command (and each whole-repo underlying binary) with no approval
  surface, so no exit code exists for any of the five (TASK item 5's "every gate
  must exit 0" therefore cannot be fully evidenced here). This is the same
  environment block recorded across T111 rounds 1–3, T112 rounds 1–2 and T113
  round 1 and is reported as `BLOCKED_BY_TEST_ENVIRONMENT` — a test-environment
  limitation, not a scope or code deviation. The runnable matrix (frozen
  install, local migration, dual-dialect `db:generate`, focused and full Vitest,
  task-file Prettier, read-only Git) all pass. A grant-enabled session, the
  controller/QA under the Product Owner's bounded acceptance-verification
  exception (the T111 unblock path), or a human gate must produce the five exit
  codes before final acceptance.
- Type/lint surface for the new module could not be checked by `tsc`/`oxlint`
  this round (sandbox-denied); it is the same idiom as the accepted
  claims/source-ref modules and the focused + full Vitest suites import and
  execute the new module and both schema mirrors (parity compares every column/
  index/FK/check between dialects at runtime).
- Scope-shape notes (by design, not defects): the table is schema/contract only
  — no upload/storage/media-processing/CRUD/UI, no MIME allowlist/magic-bytes
  check, no Rights Gate runtime enforcement, no ContentVersion link and no
  publishing code; `sha256` is a plain non-unique column (no dedup rule);
  `created_at` is DB-defaulted text (the established convention) and no
  `updated_at`/`created_by`/`deleted_at`/storage-key/filename/dimensional/
  alt-text/source column is shipped (see FIELD RECONCILIATION).

## DEVIATIONS FROM TASK

None in scope, field set, enum unions, delete behavior, index set or migration
IDs. The table ships D1 `0060` and PostgreSQL `0038` as required with forward
snapshots + journals, the Project FK cascades on delete, the only index is the
Project-lookup index, the three exact enum unions are enforced by DB text-enum +
named CHECK columns and by the Zod boundary, and only the creation audit
timestamp is added. The only non-`0` outcome is environmental: the five
full-repo gates could not be granted by the sandbox in this round (see KNOWN
LIMITATIONS) — reported as an environment limitation, not a scope deviation. The
full suite passed at default Vitest parallelism (no load-bounded re-run was
needed this round).

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state (`db:migrate:local`) and
  in-memory SQLite built from the shipped forward-migration DDL.
- No network/provider/publishing action occurred. No commit, merge, or push was
  performed. No `main` branch was touched.
- TASK-approved command names only; every denied invocation was abandoned
  without retry or bypass after the sandbox denial.
- No upload/download, object-storage, media-processing, Rights Gate runtime or
  publishing behavior was added (out of scope); the slice adds persistence/
  contract surface only. `rights_status`/`classification` values are recorded
  but never interpreted or gated here.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T114-M1-MEDIA-ASSET-SCHEMA`; working tree is NOT committed
  (rounds stop at delivery). Recent commits on the branch: `9435def control:
  accept T113 and dispatch T114`, `493389b merge: accept T113 claim allowed
  language relation`, `62f9217 feat(search-growth): add claim allowed language
  relation`.
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json` (db:generate journal entries);
  `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
  `src/db/schema.ts`.
- Added (untracked) files (7): `drizzle/0060_nervous_gwen_stacy.sql`,
  `drizzle/meta/0060_snapshot.json`, `drizzle-pg/0038_goofy_scalphunter.sql`,
  `drizzle-pg/meta/0038_snapshot.json`, `src/db/media-asset.test.ts`,
  `src/types/schemas/media-asset.ts`, `src/types/schemas/media-asset.test.ts`.
- Task-channel file: `control/tasks/T114-M1-MEDIA-ASSET-SCHEMA/DELIVERY.md`
  (this document). `REVIEW.md` did not exist at round start and was not created.
- `git diff --stat` (tracked): 5 files, +238/−2. `git diff --check` clean.
- No other files are dirty or untracked.

## READY FOR REVIEW

Implementation round 1 is complete and in-scope: the normalized `media_assets`
table ships on both dialects with forward migrations 0060/0038, snapshots,
journals, the three exact enum unions enforced at the storage and Zod
boundaries, the Project-delete cascade, the single Project-lookup index, a
Zod/type export, and a migration-backed 9-test storage spec plus a 7-test
boundary spec and parity coverage. Runnable approved gates pass on the final
tree: frozen install exit 0, local D1 migration exit 0 (0000 → 0060 applied,
idempotent on re-run), clean final dual-dialect `db:generate` exit 0 (`No schema
changes, nothing to migrate` on both dialects), focused Vitest 3 files / 280
tests exit 0, full Vitest 168 files / 1473 tests exit 0 (default parallelism),
and read-only Git clean. The five full-repo gates (`format:check`,
`types:check`, `lint`, `build`, `ci:check`) could not be executed because the
sandbox auto-denies them with no approval surface (no exit codes), so status is
reported as `BLOCKED_BY_TEST_ENVIRONMENT`. No `PASS` verdict is written by the
implementation round.
