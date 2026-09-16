# DELIVERY — T143-M2-GEO-PARSE-OUTPUT-BUNDLE-CONSISTENCY

ROUND: 1 of 3
BASE COMMIT: 1956d46a62cd8a13aa6260845e8bc98703f5d960
STATUS: READY FOR REVIEW (implementation complete; not self-accepted)

## IMPLEMENTATION SUMMARY

Added one narrow, storage-free consistency boundary for a caller-supplied GEO
parse output bundle: exactly one `GeoObservationParseFact` plus that parse's
zero-or-more `GeoEntityMentionFact`s and zero-or-more `GeoCitationFact`s.

- New contract `GeoParseOutputBundle` (`parse`, `entityMentions`, `citations`).
  It reuses the accepted T140 (`GeoObservationParseFact`), T141
  (`GeoEntityMentionFact`), and T142 (`GeoCitationFact`) types by import only —
  no leaf schema is re-declared, restated, or validated here.
- New pure guard `validateGeoParseOutputBundle(bundle)`. It checks cross-fact
  identity for every child fact — `child.projectId === parse.projectId` and
  `child.parseId === parse.id` — and returns the caller's bundle object by
  identity on success. The first offending child throws
  `GeoParseOutputBundleIdentityError`, carrying structured `collection` and
  `index` fields plus a message that names both, for example:
  `GEO parse output bundle: entityMentions[1] belongs to project "proj_2", but the bundle's parse fact belongs to project "proj_1".`
- The guard is a gate, not a transformation: it does not mutate, freeze, clone,
  serialize, normalize, deduplicate, coerce, derive, replace, or infer any
  value; it inspects no raw evidence; it opens no database, calls no recorder,
  and selects no "current" parse. Empty child collections, repeated children,
  and any `isCurrent` or `parserVersion` value on the parse fact are all valid —
  identity is the only rule (ADR-005, Parse-version isolation).
- No caller is wired up: recorder orchestration is a later task, so the module
  is consumed only by its own focused test.

## FILES CHANGED

Both source files are new and untracked, and no tracked file changed; the only
other new path is this DELIVERY itself.

| Path | Change |
| --- | --- |
| `src/server/features/search-growth/geo/services/geoParseOutputBundle.ts` | New: 1 contract type, 1 error class, 1 pure guard function |
| `src/server/features/search-growth/geo/services/geoParseOutputBundle.test.ts` | New: 8 focused unit tests |

Contract / error evidence (the new module's public surface):

```ts
type GeoParseOutputBundle = {
  parse: GeoObservationParseFact;
  entityMentions: GeoEntityMentionFact[];
  citations: GeoCitationFact[];
};

class GeoParseOutputBundleIdentityError extends Error {
  readonly collection: "entityMentions" | "citations";
  readonly index: number;
  // message = `GEO parse output bundle: ${collection}[${index}] ${detail}`
}

function validateGeoParseOutputBundle(
  bundle: GeoParseOutputBundle,
): GeoParseOutputBundle;
```

Both mismatch messages are asserted verbatim in tests:

```text
GEO parse output bundle: entityMentions[1] belongs to project "proj_2", but the bundle's parse fact belongs to project "proj_1".
GEO parse output bundle: citations[2] is bound to parse "parse_other", but the bundle's parse fact is "parse_1".
```

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or query change. The new module imports
no `@/db` module and no Drizzle type; it names no table and no column.

## DEPENDENCIES CHANGED

None. No `package.json` or lockfile change; `pnpm-lock.yaml` is byte-identical
(`git status` reports only the two new source files). No new runtime or dev
dependency, and no provider, cache, or credential dependency.

## TESTS ADDED

`geoParseOutputBundle.test.ts` — 8 tests, one per required invariant:

1. accepts a bundle whose parse has no child facts (empty child set);
2. accepts many mentions and citations for the same Project/parse (also covers
   `isCurrent: false` and a second `parserVersion` — version isolation);
3. rejects an entity mention from another Project, naming collection and index
   (`entityMentions[1]` in the message plus structured `collection`/`index`);
4. rejects a citation from another Project, naming `citations[0]`;
5. rejects an entity mention bound to another parse, naming `entityMentions[0]`;
6. rejects a citation bound to another parse at the exact index (third child of
   a 3-item collection reports `citations[2]`);
7. returns the bundle, its arrays, and every child fact by identity, with a
   `structuredClone` before/after comparison for non-mutation and a
   `JSON.stringify` spy proving no serialization occurs;
8. regression: an opaque evidence string — a JSON-looking literal containing
   escaped whitespace sequences, an embedded `<b>` tag, doubled internal spaces,
   and trailing spaces — is returned byte-for-byte unchanged, asserted with
   `toBe` on the exact string plus a length check.

## COMMANDS RUN

Bootstrap was required: `node_modules` was absent in this worktree.

| # | Command | Exit |
| --- | --- | --- |
| 1 | `corepack pnpm install --frozen-lockfile` | 0 |
| 2 | `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoParseOutputBundle.ts src/server/features/search-growth/geo/services/geoParseOutputBundle.test.ts` | 0 |
| 3 | `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoParseOutputBundle.test.ts` | 0 |
| 4 | `corepack pnpm format:check` | 0 |
| 5 | `corepack pnpm types:check` | 0 |
| 6 | `corepack pnpm lint` | 0 |
| 7 | `corepack pnpm test` | 0 |
| 8 | `corepack pnpm build` | 0 |
| 9 | `corepack pnpm ci:check` | 0 |

Each command was invoked on its own line, not wrapped in a chained shell
operation. Read-only git usage: `git status --short`, `git diff --stat`,
`git rev-parse HEAD`, `git log --oneline`, `git show --stat`, `git ls-files`.

## COMMAND RESULTS

- **1 — install:** `Lockfile is up to date, resolution step is skipped`; 980
  packages reused/added; `Done in 43.6s`. No lockfile mutation. Pre-existing
  warnings about ignored build scripts (`workerd`, `sharp`, `esbuild`, …) were
  printed; they are install-time approvals for native build scripts this task
  does not need (Vitest, TypeScript, oxlint, and Prettier all run without them).
- **2 — prettier --write:** both task files formatted; the module was already
  conformant, the test file was reflowed once.
- **3 — focused test:** `Test Files 1 passed (1)`, `Tests 8 passed (8)`,
  duration 4.72s.
- **4 — format:check:** `All matched files use Prettier code style!`
- **5 — types:check:** `tsc --noEmit` produced no output (clean).
- **6 — lint:** `Found 0 warnings and 0 errors. Finished in 22.4s on 949 files`.
- **7 — full test:** `Test Files 209 passed (209)`,
  `Tests 2097 passed (2097)`, duration 120.13s. The new suite appears in the run
  as `geoParseOutputBundle.test.ts (8 tests) 28ms`. Only pre-existing
  stderr/stdout diagnostics (OAuth, DataForSEO, scheduler, MCP instrumentation)
  were emitted; no failures and no skips.
- **8 — build:** Vite client, SSR, and `open_seo_audit` environments all built
  (`✓ built in 19.28s` / `25.43s` / `3.16s`) and the appended `tsc --noEmit`
  re-ran clean. Only the pre-existing >500 kB chunk-size advisory was printed.
- **9 — ci:check:** ran Prettier, knip, `tsc --noEmit`, `tsc --noEmit -p
  badseo/tsconfig.json`, `oxlint . --type-aware` (0 warnings / 0 errors), and
  the plugin-skill sync check; final line
  `plugin skill sync clean: plugins/openseo/skills`. Exit 0. No gate was
  sandbox-denied, so nothing was skipped and no bypass was needed.

## RUNTIME EVIDENCE

No runtime, provider, database, network, or production invocation was performed —
this is pure domain code, and its focused tests are the only execution evidence:

- Identity-rejection path executed in tests 3–6, which assert both the
  structured `collection`/`index` fields and the exact `<collection>[<index>]`
  substring in the message.
- Identity-preservation path executed in tests 1, 2, 7, and 8 (`toBe` on the
  bundle, on both arrays, and on each child fact).
- Non-mutation / non-serialization executed in test 7 (`structuredClone`
  before/after `toEqual`, plus a `JSON.stringify` spy that is never called).
- Opaque-evidence preservation executed in test 8 via `toBe` on the exact string.
- Full-suite regression evidence: `corepack pnpm test` — 209 files / 2097 tests
  passed, including the accepted T140/T141/T142 recorder suites.

## KNOWN LIMITATIONS

- The guard validates cross-fact identity only. It does not validate leaf values
  (blank ids, enum membership, integer positions, nullability) and does not
  detect dangling `runId`, `entityId`, or `matchedPublicationReceiptId`
  references — those remain the accepted recorder/runtime-boundary
  responsibilities, exactly as the TASK requires.
- It enforces no uniqueness or cardinality beyond "one parse fact": duplicate
  child ids, two mentions of the same entity, or several children for the same
  parse are all accepted; the accepted storage/recorder layer owns those rules.
- `entityMentions` and `citations` must be present as arrays at runtime. A
  caller that omits one violates the TypeScript contract rather than receiving a
  validation error, because shape validation is deliberately outside this guard.
- Nothing calls the guard yet — recorder orchestration is a later task — so the
  module has no production call site and knip sees it only through its test.
- The install emitted ignored-build-script warnings for native packages;
  unrelated to this task and identical on a clean checkout.

## DEVIATIONS FROM TASK

None. No APPROVED command was wrapped in a chained shell operation, no
unapproved pnpm script was used, and the only extra commands were the read-only
git ones the TASK permits. The bootstrap install was needed because
`node_modules` was absent in this worktree, which the TASK explicitly allows.

## SECURITY NOTES

- No credential, account, provider, paid action, publishing, Prompt Explorer,
  R2/application-cache, CAPTCHA/2FA, stealth, or cookie access; no network call
  and no database access.
- Raw evidence and URLs stay opaque: the guard reads only `projectId` and
  `parseId` and never inspects, parses, normalizes, logs, or serializes
  evidence, so nothing sensitive or untrusted can leak through this module.
- No scope change, no edit to `29_SCOPE_LOCK.md`, no Accepted-ADR edit, no
  acceptance-criteria weakening, no dependency addition, and no
  `--dangerously-skip-permissions`.
- Not committed, not merged, not pushed; `main` and `integration/ai-v1` were not
  touched. `REVIEW.md` was neither created nor edited.

## GIT STATUS/DIFF SUMMARY

`git rev-parse HEAD` → `1956d46a62cd8a13aa6260845e8bc98703f5d960`
(`chore(control): dispatch T143 round 1`).

`git diff --stat` → empty (no tracked file modified).

`git status --short` →

```text
?? control/tasks/T143-M2-GEO-PARSE-OUTPUT-BUNDLE-CONSISTENCY/DELIVERY.md
?? src/server/features/search-growth/geo/services/geoParseOutputBundle.test.ts
?? src/server/features/search-growth/geo/services/geoParseOutputBundle.ts
```

## READY FOR REVIEW

Implementation, focused tests, the five required gates, and the aggregate
`ci:check` are complete, and the worktree contains only the two new task-scoped
source files plus this DELIVERY. Awaiting Codex review; no PASS is claimed here.
