# DELIVERY — T111-M1-CLAIM-SOURCE-RELATION-SCHEMA (round 3)

## STATUS

`BLOCKED_BY_TEST_ENVIRONMENT` — see ROUND 3 REVIEW RESPONSE and KNOWN
LIMITATIONS. Round 3 is the final permitted executor round. The implementation
tree is unchanged and healthy; the sole remaining review requirement (run the
five acceptance gates and record exit 0) still cannot be executed in this
session because the sandbox auto-denies every one of the five exact commands
with no approval surface — the same environment block that recurred in rounds
1 and 2. Per REVIEW.md's merge-decision instruction, `control/USER_ACTION_REQUIRED.md`
was written and this round stops for a Human Gate.

## TASK ID

`T111-M1-CLAIM-SOURCE-RELATION-SCHEMA` — implementation round 3. `REVIEW.md`
(round 2, verdict BLOCKED) existed at round start; its single finding is
addressed below.

## ROUND 3 REVIEW RESPONSE

Round-2 REVIEW VERDICT: BLOCKED. VERIFIED: the normalized Claim/SourceRef
ownership, composite same-Project FKs, referential composite parent keys,
duplicate-edge identity, cascade behavior, enum checks, and D1/PostgreSQL
snapshots are equivalent; the diff is in-scope; no credential/external/
publishing/runtime behavior is added. The review found **no implementation
defect**. Its sole BLOCKER was evidentiary: TASK item 6 requires
`format:check`, `types:check`, `lint`, `build`, and `ci:check` to each exit 0,
and rounds 1 and 2 recorded no exit code for any of the five (sandbox
auto-denied). The review dispatched the final executor round for "required gate
evidence only; no scope or code rework is authorized", with the explicit
instruction: "If the same environment block recurs, write
`control/USER_ACTION_REQUIRED.md` and stop for a Human Gate."

Round-3 action on the unchanged implementation tree (this round changed no
source, migration, snapshot, or test file — none was warranted by the
review):

1. Attempted each of the five exact approved commands independently via
   `corepack pnpm run format:check` / `types:check` / `lint` / `build` /
   `ci:check`. **Every attempt was auto-denied by the sandbox with no approval
   surface; no exit code exists for any of the five.** The environment block
   documented in rounds 1 and 2 recurred identically. Full per-gate denial
   record: `evidence/round-3/gates.md`.
2. Re-ran the runnable approved gates on the unchanged tree for fresh round-3
   evidence: focused Vitest **277/277** (exit 0) and full Vitest
   **164 files / 1421 tests** (exit 0), plus read-only Git inspection clean.
   (The first full-suite attempt hit one transient 30s cold-import timeout in
   `src/server/mcp/oauth-provider.test.ts` — unrelated to this task's schema
   files; that file passed 7/7 in isolation and the clean full re-run passed
   164 files / 1421 tests.)
3. Because the same environment block recurred in this final permitted round,
   wrote `control/USER_ACTION_REQUIRED.md` (Human Gate) per the review's
   instruction and stopped.

The review's expected behavior — "execute the five exact approved commands and
record exit 0 for each" — therefore remains **unaddressable in this executor
session**: the environment grants the runnable matrix (install, migration,
generation, focused/full Vitest, task-file Prettier, read-only Git) but not the
five full-repo gates, and there is no human approver. This is reported as a
`BLOCKED_BY_TEST_ENVIRONMENT` environment limitation, not a scope or code
deviation. No code change was made because the review verified the
implementation and required only gate evidence that this session cannot
produce.

## IMPLEMENTATION SUMMARY

Unchanged from round 1 (re-verified on the same tree in rounds 2 and 3). Added
the normalized, Project-scoped `claims` foundation and the same-Project
`claim_source_refs` relation across both dialects (D1/SQLite + PostgreSQL),
with forward migrations, snapshots/journals, a Zod domain-boundary module, and
migration-backed storage specs. This is a persistence/contract slice only — no
claim verification/reverification, blocking logic, content/publication gate,
provider call, runtime status transition, CRUD/UI, or external action was
implemented.

Storage contract shipped:

- `claims`: stable text `id`, explicit `project_id` (NOT NULL FK →
  `projects(id)` ON DELETE CASCADE), the direct §9 `claim_text`, `status`
  (`APPROVED | UNVERIFIED | EXPIRED | REJECTED`), nullable `verified_by`,
  `last_verified_at`, `expires_at`, and the direct Claim classification
  (`PUBLIC_MARKETING | INTERNAL | RESTRICTED`). The two unions are enforced as
  DB text-enum columns AND named CHECK constraints (`claims_status_valid`,
  `claims_classification_valid`) on both dialects. `created_at`/`updated_at`
  are the system timestamps of a mutable lifecycle row.
- `claim_source_refs`: normalized relation rows (`id`, explicit `project_id`,
  `claim_id`, `source_ref_id`, append-only `created_at`) with NO mutable
  evidence payload and NO JSON/text array. Same-Project integrity is
  database-enforced by two composite FKs that carry the link's own
  `project_id` as leading column: `(project_id, claim_id) → claims(project_id,
  id)` and `(project_id, source_ref_id) → source_refs(project_id, id)` — a
  link may only join a Claim and a SourceRef from the same Project, in either
  direction. The only uniqueness rule is the duplicate-edge link identity
  (unique `(claim_id, source_ref_id)`). `allowed_markets[]` /
  `allowed_languages[]` were NOT stored (deferred to a later policy-relation
  task).
- To make the second composite FK valid, the T110 `source_refs` table gained
  the *referential* composite parent key `source_refs_project_id_id_idx`
  (unique on `(project_id, id)`) in the new forward migration; the claim
  parent exposes the equivalent `claims_project_id_id_idx`. Both are pure
  referential targets — `id` is already the PK — and add no business
  uniqueness.

## FIELD RECONCILIATION

Unchanged from round 1. Sources: `05_DOMAIN_DATA_MODEL.md` §9
Claim/SourceRef (direct contract), the TASK field list,
`schemas/domain-types.ts` `Claim`/`ClaimStatus`/`DataClassification` (legacy
reference artifact), `schemas/migrations-reference.sql` `claims` (legacy
migration reference), and T110's accepted `source_refs` storage. Reference
files are read-only and were NOT edited (the V1.0 direct contract wins).

| Stored column | §9 / TASK (authoritative) | domain-types / migrations-reference | Decision |
| --- | --- | --- | --- |
| `id` | (stable id, implied) | `id` | Shipped as PK (established convention). |
| `project_id` | (explicit Project) | `project_id` | Shipped NOT NULL; FK to `projects(id)` ON DELETE CASCADE. |
| `claim_text` | `claim_text` | `claim_text` | Shipped NOT NULL as the direct §9 assertion text. |
| `status` | §9 union `APPROVED \| UNVERIFIED \| EXPIRED \| REJECTED` | same union (`ClaimStatus`) | Shipped NOT NULL, no DB default, DB text-enum + named CHECK. Legacy union identical — nothing reconciled OUT. |
| `verified_by` | (nullable) | `verified_by` (reference only) | Shipped nullable free-text verifier id (no verifier FK in this slice). |
| `last_verified_at` | (nullable) | `last_verified_at` | Shipped nullable verification timestamp. |
| `expires_at` | (nullable) | `expires_at` | Shipped nullable expiry timestamp. |
| `classification` | direct union `PUBLIC_MARKETING \| INTERNAL \| RESTRICTED` | same union (`DataClassification`) | Shipped NOT NULL, DB text-enum + named CHECK. |
| `created_at` / `updated_at` | (not in snippet) | both on the reference `claims` row | Shipped system timestamps of a mutable lifecycle row. |
| — | — | legacy `allowed_markets_json` / `allowed_languages_json` | Reconciled OUT / deferred (TASK item 4 forbids JSON/text lists here). |
| — | — | legacy `evidence_type` / `evidence_ref` / `source_url` | Reconciled OUT (source evidence moves to the normalized `claim_source_refs` relation — TASK item 2/3). |
| — | — | legacy `normalized_claim` | Reconciled OUT (no normalization algorithm in this slice). |

Reconciled OUT (documented, not shipped): `allowed_markets[]`,
`allowed_languages[]`, `evidence_type`, `evidence_ref`, `source_url`, and
`normalized_claim`.

## FK / IDENTITY / DELETE DECISIONS

Unchanged from round 1. Project FK is DB-enforced on both new tables (NOT NULL
FK to `projects(id)` ON DELETE CASCADE). Same-Project integrity uses two
database-level composite FKs each carrying the link's own `project_id` as the
leading column (the accepted T102/T108/T109 relation pattern); a cross-Project
link is rejected in BOTH directions. Referential composite parent keys
(`claims_project_id_id_idx`, `source_refs_project_id_id_idx`) make the
composite FKs valid and are uniqueness-neutral. Link delete behavior is
cascade on both parent FKs plus the Project cascade. Duplicate edges are
guarded by the single link-identity unique index
`claim_source_refs_unique_claim_source_idx`. The relation is append-only by
schema shape (no `updated_at`, no payload).

## MIGRATION IDS

Unchanged from round 1.

- D1/SQLite: `drizzle/0057_cold_marrow.sql` (+
  `drizzle/meta/0057_snapshot.json`, `drizzle/meta/_journal.json` idx 57).
- PostgreSQL: `drizzle-pg/0035_amazing_bucky.sql` (+
  `drizzle-pg/meta/0035_snapshot.json`, `drizzle-pg/meta/_journal.json` idx 35).

Both forward migrations carry only the intended DDL; accepted migrations
(0056/0034 and earlier) were NOT edited. Round-1 `db:generate` re-run reported
`No schema changes, nothing to migrate` on both dialects (clean final
dual-dialect generation).

## FILES CHANGED

No source/migration/snapshot/test file changed between rounds 1, 2, and 3; the
implementation tree is byte-for-byte the reviewed round-1 tree. Round-3
task-channel files added:

- `control/tasks/T111-M1-CLAIM-SOURCE-RELATION-SCHEMA/DELIVERY.md` (this
  round-3 delivery).
- `control/tasks/T111-M1-CLAIM-SOURCE-RELATION-SCHEMA/evidence/round-3/gates.md`.
- `control/USER_ACTION_REQUIRED.md` (updated from stale T107 content to the
  T111 Human-Gate request per the round-2 review's instruction).

Cumulative task file set (round 1, unchanged):
`src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
`src/db/schema.ts`, `drizzle/0057_cold_marrow.sql`,
`drizzle/meta/0057_snapshot.json`, `drizzle-pg/0035_amazing_bucky.sql`,
`drizzle-pg/meta/0035_snapshot.json`, `drizzle/meta/_journal.json`,
`drizzle-pg/meta/_journal.json`, `src/db/claims.test.ts`,
`src/types/schemas/claim.ts`, `src/types/schemas/claim.test.ts`, and the
`evidence/round-1/`, `evidence/round-2/`, `evidence/round-3/` channels.

## DEPENDENCIES CHANGED

None (rounds 1, 2, and 3).

## TESTS ADDED

Unchanged from round 1 and re-passed in rounds 2 and 3:

- `src/types/schemas/claim.test.ts` — 3 boundary tests (enum acceptance,
  rejection of case-mismatched/unsupported/empty values, exported row/enum
  type alignment incl. the normalized `ClaimSourceRef` link shape).
- `src/db/claims.test.ts` — 15 migration-backed storage tests through the
  actual 0056 + 0057 DDL with `PRAGMA foreign_keys = ON` (valid same-Project
  persistence; every ClaimStatus × classification round-trip; NOT NULL and
  enum-CHECK enforcement; dangling-Project rejection; exact column-shape
  assertion with no deferred/legacy columns; cross-Project rejection in both
  directions; dangling-parent rejection; duplicate-edge rejection;
  claim-delete, source-ref-delete, and whole-Project-delete cascades;
  normalized relation-shape assertion).
- Parity: the new tables are covered by `src/db/schema-parity.test.ts` (249
  tests: SQLite vs PG mirror incl. columns, PKs, unique constraints, FKs with
  onDelete, CHECKs).

## COMMANDS RUN (round 3)

Each approved command ran literally and independently via `corepack pnpm ...`
(no bare `pnpm`, no `--dangerously-skip-permissions`, no chained shell
operations). See `evidence/round-3/gates.md` for the concise log.

1. `node --version` → v24.16.0.
2. `corepack pnpm --version` → 10.30.1.
3. `corepack pnpm run format:check` → **sandbox auto-denied; no exit code**.
4. `corepack pnpm run types:check` → **sandbox auto-denied; no exit code**.
5. `corepack pnpm run lint` → **sandbox auto-denied; no exit code**.
6. `corepack pnpm run build` → **sandbox auto-denied; no exit code**.
7. `corepack pnpm run ci:check` → **sandbox auto-denied; no exit code**.
8. `corepack pnpm exec vitest run src/db/claims.test.ts src/types/schemas/claim.test.ts src/db/schema-parity.test.ts src/db/source-ref.test.ts src/types/schemas/source-ref.test.ts` → exit 0 — 277 tests passed.
9. `corepack pnpm exec vitest run` (attempt 1) → exit 1 — 1 transient 30s
   cold-import timeout in `src/server/mcp/oauth-provider.test.ts`
   (1420/1421 passed; unrelated to this task).
10. `corepack pnpm exec vitest run src/server/mcp/oauth-provider.test.ts` →
    exit 0 — 7/7 passed in isolation (confirms transient environment timeout,
    not a regression).
11. `corepack pnpm exec vitest run` (re-run) → exit 0 — 164 files / 1421 tests passed.
12. `git status --short`, `git diff --stat`, `git diff --check` → exit 0 —
    identical round-1/2 file set; `git diff --check` clean.

Round-1 commands (local migration 0000 → 0057, clean final dual-dialect
`db:generate`, task-file Prettier, frozen install) remain evidenced in
`evidence/round-1/gates.md` on this same unchanged tree.

## COMMAND RESULTS

Round-3 passing on the unchanged final tree: focused Vitest **277/277** and
full Vitest **164 files / 1421 tests** (clean re-run), plus read-only Git
inspection. Round-1 (unchanged tree, re-verified by the reviewer): local D1
migration 0000 → 0057 exit 0 and clean final dual-dialect `db:generate` re-run
exit 0.

Environment limitation (reported, not hidden): the sandbox auto-approval grant
list for THIS executor session does not include `format:check`, `types:check`,
`lint`, `build`, or `ci:check` (nor their underlying binaries). Each of the
five exact approved commands was attempted as a standalone invocation and each
was auto-denied with no approval surface to escalate to, so no exit code exists
for any of the five gates in this session. This is the same limitation recorded
in rounds 1 and 2.

## RUNTIME EVIDENCE

- `control/tasks/T111-M1-CLAIM-SOURCE-RELATION-SCHEMA/evidence/round-1/gates.md`
  — round-1 log: migration content, test counts, gate exits (incl. the
  runnable matrix), tooling versions, and the sandbox-denied gates.
- `control/tasks/T111-M1-CLAIM-SOURCE-RELATION-SCHEMA/evidence/round-2/gates.md`
  — round-2 log: one row per exact gate attempt with its sandbox-denial
  outcome, the round-2 focused/full Vitest re-run exits, and read-only Git
  results.
- `control/tasks/T111-M1-CLAIM-SOURCE-RELATION-SCHEMA/evidence/round-3/gates.md`
  — round-3 log: one row per exact gate attempt with its sandbox-denial
  outcome, the round-3 focused/full Vitest re-run exits (incl. the transient
  oauth-provider timeout and its clean isolation + full re-run), and read-only
  Git results.
- `control/USER_ACTION_REQUIRED.md` — Human-Gate request written per the
  round-2 review's merge-decision instruction.

## KNOWN LIMITATIONS

- The `format:check` / `types:check` / `lint` / `build` / `ci:check` gates
  remain non-executable in this executor session (sandbox auto-denied each
  exact command; no approval surface exists). TASK item 6 therefore cannot be
  fully satisfied here; this is the same environment limitation recorded in
  rounds 1 and 2 and is reported as `BLOCKED_BY_TEST_ENVIRONMENT`. The round-1
  review verified the implementation itself; only the five gate exit codes are
  missing, and the controller/QA, a grant-enabled session, or a human gate must
  produce them before acceptance. Because this was the final permitted executor
  round and the environment block recurred, `control/USER_ACTION_REQUIRED.md`
  was written and this round stops for a Human Gate.
- Round-1 limitations carry forward unchanged: `verified_by` is free text (no
  verifier FK); `claims` ships `created_at`/`updated_at` as mutable-lifecycle
  timestamps; `status` has no DB default; `allowed_markets[]` /
  `allowed_languages[]` are intentionally absent (later policy-relation task);
  the `claims`/`claim_source_refs` additions keep the schema-barrel header
  `max-lines` comment exemptions.
- First full-suite attempt in round 3 produced one transient 30s cold-import
  timeout in `src/server/mcp/oauth-provider.test.ts` (a file with an in-test
  comment noting Windows cold-import can exceed default deadlines). It is
  unrelated to this task's schema files, passed 7/7 in isolation, and the full
  suite passed 164 files / 1421 tests on the clean re-run. No task file was
  changed in response.

## DEVIATIONS FROM TASK

None in scope or field set (unchanged from round 1). Rounds 2 and 3 made no
code change because the round-1 review verified the implementation and its sole
finding required gate evidence this environment cannot produce. The only
non-`0` outcome remains environmental: the five full-repo gates could not be
granted by the sandbox in any of the three rounds (see KNOWN LIMITATIONS) —
reported as an environment limitation, not a scope deviation.

## SECURITY NOTES

- No credentials, secrets, env files, or production/remote data were read or
  written; all DB work used the local D1 state (`db:migrate:local`, round 1)
  and in-memory SQLite built from the shipped forward-migration DDL.
- No network/provider/publishing action occurred. No commit, merge, or push
  was performed. No `main` branch was touched.
- Scope lock/ADRs were not edited. `REVIEW.md` (T111) was not edited. The
  round-3 gate attempts used only the TASK-approved command names; every
  denied invocation was abandoned without retry or bypass after the sandbox
  denial.

## GIT STATUS/DIFF SUMMARY

- Branch: `ai-task/T111-M1-CLAIM-SOURCE-RELATION-SCHEMA`; working tree is NOT
  committed (rounds stop at delivery).
- Round-3 status is identical to rounds 1 and 2 plus the round-3 task-channel
  files and the updated `control/USER_ACTION_REQUIRED.md`.
- Modified tracked files: `drizzle/meta/_journal.json`,
  `drizzle-pg/meta/_journal.json` (db:generate);
  `src/db/search-growth.schema.ts`, `src/db/pg/search-growth.schema.ts`,
  `src/db/schema.ts`; and `control/USER_ACTION_REQUIRED.md` (T111 Human-Gate
  content replacing stale T107 content).
- Added files: `drizzle/0057_cold_marrow.sql`, `drizzle/meta/0057_snapshot.json`,
  `drizzle-pg/0035_amazing_bucky.sql`, `drizzle-pg/meta/0035_snapshot.json`,
  `src/db/claims.test.ts`, `src/types/schemas/claim.ts`,
  `src/types/schemas/claim.test.ts`, and the
  `control/tasks/T111-M1-CLAIM-SOURCE-RELATION-SCHEMA/evidence/` channel
  (`round-1/`, `round-2/`, and `round-3/`).
- `git diff --stat` (tracked): 5 implementation files, +409/−15 (unchanged);
  plus `control/USER_ACTION_REQUIRED.md` now carries the T111 request.
  `git diff --check` clean.

## READY FOR REVIEW

Round 3 made no code change (none was warranted) and re-verified the unchanged
round-1 tree with the runnable approved gates: focused Vitest 277/277, full
Vitest 164 files / 1421 tests (clean re-run), and clean read-only Git. The
round-2 review's sole BLOCKER — exit-0 evidence for `format:check`,
`types:check`, `lint`, `build`, and `ci:check` — could not be produced in this
final session either: the sandbox auto-denied every one of the five exact
commands (no approval surface, no exit code), reproducing the rounds-1/2
environment limitation. Per the review's instruction, the recurring block is
now escalated via `control/USER_ACTION_REQUIRED.md` and this round stops for a
Human Gate. Status is reported as `BLOCKED_BY_TEST_ENVIRONMENT`; the
implementation itself remains verified and in-scope. No `PASS` verdict is
written by the implementation round.
