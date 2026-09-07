# DELIVERY — T100-M1-MARKET-PROFILE-SCHEMA (Round 3 — final fix round)

## TASK ID

T100-M1-MARKET-PROFILE-SCHEMA — M1 Core Domain, Round 3 (final executor round).

## IMPLEMENTATION SUMMARY

Round 2 delivered a nearly complete, focused diff (normalized project-scoped `search_market_profiles`
on SQLite/D1 + Postgres, forward migrations, journal/snapshot metadata, parity coverage, market
fixture) and was BLOCKED by two REVIEW findings. Round 3 fixed exactly those findings and reran the
full final matrix; every required gate now exits 0:

- **Finding 1 (MAJOR) — required market identity was nullable and a Global/null fixture normalized
  missing market identity.** Fixed in four places on each dialect:
  - `location_code` and `country` are now `.notNull()` in both dialect schemas
    (`src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`);
  - both forward migrations declare `location_code text NOT NULL` and `country text NOT NULL`
    (`drizzle/0045_search_market_profiles.sql`, `drizzle-pg/0023_search_market_profiles.sql`);
  - both migration snapshots mark `location_code`/`country` `notNull: true`
    (`drizzle/meta/0045_snapshot.json`, `drizzle-pg/meta/0023_snapshot.json`);
  - the fixture test no longer inserts a `prof_bing_global` row with `location_code: null`,
    `country: null` on a `proj_global` project. Project scoping is now proven with a **concrete
    second-project market** — `prof_bing_us` (Bing United States, `location_code 'us'`, `country 'US'`,
    `language 'en-US'`, desktop, primary) on a `proj_us` project — and a third test proves the
    corrected migration's NOT NULL columns reject a profile that omits concrete
    location/country identity. Google/Baidu distinction and the no-`GLOBAL` assertions are retained.
  - `db:generate` (both dialects) now reports **"No schema changes, nothing to migrate"**, proving the
    corrected schemas and the hand-updated unmerged snapshots agree; no second migration is added.
- **Finding 2 (BLOCKER) — format:check / ci:check failed on `.ai-orchestrator/config.json`.** The
  Controller supplied the formatting-only config correction in the task worktree. The executor did not
  edit that control file. With it in place, `format:check` and the full `ci:check` chain both exit 0.

All other Round 1/2 design decisions were preserved: one normalized table, explicit Project FK with the
repository's cascade behavior, one project-scoped index and no invented business-rule uniqueness,
text-`enum` engine/device columns validated by Zod at the domain boundary with no `GLOBAL`/`TABLET`
fallback, no JSON-encoded relational data, and no CRUD/server-function/UI/connector code.

## FILES CHANGED

### Source (new, from Rounds 1–2)
- `src/db/search-growth.schema.ts` — SQLite/D1 `search_market_profiles` table definition.
- `src/db/pg/search-growth.schema.ts` — Postgres mirror table definition.
- `src/types/schemas/search-market-profile.ts` — domain-boundary Zod enums + exported row/enum types.
- `src/types/schemas/search-market-profile.test.ts` — Zod boundary tests + type-conformance test.
- `src/db/search-market-profile.test.ts` — market fixture run against the real migration DDL in
  in-memory SQLite.

### Source (modified, Rounds 1–2)
- `src/db/d1/schema.ts`, `src/db/pg/schema.ts` — barrel re-exports of `./search-growth.schema`.
- `src/db/schema.ts` — provider-aware barrel: imports both dialect schema modules, intersects the type,
  spreads the runtime module, and destructures/exports `searchMarketProfiles`.
- `src/db/schema-parity.test.ts` — adds both search-growth schema modules to the parity table sets.

### Round 3 fix edits (this round)
- `src/db/search-growth.schema.ts` — `locationCode`/`country` now `.notNull()`; comments updated to
  state V1.0 has no engine-wide/global profile.
- `src/db/pg/search-growth.schema.ts` — same `.notNull()` change as the SQLite mirror.
- `drizzle/0045_search_market_profiles.sql` — `location_code` and `country` columns now `NOT NULL`.
- `drizzle-pg/0023_search_market_profiles.sql` — `location_code` and `country` columns now `NOT NULL`.
- `drizzle/meta/0045_snapshot.json` — `location_code`/`country` `notNull: true`.
- `drizzle-pg/meta/0023_snapshot.json` — `location_code`/`country` `notNull: true`.
- `src/db/search-market-profile.test.ts` — replaced the Global/null fixture with a concrete
  second-project market (`proj_us` / Bing United States) and added a NOT NULL enforcement test that
  inserts missing location/country via raw SQL and expects rejection.

### Migrations / metadata (new, from Rounds 1–2, content corrected in Round 3)
- `drizzle/0045_search_market_profiles.sql`, `drizzle/meta/0045_snapshot.json`
- `drizzle-pg/0023_search_market_profiles.sql`, `drizzle-pg/meta/0023_snapshot.json`
- `drizzle/meta/_journal.json` (idx 45), `drizzle-pg/meta/_journal.json` (idx 23)

### Evidence (new, control channel — not part of the repo baseline)
- `control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/evidence/round-1/round-3-*.txt` — sanitized logs for
  every Round 3 approved command (see COMMANDS RUN).

### Controller-owned (untouched by implementation)
- `control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/TASK.md` (Round 3 final-fix context).
- `control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/REVIEW.md`.
- `.ai-orchestrator/config.json` — formatting-only correction supplied by the Controller; **not edited
  by the executor**.

## DATABASE/MIGRATION CHANGES

### Schema inventory — `search_market_profiles`
Logical fields (identical on both dialects; `is_primary` storage column maps to `isPrimary` property):

| property | column | type (sqlite / pg) | null | default |
| --- | --- | --- | --- | --- |
| `id` | `id` | text / text | no | PK |
| `projectId` | `project_id` | text / text | no | FK → projects.id |
| `name` | `name` | text / text | no | — |
| `searchEngine` | `search_engine` | text enum GOOGLE\|BAIDU\|BING\|OTHER | no | — |
| `locationCode` | `location_code` | text / text | **no (was nullable)** | — |
| `locationName` | `location_name` | text / text | no | — |
| `languageCode` | `language_code` | text / text | no | — |
| `device` | `device` | text enum DESKTOP\|MOBILE | no | — |
| `country` | `country` | text / text | **no (was nullable)** | — |
| `isPrimary` | `is_primary` | integer(boolean) / boolean | no | false |
| `active` | `active` | integer(boolean) / boolean | no | true |
| `createdAt` | `created_at` | text / text | no | dialect timestamp default |
| `updatedAt` | `updated_at` | text / text | no | dialect timestamp default |

### Constraint rationale
- **Explicit FK** `project_id → projects.id ON DELETE CASCADE ON UPDATE no action` — reuses the
  existing OpenSEO Project model (no second Project) with the repository's established cascade behavior.
- **One non-unique index** `search_market_profiles_project_idx(project_id)` — every market read is
  project-scoped; no business-rule unique index is added because several profiles per project
  (different engines/locations/devices) are legal and no V1.0 document constrains `name` or
  `is_primary` uniqueness.
- **`location_code` and `country` are required** — `05_DOMAIN_DATA_MODEL.md` §2 lists them as plain
  SearchMarketProfile fields, and every Rank/Keyword/Observation must explicitly bind to a market with
  no `GLOBAL` guessing. Both dialect schemas, both forward migrations, and both migration snapshots now
  enforce `NOT NULL`, and the fixture test proves the DB rejects a profile missing that identity.
- **Engine/device constraints** use the repository's established cross-dialect text-`enum` pattern
  (Drizzle `text(..., { enum })` on both dialects). Runtime validation is enforced by Zod at the domain
  boundary (`src/types/schemas/search-market-profile.ts`). There is intentionally **no
  `GLOBAL`/`TABLET`/unknown fallback**.
- **`location_code` is text** (not integer like OpenSEO's DataForSEO `projects.location_code`) because
  engines do not share a numeric space (Google DataForSEO codes, Baidu/Bing codes, OTHER free-form ids).
- **Timestamps are text** with per-dialect defaults matching repository conventions: SQLite/D1
  `(current_timestamp)`; Postgres `to_char(now() AT TIME ZONE 'utc', ...)` ISO text (see
  `pg/app.schema.ts` note). No JSON/text-encoded relational data anywhere.

### Migration identifiers
- SQLite/D1: **0045** (`0045_search_market_profiles`), journal idx 45.
- Postgres: **0023** (`0023_search_market_profiles`), journal idx 23.
- Both migrations are forward-only; existing data/migrations preserved. Round 3 `db:generate` for both
  dialects reports **no schema change** against the corrected unmerged snapshots — no second migration
  was created for this task.

## DEPENDENCIES CHANGED

None. Round 3 ran no install (the Round 2 authorized single frozen install already populated the
worktree; lockfile and manifests remain unchanged). No dependency was added or upgraded.

## TESTS ADDED

- `src/db/search-market-profile.test.ts` (3 tests, +1 vs Round 2) — executes the real
  `0045_search_market_profiles.sql` DDL in an in-memory SQLite database against a minimal `projects`
  table, then proves:
  1. distinct GOOGLE (China, desktop, zh-CN, primary) and BAIDU (China, mobile, zh, non-primary)
     profiles persist with full, distinct market identity and no `GLOBAL` engine;
  2. project scoping holds against a **concrete second-project market** — Bing United States
     (`proj_us`, `location_code 'us'`, `country 'US'`, en-US, desktop, primary) stays isolated from the
     `proj_cn` rows, so no Global/null placeholder is ever used to prove scoping;
  3. a profile that omits concrete market identity (`location_code`/`country` NULL via raw SQL) is
     rejected by the corrected migration's NOT NULL columns.
- `src/types/schemas/search-market-profile.test.ts` (5 tests, unchanged) — every column engine/device
  value is accepted by the Zod boundary; unsupported engines/devices (`GLOBAL`, `YAHOO`, `YANDEX`,
  `TABLET`, lowercase, empty) are rejected; exported `SearchEngine`/`SearchDevice`/`SearchMarketProfile`
  types conform to the storage columns and enum values.
- `src/db/schema-parity.test.ts` extended (184 tests) — both dialect schema barrels include the
  search-growth module, so the new table is asserted present and structurally equivalent (columns,
  nullability now including `location_code`/`country` NOT NULL, dataType, defaults, enum values, PK,
  unique targets, FKs incl. `onDelete`, check constraints) on both backends.

## COMMANDS RUN

Run independently per the approved matrix; concise sanitized logs under
`control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/evidence/round-1/round-3-*.txt`.

1. `node --version` → exit 0 → `v24.16.0`
2. `corepack pnpm --version` → exit 0 → `10.30.1`
3. `corepack pnpm install --frozen-lockfile` → not run in Round 3 (authorized "Round 2 only"; worktree
   already installed)
4. `corepack pnpm exec prettier --write <task-touched source/test files>` → exit 0 (all 9 files already
   clean — `(unchanged)` for every file; migration/metadata under `drizzle/`/`drizzle-pg/` are
   `.prettierignore`'d drizzle-kit output)
5. `corepack pnpm run db:migrate:local` → exit 0 → `✅ No migrations to apply!` (0045 already applied
   locally in Round 2; the corrected DDL is exercised on a fresh DB by the in-memory fixture test)
6. `corepack pnpm run db:generate` → exit 0 → drizzle-kit (D1) and drizzle-kit (pg) both report
   **"No schema changes, nothing to migrate"** (35 tables incl. `search_market_profiles 13 columns 1
   indexes 1 fks`)
7. `corepack pnpm exec vitest run <focused schema/parity/market tests>` → exit 0 → 3 files /
   **192 tests passed**
8. `corepack pnpm format:check` → exit 0 → `All matched files use Prettier code style!`
9. `corepack pnpm types:check` → exit 0 → `tsc --noEmit` clean
10. `corepack pnpm lint` → exit 0 → `oxlint . --type-aware` → 0 warnings / 0 errors
11. `corepack pnpm test` → exit 0 → **142 files / 1184 tests passed**
12. `corepack pnpm build` → exit 0 → vite build (client / ssr / open_seo_audit) + `tsc --noEmit` clean
13. `corepack pnpm ci:check` → exit 0 → prettier → knip → tsc → tsc (badseo) → oxlint →
    sync-plugin-skills → plugin-skill-sync check, all green
14. Read-only Git inspection: `git status`, `git diff --stat`, `git diff`, `git log` (approved subset) —
    no unexpected changes (skill-sync produced no working-tree change; `db:generate` produced no new
    files)

## COMMAND RESULTS (evidence)

Exact per-command exits and summaries are recorded in
`control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/evidence/round-1/round-3-*.txt` and reproduced in the
table above. One mid-round correction is noted in `round-3-10-lint.txt`: the first `lint` run flagged
the NOT NULL test's `null as unknown as string` narrowing (`no-unsafe-type-assertion`); the test was
rewritten to use a raw SQL insert (no type assertion) and lint is clean.

## RUNTIME EVIDENCE

- **db:generate consistency** — both dialects report no schema change against the corrected unmerged
  snapshots (`round-3-06-db-generate.txt`).
- **SQLite/D1 migrations** — local state already at 0045 (`db:migrate:local` → "No migrations to
  apply"); the corrected 0045 DDL is executed on a fresh in-memory SQLite DB inside the fixture test.
- **Focused suite** — schema parity (184), market fixture (3), domain boundary (5): 192/192 pass.
- **Full suite** — 1184/1184 pass across 142 files on the final worktree state.
- **Aggregate gates** — `format:check`, `types:check`, `lint`, `test`, `build`, and the full
  `ci:check` chain all exit 0.
- **Postgres migration** — `db:generate:pg` diffed clean against `0023_snapshot.json`; the migration
  SQL, journal registration, and snapshot are consistent with the pg schema definition. A live
  `db:migrate:pg` was not run because it requires a real Postgres URL and is not in the approved
  command set.

## KNOWN LIMITATIONS

- The Round 2 REVIEW blockers are resolved. The remaining intentional limitation is unchanged from
  earlier rounds: **`db:migrate:pg` was not executed** (requires a live Postgres `DATABASE_URL`; not in
  the approved command set). The pg migration/snapshot consistency is proven via `db:generate:pg` and
  parity tests instead.
- The local D1 migration store already applied 0045 in Round 2 (with the pre-fix nullable DDL); because
  the migration is unmerged, its file content changed in Round 3. The corrected NOT NULL DDL is proven
  against a fresh database by `src/db/search-market-profile.test.ts` (in-memory SQLite built from the
  migration file), which is the same evidence path used for forward-only correctness.
- Per scope: no CRUD/server functions, service/repository methods, UI, connector, or later-domain
  tables were added.

## DEVIATIONS FROM TASK

None in product scope. Round 3 changes are exactly the two REVIEW fixes: making `location_code` and
`country` required (schemas, migrations, snapshots) and replacing the Global/null test fixture with a
concrete second-project market plus a NOT NULL enforcement test. No new uniqueness rules, no CRUD
expansion, and no unrelated changes.

## SECURITY NOTES

- No external requests, credentials, account access, CAPTCHA/2FA bypass, stealth behavior, cookie
  upload, production publishing, or remote migration were performed.
- No dependency or lockfile change; no install was run in Round 3.
- `.ai-orchestrator/config.json` (a Controller-owned orchestration control file) was not edited by the
  executor; its formatting correction is the Controller's change present in the worktree.
- All work is local to the isolated worktree.

## GIT STATUS/DIFF SUMMARY

Tracked modifications (git diff --stat, 8 files):
- `.ai-orchestrator/config.json` (+/− formatting-only; Controller-supplied, not executor-edited)
- `control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/TASK.md` (+/− Round 3 final-fix context; Controller-owned)
- `drizzle/meta/_journal.json` (+7) — idx 45
- `drizzle-pg/meta/_journal.json` (+7) — idx 23
- `src/db/d1/schema.ts` (+1), `src/db/pg/schema.ts` (+1) — schema barrel exports
- `src/db/schema.ts` (+6) — provider-aware barrel export of `searchMarketProfiles`
- `src/db/schema-parity.test.ts` (+4) — parity coverage for the new module

Untracked additions (new files):
- `drizzle/0045_search_market_profiles.sql`, `drizzle/meta/0045_snapshot.json`
- `drizzle-pg/0023_search_market_profiles.sql`, `drizzle-pg/meta/0023_snapshot.json`
- `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`
- `src/db/search-market-profile.test.ts`
- `src/types/schemas/search-market-profile.ts`, `src/types/schemas/search-market-profile.test.ts`
- `control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/REVIEW.md`,
  `control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/DELIVERY.md`, `control/tasks/.../evidence/`
  (control channel)

The unmerged task schema/migration/test files above carry the Round 3 content: `location_code` and
`country` are `NOT NULL` in both migrations, `notNull: true` in both snapshots, `.notNull()` in both
schema files, and the fixture uses concrete `proj_cn`/`proj_us` markets only. No lockfile, package
manifest, `.prettierignore`, ADR, scope, or production resource change is part of the diff.

## READY FOR REVIEW

The two Round 2 REVIEW findings are fixed and every required final-state gate is green:
`db:generate` (both dialects) reports no schema change after the corrected snapshot/schema state;
`db:migrate:local`, focused tests (192/192), `format:check`, `types:check`, `lint`, full tests
(1184/1184), `build`, and the full `ci:check` chain all exit 0. Both dialect schemas define a logically
equivalent `search_market_profiles` table with every required field non-null; the Project FK uses the
established cascade behavior; engine/device are constrained and Zod-validated with no `GLOBAL`
fallback; forward migrations are registered and (SQLite/D1) locally applied; schema parity covers the
new table; and the market fixture proves explicit Google and Baidu profiles plus a concrete
second-project Bing US profile with no Global/null placeholder. Not committed; not merged; REVIEW.md
not edited; no other task started.
