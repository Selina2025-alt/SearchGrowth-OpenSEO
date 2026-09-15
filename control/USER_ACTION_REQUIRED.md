# USER ACTION REQUIRED

## REQUEST TYPE: MODEL ESCALATION

CURRENT TASK: Controller Watcher maintenance architecture (T139 remains in its existing executor worktree and is not being changed)

REQUESTED MODEL: SOL

WHY ESCALATION IS NEEDED: The requested production-safe local Controller Watcher combines Windows Task Scheduler installation, noninteractive Codex CLI discovery/invocation, a deterministic recovery and Human Gate state machine, Git-lock safety, single-instance locking, and automated merge/dispatch boundaries. This is a complex architecture and security-boundary change under the established Model Economy policy.

NEXT ACTION AFTER MODEL SWITCH: Create an isolated maintenance worktree from `integration/ai-v1`; inspect the live T139 checkpoint without changing it; implement the watcher, CLI discovery wrapper, installer/uninstaller, dry-run fixtures, and syntax/state-machine tests; complete dry-run acceptance; then register the scheduled task only if all checks pass.
