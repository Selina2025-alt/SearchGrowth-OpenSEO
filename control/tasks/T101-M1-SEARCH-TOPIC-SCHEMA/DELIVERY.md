# DELIVERY — T101-M1-SEARCH-TOPIC-SCHEMA

IMPLEMENTATION STATUS: IMPLEMENTED — ROUND 2 FIX COMPLETE (not accepted; only the Controller may PASS)
READY FOR REVIEW: YES

## TASK ID

T101-M1-SEARCH-TOPIC-SCHEMA — M1 Core Domain, Round 2 (fix round). `REVIEW.md` (round 1, BLOCKED) was
present at start; this round implements **only** its two findings: the merge-pointer integrity MAJOR
finding and the format/CI BLOCKER (resolved by the Controller-supplied `ACCEPTANCE_LEDGER.md`
formatting correction already present in the worktree). No keyword refs, CRUD, UI, connector,
canonical-name uniqueness, or other product work was added.

## IMPLEMENTATION SUMMARY

Round 1 left the optional `merged_into_topic_id` self-reference enforcing none of its documented
lifecycle/Project invariants: the single-column self-FK accepted cross-Project targets and used
`ON DELETE SET NULL`, and there was no status/pointer coherence or self-merge guard. Round 2 replaces
that with a DB-enforced, cross-dialect-identical merge contract on both dialect schemas, the
migration artifacts, and the storage tests:

- **Composite same-Project self-reference FK** on both dialects:
  `(project_id, merged_into_topic_id) → search_topics(project_id, id)` with `ON DELETE NO ACTION`.
  Because `project_id` is the FK's leading column, a topic on Project A can never point at a topic on
  Project B.
- **Supporting composite unique target/index** `search_topics_project_id_id_idx(project_id, id)` — the
  only uniqueness the composite FK requires (an FK may reference only a unique key). No canonical-name
  or other business uniqueness was added.
- **Restrictive delete behavior** (`NO ACTION`, not `SET NULL`): deleting a merge target a `MERGED`
  topic still points at is rejected, so a merged row can never be silently left with no successor.
  `NO ACTION` is the restrictive action that behaves identically to `RESTRICT` for non-deferrable
  constraints on Postgres and, unlike a mid-statement `RESTRICT`, still lets a whole-Project
  `ON DELETE CASCADE` remove a merged topic and its successor together on SQLite (covered by a test).
- **Three named lifecycle/self-merge CHECKs** on both dialects (identical names, parity-asserted):
  - `search_topics_merged_requires_target` — `status <> 'MERGED' OR merged_into_topic_id IS NOT NULL`
    (a `MERGED` topic must name its successor);
  - `search_topics_only_merged_has_target` — `merged_into_topic_id IS NULL OR status = 'MERGED'`
    (only a `MERGED` topic carries a successor — `ACTIVE`/`ARCHIVED` never do);
  - `search_topics_merge_target_not_self` — `merged_into_topic_id IS NULL OR merged_into_topic_id <> id`
    (self-merge is rejected).
- **Unmerged round-1 migrations regenerated in place** at the same next-after-T100 identifiers
  (D1 **0046**, Postgres **0024**) with matching snapshots; the Postgres migration orders the
  supporting unique index *before* the composite-FK `ALTER TABLE` (required by Postgres). Final
  `db:generate` on both dialects reports **no schema change**.
- **Storage tests rebuilt from the real 0046 DDL** (1 → **7 tests**): the valid stable-ID merge plus
  migration-backed negative tests for cross-Project merge, `MERGED`-with-null-pointer, `ACTIVE`/
  `ARCHIVED`-with-pointer, self-merge, referenced-target deletion, and whole-Project cascade.

The stable-identity guarantee is unchanged: rename/archive/merge mutate the row in place, so the topic
`id` and `project_id` are preserved and no replacement identity is ever created (ADR-004).

## FILES CHANGED (this round)

### Source — modified
- `src/db/search-growth.schema.ts` — `search_topics`: `mergedIntoTopicId` is now a plain nullable text
  column; extra config adds the composite self-FK (`ON DELETE no action`), the supporting unique index,
  and the three CHECKs. Column-level Project FK (cascade) unchanged.
- `src/db/pg/search-growth.schema.ts` — Postgres mirror of the same structure.

### Tests — modified
- `src/db/search-topic.test.ts` — 1 → 7 tests; now enables `PRAGMA foreign_keys = ON` and exercises the
  real 0046 DDL for the valid stable-ID merge and every invalid merge state.

### Migrations / metadata — regenerated in place (unmerged round-1 files replaced)
- `drizzle/0046_search_topics.sql` — regenerated DDL (composite FK + checks + unique index).
- `drizzle/meta/0046_snapshot.json` — regenerated snapshot.
- `drizzle-pg/0024_search_topics.sql` — regenerated DDL; supporting unique index moved ahead of the
  composite-FK `ALTER TABLE` (Postgres FK requirement).
- `drizzle-pg/meta/0024_snapshot.json` — regenerated snapshot.
- `drizzle/meta/_journal.json` (idx 46 tag `0046_search_topics`),
  `drizzle-pg/meta/_journal.json` (idx 24 tag `0024_search_topics`) — journal re-created to match the
  regenerated files.

### Control channel (prettier-ignored, not part of repo baseline)
- `control/tasks/T101-M1-SEARCH-TOPIC-SCHEMA/DELIVERY.md` (this file),
  `control/tasks/T101-M1-SEARCH-TOPIC-SCHEMA/evidence/round-2/*`

Round-1 files carried forward unchanged: `src/db/schema.ts` (`searchTopics` barrel export),
`src/types/schemas/search-topic.ts`, `src/types/schemas/search-topic.test.ts`.

## DATABASE / MIGRATION CHANGES

### `search_topics` constraint inventory (identical on both dialects)
| artifact | definition |
| --- | --- |
| PK | `id` |
| Project FK | `project_id → projects(id) ON DELETE CASCADE` (established repo behavior) |
| Merge FK | `(project_id, merged_into_topic_id) → search_topics(project_id, id) ON DELETE NO ACTION` |
| Read index | `search_topics_project_idx(project_id)` (non-unique) |
| Supporting unique index | `search_topics_project_id_id_idx(project_id, id)` — exists **only** to satisfy the composite FK |
| CHECK | `search_topics_merged_requires_target` |
| CHECK | `search_topics_only_merged_has_target` |
| CHECK | `search_topics_merge_target_not_self` |

Columns, nullability, defaults, status enum (`ACTIVE | ARCHIVED | MERGED`), and system timestamps are
unchanged from round 1; the lifecycle enum stays a DB text-enum column validated by Zod at the domain
boundary (`src/types/schemas/search-topic.ts`, unchanged). No relational/lifecycle state is stored in
JSON.

### Constraint / lifecycle rationale (REVIEW MAJOR finding)
- **Same-Project merge targets** are enforced by the composite FK, not by application convention.
  `project_id` is the FK's leading column and the referenced pair is `(project_id, id)`.
- **status/pointer coherence** is enforced by the two lifecycle CHECKs: `MERGED` ⇔ non-null pointer.
- **Self-merge** is rejected by the `merge_target_not_self` CHECK.
- **Referenced-target deletion** is rejected (`NO ACTION`) instead of silently nulling the pointer
  (`SET NULL`), which previously turned a valid merged row into `status=MERGED` with no successor.
  `NO ACTION` (not `RESTRICT`) was chosen because it is the restrictive action identical to `RESTRICT`
  for non-deferrable constraints on Postgres, while on SQLite it is checked at statement end and
  therefore does not abort a whole-Project cascade that removes a merged topic and its same-Project
  successor together (verified by the cascade test).
- **No other product rule** was added: no canonical-name/locale uniqueness, no hidden merge behavior,
  no new domain fields.

### Migration identifiers
- D1 **0046** (`0046_search_topics`), journal idx 46; Postgres **0024** (`0024_search_topics`),
  journal idx 24 — unchanged from round 1 (the unmerged round-1 entries were rewound and regenerated at
  the same identifiers; there is no 0047/0025 churn). Both migrations are forward-only. Final
  `db:generate` reports **no schema change** on either dialect.

## DEPENDENCIES CHANGED

None. `corepack pnpm install --frozen-lockfile` → exit 0, "Lockfile is up to date / Already up to
date"; manifests and lockfile unchanged (`git status` clean of package files after install).

## TESTS ADDED

- `src/db/search-topic.test.ts` (7 tests, all migration-backed against the real `0046_search_topics.sql`
  in in-memory SQLite with `PRAGMA foreign_keys = ON`):
  1. **Valid stable-ID merge** — rename → archive → same-Project merge keeps exactly one row with the
     same `id` and `project_id`; a second-Project topic stays isolated (ADR-004 stable identity).
  2. **Cross-Project merge target rejected** — `MERGED` row on `proj_alpha` pointing at a `proj_beta`
     topic → composite FK violation.
  3. **`MERGED` without a target rejected** → `search_topics_merged_requires_target`.
  4. **`ACTIVE`/`ARCHIVED` with a target rejected** (both statuses) → `search_topics_only_merged_has_target`.
  5. **Self-merge rejected** → `search_topics_merge_target_not_self`.
  6. **Referenced-target deletion rejected** — deleting a successor a `MERGED` row still points at throws
     a FK error and the pointer is not nulled.
  7. **Whole-Project cascade preserved** — deleting a Project whose topics include a merged chain removes
     the chain (Project FK cascade + restrictive self-FK coexist).
- `src/db/schema-parity.test.ts` (189 tests, passes) now structurally compares `search_topics` on both
  dialect barrels including FK targets/`onDelete`, the unique-index set, and the three CHECK names.
- Round-1 boundary tests unchanged: `src/types/schemas/search-topic.test.ts` (3) still proves every DB
  status enum value passes the Zod schema and unsupported/lowercase/empty values are rejected.

## COMMANDS RUN

Run independently per the approved matrix; concise sanitized logs under
`control/tasks/T101-M1-SEARCH-TOPIC-SCHEMA/evidence/round-2/*`.

1. `node --version` → exit 0 → `v24.16.0`
2. `corepack pnpm --version` → exit 0 → `10.30.1`
3. `corepack pnpm install --frozen-lockfile` → exit 0 → lockfile up to date; manifests/lockfile unchanged
4. `corepack pnpm exec prettier --write <6 task-touched source/test files>` → exit 0, all "(unchanged)"
5. `corepack pnpm run db:migrate:local` → exit 0 → clean re-apply **0000→0046_search_topics.sql**
   (local state reset first), then re-run → `✅ No migrations to apply!`
6. `corepack pnpm run db:generate` → exit 0 → regenerated `0046`/`0024` (+snapshots) from the corrected
   schema; final run on both dialects: **"No schema changes, nothing to migrate"**
7. `corepack pnpm exec vitest run <5 focused files>` → exit 0 → **207/207 passed**
8. `corepack pnpm format:check` → **exit 0** → "All matched files use Prettier code style!"
9. `corepack pnpm types:check` → exit 0 → `tsc --noEmit` clean
10. `corepack pnpm lint` → exit 0 → oxlint 0 warnings / 0 errors
11. `corepack pnpm test` → exit 0 → **144 files / 1199 tests passed**
12. `corepack pnpm build` → exit 0 → vite client/ssr/open_seo_audit + `tsc --noEmit` clean
13. `corepack pnpm ci:check` → **exit 0** → prettier, knip, tsc (root + badseo), oxlint, plugin-skills
    sync all green
14. Read-only Git inspection: `git status`, `git diff --stat`, `git log` — see GIT STATUS/DIFF SUMMARY

## COMMAND RESULTS (evidence)

- **REVIEW BLOCKER resolved.** `format:check` and `ci:check` both exit 0 now that the Controller's
  formatting-only `control/ACCEPTANCE_LEDGER.md` correction is present. Claude did **not** edit the
  ledger.
- **REVIEW MAJOR resolved.** Both schemas, both migrations, and both snapshots now carry the composite
  same-Project FK, the supporting unique index, the three lifecycle/self-merge CHECKs, and restrictive
  (`NO ACTION`) delete behavior; every invalid state in the reproduction is covered by a
  migration-backed negative test and rejected by the DDL (see TESTS ADDED).
- **db:generate consistency** — final run on both dialects: "No schema changes, nothing to migrate",
  so the snapshots match the shipped schema exactly.
- Full-suite `test` was green in a single run this round (no flakiness): 1199/1199.

## RUNTIME EVIDENCE

- **D1/SQLite migration** — `0046_search_topics.sql` applies cleanly over the full local history on a
  fresh local D1 store; re-run reports no migrations to apply.
- **Storage/merge-integrity tests** — all 7 pass against the real 0046 DDL with foreign keys enabled:
  the DB itself rejects cross-Project merge, `MERGED`-without-target, `ACTIVE`/`ARCHIVED`-with-target,
  self-merge, and referenced-target deletion, while the valid stable-ID lifecycle and whole-Project
  cascade still succeed.
- **Schema parity** — `search_topics` structurally identical on SQLite and Postgres (columns, PK,
  unique targets incl. the supporting index, FKs incl. `onDelete`, and the three CHECK names);
  189/189 parity tests pass.
- **Postgres migration artifact** — pg migration SQL, journal, and snapshot are consistent
  (`db:generate:pg` clean); the pg DDL was reviewed so the supporting unique index is created before the
  composite-FK `ALTER TABLE` (a live `db:migrate:pg` still requires a real Postgres URL and is not in
  the approved command set — same limitation as round 1 and T100).

## KNOWN LIMITATIONS

- `db:migrate:pg` was not executed (requires a live `POSTGRES_DATABASE_URL`; not in the approved command
  set). PG migration/snapshot consistency is proven via `db:generate:pg` (no diff), the parity tests,
  and a review of the generated DDL ordering.
- Round-1's local D1 store had the old 0046 applied; the gitignored local D1 state was reset once so the
  corrected 0046 could be re-applied from scratch as evidence. No repo/production state is affected.
- Per scope: no keyword-ref/CRUD/repository/service/server-function/UI/connector/later-domain code was
  added; the traceability `mapping` gate closes in the later `search_topic_keyword_refs` task.
- Migration/snapshot JSON files are drizzle-kit output (`.prettierignore`'d) and are not prettier-formatted.

## DEVIATIONS FROM TASK

None in product scope. Round-2 design decisions recorded and explained above:
- Composite FK + supporting unique index + three named CHECKs implement the REVIEW MAJOR acceptance
  condition in both dialect schemas, migrations, and snapshots.
- Restrictive delete uses `NO ACTION` (documented rationale: identical to `RESTRICT` for non-deferrable
  constraints on Postgres, and statement-end checked on SQLite so the Project cascade can still remove a
  same-Project merged chain). No canonical-name uniqueness or other product rule was added.
- The unmerged round-1 `0046`/`0024` migration artifacts were rewound and regenerated at the same
  identifiers rather than layering a 0047/0025 correction on top; the migration remains a single
  forward-only create.

## SECURITY NOTES

- No external requests, credentials, account access, CAPTCHA/2FA bypass, stealth behavior, cookie upload,
  production publishing, or remote migration were performed.
- No dependency, lockfile, manifest, ADR, scope-lock, or production resource change.
- All work is local to the isolated worktree; `db:migrate:local` touches only the gitignored local Wrangler
  D1 state.
- No JSON/relational encoding of lifecycle or project data; no untrusted input path added (Zod boundary
  only, unchanged from round 1).

## GIT STATUS/DIFF SUMMARY

See `control/tasks/T101-M1-SEARCH-TOPIC-SCHEMA/evidence/round-2/14-git.txt`. Tracked modifications
(`git diff --stat`, 7 files, +236/−8) are: the two `search-growth.schema.ts` files, `src/db/schema.ts`
(round-1 export), the two `_journal.json` files, plus the Controller-owned `ACCEPTANCE_LEDGER.md`
(formatting) and `TASK.md` (round-2 text) — both unedited by the executor. Untracked additions:
regenerated `0046`/`0024` migration + snapshot files, `src/db/search-topic.test.ts`,
`src/types/schemas/search-topic.ts` and `.test.ts`, `DELIVERY.md`, and `evidence/round-2/*`.
No lockfile, package manifest, `.prettierignore`, ADR, scope, or production change is part of the diff.
Not committed; not merged.

## READY FOR REVIEW

Both dialect schemas define one logically equivalent, project-scoped `search_topics` table whose merge
pointer now enforces every documented invariant in DDL: same-Project targets (composite FK), a coherent
`MERGED` ⇔ non-null-pointer lifecycle, no self-merge, and restrictive delete behavior (no silent
`SET NULL`), with the supporting composite unique index the FK requires and no other product rule. The
unmerged round-1 migrations/snapshots were regenerated in place at the same next-after-T100 identifiers
(D1 0046, Postgres 0024); local D1 migration re-applies cleanly and a final `db:generate` reports no
schema change on either dialect. Migration-backed tests prove every invalid case (cross-Project merge,
`MERGED` with null target, `ACTIVE`/`ARCHIVED` with target, self-merge, referenced-target deletion) is
rejected and the valid stable-ID merge still preserves id and Project. Parity passes (189); focused
suite 207/207; full suite 144 files/1199 tests; `format:check`, `types:check`, `lint`, `build`, and the
full `ci:check` all exit 0 (the round-1 ledger formatting BLOCKER is resolved by the Controller's
correction). Not committed; not merged; REVIEW.md not edited; no other task started.
