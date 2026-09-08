# DELIVERY — T110-M1-SOURCE-REF-SCHEMA (round 1)

## TASK ID

`T110-M1-SOURCE-REF-SCHEMA` — implementation round 1. No `REVIEW.md` existed for
this task at round start, so there were no review findings to address.

## IMPLEMENTATION SUMMARY

Added the normalized, Project-scoped `source_refs` storage and domain-validation
foundation across both dialects (D1/SQLite + PostgreSQL), with a
migration-backed storage spec, a Zod domain-boundary module and its boundary
tests. This is schema/contract only — no claim verification, crawling, URL
fetching, reachability/URL validation, source-content classification or
inference, CRUD/UI, or external action was implemented.

Storage contract shipped:

- Stable text `id`, explicit `project_id` (NOT NULL FK → `projects(id)` ON
  DELETE CASCADE), and the V1.0 `type`, `ref`, and `captured_at` contract.
- `type` = the exact V1.0 SourceRef union `URL | INTERNAL_DOC | PRODUCT_FACT |
  RESEARCH` — as a DB text-enum column AND a named CHECK constraint, so
  unsupported/case-mismatched/legacy values are rejected at the storage boundary
  on every dialect.
- `ref` = the §9 reference value exactly as captured (opaque text; meaning
  follows `type`). `captured_at` = the application-supplied capture moment,
  distinct from the append-only system `created_at` insert timestamp.
- Append-only shape: no `updated_at`, no update/delete API, no repository or
  service and no mutation surface — a captured source reference is written once
  and never changed (immutability by schema/contract shape, matching the accepted
  run/parse/citation tables).
- Project ownership is the row's only relationship (no JSON-encoded
  relationships); deleting a whole Project cascades its source references away,
  so a source reference can never dangle. No business uniqueness index was added
  (TASK forbids it without a direct contract); the single non-unique
  `source_refs_project_idx` serves the project → source-refs read path and the
  project-delete cascade path.

## FIELD RECONCILIATION

Sources: `05_DOMAIN_DATA_MODEL.md` §9 SourceRef (direct field contract), the TASK
field list, `schemas/domain-types.ts` `SourceRef` (legacy reference artifact),
and `schemas/migrations-reference.sql` `source_refs` (legacy migration
reference). Reference files are read-only and were NOT edited (established
pattern — they are design-time artifacts; the V1.0 direct contract wins).

| Stored column | §9 (authoritative) | domain-types / migrations-reference | Decision |
| --- | --- | --- | --- |
| `id` | (stable id, implied) | `id` | Shipped as PK (established convention). |
| `project_id` | (explicit Project) | `project_id` | Shipped NOT NULL; FK to `projects(id)` ON DELETE CASCADE. |
| `type` | V1.0 `type` union `URL \| INTERNAL_DOC \| PRODUCT_FACT \| RESEARCH` | legacy `kind` union `URL \| INTERNAL_EVIDENCE \| CLAIM \| PUBLICATION \| OTHER` | Shipped NOT NULL with the exact §9 four-value union; legacy union reconciled OUT. |
| `ref` | `ref` | `url` + `evidence_ref` split | Shipped NOT NULL as the single §9 reference value; legacy split collapsed into it. |
| `captured_at` | `captured_at` | `created_at` (capture time) | Shipped NOT NULL as application capture moment. |
| `created_at` | system timestamp | `created_at` | Shipped NOT NULL append-only insert timestamp (established convention). |
| — | — | legacy `title`, `classification`, `source_kind` | Reconciled OUT (see below). |

Reconciled OUT (documented, not shipped):

- Legacy `kind`/`source_kind` naming and the legacy union values
  `INTERNAL_EVIDENCE | CLAIM | PUBLICATION | OTHER` — §9 replaces that union with
  its own four-value union, with no free-form/`OTHER`/implicit fallback.
- Legacy `title` and `classification` — §9's SourceRef defines no title or
  classification (the classification in the §9 Claim block and on
  ContentPackageVersion belongs to those rows, not to each source reference), so
  no classification union is invented on the row and no classification column is
  shipped.
- Legacy separate `url` / `evidence_ref` columns — V1.0 names a single `ref`
  value; the split collapses into it.
- No JSON-encoded relationships anywhere — relational identity stays in the typed
  FK columns.

## CONSTRAINT / ENUM DECISIONS

- Project FK is DB-enforced: `project_id` is a NOT NULL FK to `projects(id)` with
  ON DELETE CASCADE, so a source reference naming a missing Project is rejected
  by the DB and deleting a whole Project cascades its source references away.
- `type` union (exact §9) = `URL | INTERNAL_DOC | PRODUCT_FACT | RESEARCH`.
  Enforced twice: the DB text-enum column + named CHECK `source_refs_type_valid`
  (`type IN ('URL','INTERNAL_DOC','PRODUCT_FACT','RESEARCH')`) on both dialects,
  and the Zod `sourceRefTypeSchema` boundary (`z.enum(sourceRefs.type.enumValues)`)
  at runtime. The Zod boundary test rejects the legacy `kind` values, lowercase/
  case-mismatched variants, unsupported classifications (`WEB_PAGE`, `PDF`,
  `DOCUMENT`, `CITATION`, `ARTICLE`, `NONE`) and empty strings.
- No business uniqueness index (TASK forbids it). Only the non-unique
  `source_refs_project_idx` on `project_id` is added (read/cascade path).
- `source_refs` has no other parent in the accepted schema yet (the Claim and
  Content tables arrive in later tasks and reference source refs by id), so
  Project ownership is the row's only relationship.

## MIGRATION IDS

- D1/SQLite: `drizzle/0056_organic_blue_blade.sql` (+ `drizzle/meta/0056_snapshot.json`,
  `drizzle/meta/_journal.json` idx 56).
- PostgreSQL: `drizzle-pg/0034_hard_moon_knight.sql` (+
  `drizzle-pg/meta/0034_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 34).

Both migrations carry only the intended minimal `source_refs` DDL: CREATE TABLE
with the six columns, the named CHECK, the Project FK (inline in D1, ALTER-added
in PG), and the `source_refs_project_idx` index.

## FILES CHANGED

Modified:

- `src/db/search-growth.schema.ts` — appended the SQLite `sourceRefs` table (six
  columns, Project FK ON DELETE CASCADE, named CHECK `source_refs_type_valid`,
  `source_refs_project_idx` index); extended the top-of-file max-lines header
  comment (T109 → T110).
- `src/db/pg/search-growth.schema.ts` — appended the structurally identical
  Postgres `sourceRefs` mirror (PG `isoNow` timestamp default); extended the
  top-of-file max-lines header comment.
- `src/db/schema.ts` — added `sourceRefs` to the destructured barrel exports.
- `drizzle/meta/_journal.json`, `drizzle-pg/meta/_journal.json` — generated by
  `db:generate`.

Added:

- `src/types/schemas/source-ref.ts` — Zod domain-boundary module
  (`sourceRefTypeSchema`, exported `SourceRef` = `InferSelectModel<typeof
  sourceRefs>` and `SourceRefType` types) with the full V1.0-vs-legacy
  reconciliation comment.
- `src/types/schemas/source-ref.test.ts` — boundary tests (3).
- `src/db/source-ref.test.ts` — migration-backed storage spec (7 tests) through
  the shipped 0056 DDL.
- `drizzle/0056_organic_blue_blade.sql`, `drizzle/meta/0056_snapshot.json`,
  `drizzle-pg/0034_hard_moon_knight.sql`, `drizzle-pg/meta/0034_snapshot.json`.
- `control/tasks/T110-M1-SOURCE-REF-SCHEMA/evidence/round-1/gates.md`.

## DEPENDENCIES CHANGED

None. `corepack pnpm install --frozen-lockfile` exit 0 on the clean worktree; no
package.json / lockfile change was made.

## TESTS ADDED

- `src/types/schemas/source-ref.test.ts` — 3 tests: every `type` column enum
  value is a valid `SourceRefType`; unsupported / legacy (`INTERNAL_EVIDENCE`,
  `CLAIM`, `PUBLICATION`, `OTHER`) / case-mismatched / empty source types are
  rejected; exported row/enum types align with the storage columns (compile-time
  Pick + runtime assertions).
- `src/db/source-ref.test.ts` — 7 migration-backed tests through the actual 0056
  DDL with `PRAGMA foreign_keys = ON`: valid full-field §9 persistence; every V1.0
  type value round-trips; NOT NULL enforcement (type/ref/captured_at); enum CHECK
  rejection of unsupported/legacy/case-mismatched types; dangling-Project FK
  rejection; whole-Project delete cascade; append-only exact column-shape
  assertion (`captured_at, created_at, id, project_id, ref, type` — no
  updated_at, no legacy title/classification/url/evidence_ref column).
- Parity coverage: the new table is automatically covered by
  `src/db/schema-parity.test.ts` (SQLite vs PG mirror).

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...` (no
bare `pnpm`, no `--dangerously-skip-permissions`, no chained shells), per the
TASK's "use the T109 approved command matrix exactly".

1. `node --version` → v24.16.0.
2. `corepack pnpm --version` → `10.30.1`.
3. `corepack pnpm install --frozen-lockfile` → exit 0 (clean worktree; node_modules
   was missing and was installed fresh).
4. `corepack pnpm run db:generate` → exit 0 — generated D1 `0056_organic_blue_blade`
   + PG `0034_hard_moon_knight`; re-run at the end reports `No schema changes,
   nothing to migrate` on BOTH dialects (clean final dual-dialect generation).
5. `corepack pnpm exec prettier --write <task-touched files>` → exit 0 — no
   changes required.
6. `corepack pnpm run db:migrate:local` → exit 0 — applied 0000→0056 locally;
   `0056_organic_blue_blade.sql` `✅` (large output auto-persisted to the
   tool-results file; tail verified the 0056 line).
7. `corepack pnpm exec vitest run src/db/source-ref.test.ts src/types/schemas/source-ref.test.ts src/db/schema-parity.test.ts` → exit 0 — 249 tests passed (7 + 3 + 239).
8. `corepack pnpm format:check` → exit 0.
9. `corepack pnpm types:check` → exit 0.
10. `corepack pnpm lint` → exit 0 — `Found 0 warnings and 0 errors` (877 files).
11. `corepack pnpm test` → exit 0 — 162 files / 1393 tests passed.
12. `corepack pnpm run build` → exit 0.
13. `corepack pnpm run ci:check` → exit 0.

## COMMAND RESULTS

All TASK-required gates pass on the final tree: focused tests 249/249,
`format:check` exit 0, `types:check` exit 0, `lint` exit 0 (0/0 on 877 files),
full `test` 162 files/1393 tests, `build` exit 0, `ci:check` exit 0, and a clean
final dual-dialect `db:generate` re-run on both dialects. Exact exits are recorded
in `evidence/round-1/gates.md`.

## RUNTIME EVIDENCE

See `control/tasks/T110-M1-SOURCE-REF-SCHEMA/evidence/round-1/gates.md` — concise
sanitized log of migration content, test counts, gate exits, and tooling
versions.

## KNOWN LIMITATIONS

- The `ref` column stores the §9 reference value as opaque text exactly as
  captured. No URL/reachability validation, normalization, fetching, or source
  content inspection happens in this slice; `ref` fixtures in tests are produced
  by a later out-of-scope capture/verification task.
- The Zod boundary validates the `type` enum and the row shape only; full-row
  CRUD/input schemas belong to the later source-ref capture/CRUD task.
- No classification union is defined on the source reference row — §9 carries no
  classification on SourceRef, so none is invented here.
- The schema-barrel `max-lines` header comments (SQLite + PG) and the new
  storage-spec file's `max-lines, max-lines-per-function` disable are line-count
  exemptions only; schema-parity, types, and lint pass on the final tree.

## DEVIATIONS FROM TASK

None. The implementation ships exactly the direct §9/TASK field list
(id, project_id, type, ref, captured_at + the append-only created_at), the
V1.0 four-value type union, DB-enforced Project FK, named-CHECK enum rejection,
and append-only shape. The legacy reference-only `title`/`classification`/
`url`/`evidence_ref`/`source_kind` fields are reconciled OUT per §9 (see FIELD
RECONCILIATION) — the established T104 pattern of not shipping reference-only
fields without a direct V1.0 contract, and reference files are not edited.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state (`db:migrate:local`) and
  in-memory SQLite built from the shipped forward migration DDL.
- No network/provider/publishing action occurred. No `--dangerously-skip-
  permissions` was used. No commit, merge, or push was performed.
- Scope lock/ADRs were not edited. `REVIEW.md` (T110) does not exist and was not
  created/edited.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T110-M1-SOURCE-REF-SCHEMA`; HEAD `6614b3d`.
- Working tree is NOT committed (round 1 stops at delivery).
- Modified tracked files: `drizzle/meta/_journal.json`, `drizzle-pg/meta/_journal.json`
  (db:generate); `src/db/pg/search-growth.schema.ts`, `src/db/search-growth.schema.ts`,
  `src/db/schema.ts`.
- Added files: `drizzle/0056_organic_blue_blade.sql`, `drizzle/meta/0056_snapshot.json`,
  `drizzle-pg/0034_hard_moon_knight.sql`, `drizzle-pg/meta/0034_snapshot.json`,
  `src/db/source-ref.test.ts`, `src/types/schemas/source-ref.ts`,
  `src/types/schemas/source-ref.test.ts`, and the
  `control/tasks/T110-M1-SOURCE-REF-SCHEMA/evidence/round-1/` evidence channel.
- `git diff --stat` (tracked): 5 files, +198/−2. `git diff --check` clean. Full
  status is clean except the above listed task files.

## READY FOR REVIEW

Round 1 storage/contract slice is complete and verified: normalized
`source_refs` on D1 (0056) and PG (0034) with the explicit Project FK, the exact
§9 four-value type union enforced by named CHECK on both dialects, the Zod
`SourceRefType` boundary, append-only shape, no business uniqueness, and the
migration-backed storage + boundary + parity tests. Gates: focused 249/249,
`format:check` 0, `types:check` 0, `lint` 0/0, full `test` 1393/1393, `build` 0,
`ci:check` 0, clean final `db:generate` on both dialects. DELIVERY records the
field reconciliation, constraint/enum decisions, migration IDs, command exits,
scope/security declaration, and final Git status. No `PASS` verdict is written by
the implementation round.
