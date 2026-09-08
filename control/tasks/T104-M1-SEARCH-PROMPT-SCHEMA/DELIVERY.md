# DELIVERY — T104-M1-SEARCH-PROMPT-SCHEMA

IMPLEMENTATION STATUS: IMPLEMENTED — ROUND 2 (gate-only fix; not accepted; only the Controller may PASS)
READY FOR REVIEW: YES

## TASK ID

T104-M1-SEARCH-PROMPT-SCHEMA — M1 Core Domain, schema-and-contract foundation for the
normalized, versioned, Project-scoped `SearchPrompt`. This is implementation **round 2**, a
gate-only fix round dispatched by `REVIEW.md` (round-1 BLOCKER: the six required aggregate
gates had no passing evidence). Per the TASK round-2 context, no schema was redesigned,
expanded, or reimplemented — the round-1 prompt-schema implementation is unchanged in product
scope. This round runs the previously auto-denied gates to exit 0, repairs the two task-local
gate failures they exposed, and records exact results. All work is on the isolated worktree
branch `ai-task/T104-M1-SEARCH-PROMPT-SCHEMA` at HEAD `502c45b`.

### Round-2 gate outcome (the round-1 BLOCKER)

Round 1 recorded `format:check`, `types:check`, `lint`, `test`, `build`, and `ci:check` as
auto-denied (no approval surface). In round 2 each literal pre-approved command was run
independently as `corepack pnpm <script>` on this executor. **All six now exit 0**, with the
exact results recorded under COMMANDS RUN / COMMAND RESULTS below and sanitized evidence in
`evidence/round-2/`. Two gate failures surfaced and were repaired first:

1. **`format:check` (exit 1 before repair)** flagged only `control/ACCEPTANCE_LEDGER.md`, a
   Controller-owned, tracked file untouched by this task. The T103 accept commit `51907b2`
   added a table row whose `Evidence` cell is wider than the table's aligned columns, leaving
   the whole-repo Prettier gate red at HEAD `502c45b` independent of any T104 change. Applied
   `prettier --write control/ACCEPTANCE_LEDGER.md` — the diff is pure markdown column
   re-alignment (8 insertions / 8 deletions, **zero content change**). `format:check` then
   exits 0.
2. **`lint` (exit 1 before repair)** flagged a task-local defect in
   `src/db/search-prompt.test.ts:175`: the unicorn `no-array-sort` rule rejects the mutating
   `.sort()` calls. The repository `tsconfig.json` pins `lib` to ES2022 and its own comment
   forbids bumping to ES2023 (`.toSorted()` crashes Chromium < 110), directing use of Remeda
   instead. Replaced `.sort()` with the non-mutating, repo-idiomatic
   `sort(values, (a, b) => a.localeCompare(b))` (same pattern already used in
   `src/db/schema-parity.test.ts`), adding `import { sort } from "remeda";`. Remeda is an
   existing dependency (`"remeda": "^2.33.6"`), used across `src` — **no package or lockfile
   change**. Assertion semantics are unchanged (deterministic order-independent comparison);
   the storage test still passes 14/14. `lint` then exits 0.

Both repairs were re-verified by the later gates on the final tree: `test`, `build` (includes
`tsc --noEmit`), and `ci:check` (prettier + knip + two `tsc` runs + oxlint + skill sync) all
exit 0, and `format:check`/`types:check` were re-run after the edits.

## IMPLEMENTATION SUMMARY

A single normalized, Project-scoped `search_prompts` table is shipped in both dialect schemas
(SQLite/D1 and Postgres) plus the forward migrations, snapshots, journals, a domain-boundary
Zod module, and migration-backed storage/boundary tests. The task is schema and contract only:
no prompt generation, normalization algorithm, execution, GEO observation, CRUD/repository/
service/server function, API/form/UI, connector, or external-provider code was added.

- **`search_prompts`** (SQLite: `src/db/search-growth.schema.ts`, Postgres mirror:
  `src/db/pg/search-growth.schema.ts`) with the V1.0 fields from `05_DOMAIN_DATA_MODEL.md` §5:
  `id, project_id, topic_id, prompt_text, normalized_prompt, prompt_type, persona?,
  buying_stage?, market_profile_id?, language, business_fit, priority, version, active,
  created_at, updated_at`.
- **PromptType is exactly the 11 lowercase V1.0 values**
  (`definition | problem | recommendation | comparison | alternative | risk | security |
  pricing | implementation | brand_validation | scenario`) as a DB text-enum column, mirrored
  by a Zod `z.enum` boundary that rejects unsupported, case-mismatched, and empty values at
  runtime. No implicit/unknown prompt-kind fallback exists.
- **Score boundaries are explicit and DB-enforced** — `business_fit` and `priority` are
  `REAL` 0..100 columns guarded by named CHECK constraints
  (`search_prompts_business_fit_range`, `search_prompts_priority_range`); the Zod
  `searchPromptScoreSchema` (`z.number().min(0).max(100)`) enforces the same range at the
  runtime boundary. This is score-boundary validation only — no ranking or matching behavior
  is created.
- **Same-Project Topic and optional MarketProfile ownership is database-enforced.** A prompt
  carries an explicit `project_id` plus a same-Project composite FK
  `(project_id, topic_id) → search_topics(project_id, id)` and a same-Project composite FK
  `(project_id, market_profile_id) → search_market_profiles(project_id, id)`. Cross-Project
  references are rejected by the DB; NULL `market_profile_id` means "no profile attached" and
  the profile FK is not enforced. Reusing the existing OpenSEO Project, `search_topics`, and
  `search_market_profiles` stores — no duplicate Project/Topic/MarketProfile tables are added.
- **Delete behavior cannot leave dangling prompts**: deleting a Topic, a MarketProfile, or a
  whole Project cascades its prompts away (composite FKs + Project FK all `ON DELETE CASCADE`);
  deleting a Project also cascades its Topics/MarketProfiles, which in turn cascade their
  prompts. All three paths are migration-tested.
- **The sole versioned-identity rule is
  `(project_id, normalized_prompt, market_profile_id, version)`**, implemented as the unique
  index `search_prompts_unique_project_normalized_market_version_idx`
  (`schemas/migrations-reference.sql` `idx_search_prompts_unique`). Versioning a prompt inserts
  a new row with the next version — history is never overwritten
  (`05_DOMAIN_DATA_MODEL.md` §5 "Prompt version 不覆盖历史"). No other business uniqueness,
  normalization algorithm, generated-prompt, ranking, or matching rule exists.
- **Forward migrations/snapshots** use the next identifiers after accepted T103: D1 **0049**
  and Postgres **0027**, regenerated to match the shipped schemas; the local D1 migration
  history applies cleanly; a final dual-dialect `db:generate` reports **no schema change** on
  either dialect.
- **`source` reconciliation** (see below): the design-reference `schemas/migrations-reference.sql`
  `source TEXT NOT NULL` column is **not** retained because no direct V1.0 contract requires it;
  keeping it would invent a provenance enum/semantics the domain model never defines.

### `source` reconciliation (TASK in-scope item 2)

- `schemas/migrations-reference.sql` (design reference) declares `search_prompts.source TEXT
  NOT NULL` alongside the prompt fields. It is the **only** artifact that references a prompt
  `source` column.
- The direct V1.0 field contract — `05_DOMAIN_DATA_MODEL.md` §5 (`id, project_id, topic_id,
  prompt_text, normalized_prompt, prompt_type, persona, buying_stage, market_profile_id,
  language, business_fit, priority, version, active`) and `schemas/domain-types.ts`
  `interface SearchPrompt` — defines **no** `source`/`sourceType` field on a prompt (the
  `SourceRef`/`source_ownership` concepts belong to Claim/Citation domain §8–§9, a different
  later task, and their `sourceType`/`kind` are not prompt provenance).
- Per the TASK contract rule ("treat `05_DOMAIN_DATA_MODEL.md` as the direct V1.0 field
  contract and `schemas/migrations-reference.sql` as a design reference... without inventing
  unrelated behavior") and in-scope item 2 ("retain it only as explicit storage provenance if
  the cited reference requires it"), **`source` is dropped from storage**. Retaining it would
  require an invented enum/ranking semantics and a NOT NULL value for every prompt with no
  V1.0 meaning attached to it. Reconciliation is recorded here and in the schema header
  comment; the reference files were not edited.

### Field / enum decisions (shipped vs. design-reference)

- **`normalized_prompt`** is **shipped** as an explicit `TEXT NOT NULL` column: it is listed in
  `05_DOMAIN_DATA_MODEL.md` §5 and is the leading identity input of the reference-defined
  versioned-identity rule. No normalization algorithm is implemented (out of scope) — the
  column stores the normalized form produced by a later task.
- **PromptType is lowercase** (`definition | problem | ... | scenario`), matching
  `schemas/domain-types.ts` `PromptType` exactly and the accepted T100–T103
  `search_market_profiles`/`search_topics` DB text-enum pattern. Because the approved values
  are lowercase, uppercase/mixed-case/empty strings are rejected at the Zod boundary (no
  case-insensitive parsing or invented aliases). The task text lists the values as mixed-case
  prose but the canonical `domain-types.ts` union is lowercase; the lowercase union wins.
- **`persona` and `buying_stage`** are optional free-text `TEXT` columns; V1.0 defines no enum
  for either, so none is invented.
- **`language`** is `TEXT NOT NULL` (IETF tag, e.g. `en`/`zh-CN`), same as the MarketProfile
  and Topic locale convention — a prompt is never locale-less.
- **`active`** is a boolean (`integer` boolean-mode in SQLite / `boolean` in Postgres)
  `NOT NULL DEFAULT true` soft-disable flag; `created_at`/`updated_at` are the system
  timestamps the task requires, `TEXT` with the dialect timestamp default (accepted
  T100–T103 pattern).
- **`business_fit`/`priority`** are `REAL NOT NULL` with CHECK 0..100. V1.0 defines them as
  0..100 numbers; REAL (not integer) preserves the domain's numeric fidelity and mirrors the
  existing real-typed score columns. No ranking behavior exists.
- **Column naming** continues the accepted reconciliation: storage columns are
  `migrations-reference.sql` snake_case; exported Drizzle row types are camelCase.
- **No JSON/text encoding of relational data** — Project, Topic, MarketProfile, version, and
  score fields are explicit typed columns.

## FILES CHANGED

### Source — modified (tracked)
- `src/db/search-growth.schema.ts` — `searchMarketProfiles` gains the supporting unique index
  `search_market_profiles_project_id_id_idx(project_id, id)` (required unique target of the
  new prompt composite FK; `id` is already the PK, so it adds no business uniqueness); appends
  the full `searchPrompts` sqliteTable (16 columns, 2 composite same-Project FKs, the
  versioned-identity unique index, 3 read indexes, 2 score-range CHECKs).
- `src/db/pg/search-growth.schema.ts` — identical Postgres mirror of both changes (`boolean`
  `active`, `isoNow` timestamp default, `real` from pg-core).
- `src/db/schema.ts` — provider-aware barrel: adds `searchPrompts` to the destructured exports.

### Migrations / metadata (untracked additions)
- `drizzle/0049_gigantic_johnny_blaze.sql` (D1: `CREATE TABLE search_prompts`, its indexes and
  CHECKs, then `CREATE UNIQUE INDEX search_market_profiles_project_id_id_idx`), plus
  `drizzle/meta/0049_snapshot.json`.
- `drizzle-pg/0027_clever_warpath.sql` (Postgres: `CREATE TABLE search_prompts`; the
  supporting `search_market_profiles_project_id_id_idx` is ordered **before** the composite-FK
  `ALTER TABLE`s as Postgres requires, with an explanatory comment), plus
  `drizzle-pg/meta/0027_snapshot.json`.
- `drizzle/meta/_journal.json` (idx 49, tag `0049_gigantic_johnny_blaze`),
  `drizzle-pg/meta/_journal.json` (idx 27, tag `0027_clever_warpath`) — tracked modifications.

### Tests — untracked additions
- `src/db/search-prompt.test.ts` (14 tests) — migration-backed storage contract.
- `src/types/schemas/search-prompt.test.ts` (4 tests) — domain-boundary (PromptType + score).

### Domain-boundary module — untracked addition
- `src/types/schemas/search-prompt.ts` — exports `SearchPrompt` (InferSelectModel row type),
  `promptTypeSchema`/`PromptType`, and `searchPromptScoreSchema`.

### Control channel (untracked, not repo baseline)
- `control/tasks/T104-M1-SEARCH-PROMPT-SCHEMA/DELIVERY.md` (this file),
  `control/tasks/T104-M1-SEARCH-PROMPT-SCHEMA/evidence/round-1/*` (round-1 command evidence),
  `control/tasks/T104-M1-SEARCH-PROMPT-SCHEMA/evidence/round-2/*` (this round's gate evidence).

### Round-2 delta (this round's only file changes)
- `control/ACCEPTANCE_LEDGER.md` (tracked, **content-unchanged**) — Prettier re-aligned the
  acceptance-ledger markdown table columns to accommodate the T103 row added by accept commit
  `51907b2`. 8 insertions / 8 deletions, all alignment whitespace; no text changed. This
  repair is required for the whole-repo `format:check` gate to exit 0 and is not part of the
  prompt-schema implementation.
- `src/db/search-prompt.test.ts` (untracked round-1 addition, test-code-only edit) — replaced
  the two mutating `.sort()` calls at the PromptType round-trip assertion with non-mutating
  Remeda `sort(values, (a, b) => a.localeCompare(b))` and added
  `import { sort } from "remeda";`. No assertion-semantics change; required for the `lint` gate
  (unicorn `no-array-sort`) to exit 0 under the repository's ES2022 `lib` floor.

## DATABASE / MIGRATION CHANGES

### `search_prompts` inventory (identical on both dialects)
| property | column | type (sqlite / pg) | null | default |
| --- | --- | --- | --- | --- |
| `id` | `id` | text / text | no | PK |
| `projectId` | `project_id` | text / text | no | FK → projects(id) cascade |
| `topicId` | `topic_id` | text / text | no | composite FK target |
| `promptText` | `prompt_text` | text / text | no | — |
| `normalizedPrompt` | `normalized_prompt` | text / text | no | — (identity input) |
| `promptType` | `prompt_type` | text enum (11 lowercase values) | no | — |
| `persona` | `persona` | text / text | yes | — |
| `buyingStage` | `buying_stage` | text / text | yes | — |
| `marketProfileId` | `market_profile_id` | text / text | yes | — (composite FK target) |
| `language` | `language` | text / text | no | — |
| `businessFit` | `business_fit` | real / real | no | — (CHECK 0..100) |
| `priority` | `priority` | real / real | no | — (CHECK 0..100) |
| `version` | `version` | integer / integer | no | — (identity input) |
| `active` | `active` | integer(bool) / boolean | no | true |
| `createdAt` | `created_at` | text / text | no | dialect timestamp default |
| `updatedAt` | `updated_at` | text / text | no | dialect timestamp default |

| artifact | definition |
| --- | --- |
| Project FK | `project_id → projects(id) ON DELETE CASCADE` |
| Topic FK | `(project_id, topic_id) → search_topics(project_id, id) ON DELETE CASCADE` — same-Project composite |
| MarketProfile FK | `(project_id, market_profile_id) → search_market_profiles(project_id, id) ON DELETE CASCADE` — same-Project composite; NULL market_profile_id = no profile attached |
| Versioned-identity unique index | `search_prompts_unique_project_normalized_market_version_idx(project_id, normalized_prompt, market_profile_id, version)` — the **sole** identity rule |
| Read index | `search_prompts_project_idx(project_id)` (non-unique) |
| Read index | `search_prompts_topic_idx(topic_id)` (non-unique) |
| Read index | `search_prompts_market_profile_idx(market_profile_id)` (non-unique) |
| CHECK | `search_prompts_business_fit_range` → `business_fit >= 0 AND business_fit <= 100` |
| CHECK | `search_prompts_priority_range` → `priority >= 0 AND priority <= 100` |
| Supporting unique index | `search_market_profiles_project_id_id_idx(project_id, id)` on `search_market_profiles` — required unique target of the prompt's composite MarketProfile FK; `id` is the PK, so it adds no business uniqueness |

### Constraint / behavior rationale
- **Cross-Project prompts are impossible at the DB**: both composite FKs bind the prompt's
  `project_id` to the parent row's `project_id`, so a `proj_alpha` prompt cannot reference a
  `proj_beta` Topic or MarketProfile (negative migration-backed tests for both).
- **No dangling prompts**: deleting a Topic, a MarketProfile, or a Project cascades its prompts
  away (all three paths migration-tested). Prompt deletion is deliberately cascade-only in this
  schema task; a later CRUD task owns application-level archive/delete flows.
- **Sole versioned identity**: the unique index `(project_id, normalized_prompt,
  market_profile_id, version)` is the only uniqueness rule. A duplicate identity is rejected; a
  version bump appends a new row (history preserved); a different MarketProfile is a distinct
  identity. SQL NULL semantics apply to the nullable `market_profile_id` — two same-version
  NULL-profile prompts with the same normalized prompt are **not** treated as duplicates (no
  invented null-profile uniqueness). Documented in the schema comment and migration-tested.
- **No invented business uniqueness**: no prompt-text, topic-scoped, persona, or ranking
  duplicate rules; no case-insensitive prompt-type parsing.
- **PromptType enum** lives in an explicit text column and is Zod-validated at the boundary.
- **Relational data is never JSON-encoded** — Project, Topic, MarketProfile, version, and score
  fields are explicit typed columns.

### Migration identifiers
- D1 **0049** (`0049_gigantic_johnny_blaze`), journal idx 49, `drizzle/meta/0049_snapshot.json`.
- Postgres **0027** (`0027_clever_warpath`), journal idx 27, `drizzle-pg/meta/0027_snapshot.json`.
Both are the next identifiers after the accepted T103 migrations (0048 / 0026). The Postgres
migration orders the supporting `search_market_profiles_project_id_id_idx` unique index
**before** the composite-FK `ALTER TABLE`s (Postgres requires the referenced unique index to
exist first); the SQLite migration creates `search_prompts` and its indexes (SQLite validates
FK targets at DML time, so intra-file order is not constrained). Final dual-dialect
`db:generate` reports **no schema change** on either dialect, so the schemas, 0049/0027 SQL,
and their snapshots agree exactly.

## DEPENDENCIES CHANGED

None in either round. Round 1: `corepack pnpm install --frozen-lockfile` → exit 0, lockfile up
to date, resolution skipped; `package.json`/`pnpm-lock.yaml` are unchanged. Round 2 added no
package — the `lint` repair imports Remeda's `sort`, which is an existing dependency
(`"remeda": "^2.33.6"`, already used across `src`, including `src/db/schema-parity.test.ts`).

## TESTS ADDED

- `src/db/search-prompt.test.ts` (14 tests) — real in-memory SQLite built from the shipped
  `drizzle/0045_search_market_profiles.sql` + `drizzle/0046_search_topics.sql` +
  `drizzle/0049_gigantic_johnny_blaze.sql` DDL with `PRAGMA foreign_keys = ON`:
  1. A valid prompt persists with the full V1.0 field set and keeps projects isolated.
  2. Every approved PromptType value stores as the DB text-enum column.
  3. A prompt with a NULL market profile persists (no profile attached).
  4. A prompt whose Topic belongs to another Project is rejected (composite-FK violation).
  5. A prompt whose MarketProfile belongs to another Project is rejected (composite-FK violation).
  6. Out-of-range `business_fit` values (150, −1, 100.5, −0.01) are rejected by the CHECK.
  7. Out-of-range `priority` values (150, −1, 100.5, −0.01) are rejected by the CHECK.
  8. A duplicate versioned identity (same project + normalized prompt + market profile +
     version) is rejected by the unique index.
  9. Versioning appends a new row — version-1 history is never overwritten.
  10. A different (same-Project) MarketProfile is a distinct versioned identity.
  11. NULL-profile same-version duplicates are allowed (SQL NULL semantics; the versioned
      identity is the sole uniqueness rule).
  12. Deleting a Topic cascades its prompts away.
  13. Deleting a MarketProfile cascades its prompts away.
  14. Deleting a whole Project cascades its prompts away.
- `src/types/schemas/search-prompt.test.ts` (4 tests) — domain boundary:
  1. Every DB `prompt_type` column value passes the Zod `promptTypeSchema`.
  2. Unsupported, case-mismatched, and empty PromptType values (e.g. `DEFINITION`,
     `Brand_Validation`, `question`, `GEO`, ``) are rejected.
  3. `searchPromptScoreSchema` accepts 0..100 and rejects out-of-range/NaN/Infinity.
  4. Compile-time Pick guard: exported `PromptType`/`SearchPrompt` types stay aligned with the
     storage columns (nullable `market_profile_id`, `normalized_prompt`, `version`, score cols).
- `src/db/schema-parity.test.ts` (209 tests, passes) — auto-compares every table on both
  dialect barrels (columns/nullability/dataType/defaults/enums, PK, unique targets incl. the
  supporting index, FKs incl. `onDelete`, CHECK names). No manual parity-test edit was needed:
  the test enumerates the exported Search Growth modules, so `search_prompts` and the
  `search_market_profiles_project_id_id_idx` index are covered automatically.

## COMMANDS RUN

Run independently per the approved matrix — no chained/wrapped shell operations. Round-1 logs
under `evidence/round-1/*`; **round-2 gate logs under `evidence/round-2/*`**.

Round 1 (all exit 0 unless noted):
1. `node --version` → exit 0 → `v24.16.0`
2. `corepack pnpm --version` → exit 0 → `10.30.1`
3. `corepack pnpm install --frozen-lockfile` → exit 0 → lockfile up to date; manifests/lockfile unchanged
4. `corepack pnpm exec prettier --write <6 task-touched source/test files>` → exit 0 (all 6 unchanged — already formatted)
5. `corepack pnpm run db:migrate:local` → exit 0 → `✅ No migrations to apply!` (local D1 store already fully applied through 0049)
6. `corepack pnpm run db:generate` → exit 0 → both dialects report **"No schema changes, nothing to migrate 😴"**; no 0050/0028 produced
7. `corepack pnpm exec vitest run <3 focused prompt/parity files>` → exit 0 → **3 files / 227 tests passed**
14. Read-only Git inspection: `git status`, `git diff --stat`, `git log`, `git ls-files --others`,
    `git rev-parse`, `git diff` — see GIT STATUS/DIFF SUMMARY

Round 2 — the six aggregate gates from the round-1 BLOCKER, run literally as
`corepack pnpm <script>` (all exit 0; see `evidence/round-2/`):
8. `corepack pnpm format:check` → **exit 0** → `All matched files use Prettier code style!`
   (after the ledger re-alignment repair below; `evidence/round-2/08-format-check.txt`)
9. `corepack pnpm types:check` → **exit 0** → `tsc --noEmit` clean
   (`evidence/round-2/09-types-check.txt`)
10. `corepack pnpm lint` → **exit 0** → `Found 0 warnings and 0 errors. Finished ... on 861
    files` (after the Remeda-sort repair below; `evidence/round-2/10-lint.txt`)
11. `corepack pnpm test` → **exit 0** → **151 files / 1263 tests passed**
    (`evidence/round-2/11-test.txt`)
12. `corepack pnpm build` → **exit 0** → vite client + SSR + `open_seo_audit` bundles built;
    `tsc --noEmit` clean (`evidence/round-2/12-build.txt`)
13. `corepack pnpm ci:check` → **exit 0** → prettier clean, knip clean, both `tsc --noEmit`
    runs clean, oxlint 0 errors, plugin-skill sync clean (`evidence/round-2/13-ci-check.txt`)

Round-2 repairs performed before re-running the failing gates:
- `corepack pnpm exec prettier --write control/ACCEPTANCE_LEDGER.md` → exit 0 → table
  re-aligned; zero content change (fixes `format:check`).
- `corepack pnpm exec prettier --write src/db/search-prompt.test.ts` → exit 0 → re-wrapped the
  Remeda-sort call after the lint repair edit.
- Edit: `src/db/search-prompt.test.ts` `.sort()` → Remeda `sort(..., localeCompare)` (fixes `lint`).

## COMMAND RESULTS (evidence)

- **db:generate consistency (round 1)** — the dual-dialect run reports "No schema changes,
  nothing to migrate" on **both** dialects, so the 0049/0027 migrations and snapshots match the
  shipped schemas exactly (including `search_prompts`, its versioned-identity unique index, its
  two CHECK constraints, and the supporting `search_market_profiles_project_id_id_idx` index).
- **Local migration (round 1)** — `db:migrate:local` exits 0 with no pending migrations; the
  local D1 store is fully applied through `0049_gigantic_johnny_blaze.sql`.
- **Focused suite (round 1)** — 227/227 pass: prompt storage (14), PromptType/score domain
  boundary (4), and full Search Growth schema parity (209).
- **Round-2 aggregate gates all exit 0** — the round-1 BLOCKER (auto-denied gates with no
  evidence) is resolved:
  - `format:check` exit 0. First run failed solely on `control/ACCEPTANCE_LEDGER.md` (a
    pre-existing, Controller-owned formatting drift introduced by the T103 accept commit
    `51907b2`, present at HEAD `502c45b` before any T104 change). `prettier --write` on that
    single file re-aligned the markdown table columns with zero content change; re-check is
    clean and is re-confirmed inside `ci:check`.
  - `types:check` exit 0 (`tsc --noEmit`, no diagnostics).
  - `lint` exit 0. First run failed solely on the task-local `search-prompt.test.ts:175`
    mutating `.sort()` calls (unicorn `no-array-sort`). Repaired with the repository-idiomatic
    non-mutating Remeda `sort(values, (a, b) => a.localeCompare(b))` (same as
    `schema-parity.test.ts`), because the tsconfig `lib: ES2022` floor forbids the ES2023
    `toSorted()` the rule suggests. Re-run reports 0 warnings / 0 errors over 861 files and is
    re-confirmed inside `ci:check`.
  - `test` exit 0 — 151 files / 1263 tests passed, including the repaired storage contract
    `src/db/search-prompt.test.ts` (14/14), the domain-boundary
    `src/types/schemas/search-prompt.test.ts` (4/4), and `src/db/schema-parity.test.ts`
    (209/209).
  - `build` exit 0 — `vite build` (client + SSR + `open_seo_audit`) succeeded and the trailing
    `tsc --noEmit` produced no diagnostics.
  - `ci:check` exit 0 — the full chain (`prettier --check .`, knip, `tsc --noEmit`,
    `tsc --noEmit -p badseo/tsconfig.json`, `oxlint . --type-aware`, plugin-skill sync + sync
    check) all passed; the skill-sync step left the working tree clean.
- No schema, migration, snapshot, journal, manifest, or lockfile file changed in round 2.

## RUNTIME EVIDENCE

- **D1/SQLite migration** — `0049_gigantic_johnny_blaze.sql` is the applied head of the local
  D1 history; `db:migrate:local` exits 0.
- **Storage tests** — all 14 migration-backed prompt tests pass against the real 0049 DDL (with
  the 0045/0046 parents and `PRAGMA foreign_keys = ON`): the DB itself accepts a valid
  full-field prompt, persists all 11 PromptTypes and NULL-profile prompts, rejects
  cross-Project Topic and MarketProfile references, rejects out-of-range scores, rejects a
  duplicate versioned identity, preserves history on version bump, treats a different profile
  as a distinct identity, and cascades prompts on Topic/MarketProfile/Project deletion.
- **Domain boundary** — the Zod boundary accepts every DB enum value and rejects
  unsupported/case-mismatched/empty types; the score schema enforces 0..100; the exported types
  are compile-time-aligned with storage.
- **Schema parity** — `search_prompts` and the supporting MarketProfile index are structurally
  identical on SQLite and Postgres (columns, PK, unique targets, FKs incl. `onDelete`, CHECK
  names); 209/209 parity tests pass.
- **Postgres migration artifact** — pg migration SQL/journal/snapshot are consistent
  (`db:generate:pg` reports no diff); the pg DDL orders the supporting unique index before the
  composite-FK `ALTER TABLE`s as Postgres requires. A live `db:migrate:pg` still requires a real
  Postgres URL and is not in the approved command set.
- **Round-2 aggregate-gate reconfirmation (full suite)** — the round-2 `test` run re-executes
  the migration-backed storage tests (14/14), the domain-boundary tests (4/4), and the full
  Search Growth schema-parity tests (209/209) as part of the 151-file / 1263-test full suite,
  all green, against the same shipped 0049/0027 storage. No schema or DDL changed between the
  round-1 focused runs and the round-2 full run.

## KNOWN LIMITATIONS

- `db:migrate:pg` was not executed (requires a live `POSTGRES_DATABASE_URL`; not in the
  approved command set). Postgres migration/snapshot consistency is proven via `db:generate:pg`
  (no diff), the parity tests, and review of the generated DDL ordering.
- The round-1 limitation that the aggregate gates were auto-denied is **resolved in round 2**:
  all six (`format:check`, `types:check`, `lint`, `test`, `build`, `ci:check`) were executed to
  exit 0 with evidence in `evidence/round-2/`. Two gate failures were found and repaired (see
  Round-2 gate outcome and COMMAND RESULTS): `format:check` flagged a pre-existing formatting
  drift in the Controller-owned `control/ACCEPTANCE_LEDGER.md` (introduced by the T103 accept
  commit, not by this task), and `lint` flagged mutating `.sort()` calls in the task's own
  `src/db/search-prompt.test.ts`.
- Migration file names are drizzle-kit's auto-generated tags (`0049_gigantic_johnny_blaze`,
  `0027_clever_warpath`) rather than semantic names, because `db:generate` cannot be passed a
  custom name under the approved-command set and no unlisted rename/delete command is allowed.
  Identifiers are the required next values (D1 0049, Postgres 0027); the journal/snapshot/file
  tags agree.
- The `source` design-reference column is intentionally not shipped (see reconciliation above);
  if a later Accepted ADR defines real prompt provenance, it arrives as its own migration.
- Per scope: no prompt generation, normalization algorithm, execution, GEO observation,
  CRUD/repository/service/server-function/API/form/UI, connector, or later-domain code was
  added; `schemas/domain-types.ts`, `schemas/migrations-reference.sql`, and
  `05_DOMAIN_DATA_MODEL.md` were **not** edited.
- `active=false` prompts remain stored; later observation-selection logic (out of scope) is
  responsible for excluding them.

## DEVIATIONS FROM TASK

None in product scope. Design decisions recorded and explained above:
- **`source` is not retained** (in-scope item 2 reconciliation): the direct V1.0 field contract
  has no prompt `source`; the sole reference is the design-reference `migrations-reference.sql`
  DDL. Retaining it would invent provenance enum/ranking semantics the domain never defines.
- **PromptType is lowercase** in the DB enum/Zod boundary, matching `schemas/domain-types.ts`
  `PromptType` (the authoritative V1.0 union). The task's mixed-case prose list is resolved to
  the canonical lowercase union; case-mismatched input is rejected, not coerced.
- **`business_fit`/`priority` are REAL** (not integer) 0..100 columns with CHECK constraints to
  preserve the domain's numeric contract; Zod enforces the same range. No ranking behavior is
  implied.
- Delete behavior is **cascade for all parents** (Topic, MarketProfile, Project), matching the
  accepted T100–T103 topic/profile delete patterns and proving "no dangling prompt" by
  migration tests.
- The supporting `search_market_profiles_project_id_id_idx` unique index is added to
  `searchMarketProfiles` purely to satisfy the prompt composite FK's unique-target requirement
  on both dialects; `id` is already the PK, so it adds no business uniqueness. This mirrors the
  accepted `search_topics_project_id_id_idx` pattern from T101/T102.
- Round-2 (gate-only) deviations/adjacent correctness fixes, none of which change product
  scope, schema, migration, or domain behavior:
  - `control/ACCEPTANCE_LEDGER.md` was Prettier-reformatted (pure markdown table column
    re-alignment, no content change) because the mandatory whole-repo `format:check` gate
    flagged that Controller-owned file, which the T103 accept commit `51907b2` had left
    unformatted. This is a necessary adjacent fix to satisfy the review-requested gate result,
    not a schema change; flagged for the Controller's awareness since the file is outside the
    task diff.
  - `src/db/search-prompt.test.ts` changed its sort call from mutating `.sort()` to the
    non-mutating Remeda `sort(values, (a, b) => a.localeCompare(b))` to satisfy the `lint` gate
    (unicorn `no-array-sort`) under the repo's ES2022 `lib` floor. Assertion semantics are
    identical; the round-1 test count and pass rate are unchanged (14/14).

## SECURITY NOTES

- No external requests, credentials, account access, CAPTCHA/2FA bypass, stealth behavior,
  cookie upload, production publishing, remote migration, or paid action was performed.
- No dependency, lockfile, manifest, ADR, scope-lock, or production resource change.
- All work is local to the isolated worktree; `db:migrate:local` touches only the gitignored
  local Wrangler D1 state.
- Prompt ownership and relations are explicit FK columns — no relational data is stored in
  JSON/text payloads; no new untrusted-input, auth, or execution path was added (storage +
  Zod-boundary-only change).

## GIT STATUS/DIFF SUMMARY

See `evidence/round-1/09-git-status.txt` and `evidence/round-1/10-migration-journal-identifiers.txt`.
Tracked modifications (`git diff --stat`, **7 files, +346/−8**): the two
`search-growth.schema.ts` files (+161 / +158), `src/db/schema.ts` barrel export (+1), the two
`_journal.json` files (+7 each), the round-2 Prettier re-alignment of
`control/ACCEPTANCE_LEDGER.md` (+8/−8, content unchanged), and the Controller's
`control/tasks/T104-M1-SEARCH-PROMPT-SCHEMA/TASK.md` round-2 context (+4). Untracked
additions: `drizzle/0049_gigantic_johnny_blaze.sql` + `drizzle/meta/0049_snapshot.json`,
`drizzle-pg/0027_clever_warpath.sql` + `drizzle-pg/meta/0027_snapshot.json`,
`src/db/search-prompt.test.ts` (round-2 Remeda-sort edit applied on top of the round-1
addition), `src/types/schemas/search-prompt.test.ts`, `src/types/schemas/search-prompt.ts`,
`control/ACCEPTANCE_LEDGER.md`-adjacent control files `DELIVERY.md` and `REVIEW.md`, and the
`evidence/round-1/*` + `evidence/round-2/*` logs. No lockfile, package manifest, ADR, scope,
`.greptile`, `.github`, `.agents`, or production change is part of the diff. Nothing committed;
nothing merged; no other task started. `dist/` build output is gitignored; the `ci:check`
plugin-skill sync step left the working tree clean.

## READY FOR REVIEW

Both dialects define logically equivalent `search_prompts` storage with only the approved V1.0
fields (TASK item 1); the design-reference `source` column is reconciled as not retained (item
2); PromptType is an explicit DB text-enum of exactly the 11 lowercase V1.0 values with a
matching Zod boundary that rejects unsupported/case-mismatched/empty values, and the 0..100
score boundaries are Zod- and CHECK-validated with no ranking behavior (item 3); same-Project
Topic and optional MarketProfile relations are DB-enforced via composite FKs with
cascade-on-delete behavior that cannot leave dangling prompts (item 4); the sole versioned
identity rule `(project_id, normalized_prompt, market_profile_id, version)` is migration-backed
and tested with no additional business uniqueness (item 5); focused migration-backed tests
cover the valid prompt, PromptType rejection, same-Project relations, cross-Project rejection,
delete behavior, versioned uniqueness, and version identity (item 6); forward
migrations/snapshots/journals use the next identifiers after T103 (D1 0049, PG 0027), local D1
migration is fully applied, schema parity passes (209), and the final dual-dialect `db:generate`
produces no additional migration on either dialect (item 7). Focused tests 227/227.

**Round-1 BLOCKER resolved**: the six aggregate gates recorded as auto-denied in round 1 —
`format:check`, `types:check`, `lint`, `test`, `build`, and `ci:check` — were each run
literally in round 2 and now **all exit 0** (evidence `control/tasks/T104-M1-SEARCH-PROMPT-SCHEMA/evidence/round-2/`).
`test` = 151 files / 1263 tests passed; `build` = vite (client + SSR + audit) + `tsc --noEmit`
clean; `ci:check` = prettier + knip + two `tsc` runs + oxlint + plugin-skill sync all clean.
The two gate failures exposed on first run were repaired before re-running: a task-local
`.sort()` → Remeda `sort` lint fix in `src/db/search-prompt.test.ts`, and a content-neutral
Prettier re-alignment of the Controller-owned `control/ACCEPTANCE_LEDGER.md` (pre-existing
formatting drift from the T103 accept commit) required for the repo-wide `format:check`. No
schema, migration, domain, dependency, lockfile, manifest, ADR, scope, credential, external, or
production change was made in round 2. Not committed; not merged; no other task started.
