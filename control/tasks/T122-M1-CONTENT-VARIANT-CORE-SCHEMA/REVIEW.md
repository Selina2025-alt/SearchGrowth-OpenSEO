# REVIEW — T122-M1-CONTENT-VARIANT-CORE-SCHEMA (round 1)

## VERDICT

BLOCKED

## VERIFIED

- The Delivery shows clean dual-dialect generation, local migration and
  idempotency, 326 focused tests, and 1,595 final full-suite tests.
- D1 `0067_old_silhouette` and PostgreSQL `0045_flawless_argent` add matching
  forward `content_variants` storage with explicit Project ownership and a
  composite ContentVersion FK. The direct storage shape, append-only contract,
  no-extra-uniqueness rule, and out-of-scope boundaries match the task packet.
- `format:check` and `types:check` passed in the unchanged task worktree.

## FINDINGS

### BLOCKER — T122 domain boundary fails required lint

- **Location:** `src/types/schemas/content-variant.ts:3`
- **Requirement violated:** TASK item 5 requires lint to exit 0 before
  acceptance.
- **Evidence / reproduction:** Controller ran `corepack pnpm lint` in the T122
  worktree. It exited 1 with
  `typescript-eslint(consistent-type-imports)`: `contentVariants` is used only
  as a type and must use a type-only import.
- **Expected behavior:** `contentVariantSchema` and the `ContentVariant` type
  boundary conform to the repository type-import lint rule.
- **Fix acceptance condition:** Change only this import to its type-only form,
  then rerun lint and the remaining required aggregate gates on the unchanged
  task scope. No schema, migration, or business behavior change is needed.

## MERGE DECISION

Do not merge. The Product Owner explicitly directed the Controller not to create
T122 Round 2; this review records the real task-local gate failure without a
Controller implementation edit.
