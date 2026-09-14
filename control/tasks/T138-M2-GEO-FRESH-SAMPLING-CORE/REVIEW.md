# REVIEW — T138-M2-GEO-FRESH-SAMPLING-CORE

## VERDICT

**PASS — Round 1 of 3.**

## VERIFIED

- The fresh-sampling core uses injected provider and recorder ports only. It has no Prompt Explorer, R2, or application-cache dependency; every provider request has the literal `applicationCacheBypassed: true` field.
- Default sampling performs exactly three sequential provider calls and creates three separate, buffered immutable run facts; explicit high-value sampling is limited to five. Each fact has a unique run ID, provider request ID, repeat index, timestamps, and opaque raw response.
- The core preserves surface/provenance fields without aggregation or interpretation. It performs no parser, citation, score, numerator/denominator, confidence, or metric work, keeping raw-run and versioned-parse boundaries intact.
- Malformed and duplicate provider request identities reject before recorder writes. Provider or recorder errors are not caught or retried, so failure/timeout errors propagate instead of being silently treated as successful samples; batch-failure and retry policy remain outside this bounded task.
- Focused tests passed (11/11); full tests passed (204 files, 1,935 tests); `format:check`, `types:check`, `lint`, `build`, and `ci:check` all exited 0. `git diff --check` is clean.
- The diff is limited to the fresh GEO core, focused tests, task delivery, and the required worktree-bootstrap papercut entry. No schema/migration, provider credential, external call, cache mutation, publishing, paid, or production behavior was added.

## FINDINGS

None.

## MERGE DECISION

Merge `ai-task/T138-M2-GEO-FRESH-SAMPLING-CORE` into `integration/ai-v1` only.