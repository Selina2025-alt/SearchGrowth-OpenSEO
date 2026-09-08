# DELIVERY — T108-M1-GEO-CITATION-SCHEMA

IMPLEMENTATION STATUS: IMPLEMENTED — ROUND 1 (only the Controller may PASS)
READY FOR REVIEW: YES

## TASK ID

T108-M1-GEO-CITATION-SCHEMA — M1 Core Domain, schema-and-contract slice establishing the
normalized, Project-scoped `GeoCitation` persistence foundation for V1.0. This is implementation
**round 1**: the direct §7 contract (05_DOMAIN_DATA_MODEL.md §7 GeoCitation) is shipped as
D1/SQLite `geo_citations` (`drizzle/0054_optimal_magik.sql`) and the identical Postgres mirror
(`drizzle-pg/0032_eminent_alex_wilder.sql`), plus the Zod runtime boundary, migration-backed storage
tests, and dual-dialect parity. Per scope, **no** parser/extraction, URL normalization
implementation, ownership classification logic, receipt matching, provider/network code, CRUD/UI,
dependency, or external action was added. All work is on the isolated worktree branch
`ai-task/T108-M1-GEO-CITATION-SCHEMA` at HEAD `f06226d939858ed98b9cff2efe55911d65e4dd58` (dispatch
commit; clean at start). Nothing was committed, merged, or published; no other task started;
`REVIEW.md` does not exist for T108 and was not created or edited.

## IMPLEMENTATION SUMMARY

Both dialects now store normalized, append-only, Project-scoped citation rows:

`geo_citations` — `id (text PK), project_id (NOT NULL FK → projects ON DELETE CASCADE), parse_id
(NOT NULL, same-Project composite FK-bound), raw_url (NOT NULL), normalized_url (NOT NULL), domain
(NOT NULL), title? (nullable), position? (nullable integer), source_ownership (NOT NULL text-enum
column), matched_publication_receipt_id? (nullable scalar reference), created_at (append-only text
timestamp)`, plus the single non-unique `geo_citations_parse_idx (parse_id)` read/cascade-support
index. There is no `updated_at`, no current-pointer column, no parser runtime column, no
JSON relationship/parser-output payload, and no business-unique index.

### Field reconciliation (TASK DELIVERY requirement)

§7 GeoCitation in `05_DOMAIN_DATA_MODEL.md` is the **direct field contract** and is implemented
verbatim (field names match exactly): `run_id / parse_id`, `raw_url`, `normalized_url`, `domain`,
`title`, `position`, `source_ownership`, `matched_publication_receipt_id?`.
`schemas/domain-types.ts` (`GeoCitation`/`CitationOwnership`) and `schemas/migrations-reference.sql`
(`geo_citations`) are reference/context artifacts (T105/T106 precedent). Mapping:

| Stored column | §7 (authoritative) | domain-types / migrations-reference | Decision |
|---|---|---|---|
| `id` | (relations-first snippet omits it) | `id` (both artifacts) | Stable text PK, the established Search Growth convention for every V1.0 row. |
| `project_id` | (not in snippet) | (not in either artifact) | Explicit Project ownership key (TASK item 1 "explicit project key"; T107 Round-2 pattern). NOT NULL FK → `projects(id)` ON DELETE CASCADE, enabling the same-Project composite FK below. |
| `parse_id` | `run_id / parse_id` | `runId` / `run_id` | Resolved to the **concrete Parse** side: a citation is a parser-extracted/reconciled output of one immutable, versioned Parse (ADR-005), and binding the concrete Parse is what makes Parse-version isolation structural (a parser upgrade creates a new parse row whose citations coexist with, never overwrite, the prior version's). The citation's run is that parse's run via `geo_observation_parses.run_id` — transitive, so no `run_id` column is duplicated here (a run-bound copy would denormalise Parse → Run and could name a run inconsistent with the citation's parse). `domain-types`/reference `run_id`/`runId` are treated as that transitive-run simplification; run-level raw citation storage was already reconciled out of the accepted run schema (T105 keeps raw citations inside the raw response until a parse extracts them). |
| `raw_url` | `raw_url` | `rawUrl` / `raw_url` | NOT NULL; the citation URL exactly as cited. No normalization performed in this slice. |
| `normalized_url` | `normalized_url` | `normalizedUrl` / `normalized_url` | NOT NULL; normalized identity key (later URL-normalization task output), stored as the typed input for later URLIdentity/receipt matching. |
| `domain` | `domain` | `domain` / `domain` | NOT NULL citation site domain (later attribution-task output). |
| `title` | `title` | `title?` / `title` | Nullable; NULL = the source answer gave none. |
| `position` | `position` | `position?` / `citation_position` | Nullable integer; §7's direct field name is kept (reference `citation_position` is a design-artifact rename, as in the T105 `fidelity` reconciliation). |
| `source_ownership` | `source_ownership` | `ownership` (CitationOwnership) / `ownership` | NOT NULL text-enum column over exactly `OWNED_DOMAIN \| CONTROLLED_PUBLICATION \| EARNED_THIRD_PARTY \| COMPETITOR \| UNKNOWN`. §7's direct field name `source_ownership` is kept (both reference artifacts rename it to `ownership`). Zod boundary `src/types/schemas/geo-citation.ts` rejects unsupported/case-mismatched/empty values; no classification logic exists — `UNKNOWN` is the value a not-yet-classified citation carries. |
| `matched_publication_receipt_id` | `matched_publication_receipt_id?` | `matchedPublicationReceiptId?` / `matched_publication_receipt_id` | Nullable scalar reference, exactly as the reference SQL declares it (no FK): the `publication_receipts` table does not exist in the accepted schema yet. The same-Project composite FK to `publication_receipts` is added by that later task's migration alongside the table itself. NULL = no receipt matched. |
| `created_at` | (not in snippet) | `created_at` (reference only) | Append-only system insert timestamp. No `updated_at`; a citation is written once as part of its immutable parse. |
| (dropped) | — | `sourceType?`, `source_type`; `safe_url_status` | **Not shipped**: the §7/TASK field list names no source-type or safe-URL column, and no classification/URL-safety behavior is authorized here. |
| (dropped unique) | — | `UNIQUE (run_id, normalized_url)` | **Not shipped**: the TASK forbids business uniqueness, and the same URL can legitimately be cited at several positions / by several parse versions. |

### Ownership FKs / delete behavior / Parse-version isolation (TASK items 1–2, 4)

- **Explicit ownership key**: every citation carries its own `project_id` (NOT NULL FK →
  `projects(id)` ON DELETE CASCADE).
- **Same-Project composite FK**: `(project_id, parse_id) → geo_observation_parses(project_id, id)`
  ON DELETE CASCADE, leading with the row's own `project_id`. The DB (not application convention)
  rejects a citation whose concrete Parse belongs to another Project **and** rejects a citation row
  whose own `project_id` does not match its Parse. The referenced target pair is unique via the
  existing supporting `geo_observation_parses_project_id_id_idx` (added by T107's `0053` as the
  composite-FK target index, not a business rule).
- **Optional receipt same-Project enforcement** is deferred by design: `matched_publication_receipt_id`
  is an unconstrained scalar column because `publication_receipts` does not exist yet; the later task
  that creates that table adds the same-Project composite FK. Documented in the schema header and
  here rather than faked as JSON/text or an invalid FK.
- **Delete behavior**: deleting a Parse (parser-version cleanup), or a whole Project (through the
  existing Run/Parse project cascades), cascades the citation away; a citation can never dangle. No
  orphan/current-pointer path exists.
- **Parse-version isolation is structural**: citations bind the concrete immutable source Parse row
  (v1 or v2), never a mutable current pointer, so v1/v2 citations coexist and deleting v1 leaves v2
  intact (migration-tested).
- **Append-only**: no `updated_at`; the only write surface is one immutable insert under its parse.

## FILES CHANGED

Source (modified, tracked):
- `src/db/search-growth.schema.ts` — appends the `geoCitations` SQLite table (with the
  §7-field-reconciliation header comment) to the SQLite barrel.
- `src/db/pg/search-growth.schema.ts` — appends the identical Postgres `geoCitations` mirror (and a
  top-of-file `/* eslint-disable max-lines -- … */` header comment, matching the SQLite barrel's
  convention).
- `src/db/schema.ts` — +1 barrel export `geoCitations`.

Source (new):
- `src/types/schemas/geo-citation.ts` — Zod boundary module: `GeoCitation` (`InferSelectModel`),
  `citationSourceOwnershipSchema` (`z.enum` over the column's `enumValues`), `CitationSourceOwnership`.
- `src/types/schemas/geo-citation.test.ts` — boundary tests (accept the 5 enum values; reject
  case-mismatched/unsupported/empty; row-type compile-time alignment).
- `src/db/geo-citation.test.ts` — migration-backed storage spec (12 tests) over the shipped
  `0054` DDL and its parents.

Migrations/metadata (new + tracked journal edits):
- `drizzle/0054_optimal_magik.sql` + `drizzle/meta/0054_snapshot.json`; `drizzle/meta/_journal.json`
  (+idx 54).
- `drizzle-pg/0032_eminent_alex_wilder.sql` + `drizzle-pg/meta/0032_snapshot.json`;
  `drizzle-pg/meta/_journal.json` (+idx 32).

Control channel (untracked, not repo baseline): `TASK.md` (dispatch brief; unchanged), `DELIVERY.md`
(this file), `evidence/round-1/approved-commands.md`. `REVIEW.md` does not exist and was not created.

## DATABASE / MIGRATION CHANGES

- **D1/SQLite `0054_optimal_magik.sql`**: `CREATE TABLE geo_citations` (11 columns, 2 FKs — the
  `projects(id)` project FK and the same-Project composite `(project_id, parse_id)` parse FK, both
  ON DELETE CASCADE) + `CREATE INDEX geo_citations_parse_idx` (non-unique). No business-unique index.
- **Postgres `0032_eminent_alex_wilder.sql`**: identical `geo_citations` shape with the two FK
  constraints and the btree `geo_citations_parse_idx`.
- Final dual-dialect `db:generate` is a clean no-op ("No schema changes, nothing to migrate" on both
  dialects), so the D1 `0054` / Postgres `0032` migrations and their snapshots agree with the current
  schemas. Local D1 migration applied the full chain through `0054` and is idempotent ("No migrations
  to apply!").
- Accepted historical migrations (`0051`/`0029` and earlier, `0052`/`0053`, `0030`/`0031`) are
  unmodified.

## DEPENDENCIES CHANGED

None. No package added or updated; `package.json`/`pnpm-lock.yaml` unchanged.
`corepack pnpm install --frozen-lockfile` exit 0 (Done in 55.4s) on the clean worktree (node_modules
was absent before this round).

## TESTS ADDED

- `src/types/schemas/geo-citation.test.ts` — 3 tests: every `source_ownership` column enum value
  accepted; case-mismatched/unsupported/empty values rejected (e.g. `owned_domain`, `Owned`,
  `CONTROLLED_publication`, `earned_third_party`, `Competitor`, `unknown`, `OWNED_DOMAIN `,
  `PUBLISHER`, `PAID`, `REFERRAL`, `CITATION`, `DOMAIN`, `NONE`, ``); exported row/enum types stay
  aligned with the storage columns (full and nullable-optional-field row shapes).
- `src/db/geo-citation.test.ts` — 12 migration-backed tests (real in-memory SQLite, `PRAGMA
  foreign_keys = ON`, applying migrations 0045→0054 incl. the shipped `0054`):
  valid full-field persistence; optional-parent fields store NULL when omitted; NOT NULL enforcement
  (`source_ownership`, `domain`); same-Project Parse citation allowed; dangling-parse parent-FK
  rejection; cross-Project (Project-B parse into a Project-A row) rejection; explicit citation
  Project-mismatch rejection; all 5 `source_ownership` enum values round-trip; Parse-version
  isolation (v1/v2 citations coexist, run row untouched); parse-delete cascade removes only that
  version's citations; whole-Project delete cascade; append-only schema shape with ONLY the §7/direct
  fields plus `project_id` and `created_at`.
- Dual-dialect parity is auto-covered by `src/db/schema-parity.test.ts` (229 tests on the final
  tree, including `geo_citations` in both dialects).

## COMMANDS RUN

Each approved command ran literally and independently via `corepack pnpm ...` (no bare `pnpm`, no
chained shell wrapping of multiple commands). Sanitized evidence under
`control/tasks/T108-M1-GEO-CITATION-SCHEMA/evidence/round-1/`.

1. `node --version` → exit 0 — `v24.16.0`.
2. `corepack pnpm --version` → exit 0 — `10.30.1`.
3. `corepack pnpm install --frozen-lockfile` → exit 0 — `Done in 55.4s`.
4. `corepack pnpm exec prettier --write src/db/search-growth.schema.ts src/db/pg/search-growth.schema.ts src/db/schema.ts src/types/schemas/geo-citation.ts src/types/schemas/geo-citation.test.ts src/db/geo-citation.test.ts` → exit 0 — schema files/barrel unchanged; two new test files reflowed.
5. `corepack pnpm run db:migrate:local` → exit 0 — applied 0000→0054; re-run `✅ No migrations to apply!`.
6. `corepack pnpm run db:generate` → exit 0 — generated D1 `0054_optimal_magik` + PG `0032_eminent_alex_wilder`; re-run both dialects `No schema changes, nothing to migrate`.
7. `corepack pnpm exec vitest run src/db/geo-citation.test.ts src/types/schemas/geo-citation.test.ts src/db/schema-parity.test.ts` → exit 0 — 3 files / 244 tests passed (run before and after prettier: identical).
8. `corepack pnpm format:check` → exit 0 — `All matched files use Prettier code style!`.
9. `corepack pnpm types:check` → exit 0 — `tsc --noEmit` clean.
10. `corepack pnpm lint` → exit 0 — `Found 0 warnings and 0 errors` over 871 files.
11. `corepack pnpm test` → first run exit 1 (5 timeout failures in UNRELATED suites — cold-import hook
    timeouts under full-suite parallelism on the slow Windows executor); re-run exit 0 —
    158 files / 1350 tests passed.
12. `corepack pnpm build` → exit 0 — vite client + SSR + `open_seo_audit` builds and trailing
    `tsc --noEmit` clean (chunk-size advisory warnings only).
13. `corepack pnpm ci:check` → exit 0 — prettier, knip, both `tsc --noEmit` runs, oxlint 0/0,
    plugin-skill sync (`Synced 9 skills`), sync check clean.
14. Read-only Git inspection: `git status --short`, `git rev-parse HEAD`, `git diff --stat`,
    `git ls-files`.

Not run (with reason): `db:migrate:pg` (requires a live `POSTGRES_DATABASE_URL`; not in the approved
command set — Postgres consistency is proven by the `db:generate` no-op, schema-parity, and DDL
review). No commit/merge/REVIEW edit/publish was performed.

## COMMAND RESULTS

- `format:check` exit 0; `types:check` exit 0; `lint` exit 0 (0/0); `build` exit 0;
  `ci:check` exit 0 — all on the final tree.
- Focused suite exit 0: `src/db/geo-citation.test.ts` (12), `src/types/schemas/geo-citation.test.ts`
  (3), `src/db/schema-parity.test.ts` (229) = 244 tests.
- Full `test`: first run exit 1 — 5 failures, all `Hook timed out`/`Test timed out` in suites T108
  does not touch (`src/server/auth/workspace-merge.test.ts`,
  `src/server/features/project-context/repositories/ProjectContextRepository.query.test.ts`,
  `src/server/mcp/oauth-refresh.e2e.test.ts`,
  `src/server/features/keywords/services/research/saved-keywords.test.ts`, +1) caused by cold-import
  hook timeouts under heavy full-suite parallelism on the slow executor (a Windows/processor-capacity
  artifact, not a code failure — every T108 suite passed in that same run). Re-run exit 0:
  **158 files / 1350 tests passed**, including all four previously-timed-out suites.

## RUNTIME EVIDENCE

- All TASK-required gates pass on the final tree: focused tests, `format:check`, `types:check`,
  `lint`, full `test` (re-run), `build`, and `ci:check` — exact exits recorded above and in
  `evidence/round-1/approved-commands.md`.
- Local D1 migration applied through `0054` and is idempotent; the final dual-dialect `db:generate`
  is a clean no-op (D1 `0054`/PG `0032` snapshots agree with the schemas).
- The DB text-enum column values, the Zod boundary, and the storage tests agree; schema-parity (229)
  confirms the SQLite/Postgres mirrors stayed structurally identical after the addition.

## KNOWN LIMITATIONS

- `db:migrate:pg` was not executed (no live `POSTGRES_DATABASE_URL`; not approved). Postgres
  migration/snapshot correctness is established via the clean dual-dialect `db:generate` no-op, the
  229 schema-parity tests, and the generated DDL review.
- `matched_publication_receipt_id` is an unconstrained nullable scalar (no FK) because the
  `publication_receipts` table does not exist in the accepted schema; the same-Project composite FK
  to that table arrives with the later task that creates it (migrations-reference.sql itself declares
  the column with no FK).
- The first full `test` run's 5 timeout failures are an executor-capacity artifact, recorded
  transparently; the re-run is green (158 files / 1350 tests) and no T108 code changed between runs.
- Migration tags (`0054_optimal_magik`, `0032_eminent_alex_wilder`) are drizzle-kit's auto-generated
  names; the required next identifiers (D1 `0054`, Postgres `0032`) and journal/snapshot entries agree.
- The schema barrels carry repo-conventional file-scoped `max-lines` disables (both were already at
  or past the 400-line code cap from accepted prior tables; T108's additions keep them over). This is
  a line-count exemption only; schema-parity and lint pass.
- Per scope: no URL normalization, ownership classification, matching/attribution, provider, CRUD,
  repository/service/UI, parser/runtime, or `publication_receipts` implementation was added; the
  raw/normalized URL values in tests are fixtures a later out-of-scope task will produce.

## DEVIATIONS FROM TASK

No product-scope deviations. Authorized design decisions (recorded here for the Controller):
(1) §7's `run_id / parse_id` is realized as a required concrete `parse_id` binding (not a run_id
column) so Parse-version isolation is structural and the citation's run is reached transitively
through its parse; (2) the reference artifacts' `ownership`/`citation_position`/`run_id` renames are
reconciled to §7's direct names `source_ownership`/`position` and the parse-side binding;
(3) reference-only `source_type`/`safe_url_status` fields and the `(run_id, normalized_url)` unique
index are not shipped (absent from §7/TASK; business uniqueness forbidden); (4) the optional
publication-receipt relation is stored as the reference SQL does (unconstrained scalar) pending the
later `publication_receipts` table. No accepted migration was edited; `db:generate` produced exactly
one forward migration per dialect.

## SECURITY NOTES

- No external requests, credentials, account access, CAPTCHA/2FA bypass, stealth behavior, cookie
  upload, production publishing, remote migration, or paid action was performed.
- No dependency, lockfile, manifest, ADR, scope-lock, credential, or production resource change.
- The Project ownership relationship is enforced with explicit typed FK columns and a DB composite
  constraint — no relational data in JSON/text, no parser-output blob, no new untrusted-input,
  auth, credential, network, or execution path was added (storage/constraint/boundary only).
- The only runtime validation added is the Zod `source_ownership` trust boundary, which rejects
  unsupported/case-mismatched/empty values with no implicit fallback beyond the explicit `UNKNOWN`.

## GIT STATUS/DIFF SUMMARY

Branch `ai-task/T108-M1-GEO-CITATION-SCHEMA`, HEAD `f06226d939858ed98b9cff2efe55911d65e4dd58`
(dispatch commit; nothing committed this round). `git status --short`:

```
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? control/tasks/T108-M1-GEO-CITATION-SCHEMA/DELIVERY.md
?? control/tasks/T108-M1-GEO-CITATION-SCHEMA/evidence/
?? drizzle-pg/0032_eminent_alex_wilder.sql
?? drizzle-pg/meta/0032_snapshot.json
?? drizzle/0054_optimal_magik.sql
?? drizzle/meta/0054_snapshot.json
?? src/db/geo-citation.test.ts
?? src/types/schemas/geo-citation.test.ts
?? src/types/schemas/geo-citation.ts
```

`git diff --stat` (tracked, vs dispatch HEAD): 5 files, +317 insertions — `src/db/search-growth.schema.ts`
+161, `src/db/pg/search-growth.schema.ts` +141, `drizzle/meta/_journal.json` +7,
`drizzle-pg/meta/_journal.json` +7, `src/db/schema.ts` +1. `dist/` and `.wrangler/` outputs are
gitignored. Nothing committed; nothing merged; no other task started; `REVIEW.md` not created/edited.

## READY FOR REVIEW

Round 1 is complete: the normalized, Project-scoped `GeoCitation` storage/contract foundation is
implemented in both dialects with §7-verbatim fields, the explicit `project_id` ownership key and the
same-Project composite `(project_id, parse_id)` parse FK (T107 pattern), forward migrations D1 `0054`
and Postgres `0032` (clean final dual-dialect `db:generate` no-op; local D1 migration applied and
idempotent), a Zod `source_ownership` boundary, migration-backed valid/same-Project/cross-Project/
mismatched-project/optional-parent/delete/enum/append-only/Parse-version-isolation tests, and dual-
dialect parity. Gates: focused tests 244/244, `format:check` 0, `types:check` 0, `lint` 0/0, full
`test` 158 files/1350 tests (first run's 5 unrelated executor timeouts resolved by re-run, recorded
above), `build` 0, `ci:check` 0. DELIVERY records the field reconciliation, ownership FKs, migration
IDs, test/gate exits, scope/security declaration, and final Git status above. Not committed; not
merged; no other task started; `REVIEW.md` not edited.
