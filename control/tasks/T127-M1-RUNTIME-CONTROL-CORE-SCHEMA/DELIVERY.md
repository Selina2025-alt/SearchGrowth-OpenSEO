# DELIVERY T127-M1-RUNTIME-CONTROL-CORE-SCHEMA

IMPLEMENTATION STATUS: COMPLETE
READY FOR REVIEW: YES
ROUND: 2 (addresses REVIEW.md Round 1 BLOCKER)

## IMPLEMENTATION SUMMARY

Round 2 fixes the single Round 1 BLOCKER: the Zod/domain boundary no longer
loses the source value union. The storage/migration slice and every other
finding-verified artifact is unchanged.

- `src/types/schemas/runtime-control.ts` now exports the typed source domain
  contract that `schemas/zod-contracts.reference.ts` `runtimeControlSchema` and
  `schemas/domain-types.ts` `RuntimeControl` define:
  - `key: z.string().min(1)` (non-empty stable control identity),
  - `value: z.union([z.boolean(), z.number(), z.string()])` (the source value
    union, accepted and returned as the actual typed value, not JSON text),
  - `reason: z.string().max(1000).optional()` (source reason constraint and
    optionality),
  - `updatedBy: z.string()` and `updatedAt: z.string()` (required opaque updater
    identity and mutable timestamp from TASK item 1 / `domain-types.ts`).
- `RuntimeControl` is now `z.infer<typeof runtimeControlSchema>` — the typed
  source domain shape later control read/evaluation tasks consume. The previous
  `controlKey`/`valueJson` row-shaped Zod object is removed, so the boundary no
  longer accepts arbitrary text or rejects the typed values the source allows.
- The database's validated serialized representation is preserved and made
  explicit: `runtimeControlValueJsonSchema = jsonCodec(runtimeControlValueSchema)`
  (the accepted `src/shared/json.ts` helper, also used by the Search History and
  Lighthouse boundaries) is the serialization boundary between the typed value
  and the stored `value_json` text. `encode(typedValue)` emits exactly the scalar
  JSON the storage CHECK accepts; `parse(storedText)` decodes it back to the
  typed value and rejects malformed or unsupported JSON. `runtimeControlValueSchema`
  itself is module-private; the typed union is exposed through
  `runtimeControlSchema.value`.
- Storage/migrations/snapshots/journals and their scope are untouched: the
  `runtime_controls` table still has the same five columns, PK identity, named
  scalar-JSON CHECK, no FKs/triggers, and forward migrations D1 `0072` /
  PostgreSQL `0050`. No schema, migration, snapshot, journal, or storage-test
  file changed in Round 2.
- Mutability and scope are unchanged: no append-only trigger, CAS/version,
  state transition, control evaluation, pause/resume, job claiming, side-effect
  start/stop, publishing, spend, external contact, account/credential/connector
  model, CRUD, UI, or production action.

### Why this satisfies the finding

The Round 1 schema `{ controlKey: z.string(), valueJson: z.string(), ... }`
accepted malformed JSON and serialized unsupported values and rejected the typed
values the source permits. The Round 2 contract returns `key` and the typed
`value` union exactly as the accepted reference requires, keeps the source
`reason` constraint, and isolates storage serialization in a dedicated codec
that round-trips every allowed scalar both ways (proven by tests). Storage scope
is unchanged.

## FILES CHANGED

Round 2 (only these two paths; both were/are new untracked files):

- `src/types/schemas/runtime-control.ts` — replaced the row-shaped `controlKey`/
  `valueJson` Zod object with the typed source contract (`key`, typed `value`
  union, bounded optional `reason`, `updatedBy`, `updatedAt`), added the
  `runtimeControlValueJsonSchema` serialization codec, and rewrote the module
  documentation to state the storage-vs-domain mapping.
- `src/types/schemas/runtime-control.test.ts` — replaced the JSON-text boundary
  tests with typed-contract tests (each value type, invalid values, key
  validation, reason constraint/optionality, required updater/timestamp, domain
  shape) plus serialization-boundary tests (encode/decode every scalar, malformed
  and unsupported stored JSON).

Unchanged from Round 1 (still the same change set; required by TASK and verified
by Round 1 REVIEW):

- `src/db/search-growth.schema.ts` — SQLite/D1 `runtimeControls` table.
- `src/db/pg/search-growth.schema.ts` — PostgreSQL structural mirror.
- `src/db/schema.ts` — provider-aware barrel export.
- `drizzle/0072_previous_bishop.sql` + `drizzle/meta/0072_snapshot.json`,
  `drizzle/meta/_journal.json`.
- `drizzle-pg/0050_fantastic_lady_vermin.sql` + `drizzle-pg/meta/0050_snapshot.json`,
  `drizzle-pg/meta/_journal.json`.
- `src/db/runtime-control.test.ts` — migration-backed storage contract tests.

## DATABASE / MIGRATION CHANGES

None in Round 2. Migration IDs remain D1 `0072_previous_bishop` and PostgreSQL
`0050_fantastic_lady_vermin`; snapshots and journals are unchanged. The
five-column storage shape, PK identity, named scalar-JSON CHECK, absence of
FKs/triggers, and mutable (non-append-only) behavior are preserved exactly as
verified in Round 1.

### Field / value reconciliation (unchanged, restated for the domain contract)

| Source field | Storage column | Domain contract | Decision |
| --- | --- | --- | --- |
| `key: string` (zod `.min(1)`) | `control_key` PK NOT NULL | `key: z.string().min(1)` | Stable opaque identity; PK enforces uniqueness. No key enum/taxonomy (TASK item 3). |
| `value: boolean \| number \| string` | `value_json` JSON text NOT NULL | `value: z.union([boolean, number, string])` | Typed union at the boundary; JSON text only in storage, bridged by `runtimeControlValueJsonSchema` (TASK item 2). |
| `reason?: string` (zod `.max(1000).optional()`) | `reason` nullable | `reason: z.string().max(1000).optional()` | Optional = omitted; maps to storage NULL. Source 1000-char request bound carried on the contract, not the stored row. |
| `updatedBy: string` | `updated_by` NOT NULL | `updatedBy: z.string()` | Required opaque updater identity; deliberately NOT a FK / account model (TASK item 3). |
| `updatedAt: string` | `updated_at` NOT NULL DEFAULT now | `updatedAt: z.string()` | Required mutable timestamp; storage defaults on insert. No append-only/CAS/state transition (TASK item 3). |

No `project_id` is added: the control set is service-wide and the legacy
reference table has no ownership column.

## DEPENDENCIES CHANGED

None. No new runtime or dev dependency; no `package.json`/lockfile change. The
Round 2 fix reuses the existing `src/shared/json.ts` `jsonCodec` helper.

## TESTS ADDED

`src/types/schemas/runtime-control.test.ts` (9 tests):

- Domain contract: accepts/returns every source typed value
  (`true`/`false`/integer/real/string); rejects values outside the union
  (`null`, `[]`, `{}`, object); rejects an empty or non-string key; enforces the
  1000-char reason bound, reason optionality (omitted accepted) and rejects
  `null` reason; requires `updatedBy` and `updatedAt`; and the `RuntimeControl`
  type has no `controlKey`/`valueJson`/`createdAt`/`projectId`/`version`/`paused`
  field.
- Serialization boundary: `runtimeControlValueJsonSchema.encode` emits the exact
  stored scalars (`true`, `false`, `42`, `1.5`, `"platform_pause"`); `parse`
  decodes each back to its typed value; malformed JSON and unsupported JSON
  kinds (`null`/array/object) are rejected.

`src/db/runtime-control.test.ts` (10 tests, unchanged from Round 1) continues to
cover the migration-backed storage contract, including every allowed value type,
malformed/unsupported JSON rejection, PK identity, NOT NULL enforcement,
intentional mutability, exact five-column shape, and zero FKs/triggers.

Dialect parity: `src/db/schema-parity.test.ts` auto-covers the table (unchanged).

## COMMANDS RUN

Executed via `corepack pnpm ...` (bare `pnpm` is unavailable). Each required
command ran independently; no chaining, no `--dangerously-skip-permissions`, no
commit, merge, push, or `main` touch.

1. `corepack pnpm run db:migrate:local`
2. `corepack pnpm run db:generate`
3. `corepack pnpm exec vitest run src/types/schemas/runtime-control.test.ts src/db/runtime-control.test.ts`
4. `corepack pnpm test`
5. `corepack pnpm format:check`
6. `corepack pnpm exec prettier --write src/types/schemas/runtime-control.test.ts`
7. `corepack pnpm format:check` (re-run)
8. `corepack pnpm types:check`
9. `corepack pnpm lint`
10. `corepack pnpm build`
11. `corepack pnpm ci:check`
12. `corepack pnpm exec vitest run src/types/schemas/runtime-control.test.ts src/db/runtime-control.test.ts src/shared/json.test.ts` (after the final edit)
13. `corepack pnpm test` (re-run on final state)
14. Read-only Git: `git status --short`, `git diff --stat`, `git diff --check`

## COMMAND RESULTS

1. `db:migrate:local` → **exit 0**, `✅ No migrations to apply!` — the local D1
   state already has `0072_previous_bishop` applied from Round 1 (persistent
   `.wrangler` state), so there was nothing pending.
2. `db:generate` → **exit 0**, both dialects end with
   `No schema changes, nothing to migrate 😴`. No generated file changed.
3. Focused Vitest (domain + storage) → **exit 0**, 2 files / **19 tests** (9
   domain, 10 storage).
4. Full `test` → **exit 0**, **185 files / 1708 tests passed** (Round 1 was
   1704; +4 net from the 5→9 domain tests).
5. `format:check` → **exit 1**: Prettier flagged the new
   `src/types/schemas/runtime-control.test.ts` (style only) plus the pre-existing
   `control/ACCEPTANCE_LEDGER.md`.
6. `prettier --write` on the domain test → **exit 0**.
7. `format:check` (re-run) → **exit 1**, only the pre-existing, unmodified,
   Controller-owned `control/ACCEPTANCE_LEDGER.md` remains; every file changed by
   this task is formatted.
8. `types:check` (`tsc --noEmit`) → **exit 0**, no diagnostics.
9. `lint` (`oxlint . --type-aware`) → **exit 0**, `Found 0 warnings and 0
   errors`, 907 files.
10. `build` (`vite build && tsc --noEmit`) → **exit 0**; client, SSR and
    `open_seo_audit` bundles built, trailing `tsc --noEmit` clean.
11. `ci:check` → **exit 1**: the chain stops at its first stage, repo-wide
    Prettier, which flags exactly `control/ACCEPTANCE_LEDGER.md` (committed
    control-plane file, unmodified here). Because the script uses `&&`, the
    `knip`/`tsc`/`oxlint`/plugin-sync stages did not run. Same pre-existing
    limitation recorded by accepted T126 and Round 1.
12. Focused Vitest after the final edit → **exit 0**, 3 files / **23 tests**
    (domain 9, storage 10, `json.test.ts` 4).
13. Full `test` on final state → **exit 0**, **185 files / 1708 tests passed**.
14. Git read-only → `git diff --check` clean; change set is the same 5 modified
    tracked files (storage/migrations, +138/−2) plus the untracked task files;
    only `src/types/schemas/runtime-control.ts` and its test changed in Round 2.

Two commands were blocked by the executor's permission gate and were NOT run;
they were not bypassed: an independent `corepack pnpm knip` (not in the
task-scoped grant) and a targeted
`prettier --check <two files>`. The repo-wide `format:check` (command 7) was
used instead of the targeted prettier and proves the changed files are
formatted.

## RUNTIME EVIDENCE

- `db:generate`: `No schema changes, nothing to migrate 😴` on both dialects —
  schema/snapshots/journals agree with no drift after the domain-contract change
  (the contract is not part of the Drizzle schema).
- `db:migrate:local`: `✅ No migrations to apply!` (D1 `0072` already applied).
- Focused domain tests: 9/9 pass — every allowed typed value accepted/returned,
  out-of-union values rejected, key non-empty/string enforced, reason 1000-char
  bound and optionality enforced, updater/timestamp required, and the
  serialization codec round-trips every scalar and rejects malformed/unsupported
  stored JSON.
- Migration-backed storage tests: 10/10 pass (unchanged).
- Full suite: `Test Files 185 passed (185)`, `Tests 1708 passed (1708)`.
- `types:check` and `build` clean; `lint` 0 warnings / 0 errors.
- Git: `git diff --check` clean; only the two `src/types/schemas/runtime-control.*`
  files changed in Round 2.

## KNOWN LIMITATIONS

- `format:check` and the aggregate `ci:check` cannot exit 0 in this worktree
  because of the pre-existing, unrelated, Controller-owned
  `control/ACCEPTANCE_LEDGER.md` Prettier violation (committed before this task,
  unmodified here). Editing it would import an unrelated control-plane change,
  so it was not touched.
- `ci:check` therefore did not reach its `knip` stage. An independent `knip` run
  was denied by the executor permission gate (not in the task-scoped grant), so
  unused-export analysis could not be captured. To avoid adding a likely
  finding, the internal value schema is module-private; the exports exercised by
  tests are `runtimeControlSchema`, `runtimeControlValueJsonSchema` and the
  `RuntimeControl` type, matching the import pattern of the structurally
  identical accepted schema modules.
- The PostgreSQL value CHECK is verified by structural parity plus the
  migration's dialect-native equivalence; there is no live PostgreSQL instance
  here, so the PG DDL is not executed by a migration test (same as accepted
  sibling schema tasks and Round 1).
- Scope-shape by design: the control key is opaque (no control catalogue/enum),
  `updated_by` has no FK/actor model, the row is mutable with no
  append-only/CAS/state-transition/evaluation behavior, and the domain boundary
  performs validation only (no control evaluation, pause/resume, CRUD or UI).

## DEVIATIONS FROM TASK

None in scope or acceptance criteria. The Round 2 change is confined to the
domain contract and its tests; no schema, migration, snapshot, journal, or
storage-test file was changed. Two permission-gated commands were skipped rather
than bypassed (documented above).

## SECURITY NOTES

- Credential-free, effect-free slice: no control evaluation, pause/resume, job
  claiming, side-effect start/stop, publishing, spend, external contact,
  credential/account/connector model, CRUD, UI, or production behavior.
- `updated_by` is deliberately NOT a foreign key and no account/user/actor model
  is invented (TASK item 3).
- The typed boundary rejects values outside `boolean|number|string` before any
  write, and the storage CHECK independently rejects malformed or unsupported
  serialized JSON on both dialects, so a control row cannot smuggle a
  document/relational payload through the value.
- The table is global (not Project-scoped) and carries no secret material; no
  secret or sensitive value is logged. No production publish, merge, or `main`
  modification was performed.

## GIT STATUS / DIFF SUMMARY

```
 M drizzle-pg/meta/_journal.json
 M drizzle/meta/_journal.json
 M src/db/pg/search-growth.schema.ts
 M src/db/schema.ts
 M src/db/search-growth.schema.ts
?? control/tasks/T127-M1-RUNTIME-CONTROL-CORE-SCHEMA/DELIVERY.md
?? control/tasks/T127-M1-RUNTIME-CONTROL-CORE-SCHEMA/REVIEW.md
?? drizzle-pg/0050_fantastic_lady_vermin.sql
?? drizzle-pg/meta/0050_snapshot.json
?? drizzle/0072_previous_bishop.sql
?? drizzle/meta/0072_snapshot.json
?? src/db/runtime-control.test.ts
?? src/types/schemas/runtime-control.test.ts
?? src/types/schemas/runtime-control.ts
```

Tracked diff: 5 files, +138/−2 (unchanged from Round 1). Round 2 changed only
the two untracked `src/types/schemas/runtime-control.*` paths. `git diff --check`
clean. No commit, merge, push, or `main` change.

## BLOCKERS

- Pre-existing, task-external: `control/ACCEPTANCE_LEDGER.md` fails repo-wide
  Prettier, so `format:check` and the aggregate `ci:check` exit 1. Not caused by
  and not editable within this task.
