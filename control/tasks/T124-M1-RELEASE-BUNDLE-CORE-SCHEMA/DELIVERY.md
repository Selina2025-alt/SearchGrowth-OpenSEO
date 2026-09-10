# DELIVERY — T124-M1-RELEASE-BUNDLE-CORE-SCHEMA (round 1)

## STATUS

`READY_FOR_REVIEW` — implementation round 1 of 3. No `REVIEW.md` existed at round
start, so there were no review findings to address. Every required TASK item 5
gate ran to completion in this executor session and exited 0: frozen install,
dual-dialect `db:generate` (generation + clean re-run), local D1 migration,
focused Vitest, `format:check`, `types:check`, `lint`, full Vitest, `build`, and
`ci:check`; read-only Git inspection is clean. No `PASS` verdict is written by
the implementation round.

## TASK ID

`T124-M1-RELEASE-BUNDLE-CORE-SCHEMA` — implementation round 1. No `REVIEW.md`
existed at round start.

## IMPLEMENTATION SUMMARY

Adds the immutable, Project-scoped `ReleaseBundle` core persistence contract
across both dialects (D1/SQLite + PostgreSQL), plus its matching Zod/domain
boundary and migration-backed/enum/identity/cascade tests. A ReleaseBundle is the
ONE frozen business approval unit (05_DOMAIN_DATA_MODEL.md §12 "ReleaseBundle —
Immutable approval unit"; 10_DISTRIBUTION_ARCHITECTURE.md §6 One Approval;
docs/adr/ADR-008-releasebundle-approval.md; 21_TEST_ACCEPTANCE_PLAN.md §12 Release
Immutability; 18_WORKFLOW_STATE_MACHINES.md §1 Release). This slice is
schema/contract + domain-boundary ONLY: it implements no state transition/CAS, no
approval action, no dry-run execution, no target/connector/account logic, no
publishing and no paid action (TASK item 4).

Storage contract shipped (`release_bundles`, both dialects, 12 columns / 1 index /
2 fks):

- stable text `id` (PK), explicit NOT NULL `project_id` (FK → `projects(id)` ON
  DELETE CASCADE), required `content_package_version_id` (the frozen
  ContentVersion), required `release_version` (immutable release number), required
  `status` (release lifecycle union), required `release_strategy` (source-defined
  strategy union), required opaque `utm_policy_json`, required opaque
  `bundle_hash`, nullable opaque `dry_run_report_json`, nullable
  `approved_by`/`approved_at`, and the append-only `created_at` timestamp only.
- Same-Project ContentVersion ownership is database-enforced by the
  Project-leading composite FK
  `(project_id, content_package_version_id) -> content_package_versions(project_id, id)`
  ON DELETE CASCADE, reusing the accepted
  `content_package_versions_project_id_id_idx` (T119, D1 0064 / PG 0042). No
  parent index is added.
- Release identity: unique `(content_package_version_id, release_version)` — the
  only business uniqueness rule, rejecting a duplicate release version within a
  ContentVersion (R1/R2 ...) while allowing many release versions per version.
- Enum enforcement: named DB CHECKs `release_bundles_status_valid` (9 lifecycle
  values) and `release_bundles_release_strategy_valid` (3 strategy values), plus
  the matching Zod enums at the runtime edge.
- Matching Zod/domain boundary `src/types/schemas/release-bundle.ts`:
  `ReleaseBundle` (`InferSelectModel`) and `releaseBundleSchema` (Zod object
  mirroring the 12 direct fields).

## FIELD RECONCILIATION

Sources: the TASK item 1 field list (authoritative), `05_DOMAIN_DATA_MODEL.md`
§12, `10_DISTRIBUTION_ARCHITECTURE.md`, `18_WORKFLOW_STATE_MACHINES.md` §1,
`21_TEST_ACCEPTANCE_PLAN.md` §12, `20_DATABASE_SCHEMA_GUIDE.md` §§3–4,
`29_SCOPE_LOCK.md`, `30_TRACEABILITY_MATRIX.md` ("批准锁死 | ReleaseBundle |
immutable"), `docs/adr/ADR-008-releasebundle-approval.md`, the accepted
T118–T123 same-Project patterns, and the legacy reference artifacts
`schemas/domain-types.ts` `ReleaseBundle` / `schemas/migrations-reference.sql`
`release_bundles`. Reference artifacts are read-only and were NOT edited.

| ReleaseBundle aspect | Source | Decision |
| --- | --- | --- |
| `id` | stable id | Stable text PK (established convention). |
| `project_id` | non-null Project ownership | NOT NULL FK → projects(id) ON DELETE CASCADE. |
| `content_package_version_id` | non-null ContentVersion ownership | NOT NULL text id; same-Project composite FK `(project_id, content_package_version_id) -> content_package_versions(project_id, id)` ON DELETE CASCADE (parent target `content_package_versions_project_id_id_idx` from 0064/0042 reused). |
| `release_version` | immutable release version | NOT NULL integer; the release identity `(content_package_version_id, release_version)` is unique (R1/R2 ...; 21 §12). |
| `status` | lifecycle status | NOT NULL text enum + named CHECK, exactly DRAFT / DRY_RUN_READY / READY_FOR_APPROVAL / APPROVED / EXECUTING / COMPLETED / PARTIAL / PAUSED / CANCELLED (18 §1; domain-types.ts). Value recorded only — no transition/CAS implemented (TASK item 4). |
| `release_strategy` | release strategy | NOT NULL text enum + named CHECK, exactly WEBSITE_FIRST / PARALLEL / SOCIAL_ONLY (domain-types.ts; 10 §5). Property named `releaseStrategy`, column `release_strategy`. |
| `utm_policy_json` | opaque UTM policy | NOT NULL opaque JSON document frozen with the bundle (ADR-008; 21 §12 changing UTM requires a new release); stored verbatim, never a relational model. |
| `bundle_hash` | bundle hash | NOT NULL opaque frozen-bundle hash stored verbatim (ADR-008; 21 §12 "Approve hash H1"); plain non-unique column, no dedup rule. |
| `dry_run_report_json` | dry-run report where required | Nullable opaque JSON document; NULL = no report attached yet (the dry-run step itself is out of scope). |
| `approved_by`, `approved_at` | approval fields | Nullable text; NULL = not approved. Recording them does NOT implement an approval action (TASK item 4). |
| `created_at` | creation timestamp | NOT NULL text timestamp with DB default; the ONLY audit column. |
| `updated_at` | legacy `migrations-reference.sql` column | Reconciled OUT — the TASK field list names the creation timestamp only and this slice implements no state transition/CAS (TASK item 4); a change to any frozen item creates a new `release_version` (ADR-008; 21 §12). Matches the accepted immutable ContentVersion/ContentVariant row shape. |
| ReleaseTarget / PublicationExecutionPlan / PlatformDraft / PublishingJob / PublicationReceipt / connector-account state | separate tasks (TASK item 4, 20 §1) | Reconciled OUT — no target/execution/job/receipt/publishing column exists on this row. |
| `strategy` (legacy property name) | domain-types.ts ReleaseBundle.strategy | Shipped as `release_strategy`/`releaseStrategy` for storage clarity; same source-defined union. |

## RELATION / FK / IDENTITY / ENUM / DELETE / IMMUTABILITY DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project integrity: the Project-leading composite FK
  `(project_id, content_package_version_id) -> content_package_versions(project_id, id)`
  ON DELETE CASCADE (the accepted T114/T118/T121/T122 same-Project pattern). A
  bundle whose ContentVersion belongs to a different Project has no matching parent
  row in EITHER direction and is rejected by the DB; a dangling ContentVersion or
  Project is likewise rejected.
- Reused parent target only: no index is added to `content_package_versions` — its
  accepted `content_package_versions_project_id_id_idx` (T119, D1 0064 / PG 0042)
  is reused, exactly as TASK item 2 requires. No supporting parent target is added
  to `release_bundles` because no child table exists in this slice.
- Identity: unique `(content_package_version_id, release_version)` only. Its
  leading `content_package_version_id` also serves the ContentVersion →
  release-bundles read path. No other uniqueness rule and no extra lookup index is
  invented; in particular no `id` uniqueness beyond the PK.
- Enums: DB-level CHECK rejection for both source-defined unions (migration-backed
  enum tests), with the same lists narrowed by the Zod boundary.
- Delete behavior: ON DELETE CASCADE on the Project FK and the composite
  ContentVersion FK — deleting a ContentVersion or a whole Project cascades its
  bundles away, so a bundle can never dangle.
- Immutability boundary: the row carries `created_at` only; no `updated_at`, no
  state-transition/CAS/approval-action/execution/target/publishing/paid behavior
  (TASK item 4). `utm_policy_json` and `dry_run_report_json` are opaque documents,
  never relational id containers.

## MIGRATION IDS

- D1/SQLite `0069_clumsy_legion`: `drizzle/0069_clumsy_legion.sql`,
  `drizzle/meta/0069_snapshot.json`, `drizzle/meta/_journal.json` (idx 69).
  Generated with the Project FK, the same-Project composite ContentVersion FK, the
  release-identity unique index and both enum CHECKs; no index statement against a
  parent (the composite target already exists from 0064).
- PostgreSQL `0047_dry_solo`: `drizzle-pg/0047_dry_solo.sql`,
  `drizzle-pg/meta/0047_snapshot.json`, `drizzle-pg/meta/_journal.json` (idx 47).
  Adds the table, both enum CHECKs, the two FK constraints and the release-identity
  index; no manual edit was required because the referenced unique index
  `content_package_versions_project_id_id_idx` already exists from PG 0042.
- Accepted migrations (SQLite ≤ 0068, PG ≤ 0046) were NOT edited. A clean
  dual-dialect `db:generate` re-run reports `No schema changes, nothing to
  migrate 😴` on both dialects (60 tables each; `release_bundles` = 12 columns /
  1 index / 2 fks on each).

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — header `max-lines` eslint-disable updated;
  appended the `releaseBundles` sqliteTable with the reconciliation / same-Project
  / identity / enum / immutability comment block.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror.
- `src/db/schema.ts` — provider-aware barrel destructure adds `releaseBundles`.
- `drizzle/meta/_journal.json`, `drizzle-pg/meta/_journal.json` — generate entries.

Added (untracked):

- `drizzle/0069_clumsy_legion.sql`, `drizzle/meta/0069_snapshot.json`.
- `drizzle-pg/0047_dry_solo.sql`, `drizzle-pg/meta/0047_snapshot.json`.
- `src/db/release-bundle.test.ts` — migration-backed storage spec (14 tests).
- `src/types/schemas/release-bundle.ts` — Zod/domain boundary.
- `src/types/schemas/release-bundle.test.ts` — focused domain tests (7 tests).

Task-channel file: `DELIVERY.md` (this document). No `REVIEW.md` existed and none
was created or edited.

## DATABASE/MIGRATION CHANGES

- New `release_bundles` table on both dialects (12 columns / 1 secondary index /
  2 fks each): D1 0069 and PG 0047, with snapshots + journals.
- NO index is added to `content_package_versions` — its accepted
  `content_package_versions_project_id_id_idx` composite-FK target is reused.
  `content_package_versions` stays 11 columns / 2 indexes / 2 fks on each dialect;
  `release_bundles` is the only new table (60 tables total on each dialect, up
  from 59).
- Local D1 migration applied all forward migrations through `0069_clumsy_legion`
  successfully.

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install used
the existing lockfile).

## TESTS ADDED

- `src/db/release-bundle.test.ts` — 14 migration-backed storage tests that build a
  real in-memory SQLite client, enable `PRAGMA foreign_keys = ON`, hand-create
  `projects`, and apply the actual shipped forward-migration DDL in order
  (`0045` → `0046` → `0049` → `0055` → `0056` → `0057` → `0062` → `0063` → `0064`
  → `0069`, split on `--> statement-breakpoint`). Covers: valid same-Project
  persistence with the full required field set + NULL optional fields + append-only
  `created_at`; optional dry-run report and approval fields persisted verbatim;
  all 9 lifecycle statuses accepted; all 3 strategies accepted; status outside the
  union rejected; strategy outside the union rejected; cross-Project ContentVersion
  rejection; dangling ContentVersion/Project rejection; R1/R2 allowed but duplicate
  release identity rejected; NOT NULL rejection of every required direct column;
  ContentVersion-delete cascade; whole-Project delete cascade; and the exact
  12-column storage shape (no `updated_at`, no target/execution/job/receipt/
  publishing column).
- `src/types/schemas/release-bundle.test.ts` — 7 focused domain tests: full
  contract round-trips verbatim and `utmPolicyJson` is never decomposed; approved
  bundle with optional fields; every status and strategy accepted; out-of-union
  status/strategy rejected; missing required field rejected; non-integer release
  version rejected; exported `ReleaseBundle` row type has no `updatedAt`/target.
- Dialect parity: the new table is auto-covered by the existing
  `src/db/schema-parity.test.ts` (309 tests) which structurally compares every
  SQLite and PG table.

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...` (no
bare `pnpm`, no `--dangerously-skip-permissions`, no commit/merge/push). All exits
are exact.

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm run db:generate` (initial generation)
3. `corepack pnpm run db:migrate:local`
4. `corepack pnpm run db:generate` (clean re-run)
5. `corepack pnpm exec prettier --write <task files>`
6. `corepack pnpm types:check`
7. `corepack pnpm format:check`
8. `corepack pnpm lint`
9. `corepack pnpm exec vitest run src/db/release-bundle.test.ts src/types/schemas/release-bundle.test.ts src/db/schema-parity.test.ts`
10. `corepack pnpm test`
11. `corepack pnpm build`
12. `corepack pnpm ci:check`
13. Read-only Git inspection (`git status --short`, `git diff --check`, `git diff --stat`)

## COMMAND RESULTS

**All required gates exit 0 on the final tree.**

1. Frozen install → exit 0 — 980 packages, "Done in 43.3s"; only pnpm's
   ignored-build-scripts warning.
2. Initial `db:generate` → exit 0 — wrote `drizzle/0069_clumsy_legion.sql` and
   `drizzle-pg/0047_dry_solo.sql`; 60 tables each; `release_bundles 12 columns 1
   indexes 2 fks`.
3. `db:migrate:local` → exit 0 — applied the full local D1 chain including
   `0069_clumsy_legion`.
4. Clean re-run `db:generate` → exit 0 — both dialects print `No schema changes,
   nothing to migrate 😴`.
5. Task-file Prettier → exit 0.
6. `types:check` (`tsc --noEmit`) → exit 0, no diagnostics.
7. `format:check` → exit 0 — "All matched files use Prettier code style!".
8. `lint` (`oxlint . --type-aware`) → **intermediate exit 1** on the first run:
   one `eslint(max-params)` error (test helper `insertBundle` had 6 parameters).
   Fixed by refactoring the helper to a single object parameter (no production
   behavior change), then re-ran `lint` → exit 0 — "Found 0 warnings and 0 errors."
9. Focused Vitest → exit 0 — 3 files / 330 tests passed (new storage 14, new
   domain 7, parity 309).
10. Full `test` → exit 0 — 179 files / 1638 tests passed.
11. `build` → exit 0 — vite client + SSR + open_seo_audit builds all succeeded;
    `tsc --noEmit` followed with no output.
12. `ci:check` → exit 0 — prettier clean, knip clean, both `tsc --noEmit` runs
    clean, oxlint clean, plugin-skills sync clean.
13. Read-only Git → exit 0 — `git diff --check` clean (no output).

## RUNTIME EVIDENCE

- `db:generate` (both dialects): 60 tables, `release_bundles 12 columns 1 indexes
  2 fks`, and `No schema changes, nothing to migrate 😴` after the clean re-run —
  schema and snapshots agree with no drift. `content_package_versions` is
  unchanged (11 columns / 2 indexes / 2 fks).
- `db:migrate:local`: the table shows `0069_clumsy_legion.sql ✅`, exit 0.
- Full suite: `Test Files 179 passed (179)`, `Tests 1638 passed (1638)`; the new
  storage (14), domain (7) and parity (309) suites all pass inside it.
- `lint`: "Found 0 warnings and 0 errors. Finished in 19.9s on 898 files".
- `build`: `✓ built in 20.42s` (client), `✓ built in 25.99s` (SSR), `✓ built in
  3.23s` (open_seo_audit), then `tsc --noEmit` with no diagnostics.
- `ci:check`: full chain completed, final line
  `plugin skill sync clean: plugins/openseo/skills`.
- Git: `git status --short` shows exactly the intended file set;
  `git diff --check` clean; `git diff --stat` (tracked) 5 files, +318/−2.

## KNOWN LIMITATIONS

- None blocking. Every TASK item 5 gate ran and exited 0 in this session; no
  `BLOCKED_BY_TEST_ENVIRONMENT` status is claimed.
- The only non-fatal output was pnpm's ignored-build-scripts warning during
  install and vite's chunk-size warnings during build; neither affects exit status
  or this task's scope.
- Scope-shape notes (by design, not defects): the table and boundary are
  schema/contract only — no state transition/CAS, approval action, dry-run
  execution, target/connector/account logic, publishing, paid action, UI, or
  production behavior; `utm_policy_json`/`dry_run_report_json`/`bundle_hash` are
  opaque; there is no `updated_at`; and the release identity is the only
  uniqueness/index (no extra lookup index).

## DEVIATIONS FROM TASK

None. The only in-round correction was a lint-driven refactor of the new test
helper (`insertBundle` from 6 positional parameters to one object parameter) —
test-only, no production/schema/behavior change.

Reconciliation judgment calls (documented above, all source-grounded):
`updated_at` is reconciled out per the TASK field list ("creation timestamp") and
item 4 (no state transition/CAS); the legacy `strategy` property ships as
`releaseStrategy`/`release_strategy`; `dry_run_report_json` is nullable (the
dry-run step is out of scope); the release identity uniqueness
`(content_package_version_id, release_version)` is taken from the 21 §12 R1/R2
release-version model and mirrors the accepted `content_package_versions` identity
pattern.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state and in-memory SQLite built from the
  shipped forward-migration DDL.
- No network/provider/publishing/connector action occurred. No capture bypass, no
  stealth behavior, no cookies, no paid action. No commit, merge, or push was
  performed. No `main` branch was touched.
- TASK-approved command names only. No `--dangerously-skip-permissions`, no
  bypass, and no retry-after-denial (no sandbox denial occurred; the single
  intermediate `lint` failure was a real lint finding, fixed in-scope).
- Scope declaration: this slice adds persistence/contract surface only — it does
  not approve, execute, publish, spend, contact an external system, or implement
  any state transition. A row is never a publish instruction, execution result,
  approval action or public-success proof.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T124-M1-RELEASE-BUNDLE-CORE-SCHEMA`; working tree is NOT
  committed (the round stops at delivery). Head: `3afb5b2 control: dispatch T124
  release bundle core`.
- Modified tracked files (5): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json`, `src/db/search-growth.schema.ts`,
  `src/db/pg/search-growth.schema.ts`, `src/db/schema.ts`.
- Added untracked files (7): `drizzle/0069_clumsy_legion.sql`,
  `drizzle/meta/0069_snapshot.json`, `drizzle-pg/0047_dry_solo.sql`,
  `drizzle-pg/meta/0047_snapshot.json`, `src/db/release-bundle.test.ts`,
  `src/types/schemas/release-bundle.ts`,
  `src/types/schemas/release-bundle.test.ts`.
- Task-channel file: `DELIVERY.md` (this document).
- `git diff --stat` (tracked): 5 files, +318/−2. `git diff --check` clean. No
  other files are dirty or untracked (plugin-skill sync left no diff).

## READY FOR REVIEW

The immutable, Project-scoped ReleaseBundle core persistence contract ships on
both dialects with forward migrations 0069/0047, snapshots, journals,
database-enforced same-Project ownership via the Project-leading composite FK to
`content_package_versions` (reusing the accepted
`content_package_versions_project_id_id_idx` with no new parent index), ON DELETE
CASCADE, the source-defined status/strategy CHECK enums, the release identity
`(content_package_version_id, release_version)`, an append-only `created_at` only,
plus the matching `ReleaseBundle`/`releaseBundleSchema` domain boundary and
migration-backed/domain tests. Every required gate exited 0 in this session. No
`PASS` verdict is written by the implementation round.
