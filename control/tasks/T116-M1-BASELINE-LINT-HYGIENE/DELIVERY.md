# DELIVERY — T116-M1-BASELINE-LINT-HYGIENE

TASK ID: T116-M1-BASELINE-LINT-HYGIENE
STATUS: READY FOR REVIEW (round 1)
MILESTONE: M1 Core Domain — integration quality maintenance

## IMPLEMENTATION SUMMARY

Applied the two proven pre-existing integration-baseline lint repairs that blocked T115 final acceptance, per the T115 Round 1 REVIEW BLOCKER finding (`src/types/schemas/claim.ts:3` and `src/db/claims.test.ts:60`). Maintenance only; no Search Growth domain contract, schema, migration, or product behavior changed.

1. `src/types/schemas/claim.ts`: split the `@/db/search-growth.schema` import so `claimAllowedLanguages`, `claimAllowedMarketProfiles`, and `claimSourceRefs` (used solely as TypeScript types via `InferSelectModel<typeof …>`) are imported with `import type`, while `claims` remains a runtime value import (it is still read at runtime by `z.enum(claims.status.enumValues)` and `z.enum(claims.classification.enumValues)`). Every exported type alias, Zod schema, comment, and the runtime import of `claims` are preserved verbatim.
2. `src/db/claims.test.ts`: removed the unused `SOURCE_REF_COLUMN_INSERT` template-literal declaration (line 60). It had no reference anywhere in the file (all source-ref inserts go through the `insertSourceRef` drizzle helper). `CLAIM_COLUMN_INSERT`, `LINK_COLUMN_INSERT`, and every test/assertion are preserved verbatim.

## FILES CHANGED

- `src/types/schemas/claim.ts` — import block split into `import type { claimAllowedLanguages, claimAllowedMarketProfiles, claimSourceRefs }` + `import { claims }` from the same schema module.
- `src/db/claims.test.ts` — removed one unused `const SOURCE_REF_COLUMN_INSERT` declaration.

No other files changed (`git status --short` lists only these two; full diff shown below under GIT STATUS/DIFF SUMMARY). No T115 implementation file was touched.

## DATABASE/MIGRATION CHANGES

None. No schema, DDL, migration, journal, or snapshot change.

## DEPENDENCIES CHANGED

None. `package.json` and `pnpm-lock.yaml` are untouched (install used `--frozen-lockfile`). Only untracked `node_modules` was materialized in the worktree.

## TESTS ADDED

None. Test cases and assertions are unchanged. One unused dead declaration was removed from `src/db/claims.test.ts`.

## COMMANDS RUN

All pnpm commands invoked as `corepack pnpm` on the Windows Git Bash executor. Each ran independently (not chained).

1. `corepack pnpm install --frozen-lockfile` — environment prerequisite (fresh worktree had no `node_modules`); frozen to lockfile.
2. `corepack pnpm exec prettier --write src/types/schemas/claim.ts src/db/claims.test.ts` — task-file formatting.
3. `corepack pnpm exec oxlint src/types/schemas/claim.ts src/db/claims.test.ts --type-aware` — focused validation (DENIED by executor sandbox; reported once, not retried/bypassed).
4. `corepack pnpm lint` — aggregate lint gate.
5. `corepack pnpm exec vitest run src/db/claims.test.ts` — focused migration-backed spec (optional, run for behavioral evidence).
6. `git status --short`, `git diff`, `git diff --check`, `git log --oneline -3`, `git rev-parse --abbrev-ref HEAD` — read-only Git inspection.

## COMMAND RESULTS

1. `corepack pnpm install --frozen-lockfile` → exit 0. "Lockfile is up to date, resolution step is skipped … Done in 51.5s using pnpm v10.30.1." No `package.json`/lockfile mutation (frozen).
2. Prettier write on the two task files → exit 0. `src/types/schemas/claim.ts 65ms (unchanged)`; `src/db/claims.test.ts 55ms (unchanged)` — both edits already conform to repo formatting.
3. Focused oxlint → DENIED by executor sandbox with no approval surface: "Permission for this tool use was denied. It requires approval, and this session has no approval surface — nobody can answer a permission prompt here — so it was denied automatically … do not retry it." Reported once; not retried or bypassed.
4. `corepack pnpm lint` (`oxlint . --type-aware`) → exit 0. Output: `Found 0 warnings and 0 errors. Finished in 71.9s on 885 files using 16 threads.` This is the exact gate that previously exited 1 (T115 REVIEW BLOCKER); it now passes, covering both repaired files type-aware.
5. Focused Vitest → exit 0. `✓ src/db/claims.test.ts (15 tests) 63ms`; `Test Files 1 passed (1)`, `Tests 15 passed (15)`.
6. Git inspection → `git status --short`: only `M src/db/claims.test.ts` and `M src/types/schemas/claim.ts`. `git diff --check`: clean (no output, exit 0). Branch `ai-task/T116-M1-BASELINE-LINT-HYGIENE` on base commit `1f3ef37` (`control: dispatch baseline lint hygiene`).

## RUNTIME EVIDENCE

- The required aggregate quality gate `corepack pnpm lint` exits 0 (0 warnings / 0 errors over 885 files, type-aware), resolving the T115 BLOCKER finding that previously reported `consistent-type-imports` on `claimAllowedLanguages`, `claimAllowedMarketProfiles`, `claimSourceRefs` and the unused `SOURCE_REF_COLUMN_INSERT`.
- The migration-backed storage spec still passes: 15/15 tests in `src/db/claims.test.ts`, proving the removed declaration carried no runtime behavior and test semantics are byte-for-byte preserved.

## KNOWN LIMITATIONS

- The focused `corepack pnpm exec oxlint <two files> --type-aware` form was denied by the executor sandbox (no approval surface). It was not retried or bypassed. The aggregate `corepack pnpm lint` (the task's required gate) was NOT denied — it ran and exited 0 with both repaired files included in the type-aware scan, so the two-file lint state is verified through that gate. This is not the TASK's aggregate-lint-denial stop condition, since the aggregate lint was not denied.
- `types:check`, `build`, and `ci:check` were not run; they are outside this TASK's approved command set. Prettier check over the two files is evidenced by the (unchanged) write run.

## DEVIATIONS FROM TASK

- Executor sandbox denial of the focused two-file oxlint invocation (detailed above). Reported once; not retried. Aggregate lint exit 0 satisfies TASK item 4's lint requirement.
- `corepack pnpm install --frozen-lockfile` executed as an unapproved-but-necessary environment prerequisite (no `node_modules` in the fresh worktree). Frozen lockfile; no dependency, manifest, or lockfile change. No production install/publish.

## SECURITY NOTES

No credentials accessed, no external API/network writes, no production or publishing commands run, no browser/cookie handling, no CAPTCHA/2FA interaction, no stealth behavior. Changes are purely static source hygiene (import classification + dead-code removal) in two non-secret source/test files. Nothing merged or pushed.

## GIT STATUS/DIFF SUMMARY

Branch `ai-task/T116-M1-BASELINE-LINT-HYGIENE`, base `1f3ef37`. Working tree contains exactly two modifications:

`git status --short`:
```
 M src/db/claims.test.ts
 M src/types/schemas/claim.ts
```

`git diff --check`: clean (no whitespace errors).

`git diff` (full):
```diff
diff --git a/src/db/claims.test.ts b/src/db/claims.test.ts
index 8ce716a..df54549 100644
--- a/src/db/claims.test.ts
+++ b/src/db/claims.test.ts
@@ -57,7 +57,6 @@ const MIGRATION_FILES = [
 ];

 const CLAIM_COLUMN_INSERT = `(id, project_id, claim_text, status, classification)`;
-const SOURCE_REF_COLUMN_INSERT = `(id, project_id, type, ref, captured_at)`;
 const LINK_COLUMN_INSERT = `(id, project_id, claim_id, source_ref_id)`;

 let client: Client;
diff --git a/src/types/schemas/claim.ts b/src/types/schemas/claim.ts
index 93eb04b..a2745a5 100644
--- a/src/types/schemas/claim.ts
+++ b/src/types/schemas/claim.ts
@@ -1,11 +1,11 @@
 import type { InferSelectModel } from "drizzle-orm";
 import { z } from "zod";
-import {
+import type {
   claimAllowedLanguages,
   claimAllowedMarketProfiles,
   claimSourceRefs,
-  claims,
 } from "@/db/search-growth.schema";
+import { claims } from "@/db/search-growth.schema";

 // ---------------------------------------------------------------------------
 // Claim / ClaimSourceRef domain boundary
```

Proof that no other implementation file changed: the diff above is the complete working-tree diff; `git status --short` shows only these two files. No T115 files, no schema/migration/snapshot/connector/UI files were modified.

## READY FOR REVIEW

Yes — READY FOR REVIEW. Both T115 REVIEW BLOCKER findings are repaired, `corepack pnpm lint` exits 0, the focused migration-backed spec passes (15/15), Prettier leaves both files unchanged, `git diff --check` is clean, and the change set is confined to the two authorized files.
