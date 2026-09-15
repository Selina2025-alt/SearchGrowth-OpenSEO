# Controller Watcher Acceptance

## Status

Implementation review complete. Installation is performed only from `integration/ai-v1` after this maintenance branch is merged.

## Deterministic boundaries

- Runs locally every 10 minutes through Windows Task Scheduler.
- Performs no model call unless a state transition requires a bounded Controller action.
- Uses the discovered absolute Codex CLI executable and explicit stdin close for non-TTY execution.
- Defaults only to `gpt-5.6-terra`; automatic model fallback is disabled. An unavailable economy model becomes a Human Gate.
- Does not merge to `main`, publish, spend, use credentials, or remove a stale Git lock.
- Reuses the existing Controller and Claude dispatcher flow; it does not implement a second Claude executor.

## Validation

`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .ai-orchestrator\tests\controller-watcher.tests.ps1 -ConfigPath .ai-orchestrator\controller-watcher.config.json`

Result: PASS.

The suite parser-checks all watcher scripts and dry-runs these state-machine fixtures without invoking Codex:

- Claude running
- newer Delivery, including already-handled suppression
- newer Review
- 429 and max-turn executor interruption
- blocked round 1 and round 3
- active Human Gate
- stale Git index lock

The result confirms four planned transition-only Controller invocations, six zero-model paths, and zero Codex invocations for unchanged, running, or Human Gate states.
