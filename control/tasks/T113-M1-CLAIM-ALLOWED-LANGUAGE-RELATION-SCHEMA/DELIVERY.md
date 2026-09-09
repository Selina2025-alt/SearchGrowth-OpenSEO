# DELIVERY — T113-M1-CLAIM-ALLOWED-LANGUAGE-RELATION-SCHEMA (round 1)

## STATUS

`BLOCKED_BY_TEST_ENVIRONMENT` — the implementation itself is complete and
in-scope; every approved gate that the executor sandbox permits runs and exits 0
(local D1 migration, dual-dialect `db:generate`, focused Vitest, full Vitest,
task-file Prettier, read-only Git). The five whole-repo gates required by TASK
item 6 (`format:check`, `types:check`, `lint`, `build`, `ci:check`) are
auto-denied by this session's sandbox with no approval surface — no exit code
exists for any of them. This is the same environment block recorded across T111
rounds 1–3 and T112 rounds 1–2, and is reported honestly as an environment
limitation, not as passing and not as a scope/code deviation.

## TASK ID

`T113-M1-CLAIM-ALLOWED-LANGUAGE-RELATION-SCHEMA` — implementation round 1.

## IMPLEMENTATION SUMMARY

Added the normalized, Project-scoped Claim `allowed_languages[]` relation across
both dialects (D1/SQLite + PostgreSQL): a new `claim_allowed_languages` mapping
table that stores one row per explicit allowed language of a `claims` row. This
is a schema/contract slice only — it persists each allowed language and does NOT
implement policy evaluation, Claim verification, or a language-catalog subsystem.

Storage contract shipped:

- `claim_allowed_languages` (both dialects): stable text `id` (PK), explicit
  `project_id` (NOT NULL FK → `projects(id)` ON DELETE CASCADE), `claim_id`
  (NOT NULL), `language` (NOT NULL, opaque explicit tag), and an append-only
  relation timestamp `created_at` (DEFAULT `(current_timestamp)` / PG
  `to_char(now() AT TIME ZONE 'utc', ...)`). No `updated_at`, no payload
  columns, no catalog/format columns, and no JSON/text array —
  `allowed_languages[]` is one normalized row per allowed language, never an
  encoded list (TASK item 2).
- Same-Project integrity is database-enforced by the established composite-FK
  pattern: `(project_id, claim_id) → claims(project_id, id)` carries the link's
  own `project_id` as its leading column, so a link whose Claim belongs to a
  different Project is rejected by the DB (and a link whose own `project_id`
  names a different Project than its Claim is likewise rejected — there is no
  matching parent row in either direction). The referential parent key
  `claims_project_id_id_idx` already exists from the accepted 0057 migration,
  so no new parent key was needed.
- The only uniqueness rule is the duplicate-edge link identity: unique
  `(claim_id, language)` index
  `claim_allowed_languages_unique_claim_language_idx`. There is no
  catalog/format/policy payload and no other business uniqueness.
- Delete behavior: ON DELETE CASCADE on the Project FK and on the composite
  Claim FK, so deleting a Claim or a whole Project cascades its links away and a
  link can never dangle. (Language values are not parented rows, so there is no
  language-delete cascade.)
- A child-side reverse lookup index `claim_allowed_languages_language_idx`
  (`language`) is added on both dialects, following the accepted mapping-table
  convention (siblings `claim_source_refs`, `claim_allowed_market_profiles`) for
  the language → claims read path. The unique index's leading `claim_id` already
  serves the claim → allowed-languages read path.

## LANGUAGE-VALUE RECONCILIATION

Sources: `05_DOMAIN_DATA_MODEL.md` §9 Claim `allowed_languages[]` / §2/§5 direct
language-field conventions (`language_code`, `language`), the TASK field list,
the legacy `schemas/domain-types.ts` Claim interface (`allowedLanguages:
string[]`), and the accepted T111/T112 dual-dialect relation patterns. Reference
artifacts are read-only and were NOT edited.

| Language aspect | §9 / TASK (authoritative) | Decision |
| --- | --- | --- |
| `language` | explicit allowed-language value on the Claim | Shipped NOT NULL text column, one row per allowed language; stored verbatim as an opaque tag. |
| value format | existing V1.0 language fields | IETF-style tag text (`en`, `zh-CN`, `zh-Hant-TW`, `es-419`), no enum/format rule — consistent with `search_prompts.language`, `search_market_profiles.language_code`, `search_topics.locale`. |
| catalog/normalization | none authorized | No language-catalog table/FK, no locale inference, no case/region normalization, no unsupported new enum/format rule (TASK item 3). |
| `allowed_languages[]` | §9 list on Claim | Normalized: one relation row per allowed language (TASK item 2 forbids JSON/text list). |
| legacy inline `allowedLanguages` | reference artifact | Reconciled OUT of the Claim row; modeled as the normalized relation (never JSON/text on `claims`). |

## RELATION / FK / IDENTITY / DELETE DECISIONS

- Project FK: single-column NOT NULL FK to `projects(id)` ON DELETE CASCADE (the
  established Project-scoping FK every Search Growth row carries).
- Same-Project integrity: composite FK `(project_id, claim_id)` →
  `claims(project_id, id)`, with the link's own `project_id` as leading column —
  cross-Project links are rejected in BOTH directions by the database (a Claim
  on another Project has no matching parent row; a link row whose own
  `project_id` differs from its Claim's Project has no matching parent row).
- No new referential parent key was required (the claim parent already exposes
  the unique `(project_id, id)` index `claims_project_id_id_idx` from 0057).
- Identity uniqueness: unique `(claim_id, language)` — prevents duplicate
  Claim/language edges only. `claim_id` is a globally unique PK, so the pair is
  project-isolated once the same-Project FK holds (the accepted mapping-table
  pattern); no `project_id` is listed in the unique index.
- Delete behavior: cascade on both FKs (Claim delete and whole-Project delete
  both cascade the relation rows away). There is no separate language parent to
  delete against.
- Append-only by schema shape: `created_at` only, no `updated_at`, no payload.

## MIGRATION IDS

- D1/SQLite: `drizzle/0059_elite_deathbird.sql` (+
  `drizzle/meta/0059_snapshot.json`, `drizzle/meta/_journal.json` idx 59).
- PostgreSQL: `drizzle-pg/0037_bent_outlaw_kid.sql` (+
  `drizzle-pg/meta/0037_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 37).

Both forward migrations carry only the intended DDL (CREATE TABLE, Project FK +
same-Project composite FK, unique + lookup indexes). Accepted migrations (SQLite
≤ 0058, PG ≤ 0036) were NOT edited. Clean final dual-dialect `db:generate`
re-run reports `No schema changes, nothing to migrate 😴` on both dialects.

## FILES CHANGED

Modified (tracked):

- `src/db/search-growth.schema.ts` — added `claimAllowedLanguages` sqliteTable
  after `claimAllowedMarketProfiles` (end of file); header `max-lines`
  eslint-disable comment updated to include T113; claims-table header comment
  updated to note allowed_markets (T112) / allowed_languages (T113) are
  normalized relations, never JSON/text columns.
- `src/db/pg/search-growth.schema.ts` — identical PG `pgTable` mirror with
  `isoNow` default; header comment and claims-table comment updated the same
  way.
- `src/db/schema.ts` — destructured barrel export adds
  `claimAllowedLanguages`.
- `src/types/schemas/claim.ts` — import now
  `{ claimAllowedLanguages, claimAllowedMarketProfiles, claimSourceRefs, claims }`;
  added `export type ClaimAllowedLanguage = InferSelectModel<typeof
  claimAllowedLanguages>;`; comments updated so `allowed_languages[]` is
  documented as the normalized T113 relation (not deferred).
- `src/types/schemas/claim.test.ts` — added the `ClaimAllowedLanguage` import
  and a `languageLink` type-conformance block
  (`Pick<ClaimAllowedLanguage, "id" | "projectId" | "claimId" | "language" |
  "createdAt">`).
- `drizzle/meta/_journal.json` and `drizzle-pg/meta/_journal.json` —
  `db:generate` journal entries (idx 59 / idx 37).

Added (untracked):

- `drizzle/0059_elite_deathbird.sql` and `drizzle/meta/0059_snapshot.json`.
- `drizzle-pg/0037_bent_outlaw_kid.sql` and
  `drizzle-pg/meta/0037_snapshot.json`.
- `src/db/claim-allowed-language.test.ts` — the migration-backed spec.

Task-channel file for this round: `DELIVERY.md` (this document). No `REVIEW.md`
existed at round start (verified before implementation); none was created.

## DEPENDENCIES CHANGED

None. No `package.json`, lockfile, or tooling change was made (frozen install
used the existing lockfile).

## TESTS ADDED

- `src/db/claim-allowed-language.test.ts` — 11 migration-backed storage tests
  that build a real in-memory SQLite client, enable `PRAGMA foreign_keys = ON`,
  hand-create the `projects` table, and apply the actual shipped forward-migration
  DDL in order (0056 → 0057 → 0059, split on `--> statement-breakpoint`). The
  DDL is the source of truth, so the FKs, the unique edge guard and the cascades
  are exercised — not an application convention. Tests cover: valid same-Project
  link persistence with the full normalized relation field set; literal
  language-value persistence (`en`/`zh-CN`/`zh-Hant-TW`/`es-419` round-trip
  verbatim — no case/region normalization); one claim allowing multiple distinct
  same-Project languages (row-per-language, not a list); cross-Project Claim
  rejection in BOTH directions (claim on another Project; link's own project_id
  on another Project); dangling-Claim rejection; dangling-Project rejection;
  duplicate-edge rejection via the unique index; claim-delete cascade;
  whole-Project-delete cascade; normalized column-shape assertion
  (`["claim_id","created_at","id","language","project_id"]` — identity + opaque
  language tag + created_at only, no payload and no array column).
- `src/types/schemas/claim.test.ts` — extended the existing boundary spec with a
  `ClaimAllowedLanguage` row type-conformance assertion.
- Dialect parity: the new table is auto-picked-up by the existing
  `src/db/schema-parity.test.ts` (now 259 tests: +5 per-table assertions for the
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
4. `corepack pnpm run db:migrate:local` (pre-edit baseline) → exit 0 — applied
   0000 → 0058 to the local D1 state (fresh local state; every migration ✅).
5. `corepack pnpm run db:generate` (dual-dialect, first run) → exit 0 —
   produced `drizzle/0059_elite_deathbird.sql` and
   `drizzle-pg/0037_bent_outlaw_kid.sql` with snapshots + journal entries.
6. `corepack pnpm run db:migrate:local` (apply 0059) → exit 0 —
   `0059_elite_deathbird.sql` ✅ (4 commands executed successfully).
7. Task-file Prettier: `corepack pnpm exec prettier --write <6 changed source
   files>` → exit 0 (only `src/types/schemas/claim.ts` needed a wrap fix; the
   rest reported unchanged).
8. Focused Vitest (`corepack pnpm exec vitest run` with the 5 task-related
   files) → exit 0 — 5 files / 298 tests passed.
9. `corepack pnpm run db:generate` (dual-dialect, clean final run) → exit 0 —
   both dialects: 50 tables, `No schema changes, nothing to migrate 😴`;
   `claim_allowed_languages` = 5 columns / 2 indexes / 2 fks on both.
10. `corepack pnpm run db:migrate:local` (idempotency re-run) → exit 0 —
    `✅ No migrations to apply!`.
11. Full Vitest (`corepack pnpm exec vitest run`, default parallelism) → exit 1
    — 165 files passed / 1 file failed, 1451/1452 tests passed; the single
    failure was the documented Windows cold-import 30s `beforeEach` timeout in
    `src/server/mcp/oauth-refresh.e2e.test.ts` (unrelated to this task).
12. Isolation re-run of that file (`corepack pnpm exec vitest run
    src/server/mcp/oauth-refresh.e2e.test.ts`) → exit 0 — 8/8 tests passed.
13. Full Vitest (`corepack pnpm exec vitest run --maxWorkers=2`, load-bounded)
    → exit 0 — **166 files / 1452 tests passed**.
14. `corepack pnpm run format:check` → **sandbox auto-denied; no exit code**.
15. `corepack pnpm run types:check` → **sandbox auto-denied; no exit code**.
16. `corepack pnpm run lint` → **sandbox auto-denied; no exit code**.
17. `corepack pnpm run build` → **sandbox auto-denied; no exit code**.
18. `corepack pnpm run ci:check` → **sandbox auto-denied; no exit code**.
19. Underlying whole-repo binaries (`corepack pnpm exec prettier --check .`,
    `corepack pnpm exec tsc --noEmit`, `corepack pnpm exec oxlint .
    --type-aware`) → each **sandbox auto-denied; no exit code**.
20. Read-only Git inspection (`git status --short`, `git diff --stat`,
    `git diff --check`) → exit 0 — `git diff --check` clean.

## COMMAND RESULTS

Passing on the final tree: frozen install exit 0; local D1 migration exit 0
(0059 applied, then idempotent `✅ No migrations to apply!`); clean final
dual-dialect `db:generate` exit 0 (`No schema changes, nothing to migrate 😴` on
both dialects); focused Vitest **5 files / 298 tests** exit 0; full Vitest
**166 files / 1452 tests** exit 0 (load-bounded re-run — see RUNTIME EVIDENCE
for the single default-parallelism timeout and its isolation pass); read-only
Git inspection clean (`git diff --check` clean).

Environment limitation (reported, not hidden): the sandbox auto-approval grant
list for this executor session does not include `format:check`, `types:check`,
`lint`, `build`, `ci:check` nor their whole-repo underlying binaries. Each exact
approved command (and each underlying binary) was attempted as a standalone
invocation and auto-denied with no approval surface to escalate to, so **no exit
code exists for any of the five gates in this session**. The denial message
instructs not to claim success and not to retry; each was attempted exactly once
and abandoned. This is the same environment block recorded for T111 rounds 1–3
and T112 rounds 1–2.

## RUNTIME EVIDENCE

- Full-suite Vitest (load-bounded `--maxWorkers=2`): `Test Files 166 passed
  (166)`, `Tests 1452 passed (1452)`, exit 0. The new spec's 11 tests and the
  extended parity suite (259) pass inside it. (1452 = prior accepted count 1436
  + 11 new language-spec tests + 5 parity assertions for the new table.)
- Default-parallelism full-suite run exited 1 on a single transient Windows
  cold-import timeout in `src/server/mcp/oauth-refresh.e2e.test.ts` (30s
  `beforeEach` hook; the file's own comment documents Windows cold-import can
  exceed deadlines). That file passes **8/8 in isolation** (exit 0). No task
  file was changed in response.
- `db:migrate:local`: 0059 applied successfully (✅), re-run reports
  `✅ No migrations to apply!`, exit 0 (journal complete and idempotent).
- `db:generate` final: D1 then PG each print 50 tables and
  `No schema changes, nothing to migrate 😴`, exit 0 — confirms both dialects'
  schemas exactly match their snapshots with no drift.
- Read-only Git inspection: `git diff --check` clean; file set below is exactly
  the intended change set.
- Five full-repo gates: no exit codes (sandbox auto-denied) — see COMMAND
  RESULTS / KNOWN LIMITATIONS.

## KNOWN LIMITATIONS

- The `format:check` / `types:check` / `lint` / `build` / `ci:check` gates
  remain non-executable in this executor session: the sandbox auto-denies each
  exact command (and each whole-repo underlying binary) with no approval
  surface, so no exit code exists for any of the five (TASK item 6's "every gate
  must exit 0" therefore cannot be fully evidenced here). This is the same
  environment block recorded across T111 rounds 1–3 and T112 rounds 1–2 and is
  reported as `BLOCKED_BY_TEST_ENVIRONMENT` — a test-environment limitation, not
  a scope or code deviation. The runnable matrix (frozen install, local
  migration, dual-dialect `db:generate`, focused and full Vitest, task-file
  Prettier, read-only Git) all pass. A grant-enabled session, the controller/QA
  under the Product Owner's bounded acceptance-verification exception (the T111
  unblock path), or a human gate must produce the five exit codes before final
  acceptance.
- Full-suite timing note: at default Vitest parallelism this shared Windows box
  intermittently trips the documented 30s cold-import deadline in the unrelated
  `oauth-refresh.e2e.test.ts`; the identical suite passes cleanly at
  `--maxWorkers=2` (166 files / 1452 tests) and the file passes in isolation.
  This is environmental, not a task regression.
- Scope-shape notes (by design, not defects): the relation is schema/contract
  only — no language catalog/validation service, locale inference/normalization,
  policy evaluation or Claim verification exists yet; `language` is stored as an
  opaque explicit tag with no enum/format validation; `created_at` is
  DB-defaulted text (the established mapping-table convention); no CRUD/UI or
  provider code was added.

## DEVIATIONS FROM TASK

None in scope, field set, or migration IDs. The relation ships D1 `0059` and
PostgreSQL `0037` as required, the composite-FK same-Project guard is
DB-enforced, the only uniqueness is the duplicate Claim/language edge guard, and
the language value is preserved as an opaque tag. The only non-`0` outcome is
environmental: the five full-repo gates could not be granted by the sandbox in
this round (see KNOWN LIMITATIONS) — reported as an environment limitation, not
a scope deviation. The one clean full-suite command used `--maxWorkers=2` (same
suite, same tests, load-bounded) solely to compensate for transient machine
contention; no test was skipped or weakened.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state (`db:migrate:local`) and
  in-memory SQLite built from the shipped forward-migration DDL.
- No network/provider/publishing action occurred. No commit, merge, or push was
  performed. No `main` branch was touched.
- TASK-approved command names only; every denied invocation was abandoned
  without retry or bypass after the sandbox denial. The `--maxWorkers=2`
  full-suite run is the same TASK-approved full test suite with a load cap; it
  used no unlisted tooling and no permission bypass.
- No language-catalog/validation, policy-evaluation or Claim-verification
  behavior was added (out of scope); the slice adds persistence/contract surface
  only.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T113-M1-CLAIM-ALLOWED-LANGUAGE-RELATION-SCHEMA`; working tree
  is NOT committed (rounds stop at delivery). Recent commits on the branch:
  `12b68bc control: accept T112 and dispatch T113`, `d196cfc merge: accept T112
  claim allowed market relation`, `9881c67 feat(search-growth): add claim
  allowed market relation`.
- Modified tracked files (7): `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json` (db:generate journal entries);
  `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
  `src/db/schema.ts`; `src/types/schemas/claim.ts`,
  `src/types/schemas/claim.test.ts`.
- Added (untracked) files (5): `drizzle/0059_elite_deathbird.sql`,
  `drizzle/meta/0059_snapshot.json`, `drizzle-pg/0037_bent_outlaw_kid.sql`,
  `drizzle-pg/meta/0037_snapshot.json`,
  `src/db/claim-allowed-language.test.ts`.
- Task-channel file: `control/tasks/T113-M1-CLAIM-ALLOWED-LANGUAGE-RELATION-SCHEMA/DELIVERY.md`
  (this document). `REVIEW.md` did not exist at round start and was not created.
- `git diff --stat` (tracked): 7 files, +199/−13. `git diff --check` clean.
- No other files are dirty or untracked.

## READY FOR REVIEW

Implementation round 1 is complete and in-scope: the normalized
`claim_allowed_languages` relation ships on both dialects with forward
migrations 0059/0037, snapshots, journals, a Zod/type export, and a
migration-backed 11-test storage spec, plus parity coverage. Runnable approved
gates pass on the final tree: frozen install exit 0, local D1 migration exit 0
(0059 applied, idempotent on re-run), clean final dual-dialect `db:generate`
exit 0 (`No schema changes, nothing to migrate` on both dialects), focused
Vitest 5 files / 298 tests exit 0, full Vitest 166 files / 1452 tests exit 0
(load-bounded), and read-only Git clean. The five full-repo gates
(`format:check`, `types:check`, `lint`, `build`, `ci:check`) could not be
executed because the sandbox auto-denies them with no approval surface (no exit
codes), so status is reported as `BLOCKED_BY_TEST_ENVIRONMENT`. No `PASS`
verdict is written by the implementation round.
