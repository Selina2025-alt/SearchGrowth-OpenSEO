# T153-M2-GEO-REPEAT-FRACTION-PRESENTER — DELIVERY

## TASK ID

T153-M2-GEO-REPEAT-FRACTION-PRESENTER (M2 GEO, implementation round 1)

## IMPLEMENTATION SUMMARY

Added one small, pure, storage-free presenter for §3's repeat-fraction display
contract.

`presentGeoRepeatFraction({ completedSampleCount, requestedRepeatCount })`:

1. validates the caller's two counts at the trust boundary with a Zod schema —
   both must be finite, safe, non-negative integers, and the request must be an
   approved §3 repeat setting (exactly 3 or 5);
2. rejects a completion above its request;
3. returns a fresh three-field result — the caller's two counts copied
   unchanged beside `displayText`, the exact `<completed>/<requested>` text.

Spec §3 (`07_GEO_MEASUREMENT_SPEC.md` §3) shows a single Prompt as `2/3`
rather than only `66.7%`, because a lone rounded percentage manufactures
precision the sample does not have. The presenter therefore renders the exact
counts and computes nothing: no numerator/denominator, percentage, ratio, rate,
metric, confidence label, interval, or significance statement (§§4, 7). The
display is the two validated integers joined by a single slash — no rounding,
truncation, decimal, or percent sign.

Boundary decisions:

- **Repeat policy is enforced locally, not imported.** The two approved
  settings are named constants (`DEFAULT_REPEAT_COUNT = 3`,
  `HIGH_VALUE_REPEAT_COUNT = 5`) citing §3, matching the accepted T150
  precedent in this directory where a pure policy module carries its own
  spec-cited thresholds. The presenter deliberately does not import
  `freshGeoSampling`: its constants describe how many provider calls a sample
  makes, and this task forbids sampling/provider coupling in the presenter.
- **Nothing is coerced or repaired.** A malformed, unsupported, or impossible
  fraction throws `GeoRepeatFractionPresenterInputError` naming the field
  instead of being rounded, clamped, trimmed, defaulted, inferred, or partially
  rendered. The caller's object is read only and never mutated.
- **The impossible-fraction rejection names `completedSampleCount`**, the value
  that breaks the contract; its message also names `requestedRepeatCount` so
  the relation is unambiguous without re-parsing.
- **The output has exactly three keys**, so no percentage, rate, or metric can
  ride along on the result object.

No schema, migration, snapshot, dependency, UI, server function, database,
repository, provider, cache, parser, sampling, aggregation, credential,
publishing, or production change was made.

## FILES CHANGED

Added (both untracked; no tracked file created, modified, deleted, or renamed):

- `src/server/features/search-growth/geo/services/geoRepeatFractionPresenter.ts`
  — the pure presenter: `GeoRepeatFractionInput`, `GeoRepeatFractionDisplay`,
  `GeoRepeatFractionPresenterInputError`, `presentGeoRepeatFraction`.
- `src/server/features/search-growth/geo/services/geoRepeatFractionPresenter.test.ts`
  — 14 focused tests in three suites (rendering and exact preservation,
  runtime rejections, source boundary).

No existing source file was touched; no accepted module was edited.

## DATABASE/MIGRATION CHANGES

None. No schema, migration, snapshot, or query change. The module imports only
`zod`; it opens no database, calls no repository, service, provider, cache, or
parser, and writes nothing.

## DEPENDENCIES CHANGED

None. `package.json`, `pnpm-lock.yaml`, and the dependency tree are unchanged.
`corepack pnpm install --frozen-lockfile` was run only to materialize this
worktree's absent `node_modules`; it reported the lockfile already up to date
and resolved the existing dependency set, adding and removing no package.

## TESTS ADDED

`geoRepeatFractionPresenter.test.ts` — 14 tests in three suites:

- **rendering and exact preservation**: §3's display for every presentable
  shape — 0/3, 1/3, **2/3** (§3's own example), 3/3, 0/5, 1/5, 4/5, 5/5 — with
  the caller's counts returned exactly; exactly the three contract keys and no
  others; no percentage, rate, or rounded value in the text or the serialized
  result (`/^\d+\/\d+$/`, no `%`, no `.`); deterministic repeated calls with no
  caller mutation.
- **runtime rejections**: a call argument that is not an object (`null`,
  `undefined`, `42`, `"2/3"`, `true`, `[]`); a missing count; fractional,
  negative, non-finite, unsafe, and non-number counts (`1.5`, `-1`, `-0.5`,
  `NaN`, `±Infinity`, `Number.MAX_SAFE_INTEGER + 1`, `2 ** 53`, `"2"`, `null`,
  `true`, `2n`, `{}`, `[]`) on each field; unsupported repeat settings (0, 1, 2,
  4, 6, 10, 30, 100) on `requestedRepeatCount`; and completions beyond the
  request (4/3, 5/3, 6/5, 100/5) on `completedSampleCount` instead of being
  clamped. The rejection helper throws if the presenter returns normally, so
  each case proves no partial display escapes.
- **source boundary**: imports only `zod`; no database, drizzle, repository,
  `node:fs`, network, environment, or console use; no record/query/select/
  insert/update/delete call shapes; no cache, provider, repository, parser,
  market, model, prompt, or surface vocabulary; no filter/reduce/sort/Set/Map/
  `Math.`/`length`/loop/map/forEach/includes; no aggregate, dedupe, distinct,
  sum, average, sample, sampling, observation, or cohort vocabulary; no
  percentage, percent, rate, ratio, metric, confidence, significance,
  numerator, or denominator vocabulary; no `%` or `toFixed`; no try/catch and
  no coercion constructor.

No test re-declares a production class, and no collaborator is mocked.

## COMMANDS RUN

Every command was run independently from the worktree root on Windows Git Bash
with `corepack pnpm`; no command was chained with another.

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoRepeatFractionPresenter.ts src/server/features/search-growth/geo/services/geoRepeatFractionPresenter.test.ts`
3. `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoRepeatFractionPresenter.test.ts`
4. `corepack pnpm exec prettier --write src/server/features/search-growth/geo/services/geoRepeatFractionPresenter.test.ts`
5. `corepack pnpm exec vitest run src/server/features/search-growth/geo/services/geoRepeatFractionPresenter.test.ts`
6. `corepack pnpm format:check`
7. `corepack pnpm types:check`
8. `corepack pnpm lint`
9. `corepack pnpm test`
10. `corepack pnpm build`
11. `corepack pnpm ci:check`
12. `git status --short`, `git rev-parse HEAD`, `git rev-parse --abbrev-ref HEAD`

## COMMAND RESULTS

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `corepack pnpm install --frozen-lockfile` | 0 | Lockfile up to date; "Done in 1m 25.2s using pnpm v10.30.1" (ignored-build-scripts advisory only) |
| 2 | `prettier --write` (2 task files) | 0 | Service unchanged (already formatted); test file reformatted |
| 3 | `vitest run` (presenter suite, first run) | 1 | 1 file / 14 tests, 1 failed: the source-boundary coercion assertion |
| 4 | `prettier --write` (test file) | 0 | Unchanged (already formatted) |
| 5 | `vitest run` (presenter suite, after fix) | 0 | 1 file / 14 tests passed |
| 6 | `format:check` | 0 | "All matched files use Prettier code style!" |
| 7 | `types:check` | 0 | `tsc --noEmit`, no diagnostics |
| 8 | `lint` | 0 | "Found 0 warnings and 0 errors" on 973 files |
| 9 | `test` | 0 | 221 files / 2289 tests passed |
| 10 | `build` | 0 | `vite build && tsc --noEmit`; client, SSR, and audit environments built |
| 11 | `ci:check` | 0 | prettier check, knip, `tsc --noEmit`, badseo `tsc`, oxlint, plugin-skill sync all clean |
| 12 | `git status --short` / `rev-parse` | 0 | Two untracked files only; no tracked path changed |

Round-1 test correction (before the gates were final): the coercion assertion
used a case-insensitive `Number\(` pattern, which matched Zod's own
`.number(` builder in the module under test — a false positive in the test, not
a defect in the presenter. The flag was removed and a comment records why the
assertion is case-sensitive; rows 5–11 are all post-fix. No production source
changed as a result of that failure.

`ci:check` was not sandbox-denied; it completed with exit 0 and no bypass. The
`sync-plugin-skills` step inside it was a no-op for the tree (`git status`
afterwards still shows only the two new files).

## RUNTIME EVIDENCE

- Focused: `vitest run geoRepeatFractionPresenter.test.ts` → exit 0, 1 file /
  14 tests passed (20 ms of test time).
- Full suite: exit 0, 221 files / 2289 tests passed. Baseline before this task
  (T152 delivery): 220 files / 2275 tests — the delta is exactly this task's
  one file / 14 tests.
- Build: exit 0. The presenter is not imported by any application entry point
  yet, which is expected: TASK.md adds a display primitive, not a wired-in
  feature, and the task forbids UI/server-function work. Its behavior is proven
  by the focused tests above.
- Behavioral evidence in the passing run: `2/3` presents `"2/3"` (not `66.7%`),
  and the serialized result contains no `%`.

## KNOWN LIMITATIONS

- Nothing in the application consumes the presenter yet; it is a pure
  primitive, so there is no end-to-end runtime path to demonstrate.
- The presenter takes the caller's counts as given. It cannot tell whether a
  `completedSampleCount` was actually observed — verifying that a repeat
  produced a usable observation is the sampling core's (T138) and a future
  aggregation's concern, both explicitly out of scope here.
- The approved repeat set is the two §3 settings (3 and 5). A future policy
  change must be made in this module's constants as well as in the sampling
  core, since the presenter intentionally does not import sampling code.
- The display text is unformatted (`2/3`); any localized or styled rendering is
  out of scope, and no UI or locale behavior is added.

## DEVIATIONS FROM TASK

None. The implementation is one pure function plus two types and one typed
error; no sampling, aggregation, percentage/rate/metric/confidence
calculation, persistence, provider, cache, or parser behavior was added, and no
schema, migration, snapshot, dependency, or unrelated runtime change occurred.

The only judgement call not spelled out by TASK.md is which field the
impossible-fraction rejection names; it names `completedSampleCount` (with the
relation stated in the message) rather than `requestedRepeatCount`. This is
documented in the module's boundary comment.

## SECURITY NOTES

- No credentials, secrets, tokens, provider calls, network access, database
  access, cache access, or paid behavior is introduced.
- The module is total and fail-closed at the trust boundary: every untrusted
  runtime input is rejected with a typed error naming the field before any
  display is produced, and no `try`/`catch`, coercion, normalization, or
  fallback of its own is added.
- No production publishing, browser session, CAPTCHA/2FA, stealth, or
  cookie-upload behavior is involved.
- No security-sensitive control-plane file (`.greptile/**`, `AGENTS.md`,
  `CLAUDE.md`, `.agents/skills/**`, `.github/**`) was touched.

## GIT STATUS/DIFF SUMMARY

Branch: `ai-task/T153-M2-GEO-REPEAT-FRACTION-PRESENTER`
HEAD at delivery: `208661f00cbad487de9482bfdd65199b7a4027b4`

`git status --short`:

```
?? src/server/features/search-growth/geo/services/geoRepeatFractionPresenter.test.ts
?? src/server/features/search-growth/geo/services/geoRepeatFractionPresenter.ts
```

Exactly the two new source files above, plus this delivery record (written
after the status snapshot). No modified, deleted, or renamed tracked file;
`dist/` build output is gitignored and does not appear. Nothing was committed,
merged, pushed, or stashed, and `main` was not touched.

## READY FOR REVIEW

Ready for Controller review. Focused tests, formatting, types, lint, full
test, build, and `ci:check` all completed with exit 0 on the final code (the
single round-1 test-assertion failure and its fix are recorded above). No PASS
is claimed; acceptance belongs to Codex.
