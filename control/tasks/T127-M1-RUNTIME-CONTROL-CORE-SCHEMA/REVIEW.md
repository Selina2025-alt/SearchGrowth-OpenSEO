# REVIEW — T127-M1-RUNTIME-CONTROL-CORE-SCHEMA Round 1

## VERDICT

BLOCKED

## FINDINGS

### BLOCKER — Zod boundary loses the source value union

- **Location:** `src/types/schemas/runtime-control.ts`, `runtimeControlSchema`.
- **Requirement:** `TASK.md` item 1 requires the source-defined boolean/number/string value in the matching Zod/domain contract. The accepted reference `schemas/zod-contracts.reference.ts` defines `key: z.string().min(1)` and `value: z.union([z.boolean(), z.number(), z.string()])`.
- **Evidence:** the delivered schema instead exposes `controlKey: z.string()` and `valueJson: z.string()`. It accepts any text, including malformed JSON and serialized unsupported values, and rejects the actual typed values expected at the untrusted domain boundary. The database CHECK protects storage, but does not make this Zod contract equivalent.
- **Expected behavior:** preserve the database's validated serialized representation if necessary, while exporting a Zod/domain contract that accepts and returns the source `key` and typed `value` union, with the source reason constraint. Add focused tests for each typed value, invalid values, key validation, and the serialization boundary as appropriate.
- **Scope:** do not alter the five-column storage shape, migration/snapshot IDs, mutable behavior, or add control evaluation, pause/resume, CAS, external behavior, account/credential models, CRUD, UI, or production action.

## VERIFIED

- The D1/SQLite and PostgreSQL storage changes are parity-aligned: five fields, PK identity, scalar JSON CHECK, no FKs/triggers, and forward migrations `0072` / `0050` with matching snapshots/journals.
- Migration-backed tests cover storage scalar-type rejection, primary-key identity, mutability, and absence of evaluation/append-only behavior. Full tests, types, lint, build, local migration, and clean `db:generate` have passing evidence.
- Executor `format:check` and `ci:check` stopped only on the pre-existing Controller ledger formatting regression; no acceptance exception applies until this real domain finding is fixed.

## FIX ACCEPTANCE

1. Implement the typed RuntimeControl Zod/domain contract exactly as above without changing schema/migration scope.
2. Run focused domain/storage/parity tests, `db:generate`, format, types, lint, full tests, build, and `ci:check`; record any sandbox denial once without bypass.
3. Write an updated `DELIVERY.md` and stop.
