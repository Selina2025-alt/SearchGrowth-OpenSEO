# REVIEW — T127-M1-RUNTIME-CONTROL-CORE-SCHEMA Round 2

## VERDICT

PASS

## VERIFIED

- The Round 1 blocker is fixed: `runtimeControlSchema` now exposes `key: z.string().min(1)`, typed `value: boolean | number | string`, and the source optional bounded `reason`; it no longer exposes the raw `controlKey`/`valueJson` row shape.
- `runtimeControlValueJsonSchema` uses the existing JSON codec only at the storage boundary. Focused tests prove typed-value acceptance/rejection and scalar encode/decode while database tests continue to enforce serialized JSON shape.
- The five-column global `runtime_controls` storage contract remains unchanged: PK key identity, scalar JSON CHECK, nullable reason, opaque updater, mutable update timestamp, no Project FK, no other relation, trigger, state, policy catalog, or business uniqueness.
- D1 `0072` and PostgreSQL `0050`, journals, and snapshots are structurally equivalent. Migration-backed tests cover scalar kinds, malformed/unsupported JSON, key identity, mutability, and absence of relations/triggers.
- Claude evidence records clean local migration and `db:generate`, 23 focused tests, 1,708 full tests, types, lint, and build. The aggregate formatter/CI stop was the pre-existing Controller ledger format issue.
- After the Controller-only ledger formatting correction, the unchanged T127 worktree passed `format:check`, `types:check`, `lint`, `build`, and `ci:check` with exit 0.
- No evaluation, pause/resume behavior, job claim, external request, publishing, spend, credentials, account/connector model, CRUD, UI, or production action was added.

## FINDINGS

None.

## MERGE DECISION

Accept feature commit `eb7cd01` and merge only to `integration/ai-v1` as `6ef3d8e`. Do not merge to `main`.
