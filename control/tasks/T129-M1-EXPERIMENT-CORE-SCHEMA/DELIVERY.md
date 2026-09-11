# DELIVERY — T129-M1-EXPERIMENT-CORE-SCHEMA

## TASK ID

T129-M1-EXPERIMENT-CORE-SCHEMA (implementation round 1; no REVIEW.md present).

## IMPLEMENTATION SUMMARY

Added the credential-free, Project-scoped `Experiment` core persistence and
Zod/domain contract only, as a storage-contract slice.

- New `experiments` table in both dialects: SQLite (`src/db/search-growth.schema.ts`)
  and Postgres (`src/db/pg/search-growth.schema.ts`), structurally identical
  (schema-parity suite passes).
- Forward migrations D1 `0074_experiments` and PostgreSQL `0052_experiments`,
  with matching snapshots and journal entries.
- Matching runtime Zod contract `src/types/schemas/experiment.ts`
  (`Experiment` row type + `experimentSchema`).
- Migration-backed storage tests (`src/db/experiment.test.ts`) and focused
  domain contract tests (`src/types/schemas/experiment.test.ts`).

No activation, scheduling, snapshots, publishing, provider calls, credentials,
spend, CRUD/UI or production behavior was implemented.

## FIELD / ENUM / JSON RECONCILIATION

Fields shipped (stable `id`, explicit `project_id`, required `topic_id`,
optional `opportunity_id`, optional `release_bundle_id`, `title`, `hypothesis`,
`status`, `activation_policy`, optional `activation_at`,
`target_keyword_refs_json`, `target_prompt_refs_json`,
`target_surface_refs_json`, `recheck_policy_json`, append-only `created_at`).
This matches the source-defined field list and the legacy read-only
`schemas/migrations-reference.sql` `experiments` column shapes verbatim.

- `status`: retained as required **opaque text**. No accepted V1.0 source defines
  an Experiment status/lifecycle union (reference table is plain TEXT;
  `schemas/domain-types.ts` has only `ExperimentSnapshot`; `state-machines.json`
  defines none). No enum/CHECK/lifecycle transition invented (TASK item 3).
- `activation_policy`: the **one authoritative enum**. `16_ATTRIBUTION_EXPERIMENT_SPEC.md`
  §4 defines Distribution Experiment activation as `FIRST_REQUIRED_PUBLIC` |
  `ALL_REQUIRED_TERMINAL` (documented default `FIRST_REQUIRED_PUBLIC`). Enforced
  by DB text-enum + named CHECK `experiments_activation_policy_valid` and by the
  Zod enum. **No DB default** is set — the documented default is a later
  resolution rule, not an activation performed by this storage slice.
- Optional `activation_at`: nullable text, stored only, never set here.
- Four required JSON documents (`target_keyword_refs_json`,
  `target_prompt_refs_json`, `target_surface_refs_json`, `recheck_policy_json`):
  each validated at the database boundary by its own named CHECK —
  `json_valid(...)` on SQLite, equivalent `(...)::jsonb IS NOT NULL` on Postgres
  (same check names; schema-parity compares names). Stored verbatim; never
  decomposed into relational columns.
- Deliberately NOT shipped: `updated_at`, `experiment_snapshots`, any
  snapshot/activation-runtime/credential/account field.

## PROJECT RELATION AND DELETE DECISIONS

- `project_id` NOT NULL FK → `projects(id)` ON DELETE CASCADE (established
  Project-scoping FK).
- Required Topic: Project-leading composite FK
  `(project_id, topic_id) → search_topics(project_id, id)` ON DELETE CASCADE.
- Optional Opportunity: Project-leading composite FK
  `(project_id, opportunity_id) → search_growth_opportunities(project_id, id)`
  ON DELETE CASCADE. NULL is unconstrained (MATCH SIMPLE).
- Optional ReleaseBundle: Project-leading composite FK
  `(project_id, release_bundle_id) → release_bundles(project_id, id)`
  ON DELETE CASCADE. NULL is unconstrained.
- Delete behavior rationale: all three are parent-reference relations, and the
  established repository convention for same-Project parent references (all
  optional-profile FKs on `search_prompts` / `geo_observation_runs` /
  `search_growth_opportunities` / `indexing_observations`) is CASCADE. A
  composite FK whose leading `project_id` is NOT NULL cannot use `ON DELETE SET
  NULL`, so cascade is the consistent, non-dangling choice. `no action` was
  reserved by prior tasks for self-references/dependency pointers, not parent
  references.
- All referenced composite targets already exist and are unique:
  `search_topics_project_id_id_idx`, `search_growth_opportunities_project_id_id_idx`,
  `release_bundles_project_id_id_idx`.
- No business uniqueness added. No `experiments_project_id_id_idx` supporting
  index is added either: no child table exists yet; the later
  `experiment_snapshots` task adds its referential parent index alongside its own
  table (established convention).

## FILES CHANGED

- `src/db/search-growth.schema.ts` — added `experiments` SQLite table + header comment.
- `src/db/pg/search-growth.schema.ts` — added `experiments` Postgres mirror + header comment.
- `src/db/schema.ts` — export `experiments` from the provider-aware barrel.
- `src/types/schemas/experiment.ts` — new Zod/domain contract.
- `src/db/experiment.test.ts` — new migration-backed storage test.
- `src/types/schemas/experiment.test.ts` — new focused domain contract test.
- `drizzle/0074_experiments.sql` — generated DDL (unmodified content).
- `drizzle/meta/0074_snapshot.json` — generated snapshot.
- `drizzle/meta/_journal.json` — added entry idx 74, tag `0074_experiments`.
- `drizzle-pg/0052_experiments.sql` — generated DDL (unmodified content).
- `drizzle-pg/meta/0052_snapshot.json` — generated snapshot.
- `drizzle-pg/meta/_journal.json` — added entry idx 52, tag `0052_experiments`.

## DATABASE / MIGRATION CHANGES

- D1/SQLite forward migration **0074** (`drizzle/0074_experiments.sql`),
  snapshot `drizzle/meta/0074_snapshot.json`, journal tag `0074_experiments`.
- PostgreSQL forward migration **0052** (`drizzle-pg/0052_experiments.sql`),
  snapshot `drizzle-pg/meta/0052_snapshot.json`, journal tag `0052_experiments`.
- Both generated by `drizzle-kit` via `db:generate`; then renamed to the
  repo's descriptive names with journal tags updated (T128 precedent). DDL
  content unmodified. Re-running `db:generate` reports
  `No schema changes, nothing to migrate`, confirming snapshot/journal
  consistency.
- Local migration apply confirmed the new migration: `0074_experiments.sql ✅`.

## DEPENDENCIES CHANGED

None. No package.json / lockfile change.

## TESTS ADDED

- `src/db/experiment.test.ts` (10 tests): real in-memory SQLite from the shipped
  0074 DDL — full-field persistence; optional same-Project relations and NULL
  optional columns; cross-Project rejection for Topic/Opportunity/ReleaseBundle
  and dangling Project; activation-policy enum accept/reject; opaque status and
  four JSON-document validation (malformed rejected, valid stored verbatim);
  required-column NOT NULL; cascade delete on Project/Topic/Opportunity/
  ReleaseBundle; exact column set; exactly four FKs; no business unique index.
- `src/types/schemas/experiment.test.ts` (7 tests): Zod boundary — full contract
  verbatim, activation-policy enum, nullable optionals, required keys, missing
  fields, wrong primitive/JSON types, and compile-time row-type shape guard.

## COMMANDS RUN

All via `corepack pnpm <script>` on Windows Git Bash. Each run independently
(no chaining inside the command under test).

1. `corepack pnpm install --frozen-lockfile` (environment prerequisite; see
   DEVIATIONS) — exit 0, 1m31.2s.
2. `corepack pnpm run db:generate` — exit 0; generated
   `drizzle/0074_*.sql` + `drizzle-pg/0052_*.sql` (renamed to `..._experiments`).
3. `corepack pnpm run db:migrate:local` — exit 0; `0074_experiments.sql ✅`.
4. `corepack pnpm exec vitest run src/db/experiment.test.ts src/types/schemas/experiment.test.ts src/db/schema-parity.test.ts`
   — first run exit 1 (one test assertion bug, array vs element); fixed; exit 0
   (351 tests passed, 3 files).
5. `corepack pnpm exec vitest run src/db/experiment.test.ts src/types/schemas/experiment.test.ts`
   — exit 0 (17 tests passed, 2 files) after the knip fix.
6. `corepack pnpm exec prettier --write <6 task TS files>` — exit 0 (1 file
   reformatted, rest unchanged).
7. `corepack pnpm format:check` — exit 0 ("All matched files use Prettier code style!").
8. `corepack pnpm types:check` — exit 0.
9. `corepack pnpm lint` — exit 0 ("Found 0 warnings and 0 errors", 913 files).
10. `corepack pnpm test` — exit 0 (189 files, 1751 tests passed, 196.31s).
11. `corepack pnpm build` — exit 0 (vite build + `tsc --noEmit`).
12. `corepack pnpm ci:check` — first run exit 1 (knip: unused export
    `activationPolicySchema`); fixed by making it module-local; re-run exit 0
    (prettier + knip + tsc + badseo tsc + oxlint + sync-plugin-skills + sync
    check all clean).

## COMMAND RESULTS

- db:generate: exit 0, "No schema changes, nothing to migrate" on the
  idempotency re-run after rename.
- db:migrate:local: exit 0, migration `0074_experiments.sql` applied.
- Focused tests: exit 0 (351 passed incl. schema-parity 334; then 17 passed).
- format:check / types:check / lint: exit 0.
- Full test: exit 0, 1751 passed / 0 failed.
- build: exit 0.
- ci:check: exit 0 after the single knip fix.

No aggregate gate was sandbox-denied.

## RUNTIME EVIDENCE

- `db:migrate:local` applied the new D1 `0074_experiments.sql` to the local D1
  database (✅ in the migration output table).
- Migration-backed tests execute the shipped DDL in a real in-memory SQLite
  (foreign keys ON), proving same-Project enforcement, enum/JSON CHECKs, required
  columns, cascade deletes and the exact column/index/FK shape against the
  migration — not just the TypeScript schema.
- Full repo test suite and build both pass with the new table wired into the
  provider-aware barrel.

## KNOWN LIMITATIONS

- PostgreSQL migration is generated and parity-checked structurally, but not
  executed against a live Postgres: the approved command list contains no
  `db:migrate:pg` and no `POSTGRES_DATABASE_URL` is provisioned in this
  environment. `schema-parity.test.ts` guards dialect drift.
- Out of scope by TASK: Experiment snapshots, activation runtime, state
  transitions, attribution/measurement, provider calls, CRUD/UI, publication,
  credentials, paid/production behavior. No such code exists.
- The `activation_policy` enum is derived from
  16_ATTRIBUTION_EXPERIMENT_SPEC.md §4 (the only authoritative activation value
  set). `status` remains opaque because no authoritative union exists.

## DEVIATIONS FROM TASK

- The worktree shipped with **no `node_modules`**, so no approved gate could run.
  Before any gate I ran `corepack pnpm install --frozen-lockfile`. This is the
  documented baseline prerequisite (`21_TEST_ACCEPTANCE_PLAN.md` §2 and root
  `CLAUDE.md` Testing) but is **not** in TASK's APPROVED COMMANDS list; disclosed
  here explicitly. No package.json/lockfile change resulted.
- Generated migration filenames were renamed from drizzle-kit's random names to
  `0074_experiments` / `0052_experiments` with matching journal tags, following
  the accepted T128 precedent. DDL content and snapshot ids are unchanged.
- No other deviations.

## SECURITY NOTES

- Credential-free: no provider calls, no accounts, no secrets, no network use.
- No activation, scheduling, publishing, spend or production behavior.
- JSON documents are opaque and validated for well-formedness only; no
  relationship is encoded in JSON to avoid joins.
- Same-Project ownership is enforced by the database (composite FKs), not by
  application convention.
- No CAPTCHA/2FA bypass, no stealth behavior, no cookie upload, no scope or
  Accepted-ADR changes.

## GIT STATUS / DIFF SUMMARY

Working tree (branch `ai-task/T129-M1-EXPERIMENT-CORE-SCHEMA`, no commits made):

```
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? drizzle-pg/0052_experiments.sql
?? drizzle-pg/meta/0052_snapshot.json
?? drizzle/0074_experiments.sql
?? drizzle/meta/0074_snapshot.json
?? src/db/experiment.test.ts
?? src/types/schemas/experiment.test.ts
?? src/types/schemas/experiment.ts
```

`control/tasks/T129-M1-EXPERIMENT-CORE-SCHEMA/TASK.md` shows as modified before
this work began (line-ending only per `git diff`; not touched by this task).

Diff stat: `src/db/search-growth.schema.ts +215/-1`,
`src/db/pg/search-growth.schema.ts +115/-1`, `src/db/schema.ts +1`,
each journal `+7`; plus the new files listed above.

## READY FOR REVIEW

Yes. Implementation complete, all TASK gates run and green, no merge/publish
performed.
