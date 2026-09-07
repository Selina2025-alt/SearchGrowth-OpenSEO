# REVIEW T100-M1-MARKET-PROFILE-SCHEMA — ROUND 2

VERDICT: BLOCKED
REVIEW DATE: 2026-09-07
EXECUTOR ROUNDS USED: 2 / 3

## VERIFIED EVIDENCE

- The diff is confined to the market-profile schema/domain slice plus task artifacts.
- SQLite/D1 and Postgres definitions expose the same table, columns, defaults, Project foreign key, and project index; parity tests pass.
- SQLite migration 0045 applied locally. Postgres migration 0023 is registered in its journal and snapshot.
- Focused tests: 3 files / 191 tests PASS. Full tests: 142 files / 1,183 tests PASS. Types, lint, and build PASS.
- No dependency, lockfile, Accepted ADR, scope, connector, credential, external request, production, paid, or publishing change occurred.

## FINDINGS

### MAJOR — Two required market-identity fields are nullable and the fixture normalizes a Global market

- Path/location: `src/db/search-growth.schema.ts` and `src/db/pg/search-growth.schema.ts`, `locationCode` and `country`; `src/db/search-market-profile.test.ts`, `prof_bing_global` fixture.
- Requirement violated: `05_DOMAIN_DATA_MODEL.md` section 2 lists `location_code` and `country` as SearchMarketProfile fields without optional markers. TASK calls them required domain fields and prohibits an implicit `GLOBAL` market or inferred missing market identity.
- Evidence: both schemas/migrations allow `location_code` and `country` to be null. The added test intentionally inserts `locationCode: null`, `country: null`, names the project/profile `global`, and describes an engine-wide/global profile. This converts missing market identity into an accepted foundation contract.
- Expected behavior: every persisted profile carries explicit engine, location code/name, language, country, and device identity. Project scoping must be tested with another concrete market rather than a Global/null placeholder.
- Reproduction: inspect column nullability and the second market fixture; the parity test confirms the nullable shape rather than rejecting it.
- Fix acceptance condition: make `location_code` and `country` non-null in both dialect schemas, both forward migrations, and both migration snapshots; replace the global/null fixture with a concrete profile on a second project; update tests to prove required market identity and retain Google/Baidu distinction. Do not invent other uniqueness rules or expand into CRUD.

### BLOCKER — Required aggregate CI gate is not green

- Path/location: `control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/evidence/round-1/round-2-07-format-check.txt` and `round-2-12-ci-check.txt`; `.ai-orchestrator/config.json` on the task base.
- Requirement violated: TASK requires `format:check` and `ci:check` to complete successfully before PASS.
- Evidence: both exit 1 because a Controller-owned orchestration config on the branch base was not Prettier-formatted. This is not caused by the market implementation, but the required final-state gates still fail.
- Expected behavior: Controller restores the control file to repository formatting, then Claude reruns the final gates on the actual delivery state.
- Reproduction: `corepack pnpm format:check` reports only `.ai-orchestrator/config.json`; `ci:check` stops at the same first stage.
- Fix acceptance condition: Controller supplies the formatting-only config correction before Round 3. Claude must not edit orchestration control files; rerun `format:check` and full `ci:check` to exit 0.

## ROUND 3 ACCEPTANCE

1. Fix only the required market identity nullability and concrete second-project fixture, including both migration snapshots.
2. Run `db:generate` after the final schema/snapshot state and prove Drizzle reports no new schema change; do not add a second migration for this unmerged task.
3. Rerun local migration, focused tests, format, types, lint, full tests, build, and `ci:check`; all must exit 0.
4. Update DELIVERY with exact final evidence and diff inventory, then finish normally. No unrelated changes.

## MERGE DECISION

DO NOT MERGE. Dispatch final fix round 3 after the Controller formatting correction is present in the task worktree.
