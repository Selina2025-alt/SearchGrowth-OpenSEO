# DELIVERY — T122-M1-CONTENT-VARIANT-CORE-SCHEMA (round 2)

## STATUS

`READY_FOR_REVIEW` — the single Round 1 blocker (task-local type-only import) is
fixed, and **every required gate now runs and exits 0 in this executor session**:
frozen install, dual-dialect `db:generate` (clean final run), local D1 migration
(idempotent), task-file Prettier via the whole-repo `format:check` and `ci:check`,
focused Vitest, full Vitest, `types:check`, `lint`, `build`, and `ci:check`. The
Round 1 environment claim (whole-repo aggregate gates auto-denied) did **not**
reproduce this round: `format:check`, `types:check`, `lint`, `build` and
`ci:check` were each invoked independently and each exited 0. No `PASS` verdict is
written by the implementation round.

## TASK ID

`T122-M1-CONTENT-VARIANT-CORE-SCHEMA` — implementation round 2. A `REVIEW.md`
(round 1) existed at round start and was read; it was **not** edited.

## REVIEW FINDINGS ADDRESSED

- **BLOCKER — T122 domain boundary fails required lint**
  (`src/types/schemas/content-variant.ts:3`). Fixed exactly as requested: the
  Drizzle table import is now type-only —
  `import type { contentVariants } from "@/db/search-growth.schema";` — so
  `typescript-eslint(consistent-type-imports)` is satisfied. This is the **only**
  code change in round 2. No schema, migration, snapshot, journal, test, or
  business-behavior change was made (per the REVIEW merge decision).
- Re-run evidence for the reviewer's fix acceptance condition: `corepack pnpm
  lint` → exit 0 (0 warnings / 0 errors), plus the remaining aggregate gates
  (`format:check`, `types:check`, `build`, `ci:check`) and the full/focused test
  suites all exit 0 on the unchanged task scope — see COMMANDS RUN.

## IMPLEMENTATION SUMMARY

Adds the immutable, Project-scoped, platform-native `ContentVariant` core
contract across both dialects (D1/SQLite + PostgreSQL), plus its matching
Zod/domain boundary. A variant is a platform-native rendering of one immutable
ContentVersion — NOT a mechanical copy and NOT a publishing instruction
(05_DOMAIN_DATA_MODEL.md §10 ContentVariant "平台原生版，不是全文简单复制";
09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §7 Platform Variants; ADR-006: canonical
Markdown + metadata + asset refs are the source, the platform HTML/body is the
variant). This slice is schema/contract + domain-boundary ONLY: it stores no
execution, approval, account or public-success state.

Storage contract shipped:

- `content_variants` (both dialects): stable text `id` (PK), explicit NOT NULL
  `project_id` (FK → `projects(id)` ON DELETE CASCADE), required
  `content_package_version_id`, required opaque `platform` and `format` strings,
  required `title` and `body`, required opaque platform-native `metadata_json`,
  required opaque `body_hash`, required `renderer_version`, and the append-only
  `created_at` timestamp only.
- Same-Project ContentVersion ownership is database-enforced by the
  Project-leading composite FK
  `(project_id, content_package_version_id) -> content_package_versions(project_id, id)`
  ON DELETE CASCADE, reusing the accepted
  `content_package_versions_project_id_id_idx` (T119, D1 0064 / PG 0042). No
  parent index is added.
- No business uniqueness rule exists: `id` is the ONLY identity in this core
  slice (TASK item 2). There is no unique index beyond the PK and no extra
  lookup index on the child table.
- Immutable-row shape preserved: no `updated_at`, no mutable
  version-overwrite behavior, no JSON asset/reference ID container, no variant
  asset mapping, no release/approval, and no publishing/execution/account/
  public-success state; no CRUD/UI. `metadata_json` is opaque renderer metadata
  for the §7 presentation contract, not a relational id container.
- Matching Zod/domain boundary `src/types/schemas/content-variant.ts`:
  `ContentVariant` (`InferSelectModel`) and `contentVariantSchema` (Zod object
  mirroring the 11 direct fields). `platform`/`format`/`metadata_json` are
  deliberately opaque required strings, so no Zod enum is defined.

## FIELD RECONCILIATION

Sources: the TASK field list (authoritative), `05_DOMAIN_DATA_MODEL.md` §10
ContentVariant, `09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md` §§7–8,
`21_TEST_ACCEPTANCE_PLAN.md` §§10 and 12, `29_SCOPE_LOCK.md`,
`30_TRACEABILITY_MATRIX.md`, `docs/adr/ADR-006-canonical-markdown.md`, the
accepted T114/T117/T118/T121 same-Project patterns, and the legacy reference
artifacts `schemas/domain-types.ts` `ContentVariant` and
`schemas/migrations-reference.sql` `content_variants`. Reference artifacts are
read-only and were NOT edited.

| ContentVariant aspect | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention); the ONLY identity (TASK item 2). |
| `project_id` | explicit non-null Project ownership | NOT NULL FK → projects(id) ON DELETE CASCADE. |
| `content_package_version_id` | required ContentVersion | NOT NULL text id; same-Project composite FK `(project_id, content_package_version_id) -> content_package_versions(project_id, id)` ON DELETE CASCADE (parent target is the accepted `content_package_versions_project_id_id_idx` from 0064/0042 — reused). |
| `platform` | required opaque platform string | NOT NULL text, free-form; no platform enum/connector catalogue is invented (TASK item 1). |
| `format` | required opaque format string | NOT NULL text, free-form; no format enum/normalization is invented (TASK item 1). |
| `title` | required title | NOT NULL text (09 spec §7 title). |
| `body` | required body | NOT NULL text — platform-native body stored verbatim (ADR-006; 09 spec §7): no Markdown/HTML conversion or normalization. |
| `metadata_json` | required opaque platform-native renderer metadata | NOT NULL text JSON document stored verbatim (the §7 presentation contract). Renderer metadata, not a relational id container. |
| `body_hash` | required opaque body hash | NOT NULL text stored verbatim; plain non-unique column — no hash matching/dedup rule is invented. |
| `renderer_version` | required renderer version | NOT NULL text stored verbatim for render provenance; no renderer runtime exists in this slice. |
| `created_at` | creation timestamp only | NOT NULL text timestamp with DB default; the ONLY audit column. |
| `updated_at` / mutable version overwrite / execution / approval / account / public-success | TASK item 3 forbids on an immutable row | Reconciled OUT — no such column exists. |
| `asset_refs_json` / `assetRefs: string[]` | legacy reference `content_variants` column and `schemas/domain-types.ts` ContentVariant | Reconciled OUT — TASK item 3 forbids JSON asset/reference IDs and variant asset mapping; a later VariantAsset relation task owns any normalized mapping. |
| tag/category normalization, target routing, cover/image constraints runtime, CTA rendering, HTML conversion | 09 spec §7 / TASK OUT OF SCOPE | Reconciled OUT of the direct fields — the §7 presentation inputs live in the opaque `metadata_json`; no normalization/renderer runtime is added. |
| business uniqueness | TASK item 2: stable id is the only identity | NOT shipped — the only index on the table is the `id` PK. Two variants may share `(content_package_version_id, platform)`. |

## RELATION / FK / IDENTITY / DELETE / IMMUTABILITY DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project integrity: the Project-leading composite FK
  `(project_id, content_package_version_id) -> content_package_versions(project_id, id)`
  ON DELETE CASCADE (the accepted T114/T118/T121 same-Project pattern). A variant
  whose ContentVersion belongs to a different Project has no matching parent row
  in EITHER direction and is rejected by the DB; a dangling ContentVersion or
  Project is likewise rejected.
- Reused parent target only: no index is added to `content_package_versions` —
  its accepted `content_package_versions_project_id_id_idx` (T119, D1 0064 /
  PG 0042) is reused. This is what TASK item 2 requires.
- Identity: `id` PK only. No business uniqueness rule and no lookup index is
  invented (TASK item 2 scopes this core slice to the stable id).
- Delete behavior: ON DELETE CASCADE on the Project FK and on the composite
  ContentVersion FK — deleting a content package version or a whole Project
  cascades its variants away, so an immutable variant can never dangle.
- Immutability: the row carries `created_at` only; no `updated_at`, no mutable
  version overwrite, no execution/approval/account/public-success state, no JSON
  asset/reference id array (TASK item 3; 09 spec §8; 21 plan §12).

## MIGRATION IDS

D1/SQLite `0067_old_silhouette` and PostgreSQL `0045_flawless_argent` (added in
round 1, unchanged in round 2):

- `drizzle/0067_old_silhouette.sql` (+ `drizzle/meta/0067_snapshot.json`,
  `drizzle/meta/_journal.json` idx 67). Generated with the Project FK and the
  same-Project composite ContentVersion FK; no index statement is present because
  the composite parent target already exists from 0064. Applied successfully by
  the local D1 migration.
- `drizzle-pg/0045_flawless_argent.sql` (+ `drizzle-pg/meta/0045_snapshot.json`,
  `drizzle-pg/meta/_journal.json` idx 45). Adds the child table and the two FK
  constraints; no manual edit was required because the referenced unique index
  `content_package_versions_project_id_id_idx` already exists from PG 0042.

Accepted migrations (SQLite ≤ 0066, PG ≤ 0044) were NOT edited. Round 2 clean
dual-dialect `db:generate` re-run reports `No schema changes, nothing to
migrate 😴` on both dialects (58 tables each; `content_variants` = 11 columns /
0 secondary indexes / 2 fks on each).

## FILES CHANGED

Round 2 changed exactly one file (tracked/untracked state unchanged from round 1):

- `src/types/schemas/content-variant.ts` — line 3 import changed to type-only
  (`import type { contentVariants } ...`). **Only** change this round.

Round 1 change set (retained, unchanged this round):

Modified (tracked):

- `src/db/search-growth.schema.ts` — header `max-lines` eslint-disable updated;
  appended the `contentVariants` sqliteTable with the reconciliation / same-Project
  / no-business-uniqueness / immutability comment block.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror.
- `src/db/schema.ts` — barrel export adds `contentVariants`.
- `drizzle/meta/_journal.json`, `drizzle-pg/meta/_journal.json` — generate entries.

Added (untracked):

- `drizzle/0067_old_silhouette.sql`, `drizzle/meta/0067_snapshot.json`.
- `drizzle-pg/0045_flawless_argent.sql`, `drizzle-pg/meta/0045_snapshot.json`.
- `src/db/content-variant.test.ts` — migration-backed storage spec (10 tests).
- `src/types/schemas/content-variant.ts` — Zod/domain boundary.
- `src/types/schemas/content-variant.test.ts` — domain validation tests (3 tests).

Task-channel file for this round: `DELIVERY.md` (this document). `REVIEW.md` was
read and not modified.

## DATABASE/MIGRATION CHANGES

- New `content_variants` table on both dialects (11 columns / 0 secondary
  indexes / 2 fks each): D1 0067 and PG 0045.
- NO index is added to `content_package_versions` — its accepted
  `content_package_versions_project_id_id_idx` composite-FK target is reused.
  `content_package_versions` stays 11 columns / 2 indexes / 2 fks on each dialect
  (confirmed by the `db:generate` table report in this round).
- Snapshots and journals were already written in round 1; the round 2
  `db:generate` reported no changes (58 tables on each dialect) and rewrote
  nothing new.

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install
used the existing lockfile and reported "Already up to date").

## TESTS ADDED

Round 2 added no tests (the fix is a type-only import; no behavior changed). Round
1 tests retained:

- `src/db/content-variant.test.ts` — 10 migration-backed storage tests that build
  a real in-memory SQLite client, enable `PRAGMA foreign_keys = ON`, hand-create
  `projects`, and apply the actual shipped forward-migration DDL in order
  (`0045` → `0046` → `0049` → `0055` → `0056` → `0057` → `0062` → `0063` → `0064`
  → `0067`, split on `--> statement-breakpoint`). Covers valid same-Project
  persistence with the full TASK field set + `created_at` default; several
  variants per ContentVersion (no business uniqueness beyond the stable id);
  cross-Project ContentVersion rejection in BOTH directions; dangling
  ContentVersion/Project FK rejection; NOT NULL rejection of each required direct
  column; ContentVersion-delete cascade; whole-Project delete cascade; and the
  exact immutable column-shape assertion (11 direct columns only — no
  `updated_at`, no execution/approval/account/public-success column, no
  asset/reference id container).
- `src/types/schemas/content-variant.test.ts` — 3 focused domain-boundary tests:
  the full direct contract round-trips verbatim and the opaque `metadata_json` is
  never decomposed; a row missing any one required direct field is rejected; and
  the exported `ContentVariant` row type matches the direct storage shape (no
  `updatedAt`, no `assetRefs`).
- Dialect parity: the new table is auto-picked-up by the existing
  `src/db/schema-parity.test.ts` (299 tests) which structurally compares every
  SQLite and PG table and confirms no index was added to any parent.

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no commit/merge/push). All
exited 0 this round.

1. `corepack pnpm install --frozen-lockfile` → exit 0 ("Already up to date";
   ignored-build-scripts warning only).
2. `corepack pnpm lint` → exit 0 — "Found 0 warnings and 0 errors." (the Round 1
   blocker no longer reproduces).
3. `corepack pnpm types:check` → exit 0 (`tsc --noEmit`, no output).
4. `corepack pnpm format:check` → exit 0 — "All matched files use Prettier code
   style!".
5. `corepack pnpm exec vitest run src/db/content-variant.test.ts
   src/types/schemas/content-variant.test.ts src/db/schema-parity.test.ts` →
   exit 0 — 3 files / 312 tests passed.
6. `corepack pnpm run db:generate` (dual-dialect, clean final run) → exit 0 —
   D1 then PG each print 58 tables and `No schema changes, nothing to migrate 😴`.
7. `corepack pnpm run db:migrate:local` → exit 0 — `✅ No migrations to apply!`
   (journal complete and idempotent; 0067 already applied in round 1).
8. `corepack pnpm test` (full suite, default parallelism) → exit 0 — 176 files /
   1595 tests passed (111.42s).
9. `corepack pnpm build` → exit 0 — client + SSR + open_seo_audit builds all
   succeeded; `tsc --noEmit` followed with no output.
10. `corepack pnpm ci:check` → exit 0 — prettier clean, knip clean, both
    `tsc --noEmit` runs clean, oxlint clean, plugin-skills sync clean, and
    `check-plugin-skills-sync.mjs` clean.
11. Read-only Git inspection (`git status --short`, `git diff --check`,
    `git diff --stat`) → exit 0 — `git diff --check` clean (no output).

## COMMAND RESULTS

**All required gates exit 0 on the final tree.** Frozen install exit 0;
dual-dialect `db:generate` clean final run exit 0 (58 tables each, no changes);
`db:migrate:local` exit 0 (`✅ No migrations to apply!`); `lint` exit 0 (0
warnings / 0 errors); `types:check` exit 0; `format:check` exit 0; focused Vitest
**3 files / 312 tests** exit 0; full Vitest **176 files / 1595 tests** exit 0 at
default parallelism; `build` exit 0 (vite client + SSR + audit worker, then
`tsc --noEmit`); `ci:check` exit 0 (prettier + knip + tsc ×2 + oxlint +
sync-plugin-skills + skill-sync check); read-only Git clean.

The Round 1 report that the whole-repo aggregate gates were sandbox-auto-denied
did **not** reproduce in this round. `format:check`, `types:check`, `lint`,
`build` and `ci:check` all ran to completion with exit 0. No environment block
remains and no `BLOCKED_BY_TEST_ENVIRONMENT` status is claimed.

## RUNTIME EVIDENCE

- `lint`: "Found 0 warnings and 0 errors. Finished in 21.1s on 894 files" —
  directly shows the Round 1 `consistent-type-imports` blocker is resolved.
- `ci:check`: full chain (`prettier --check . && knip && tsc --noEmit && tsc
  --noEmit -p badseo/tsconfig.json && oxlint . --type-aware && pnpm
  sync-plugin-skills && node scripts/check-plugin-skills-sync.mjs`) completed,
  final line `plugin skill sync clean: plugins/openseo/skills`.
- `build`: `✓ built in 27.10s` (client), `✓ built in 35.15s` (SSR), `✓ built in
  3.68s` (open_seo_audit), then `tsc --noEmit` with no diagnostics.
- Full suite: `Test Files 176 passed (176)`, `Tests 1595 passed (1595)`, exit 0.
  The new storage spec (10), domain spec (3) and parity suite (299) all pass
  inside it.
- `db:generate`: both dialects print 58 tables, `content_variants ... 11 columns
  0 indexes 2 fks`, and `No schema changes, nothing to migrate 😴` — schema and
  snapshots agree with no drift; the reused parent `content_package_versions` is
  unchanged (11 columns / 2 indexes / 2 fks).
- `db:migrate:local`: `✅ No migrations to apply!`.
- Git: `git status --short` shows the exact intended file set; `git diff --check`
  clean; `git diff --stat` (tracked) 5 files, +205/−2.

## KNOWN LIMITATIONS

- None required by this round. All TASK item 5 gates ran and exited 0 in this
  executor session, so the Round 1 `BLOCKED_BY_TEST_ENVIRONMENT` limitation is
  cleared. The only non-fatal output was pnpm's ignored-build-scripts warning
  during install and vite's chunk-size warnings during build; neither affects
  exit status or this task's scope.
- Scope-shape notes (by design, not defects): the table and boundary are
  schema/contract only — no platform-account/connector choice, target routing,
  asset mapping, tag/category normalization, renderer runtime, HTML conversion,
  release/approval/publishing behavior, or CRUD/UI; `platform`/`format`/
  `metadata_json` are opaque; `body_hash`/`renderer_version` are opaque
  non-interpreted provenance; there is no `updated_at`; and `id` is the only
  index/identity (no business uniqueness, no lookup index).

## DEVIATIONS FROM TASK

Round 2 deviates from nothing: it changes only the type-only import identified in
REVIEW.md, exactly as the bounded round authorized. No schema, migration,
snapshot, journal, test, or business behavior change was made, and no files
outside the task scope were touched.

Round 1 scope/field set, ownership rule, delete behavior, index set and migration
IDs are all retained unchanged: D1 `0067` and PostgreSQL `0045` with forward
snapshots + journals; same-Project ownership enforced by the Project-leading
composite FK `(project_id, content_package_version_id) ->
content_package_versions(project_id, id)`; the composite-FK target is the
accepted `content_package_versions_project_id_id_idx` reused with NO new parent
index; ON DELETE CASCADE on both FKs; `id` the only identity with no business
uniqueness rule; and no `updated_at`, mutable version-overwrite / execution /
approval / account / publishing / public-success column, or JSON asset/reference
id container.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state and in-memory SQLite built from
  the shipped forward-migration DDL.
- No network/provider/publishing action occurred. No platform account/connector,
  credential, target routing or renderer action occurred. No commit, merge, or
  push was performed. No `main` branch was touched.
- TASK-approved command names only. No `--dangerously-skip-permissions`, no
  bypass, no retry-after-denial (no denial occurred this round).
- No execution/approval/account/public-success state, release/publishing
  behavior, asset mapping or CRUD/UI was added (out of scope); the slice adds
  persistence/contract surface only. The variant row is immutable (`created_at`
  only) and no content leaves the project in this slice.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T122-M1-CONTENT-VARIANT-CORE-SCHEMA`; working tree is NOT
  committed (rounds stop at delivery). Head: `eae4d56 control: dispatch T122
  content variant core`.
- Modified tracked files (5, unchanged from round 1): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json`,
  `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
  `src/db/schema.ts`.
- Added (untracked) files (7): `drizzle/0067_old_silhouette.sql`,
  `drizzle/meta/0067_snapshot.json`, `drizzle-pg/0045_flawless_argent.sql`,
  `drizzle-pg/meta/0045_snapshot.json`, `src/db/content-variant.test.ts`,
  `src/types/schemas/content-variant.ts`,
  `src/types/schemas/content-variant.test.ts`.
- Task-channel files: `DELIVERY.md` (this document, rewritten for round 2) and
  `REVIEW.md` (pre-existing, read only, NOT modified).
- `git diff --stat` (tracked): 5 files, +205/−2. `git diff --check` clean. The
  round 2 type-only import edit lives in the untracked
  `src/types/schemas/content-variant.ts`, so the tracked diff is unchanged.
- No other files are dirty or untracked.

## READY FOR REVIEW

Implementation round 2 fixes the single Round 1 blocker — the task-local
type-only import in `src/types/schemas/content-variant.ts` — and produces the
gate evidence the reviewer requested. Every required gate ran to completion in
this session and exited 0: frozen install, dual-dialect clean `db:generate`,
local D1 migration (idempotent), `lint` (0 warnings / 0 errors), `types:check`,
`format:check`, focused Vitest (3 files / 312 tests), full Vitest (176 files /
1595 tests), `build`, `ci:check`, and read-only Git inspection (`git diff
--check` clean). The immutable, Project-scoped, platform-native `content_variants`
table ships on both dialects with forward migrations 0067/0045, snapshots,
journals, database-enforced same-Project ownership via the Project-leading
composite FK to `content_package_versions` (reusing the accepted
`content_package_versions_project_id_id_idx` with no new parent index), ON DELETE
CASCADE, `id` as the only identity (no business uniqueness, no extra index), an
append-only `created_at` only, plus the matching `ContentVariant`/
`contentVariantSchema` domain boundary. No `PASS` verdict is written by the
implementation round.
