# DELIVERY — T156-M2-GEO-OBSERVATION-COHORT-CONTEXT-ASSEMBLER

TASK ID: T156-M2-GEO-OBSERVATION-COHORT-CONTEXT-ASSEMBLER
MILESTONE: M2 GEO
ROUND: 1 of 3
REVIEW.md: absent (fresh round 1)
STATUS: implementation complete; all required gates exited 0
READY FOR REVIEW: yes

## IMPLEMENTATION SUMMARY

One storage-free composition service that turns caller-supplied immutable GEO
observation-run rows into a T151-validated cohort beside its accepted T152
structured context. It owns no rule of its own.

- `assembleGeoObservationCohortContext(rows)` calls the accepted T155 projector
  exactly once, then hands the member list that comes back to the accepted T152
  stamp exactly once, and returns exactly three fields:
  `{ rows, members, context }`.
  - `rows` is the caller's own ordered array, returned by T155 by identity —
    never copied, filtered, sorted, de-duplicated, re-batched, sampled, or
    mutated.
  - `members` is the validated cohort as T152 returned it, one projected member
    per row in the caller's row order.
  - `context` is T152's structured five-field context (`projectId`,
    `marketProfileId`, `surfaceType`, `model`, `modelVersion`) taken verbatim;
    no `runId`, sample count, completion decision, repeat fraction, rate, metric,
    confidence, prompt, language, window, or parser field is attached.
- The result type reuses the accepted boundaries' own output types
  (`GeoObservationCohortMemberProjection["rows"]`,
  `GeoMeasurementCohortContextStamp["members"]`, `GeoMeasurementCohortContext`)
  so the view cannot drift from what T155/T152 produce.
- Fail closed by propagation. There is no `try`/`catch`, no wrapping, no
  fallback, no defaulting, and no revalidation: the T155 projector's own
  rejection for an unusable stored `marketProfileId` or `modelVersion` and every
  T151 rejection surfaced through T155 or T152 (empty list, malformed `model`,
  unsupported surface, cross-context member) reaches the caller unchanged. No
  assembly, partial member list, or partial context is ever returned.
- It decides and transforms nothing else. It never calls the T151 guard itself,
  opens no database, reader, repository, provider, cache, parser, workflow, or
  environment, reads no raw evidence, and counts, samples, aggregates, or
  measures nothing. Same rows, same assembly.

It adds no consumer, server function, schema, migration, dependency, UI,
workflow, provider, credential, or publishing path.

## FILES CHANGED

Exactly two new (untracked) files; no tracked file is modified:

- `src/server/features/search-growth/geo/services/geoObservationCohortContextAssembler.ts`
  — the service (imports the accepted T155 projector, the accepted T152 stamp,
  and the `GeoObservationRun` row type; no other dependency).
- `src/server/features/search-growth/geo/services/geoObservationCohortContextAssembler.test.ts`
  — 18 focused tests: behavior, propagation, and static source-boundary proof.

The accepted T151 guard, T152 stamp, T154 reader, T155 projector, Drizzle
schema, migrations, `package.json`, and `pnpm-lock.yaml` are unchanged
(`git status --short` shows only the two untracked files above).

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, index, or seed edit. The service imports
the `GeoObservationRun` row type only as a TypeScript type; it opens no
connection and issues no query, so SQLite/Postgres compatibility is unaffected.

## DEPENDENCIES CHANGED

None. No dependency added, removed, or upgraded; `pnpm-lock.yaml` is unchanged
(the bootstrap used `--frozen-lockfile`). The service reuses only accepted
modules and the row type; the test additionally imports `node:fs` (source
read), `vitest`, and the accepted T151/T155/T152 modules — all already present.

## TESTS ADDED

`geoObservationCohortContextAssembler.test.ts` — 18 in-process tests against the
real accepted collaborators (no mocks, no stubs, no re-declared production
classes):

Composition and identity (7):
1. composes every row in the caller's order into members and one baseline
   context (a sort/dedupe would reorder the ids);
2. returns the caller's row list by identity beside new validated members;
3. preserves duplicates instead of de-duplicating or filtering them;
4. carries exactly the five-field structured context and no run identity;
5. copies the context verbatim without trimming or normalizing it;
6. returns exactly what the accepted T155 and T152 boundaries produce (the two
   accepted collaborators are run independently and the assembly compared to
   them — the dependency-composition proof);
7. is deterministic across repeated calls and mutates nothing.

Rejection propagation (6):
8. propagates the projector's rejection of an unusable stored identity column
   (nine malformed values × `marketProfileId`/`modelVersion`) unchanged at row
   index 1;
9. propagates the projector's rejection of an argument that is not a list
   (`rowIndex === null`);
10. propagates a malformed stored `model` (nine malformed values) to the T151
    guard unchanged at member index 0, field `model`;
11. propagates an unsupported surface to the T151 guard unchanged;
12. propagates every cross-context mismatch (`projectId`, `marketProfileId`,
    `surfaceType`, `model`, `modelVersion`) to the T151 guard unchanged at
    member index 1;
13. propagates an empty row list to the T151 guard unchanged.

Source boundary (5, reading the shipped module from disk with comments
stripped):
14. depends only on the accepted T155 projector, T152 stamp, and the row type,
    and matches no storage/DB/filesystem/env/fetch/JSON/console import;
15. calls each accepted boundary exactly once, in order, and never calls the
    T151 guard or any parse/safeParse itself;
16. reads no stored evidence and attaches no context field of its own;
17. filters, sorts, de-duplicates, counts, aggregates, and measures nothing;
18. swallows no failure, defaults nothing, and coerces nothing.

## COMMANDS RUN

Run independently with `corepack pnpm` (bare `pnpm` is not on PATH here). The
bootstrap ran first because `node_modules` was absent in this worktree; no
command outside the TASK-approved list was used.

1. `corepack pnpm install --frozen-lockfile` (bootstrap; deps absent)
2. `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoObservationCohortContextAssembler.test.ts` (interim)
3. `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoObservationCohortContextAssembler.ts src/server/features/search-growth/geo/services/geoObservationCohortContextAssembler.test.ts`
4. `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoObservationCohortContextAssembler.test.ts` (final)
5. `corepack pnpm format:check`
6. `corepack pnpm types:check`
7. `corepack pnpm lint` (interim)
8. `corepack pnpm lint` (final)
9. `corepack pnpm format:check` (final)
10. `corepack pnpm types:check` (final)
11. `corepack pnpm test`
12. `corepack pnpm build`
13. `corepack pnpm ci:check`
14. read-only `git status --short`, `git rev-parse HEAD`, `git rev-parse --abbrev-ref HEAD`
15. `corepack pnpm format:check` (re-run after this DELIVERY.md was written)

No `dangerously-skip-permissions`, commit, merge, push, main-branch touch,
production access, provider call, credential/account access, Prompt Explorer/
R2/application-cache access, or publishing/paid action was invoked. No
aggregate gate was sandbox-denied.

## COMMAND RESULTS

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `install --frozen-lockfile` | 0 | 980 packages, done in 53.2s; "Lockfile is up to date"; no lockfile change |
| 2 | `vitest run` (focused, interim) | **1** | 17 passed / 1 failed: an over-strict `toBe` identity assertion on `members` across two independent projector calls (see Deviations); fixed to `toEqual` |
| 3 | `prettier --write` (2 files) | 0 | service unchanged; test file reformatted |
| 4 | `vitest run` (focused, final) | 0 | **1 file / 18 tests passed** (8.4 s) |
| 5 | `format:check` | 0 | "All matched files use Prettier code style!" |
| 6 | `types:check` | 0 | `tsc --noEmit` clean, no output |
| 7 | `lint` (interim) | **1** | one real finding: `eslint/max-lines` on the test file (412 > 400 non-blank/non-comment lines); compacted by extracting a shared rejection helper and a shared malformed-value list, no assertion dropped |
| 8 | `lint` (final) | 0 | **"Found 0 warnings and 0 errors"** — 980 files, type-aware, 24.4 s |
| 9 | `format:check` (final) | 0 | "All matched files use Prettier code style!" on the delivered content |
| 10 | `types:check` (final) | 0 | `tsc --noEmit` clean on the delivered content |
| 11 | `test` | 0 | **225 files / 2,351 tests passed** (167.97 s) — the new file's 18 are included |
| 12 | `build` | 0 | client + SSR + `open_seo_audit` bundles built; trailing `tsc --noEmit` clean |
| 13 | `ci:check` | 0 | full chain passed: `prettier --check .`, `knip`, `tsc --noEmit`, `tsc -p badseo/tsconfig.json`, `oxlint . --type-aware` ("Found 0 warnings and 0 errors"), `sync-plugin-skills`, and `check-plugin-skills-sync.mjs` |
| 14 | `git status --short`, `git rev-parse HEAD`, `--abbrev-ref HEAD` | 0 | at run time, exactly the two untracked source files below (DELIVERY.md not yet written); HEAD `1464683db1a44a1ac33b36dbfebf8d1222720b8c`; branch `ai-task/T156-M2-GEO-OBSERVATION-COHORT-CONTEXT-ASSEMBLER`; re-confirmed after writing DELIVERY.md as exactly three untracked files, no tracked modification |
| 15 | `format:check` (after DELIVERY.md) | 0 | "All matched files use Prettier code style!" on all three delivered files, DELIVERY.md included |

The two interim failures (rows 2 and 7) were real findings fixed on the
delivered content, not environment blocks; both were re-run to exit 0 after the
fix. `ci:check` passed in full (contrast T155 round 2, where the same
`oxlint --type-aware` stage OOM'd on this executor); no gate was bypassed.

## RUNTIME EVIDENCE

- The service ran in-process under vitest against the real accepted T155
  projector, T152 stamp, and T151 guard modules — no mock, no stub, no
  re-declared production class.
- Observed composition: for rows ordered `run_9, run_1, run_5`, the assembly
  returned members in that order with the six identity columns copied verbatim,
  and `context` equal to the baseline's five fields.
- Observed identity: `assembly.rows === rows`, `assembly.rows[0] === rows[0]`,
  and `assembly.rows[1] === rows[1]` held for the same call that returned the
  projected members; `assembly.members` is a new array whose elements are not
  the row objects.
- Observed composition equivalence (test 6): `assembly.rows` is identical to
  the projector's own returned `rows`, and `assembly.members` /
  `assembly.context` deep-equal the independently computed T155→T152 result.
- Observed propagation for an unusable stored `marketProfileId`/`modelVersion`
  (nine malformed values each): the raised error is the projector's
  `GeoObservationCohortMemberProjectionError` with `rowIndex === 1` and the
  exact message of an independent projector call, compared on `name`,
  `message`, `rowIndex`, and `field`.
- Observed propagation for a malformed stored `model` (nine malformed values):
  the raised error is the T151 guard's `GeoMeasurementCohortIdentityError` at
  member index 0, field `model`, equal to an independently computed guard
  rejection; the projector's own error was not raised for `model`.
- Observed propagation for an unsupported surface, every cross-context mismatch,
  an empty list, and a non-list argument: the accepted boundaries' own typed
  errors, unchanged, with no assembly returned.
- Observed determinism: three successive calls produced deep-equal results with
  identical `rows` identity, and `structuredClone(rows)` compared equal
  afterwards (nothing mutated).
- The source-boundary tests read the shipped module from disk with comments
  stripped and assert its import list, per-boundary call count and order, and
  absent storage/evidence/aggregation/measurement/coercion behavior statically.
- No storage engine, provider call, network request, credential, cache, Prompt
  Explorer/R2 access, billing/paid path, publishing, or production action was
  involved anywhere in this task.

## KNOWN LIMITATIONS

- No consumer is wired. TASK.md asks for one composition service, so no server
  function, route, port, or caller was added; a later caller can pass the
  accepted T154 reader's output straight in.
- The T151 guard runs twice in one assembly — once inside T155, once inside T152
  — because TASK item 1 requires calling each accepted boundary exactly once and
  both accepted boundaries own a guard call. This is the accepted boundaries'
  behavior, not a revalidation added here; the assembler itself adds none.
- Members are newly constructed objects (that is what projection means); only
  the row list passes through by identity, which is what TASK.md requires.
- The call is two O(n) passes with no batching, pagination, or short-circuit;
  the list is bounded by the §3 repeat setting (3, or 5 for high-value prompts).
- No measurement, sample count, completeness, confidence, or metric field is
  attached by design; those remain the callers' (§§4, 7) decisions.

## DEVIATIONS FROM TASK

- The only design decision beyond a literal reading is in test 6: identity
  (`toBe`) is asserted only for `rows` (which T155 returns by identity). It is
  NOT asserted for `members` across two independent projector calls, because
  T155 constructs new member objects on every call, so cross-call member
  identity is not a contract; `members` is compared with `toEqual` instead. The
  in-call identity that is a real contract (T152 returning the caller's member
  array unchanged) is already covered by the accepted T152 suite. The interim
  `toBe` assertion failed for exactly this reason and was corrected, not
  weakened — no assertion was removed.
- To stay inside `eslint/max-lines` (400, comments and blank lines excluded),
  the test file shares one projector-rejection assertion helper and one
  malformed-value list across cases rather than repeating their bodies. Every
  test and assertion is retained.
- The source-boundary proof lives in the same test file as the behavior tests
  (as in the accepted T152/T155 pattern) rather than a second
  `.boundary.test.ts` file, so the task adds exactly two files.
- No scope was added and no acceptance criterion was weakened.

## SECURITY NOTES

- Credential-free: no provider, API key, OAuth token, account, cookie, or
  environment secret is read or referenced.
- Storage-free: the module imports no `@/db`, Drizzle, repository, reader,
  filesystem, or cache handle and performs no query or write of any kind.
- Fail-closed: no `try`/`catch` and no fallback; a rejected row or cohort
  throws instead of yielding an empty, partial, or repaired assembly.
- Trust boundary: the assembler trusts nothing itself and validates nothing
  itself; the two accepted boundaries perform their own runtime validation, and
  every rejection propagates unchanged.
- Data-minimizing: the service copies the six identity columns already carried
  by the accepted projection and reads no raw answer, raw response, usage, or
  provenance field; nothing is logged, serialized, telemetered, or exported.
- No production publishing, paid behavior, CAPTCHA/2FA bypass, stealth
  behavior, or cookie upload; no `.greptile/**`, `AGENTS.md`, `CLAUDE.md`,
  `.agents/skills/**`, or `.github/**` file was modified, and no
  `29_SCOPE_LOCK.md`, accepted ADR, or `REVIEW.md` was touched.

## GIT STATUS/DIFF SUMMARY

Branch: `ai-task/T156-M2-GEO-OBSERVATION-COHORT-CONTEXT-ASSEMBLER` (not merged,
not committed, no push). HEAD is unchanged at
`1464683db1a44a1ac33b36dbfebf8d1222720b8c`.
`git status --short` reports exactly the two untracked source files and no
modification to any tracked file:

```
?? src/server/features/search-growth/geo/services/geoObservationCohortContextAssembler.test.ts
?? src/server/features/search-growth/geo/services/geoObservationCohortContextAssembler.ts
```

`control/tasks/T156-M2-GEO-OBSERVATION-COHORT-CONTEXT-ASSEMBLER/DELIVERY.md`
(this file) becomes the third untracked file once written. `pnpm-lock.yaml`,
`drizzle/**`, `drizzle-pg/**`, `schemas/**`, `src/db/search-growth.schema.ts`,
and all existing geo modules (including the accepted T151 guard, T152 stamp,
T154 reader, and T155 projector) are unchanged. `ci:check`'s
`sync-plugin-skills` step reported "Synced 9 skills" and "plugin skill sync
clean" without leaving any tracked modification.

## READY FOR REVIEW

The service composes the accepted T155 projector once and the accepted T152
stamp once into the original ordered rows, the validated members, and T152's
exact five-field context; propagation, determinism, and source-boundary
behavior are covered by 18 focused tests. All required gates exited 0 on the
delivered content: focused tests (18/18), `format:check`, `types:check`, `lint`,
the full suite (225 files / 2,351 tests), `build`, and `ci:check`.

Not claiming PASS — only Codex can pass this task. Stopping here.
