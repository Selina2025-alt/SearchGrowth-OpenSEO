# Claude Code Executor Contract

Invocation is headless from the task worktree, normally with `claude -p`.

Inputs:

- root CLAUDE.md
- current TASK.md
- referenced specs/ADRs
- existing code/tests

Outputs:

- code/tests/migrations/docs required by task
- DELIVERY.md
- optional raw run logs under `runs/`

Cannot:

- edit REVIEW.md
- merge
- change Scope Lock/ADRs
- accept its own code
- start next task
- run production side effects
- use unavailable credentials

Fix rounds use the existing REVIEW.md. Never argue a failed runtime test into PASS.
